import type { ReactNode } from 'react';
import type { CustomerType, FulfillmentType, Totals, VatBreakdownLine } from '@shared/types';
import { formatEuro } from '@shared/format';
import { cn } from '@/lib/cn';

export interface TotalsBlockProps {
  totals: Totals;
  customerType: CustomerType;
  fulfillment: FulfillmentType;
  couponCode?: string;
  /** Liefergebiet (für "Liefergebühr · Garching") */
  zoneName?: string;
  className?: string;
  /** Endbetrag-Bezeichnung, z. B. "Gesamtbetrag" */
  totalLabel?: string;
}

interface Row {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'credit' | 'muted' | 'strong';
}

const rateLabel = (rate: number) => `${String(rate).replace('.', ',')} %`;

/**
 * MwSt. ausschließlich aus dem Core: `totals.vatBreakdown` (je Satz, inkl. Pfand, Gebühren, abzgl. Gutschriften)
 * bzw. – falls (noch) nicht vorhanden – `totals.vat`. Keine eigene Herleitung im Frontend.
 */
export function vatSummary(t: Totals): { vat: number; lines: VatBreakdownLine[] | null; net: number } {
  const lines = t.vatBreakdown?.length ? [...t.vatBreakdown].sort((a, b) => b.rate - a.rate) : null;
  const vat = lines ? lines.reduce((s, l) => s + l.vat, 0) : t.vat;
  const net = lines ? lines.reduce((s, l) => s + l.net, 0) : t.total - vat;
  return { vat, lines, net };
}

/** "inkl. 12,34 € MwSt." – bei mehreren Sätzen mit Aufschlüsselung */
export function vatIncludedText(t: Totals): string {
  const { vat, lines } = vatSummary(t);
  const parts = lines && lines.length > 1 ? ` (${lines.map((l) => `${rateLabel(l.rate)}: ${formatEuro(l.vat)}`).join(', ')})` : lines?.length === 1 ? ` (${rateLabel(lines[0].rate)})` : '';
  return `inkl. ${formatEuro(vat)} MwSt.${parts}`;
}

/**
 * Summenblock für Kasse und Bestelldetail.
 * Privatkunden: Bruttobeträge, darunter „inkl. x € MwSt.“ (auch auf Pfand, abzgl. Leergut-Gutschrift).
 * Geschäftskunden: Warenwert netto, Pfand/Gebühren netto, Nettobetrag je Satz + MwSt. je Satz = Gesamtbetrag.
 */
export function TotalsBlock({ totals: t, customerType, fulfillment, couponCode, zoneName, className, totalLabel = 'Gesamtbetrag' }: TotalsBlockProps) {
  const b2b = customerType === 'b2b';
  const rows: Row[] = [];
  const payout = t.total < 0;
  const coupon = couponCode ? <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-700">{couponCode}</span> : null;
  const zone = zoneName ? <span className="hidden text-slate-400 sm:inline"> · {zoneName}</span> : null;

  if (b2b) {
    const { vat, lines, net } = vatSummary(t);
    rows.push({ label: 'Warenwert netto', value: formatEuro(t.netParts?.items ?? t.itemsNet) });
    if (fulfillment === 'delivery' && t.deliveryFee === 0) {
      rows.push({ label: <>Lieferung{zone}</>, value: <span className="font-semibold text-emerald-700">kostenlos</span> });
    }
    const parts = t.netParts;
    if (parts) {
      // Nettowerte der Bestandteile kommen vom Core: items − discount + deposit − depositRefund + Gebühren = Σ Netto
      if (parts.discount > 0) rows.push({ label: <>Gutschein netto{coupon}</>, value: formatEuro(-parts.discount), tone: 'credit' });
      if (parts.deliveryFee > 0) rows.push({ label: <>Liefergebühr netto{zone}</>, value: formatEuro(parts.deliveryFee) });
      if (parts.carryFee > 0) rows.push({ label: 'Tragservice netto', value: formatEuro(parts.carryFee) });
      if (parts.deposit > 0) rows.push({ label: 'Pfand netto', value: formatEuro(parts.deposit) });
      if (parts.depositRefund > 0) rows.push({ label: 'Leergut-Gutschrift netto', value: formatEuro(-parts.depositRefund), tone: 'credit' });
    } else {
      // ältere Bestellungen ohne netParts: Pfand, Gebühren und Gutschriften zusammengefasst
      // (= Nettobetrag des Cores − Warenwert netto) → alle Zeilen ergeben exakt den Endbetrag
      const extras: string[] = [];
      if (t.deposit > 0) extras.push('Pfand');
      if (t.deliveryFee > 0) extras.push('Liefergebühr');
      if (t.carryFee > 0) extras.push('Tragservice');
      if (t.discount > 0) extras.push('Gutschein');
      if (t.depositRefund > 0) extras.push('Leergut-Gutschrift');
      const extraNet = net - t.itemsNet;
      if (extras.length || extraNet !== 0) {
        const label = extras.length ? `${extras.length > 1 ? `${extras.slice(0, -1).join(', ')} & ${extras[extras.length - 1]}` : extras[0]} netto` : 'Gebühren netto';
        rows.push({
          label: (
            <>
              {label}
              {t.discount > 0 ? coupon : null}
            </>
          ),
          value: formatEuro(extraNet),
          tone: extraNet < 0 ? 'credit' : 'default',
        });
      }
    }
    const netRows: Row[] = [];
    if (lines && lines.length) {
      for (const l of lines) netRows.push({ label: `Nettobetrag ${rateLabel(l.rate)}`, value: formatEuro(l.net), tone: 'strong' });
      for (const l of lines) netRows.push({ label: `zzgl. MwSt. ${rateLabel(l.rate)}`, value: formatEuro(l.vat) });
    } else {
      netRows.push({ label: 'Nettobetrag', value: formatEuro(net), tone: 'strong' });
      netRows.push({ label: 'zzgl. MwSt.', value: formatEuro(vat) });
    }
    return (
      <div className={cn('text-[15px]', className)}>
        <RowList rows={rows} />
        <div className="mt-3 border-t border-slate-200 pt-3">
          <RowList rows={netRows} />
        </div>
        <Total label={payout ? 'Auszahlung an Sie' : totalLabel} total={t.total} />
        <p className="mt-1 text-right text-xs text-slate-500">Bruttobetrag inkl. MwSt. und Pfand</p>
      </div>
    );
  }

  rows.push({ label: 'Warenwert', value: formatEuro(t.itemsGross) });
  if (t.discount > 0) rows.push({ label: <>Gutschein{coupon}</>, value: formatEuro(-t.discount), tone: 'credit' });
  if (fulfillment === 'delivery') {
    rows.push({
      label: <>Liefergebühr{zone}</>,
      value: t.deliveryFee > 0 ? formatEuro(t.deliveryFee) : <span className="font-semibold text-emerald-700">kostenlos</span>,
    });
  }
  if (t.carryFee > 0) rows.push({ label: 'Tragservice', value: formatEuro(t.carryFee) });
  if (t.deposit > 0) rows.push({ label: 'Pfand', value: formatEuro(t.deposit) });
  if (t.depositRefund > 0) rows.push({ label: 'Leergut-Gutschrift', value: formatEuro(-t.depositRefund), tone: 'credit' });

  return (
    <div className={cn('text-[15px]', className)}>
      <RowList rows={rows} />
      <Total label={payout ? 'Auszahlung an Sie' : totalLabel} total={t.total} />
      <p className="mt-1 text-right text-xs text-slate-500">
        {vatIncludedText(t)}
        {t.deposit > 0 || t.depositRefund > 0 ? ' · auch auf Pfand' : ''}
      </p>
    </div>
  );
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <dl className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4">
          <dt className={cn('min-w-0', r.tone === 'strong' ? 'font-semibold text-slate-700' : 'text-slate-600')}>{r.label}</dt>
          <dd
            className={cn(
              'shrink-0 tabular-nums',
              r.tone === 'credit' ? 'font-medium text-emerald-700' : r.tone === 'strong' ? 'font-semibold text-slate-900' : 'text-slate-900',
            )}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Total({ label, total }: { label: string; total: number }) {
  const payout = total < 0;
  return (
    <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
      <span className="font-bold text-slate-900">{label}</span>
      <span className={cn('whitespace-nowrap text-xl font-bold tabular-nums tracking-tight', payout ? 'text-emerald-700' : 'text-slate-900')}>{formatEuro(Math.abs(total))}</span>
    </div>
  );
}
