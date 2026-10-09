/**
 * Journey 4 – Drehbuch Schritt 6: Das Gasthaus bestellt per Schnellbestellung (Nettopreise, Gastro-Rabatt,
 * Staffelpreis), zahlt auf Rechnung mit Kostenstelle; der Markt setzt die Lieferung auf „zugestellt“ und startet
 * den Rechnungslauf; das Gasthaus öffnet die Rechnung – alle Summen gehen exakt auf (Werte aus dem DOM).
 */
import type { Locator, Page } from '@playwright/test';
import { choose, chooseFirstFreeSlot, expect, orderIdFromUrl, orderNumberFromHeading, pageHeader, parseEuro, submitOrder, test } from './fixtures';

test.describe.configure({ timeout: 120_000 });

/** Wert einer <dt>/<dd>-Zeile (exakter Begriff) als Cent */
async function termValue(scope: Locator, term: string): Promise<number> {
  const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const dd = scope.getByRole('term').filter({ hasText: new RegExp(`^\\s*${pattern}\\s*$`) }).locator('xpath=following-sibling::dd[1]');
  await expect(dd).toHaveCount(1);
  return parseEuro((await dd.textContent()) ?? '');
}

async function rowCells(row: Locator): Promise<string[]> {
  return (await row.getByRole('cell').allTextContents()).map((t) => t.trim());
}

async function nextStatusClick(page: Page, label: string) {
  const button = page.getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

test('Gasthaus: Schnellbestellung mit Staffelpreis, Rechnung mit Kostenstelle, Summen gehen exakt auf', async ({ openAs, api }) => {
  const wirt = await openAs('u-gasthaus', 'desktop', '/business/schnellbestellung');
  await expect(wirt.getByRole('heading', { level: 1, name: 'Schnellbestellung' })).toBeVisible();
  await expect(wirt.getByText(/inkl\. 8 % Kundenrabatt bzw\. Staffelpreis/)).toBeVisible();

  const hellRow = wirt.getByRole('row').filter({ has: wirt.getByRole('textbox', { name: 'Menge – Augustiner Lagerbier Hell', exact: true }) });
  const speziRow = wirt.getByRole('row').filter({ has: wirt.getByRole('textbox', { name: 'Menge – Paulaner Spezi', exact: true }) });
  // Nettopreise: 8 % Gastro-Rabatt auf den Netto-Listenpreis, Staffel ab 25 Kästen
  await expect(hellRow).toContainText(/15,07\s€\s*statt 16,38\s€/);
  await expect(hellRow).toContainText(/ab 25: 14,89\s€/);

  await wirt.getByRole('textbox', { name: 'Menge – Augustiner Lagerbier Hell', exact: true }).fill('30');
  await wirt.getByRole('textbox', { name: 'Menge – Paulaner Spezi', exact: true }).fill('5');
  // Staffelpreis gewinnt (günstiger als der Rabatt): 30 × 14,89 € = 446,70 €; Spezi mit Rabatt: 5 × 11,59 € = 57,95 €
  await expect(hellRow).toContainText(/446,70\s€/);
  await expect(speziRow).toContainText(/57,95\s€/);

  const summary = wirt.getByRole('complementary').filter({ has: wirt.getByRole('heading', { name: 'Ihre Bestellung' }) });
  await expect(summary).toContainText('2 Positionen · 35 Gebinde');
  await expect.poll(() => termValue(summary, 'Warenwert netto')).toBe(44670 + 5795);
  const itemsNet = await termValue(summary, 'Warenwert netto');
  const depositNet = await termValue(summary, 'Pfand netto');
  const vat = await termValue(summary, 'zzgl. MwSt. 19 %');
  const gross = await termValue(summary, 'Gesamt brutto');
  expect(depositNet).toBe(Math.round((35 * 310) / 1.19));
  expect(vat).toBe(Math.round((itemsNet + depositNet) * 0.19));
  expect(itemsNet + depositNet + vat).toBe(gross);

  await summary.getByRole('combobox', { name: 'Kostenstelle' }).selectOption('Biergarten');
  await summary.getByRole('button', { name: 'Direkt zur Kasse' }).click();

  // Kasse: Lieferung, erstes freies Fenster, Rechnung, Kostenstelle + Referenz
  await expect(wirt).toHaveURL(/\/kasse$/);
  await expect(wirt.getByRole('radio', { name: /^Gaststätte/ })).toBeChecked();
  await chooseFirstFreeSlot(wirt);
  await expect(wirt.getByRole('combobox', { name: 'Kostenstelle' })).toHaveValue('Biergarten');
  await wirt.getByRole('textbox', { name: 'Ihre Bestellreferenz' }).fill('E2E Biergarten KW');
  await choose(wirt.getByRole('radio', { name: /^Kauf auf Rechnung/ }));
  const checkoutSummary = wirt.getByRole('region', { name: 'Ihre Bestellung' });
  await expect(checkoutSummary).toContainText('Nettopreise');
  await expect(checkoutSummary).toContainText('Staffelpreis ab 25');
  await expect(checkoutSummary).toContainText(`Gesamtbetrag`);
  await expect.poll(() => termValue(checkoutSummary, 'zzgl. MwSt. 19 %')).toBe(vat);
  await submitOrder(wirt);

  const number = await orderNumberFromHeading(wirt);
  const orderId = orderIdFromUrl(wirt);
  const order = await api.order(orderId);
  expect(order.paymentMethod).toBe('invoice');
  expect(order.costCenter).toBe('Biergarten');
  expect(order.reference).toBe('E2E Biergarten KW');
  expect(order.totals.total).toBe(gross);
  expect(order.lines.find((l) => l.productId === 'augustiner-hell')?.unitNet).toBe(1489);

  // Markt: Bestellung Schritt für Schritt bis „zugestellt“
  const markt = await openAs('u-admin', 'desktop', `/admin/bestellungen/${orderId}`);
  await expect(markt.getByRole('heading', { level: 1, name: new RegExp(`^Bestellung ${number}`) })).toBeVisible();
  for (const step of ['Bestätigen', 'Kommissionierung starten', 'Als verladen markieren', 'Als unterwegs markieren', 'Als zugestellt markieren']) {
    await nextStatusClick(markt, step);
    await expect(markt.getByRole('button', { name: step, exact: true })).toHaveCount(0);
  }
  await expect.poll(async () => (await api.order(orderId)).status).toBe('delivered');

  // Rechnungslauf nur für das Gasthaus
  await markt.goto('/admin/rechnungen');
  await markt.getByRole('button', { name: /^Rechnungslauf/ }).click();
  const run = markt.getByRole('dialog', { name: 'Rechnungslauf' });
  await expect(run).toBeVisible();
  const boxes = run.getByRole('checkbox');
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    const label = (await box.evaluate((el) => el.closest('label')?.textContent ?? '')) || '';
    const want = label.includes('Gasthaus Zum Mühlbach');
    if ((await box.isChecked()) !== want) await box.setChecked(want, { force: true });
  }
  const gasthausBox = run.getByRole('checkbox', { name: /Gasthaus Zum Mühlbach/ });
  await expect(gasthausBox).toBeChecked();
  await expect(run.getByText(new RegExp(number))).toBeVisible();
  await run.getByRole('button', { name: '1 Rechnung erstellen' }).click();
  await expect(run.getByText('1 Rechnung über')).toBeVisible();
  const invoiceLink = run.getByRole('link', { name: /^Druckansicht RE-/ });
  const invoiceNumber = ((await invoiceLink.getAttribute('aria-label')) ?? '').replace('Druckansicht ', '');
  expect(invoiceNumber).toMatch(/^RE-\d{4}-\d+$/);

  const invoiced = await api.order(orderId);
  expect(invoiced.invoiceId).toBeTruthy();

  // Gasthaus öffnet die Rechnung über die Übersicht (Benachrichtigung ist eingegangen)
  await wirt.goto('/business/rechnungen');
  await wirt.getByRole('link', { name: new RegExp(invoiceNumber) }).first().click();
  await expect(wirt).toHaveURL(new RegExp(`/business/rechnungen/${invoiced.invoiceId}$`));
  const doc = wirt.getByRole('article', { name: `Rechnung ${invoiceNumber}` });
  await expect(doc).toBeVisible();
  // nur ein Zurück-Knopf (Pfeil im Seitenkopf)
  await expect(wirt.getByRole('main').getByRole('button', { name: 'Zurück' })).toHaveCount(1);
  await expect(wirt.getByRole('main').getByRole('link', { name: 'Zurück' })).toHaveCount(0);

  // Lieferschein der neuen Bestellung mit Kostenstelle und Referenz
  await expect(doc.getByRole('link', { name: number })).toBeVisible();
  await expect(doc).toContainText('Ihre Ref.: E2E Biergarten KW · Kostenstelle: Biergarten · Kauf auf Rechnung');

  // Positionen: Menge × Einzel netto = Gesamt netto; Summe der Positionen je Lieferschein = Warenwert netto
  let linesSum = 0;
  let depositSum = 0;
  let refundSum = 0;
  let deliverySum = 0;
  for (const row of await doc.getByRole('row').all()) {
    const cells = await rowCells(row);
    if (cells.length === 7 && /^\d+$/.test(cells[0])) {
      const qty = Number(cells[3]);
      const unit = parseEuro(cells[4]);
      const total = parseEuro(cells[6]);
      expect(qty * unit, `Position ${cells[2]}`).toBe(total);
      linesSum += total;
    } else if (cells.length === 7 && /^Pfand /.test(cells[2])) depositSum += parseEuro(cells[6]);
    else if (cells.length === 7 && /^Leergut-Rücknahme /.test(cells[2])) refundSum += parseEuro(cells[6]);
    else if (cells.length === 2 && /^Summe Lieferschein .* netto$/.test(cells[0])) deliverySum += parseEuro(cells[1]);
  }
  expect(linesSum).toBeGreaterThan(0);
  const warenwert = await termValue(doc, 'Warenwert netto');
  const pfand = await termValue(doc, 'Pfand netto');
  const summeNetto = await termValue(doc, 'Summe netto');
  const mwst = await termValue(doc, 'zzgl. MwSt. 19 %');
  const brutto = await termValue(doc, 'Rechnungsbetrag');
  expect(linesSum).toBe(warenwert);
  expect(depositSum).toBe(pfand);
  const leergut = (await doc.getByRole('term').filter({ hasText: /^\s*Leergut-Rücknahme\s+netto\s*$/ }).count()) ? await termValue(doc, 'Leergut-Rücknahme netto') : 0;
  expect(refundSum).toBe(leergut);
  expect(warenwert + pfand + leergut).toBe(summeNetto);
  expect(deliverySum).toBe(summeNetto);
  // Netto + MwSt. = Brutto, MwSt. = 19 % der Nettosumme
  expect(summeNetto + mwst).toBe(brutto);
  expect(mwst).toBe(Math.round(summeNetto * 0.19));

  // dieselben Werte wie im Server
  const { invoice } = await api.as<{ invoice: { gross: number; vat: number; net: number; deposit: number; depositRefund: number } }>('u-gasthaus', 'getInvoice', [invoiced.invoiceId]);
  expect(invoice.gross).toBe(brutto);
  expect(invoice.vat).toBe(mwst);
  expect(invoice.net + invoice.deposit - invoice.depositRefund).toBe(summeNetto);
  // Kopfzeile: Status „Offen“ und derselbe Rechnungsbetrag
  const header = pageHeader(wirt);
  await expect(header).toContainText('Offen');
  expect(parseEuro((await header.textContent()) ?? '')).toBe(brutto);
});
