/**
 * Journey 3 – Drehbuch Schritt 7: Click & Collect. Anna reserviert am iPhone zur Abholung, sieht QR-Code und
 * Abholcode; der Markt prüft den Code unter /admin/abholungen, stellt bereit und gibt mit Leergut-Rücknahme aus.
 * Anna sieht „Abgeholt“ und erhält genau eine Abschluss-Benachrichtigung.
 */
import type { AppNotification } from '../shared/types';
import { choose, chooseFirstFreeSlot, expect, orderIdFromUrl, orderNumberFromHeading, pageHeader, submitOrder, test } from './fixtures';

test.describe.configure({ timeout: 90_000 });

test('Click & Collect: Abholcode prüfen, bereitstellen, mit Leergut ausgeben', async ({ openAs, api }) => {
  const anna = await openAs('u-anna', 'iphone', '/produkt/paulaner-spezi');
  await expect(anna.getByRole('heading', { level: 1 })).toBeVisible();
  await anna.getByRole('button', { name: 'In den Warenkorb', exact: true }).click();
  await anna.goto('/kasse');
  await choose(anna.getByRole('radio', { name: /^Abholung im Markt/ }));
  await expect(anna.getByRole('region', { name: 'Abholfenster wählen' })).toBeVisible();
  await chooseFirstFreeSlot(anna);
  await choose(anna.getByRole('radio', { name: /^Barzahlung/ }));
  await submitOrder(anna);

  const number = await orderNumberFromHeading(anna);
  const orderId = orderIdFromUrl(anna);
  const placed = await api.order(orderId);
  expect(placed.fulfillment).toBe('pickup');
  expect(placed.pickupCode).toMatch(/^[A-Z0-9]{6}$/);
  const code = placed.pickupCode!;

  // QR-Code und Abholcode sind sichtbar
  await expect(anna.getByRole('img', { name: `QR-Code für Bestellung ${number}` })).toBeVisible();
  await expect(anna.getByText(code, { exact: true })).toBeVisible();
  await expect(pageHeader(anna)).toContainText('Eingegangen');

  // Markt: Abholcode eintippen (klein geschrieben, mit Leerzeichen – wie am Tresen)
  const markt = await openAs('u-admin', 'desktop', '/admin/abholungen');
  await expect(markt.getByRole('heading', { level: 1, name: 'Abholungen' })).toBeVisible();
  await markt.getByRole('textbox', { name: 'Abholcode' }).fill(` ${code.toLowerCase()} `);
  await markt.getByRole('button', { name: 'Prüfen' }).click();
  const dialog = markt.getByRole('dialog', { name: new RegExp(`Abholung ${number}`) });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Anna Berger');

  // bereitstellen → Anna sieht „Abholbereit“ live
  await dialog.getByRole('button', { name: 'Bereitgestellt' }).click();
  await expect(dialog.getByText('Bereitgestellt', { exact: true }).first()).toBeVisible();
  await expect(pageHeader(anna)).toContainText('Abholbereit');
  await expect.poll(async () => (await api.order(orderId)).status).toBe('ready');

  // abholen mit Leergut: Kunde bringt einen Bierkasten (20er) mit – der Betrag sinkt um 3,10 €
  const bier = dialog.getByRole('textbox', { name: 'Menge – Leergut Bierkasten (20er)' });
  await expect(bier).toBeVisible();
  await dialog.getByRole('button', { name: 'Menge erhöhen – Leergut Bierkasten (20er)' }).click();
  await expect(bier).toHaveValue('1');
  await expect(dialog).toContainText('inkl. 3,10 € Leergut-Gutschrift');
  await expect(dialog).toContainText(`Angepasst an das angenommene Leergut`);
  await dialog.getByRole('button', { name: 'Abgeholt' }).click();
  await expect(dialog.getByText('Übergeben – vielen Dank!')).toBeVisible();

  await expect.poll(async () => (await api.order(orderId)).status).toBe('picked_up');
  const done = await api.order(orderId);
  expect(done.proof?.emptiesCollected).toEqual([{ depositTypeId: 'kasten-bier-20', qty: 1 }]);
  expect(done.totals.depositRefund).toBe(310);

  // Anna: „Abgeholt“ live, Bewertung möglich
  await expect(pageHeader(anna)).toContainText('Abgeholt');
  await expect(anna.getByRole('heading', { name: 'Wie war Ihre Abholung?' })).toBeVisible();

  // genau eine Abschluss-Benachrichtigung zu dieser Bestellung
  const notes = await api.as<AppNotification[]>('u-anna', 'listNotifications');
  const forOrder = notes.filter((n) => n.link === `/bestellung/${orderId}`);
  const completion = forOrder.filter((n) => n.body.includes(`${number} wurde abgeholt`));
  expect(completion, JSON.stringify(forOrder, null, 2)).toHaveLength(1);
  expect(completion[0].title).toBe('Danke für Ihren Einkauf');

  // … und in der Benachrichtigungsliste der App genau einmal
  await anna.goto('/konto/benachrichtigungen');
  await expect(anna.getByText(`Ihre Bestellung ${number} wurde abgeholt.`, { exact: false })).toHaveCount(1);
});
