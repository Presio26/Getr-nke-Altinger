/**
 * Getränke Altinger – API-Server (Modus "remote").
 *
 *  - POST /api/rpc/:method   { args: [...] } → { result } | { error: ApiErrorBody }
 *  - GET  /api/health        → { ok, mode: 'remote', version, time }
 *  - socket.io unter /socket.io, Ereignis "rt" mit RealtimeEvent (Räume je Rolle, siehe realtime.ts)
 *  - Produktion: liefert den Vite-Build aus dist/ aus (SPA-Fallback auf index.html)
 *
 * Start: `tsx server/index.ts` (bzw. `npm run dev` / `npm start`).
 * Umgebungsvariablen: PORT (8787), HOST (0.0.0.0), DATA_FILE (data/db.json), DEMO_MODE (true),
 * RESEED_STALE (true), CORS_ORIGIN (kommagetrennt; Standard: alle), NODE_ENV, LOG_RPC (false),
 * HTTPS_CERT + HTTPS_KEY (Pfade zu PEM-Dateien → HTTPS, z. B. mit mkcert – nötig für GPS auf dem iPhone im WLAN).
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express';
import { API_ERROR_STATUS, ApiError } from '../shared/api';
import type { ApiErrorBody, ApiErrorCode } from '../shared/types';
import { createCore, createSeedDb, isSeedStale, type Core, type CoreOptions, type Db } from '../shared/core/index';
import { createPersister, loadDb, type LoadResult } from './persistence';
import { createRealtime, type Realtime } from './realtime';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_FILE = path.join(ROOT_DIR, 'data', 'db.json');
const DEFAULT_DIST_DIR = path.join(ROOT_DIR, 'dist');

export const SERVER_VERSION: string = readVersion();

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ───────────────────────────── Optionen ─────────────────────────────

export interface StartServerOptions {
  /** Port; 0 = beliebiger freier Port (Tests). Default: PORT bzw. 8787 */
  port?: number;
  /** Default: HOST bzw. 0.0.0.0 (im LAN erreichbar, z. B. fürs iPhone) */
  host?: string;
  /** JSON-Datei für die Daten. Default: DATA_FILE bzw. data/db.json */
  dataFile?: string;
  /** an createCore durchgereicht (Default: DEMO_MODE !== 'false') */
  demoMode?: boolean;
  /** Demo-Daten eines früheren Tages neu erzeugen (Default: RESEED_STALE !== 'false') */
  reseedStale?: boolean;
  /**
   * Verzeichnis mit dem Frontend-Build. Default: dist/, wenn NODE_ENV=production ist oder
   * dist/index.html existiert. false = keine statische Auslieferung.
   */
  staticDir?: string | false;
  /** Simulations-Takt in ms (Default 1000; 0 = aus) */
  tickIntervalMs?: number;
  /** Entprellzeit für das Speichern in ms (Default 500) */
  persistDelayMs?: number;
  /** erlaubte CORS-Origins; true = alle (Default: CORS_ORIGIN bzw. alle) */
  corsOrigin?: true | string[];
  /** Konsolen-Ausgaben (Default true) */
  log?: boolean;
  /** Uhr (Tests) */
  now?: () => Date;
  /** zusätzliche Core-Optionen, z. B. Routing/Geocoder-Attrappen in Tests */
  coreOptions?: Partial<Pick<CoreOptions, 'routing' | 'geocoder'>>;
  /** HTTPS statt HTTP (PEM-Dateipfade). Default: HTTPS_CERT/HTTPS_KEY, sonst HTTP */
  https?: { cert: string; key: string } | false;
}

export interface RunningServer {
  /** Basis-URL für lokale Aufrufe, z. B. http://127.0.0.1:8787 */
  url: string;
  protocol: 'http' | 'https';
  port: number;
  host: string;
  dataFile: string;
  staticDir: string | null;
  /** wie die Daten beim Start zustande kamen */
  load: Omit<LoadResult, 'db'>;
  app: express.Express;
  httpServer: http.Server | https.Server;
  core: Core;
  realtime: Realtime;
  /** ungespeicherte Änderungen sofort schreiben */
  flush(): void;
  /** Server, Sockets und Timer beenden; letzter Stand wird gespeichert */
  close(): Promise<void>;
}

function envFlag(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return !['false', '0', 'no', 'off', 'nein'].includes(v.trim().toLowerCase());
}

function envCorsOrigin(): true | string[] {
  const v = process.env.CORS_ORIGIN?.trim();
  if (!v || v === '*') return true;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveHttps(option: StartServerOptions['https']): { cert: Buffer; key: Buffer } | null {
  if (option === false) return null;
  const certFile = option ? option.cert : process.env.HTTPS_CERT;
  const keyFile = option ? option.key : process.env.HTTPS_KEY;
  if (!certFile || !keyFile) return null;
  return { cert: fs.readFileSync(path.resolve(certFile)), key: fs.readFileSync(path.resolve(keyFile)) };
}

function resolveStaticDir(option: string | false | undefined): string | null {
  if (option === false) return null;
  const dir = option ? path.resolve(option) : DEFAULT_DIST_DIR;
  const hasBuild = fs.existsSync(path.join(dir, 'index.html'));
  if (option || process.env.NODE_ENV === 'production' || hasBuild) {
    if (!hasBuild) {
      console.warn(`[server] Kein Frontend-Build unter ${dir} gefunden – bitte zuerst "npm run build" ausführen.`);
      return null;
    }
    return dir;
  }
  return null;
}

// ───────────────────────────── RPC-Hilfen ─────────────────────────────

const GENERIC_ERROR = 'Es ist ein interner Fehler aufgetreten. Bitte versuchen Sie es in einem Moment erneut.';
const METHOD_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function isApiErrorLike(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'ApiError' &&
    typeof (err as { code?: unknown }).code === 'string' &&
    (err as { code: string }).code in API_ERROR_STATUS
  );
}

function sendError(res: Response, status: number, body: ApiErrorBody): void {
  if (res.headersSent) return;
  res.status(status).set('Cache-Control', 'no-store').json({ error: body });
}

function errorResponse(err: unknown, context: string): { status: number; body: ApiErrorBody } {
  if (isApiErrorLike(err)) {
    const body: ApiErrorBody = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    return { status: API_ERROR_STATUS[err.code] ?? 500, body };
  }
  console.error(`[rpc] ${context} fehlgeschlagen:`, err);
  return { status: 500, body: { code: 'internal', message: GENERIC_ERROR } };
}

/** `{ args: [...] }` prüfen; null → undefined (JSON kennt kein undefined), hängende undefined entfernen */
function parseArgs(body: unknown): unknown[] {
  if (body === undefined || body === null) return [];
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('validation', 'Ungültige Anfrage: Erwartet wird ein Objekt { "args": [...] }.');
  }
  const raw = (body as { args?: unknown }).args;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ApiError('validation', 'Ungültige Anfrage: „args“ muss eine Liste sein.');
  const args = raw.map((a) => (a === null ? undefined : a));
  while (args.length && args[args.length - 1] === undefined) args.pop();
  return args;
}

function isKnownMethod(core: Core, method: string): boolean {
  if (!METHOD_NAME.test(method)) return false;
  if (method in Object.prototype) return false;
  return typeof (core.handlers as unknown as Record<string, unknown>)[method] === 'function';
}

// ───────────────────────────── Statische Auslieferung ─────────────────────────────

const NO_CACHE_FILES = /^(index\.html|sw\.js|registerSW\.js|service-worker\.js|manifest\.webmanifest|manifest\.json)$/;
const ASSET_EXTENSION = /\.(js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|json|webmanifest|txt|xml|wasm)$/i;

function staticCacheHeader(staticDir: string, filePath: string): string {
  const rel = path.relative(staticDir, filePath).split(path.sep).join('/');
  if (NO_CACHE_FILES.test(rel) || rel.endsWith('.html')) return 'no-cache';
  // Vite-Assets und Workbox-Laufzeit tragen einen Inhalts-Hash im Namen
  if (rel.startsWith('assets/') || /^workbox-[\w-]+\.js$/.test(rel)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

// ───────────────────────────── Server ─────────────────────────────

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const log = options.log ?? true;
  const now = options.now ?? (() => new Date());
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 8787);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const dataFile = path.resolve(options.dataFile ?? process.env.DATA_FILE ?? DEFAULT_DATA_FILE);
  const demoMode = options.demoMode ?? envFlag('DEMO_MODE', true);
  const reseedStale = options.reseedStale ?? envFlag('RESEED_STALE', true);
  const corsOrigin = options.corsOrigin ?? envCorsOrigin();
  const tickIntervalMs = options.tickIntervalMs ?? 1000;
  const logRpc = envFlag('LOG_RPC', false);
  const staticDir = resolveStaticDir(options.staticDir);

  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Ungültiger Port: ${String(port)}`);

  // ── Daten laden ──
  const loaded = loadDb(dataFile, now(), { reseedStale });
  const persister = createPersister(dataFile, { delayMs: options.persistDelayMs ?? 500 });

  // ── HTTP + socket.io ──
  const app = express();
  const tls = resolveHttps(options.https);
  const httpServer = tls ? https.createServer(tls, app) : http.createServer(app);
  let core: Core | null = null;
  const realtime = createRealtime(httpServer, {
    resolveUser: (token) => (core && token ? core.userForToken(token) : null),
    corsOrigin,
    log: log && logRpc,
  });

  core = createCore({
    db: loaded.db,
    mode: 'remote',
    emit: (event, audience) => {
      try {
        realtime.emit(event, audience);
      } catch (err) {
        console.error('[realtime] Senden fehlgeschlagen:', err);
      }
    },
    persist: (db: Db) => persister.schedule(db),
    demoMode,
    ...(options.now ? { now: options.now } : {}),
    ...(options.coreOptions ?? {}),
  });
  const theCore: Core = core;

  // ── Middleware ──
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // GPS für die Fahrer-App, Kamera für das Zustellfoto
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()');
    next();
  });

  const corsMiddleware = cors({
    origin: corsOrigin === true ? true : corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.use('/api', corsMiddleware);
  app.use('/api', express.json({ limit: '8mb' }));

  // ── API ──
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      ok: true,
      mode: 'remote',
      version: SERVER_VERSION,
      time: now().toISOString(),
    });
  });

  const rpc: RequestHandler = async (req, res) => {
    const method = req.params.method ?? '';
    const started = Date.now();
    try {
      const args = parseArgs(req.body);
      if (!isKnownMethod(theCore, method)) {
        throw new ApiError('not_found', `Unbekannte API-Funktion „${method.slice(0, 64)}“.`);
      }
      const ctx = theCore.ctx(bearerToken(req));
      const result = await theCore.call(method, ctx, args);
      res.set('Cache-Control', 'no-store').json({ result: result ?? null });
      if (logRpc) console.log(`[rpc] ${method} ${Date.now() - started} ms`);
    } catch (err) {
      const { status, body } = errorResponse(err, method);
      if (logRpc) console.log(`[rpc] ${method} → ${status} ${body.code} (${Date.now() - started} ms)`);
      sendError(res, status, body);
    }
  };
  app.post('/api/rpc/:method', rpc);
  app.all('/api/rpc/:method', (_req, res) => {
    res.setHeader('Allow', 'POST');
    sendError(res, 405, { code: 'validation', message: 'Diese Funktion muss per POST aufgerufen werden.' });
  });
  app.use('/api', (_req, res) => {
    sendError(res, 404, { code: 'not_found', message: 'Diese Adresse gibt es nicht.' });
  });

  // ── Frontend (Produktion) ──
  if (staticDir) {
    const indexHtml = path.join(staticDir, 'index.html');
    app.use(
      express.static(staticDir, {
        index: false,
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
          res.setHeader('Cache-Control', staticCacheHeader(staticDir, filePath));
          if (filePath.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        },
      }),
    );
    // SPA-Fallback: alle übrigen GET-Anfragen (außer /api, /socket.io und Dateien) → index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/api' || req.path.startsWith('/socket.io')) return next();
      if (ASSET_EXTENSION.test(req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml, (err) => {
        if (err) next(err);
      });
    });
  }

  // ── Fehlerbehandlung (u. a. kaputtes JSON, zu große Anfrage) ──
  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const type = (err as { type?: string } | null)?.type;
    let status = 500;
    let code: ApiErrorCode = 'internal';
    let message = GENERIC_ERROR;
    if (type === 'entity.too.large') {
      status = 413;
      code = 'validation';
      message = 'Die übermittelten Daten sind zu groß (maximal 8 MB). Bitte verwenden Sie ein kleineres Foto.';
    } else if (type === 'entity.parse.failed' || type === 'encoding.unsupported' || type === 'charset.unsupported') {
      status = 400;
      code = 'validation';
      message = 'Die Anfrage konnte nicht gelesen werden (ungültiges JSON).';
    } else if (typeof (err as { status?: unknown })?.status === 'number' && (err as { status: number }).status < 500) {
      status = (err as { status: number }).status;
      code = status === 404 ? 'not_found' : 'validation';
      message = status === 404 ? 'Diese Adresse gibt es nicht.' : 'Die Anfrage ist ungültig.';
    } else {
      console.error(`[server] Fehler bei ${req.method} ${req.originalUrl}:`, err);
    }
    if (req.path.startsWith('/api')) sendError(res, status, { code, message });
    else res.status(status).type('text/plain; charset=utf-8').send(message);
  };
  app.use(errorHandler);

  // ── Demo: neuer Kalendertag → frische Demo-Daten (Server läuft z. B. tagelang auf einem Host) ──
  const checkStaleSeed = () => {
    try {
      const t = now();
      if (!isSeedStale(theCore.getDb(), t)) return;
      const fresh = createSeedDb(t);
      theCore.replaceDb(fresh);
      persister.schedule(fresh);
      realtime.emit({ type: 'data.reset' }, { all: true });
      if (log) console.log(`[server] Neuer Tag – Demo-Daten für ${t.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} neu erzeugt.`);
    } catch (err) {
      console.error('[server] Neu-Erzeugen der Demo-Daten fehlgeschlagen:', err);
    }
  };
  const staleTimer = demoMode && reseedStale ? setInterval(checkStaleSeed, 60_000) : null;

  // ── Simulation ──
  let lastTickError = 0;
  const tickTimer =
    tickIntervalMs > 0
      ? setInterval(() => {
          try {
            theCore.tick();
          } catch (err) {
            const t = Date.now();
            if (t - lastTickError > 30_000) {
              lastTickError = t;
              console.error('[sim] tick fehlgeschlagen:', err);
            }
          }
        }, tickIntervalMs)
      : null;

  // ── Lauschen ──
  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      httpServer.off('listening', onListening);
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} ist bereits belegt. Läuft der Server schon? (PORT=… zum Ändern)`));
      } else reject(err);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, host);
  }).catch(async (err) => {
    if (tickTimer) clearInterval(tickTimer);
    if (staleTimer) clearInterval(staleTimer);
    persister.close();
    await realtime.close().catch(() => undefined);
    throw err;
  });

  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const localHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  const protocol = tls ? 'https' : 'http';

  let closing: Promise<void> | null = null;

  return {
    url: `${protocol}://${localHost}:${actualPort}`,
    protocol,
    port: actualPort,
    host,
    dataFile,
    staticDir,
    load: { source: loaded.source, reason: loaded.reason },
    app,
    httpServer,
    core: theCore,
    realtime,
    flush: () => persister.flush(),
    close() {
      if (closing) return closing;
      closing = (async () => {
        if (tickTimer) clearInterval(tickTimer);
        if (staleTimer) clearInterval(staleTimer);
        const closed = realtime.close();
        httpServer.closeAllConnections();
        await closed;
        persister.close();
      })();
      return closing;
    },
  };
}

// ───────────────────────────── CLI ─────────────────────────────

/** IPv4-Adressen im lokalen Netz (für den Test auf dem iPhone im WLAN) */
export function lanAddresses(): string[] {
  const result: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) result.push(info.address);
    }
  }
  return result;
}

const SEED_REASON_TEXT: Record<string, string> = {
  missing: 'neu erzeugt (keine Datei vorhanden)',
  corrupt: 'neu erzeugt (Datei war beschädigt – Sicherung angelegt)',
  schema: 'neu erzeugt (andere Schema-Version – Sicherung angelegt)',
  stale: 'neu erzeugt (Demo-Daten vom Vortag)',
};

function printBanner(server: RunningServer, demoMode: boolean): void {
  const lan = lanAddresses();
  const lines = [
    '',
    `  Getränke Altinger – Server ${SERVER_VERSION} läuft (Modus remote${demoMode ? ', Demo-Modus' : ''})`,
    '',
    `  Lokal:     ${server.protocol}://localhost:${server.port}`,
    ...lan.map((ip) => `  Im WLAN:   ${server.protocol}://${ip}:${server.port}`),
    `  Daten:     ${server.dataFile} – ${server.load.source === 'file' ? 'geladen' : SEED_REASON_TEXT[server.load.reason ?? 'missing']}`,
  ];
  if (server.staticDir) {
    lines.push(`  Frontend:  ${server.staticDir} (Produktions-Build)`);
  } else {
    lines.push(
      '  Frontend:  Vite-Entwicklungsserver – http://localhost:5173' +
        (lan.length ? ` · im WLAN ${lan.map((ip) => `http://${ip}:5173`).join(', ')}` : ''),
    );
  }
  if (server.protocol === 'http') {
    lines.push(
      '',
      '  Hinweis: Die GPS-Freigabe der Fahrer-App funktioniert auf dem iPhone nur über HTTPS (oder localhost).',
      '  Für reine Demos genügt die eingebaute Fahrtsimulation; sonst HTTPS_CERT/HTTPS_KEY setzen (z. B. mkcert).',
    );
  }
  lines.push('');
  console.log(lines.join('\n'));
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const self = fs.realpathSync(fileURLToPath(import.meta.url));
    const resolved = fs.realpathSync(path.resolve(entry));
    return resolved === self || resolved.replace(/\.[cm]?[jt]s$/, '') === self.replace(/\.[cm]?[jt]s$/, '');
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const demoMode = envFlag('DEMO_MODE', true);
  let server: RunningServer;
  try {
    server = await startServer({ demoMode });
  } catch (err) {
    console.error(`\n[server] Start fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  printBanner(server, demoMode);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} empfangen – Daten werden gespeichert …`);
    try {
      server.flush();
    } catch (err) {
      console.error('[server] Speichern beim Beenden fehlgeschlagen:', err);
    }
    setTimeout(() => process.exit(0), 2000).unref();
    server
      .close()
      .catch((err) => console.error('[server] Fehler beim Beenden:', err))
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => console.error('[server] Unbehandelte Promise-Ablehnung:', reason));
  process.on('uncaughtException', (err) => {
    console.error('[server] Unerwarteter Fehler:', err);
    try {
      server.flush();
    } finally {
      process.exit(1);
    }
  });
}

if (isMainModule()) void main();
