import { useCallback } from 'react';
import type { Order } from '@shared/types';
import { useProductMap } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { toast } from '@/components/ui';

/** „Nochmal bestellen“: alle (noch erhältlichen) Artikel einer Bestellung in den Warenkorb legen */
export function useReorder() {
  const products = useProductMap();
  const add = useCart((s) => s.add);
  return useCallback(
    (order: Pick<Order, 'lines' | 'number'>) => {
      let added = 0;
      let skipped = 0;
      for (const line of order.lines) {
        const p = products.get(line.productId);
        if (!p || !p.active) {
          skipped += 1;
          continue;
        }
        add(line.productId, line.qty);
        added += line.qty;
      }
      if (!added) {
        toast.error('Die Artikel dieser Bestellung sind leider nicht mehr erhältlich.');
        return;
      }
      toast.success(`${added} ${added === 1 ? 'Artikel' : 'Artikel'} in den Warenkorb gelegt`, {
        description: skipped
          ? `${skipped} ${skipped === 1 ? 'Artikel ist' : 'Artikel sind'} nicht mehr im Sortiment.`
          : `Aus Bestellung ${order.number}`,
        href: '/warenkorb',
        actionLabel: 'Zum Warenkorb',
        id: 'reorder',
      });
    },
    [products, add],
  );
}
