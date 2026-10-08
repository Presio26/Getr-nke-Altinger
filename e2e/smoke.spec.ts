/**
 * Rauchtest: Startseite, Demo-Anmeldung je Rolle, Demo-Leitfaden.
 * Läuft in beiden Projekten (Desktop Chromium und iPhone).
 */
import { expect, test, type Page } from '@playwright/test';

const DEMO_ROLES = [
  { id: 'u-anna', name: 'Anna Berger', home: '/' },
  { id: 'u-gasthaus', name: 'Gasthaus Zum Mühlbach', home: '/business' },
  { id: 'u-nordbyte', name: 'NordByte Software GmbH', home: '/business' },
  { id: 'u-toni', name: 'Toni Huber', home: '/fahrer' },
  { id: 'u-lukas', name: 'Lukas Brandl', home: '/fahrer' },
  { id: 'u-ayse', name: 'Ayşe Demir', home: '/fahrer' },
  { id: 'u-admin', name: 'Marktleitung', home: '/admin' },
] as const;

/** Ungefangene Ausnahmen und Konsolenfehler mitschreiben */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function expectAppStarted(page: Page) {
  await expect(page.getByText('Die App konnte nicht starten')).toHaveCount(0);
  await expect(page.locator('#root')).not.toBeEmpty();
}

test.describe('Startseite', () => {
  test('lädt ohne Fehler und zeigt Kopfzeile und Navigation', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/Getränke Altinger/);
    await expect(page.getByRole('link', { name: 'Zur Startseite' }).first()).toBeVisible();
    await expect(page.locator('main#main')).toBeVisible();
    await expectAppStarted(page);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Demo-Anmeldung', () => {
  for (const role of DEMO_ROLES) {
    test(`${role.name} landet auf ${role.home}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/login');
      const button = page.getByRole('button', { name: new RegExp(`^${role.name}`) });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await expect(page).toHaveURL((url) => url.pathname === role.home);
      await expectAppStarted(page);
      // Anmeldung ist gespeichert (Tab und Gerät)
      const token = await page.evaluate(() => sessionStorage.getItem('altinger.token'));
      expect(token).toBeTruthy();
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('QR-Link /demo?als=… meldet automatisch an', async ({ page }) => {
    await page.goto('/demo?als=u-admin');
    await expect(page).toHaveURL((url) => url.pathname === '/admin');
    await page.goto('/demo?als=u-toni');
    await expect(page).toHaveURL((url) => url.pathname === '/fahrer');
  });

  test('QR-Link für Gäste meldet ab', async ({ page }) => {
    await page.goto('/demo?als=u-anna');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await page.goto('/demo?als=gast');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('altinger.token'))).toBeNull();
  });
});

test.describe('Demo-Leitfaden', () => {
  test('zeigt alle Rollen mit QR-Code und das Drehbuch', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/demo');
    await expect(page.getByRole('heading', { name: 'Demo-Leitfaden', level: 1 })).toBeVisible();

    for (const role of [...DEMO_ROLES.map((r) => r.name), 'Gast ohne Anmeldung']) {
      const card = page.getByRole('article', { name: role });
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Jetzt öffnen' })).toBeEnabled();
      await expect(card.getByRole('button', { name: /QR-Code .* vergrößern/ }).locator('img')).toBeVisible();
    }

    // Drehbuch mit neun Schritten, Haken bleiben nach dem Neuladen erhalten
    await expect(page.getByRole('button', { name: /^Schritt \d+ abhaken$/ })).toHaveCount(9);
    await page.getByRole('button', { name: 'Schritt 1 abhaken' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Schritt 1 als offen markieren' })).toBeVisible();

    // Schnellaktion: Simulation nur für Markt/Fahrer
    await expect(page.locator('#schnellaktionen').getByRole('button', { name: 'Tour 1 simulieren' })).toBeDisabled();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('„Jetzt öffnen“ wechselt die Rolle', async ({ page }) => {
    await page.goto('/demo');
    const card = page.getByRole('article', { name: 'Marktleitung' });
    await card.getByRole('button', { name: 'Jetzt öffnen' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/admin');
  });
});
