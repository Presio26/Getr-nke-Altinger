/**
 * Demo-Sortiment eines bayerischen Getränkemarkts (Preise = Demo-Werte 2026).
 * Markennamen sind übliche Sortimentsartikel; es werden nur Farben, keine Logos verwendet.
 */
import type { Category, DepositType, Material, Product, TierPrice } from '../../types';
import { addDays } from '../../time';

export const CATEGORIES: Category[] = [
  { id: 'bier', name: 'Bier', icon: 'Beer', color: '#d97706', description: 'Helles, Weißbier, Export & Spezialitäten aus Bayern', sort: 1 },
  { id: 'alkoholfrei', name: 'Alkoholfreie Biere & Radler', icon: 'BeerOff', color: '#0d9488', description: 'Voller Geschmack, 0,0 bis 0,5 % – ideal nach dem Sport', sort: 2 },
  { id: 'wasser', name: 'Wasser', icon: 'Droplets', color: '#0284c7', description: 'Mineral- und Heilwasser aus bayerischen Quellen', sort: 3 },
  { id: 'limo', name: 'Limo, Cola & Spezi', icon: 'CupSoda', color: '#ea580c', description: 'Erfrischungsgetränke, Cola-Mix und Energy', sort: 4 },
  { id: 'saft', name: 'Säfte & Schorlen', icon: 'Citrus', color: '#65a30d', description: 'Fruchtsäfte, Nektare und Schorlen', sort: 5 },
  { id: 'wein', name: 'Wein & Sekt', icon: 'Wine', color: '#9f1239', description: 'Frankenwein, Klassiker aus Europa und Sekt zum Anstoßen', sort: 6 },
  { id: 'spirituosen', name: 'Spirituosen', icon: 'Martini', color: '#7c3aed', description: 'Kräuterliköre, Aperitifs, Gin und Rum', sort: 7 },
  { id: 'fass', name: 'Fassbier & Party', icon: 'PartyPopper', color: '#b45309', description: 'Fässer, Partyfässer, Eis und Becher für Ihr Fest', sort: 8 },
  { id: 'leihartikel', name: 'Festbedarf & Verleih', icon: 'Tent', color: '#1d58a0', description: 'Bierzeltgarnituren, Zapfanlagen, Kühlung & mehr – zum Ausleihen', sort: 9 },
];

export const DEPOSIT_TYPES: DepositType[] = [
  { id: 'kasten-bier-20', name: 'Bierkasten 20 × 0,5 l (Mehrweg)', shortName: 'Bierkasten (20er)', amount: 310, returnable: true },
  { id: 'kasten-bier-24', name: 'Bierkasten 24 × 0,33 l (Mehrweg)', shortName: 'Bierkasten (24er)', amount: 342, returnable: true },
  { id: 'flaschen-bier-6', name: '6 Bierflaschen (Mehrweg, einzeln)', shortName: 'Bierflaschen (6 Stück)', amount: 48, returnable: false },
  { id: 'kasten-glas-12', name: 'Kasten Wasser/Limo 12 × 0,7/0,75 l Glas (Mehrweg)', shortName: 'Wasserkasten Glas (12er)', amount: 330, returnable: true },
  { id: 'kasten-pet-12', name: 'Kasten 12 × 1,0/0,5 l PET (Mehrweg)', shortName: 'PET-Kasten (12er)', amount: 330, returnable: true },
  { id: 'kasten-saft-6', name: 'Saftkasten 6 × 1,0 l Glas (Mehrweg)', shortName: 'Saftkasten (6er)', amount: 240, returnable: true },
  { id: 'kasten-soft-24', name: 'Kasten 24 × 0,33 l Glas (Mehrweg)', shortName: 'Limokasten (24er)', amount: 510, returnable: true },
  { id: 'einweg-pet-6', name: '6 × 1,5 l PET (Einweg)', shortName: 'Einweg-PET (6er)', amount: 150, returnable: false },
  { id: 'dose-24', name: '24 Dosen (Einweg)', shortName: 'Dosen (24 Stück)', amount: 600, returnable: false },
  { id: 'fass-30', name: 'Bierfass 30 l', shortName: 'Fass 30 l', amount: 3000, returnable: true },
  { id: 'fass-50', name: 'Bierfass 50 l', shortName: 'Fass 50 l', amount: 3000, returnable: true },
];

interface ProductDef {
  id: string;
  brand: string;
  name: string;
  cat: string;
  pack: string;
  units: number;
  vol: number;
  mat: Material;
  price: number;
  vat?: 7 | 19;
  dep?: string;
  alc?: number;
  tags: string[];
  stock: number;
  min: number;
  color: string;
  accent: string;
  origin?: string;
  loc: string;
  rating?: number;
  desc: string;
  tiers?: TierPrice[];
  offer?: { price: number; label: string };
  rental?: boolean;
}

/** Netto-Staffelpreise relativ zum Listen-Netto: ab 10 ≈ −5 %, ab 25 ≈ −9 % */
function tiers(priceGross: number, vat = 19): TierPrice[] {
  const net = Math.round(priceGross / (1 + vat / 100));
  return [
    { minQty: 10, priceNet: Math.round((net * 0.95) / 5) * 5 - 1 },
    { minQty: 25, priceNet: Math.round((net * 0.91) / 5) * 5 - 1 },
  ];
}

const PRODUCTS: ProductDef[] = [
  // ───── Bier ─────
  {
    id: 'augustiner-hell', brand: 'Augustiner', name: 'Lagerbier Hell', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1949, dep: 'kasten-bier-20', alc: 5.2, tags: ['regional', 'bestseller'], stock: 186, min: 40, color: '#8c1d18', accent: '#e5c07b',
    origin: 'München', loc: 'Gang 1', rating: 4.9, tiers: tiers(1949), offer: { price: 1799, label: 'Angebot der Woche' },
    desc: 'Das Münchner Kultbier: süffig, mild gehopft und mit feiner Malznote. Gebraut in Münchens ältester Brauerei und bei uns immer frisch vom Lager.',
  },
  {
    id: 'augustiner-edelstoff', brand: 'Augustiner', name: 'Edelstoff Exportbier', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2099, dep: 'kasten-bier-20', alc: 5.6, tags: ['regional', 'bestseller'], stock: 124, min: 30, color: '#5b1414', accent: '#f0d58c',
    origin: 'München', loc: 'Gang 1', rating: 4.8, tiers: tiers(2099),
    desc: 'Vollmundiges Export mit spritziger Kohlensäure und feinem Hopfenaroma. Der Klassiker für Biergarten, Brotzeit und Feierabend.',
  },
  {
    id: 'tegernseer-hell', brand: 'Tegernseer', name: 'Hell', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2199, dep: 'kasten-bier-20', alc: 4.8, tags: ['regional', 'bestseller'], stock: 98, min: 25, color: '#1e3a8a', accent: '#d4af37',
    origin: 'Tegernsee', loc: 'Gang 1', rating: 4.8, tiers: tiers(2199),
    desc: 'Helles aus dem Herzoglichen Brauhaus am Tegernsee – weich, rund und angenehm hopfig. Für viele das schönste Helle Oberbayerns.',
  },
  {
    id: 'paulaner-hell', brand: 'Paulaner', name: 'Original Münchner Hell', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1899, dep: 'kasten-bier-20', alc: 4.9, tags: ['regional'], stock: 142, min: 30, color: '#1d3f8f', accent: '#e9c46a',
    origin: 'München', loc: 'Gang 1', rating: 4.6, tiers: tiers(1899),
    desc: 'Goldgelbes Münchner Hell mit ausgewogenem Malzkörper und milder Hopfennote. Unkompliziert und vielseitig – vom Grillabend bis zum Vereinsfest.',
  },
  {
    id: 'paulaner-weissbier', brand: 'Paulaner', name: 'Hefe-Weißbier Naturtrüb', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', alc: 5.5, tags: ['regional', 'bestseller'], stock: 131, min: 30, color: '#1d3f8f', accent: '#f4a261',
    origin: 'München', loc: 'Gang 2', rating: 4.7, tiers: tiers(1999), offer: { price: 1799, label: 'Angebot der Woche' },
    desc: 'Naturtrübes Weißbier mit fruchtigen Bananen- und Nelkenaromen und cremigem Schaum. Perfekt zur Weißwurst oder einfach so.',
  },
  {
    id: 'hacker-pschorr-hell', brand: 'Hacker-Pschorr', name: 'Münchner Hell', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1899, dep: 'kasten-bier-20', alc: 5.0, tags: ['regional'], stock: 76, min: 20, color: '#7c2d12', accent: '#facc15',
    origin: 'München', loc: 'Gang 1', rating: 4.5,
    desc: 'Klares, goldenes Helles mit feinherber Note und schlankem Abgang. Ein ehrliches Münchner Bier mit langer Brautradition.',
  },
  {
    id: 'loewenbraeu-original', brand: 'Löwenbräu', name: 'Original', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1799, dep: 'kasten-bier-20', alc: 5.2, tags: ['regional'], stock: 88, min: 20, color: '#1e40af', accent: '#fbbf24',
    origin: 'München', loc: 'Gang 1', rating: 4.4,
    desc: 'Das Original aus der Münchner Löwenbräu-Brauerei: hell, ausgewogen und mild. Ein verlässlicher Begleiter für jede Brotzeit.',
  },
  {
    id: 'spaten-hell', brand: 'Spaten', name: 'Münchner Hell', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1799, dep: 'kasten-bier-20', alc: 5.2, tags: ['regional'], stock: 92, min: 20, color: '#b91c1c', accent: '#f8fafc',
    origin: 'München', loc: 'Gang 1', rating: 4.5,
    desc: 'Spritziges Helles mit feiner Malzsüße und dezenter Hopfenbittere. Seit Generationen ein fester Bestandteil der Münchner Bierkultur.',
  },
  {
    id: 'hofbraeu-original', brand: 'Hofbräu', name: 'Original', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1899, dep: 'kasten-bier-20', alc: 5.1, tags: ['regional'], stock: 64, min: 20, color: '#1d4ed8', accent: '#f8fafc',
    origin: 'München', loc: 'Gang 1', rating: 4.5,
    desc: 'Das helle Lagerbier des Staatlichen Hofbräuhauses – frisch, kräftig und ausgewogen. Bringt Wiesn-Stimmung nach Hause.',
  },
  {
    id: 'franziskaner-weissbier', brand: 'Franziskaner', name: 'Hefe-Weissbier Naturtrüb', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', alc: 5.0, tags: ['regional'], stock: 84, min: 20, color: '#7a4a1d', accent: '#f59e0b',
    origin: 'München', loc: 'Gang 2', rating: 4.6,
    desc: 'Spritziges Hefeweißbier mit fruchtig-frischem Aroma und feiner Hefenote. Hell, naturtrüb und herrlich erfrischend.',
  },
  {
    id: 'erdinger-weissbier', brand: 'Erdinger', name: 'Weißbier', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', alc: 5.3, tags: ['regional'], stock: 96, min: 25, color: '#0f3d7a', accent: '#f1f5f9',
    origin: 'Erding', loc: 'Gang 2', rating: 4.6, tiers: tiers(1999),
    desc: 'Feinperliges Weißbier aus dem Nachbarlandkreis Erding, mit Flaschengärung. Vollmundig, harmonisch und angenehm fruchtig.',
  },
  {
    id: 'schneider-tap7', brand: 'Schneider Weisse', name: 'TAP7 Unser Original', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2299, dep: 'kasten-bier-20', alc: 5.4, tags: ['regional'], stock: 22, min: 10, color: '#7f1d1d', accent: '#e7d5a7',
    origin: 'Kelheim', loc: 'Gang 2', rating: 4.8,
    desc: 'Bernsteinfarbenes Weißbier nach dem Originalrezept von 1872. Würzig, malzig und mit Noten von Nelke und reifer Banane.',
  },
  {
    id: 'ayinger-braeuweisse', brand: 'Ayinger', name: 'Bräuweisse', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2199, dep: 'kasten-bier-20', alc: 5.1, tags: ['regional'], stock: 42, min: 12, color: '#14532d', accent: '#fde68a',
    origin: 'Aying', loc: 'Gang 2', rating: 4.7,
    desc: 'Mehrfach prämiertes Hefeweißbier aus dem Münchner Umland. Hefetrüb, fruchtig und mit samtigem Mundgefühl.',
  },
  {
    id: 'andechser-hell', brand: 'Andechser', name: 'Vollbier Hell', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2299, dep: 'kasten-bier-20', alc: 4.8, tags: ['regional'], stock: 48, min: 12, color: '#1f2937', accent: '#d4a017',
    origin: 'Andechs', loc: 'Gang 1', rating: 4.8,
    desc: 'Klosterbier vom Heiligen Berg: hellgolden, mild und sehr bekömmlich. Gebraut mit Wasser aus eigenen Tiefbrunnen.',
  },
  {
    id: 'weihenstephaner-hefe', brand: 'Weihenstephaner', name: 'Hefeweissbier', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2299, dep: 'kasten-bier-20', alc: 5.4, tags: ['regional', 'bestseller'], stock: 58, min: 15, color: '#1e3a8a', accent: '#ca8a04',
    origin: 'Freising', loc: 'Gang 2', rating: 4.9,
    desc: 'Aus der ältesten bestehenden Brauerei der Welt, gleich nebenan in Freising. Goldgelb, feinhefig, mit Bananenduft und vollem Körper.',
  },
  {
    id: 'giesinger-erhellung', brand: 'Giesinger', name: 'Erhellung', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 2399, dep: 'kasten-bier-20', alc: 5.0, tags: ['regional', 'neu'], stock: 4, min: 8, color: '#111827', accent: '#f97316',
    origin: 'München-Giesing', loc: 'Gang 1', rating: 4.7,
    desc: 'Unfiltriertes Helles der Münchner Stadtteilbrauerei aus Giesing. Leicht trüb, frisch-hopfig und mit charaktervoller Malznote.',
  },
  {
    id: 'paulaner-hell-033', brand: 'Paulaner', name: 'Original Münchner Hell', cat: 'bier', pack: '24 × 0,33 l Glas', units: 24, vol: 0.33, mat: 'glas',
    price: 2099, dep: 'kasten-bier-24', alc: 4.9, tags: ['regional'], stock: 38, min: 10, color: '#1d3f8f', accent: '#e9c46a',
    origin: 'München', loc: 'Gang 1', rating: 4.5,
    desc: 'Das Münchner Hell im handlichen 0,33-l-Format – ideal für Feiern, Büro-Kühlschrank und kleine Runden.',
  },
  {
    id: 'augustiner-hell-6', brand: 'Augustiner', name: 'Lagerbier Hell Sixpack', cat: 'bier', pack: '6 × 0,5 l Glas', units: 6, vol: 0.5, mat: 'glas',
    price: 699, dep: 'flaschen-bier-6', alc: 5.2, tags: ['regional'], stock: 60, min: 15, color: '#8c1d18', accent: '#e5c07b',
    origin: 'München', loc: 'Kühlregal', rating: 4.8,
    desc: 'Augustiner Hell im praktischen Sixpack mit Tragegriff – gekühlt aus unserem Kühlregal. Pfand pro Flasche 0,08 €.',
  },
  {
    id: 'tegernseer-hell-6', brand: 'Tegernseer', name: 'Hell Sixpack', cat: 'bier', pack: '6 × 0,5 l Glas', units: 6, vol: 0.5, mat: 'glas',
    price: 749, dep: 'flaschen-bier-6', alc: 4.8, tags: ['regional'], stock: 44, min: 12, color: '#1e3a8a', accent: '#d4af37',
    origin: 'Tegernsee', loc: 'Kühlregal', rating: 4.7,
    desc: 'Das Tegernseer Hell im Sixpack – genau richtig für den Ausflug an den See oder den spontanen Feierabend.',
  },
  {
    id: 'paulaner-weissbier-6', brand: 'Paulaner', name: 'Hefe-Weißbier Sixpack', cat: 'bier', pack: '6 × 0,5 l Glas', units: 6, vol: 0.5, mat: 'glas',
    price: 729, dep: 'flaschen-bier-6', alc: 5.5, tags: ['regional'], stock: 36, min: 12, color: '#1d3f8f', accent: '#f4a261',
    origin: 'München', loc: 'Kühlregal', rating: 4.6,
    desc: 'Naturtrübes Hefe-Weißbier im Sixpack – gut gekühlt und schnell mitgenommen.',
  },
  {
    id: 'paulaner-radler', brand: 'Paulaner', name: 'Natur-Radler', cat: 'bier', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1799, dep: 'kasten-bier-20', alc: 2.5, tags: ['regional'], stock: 66, min: 15, color: '#65a30d', accent: '#facc15',
    origin: 'München', loc: 'Gang 2', rating: 4.5,
    desc: 'Naturtrübes Radler aus Hellem und Zitronenlimonade mit echtem Zitronensaft. Spritzig, fruchtig und schön erfrischend.',
  },
  // ───── Alkoholfrei ─────
  {
    id: 'erdinger-alkoholfrei', brand: 'Erdinger', name: 'Alkoholfrei', cat: 'alkoholfrei', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', alc: 0.4, tags: ['alkoholfrei', 'bestseller'], stock: 74, min: 20, color: '#0e7490', accent: '#fde047',
    origin: 'Erding', loc: 'Gang 2', rating: 4.6, offer: { price: 1799, label: 'Sport-Angebot' },
    desc: 'Isotonischer Durstlöscher mit Vitaminen – beliebt bei Läufern und Radlern. Weißbier-Geschmack ohne Alkohol.',
  },
  {
    id: 'paulaner-weissbier-00', brand: 'Paulaner', name: 'Weißbier 0,0 %', cat: 'alkoholfrei', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', alc: 0, tags: ['alkoholfrei', 'vegan'], stock: 52, min: 15, color: '#1d3f8f', accent: '#34d399',
    origin: 'München', loc: 'Gang 2', rating: 4.5,
    desc: 'Vollmundiges Weißbier mit 0,0 % Alkohol und nur wenig Kalorien. Fruchtig-frisch mit typischer Weißbier-Note.',
  },
  {
    id: 'franziskaner-alkoholfrei', brand: 'Franziskaner', name: 'Weissbier Alkoholfrei', cat: 'alkoholfrei', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', alc: 0.5, tags: ['alkoholfrei'], stock: 40, min: 12, color: '#7a4a1d', accent: '#a3e635',
    origin: 'München', loc: 'Gang 2', rating: 4.4,
    desc: 'Erfrischendes Hefeweißbier, alkoholfrei gebraut. Fruchtig, spritzig und mit natürlichem Weißbiercharakter.',
  },
  {
    id: 'paulaner-radler-00', brand: 'Paulaner', name: 'Natur-Radler 0,0 %', cat: 'alkoholfrei', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1899, dep: 'kasten-bier-20', alc: 0, tags: ['alkoholfrei'], stock: 34, min: 10, color: '#65a30d', accent: '#f8fafc',
    origin: 'München', loc: 'Gang 2', rating: 4.4,
    desc: 'Das naturtrübe Radler ganz ohne Alkohol – mit Zitronensaft und schön spritzig. Für Fahrer, Sportler und heiße Tage.',
  },
  // ───── Wasser ─────
  {
    id: 'adelholzener-classic-075', brand: 'Adelholzener', name: 'Classic', cat: 'wasser', pack: '12 × 0,75 l Glas', units: 12, vol: 0.75, mat: 'glas',
    price: 999, dep: 'kasten-glas-12', tags: ['regional', 'bestseller', 'vegan'], stock: 210, min: 40, color: '#0369a1', accent: '#e0f2fe',
    origin: 'Siegsdorf (Chiemgau)', loc: 'Gang 3', rating: 4.7, tiers: tiers(999), offer: { price: 899, label: 'Angebot der Woche' },
    desc: 'Mineralwasser mit kräftiger Kohlensäure aus den Chiemgauer Alpen. Natürlich mineralisiert und herrlich erfrischend.',
  },
  {
    id: 'adelholzener-naturell-075', brand: 'Adelholzener', name: 'Naturell', cat: 'wasser', pack: '12 × 0,75 l Glas', units: 12, vol: 0.75, mat: 'glas',
    price: 999, dep: 'kasten-glas-12', tags: ['regional', 'vegan'], stock: 168, min: 35, color: '#0284c7', accent: '#f0f9ff',
    origin: 'Siegsdorf (Chiemgau)', loc: 'Gang 3', rating: 4.6, tiers: tiers(999),
    desc: 'Stilles Mineralwasser ohne Kohlensäure – weich, rein und bekömmlich. Ideal für die ganze Familie und zum Kochen.',
  },
  {
    id: 'adelholzener-classic-pet', brand: 'Adelholzener', name: 'Classic', cat: 'wasser', pack: '12 × 1,0 l PET', units: 12, vol: 1.0, mat: 'pet',
    price: 849, dep: 'kasten-pet-12', tags: ['regional', 'vegan'], stock: 120, min: 30, color: '#0369a1', accent: '#bae6fd',
    origin: 'Siegsdorf (Chiemgau)', loc: 'Gang 3', rating: 4.5,
    desc: 'Adelholzener Classic in der leichten PET-Mehrwegflasche. Bruchsicher und praktisch für unterwegs.',
  },
  {
    id: 'kondrauer-classic', brand: 'Kondrauer', name: 'Mineralwasser Classic', cat: 'wasser', pack: '12 × 0,7 l Glas', units: 12, vol: 0.7, mat: 'glas',
    price: 899, dep: 'kasten-glas-12', tags: ['regional', 'vegan'], stock: 72, min: 20, color: '#155e75', accent: '#a5f3fc',
    origin: 'Waldsassen (Oberpfalz)', loc: 'Gang 3', rating: 4.5,
    desc: 'Natürliches Mineralwasser aus dem Stiftland, reich an Hydrogencarbonat. Feinperlig und ausgewogen im Geschmack.',
  },
  {
    id: 'altmuehltaler-classic-07', brand: 'Altmühltaler', name: 'Mineralwasser Classic', cat: 'wasser', pack: '12 × 0,7 l Glas', units: 12, vol: 0.7, mat: 'glas',
    price: 649, dep: 'kasten-glas-12', tags: ['regional', 'vegan'], stock: 140, min: 30, color: '#1d4ed8', accent: '#bfdbfe',
    origin: 'Treuchtlingen', loc: 'Gang 3', rating: 4.3, tiers: tiers(649),
    desc: 'Preiswertes Mineralwasser aus dem Altmühltal mit spritziger Kohlensäure. Der Durstlöscher für jeden Tag.',
  },
  {
    id: 'altmuehltaler-still-15', brand: 'Altmühltaler', name: 'Still', cat: 'wasser', pack: '6 × 1,5 l PET Einweg', units: 6, vol: 1.5, mat: 'pet',
    price: 299, dep: 'einweg-pet-6', tags: ['vegan'], stock: 96, min: 20, color: '#2563eb', accent: '#dbeafe',
    origin: 'Treuchtlingen', loc: 'Gang 3', rating: 4.2,
    desc: 'Stilles Mineralwasser im leichten 1,5-l-Sixpack. Einwegpfand 0,25 € pro Flasche.',
  },
  {
    id: 'st-leonhards-classic', brand: 'St. Leonhards Quelle', name: 'Classic', cat: 'wasser', pack: '12 × 0,75 l Glas', units: 12, vol: 0.75, mat: 'glas',
    price: 1299, dep: 'kasten-glas-12', tags: ['bio', 'regional', 'vegan'], stock: 44, min: 12, color: '#166534', accent: '#dcfce7',
    origin: 'Rosenheim', loc: 'Gang 3', rating: 4.8,
    desc: 'Bio-Mineralwasser aus dem Chiemgau mit feiner Perlage. Besonders rein und von Natur aus natriumarm.',
  },
  // ───── Limo, Cola & Spezi ─────
  {
    id: 'paulaner-spezi', brand: 'Paulaner', name: 'Spezi', cat: 'limo', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1499, dep: 'kasten-bier-20', tags: ['regional', 'bestseller', 'vegan'], stock: 154, min: 30, color: '#ea580c', accent: '#7c3aed',
    origin: 'München', loc: 'Gang 4', rating: 4.9, tiers: tiers(1499),
    desc: 'Der Münchner Kultmix aus Cola und Orangenlimonade. Fruchtig-spritzig und seit Jahrzehnten der Liebling in Bayern.',
  },
  {
    id: 'paulaner-spezi-zero', brand: 'Paulaner', name: 'Spezi Zero', cat: 'limo', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1499, dep: 'kasten-bier-20', tags: ['neu', 'vegan'], stock: 46, min: 12, color: '#111827', accent: '#ea580c',
    origin: 'München', loc: 'Gang 4', rating: 4.6,
    desc: 'Der Spezi-Geschmack ohne Zucker. Genauso fruchtig wie das Original – nur ohne Kalorien.',
  },
  {
    id: 'coca-cola-pet', brand: 'Coca-Cola', name: 'Original', cat: 'limo', pack: '12 × 1,0 l PET', units: 12, vol: 1.0, mat: 'pet',
    price: 1399, dep: 'kasten-pet-12', tags: ['bestseller', 'vegan'], stock: 102, min: 25, color: '#dc2626', accent: '#ffffff',
    loc: 'Gang 4', rating: 4.6, offer: { price: 1199, label: 'Angebot der Woche' },
    desc: 'Coca-Cola in der 1-Liter-Mehrwegflasche. Der Klassiker für Partys und den Vorrat zu Hause.',
  },
  {
    id: 'coca-cola-zero-pet', brand: 'Coca-Cola', name: 'Zero Sugar', cat: 'limo', pack: '12 × 1,0 l PET', units: 12, vol: 1.0, mat: 'pet',
    price: 1399, dep: 'kasten-pet-12', tags: ['vegan'], stock: 64, min: 15, color: '#111111', accent: '#dc2626',
    loc: 'Gang 4', rating: 4.5,
    desc: 'Der Original-Geschmack ohne Zucker und ohne Kalorien – in der praktischen 1-Liter-Mehrwegflasche.',
  },
  {
    id: 'fanta-pet', brand: 'Fanta', name: 'Orange', cat: 'limo', pack: '12 × 1,0 l PET', units: 12, vol: 1.0, mat: 'pet',
    price: 1299, dep: 'kasten-pet-12', tags: ['vegan'], stock: 58, min: 15, color: '#f97316', accent: '#1d4ed8',
    loc: 'Gang 4', rating: 4.4,
    desc: 'Fruchtige Orangenlimonade mit spritziger Kohlensäure. Beliebt bei Kindergeburtstagen und Sommerfesten.',
  },
  {
    id: 'bionade-holunder', brand: 'Bionade', name: 'Holunder', cat: 'limo', pack: '24 × 0,33 l Glas', units: 24, vol: 0.33, mat: 'glas',
    price: 2199, dep: 'kasten-soft-24', tags: ['bio', 'vegan'], stock: 38, min: 10, color: '#7e22ce', accent: '#e9d5ff',
    origin: 'Ostheim v. d. Rhön', loc: 'Gang 4', rating: 4.6, offer: { price: 1999, label: 'Bio-Aktion' },
    desc: 'Biologisch hergestellte Erfrischung mit Holunder – fermentiert aus Wasser und Malz. Fein-herb und nicht zu süß.',
  },
  {
    id: 'fritz-kola', brand: 'fritz-kola', name: 'Original', cat: 'limo', pack: '24 × 0,33 l Glas', units: 24, vol: 0.33, mat: 'glas',
    price: 2399, dep: 'kasten-soft-24', tags: ['vegan'], stock: 3, min: 6, color: '#111827', accent: '#f5f5f4',
    origin: 'Hamburg', loc: 'Gang 4', rating: 4.7,
    desc: 'Kola mit viel Koffein und Zitronennote in der Glas-Mehrwegflasche. Der Wachmacher für Büro, Bar und lange Nächte.',
  },
  {
    id: 'club-mate', brand: 'Club-Mate', name: 'Original', cat: 'limo', pack: '20 × 0,5 l Glas', units: 20, vol: 0.5, mat: 'glas',
    price: 1999, dep: 'kasten-bier-20', tags: ['vegan'], stock: 48, min: 12, color: '#ca8a04', accent: '#1e3a8a',
    origin: 'Münchsteinach (Franken)', loc: 'Gang 4', rating: 4.5,
    desc: 'Koffeinhaltige Mate-Limonade aus Franken – wenig süß, leicht herb und in jeder Tech-Küche zu Hause.',
  },
  {
    id: 'red-bull-24', brand: 'Red Bull', name: 'Energy Drink', cat: 'limo', pack: '24 × 0,25 l Dose', units: 24, vol: 0.25, mat: 'dose',
    price: 3199, dep: 'dose-24', tags: [], stock: 30, min: 8, color: '#1e3a8a', accent: '#c0c0c0',
    loc: 'Gang 4', rating: 4.4,
    desc: 'Der bekannte Energy Drink im 24er-Tray. Einwegpfand 0,25 € pro Dose.',
  },
  // ───── Säfte & Schorlen ─────
  {
    id: 'granini-orange', brand: 'granini', name: 'Trinkgenuss Orange', cat: 'saft', pack: '6 × 1,0 l Glas', units: 6, vol: 1.0, mat: 'glas',
    price: 1199, dep: 'kasten-saft-6', tags: ['bestseller', 'vegan'], stock: 62, min: 15, color: '#f59e0b', accent: '#16a34a',
    loc: 'Gang 5', rating: 4.6,
    desc: 'Fruchtiger Orangennektar in der typischen Glasflasche. Perfekt zum Frühstück oder als Schorle.',
  },
  {
    id: 'granini-multi', brand: 'granini', name: 'Trinkgenuss Multivitamin', cat: 'saft', pack: '6 × 1,0 l Glas', units: 6, vol: 1.0, mat: 'glas',
    price: 1199, dep: 'kasten-saft-6', tags: ['vegan'], stock: 48, min: 12, color: '#fb923c', accent: '#be123c',
    loc: 'Gang 5', rating: 4.5,
    desc: 'Mehrfruchtnektar mit zehn Vitaminen – fruchtig, mild und bei Kindern besonders beliebt.',
  },
  {
    id: 'granini-apfel', brand: 'granini', name: 'Trinkgenuss Apfel', cat: 'saft', pack: '6 × 1,0 l Glas', units: 6, vol: 1.0, mat: 'glas',
    price: 1099, dep: 'kasten-saft-6', tags: ['vegan'], stock: 40, min: 10, color: '#84cc16', accent: '#b91c1c',
    loc: 'Gang 5', rating: 4.4,
    desc: 'Klarer Apfelsaft aus sonnengereiften Äpfeln. Pur oder als Schorle ein echter Durstlöscher.',
  },
  {
    id: 'hohes-c-orange', brand: 'Hohes C', name: 'Orange', cat: 'saft', pack: '6 × 1,0 l Tetra Pak', units: 6, vol: 1.0, mat: 'tetra',
    price: 1399, tags: ['vegan'], stock: 36, min: 10, color: '#fb923c', accent: '#15803d',
    loc: 'Gang 5', rating: 4.5,
    desc: '100 % Orangensaft aus Orangensaftkonzentrat im leichten Tetra Pak – ganz ohne Pfand.',
  },
  {
    id: 'adelholzener-apfelschorle', brand: 'Adelholzener', name: 'Apfelschorle', cat: 'saft', pack: '12 × 0,5 l PET', units: 12, vol: 0.5, mat: 'pet',
    price: 1099, dep: 'kasten-pet-12', tags: ['regional', 'vegan'], stock: 70, min: 15, color: '#65a30d', accent: '#fef3c7',
    origin: 'Siegsdorf (Chiemgau)', loc: 'Gang 5', rating: 4.6,
    desc: 'Apfelschorle mit 55 % Fruchtsaft und Adelholzener Mineralwasser. Spritzig, fruchtig und praktisch in 0,5 l.',
  },
  // ───── Wein & Sekt ─────
  {
    id: 'rotkaeppchen-trocken', brand: 'Rotkäppchen', name: 'Sekt trocken', cat: 'wein', pack: '0,75 l Flasche', units: 1, vol: 0.75, mat: 'glas',
    price: 549, alc: 11, tags: ['bestseller'], stock: 84, min: 20, color: '#b91c1c', accent: '#fef2f2',
    origin: 'Freyburg (Unstrut)', loc: 'Gang 6', rating: 4.4,
    desc: 'Deutschlands bekanntester Sekt: frisch, fruchtig und feinperlig. Zum Anstoßen auf jeden schönen Anlass.',
  },
  {
    id: 'freixenet-carta-nevada', brand: 'Freixenet', name: 'Carta Nevada Semi Seco', cat: 'wein', pack: '0,75 l Flasche', units: 1, vol: 0.75, mat: 'glas',
    price: 899, alc: 11.5, tags: [], stock: 36, min: 10, color: '#111827', accent: '#d4af37',
    origin: 'Spanien', loc: 'Gang 6', rating: 4.3,
    desc: 'Spanischer Schaumwein, halbtrocken, mit fruchtigen Noten von Apfel und Zitrus. Ideal als Aperitif.',
  },
  {
    id: 'silvaner-franken', brand: 'Winzerhof am Main', name: 'Silvaner trocken (Bocksbeutel)', cat: 'wein', pack: '0,75 l Bocksbeutel', units: 1, vol: 0.75, mat: 'glas',
    price: 899, alc: 12.5, tags: ['regional', 'vegan'], stock: 30, min: 8, color: '#84cc16', accent: '#14532d',
    origin: 'Franken', loc: 'Gang 6', rating: 4.6,
    desc: 'Typischer Frankenwein im traditionellen Bocksbeutel. Erdig-mineralisch mit Noten von Birne und frischem Heu.',
  },
  {
    id: 'riesling-mosel', brand: 'Weingut Bergtal', name: 'Riesling trocken', cat: 'wein', pack: '0,75 l Flasche', units: 1, vol: 0.75, mat: 'glas',
    price: 799, alc: 12, tags: ['vegan'], stock: 28, min: 8, color: '#eab308', accent: '#1f2937',
    origin: 'Mosel', loc: 'Gang 6', rating: 4.5,
    desc: 'Frischer Mosel-Riesling mit lebendiger Säure und Aromen von grünem Apfel und Pfirsich. Passt zu Fisch und Spargel.',
  },
  {
    id: 'primitivo', brand: 'Masseria Sole', name: 'Primitivo di Manduria DOP', cat: 'wein', pack: '0,75 l Flasche', units: 1, vol: 0.75, mat: 'glas',
    price: 1099, alc: 14, tags: [], stock: 26, min: 8, color: '#7f1d1d', accent: '#fcd34d',
    origin: 'Apulien, Italien', loc: 'Gang 6', rating: 4.6,
    desc: 'Kräftiger Rotwein aus Apulien mit Aromen von reifen Kirschen, Pflaumen und einem Hauch Vanille. Samtig und vollmundig.',
  },
  {
    id: 'lugana', brand: 'Cantina del Lago', name: 'Lugana DOC', cat: 'wein', pack: '0,75 l Flasche', units: 1, vol: 0.75, mat: 'glas',
    price: 1299, alc: 12.5, tags: [], stock: 22, min: 6, color: '#fde68a', accent: '#0f766e',
    origin: 'Gardasee, Italien', loc: 'Gang 6', rating: 4.7,
    desc: 'Eleganter Weißwein vom Südufer des Gardasees. Mineralisch, mit Noten von Mandel und weißen Blüten.',
  },
  // ───── Spirituosen ─────
  {
    id: 'jaegermeister', brand: 'Jägermeister', name: 'Kräuterlikör', cat: 'spirituosen', pack: '0,7 l Flasche', units: 1, vol: 0.7, mat: 'glas',
    price: 1599, alc: 35, tags: [], stock: 34, min: 8, color: '#14532d', accent: '#f97316',
    origin: 'Wolfenbüttel', loc: 'Kasse', rating: 4.5,
    desc: 'Kräuterlikör aus 56 Kräutern, Blüten, Wurzeln und Früchten. Eiskalt serviert ein Klassiker.',
  },
  {
    id: 'aperol', brand: 'Aperol', name: 'Aperitivo', cat: 'spirituosen', pack: '0,7 l Flasche', units: 1, vol: 0.7, mat: 'glas',
    price: 1399, alc: 11, tags: ['bestseller'], stock: 40, min: 10, color: '#f97316', accent: '#fff7ed',
    origin: 'Italien', loc: 'Kasse', rating: 4.7, offer: { price: 1199, label: 'Spritz-Aktion' },
    desc: 'Der italienische Aperitif mit Bitterorange und Rhabarber. Mit Prosecco und Soda wird daraus der beliebte Spritz.',
  },
  {
    id: 'ramazzotti', brand: 'Ramazzotti', name: 'Amaro', cat: 'spirituosen', pack: '0,7 l Flasche', units: 1, vol: 0.7, mat: 'glas',
    price: 1599, alc: 30, tags: [], stock: 18, min: 6, color: '#7c2d12', accent: '#fbbf24',
    origin: 'Italien', loc: 'Kasse', rating: 4.5,
    desc: 'Italienischer Kräuterbitter mit Orangenschalen und Sternanis. Klassisch als Digestif nach dem Essen.',
  },
  {
    id: 'penninger-blutwurz', brand: 'Penninger', name: 'Blutwurz', cat: 'spirituosen', pack: '0,5 l Flasche', units: 1, vol: 0.5, mat: 'glas',
    price: 1499, alc: 50, tags: ['regional'], stock: 16, min: 5, color: '#7f1d1d', accent: '#fef08a',
    origin: 'Hauzenberg (Bayerischer Wald)', loc: 'Kasse', rating: 4.6,
    desc: 'Kräftiger Kräuterlikör aus dem Bayerischen Wald nach traditionellem Rezept. Ein echtes Stück Heimat im Glas.',
  },
  {
    id: 'gordons-gin', brand: "Gordon's", name: 'London Dry Gin', cat: 'spirituosen', pack: '0,7 l Flasche', units: 1, vol: 0.7, mat: 'glas',
    price: 1499, alc: 37.5, tags: ['vegan'], stock: 20, min: 6, color: '#15803d', accent: '#fef9c3',
    origin: 'Großbritannien', loc: 'Kasse', rating: 4.4,
    desc: 'Klassischer London Dry Gin mit deutlicher Wacholdernote. Die Basis für einen perfekten Gin Tonic.',
  },
  {
    id: 'havana-club-3', brand: 'Havana Club', name: 'Añejo 3 Años', cat: 'spirituosen', pack: '0,7 l Flasche', units: 1, vol: 0.7, mat: 'glas',
    price: 1599, alc: 40, tags: [], stock: 2, min: 4, color: '#a16207', accent: '#7f1d1d',
    origin: 'Kuba', loc: 'Kasse', rating: 4.5,
    desc: 'Heller, drei Jahre gereifter Rum aus Kuba. Leicht und vanillig – ideal für Mojito und Cuba Libre.',
  },
  // ───── Fassbier & Party ─────
  {
    id: 'augustiner-hell-fass-30', brand: 'Augustiner', name: 'Lagerbier Hell – Fass', cat: 'fass', pack: '30-l-Fass', units: 1, vol: 30, mat: 'fass',
    price: 11900, dep: 'fass-30', alc: 5.2, tags: ['regional', 'bestseller'], stock: 14, min: 4, color: '#8c1d18', accent: '#e5c07b',
    origin: 'München', loc: 'Kühlhaus', rating: 4.9,
    desc: 'Augustiner Hell frisch vom Fass für Ihr Fest – reicht für rund 60 Halbe. Zapfanlage können Sie gleich mit ausleihen.',
  },
  {
    id: 'augustiner-edelstoff-holzfass-50', brand: 'Augustiner', name: 'Edelstoff – Holzfass', cat: 'fass', pack: '50-l-Holzfass', units: 1, vol: 50, mat: 'fass',
    price: 21900, dep: 'fass-50', alc: 5.6, tags: ['regional'], stock: 4, min: 2, color: '#5b1414', accent: '#a16207',
    origin: 'München', loc: 'Kühlhaus', rating: 5,
    desc: 'Edelstoff aus dem traditionellen Holzfass – der Höhepunkt jeder Feier. Bitte rechtzeitig vorbestellen, Anstich auf Wunsch durch uns.',
  },
  {
    id: 'paulaner-hell-fass-30', brand: 'Paulaner', name: 'Original Münchner Hell – Fass', cat: 'fass', pack: '30-l-Fass', units: 1, vol: 30, mat: 'fass',
    price: 10900, dep: 'fass-30', alc: 4.9, tags: ['regional'], stock: 10, min: 3, color: '#1d3f8f', accent: '#e9c46a',
    origin: 'München', loc: 'Kühlhaus', rating: 4.7,
    desc: 'Münchner Hell im 30-Liter-Fass für Garten- und Vereinsfeste. Gekühlt abholbereit oder direkt geliefert.',
  },
  {
    id: 'paulaner-weissbier-fass-30', brand: 'Paulaner', name: 'Hefe-Weißbier – Fass', cat: 'fass', pack: '30-l-Fass', units: 1, vol: 30, mat: 'fass',
    price: 11900, dep: 'fass-30', alc: 5.5, tags: ['regional'], stock: 8, min: 2, color: '#1d3f8f', accent: '#f4a261',
    origin: 'München', loc: 'Kühlhaus', rating: 4.7,
    desc: 'Naturtrübes Weißbier vom Fass – der Star beim Weißwurstfrühstück. Weißbiergläser gibt es bei uns zum Ausleihen.',
  },
  {
    id: 'tegernseer-hell-fass-50', brand: 'Tegernseer', name: 'Hell – Fass', cat: 'fass', pack: '50-l-Fass', units: 1, vol: 50, mat: 'fass',
    price: 19900, dep: 'fass-50', alc: 4.8, tags: ['regional'], stock: 5, min: 2, color: '#1e3a8a', accent: '#d4af37',
    origin: 'Tegernsee', loc: 'Kühlhaus', rating: 4.8,
    desc: 'Tegernseer Hell im 50-Liter-Fass für große Feste – rund 100 Halbe. Mit Zapfanlage und Kühlung aus unserem Verleih.',
  },
  {
    id: 'partyfass-5l', brand: 'Paulaner', name: 'Original Münchner Hell – Partyfass', cat: 'fass', pack: '5-l-Partyfass', units: 1, vol: 5, mat: 'fass',
    price: 1699, alc: 4.9, tags: ['regional'], stock: 26, min: 6, color: '#1d3f8f', accent: '#e9c46a',
    origin: 'München', loc: 'Kühlregal', rating: 4.4,
    desc: 'Das handliche 5-Liter-Fass mit integriertem Zapfhahn – ganz ohne Zapfanlage. Ideal für Grillabende und kleine Runden.',
  },
  {
    id: 'eiswuerfel-2kg', brand: 'Altinger', name: 'Eiswürfel', cat: 'fass', pack: '2-kg-Beutel', units: 1, vol: 0, mat: 'sonstiges',
    price: 299, vat: 7, tags: ['vegan'], stock: 80, min: 20, color: '#7dd3fc', accent: '#f0f9ff',
    loc: 'Tiefkühltruhe', rating: 4.8,
    desc: 'Kristallklare Eiswürfel aus Trinkwasser im 2-kg-Beutel. Für Cocktails, Bowle und das schnelle Kühlen von Getränken.',
  },
  {
    id: 'mehrwegbecher-25', brand: 'Altinger', name: 'Mehrweg-Becher 0,4 l (25 Stück)', cat: 'fass', pack: '25 Stück', units: 1, vol: 0, mat: 'sonstiges',
    price: 999, tags: ['neu'], stock: 40, min: 10, color: '#0ea5e9', accent: '#f8fafc',
    loc: 'Gang 7', rating: 4.5,
    desc: 'Robuste, spülmaschinenfeste Mehrwegbecher aus Kunststoff mit 0,4-l-Eichstrich. Bruchsicher für Garten, Verein und Festwiese.',
  },
  // ───── Festbedarf & Verleih (Preis pro Veranstaltung) ─────
  {
    id: 'bierzeltgarnitur', brand: 'Altinger Verleih', name: 'Bierzeltgarnitur (Tisch + 2 Bänke)', cat: 'leihartikel', pack: '1 Garnitur · 220 × 50 cm', units: 1, vol: 0, mat: 'sonstiges',
    price: 900, rental: true, tags: ['bestseller'], stock: 40, min: 0, color: '#92400e', accent: '#fcd34d',
    loc: 'Lager', rating: 4.8,
    desc: 'Klassische Festzeltgarnitur für 6–8 Personen, stabil und sauber. Preis pro Veranstaltung (Abholung bis 2 Tage), Lieferung auf Anfrage.',
  },
  {
    id: 'stehtisch-husse', brand: 'Altinger Verleih', name: 'Stehtisch mit Husse', cat: 'leihartikel', pack: '1 Stehtisch · Ø 80 cm', units: 1, vol: 0, mat: 'sonstiges',
    price: 1200, rental: true, tags: [], stock: 15, min: 0, color: '#334155', accent: '#f8fafc',
    loc: 'Lager', rating: 4.7,
    desc: 'Klappbarer Stehtisch mit weißer Stretch-Husse – elegant für Empfang, Firmenfeier und Hochzeit. Preis pro Veranstaltung.',
  },
  {
    id: 'zapfanlage-1', brand: 'Altinger Verleih', name: 'Zapfanlage 1-leitig', cat: 'leihartikel', pack: '1 Anlage inkl. CO₂', units: 1, vol: 0, mat: 'sonstiges',
    price: 2500, rental: true, tags: [], stock: 6, min: 0, color: '#475569', accent: '#cbd5e1',
    loc: 'Lager', rating: 4.8,
    desc: 'Durchlaufkühler mit einem Zapfhahn, inklusive CO₂-Flasche und kurzer Einweisung. Für Fässer mit 30 oder 50 Litern.',
  },
  {
    id: 'zapfanlage-2', brand: 'Altinger Verleih', name: 'Zapfanlage 2-leitig', cat: 'leihartikel', pack: '1 Anlage inkl. CO₂', units: 1, vol: 0, mat: 'sonstiges',
    price: 3900, rental: true, tags: [], stock: 3, min: 0, color: '#475569', accent: '#94a3b8',
    loc: 'Lager', rating: 4.9,
    desc: 'Zwei Zapfhähne für zwei Biersorten gleichzeitig – etwa Hell und Weißbier. Inklusive CO₂ und Einweisung.',
  },
  {
    id: 'getraenkekuehlschrank', brand: 'Altinger Verleih', name: 'Getränkekühlschrank mit Glastür', cat: 'leihartikel', pack: '1 Gerät · ca. 400 l', units: 1, vol: 0, mat: 'sonstiges',
    price: 3500, rental: true, tags: [], stock: 4, min: 0, color: '#0f172a', accent: '#38bdf8',
    loc: 'Lager', rating: 4.7,
    desc: 'Großer Flaschenkühlschrank mit Glastür für rund 200 Flaschen. Lieferung und Abholung durch unser Team möglich.',
  },
  {
    id: 'kuehlanhaenger', brand: 'Altinger Verleih', name: 'Kühlanhänger', cat: 'leihartikel', pack: '1 Anhänger · 2,5 × 1,5 m', units: 1, vol: 0, mat: 'sonstiges',
    price: 8900, rental: true, tags: [], stock: 1, min: 0, color: '#1d58a0', accent: '#e2e8f0',
    loc: 'Hof', rating: 4.9,
    desc: 'Kühlanhänger für Großveranstaltungen mit Platz für über 60 Kästen. 230-V-Anschluss erforderlich, Pkw mit Anhängerkupplung (B) genügt.',
  },
  {
    id: 'masskruege-20', brand: 'Altinger Verleih', name: 'Maßkrüge (20 Stück)', cat: 'leihartikel', pack: '20 × 1,0 l Glas', units: 1, vol: 0, mat: 'sonstiges',
    price: 1000, rental: true, tags: [], stock: 20, min: 0, color: '#cbd5e1', accent: '#fbbf24',
    loc: 'Lager', rating: 4.7,
    desc: 'Echte Glas-Maßkrüge im Kasten zu 20 Stück, gespült zurückzugeben. Bruch wird mit 6,00 € pro Krug berechnet.',
  },
  {
    id: 'weissbierglaeser-24', brand: 'Altinger Verleih', name: 'Weißbiergläser (24 Stück)', cat: 'leihartikel', pack: '24 × 0,5 l Glas', units: 1, vol: 0, mat: 'sonstiges',
    price: 800, rental: true, tags: [], stock: 15, min: 0, color: '#e2e8f0', accent: '#f59e0b',
    loc: 'Lager', rating: 4.6,
    desc: 'Klassische Weißbiergläser im Spülkorb zu 24 Stück. Bitte gespült zurückgeben, Bruch 4,00 € pro Glas.',
  },
  {
    id: 'partyzelt-3x6', brand: 'Altinger Verleih', name: 'Partyzelt 3 × 6 m', cat: 'leihartikel', pack: '1 Zelt mit Seitenwänden', units: 1, vol: 0, mat: 'sonstiges',
    price: 4900, rental: true, tags: [], stock: 4, min: 0, color: '#f8fafc', accent: '#1d58a0',
    loc: 'Lager', rating: 4.6,
    desc: 'Stabiles Partyzelt mit abnehmbaren Seitenwänden für bis zu 30 Gäste. Aufbau zu zweit in etwa einer Stunde.',
  },
  {
    id: 'heizstrahler', brand: 'Altinger Verleih', name: 'Gas-Heizstrahler', cat: 'leihartikel', pack: '1 Heizpilz inkl. Gasflasche', units: 1, vol: 0, mat: 'sonstiges',
    price: 2900, rental: true, tags: ['neu'], stock: 4, min: 0, color: '#78716c', accent: '#f97316',
    loc: 'Lager', rating: 4.5,
    desc: 'Heizpilz für den Außenbereich inklusive 11-kg-Gasflasche – damit es auch an kühlen Abenden gemütlich bleibt.',
  },
];

/** Sortiment zum Stichtag `today` (Angebote gelten bis heute + 6 Tage) */
export function buildProducts(today: string): Product[] {
  return PRODUCTS.map((d, i): Product => {
    const p: Product = {
      id: d.id,
      sku: `AL-${String(10010 + i * 10)}`,
      name: d.name,
      brand: d.brand,
      categoryId: d.cat,
      description: d.desc,
      packaging: d.pack,
      unitCount: d.units,
      unitVolumeL: d.vol,
      material: d.mat,
      priceGross: d.price,
      vatRate: d.vat ?? 19,
      tags: [...d.tags],
      stock: d.stock,
      minStock: d.min,
      active: true,
      color: d.color,
      accent: d.accent,
    };
    if (d.dep) p.depositTypeId = d.dep;
    if (d.alc !== undefined) p.alcoholPercent = d.alc;
    if (d.offer) p.offer = { priceGross: d.offer.price, validUntil: addDays(today, 6), label: d.offer.label };
    if (d.tiers) p.tierPrices = d.tiers.map((t) => ({ ...t }));
    if (d.origin) p.origin = d.origin;
    if (d.rental) p.isRental = true;
    if (d.rating !== undefined) p.rating = d.rating;
    p.location = d.loc;
    return p;
  });
}
