/**
 * Gemeinsame Bausteine für die Demo-Journeys (e2e/*.spec.ts außer smoke).
 *
 * - Vor jedem Test wird der Datenstand per RPC `resetDemo` auf den Demo-Stand zurückgesetzt (Auto-Fixture).
 * - `openAs(userId, gerät)` öffnet einen eigenen Browser-Kontext (iPhone 390 × 844 mit Touch oder Desktop 1440 × 900)
 *   und meldet ihn über den QR-Link `/demo?als=<userId>` an – wie bei der Vorführung.
 * - `api` spricht direkt mit dem Server (POST /api/rpc/<methode>) – für Vorbereitung und Prüfungen.
 * - Ungefangene Ausnahmen (pageerror) in irgendeinem Tab lassen den Test am Ende scheitern.
 */
import { test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { Order, Session, TourWithOrders } from '../shared/types';

export { expect };

export type Device = 'iphone' | 'desktop';

export const IPHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
} as const;

export const DESKTOP = {
  viewport: { width: 1440, height: 900 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
} as const;

/** Startseite je Rolle nach dem QR-Login */
const HOME: Record<string, string> = {
  'u-anna': '/',
  'u-gasthaus': '/business',
  'u-nordbyte': '/business',
  'u-toni': '/fahrer',
  'u-lukas': '/fahrer',
  'u-ayse': '/fahrer',
  'u-admin': '/admin',
};

export class Rpc {
  private tokens = new Map<string, string>();
  constructor(private readonly request: APIRequestContext) {}

  async call<T = unknown>(method: string, args: unknown[] = [], token?: string): Promise<T> {
    const res = await this.request.post(`/api/rpc/${method}`, {
      data: { args },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = (await res.json().catch(() => null)) as { result?: T; error?: { message: string } } | null;
    if (!res.ok() || !body || body.error) {
      throw new Error(`RPC ${method} fehlgeschlagen (${res.status()}): ${body?.error?.message ?? 'ohne Antwort'}`);
    }
    return body.result as T;
  }

  /** Token für einen Demo-Nutzer (eigene Sitzung, unabhängig von den Browser-Tabs) */
  async token(userId: string): Promise<string> {
    const known = this.tokens.get(userId);
    if (known) return known;
    const session = await this.call<Session>('demoLogin', [userId]);
    this.tokens.set(userId, session.token);
    return session.token;
  }

  async as<T = unknown>(userId: string, method: string, args: unknown[] = []): Promise<T> {
    return this.call<T>(method, args, await this.token(userId));
  }

  resetDemo(): Promise<void> {
    return this.call('resetDemo');
  }

  order(orderId: string): Promise<Order> {
    return this.as<Order>('u-admin', 'getOrder', [orderId]);
  }

  /** Tour mit Aufträgen (über den Fahrer – unabhängig vom Kalendertag) */
  async driverTour(driverUserId: string, tourId: string): Promise<TourWithOrders> {
    const today = await this.as<{ tours: TourWithOrders[] }>(driverUserId, 'getDriverToday');
    const tour = today.tours.find((t) => t.id === tourId);
    if (!tour) throw new Error(`Tour ${tourId} nicht gefunden`);
    return tour;
  }

  /** Bestellung per Nummer (AL-…) über die Marktsicht */
  async orderByNumber(number: string): Promise<Order> {
    const orders = await this.as<Order[]>('u-admin', 'adminListOrders', [{ q: number }]);
    const order = orders.find((o) => o.number === number);
    if (!order) throw new Error(`Bestellung ${number} nicht gefunden`);
    return order;
  }
}

interface Fixtures {
  api: Rpc;
  /** setzt den Datenstand vor jedem Test zurück (automatisch) */
  resetData: void;
  /** neuer, angemeldeter Browser-Kontext; `path` wird nach der Anmeldung geöffnet */
  openAs: (userId: string, device?: Device, path?: string) => Promise<Page>;
  /** sammelt pageerror-Ereignisse aller geöffneten Seiten */
  pageErrors: string[];
}

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new Rpc(request));
  },

  resetData: [
    async ({ api }, use) => {
      await api.resetDemo();
      await use();
    },
    { auto: true },
  ],

  pageErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
    expect(errors, `Ungefangene Fehler im Browser:\n${errors.join('\n')}`).toEqual([]);
  },

  openAs: async ({ browser, baseURL, pageErrors }, use) => {
    const contexts: BrowserContext[] = [];
    const open = async (userId: string, device: Device = 'desktop', path?: string) => {
      const context = await newContext(browser, baseURL, device);
      contexts.push(context);
      const page = await context.newPage();
      watch(page, pageErrors, userId);
      await loginAs(page, userId);
      if (path) await page.goto(path);
      return page;
    };
    await use(open);
    for (const c of contexts) await c.close();
  },
});

export async function newContext(browser: Browser, baseURL: string | undefined, device: Device): Promise<BrowserContext> {
  return browser.newContext({
    ...(device === 'iphone' ? IPHONE : DESKTOP),
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // keine Standort-/Benachrichtigungs-Dialoge
    permissions: [],
  });
}

export function watch(page: Page, errors: string[], label: string) {
  page.on('pageerror', (err) => errors.push(`[${label}] ${err.message}`));
}

/** QR-Login wie bei der Vorführung: /demo?als=<userId> → Startseite der Rolle */
export async function loginAs(page: Page, userId: string) {
  await page.goto(`/demo?als=${userId}`);
  const home = HOME[userId] ?? '/';
  await expect(page).toHaveURL((url) => url.pathname === home, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('altinger.token'))).toBeTruthy();
}

/** Kopfbereich der Seite (Titel + Status-Badge) */
export function pageHeader(page: Page): Locator {
  return page.locator('main header').filter({ has: page.getByRole('heading', { level: 1 }) });
}

/** Bestellnummer (AL-…) aus der Überschrift „Bestellung AL-…“ */
export async function orderNumberFromHeading(page: Page): Promise<string> {
  const heading = page.getByRole('heading', { level: 1, name: /^Bestellung AL-\d+/ });
  await expect(heading).toBeVisible();
  const text = (await heading.textContent()) ?? '';
  const match = /AL-\d+/.exec(text);
  if (!match) throw new Error(`Keine Bestellnummer in „${text}“`);
  return match[0];
}

/** Bestell-ID aus der Adresse /bestellung/<id> */
export function orderIdFromUrl(page: Page): string {
  const match = /\/bestellung\/([^/?#]+)/.exec(page.url());
  if (!match) throw new Error(`Keine Bestell-ID in ${page.url()}`);
  return match[1];
}

/** Euro-Betrag „1.234,56 €“ / „−9,50 €“ → Cent */
export function parseEuro(text: string): number {
  const m = /([−-])?\s*([\d.]+),(\d{2})\s*€/.exec(text.replace(/ /g, ' '));
  if (!m) throw new Error(`Kein Euro-Betrag in „${text}“`);
  const cents = Number(m[2].replace(/\./g, '')) * 100 + Number(m[3]);
  return m[1] ? -cents : cents;
}

/**
 * Kasse: erstes freies Zeitfenster wählen – unabhängig von der Uhrzeit (ggf. erst am nächsten Tag).
 * Tage mit „… frei“ stehen in der Tag-Auswahl; im Tag ist das erste nicht deaktivierte Fenster das nächste.
 */
export async function chooseFirstFreeSlot(page: Page): Promise<string> {
  const days = page.getByRole('tablist', { name: 'Tag wählen' }).getByRole('tab').filter({ hasText: /\d+ frei/ });
  await expect(days.first()).toBeVisible();
  await days.first().click();
  const slots = page.getByRole('radiogroup', { name: /^Zeitfenster am/ }).locator('[role="radio"]:not([disabled])');
  await expect(slots.first()).toBeVisible();
  await slots.first().click();
  await expect(slots.first()).toBeChecked();
  return ((await slots.first().textContent()) ?? '').trim();
}

/**
 * Auswahl in RadioCards (verstecktes <input type="radio"> im <label>) oder in eigenen role="radio"-Knöpfen treffen.
 * Bei RadioCards fängt das Label den Klick ab – deshalb ohne Sichtbarkeitsprüfung des Inputs anklicken.
 */
export async function choose(radio: Locator) {
  const isInput = await radio.evaluate((el) => el instanceof HTMLInputElement);
  if (isInput) await radio.check({ force: true });
  else await radio.click();
  await expect(radio).toBeChecked();
}

/** Kasse: AGB bestätigen und verbindlich bestellen (Knopf in „Ihre Bestellung“, nicht die mobile Leiste) */
export async function submitOrder(page: Page) {
  const summary = page.getByRole('region', { name: 'Ihre Bestellung' });
  await summary.getByRole('checkbox', { name: /Ich akzeptiere die AGB/ }).check();
  await summary.getByRole('button', { name: 'Zahlungspflichtig bestellen' }).click();
  await expect(page).toHaveURL(/\/bestellung\/[^/?#]+/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Vielen Dank für Ihre Bestellung!' })).toBeVisible();
}

/** Unterschrift mit der Maus auf das Canvas zeichnen */
export async function drawSignature(page: Page, canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Unterschriftenfeld nicht sichtbar');
  const y = box.y + box.height * 0.45;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const x = box.x + box.width * (0.15 + (0.7 * i) / steps);
    await page.mouse.move(x, y + Math.sin(i) * box.height * 0.15, { steps: 2 });
  }
  await page.mouse.up();
}
