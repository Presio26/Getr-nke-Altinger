/**
 * Sortiments-Logik des Shops: Gebinde-Art, Merkmale, fehlertolerante Suche, Filter, Facetten, Sortierung.
 * Reine Funktionen (keine React-Abhängigkeiten) – Preise kommen als PriceInfo von außen.
 */
import type { Category, DepositType, Material, Product } from '@shared/types';
import { productLiters } from '@shared/format';
import type { PriceInfo } from '@/api/hooks';

// ───────────────────────────── Gebinde-Art & Merkmale ─────────────────────────────

export type PackKind = 'kasten' | 'sixpack' | 'einzel' | 'fass' | 'dose' | 'leihartikel' | 'zubehoer';

export const PACK_ORDER: PackKind[] = ['kasten', 'sixpack', 'einzel', 'fass', 'dose', 'leihartikel', 'zubehoer'];

export const PACK_LABEL: Record<PackKind, string> = {
  kasten: 'Kasten',
  sixpack: 'Sixpack',
  einzel: 'Einzelflasche',
  fass: 'Fass',
  dose: 'Dose',
  leihartikel: 'Leihartikel',
  zubehoer: 'Zubehör',
};

export const MATERIAL_ORDER: Material[] = ['glas', 'pet', 'dose', 'fass', 'tetra', 'sonstiges'];

export const MATERIAL_LABEL: Record<Material, string> = {
  glas: 'Glas',
  pet: 'PET',
  dose: 'Dose',
  fass: 'Fass',
  tetra: 'Tetra Pak',
  sonstiges: 'Sonstiges',
};

export type FeatureKey = 'angebot' | 'regional' | 'bio' | 'alkoholfrei';

export const FEATURE_ORDER: FeatureKey[] = ['angebot', 'regional', 'bio', 'alkoholfrei'];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  angebot: 'Im Angebot',
  regional: 'Regional',
  bio: 'Bio',
  alkoholfrei: 'Alkoholfrei',
};

/** Gebinde-Art eines Artikels (für Filter und Detailangaben) */
export function packKind(p: Product, depositTypes: readonly DepositType[]): PackKind {
  if (p.isRental) return 'leihartikel';
  if (p.material === 'fass') return 'fass';
  if (p.material === 'dose') return 'dose';
  if (p.unitCount <= 1) return p.material === 'sonstiges' ? 'zubehoer' : 'einzel';
  const dep = p.depositTypeId ? depositTypes.find((d) => d.id === p.depositTypeId) : undefined;
  if (dep?.returnable) return 'kasten';
  return 'sixpack';
}

/** Getränk ohne (nennenswerten) Alkohol – Wasser, Limo, Saft, alkoholfreies Bier */
export function isAlcoholFree(p: Product): boolean {
  if (p.isRental || p.material === 'sonstiges') return false;
  if (p.tags.includes('alkoholfrei') || p.categoryId === 'alkoholfrei') return true;
  if (p.categoryId === 'wein' || p.categoryId === 'spirituosen') return false;
  return (p.alcoholPercent ?? 0) <= 0.5;
}

export function hasFeature(p: Product, key: FeatureKey, price: PriceInfo | undefined): boolean {
  switch (key) {
    case 'angebot':
      return !!price?.isOffer;
    case 'regional':
      return p.tags.includes('regional');
    case 'bio':
      return p.tags.includes('bio');
    case 'alkoholfrei':
      return isAlcoholFree(p);
  }
}

/** Beliebtheit für die Standardsortierung (Bestseller, Bewertung, Angebot, Bestand) */
export function popularity(p: Product): number {
  let score = (p.rating ?? 4.2) * 10;
  if (p.tags.includes('bestseller')) score += 12;
  if (p.offer) score += 3;
  if (p.tags.includes('neu')) score += 1;
  if (p.stock <= 0) score -= 30;
  return score;
}

// ───────────────────────────── Suche ─────────────────────────────

const UMLAUT_AE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
const UMLAUT_A: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' };

function fold(text: string, map: Record<string, string>): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => map[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Suchtext normalisieren: Kleinbuchstaben, ä → ae, ß → ss, Akzente weg, Satzzeichen → Leerzeichen */
export function normalizeSearch(text: string): string {
  return fold(text, UMLAUT_AE);
}

/** Umgangssprachliche Begriffe → Begriffe im Sortiment */
const SYNONYMS: Record<string, string[]> = {
  weizen: ['weiss'],
  weizenbier: ['weissbier'],
  hefeweizen: ['hefeweiss', 'weissbier'],
  weisse: ['weiss'],
  helles: ['hell'],
  heles: ['hell'],
  export: ['export', 'edelstoff'],
  alster: ['radler'],
  sprudel: ['classic', 'mineralwasser'],
  mineralwasser: ['wasser'],
  sprudelwasser: ['classic'],
  stilles: ['still', 'naturell'],
  limonade: ['limo'],
  brause: ['limo'],
  kola: ['cola', 'kola'],
  cola: ['cola', 'kola'],
  mezzo: ['spezi'],
  schnaps: ['spirituosen', 'likoer'],
  likor: ['likoer'],
  spritz: ['aperol'],
  sekt: ['sekt'],
  prosecco: ['sekt', 'semi seco'],
  energy: ['energy', 'red bull'],
  bierbank: ['bierzeltgarnitur', 'garnitur'],
  bierbaenke: ['bierzeltgarnitur'],
  biertisch: ['bierzeltgarnitur'],
  festzeltgarnitur: ['bierzeltgarnitur'],
  zelt: ['partyzelt'],
  pavillon: ['partyzelt'],
  zapfhahn: ['zapfanlage'],
  schankanlage: ['zapfanlage'],
  kuehlung: ['kuehl'],
  heizpilz: ['heizstrahler'],
  glaeser: ['glaeser', 'kruege'],
  becher: ['becher'],
  eis: ['eiswuerfel'],
  fassbier: ['fass'],
  kiste: ['kasten'],
  kasten: ['kasten'],
  flasche: ['flasche', 'einzelflasche'],
  dosen: ['dose'],
  saefte: ['saft'],
  schorle: ['schorle'],
};

interface Field {
  text: string;
  /** Wörter für die Tippfehler-Toleranz */
  words: string[];
  weight: number;
}

export interface SearchIndexEntry {
  product: Product;
  fields: Field[];
  /** Marke+Name ohne Leerzeichen ("augustinerlagerbierhell") */
  compact: string;
}

function field(raw: string, weight: number): Field {
  const ae = fold(raw, UMLAUT_AE);
  const a = fold(raw, UMLAUT_A);
  const text = ae === a ? ` ${ae} ` : ` ${ae} ${a} `;
  const words = Array.from(new Set(text.split(' ').filter((w) => w.length >= 3)));
  return { text, words, weight };
}

export function buildSearchIndex(products: readonly Product[], categories: readonly Category[], depositTypes: readonly DepositType[]): SearchIndexEntry[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return products.map((p) => {
    const kind = packKind(p, depositTypes);
    const meta = [
      PACK_LABEL[kind],
      kind === 'kasten' ? 'Kiste' : '',
      MATERIAL_LABEL[p.material],
      p.tags.join(' '),
      isAlcoholFree(p) ? 'alkoholfrei' : '',
      p.isRental ? 'Verleih Leihartikel Fest' : '',
      p.origin ?? '',
      p.sku,
    ].join(' ');
    return {
      product: p,
      fields: [
        field(p.brand, 3),
        field(p.name, 3),
        field(catName.get(p.categoryId) ?? '', 2),
        field(p.packaging, 1.2),
        field(meta, 1),
        field(p.description, 0.4),
      ],
      compact: normalizeSearch(`${p.brand}${p.name}`).replace(/ /g, ''),
    };
  });
}

/** Levenshtein-Distanz mit frühem Abbruch */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function allowedTypos(token: string): number {
  if (token.length >= 8) return 2;
  if (token.length >= 4) return 1;
  return 0;
}

/** Bewertung eines Suchworts für einen Artikel (0 = kein Treffer) */
function tokenScore(entry: SearchIndexEntry, token: string): number {
  let best = 0;
  for (const f of entry.fields) {
    const idx = f.text.indexOf(token);
    if (idx >= 0) {
      // Wortanfang zählt mehr als ein Treffer mitten im Wort
      const atWordStart = f.text[idx - 1] === ' ';
      const s = f.weight * (atWordStart ? 1 : 0.6);
      if (s > best) best = s;
    }
  }
  if (best === 0 && token.length >= 4 && entry.compact.includes(token)) best = 2.5;
  if (best > 0) return best;
  // Tippfehler: ähnliches Wort (auch als Wortanfang für halb getippte Begriffe)
  const typos = allowedTypos(token);
  if (!typos) return 0;
  for (const f of entry.fields) {
    if (f.weight < 1) continue;
    for (const w of f.words) {
      const d = Math.min(editDistance(token, w, typos), w.length > token.length ? editDistance(token, w.slice(0, token.length), typos) : typos + 1);
      if (d <= typos) best = Math.max(best, f.weight * (d === 1 ? 0.55 : 0.4));
    }
  }
  return best;
}

/** Suchbegriff in Wörter zerlegen (mit Synonymen als Alternativen) */
export function parseQuery(q: string): string[][] {
  const tokens = normalizeSearch(q).split(' ').filter(Boolean);
  return tokens.map((t) => [t, ...(SYNONYMS[t] ?? []).map(normalizeSearch)]);
}

/** Relevanz eines Artikels für die Suchanfrage (0 = passt nicht) */
export function searchScore(entry: SearchIndexEntry, query: string[][]): number {
  if (!query.length) return 1;
  let total = 0;
  for (const alternatives of query) {
    let best = 0;
    for (const alt of alternatives) {
      const parts = alt.split(' ');
      // mehrteilige Synonyme: alle Teile müssen passen
      const s = parts.length > 1 ? Math.min(...parts.map((p) => tokenScore(entry, p))) : tokenScore(entry, alt);
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** „Meinten Sie …?“ – ähnlichster Marken- oder Produktname zur Anfrage */
export function suggestTerm(products: readonly Product[], q: string): string | null {
  const term = normalizeSearch(q);
  if (term.length < 3) return null;
  const candidates = new Map<string, string>();
  for (const p of products) {
    candidates.set(normalizeSearch(p.brand), p.brand);
    for (const w of p.name.split(/[\s–-]+/)) if (w.length >= 4) candidates.set(normalizeSearch(w), w.replace(/[(),]/g, ''));
  }
  let best: { label: string; d: number } | null = null;
  for (const [norm, label] of candidates) {
    const d = editDistance(term, norm, 3);
    if (d <= 3 && d > 0 && (!best || d < best.d)) best = { label, d };
  }
  return best?.label ?? null;
}

// ───────────────────────────── Filter & Sortierung ─────────────────────────────

export type SortKey = 'relevanz' | 'beliebt' | 'preis-auf' | 'preis-ab' | 'name' | 'grundpreis';

export const SORT_LABEL: Record<SortKey, string> = {
  relevanz: 'Relevanz',
  beliebt: 'Beliebtheit',
  'preis-auf': 'Preis aufsteigend',
  'preis-ab': 'Preis absteigend',
  name: 'Name (A–Z)',
  grundpreis: 'Grundpreis (€/l)',
};

export interface CatalogFilters {
  brands: string[];
  packs: PackKind[];
  materials: Material[];
  features: FeatureKey[];
  /** Preis in Cent (Anzeigepreis: brutto bzw. netto für Geschäftskunden) */
  minPrice?: number;
  maxPrice?: number;
}

export type FacetKey = 'brands' | 'packs' | 'materials' | 'features' | 'price';

export interface CatalogItem {
  product: Product;
  price: PriceInfo;
  pack: PackKind;
  score: number;
}

export function matchesFilters(item: CatalogItem, f: CatalogFilters, skip?: FacetKey): boolean {
  const p = item.product;
  if (skip !== 'brands' && f.brands.length && !f.brands.includes(p.brand)) return false;
  if (skip !== 'packs' && f.packs.length && !f.packs.includes(item.pack)) return false;
  if (skip !== 'materials' && f.materials.length && !f.materials.includes(p.material)) return false;
  if (skip !== 'features' && f.features.length && !f.features.every((k) => hasFeature(p, k, item.price))) return false;
  if (skip !== 'price') {
    if (f.minPrice !== undefined && item.price.displayUnit < f.minPrice) return false;
    if (f.maxPrice !== undefined && item.price.displayUnit > f.maxPrice) return false;
  }
  return true;
}

export function activeFilterCount(f: CatalogFilters): number {
  return f.brands.length + f.packs.length + f.materials.length + f.features.length + (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0);
}

/** Grundpreis in Cent je Liter (Infinity ohne Volumen, z. B. Leihartikel) */
export function pricePerLiter(item: CatalogItem): number {
  const liters = productLiters(item.product);
  return liters > 0 ? item.price.unitGross / liters : Number.POSITIVE_INFINITY;
}

const collator = new Intl.Collator('de-DE', { sensitivity: 'base', numeric: true });

export function sortItems(items: CatalogItem[], sort: SortKey): CatalogItem[] {
  const byName = (a: CatalogItem, b: CatalogItem) => collator.compare(`${a.product.brand} ${a.product.name}`, `${b.product.brand} ${b.product.name}`);
  const byPopularity = (a: CatalogItem, b: CatalogItem) => popularity(b.product) - popularity(a.product) || byName(a, b);
  const list = [...items];
  switch (sort) {
    case 'relevanz':
      return list.sort((a, b) => b.score - a.score || byPopularity(a, b));
    case 'beliebt':
      return list.sort(byPopularity);
    case 'preis-auf':
      return list.sort((a, b) => a.price.displayUnit - b.price.displayUnit || byName(a, b));
    case 'preis-ab':
      return list.sort((a, b) => b.price.displayUnit - a.price.displayUnit || byName(a, b));
    case 'name':
      return list.sort(byName);
    case 'grundpreis':
      return list.sort((a, b) => pricePerLiter(a) - pricePerLiter(b) || byName(a, b));
  }
}

/** Kategorien, die zueinander passen („Passt dazu“) */
export const CATEGORY_AFFINITY: Record<string, string[]> = {
  bier: ['alkoholfrei', 'limo', 'fass'],
  alkoholfrei: ['bier', 'wasser', 'saft'],
  wasser: ['saft', 'limo', 'alkoholfrei'],
  limo: ['wasser', 'saft', 'spirituosen'],
  saft: ['wasser', 'limo'],
  wein: ['wasser', 'spirituosen', 'saft'],
  spirituosen: ['limo', 'fass', 'wein'],
  fass: ['leihartikel', 'fass', 'limo'],
  leihartikel: ['fass', 'leihartikel', 'bier'],
};
