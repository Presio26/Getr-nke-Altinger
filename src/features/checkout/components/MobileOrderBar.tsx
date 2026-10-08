import { Lock } from 'lucide-react';
import { formatEuro } from '@shared/format';
import { useUi } from '@/stores/ui';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface MobileOrderBarProps {
  total: number | undefined;
  hidden: boolean;
  placing: boolean;
  onPlace: () => void;
  hint?: string;
}

/**
 * Schwebende Bestellleiste auf dem Handy (über der Tab-Leiste).
 * Ist die Demo-Pille sichtbar, schwebt die Leiste darüber, damit nichts verdeckt wird.
 */
export function MobileOrderBar({ total, hidden, placing, onPlace, hint }: MobileOrderBarProps) {
  const demoPill = useUi((s) => s.demoBarVisible);
  return (
    <div
      className={cn(
        'fixed inset-x-3 z-30 transition-[transform,opacity] duration-200 lg:hidden',
        demoPill ? 'bottom-[calc(env(safe-area-inset-bottom)+8rem)]' : 'bottom-tabbar',
        hidden ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100',
      )}
      aria-hidden={hidden || undefined}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-2.5 pl-4 shadow-pop backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{total !== undefined && total < 0 ? 'Auszahlung' : 'Gesamt'}</p>
          <p className="truncate text-lg font-bold leading-tight tabular-nums text-slate-900">{total === undefined ? '…' : formatEuro(Math.abs(total))}</p>
          {hint ? <p className="truncate text-[11px] leading-tight text-slate-500">{hint}</p> : null}
        </div>
        <Button icon={Lock} loading={placing} onClick={onPlace} tabIndex={hidden ? -1 : undefined} className="h-12 px-4">
          Zahlungspflichtig bestellen
        </Button>
      </div>
    </div>
  );
}
