import { useId } from 'react';
import { cn } from '@/lib/cn';
import { BRAND_COLORS, signetGlyph } from './signet';

export interface LogoProps {
  /** full = Signet + Wortmarke, mark = nur Signet, white = für dunkle Hintergründe */
  variant?: 'full' | 'mark' | 'white';
  /** Größe über die Höhe steuern, z. B. "h-10" (Default h-9) */
  className?: string;
  /** Unterzeile "Getränke · Garching" ausblenden */
  compact?: boolean;
}

/** Eigenes Wortmarken-Logo "ALTINGER" mit Signet (Getränkekasten mit Flaschen). */
export function Logo({ variant = 'full', className, compact = false }: LogoProps) {
  const rawId = useId();
  const gid = `logo-g-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const white = variant === 'white';
  const glyph = signetGlyph(white ? { glass: '#cfe0f6', crate: '#ffffff', slot: BRAND_COLORS.navy } : {});

  const signet = (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={white ? '#2a6bbb' : BRAND_COLORS.blue} />
          <stop offset="1" stopColor={white ? BRAND_COLORS.blueDark : BRAND_COLORS.navy} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      {white ? <rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="1.5" /> : null}
      <g dangerouslySetInnerHTML={{ __html: glyph }} />
    </>
  );

  if (variant === 'mark') {
    return (
      <svg viewBox="0 0 64 64" role="img" aria-label="Getränke Altinger" className={cn('h-9 w-auto shrink-0', className)}>
        {signet}
      </svg>
    );
  }

  return (
    <svg
      viewBox={compact ? '0 0 232 64' : '0 0 236 64'}
      role="img"
      aria-label="Getränke Altinger, Garching"
      className={cn('h-9 w-auto shrink-0', className)}
    >
      {signet}
      <text
        x="77"
        y={compact ? 43 : 37}
        textLength="154"
        lengthAdjust="spacingAndGlyphs"
        fontSize="31"
        fontWeight="800"
        letterSpacing="1.5"
        fill={white ? '#ffffff' : BRAND_COLORS.navy}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        ALTINGER
      </text>
      {!compact ? (
        <text
          x="78"
          y="54.5"
          textLength="152"
          lengthAdjust="spacingAndGlyphs"
          fontSize="10.5"
          fontWeight="700"
          letterSpacing="2.6"
          fill={white ? '#fcd34d' : '#b77700'}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          GETRÄNKE · GARCHING
        </text>
      ) : null}
    </svg>
  );
}
