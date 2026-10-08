import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ChipOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** zweite Zeile, z. B. Uhrzeit oder Hinweis */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface ChipGroupProps<T extends string | number> {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: ChipOption<T>[];
  'aria-label': string;
  className?: string;
  /** gleich breite Chips im Raster */
  columns?: 2 | 3 | 4 | 6;
  size?: 'sm' | 'md';
}

const COLS = {
  2: 'grid grid-cols-2',
  3: 'grid grid-cols-3',
  4: 'grid grid-cols-2 sm:grid-cols-4',
  6: 'grid grid-cols-3 sm:grid-cols-6',
} as const;

/** Auswahl-Chips (Radio-Gruppe) – kompakt für Rhythmus, Wochentag, Lieferfenster, Zahlart */
export function ChipGroup<T extends string | number>({ value, onChange, options, className, columns, size = 'md', ...aria }: ChipGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={aria['aria-label']} className={cn(columns ? COLS[columns] : 'flex flex-wrap', 'gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-center font-semibold transition-[background-color,border-color,color,box-shadow] duration-150',
              size === 'sm' ? 'text-[13px]' : 'text-sm',
              o.hint ? 'flex-col gap-0 py-1.5' : '',
              active
                ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-[0_0_0_1px_var(--color-brand-600)]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              o.disabled && 'cursor-not-allowed opacity-45 hover:border-slate-200 hover:bg-white',
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.hint ? <span className={cn('truncate text-xs font-medium', active ? 'text-brand-700' : 'text-slate-500')}>{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
