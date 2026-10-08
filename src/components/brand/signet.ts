/**
 * Signet "Altinger": Getränkekasten mit drei Flaschen (goldene Kronkorken) auf Altinger-Blau.
 * Als SVG-Markup-String – für Kartenmarker, Splash und Icon-Erzeugung (scripts/generate-icons.mjs nutzt dieselbe Geometrie).
 */

export const BRAND_COLORS = {
  blue: '#1d58a0',
  blueDark: '#194782',
  navy: '#16335a',
  gold: '#f2a900',
  glass: '#b9d3f1',
} as const;

function bottlePath(cx: number, top: number): string {
  return [
    `M${cx - 3} ${top + 4}`,
    `L${cx - 3} ${top + 11.5}`,
    `C${cx - 3} ${top + 14.5} ${cx - 5.6} ${top + 15.5} ${cx - 5.6} ${top + 19}`,
    `L${cx - 5.6} 42`,
    `L${cx + 5.6} 42`,
    `L${cx + 5.6} ${top + 19}`,
    `C${cx + 5.6} ${top + 15.5} ${cx + 3} ${top + 14.5} ${cx + 3} ${top + 11.5}`,
    `L${cx + 3} ${top + 4}`,
    'Z',
  ].join(' ');
}

const BOTTLES: [number, number][] = [
  [20.5, 11],
  [32, 7.5],
  [43.5, 11],
];

/** Innenleben des Signets (ohne Hintergrund), Koordinaten 0–64 */
export function signetGlyph(opts: { glass?: string; crate?: string; slot?: string; cap?: string } = {}): string {
  const glass = opts.glass ?? BRAND_COLORS.glass;
  const crate = opts.crate ?? '#ffffff';
  const slot = opts.slot ?? BRAND_COLORS.blueDark;
  const cap = opts.cap ?? BRAND_COLORS.gold;
  const bottles = BOTTLES.map(
    ([cx, top]) =>
      `<path d="${bottlePath(cx, top)}" fill="${glass}"/>` +
      `<rect x="${cx - 1.6}" y="${top + 6}" width="1.5" height="9" rx=".75" fill="#fff" opacity=".55"/>` +
      `<rect x="${cx - 3.7}" y="${top + 0.6}" width="7.4" height="4" rx="1.3" fill="${cap}"/>`,
  ).join('');
  return (
    bottles +
    `<path d="M11 34.5a2 2 0 0 1 2-2h38a2 2 0 0 1 2 2V49a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6z" fill="${crate}"/>` +
    `<rect x="23.5" y="37" width="17" height="5" rx="2.5" fill="${slot}"/>` +
    `<rect x="16" y="46.5" width="32" height="2" rx="1" fill="${slot}" opacity=".18"/>`
  );
}

/** Vollständiges Signet als SVG (abgerundetes Quadrat) */
export function signetSvg(size = 64, idSuffix = 'a'): string {
  const g = `alt-signet-${idSuffix}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${BRAND_COLORS.blue}"/><stop offset="1" stop-color="${BRAND_COLORS.navy}"/>` +
    `</linearGradient></defs>` +
    `<rect width="64" height="64" rx="16" fill="url(#${g})"/>` +
    signetGlyph() +
    `</svg>`
  );
}
