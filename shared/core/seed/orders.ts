/**
 * Demo-Bestellungen: Historie (~30 Tage, Stammkunden ~90 Tage), heutige Touren,
 * ungeplante Lieferungen für morgen, Click & Collect, Rechnungen, Abos, Benachrichtigungen.
 *
 * Alle Positionen und Summen werden über die echte calculateQuote-Logik berechnet.
 */
import type {
  AppNotification,
  Customer,
  DepositType,
  Driver,
  EmptiesLine,
  FulfillmentType,
  Invoice,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  StatusChange,
  StoreSettings,
  Subscription,
  Tour,
} from '../../types';
import { addDays, berlinDate, berlinParts, minutesOfDay, minutesToTime, timeToMinutes, weekdayOf } from '../../time';
import { formatDate, formatEuro, formatTime } from '../../format';
import { calculateQuote } from '../pricing';
import { slotIdOf, templatesForDay } from '../slots';
import { invoiceNumber, invoiceTotals } from '../invoices';
import { chance, int, pick, sample, weighted, type Rng } from './prng';
import { seedRoute, type SeedTourKey } from './routes';
import { ROUTE_KEYS } from './people';
import { randomPickupCode } from '../util';

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface SeedInput {
  now: Date;
  today: string;
  rng: Rng;
  settings: StoreSettings;
  products: Product[];
  depositTypes: DepositType[];
  customers: Customer[];
  drivers: Driver[];
}

export interface SeedOrdersResult {
  orders: Order[];
  tours: Tour[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  notifications: AppNotification[];
  lastOrderNumber: number;
  lastInvoiceSeq: number;
}

type Item = [productId: string, qty: number];

interface Spec {
  customerId: string;
  items: Item[];
  fulfillment: FulfillmentType;
  date: string;
  start: string;
  end: string;
  payment: PaymentMethod;
  createdAt: number;
  status: OrderStatus;
  /** Status-Zeitstempel aus dem Zeitfenster (Vergangenheit) statt gleichmäßig bis jetzt */
  historic: boolean;
  empties?: EmptiesLine[];
  /** Leergut automatisch aus dem laufenden Leergut-Konto */
  autoEmpties?: 'all' | 'random' | 'none';
  carry?: boolean;
  coupon?: string;
  notes?: string;
  reference?: string;
  costCenter?: string;
  eventDate?: string;
  subscriptionId?: string;
  driverId?: string;
  rating?: { stars: number; comment?: string };
  key?: string;
  tag?: string;
}

const RATING_COMMENTS: Record<number, string[]> = {
  5: ['Wie immer pünktlich – vielen Dank!', 'Sehr freundlicher Fahrer, Kästen bis in den Keller getragen.', 'Schnelle Lieferung, gerne wieder.', 'Alles bestens.', 'Leergut-Mitnahme klappt super.', 'Top Service aus Garching!'],
  4: ['Lieferung kam etwas später als angekündigt, sonst alles gut.', 'Gute Auswahl, gerne wieder.', 'Hat gut geklappt.'],
  3: ['Ein Kasten fehlte, wurde aber am nächsten Tag nachgeliefert.'],
};

const B2C_POOL: (readonly [string, number])[] = [
  ['augustiner-hell', 16], ['adelholzener-classic-075', 13], ['paulaner-spezi', 10], ['tegernseer-hell', 7], ['paulaner-weissbier', 7],
  ['adelholzener-naturell-075', 6], ['augustiner-edelstoff', 6], ['coca-cola-pet', 5], ['erdinger-alkoholfrei', 4], ['granini-orange', 4],
  ['weihenstephaner-hefe', 4], ['altmuehltaler-classic-07', 4], ['hacker-pschorr-hell', 3], ['spaten-hell', 3], ['loewenbraeu-original', 3],
  ['franziskaner-weissbier', 3], ['erdinger-weissbier', 3], ['paulaner-radler', 3], ['adelholzener-classic-pet', 3], ['st-leonhards-classic', 2],
  ['bionade-holunder', 2], ['fanta-pet', 2], ['coca-cola-zero-pet', 2], ['granini-multi', 2], ['adelholzener-apfelschorle', 3],
  ['andechser-hell', 2], ['ayinger-braeuweisse', 2], ['kondrauer-classic', 2], ['paulaner-weissbier-00', 2], ['hofbraeu-original', 2],
  ['augustiner-hell-6', 2], ['tegernseer-hell-6', 1], ['rotkaeppchen-trocken', 2], ['aperol', 2], ['silvaner-franken', 1],
  ['primitivo', 1], ['lugana', 1], ['riesling-mosel', 1], ['jaegermeister', 1], ['eiswuerfel-2kg', 1], ['hohes-c-orange', 1],
  ['paulaner-spezi-zero', 1], ['altmuehltaler-still-15', 1], ['club-mate', 1], ['red-bull-24', 1], ['granini-apfel', 1],
];

const GASTRO_POOL = ['augustiner-hell', 'augustiner-edelstoff', 'paulaner-weissbier', 'adelholzener-classic-075', 'adelholzener-naturell-075', 'paulaner-spezi', 'coca-cola-pet', 'fanta-pet', 'granini-orange', 'adelholzener-apfelschorle', 'paulaner-radler', 'erdinger-alkoholfrei', 'tegernseer-hell'];
const OFFICE_POOL = ['adelholzener-naturell-075', 'adelholzener-classic-075', 'club-mate', 'fritz-kola', 'adelholzener-apfelschorle', 'coca-cola-zero-pet', 'granini-orange', 'bionade-holunder'];
const CLUB_POOL = ['paulaner-hell', 'augustiner-hell', 'paulaner-spezi', 'altmuehltaler-classic-07', 'paulaner-radler', 'erdinger-alkoholfrei', 'coca-cola-pet', 'eiswuerfel-2kg'];
const SHOP_POOL = ['adelholzener-classic-075', 'paulaner-spezi', 'augustiner-hell', 'coca-cola-pet', 'granini-apfel'];

const CANCEL_REASONS = ['Termin passt nicht mehr', 'Versehentlich doppelt bestellt', 'Bestellung geändert – neue Bestellung folgt'];

/** Zeitpunkt (ms) eines Kalendertags + Uhrzeit */
const at = (day: string, time: string) => berlinDate(day, time).getTime();

function hhmm(minutes: number): string {
  return minutesToTime(Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes))));
}

const DELIVERY_CHAIN: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery', 'delivered'];
const PICKUP_CHAIN: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'picked_up'];

/** Statusfolge bis einschließlich `status` */
function statusChain(fulfillment: FulfillmentType, status: OrderStatus, rng: Rng): OrderStatus[] {
  if (status === 'cancelled') return chance(rng, 0.5) ? ['pending', 'cancelled'] : ['pending', 'confirmed', 'cancelled'];
  const full = fulfillment === 'delivery' ? DELIVERY_CHAIN : PICKUP_CHAIN;
  const idx = full.indexOf(status);
  return full.slice(0, idx < 0 ? 1 : idx + 1);
}

export function buildSeedOrders(input: SeedInput): SeedOrdersResult {
  const { now, today, rng, settings, depositTypes, customers, drivers } = input;
  const nowMs = now.getTime();
  const productsWithOffers = input.products;
  const productsNoOffers = input.products.map((p) => {
    const { offer: _offer, ...rest } = p;
    void _offer;
    return rest as Product;
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const returnable = new Map(depositTypes.filter((d) => d.returnable).map((d) => [d.id, d]));
  const balances = new Map<string, Record<string, number>>();
  const points = new Map<string, number>();
  const specs: Spec[] = [];

  const b2cPool = customers.filter((c) => c.type === 'b2c' && c.id !== 'c-anna');
  const b2bPool = customers.filter((c) => c.type === 'b2b' && c.b2b?.status === 'active' && c.id !== 'c-gasthaus' && c.id !== 'c-nordbyte');

  // ───────────────────────────── Warenkörbe ─────────────────────────────

  function b2cCart(): Item[] {
    const n = weighted(rng, [
      [1, 30],
      [2, 38],
      [3, 22],
      [4, 10],
    ] as const);
    const ids = new Set<string>();
    while (ids.size < n) ids.add(weighted(rng, B2C_POOL));
    return [...ids].map((id) => {
      const p = productsWithOffers.find((x) => x.id === id)!;
      const crate = p.unitCount >= 6 || p.categoryId === 'fass';
      return [id, crate ? weighted(rng, [[1, 70], [2, 25], [3, 5]] as const) : int(rng, 1, 3)];
    });
  }

  function b2bCart(c: Customer): Item[] {
    const seg = c.b2b?.segment;
    if (seg === 'buero') return sample(rng, OFFICE_POOL, int(rng, 3, 5)).map((id) => [id, int(rng, 2, 5)]);
    if (seg === 'verein') {
      const items: Item[] = sample(rng, CLUB_POOL, int(rng, 3, 5)).map((id) => [id, id === 'eiswuerfel-2kg' ? int(rng, 2, 6) : int(rng, 3, 10)]);
      if (chance(rng, 0.2)) items.push(['paulaner-hell-fass-30', 1]);
      return items;
    }
    if (seg === 'handel') return sample(rng, SHOP_POOL, int(rng, 2, 3)).map((id) => [id, int(rng, 2, 4)]);
    return sample(rng, GASTRO_POOL, int(rng, 4, 7)).map((id) => [id, int(rng, 3, 10)]);
  }

  function b2cPayment(fulfillment: FulfillmentType): PaymentMethod {
    if (fulfillment === 'pickup') return weighted(rng, [['cash', 40], ['ec', 40], ['paypal', 12], ['card', 8]] as const);
    return weighted(rng, [['cash', 30], ['ec', 30], ['paypal', 25], ['card', 15]] as const);
  }

  function randomSlot(day: string, type: FulfillmentType) {
    const list = templatesForDay(settings, type, day);
    return list.length ? pick(rng, list) : undefined;
  }

  /** Bestellzeitpunkt vor dem Fenster (tagsüber, vor Bestellschluss) */
  function orderedAt(day: string, start: string, type: FulfillmentType): number {
    const startMs = at(day, start);
    const lead = type === 'delivery' ? int(rng, 130, 26 * 60) : int(rng, 50, 22 * 60);
    let t = startMs - lead * MIN;
    const p = berlinParts(new Date(t));
    if (p.hour < 6) t -= (p.hour + 3) * HOUR + int(rng, 0, 90) * MIN; // nachts → Vorabend
    return Math.min(t, startMs - (type === 'delivery' ? 100 : 40) * MIN);
  }

  function rating(b2b: boolean): Spec['rating'] | undefined {
    if (!chance(rng, b2b ? 0.08 : 0.2)) return undefined;
    const stars = weighted(rng, [[5, 70], [4, 24], [3, 6]] as const);
    return chance(rng, 0.55) ? { stars, comment: pick(rng, RATING_COMMENTS[stars]) } : { stars };
  }

  // ───────────────────────────── Historie: zufällige Bestellungen (30 Tage) ─────────────────────────────

  for (let d = 30; d >= 1; d--) {
    const day = addDays(today, -d);
    const wd = weekdayOf(day);
    if (wd === 0) continue;
    const n = wd === 6 ? int(rng, 10, 14) : int(rng, 6, 11);
    for (let i = 0; i < n; i++) {
      const isB2B = chance(rng, 0.27) && b2bPool.length > 0;
      const customer = isB2B ? pick(rng, b2bPool) : pick(rng, b2cPool);
      const fulfillment: FulfillmentType = chance(rng, isB2B ? 0.9 : 0.62) ? 'delivery' : 'pickup';
      const t = randomSlot(day, fulfillment);
      if (!t) continue;
      const cancelled = chance(rng, 0.04);
      const spec: Spec = {
        customerId: customer.id,
        items: isB2B ? b2bCart(customer) : b2cCart(),
        fulfillment,
        date: day,
        start: t.start,
        end: t.end,
        payment: isB2B ? weighted(rng, [['ec', 50], ['cash', 30], ['paypal', 20]] as const) : b2cPayment(fulfillment),
        createdAt: orderedAt(day, t.start, fulfillment),
        status: cancelled ? 'cancelled' : fulfillment === 'delivery' ? 'delivered' : 'picked_up',
        historic: true,
        autoEmpties: isB2B ? 'all' : 'random',
      };
      if (cancelled && (spec.payment === 'paypal' || spec.payment === 'card')) spec.payment = 'ec';
      if (!isB2B && fulfillment === 'delivery' && chance(rng, 0.08)) spec.carry = true;
      if (!isB2B && chance(rng, 0.07)) spec.coupon = pick(rng, ['GARCHING', 'WILLKOMMEN10']);
      if (isB2B && customer.b2b?.costCenters.length && chance(rng, 0.6)) spec.costCenter = pick(rng, customer.b2b.costCenters);
      if (!isB2B && chance(rng, 0.02)) {
        spec.items.push(['bierzeltgarnitur', int(rng, 1, 4)], ['augustiner-hell-fass-30', 1], ['zapfanlage-1', 1]);
        spec.eventDate = day;
        spec.notes = 'Für unser Gartenfest';
      }
      if (!cancelled) {
        const r = rating(isB2B);
        if (r) spec.rating = r;
      }
      specs.push(spec);
    }
  }

  // ───────────────────────────── Anna: frühere Bestellungen + Abo ─────────────────────────────

  const lastThursday = (() => {
    let d = addDays(today, -1);
    while (weekdayOf(d) !== 4) d = addDays(d, -1);
    return d;
  })();
  const annaSubDates = [0, 1, 2, 3].map((k) => addDays(lastThursday, -14 * k));
  for (const day of annaSubDates) {
    specs.push({
      customerId: 'c-anna',
      items: [
        ['adelholzener-classic-075', 2],
        ['paulaner-spezi', 1],
      ],
      fulfillment: 'delivery',
      date: day,
      start: '18:00',
      end: '20:00',
      payment: 'cash',
      createdAt: at(addDays(day, -2), '06:30') + int(rng, 0, 30) * MIN,
      status: 'delivered',
      historic: true,
      autoEmpties: 'all',
      subscriptionId: 's-anna',
      notes: 'Abo „Wasser alle 2 Wochen“',
      key: `anna-sub-${day}`,
    });
  }
  const annaExtras: { offset: number; items: Item[]; payment: PaymentMethod; fulfillment: FulfillmentType; start: string; end: string; coupon?: string }[] = [
    { offset: 5, items: [['augustiner-hell', 2], ['granini-orange', 1]], payment: 'paypal', fulfillment: 'delivery', start: '16:00', end: '18:00' },
    { offset: 19, items: [['tegernseer-hell', 1], ['adelholzener-naturell-075', 1], ['bionade-holunder', 1]], payment: 'paypal', fulfillment: 'delivery', start: '10:00', end: '12:00' },
    { offset: 33, items: [['augustiner-hell', 1], ['aperol', 1], ['rotkaeppchen-trocken', 2], ['eiswuerfel-2kg', 1]], payment: 'ec', fulfillment: 'pickup', start: '17:00', end: '18:00' },
    { offset: 47, items: [['paulaner-weissbier', 1], ['granini-multi', 1], ['adelholzener-classic-075', 1]], payment: 'card', fulfillment: 'delivery', start: '18:00', end: '20:00', coupon: 'GARCHING' },
    { offset: 61, items: [['augustiner-hell', 2], ['paulaner-spezi', 1]], payment: 'paypal', fulfillment: 'delivery', start: '14:00', end: '16:00', coupon: 'WILLKOMMEN10' },
  ];
  for (const x of annaExtras) {
    let day = addDays(today, -x.offset);
    if (weekdayOf(day) === 0) day = addDays(day, -1);
    let { start, end } = x;
    if (weekdayOf(day) === 6 && timeToMinutes(start) >= 14 * 60) {
      // samstags nur bis 14 Uhr (Lieferung) bzw. 16 Uhr (Abholung)
      start = x.fulfillment === 'pickup' ? '11:00' : '10:00';
      end = '12:00';
    }
    specs.push({
      customerId: 'c-anna',
      items: x.items,
      fulfillment: x.fulfillment,
      date: day,
      start,
      end,
      payment: x.payment,
      createdAt: orderedAt(day, start, x.fulfillment),
      status: x.fulfillment === 'delivery' ? 'delivered' : 'picked_up',
      historic: true,
      autoEmpties: 'all',
      ...(x.coupon ? { coupon: x.coupon } : {}),
      key: `anna-extra-${x.offset}`,
    });
  }
  // die beiden jüngsten Anna-Bestellungen sind bewertet
  const annaSpecs = specs.filter((s) => s.customerId === 'c-anna').sort((a, b) => b.createdAt - a.createdAt);
  if (annaSpecs[0]) annaSpecs[0].rating = { stars: 5, comment: 'Super pünktlich und ein sehr freundlicher Fahrer – danke!' };
  if (annaSpecs[1]) annaSpecs[1].rating = { stars: 4, comment: 'Alles gut, kam kurz vor Ende des Zeitfensters.' };

  // ───────────────────────────── Stammkunden B2B (~13 Wochen) ─────────────────────────────

  const lastWeekday = (wd: number) => {
    let d = addDays(today, -1);
    while (weekdayOf(d) !== wd) d = addDays(d, -1);
    return d;
  };
  const isoWeek = (day: string) => {
    const [y, m, dd] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, dd));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  };
  const mondays = Array.from({ length: 13 }, (_, k) => addDays(lastWeekday(1), -7 * k));
  for (const day of mondays) {
    specs.push({
      customerId: 'c-gasthaus',
      items: [
        ['augustiner-hell', 10 + int(rng, -1, 2)],
        ['augustiner-edelstoff', 4],
        ['adelholzener-classic-075', 6],
        ['paulaner-spezi', 3],
      ],
      fulfillment: 'delivery',
      date: day,
      start: '08:00',
      end: '10:00',
      payment: 'invoice',
      createdAt: at(addDays(day, -3), '09:00') + int(rng, 0, 120) * MIN,
      status: 'delivered',
      historic: true,
      autoEmpties: 'all',
      subscriptionId: 's-gasthaus',
      costCenter: 'Schank',
      reference: `Dauerauftrag KW ${isoWeek(day)}`,
      key: `gasthaus-${day}`,
    });
  }
  const gasthausThursdays = Array.from({ length: 6 }, (_, k) => addDays(lastWeekday(4), -14 * k - 7));
  for (const day of gasthausThursdays) {
    specs.push({
      customerId: 'c-gasthaus',
      items: [
        ['paulaner-weissbier', int(rng, 2, 4)],
        ['augustiner-hell-fass-30', 1],
        ['adelholzener-naturell-075', 3],
        ['granini-orange', 2],
      ],
      fulfillment: 'delivery',
      date: day,
      start: '10:00',
      end: '12:00',
      payment: 'invoice',
      createdAt: at(addDays(day, -1), '15:00') + int(rng, 0, 180) * MIN,
      status: 'delivered',
      historic: true,
      autoEmpties: 'all',
      costCenter: pick(rng, ['Biergarten', 'Küche']),
      reference: `Nachbestellung KW ${isoWeek(day)}`,
    });
  }
  const tuesdays = Array.from({ length: 13 }, (_, k) => addDays(lastWeekday(2), -7 * k));
  for (const day of tuesdays) {
    specs.push({
      customerId: 'c-nordbyte',
      items: [
        ['adelholzener-naturell-075', 4],
        ['club-mate', 2],
        ['fritz-kola', 2],
        ['adelholzener-apfelschorle', 2],
      ],
      fulfillment: 'delivery',
      date: day,
      start: '10:00',
      end: '12:00',
      payment: 'invoice',
      createdAt: at(addDays(day, -4), '11:00') + int(rng, 0, 240) * MIN,
      status: 'delivered',
      historic: true,
      autoEmpties: 'all',
      subscriptionId: 's-nordbyte',
      costCenter: 'Office München-Nord',
      reference: `PO-${day.slice(0, 4)}-${String(80 + isoWeek(day)).padStart(3, '0')}`,
    });
  }
  // NordByte: Sommerfest/Event-Bestellung vor ~6 Wochen
  {
    let day = addDays(today, -40);
    while (weekdayOf(day) !== 5) day = addDays(day, -1);
    specs.push({
      customerId: 'c-nordbyte',
      items: [
        ['augustiner-hell', 6],
        ['paulaner-spezi', 4],
        ['erdinger-alkoholfrei', 2],
        ['adelholzener-classic-075', 4],
        ['eiswuerfel-2kg', 6],
      ],
      fulfillment: 'delivery',
      date: day,
      start: '14:00',
      end: '16:00',
      payment: 'invoice',
      createdAt: at(addDays(day, -5), '10:30'),
      status: 'delivered',
      historic: true,
      autoEmpties: 'none',
      costCenter: 'Events',
      reference: 'Team-Event Herbst',
      notes: 'Bitte in die Dachterrassen-Küche (3. OG) liefern',
    });
  }

  // ───────────────────────────── Heute: Touren ─────────────────────────────

  const nowMin = minutesOfDay(now);
  const p1 = Math.max(8, Math.min(18, Math.floor(nowMin / 60) + 1)) * 60;
  const p2 = Math.min(19 * 60, p1 + 60);
  const p3 = Math.min(19 * 60, p1 + 150);
  const windowOf = (m: number): [string, string] => {
    const start = Math.max(8 * 60, Math.min(18 * 60, 8 * 60 + Math.floor((m - 8 * 60) / 120) * 120));
    return [hhmm(start), hhmm(start + 120)];
  };
  /** Bestellzeitpunkt für heutige/offene Aufträge: vor jetzt, möglichst tagsüber */
  const openCreatedAt = (minHoursAgo: number, maxHoursAgo: number) => {
    let t = nowMs - (minHoursAgo + rng() * (maxHoursAgo - minHoursAgo)) * HOUR;
    const p = berlinParts(new Date(t));
    if (p.hour < 6) t -= (p.hour + 2) * HOUR;
    return Math.min(t, nowMs - 30 * MIN);
  };

  interface TourPlan {
    id: string;
    name: string;
    key: SeedTourKey;
    driverId: string;
    plannedStart: string;
    stops: { customerId: string; items: Item[]; payment: PaymentMethod; status: OrderStatus; carry?: boolean; notes?: string; costCenter?: string; reference?: string; empties?: EmptiesLine[] }[];
  }
  const tourPlans: TourPlan[] = [
    {
      id: 't-1',
      name: 'Tour 1 · Garching Mitte',
      key: 'tour1',
      driverId: 'd-toni',
      plannedStart: hhmm(p1),
      stops: [
        {
          customerId: 'c-anna',
          items: [['augustiner-hell', 2], ['adelholzener-classic-075', 1], ['paulaner-spezi', 1]],
          payment: 'paypal',
          status: 'ready',
          notes: 'Bitte im Hof abstellen, Leergut steht neben der Garage.',
          empties: [
            { depositTypeId: 'kasten-bier-20', qty: 2 },
            { depositTypeId: 'kasten-glas-12', qty: 1 },
          ],
        },
        { customerId: 'c-wagner', items: [['tegernseer-hell', 1], ['erdinger-alkoholfrei', 1], ['granini-orange', 1]], payment: 'cash', status: 'ready' },
        { customerId: 'c-hofmann', items: [['adelholzener-naturell-075', 2], ['bionade-holunder', 1]], payment: 'ec', status: 'ready', carry: true },
        {
          customerId: 'c-gasthaus',
          items: [['augustiner-hell', 6], ['paulaner-weissbier', 2], ['adelholzener-classic-075', 4], ['paulaner-spezi', 2], ['augustiner-hell-fass-30', 1]],
          payment: 'invoice',
          status: 'ready',
          costCenter: 'Biergarten',
          reference: 'Nachbestellung Wochenende',
          notes: 'Fass bitte direkt in den Kühlraum.',
        },
      ],
    },
    {
      id: 't-2',
      name: 'Tour 2 · Forschungszentrum & Eching',
      key: 'tour2',
      driverId: 'd-lukas',
      plannedStart: hhmm(p2),
      stops: [
        { customerId: 'c-campus', items: [['club-mate', 4], ['fritz-kola', 2], ['adelholzener-naturell-075', 6], ['bionade-holunder', 2]], payment: 'invoice', status: 'ready', costCenter: 'Café' },
        {
          customerId: 'c-nordbyte',
          items: [['adelholzener-naturell-075', 3], ['club-mate', 2], ['adelholzener-apfelschorle', 2], ['coca-cola-zero-pet', 1]],
          payment: 'invoice',
          status: 'ready',
          costCenter: 'Office München-Nord',
          reference: 'PO-Nachlieferung',
        },
        { customerId: 'c-bauer', items: [['paulaner-weissbier', 2], ['altmuehltaler-classic-07', 1], ['coca-cola-pet', 1]], payment: 'cash', status: 'picking' },
      ],
    },
    {
      id: 't-3',
      name: 'Tour 3 · Hochbrück & Ismaning',
      key: 'tour3',
      driverId: 'd-ayse',
      plannedStart: hhmm(p3),
      stops: [
        { customerId: 'c-schneider', items: [['augustiner-hell', 3], ['adelholzener-classic-pet', 2], ['fanta-pet', 1], ['coca-cola-pet', 1]], payment: 'ec', status: 'confirmed', notes: 'Kindergeburtstag – bitte bis 17 Uhr' },
        { customerId: 'c-klein', items: [['hacker-pschorr-hell', 1], ['kondrauer-classic', 1]], payment: 'cash', status: 'confirmed' },
        {
          customerId: 'c-fchochbrueck',
          items: [['paulaner-hell', 8], ['paulaner-spezi', 4], ['altmuehltaler-classic-07', 4], ['eiswuerfel-2kg', 5]],
          payment: 'cash',
          status: 'confirmed',
          costCenter: 'Vereinsheim',
          reference: 'Heimspiel Samstag',
        },
        { customerId: 'c-pizzeria', items: [['augustiner-hell', 3], ['adelholzener-classic-075', 4], ['coca-cola-pet', 2], ['primitivo', 6]], payment: 'ec', status: 'confirmed' },
        { customerId: 'c-wimmer', items: [['tegernseer-hell', 2], ['st-leonhards-classic', 1], ['granini-multi', 1]], payment: 'paypal', status: 'confirmed' },
      ],
    },
  ];
  for (const plan of tourPlans) {
    const [ws, we] = windowOf(timeToMinutes(plan.plannedStart));
    plan.stops.forEach((s, i) => {
      specs.push({
        customerId: s.customerId,
        items: s.items,
        fulfillment: 'delivery',
        date: today,
        start: ws,
        end: we,
        payment: s.payment,
        createdAt: openCreatedAt(3 + i * 0.7, 20),
        status: s.status,
        historic: false,
        ...(s.empties ? { empties: s.empties } : { autoEmpties: 'all' as const }),
        ...(s.carry ? { carry: true } : {}),
        ...(s.notes ? { notes: s.notes } : {}),
        ...(s.costCenter ? { costCenter: s.costCenter } : {}),
        ...(s.reference ? { reference: s.reference } : {}),
        driverId: plan.driverId,
        key: `${plan.id}-${i}`,
        tag: 'today-tour',
      });
    });
  }

  // ───────────────────────────── Morgen: ungeplante Lieferungen ─────────────────────────────

  let tomorrow = addDays(today, 1);
  while (!templatesForDay(settings, 'delivery', tomorrow).length) tomorrow = addDays(tomorrow, 1);
  const tWin = templatesForDay(settings, 'delivery', tomorrow);
  const early = tWin[Math.min(1, tWin.length - 1)];
  const late = tWin[Math.min(3, tWin.length - 1)];
  const tomorrowSpecs: { customerId: string; items: Item[]; slot: typeof early; status: OrderStatus; payment: PaymentMethod; notes?: string }[] = [
    { customerId: 'c-fischer', items: [['andechser-hell', 2], ['adelholzener-classic-075', 1]], slot: early, status: 'confirmed', payment: 'ec' },
    { customerId: 'c-koch', items: [['paulaner-weissbier', 1], ['adelholzener-classic-pet', 2]], slot: early, status: 'pending', payment: 'cash' },
    { customerId: 'c-wolf', items: [['augustiner-edelstoff', 2], ['coca-cola-pet', 1]], slot: early, status: 'confirmed', payment: 'paypal' },
    { customerId: 'c-richter', items: [['loewenbraeu-original', 2], ['club-mate', 1]], slot: late, status: 'pending', payment: 'ec', notes: 'Bitte vorher kurz anrufen.' },
    { customerId: 'c-lehmann', items: [['weihenstephaner-hefe', 2], ['adelholzener-classic-075', 1], ['granini-orange', 1]], slot: late, status: 'confirmed', payment: 'card' },
  ];
  tomorrowSpecs.forEach((s, i) => {
    specs.push({
      customerId: s.customerId,
      items: s.items,
      fulfillment: 'delivery',
      date: tomorrow,
      start: s.slot.start,
      end: s.slot.end,
      payment: s.payment,
      createdAt: openCreatedAt(0.6 + i * 0.4, 6 + i),
      status: s.status,
      historic: false,
      autoEmpties: 'all',
      ...(s.notes ? { notes: s.notes } : {}),
      key: `tomorrow-${s.customerId}`,
      tag: 'tomorrow',
    });
  });

  // ───────────────────────────── Heute: Click & Collect ─────────────────────────────

  const pickupTemplates = templatesForDay(settings, 'pickup', today);
  const pickupWindow = (offsetHours: number): [string, string] => {
    if (pickupTemplates.length) {
      const startMin = timeToMinutes(pickupTemplates[0].start);
      const lastMin = timeToMinutes(pickupTemplates[pickupTemplates.length - 1].start);
      const h = Math.max(startMin, Math.min(lastMin, (Math.floor(nowMin / 60) + offsetHours) * 60));
      return [hhmm(h), hhmm(h + 60)];
    }
    const h = (10 + offsetHours) * 60;
    return [hhmm(h), hhmm(h + 60)];
  };
  const pickups: { customerId: string; items: Item[]; status: OrderStatus; payment: PaymentMethod; offset: number; notes?: string }[] = [
    { customerId: 'c-k01', items: [['augustiner-hell', 2], ['eiswuerfel-2kg', 2], ['paulaner-spezi', 1]], status: 'ready', payment: 'cash', offset: 0 },
    { customerId: 'c-k02', items: [['aperol', 1], ['rotkaeppchen-trocken', 3], ['adelholzener-classic-075', 1]], status: 'picking', payment: 'ec', offset: 1 },
    { customerId: 'c-k03', items: [['paulaner-spezi', 3], ['fritz-kola', 1]], status: 'pending', payment: 'paypal', offset: 2, notes: 'Hole ich nach der Arbeit ab.' },
  ];
  pickups.forEach((p, i) => {
    const [start, end] = pickupWindow(p.offset);
    specs.push({
      customerId: p.customerId,
      items: p.items,
      fulfillment: 'pickup',
      date: today,
      start,
      end,
      payment: p.payment,
      createdAt: openCreatedAt(0.8 + i * 0.5, 4 + i),
      status: p.status,
      historic: false,
      autoEmpties: 'random',
      ...(p.notes ? { notes: p.notes } : {}),
      key: `pickup-${i}`,
      tag: 'today-pickup',
    });
  });

  // ───────────────────────────── Bestellungen erzeugen (chronologisch) ─────────────────────────────

  specs.sort((a, b) => Number(!a.historic) - Number(!b.historic) || a.createdAt - b.createdAt);
  const orders: Order[] = [];
  const byKey = new Map<string, Order>();
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const driverIds = drivers.map((d) => d.id);

  for (const spec of specs) {
    const customer = customerById.get(spec.customerId);
    if (!customer) continue;
    const balance = balances.get(customer.id) ?? {};
    let empties: EmptiesLine[] = spec.empties ?? [];
    if (!spec.empties && spec.autoEmpties !== 'none') {
      empties = Object.entries(balance)
        .filter(([id, q]) => q > 0 && returnable.has(id) && (spec.autoEmpties === 'all' || chance(rng, 0.8)))
        .map(([depositTypeId, qty]) => ({ depositTypeId, qty }));
    }
    const slotId = slotIdOf(spec.fulfillment, spec.date, spec.start, spec.end);
    const createdAt = new Date(spec.createdAt);
    const useOffers = spec.date >= addDays(today, -6);
    const quoteInput = {
      items: spec.items.map(([productId, qty]) => ({ productId, qty })),
      fulfillment: spec.fulfillment,
      ...(customer.defaultAddressId ? { addressId: customer.defaultAddressId } : {}),
      slotId,
      emptiesReturn: empties,
      carryService: !!spec.carry,
      paymentMethod: spec.payment,
      ...(spec.coupon ? { couponCode: spec.coupon } : {}),
      ...(spec.eventDate ? { eventDate: spec.eventDate } : {}),
    };
    const qc = {
      settings,
      products: useOffers ? productsWithOffers : productsNoOffers,
      depositTypes,
      customer,
      now: createdAt,
      skipStock: true,
      skipAvailability: true,
    };
    let quote = calculateQuote(quoteInput, qc);
    // Mindestbestellwert erreichen (Zufallswarenkörbe)
    for (let guard = 0; guard < 40 && quote.errors.some((e) => e.code === 'min_order'); guard++) {
      quoteInput.items[guard % quoteInput.items.length].qty += 1;
      quote = calculateQuote(quoteInput, qc);
    }
    if (quote.errors.length) {
      throw new Error(`Demo-Bestellung für ${customer.name} ungültig: ${quote.errors.map((e) => e.message).join(' / ')}`);
    }
    const startMs = at(spec.date, spec.start);
    const endMs = at(spec.date, spec.end);
    const chain = statusChain(spec.fulfillment, spec.status, rng);
    const driverId = spec.fulfillment === 'delivery' ? spec.driverId ?? (spec.historic && spec.status !== 'cancelled' ? pick(rng, driverIds) : undefined) : undefined;
    const driverFirst = driverId ? (driverName.get(driverId) ?? '').split(' ')[0] : '';
    const times: number[] = [];
    let prev = spec.createdAt;
    chain.forEach((st, i) => {
      let t: number;
      if (i === 0) t = spec.createdAt;
      else if (!spec.historic) {
        const remaining = chain.length - i;
        const span = Math.max(2 * MIN, nowMs - 2 * MIN - prev);
        t = st === 'confirmed' ? prev + Math.min(int(rng, 4, 20) * MIN, span / 2) : prev + span / (remaining + 1);
      } else {
        switch (st) {
          case 'confirmed':
            t = prev + int(rng, 4, 25) * MIN;
            break;
          case 'picking':
            t = startMs - (spec.fulfillment === 'delivery' ? int(rng, 80, 95) : int(rng, 25, 38)) * MIN;
            break;
          case 'ready':
            t = startMs - (spec.fulfillment === 'delivery' ? int(rng, 30, 45) : int(rng, 5, 18)) * MIN;
            break;
          case 'out_for_delivery':
            t = startMs - int(rng, 0, 15) * MIN;
            break;
          case 'delivered':
            t = startMs + int(rng, 12, Math.max(15, (endMs - startMs) / MIN - 8)) * MIN;
            break;
          case 'picked_up':
            t = startMs + int(rng, 5, 55) * MIN;
            break;
          case 'cancelled':
            t = prev + int(rng, 20, 240) * MIN;
            break;
          default:
            t = prev + MIN;
        }
      }
      t = Math.max(prev + (i === 0 ? 0 : MIN), Math.round(t / 1000) * 1000);
      times.push(t);
      prev = t;
    });
    const by = (st: OrderStatus): string => {
      if (st === 'pending') return spec.subscriptionId ? 'Abo' : 'Kunde';
      if (st === 'out_for_delivery' || st === 'delivered') return driverFirst ? `Fahrer ${driverFirst}` : 'Markt';
      if (st === 'cancelled') return 'Kunde';
      return 'Markt';
    };
    const history: StatusChange[] = chain.map((st, i) => {
      const c: StatusChange = { status: st, at: new Date(times[i]).toISOString(), by: by(st) };
      if (st === 'cancelled') c.note = pick(rng, CANCEL_REASONS);
      if (st === 'confirmed' && spec.subscriptionId) c.note = 'Abo automatisch eingeplant';
      return c;
    });
    const address = customer.addresses.find((a) => a.id === customer.defaultAddressId);
    const last = history[history.length - 1];
    const order: Order = {
      id: '',
      number: '',
      customerId: customer.id,
      customerType: customer.type,
      customerName: customer.name,
      createdAt: history[0].at,
      updatedAt: last.at,
      status: spec.status,
      statusHistory: history,
      fulfillment: spec.fulfillment,
      slot: { id: slotId, date: spec.date, start: spec.start, end: spec.end },
      lines: quote.lines,
      emptiesReturn: empties.map((l) => ({ ...l })),
      carryService: spec.fulfillment === 'delivery' && !!spec.carry,
      paymentMethod: spec.payment,
      paymentStatus: spec.payment === 'paypal' || spec.payment === 'card' ? 'paid' : 'open',
      totals: quote.totals,
    };
    if (customer.phone) order.customerPhone = customer.phone;
    if (spec.fulfillment === 'delivery' && address) order.address = { ...address };
    if (quote.coupon) order.couponCode = quote.coupon.code;
    if (spec.notes) order.notes = spec.notes;
    if (spec.reference) order.reference = spec.reference;
    if (spec.costCenter) order.costCenter = spec.costCenter;
    if (spec.eventDate) order.eventDate = spec.eventDate;
    if (spec.subscriptionId) order.subscriptionId = spec.subscriptionId;
    if (quote.loyaltyPointsEarned) order.loyaltyPointsEarned = quote.loyaltyPointsEarned;
    if (driverId && spec.status !== 'cancelled' && (spec.historic || spec.driverId)) order.driverId = driverId;
    if (spec.fulfillment === 'pickup') {
      order.pickupCode = randomPickupCode(rng);
      order.holdUntil = new Date(endMs + settings.pickupHoldHours * HOUR).toISOString();
    }
    const done = spec.status === 'delivered' || spec.status === 'picked_up';
    if (done) {
      order.paymentStatus = spec.payment === 'invoice' || spec.payment === 'sepa' ? 'open' : 'paid';
      if (spec.status === 'delivered') {
        order.arrivedAt = new Date(times[times.length - 1] - int(rng, 2, 6) * MIN).toISOString();
        order.proof = {
          at: last.at,
          receivedBy: customer.type === 'b2b' ? customer.contactName : address?.name ?? customer.name,
          emptiesCollected: empties.map((l) => ({ ...l })),
          ...(spec.payment === 'cash' || spec.payment === 'ec' ? { amountCollected: quote.totals.total } : {}),
        };
      }
      // Leergut-Konto und Treuepunkte fortschreiben
      const next = { ...balance };
      for (const l of quote.lines) if (l.depositTypeId && returnable.has(l.depositTypeId)) next[l.depositTypeId] = (next[l.depositTypeId] ?? 0) + l.qty;
      for (const l of empties) next[l.depositTypeId] = Math.max(0, (next[l.depositTypeId] ?? 0) - l.qty);
      for (const k of Object.keys(next)) if (!next[k]) delete next[k];
      balances.set(customer.id, next);
      if (customer.type === 'b2c') points.set(customer.id, (points.get(customer.id) ?? 0) + (quote.loyaltyPointsEarned ?? 0));
      if (spec.rating) {
        const ratedAt = times[times.length - 1] + int(rng, 1, 30) * HOUR;
        if (ratedAt < nowMs) order.rating = { ...spec.rating, at: new Date(ratedAt).toISOString() };
      }
    }
    orders.push(order);
    if (spec.key) byKey.set(spec.key, order);
  }

  // ───────────────────────────── Nummern & IDs ─────────────────────────────

  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let seq = 24816;
  for (const o of orders) {
    seq += 1;
    o.number = `AL-${seq}`;
    o.id = `o-${seq}`;
  }

  // ───────────────────────────── Touren ─────────────────────────────

  const tours: Tour[] = tourPlans.map((plan) => {
    const legs = seedRoute(plan.key);
    const stops = plan.stops.map((_, i) => byKey.get(`${plan.id}-${i}`)!);
    let t = Math.max(at(today, plan.plannedStart), nowMs);
    const tour: Tour = {
      id: plan.id,
      name: plan.name,
      date: today,
      driverId: plan.driverId,
      status: 'planned',
      stops: stops.map((o, i) => {
        t += (legs[i]?.duration ?? 0) * 1000;
        const eta = new Date(Math.round(t / 1000) * 1000).toISOString();
        t += 4 * MIN;
        o.eta = eta;
        o.tourId = plan.id;
        o.driverId = plan.driverId;
        return { orderId: o.id, status: 'pending', eta };
      }),
      route: {
        legs: legs.map((l) => ({ coords: l.coords, distance: l.distance, duration: l.duration })),
        distance: legs.reduce((s, l) => s + l.distance, 0),
        duration: legs.reduce((s, l) => s + l.duration, 0),
      },
      currentStopIndex: 0,
      plannedStart: plan.plannedStart,
    };
    // Plausibilität: Routenabschnitt i endet beim Kunden von Stopp i
    legs.forEach((l, i) => {
      if (i < stops.length && ROUTE_KEYS[l.to] !== stops[i].customerId) {
        throw new Error(`routes.json passt nicht zu ${plan.id}: ${l.to} ≠ ${stops[i].customerId}`);
      }
    });
    return tour;
  });

  // ───────────────────────────── Rechnungen ─────────────────────────────

  const invoices: Invoice[] = [];
  const invoicePlan: { customerId: string; dates: number[]; paid: number }[] = [
    { customerId: 'c-gasthaus', dates: [-82, -64, -46, -28, -12, -5], paid: 3 },
    { customerId: 'c-nordbyte', dates: [-62, -32, -2], paid: 2 },
  ];
  const drafts: { customerId: string; date: string; orders: Order[]; paid: boolean }[] = [];
  for (const plan of invoicePlan) {
    const customer = customerById.get(plan.customerId)!;
    const billable = orders.filter(
      (o) => o.customerId === customer.id && o.status === 'delivered' && (o.paymentMethod === 'invoice' || o.paymentMethod === 'sepa'),
    );
    let from = '0000-00-00';
    plan.dates.forEach((offset, j) => {
      const date = addDays(today, offset);
      const covered = billable.filter((o) => o.slot.date >= from && o.slot.date < date);
      from = date;
      if (covered.length) drafts.push({ customerId: customer.id, date, orders: covered, paid: j < plan.paid });
    });
  }
  drafts.sort((a, b) => a.date.localeCompare(b.date) || a.customerId.localeCompare(b.customerId));
  let invSeq = 120;
  for (const d of drafts) {
    const customer = customerById.get(d.customerId)!;
    invSeq += 1;
    const terms = customer.b2b?.paymentTermsDays ?? 14;
    const dueDate = addDays(d.date, terms);
    const inv: Invoice = {
      id: `inv-${invSeq}`,
      number: invoiceNumber(d.date.slice(0, 4), invSeq),
      customerId: customer.id,
      customerName: customer.name,
      orderIds: d.orders.map((o) => o.id),
      date: d.date,
      dueDate,
      ...invoiceTotals(d.orders),
      status: d.paid ? 'paid' : 'open',
    };
    if (d.paid) inv.paidAt = berlinDate(addDays(dueDate, -int(rng, 1, 5)), '10:15').toISOString();
    for (const o of d.orders) {
      o.invoiceId = inv.id;
      o.paymentStatus = d.paid ? 'paid' : 'invoiced';
    }
    invoices.push(inv);
  }

  // ───────────────────────────── Kundenkonten fortschreiben ─────────────────────────────

  for (const c of customers) {
    c.depositBalance = { ...(balances.get(c.id) ?? {}) };
    c.loyaltyPoints = c.type === 'b2c' ? points.get(c.id) ?? 0 : 0;
  }
  const anna = customerById.get('c-anna');
  if (anna) {
    anna.loyaltyPoints = 1240;
    anna.depositBalance = { 'kasten-bier-20': 2, 'kasten-glas-12': 1 };
  }

  // ───────────────────────────── Abos ─────────────────────────────

  const lastOf = (subId: string) =>
    orders
      .filter((o) => o.subscriptionId === subId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;
  const nextOn = (wd: number) => {
    let d = addDays(today, 1);
    while (weekdayOf(d) !== wd) d = addDays(d, 1);
    return d;
  };
  const subscriptions: Subscription[] = [
    {
      id: 's-anna',
      customerId: 'c-anna',
      name: 'Wasser alle 2 Wochen',
      items: [
        { productId: 'adelholzener-classic-075', qty: 2 },
        { productId: 'paulaner-spezi', qty: 1 },
      ],
      interval: 'biweekly',
      weekday: 4,
      slotStart: '18:00',
      addressId: 'a-anna',
      paymentMethod: 'cash',
      active: true,
      nextDate: addDays(lastThursday, 14),
      autoEmptiesReturn: true,
      createdAt: berlinDate(addDays(today, -75), '19:12').toISOString(),
    },
    {
      id: 's-gasthaus',
      customerId: 'c-gasthaus',
      name: 'Wochenbestellung Montag',
      items: [
        { productId: 'augustiner-hell', qty: 10 },
        { productId: 'augustiner-edelstoff', qty: 4 },
        { productId: 'adelholzener-classic-075', qty: 6 },
        { productId: 'paulaner-spezi', qty: 3 },
      ],
      interval: 'weekly',
      weekday: 1,
      slotStart: '08:00',
      addressId: 'a-gasthaus',
      paymentMethod: 'invoice',
      active: true,
      nextDate: nextOn(1),
      autoEmptiesReturn: true,
      createdAt: berlinDate(addDays(today, -400), '10:00').toISOString(),
    },
    {
      id: 's-nordbyte',
      customerId: 'c-nordbyte',
      name: 'Büro-Getränke',
      items: [
        { productId: 'adelholzener-naturell-075', qty: 4 },
        { productId: 'club-mate', qty: 2 },
        { productId: 'fritz-kola', qty: 2 },
        { productId: 'adelholzener-apfelschorle', qty: 2 },
      ],
      interval: 'weekly',
      weekday: 2,
      slotStart: '10:00',
      addressId: 'a-nordbyte',
      paymentMethod: 'invoice',
      active: true,
      nextDate: nextOn(2),
      autoEmptiesReturn: true,
      createdAt: berlinDate(addDays(today, -200), '11:30').toISOString(),
    },
  ];
  for (const s of subscriptions) {
    const lastId = lastOf(s.id);
    if (lastId) s.lastOrderId = lastId;
  }

  // ───────────────────────────── Benachrichtigungen ─────────────────────────────

  const notifications: AppNotification[] = [];
  const note = (n: Omit<AppNotification, 'id' | 'createdAt'> & { at: number }) => {
    const { at: when, ...rest } = n;
    notifications.push({ id: `n-s${notifications.length + 1}`, createdAt: new Date(Math.min(when, nowMs)).toISOString(), ...rest });
  };
  const slotLabel = (o: Order) => `${formatDate(o.slot.date, 'medium')} · ${o.slot.start}–${o.slot.end} Uhr`;
  for (const o of orders.filter((x) => x.status === 'pending')) {
    note({
      recipient: 'admin',
      title: 'Neue Bestellung',
      body: `${o.number} · ${o.customerName} · ${formatEuro(o.totals.total)} · ${o.fulfillment === 'delivery' ? 'Lieferung' : 'Abholung'} ${slotLabel(o)}`,
      read: false,
      kind: 'order',
      link: `/admin/bestellungen/${o.id}`,
      at: Date.parse(o.createdAt),
    });
  }
  input.products
    .filter((p) => !p.isRental && p.stock < p.minStock)
    .forEach((p, i) =>
      note({
        recipient: 'admin',
        title: 'Meldebestand unterschritten',
        body: `${p.brand} ${p.name} (${p.packaging}): noch ${p.stock} auf Lager, Meldebestand ${p.minStock}.`,
        read: i > 0,
        kind: 'stock',
        link: `/admin/sortiment/${p.id}`,
        at: nowMs - (3 + i * 5) * HOUR,
      }),
    );
  const pendingB2B = customers.find((c) => c.b2b?.status === 'pending');
  if (pendingB2B) {
    note({
      recipient: 'admin',
      title: 'Neuer Geschäftskunden-Antrag',
      body: `${pendingB2B.name} möchte als Geschäftskunde bestellen – bitte Konditionen prüfen und freischalten.`,
      read: false,
      kind: 'system',
      link: `/admin/kunden/${pendingB2B.id}`,
      at: nowMs - 26 * HOUR,
    });
  }
  const annaRated = orders.filter((o) => o.customerId === 'c-anna' && o.rating).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (annaRated?.rating) {
    note({
      recipient: 'admin',
      title: `Neue Bewertung: ${'★'.repeat(annaRated.rating.stars)}${'☆'.repeat(5 - annaRated.rating.stars)}`,
      body: `${annaRated.customerName} zu ${annaRated.number}${annaRated.rating.comment ? `: „${annaRated.rating.comment}“` : ''}`,
      read: true,
      kind: 'order',
      link: `/admin/bestellungen/${annaRated.id}`,
      at: Date.parse(annaRated.rating.at),
    });
  }
  const annaToday = byKey.get('t-1-0');
  const annaLastDone = orders
    .filter((o) => o.customerId === 'c-anna' && (o.status === 'delivered' || o.status === 'picked_up'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (annaLastDone) {
    note({
      recipient: 'u-anna',
      title: 'Bestellung zugestellt',
      body: `Ihre Bestellung ${annaLastDone.number} wurde zugestellt. Vielen Dank für Ihren Einkauf!${annaLastDone.loyaltyPointsEarned ? ` Sie haben ${annaLastDone.loyaltyPointsEarned} Treuepunkte gesammelt.` : ''}`,
      read: true,
      kind: 'delivery',
      link: `/bestellung/${annaLastDone.id}`,
      at: Date.parse(annaLastDone.updatedAt),
    });
  }
  const offerProduct = input.products.find((p) => p.id === 'augustiner-hell');
  if (offerProduct?.offer) {
    note({
      recipient: 'u-anna',
      title: 'Angebot der Woche',
      body: `${offerProduct.brand} ${offerProduct.name} (${offerProduct.packaging}) jetzt für ${formatEuro(offerProduct.offer.priceGross)} – gültig bis ${formatDate(offerProduct.offer.validUntil, 'medium')}`,
      read: false,
      kind: 'promo',
      link: `/produkt/${offerProduct.id}`,
      at: nowMs - 20 * HOUR,
    });
  }
  if (annaToday) {
    note({
      recipient: 'u-anna',
      title: 'Ihre Bestellung ist verladen',
      body: `Ihre Bestellung ${annaToday.number} ist verladen und kommt ${slotLabel(annaToday)}${annaToday.eta ? ` – voraussichtlich gegen ${formatTime(annaToday.eta)} Uhr` : ''}.`,
      read: false,
      kind: 'delivery',
      link: `/bestellung/${annaToday.id}`,
      at: Date.parse(annaToday.updatedAt),
    });
  }
  const latestInvoice = (customerId: string) => invoices.filter((i) => i.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date))[0];
  for (const [userId, customerId] of [
    ['u-gasthaus', 'c-gasthaus'],
    ['u-nordbyte', 'c-nordbyte'],
  ] as const) {
    const inv = latestInvoice(customerId);
    if (!inv) continue;
    note({
      recipient: userId,
      title: `Neue Rechnung ${inv.number}`,
      body: `${inv.orderIds.length} Lieferung${inv.orderIds.length === 1 ? '' : 'en'}, ${formatEuro(inv.gross)} – zahlbar bis ${formatDate(inv.dueDate, 'short')}.`,
      read: false,
      kind: 'invoice',
      link: `/business/rechnungen/${inv.id}`,
      at: berlinDate(inv.date, '07:45').getTime(),
    });
  }
  const overdue = invoices.find((i) => i.status !== 'paid' && i.dueDate < today);
  if (overdue) {
    const userId = overdue.customerId === 'c-gasthaus' ? 'u-gasthaus' : 'u-nordbyte';
    note({
      recipient: userId,
      title: 'Zahlungserinnerung',
      body: `Die Rechnung ${overdue.number} über ${formatEuro(overdue.gross)} war am ${formatDate(overdue.dueDate, 'short')} fällig. Bitte überweisen Sie den Betrag in den nächsten Tagen.`,
      read: false,
      kind: 'invoice',
      link: `/business/rechnungen/${overdue.id}`,
      at: berlinDate(addDays(overdue.dueDate, 3), '08:00').getTime(),
    });
  }
  note({
    recipient: 'drivers',
    title: 'Tourenplan für heute steht',
    body: `${tours.length} Touren mit ${tours.reduce((s, t) => s + t.stops.length, 0)} Stopps sind geplant. Gute Fahrt!`,
    read: false,
    kind: 'system',
    link: '/fahrer',
    at: nowMs - 2 * HOUR,
  });
  for (const tour of tours) {
    const user = { 'd-toni': 'u-toni', 'd-lukas': 'u-lukas', 'd-ayse': 'u-ayse' }[tour.driverId];
    if (!user) continue;
    note({
      recipient: user,
      title: `${tour.name}`,
      body: `${tour.stops.length} Stopps · geplanter Start ${tour.plannedStart} Uhr. Bitte Ladeliste prüfen.`,
      read: false,
      kind: 'delivery',
      link: `/fahrer/tour/${tour.id}`,
      at: nowMs - 90 * MIN,
    });
  }
  notifications.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { orders, tours, invoices, subscriptions, notifications, lastOrderNumber: seq, lastInvoiceSeq: invSeq };
}
