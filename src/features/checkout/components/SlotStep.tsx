import { useMemo, useRef } from 'react';
import { CalendarClock, CalendarX2, Clock, Info } from 'lucide-react';
import type { FulfillmentType, StoreSettings, TimeSlot } from '@shared/types';
import { formatDate, formatSlot, WEEKDAY_SHORT } from '@shared/format';
import { addDays, todayString, weekdayOf } from '@shared/time';
import { Button, ErrorState, Notice, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface SlotStepProps {
  type: FulfillmentType;
  slots: TimeSlot[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** angezeigter Tag */
  day: string;
  onDay: (day: string) => void;
  value: string | undefined;
  onChange: (slotId: string) => void;
  settings: StoreSettings;
  /** Fehlermeldung (z. B. kein Fenster gewählt) */
  error2?: string | null;
  /** Hinweis (z. B. Fenster ist inzwischen ausgebucht) */
  notice?: string | null;
  /** automatisch vorgemerktes Fenster erklären (z. B. „Heute ist keine Lieferung mehr möglich …“) */
  suggestion?: string | null;
}

export const SLOT_DAYS = 7;

interface DayInfo {
  day: string;
  slots: TimeSlot[];
  free: number;
  label: string;
  date: string;
}

export function buildDays(slots: TimeSlot[] | undefined, now = new Date()): DayInfo[] {
  const today = todayString(now);
  return Array.from({ length: SLOT_DAYS }, (_, i) => {
    const day = addDays(today, i);
    const list = (slots ?? []).filter((s) => s.date === day);
    return {
      day,
      slots: list,
      free: list.filter((s) => s.available).length,
      label: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : WEEKDAY_SHORT[weekdayOf(day)],
      date: formatDate(day, 'short').slice(0, 6),
    };
  });
}

/** Erster Tag mit freiem Fenster */
export function firstAvailableDay(slots: TimeSlot[] | undefined): string | undefined {
  return slots?.find((s) => s.available)?.date;
}

function SlotButton({ slot, selected, onSelect }: { slot: TimeSlot; selected: boolean; onSelect: () => void }) {
  const left = Math.max(0, slot.capacity - slot.booked);
  const few = slot.available && left <= 2;
  const reason = slot.reason === 'Ausgebucht' ? 'Ausgebucht' : slot.reason ? 'Bestellschluss' : null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!slot.available}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-[4.25rem] flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        selected
          ? 'border-brand-600 bg-brand-700 text-white shadow-[0_0_0_1px_var(--color-brand-600)]'
          : slot.available
            ? 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/50'
            : 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400',
      )}
    >
      <span className={cn('text-[15px] font-bold tabular-nums', !slot.available && !selected && 'line-through decoration-slate-300')}>
        {slot.start} – {slot.end}
      </span>
      <span
        className={cn(
          'mt-0.5 text-[13px] font-medium',
          selected ? 'text-white/80' : !slot.available ? (reason === 'Ausgebucht' ? 'text-red-500' : 'text-slate-400') : few ? 'text-amber-700' : 'text-emerald-700',
        )}
      >
        {!slot.available ? reason : few ? `Nur noch ${left} frei` : `${left} Plätze frei`}
      </span>
    </button>
  );
}

/** Zeitfenster: Tage als Reiter (heute … +6), Fenster als Raster */
export function SlotStep({ type, slots, loading, error, onRetry, day, onDay, value, onChange, settings, error2, notice, suggestion }: SlotStepProps) {
  const days = useMemo(() => buildDays(slots), [slots]);
  const current = days.find((d) => d.day === day) ?? days[0];
  const tabsRef = useRef<HTMLDivElement>(null);
  const selected = slots?.find((s) => s.id === value);
  const cutoff = type === 'pickup' ? (settings.pickupCutoffMinutes ?? 30) : settings.orderCutoffMinutes;
  const templatesExist = (d: string) => (type === 'pickup' ? settings.pickupSlots : settings.deliverySlots).some((t) => t.weekday === weekdayOf(d));

  if (error) return <ErrorState error={error} onRetry={onRetry} className="py-6" />;

  return (
    <div>
      {notice ? (
        <Notice tone="warning" className="mb-4" title="Bitte wählen Sie ein neues Zeitfenster">
          {notice}
        </Notice>
      ) : null}
      {suggestion && !notice ? (
        <Notice tone="info" icon={CalendarClock} className="mb-4" title={suggestion}>
          Wir haben diesen Termin für Sie vorgemerkt – Sie können gern ein anderes Fenster wählen.
        </Notice>
      ) : null}

      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Tag wählen"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const i = days.findIndex((d) => d.day === current.day);
          const next = days[(i + (e.key === 'ArrowRight' ? 1 : days.length - 1)) % days.length];
          onDay(next.day);
          tabsRef.current?.querySelector<HTMLElement>(`[data-day="${next.day}"]`)?.focus();
        }}
      >
        {days.map((d) => {
          const active = d.day === current.day;
          const closed = !d.slots.length;
          const hasSelected = !!selected && selected.date === d.day;
          return (
            <button
              key={d.day}
              type="button"
              role="tab"
              data-day={d.day}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onDay(d.day)}
              className={cn(
                'relative flex min-w-[4.6rem] shrink-0 snap-start flex-col items-center rounded-xl border px-2 py-2 transition-colors sm:min-w-0',
                active ? 'border-brand-700 bg-brand-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {hasSelected && !active ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600" aria-hidden /> : null}
              <span className="text-[13px] font-bold">{d.label}</span>
              <span className={cn('text-xs tabular-nums', active ? 'text-white/80' : 'text-slate-500')}>{d.date}</span>
              <span
                className={cn(
                  'mt-1 text-[11px] font-semibold',
                  active ? 'text-white' : closed || !d.free ? 'text-slate-400' : 'text-emerald-700',
                )}
              >
                {loading
                  ? '…'
                  : closed
                    ? templatesExist(d.day)
                      ? 'vorbei'
                      : 'geschlossen'
                    : d.free
                      ? `${d.free} frei`
                      : d.slots.some((s) => s.reason === 'Ausgebucht')
                        ? 'ausgebucht'
                        : 'vorbei'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4" role="radiogroup" aria-label={`Zeitfenster am ${formatDate(current.day, 'long')}`}>
        {loading ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[4.25rem] rounded-xl" />
            ))}
          </div>
        ) : current.slots.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {current.slots.map((s) => (
              <SlotButton key={s.id} slot={s} selected={s.id === value} onSelect={() => onChange(s.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
            <CalendarX2 size={26} aria-hidden className="text-slate-400" />
            <p className="mt-2 font-semibold text-slate-800">
              {templatesExist(current.day)
                ? `${current.label === 'Heute' ? 'Heute' : formatDate(current.day, 'weekday')} sind keine Zeitfenster mehr frei`
                : weekdayOf(current.day) === 0
                  ? 'Sonntags ist unser Markt geschlossen'
                  : type === 'pickup'
                    ? 'An diesem Tag ist keine Abholung möglich'
                    : 'An diesem Tag liefern wir nicht'}
            </p>
            {days.some((d) => d.free) ? (
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  const next = days.find((d) => d.free && d.day > current.day) ?? days.find((d) => d.free);
                  if (next) onDay(next.day);
                }}
              >
                Nächsten freien Tag zeigen
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {error2 ? (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error2}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        {selected ? (
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Clock size={16} aria-hidden className="text-brand-700" />
            {type === 'pickup' ? 'Abholung' : 'Lieferung'} {formatSlot(selected)}
          </p>
        ) : (
          <span />
        )}
        <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
          <Info size={14} aria-hidden className="shrink-0" />
          Bestellschluss {cutoff} Min. vor Fensterbeginn
          {type === 'pickup' ? ` · Reservierung ${settings.pickupHoldHours} Std.` : ''}
        </p>
      </div>
    </div>
  );
}
