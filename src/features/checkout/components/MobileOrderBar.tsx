import { Lock } from 'lucide-react';
import { formatEuro } from '@shared/format';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface MobileOrderBarProps {
  total: number | undefined;
  hidden: boolean;
  placing: boolean;
  onPlace: () => void;
  hint?: string;
  /** Leiste schon ab dieser Breite ausblenden (z. B. 'md', wenn die Zusammenfassung daneben steht) */
  hideFrom?: 'md' | 'lg';
}

/**
 * Bestellleiste auf dem Handy – bündig über der Tab-Leiste angedockt (StickyActionBar).
 * Betrag und Bezeichnung links (zweizeilig, nie gekürzt), Bestell-Button rechts flexibel.
 * `hidden`: solange der Bestell-Button der Zusammenfassung sichtbar ist, wird die Leiste nicht gebraucht.
 */
export function MobileOrderBar({ total, hidden, placing, onPlace, hint, hideFrom = 'lg' }: MobileOrderBarProps) {
  const payout = total !== undefined && total < 0;
  // ausgeblendet (Bestell-Button der Zusammenfassung ist sichtbar): Leiste ganz entfernen, damit
  // --sticky-bar-h wieder 0 ist und Footer/Demo-Pille nicht unnötig ausweichen
  if (hidden) return null;
  return (
    <StickyActionBar className={cn('animate-fade-in', hideFrom === 'md' && 'md:hidden')}>
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
            {payout ? 'Auszahlung' : 'Gesamt'}
            {hint ? <span className="font-medium normal-case tracking-normal"> · {hint}</span> : null}
          </p>
          <p className="whitespace-nowrap text-lg font-bold leading-tight tabular-nums text-slate-900" aria-live="polite">
            {total === undefined ? '…' : formatEuro(Math.abs(total))}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <Button
            icon={Lock}
            loading={placing}
            onClick={onPlace}
            block
            className="h-12 px-3 max-[359px]:[&>svg]:hidden"
          >
            <span className="block whitespace-normal text-center text-[15px] leading-tight">Zahlungspflichtig bestellen</span>
          </Button>
        </div>
      </div>
    </StickyActionBar>
  );
}
