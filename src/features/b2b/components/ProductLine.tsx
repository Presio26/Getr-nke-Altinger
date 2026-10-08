import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Customer, DepositType, Product, TierPrice } from '@shared/types';
import { formatEuro } from '@shared/format';
import { computePrice } from '@/api/hooks';
import { useCart, useCartQty } from '@/stores/cart';
import { Button, QuantityStepper, toast } from '@/components/ui';
import { ProductImage, productTint } from '@/components/product';
import { cn } from '@/lib/cn';

/**
 * Günstigere Staffel, die ab einer höheren Menge gilt (z. B. „ab 25: 14,89 €“).
 * Nur Staffeln, die den aktuellen Netto-Stückpreis unterbieten.
 */
export function betterTier(product: Product, currentUnitNet: number, qty: number): TierPrice | undefined {
  return [...(product.tierPrices ?? [])]
    .sort((a, b) => a.minQty - b.minQty)
    .find((t) => t.minQty > qty && t.priceNet < currentUnitNet);
}

/** Kleine Produktabbildung auf getöntem Grund */
export function ProductThumb({ product, size = 48, className }: { product: Product; size?: number; className?: string }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl', className)}
      style={{ width: size, height: size, backgroundColor: productTint(product) }}
    >
      <ProductImage product={product} size={Math.round(size * 0.86)} />
    </span>
  );
}

/**
 * Artikelzeile für das Standardsortiment: Netto-Preis, Staffel-Hinweis und Schnell-Hinzufügen
 * (übliche Menge; liegt der Artikel schon im Warenkorb, erscheint der Mengen-Stepper).
 */
export function UsualProductLine({
  product,
  customer,
  depositTypes,
  typicalQty,
  orderCount,
}: {
  product: Product;
  customer: Customer | null;
  depositTypes: DepositType[];
  typicalQty: number;
  orderCount: number;
}) {
  const inCart = useCartQty(product.id);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const price = computePrice(product, customer, Math.max(1, inCart || typicalQty), depositTypes);
  const tier = betterTier(product, price.unitNet, Math.max(1, inCart || typicalQty));
  const soldOut = product.stock <= 0;

  const onAdd = () => {
    add(product.id, typicalQty);
    toast.success(`${typicalQty} × ${product.brand} ${product.name} im Warenkorb`, {
      id: `usual-${product.id}`,
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
      duration: 3000,
    });
  };

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <Link to={`/produkt/${product.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
        <ProductThumb product={product} size={52} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/produkt/${product.id}`} className="block truncate text-[15px] font-semibold text-slate-900 hover:text-brand-700">
          {product.brand} {product.name}
        </Link>
        <p className="truncate text-[13px] text-slate-500">
          {product.packaging} · {orderCount}× bestellt
        </p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-bold tabular-nums text-slate-900">{formatEuro(price.unitNet)}</span>
          <span className="text-slate-500">netto{price.depositUnit ? ` + ${formatEuro(price.depositUnit)} Pfand` : ''}</span>
          {tier ? (
            <span className="font-medium text-brand-700">
              ab {tier.minQty}: {formatEuro(tier.priceNet)}
            </span>
          ) : null}
        </p>
      </div>
      <div className="shrink-0">
        {inCart > 0 ? (
          <QuantityStepper size="sm" value={inCart} onChange={(n) => setQty(product.id, n)} removeAtMin label={`${product.brand} ${product.name}`} />
        ) : (
          <Button size="sm" variant="secondary" icon={Plus} onClick={onAdd} disabled={soldOut} aria-label={`${typicalQty} × ${product.brand} ${product.name} in den Warenkorb`}>
            {soldOut ? 'Ausverkauft' : typicalQty}
          </Button>
        )}
      </div>
    </li>
  );
}
