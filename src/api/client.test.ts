/**
 * Regressionstest auto-mode-silent-local-fallback: Moduswahl in initApi() (auto).
 * Transporte sind gemockt; fetch, localStorage und navigator werden je Fall gesetzt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ transports: [] as string[] }));

vi.mock('./remote', () => ({
  createRemoteTransport: () => {
    state.transports.push('remote');
    return { mode: 'remote', call: async () => null, setToken: () => undefined, dispose: () => undefined };
  },
}));
vi.mock('./local', () => ({
  createLocalTransport: () => {
    state.transports.push('local');
    return { mode: 'local', call: async () => null, setToken: () => undefined, dispose: () => undefined };
  },
}));

const SERVER_SEEN_KEY = 'altinger-api-server';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const healthy = async () => ({ status: 200, ok: true, json: async () => ({ ok: true, mode: 'remote' }) }) as Response;
const notFound = async () => ({ status: 404, ok: false, json: async () => null }) as unknown as Response;
const networkError = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};

async function start(options: { fetch: () => Promise<Response>; storage: Storage; online?: boolean }) {
  vi.resetModules();
  vi.stubEnv('VITE_API_MODE', 'auto');
  vi.stubEnv('VITE_API_URL', '');
  vi.stubGlobal('fetch', vi.fn(options.fetch));
  vi.stubGlobal('localStorage', options.storage);
  // offline → die Prüfung gibt nach dem ersten Fehlversuch auf (statt 2,5 s zu wiederholen)
  vi.stubGlobal('navigator', { onLine: options.online ?? false });
  const client = await import('./client');
  const mode = await client.initApi();
  return { mode, status: client.realtime.status(), transport: state.transports.at(-1) };
}

describe('auto-mode-silent-local-fallback', () => {
  beforeEach(() => {
    state.transports.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('Server antwortet → remote; das Gerät merkt sich den Server', async () => {
    const storage = memoryStorage();
    const r = await start({ fetch: healthy, storage, online: true });
    expect(r.mode).toBe('remote');
    expect(r.transport).toBe('remote');
    expect(storage.getItem(SERVER_SEEN_KEY)).toBe('remote');
  });

  it('bekannter Server kurz nicht erreichbar (Kaltstart/Funkloch) → remote mit Status offline, NICHT still local', async () => {
    const r = await start({ fetch: networkError, storage: memoryStorage({ [SERVER_SEEN_KEY]: 'remote' }) });
    expect(r.mode).toBe('remote');
    expect(r.transport).toBe('remote');
    expect(r.status).toBe('offline');
  });

  it('nie ein Server gesehen und nicht erreichbar → local wie bisher (Offline-Demo)', async () => {
    const r = await start({ fetch: networkError, storage: memoryStorage() });
    expect(r.mode).toBe('local');
    expect(r.transport).toBe('local');
  });

  it('eindeutig kein Server (404 eines Static-Hostings) → local, auch wenn früher einer da war', async () => {
    const storage = memoryStorage({ [SERVER_SEEN_KEY]: 'remote' });
    const r = await start({ fetch: notFound, storage, online: true });
    expect(r.mode).toBe('local');
    expect(storage.getItem(SERVER_SEEN_KEY)).toBe('none');
  });
});
