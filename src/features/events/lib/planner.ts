/**
 * Party-Planer: Getränke- und Leihartikel-Empfehlung aus Gästezahl, Dauer, Getränke-Mix und Jahreszeit.
 * Rein funktional (keine React-Abhängigkeit) – Artikel kommen aus dem aktuellen Sortiment.
 */
import type { DayString, Product } from '@shared/types';
import { formatLiters, productLiters } from '@shared/format';
import { addDays, weekdayOf } from '@shared/time';

export type Season = 'summer' | 'winter';
export type BeerChoice = 'augustiner' | 'paulaner' | 'tegernseer';

export interface Mix {
  beer: number;
  wine: number;
  soft: number;
}

export interface PlannerInput {
  guests: number;
  hours: number;
  mix: Mix;
  season: Season;
  outdoor: boolean;
  beer: BeerChoice;
  /** Sekt zum Anstoßen */
  sekt: boolean;
}

/** Verbrauch je Person und Stunde (Liter) – transparent in der Oberfläche erklärt */
export const RATES = {
  beer: 0.4,
  soft: 0.25,
  wine: 0.1,
  water: { summer: 0.15, winter: 0.08 },
  /** Sommer: mehr Durst bei Bier & Alkoholfreiem */
  summerFactor: 1.15,
  winterFactor: 0.9,
  /** ab dieser Biermenge: Fass statt Kästen */
  kegFromLiters: 30,
} as const;

export const BEER_OPTIONS: Record<BeerChoice, { label: string; crate: string; keg: string }> = {
  augustiner: { label: 'Augustiner Hell', crate: 'augustiner-hell', keg: 'augustiner-hell-fass-30' },
  paulaner: { label: 'Paulaner Hell', crate: 'paulaner-hell', keg: 'paulaner-hell-fass-30' },
  tegernseer: { label: 'Tegernseer Hell', crate: 'tegernseer-hell', keg: 'tegernseer-hell-fass-50' },
};

export const MIX_PRESETS: { id: string; label: string; mix: Mix }[] = [
  { id: 'bayerisch', label: 'Zünftig bayerisch', mix: { beer: 65, wine: 10, soft: 25 } },
  { id: 'gemischt', label: 'Gemischt', mix: { beer: 45, wine: 25, soft: 30 } },
  { id: 'familie', label: 'Familienfest', mix: { beer: 30, wine: 15, soft: 55 } },
  { id: 'firma', label: 'Firmenfeier', mix: { beer: 35, wine: 30, soft: 35 } },
];

export const DEFAULT_INPUT: PlannerInput = {
  guests: 50,
  hours: 5,
  mix: { ...MIX_PRESETS[0].mix },
  season: 'summer',
  outdoor: true,
  beer: 'augustiner',
  sekt: false,
};

export type PlanGroup = 'drinks' | 'extras' | 'rental';

export interface PlanLine {
  productId: string;
  qty: number;
  group: PlanGroup;
  /** Begründung, z. B. "≈ 65 l Bier für 33 Biertrinker" */
  reason: string;
}

export interface Plan {
  lines: PlanLine[];
  liters: { beer: number; wine: number; soft: number; water: number; total: number };
  kegs: number;
  crates: number;
  bottles: number;
  people: { beer: number; wine: number; soft: number };
}

const fmtL = (l: number) => formatLiters(l < 10 ? Math.round(l * 10) / 10 : Math.round(l));

/** Anzahl Gebinde für eine Literzahl (kleine Reste werden nicht aufgerundet) */
function units(liters: number, perUnit: number): number {
  if (liters <= 0 || perUnit <= 0) return 0;
  return Math.max(1, Math.ceil(liters / perUnit - 0.12));
}

/** Mix-Regler: einen Wert setzen, die beiden anderen anteilig anpassen (Summe bleibt 100) */
export function rebalance(mix: Mix, key: keyof Mix, value: number): Mix {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = (Object.keys(mix) as (keyof Mix)[]).filter((k) => k !== key);
  const rest = 100 - v;
  const sum = others.reduce((s, k) => s + mix[k], 0);
  const next = { ...mix, [key]: v } as Mix;
  if (sum <= 0) {
    next[others[0]] = Math.round(rest / 2);
    next[others[1]] = rest - next[others[0]];
  } else {
    next[others[0]] = Math.round((mix[others[0]] / sum) * rest);
    next[others[1]] = rest - next[others[0]];
  }
  return next;
}

/** Nächster Samstag, frühestens in 3 Tagen – Vorschlag für das Fest-Datum */
export function suggestEventDate(today: DayString): DayString {
  let d = addDays(today, 3);
  while (weekdayOf(d) !== 6) d = addDays(d, 1);
  return d;
}

export function buildPlan(input: PlannerInput, products: Map<string, Product>): Plan {
  const g = Math.max(1, Math.round(input.guests));
  const h = Math.max(1, input.hours);
  const f = input.season === 'summer' ? RATES.summerFactor : RATES.winterFactor;
  const share = (n: number) => Math.max(0, n) / 100;
  const people = {
    beer: Math.round(g * share(input.mix.beer)),
    wine: Math.round(g * share(input.mix.wine)),
    soft: Math.round(g * share(input.mix.soft)),
  };

  const beerL = g * h * RATES.beer * share(input.mix.beer) * f;
  const softL = g * h * RATES.soft * share(input.mix.soft) * f;
  const wineL = g * h * RATES.wine * share(input.mix.wine);
  const waterL = g * h * RATES.water[input.season];

  const lines: PlanLine[] = [];
  const has = (id: string) => products.has(id);
  const push = (productId: string, qty: number, group: PlanGroup, reason: string) => {
    if (qty <= 0 || !has(productId)) return;
    const existing = lines.find((l) => l.productId === productId);
    if (existing) existing.qty += qty;
    else lines.push({ productId, qty, group, reason });
  };

  // ── Bier: ab 30 l Fass statt Kästen ──
  let kegs = 0;
  let crates = 0;
  let bottles = 0;
  const beer = BEER_OPTIONS[input.beer];
  const crateP = products.get(beer.crate);
  const kegP = products.get(beer.keg);
  const crateL = crateP ? productLiters(crateP) || 10 : 10;
  const kegL = kegP ? productLiters(kegP) || 30 : 30;
  if (beerL > 0) {
    if (beerL >= RATES.kegFromLiters && kegP) {
      kegs = Math.floor(beerL / kegL);
      const rest = beerL - kegs * kegL;
      let restCrates = 0;
      if (rest > kegL * 0.6) kegs += 1;
      else if (rest > 0) restCrates = units(rest, crateL);
      if (kegs === 0) kegs = 1;
      push(beer.keg, kegs, 'drinks', `≈ ${fmtL(beerL)} Bier für ${people.beer} Biertrinker – frisch gezapft`);
      if (restCrates) {
        push(beer.crate, restCrates, 'drinks', `Reserve, falls ein Fass leer wird`);
        crates += restCrates;
      }
    } else {
      const n = units(beerL, crateL);
      push(beer.crate, n, 'drinks', `≈ ${fmtL(beerL)} Bier für ${people.beer} Biertrinker`);
      crates += n;
    }
  }

  // ── Alkoholfrei ──
  if (softL > 0) {
    const parts: [string, number, string][] = [
      ['paulaner-spezi', 0.45, 'Spezi'],
      ['adelholzener-apfelschorle', 0.3, 'Apfelschorle'],
      ['paulaner-radler-00', 0.25, 'Radler 0,0 %'],
    ];
    for (const [id, part, label] of parts) {
      const p = products.get(id);
      if (!p) continue;
      const l = softL * part;
      const n = units(l, productLiters(p) || 6);
      push(id, n, 'drinks', `≈ ${fmtL(l)} ${label}`);
      crates += n;
    }
  }

  // ── Wasser für alle ──
  const water = products.get('adelholzener-classic-075');
  if (water && waterL > 0) {
    const n = units(waterL, productLiters(water) || 9);
    push(water.id, n, 'drinks', `≈ ${fmtL(waterL)} Wasser für alle Gäste`);
    crates += n;
  }

  // ── Wein & Sekt ──
  if (wineL > 0) {
    const total = Math.max(1, Math.ceil(wineL / 0.75));
    const white = Math.max(1, Math.round(total * 0.6));
    const red = total - white;
    push('silvaner-franken', white, 'drinks', `Weißwein · ≈ ${fmtL(wineL)} Wein für ${people.wine} Weintrinker`);
    if (red > 0) push('primitivo', red, 'drinks', 'Rotwein');
    bottles += total;
  }
  if (input.sekt) {
    const n = Math.max(1, Math.ceil((g * 0.1) / 0.75));
    push('rotkaeppchen-trocken', n, 'drinks', `Ein Glas Sekt zum Anstoßen für ${g} Gäste`);
    bottles += n;
  }

  // ── Dazu ──
  if (input.season === 'summer') push('eiswuerfel-2kg', Math.max(1, Math.ceil(g / 15)), 'extras', 'Zum Kühlen von Getränken und für Longdrinks');

  // ── Leihartikel ──
  push('bierzeltgarnitur', Math.ceil(g / 8), 'rental', `Sitzplätze für ${g} Gäste (8 pro Garnitur)`);
  if (g >= 20) push('stehtisch-husse', Math.max(2, Math.ceil(g / 25)), 'rental', 'Für Empfang und Ausschank');
  if (kegs > 0) {
    if (kegs >= 3) push('zapfanlage-2', 1, 'rental', `Zwei Zapfhähne für ${kegs} Fässer – kürzere Wartezeit am Ausschank`);
    else push('zapfanlage-1', 1, 'rental', `Für Ihr${kegs > 1 ? 'e' : ''} ${kegs} ${kegs > 1 ? 'Fässer' : 'Fass'} inkl. CO₂`);
    push('masskruege-20', Math.max(1, Math.ceil(people.beer / 20)), 'rental', `Maßkrüge für ${people.beer} Biertrinker`);
  }
  const drinkUnits = crates + kegs;
  if (g >= 120 || drinkUnits > 30) push('kuehlanhaenger', 1, 'rental', `Kühlt ${drinkUnits} Kästen und Fässer auf einmal`);
  else if (g >= 25) push('getraenkekuehlschrank', Math.min(4, Math.max(1, Math.ceil(g / 60))), 'rental', 'Gekühlte Flaschen griffbereit');
  if (input.outdoor) {
    push('partyzelt-3x6', Math.max(1, Math.ceil(g / 30)), 'rental', 'Wetterschutz für bis zu 30 Gäste je Zelt');
    if (input.season === 'winter') push('heizstrahler', Math.max(1, Math.ceil(g / 20)), 'rental', 'Damit es draußen gemütlich bleibt');
  }

  return {
    lines,
    liters: {
      beer: beerL,
      wine: wineL,
      soft: softL,
      water: waterL,
      total: beerL + wineL + softL + waterL,
    },
    kegs,
    crates,
    bottles,
    people,
  };
}
