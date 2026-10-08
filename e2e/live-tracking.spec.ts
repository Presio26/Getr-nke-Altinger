/**
 * Journey 2 – Drehbuch Schritt 3–5: Der Markt startet die Simulation von Tour 1 (Annas vorbereitete Barzahlungs-
 * Bestellung ist erster Stopp und wird vom Fahrer selbst zugestellt), Anna verfolgt Fahrzeug und Ankunftszeit,
 * Toni schließt den Stopp am iPhone ab (Leergut, Altersprüfung, kassieren, Unterschrift), Anna sieht „Zugestellt“
 * und bewertet. Danach fährt die Simulation weiter und stellt den nächsten Stopp automatisch zu.
 */
import { drawSignature, expect, pageHeader, parseEuro, test } from './fixtures';

test.describe.configure({ timeout: 120_000 });

test('Live-Verfolgung: Fahrer stellt Annas Stopp zu, Anna bewertet, Simulation fährt weiter', async ({ openAs, api }) => {
  // Ausgangslage: Tour 1 (Toni) ist geplant, Annas Bestellung ist erster Stopp und wird bar bezahlt
  const tour = await api.driverTour('u-toni', 't-1');
  expect(tour.status).toBe('planned');
  const [annaStop, nextStop] = tour.stops;
  const annaOrder = tour.orders.find((o) => o.id === annaStop.orderId)!;
  const nextOrder = tour.orders.find((o) => o.id === nextStop.orderId)!;
  expect(annaOrder.customerId).toBe('c-anna');
  expect(annaOrder.paymentMethod).toBe('cash');
  expect(annaOrder.status).toBe('ready');

  // Anna (iPhone) hat ihre Bestellung offen – noch keine Live-Fahrt
  const anna = await openAs('u-anna', 'iphone', `/bestellung/${annaOrder.id}`);
  await expect(anna.getByRole('heading', { level: 1, name: `Bestellung ${annaOrder.number}` })).toBeVisible();
  const live = anna.getByRole('region', { name: 'Live-Verfolgung' });
  await expect(live).toBeVisible();
  await expect(live.locator('.alt-driver')).toHaveCount(0);

  // Toni (iPhone) ist in der Fahrer-App angemeldet
  const toni = await openAs('u-toni', 'iphone');
  await expect(toni.getByText('Tour 1 · Garching Mitte').first()).toBeVisible();

  // Markt startet die Simulation: zuerst langsam (Marker + Ankunftszeit prüfen), Annas Stopp schließt der Fahrer ab
  await api.as('u-admin', 'simulateTour', ['t-1', { speedFactor: 2, autoComplete: true, manualOrderIds: [annaOrder.id] }]);

  // Anna: Fahrzeug auf der Karte, Ankunft „in ca. … Min.“, Status „Unterwegs“ – ohne Neuladen
  await expect(pageHeader(anna)).toContainText('Unterwegs');
  await expect(live.locator('.alt-driver')).toBeVisible();
  await expect(live.getByText(/Ankunft in ca\. \d+ Min\./)).toBeVisible();
  await expect(live.getByText(/gegen \d{1,2}:\d{2} Uhr/).first()).toBeVisible();
  await expect(live).toContainText('Sie sind als Nächstes dran!');

  // Zeitraffer hoch: das Fahrzeug erreicht Annas Adresse und wartet dort
  await api.as('u-admin', 'simulateTour', ['t-1', { speedFactor: 50, autoComplete: true, manualOrderIds: [annaOrder.id] }]);
  await expect(live.getByText('Toni ist da!').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  // die Simulation wartet am manuellen Stopp (keine automatische Zustellung)
  const waiting = await api.order(annaOrder.id);
  expect(waiting.status).toBe('out_for_delivery');
  expect(waiting.arrivedAt).toBeTruthy();

  // Toni öffnet den Stopp
  await toni.goto(`/fahrer/stopp/${annaOrder.id}`);
  await expect(toni.getByRole('heading', { level: 1, name: /^Stopp 1 von \d+$/ })).toBeVisible();
  await expect(toni.getByText(/Fahrzeug ist bei Anna Berger angekommen/)).toBeVisible();
  await expect(toni.getByRole('alert').filter({ hasText: 'Alter prüfen (ab 16 Jahren)' })).toBeVisible();

  // Leergut: angekündigt 2 Bierkästen + 1 Wasserkasten – tatsächlich 3 Bierkästen
  const bier = toni.getByRole('textbox', { name: 'Menge – Bierkasten (20er)' });
  await expect(bier).toHaveValue('2');
  const dueEl = toni.getByTestId('amount-due');
  const dueBefore = parseEuro((await dueEl.textContent()) ?? '');
  await toni.getByRole('button', { name: 'Menge erhöhen – Bierkasten (20er)' }).click();
  await expect(bier).toHaveValue('3');
  await expect.poll(async () => parseEuro((await dueEl.textContent()) ?? '')).toBe(dueBefore - 310);
  const due = dueBefore - 310;

  // Bar kassieren: passender Betrag
  await expect(toni.getByRole('radio', { name: 'Bar' })).toBeChecked();
  await toni.getByRole('button', { name: /^Passend · / }).click();
  await expect(toni.getByRole('textbox', { name: 'Erhaltener Betrag' })).not.toHaveValue('');

  // Altersprüfung + Unterschrift
  const age = toni.getByRole('checkbox', { name: /^Alter geprüft/ });
  await age.check({ force: true });
  await expect(age).toBeChecked();
  await expect(toni.getByRole('textbox', { name: 'Name des Empfängers' })).toHaveValue('Anna Berger');
  await drawSignature(toni, toni.getByTestId('signature-pad'));
  await expect(toni.getByRole('img', { name: 'Unterschriftenfeld (unterschrieben)' })).toBeVisible();
  await expect(toni.getByText('Unterschrift erfasst')).toBeVisible();

  await toni.getByRole('button', { name: 'Zustellung abschließen' }).last().click();
  // Fahrer-App springt zum nächsten Stopp
  await expect(toni).toHaveURL(new RegExp(`/fahrer/stopp/${nextOrder.id}$`));

  // Server: Zustellnachweis vollständig
  await expect.poll(async () => (await api.order(annaOrder.id)).status).toBe('delivered');
  const delivered = await api.order(annaOrder.id);
  expect(delivered.proof?.emptiesCollected).toEqual(
    expect.arrayContaining([
      { depositTypeId: 'kasten-bier-20', qty: 3 },
      { depositTypeId: 'kasten-glas-12', qty: 1 },
    ]),
  );
  expect(delivered.proof?.amountCollected).toBe(due);
  expect(delivered.proof?.signatureDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(delivered.proof?.receivedBy).toBe('Anna Berger');
  expect(delivered.proof?.note ?? '').toContain('Alter geprüft');

  // Anna: „Zugestellt“ live, Bewertung abgeben
  await expect(pageHeader(anna)).toContainText('Zugestellt');
  const stars = anna.getByRole('radiogroup', { name: 'Sterne vergeben' });
  await expect(stars).toBeVisible();
  await stars.getByRole('radio', { name: '5 Sterne' }).click();
  await anna.getByRole('button', { name: 'Bewertung senden' }).click();
  await expect(anna.getByRole('heading', { name: 'Ihre Bewertung' })).toBeVisible();
  await expect.poll(async () => (await api.order(annaOrder.id)).rating?.stars).toBe(5);

  // Simulation fährt weiter: der nächste Stopp wird automatisch zugestellt
  await expect
    .poll(async () => (await api.order(nextOrder.id)).status, { timeout: 45_000, intervals: [500, 1000] })
    .toBe('delivered');
  expect((await api.order(nextOrder.id)).proof?.note).toBe('Demo-Simulation');
  // Fahrer-App zeigt den automatisch zugestellten Stopp ohne Neuladen
  await expect(pageHeader(toni)).toContainText('Zugestellt');
});
