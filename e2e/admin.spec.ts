/**
 * Journey 5 – Markt-Dashboard (Drehbuch Schritt 2 + 9): Telefonbestellung im Namen von Anna, Preisänderung live
 * im Shop, Auto-Planung mit Vorschau, „Optimieren“ ohne Verbesserung, Kennzahl „Telefon-Entlastung“, Statistik.
 */
import type { Order, Stats } from '../shared/types';
import { choose, expect, pageHeader, test } from './fixtures';

test.describe.configure({ timeout: 90_000 });

test('Telefonbestellung für Anna erscheint mit Telefon-Kennzeichen im Board, bei Anna und in der Kennzahl', async ({ openAs, api }) => {
  // Anna (iPhone) hat ihre Bestellübersicht offen
  const anna = await openAs('u-anna', 'iphone', '/bestellungen');
  await expect(anna.getByRole('heading', { level: 1 })).toBeVisible();

  // Markt: Drawer direkt über ?neu=telefon
  const markt = await openAs('u-admin', 'desktop', '/admin/bestellungen?neu=telefon');
  const drawer = markt.getByRole('dialog', { name: 'Telefonbestellung' });
  await expect(drawer).toBeVisible();

  // Kunde über die letzten Ziffern der Telefonnummer
  await drawer.getByRole('searchbox', { name: 'Kunde suchen' }).fill('1201');
  await drawer.getByRole('list', { name: 'Gefundene Kunden' }).getByRole('button', { name: /^Anna Berger/ }).click();
  await expect(drawer.getByText('Mühlgasse 6, 85748 Garching b. München').first()).toBeVisible();

  // Artikel suchen und übernehmen
  const search = drawer.getByRole('searchbox', { name: 'Artikel suchen' });
  await expect(search).toBeEnabled();
  await search.fill('Tegernseer');
  await drawer.getByRole('list', { name: 'Gefundene Artikel' }).getByRole('button', { name: /^Tegernseer Hell, 20 × 0,5 l Glas/ }).click();

  // erstes freies Lieferfenster
  const slot = drawer.getByRole('button', { name: /^\d{2}:\d{2}–\d{2}:\d{2} \d+ frei$/ }).and(drawer.locator(':not([disabled])')).first();
  await slot.click();
  await expect(slot).toHaveAttribute('aria-pressed', 'true');

  // Leergut + Zahlart + Hinweis
  await drawer.getByRole('button', { name: 'Menge erhöhen – Leergut Bierkasten (20er)' }).click();
  await expect(drawer.getByRole('textbox', { name: 'Menge – Leergut Bierkasten (20er)' })).toHaveValue('1');
  await drawer.getByRole('combobox', { name: 'Zahlart' }).selectOption('cash');
  await drawer.getByRole('textbox', { name: 'Hinweis für Markt und Fahrer' }).fill('Bitte vorher kurz anrufen');
  await expect(drawer.getByRole('region', { name: 'Summe' })).toContainText('€');

  await drawer.getByRole('button', { name: 'Bestellung anlegen' }).click();
  await expect(markt).toHaveURL(/\/admin\/bestellungen\/[^/?]+$/);
  const orderId = decodeURIComponent(markt.url().split('/').pop()!);
  const order = await api.order(orderId);
  expect(order.source).toBe('phone');
  // vom Markt am Telefon aufgenommen → gleich bestätigt
  expect(order.status).toBe('confirmed');
  expect(order.customerId).toBe('c-anna');
  expect(order.paymentMethod).toBe('cash');
  expect(order.emptiesReturn).toEqual([{ depositTypeId: 'kasten-bier-20', qty: 1 }]);
  expect(order.notes).toBe('Bitte vorher kurz anrufen');
  await expect(markt.getByRole('heading', { level: 1, name: new RegExp(`^Bestellung ${order.number}`) })).toBeVisible();

  // Board: Telefon-Kennzeichen
  await markt.goto('/admin/bestellungen');
  const card = markt.getByRole('article').filter({ has: markt.getByRole('button', { name: new RegExp(`^Bestellung ${order.number}, Anna Berger`) }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText('(Telefonbestellung)');

  // Anna sieht die Bestellung ohne Neuladen
  await expect(anna.getByText(order.number).first()).toBeVisible();
  await anna.getByText(order.number).first().click();
  await expect(anna).toHaveURL(new RegExp(`/bestellung/${orderId}$`));
  await expect(pageHeader(anna)).toContainText('Bestätigt');

  // Dashboard: Kennzahl „Telefon-Entlastung“ (Bestellungen nach Liefer-/Abholtag der letzten 14 Tage) wie die Statistik
  const after = await api.as<Stats>('u-admin', 'adminGetStats', [14]);
  expect(after.bySource!.phone).toBeGreaterThan(0);
  const online = after.bySource!.app + after.bySource!.subscription;
  const total = online + after.bySource!.phone;
  await markt.goto('/admin');
  const kpi = markt.getByRole('button', { name: /^Telefon-Entlastung/ });
  await expect(kpi).toBeVisible();
  await expect(kpi).toContainText(`${Math.round((online / total) * 100)} % online`);
  await expect(kpi).toContainText(`${online} von ${total} ohne Anruf (14 Tage)`);
  await expect(kpi).toContainText('Telefonzeit gespart');
});

test('Preisänderung erscheint sofort auf Annas Produktseite, Angebotspreis in der Vorschau wie im Shop', async ({ openAs, api }) => {
  const anna = await openAs('u-anna', 'iphone', '/produkt/tegernseer-hell');
  await expect(anna.getByRole('heading', { level: 1, name: 'Hell' })).toBeVisible();
  await expect(anna.getByText(/^1 × 21,99\s€ = 21,99\s€/)).toBeVisible();

  const markt = await openAs('u-admin', 'desktop', '/admin/sortiment/tegernseer-hell');
  await expect(markt.getByRole('heading', { level: 1, name: 'Tegernseer Hell' })).toBeVisible();
  const price = markt.getByRole('textbox', { name: 'Verkaufspreis brutto' });
  await expect(price).toHaveValue('21,99');
  await price.fill('23,49');
  await markt.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(markt).toHaveURL(/\/admin\/sortiment(\?.*)?$/);
  await expect.poll(async () => (await api.as<{ priceGross: number }>('u-anna', 'getProduct', ['tegernseer-hell'])).priceGross).toBe(2349);

  // Anna: neuer Preis ohne Neuladen
  await expect(anna.getByText(/^1 × 23,49\s€ = 23,49\s€/)).toBeVisible();
  await expect(anna.getByText('23,49 €', { exact: true }).first()).toBeVisible();

  // Artikel-Vorschau im Markt: Angebotspreis in derselben Farbe wie im Shop
  await anna.goto('/produkt/augustiner-hell');
  const shopOffer = anna.getByText('17,99 €', { exact: true }).first();
  await expect(shopOffer).toBeVisible();
  const shopColor = await shopOffer.evaluate((el) => getComputedStyle(el).color);
  await markt.goto('/admin/sortiment/augustiner-hell');
  const previewOffer = markt.getByRole('main').getByText('17,99 €', { exact: true }).first();
  await expect(previewOffer).toBeVisible();
  await expect(previewOffer).toHaveCSS('color', shopColor);
});

test('Auto-Planung für den nächsten Liefertag: Vorschau, dann übernehmen', async ({ openAs, api }) => {
  // Liefertag der offenen, ungeplanten Bestellungen aus den Demo-Daten (morgen bzw. nächster Liefertag)
  const open = await api.as<Order[]>('u-admin', 'adminListOrders', [{ status: ['confirmed'], fulfillment: 'delivery' }]);
  const unplanned = open.filter((o) => !o.tourId);
  expect(unplanned.length).toBeGreaterThan(0);
  const day = unplanned.map((o) => o.slot.date).sort()[0];
  const planned = unplanned.filter((o) => o.slot.date === day);

  const markt = await openAs('u-admin', 'desktop', `/admin/touren?datum=${day}`);
  await expect(markt.getByRole('heading', { level: 1, name: 'Tourenplanung' })).toBeVisible();
  await expect(markt.getByText(`${planned.length + (await countPending(api, day))} ungeplant`, { exact: false })).toBeVisible();

  await markt.getByRole('button', { name: 'Automatisch planen' }).first().click();
  const dialog = markt.getByRole('dialog', { name: 'Touren automatisch planen' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('erst mit „Übernehmen“ wird gespeichert');
  for (const o of planned) await expect(dialog).toContainText(o.number);
  // Vorschau speichert noch nichts
  const toursBefore = await api.as<unknown[]>('u-admin', 'adminListTours', [day]);
  expect(toursBefore).toHaveLength(0);

  const apply = dialog.getByRole('button', { name: /^\d+ Touren? übernehmen$/ });
  const count = Number(/^(\d+)/.exec((await apply.textContent()) ?? '')?.[1]);
  await apply.click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await api.as<unknown[]>('u-admin', 'adminListTours', [day])).length).toBe(count);
  for (const o of planned) await expect.poll(async () => (await api.order(o.id)).tourId).toBeTruthy();
  await expect(markt.getByText(`${count} Touren`, { exact: false }).or(markt.getByText(`${count} Tour mit`, { exact: false })).first()).toBeVisible();
});

test('„Optimieren“ auf Tour 1 meldet „bereits optimal“ und die Statistik lädt', async ({ openAs, api }) => {
  const tour = await api.driverTour('u-toni', 't-1');
  const order = tour.stops.map((s) => s.orderId);

  const markt = await openAs('u-admin', 'desktop', '/admin/touren');
  const card = markt.getByRole('button', { name: /^Tour 1 · Garching Mitte/ });
  await expect(card).toBeVisible();
  await markt.getByRole('button', { name: 'Optimieren' }).first().click();
  await expect(markt.getByText('Die Reihenfolge ist bereits optimal. „Tour 1 · Garching Mitte“ bleibt unverändert.')).toBeVisible();
  const after = await api.driverTour('u-toni', 't-1');
  expect(after.stops.map((s) => s.orderId)).toEqual(order);

  // Statistik
  await markt.goto('/admin/statistik');
  await expect(markt.getByRole('heading', { level: 1, name: 'Auswertungen' })).toBeVisible();
  await expect(markt.getByRole('img', { name: /^Umsatz je Tag/ })).toBeVisible();
  await expect(markt.getByRole('img', { name: /^Bestellungen nach Lieferart/ })).toBeVisible();
  await expect(markt.getByText('Die Daten konnten nicht geladen werden')).toHaveCount(0);
  await choose(markt.getByRole('radio', { name: '7 Tage' }));
  await expect(markt.getByText(/in 7 Tagen/).first()).toBeVisible();
});

async function countPending(api: { as: <T>(u: string, m: string, a?: unknown[]) => Promise<T> }, day: string): Promise<number> {
  const pending = await api.as<Order[]>('u-admin', 'adminListOrders', [{ status: ['pending'], fulfillment: 'delivery', date: day }]);
  return pending.filter((o) => !o.tourId).length;
}
