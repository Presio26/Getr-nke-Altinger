import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Product } from '@shared/types';
import { ProductCard } from '@/components/product';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Horizontal scrollbare Produktreihe (Snap, mobil randlos) mit Pfeiltasten auf dem Desktop.
 */
export function ProductRail({
  products,
  loading = false,
  className,
  label,
  itemClassName = 'w-[11.25rem] sm:w-[13rem] lg:w-[14.5rem]',
}: {
  products: Product[];
  loading?: boolean;
  className?: string;
  /** Beschriftung für Screenreader */
  label: string;
  itemClassName?: string;
}) {
  if (loading) {
    return (
      <Rail label={label} className={className}>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className={cn('shrink-0 snap-start', itemClassName)}>
            <ProductCardSkeleton />
          </li>
        ))}
      </Rail>
    );
  }
  return (
    <Rail label={label} className={className}>
      {products.map((p) => (
        <li key={p.id} className={cn('flex shrink-0 snap-start', itemClassName)}>
          <ProductCard product={p} className="w-full" />
        </li>
      ))}
    </Rail>
  );
}

export function Rail({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className={cn('group/rail relative', className)}>
      <ul
        ref={ref}
        onScroll={update}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 scrollbar-none sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {children}
      </ul>
      {!edges.start ? (
        <RailButton dir={-1} onClick={() => scroll(-1)} />
      ) : null}
      {!edges.end ? <RailButton dir={1} onClick={() => scroll(1)} /> : null}
    </div>
  );
}

function RailButton({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? 'Weiter blättern' : 'Zurück blättern'}
      className={cn(
        'absolute top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-raised ring-1 ring-slate-900/5 transition-[opacity,transform] hover:scale-105 hover:text-brand-700 lg:flex',
        dir === 1 ? '-right-4' : '-left-4',
      )}
    >
      <Icon size={22} aria-hidden />
    </button>
  );
}

export function ProductCardSkeleton({ row = false }: { row?: boolean }) {
  if (row) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-card">
        <Skeleton className="h-20 w-20 rounded-xl sm:h-24 sm:w-24" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
      <Skeleton className="aspect-[5/4] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-4 h-6 w-20" />
        <Skeleton className="mt-3 h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
