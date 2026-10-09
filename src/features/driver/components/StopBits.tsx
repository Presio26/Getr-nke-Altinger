/**
 * Kleine Bausteine der Fahrer-App: Stopp-Nummer, Fortschrittsbalken, Zahlungs- und Hinweis-Chips.
 */
import type { ReactNode } from 'react';
import { ArrowUpFromLine, Building, Check, CreditCard, FileText, MessageSquareText, Wallet, X, type LucideIcon } from 'lucide-react';
import type { Order, StopStatus } from '@shared/types';
import { formatEuro, PAYMENT_METHOD_LABEL } from '@shared/format';
import { cn } from '@/lib/cn';
import { floorLabel, payKind } from '../lib/driverUtils';

const STOP_BG: Record<StopStatus, string> = {
  pending: 'bg-brand-700 text-white',
  arrived: 'bg-amber-500 text-white',
  delivered: 'bg-emerald-600 text-white',
  failed: 'bg-red-600 text-white',
};

/** Runde Stopp-Nummer in Statusfarbe (✓ zugestellt, ✕ fehlgeschlagen) */
export function StopNumber({
  index,
  status,
  size = 'md',
  current = false,
  surface = 'light',
  className,
}: {
  index: number;
  status: StopStatus;
  size?: 'sm' | 'md' | 'lg';
  current?: boolean;
  /** Untergrund: dunkel (Brand) bzw. Akzentfläche (Gold) */
  surface?: 'light' | 'dark' | 'accent';
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-12 w-12 text-lg' : 'h-10 w-10 text-[15px]';
  const icon = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums',
        dim,
        surface === 'dark' && status === 'pending'
          ? 'bg-white text-brand-900'
          : surface === 'accent' && (status === 'pending' || status === 'arrived')
            ? 'bg-brand-950 text-white'
            : STOP_BG[status],
        current && 'ring-4 ring-accent-300',
        className,
      )}
      aria-hidden
    >
      {status === 'delivered' ? <Check size={icon} strokeWidth={3} /> : status === 'failed' ? <X size={icon} strokeWidth={3} /> : index}
    </span>
  );
}

/** Fortschrittsbalken (0–1) */
export function ProgressBar({ value, tone = 'brand', className, label }: { value: number; tone?: 'brand' | 'success' | 'accent'; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const bar = tone === 'success' ? 'bg-emerald-500' : tone === 'accent' ? 'bg-accent-500' : 'bg-brand-600';
  return (
    <div
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? 'Fortschritt'}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Kurzinfo zur Zahlung eines Stopps: "57,47 € bar" / "bezahlt (PayPal)" / "Rechnung" */
export function PaymentChip({ order, className }: { order: Order; className?: string }) {
  const kind = payKind(order.paymentMethod);
  if (kind === 'collect') {
    const Icon = order.paymentMethod === 'cash' ? Wallet : CreditCard;
    const amount = order.status === 'delivered' && order.proof?.amountCollected !== undefined ? order.proof.amountCollected : order.totals.total;
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-lg bg-accent-100 px-2 py-1 text-[13px] font-bold text-accent-900 ring-1 ring-inset ring-accent-300/60', className)}>
        <Icon size={15} aria-hidden />
        <span className="tabular-nums">{formatEuro(Math.max(0, amount))}</span>
        <span className="font-semibold">{order.paymentMethod === 'cash' ? 'bar' : 'EC'}</span>
      </span>
    );
  }
  if (kind === 'prepaid') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-[13px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200', className)}>
        <Check size={15} aria-hidden />
        bezahlt ({PAYMENT_METHOD_LABEL[order.paymentMethod]})
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[13px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200', className)}>
      <FileText size={15} aria-hidden />
      {order.paymentMethod === 'sepa' ? 'SEPA-Lastschrift' : 'per Rechnung'}
    </span>
  );
}

function Flag({ icon: Icon, children, tone = 'neutral' }: { icon: LucideIcon; children: ReactNode; tone?: 'neutral' | 'warning' | 'brand' }) {
  const cls =
    tone === 'warning'
      ? 'bg-amber-50 text-amber-900 ring-amber-200'
      : tone === 'brand'
        ? 'bg-brand-50 text-brand-800 ring-brand-200/70'
        : 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold ring-1 ring-inset', cls)}>
      <Icon size={14} aria-hidden className="shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Hinweis-Chips: Tragservice, Etage/Aufzug, Kundenhinweis */
export function StopFlags({ order, className }: { order: Order; className?: string }) {
  const floor = floorLabel(order.address?.floor);
  const hasNote = !!(order.notes || order.address?.notes);
  if (!order.carryService && !floor && !hasNote) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {order.carryService ? (
        <Flag icon={ArrowUpFromLine} tone="warning">
          Tragservice
        </Flag>
      ) : null}
      {floor && order.address?.floor ? (
        <Flag icon={Building} tone={order.address.hasElevator ? 'neutral' : 'warning'}>
          {floor} · {order.address.hasElevator ? 'Aufzug' : 'kein Aufzug'}
        </Flag>
      ) : null}
      {hasNote ? <Flag icon={MessageSquareText}>Hinweis</Flag> : null}
    </div>
  );
}
