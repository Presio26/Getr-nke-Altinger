/**
 * Journey 6 – Drehbuch Schritt 8 + Vorbereitung: Party-Planer → alles in den Warenkorb → Kasse zeigt Festdatum und
 * Kommission; ein Demo-Reset (vom Laptop aus dem Leitfaden) leert Annas Warenkorb live; zwei Tabs im selben Browser
 * mit verschiedenen Rollen behalten nach dem Neuladen ihre eigene Anmeldung.
 */
import { expect, loginAs, newContext, test, watch } from './fixtures';

test.describe.configure({ timeout: 90_000 });

test('Party-Planer füllt den Warenkorb, Kasse zeigt Festdatum und Kommission, Demo-Reset leert ihn', async ({ openAs, api }) => {
  const anna = await openAs('u-anna', 'iphone', '/fest');
  await expect(anna.getByRole('heading', { name: 'Party-Planer', level: 2 })).toBeVisible();

  // 60 Gäste, Festdatum aus dem Planer übernehmen (Standard: nächster Samstag – unabhängig vom heutigen Tag)
  const guests = anna.getByRole('textbox', { name: 'Menge – Gäste' });
  await guests.fill('60');
  await guests.press('Tab');
  await expect(guests).toHaveValue('60');
  const festDate = await anna.getByRole('textbox', { name: 'Datum Ihres Festes' }).first().inputValue();
  expect(festDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const recommendation = anna.getByRole('region', { name: 'Ihre Empfehlung' });
  await expect(recommendation).toContainText('für 60 Gäste');
  await expect(recommendation.getByRole('heading', { name: 'Leihartikel' })).toBeVisible();

  await recommendation.getByRole('button', { name: 'Alles in den Warenkorb' }).click();
  await expect(anna).toHaveURL(/\/warenkorb$/);
  await expect(anna.getByRole('heading', { level: 1, name: 'Warenkorb' })).toBeVisible();
  await expect(anna.getByText('Leihartikel im Warenkorb')).toBeVisible();
  await expect(anna.getByRole('textbox', { name: /^Menge – .*Bierzeltgarnitur/ })).toBeVisible();

  // Kasse: Festdatum und Kommission sind übernommen
  await anna.getByRole('link', { name: 'Zur Kasse' }).first().click();
  await expect(anna).toHaveURL(/\/kasse$/);
  await expect(anna.getByText('Ihre Veranstaltung')).toBeVisible();
  await expect(anna.getByRole('textbox', { name: 'Datum der Veranstaltung' })).toHaveValue(festDate);
  await expect(anna.getByRole('checkbox', { name: /^Als Kommissionsware bestellen/ })).toBeChecked();
  // die Preisberechnung für die Kasse kennt Festdatum und Kommission
  const cart = await anna.evaluate(() => JSON.parse(localStorage.getItem('altinger.cart') ?? '{}').state);
  expect(cart.eventDate).toBe(festDate);
  expect(cart.commission).toBe(true);
  expect(cart.items.length).toBeGreaterThan(5);

  // Markt setzt die Demo-Daten über den Leitfaden zurück → Annas Warenkorb ist sofort leer
  const markt = await openAs('u-admin', 'desktop', '/demo');
  const resetCard = markt.locator('#schnellaktionen');
  await resetCard.getByRole('button', { name: 'Demo-Daten zurücksetzen' }).click();
  const confirm = markt.getByRole('dialog', { name: 'Demo-Daten zurücksetzen?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(confirm).toBeHidden();

  await expect(anna.getByText(/Ihr Warenkorb wurde geleert/).filter({ visible: true }).first()).toBeVisible();
  await expect
    .poll(() => anna.evaluate(() => JSON.parse(localStorage.getItem('altinger.cart') ?? '{}').state?.items?.length ?? 0))
    .toBe(0);
  const state = await anna.evaluate(() => JSON.parse(localStorage.getItem('altinger.cart') ?? '{}').state);
  expect(state.eventDate ?? null).toBeNull();
  expect(state.commission ?? false).toBe(false);
  await anna.goto('/warenkorb');
  await expect(anna.getByRole('heading', { name: 'Ihr Warenkorb ist leer' })).toBeVisible();
  // Anna bleibt angemeldet
  const me = await api.as<{ user: { id: string } } | null>('u-anna', 'me');
  expect(me?.user.id).toBe('u-anna');
  await expect.poll(() => anna.evaluate(() => sessionStorage.getItem('altinger.token'))).toBeTruthy();
});

test('Zwei Tabs mit verschiedenen Rollen behalten nach dem Neuladen ihre Anmeldung', async ({ browser, baseURL, pageErrors }) => {
  const context = await newContext(browser, baseURL, 'desktop');
  try {
    const shop = await context.newPage();
    watch(shop, pageErrors, 'Tab Anna');
    await loginAs(shop, 'u-anna');
    const fahrer = await context.newPage();
    watch(fahrer, pageErrors, 'Tab Toni');
    await loginAs(fahrer, 'u-toni');

    const annaToken = await shop.evaluate(() => sessionStorage.getItem('altinger.token'));
    const toniToken = await fahrer.evaluate(() => sessionStorage.getItem('altinger.token'));
    expect(annaToken).toBeTruthy();
    expect(toniToken).toBeTruthy();
    expect(annaToken).not.toBe(toniToken);

    for (let round = 0; round < 2; round++) {
      await shop.reload();
      await fahrer.reload();
      await expect(shop).toHaveURL((u) => u.pathname === '/');
      await expect(shop.getByRole('button', { name: 'Kontomenü: Anna Berger' })).toBeVisible();
      await expect(fahrer).toHaveURL((u) => u.pathname === '/fahrer');
      await expect(fahrer.getByRole('heading', { level: 1, name: /, Toni$/ })).toBeVisible();
      expect(await shop.evaluate(() => sessionStorage.getItem('altinger.token'))).toBe(annaToken);
      expect(await fahrer.evaluate(() => sessionStorage.getItem('altinger.token'))).toBe(toniToken);
    }

    // Anna kann im eigenen Tab weiter ihre Bestellungen öffnen, Toni seine Tour
    await shop.goto('/bestellungen');
    await expect(shop.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(shop).toHaveURL(/\/bestellungen$/);
    await fahrer.goto('/fahrer/tour/t-1');
    await expect(fahrer.getByText('Tour 1 · Garching Mitte').first()).toBeVisible();
  } finally {
    await context.close();
  }
});
