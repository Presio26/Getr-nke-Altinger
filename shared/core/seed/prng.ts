/**
 * Deterministischer Zufall für die Demo-Daten (mulberry32).
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ganzzahl in [min, max] */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

/** Gewichtete Auswahl */
export function weighted<T>(rng: Rng, list: readonly (readonly [T, number])[]): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[list.length - 1][0];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** k verschiedene Elemente */
export function sample<T>(rng: Rng, list: readonly T[], k: number): T[] {
  const copy = [...list];
  const out: T[] = [];
  while (copy.length && out.length < k) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  return out;
}
