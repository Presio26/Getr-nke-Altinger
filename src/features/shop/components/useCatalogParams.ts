import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Material } from '@shared/types';
import {
  FEATURE_ORDER,
  MATERIAL_ORDER,
  PACK_ORDER,
  SORT_LABEL,
  type CatalogFilters,
  type FeatureKey,
  type PackKind,
  type SortKey,
} from './catalog';

/** URL-Parameter des Sortiments: ?q=…&marke=…&gebinde=…&material=…&merkmal=…&min=…&max=…&sort=…&ansicht=liste */
export const PARAM = {
  q: 'q',
  brand: 'marke',
  pack: 'gebinde',
  material: 'material',
  feature: 'merkmal',
  min: 'min',
  max: 'max',
  sort: 'sort',
  view: 'ansicht',
} as const;

export type CatalogView = 'raster' | 'liste';

function list(params: URLSearchParams, key: string): string[] {
  return Array.from(new Set(params.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)));
}

/** "12,50" → 1250 Cent; ungültig → undefined */
function euroToCents(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** 1250 → "12,5" (für URL und Eingabefelder) */
export function centsToEuroInput(c: number | undefined): string {
  if (c === undefined) return '';
  const v = c / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '').replace('.', ',');
}

export function useCatalogParams() {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const q = (params.get(PARAM.q) ?? '').trim();
    const filters: CatalogFilters = {
      brands: list(params, PARAM.brand),
      packs: list(params, PARAM.pack).filter((v): v is PackKind => (PACK_ORDER as string[]).includes(v)),
      materials: list(params, PARAM.material).filter((v): v is Material => (MATERIAL_ORDER as string[]).includes(v)),
      features: list(params, PARAM.feature).filter((v): v is FeatureKey => (FEATURE_ORDER as string[]).includes(v)),
      minPrice: euroToCents(params.get(PARAM.min)),
      maxPrice: euroToCents(params.get(PARAM.max)),
    };
    const rawSort = params.get(PARAM.sort) as SortKey | null;
    let sort: SortKey = rawSort && rawSort in SORT_LABEL ? rawSort : q ? 'relevanz' : 'beliebt';
    if (sort === 'relevanz' && !q) sort = 'beliebt';
    const view: CatalogView = params.get(PARAM.view) === 'liste' ? 'liste' : 'raster';
    return { q, filters, sort, view };
  }, [params]);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );

  const toggle = useCallback(
    (key: string, value: string) =>
      update((next) => {
        const current = list(next, key);
        next.delete(key);
        const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        for (const v of values) next.append(key, v);
      }),
    [update],
  );

  const setPrice = useCallback(
    (min: number | undefined, max: number | undefined) =>
      update((next) => {
        if (min === undefined) next.delete(PARAM.min);
        else next.set(PARAM.min, centsToEuroInput(min));
        if (max === undefined) next.delete(PARAM.max);
        else next.set(PARAM.max, centsToEuroInput(max));
      }),
    [update],
  );

  const setSort = useCallback((sort: SortKey) => update((next) => next.set(PARAM.sort, sort)), [update]);

  const setView = useCallback(
    (view: CatalogView) =>
      update((next) => {
        if (view === 'liste') next.set(PARAM.view, 'liste');
        else next.delete(PARAM.view);
      }),
    [update],
  );

  const resetFilters = useCallback(
    () =>
      update((next) => {
        for (const k of [PARAM.brand, PARAM.pack, PARAM.material, PARAM.feature, PARAM.min, PARAM.max]) next.delete(k);
      }),
    [update],
  );

  /** Query-String für einen Kategorie-Wechsel: Suche, Merkmale, Preis, Sortierung und Ansicht bleiben erhalten */
  const searchForCategory = useCallback(() => {
    const next = new URLSearchParams(params);
    for (const k of [PARAM.brand, PARAM.pack, PARAM.material]) next.delete(k);
    const s = next.toString();
    return s ? `?${s}` : '';
  }, [params]);

  return { ...state, params, update, toggle, setPrice, setSort, setView, resetFilters, searchForCategory };
}
