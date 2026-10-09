/**
 * Tagesauswahl: Heute / Morgen / Übermorgen als Schnellwahl plus Kalenderfeld.
 */
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayString } from '@shared/types';
import { addDays, todayString } from '@shared/time';
import { formatDate } from '@shared/format';
import { cn } from '@/lib/cn';
import { DAY_RE, dayOptions } from '../model';

export interface DayPickerProps {
  value: DayString;
  onChange: (day: DayString) => void;
  /** Anzahl Schnellwahl-Tage ab heute */
  quickDays?: number;
  className?: string;
  /** Pfeile für Vor/Zurück */
  arrows?: boolean;
  /** Umbruch erlauben (Default true); false = einzeilig, z. B. in einer scrollbaren Leiste */
  wrap?: boolean;
}

export function DayPicker({ value, onChange, quickDays = 3, className, arrows = true, wrap = true }: DayPickerProps) {
  const today = todayString();
  const options = dayOptions(today, quickDays);
  const inQuick = options.some((o) => o.value === value);
  return (
    <div className={cn('flex min-w-0 items-center gap-2', wrap ? 'flex-wrap' : 'flex-nowrap', className)}>
      {arrows ? (
        <button
          type="button"
          onClick={() => onChange(addDays(DAY_RE.test(value) ? value : today, -1))}
          aria-label="Vorheriger Tag"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
      ) : null}
      <div role="radiogroup" aria-label="Tag wählen" className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/60">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'h-8 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors',
                active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {arrows ? (
        <button
          type="button"
          onClick={() => onChange(addDays(DAY_RE.test(value) ? value : today, 1))}
          aria-label="Nächster Tag"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      ) : null}
      <label
        className={cn(
          'relative flex h-10 shrink-0 items-center gap-2 rounded-xl border bg-white pl-3 pr-2 text-sm shadow-xs',
          inQuick || !value ? 'border-slate-200 text-slate-600' : 'border-brand-300 text-brand-800 ring-2 ring-brand-500/15',
        )}
      >
        <CalendarDays size={16} aria-hidden className="shrink-0 text-slate-400" />
        <span className="sr-only">Datum</span>
        <input
          type="date"
          value={value}
          onChange={(e) => {
            if (DAY_RE.test(e.target.value)) onChange(e.target.value);
          }}
          className="h-full min-w-0 bg-transparent text-sm font-medium tabular-nums outline-none"
          aria-label={DAY_RE.test(value) ? `Datum, aktuell ${formatDate(value, 'long')}` : 'Datum wählen'}
        />
      </label>
    </div>
  );
}
