import { useMemo, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Download, EyeOff, Minus, PackageSearch, Plus, Tag } from 'lucide-react';
import type { Product } from '@shared/types';
import { basePrice, formatDate, formatEuro } from '@shared/format';
import { todayString } from '@shared/time';
import { isOfferValid } from '@shared/core/pricing';
import { api } from '@/api/client';
import { qk, useCategories, useProducts } from '@/api/hooks';
import { downloadCsv } from '@/lib/download';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  Select,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  errorMessage,
  toast,
} from '@/components/ui';
import { ProductImage } from '@/components/product';
import { formatCount, isBelowMinStock, matchesSearch, netFromGross, sortBy, stockLevel, type SortDir } from './master/lib';
import { AlertBanner, FilterChip, SearchField, SortTH, StockDot, TableFootnote, TableSkeleton, stockLabel, stockTextClass } from './master/ui';
import { StockAdjustModal } from './master/products/StockAdjustModal';

type SortKey = 'name' | 'category' | 'price' | 'stock';

const stop = (e: MouseEvent) => e.stopPropagation();

/** Schnelle Bestandskorrektur ±1 mit sofortiger Anzeige */
function useQuickStock() {
  const qc = useQueryClient();
  return useMutation<Product, Error, { product: Product; delta: number }, Product[] | undefined>({
    mutationFn: ({ product, delta }) => api.adminAdjustStock(product.id, delta, delta > 0 ? 'Schnellkorrektur: Zugang' : 'Schnellkorrektur: Abgang'),
    async onMutate({ product, delta }) {
      await qc.cancelQueries({ queryKey: qk.products, exact: true });
      const prev = qc.getQueryData<Product[]>(qk.products);
      qc.setQueryData<Product[]>(qk.products, (list) => list?.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)));
      return prev;
    },
    onError(err, _vars, prev) {
      if (prev) qc.setQueryData(qk.products, prev);
      toast.error(errorMessage(err));
    },
    onSuccess(product) {
      qc.setQueryData<Product[]>(qk.products, (list) => list?.map((p) => (p.id === product.id ? product : p)));
      qc.setQueryData(qk.product(product.id), product);
    },
  });
}

function StockControl({ product, onOpen, compact = false }: { product: Product; onOpen: () => void; compact?: boolean }) {
  const quick = useQuickStock();
  const level = stockLevel(product);
  return (
    <div className="flex items-center gap-2.5" onClick={stop}>
      <StockDot level={level} />
      <div className="inline-flex h-9 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <button
          type="button"
          onClick={() => quick.mutate({ product, delta: -1 })}
          disabled={product.stock <= 0}
          aria-label={`Bestand ${product.name} um 1 verringern`}
          className="flex w-9 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30"
        >
          <Minus size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onOpen}
          title="Bestand korrigieren"
          aria-label={`Bestand ${product.name}: ${product.stock} – korrigieren`}
          className={cn(
            'min-w-12 border-x border-slate-200 px-2 text-[15px] font-bold tabular-nums transition-colors hover:bg-brand-50 hover:text-brand-800',
            stockTextClass(level),
          )}
        >
          {product.stock}
        </button>
        <button
          type="button"
          onClick={() => quick.mutate({ product, delta: 1 })}
          aria-label={`Bestand ${product.name} um 1 erhöhen`}
          className="flex w-9 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>
      {!compact ? (
        <span className="hidden text-xs leading-tight text-slate-500 2xl:block">
          {product.isRental ? 'Leihbestand' : <>Melde&shy;bestand {product.minStock}</>}
        </span>
      ) : null}
    </div>
  );
}

function OfferCell({ product, today }: { product: Product; today: string }) {
  if (!product.offer) return <span className="text-slate-300">–</span>;
  const valid = isOfferValid(product.offer, today);
  return (
    <div className="min-w-0">
      <Badge tone={valid ? 'accent' : 'neutral'} icon={Tag}>
        {formatEuro(product.offer.priceGross)}
      </Badge>
      <p className={cn('mt-1 text-xs', valid ? 'text-slate-500' : 'text-slate-400')}>
        {valid ? `bis ${formatDate(product.offer.validUntil, 'medium')}` : 'abgelaufen'}
      </p>
    </div>
  );
}

function ActiveSwitch({ product }: { product: Product }) {
  const toggle = useToggleActive(product);
  return (
    <span onClick={stop} className="inline-flex">
      <Switch
        checked={product.active}
        disabled={toggle.isPending}
        onChange={(v) => toggle.mutate(v)}
        ariaLabel={`${product.brand} ${product.name} ${product.active ? 'deaktivieren' : 'aktivieren'}`}
      />
    </span>
  );
}

/** Artikel aktiv/inaktiv schalten (vollständiger Datensatz an adminSaveProduct) */
function useToggleActive(product: Product) {
  const qc = useQueryClient();
  return useMutation<Product, Error, boolean>({
    mutationFn: (active) => api.adminSaveProduct({ ...product, active }),
    onSuccess(p) {
      qc.setQueryData<Product[]>(qk.products, (list) => list?.map((x) => (x.id === p.id ? p : x)));
      qc.setQueryData(qk.product(p.id), p);
      toast.success(p.active ? `„${p.brand} ${p.name}“ ist wieder im Shop sichtbar` : `„${p.brand} ${p.name}“ ist im Shop ausgeblendet`, { id: `active-${p.id}` });
    },
    onError(err) {
      toast.error(errorMessage(err));
    },
  });
}

export default function ProductsPage() {
  const { data, isLoading, error, refetch } = useProducts();
  const categories = useCategories();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [adjust, setAdjust] = useState<Product | null>(null);

  const q = params.get('q') ?? '';
  const cat = params.get('kategorie') ?? '';
  const onlyLow = params.has('meldebestand');
  const onlyOffers = params.has('angebote');
  const onlyInactive = params.has('inaktiv');
  const sort = { key: (params.get('sort') as SortKey) || 'name', dir: (params.get('dir') as SortDir) || 'asc' };
  const today = todayString();

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const toggleFlag = (key: string) => setParam(key, params.has(key) ? null : '1');
  const onSort = (key: SortKey) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const dir = sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc';
        next.set('sort', key);
        next.set('dir', key === sort.key ? dir : key === 'name' || key === 'category' ? 'asc' : 'desc');
        return next;
      },
      { replace: true },
    );
  };
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true });

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const products = useMemo(() => data ?? [], [data]);
  const liveAdjust = adjust ? (products.find((p) => p.id === adjust.id) ?? adjust) : null;

  const counts = useMemo(
    () => ({
      low: products.filter(isBelowMinStock).length,
      offers: products.filter((p) => isOfferValid(p.offer, today)).length,
      inactive: products.filter((p) => !p.active).length,
    }),
    [products, today],
  );

  const stockValue = useMemo(
    () => products.filter((p) => !p.isRental && p.active).reduce((s, p) => s + netFromGross(p.priceGross, p.vatRate) * p.stock, 0),
    [products],
  );

  const filtered = useMemo(() => {
    const list = products.filter((p) => {
      if (cat && p.categoryId !== cat) return false;
      if (onlyLow && !isBelowMinStock(p)) return false;
      if (onlyOffers && !isOfferValid(p.offer, today)) return false;
      if (onlyInactive && p.active) return false;
      return matchesSearch([p.name, p.brand, p.sku, p.ean, p.packaging, p.origin, p.location, catName.get(p.categoryId), ...p.tags], q);
    });
    const key =
      sort.key === 'price'
        ? (p: Product) => p.priceGross
        : sort.key === 'stock'
          ? (p: Product) => (p.isRental ? 1e9 + p.stock : p.minStock ? p.stock / p.minStock : p.stock)
          : sort.key === 'category'
            ? (p: Product) => `${String(categories.find((c) => c.id === p.categoryId)?.sort ?? 99).padStart(2, '0')} ${p.brand} ${p.name}`
            : (p: Product) => `${p.brand} ${p.name}`;
    return sortBy(list, key, sort.dir);
  }, [products, cat, onlyLow, onlyOffers, onlyInactive, q, sort.key, sort.dir, catName, categories, today]);

  const filtersActive = !!(q || cat || onlyLow || onlyOffers || onlyInactive);
  const openEdit = (p: Product) => navigate(`/admin/sortiment/${encodeURIComponent(p.id)}`, { state: { from: location.search } });

  const exportCsv = () => {
    const rows: unknown[][] = [
      ['Artikelnummer', 'EAN', 'Marke', 'Bezeichnung', 'Kategorie', 'Gebinde', 'Preis brutto (€)', 'MwSt. (%)', 'Angebot (€)', 'Angebot bis', 'Bestand', 'Meldebestand', 'Lagerplatz', 'Aktiv'],
      ...filtered.map((p) => [
        p.sku,
        p.ean ?? '',
        p.brand,
        p.name,
        catName.get(p.categoryId) ?? p.categoryId,
        p.packaging,
        p.priceGross / 100,
        p.vatRate,
        p.offer ? p.offer.priceGross / 100 : '',
        p.offer?.validUntil ?? '',
        p.stock,
        p.minStock,
        p.location ?? '',
        p.active ? 'ja' : 'nein',
      ]),
    ];
    downloadCsv(rows, `Bestandsliste-${today}.csv`);
    toast.success(`Bestandsliste mit ${filtered.length} Artikeln exportiert`);
  };

  return (
    <>
      <PageHeader
        title="Artikel & Bestand"
        documentTitle="Sortiment · Markt"
        subtitle={
          data ? (
            <>
              {formatCount(products.length)} Artikel in {categories.length} Kategorien · Lagerwert ca. {formatEuro(stockValue)} netto
            </>
          ) : (
            'Sortiment, Preise und Lagerbestand verwalten'
          )
        }
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
              Export
            </Button>
            <ButtonLink to="/admin/sortiment/neu" icon={Plus} state={{ from: location.search }}>
              Neuer Artikel
            </ButtonLink>
          </>
        }
      />

      {counts.low > 0 && !onlyLow ? (
        <AlertBanner icon={AlertTriangle} title={`${counts.low} Artikel unter Meldebestand`} cta="Anzeigen" onClick={() => toggleFlag('meldebestand')} className="mb-4">
          – jetzt nachbestellen oder Bestand prüfen.
        </AlertBanner>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-3 sm:flex-row lg:w-[34rem] lg:shrink-0">
          <SearchField value={q} onChange={(v) => setParam('q', v)} placeholder="Name, Marke, Artikelnummer, Lagerplatz …" className="flex-1" label="Artikel suchen" />
          <Select
            aria-label="Kategorie"
            value={cat}
            onChange={(e) => setParam('kategorie', e.target.value)}
            options={[{ value: '', label: 'Alle Kategorien' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            containerClassName="sm:w-56"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterChip active={onlyLow} onClick={() => toggleFlag('meldebestand')} count={counts.low} tone="warning" icon={AlertTriangle}>
            Unter Meldebestand
          </FilterChip>
          <FilterChip active={onlyOffers} onClick={() => toggleFlag('angebote')} count={counts.offers} tone="accent" icon={Tag}>
            Angebote
          </FilterChip>
          <FilterChip active={onlyInactive} onClick={() => toggleFlag('inaktiv')} count={counts.inactive} tone="neutral" icon={EyeOff}>
            Inaktiv
          </FilterChip>
          {filtersActive ? (
            <button type="button" onClick={resetFilters} className="h-9 shrink-0 rounded-full px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              Filter zurücksetzen
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={PackageSearch}
            title={products.length ? 'Keine Artikel gefunden' : 'Noch keine Artikel angelegt'}
            description={products.length ? 'Zu Ihrer Suche bzw. den gewählten Filtern passt kein Artikel.' : 'Legen Sie Ihren ersten Artikel an.'}
            action={
              products.length ? (
                <Button variant="outline" onClick={resetFilters}>
                  Filter zurücksetzen
                </Button>
              ) : (
                <ButtonLink to="/admin/sortiment/neu" icon={Plus}>
                  Neuer Artikel
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* Tabelle ab Tablet */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <SortTH label="Artikel" sortKey="name" sort={sort} onSort={onSort} />
                  <SortTH label="Kategorie" sortKey="category" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
                  <TH className="hidden 2xl:table-cell">Gebinde</TH>
                  <SortTH label="Preis brutto" sortKey="price" sort={sort} onSort={onSort} align="right" />
                  <TH className="hidden lg:table-cell">Angebot</TH>
                  <SortTH label="Bestand" sortKey="stock" sort={sort} onSort={onSort} />
                  <TH className="text-center">Aktiv</TH>
                  <TH className="w-8">
                    <span className="sr-only">Bearbeiten</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id} onClick={() => openEdit(p)} className={cn(!p.active && 'bg-slate-50/70')}>
                    <TD className="py-2.5">
                      <div className={cn('flex min-w-0 max-w-[24rem] items-center gap-3', !p.active && 'opacity-60')}>
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                          <ProductImage product={p} size={44} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{p.brand}</p>
                          <p className="truncate font-semibold text-slate-900">{p.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            <span className="2xl:hidden">{p.packaging} · </span>
                            {p.sku}
                            {p.location ? ` · ${p.location}` : ''}
                          </p>
                        </div>
                        {!p.active ? <Badge tone="neutral">Inaktiv</Badge> : null}
                      </div>
                    </TD>
                    <TD className="hidden xl:table-cell">{catName.get(p.categoryId) ?? '–'}</TD>
                    <TD className="hidden whitespace-nowrap 2xl:table-cell">{p.packaging}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <Money cents={p.priceGross} className="font-semibold text-slate-900" />
                      <p className="text-xs text-slate-500">{p.isRental ? 'pro Veranstaltung' : basePrice(p, p.priceGross)}</p>
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <OfferCell product={p} today={today} />
                    </TD>
                    <TD>
                      <StockControl product={p} onOpen={() => setAdjust(p)} />
                    </TD>
                    <TD className="text-center">
                      <ActiveSwitch product={p} />
                    </TD>
                    <TD className="pl-0 pr-3 text-slate-300">
                      <ChevronRight size={18} aria-hidden />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          {/* Karten auf dem Handy */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((p) => {
              const level = stockLevel(p);
              return (
                <li key={p.id}>
                  <Card padding="none" className={cn('overflow-hidden', !p.active && 'bg-slate-50')}>
                    <Link
                      to={`/admin/sortiment/${encodeURIComponent(p.id)}`}
                      state={{ from: location.search }}
                      className="flex items-start gap-3 p-3.5 pb-3"
                    >
                      <span className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-50', !p.active && 'opacity-60')}>
                        <ProductImage product={p} size={58} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{p.brand}</p>
                        <p className="line-clamp-2 font-semibold leading-snug text-slate-900">{p.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {p.packaging} · {catName.get(p.categoryId)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <Money cents={p.priceGross} className="font-bold text-slate-900" />
                        {p.offer && isOfferValid(p.offer, today) ? (
                          <Badge tone="accent" icon={Tag}>
                            {formatEuro(p.offer.priceGross)}
                          </Badge>
                        ) : null}
                        {!p.active ? (
                          <Badge tone="neutral">Inaktiv</Badge>
                        ) : null}
                      </div>
                    </Link>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <StockControl product={p} onOpen={() => setAdjust(p)} compact />
                        <p className={cn('mt-1 text-xs', stockTextClass(level))}>
                          {stockLabel(level)}
                          {!p.isRental ? <span className="text-slate-500"> · min. {p.minStock}</span> : null}
                        </p>
                      </div>
                      <ActiveSwitch product={p} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <TableFootnote>
            {filtered.length === products.length ? `${formatCount(products.length)} Artikel` : `${formatCount(filtered.length)} von ${formatCount(products.length)} Artikeln`} · Tippen Sie auf
            den Bestand, um Zugang, Abgang oder Inventur zu buchen.
          </TableFootnote>
        </>
      )}

      <StockAdjustModal product={liveAdjust} onClose={() => setAdjust(null)} />
    </>
  );
}
