/**
 * Transport "local": Der Core läuft komplett im Browser – ohne Server, auch offline und nach Reload.
 *
 * Daten & Echtzeit
 *  - Datenstand in localStorage 'altinger-db-v1' (fehlend/defekt/andere Schema-Version/Vortag → frische Demo-Daten),
 *    Revisionszähler "<seq>:<schreiber>" unter 'altinger-db-rev'. Jede Änderung wird sofort gespeichert.
 *  - Echtzeit-Ereignisse werden während eines Aufrufs/Ticks gepuffert und ERST NACH dem Speichern verteilt:
 *    an die eigenen Abonnenten (gefiltert nach Zielgruppe des angemeldeten Nutzers) und per
 *    BroadcastChannel('altinger-rt') an andere Tabs.
 *
 * Mehrere Tabs – genau EIN schreibender Tab ("Leader")
 *  localStorage wird zwischen Tabs asynchron abgeglichen; schreiben mehrere Tabs, kann einer die Änderung des
 *  anderen überschreiben (z. B. eine Bestellung, während die Fahrtsimulation tickt). Deshalb gilt:
 *  - Leader per Heartbeat 'altinger-sim-leader' { tabId, ts } (Übernahme, wenn älter als 3 s).
 *  - Nur der Leader führt Core-Aufrufe aus, speichert und tickt die Simulation (1 s).
 *  - Andere Tabs leiten ihre Aufrufe per BroadcastChannel an den Leader weiter und erhalten Ergebnis +
 *    aktuellen Datenstand (Snapshot) zurück; ihre lokale Kopie dient der Zielgruppen-Filterung und der Übernahme.
 *  - Ereignis-Nachrichten tragen den Snapshot gleich mit (außer reinen Positionsmeldungen), damit kein Tab
 *    auf einen noch nicht abgeglichenen localStorage-Stand angewiesen ist.
 *  - Ohne BroadcastChannel arbeitet jeder Tab für sich (Abgleich dann über localStorage + storage-Event).
 *
 * Verbindungsstatus ist immer 'online'.
 */
import { createCore, createSeedDb, isSeedStale, type Core, type Db } from '@shared/core/index';
import { SCHEMA_VERSION } from '@shared/core/db';
import { API_ERROR_STATUS, ApiError } from '@shared/api';
import type { ApiErrorCode, Audience, RealtimeEvent, User } from '@shared/types';
import type { Transport, TransportInit } from './client';

export const DB_KEY = 'altinger-db-v1';
export const REV_KEY = 'altinger-db-rev';
export const LEADER_KEY = 'altinger-sim-leader';
export const CHANNEL_NAME = 'altinger-rt';
/** Ersatzweg für Browser ohne BroadcastChannel (Ereignisse über das storage-Event) */
const FALLBACK_MESSAGE_KEY = 'altinger-rt-msg';

const TICK_INTERVAL_MS = 1000;
const LEADER_STALE_MS = 3000;
/** Wartezeit nach dem Übernehmen eines verwaisten Leader-Postens, bevor ausgeführt wird */
const CLAIM_CONFIRM_MS = 120;
/** so schnell muss der Leader den Eingang einer weitergeleiteten Anfrage bestätigen */
const ACK_TIMEOUT_MS = 1500;
/** maximale Bearbeitungszeit einer weitergeleiteten Anfrage (Routenberechnung kann dauern) */
const RESULT_TIMEOUT_MS = 60_000;
const MAX_FORWARD_ATTEMPTS = 4;
/** wie oft der Leader prüft, ob ein neuer Kalendertag begonnen hat (→ frische Demo-Daten) */
const STALE_CHECK_MS = 60_000;

const GENERIC_ERROR = 'Es ist ein interner Fehler aufgetreten. Bitte versuchen Sie es erneut.';
const SYNC_ERROR =
  'Die Daten konnten zwischen den geöffneten Tabs nicht abgeglichen werden. Bitte laden Sie die Seite neu.';
const INTERRUPTED_ERROR =
  'Der Vorgang wurde unterbrochen, weil ein anderer Tab geschlossen wurde. Bitte prüfen Sie das Ergebnis und versuchen Sie es ggf. erneut.';
const TIMEOUT_ERROR = 'Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es erneut.';

interface QueuedEvent {
  event: RealtimeEvent;
  audience: Audience;
}

interface WireError {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

type Message =
  | { kind: 'rt'; from: string; rev: string | null; db?: string; items: QueuedEvent[] }
  | { kind: 'rpc'; from: string; to: string; id: string; method: string; args: unknown[]; token: string | null }
  | { kind: 'rpc-ack'; from: string; to: string; id: string }
  | { kind: 'rpc-result'; from: string; to: string; id: string; rev: string | null; db?: string; ok: true; result: unknown }
  | { kind: 'rpc-result'; from: string; to: string; id: string; rev: string | null; db?: string; ok: false; error: WireError }
  | { kind: 'rpc-redirect'; from: string; to: string; id: string }
  | { kind: 'bye'; from: string };

/** Signal an die Aufrufschleife: Anfrage erneut (an den dann gültigen Leader) senden */
class ForwardRetry extends Error {
  constructor(readonly reason: 'unavailable' | 'redirect') {
    super(reason);
  }
}

// ───────────────────────────── Hilfen ─────────────────────────────

function getStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGet(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* egal */
  }
}

/** JSON-Kopie – gleiche Semantik wie der Weg über HTTP (undefined fällt weg, keine geteilten Referenzen) */
function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

function isDbLike(value: unknown): value is Db {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === 'number' &&
    typeof v.seededAt === 'string' &&
    !!v.settings &&
    !!v.seq &&
    !!v.sessions &&
    Array.isArray(v.users) &&
    Array.isArray(v.products) &&
    Array.isArray(v.customers) &&
    Array.isArray(v.orders) &&
    Array.isArray(v.drivers) &&
    Array.isArray(v.tours)
  );
}

function parseDb(raw: string | null | undefined): Db | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isDbLike(parsed) || parsed.schemaVersion !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface Rev {
  seq: number;
  by: string;
}

function parseRev(raw: string | null | undefined): Rev | null {
  if (!raw) return null;
  const [seqText, by = ''] = raw.split(':');
  const seq = Number(seqText);
  return Number.isFinite(seq) ? { seq, by } : null;
}

function formatRev(rev: Rev | null): string | null {
  return rev ? `${rev.seq}:${rev.by}` : null;
}

/** Ist `candidate` ein anderer/neuerer Stand als `known`? (gleiche Nummer, anderer Schreiber = Konflikt → übernehmen) */
function isNewer(candidate: Rev | null, known: Rev | null): boolean {
  if (!candidate) return false;
  if (!known) return true;
  return candidate.seq > known.seq || (candidate.seq === known.seq && candidate.by !== known.by);
}

/**
 * Speicher voll: Fotos/Unterschriften älterer Bestellungen entfernen.
 * @param keep Anzahl der neuesten Zustellnachweise, die erhalten bleiben
 * @returns Anzahl bereinigter Bestellungen
 */
function stripProofMedia(db: Db, keep: number): number {
  const withMedia = db.orders
    .filter((o) => o.proof && (o.proof.photoDataUrl || o.proof.signatureDataUrl))
    .sort((a, b) => (b.proof?.at ?? b.updatedAt).localeCompare(a.proof?.at ?? a.updatedAt));
  let count = 0;
  for (const order of withMedia.slice(keep)) {
    if (!order.proof) continue;
    delete order.proof.photoDataUrl;
    delete order.proof.signatureDataUrl;
    count++;
  }
  return count;
}

/** Passt ein Ereignis zum angemeldeten Nutzer dieses Tabs? */
export function audienceMatches(audience: Audience, user: User | null): boolean {
  if (audience.all) return true;
  if (!user) return false;
  if (audience.admin && user.role === 'admin') return true;
  if (audience.drivers && user.role === 'driver') return true;
  if (user.customerId && audience.customerIds?.includes(user.customerId)) return true;
  if (user.driverId && audience.driverIds?.includes(user.driverId)) return true;
  if (audience.userIds?.includes(user.id)) return true;
  return false;
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '');
  } catch {
    /* unsicherer Kontext (http im LAN) → Fallback */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function toWireError(err: unknown): WireError {
  if (err instanceof ApiError) {
    const e: WireError = { code: err.code, message: err.message };
    if (err.details !== undefined) {
      try {
        e.details = cloneJson(err.details);
      } catch {
        /* nicht serialisierbar → weglassen */
      }
    }
    return e;
  }
  return { code: 'internal', message: GENERIC_ERROR };
}

function fromWireError(e: WireError | undefined): ApiError {
  const code = e && Object.prototype.hasOwnProperty.call(API_ERROR_STATUS, e.code) ? e.code : 'internal';
  return new ApiError(code, e?.message || GENERIC_ERROR, e?.details);
}

// ───────────────────────────── Transport ─────────────────────────────

export function createLocalTransport(init: TransportInit): Transport {
  const { hooks } = init;
  const storage = getStorage();
  const tabId = randomId();
  const writerId = tabId.slice(0, 10);
  let token: string | null = init.token;
  let disposed = false;
  let storageWarned = false;

  let channel: BroadcastChannel | null = null;
  if (storage && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  /** ohne BroadcastChannel (oder ohne localStorage) arbeitet jeder Tab für sich */
  const standalone = !channel;

  // ── Leader-Heartbeat ──
  function readLeader(): { tabId: string; ts: number } | null {
    const raw = safeGet(storage, LEADER_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { tabId?: unknown; ts?: unknown };
      return typeof v.tabId === 'string' && typeof v.ts === 'number' ? { tabId: v.tabId, ts: v.ts } : null;
    } catch {
      return null;
    }
  }

  /** Tab-ID des aktuell gültigen Leaders oder null (keiner/verwaist) */
  function validLeader(): string | null {
    const l = readLeader();
    if (!l) return null;
    const t = Date.now();
    return t - l.ts <= LEADER_STALE_MS && l.ts <= t + LEADER_STALE_MS ? l.tabId : null;
  }

  function writeHeartbeat(): void {
    safeSet(storage, LEADER_KEY, JSON.stringify({ tabId, ts: Date.now() }));
  }

  /** dieser Tab hat Schreibrecht (im standalone-Fall schreibt jeder Tab selbst) */
  let leader = standalone || validLeader() === null;
  if (leader && storage) writeHeartbeat();
  const canWrite = () => leader || standalone;

  // ── Datenstand laden ──
  const startedAt = new Date();
  let knownRev: Rev | null = null;
  /** zuletzt geschriebener/übernommener Stand als JSON (für Snapshots an andere Tabs) */
  let lastJson: string | null = null;
  const storedJson = safeGet(storage, DB_KEY);
  let initialDb = parseDb(storedJson);
  if (initialDb && !isSeedStale(initialDb, startedAt)) {
    knownRev = parseRev(safeGet(storage, REV_KEY));
    lastJson = storedJson;
  } else {
    // Ein Folge-Tab übernimmt den Stand des Leaders später per Snapshot – geschrieben wird nur vom Leader.
    initialDb = createSeedDb(startedAt);
  }

  // ── Ereignis-Puffer ──
  /** gemeldet, aber noch nicht gespeichert */
  let pending: QueuedEvent[] = [];
  /** gespeichert, bereit zum Verteilen */
  let ready: QueuedEvent[] = [];
  let depth = 0;
  let deliveryScheduled = false;
  let userCache: { token: string | null; user: User | null } | null = null;

  function warnStorage(message: string, err?: unknown): void {
    if (storageWarned) return;
    storageWarned = true;
    console.warn(`[local] ${message}`, err ?? '');
  }

  /** Schreibt den Datenstand; bei vollem Speicher werden alte Fotos/Unterschriften entfernt. */
  function writeDb(db: Db): void {
    let json = JSON.stringify(db);
    if (!storage) {
      lastJson = json;
      warnStorage('localStorage ist nicht verfügbar – Daten bleiben nur bis zum Neuladen erhalten.');
      return;
    }
    const keepSteps = [5, 1, 0];
    for (let attempt = 0; ; attempt++) {
      try {
        storage.setItem(DB_KEY, json);
        break;
      } catch (err) {
        if (!isQuotaError(err)) {
          warnStorage('Daten konnten nicht gespeichert werden.', err);
          return;
        }
        let stripped = 0;
        while (attempt < keepSteps.length && stripped === 0) {
          stripped = stripProofMedia(db, keepSteps[attempt]);
          if (stripped === 0) attempt++;
        }
        if (stripped === 0) {
          warnStorage('Der Browser-Speicher ist voll – die letzte Änderung konnte nicht dauerhaft gespeichert werden.', err);
          return;
        }
        console.info(`[local] Speicher voll: Fotos/Unterschriften von ${stripped} älteren Bestellungen entfernt.`);
        json = JSON.stringify(db);
      }
    }
    const stored = parseRev(safeGet(storage, REV_KEY));
    const rev: Rev = { seq: Math.max(knownRev?.seq ?? 0, stored?.seq ?? 0) + 1, by: writerId };
    safeSet(storage, REV_KEY, formatRev(rev)!);
    knownRev = rev;
    lastJson = json;
  }

  function adopt(db: Db, rev: Rev | null, json: string): void {
    core.replaceDb(db);
    knownRev = rev;
    lastJson = json;
    userCache = null;
  }

  /** Neueren Stand aus localStorage übernehmen (force: auch bei gleicher Revision). */
  function ensureFresh(force = false): void {
    if (!storage) return;
    const rev = parseRev(safeGet(storage, REV_KEY));
    if (!force && !isNewer(rev, knownRev)) return;
    const json = safeGet(storage, DB_KEY);
    const db = parseDb(json);
    if (db && json) adopt(db, rev, json);
  }

  /** Snapshot aus einer Nachricht des Leaders übernehmen, falls neuer */
  function applySnapshot(revText: string | null | undefined, json: string | undefined): void {
    if (!json) return;
    const rev = parseRev(revText);
    if (!isNewer(rev, knownRev)) return;
    const db = parseDb(json);
    if (db) adopt(db, rev, json);
  }

  function currentUser(): User | null {
    if (!token) return null;
    if (userCache && userCache.token === token) return userCache.user;
    let user: User | null = null;
    try {
      user = core.userForToken(token);
      if (!user) {
        // Anmeldung evtl. in einem anderen Tab erfolgt → Stand nachladen
        ensureFresh();
        user = core.userForToken(token);
      }
    } catch {
      user = null;
    }
    userCache = { token, user };
    return user;
  }

  function deliverLocal(items: QueuedEvent[]): void {
    if (!items.length) return;
    const user = currentUser();
    for (const { event, audience } of items) {
      if (audienceMatches(audience, user)) hooks.onEvent(event);
    }
  }

  function post(message: Message): void {
    if (!channel) return;
    try {
      channel.postMessage(message);
    } catch (err) {
      console.warn('[local] Nachricht an andere Tabs fehlgeschlagen:', err);
    }
  }

  function broadcast(items: QueuedEvent[]): void {
    if (channel) {
      // Positionsmeldungen lösen keinen Neuabruf aus → ohne Snapshot (spart Rechenzeit in allen Tabs)
      const needsData = items.some((i) => i.event.type !== 'driver.position');
      const message: Message = { kind: 'rt', from: tabId, rev: formatRev(knownRev), items };
      if (needsData && lastJson) message.db = lastJson;
      post(message);
      return;
    }
    // Ersatzweg: storage-Event in anderen Tabs (die laden den Stand selbst aus localStorage)
    const message: Message = { kind: 'rt', from: tabId, rev: formatRev(knownRev), items };
    if (safeSet(storage, FALLBACK_MESSAGE_KEY, JSON.stringify({ ...message, nonce: randomId() }))) {
      safeRemove(storage, FALLBACK_MESSAGE_KEY);
    }
  }

  function scheduleDelivery(): void {
    if (deliveryScheduled) return;
    deliveryScheduled = true;
    // asynchron zustellen: keine Wiedereintritte in den Core, während er noch arbeitet
    queueMicrotask(() => {
      deliveryScheduled = false;
      if (disposed) return;
      const items = ready;
      ready = [];
      if (!items.length) return;
      broadcast(items);
      deliverLocal(items);
    });
  }

  /** Alle bisher gemeldeten Ereignisse gelten als gespeichert → zum Verteilen freigeben (als Momentaufnahme). */
  function releasePending(): void {
    if (!pending.length) return;
    for (const item of pending) {
      try {
        ready.push({ event: cloneJson(item.event), audience: cloneJson(item.audience) });
      } catch (err) {
        console.error('[local] Ereignis konnte nicht serialisiert werden:', err);
      }
    }
    pending = [];
    scheduleDelivery();
  }

  function finishBatch(): void {
    if (depth === 0) releasePending();
  }

  // ── Core ──
  const core: Core = createCore({
    db: initialDb,
    mode: 'local',
    emit(event, audience) {
      pending.push({ event, audience });
      // außerhalb eines Aufrufs (z. B. nach einer asynchronen Routenberechnung): nach dem aktuellen Codeblock freigeben
      if (depth === 0) queueMicrotask(finishBatch);
    },
    persist(db) {
      if (!canWrite()) {
        // Schutz: ein Tab ohne Schreibrecht darf den Stand des Leaders nie überschreiben
        console.warn('[local] Speichern in einem Folge-Tab verworfen.');
        pending = [];
        return;
      }
      writeDb(db);
      releasePending();
    },
    demoMode: true,
  });

  // neu erzeugte Demo-Daten sofort speichern (nur mit Schreibrecht)
  if (canWrite() && knownRev === null) writeDb(core.getDb());

  // ── Leader-Rolle ──
  function becomeLeader(): void {
    if (leader) return;
    // letzter Stand des bisherigen Leaders (dessen Schreibvorgänge liegen > 3 s zurück → abgeglichen)
    ensureFresh();
    leader = true;
  }

  function stepDown(): void {
    if (!leader || standalone) return;
    leader = false;
    // eigenen (evtl. abweichenden) Stand verwerfen – ab jetzt gilt der des anderen Leaders
    ensureFresh(true);
  }

  /** Wer führt einen Aufruf jetzt aus? 'self' oder die Tab-ID des Leaders */
  async function resolveTarget(): Promise<'self' | string> {
    if (standalone) return 'self';
    const current = validLeader();
    if (leader) {
      if (current && current !== tabId) {
        stepDown();
        return current;
      }
      writeHeartbeat();
      return 'self';
    }
    if (current && current !== tabId) return current;
    // verwaister Posten → übernehmen und kurz bestätigen lassen (falls ein anderer Tab gleichzeitig zugreift)
    writeHeartbeat();
    await sleep(CLAIM_CONFIRM_MS);
    const after = validLeader();
    if (after === null || after === tabId) {
      writeHeartbeat();
      becomeLeader();
      return 'self';
    }
    return after;
  }

  // ── Ausführen (Leader bzw. standalone) ──
  async function execute(method: string, args: unknown[], callerToken: string | null): Promise<unknown> {
    ensureFresh();
    depth++;
    try {
      const result = await core.call(method, core.ctx(callerToken), args);
      // Ergebnis ist bereits eine Kopie (Core); null statt undefined wie beim Server – React Query erlaubt kein undefined
      return result === undefined ? null : result;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error(`[local] ${method} fehlgeschlagen:`, err);
      throw new ApiError('internal', GENERIC_ERROR);
    } finally {
      depth--;
      // Login/Logout/Reset können den Nutzer zum Token ändern
      userCache = null;
      finishBatch();
    }
  }

  // ── Weiterleiten an den Leader (Folge-Tabs) ──
  interface PendingRpc {
    to: string;
    acked: boolean;
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
    reject: (err: unknown) => void;
  }
  const rpcs = new Map<string, PendingRpc>();
  let rpcCounter = 0;

  function forward(to: string, method: string, args: unknown[]): Promise<unknown> {
    const id = `${tabId}:${++rpcCounter}`;
    return new Promise((resolve, reject) => {
      const entry: PendingRpc = {
        to,
        acked: false,
        resolve,
        reject,
        timer: setTimeout(() => {
          rpcs.delete(id);
          reject(new ForwardRetry('unavailable'));
        }, ACK_TIMEOUT_MS),
      };
      rpcs.set(id, entry);
      post({ kind: 'rpc', from: tabId, to, id, method, args, token });
    });
  }

  async function waitForLeaderChange(previous: string): Promise<void> {
    const until = Date.now() + LEADER_STALE_MS + 1000;
    while (!disposed && Date.now() < until && validLeader() === previous) await sleep(200);
  }

  async function handleRpc(msg: Extract<Message, { kind: 'rpc' }>): Promise<void> {
    // Eingang sofort bestätigen (der Absender weiß dann: die Anfrage wird bearbeitet)
    post({ kind: 'rpc-ack', from: tabId, to: msg.from, id: msg.id });
    if (!leader || (await resolveTarget()) !== 'self') {
      post({ kind: 'rpc-redirect', from: tabId, to: msg.from, id: msg.id });
      return;
    }
    const before = knownRev;
    let reply: Message;
    try {
      const result = await execute(msg.method, Array.isArray(msg.args) ? msg.args : [], msg.token);
      reply = { kind: 'rpc-result', from: tabId, to: msg.from, id: msg.id, ok: true, result, rev: formatRev(knownRev) };
    } catch (err) {
      reply = { kind: 'rpc-result', from: tabId, to: msg.from, id: msg.id, ok: false, error: toWireError(err), rev: formatRev(knownRev) };
    }
    if (knownRev !== before && lastJson) reply.db = lastJson;
    post(reply);
  }

  function onMessage(data: unknown): void {
    if (disposed || !data || typeof data !== 'object') return;
    const msg = data as Message;
    if (msg.from === tabId) return;
    switch (msg.kind) {
      case 'rt': {
        if (!Array.isArray(msg.items)) return;
        if (msg.db) applySnapshot(msg.rev, msg.db);
        else if (standalone && msg.items.some((i) => i.event?.type !== 'driver.position')) ensureFresh();
        deliverLocal(msg.items);
        return;
      }
      case 'rpc':
        if (msg.to === tabId) void handleRpc(msg);
        return;
      case 'rpc-ack': {
        const entry = msg.to === tabId ? rpcs.get(msg.id) : undefined;
        if (!entry || entry.acked) return;
        entry.acked = true;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          rpcs.delete(msg.id);
          entry.reject(new ApiError('internal', TIMEOUT_ERROR));
        }, RESULT_TIMEOUT_MS);
        return;
      }
      case 'rpc-result': {
        const entry = msg.to === tabId ? rpcs.get(msg.id) : undefined;
        if (!entry) return;
        rpcs.delete(msg.id);
        clearTimeout(entry.timer);
        applySnapshot(msg.rev, msg.db);
        userCache = null;
        if (msg.ok) entry.resolve(msg.result);
        else entry.reject(fromWireError(msg.error));
        return;
      }
      case 'rpc-redirect': {
        const entry = msg.to === tabId ? rpcs.get(msg.id) : undefined;
        if (!entry) return;
        rpcs.delete(msg.id);
        clearTimeout(entry.timer);
        entry.reject(new ForwardRetry('redirect'));
        return;
      }
      case 'bye': {
        for (const [id, entry] of rpcs) {
          if (entry.to !== msg.from) continue;
          rpcs.delete(id);
          clearTimeout(entry.timer);
          // nicht bestätigt = nie angekommen → gefahrlos erneut senden; bestätigt = Ergebnis ungewiss
          entry.reject(entry.acked ? new ApiError('internal', INTERRUPTED_ERROR) : new ForwardRetry('unavailable'));
        }
        return;
      }
    }
  }

  if (channel) channel.onmessage = (e: MessageEvent) => onMessage(e.data);

  // ── storage-Events (nur Ersatzweg ohne BroadcastChannel) ──
  const onStorage = (e: StorageEvent) => {
    if (!standalone || (e.storageArea && e.storageArea !== storage)) return;
    if (e.key === FALLBACK_MESSAGE_KEY && e.newValue) {
      try {
        onMessage(JSON.parse(e.newValue));
      } catch {
        /* ignorieren */
      }
    } else if ((e.key === REV_KEY || e.key === DB_KEY) && depth === 0) {
      ensureFresh();
    }
  };
  window.addEventListener('storage', onStorage);

  // ── Simulation & Leader-Runde (1 s) ──
  let lastStaleCheck = Date.now();
  /** Tab über Mitternacht geöffnet → Demo-Daten des neuen Tages erzeugen und alle Tabs informieren */
  function reseedIfStale(): void {
    const t = Date.now();
    if (t - lastStaleCheck < STALE_CHECK_MS) return;
    lastStaleCheck = t;
    const today = new Date(t);
    if (!isSeedStale(core.getDb(), today)) return;
    const fresh = createSeedDb(today);
    core.replaceDb(fresh);
    userCache = null;
    writeDb(fresh);
    pending.push({ event: { type: 'data.reset' }, audience: { all: true } });
    releasePending();
  }

  let lastTickError = 0;
  function tick(): void {
    ensureFresh();
    try {
      reseedIfStale();
    } catch (err) {
      console.error('[local] Neu-Erzeugen der Demo-Daten fehlgeschlagen:', err);
    }
    depth++;
    try {
      core.tick();
    } catch (err) {
      const t = Date.now();
      if (t - lastTickError > 30_000) {
        lastTickError = t;
        console.error('[local] Simulation fehlgeschlagen:', err);
      }
    } finally {
      depth--;
      finishBatch();
    }
  }

  const roundTimer = setInterval(() => {
    if (disposed) return;
    if (!storage) {
      tick();
      return;
    }
    const current = validLeader();
    if (current === null) {
      // Anspruch anmelden – gilt ab der nächsten Runde, falls kein anderer Tab schneller war
      writeHeartbeat();
      return;
    }
    if (current !== tabId) {
      stepDown();
      return;
    }
    writeHeartbeat();
    becomeLeader();
    tick();
  }, TICK_INTERVAL_MS);

  function releaseLeadership(): void {
    if (readLeader()?.tabId === tabId) safeRemove(storage, LEADER_KEY);
    if (leader && !standalone) post({ kind: 'bye', from: tabId });
  }
  window.addEventListener('pagehide', releaseLeadership);
  // aus dem bfcache zurück → Leader-Rolle neu aushandeln
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) stepDown();
  };
  window.addEventListener('pageshow', onPageShow);

  hooks.onStatus('online');

  // ── Aufrufe ──
  async function call(method: string, args: unknown[]): Promise<unknown> {
    if (disposed) throw new ApiError('internal', GENERIC_ERROR);
    const input = args.map((a) => (a === undefined || a === null ? undefined : cloneJson(a)));
    for (let attempt = 0; attempt < MAX_FORWARD_ATTEMPTS; attempt++) {
      const target = await resolveTarget();
      if (target === 'self') return execute(method, input, token);
      try {
        return await forward(target, method, input);
      } catch (err) {
        if (!(err instanceof ForwardRetry)) throw err;
        if (err.reason === 'unavailable') await waitForLeaderChange(target);
      }
    }
    throw new ApiError('internal', SYNC_ERROR);
  }

  return {
    mode: 'local',
    call,
    setToken(next) {
      token = next;
      userCache = null;
    },
    dispose() {
      if (disposed) return;
      releaseLeadership();
      disposed = true;
      clearInterval(roundTimer);
      for (const entry of rpcs.values()) {
        clearTimeout(entry.timer);
        entry.reject(new ApiError('internal', GENERIC_ERROR));
      }
      rpcs.clear();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', releaseLeadership);
      window.removeEventListener('pageshow', onPageShow);
      channel?.close();
      channel = null;
    },
  };
}
