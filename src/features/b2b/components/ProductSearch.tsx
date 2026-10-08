import { forwardRef, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';
import type { Customer, DepositType, Product } from '@shared/types';
import { formatEuro } from '@shared/format';
import { computePrice } from '@/api/hooks';
import { useClickOutside } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { searchProducts } from '../lib/b2b';
import { ProductThumb } from './ProductLine';

export interface ProductSearchProps {
  products: Product[];
  customer: Customer | null;
  depositTypes: DepositType[];
  /** IDs, die schon in der Liste stehen (Hinweis „in Ihrer Liste“) */
  listed: Set<string>;
  onPick: (product: Product) => void;
  className?: string;
}

/** Artikelsuche mit Vorschlagsliste – Pfeiltasten + Enter fügen hinzu */
export const ProductSearch = forwardRef<HTMLInputElement, ProductSearchProps>(function ProductSearch(
  { products, customer, depositTypes, listed, onPick, className },
  ref,
) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchProducts(products, q, 8), [products, q]);
  const wrapRef = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (p: Product) => {
    onPick(p);
    setQ('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = results[active] ?? results[0];
      if (p) pick(p);
    } else if (e.key === 'Escape') {
      if (q) {
        e.preventDefault();
        setQ('');
      }
      setOpen(false);
    }
  };

  const showList = open && q.trim().length > 0;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-label="Artikel zur Bestellliste hinzufügen"
        enterKeyHint="done"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Artikel suchen & hinzufügen …"
        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-base text-slate-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-[15px]"
      />
      {q ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setQ('')}
          aria-label="Suchbegriff löschen"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}

      {showList ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-fade-in">
          {results.length ? (
            <ul ref={listRef} id={listId} role="listbox" className="max-h-[22rem] overflow-y-auto py-1.5">
              {results.map((p, i) => {
                const price = computePrice(p, customer, 1, depositTypes);
                const selected = i === active;
                return (
                  <li
                    key={p.id}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(p)}
                    className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', selected ? 'bg-brand-50' : 'hover:bg-slate-50')}
                  >
                    <ProductThumb product={p} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">
                        {p.brand} {p.name}
                      </span>
                      <span className="block truncate text-[13px] text-slate-500">
                        <span className="font-mono">{p.sku}</span> · {p.packaging}
                        {listed.has(p.id) ? <span className="font-medium text-brand-700"> · in Ihrer Liste</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-slate-900">{formatEuro(price.displayUnit)}</span>
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">{price.showNet ? 'netto' : 'brutto'}</span>
                    </span>
                    {selected ? <CornerDownLeft size={16} aria-hidden className="hidden shrink-0 text-brand-600 sm:block" /> : <span className="hidden w-4 sm:block" />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-5 text-center text-sm text-slate-500">Kein Artikel gefunden. Versuchen Sie es mit Marke, Sorte oder Artikelnummer.</p>
          )}
        </div>
      ) : null}
    </div>
  );
});
