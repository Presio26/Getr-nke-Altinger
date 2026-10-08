/**
 * Datenanbindung im Browser – einziger Einstiegspunkt der Oberfläche.
 *
 *  - `api`        Proxy mit allen Methoden aus `Api` (shared/api.ts)
 *  - `initApi()`  wählt den Betriebsmodus (remote = Node-Server, local = Core im Browser)
 *  - `realtime`   Echtzeit-Ereignisse + Verbindungsstatus (modusunabhängig)
 *
 * Moduswahl (docs/ARCHITECTURE.md §3): VITE_API_MODE = remote | local | auto (Default auto).
 * auto: GET /api/health mit 2,5 s Timeout → Erfolg = remote, sonst local.
 * Zusätzlich (nur bei auto) lässt sich der Modus für Demos per URL erzwingen: `?api=local` bzw. `?api=remote`
 * (gilt für die Browser-Sitzung).
 *
 * Optionale Basis-URL des Servers (wenn das Frontend woanders gehostet wird): VITE_API_URL.
 */
import { ApiError, type Api } from '@shared/api';
import type { RealtimeEvent } from '@shared/types';

export { ApiError };
export type { Api };

export type ApiMode = 'remote' | 'local';
export type RealtimeStatus = 'connecting' | 'online' | 'offline';

/** Rückkanal eines Transports zum Client */
export interface TransportHooks {
  onEvent(event: RealtimeEvent): void;
  onStatus(status: RealtimeStatus): void;
}

/** Gemeinsame Schnittstelle von remote.ts und local.ts */
export interface Transport {
  readonly mode: ApiMode;
  /** Methode aufrufen; wirft ApiError */
  call(method: string, args: unknown[]): Promise<unknown>;
  /** Anmelde-Token wechseln (Login/Logout) */
  setToken(token: string | null): void;
  /** Verbindungen/Timer beenden */
  dispose(): void;
}

export interface TransportInit {
  token: string | null;
  hooks: TransportHooks;
  /** Basis-URL des Servers ('' = gleiche Herkunft) */
  baseUrl: string;
}

export const NETWORK_ERROR_MESSAGE = 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.';
const HEALTH_TIMEOUT_MS = 2500;
const MODE_OVERRIDE_KEY = 'altinger-api-mode';

// ───────────────────────────── Konfiguration ─────────────────────────────

function envString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const ENV_MODE = envString(import.meta.env.VITE_API_MODE).toLowerCase();
/** Basis-URL ohne abschließenden Schrägstrich ('' = gleiche Herkunft) */
export const API_BASE_URL = envString(import.meta.env.VITE_API_URL).replace(/\/+$/, '');

function configuredMode(): 'remote' | 'local' | 'auto' {
  if (ENV_MODE === 'remote' || ENV_MODE === 'local') return ENV_MODE;
  return 'auto';
}

/** Modus-Erzwingung per URL-Parameter `?api=local|remote` (merkt sich die Wahl für die Sitzung) */
function urlModeOverride(): ApiMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('api')?.toLowerCase();
    if (param === 'local' || param === 'remote') {
      window.sessionStorage.setItem(MODE_OVERRIDE_KEY, param);
      return param;
    }
    if (param === 'auto') {
      window.sessionStorage.removeItem(MODE_OVERRIDE_KEY);
      return null;
    }
    const stored = window.sessionStorage.getItem(MODE_OVERRIDE_KEY);
    return stored === 'local' || stored === 'remote' ? stored : null;
  } catch {
    return null;
  }
}

// ───────────────────────────── Zustand ─────────────────────────────

let transport: Transport | null = null;
let mode: ApiMode = configuredMode() === 'local' ? 'local' : 'remote';
let initPromise: Promise<ApiMode> | null = null;
let authToken: string | null = null;

const eventHandlers = new Set<(event: RealtimeEvent) => void>();
const statusListeners = new Set<(status: RealtimeStatus) => void>();
let rtStatus: RealtimeStatus = 'connecting';

const hooks: TransportHooks = {
  onEvent(event) {
    for (const handler of [...eventHandlers]) {
      try {
        handler(event);
      } catch (err) {
        console.error('[realtime] Fehler in einem Ereignis-Handler:', err);
      }
    }
  },
  onStatus(status) {
    if (status === rtStatus) return;
    rtStatus = status;
    for (const cb of [...statusListeners]) {
      try {
        cb(status);
      } catch (err) {
        console.error('[realtime] Fehler in einem Status-Listener:', err);
      }
    }
  },
};

// ───────────────────────────── Initialisierung ─────────────────────────────

type HealthProbe = 'ok' | 'no-server' | 'retry';

async function probeHealth(timeoutMs: number): Promise<HealthProbe> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    // 5xx: z. B. Vite-Proxy, während der Server noch startet → erneut versuchen
    if (res.status >= 500) return 'retry';
    if (!res.ok) return 'no-server';
    // Static-Hosting liefert hier ggf. index.html (SPA-Fallback) → kein JSON → local
    const body = (await res.json().catch(() => null)) as { ok?: unknown; mode?: unknown } | null;
    return body?.ok === true && body.mode === 'remote' ? 'ok' : 'no-server';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prüft, ob der Node-Server erreichbar ist (GET /api/health, insgesamt höchstens 2,5 s).
 * Vorübergehende Fehler (Netzwerk, 5xx) werden innerhalb der Frist wiederholt; eine eindeutige
 * Antwort ohne Server (404, HTML eines Static-Hostings) führt sofort zu false.
 */
export async function checkServerHealth(timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 50) return false;
    const result = await probeHealth(remaining);
    if (result !== 'retry') return result === 'ok';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    await new Promise((resolve) => setTimeout(resolve, Math.min(400, Math.max(0, deadline - Date.now()))));
  }
}

async function createTransport(target: ApiMode): Promise<Transport> {
  const init: TransportInit = { token: authToken, hooks, baseUrl: API_BASE_URL };
  if (target === 'remote') {
    const { createRemoteTransport } = await import('./remote');
    return createRemoteTransport(init);
  }
  // Core + Demo-Daten nur im local-Modus laden (eigener Chunk)
  const { createLocalTransport } = await import('./local');
  return createLocalTransport(init);
}

async function doInit(): Promise<ApiMode> {
  const configured = configuredMode();
  let target: ApiMode;
  if (configured !== 'auto') target = configured;
  else target = urlModeOverride() ?? ((await checkServerHealth()) ? 'remote' : 'local');

  mode = target;
  if (target === 'local') hooks.onStatus('online');
  transport = await createTransport(target);
  // Token könnte sich während des Ladens geändert haben
  transport.setToken(authToken);
  if (import.meta.env.DEV) console.info(`[api] Modus: ${target}${API_BASE_URL ? ` (${API_BASE_URL})` : ''}`);
  return target;
}

/**
 * Betriebsmodus festlegen und Transport laden. Mehrfachaufrufe liefern dieselbe Promise.
 * API-Aufrufe vor dem Abschluss warten automatisch darauf.
 */
export function initApi(): Promise<ApiMode> {
  if (!initPromise) {
    initPromise = doInit().catch((err: unknown) => {
      // erneuter Versuch beim nächsten Aufruf möglich (z. B. Chunk-Ladefehler bei schlechtem Netz)
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/** Aktueller Modus. Vor Abschluss von initApi(): 'local', wenn VITE_API_MODE=local, sonst 'remote'. */
export function getApiMode(): ApiMode {
  return mode;
}

/** true, sobald initApi() abgeschlossen ist */
export function isApiReady(): boolean {
  return transport !== null;
}

/** Anmelde-Token setzen (nach Login) bzw. entfernen (null, nach Logout). Wirkt sofort auch auf die Echtzeit-Verbindung. */
export function setAuthToken(token: string | null): void {
  const next = token || null;
  if (next === authToken) return;
  authToken = next;
  transport?.setToken(next);
}

export function getAuthToken(): string | null {
  return authToken;
}

// ───────────────────────────── Aufrufe ─────────────────────────────

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'ApiError') {
    const e = err as { code?: ApiError['code']; message?: string; details?: unknown };
    return new ApiError(e.code ?? 'internal', e.message || 'Unbekannter Fehler.', e.details);
  }
  if (err instanceof TypeError) return new ApiError('internal', NETWORK_ERROR_MESSAGE);
  const message = err instanceof Error && err.message ? err.message : 'Es ist ein unerwarteter Fehler aufgetreten.';
  return new ApiError('internal', message);
}

async function callApi(method: string, args: unknown[]): Promise<unknown> {
  // hängende undefined-Argumente entfernen (Default-Parameter im Core greifen dann wie beim Direktaufruf)
  const trimmed = [...args];
  while (trimmed.length && trimmed[trimmed.length - 1] === undefined) trimmed.pop();
  try {
    const t = transport ?? (await initApi(), transport);
    if (!t) throw new ApiError('internal', NETWORK_ERROR_MESSAGE);
    return await t.call(method, trimmed);
  } catch (err) {
    throw toApiError(err);
  }
}

const methodCache = new Map<string, (...args: unknown[]) => Promise<unknown>>();

/**
 * Typisierter Zugriff auf alle API-Methoden, z. B. `await api.listProducts()`.
 * Jede Methode liefert eine Promise und wirft bei Fehlern `ApiError` (deutsche Meldung in `message`).
 */
export const api: Api = new Proxy({} as Api, {
  get(_target, prop) {
    // kein Thenable (sonst würde `await api` hängen) und keine Symbol-Zugriffe
    if (typeof prop !== 'string' || prop === 'then' || prop === 'toJSON') return undefined;
    let fn = methodCache.get(prop);
    if (!fn) {
      fn = (...args: unknown[]) => callApi(prop, args);
      methodCache.set(prop, fn);
    }
    return fn;
  },
});

// ───────────────────────────── Echtzeit ─────────────────────────────

export interface RealtimeClient {
  /** Ereignisse abonnieren (auch schon vor initApi()); liefert die Abmeldefunktion */
  subscribe(handler: (event: RealtimeEvent) => void): () => void;
  /** aktueller Verbindungsstatus ('online' im local-Modus) */
  status(): RealtimeStatus;
  /** Statusänderungen abonnieren; liefert die Abmeldefunktion */
  onStatus(cb: (status: RealtimeStatus) => void): () => void;
}

export const realtime: RealtimeClient = {
  subscribe(handler) {
    eventHandlers.add(handler);
    return () => {
      eventHandlers.delete(handler);
    };
  },
  status: () => rtStatus,
  onStatus(cb) {
    statusListeners.add(cb);
    return () => {
      statusListeners.delete(cb);
    };
  },
};
