/**
 * Transport "remote": HTTP-RPC gegen den Node-Server + socket.io für Echtzeit-Ereignisse.
 *
 *  - POST {baseUrl}/api/rpc/<methode>  Body { args }  Header Authorization: Bearer <token>
 *  - socket.io unter /socket.io, Handshake auth: { token }, Ereignis "rt" (RealtimeEvent)
 *  - Login/Logout ohne Neuverbindung: socket.emit('auth', { token })
 *  - Rückkehr aus dem Hintergrund (iPhone) / Netz wieder da → Verbindung aktiv prüfen
 */
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import { API_ERROR_STATUS, ApiError } from '@shared/api';
import type { ApiErrorBody, ApiErrorCode, RealtimeEvent } from '@shared/types';
import type { Transport, TransportInit } from './client';

const NETWORK_ERROR_MESSAGE = 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.';
const TIMEOUT_MESSAGE = 'Der Server antwortet nicht. Bitte versuchen Sie es in einem Moment erneut.';
/** großzügig: Tourenplanung mit Routenberechnung kann einige Sekunden dauern, Fotos brauchen Upload-Zeit */
const RPC_TIMEOUT_MS = 45_000;
/** Antwortzeit für die Verbindungsprüfung nach Rückkehr aus dem Hintergrund */
const PROBE_TIMEOUT_MS = 4_000;

function isErrorCode(code: unknown): code is ApiErrorCode {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(API_ERROR_STATUS, code);
}

function fallbackError(status: number): ApiError {
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return new ApiError('internal', NETWORK_ERROR_MESSAGE);
  }
  if (status === 401) return new ApiError('unauthorized', 'Bitte melden Sie sich an.');
  if (status === 403) return new ApiError('forbidden', 'Dafür fehlt Ihnen die Berechtigung.');
  if (status === 404) return new ApiError('not_found', 'Die angeforderte Funktion wurde nicht gefunden.');
  if (status === 413) {
    return new ApiError('validation', 'Die übermittelten Daten sind zu groß. Bitte verwenden Sie ein kleineres Foto.');
  }
  return new ApiError('internal', `Unerwartete Antwort vom Server (HTTP ${status}). Bitte versuchen Sie es erneut.`);
}

export function createRemoteTransport(init: TransportInit): Transport {
  const { baseUrl, hooks } = init;
  let token: string | null = init.token;
  let disposed = false;

  // ── HTTP-RPC ───────────────────────────────────────────────

  async function call(method: string, args: unknown[]): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    let text: string;
    try {
      res = await fetch(`${baseUrl}/api/rpc/${encodeURIComponent(method)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ args }),
        cache: 'no-store',
        signal: controller.signal,
      });
      text = await res.text();
    } catch {
      throw new ApiError('internal', controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE);
    } finally {
      clearTimeout(timer);
    }

    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }

    if (res.ok && body && typeof body === 'object' && 'result' in body) {
      return (body as { result: unknown }).result;
    }
    const error = body && typeof body === 'object' ? (body as { error?: Partial<ApiErrorBody> }).error : undefined;
    if (error && typeof error.message === 'string' && error.message) {
      throw new ApiError(isErrorCode(error.code) ? error.code : 'internal', error.message, error.details);
    }
    // z. B. Proxy-Fehlerseite oder index.html eines Static-Hostings
    throw fallbackError(res.ok ? 500 : res.status);
  }

  // ── socket.io ──────────────────────────────────────────────

  const options: Partial<ManagerOptions & SocketOptions> = {
    path: '/socket.io',
    // Token bei jedem (Wieder-)Verbinden frisch lesen
    auth: (cb) => cb({ token }),
    transports: ['websocket', 'polling'],
    // Fällt WebSocket aus (Proxy/Firmennetz), automatisch auf Long-Polling ausweichen
    tryAllTransports: true,
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.3,
    timeout: 10_000,
  };
  const socket: Socket = baseUrl ? io(baseUrl, options) : io(options);

  socket.on('connect', () => hooks.onStatus('online'));
  socket.on('disconnect', (reason) => {
    hooks.onStatus('offline');
    // vom Server getrennt → socket.io verbindet nicht selbst neu
    if (reason === 'io server disconnect' && !disposed) socket.connect();
  });
  socket.on('connect_error', () => {
    if (!socket.connected) hooks.onStatus('offline');
  });
  socket.on('rt', (event: RealtimeEvent) => {
    if (event && typeof event === 'object' && typeof event.type === 'string') hooks.onEvent(event);
  });

  /** Prüft eine (scheinbar) bestehende Verbindung; tote Verbindungen werden sofort neu aufgebaut. */
  function verifyConnection(): void {
    if (disposed) return;
    if (!socket.connected) {
      socket.connect();
      return;
    }
    socket.timeout(PROBE_TIMEOUT_MS).emit('auth', { token }, (err: Error | null) => {
      if (err && !disposed) {
        socket.disconnect();
        socket.connect();
      }
    });
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') verifyConnection();
  };
  const onOnline = () => verifyConnection();
  const onOffline = () => hooks.onStatus('offline');

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
  }

  return {
    mode: 'remote',
    call,
    setToken(next) {
      if (next === token) return;
      token = next;
      // Räume serverseitig neu zuordnen, ohne die Verbindung zu trennen
      if (socket.connected) socket.emit('auth', { token });
    },
    reconnect() {
      if (disposed) return;
      if (socket.connected) verifyConnection();
      else {
        hooks.onStatus('connecting');
        socket.disconnect();
        socket.connect();
      }
    },
    dispose() {
      disposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
