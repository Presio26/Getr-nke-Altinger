/**
 * Test-Helfer: Core mit fester Uhr, ohne Netzwerk (Luftlinien-Routing, PLZ-Geocoding).
 * Wird nur von den vitest-Dateien genutzt.
 */
import type { Api } from '../../api';
import type { Audience, CheckoutInput, RealtimeEvent, Session, TimeSlot } from '../../types';
import { createCore, createSeedDb, plzGeocoder, straightLineRouting, type Core, type Db, type RoutingProvider } from '../index';

/** Donnerstag, 08.10.2026, 13:20 Uhr in Garching (Sommerzeit) */
export const DEFAULT_NOW = new Date('2026-10-08T11:20:00.000Z');

export interface TestCore {
  core: Core;
  db: () => Db;
  now: () => Date;
  /** Uhr vorstellen (ms) */
  advance(ms: number): void;
  /** n Sekunden lang jede Sekunde tick() */
  tickSeconds(seconds: number, stepMs?: number): void;
  events: { event: RealtimeEvent; audience: Audience }[];
  persistCount: () => number;
  /** typisierter Client (wie im Frontend) */
  api(token?: string): Api;
  /** Anmeldung eines Demo-Nutzers → Client */
  as(userId: string): Promise<Api & { token: string }>;
}

export function createTestCore(options: { now?: Date; demoMode?: boolean; routing?: RoutingProvider; db?: Db } = {}): TestCore {
  let ms = (options.now ?? DEFAULT_NOW).getTime();
  const now = () => new Date(ms);
  const events: TestCore['events'] = [];
  let persisted = 0;
  const core = createCore({
    db: options.db ?? createSeedDb(now()),
    mode: 'local',
    emit: (event, audience) => events.push({ event, audience }),
    persist: () => {
      persisted++;
    },
    now,
    routing: options.routing ?? straightLineRouting(),
    geocoder: plzGeocoder(),
    demoMode: options.demoMode ?? true,
  });
  const api = (token?: string): Api =>
    new Proxy({} as Api, {
      // kein „then“, sonst hält await den Client für ein Promise
      get: (_t, method) =>
        typeof method !== 'string' || method === 'then' ? undefined : (...args: unknown[]) => core.call(method, core.ctx(token), args),
    });
  return {
    core,
    db: () => core.getDb(),
    now,
    advance: (d) => {
      ms += d;
    },
    tickSeconds(seconds, stepMs = 1000) {
      const steps = Math.round((seconds * 1000) / stepMs);
      for (let i = 0; i < steps; i++) {
        ms += stepMs;
        core.tick();
      }
    },
    events,
    persistCount: () => persisted,
    api,
    async as(userId: string) {
      // Anmeldung per E-Mail + Demo-Passwort (funktioniert auch ohne Demo-Modus)
      const email = core.getDb().users.find((u) => u.id === userId)?.email ?? userId;
      const session = (await core.call('login', core.ctx(), [email, 'demo'])) as Session;
      const client = api(session.token) as Api & { token: string };
      return new Proxy(client, {
        get: (target, prop) => (prop === 'token' ? session.token : (target as unknown as Record<string | symbol, unknown>)[prop]),
      }) as Api & { token: string };
    },
  };
}

/** erstes freies Zeitfenster */
export async function firstFreeSlot(api: Api, type: 'delivery' | 'pickup', minDaysAhead = 0): Promise<TimeSlot> {
  const slots = await api.listSlots({ type, days: 10 });
  const today = slots[0]?.date;
  const slot = slots.find((s) => s.available && (!minDaysAhead || (today && s.date > today)));
  if (!slot) throw new Error('kein freies Zeitfenster');
  return slot;
}

export function checkout(partial: Partial<CheckoutInput> & Pick<CheckoutInput, 'items'>): CheckoutInput {
  return {
    fulfillment: 'delivery',
    emptiesReturn: [],
    carryService: false,
    paymentMethod: 'cash',
    ...partial,
  };
}
