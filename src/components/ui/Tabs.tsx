import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
  icon?: LucideIcon;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}

function useArrowKeys(ids: string[], value: string, onChange: (id: string) => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = Math.max(0, ids.indexOf(value));
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % ids.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + ids.length) % ids.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = ids.length - 1;
    onChange(ids[next]);
    const el = e.currentTarget.querySelector<HTMLElement>(`[data-id="${CSS.escape(ids[next])}"]`);
    el?.focus();
  };
}

/** Reiter mit Unterstrich (Inhalt rendert der Aufrufer passend zu `value`) */
export function Tabs({ tabs, value, onChange, className, ...aria }: TabsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useArrowKeys(
    tabs.map((t) => t.id),
    value,
    onChange,
  );
  return (
    <div className={cn('relative border-b border-slate-200', className)}>
      <div
        ref={ref}
        role="tablist"
        aria-label={aria['aria-label']}
        onKeyDown={onKeyDown}
        className="-mb-px flex gap-1 overflow-x-auto scrollbar-none"
      >
        {tabs.map((t) => {
          const active = t.id === value;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-id={t.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors',
                active ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
              )}
            >
              {Icon ? <Icon size={17} aria-hidden /> : null}
              <span className="whitespace-nowrap">{t.label}</span>
              {t.count !== undefined ? (
                <span
                  className={cn(
                    'min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums',
                    active ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface SegmentedControlProps {
  options: { value: string; label: ReactNode; icon?: LucideIcon }[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** volle Breite, Segmente gleich breit */
  block?: boolean;
  'aria-label'?: string;
}

/** Umschalter im iOS-Stil (z. B. Lieferung | Abholung, Liste | Karte) */
export function SegmentedControl({ options, value, onChange, size = 'md', className, block = false, ...aria }: SegmentedControlProps) {
  const onKeyDown = useArrowKeys(
    options.map((o) => o.value),
    value,
    onChange,
  );
  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      onKeyDown={onKeyDown}
      className={cn('inline-flex rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/60', block && 'flex w-full', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-id={o.value}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
              block && 'flex-1',
              active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {Icon ? <Icon size={size === 'sm' ? 15 : 17} aria-hidden /> : null}
            <span className="whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
