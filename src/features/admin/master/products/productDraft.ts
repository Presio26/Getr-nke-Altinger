/**
 * Formularzustand des Artikel-Editors: Umwandlung Produkt ⇄ Entwurf und Prüfung (spiegelt die Core-Validierung).
 */
import type { Category, Material, Product, ProductInput } from '@shared/types';
import { todayString } from '@shared/time';
import { HEX_RE, decimalInput, euroInput, netFromGross, parseDecimalInput, parseEuro, parseIntInput } from '../lib';

export interface TierDraft {
  key: string;
  minQty: string;
  priceNet: string;
}

export interface ProductDraft {
  name: string;
  brand: string;
  categoryId: string;
  sku: string;
  ean: string;
  description: string;
  origin: string;
  tags: string[];
  packaging: string;
  unitCount: string;
  unitVolumeL: string;
  material: Material;
  depositTypeId: string;
  alcohol: string;
  price: string;
  vatRate: 19 | 7;
  offerOn: boolean;
  offerPrice: string;
  offerUntil: string;
  offerLabel: string;
  tiers: TierDraft[];
  stock: string;
  minStock: string;
  location: string;
  color: string;
  accent: string;
  isRental: boolean;
  active: boolean;
}

export type DraftErrors = Partial<Record<keyof ProductDraft | `tier-${string}` | 'tiers', string>>;

export const MATERIAL_OPTIONS: { value: Material; label: string }[] = [
  { value: 'glas', label: 'Glas' },
  { value: 'pet', label: 'PET' },
  { value: 'dose', label: 'Dose' },
  { value: 'fass', label: 'Fass' },
  { value: 'tetra', label: 'Tetra-Pak' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

export const TAG_SUGGESTIONS: { value: string; label: string }[] = [
  { value: 'regional', label: 'Regional' },
  { value: 'bestseller', label: 'Bestseller' },
  { value: 'neu', label: 'Neu' },
  { value: 'bio', label: 'Bio' },
  { value: 'alkoholfrei', label: 'Alkoholfrei' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'glutenfrei', label: 'Glutenfrei' },
];

let tierSeq = 0;
export function newTierKey(): string {
  tierSeq += 1;
  return `t${tierSeq}`;
}

export function emptyDraft(): ProductDraft {
  return {
    name: '',
    brand: '',
    categoryId: '',
    sku: '',
    ean: '',
    description: '',
    origin: '',
    tags: [],
    packaging: '',
    unitCount: '1',
    unitVolumeL: '',
    material: 'glas',
    depositTypeId: '',
    alcohol: '',
    price: '',
    vatRate: 19,
    offerOn: false,
    offerPrice: '',
    offerUntil: '',
    offerLabel: 'Angebot der Woche',
    tiers: [],
    stock: '0',
    minStock: '0',
    location: '',
    color: '#1d58a0',
    accent: '#f2a900',
    isRental: false,
    active: true,
  };
}

export function draftFromProduct(p: Product): ProductDraft {
  return {
    name: p.name,
    brand: p.brand,
    categoryId: p.categoryId,
    sku: p.sku,
    ean: p.ean ?? '',
    description: p.description,
    origin: p.origin ?? '',
    tags: [...p.tags],
    packaging: p.packaging,
    unitCount: String(p.unitCount),
    unitVolumeL: decimalInput(p.unitVolumeL),
    material: p.material,
    depositTypeId: p.depositTypeId ?? '',
    alcohol: p.alcoholPercent !== undefined ? decimalInput(p.alcoholPercent) : '',
    price: euroInput(p.priceGross),
    vatRate: p.vatRate,
    offerOn: !!p.offer,
    offerPrice: euroInput(p.offer?.priceGross),
    offerUntil: p.offer?.validUntil ?? '',
    offerLabel: p.offer ? (p.offer.label ?? '') : 'Angebot der Woche',
    tiers: (p.tierPrices ?? []).map((t) => ({ key: newTierKey(), minQty: String(t.minQty), priceNet: euroInput(t.priceNet) })),
    stock: String(p.stock),
    minStock: String(p.minStock),
    location: p.location ?? '',
    color: p.color,
    accent: p.accent,
    isRental: !!p.isRental,
    active: p.active,
  };
}

/** Vergleichbare Darstellung (für „ungespeicherte Änderungen“) */
export function draftKey(d: ProductDraft): string {
  return JSON.stringify({ ...d, tiers: d.tiers.map((t) => [t.minQty, t.priceNet]) });
}

export function validateDraft(d: ProductDraft, categories: Category[]): DraftErrors {
  const e: DraftErrors = {};
  if (!d.name.trim()) e.name = 'Bitte geben Sie eine Artikelbezeichnung an.';
  if (!d.brand.trim()) e.brand = 'Bitte geben Sie die Marke bzw. den Hersteller an.';
  if (!categories.some((c) => c.id === d.categoryId)) e.categoryId = 'Bitte wählen Sie eine Kategorie.';
  if (!d.packaging.trim()) e.packaging = 'Bitte beschreiben Sie das Gebinde, z. B. „20 × 0,5 l Glas“.';
  if (d.ean.trim() && !/^\d{8,14}$/.test(d.ean.trim())) e.ean = 'Die EAN besteht aus 8 bis 14 Ziffern.';

  const unitCount = parseIntInput(d.unitCount);
  if (unitCount === null || unitCount < 1) e.unitCount = 'Mindestens 1.';
  const vol = d.unitVolumeL.trim() ? parseDecimalInput(d.unitVolumeL) : 0;
  if (vol === null || vol < 0 || vol > 100) e.unitVolumeL = 'Bitte Liter angeben, z. B. 0,5.';
  else if (!d.isRental && vol === 0) e.unitVolumeL = 'Bitte den Inhalt je Einheit angeben.';
  if (d.alcohol.trim()) {
    const a = parseDecimalInput(d.alcohol);
    if (a === null || a < 0 || a > 100) e.alcohol = 'Bitte einen Wert zwischen 0 und 100 angeben.';
  }

  const price = parseEuro(d.price);
  if (price === null || price <= 0) e.price = 'Bitte einen gültigen Preis angeben, z. B. 19,49.';
  if (d.offerOn) {
    const op = parseEuro(d.offerPrice);
    if (op === null || op <= 0) e.offerPrice = 'Bitte einen gültigen Angebotspreis angeben.';
    else if (price !== null && op >= price) e.offerPrice = 'Der Angebotspreis muss unter dem regulären Preis liegen.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.offerUntil)) e.offerUntil = 'Bitte ein Enddatum wählen.';
    else if (d.offerUntil < todayString()) e.offerUntil = 'Das Enddatum liegt in der Vergangenheit.';
  }

  const seen = new Set<number>();
  for (const t of d.tiers) {
    const q = parseIntInput(t.minQty);
    const n = parseEuro(t.priceNet);
    if (q === null || q < 2) e[`tier-${t.key}`] = 'Ab-Menge mindestens 2.';
    else if (seen.has(q)) e[`tier-${t.key}`] = `Die Staffel ab ${q} gibt es doppelt.`;
    else if (n === null || n <= 0) e[`tier-${t.key}`] = 'Bitte einen gültigen Netto-Preis angeben.';
    // Staffelpreis über dem Listen-Netto: nur Hinweis (siehe tierWarnings) – der günstigste Preis gewinnt ohnehin
    if (q !== null) seen.add(q);
  }

  const stock = parseIntInput(d.stock);
  if (stock === null || stock < 0) e.stock = 'Ganze Zahl ≥ 0.';
  const min = parseIntInput(d.minStock);
  if (min === null || min < 0) e.minStock = 'Ganze Zahl ≥ 0.';
  if (!HEX_RE.test(d.color)) e.color = 'Hex-Farbe, z. B. #8C1D18.';
  if (!HEX_RE.test(d.accent)) e.accent = 'Hex-Farbe, z. B. #E5C07B.';
  return e;
}

/**
 * Hinweise (blockieren das Speichern nicht): Staffelpreise, die nicht unter dem Listen-Netto liegen,
 * bringen Geschäftskunden keinen Vorteil – es gilt dann der Listen- bzw. Rabattpreis.
 */
export function tierWarnings(d: ProductDraft): Record<string, string> {
  const price = parseEuro(d.price);
  if (price === null || price <= 0) return {};
  const listNet = netFromGross(price, d.vatRate);
  const out: Record<string, string> = {};
  for (const t of d.tiers) {
    const n = parseEuro(t.priceNet);
    if (n !== null && n > 0 && n >= listNet) out[t.key] = 'Liegt nicht unter dem Listen-Netto – wirkt erst, wenn Sie ihn senken (sonst gilt der günstigere Listenpreis).';
  }
  return out;
}

/** Staffelpreise im Verhältnis zur Preisänderung anpassen (Listen-Netto alt → neu) */
export function scaleTiers(tiers: TierDraft[], fromListNet: number, toListNet: number): TierDraft[] {
  if (fromListNet <= 0 || toListNet <= 0) return tiers;
  const f = toListNet / fromListNet;
  return tiers.map((t) => {
    const n = parseEuro(t.priceNet);
    if (n === null || n <= 0) return t;
    const scaled = Math.max(1, Math.round(n * f));
    return { ...t, priceNet: (scaled / 100).toFixed(2).replace('.', ',') };
  });
}

/** Entwurf → ProductInput (setzt gültige Eingaben voraus) */
export function draftToInput(d: ProductDraft, base: Product | undefined): ProductInput {
  const input: ProductInput = {
    sku: d.sku.trim(),
    name: d.name.trim(),
    brand: d.brand.trim(),
    categoryId: d.categoryId,
    description: d.description.trim(),
    packaging: d.packaging.trim(),
    unitCount: parseIntInput(d.unitCount) ?? 1,
    unitVolumeL: d.unitVolumeL.trim() ? (parseDecimalInput(d.unitVolumeL) ?? 0) : 0,
    material: d.material,
    priceGross: parseEuro(d.price) ?? 0,
    vatRate: d.vatRate,
    tags: d.tags,
    stock: parseIntInput(d.stock) ?? 0,
    minStock: parseIntInput(d.minStock) ?? 0,
    active: d.active,
    color: d.color.toLowerCase(),
    accent: d.accent.toLowerCase(),
  };
  if (base) input.id = base.id;
  if (base?.rating !== undefined) input.rating = base.rating;
  if (d.ean.trim()) input.ean = d.ean.trim();
  if (d.depositTypeId && !d.isRental) input.depositTypeId = d.depositTypeId;
  if (d.alcohol.trim()) input.alcoholPercent = parseDecimalInput(d.alcohol) ?? undefined;
  if (d.offerOn) {
    input.offer = { priceGross: parseEuro(d.offerPrice) ?? 0, validUntil: d.offerUntil };
    if (d.offerLabel.trim()) input.offer.label = d.offerLabel.trim();
  }
  if (d.tiers.length) {
    input.tierPrices = d.tiers
      .map((t) => ({ minQty: parseIntInput(t.minQty) ?? 0, priceNet: parseEuro(t.priceNet) ?? 0 }))
      .sort((a, b) => a.minQty - b.minQty);
  }
  if (d.origin.trim()) input.origin = d.origin.trim();
  if (d.location.trim()) input.location = d.location.trim();
  if (d.isRental) input.isRental = true;
  return input;
}

/** Vorschau-Produkt für ProductImage/Preis aus dem Entwurf (mit sinnvollen Rückfallwerten) */
export function previewProduct(d: ProductDraft, base: Product | undefined): Product {
  return {
    id: base?.id ?? 'vorschau',
    sku: d.sku || base?.sku || 'AL-NEU',
    name: d.name || 'Neuer Artikel',
    brand: d.brand || 'Marke',
    categoryId: d.categoryId || 'bier',
    description: d.description,
    packaging: d.packaging || 'Gebinde',
    unitCount: Math.max(1, parseIntInput(d.unitCount) ?? 1),
    unitVolumeL: parseDecimalInput(d.unitVolumeL) ?? 0,
    material: d.material,
    priceGross: parseEuro(d.price) ?? 0,
    vatRate: d.vatRate,
    depositTypeId: d.depositTypeId && !d.isRental ? d.depositTypeId : undefined,
    tags: d.tags,
    stock: parseIntInput(d.stock) ?? 0,
    minStock: parseIntInput(d.minStock) ?? 0,
    active: d.active,
    color: HEX_RE.test(d.color) ? d.color : '#1d58a0',
    accent: HEX_RE.test(d.accent) ? d.accent : '#f2a900',
    isRental: d.isRental || undefined,
  };
}
