import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, RotateCcw } from 'lucide-react';
import type { Order } from '@shared/types';
import { FULFILLMENT_LABEL, formatDate, formatEuro } from '@shared/format';
import { useMyOrders, useProductMap } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { ProductImage, productTint } from '@/components/product';
import { Button, Card, OrderStatusBadge, Skeleton, toast } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Letzte Bestellung eines Kunden (nicht storniert), sonst null */
export function useLastOrder(): { order: Order | null; loading: boolean } {
  const { data, isLoading } = useMyOrders();
  const order = useMemo(() => (data ?? []).find((o) => o.status !== 'cancelled' && o.lines.length > 0) ?? null, [data]);
  return { order, loading: isLoading };
}

/**
 * „Nochmal bestellen“: letzte Bestellung mit Artikelvorschau und 1-Klick in den Warenkorb.
 * Nicht mehr erhältliche Artikel werden übersprungen.
 */
export function ReorderCard({ order, className }: { order: Order; className?: string }) {
  const products = useProductMap();
  const add = useCart((s) => s.add);
  const lines = order.lines;
  const available = lines.filter((l) => {
    const p = products.get(l.productId);
    return p && p.active && (p.isRental || p.stock > 0);
  });
  const crates = lines.reduce((s, l) => s + l.qty, 0);

  const reorder = () => {
    if (!available.length) {
      toast.error('Die Artikel dieser Bestellung sind derzeit leider nicht erhältlich.');
      return;
    }
    for (const l of available) add(l.productId, l.qty);
    const skipped = lines.length - available.length;
    toast.success(`${available.length} Artikel in den Warenkorb gelegt`, {
      id: 'reorder',
      description: skipped ? `${skipped} Artikel ist derzeit nicht erhältlich und wurde übersprungen.` : `Aus Bestellung ${order.number}`,
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
    });
  };

  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-100 text-accent-800">
              <History size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-slate-900">
                Bestellung {order.number} vom {formatDate(order.createdAt, 'short')}
              </p>
              <p className="text-sm text-slate-500">
                {lines.length} Artikel · {crates} Gebinde · {FULFILLMENT_LABEL[order.fulfillment]} · {formatEuro(order.totals.total)}
              </p>
            </div>
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} className="sm:ml-auto md:ml-0" />
          </div>
          <ul className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {lines.slice(0, 6).map((l) => {
              const p = products.get(l.productId);
              return (
                <li key={l.productId} className="w-[4.75rem] shrink-0">
                  <div
                    className="relative h-[4.75rem] w-[4.75rem] overflow-hidden rounded-xl ring-1 ring-slate-900/5"
                    style={{ background: p ? productTint(p) : '#f1f5f9' }}
                  >
                    {p ? <ProductImage product={p} className="absolute inset-0 p-1" /> : <Skeleton className="absolute inset-0" />}
                    <span className="absolute bottom-1 right-1 rounded-md bg-slate-900/80 px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums">{l.qty}×</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] font-medium text-slate-600" title={l.name}>
                    {l.name}
                  </p>
                </li>
              );
            })}
            {lines.length > 6 ? (
              <li className="flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
                +{lines.length - 6}
              </li>
            ) : null}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col md:items-stretch">
          <Button icon={RotateCcw} onClick={reorder} size="lg" className="md:min-w-56">
            Alles in den Warenkorb
          </Button>
          <Link
            to={`/bestellung/${order.id}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Bestellung ansehen <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  );
}
