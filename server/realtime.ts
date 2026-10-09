/**
 * Echtzeit-Verteilung über socket.io.
 *
 * Jeder Client landet beim Verbinden (Handshake `auth: { token }`) bzw. nach der Nachricht
 * `auth` ({ token }) in Räumen, die sich aus seiner Rolle ergeben:
 *   'all' (jeder, auch Gäste) · 'admin' · 'drivers' + 'driver:<driverId>' ·
 *   'customer:<customerId>' · 'user:<userId>'
 * Der Core meldet Ereignisse mit einer `Audience`; daraus werden die Zielräume abgeleitet.
 * socket.io stellt jedes Ereignis pro Socket nur einmal zu, auch wenn er in mehreren Zielräumen ist.
 */
import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import type { Audience, RealtimeEvent, User } from '../shared/types';

/** Name des Socket-Ereignisses für alle Echtzeit-Nachrichten */
export const RT_EVENT = 'rt';

export const ROOM_ALL = 'all';
export const ROOM_ADMIN = 'admin';
export const ROOM_DRIVERS = 'drivers';
export const driverRoom = (driverId: string) => `driver:${driverId}`;
export const customerRoom = (customerId: string) => `customer:${customerId}`;
export const userRoom = (userId: string) => `user:${userId}`;

/** Räume, in die ein (ggf. anonymer) Nutzer gehört. */
export function roomsForUser(user: User | null): string[] {
  const rooms = [ROOM_ALL];
  if (!user) return rooms;
  rooms.push(userRoom(user.id));
  switch (user.role) {
    case 'admin':
      rooms.push(ROOM_ADMIN);
      break;
    case 'driver':
      rooms.push(ROOM_DRIVERS);
      if (user.driverId) rooms.push(driverRoom(user.driverId));
      break;
    case 'customer':
    case 'business':
      if (user.customerId) rooms.push(customerRoom(user.customerId));
      break;
  }
  return rooms;
}

/** Zielräume einer Audience (leere/undefinierte IDs werden ignoriert). */
export function roomsForAudience(audience: Audience): string[] {
  if (audience.all) return [ROOM_ALL];
  const rooms = new Set<string>();
  if (audience.admin) rooms.add(ROOM_ADMIN);
  if (audience.drivers) rooms.add(ROOM_DRIVERS);
  for (const id of audience.customerIds ?? []) if (id) rooms.add(customerRoom(id));
  for (const id of audience.driverIds ?? []) if (id) rooms.add(driverRoom(id));
  for (const id of audience.userIds ?? []) if (id) rooms.add(userRoom(id));
  return [...rooms];
}

export interface RealtimeOptions {
  /** Token → Nutzer (wird bei jedem Verbinden/`auth` neu ausgewertet) */
  resolveUser: (token: string | null) => User | null;
  /** CORS-Origins für den Handshake; true = alle */
  corsOrigin?: boolean | string[];
  log?: boolean;
}

export interface Realtime {
  io: IOServer;
  /** Ereignis an die Zielgruppe senden */
  emit(event: RealtimeEvent, audience: Audience): void;
  /** Räume aller verbundenen Sockets neu berechnen (z. B. nach Demo-Reset) */
  refreshAll(): void;
  /** Anzahl verbundener Clients */
  clientCount(): number;
  close(): Promise<void>;
}

interface SocketData {
  token: string | null;
  userId: string | null;
}

type AuthAck = (response: { ok: boolean; userId: string | null; role: string | null }) => void;

function readToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.toLowerCase().startsWith('bearer ') ? t.slice(7).trim() || null : t;
}

export function createRealtime(httpServer: HttpServer, options: RealtimeOptions): Realtime {
  const io = new IOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: options.corsOrigin ?? true, methods: ['GET', 'POST'] },
    // kürzere Heartbeats: tote Verbindungen (z. B. iPhone im Hintergrund) werden schneller erkannt
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Unterschrift/Foto laufen über HTTP-RPC; Socket-Nachrichten sind klein
    maxHttpBufferSize: 1e6,
    serveClient: false,
  });

  function applyRooms(socket: Socket, token: string | null): User | null {
    const data = socket.data as Partial<SocketData>;
    let user: User | null = null;
    try {
      user = options.resolveUser(token);
    } catch (err) {
      console.error('[realtime] Token-Prüfung fehlgeschlagen:', err);
    }
    const target = new Set(roomsForUser(user));
    for (const room of socket.rooms) {
      if (room !== socket.id && !target.has(room)) socket.leave(room);
    }
    socket.join([...target]);
    data.token = token;
    data.userId = user?.id ?? null;
    return user;
  }

  io.on('connection', (socket) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const user = applyRooms(socket, readToken(auth?.token));
    if (options.log) console.log(`[realtime] verbunden: ${socket.id} (${user ? `${user.role} ${user.id}` : 'Gast'})`);

    socket.on('auth', (payload: unknown, ack?: unknown) => {
      const token = readToken((payload as { token?: unknown } | null | undefined)?.token);
      const u = applyRooms(socket, token);
      if (typeof ack === 'function') (ack as AuthAck)({ ok: true, userId: u?.id ?? null, role: u?.role ?? null });
    });

    if (options.log) {
      socket.on('disconnect', (reason) => console.log(`[realtime] getrennt: ${socket.id} (${reason})`));
    }
  });

  function refreshAll(): void {
    for (const socket of io.of('/').sockets.values()) {
      applyRooms(socket, (socket.data as Partial<SocketData>).token ?? null);
    }
  }

  function emit(event: RealtimeEvent, audience: Audience): void {
    const rooms = roomsForAudience(audience);
    if (rooms.length) io.to(rooms).emit(RT_EVENT, event);
    // Nach einem Demo-Reset sind Sitzungen evtl. ungültig → Räume aller Clients neu berechnen
    if (event.type === 'data.reset') setTimeout(refreshAll, 0);
  }

  return {
    io,
    emit,
    refreshAll,
    clientCount: () => io.of('/').sockets.size,
    close: () =>
      new Promise<void>((resolve) => {
        io.disconnectSockets(true);
        // schließt auch den zugrunde liegenden HTTP-Server
        io.close(() => resolve());
      }),
  };
}
