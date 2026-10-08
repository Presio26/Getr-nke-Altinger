/**
 * Kleine UI-Bausteine der Markt-Stammdaten-Seiten (bauen auf dem UI-Kit auf).
 */
import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input, Skeleton, TH, type InputProps } from '@/components/ui';
import { HEX_RE, type SortDir, type StockLevel } from './lib';

// ───────────────────────────── Suche ─────────────────────────────

export function SearchField({
  value,
  onChange,
  placeholder = 'Suchen …',
  className,
  label = 'Suche',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}) {
  return (
    <Input
      type="search"
      icon={Search}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      containerClassName={className}
      enterKeyHint="search"
      suffix={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Suche leeren"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} aria-hidden />
          </button>
        ) : undefined
      }
    />
  );
}

// ───────────────────────────── Filter-Chip ─────────────────────────────

const CHIP_TONE = {
  brand: 'border-brand-600 bg-brand-50 text-brand-800',
  warning: 'border-amber-400 bg-amber-50 text-amber-900',
  accent: 'border-accent-500 bg-accent-50 text-accent-900',
  neutral: 'border-slate-500 bg-slate-100 text-slate-900',
} as const;

export function FilterChip({
  active,
  onClick,
  children,
  count,
  icon: Icon,
  tone = 'brand',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  icon?: LucideIcon;
  tone?: keyof typeof CHIP_TONE;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition-colors after:absolute after:-inset-1 after:content-['']",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        active ? CHIP_TONE[tone] : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
      )}
    >
      {Icon ? <Icon size={15} aria-hidden /> : null}
      {children}
      {count !== undefined ? (
        <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums', active ? 'bg-white/80' : 'bg-slate-100')}>{count}</span>
      ) : null}
    </button>
  );
}

// ───────────────────────────── Sortierbare Spalte ─────────────────────────────

export function SortTH<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  label: ReactNode;
  sortKey: K;
  sort: { key: K; dir: SortDir };
  onSort: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TH className={cn(align === 'right' && 'text-right', className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md uppercase tracking-wide transition-colors hover:text-slate-900',
          active && 'text-slate-900',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        <Icon size={13} aria-hidden className={cn(!active && 'opacity-40')} />
      </button>
    </TH>
  );
}

// ───────────────────────────── Bestands-Ampel ─────────────────────────────

const LIGHT: Record<StockLevel, { dot: string; text: string; label: string }> = {
  empty: { dot: 'bg-red-500 ring-red-100', text: 'text-red-700', label: 'Ausverkauft' },
  critical: { dot: 'bg-red-500 ring-red-100', text: 'text-red-700', label: 'Kritisch' },
  low: { dot: 'bg-amber-400 ring-amber-100', text: 'text-amber-800', label: 'Unter Meldebestand' },
  ok: { dot: 'bg-emerald-500 ring-emerald-100', text: 'text-emerald-700', label: 'Ausreichend' },
  rental: { dot: 'bg-sky-500 ring-sky-100', text: 'text-sky-700', label: 'Leihartikel' },
};

export function StockDot({ level, className }: { level: StockLevel; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4', LIGHT[level].dot, className)} />;
}

export function stockLabel(level: StockLevel): string {
  return LIGHT[level].label;
}

export function stockTextClass(level: StockLevel): string {
  return LIGHT[level].text;
}

// ───────────────────────────── Eingaben ─────────────────────────────

/** Euro-Eingabe als Text ("12,99") mit €-Suffix */
export function EuroField(props: Omit<InputProps, 'suffix' | 'inputMode'>) {
  return <Input inputMode="decimal" autoComplete="off" suffix="€" {...props} />;
}

/** Farbe: Farbwähler + Hex-Eingabe */
export function ColorField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  const valid = HEX_RE.test(value);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="relative h-11 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-300 shadow-xs">
          <input
            type="color"
            aria-label={typeof label === 'string' ? `${label} wählen` : 'Farbe wählen'}
            value={valid ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer border-0 p-0"
          />
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          className={cn('font-mono uppercase', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15')}
          containerClassName="flex-1"
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? <p className="mt-1.5 text-sm font-medium text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

// ───────────────────────────── Ladeplatzhalter ─────────────────────────────

export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card', className)} aria-busy aria-label="Wird geladen">
      <div className="h-11 border-b border-slate-200 bg-slate-50/80" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="hidden h-3.5 w-20 sm:block" />
          <Skeleton className="hidden h-3.5 w-16 md:block" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card sm:p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── Abschnitt in einer Karte ─────────────────────────────

export function FormSection({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-2xl border border-slate-200/70 bg-white shadow-card', className)}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-3 border-b border-slate-100 px-4 py-4 sm:flex-nowrap sm:px-6">
        {Icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Icon size={20} aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 self-center">
          <h2 className="text-base font-semibold leading-snug text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className={cn('w-full sm:w-auto sm:shrink-0 sm:self-center', Icon && 'max-sm:pl-[3.25rem]')}>{action}</div> : null}
      </header>
      <div className="px-4 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** Hinweiszeile unter Tabellen (Anzahl, Summen) */
export function TableFootnote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-3 px-1 text-sm text-slate-500', className)}>{children}</p>;
}

// ───────────────────────────── Hinweis-Banner (klickbar) ─────────────────────────────

const BANNER_TONE = {
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100/70', icon: 'text-amber-600', cta: 'text-amber-800' },
  danger: { box: 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100/70', icon: 'text-red-600', cta: 'text-red-800' },
  brand: { box: 'border-brand-200 bg-brand-50 text-brand-900 hover:bg-brand-100/70', icon: 'text-brand-600', cta: 'text-brand-800' },
} as const;

export function AlertBanner({
  icon: Icon,
  title,
  children,
  cta,
  onClick,
  tone = 'warning',
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  cta?: string;
  onClick: () => void;
  tone?: keyof typeof BANNER_TONE;
  className?: string;
}) {
  const t = BANNER_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors', t.box, className)}
    >
      <Icon size={18} aria-hidden className={cn('shrink-0', t.icon)} />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">{title}</strong>
        {children ? <span> {children}</span> : null}
      </span>
      {cta ? <span className={cn('hidden shrink-0 font-semibold sm:inline', t.cta)}>{cta}</span> : null}
      <ChevronRight size={18} aria-hidden className={cn('shrink-0', t.cta)} />
    </button>
  );
}

// ───────────────────────────── Uhrzeit (24 h, unabhängig von der Browser-Sprache) ─────────────────────────────

/** "8" → "08:00", "830" → "08:30", "1430" → "14:30", "8:3" → "08:30"; ungültig → Eingabe unverändert */
export function normalizeTime(input: string): string {
  const s = input.trim().replace(/[.,h]/g, ':');
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2].padEnd(2, '0'));
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, s.length - 2));
    m = Number(s.slice(-2));
  } else return input;
  if (h > 23 || m > 59) return input;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimeField({ value, onChange, className, invalid, ...rest }: Omit<InputProps, 'value' | 'onChange' | 'type'> & { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      maxLength={5}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d:.,]/g, ''))}
      onBlur={(e) => onChange(normalizeTime(e.target.value))}
      aria-invalid={invalid ? true : undefined}
      className={cn('text-center tabular-nums', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/15', className)}
      {...rest}
    />
  );
}
