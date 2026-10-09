import type { Product } from '@shared/types';
import { isGreenish, isLight, mix, shade } from './color';

/** Eindeutige Präfixe für Verläufe innerhalb eines SVGs */
export interface IllustrationProps {
  product: Product;
  uid: string;
}

/** Text, der automatisch in die verfügbare Breite gestaucht wird (Etikett-Textband) */
export function FitText({
  x,
  y,
  width,
  text,
  size,
  fill,
  weight = 800,
  spacing = 0.6,
  anchor = 'middle',
  opacity,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  size: number;
  fill: string;
  weight?: number;
  spacing?: number;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
}) {
  const estimate = text.length * size * 0.66 + Math.max(0, text.length - 1) * spacing;
  const fit = estimate > width;
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      fontWeight={weight}
      letterSpacing={fit ? 0 : spacing}
      fill={fill}
      opacity={opacity}
      style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}
      {...(fit ? { textLength: width, lengthAdjust: 'spacingAndGlyphs' } : {})}
    >
      {text}
    </text>
  );
}

export function GroundShadow({ cx = 100, cy = 186, rx = 80, ry = 7, opacity = 0.14 }: { cx?: number; cy?: number; rx?: number; ry?: number; opacity?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#0f172a" opacity={opacity} />;
}

/** kurzer Markenname fürs Etikett */
export function brandLabel(product: Product): string {
  return product.brand
    .replace(/\s+Verleih$/i, '')
    .replace(/^Weingut\s+/i, '')
    .toUpperCase();
}

/** kurzer Sortenname (zweite Etikettzeile) */
export function shortName(product: Product): string {
  return product.name
    .replace(/\s*[–-]\s*(Fass|Holzfass|Partyfass)$/i, '')
    .replace(/\s*Sixpack$/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/Original Münchner /, '')
    .trim();
}

export interface Glass {
  /** Glasfarbe (Körper) */
  body: string;
  /** dunklere Kante */
  edge: string;
  /** Glanzlicht */
  shine: string;
  /** Flüssigkeit (bei klarem Glas sichtbar) */
  liquid: string;
  clear: boolean;
}

const BROWN: Glass = { body: '#6a3a14', edge: '#3f210a', shine: '#d69a5b', liquid: '#6a3a14', clear: false };
const GREEN: Glass = { body: '#2f5d2a', edge: '#173316', shine: '#8fc27a', liquid: '#2f5d2a', clear: false };
const DARK_GREEN: Glass = { body: '#1f3a22', edge: '#0d1d10', shine: '#6f9a6f', liquid: '#1f3a22', clear: false };

function clearGlass(liquid: string): Glass {
  return { body: mix('#e6f0f7', liquid, 0.15), edge: '#94a3b8', shine: '#ffffff', liquid, clear: true };
}

/** Flüssigkeitsfarbe aus Kategorie/Name/Farbe ableiten */
export function liquidColor(product: Product): string {
  const n = `${product.brand} ${product.name}`.toLowerCase();
  if (product.categoryId === 'wasser') return '#d6ecfb';
  if (/cola|kola|spezi/.test(n)) return '#3b1a0c';
  if (/fanta|orange|multi/.test(n)) return '#f59e0b';
  if (/apfel/.test(n)) return '#f2b84b';
  if (/mate/.test(n)) return '#c58a2b';
  if (/holunder/.test(n)) return '#a855f7';
  if (/radler/.test(n)) return '#e8c547';
  if (/primitivo|rot/.test(n)) return '#5b0f1a';
  if (/riesling|silvaner|lugana|sekt|carta/.test(n)) return '#f3e6a3';
  if (/aperol/.test(n)) return '#f26b1d';
  if (/blutwurz/.test(n)) return '#8b1d1d';
  if (/ramazzotti|havana|rum/.test(n)) return '#8a4b14';
  if (/gin/.test(n)) return '#eef6f1';
  return shade(product.color, 0.1);
}

/** Glasfarbe: braun/grün/klar je nach Getränk und Produktfarbe */
export function glassFor(product: Product): Glass {
  const n = `${product.brand} ${product.name}`.toLowerCase();
  const cat = product.categoryId;
  if (product.material === 'pet') return clearGlass(liquidColor(product));
  if (cat === 'bier' || cat === 'alkoholfrei' || cat === 'fass') {
    return isGreenish(product.color) ? GREEN : BROWN;
  }
  if (cat === 'wasser') return clearGlass(liquidColor(product));
  if (cat === 'limo') {
    if (/spezi|mate/.test(n)) return BROWN;
    return clearGlass(liquidColor(product));
  }
  if (cat === 'saft') return clearGlass(liquidColor(product));
  if (cat === 'wein') {
    if (/primitivo|sekt|carta|freixenet|rotk/.test(n)) return DARK_GREEN;
    return { ...GREEN, body: '#4d7c2f', edge: '#2b4a18', shine: '#b5d98f' };
  }
  if (cat === 'spirituosen') {
    if (/jäger|jaeger|gordon|gin/.test(n) && isGreenish(product.color)) return GREEN;
    return clearGlass(liquidColor(product));
  }
  return clearGlass(liquidColor(product));
}

/** Farbe des Kronkorkens/Deckels */
export function capColor(product: Product): string {
  // Akzent bei hellen/goldenen Akzenten, sonst Hauptfarbe
  return isLight(product.accent) && product.accent.toLowerCase() !== '#ffffff' && product.accent.toLowerCase() !== '#f8fafc'
    ? product.accent
    : product.color;
}

/** Zufallsfreier, stabiler Wert je Produkt (für kleine Variationen) */
export function seedOf(product: Product): number {
  let h = 7;
  for (let i = 0; i < product.id.length; i++) h = (h * 31 + product.id.charCodeAt(i)) >>> 0;
  return h;
}
