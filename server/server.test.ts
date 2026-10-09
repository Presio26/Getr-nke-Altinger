/**
 * Integrationstests für den API-Server: echter HTTP-Server auf freiem Port, Aufrufe per fetch,
 * Echtzeit per socket.io-client, Persistenz in einer temporären Datei.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { ApiErrorBody, CheckoutInput, Customer, Order, Product, Quote, RealtimeEvent, Session, TimeSlot, TourWithOrders } from '../shared/types';
import { todayString } from '../shared/time';
import { CORE_VERSION, plzGeocoder, straightLineRouting } from '../shared/core/index';
import { startServer, type RunningServer, type StartServerOptions } from './index';
import { roomsForAudience, roomsForUser } from './realtime';

const TEST_TIMEOUT = 20_000;

/** Tests ohne Netzwerk: Luftlinien-Routing und PLZ-Geocoding statt OSRM/Photon */
const OFFLINE: StartServerOptions = {
  port: 0,
  host: '127.0.0.1',
  staticDir: false,
  log: false,
  https: false,
  coreOptions: { routing: straightLineRouting(), geocoder: plzGeocoder() },
};

interface RpcResponse<T> {
  status: number;
  result?: T;
  error?: ApiErrorBody;
}

async function rpc<T = unknown>(base: string, method: string, args: unknown[] = [], token?: string): Promise<RpcResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/api/rpc/${method}`, { method: 'POST', headers, body: JSON.stringify({ args }) });
  const body = (await res.json()) as { result?: T; error?: ApiErrorBody };
  return { status: res.status, ...body };
}

async function call<T>(base: string, method: string, args: unknown[] = [], token?: string): Promise<T> {
  const res = await rpc<T>(base, method, args, token);
  if (res.status !== 200 || res.error) {
    throw new Error(`${method} → HTTP ${res.status}: ${res.error?.code} ${res.error?.message}`);
  }
  return res.result as T;
}

function connectSocket(base: string, token?: string | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(base, {
      path: '/socket.io',
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const timer = setTimeout(() => reject(new Error('socket.io-Verbindung: Zeitüberschreitung')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** sammelt alle "rt"-Ereignisse eines Sockets */
function collect(socket: Socket): RealtimeEvent[] {
  const events: RealtimeEvent[] = [];
  socket.on('rt', (e: RealtimeEvent) => events.push(e));
  return events;
}

async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 5000, label = 'Bedingung'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`${label}: Zeitüberschreitung nach ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gültige Abhol-Bestellung (Click & Collect) für den angemeldeten Kunden zusammenstellen */
async function buildPickupOrder(base: string, token: string): Promise<CheckoutInput> {
  const products = await call<Product[]>(base, 'listProducts', [], token);
  const product = products.find((p) => p.active && !p.isRental && p.stock >= 10 && p.priceGross > 0);
  expect(product, 'ein bestellbarer Artikel').toBeTruthy();
  const slots = await call<TimeSlot[]>(base, 'listSlots', [{ type: 'pickup', days: 7 }], token);
  const slot = slots.find((s) => s.available);
  expect(slot, 'ein freies Abholfenster').toBeTruthy();
  const input: CheckoutInput = {
    items: [{ productId: product!.id, qty: 2 }],
    fulfillment: 'pickup',
    slotId: slot!.id,
    emptiesReturn: [],
    carryService: false,
    paymentMethod: 'cash',
  };
  const quote = await call<Quote>(base, 'quote', [input], token);
  expect(quote.errors).toEqual([]);
  if (!quote.paymentMethods.includes('cash')) input.paymentMethod = quote.paymentMethods[0];
  return input;
}

describe('Hilfsfunktionen Echtzeit-Räume', () => {
  it('leitet Räume aus Rolle und Audience ab', () => {
    const base = { name: 'x', email: 'x@example.com', createdAt: new Date().toISOString() };
    expect(roomsForUser(null)).toEqual(['all']);
    expect(roomsForUser({ ...base, id: 'u-admin', role: 'admin' })).toEqual(['all', 'user:u-admin', 'admin']);
    expect(roomsForUser({ ...base, id: 'u-toni', role: 'driver', driverId: 'd-toni' })).toEqual([
      'all',
      'user:u-toni',
      'drivers',
      'driver:d-toni',
    ]);
    expect(roomsForUser({ ...base, id: 'u-anna', role: 'customer', customerId: 'c-anna' })).toEqual([
      'all',
      'user:u-anna',
      'customer:c-anna',
    ]);
    expect(roomsForAudience({ all: true, admin: true })).toEqual(['all']);
    expect(
      roomsForAudience({ admin: true, customerIds: ['c1', undefined as unknown as string], driverIds: ['d1'], userIds: ['u1'] }).sort(),
    ).toEqual(['admin', 'customer:c1', 'driver:d1', 'user:u1']);
    expect(roomsForAudience({})).toEqual([]);
  });
});

describe('API-Server', () => {
  let tmpDir: string;
  let dataFile: string;
  let server: RunningServer;
  let base: string;
  const sockets: Socket[] = [];

  let anna: Session;
  let annaOrder: Order;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altinger-server-test-'));
    dataFile = path.join(tmpDir, 'db.json');
    server = await startServer({ ...OFFLINE, dataFile, tickIntervalMs: 250 });
    base = server.url;
  }, TEST_TIMEOUT);

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await server?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/health meldet Modus und Version', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const body = (await res.json()) as { ok: boolean; mode: string; version: string; time: string };
    const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string };
    expect(body).toMatchObject({ ok: true, mode: 'remote', version: pkg.version });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    // eine Version überall: package.json = Server = Core (Bootstrap)
    expect(pkg.version).toBe(CORE_VERSION);
    const boot = await call<{ version: string }>(base, 'getBootstrap');
    expect(boot.version).toBe(body.version);
  });

  it('legt beim ersten Start frische Demo-Daten an und speichert sie', () => {
    expect(server.load.source).toBe('seed');
    expect(fs.existsSync(dataFile)).toBe(true);
  });

  it('getBootstrap ist öffentlich und meldet remote', async () => {
    const boot = await call<{ mode: string; demoUsers: unknown[] }>(base, 'getBootstrap');
    expect(boot.mode).toBe('remote');
    expect(boot.demoUsers.length).toBeGreaterThan(0);
  });

  it(
    'demoLogin → listProducts → placeOrder → getOrder',
    async () => {
      anna = await call<Session>(base, 'demoLogin', ['u-anna']);
      expect(anna.token).toBeTruthy();
      expect(anna.user.id).toBe('u-anna');

      const me = await call<Session | null>(base, 'me', [], anna.token);
      expect(me?.user.id).toBe('u-anna');

      const customer = await call<Customer>(base, 'getMyCustomer', [], anna.token);
      const input = await buildPickupOrder(base, anna.token);
      annaOrder = await call<Order>(base, 'placeOrder', [input], anna.token);
      expect(annaOrder.id).toBeTruthy();
      expect(annaOrder.customerId).toBe(customer.id);
      expect(annaOrder.fulfillment).toBe('pickup');
      expect(annaOrder.lines[0]?.qty).toBe(2);

      const fetched = await call<Order>(base, 'getOrder', [annaOrder.id], anna.token);
      expect(fetched.id).toBe(annaOrder.id);
      expect(fetched.number).toBe(annaOrder.number);

      const mine = await call<Order[]>(base, 'listMyOrders', [], anna.token);
      expect(mine.some((o) => o.id === annaOrder.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it('Fehlerfälle liefern passende HTTP-Status und deutsche Meldungen', async () => {
    const unknown = await rpc(base, 'gibtEsNicht');
    expect(unknown.status).toBe(404);
    expect(unknown.error?.code).toBe('not_found');
    expect(unknown.error?.message).toMatch(/Unbekannte API-Funktion/);

    for (const evil of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const res = await rpc(base, evil);
      expect(res.status, evil).toBe(404);
    }

    const noAuth = await rpc(base, 'getMyCustomer');
    expect(noAuth.status).toBe(401);
    expect(noAuth.error?.code).toBe('unauthorized');

    const badToken = await rpc(base, 'getMyCustomer', [], 'kein-gueltiges-token');
    expect(badToken.status).toBe(401);

    const get = await fetch(`${base}/api/rpc/listProducts`);
    expect(get.status).toBe(405);

    const badJson = await fetch(`${base}/api/rpc/listProducts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"args": [',
    });
    expect(badJson.status).toBe(400);
    expect(((await badJson.json()) as { error: ApiErrorBody }).error.code).toBe('validation');

    const badArgs = await fetch(`${base}/api/rpc/listProducts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: 'nein' }),
    });
    expect(badArgs.status).toBe(422);

    const unknownPath = await fetch(`${base}/api/gibt/es/nicht`);
    expect(unknownPath.status).toBe(404);
  });

  it(
    'fremde Bestellungen sind für andere Kunden nicht sichtbar',
    async () => {
      expect(annaOrder).toBeTruthy();
      const nordbyte = await call<Session>(base, 'demoLogin', ['u-nordbyte']);
      const res = await rpc<Order>(base, 'getOrder', [annaOrder.id], nordbyte.token);
      expect([403, 404]).toContain(res.status);
      expect(res.result).toBeUndefined();
      expect(['forbidden', 'not_found']).toContain(res.error?.code);
    },
    TEST_TIMEOUT,
  );

  it(
    'socket.io: Admin erhält neue Bestellungen live, fremde Kunden nicht',
    async () => {
      const admin = await call<Session>(base, 'demoLogin', ['u-admin']);
      const nordbyte = await call<Session>(base, 'demoLogin', ['u-nordbyte']);
      const annaSession = await call<Session>(base, 'demoLogin', ['u-anna']);

      const adminSocket = await connectSocket(base, admin.token);
      const nordSocket = await connectSocket(base, nordbyte.token);
      const annaSocket = await connectSocket(base, annaSession.token);
      const guestSocket = await connectSocket(base, null);
      sockets.push(adminSocket, nordSocket, annaSocket, guestSocket);
      const adminEvents = collect(adminSocket);
      const nordEvents = collect(nordSocket);
      const annaEvents = collect(annaSocket);
      const guestEvents = collect(guestSocket);

      const input = await buildPickupOrder(base, annaSession.token);
      const order = await call<Order>(base, 'placeOrder', [input], annaSession.token);

      const isThisOrder = (e: RealtimeEvent) =>
        (e.type === 'order.created' || e.type === 'order.updated') && e.order.id === order.id;
      const adminEvent = await waitFor(() => adminEvents.find(isThisOrder), 5000, 'Admin-Ereignis');
      expect(adminEvent.type).toBe('order.created');
      await waitFor(() => annaEvents.find(isThisOrder), 5000, 'Kunden-Ereignis');

      await sleep(300);
      expect(nordEvents.some(isThisOrder)).toBe(false);
      expect(guestEvents.some(isThisOrder)).toBe(false);

      // Login ohne Neuverbindung: Gast-Socket meldet sich per "auth" als Admin an
      const ack = await guestSocket.timeout(3000).emitWithAck('auth', { token: admin.token });
      expect(ack).toMatchObject({ ok: true, userId: 'u-admin', role: 'admin' });
      const order2 = await call<Order>(base, 'placeOrder', [await buildPickupOrder(base, annaSession.token)], annaSession.token);
      await waitFor(() => guestEvents.find((e) => e.type === 'order.created' && e.order.id === order2.id), 5000, 'Ereignis nach auth');

      // Logout ohne Neuverbindung
      await guestSocket.timeout(3000).emitWithAck('auth', { token: null });
      const before = guestEvents.length;
      const order3 = await call<Order>(base, 'placeOrder', [await buildPickupOrder(base, annaSession.token)], annaSession.token);
      await waitFor(() => adminEvents.find((e) => e.type === 'order.created' && e.order.id === order3.id), 5000, 'Admin-Ereignis 3');
      await sleep(200);
      expect(guestEvents.slice(before).some((e) => 'order' in e && e.order.id === order3.id)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'Demo-Fahrtsimulation sendet Fahrerpositionen an den Admin',
    async (ctx) => {
      const admin = await call<Session>(base, 'demoLogin', ['u-admin']);
      const tours = await call<TourWithOrders[]>(base, 'adminListTours', [todayString()], admin.token);
      const tour = tours.find((t) => t.status === 'planned' && t.stops.length > 0) ?? tours.find((t) => t.status === 'active');
      if (!tour) {
        ctx.skip();
        return;
      }
      const adminSocket = await connectSocket(base, admin.token);
      sockets.push(adminSocket);
      const events = collect(adminSocket);

      const simulated = await call<{ id: string; simulation?: { running: boolean } }>(
        base,
        'simulateTour',
        [tour.id, { speedFactor: 20, autoComplete: true }],
        admin.token,
      );
      expect(simulated.id).toBe(tour.id);
      expect(simulated.simulation?.running).toBe(true);

      const pos = await waitFor(
        () => events.find((e) => e.type === 'driver.position' && e.driverId === tour.driverId),
        8000,
        'Fahrerposition',
      );
      expect(pos.type).toBe('driver.position');

      const stopped = await call<{ simulation?: { running: boolean } }>(base, 'stopSimulation', [tour.id], admin.token);
      expect(stopped.simulation?.running ?? false).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'speichert Änderungen und lädt sie nach einem Neustart (inkl. Sitzungen)',
    async () => {
      expect(annaOrder).toBeTruthy();
      await server.close();
      const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8')) as { orders: { id: string }[]; sessions: Record<string, string> };
      expect(saved.orders.some((o) => o.id === annaOrder.id)).toBe(true);
      expect(saved.sessions[anna.token]).toBe('u-anna');
      expect(fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);

      server = await startServer({ ...OFFLINE, dataFile, tickIntervalMs: 0 });
      base = server.url;
      expect(server.load.source).toBe('file');
      const again = await call<Order>(base, 'getOrder', [annaOrder.id], anna.token);
      expect(again.id).toBe(annaOrder.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'ersetzt eine beschädigte Datendatei durch frische Demo-Daten (mit Sicherung)',
    async () => {
      const file = path.join(tmpDir, 'kaputt.json');
      fs.writeFileSync(file, '{ das ist kein json');
      const s = await startServer({ ...OFFLINE, dataFile: file, tickIntervalMs: 0 });
      try {
        expect(s.load).toMatchObject({ source: 'seed', reason: 'corrupt' });
        expect(fs.readdirSync(tmpDir).some((f) => f.startsWith('kaputt.json.corrupt-'))).toBe(true);
        const products = await call<Product[]>(s.url, 'listProducts');
        expect(products.length).toBeGreaterThan(0);
      } finally {
        await s.close();
      }
    },
    TEST_TIMEOUT,
  );
});

describe('Produktion: statische Auslieferung', () => {
  let tmpDir: string;
  let server: RunningServer;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altinger-static-test-'));
    const dist = path.join(tmpDir, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Getränke Altinger</title><div id="root"></div>');
    fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("ok")');
    fs.writeFileSync(path.join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {})');
    fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), '{"name":"Getränke Altinger"}');
    server = await startServer({ ...OFFLINE, dataFile: path.join(tmpDir, 'db.json'), staticDir: dist, tickIntervalMs: 0 });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await server?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('liefert index.html für App-Routen (SPA-Fallback) ohne Cache', async () => {
    for (const route of ['/', '/fahrer/tour/t-1', '/bestellung/o-123', '/admin/live']) {
      const res = await fetch(`${server.url}${route}`);
      expect(res.status, route).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('Getränke Altinger');
    }
  });

  it('cached Assets lange, sw.js und Manifest nicht', async () => {
    const asset = await fetch(`${server.url}/assets/index-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const sw = await fetch(`${server.url}/sw.js`);
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    const manifest = await fetch(`${server.url}/manifest.webmanifest`);
    expect(manifest.headers.get('cache-control')).toBe('no-cache');
    expect(manifest.headers.get('content-type')).toMatch(/manifest\+json/);
  });

  it('fehlende Dateien und API-Pfade bekommen kein index.html', async () => {
    const missing = await fetch(`${server.url}/assets/fehlt-xyz.js`);
    expect(missing.status).toBe(404);
    const api = await fetch(`${server.url}/api/gibt-es-nicht`);
    expect(api.status).toBe(404);
    expect(((await api.json()) as { error: ApiErrorBody }).error.code).toBe('not_found');
    const health = await fetch(`${server.url}/api/health`);
    expect(health.status).toBe(200);
  });
});
