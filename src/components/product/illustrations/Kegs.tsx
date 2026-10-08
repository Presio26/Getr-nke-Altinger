import { brandLabel, FitText, GroundShadow, shortName, type IllustrationProps } from './common';
import { isLight, shade } from './color';

function MetalGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" x2="1">
      <stop offset="0" stopColor="#6b7785" />
      <stop offset="0.16" stopColor="#c7d0d9" />
      <stop offset="0.32" stopColor="#f3f6f9" />
      <stop offset="0.5" stopColor="#b9c3cd" />
      <stop offset="0.78" stopColor="#8d99a6" />
      <stop offset="1" stopColor="#5d6875" />
    </linearGradient>
  );
}

/** Edelstahlfass (KEG) bzw. Partyfass */
export function SteelKeg({ product, uid }: IllustrationProps) {
  const party = product.unitVolumeL > 0 && product.unitVolumeL <= 10;
  const big = product.unitVolumeL >= 50;
  const w = party ? 70 : big ? 108 : 94;
  const top = party ? 70 : big ? 30 : 40;
  const base = 182;
  const x = 100 - w / 2;
  const metal = `${uid}-metal`;
  const band = product.color;
  const bandText = isLight(band) ? '#0f172a' : product.accent;

  if (party) {
    return (
      <g>
        <defs>
          <MetalGradient id={metal} />
          <linearGradient id={`${uid}-print`} x1="0" x2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.3" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <GroundShadow cx={100} cy={185} rx={48} ry={6} />
        <rect x={x} y={top} width={w} height={base - top} rx={8} fill={band} />
        <rect x={x} y={top + 26} width={w} height={22} fill={product.accent} />
        <FitText x={100} y={top + 41.5} width={w - 10} text={brandLabel(product)} size={11} fill={isLight(product.accent) ? shade(band, -0.2) : '#fff'} spacing={0.8} />
        <FitText x={100} y={top + 70} width={w - 12} text="PARTYFASS" size={8} fill="#fff" weight={700} spacing={1.4} opacity={0.9} />
        <FitText x={100} y={top + 82} width={w - 12} text={`${String(product.unitVolumeL).replace('.', ',')} LITER`} size={7.5} fill="#fff" weight={700} spacing={1.2} opacity={0.8} />
        <rect x={x} y={top} width={w} height={base - top} rx={8} fill={`url(#${uid}-print)`} />
        <rect x={x - 2} y={top - 4} width={w + 4} height={9} rx={4} fill={`url(#${metal})`} />
        <rect x={x - 2} y={base - 6} width={w + 4} height={8} rx={4} fill={`url(#${metal})`} />
        {/* Zapfhahn */}
        <rect x={93} y={base - 30} width={14} height={8} rx={2} fill="#1f2937" />
        <rect x={97} y={base - 22} width={6} height={9} rx={2} fill="#111827" />
        <rect x={98} y={base - 44} width={4} height={15} rx={2} fill="#dc2626" />
      </g>
    );
  }

  const ring1 = top + (base - top) * 0.3;
  const ring2 = top + (base - top) * 0.72;
  return (
    <g>
      <defs>
        <MetalGradient id={metal} />
      </defs>
      <GroundShadow cx={100} cy={185} rx={w / 2 + 10} ry={7} />
      {/* Fitting */}
      <rect x={90} y={top - 12} width={20} height={10} rx={3} fill="#475569" />
      <rect x={86} y={top - 4} width={28} height={6} rx={2} fill="#94a3b8" />
      {/* Körper */}
      <rect x={x} y={top} width={w} height={base - top} rx={10} fill={`url(#${metal})`} />
      {/* obere/untere Zarge mit Grifflöchern */}
      <rect x={x - 2} y={top} width={w + 4} height={22} rx={8} fill={`url(#${metal})`} />
      <rect x={x + w * 0.2} y={top + 6} width={w * 0.22} height={9} rx={4.5} fill="#334155" />
      <rect x={x + w * 0.58} y={top + 6} width={w * 0.22} height={9} rx={4.5} fill="#334155" />
      <rect x={x - 2} y={base - 18} width={w + 4} height={18} rx={7} fill={`url(#${metal})`} />
      <rect x={x - 2} y={top + 21} width={w + 4} height={2} fill="#000" opacity={0.2} />
      <rect x={x - 2} y={base - 19} width={w + 4} height={2} fill="#000" opacity={0.2} />
      {/* Rollsicken */}
      <rect x={x - 1} y={ring1 - 3} width={w + 2} height={6} rx={3} fill={`url(#${metal})`} />
      <rect x={x - 1} y={ring2 - 3} width={w + 2} height={6} rx={3} fill={`url(#${metal})`} />
      <rect x={x - 1} y={ring1 + 2} width={w + 2} height={1.5} fill="#000" opacity={0.18} />
      <rect x={x - 1} y={ring2 + 2} width={w + 2} height={1.5} fill="#000" opacity={0.18} />
      {/* Banderole */}
      <rect x={x} y={ring1 + 9} width={w} height={ring2 - ring1 - 18} fill={band} />
      <rect x={x} y={ring1 + 9} width={w} height={4} fill={product.accent} />
      <rect x={x} y={ring2 - 13} width={w} height={4} fill={product.accent} />
      <FitText x={100} y={(ring1 + ring2) / 2 + 1} width={w - 16} text={brandLabel(product)} size={14} fill={bandText} spacing={1.2} />
      <FitText
        x={100}
        y={(ring1 + ring2) / 2 + 15}
        width={w - 20}
        text={`${shortName(product).toUpperCase()} · ${product.unitVolumeL} L`}
        size={7}
        fill={isLight(band) ? '#334155' : '#ffffff'}
        weight={700}
        spacing={0.8}
        opacity={0.9}
      />
      <rect x={x} y={ring1 + 9} width={w} height={ring2 - ring1 - 18} fill={`url(#${metal})`} opacity={0.25} />
    </g>
  );
}

/** Holzfass mit Eisenreifen und Zapfhahn */
export function WoodenBarrel({ product, uid }: IllustrationProps) {
  const top = 32;
  const base = 180;
  const outline = `M62 ${top} C50 78 50 134 62 ${base} L138 ${base} C150 134 150 78 138 ${top} Z`;
  const staves = [74, 87, 100, 113, 126];
  const hoopAt = (y: number) => {
    // halbe Breite an Höhe y (Annäherung der Bauchung)
    const t = (y - top) / (base - top);
    const bulge = Math.sin(Math.PI * t) * 10;
    return 38 + bulge;
  };
  const hoop = (y: number, h = 7) => {
    const hw = hoopAt(y);
    return <rect key={y} x={100 - hw - 0.5} y={y - h / 2} width={hw * 2 + 1} height={h} rx={2} fill={`url(#${uid}-iron)`} />;
  };
  const clip = `${uid}-barrel`;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0" x2="1">
          <stop offset="0" stopColor="#4a2408" />
          <stop offset="0.25" stopColor="#a8661e" />
          <stop offset="0.5" stopColor="#c27c2c" />
          <stop offset="0.8" stopColor="#8a4d14" />
          <stop offset="1" stopColor="#4a2408" />
        </linearGradient>
        <linearGradient id={`${uid}-iron`} x1="0" x2="1">
          <stop offset="0" stopColor="#1f2937" />
          <stop offset="0.3" stopColor="#6b7280" />
          <stop offset="0.6" stopColor="#374151" />
          <stop offset="1" stopColor="#111827" />
        </linearGradient>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
      </defs>
      <GroundShadow cx={100} cy={184} rx={58} ry={7} />
      <path d={outline} fill={`url(#${uid}-wood)`} />
      <g clipPath={`url(#${clip})`}>
        {staves.map((sx) => (
          <path key={sx} d={`M${sx + (sx - 100) * 0.05} ${top} Q${sx + (sx - 100) * 0.35} 106 ${sx + (sx - 100) * 0.05} ${base}`} stroke="#3b1d06" strokeOpacity={0.45} strokeWidth={1.2} fill="none" />
        ))}
      </g>
      <ellipse cx={100} cy={top} rx={38} ry={6} fill="#5b2e0b" />
      <ellipse cx={100} cy={top} rx={33} ry={4} fill="#7c4214" />
      {[top + 10, top + 34, base - 34, base - 10].map((y) => hoop(y))}
      {/* Wappen-Etikett */}
      <rect x={72} y={86} width={56} height={34} rx={8} fill={product.color} stroke={product.accent} strokeWidth={2} />
      <FitText x={100} y={103} width={46} text={brandLabel(product)} size={9.5} fill={product.accent === '#a16207' ? '#f0d58c' : product.accent} spacing={0.6} />
      <FitText x={100} y={114} width={46} text="HOLZFASS" size={6} fill="#fff" weight={700} spacing={1} opacity={0.85} />
      {/* Zapfhahn (Messing) */}
      <rect x={93} y={150} width={14} height={7} rx={2} fill="#b8860b" />
      <rect x={97} y={156} width={6} height={10} rx={2} fill="#8b6508" />
      <rect x={99} y={140} width={3} height={12} rx={1.5} fill="#d4a017" />
      <circle cx={100.5} cy={139} r={3.2} fill="#d4a017" />
    </g>
  );
}
