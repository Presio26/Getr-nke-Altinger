import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, LayoutGrid, List, PackageSearch, SearchX, SlidersHorizontal, X } from 'lucide-react';
import type { Material } from '@shared/types';
import { formatEuro } from '@shared/format';
import { computePrice, useCategories, useDepositTypes, useMyCustomer, useProducts } from '@/api/hooks';
import { ProductCard } from '@/components/product';
import { Button, Card, EmptyState, ErrorState, Modal, Notice, SegmentedControl, Select } from '@/components/ui';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import {
  FEATURE_LABEL,
  MATERIAL_LABEL,
  PACK_LABEL,
  SORT_LABEL,
  activeFilterCount,
  buildSearchIndex,
  matchesFilters,
  packKind,
  parseQuery,
  searchScore,
  sortItems,
  suggestTerm,
  type CatalogItem,
  type FeatureKey,
  type PackKind,
  type SortKey,
} from './components/catalog';
import { CategoryIcon, categoryTint } from './components/CategoryIcon';
import { FilterPanel, type FacetCounts } from './components/FilterPanel';
import { ProductCardSkeleton } from './components/ProductRail';
import { PARAM, useCatalogParams } from './components/useCatalogParams';

const PAGE_SIZE = 24;
const POPULAR_SEARCHES = ['Augustiner', 'Weißbier', 'Spezi', 'Mineralwasser', 'Alkoholfrei', 'Zapfanlage'];

function increment<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export default function CatalogPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const categories = useCategories();
  const depositTypes = useDepositTypes();
  const { data: products, isLoading, isError, error, refetch } = useProducts();
  const { data: customer } = useMyCustomer();
  const { q, filters, sort, view, params, toggle, setPrice, setSort, setView, resetFilters, searchForCategory, update } = useCatalogParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.sort - b.sort), [categories]);
  const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const unknownCategory = !!categoryId && !category;

  // Suchindex (je Sortiment) und Preise (je Kunde) – die Suche selbst bewertet nur noch
  const index = useMemo(
    () => buildSearchIndex((products ?? []).filter((p) => p.active), categories, depositTypes),
    [products, categories, depositTypes],
  );
  const priced = useMemo(
    () => index.map((entry) => ({ entry, price: computePrice(entry.product, customer ?? null, 1, depositTypes), pack: packKind(entry.product, depositTypes) })),
    [index, customer, depositTypes],
  );
  const items = useMemo<CatalogItem[]>(() => {
    const query = parseQuery(q);
    const out: CatalogItem[] = [];
    for (const { entry, price, pack } of priced) {
      const score = searchScore(entry, query);
      if (score > 0) out.push({ product: entry.product, price, pack, score });
    }
    return out;
  }, [priced, q]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) increment(m, i.product.categoryId);
    return m;
  }, [items]);

  const inCategory = useMemo(() => (category ? items.filter((i) => i.product.categoryId === category.id) : items), [items, category]);

  const results = useMemo(() => sortItems(inCategory.filter((i) => matchesFilters(i, filters)), sort), [inCategory, filters, sort]);

  const counts = useMemo<FacetCounts>(() => {
    const c: FacetCounts = { brands: new Map(), packs: new Map(), materials: new Map(), features: new Map(), prices: [] };
    for (const i of inCategory) {
      if (matchesFilters(i, filters, 'brands')) increment(c.brands, i.product.brand);
      if (matchesFilters(i, filters, 'packs')) increment<PackKind>(c.packs, i.pack);
      if (matchesFilters(i, filters, 'materials')) increment<Material>(c.materials, i.product.material);
      if (matchesFilters(i, filters, 'price')) c.prices.push(i.price.displayUnit);
    }
    // Merkmale: Treffer, wenn dieses Merkmal zusätzlich gewählt würde
    for (const k of ['angebot', 'regional', 'bio', 'alkoholfrei'] as FeatureKey[]) {
      const withK = { ...filters, features: filters.features.includes(k) ? filters.features : [...filters.features, k] };
      c.features.set(k, inCategory.filter((i) => matchesFilters(i, withK)).length);
    }
    return c;
  }, [inCategory, filters]);

  const filterCount = activeFilterCount(filters);
  const net = customer?.type === 'b2b';
  const resetKey = `${categoryId ?? ''}|${params.toString()}`;
  useEffect(() => setVisible(PAGE_SIZE), [resetKey]);

  const title = category ? category.name : q ? `Suche: „${q}“` : 'Sortiment';
  useDocumentTitle(category ? category.name : q ? `Suche nach „${q}“` : 'Sortiment');

  const goCategory = (id: string | null) => navigate(`/sortiment${id ? `/${id}` : ''}${searchForCategory()}`, { preventScrollReset: true });
  const clearSearch = () => update((next) => next.delete(PARAM.q));

  const chips = buildChips(filters, (param, value) => toggle(param, value), () => setPrice(undefined, undefined), net);

  const sortOptions = (Object.keys(SORT_LABEL) as SortKey[]).filter((k) => k !== 'relevanz' || q).map((k) => ({ value: k, label: SORT_LABEL[k] }));

  const suggestion = !isLoading && q && !results.length && products ? suggestTerm(products, q) : null;

  const filterPanel = (
    <FilterPanel filters={filters} counts={counts} net={net} onToggle={toggle} onPrice={setPrice} />
  );

  return (
    <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8 xl:gap-10">
      {/* ─── Seitenleiste (Desktop) ─── */}
      <aside className="hidden lg:block">
        <div className="sticky top-[8.75rem] max-h-[calc(100dvh-9.75rem)] overflow-y-auto overscroll-contain pb-6 pr-1 scrollbar-none">
          <nav aria-label="Kategorien">
            <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">Kategorien</p>
            <ul className="space-y-0.5">
              <li>
                <CategoryLink active={!categoryId} onClick={() => goCategory(null)} label="Alle Artikel" count={products ? items.length : undefined} icon="Package" color="#1d58a0" />
              </li>
              {sortedCategories.map((c) => (
                <li key={c.id}>
                  <CategoryLink
                    active={c.id === categoryId}
                    onClick={() => goCategory(c.id)}
                    label={c.name}
                    count={products ? (categoryCounts.get(c.id) ?? 0) : undefined}
                    icon={c.icon}
                    color={c.color}
                  />
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 border-t border-slate-200/80 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-base font-bold text-slate-900">
                <SlidersHorizontal size={18} aria-hidden /> Filter
              </p>
              {filterCount ? (
                <button type="button" onClick={resetFilters} className="min-h-9 text-sm font-semibold text-brand-700 hover:text-brand-800">
                  Zurücksetzen
                </button>
              ) : null}
            </div>
            {filterPanel}
          </div>
        </div>
      </aside>

      {/* ─── Inhalt ─── */}
      <div className="min-w-0">
        <nav aria-label="Brotkrumen" className="mb-2 hidden items-center gap-1 text-sm text-slate-500 sm:flex">
          <Link to="/" className="hover:text-slate-800">
            Start
          </Link>
          <ChevronRight size={14} aria-hidden />
          <Link to="/sortiment" className={cn('hover:text-slate-800', !category && 'font-medium text-slate-800')}>
            Sortiment
          </Link>
          {category ? (
            <>
              <ChevronRight size={14} aria-hidden />
              <span className="font-medium text-slate-800">{category.name}</span>
            </>
          ) : null}
        </nav>

        <header className="flex items-start gap-4">
          {category ? (
            <span
              className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:flex"
              style={{ background: categoryTint(category.color, 14), color: category.color }}
            >
              <CategoryIcon name={category.icon} size={28} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
              {category
                ? category.description
                : q
                  ? 'Gefunden in Marke, Sorte, Gebinde und Beschreibung – auch mit Tippfehlern oder ohne Umlaute.'
                  : 'Bier, Wasser, Limo, Wein & Festbedarf – geliefert in Garching oder zum Abholen im Markt.'}
            </p>
          </div>
        </header>

        {q ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex h-10 items-center gap-1 rounded-full bg-brand-50 pl-3 pr-0.5 font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
              „{q}“
              <button type="button" onClick={clearSearch} aria-label="Suche löschen" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-brand-100">
                <X size={15} aria-hidden />
              </button>
            </span>
            {category ? (
              <Link to={`/sortiment?${new URLSearchParams({ q }).toString()}`} className="font-semibold text-brand-700 hover:text-brand-800">
                Im gesamten Sortiment suchen
              </Link>
            ) : null}
          </div>
        ) : null}

        {unknownCategory ? (
          <Notice tone="warning" className="mt-4" title="Diese Kategorie gibt es nicht (mehr)">
            Wir zeigen Ihnen stattdessen das gesamte Sortiment.
          </Notice>
        ) : null}

        {/* Kategorien (mobil) */}
        <nav aria-label="Kategorien" className="-mx-4 mt-4 lg:hidden">
          <ul className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:px-6">
            <li className="shrink-0">
              <CategoryChip active={!categoryId} onClick={() => goCategory(null)} label="Alle" />
            </li>
            {sortedCategories.map((c) => (
              <li key={c.id} className="shrink-0">
                <CategoryChip active={c.id === categoryId} onClick={() => goCategory(c.id)} label={c.name} icon={c.icon} color={c.color} count={products ? (categoryCounts.get(c.id) ?? 0) : undefined} />
              </li>
            ))}
          </ul>
        </nav>

        {/* Artikelzahl (mobil nicht klebend – spart Höhe beim Scrollen) */}
        <p className="mt-3 text-sm text-slate-500 lg:hidden" aria-live="polite">
          {isLoading ? 'Artikel werden geladen …' : isError ? 'Sortiment nicht verfügbar' : `${results.length} Artikel`}
          {filterCount ? ` · ${filterCount} Filter aktiv` : ''}
        </p>

        {/* Werkzeugleiste: mobil eine einzige klebende Zeile (Filter, Sortierung, Ansicht) */}
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mt-2 border-b border-slate-200/70 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/85 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={SlidersHorizontal} onClick={() => setSheetOpen(true)} className="px-3 lg:hidden" aria-label={filterCount ? `Filter (${filterCount} aktiv)` : 'Filter'}>
              <span className="max-[419px]:sr-only">Filter</span>
              {filterCount ? <span className="ml-0.5 rounded-full bg-brand-700 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{filterCount}</span> : null}
            </Button>
            <p className="hidden text-[15px] text-slate-600 lg:block" aria-live="polite">
              {isLoading ? (
                'Artikel werden geladen …'
              ) : isError ? null : (
                <>
                  <span className="font-bold tabular-nums text-slate-900">{results.length}</span> Artikel
                </>
              )}
            </p>
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:ml-auto lg:flex-none">
              <Select
                aria-label="Sortierung"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                options={sortOptions}
                containerClassName="min-w-0 flex-1 lg:w-56 lg:flex-none"
                className="h-11 text-[15px]"
              />
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>
        </div>

        {chips.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onRemove}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white pl-3 pr-2 text-[13px] font-semibold text-slate-700 shadow-xs ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:ring-slate-300"
                aria-label={`Filter entfernen: ${c.label}`}
              >
                {c.label}
                <X size={14} aria-hidden className="text-slate-400" />
              </button>
            ))}
            <button type="button" onClick={resetFilters} className="h-9 px-2 text-[13px] font-semibold text-brand-700 hover:text-brand-800">
              Alle entfernen
            </button>
          </div>
        ) : null}

        {/* Ergebnisse */}
        <div className="mt-4 lg:mt-5">
          {isError ? (
            <Card>
              <ErrorState error={error} onRetry={() => void refetch()} />
            </Card>
          ) : isLoading ? (
            <ResultsSkeleton view={view} />
          ) : results.length === 0 ? (
            <Card padding="none">
              {q && !filterCount ? (
                <EmptyState
                  icon={SearchX}
                  title={`Keine Treffer für „${q}“${category ? ` in ${category.name}` : ''}`}
                  description={
                    suggestion ? (
                      <>
                        Meinten Sie{' '}
                        <Link to={`/sortiment?${new URLSearchParams({ q: suggestion }).toString()}`} className="font-semibold text-brand-700 underline underline-offset-2">
                          {suggestion}
                        </Link>
                        ? Oder versuchen Sie einen allgemeineren Begriff.
                      </>
                    ) : (
                      'Prüfen Sie die Schreibweise oder versuchen Sie einen allgemeineren Begriff, z. B. eine Marke oder Sorte.'
                    )
                  }
                  action={
                    <div className="flex max-w-md flex-wrap justify-center gap-2">
                      {category ? (
                        <Button variant="primary" onClick={() => navigate(`/sortiment?${new URLSearchParams({ q }).toString()}`)}>
                          Im gesamten Sortiment suchen
                        </Button>
                      ) : null}
                      {POPULAR_SEARCHES.map((s) => (
                        <Link
                          key={s}
                          to={`/sortiment?${new URLSearchParams({ q: s }).toString()}`}
                          className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          {s}
                        </Link>
                      ))}
                    </div>
                  }
                />
              ) : (
                <EmptyState
                  icon={PackageSearch}
                  title="Keine Artikel passen zu Ihrer Auswahl"
                  description={
                    filterCount
                      ? 'Entfernen Sie einzelne Filter oder setzen Sie alle zurück, um wieder mehr Artikel zu sehen.'
                      : 'In dieser Kategorie sind gerade keine Artikel verfügbar.'
                  }
                  action={
                    filterCount ? (
                      <Button variant="outline" onClick={resetFilters}>
                        Filter zurücksetzen
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => goCategory(null)}>
                        Gesamtes Sortiment
                      </Button>
                    )
                  }
                />
              )}
            </Card>
          ) : (
            <>
              <ul className={cn('grid gap-3 sm:gap-4', view === 'liste' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')}>
                {results.slice(0, visible).map((i) => (
                  <li key={i.product.id} className="flex">
                    <ProductCard product={i.product} layout={view === 'liste' ? 'row' : 'grid'} className="w-full" />
                  </li>
                ))}
              </ul>
              {results.length > visible ? (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <p className="text-sm text-slate-500">
                    {visible} von {results.length} Artikeln
                  </p>
                  <Button variant="outline" size="lg" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                    Weitere {Math.min(PAGE_SIZE, results.length - visible)} Artikel anzeigen
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Filter (mobil, Bottom-Sheet) */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter"
        description={category ? `in ${category.name}` : q ? `für „${q}“` : 'im gesamten Sortiment'}
        footer={
          <>
            <Button variant="ghost" onClick={resetFilters} disabled={!filterCount}>
              Zurücksetzen
            </Button>
            <Button onClick={() => setSheetOpen(false)} block className="sm:w-auto">
              {results.length} Artikel anzeigen
            </Button>
          </>
        }
      >
        {filterPanel}
      </Modal>
    </div>
  );
}

// ───────────────────────────── Bausteine ─────────────────────────────

function CategoryLink({ active, onClick, label, count, icon, color }: { active: boolean; onClick: () => void; label: string; count?: number; icon: string; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[15px] transition-colors',
        active ? 'bg-white font-semibold text-slate-900 shadow-card ring-1 ring-slate-200/70' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900',
        !active && count === 0 && 'opacity-50',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: categoryTint(color, active ? 18 : 12), color }}>
        <CategoryIcon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      {count !== undefined ? <span className={cn('shrink-0 text-xs font-semibold tabular-nums', active ? 'text-brand-700' : 'text-slate-400')}>{count}</span> : null}
    </button>
  );
}

function CategoryChip({ active, onClick, label, icon, color, count }: { active: boolean; onClick: () => void; label: string; icon?: string; color?: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full pl-2 pr-3.5 text-sm font-semibold ring-1 ring-inset transition-colors',
        !icon && 'pl-3.5',
        active ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-200 active:bg-slate-100',
      )}
    >
      {icon ? (
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={active ? { background: 'rgba(255,255,255,0.16)', color: '#fff' } : { background: categoryTint(color ?? '#1d58a0', 14), color }}
        >
          <CategoryIcon name={icon} size={15} />
        </span>
      ) : null}
      <span className="whitespace-nowrap">{label}</span>
      {count !== undefined ? <span className={cn('text-xs tabular-nums', active ? 'text-white/70' : 'text-slate-400')}>{count}</span> : null}
    </button>
  );
}

function ViewToggle({ view, onChange, size = 'md', className }: { view: 'raster' | 'liste'; onChange: (v: 'raster' | 'liste') => void; size?: 'sm' | 'md'; className?: string }) {
  return (
    <SegmentedControl
      aria-label="Ansicht"
      size={size}
      value={view}
      onChange={(v) => onChange(v as 'raster' | 'liste')}
      options={[
        { value: 'raster', label: <span className="sr-only">Raster</span>, icon: LayoutGrid },
        { value: 'liste', label: <span className="sr-only">Liste</span>, icon: List },
      ]}
      className={cn('shrink-0', className)}
    />
  );
}

function ResultsSkeleton({ view }: { view: 'raster' | 'liste' }) {
  return (
    <ul className={cn('grid gap-3 sm:gap-4', view === 'liste' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')} aria-busy>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex">
          <ProductCardSkeleton row={view === 'liste'} />
        </li>
      ))}
    </ul>
  );
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

function buildChips(
  f: ReturnType<typeof useCatalogParams>['filters'],
  remove: (param: string, value: string) => void,
  clearPrice: () => void,
  net: boolean,
): Chip[] {
  const chips: Chip[] = [];
  for (const k of f.features) chips.push({ key: `f-${k}`, label: FEATURE_LABEL[k], onRemove: () => remove(PARAM.feature, k) });
  for (const k of f.packs) chips.push({ key: `p-${k}`, label: PACK_LABEL[k], onRemove: () => remove(PARAM.pack, k) });
  for (const b of f.brands) chips.push({ key: `b-${b}`, label: b, onRemove: () => remove(PARAM.brand, b) });
  for (const m of f.materials) chips.push({ key: `m-${m}`, label: MATERIAL_LABEL[m], onRemove: () => remove(PARAM.material, m) });
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    const label =
      f.minPrice !== undefined && f.maxPrice !== undefined
        ? `${formatEuro(f.minPrice)} – ${formatEuro(f.maxPrice)}`
        : f.minPrice !== undefined
          ? `ab ${formatEuro(f.minPrice)}`
          : `bis ${formatEuro(f.maxPrice ?? 0)}`;
    chips.push({ key: 'price', label: `${label}${net ? ' netto' : ''}`, onRemove: clearPrice });
  }
  return chips;
}
