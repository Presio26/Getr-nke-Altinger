import { Link } from 'react-router-dom';
import { AlertTriangle, PackageX, PartyPopper, Trash2 } from 'lucide-react';
import type { OrderLine, Product, QuoteMessage } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useCart } from '@/stores/cart';
import { ProductImage, productTint } from '@/components/product';
import { Badge, QuantityStepper, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

interface CartLineProps {
  productId: string;
  qty: number;
  product: Product | undefined;
  /** Preise (aus api.quote bzw. lokal berechnet) */
  line: OrderLine | undefined;
  showNet: boolean;
  errors: QuoteMessage[];
  /** Sortiment noch nicht geladen */
  loading: boolean;
}

/** Warenkorb-Position: Bild, Name, Stückpreis, Pfand, Mengen-Stepper, Entfernen, Zeilensumme */
export function CartLine({ productId, qty, product, line, showNet, errors, loading }: CartLineProps) {
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);

  if (loading && !product) {
    return (
      <li className="flex gap-3 p-4 sm:gap-4 sm:p-5">
        <Skeleton className="h-20 w-20 shrink-0 rounded-xl sm:h-24 sm:w-24" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-3 h-9 w-32 rounded-xl" />
        </div>
      </li>
    );
  }

  if (!product) {
    return (
      <li className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 sm:h-24 sm:w-24">
          <PackageX size={28} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Artikel nicht mehr verfügbar</p>
          <p className="text-sm text-slate-500">Dieser Artikel wurde aus dem Sortiment genommen. Bitte entfernen Sie ihn.</p>
        </div>
        <button
          type="button"
          onClick={() => remove(productId)}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <Trash2 size={17} aria-hidden /> Entfernen
        </button>
      </li>
    );
  }

  const label = `${product.brand} ${product.name}`;
  const unit = line ? (showNet ? line.unitNet : line.unitGross) : undefined;
  const regular = line ? line.regularUnitGross : undefined;
  const total = line ? (showNet ? line.lineNet : line.lineGross) : undefined;
  const discounted = line ? line.unitGross < line.regularUnitGross : false;
  const offerLike = discounted && !!line?.priceNote && !/Rabatt|Staffel/.test(line.priceNote);
  const max = product.isRental ? Math.max(1, product.stock) : 999;
  const unavailable = !product.active || (!product.isRental && product.stock <= 0);
  const href = `/produkt/${product.id}`;

  return (
    <li className="p-4 sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <Link
          to={href}
          aria-label={label}
          className={cn('relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-900/5 sm:h-24 sm:w-24', unavailable && 'opacity-50')}
          style={{ background: productTint(product) }}
        >
          <ProductImage product={product} className="absolute inset-0 p-1.5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{product.brand}</p>
              <Link to={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 hover:text-brand-700">
                {product.name}
              </Link>
              <p className="truncate text-[13px] text-slate-500">{product.packaging}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(productId)}
              aria-label={`${label} entfernen`}
              className="-mr-1.5 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 sm:hidden"
            >
              <Trash2 size={18} aria-hidden />
            </button>
            <div className="hidden shrink-0 text-right sm:block">
              {total !== undefined ? (
                <p className="text-base font-bold tabular-nums text-slate-900">{formatEuro(total)}</p>
              ) : (
                <Skeleton className="ml-auto h-5 w-16" />
              )}
              {line && line.depositTotal > 0 ? <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">+ {formatEuro(line.depositTotal)} Pfand</p> : null}
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
            {unit !== undefined ? (
              <span className="tabular-nums">
                <span className={cn('font-semibold', discounted ? (offerLike ? 'text-red-600' : 'text-brand-700') : 'text-slate-700')}>{formatEuro(unit)}</span>
                {discounted && !showNet && regular !== undefined ? <s className="ml-1 text-slate-400">{formatEuro(regular)}</s> : null}
                {showNet ? ' netto' : ''} {product.isRental ? 'pro Veranstaltung' : 'je Stück'}
              </span>
            ) : null}
            {line?.priceNote && discounted ? (
              <Badge tone={offerLike ? 'accent' : 'brand'} className="text-[11px]">
                {line.priceNote}
              </Badge>
            ) : null}
            {product.isRental ? (
              <Badge tone="brand" icon={PartyPopper} className="text-[11px]">
                Leihartikel
              </Badge>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <QuantityStepper value={qty} onChange={(n) => setQty(productId, n)} size="sm" min={1} max={Math.max(max, qty)} label={label} />
              <button
                type="button"
                onClick={() => remove(productId)}
                aria-label={`${label} entfernen`}
                className="ml-1 hidden h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 sm:inline-flex"
              >
                <Trash2 size={16} aria-hidden /> Entfernen
              </button>
            </div>
            <div className="text-right sm:hidden">
              {total !== undefined ? <p className="text-base font-bold tabular-nums text-slate-900">{formatEuro(total)}</p> : <Skeleton className="h-5 w-16" />}
              {line && line.depositTotal > 0 ? <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">+ {formatEuro(line.depositTotal)} Pfand</p> : null}
            </div>
          </div>
        </div>
      </div>
      {errors.map((e) => (
        <p key={e.message} className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            {e.message}
            {product.stock > 0 && product.stock < qty && !product.isRental ? (
              <button type="button" onClick={() => setQty(productId, product.stock)} className="ml-1.5 font-semibold underline underline-offset-2">
                Auf {product.stock} reduzieren
              </button>
            ) : null}
          </span>
        </p>
      ))}
    </li>
  );
}
