/**
 * Kleine Bausteine rund um Bestellungen (Lieferart-Symbol, B2B-Kennzeichen, Gebinde, Auslastung).
 */
import type { ReactNode } from 'react';
import { Building2, Package, ShoppingBag, Truck } from 'lucide-react';
import type { CustomerType, FulfillmentType } from '@shared/types';
import { cn } from '@/lib/cn';
import { loadPercent } from '../model';

export function FulfillmentIcon({ type, size = 'md', className }: { type: FulfillmentType; size?: 'sm' | 'md'; className?: string }) {
  const Icon = type === 'delivery' ? Truck : ShoppingBag;
  return (
    <span
      title={type === 'delivery' ? 'Lieferung' : 'Abholung im Markt'}
      aria-label={type === 'delivery' ? 'Lieferung' : 'Abholung'}
      role="img"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        type === 'delivery' ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700',
        className,
      )}
    >
      <Icon size={size === 'sm' ? 14 : 16} aria-hidden />
    </span>
  );
}

/** Kompaktes Kennzeichen für Geschäftskunden */
export function B2BTag({ type, className }: { type: CustomerType; className?: string }) {
  if (type !== 'b2b') return null;
  return (
    <span
      title="Geschäftskunde"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-md bg-brand-700 px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide text-white',
        className,
      )}
    >
      <Building2 size={10} aria-hidden />
      B2B
    </span>
  );
}

export function CratesPill({ crates, className }: { crates: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums text-slate-600', className)} title={`${crates} Gebinde`}>
      <Package size={13} aria-hidden className="text-slate-400" />
      {crates} Geb.
    </span>
  );
}

/** Auslastungsbalken: Gebinde gegen Fahrzeugkapazität */
export function CapacityBar({ crates, capacity, className, label }: { crates: number; capacity: number; className?: string; label?: ReactNode }) {
  const pct = loadPercent(crates, capacity);
  const over = pct > 100;
  const high = pct >= 85;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-500">{label ?? 'Auslastung'}</span>
        <span className={cn('font-semibold tabular-nums', over ? 'text-red-600' : high ? 'text-amber-700' : 'text-slate-700')}>
          {crates} / {capacity} Gebinde · {pct} %
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={crates}
        aria-label="Auslastung des Fahrzeugs"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', over ? 'bg-red-500' : high ? 'bg-amber-500' : 'bg-brand-600')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {over ? <p className="mt-1 text-xs font-medium text-red-600">Überladen – bitte Aufträge auf eine weitere Tour verteilen.</p> : null}
    </div>
  );
}

/** Fortschrittsbalken (z. B. erledigte Stopps) */
export function ProgressBar({ value, max, color, className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/** Kennzahl in kleinen Kacheln (z. B. Tour-Kopf) */
export function MiniStat({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

/** "Live"-Punkt */
export function LiveDot({ className, tone = 'success' }: { className?: string; tone?: 'success' | 'accent' }) {
  const color = tone === 'success' ? 'bg-emerald-500' : 'bg-accent-500';
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)} aria-hidden>
      <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', color)} />
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', color)} />
    </span>
  );
}
