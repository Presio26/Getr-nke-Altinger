import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Leaf, MapPin, ShoppingCart, Sparkles, Tag } from 'lucide-react';
import type { Product } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useMyCustomer, usePrice, useToggleFavorite } from '@/api/hooks';
import { useCart, useCartQty } from '@/stores/cart';
import { useSession } from '@/stores/session';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, IconButton, QuantityStepper, toast } from '@/components/ui';
import { PriceDisplay } from './PriceDisplay';
import { ProductImage, productTint } from './ProductImage';

export interface ProductCardProps {
  product: Product;
  layout?: 'grid' | 'row';
  className?: string;
}

function isAlcoholFree(p: Product): boolean {
  return p.tags.includes('alkoholfrei') || p.categoryId === 'alkoholfrei' || (p.alcoholPercent !== undefined && p.alcoholPercent <= 0.5 && ['bier', 'alkoholfrei'].includes(p.categoryId));
}

function ProductBadges({ product, isOffer, offerLabel, max = 3 }: { product: Product; isOffer: boolean; offerLabel?: string; max?: number }) {
  const badges: JSX.Element[] = [];
  if (isOffer) {
    badges.push(
      <Badge key="offer" tone="accent" solid icon={Tag}>
        {offerLabel && offerLabel.length <= 18 ? offerLabel : 'Angebot'}
      </Badge>,
    );
  }
  if (product.tags.includes('neu')) badges.push(<Badge key="neu" tone="info" solid icon={Sparkles}>Neu</Badge>);
  if (product.tags.includes('regional')) badges.push(<Badge key="reg" tone="brand" icon={MapPin}>Regional</Badge>);
  if (product.tags.includes('bio')) badges.push(<Badge key="bio" tone="success" icon={Leaf}>Bio</Badge>);
  if (isAlcoholFree(product)) badges.push(<Badge key="af" tone="info">Alkoholfrei</Badge>);
  if (!badges.length && product.tags.includes('bestseller')) badges.push(<Badge key="best" tone="neutral">Beliebt</Badge>);
  return <>{badges.slice(0, max)}</>;
}

function useCartControls(product: Product) {
  const qty = useCartQty(product.id);
  const setQty = useCart((s) => s.setQty);
  const add = useCart((s) => s.add);
  const soldOut = product.stock <= 0 || !product.active;
  const onAdd = () => {
    add(product.id, 1);
    toast.success('In den Warenkorb gelegt', {
      id: 'cart-add',
      description: `${product.brand} ${product.name}`,
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
      duration: 2600,
    });
  };
  const max = product.isRental ? Math.max(1, product.stock) : 999;
  return { qty, setQty: (n: number) => setQty(product.id, n), onAdd, soldOut, max };
}

function FavoriteButton({ product, className }: { product: Product; className?: string }) {
  const canFav = useSession((s) => s.status === 'authenticated' && (s.user?.role === 'customer' || s.user?.role === 'business'));
  const { data: customer } = useMyCustomer();
  const toggle = useToggleFavorite();
  if (!canFav) return null;
  const active = !!customer?.favorites.includes(product.id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(product.id);
      }}
      aria-pressed={active}
      aria-label={active ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      title={active ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-slate-900/5 backdrop-blur transition-[transform,color] hover:scale-105 active:scale-95',
        active ? 'text-red-500' : 'text-slate-400 hover:text-red-500',
        className,
      )}
    >
      <Heart size={19} aria-hidden fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Produktkachel (Raster) bzw. -zeile (Liste) mit Preis, Pfand, Grundpreis und Warenkorb-Steuerung */
export const ProductCard = memo(function ProductCard({ product, layout = 'grid', className }: ProductCardProps) {
  const price = usePrice(product, 1);
  const { qty, setQty, onAdd, soldOut, max } = useCartControls(product);
  const href = `/produkt/${product.id}`;
  const nextTier = price.showNet ? price.price.nextTier : undefined;
  const label = `${product.brand} ${product.name}`;

  if (layout === 'row') {
    return (
      <Card padding="none" className={cn('flex items-center gap-3 p-3 sm:gap-4', className)}>
        <Link
          to={href}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24"
          style={{ background: productTint(product) }}
          aria-label={label}
        >
          <ProductImage product={product} className="absolute inset-0 p-1.5" />
          {price.isOffer ? <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-accent-500 ring-2 ring-white" aria-hidden /> : null}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{product.brand}</p>
          <Link to={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 hover:text-brand-700">
            {product.name}
          </Link>
          <p className="truncate text-sm text-slate-500">{product.packaging}</p>
          <PriceDisplay product={product} size="sm" compact className="mt-1" />
          <p className="truncate text-xs text-slate-500">
            {product.isRental ? 'pro Veranstaltung' : price.depositUnit > 0 ? `zzgl. ${formatEuro(price.depositUnit)} Pfand` : 'pfandfrei'}
            {price.basePriceText ? ` · ${price.basePriceText}` : ''}
            {nextTier ? ` · ab ${nextTier.minQty}: ${formatEuro(nextTier.priceNet)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {soldOut ? (
            <Badge tone="neutral">Ausverkauft</Badge>
          ) : qty > 0 ? (
            <QuantityStepper value={qty} onChange={setQty} size="sm" removeAtMin max={max} label={label} />
          ) : (
            <IconButton icon={ShoppingCart} label={`${label} in den Warenkorb`} variant="primary" onClick={onAdd} />
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none" className={cn('group relative flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-raised', className)}>
      <Link to={href} className="relative block aspect-[5/4] overflow-hidden" style={{ background: productTint(product) }} aria-label={label} tabIndex={-1}>
        <ProductImage product={product} className="absolute inset-0 p-3 transition-transform duration-300 ease-out group-hover:scale-[1.04] sm:p-4" />
        {soldOut ? <span className="absolute inset-0 bg-white/55" aria-hidden /> : null}
      </Link>
      <div className="pointer-events-none absolute left-2.5 top-2.5 flex max-w-[75%] flex-wrap gap-1.5">
        <ProductBadges product={product} isOffer={price.isOffer} offerLabel={price.note} max={2} />
      </div>
      <FavoriteButton product={product} className="absolute right-2 top-2" />

      <div className="flex flex-1 flex-col p-3.5 pt-3 sm:p-4 sm:pt-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{product.brand}</p>
        <Link to={href} className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 hover:text-brand-700">
          {product.name}
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-slate-500">{product.packaging}</p>
        <div className="mt-auto pt-3">
          <PriceDisplay product={product} size="md" />
          {nextTier ? (
            <p className="mt-1 text-xs font-medium text-brand-700">
              ab {nextTier.minQty} Stk.: {formatEuro(nextTier.priceNet)} netto
            </p>
          ) : null}
        </div>
        <div className="mt-3">
          {soldOut ? (
            <Button variant="outline" block disabled size="md">
              {product.isRental ? 'Derzeit verliehen' : 'Ausverkauft'}
            </Button>
          ) : qty > 0 ? (
            <div className="flex items-center gap-2">
              <QuantityStepper value={qty} onChange={setQty} removeAtMin max={max} label={label} className="flex-1 justify-between" />
            </div>
          ) : (
            <Button icon={ShoppingCart} block onClick={onAdd} aria-label={`${label} in den Warenkorb`}>
              {product.isRental ? 'Vormerken' : 'In den Warenkorb'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
});

export { ProductBadges, FavoriteButton };
