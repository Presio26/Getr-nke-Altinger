import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface QuantityStepperProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** bei Wert 1 statt Minus ein Papierkorb-Symbol (Entfernen) zeigen */
  removeAtMin?: boolean;
  /** Beschriftung für Screenreader, z. B. Produktname */
  label?: string;
  disabled?: boolean;
}

const SIZES = {
  sm: { wrap: 'h-9 rounded-xl', btn: 'w-9', input: 'w-9 text-sm', icon: 15 },
  md: { wrap: 'h-11 rounded-xl', btn: 'w-11', input: 'w-11 text-base', icon: 17 },
  lg: { wrap: 'h-13 rounded-2xl', btn: 'w-13', input: 'w-14 text-lg', icon: 20 },
} as const;

/** Mengenwahl [−] 3 [+]; die Zahl ist direkt editierbar (B2B-Schnellerfassung). */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  size = 'md',
  className,
  removeAtMin = false,
  label,
  disabled = false,
}: QuantityStepperProps) {
  const s = SIZES[size];
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(n)));
  const commit = (raw: string) => {
    const n = Number.parseInt(raw.replace(/\D/g, ''), 10);
    const next = Number.isFinite(n) ? clamp(n) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const showTrash = removeAtMin && value <= Math.max(min, 1);
  const DecIcon = showTrash ? Trash2 : Minus;
  const name = label ? ` – ${label}` : '';

  return (
    <div
      className={cn(
        'inline-flex select-none items-stretch overflow-hidden border border-slate-200 bg-white shadow-xs',
        s.wrap,
        disabled && 'opacity-50',
        className,
      )}
    >
      <button
        type="button"
        aria-label={showTrash ? `Entfernen${name}` : `Menge verringern${name}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={cn(
          'flex items-center justify-center text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent',
          showTrash && 'text-red-600 hover:bg-red-50',
          s.btn,
        )}
      >
        <DecIcon size={s.icon} aria-hidden />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Menge${name}`}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(clamp(value + 1));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(value - 1));
          }
        }}
        onFocus={(e) => e.target.select()}
        className={cn(
          'border-x border-slate-100 bg-transparent text-center font-semibold tabular-nums text-slate-900 focus:bg-brand-50/50 focus:outline-none',
          s.input,
        )}
      />
      <button
        type="button"
        aria-label={`Menge erhöhen${name}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={cn(
          'flex items-center justify-center text-brand-700 transition-colors hover:bg-brand-50 active:bg-brand-100 disabled:text-slate-300 disabled:hover:bg-transparent',
          s.btn,
        )}
      >
        <Plus size={s.icon} aria-hidden />
      </button>
    </div>
  );
}
