import type { Product } from '@shared/types';
import { brandLabel, capColor, FitText, glassFor, GroundShadow, shortName, type Glass, type IllustrationProps } from './common';
import { isLight, mix, shade } from './color';

/** Glasverlauf (zylindrische Schattierung) */
export function GlassGradient({ id, glass }: { id: string; glass: Glass }) {
  if (glass.clear) {
    return (
      <linearGradient id={id} x1="0" x2="1">
        <stop offset="0" stopColor="#cbd5e1" stopOpacity="0.9" />
        <stop offset="0.18" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="0.55" stopColor="#e2e8f0" stopOpacity="0.35" />
        <stop offset="1" stopColor="#94a3b8" stopOpacity="0.8" />
      </linearGradient>
    );
  }
  return (
    <linearGradient id={id} x1="0" x2="1">
      <stop offset="0" stopColor={glass.edge} />
      <stop offset="0.22" stopColor={shade(glass.body, 0.12)} />
      <stop offset="0.5" stopColor={glass.body} />
      <stop offset="0.85" stopColor={shade(glass.body, -0.2)} />
      <stop offset="1" stopColor={glass.edge} />
    </linearGradient>
  );
}

/** Euro-/NRW-Flasche komplett (für Sixpack) */
export function FullBottle({
  cx,
  base,
  height,
  width,
  glass,
  cap,
  neckLabel,
  bodyLabel,
  gradId,
  dim = 0,
}: {
  cx: number;
  base: number;
  height: number;
  width: number;
  glass: Glass;
  cap: string;
  neckLabel?: string;
  bodyLabel?: string;
  gradId: string;
  dim?: number;
}) {
  const top = base - height;
  const nw = width * 0.38;
  const neckEnd = top + height * 0.3;
  const shoulderEnd = top + height * 0.52;
  const w = width / 2;
  const n = nw / 2;
  const d = [
    `M${cx - n} ${top + 6}`,
    `L${cx - n} ${neckEnd}`,
    `C${cx - n} ${neckEnd + height * 0.09} ${cx - w} ${shoulderEnd - height * 0.11} ${cx - w} ${shoulderEnd}`,
    `L${cx - w} ${base - 4}`,
    `Q${cx - w} ${base} ${cx - w + 4} ${base}`,
    `L${cx + w - 4} ${base}`,
    `Q${cx + w} ${base} ${cx + w} ${base - 4}`,
    `L${cx + w} ${shoulderEnd}`,
    `C${cx + w} ${shoulderEnd - height * 0.11} ${cx + n} ${neckEnd + height * 0.09} ${cx + n} ${neckEnd}`,
    `L${cx + n} ${top + 6}`,
    'Z',
  ].join(' ');
  const body = dim ? shade(glass.body, -dim) : glass.body;
  return (
    <g>
      <path d={d} fill={body} />
      <path d={d} fill={`url(#${gradId})`} opacity={dim ? 0.6 : 1} />
      {bodyLabel ? <rect x={cx - w} y={shoulderEnd + height * 0.12} width={width} height={height * 0.26} fill={dim ? shade(bodyLabel, -dim) : bodyLabel} /> : null}
      {neckLabel ? <rect x={cx - n - 0.5} y={neckEnd - height * 0.06} width={nw + 1} height={height * 0.08} rx={1.5} fill={dim ? shade(neckLabel, -dim) : neckLabel} /> : null}
      <path
        d={`M${cx - n + 1.8} ${top + 10} L${cx - n + 1.8} ${neckEnd} Q${cx - w + 3} ${shoulderEnd - 4} ${cx - w + 3} ${shoulderEnd + 10} L${cx - w + 3} ${base - 10}`}
        stroke={glass.shine}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={0.4 - dim * 0.3}
      />
      <rect x={cx - n - 0.8} y={top + 5} width={nw + 1.6} height={3} rx={1} fill={shade(body, -0.25)} />
      <rect x={cx - 7} y={top} width={14} height={7} rx={2} fill={dim ? shade(cap, -dim) : cap} />
      <rect x={cx - 5} y={top + 1.2} width={7} height={1.6} rx={0.8} fill="#fff" opacity={0.45} />
    </g>
  );
}

/** Sixpack-Träger mit 6 Flaschen */
export function Sixpack({ product, uid }: IllustrationProps) {
  const glass = glassFor(product);
  const cap = capColor(product);
  const c = product.color;
  const band = product.accent;
  const g = `${uid}-glass`;
  return (
    <g>
      <defs>
        <GlassGradient id={g} glass={glass} />
        <linearGradient id={`${uid}-carrier`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(c, 0.1)} />
          <stop offset="1" stopColor={shade(c, -0.25)} />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={185} rx={76} ry={7} />
      {/* hintere Reihe */}
      {[69, 109, 149].map((x) => (
        <FullBottle key={x} cx={x} base={172} height={134} width={30} glass={glass} cap={cap} neckLabel={product.accent} gradId={g} dim={0.3} />
      ))}
      {/* Tragegriff */}
      <path d="M44 114 L44 82 Q44 74 52 74 L148 74 Q156 74 156 82 L156 114 Z" fill={shade(c, -0.18)} />
      <rect x={84} y={81} width={32} height={10} rx={5} fill={shade(c, -0.55)} />
      {/* vordere Reihe */}
      {[60, 100, 140].map((x) => (
        <FullBottle key={x} cx={x} base={182} height={142} width={32} glass={glass} cap={cap} neckLabel={product.accent} gradId={g} />
      ))}
      {/* Träger */}
      <path d="M28 114 h144 v62 q0 8 -8 8 h-128 q-8 0 -8 -8 z" fill={`url(#${uid}-carrier)`} />
      <rect x={28} y={114} width={144} height={4} fill="#000" opacity={0.18} />
      <rect x={40} y={132} width={120} height={26} rx={6} fill={band} />
      <FitText x={100} y={150.5} width={108} text={brandLabel(product)} size={13} fill={isLight(band) ? shade(c, -0.15) : '#ffffff'} spacing={1.2} />
      <FitText
        x={100}
        y={174}
        width={120}
        text={`6 × ${String(product.unitVolumeL).replace('.', ',')} l`}
        size={9}
        fill={isLight(c) ? shade(c, -0.6) : '#ffffff'}
        weight={700}
        spacing={1}
        opacity={0.85}
      />
    </g>
  );
}

type Shape = 'bordeaux' | 'flute' | 'bocksbeutel' | 'sekt' | 'spirit' | 'flask';

function shapeFor(p: Product): Shape {
  const n = `${p.brand} ${p.name} ${p.packaging}`.toLowerCase();
  if (/bocksbeutel/.test(n)) return 'bocksbeutel';
  if (/sekt|carta|freixenet|prosecco|champagner/.test(n)) return 'sekt';
  if (p.categoryId === 'wein') return /riesling|lugana|silvaner/.test(n) ? 'flute' : 'bordeaux';
  if (p.unitVolumeL <= 0.5) return 'flask';
  return 'spirit';
}

/** Papier-Etikett mit Marke und Sorte */
function PaperLabel({ product, x, y, w, h, round = 4 }: { product: Product; x: number; y: number; w: number; h: number; round?: number }) {
  const c = product.color;
  const textColor = isLight(c) ? shade(c, -0.55) : c;
  const brand = brandLabel(product);
  const name = shortName(product);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={round} fill="#fbf7ee" />
      <rect x={x} y={y} width={w} height={h} rx={round} fill="none" stroke="#000" strokeOpacity={0.06} />
      <rect x={x} y={y + 4} width={w} height={3} fill={product.accent} opacity={0.9} />
      <rect x={x} y={y + h - 7} width={w} height={3} fill={product.accent} opacity={0.9} />
      <FitText x={x + w / 2} y={y + h * 0.48} width={w - 10} text={brand} size={Math.min(11, w / 5.5)} fill={textColor} spacing={0.8} />
      <FitText x={x + w / 2} y={y + h * 0.48 + 12} width={w - 10} text={name} size={Math.min(8, w / 7)} fill="#475569" weight={600} spacing={0.2} />
    </g>
  );
}

/** Einzelflasche: Wein, Sekt, Spirituose */
export function SingleBottle({ product, uid }: IllustrationProps) {
  const glass = glassFor(product);
  const shape = shapeFor(product);
  const g = `${uid}-glass`;
  const cx = 100;
  const base = 184;
  const c = product.color;

  let d = '';
  let label = { x: 0, y: 0, w: 0, h: 0 };
  let capsule: { y: number; h: number; w: number } | null = null;
  let liquidTop = 0;
  let foil: string | null = null;

  if (shape === 'bocksbeutel') {
    d = `M${cx - 8} 22 L${cx - 8} 76 C${cx - 8} 90 ${cx - 44} 92 ${cx - 44} 132 C${cx - 44} 170 ${cx - 22} ${base} ${cx} ${base} C${cx + 22} ${base} ${cx + 44} 170 ${cx + 44} 132 C${cx + 44} 92 ${cx + 8} 90 ${cx + 8} 76 L${cx + 8} 22 Z`;
    label = { x: cx - 30, y: 118, w: 60, h: 38 };
    capsule = { y: 18, h: 34, w: 19 };
    liquidTop = 100;
  } else if (shape === 'flute') {
    d = `M${cx - 8} 16 L${cx - 8} 54 C${cx - 8} 80 ${cx - 21} 92 ${cx - 21} 112 L${cx - 21} ${base - 5} Q${cx - 21} ${base} ${cx - 16} ${base} L${cx + 16} ${base} Q${cx + 21} ${base} ${cx + 21} ${base - 5} L${cx + 21} 112 C${cx + 21} 92 ${cx + 8} 80 ${cx + 8} 54 L${cx + 8} 16 Z`;
    label = { x: cx - 20, y: 126, w: 40, h: 40 };
    capsule = { y: 12, h: 30, w: 19 };
    liquidTop = 96;
  } else if (shape === 'bordeaux') {
    d = `M${cx - 8} 16 L${cx - 8} 58 C${cx - 8} 72 ${cx - 24} 70 ${cx - 24} 90 L${cx - 24} ${base - 5} Q${cx - 24} ${base} ${cx - 19} ${base} L${cx + 19} ${base} Q${cx + 24} ${base} ${cx + 24} ${base - 5} L${cx + 24} 90 C${cx + 24} 70 ${cx + 8} 72 ${cx + 8} 58 L${cx + 8} 16 Z`;
    label = { x: cx - 23, y: 116, w: 46, h: 46 };
    capsule = { y: 12, h: 34, w: 19 };
    liquidTop = 84;
  } else if (shape === 'sekt') {
    d = `M${cx - 9} 20 L${cx - 9} 50 C${cx - 9} 74 ${cx - 27} 80 ${cx - 27} 104 L${cx - 27} ${base - 6} Q${cx - 27} ${base} ${cx - 21} ${base} L${cx + 21} ${base} Q${cx + 27} ${base} ${cx + 27} ${base - 6} L${cx + 27} 104 C${cx + 27} 80 ${cx + 9} 74 ${cx + 9} 50 L${cx + 9} 20 Z`;
    label = { x: cx - 26, y: 122, w: 52, h: 40 };
    foil = `M${cx - 11} 14 L${cx + 11} 14 L${cx + 11} 52 C${cx + 11} 66 ${cx + 20} 74 ${cx + 22} 82 L${cx - 22} 82 C${cx - 20} 74 ${cx - 11} 66 ${cx - 11} 52 Z`;
    liquidTop = 96;
  } else if (shape === 'flask') {
    d = `M${cx - 9} 44 L${cx - 9} 64 C${cx - 9} 74 ${cx - 30} 74 ${cx - 30} 92 L${cx - 30} ${base - 8} Q${cx - 30} ${base} ${cx - 22} ${base} L${cx + 22} ${base} Q${cx + 30} ${base} ${cx + 30} ${base - 8} L${cx + 30} 92 C${cx + 30} 74 ${cx + 9} 74 ${cx + 9} 64 L${cx + 9} 44 Z`;
    label = { x: cx - 26, y: 110, w: 52, h: 50 };
    capsule = { y: 32, h: 16, w: 22 };
    liquidTop = 84;
  } else {
    // spirit: kantige Schulter
    d = `M${cx - 9} 38 L${cx - 9} 62 Q${cx - 9} 70 ${cx - 18} 72 L${cx - 22} 73 Q${cx - 30} 75 ${cx - 30} 84 L${cx - 30} ${base - 6} Q${cx - 30} ${base} ${cx - 24} ${base} L${cx + 24} ${base} Q${cx + 30} ${base} ${cx + 30} ${base - 6} L${cx + 30} 84 Q${cx + 30} 75 ${cx + 22} 73 L${cx + 18} 72 Q${cx + 9} 70 ${cx + 9} 62 L${cx + 9} 38 Z`;
    label = { x: cx - 27, y: 102, w: 54, h: 58 };
    capsule = { y: 24, h: 20, w: 23 };
    liquidTop = 80;
  }

  const clip = `${uid}-clip`;
  return (
    <g>
      <defs>
        <GlassGradient id={g} glass={glass} />
        <clipPath id={clip}>
          <path d={d} />
        </clipPath>
      </defs>
      <GroundShadow cx={cx} cy={186} rx={shape === 'bocksbeutel' ? 50 : 40} ry={6} />
      <path d={d} fill={glass.clear ? '#f1f5f9' : glass.body} />
      {glass.clear ? (
        <g clipPath={`url(#${clip})`}>
          <rect x={cx - 50} y={liquidTop} width={100} height={base - liquidTop} fill={glass.liquid} opacity={0.88} />
          <rect x={cx - 50} y={liquidTop} width={100} height={2} fill="#fff" opacity={0.5} />
        </g>
      ) : null}
      <path d={d} fill={`url(#${g})`} />
      <path d={d} fill="none" stroke={glass.clear ? '#94a3b8' : glass.edge} strokeOpacity={glass.clear ? 0.8 : 0.5} strokeWidth={1.2} />
      {/* Glanzlicht */}
      <g clipPath={`url(#${clip})`}>
        <rect x={cx - (shape === 'bocksbeutel' ? 30 : 17)} y={20} width={4} height={160} rx={2} fill="#fff" opacity={0.35} />
        <rect x={cx + (shape === 'bocksbeutel' ? 26 : 13)} y={60} width={2} height={110} rx={1} fill="#fff" opacity={0.15} />
      </g>
      {foil ? (
        <>
          <path d={foil} fill={c} />
          <path d={foil} fill={`url(#${g})`} opacity={0.35} />
          <rect x={cx - 11} y={40} width={22} height={4} fill={product.accent} />
          <path d={`M${cx - 22} 82 L${cx + 22} 82`} stroke={product.accent} strokeWidth={2} />
        </>
      ) : null}
      {capsule ? (
        <>
          <rect x={cx - capsule.w / 2} y={capsule.y} width={capsule.w} height={capsule.h} rx={3} fill={shade(c, -0.15)} />
          <rect x={cx - capsule.w / 2} y={capsule.y} width={capsule.w} height={capsule.h} rx={3} fill={`url(#${g})`} opacity={0.3} />
          <rect x={cx - capsule.w / 2} y={capsule.y + capsule.h - 5} width={capsule.w} height={2.5} fill={product.accent} opacity={0.9} />
        </>
      ) : null}
      <PaperLabel product={product} x={label.x} y={label.y} w={label.w} h={label.h} round={shape === 'bocksbeutel' ? 10 : 3} />
    </g>
  );
}

/** Glas-Mischfarbe für kleine Akzente (exportiert für andere Illustrationen) */
export const glassTint = (hex: string) => mix(hex, '#ffffff', 0.6);
