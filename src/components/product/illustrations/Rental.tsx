import type { Product } from '@shared/types';
import { brandLabel, FitText, GroundShadow, shortName, type IllustrationProps } from './common';
import { isLight, mix, shade } from './color';

/** kleines Etikett-Textband (Marke) für Leih-/Sonstige Artikel */
function Tag({ product, x = 120, y = 168, w = 70 }: { product: Product; x?: number; y?: number; w?: number }) {
  const bg = isLight(product.color) ? product.accent : product.color;
  const fg = isLight(bg) ? '#0f172a' : '#ffffff';
  return (
    <g>
      <rect x={x} y={y} width={w} height={15} rx={7.5} fill={bg} />
      <circle cx={x + 8} cy={y + 7.5} r={2.2} fill={fg} opacity={0.7} />
      <FitText x={x + w / 2 + 4} y={y + 10.5} width={w - 20} text={product.brand.toUpperCase()} size={7} fill={fg} weight={800} spacing={0.6} />
    </g>
  );
}

function Garnitur({ product }: IllustrationProps) {
  const wood = product.color;
  const top = shade(wood, 0.18);
  const edge = shade(wood, -0.3);
  const leg = '#334155';
  return (
    <g>
      <GroundShadow cx={100} cy={176} rx={86} ry={9} />
      {/* hintere Bank */}
      <path d="M40 76 L168 76 L176 84 L48 84 Z" fill={top} />
      <rect x={48} y={84} width={128} height={4} fill={edge} />
      <path d="M62 88 l-6 40 M70 88 l6 40 M152 88 l-6 40 M160 88 l6 40" stroke={leg} strokeWidth={3} strokeLinecap="round" />
      {/* Tisch */}
      <path d="M22 96 L170 96 L182 112 L34 112 Z" fill={top} />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${30 + i * 2} ${100 + i * 3} L${174 + i * 2} ${100 + i * 3}`} stroke={product.accent} strokeOpacity={0.22} strokeWidth={1} />
      ))}
      <rect x={34} y={112} width={148} height={6} fill={edge} />
      <path d="M50 118 l-10 50 M60 118 l10 50 M156 118 l-10 50 M166 118 l10 50" stroke={leg} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M45 146 h20 M151 146 h20" stroke={leg} strokeWidth={2.5} />
      {/* vordere Bank */}
      <path d="M14 132 L150 132 L160 144 L24 144 Z" fill={top} />
      <rect x={24} y={144} width={136} height={5} fill={edge} />
      <path d="M36 149 l-7 28 M46 149 l7 28 M134 149 l-7 28 M144 149 l7 28" stroke={leg} strokeWidth={3} strokeLinecap="round" />
      <Tag product={product} x={118} y={180} />
    </g>
  );
}

function Stehtisch({ product, uid }: IllustrationProps) {
  const cloth = '#f8fafc';
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-cloth`} x1="0" x2="1">
          <stop offset="0" stopColor="#cbd5e1" />
          <stop offset="0.3" stopColor={cloth} />
          <stop offset="0.65" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={182} rx={52} ry={7} />
      <path d="M52 44 Q100 30 148 44 L148 52 Q124 60 108 104 L106 118 Q132 150 144 178 Q100 188 56 178 Q68 150 94 118 L92 104 Q76 60 52 52 Z" fill={`url(#${uid}-cloth)`} />
      <ellipse cx={100} cy={44} rx={48} ry={10} fill="#ffffff" stroke="#e2e8f0" />
      {[70, 86, 114, 130].map((x) => (
        <path key={x} d={`M${x} 56 Q${100 + (x - 100) * 0.2} 100 ${100 + (x - 100) * 0.12} 112`} stroke="#cbd5e1" strokeWidth={1} fill="none" />
      ))}
      {[74, 90, 110, 126].map((x) => (
        <path key={x} d={`M${100 + (x - 100) * 0.1} 124 Q${100 + (x - 100) * 0.6} 150 ${x} 180`} stroke="#cbd5e1" strokeWidth={1} fill="none" />
      ))}
      {/* Schleife */}
      <rect x={90} y={106} width={20} height={10} rx={3} fill={product.color} />
      <path d="M90 111 L74 102 L76 122 Z M110 111 L126 102 L124 122 Z" fill={shade(product.color, 0.15)} />
      <Tag product={product} x={124} y={150} w={66} />
    </g>
  );
}

function Zapfanlage({ product, uid }: IllustrationProps) {
  const two = /2-leitig|2 leitig|zwei/i.test(product.name);
  const towers = two ? [78, 122] : [100];
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-steel`} x1="0" x2="1">
          <stop offset="0" stopColor="#64748b" />
          <stop offset="0.2" stopColor="#e2e8f0" />
          <stop offset="0.45" stopColor="#f8fafc" />
          <stop offset="0.7" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={182} rx={82} ry={7} />
      {/* CO2-Flasche */}
      <rect x={18} y={100} width={22} height={78} rx={10} fill="#64748b" />
      <rect x={18} y={100} width={22} height={78} rx={10} fill={`url(#${uid}-steel)`} opacity={0.45} />
      <rect x={24} y={90} width={10} height={12} rx={3} fill="#334155" />
      <path d="M34 96 C50 96 48 110 56 112" stroke="#0f172a" strokeWidth={2} fill="none" />
      {/* Gerät */}
      <rect x={48} y={104} width={120} height={76} rx={8} fill={`url(#${uid}-steel)`} />
      <rect x={48} y={150} width={120} height={20} fill={product.color} />
      <FitText x={108} y={163.5} width={100} text={product.brand.toUpperCase()} size={8.5} fill={product.accent} spacing={1} />
      <rect x={60} y={116} width={30} height={20} rx={3} fill="#0f172a" />
      <rect x={64} y={120} width={14} height={4} rx={1} fill="#22c55e" />
      <circle cx={150} cy={126} r={7} fill="#334155" />
      <circle cx={150} cy={126} r={3} fill="#94a3b8" />
      {/* Tropfblech */}
      <rect x={58} y={98} width={100} height={7} rx={2} fill="#94a3b8" />
      {towers.map((x) => (
        <g key={x}>
          <rect x={x - 6} y={52} width={12} height={48} rx={4} fill={`url(#${uid}-steel)`} />
          <path d={`M${x + 4} 60 h14 v8 h-6 v6 h-4 v-6 h-4 z`} fill="#cbd5e1" stroke="#64748b" strokeWidth={0.8} />
          <rect x={x + 7} y={30} width={6} height={30} rx={3} fill="#111827" transform={`rotate(-8 ${x + 10} 60)`} />
          <rect x={x + 6} y={30} width={8} height={8} rx={2} fill={product.accent === '#cbd5e1' || product.accent === '#94a3b8' ? '#f2a900' : product.accent} transform={`rotate(-8 ${x + 10} 60)`} />
        </g>
      ))}
    </g>
  );
}

function Kuehlschrank({ product, uid }: IllustrationProps) {
  const body = product.color;
  const glow = product.accent;
  const rows = [52, 82, 112, 142];
  const bottleColors = ['#6a3a14', '#2f5d2a', '#d6ecfb', '#dc2626', '#f59e0b', '#6a3a14', '#1d4ed8'];
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={glow} stopOpacity="0.35" />
          <stop offset="1" stopColor={glow} stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={186} rx={52} ry={6} />
      <rect x={56} y={14} width={88} height={170} rx={8} fill={body} />
      <rect x={56} y={14} width={88} height={22} rx={8} fill={shade(body, 0.12)} />
      <FitText x={100} y={29} width={74} text={brandLabel(product)} size={9} fill={glow} spacing={1.2} />
      <rect x={64} y={40} width={72} height={136} rx={4} fill={mix(body, glow, 0.25)} />
      {rows.map((y, r) => (
        <g key={y}>
          {Array.from({ length: 6 }, (_, i) => {
            const c = bottleColors[(i + r * 2) % bottleColors.length];
            const x = 68 + i * 11.5;
            return (
              <g key={i}>
                <rect x={x} y={y + 6} width={8} height={18} rx={2} fill={c} />
                <rect x={x + 2.5} y={y} width={3} height={7} rx={1} fill={c} />
              </g>
            );
          })}
          <rect x={64} y={y + 24} width={72} height={2.5} fill="#e2e8f0" opacity={0.85} />
        </g>
      ))}
      <rect x={64} y={40} width={72} height={136} rx={4} fill={`url(#${uid}-glass)`} />
      <path d="M70 46 L92 46 L74 170 L70 170 Z" fill="#fff" opacity={0.12} />
      <rect x={130} y={80} width={4} height={56} rx={2} fill="#e2e8f0" />
      <rect x={60} y={184} width={10} height={3} rx={1} fill="#0f172a" />
      <rect x={130} y={184} width={10} height={3} rx={1} fill="#0f172a" />
    </g>
  );
}

function Anhaenger({ product }: IllustrationProps) {
  const c = product.color;
  return (
    <g>
      <GroundShadow cx={104} cy={178} rx={86} ry={7} />
      {/* Deichsel */}
      <path d="M8 150 L44 142 L44 150 L8 156 Z" fill="#334155" />
      <circle cx={10} cy={152} r={5} fill="#111827" />
      <rect x={22} y={152} width={4} height={18} fill="#475569" />
      <circle cx={24} cy={172} r={4} fill="#111827" />
      {/* Kühlaggregat */}
      <rect x={30} y={56} width={16} height={38} rx={3} fill="#cbd5e1" />
      <path d="M33 62 h10 M33 68 h10 M33 74 h10 M33 80 h10 M33 86 h10" stroke="#64748b" strokeWidth={1.5} />
      {/* Kofferaufbau */}
      <rect x={44} y={40} width={144} height={106} rx={8} fill={c} />
      <rect x={44} y={40} width={144} height={12} rx={6} fill={shade(c, 0.15)} />
      <rect x={44} y={92} width={144} height={22} fill={product.accent} />
      <FitText x={116} y={107} width={128} text={product.brand.toUpperCase()} size={11} fill={c} spacing={1.4} />
      <FitText x={116} y={76} width={110} text="KÜHLANHÄNGER" size={10} fill="#fff" weight={800} spacing={2} opacity={0.9} />
      <rect x={156} y={58} width={4} height={30} rx={2} fill={shade(c, -0.3)} />
      {/* Fahrgestell */}
      <rect x={40} y={146} width={150} height={8} rx={3} fill="#1e293b" />
      <path d="M92 146 a24 24 0 0 1 48 0" fill="#334155" />
      <circle cx={116} cy={160} r={18} fill="#111827" />
      <circle cx={116} cy={160} r={9} fill="#94a3b8" />
      <circle cx={116} cy={160} r={3} fill="#475569" />
      <rect x={182} y={132} width={6} height={10} rx={1.5} fill="#ef4444" />
    </g>
  );
}

function Masskruege({ product, uid }: IllustrationProps) {
  const mug = (x: number, y: number, s: number, key: string) => {
    const w = 46 * s;
    const h = 76 * s;
    return (
      <g key={key}>
        <path d={`M${x + w - 2} ${y + h * 0.2} q${24 * s} 0 ${24 * s} ${h * 0.32} q0 ${h * 0.32} -${24 * s} ${h * 0.32}`} fill="none" stroke="#cbd5e1" strokeWidth={8 * s} />
        <rect x={x} y={y + 8 * s} width={w} height={h - 8 * s} rx={6 * s} fill="#f2a900" />
        <rect x={x} y={y + 8 * s} width={w} height={h - 8 * s} rx={6 * s} fill={`url(#${uid}-mug)`} />
        {Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: 3 }, (_, c) => (
            <ellipse key={`${r}${c}`} cx={x + w * (0.22 + c * 0.28)} cy={y + h * (0.38 + r * 0.2)} rx={5 * s} ry={6 * s} fill="#fff" opacity={0.22} />
          )),
        )}
        <path d={`M${x - 2} ${y + 12 * s} q${w / 4} -${14 * s} ${w / 2} -${4 * s} q${w / 4} -${12 * s} ${w / 2 + 4} ${2 * s} l0 ${8 * s} h-${w + 4} z`} fill="#fffaf0" />
        <rect x={x + 3} y={y + h - 6 * s} width={w - 6} height={4 * s} rx={2} fill="#fff" opacity={0.5} />
      </g>
    );
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-mug`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#7c4a03" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={176} rx={78} ry={7} />
      {mug(84, 50, 0.92, 'back')}
      {mug(34, 76, 1.12, 'l')}
      {mug(104, 84, 1.0, 'r')}
      <Tag product={product} x={118} y={178} />
    </g>
  );
}

function Weissbierglaeser({ product, uid }: IllustrationProps) {
  const glass = (x: number, base: number, s: number, key: string) => {
    const h = 128 * s;
    const top = base - h;
    const d = `M${x - 14 * s} ${top} C${x - 16 * s} ${top + h * 0.3} ${x - 9 * s} ${top + h * 0.55} ${x - 10 * s} ${top + h * 0.75} C${x - 11 * s} ${top + h * 0.88} ${x - 12 * s} ${base - 6} ${x - 12 * s} ${base} L${x + 12 * s} ${base} C${x + 12 * s} ${base - 6} ${x + 11 * s} ${top + h * 0.88} ${x + 10 * s} ${top + h * 0.75} C${x + 9 * s} ${top + h * 0.55} ${x + 16 * s} ${top + h * 0.3} ${x + 14 * s} ${top} Z`;
    return (
      <g key={key}>
        <path d={d} fill="#f59e0b" />
        <path d={d} fill={`url(#${uid}-wb)`} />
        <path d={`M${x - 15 * s} ${top + 4} q${15 * s} -${14 * s} ${30 * s} 0 l0 ${16 * s} q-${15 * s} 6 -${30 * s} 0 z`} fill="#fffaf0" />
        <path d={`M${x - 8 * s} ${top + 30 * s} q-3 ${40 * s} 0 ${h * 0.6}`} stroke="#fff" strokeOpacity={0.5} strokeWidth={2.4 * s} fill="none" />
        <rect x={x - 12 * s} y={base - 5} width={24 * s} height={5} rx={2} fill="#fde68a" opacity={0.7} />
      </g>
    );
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-wb`} x1="0" x2="1">
          <stop offset="0" stopColor="#7c2d12" stopOpacity="0.35" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#7c2d12" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={182} rx={70} ry={7} />
      {glass(72, 168, 0.92, 'a')}
      {glass(128, 168, 0.92, 'b')}
      {glass(100, 180, 1.05, 'c')}
      <Tag product={product} x={124} y={182} w={66} />
    </g>
  );
}

function Zelt({ product }: IllustrationProps) {
  const roof = product.color === '#f8fafc' ? '#ffffff' : product.color;
  const trim = product.accent;
  return (
    <g>
      <GroundShadow cx={100} cy={178} rx={92} ry={8} />
      {/* Seitenwände */}
      <rect x={18} y={82} width={164} height={92} fill="#f1f5f9" stroke="#cbd5e1" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={26 + i * 40} y={96} width={30} height={36} rx={2} fill="#dbeafe" stroke="#94a3b8" strokeWidth={1} />
          <path d={`M${41 + i * 40} 96 v36 M${26 + i * 40} 114 h30`} stroke="#94a3b8" strokeWidth={0.8} />
        </g>
      ))}
      <rect x={82} y={138} width={36} height={36} fill="#e2e8f0" stroke="#94a3b8" />
      <path d="M100 138 v36" stroke="#94a3b8" />
      {/* Dach (zwei Giebel) */}
      <path d="M12 84 L56 40 L100 84 Z" fill={roof} stroke="#cbd5e1" />
      <path d="M100 84 L144 40 L188 84 Z" fill={roof} stroke="#cbd5e1" />
      <path d="M56 40 L144 40 L188 84 L12 84 Z" fill={roof} opacity={0.9} stroke="#cbd5e1" />
      <path d="M56 40 L100 84 M144 40 L100 84" stroke="#cbd5e1" />
      {/* Volant */}
      <path d={`M12 84 ${Array.from({ length: 11 }, () => `q8 12 16 0`).join(' ')} L188 84 Z`} fill={trim} />
      <path d="M18 174 V84 M182 174 V84 M100 174 V84" stroke="#64748b" strokeWidth={2.5} />
      <rect x={66} y={58} width={68} height={14} rx={7} fill={trim} />
      <FitText x={100} y={68.5} width={58} text={brandLabel(product)} size={8} fill={isLight(trim) ? '#0f172a' : '#ffffff'} spacing={1} />
    </g>
  );
}

function Heizstrahler({ product, uid }: IllustrationProps) {
  const metal = product.color;
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={product.accent} stopOpacity="0.85" />
          <stop offset="0.5" stopColor={product.accent} stopOpacity="0.35" />
          <stop offset="1" stopColor={product.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-pole`} x1="0" x2="1">
          <stop offset="0" stopColor={shade(metal, -0.3)} />
          <stop offset="0.4" stopColor={shade(metal, 0.4)} />
          <stop offset="1" stopColor={shade(metal, -0.35)} />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={186} rx={44} ry={6} />
      <ellipse cx={100} cy={52} rx={70} ry={30} fill={`url(#${uid}-glow)`} />
      {/* Reflektorhaube */}
      <path d="M40 34 Q100 6 160 34 L150 40 Q100 22 50 40 Z" fill={shade(metal, 0.2)} />
      <path d="M50 40 Q100 22 150 40 L146 44 Q100 30 54 44 Z" fill={shade(metal, -0.2)} />
      {/* Brennerkopf */}
      <rect x={86} y={44} width={28} height={26} rx={4} fill="#1f2937" />
      <rect x={89} y={48} width={22} height={18} rx={2} fill={product.accent} />
      <rect x={89} y={48} width={22} height={18} rx={2} fill="#fff" opacity={0.25} />
      {/* Säule */}
      <rect x={96} y={70} width={8} height={70} fill={`url(#${uid}-pole)`} />
      {/* Gehäuse mit Gasflasche */}
      <path d="M74 140 h52 l6 42 h-64 z" fill={`url(#${uid}-pole)`} />
      <rect x={86} y={150} width={28} height={10} rx={3} fill="#111827" opacity={0.35} />
      <Tag product={product} x={124} y={170} w={66} />
    </g>
  );
}

function Eis({ product, uid }: IllustrationProps) {
  const cubes: [number, number, number][] = [
    [66, 108, -8],
    [92, 98, 6],
    [118, 110, -4],
    [74, 136, 10],
    [102, 128, -12],
    [128, 140, 4],
    [86, 160, -6],
    [114, 160, 8],
  ];
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-bag`} x1="0" x2="1">
          <stop offset="0" stopColor="#bae6fd" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={184} rx={56} ry={7} />
      <path d="M58 54 Q100 44 142 54 L156 172 Q100 188 44 172 Z" fill="#e0f2fe" />
      {cubes.map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <rect x={x - 12} y={y - 12} width={24} height={24} rx={6} fill="#f0f9ff" stroke="#7dd3fc" strokeWidth={1.2} />
          <rect x={x - 8} y={y - 8} width={8} height={5} rx={2} fill="#fff" opacity={0.9} />
        </g>
      ))}
      <path d="M58 54 Q100 44 142 54 L156 172 Q100 188 44 172 Z" fill={`url(#${uid}-bag)`} stroke="#7dd3fc" strokeWidth={1.2} />
      <path d="M84 50 Q100 30 116 50 L110 56 Q100 46 90 56 Z" fill="#7dd3fc" />
      <rect x={60} y={70} width={80} height={20} rx={4} fill={shade(product.color, -0.25)} />
      <FitText x={100} y={84} width={70} text="EISWÜRFEL" size={10} fill="#fff" spacing={1.6} />
      <Tag product={product} x={124} y={176} w={66} />
    </g>
  );
}

function Becher({ product, uid }: IllustrationProps) {
  const c = product.color;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-cup`} x1="0" x2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.7" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor={c} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={182} rx={60} ry={7} />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${62 + i * 0} ${40 + i * 12} L138 ${40 + i * 12} L128 ${170} L72 ${170} Z`} fill={`url(#${uid}-cup)`} stroke={shade(c, -0.2)} strokeOpacity={0.5} opacity={0.55 + i * 0.12} />
      ))}
      <ellipse cx={100} cy={76} rx={38} ry={6} fill={mix(c, '#ffffff', 0.6)} stroke={shade(c, -0.2)} strokeOpacity={0.5} />
      <path d="M78 112 h44" stroke="#fff" strokeWidth={2} />
      <FitText x={100} y={106} width={40} text="0,4 l" size={9} fill="#fff" weight={800} spacing={0.5} />
      <FitText x={100} y={146} width={50} text={brandLabel(product)} size={9} fill="#fff" spacing={1.2} />
      <Tag product={product} x={124} y={176} w={66} />
    </g>
  );
}

function GenericBox({ product, uid }: IllustrationProps) {
  const c = product.color;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-box`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(c, 0.15)} />
          <stop offset="1" stopColor={shade(c, -0.2)} />
        </linearGradient>
      </defs>
      <GroundShadow cx={100} cy={180} rx={70} ry={7} />
      <path d="M40 70 L100 50 L160 70 L100 90 Z" fill={shade(c, 0.3)} />
      <path d="M40 70 L100 90 L100 172 L40 152 Z" fill={`url(#${uid}-box)`} />
      <path d="M160 70 L100 90 L100 172 L160 152 Z" fill={shade(c, -0.3)} />
      <path d="M70 60 L130 80 L130 92" stroke={product.accent} strokeWidth={6} fill="none" opacity={0.9} />
      <FitText x={70} y={128} width={50} text={brandLabel(product)} size={8} fill={product.accent} spacing={0.6} />
      <FitText x={70} y={140} width={50} text={shortName(product).toUpperCase()} size={5.5} fill="#fff" weight={700} spacing={0.3} />
    </g>
  );
}

const RENTAL_MATCHERS: [RegExp, (p: IllustrationProps) => JSX.Element][] = [
  [/garnitur|bierbank|biertisch/i, Garnitur],
  [/stehtisch/i, Stehtisch],
  [/zapf|schank/i, Zapfanlage],
  [/kühlschrank|kuehlschrank/i, Kuehlschrank],
  [/anhänger|anhaenger/i, Anhaenger],
  [/maßkr|masskr|krüge/i, Masskruege],
  [/gläser|glaeser|glas/i, Weissbierglaeser],
  [/zelt|pavillon/i, Zelt],
  [/heiz|strahler|heizpilz/i, Heizstrahler],
  [/eis/i, Eis],
  [/becher/i, Becher],
];

/** Leihartikel & Sonstiges als Icon-Illustration */
export function RentalItem(props: IllustrationProps) {
  const text = `${props.product.id} ${props.product.name}`;
  const match = RENTAL_MATCHERS.find(([re]) => re.test(text));
  const Comp = match ? match[1] : GenericBox;
  return <Comp {...props} />;
}
