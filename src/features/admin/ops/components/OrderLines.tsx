/**
 * Positionen, Leergut und Summen einer Bestellung (Detail, Schnellansicht, Abholung).
 */
import { Recycle } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useDepositTypes } from '@/api/hooks';
import { Badge, Money } from '@/components/ui';
import { cn } from '@/lib/cn';

export function OrderLinesList({ order, compact = false }: { order: Order; compact?: boolean }) {
  const b2b = order.customerType === 'b2b';
  return (
    <ul className="divide-y divide-slate-100">
      {order.lines.map((l) => (
        <li key={l.productId} className={cn('flex items-start gap-3', compact ? 'py-2' : 'py-3')}>
          <span className="flex h-8 min-w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-2 text-sm font-bold tabular-nums text-slate-800">
            {l.qty}×
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug text-slate-900">{l.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
              <span>{l.packaging}</span>
              {!compact ? (
                <span className="tabular-nums">
                  je {formatEuro(b2b ? l.unitNet : l.unitGross)}
                  {b2b ? ' netto' : ''}
                  {l.depositUnit ? ` + ${formatEuro(l.depositUnit)} Pfand` : ''}
                </span>
              ) : null}
              {l.isRental ? <Badge tone="info">Leihartikel</Badge> : null}
              {l.priceNote && !compact ? <Badge tone="accent">{l.priceNote}</Badge> : null}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Money cents={l.lineGross} className="text-[15px] font-semibold text-slate-900" />
            {!compact && l.regularUnitGross > l.unitGross ? (
              <div>
                <Money cents={l.regularUnitGross * l.qty} strike className="text-xs" />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Leergut, das der Kunde zurückgibt (bzw. das bei der Zustellung mitgenommen wurde) */
export function EmptiesList({ lines, title = 'Leergut-Rückgabe', className }: { lines: Order['emptiesReturn']; title?: string; className?: string }) {
  const types = useDepositTypes();
  if (!lines.length) return null;
  return (
    <div className={cn('rounded-xl bg-emerald-50/70 p-3 ring-1 ring-inset ring-emerald-100', className)}>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
        <Recycle size={15} aria-hidden />
        {title}
      </p>
      <ul className="space-y-1 text-sm text-emerald-900/90">
        {lines.map((l) => {
          const t = types.find((x) => x.id === l.depositTypeId);
          return (
            <li key={l.depositTypeId} className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-semibold tabular-nums">{l.qty}×</span> {t?.shortName ?? l.depositTypeId}
              </span>
              {t ? <span className="tabular-nums">{formatEuro(-t.amount * l.qty)}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function OrderTotals({ order, className }: { order: Order; className?: string }) {
  const t = order.totals;
  const rows: [string, number, boolean?][] = [
    [order.customerType === 'b2b' ? `Warenwert (netto ${formatEuro(t.itemsNet)})` : 'Warenwert', t.itemsGross],
  ];
  if (t.discount) rows.push([`Gutschein${order.couponCode ? ` ${order.couponCode}` : ''}`, -t.discount]);
  if (t.deposit) rows.push(['Pfand', t.deposit]);
  if (t.depositRefund) rows.push(['Leergut-Gutschrift', -t.depositRefund]);
  if (order.fulfillment === 'delivery') rows.push(['Liefergebühr', t.deliveryFee]);
  if (t.carryFee) rows.push(['Tragservice', t.carryFee]);
  return (
    <dl className={cn('space-y-1.5 text-sm', className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-slate-500">{label}</dt>
          <dd className={cn('font-medium tabular-nums', value < 0 ? 'text-emerald-700' : 'text-slate-800')}>
            {label === 'Liefergebühr' && value === 0 ? 'kostenlos' : formatEuro(value)}
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5">
        <dt className="text-base font-bold text-slate-900">{t.total < 0 ? 'Auszahlung' : 'Gesamt'}</dt>
        <dd className="text-lg font-bold tabular-nums text-slate-900">{formatEuro(Math.abs(t.total))}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 text-xs text-slate-400">
        <dt>enthaltene MwSt.</dt>
        <dd className="tabular-nums">{formatEuro(t.vat)}</dd>
      </div>
    </dl>
  );
}
