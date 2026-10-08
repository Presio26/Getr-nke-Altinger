import { brandLabel, capColor, FitText, glassFor, GroundShadow, shortName, type Glass, type IllustrationProps } from './common';
import { isLight, mix, shade } from './color';

const CRATE_TOP = 96;

/** Hals + Schulter einer Flasche, die aus dem Kasten ragt (unterer Teil verdeckt) */
export function BottleTop({
  cx,
  top,
  scale = 1,
  glass,
  cap,
  neckLabel,
  pet = false,
  dim = 0,
  uid,
}: {
  cx: number;
  top: number;
  scale?: number;
  glass: Glass;
  cap: string;
  neckLabel?: string;
  pet?: boolean;
  dim?: number;
  uid: string;
}) {
  const neck = (pet ? 6.2 : 5.4) * scale;
  const body = (pet ? 14 : 12) * scale;
  const shoulderY = top + (pet ? 15 : 24) * scale;
  const bottom = CRATE_TOP + 12;
  const bodyColor = dim ? shade(glass.body, -dim) : glass.body;
  const d = [
    `M${cx - neck} ${top + 6}`,
    `L${cx - neck} ${shoulderY}`,
    `C${cx - neck} ${shoulderY + 8 * scale} ${cx - body} ${shoulderY + 9 * scale} ${cx - body} ${shoulderY + 19 * scale}`,
    `L${cx - body} ${bottom}`,
    `L${cx + body} ${bottom}`,
    `L${cx + body} ${shoulderY + 19 * scale}`,
    `C${cx + body} ${shoulderY + 9 * scale} ${cx + neck} ${shoulderY + 8 * scale} ${cx + neck} ${shoulderY}`,
    `L${cx + neck} ${top + 6}`,
    'Z',
  ].join(' ');
  const capW = (pet ? 15 : 14) * scale;
  const capH = (pet ? 9 : 7) * scale;
  const capFill = dim ? shade(cap, -dim * 0.8) : cap;
  return (
    <g>
      <path d={d} fill={glass.clear ? `url(#${uid}-clear)` : bodyColor} stroke={glass.clear ? shade(glass.edge, -dim) : 'none'} strokeWidth={glass.clear ? 1 : 0} />
      {/* Flüssigkeit in klaren Flaschen */}
      {glass.clear ? (
        <path
          d={`M${cx - body + 1.5} ${shoulderY + 22 * scale} L${cx - body + 1.5} ${bottom} L${cx + body - 1.5} ${bottom} L${cx + body - 1.5} ${shoulderY + 22 * scale} Z`}
          fill={glass.liquid}
          opacity={0.75 - dim * 0.5}
        />
      ) : null}
      {/* PET-Rillen */}
      {pet ? (
        <>
          <path d={`M${cx - neck} ${top + 11 * scale} h${neck * 2}`} stroke={shade(glass.edge, 0.2)} strokeWidth={1.2} opacity={0.6} />
          <path d={`M${cx - neck} ${top + 13.5 * scale} h${neck * 2}`} stroke={shade(glass.edge, 0.2)} strokeWidth={1} opacity={0.5} />
        </>
      ) : null}
      {/* Glanzlicht */}
      <path
        d={`M${cx - neck + 1.8 * scale} ${top + 9 * scale} L${cx - neck + 1.8 * scale} ${shoulderY + 2} Q${cx - body + 3} ${shoulderY + 12 * scale} ${cx - body + 3.2} ${shoulderY + 24 * scale}`}
        stroke={glass.shine}
        strokeWidth={1.8 * scale}
        strokeLinecap="round"
        fill="none"
        opacity={0.45 - dim * 0.3}
      />
      {/* Halsetikett */}
      {neckLabel ? (
        <rect x={cx - neck - 0.6} y={shoulderY - 9 * scale} width={neck * 2 + 1.2} height={8 * scale} rx={1.2} fill={dim ? shade(neckLabel, -dim) : neckLabel} />
      ) : null}
      {/* Mündung + Verschluss */}
      {!pet ? <rect x={cx - neck - 0.8} y={top + 5} width={neck * 2 + 1.6} height={3 * scale} rx={1} fill={shade(bodyColor, -0.25)} /> : null}
      <rect x={cx - capW / 2} y={top} width={capW} height={capH} rx={pet ? 2.5 : 2} fill={capFill} />
      {pet ? (
        <path
          d={Array.from({ length: 5 }, (_, i) => `M${cx - capW / 2 + 2.5 + i * ((capW - 5) / 4)} ${top + 1.5} v${capH - 3}`).join(' ')}
          stroke={shade(capFill, -0.3)}
          strokeWidth={1}
          opacity={0.6}
        />
      ) : (
        <>
          <rect x={cx - capW / 2} y={top + capH - 2} width={capW} height={2} rx={1} fill={shade(capFill, -0.3)} opacity={0.7} />
          <rect x={cx - capW / 2 + 2} y={top + 1.2} width={capW - 7} height={1.6} rx={0.8} fill="#fff" opacity={0.45} />
        </>
      )}
    </g>
  );
}

/** Getränkekasten frontal mit Flaschenhälsen (Anzahl je unitCount, Glasfarbe je Produkt) */
export function Crate({ product, uid }: IllustrationProps) {
  const glass = glassFor(product);
  const pet = product.material === 'pet';
  const cap = pet ? product.accent : capColor(product);
  const units = product.unitCount;
  const perRow = units >= 24 ? 6 : units >= 20 ? 5 : units >= 12 ? 4 : 3;
  const vol = product.unitVolumeL;
  // Flaschenhöhe nach Volumen
  const top = vol >= 1 ? 26 : vol >= 0.7 ? 34 : vol >= 0.5 ? 44 : 56;
  const span = 156;
  const left = 22;
  const step = span / perRow;
  const scale = Math.min(1.35, Math.max(0.9, step / 32)) * (vol >= 0.7 ? 1.08 : 1);
  const front = Array.from({ length: perRow }, (_, i) => left + step * (i + 0.5));
  const back = Array.from({ length: perRow }, (_, i) => left + step * (i + 0.5) + step / 2).filter((x) => x < left + span - 4);
  const neckLabel = product.categoryId === 'bier' || product.categoryId === 'alkoholfrei' ? product.accent : undefined;

  const c = product.color;
  const light = shade(c, 0.12);
  const dark = shade(c, -0.28);
  const darker = shade(c, -0.5);
  const band = product.accent;
  const bandText = isLight(band) ? shade(c, -0.15) : '#ffffff';
  const name = shortName(product);

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-clear`} x1="0" x2="1">
          <stop offset="0" stopColor={mix(glass.body, '#ffffff', 0.25)} stopOpacity="0.95" />
          <stop offset="0.5" stopColor={glass.body} stopOpacity="0.75" />
          <stop offset="1" stopColor={mix(glass.body, '#94a3b8', 0.35)} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`${uid}-crate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={c} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.18" />
          <stop offset="0.12" stopColor="#000" stopOpacity="0" />
          <stop offset="0.88" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      <GroundShadow cx={100} cy={185} rx={86} ry={7} />

      {/* hintere Flaschenreihe */}
      {back.map((x) => (
        <BottleTop key={`b${x}`} cx={x} top={top - 9} scale={scale * 0.94} glass={glass} cap={cap} pet={pet} dim={0.28} uid={uid} neckLabel={neckLabel} />
      ))}
      {/* Innenraum-Schatten über der hinteren Reihe */}
      <rect x={18} y={CRATE_TOP - 6} width={164} height={10} fill={darker} opacity={0.25} />
      {/* vordere Flaschenreihe */}
      {front.map((x) => (
        <BottleTop key={`f${x}`} cx={x} top={top} scale={scale} glass={glass} cap={cap} pet={pet} uid={uid} neckLabel={neckLabel} />
      ))}

      {/* Kasten */}
      <path d={`M16 ${CRATE_TOP + 2} q0 -6 6 -6 h156 q6 0 6 6 v74 q0 9 -9 9 h-150 q-9 0 -9 -9 z`} fill={`url(#${uid}-crate)`} />
      <path d={`M16 ${CRATE_TOP + 2} q0 -6 6 -6 h156 q6 0 6 6 v74 q0 9 -9 9 h-150 q-9 0 -9 -9 z`} fill={`url(#${uid}-sheen)`} />
      {/* Oberkante */}
      <rect x={14} y={CRATE_TOP - 5} width={172} height={9} rx={4} fill={light} />
      <rect x={14} y={CRATE_TOP + 2} width={172} height={2.5} fill={darker} opacity={0.35} />
      {/* Griffmulde */}
      <rect x={74} y={CRATE_TOP + 11} width={52} height={13} rx={6.5} fill={darker} />
      <rect x={76} y={CRATE_TOP + 20} width={48} height={3} rx={1.5} fill="#000" opacity={0.25} />
      {/* Eckpfosten */}
      <rect x={20} y={CRATE_TOP + 6} width={7} height={70} rx={3} fill={shade(c, -0.1)} opacity={0.75} />
      <rect x={173} y={CRATE_TOP + 6} width={7} height={70} rx={3} fill={shade(c, -0.1)} opacity={0.75} />
      {/* Etikett-Textband */}
      <rect x={34} y={CRATE_TOP + 32} width={132} height={28} rx={6} fill={band} />
      <rect x={34} y={CRATE_TOP + 32} width={132} height={4} rx={2} fill="#fff" opacity={0.2} />
      <FitText x={100} y={CRATE_TOP + 51} width={118} text={brandLabel(product)} size={14} fill={bandText} spacing={1.4} />
      {/* Sorte */}
      <FitText x={100} y={CRATE_TOP + 73} width={120} text={name.toUpperCase()} size={8.5} fill={isLight(c) ? shade(c, -0.6) : '#ffffff'} weight={700} spacing={1.2} opacity={0.85} />
      {/* Fuß */}
      <rect x={22} y={CRATE_TOP + 80} width={156} height={7} rx={3.5} fill={darker} opacity={0.55} />
    </g>
  );
}
