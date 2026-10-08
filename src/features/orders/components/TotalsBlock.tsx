import type { ReactNode } from 'react';
import type { CustomerType, FulfillmentType, Totals } from '@shared/types';
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
  tone?: 'default' | 'credit' | 'muted';
}

/**
 * B2B-Nettowerte: Positionen (netto) + anteilig entsteuerte Gebühren/Rabatte; die MwSt. ergibt sich so,
 * dass alle Zeilen exakt den Endbetrag ergeben (Rundung je Position kann sonst wenige Cent abweichen).
 */
function b2bNet(t: Totals) {
  const ratio = t.itemsGross > 0 ? t.itemsNet / t.itemsGross : 1 / 1.19;
  const discountNet = Math.round(t.discount * ratio);
  const deliveryNet = Math.round(t.deliveryFee * ratio);
  const carryNet = Math.round(t.carryFee * ratio);
  const netSum = t.itemsNet - discountNet + deliveryNet + carryNet;
  const vat = t.total - t.deposit + t.depositRefund - netSum;
  return { netSum, discountNet, deliveryNet, carryNet, vat, withExtras: discountNet > 0 || deliveryNet > 0 || carryNet > 0 };
}

/**
 * Summenblock für Kasse und Bestelldetail.
 * Privatkunden: Bruttobeträge (MwSt. enthalten). Geschäftskunden: Nettobeträge zzgl. MwSt.
 */
export function TotalsBlock({ totals: t, customerType, fulfillment, couponCode, zoneName, className, totalLabel = 'Gesamtbetrag' }: TotalsBlockProps) {
  const b2b = customerType === 'b2b';
  const rows: Row[] = [];
  const net = b2b ? b2bNet(t) : null;

  rows.push({ label: b2b ? 'Warenwert netto' : 'Warenwert', value: formatEuro(b2b ? t.itemsNet : t.itemsGross) });
  if (t.discount > 0) {
    rows.push({
      label: <>Gutschein{couponCode ? <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-700">{couponCode}</span> : null}</>,
      value: formatEuro(-(net ? net.discountNet : t.discount)),
      tone: 'credit',
    });
  }
  if (fulfillment === 'delivery') {
    const fee = net ? net.deliveryNet : t.deliveryFee;
    rows.push({
      label: <>Liefergebühr{zoneName ? <span className="hidden text-slate-400 sm:inline"> · {zoneName}</span> : null}</>,
      value: fee > 0 ? formatEuro(fee) : <span className="font-semibold text-emerald-700">kostenlos</span>,
    });
  }
  if (t.carryFee > 0) rows.push({ label: 'Tragservice', value: formatEuro(net ? net.carryNet : t.carryFee) });
  if (b2b && net) {
    if (net.withExtras) {
      rows.push({ label: <span className="font-semibold text-slate-700">Nettosumme</span>, value: <span className="font-semibold">{formatEuro(net.netSum)}</span> });
    }
    rows.push({ label: 'zzgl. MwSt.', value: formatEuro(net.vat) });
  }
  if (t.deposit > 0) rows.push({ label: 'Pfand', value: formatEuro(t.deposit) });
  if (t.depositRefund > 0) rows.push({ label: 'Leergut-Gutschrift', value: formatEuro(-t.depositRefund), tone: 'credit' });

  const payout = t.total < 0;

  return (
    <div className={cn('text-[15px]', className)}>
      <dl className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <dt className="min-w-0 text-slate-600">{r.label}</dt>
            <dd className={cn('shrink-0 tabular-nums', r.tone === 'credit' ? 'font-medium text-emerald-700' : 'text-slate-900')}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
        <span className="font-bold text-slate-900">{payout ? 'Auszahlung an Sie' : totalLabel}</span>
        <span className={cn('text-xl font-bold tabular-nums tracking-tight', payout ? 'text-emerald-700' : 'text-slate-900')}>{formatEuro(Math.abs(t.total))}</span>
      </div>
      <p className="mt-1 text-right text-xs text-slate-500">
        {b2b ? 'Bruttobetrag inkl. MwSt. und Pfand' : `inkl. ${formatEuro(t.vat)} MwSt.`}
      </p>
    </div>
  );
}
