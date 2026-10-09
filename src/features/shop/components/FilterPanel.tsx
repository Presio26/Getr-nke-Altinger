import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Material } from '@shared/types';
import { formatEuro } from '@shared/format';
import { cn } from '@/lib/cn';
import {
  FEATURE_LABEL,
  FEATURE_ORDER,
  MATERIAL_LABEL,
  MATERIAL_ORDER,
  PACK_LABEL,
  PACK_ORDER,
  normalizeSearch,
  type CatalogFilters,
  type FeatureKey,
  type PackKind,
} from './catalog';
import { centsToEuroInput, PARAM } from './useCatalogParams';

export interface FacetCounts {
  brands: Map<string, number>;
  packs: Map<PackKind, number>;
  materials: Map<Material, number>;
  features: Map<FeatureKey, number>;
  /** Anzeigepreise (Cent) der Artikel, die zu allen übrigen Filtern passen */
  prices: number[];
}

interface FilterPanelProps {
  filters: CatalogFilters;
  counts: FacetCounts;
  /** Nettopreise (Geschäftskunde) */
  net: boolean;
  onToggle: (param: string, value: string) => void;
  onPrice: (min: number | undefined, max: number | undefined) => void;
  className?: string;
}

/** Filter für Merkmale, Gebinde-Art, Marke, Material und Preis – mit Trefferzahlen je Option */
export function FilterPanel({ filters, counts, net, onToggle, onPrice, className }: FilterPanelProps) {
  const brandEntries = [...counts.brands.entries()]
    .concat(filters.brands.filter((b) => !counts.brands.has(b)).map((b) => [b, 0] as [string, number]))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));

  return (
    <div className={cn('divide-y divide-slate-200/80', className)}>
      <FilterGroup title="Merkmale">
        <OptionList>
          {FEATURE_ORDER.map((k) => (
            <FacetOption
              key={k}
              label={FEATURE_LABEL[k]}
              count={counts.features.get(k) ?? 0}
              checked={filters.features.includes(k)}
              onClick={() => onToggle(PARAM.feature, k)}
              accent={k === 'angebot'}
            />
          ))}
        </OptionList>
      </FilterGroup>

      <FilterGroup title="Gebinde-Art">
        <OptionList>
          {PACK_ORDER.filter((k) => (counts.packs.get(k) ?? 0) > 0 || filters.packs.includes(k)).map((k) => (
            <FacetOption key={k} label={PACK_LABEL[k]} count={counts.packs.get(k) ?? 0} checked={filters.packs.includes(k)} onClick={() => onToggle(PARAM.pack, k)} />
          ))}
        </OptionList>
      </FilterGroup>

      <FilterGroup title="Marke" badge={filters.brands.length || undefined}>
        <BrandList entries={brandEntries} selected={filters.brands} onToggle={(b) => onToggle(PARAM.brand, b)} />
      </FilterGroup>

      <FilterGroup title="Material">
        <OptionList>
          {MATERIAL_ORDER.filter((k) => (counts.materials.get(k) ?? 0) > 0 || filters.materials.includes(k)).map((k) => (
            <FacetOption
              key={k}
              label={MATERIAL_LABEL[k]}
              count={counts.materials.get(k) ?? 0}
              checked={filters.materials.includes(k)}
              onClick={() => onToggle(PARAM.material, k)}
            />
          ))}
        </OptionList>
      </FilterGroup>

      <FilterGroup title={net ? 'Preis (netto)' : 'Preis'}>
        <PriceFilter min={filters.minPrice} max={filters.maxPrice} prices={counts.prices} onChange={onPrice} />
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, badge, children }: { title: string; badge?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="py-4 first:pt-0 last:pb-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500 hover:text-slate-800"
        >
          <span className="flex items-center gap-2">
            {title}
            {badge ? <span className="rounded-full bg-brand-700 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tracking-normal">{badge}</span> : null}
          </span>
          <ChevronDown size={17} aria-hidden className={cn('shrink-0 transition-transform', open ? 'rotate-180' : '')} />
        </button>
      </h3>
      {open ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}

function OptionList({ children }: { children: ReactNode }) {
  return <ul className="space-y-0.5">{children}</ul>;
}

function FacetOption({ label, count, checked, onClick, accent = false }: { label: string; count: number; checked: boolean; onClick: () => void; accent?: boolean }) {
  const empty = count === 0 && !checked;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onClick}
        disabled={empty}
        className={cn(
          'group flex min-h-10 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] transition-colors',
          checked ? 'bg-brand-50 font-semibold text-brand-900' : 'text-slate-700 hover:bg-slate-100',
          empty && 'cursor-default opacity-45 hover:bg-transparent',
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
            checked ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white group-hover:border-slate-400',
          )}
        >
          {checked ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {accent ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent-500 align-middle" aria-hidden /> : null}
          {label}
        </span>
        <span className={cn('shrink-0 text-xs font-semibold tabular-nums', checked ? 'text-brand-700' : 'text-slate-400')}>{count}</span>
      </button>
    </li>
  );
}

const BRAND_PREVIEW = 8;

function BrandList({ entries, selected, onToggle }: { entries: [string, number][]; selected: string[]; onToggle: (brand: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [term, setTerm] = useState('');
  const needle = normalizeSearch(term);
  const filtered = needle ? entries.filter(([b]) => normalizeSearch(b).includes(needle)) : entries;
  // ausgewählte Marken immer zeigen
  const visible = expanded || needle ? filtered : filtered.filter(([b], i) => i < BRAND_PREVIEW || selected.includes(b));
  return (
    <div>
      {entries.length > BRAND_PREVIEW ? (
        <label className="relative mb-2 block">
          <span className="sr-only">Marke suchen</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Marke suchen"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-sm"
          />
        </label>
      ) : null}
      <OptionList>
        {visible.map(([b, n]) => (
          <FacetOption key={b} label={b} count={n} checked={selected.includes(b)} onClick={() => onToggle(b)} />
        ))}
      </OptionList>
      {needle && !filtered.length ? <p className="px-2 py-2 text-sm text-slate-500">Keine passende Marke.</p> : null}
      {!needle && filtered.length > BRAND_PREVIEW ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 min-h-10 px-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
          {expanded ? 'Weniger anzeigen' : `Alle ${filtered.length} Marken anzeigen`}
        </button>
      ) : null}
    </div>
  );
}

const PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'bis 10 €', max: 1000 },
  { label: '10 – 20 €', min: 1000, max: 2000 },
  { label: '20 – 50 €', min: 2000, max: 5000 },
  { label: 'über 50 €', min: 5000 },
];

function parseEuro(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

function PriceFilter({ min, max, prices, onChange }: { min?: number; max?: number; prices: number[]; onChange: (min: number | undefined, max: number | undefined) => void }) {
  const [from, setFrom] = useState(centsToEuroInput(min));
  const [to, setTo] = useState(centsToEuroInput(max));
  useEffect(() => setFrom(centsToEuroInput(min)), [min]);
  useEffect(() => setTo(centsToEuroInput(max)), [max]);

  const lowest = prices.length ? Math.min(...prices) : undefined;
  const highest = prices.length ? Math.max(...prices) : undefined;

  const apply = () => {
    let a = parseEuro(from);
    let b = parseEuro(to);
    if (a !== undefined && b !== undefined && a > b) [a, b] = [b, a];
    if (a !== min || b !== max) onChange(a, b);
  };

  const field = (value: string, set: (v: string) => void, label: string, placeholder: string) => (
    <label className="relative block min-w-0 flex-1">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value.replace(/[^\d,.]/g, '').slice(0, 7))}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
        inputMode="decimal"
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-7 text-base tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-sm"
      />
      <span className="pointer-events-none absolute bottom-2.5 right-3 text-sm text-slate-400">€</span>
    </label>
  );

  return (
    <div>
      <div className="flex items-end gap-2">
        {field(from, setFrom, 'von', lowest !== undefined ? centsToEuroInput(Math.floor(lowest / 100) * 100) : '0')}
        <span className="pb-2.5 text-slate-400" aria-hidden>
          –
        </span>
        {field(to, setTo, 'bis', highest !== undefined ? centsToEuroInput(Math.ceil(highest / 100) * 100) : '')}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = p.min === min && p.max === max;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => (active ? onChange(undefined, undefined) : onChange(p.min, p.max))}
              className={cn(
                'h-9 rounded-full px-3 text-[13px] font-semibold ring-1 ring-inset transition-colors',
                active ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {lowest !== undefined && highest !== undefined ? (
        <p className="mt-2.5 text-xs text-slate-500">
          Preise von {formatEuro(lowest)} bis {formatEuro(highest)}
        </p>
      ) : null}
    </div>
  );
}
