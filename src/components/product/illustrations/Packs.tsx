import { brandLabel, FitText, glassFor, GroundShadow, liquidColor, shortName, type IllustrationProps } from './common';
import { isLight, shade } from './color';

function Can({ x, base, w, h, color, accent, uid, dim = 0 }: { x: number; base: number; w: number; h: number; color: string; accent: string; uid: string; dim?: number }) {
  const top = base - h;
  const body = dim ? shade(color, -dim) : color;
  const acc = dim ? shade(accent, -dim) : accent;
  return (
    <g>
      <rect x={x} y={top + 4} width={w} height={h - 7} rx={3} fill={body} />
      {/* Diagonales Dekor */}
      <path d={`M${x} ${top + h * 0.62} L${x + w} ${top + h * 0.38} L${x + w} ${top + h * 0.5} L${x} ${top + h * 0.74} Z`} fill={acc} opacity={0.95} />
      <rect x={x} y={top + 12} width={w} height={5} fill={acc} opacity={0.75} />
      {/* Zylinder-Schattierung */}
      <rect x={x} y={top + 4} width={w} height={h - 7} rx={3} fill={`url(#${uid}-cyl)`} />
      {/* Deckel */}
      <rect x={x + 1} y={top} width={w - 2} height={6} rx={2.5} fill={dim ? '#94a3b8' : '#cbd5e1'} />
      <rect x={x + 3} y={top + 1} width={w - 6} height={2} rx={1} fill="#fff" opacity={0.7} />
      {/* Boden */}
      <rect x={x + 1.5} y={base - 4} width={w - 3} height={4} rx={2} fill={dim ? '#64748b' : '#94a3b8'} />
    </g>
  );
}

/** Dosen-Tray (24 Dosen) */
export function CanTray({ product, uid }: IllustrationProps) {
  const n = 6;
  const w = 23;
  const gap = 2.5;
  const total = n * w + (n - 1) * gap;
  const x0 = 100 - total / 2;
  const tray = shade(product.color, -0.35);
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-cyl`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id={`${uid}-foil`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={185} rx={84} ry={7} />
      {Array.from({ length: n }, (_, i) => (
        <Can key={`b${i}`} x={x0 + i * (w + gap) + 11} base={160} w={w} h={92} color={product.color} accent={product.accent} uid={uid} dim={0.3} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <Can key={`f${i}`} x={x0 + i * (w + gap)} base={174} w={w} h={94} color={product.color} accent={product.accent} uid={uid} />
      ))}
      {/* Kartontray */}
      <path d={`M${x0 - 6} 146 h${total + 23} v32 q0 6 -6 6 h-${total + 11} q-6 0 -6 -6 z`} fill={tray} />
      <rect x={x0 - 6} y={146} width={total + 23} height={3} fill="#000" opacity={0.2} />
      <FitText x={100 + 5} y={170} width={total - 10} text={brandLabel(product)} size={13} fill={product.accent} spacing={1.6} />
      {/* Folie */}
      <rect x={x0 - 8} y={62} width={total + 27} height={124} rx={10} fill={`url(#${uid}-foil)`} />
    </g>
  );
}

/** Tetra-Karton-Pack (z. B. Saft 6 × 1 l) */
export function TetraPack({ product, uid }: IllustrationProps) {
  const fruit = liquidColor(product);
  const xs = [40, 82, 124];
  const w = 40;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-box`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.12" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={185} rx={76} ry={7} />
      {xs.map((x, i) => (
        <g key={i} transform={i === 1 ? 'translate(0,-4)' : undefined}>
          {/* Giebel */}
          <path d={`M${x} 64 L${x + 4} 46 L${x + w - 4} 46 L${x + w} 64 Z`} fill={shade(product.color, 0.25)} />
          <rect x={x + 2} y={40} width={w - 4} height={7} rx={2} fill={shade(product.color, 0.1)} />
          <rect x={x + w - 15} y={50} width={9} height={8} rx={2} fill={product.accent} />
          {/* Körper */}
          <rect x={x} y={64} width={w} height={116} rx={2} fill="#ffffff" />
          <rect x={x} y={64} width={w} height={34} fill={product.color} />
          <circle cx={x + w / 2} cy={128} r={13} fill={fruit} />
          <circle cx={x + w / 2 - 4} cy={124} r={4} fill="#fff" opacity={0.4} />
          <path d={`M${x + w / 2} 115 q6 -8 12 -6 q-3 7 -12 6 z`} fill={product.accent} />
          <rect x={x} y={156} width={w} height={24} fill={shade(product.color, -0.1)} />
          <FitText x={x + w / 2} y={86} width={w - 6} text={brandLabel(product)} size={8.5} fill={isLight(product.color) ? '#0f172a' : '#ffffff'} spacing={0.4} />
          <FitText x={x + w / 2} y={172} width={w - 6} text={shortName(product).toUpperCase()} size={6.5} fill="#ffffff" weight={700} spacing={0.3} />
          <rect x={x} y={64} width={w} height={116} rx={2} fill={`url(#${uid}-box)`} />
        </g>
      ))}
    </g>
  );
}

/** PET-Flaschen, in Folie verschweißt (Einweg 6 × 1,5 l) */
export function PetPack({ product, uid }: IllustrationProps) {
  const glass = glassFor(product);
  const liquid = glass.liquid;
  const bottle = (cx: number, base: number, dim: number, key: string) => {
    const top = base - 154;
    const d = `M${cx - 8} ${top + 9} L${cx - 8} ${top + 18} C${cx - 8} ${top + 32} ${cx - 21} ${top + 36} ${cx - 21} ${top + 52} L${cx - 21} ${base - 6} Q${cx - 21} ${base} ${cx - 15} ${base} L${cx + 15} ${base} Q${cx + 21} ${base} ${cx + 21} ${base - 6} L${cx + 21} ${top + 52} C${cx + 21} ${top + 36} ${cx + 8} ${top + 32} ${cx + 8} ${top + 18} L${cx + 8} ${top + 9} Z`;
    return (
      <g key={key} opacity={dim ? 0.85 : 1}>
        <path d={d} fill={shade('#e0f2fe', -dim)} />
        <rect x={cx - 20} y={top + 50} width={40} height={base - top - 56} fill={shade(liquid, -dim)} opacity={0.8} />
        <path d={d} fill={`url(#${uid}-pet)`} />
        <path d={d} fill="none" stroke="#94a3b8" strokeOpacity={0.7} />
        {[0, 1, 2].map((r) => (
          <path key={r} d={`M${cx - 21} ${base - 20 - r * 8} h42`} stroke="#fff" strokeOpacity={0.45} strokeWidth={1.2} />
        ))}
        <rect x={cx - 21} y={top + 78} width={42} height={34} fill={shade(product.color, -dim)} />
        <rect x={cx - 21} y={top + 78} width={42} height={4} fill={shade(product.accent, -dim)} />
        <FitText x={cx} y={top + 99} width={36} text={brandLabel(product)} size={7.5} fill={product.accent} spacing={0.3} />
        <rect x={cx - 10} y={top} width={20} height={11} rx={3} fill={shade(product.accent === '#ffffff' ? product.color : product.accent, -dim - 0.05)} />
        <rect x={cx - 11} y={top + 10} width={22} height={2.5} rx={1} fill={shade('#cbd5e1', -dim)} />
      </g>
    );
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-pet`} x1="0" x2="1">
          <stop offset="0" stopColor="#64748b" stopOpacity="0.25" />
          <stop offset="0.2" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#334155" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={`${uid}-wrap`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="0.75" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={185} rx={80} ry={7} />
      {[66, 110, 154].map((x, i) => bottle(x, 174, 0.18, `b${i}`))}
      {[54, 98, 142].map((x, i) => bottle(x, 182, 0, `f${i}`))}
      <rect x={28} y={70} width={150} height={115} rx={12} fill={`url(#${uid}-wrap)`} />
      <path d="M32 92 q60 -6 140 0" stroke="#fff" strokeOpacity={0.45} strokeWidth={2} fill="none" />
    </g>
  );
}
