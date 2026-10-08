import { Package } from 'lucide-react';
import type { OrderLine, Product } from '@shared/types';
import { formatEuro } from '@shared/format';
import { ProductImage } from '@/components/product';
import { cn } from '@/lib/cn';

export interface OrderLinesListProps {
  lines: OrderLine[];
  /** id → Produkt (für die Illustration); fehlende Artikel zeigen ein Symbol */
  products: Map<string, Product>;
  /** Nettopreise (Geschäftskunde) */
  showNet: boolean;
  /** kompakte Darstellung (Kassen-Zusammenfassung) */
  compact?: boolean;
  className?: string;
}

/** Bestellpositionen mit Illustration, Menge × Einzelpreis, Pfand und Positionssumme */
export function OrderLinesList({ lines, products, showNet, compact = false, className }: OrderLinesListProps) {
  return (
    <ul className={cn('divide-y divide-slate-100', className)}>
      {lines.map((line) => {
        const product = products.get(line.productId);
        const unit = showNet ? line.unitNet : line.unitGross;
        const regular = showNet ? Math.round(line.regularUnitGross / (1 + line.vatRate / 100)) : line.regularUnitGross;
        const total = showNet ? line.lineNet : line.lineGross;
        const discounted = regular > unit;
        return (
          <li key={line.productId} className={cn('flex gap-3', compact ? 'py-2.5' : 'py-3.5')}>
            <div
              className={cn(
                'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 ring-1 ring-inset ring-slate-200/70',
                compact ? 'h-12 w-12 p-0.5' : 'h-16 w-16 p-1',
              )}
            >
              {product ? <ProductImage product={product} /> : <Package size={22} className="text-slate-400" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className={cn('min-w-0 font-semibold leading-snug text-slate-900', compact ? 'text-sm' : 'text-[15px]')}>
                  <span className="tabular-nums text-slate-500">{line.qty}× </span>
                  {line.name}
                </p>
                <p className={cn('shrink-0 font-semibold tabular-nums text-slate-900', compact ? 'text-sm' : 'text-[15px]')}>{formatEuro(total)}</p>
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
                {line.packaging}
                {line.isRental ? ' · Leihartikel' : ''}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-500">
                <span className="tabular-nums">
                  {formatEuro(unit)}
                  {showNet ? ' netto' : ''} / Stück
                </span>
                {discounted ? <s className="tabular-nums text-slate-400">{formatEuro(regular)}</s> : null}
                {line.depositTotal > 0 ? <span className="tabular-nums">+ {formatEuro(line.depositUnit)} Pfand</span> : null}
                {line.priceNote ? (
                  <span className="rounded-md bg-accent-50 px-1.5 py-px text-xs font-semibold text-accent-800 ring-1 ring-inset ring-accent-200/70">{line.priceNote}</span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
