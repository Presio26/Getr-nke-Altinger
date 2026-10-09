/**
 * Journey 1 – Drehbuch Schritt 1 + 2: Anna bestellt am iPhone (Artikel + Leergut, Lieferung, nächstes freies
 * Fenster, bar), der Markt sieht die Bestellung live im Board und bestätigt sie (Auto-Bestätigung ist aus),
 * Annas Bestellseite aktualisiert sich ohne Neuladen.
 */
import type { Bootstrap } from '../shared/types';
import { choose, chooseFirstFreeSlot, expect, orderIdFromUrl, orderNumberFromHeading, pageHeader, submitOrder, test } from './fixtures';

test.describe.configure({ timeout: 90_000 });

test('Anna bestellt mit Leergut, der Markt bestätigt live und Anna sieht den neuen Status', async ({ openAs, api }) => {
  const { settings } = await api.as<Bootstrap>('u-admin', 'getBootstrap');
  expect(settings.demoAutoConfirm ?? false, 'Demo-Auto-Bestätigung ist im Demo-Stand aus').toBe(false);

  // Markt (Desktop) hat das Board offen, bevor Anna bestellt
  const markt = await openAs('u-admin', 'desktop', '/admin/bestellungen');
  const eingegangen = markt.getByRole('region', { name: 'Eingegangen' });
  await expect(eingegangen).toBeVisible();

  // Anna (iPhone): 2 Kästen Augustiner Hell
  const anna = await openAs('u-anna', 'iphone', '/produkt/augustiner-hell');
  await expect(anna.getByRole('heading', { level: 1, name: 'Lagerbier Hell' })).toBeVisible();
  await anna.getByRole('button', { name: 'Menge erhöhen – Augustiner Lagerbier Hell' }).first().click();
  await expect(anna.getByRole('textbox', { name: 'Menge – Augustiner Lagerbier Hell' }).first()).toHaveValue('2');
  await anna.getByRole('button', { name: 'In den Warenkorb', exact: true }).click();

  // Warenkorb: Leergut – 2 Bierkästen zurückgeben
  await anna.goto('/warenkorb');
  await expect(anna.getByRole('heading', { level: 1, name: 'Warenkorb' })).toBeVisible();
  await expect(anna.getByRole('textbox', { name: 'Menge – Augustiner Lagerbier Hell' })).toHaveValue('2');
  const empties = anna.getByRole('region', { name: /^Kästen & Fässer/ });
  const leergutToggle = anna.getByRole('button', { name: /^Leergut zurückgeben/ });
  if ((await leergutToggle.getAttribute('aria-expanded')) === 'false') await leergutToggle.click();
  await empties.getByRole('button', { name: 'Menge erhöhen – Bierkasten (20er)' }).click();
  await empties.getByRole('button', { name: 'Menge erhöhen – Bierkasten (20er)' }).click();
  await expect(empties.getByRole('textbox', { name: 'Menge – Bierkasten (20er)' })).toHaveValue('2');
  await expect(anna.getByText('Gutschrift Leergut', { exact: true }).locator('..')).toContainText('6,20 €');

  // Kasse
  await anna.getByRole('link', { name: 'Zur Kasse' }).first().click();
  await expect(anna).toHaveURL(/\/kasse$/);
  await choose(anna.getByRole('radio', { name: /^Lieferung Bis an die Haustür/ }));
  await expect(anna.getByRole('radio', { name: /^Zuhause/ })).toBeChecked();
  await chooseFirstFreeSlot(anna);
  await choose(anna.getByRole('radio', { name: /^Barzahlung/ }));
  // Leergut-Gutschrift steht in der Zusammenfassung
  await expect(anna.getByRole('region', { name: 'Ihre Bestellung' })).toContainText('6,20 €');
  await submitOrder(anna);

  // Bestellbestätigung
  const number = await orderNumberFromHeading(anna);
  const orderId = orderIdFromUrl(anna);
  await expect(pageHeader(anna)).toContainText('Eingegangen');

  const placed = await api.order(orderId);
  expect(placed.status).toBe('pending');
  expect(placed.paymentMethod).toBe('cash');
  expect(placed.fulfillment).toBe('delivery');
  expect(placed.emptiesReturn).toEqual([{ depositTypeId: 'kasten-bier-20', qty: 2 }]);
  expect(placed.lines.map((l) => [l.productId, l.qty])).toEqual([['augustiner-hell', 2]]);

  // Markt: Karte erscheint ohne Neuladen in „Eingegangen“ → bestätigen
  const card = eingegangen.getByRole('article').filter({ has: markt.getByRole('button', { name: new RegExp(`^Bestellung ${number},`) }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Anna Berger');
  await card.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(markt.getByRole('region', { name: 'Bestätigt' }).getByRole('button', { name: new RegExp(`^Bestellung ${number},`) })).toBeVisible();

  // Anna: Status springt live auf „Bestätigt“
  await expect(pageHeader(anna)).toContainText('Bestätigt');
  await expect.poll(async () => (await api.order(orderId)).status).toBe('confirmed');
});
