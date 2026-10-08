import { useMemo } from 'react';
import { Heart, LayoutGrid, ShoppingCart } from 'lucide-react';
import type { Product } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useCartSummary, useMyCustomer, useProducts } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { ProductCard } from '@/components/product';
import { Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, toast } from '@/components/ui';

function isAvailable(p: Product): boolean {
  return p.active && p.stock > 0;
}

/** Gemerkte Artikel als Raster – mit „Alle in den Warenkorb“ */
export default function FavoritesPage() {
  const customer = useMyCustomer();
  const products = useProducts();
  const items = useCart((s) => s.items);
  const summary = useCartSummary();

  const favorites = useMemo(() => {
    if (!customer.data || !products.data) return [];
    const map = new Map(products.data.map((p) => [p.id, p]));
    return customer.data.favorites.map((id) => map.get(id)).filter((p): p is Product => !!p && p.active);
  }, [customer.data, products.data]);

  const missing = favorites.filter((p) => isAvailable(p) && !items.some((i) => i.productId === p.id));
  const soldOut = favorites.filter((p) => !isAvailable(p)).length;

  const addAll = () => {
    if (!missing.length) return;
    const cart = useCart.getState();
    for (const p of missing) cart.add(p.id, 1);
    toast.success(missing.length === 1 ? '1 Artikel in den Warenkorb gelegt' : `${missing.length} Artikel in den Warenkorb gelegt`, {
      description: soldOut ? `${soldOut} ausverkaufte${soldOut === 1 ? 'r Artikel wurde' : ' Artikel wurden'} übersprungen.` : 'Je 1 Gebinde – die Menge können Sie im Warenkorb anpassen.',
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
      id: 'favorites-all',
    });
  };

  const loading = customer.isLoading || products.isLoading;
  const error = customer.error ?? products.error;
  const count = favorites.length;

  return (
    <>
      <PageHeader
        title="Favoriten"
        back="/konto"
        subtitle={count ? `${count} Artikel gemerkt – Ihre Lieblingsgetränke immer griffbereit.` : 'Ihre Lieblingsgetränke immer griffbereit.'}
        actions={
          count ? (
            <Button icon={ShoppingCart} onClick={addAll} disabled={!missing.length} className="w-full sm:w-auto">
              {missing.length ? `Alle in den Warenkorb (${missing.length})` : 'Alle im Warenkorb'}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5" aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/5] rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void customer.refetch();
            void products.refetch();
          }}
        />
      ) : count === 0 ? (
        <Card>
          <EmptyState
            icon={Heart}
            title="Noch keine Favoriten"
            description="Tippen Sie bei einem Artikel auf das Herz – dann finden Sie ihn hier wieder und können ihn mit einem Klick erneut bestellen."
            action={
              <ButtonLink to="/sortiment" icon={LayoutGrid}>
                Sortiment entdecken
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {favorites.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {summary.count > 0 ? (
            <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-brand-900">
                Im Warenkorb: <strong className="tabular-nums">{summary.count} Gebinde</strong> für{' '}
                <strong className="tabular-nums">{formatEuro(summary.itemsTotal)}</strong>
                {summary.showNet ? ' netto' : ''}
                {summary.deposit ? <> zzgl. {formatEuro(summary.deposit)} Pfand</> : null}
              </p>
              <ButtonLink to="/warenkorb" variant="primary" icon={ShoppingCart} size="sm">
                Zum Warenkorb
              </ButtonLink>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
