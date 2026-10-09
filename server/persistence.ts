/**
 * Persistenz des Server-Datenbestands als JSON-Datei (Standard: data/db.json).
 *
 *  - Laden beim Start: fehlt die Datei, ist sie defekt, hat sie eine andere Schema-Version
 *    oder stammen die Demo-Daten von einem früheren Kalendertag, wird neu geseedet.
 *  - Speichern entprellt (Standard 500 ms) und atomar (temporäre Datei + rename),
 *    damit ein Absturz mitten im Schreiben niemals eine halbe Datei hinterlässt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createSeedDb, isSeedStale, reseedDb, type Db } from '../shared/core/index';
import { SCHEMA_VERSION } from '../shared/core/db';

export type LoadSource = 'file' | 'seed';
export type SeedReason = 'missing' | 'corrupt' | 'schema' | 'stale';

export interface LoadResult {
  db: Db;
  source: LoadSource;
  /** nur bei source = 'seed': warum neu geseedet wurde */
  reason?: SeedReason;
}

export interface LoadOptions {
  /** Demo-Daten eines früheren Kalendertags verwerfen (Default true) */
  reseedStale?: boolean;
}

function isDbLike(value: unknown): value is Db {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === 'number' &&
    typeof v.seededAt === 'string' &&
    !!v.settings &&
    typeof v.settings === 'object' &&
    !!v.seq &&
    typeof v.seq === 'object' &&
    Array.isArray(v.users) &&
    Array.isArray(v.products) &&
    Array.isArray(v.customers) &&
    Array.isArray(v.orders) &&
    Array.isArray(v.drivers) &&
    Array.isArray(v.tours) &&
    !!v.sessions &&
    typeof v.sessions === 'object'
  );
}

/** Liest die Datei; liefert null + Grund, wenn sie nicht verwendbar ist. */
function readDbFile(file: string): { db: Db } | { reason: Exclude<SeedReason, 'stale'> } {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { reason: 'missing' };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reason: 'corrupt' };
  }
  if (!isDbLike(parsed)) {
    // Schema-Version vorhanden, aber abweichend → eigener Grund (für die Log-Ausgabe)
    if (parsed && typeof parsed === 'object' && 'schemaVersion' in parsed && (parsed as Db).schemaVersion !== SCHEMA_VERSION) {
      return { reason: 'schema' };
    }
    return { reason: 'corrupt' };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) return { reason: 'schema' };
  return { db: parsed };
}

/** Schreibt die Datei atomar (temp-Datei im selben Verzeichnis + rename). */
export function writeDbFileSync(file: string, db: Db): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`);
  const json = JSON.stringify(db);
  try {
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* Aufräumen best effort */
    }
    throw err;
  }
}

/**
 * Lädt den Datenbestand oder erzeugt frische Demo-Daten.
 * Neu geseedete Daten werden sofort gespeichert; eine defekte Datei wird vorher als
 * `<datei>.corrupt-<zeitstempel>` gesichert, damit nichts stillschweigend verloren geht.
 */
export function loadDb(file: string, now: Date, options: LoadOptions = {}): LoadResult {
  const reseedStale = options.reseedStale ?? true;
  const read = readDbFile(file);

  if ('db' in read) {
    if (reseedStale && isSeedStale(read.db, now)) {
      // neuer Tag: frische Demo-Daten, Anmeldungen bleiben erhalten
      const db = reseedDb(read.db, now);
      writeDbFileSync(file, db);
      return { db, source: 'seed', reason: 'stale' };
    }
    return { db: read.db, source: 'file' };
  }

  if (read.reason === 'corrupt' || read.reason === 'schema') {
    const backup = `${file}.${read.reason}-${now.toISOString().replace(/[:.]/g, '-')}`;
    try {
      fs.copyFileSync(file, backup);
    } catch {
      /* Sicherung best effort */
    }
  }
  const db = createSeedDb(now);
  writeDbFileSync(file, db);
  return { db, source: 'seed', reason: read.reason };
}

export interface Persister {
  /** Änderung vormerken – geschrieben wird spätestens nach `delayMs` */
  schedule(db: Db): void;
  /** Vorgemerkte Änderung sofort (synchron) schreiben */
  flush(): void;
  /** true, wenn noch ungeschriebene Änderungen vorliegen */
  isDirty(): boolean;
  /** Timer stoppen und letzten Stand schreiben */
  close(): void;
}

export interface PersisterOptions {
  /** Entprellzeit in ms (Default 500) */
  delayMs?: number;
  onError?: (err: unknown) => void;
}

/**
 * Entprellter, atomarer Schreiber. Bei Dauerlast (z. B. Fahrtsimulation, die jede Sekunde
 * Positionen ändert) wird höchstens alle `delayMs` geschrieben – nie seltener.
 */
export function createPersister(file: string, options: PersisterOptions = {}): Persister {
  const delayMs = options.delayMs ?? 500;
  const onError = options.onError ?? ((err: unknown) => console.error('[persistence] Speichern fehlgeschlagen:', err));
  let pending: Db | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  function write(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const db = pending;
    pending = null;
    try {
      writeDbFileSync(file, db);
    } catch (err) {
      // Stand bleibt vorgemerkt → nächster Versuch beim nächsten schedule()/flush()
      if (!pending) pending = db;
      onError(err);
    }
  }

  return {
    schedule(db) {
      pending = db;
      if (closed) {
        write();
        return;
      }
      if (!timer) timer = setTimeout(write, delayMs);
    },
    flush: write,
    isDirty: () => pending !== null,
    close() {
      closed = true;
      write();
    },
  };
}
