import type { HTMLAttributes, KeyboardEvent, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { AlertTriangle, Check, TrendingDown, TrendingUp, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

// ───────────────────────────── StatCard ─────────────────────────────

export type StatTone = 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const STAT_TONE: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-100 text-accent-700',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  neutral: 'bg-slate-100 text-slate-600',
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Veränderung in Prozent (positiv = gut) */
  trend?: { value: number; label?: string };
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand', trend, className, onClick }: StatCardProps) {
  const up = (trend?.value ?? 0) >= 0;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex w-full flex-col rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-card sm:p-5',
        onClick && 'transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-raised',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {Icon ? (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', STAT_TONE[tone])}>
            <Icon size={18} aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-[1.7rem]">{value}</div>
      {trend || hint ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {trend ? (
            <span className={cn('inline-flex items-center gap-1 font-semibold', up ? 'text-emerald-600' : 'text-red-600')}>
              {up ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
              {up ? '+' : '−'}
              {Math.abs(Math.round(trend.value * 10) / 10).toLocaleString('de-DE')} %{trend.label ? <span className="font-normal text-slate-500"> {trend.label}</span> : null}
            </span>
          ) : null}
          {hint ? <span className="text-slate-500">{hint}</span> : null}
        </div>
      ) : null}
    </Wrapper>
  );
}

// ───────────────────────────── Avatar ─────────────────────────────

const AVATAR_COLORS = ['#1d58a0', '#0d9488', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0284c7', '#a16207'];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, '')
    .split(/[\s-]+/)
    .filter((p) => /^[\p{L}\d]/u.test(p) && !/^(GmbH|AG|KG|UG|e\.?V\.?|Zum|Zur|Der|Die|Das)$/i.test(p));
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? name).slice(0, 2);
  return letters.toUpperCase();
}

export interface AvatarProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_SIZE = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' } as const;

export function Avatar({ name, color, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ring-2 ring-white', AVATAR_SIZE[size], className)}
      style={{ backgroundColor: color ?? hashColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

// ───────────────────────────── Timeline ─────────────────────────────

export interface TimelineItem {
  title: ReactNode;
  description?: ReactNode;
  time?: ReactNode;
  state: 'done' | 'current' | 'upcoming' | 'error';
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <li key={i} className="relative flex gap-3.5 pb-5 last:pb-0" aria-current={item.state === 'current' ? 'step' : undefined}>
            {!last ? (
              <span
                aria-hidden
                className={cn('absolute left-[13px] top-7 bottom-0 w-0.5 rounded-full', item.state === 'done' ? 'bg-brand-600' : 'bg-slate-200')}
              />
            ) : null}
            <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center">
              {item.state === 'done' ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Check size={15} strokeWidth={3} aria-hidden />
                </span>
              ) : item.state === 'current' ? (
                <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-accent-100">
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent-400/40" />
                  <span className="h-3 w-3 rounded-full bg-accent-500 ring-4 ring-accent-200" />
                </span>
              ) : item.state === 'error' ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white">
                  <X size={15} strokeWidth={3} aria-hidden />
                </span>
              ) : (
                <span className="h-3 w-3 rounded-full border-2 border-slate-300 bg-white" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p
                  className={cn(
                    'text-[15px] font-semibold leading-snug',
                    item.state === 'upcoming' ? 'text-slate-400' : item.state === 'error' ? 'text-red-700' : 'text-slate-900',
                  )}
                >
                  {item.title}
                </p>
                {item.time ? <span className="text-xs font-medium tabular-nums text-slate-500">{item.time}</span> : null}
              </div>
              {item.description ? (
                <div className={cn('mt-0.5 text-sm leading-snug', item.state === 'upcoming' ? 'text-slate-400' : 'text-slate-500')}>
                  {item.description}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────────── KeyValue ─────────────────────────────

export interface KeyValueProps {
  items: [ReactNode, ReactNode][];
  className?: string;
}

export function KeyValue({ items, className }: KeyValueProps) {
  return (
    <dl className={cn('divide-y divide-slate-100 text-[15px]', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-slate-500">{k}</dt>
          <dd className="min-w-0 text-right font-medium text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────────────────────── Tabelle ─────────────────────────────

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-card">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500', className)} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-slate-100', className)} {...rest}>
      {children}
    </tbody>
  );
}

export interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  onClick?: () => void;
  /** hervorgehoben (z. B. ausgewählt) */
  selected?: boolean;
}

export function TR({ className, children, onClick, selected, ...rest }: TRProps) {
  const onKeyDown = onClick
    ? (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;
  return (
    <tr
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-slate-50 focus-visible:bg-brand-50/50 focus-visible:outline-none',
        selected && 'bg-brand-50/60',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('whitespace-nowrap px-4 py-3 font-semibold', className)} {...rest}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 align-middle text-slate-700', className)} {...rest}>
      {children}
    </td>
  );
}

/** Hinweisbox (Info/Warnung/Fehler/Erfolg) für Seiteninhalte */
export function Notice({
  tone = 'info',
  title,
  children,
  icon: Icon,
  className,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'brand';
  title?: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  action?: ReactNode;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 [--notice-icon:var(--color-sky-600)]',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 [--notice-icon:var(--color-amber-600)]',
    danger: 'border-red-200 bg-red-50 text-red-900 [--notice-icon:var(--color-red-600)]',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 [--notice-icon:var(--color-emerald-600)]',
    brand: 'border-brand-200 bg-brand-50 text-brand-900 [--notice-icon:var(--color-brand-600)]',
  } as const;
  const I = Icon ?? AlertTriangle;
  return (
    <div className={cn('flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <I size={20} aria-hidden className="mt-px shrink-0 text-[var(--notice-icon)]" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
