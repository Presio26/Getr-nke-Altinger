import type { Product } from '@shared/types';
import { formatEuro } from '@shared/format';
import { usePrice } from '@/api/hooks';
import { cn } from '@/lib/cn';

export interface PriceDisplayProps {
  product: Product;
  qty?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Zusatzzeilen (Pfand, Grundpreis, Hinweis) ausblenden */
  compact?: boolean;
}

const PRICE_SIZE = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl sm:text-4xl' } as const;

/**
 * Preis nach Preisangabenverordnung: Endpreis, ggf. durchgestrichener Normalpreis,
 * "zzgl. x € Pfand", Grundpreis; Geschäftskunden sehen Nettopreise.
 */
export function PriceDisplay({ product, qty = 1, size = 'md', className, compact = false }: PriceDisplayProps) {
  const price = usePrice(product, qty);
  const { displayUnit, displayRegular, discounted, showNet, depositUnit, basePriceText, note, isOffer } = price;
  // Rot nur für Angebote; Kundenrabatte/Staffelpreise (B2B) in Markenfarbe
  const priceColor = !discounted ? 'text-slate-900' : isOffer ? 'text-red-600' : 'text-brand-700';
  const rental = !!product.isRental;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cn('font-bold tracking-tight tabular-nums', PRICE_SIZE[size], priceColor)}>
          {formatEuro(displayUnit)}
        </span>
        {discounted ? (
          <s className={cn('tabular-nums text-slate-400', size === 'lg' ? 'text-lg' : 'text-sm')}>
            <span className="sr-only">statt </span>
            {formatEuro(displayRegular)}
          </s>
        ) : null}
        {showNet && compact ? <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">netto</span> : null}
      </div>
      {!compact ? (
        <div className={cn('mt-0.5 space-y-0.5 leading-snug text-slate-500', size === 'lg' ? 'text-sm' : 'text-xs')}>
          {rental ? <p>pro Veranstaltung{showNet ? ', zzgl. MwSt.' : ' inkl. MwSt.'}</p> : null}
          {!rental ? <p>{depositUnit > 0 ? <>zzgl. {formatEuro(depositUnit)} Pfand</> : 'pfandfrei'}</p> : null}
          {!rental && basePriceText ? <p className="tabular-nums">{showNet ? `Grundpreis ${basePriceText} brutto` : `Grundpreis ${basePriceText}`}</p> : null}
          {showNet && !rental ? <p>netto zzgl. MwSt.</p> : null}
          {note && discounted ? <p className={cn('font-medium', isOffer ? 'text-red-600' : 'text-brand-700')}>{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
