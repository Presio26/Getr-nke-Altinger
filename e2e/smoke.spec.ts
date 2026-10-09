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

    // Drehbuch: alle Schritte offen (Anzahl wie in der Fortschrittsanzeige), Haken bleiben nach dem Neuladen erhalten
    const steps = page.getByRole('region', { name: 'Drehbuch' }).getByRole('button', { name: /^Schritt \d+ abhaken$/ });
    await expect(steps.first()).toBeVisible();
    const total = await steps.count();
    expect(total).toBeGreaterThanOrEqual(9);
    await expect(page.getByRole('region', { name: 'Drehbuch' })).toContainText(`0 von ${total}`);
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

test.describe('Demo-Zugang', () => {
  test('Demo-Umschalter: Pille nur am Desktop, dreimal aufs Logo tippen öffnet ihn überall', async ({ page, isMobile }) => {
    const errors = watchErrors(page);
    await page.goto('/demo?als=u-anna');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    const pill = page.getByRole('button', { name: /^Demo-Umschalter öffnen/ });
    if (isMobile) {
      // iPhone: echtes App-Gefühl ohne schwebende Pille
      await expect(pill).toHaveCount(0);
    } else {
      await expect(pill).toBeVisible();
      // Alt+D blendet die Pille aus und wieder ein
      await page.keyboard.press('Alt+KeyD');
      await expect(pill).toHaveCount(0);
      await page.keyboard.press('Alt+KeyD');
      await expect(pill).toBeVisible();
    }

    const logo = page.getByRole('link', { name: 'Zur Startseite' }).first();
    await logo.click();
    await logo.click();
    await logo.click();
    const dialog = page.getByRole('dialog', { name: 'Demo-Umschalter' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^Toni Huber/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/fahrer');
    await expect(dialog).toBeHidden();
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Verbindung', () => {
  test('Netz weg: Hinweis statt stillem lokalen Modus, danach automatisch wieder verbunden', async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.goto('/demo?als=u-anna');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: 'Zur Startseite' }).first()).toBeVisible();
    // Startseite vollständig geladen (Seiten-Chunks, Echtzeit verbunden), bevor das Netz wegfällt
    await expect(page.locator('main#main').getByRole('heading').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    const banner = page.getByRole('status').filter({ hasText: /Keine (Internet)?[Vv]erbindung/ });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Lokaler Demo-Modus')).toHaveCount(0);

    await context.setOffline(false);
    await expect(page.getByText('Wieder verbunden – die Daten wurden aktualisiert.')).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveCount(0);
    // weiterhin Server-Modus und angemeldet
    expect(await page.evaluate(() => sessionStorage.getItem('altinger.token'))).toBeTruthy();
    expect(errors.filter((e) => e.startsWith('pageerror')), errors.join('\n')).toEqual([]);
  });
});
