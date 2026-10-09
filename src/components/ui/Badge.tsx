import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  PackageCheck,
  PackageOpen,
  ShoppingBag,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { FulfillmentType, OrderStatus } from '@shared/types';
import { orderStatusLabel } from '@shared/format';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200/70',
  accent: 'bg-accent-100 text-accent-800 ring-accent-300/60',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  /** kräftige Variante (gefüllt), z. B. für Angebots-Sticker */
  solid?: boolean;
}

const SOLID: Record<BadgeTone, string> = {
  neutral: 'bg-slate-700 text-white ring-slate-700',
  brand: 'bg-brand-700 text-white ring-brand-700',
  accent: 'bg-accent-500 text-brand-950 ring-accent-500',
  success: 'bg-emerald-600 text-white ring-emerald-600',
  warning: 'bg-amber-500 text-white ring-amber-500',
  danger: 'bg-red-600 text-white ring-red-600',
  info: 'bg-sky-600 text-white ring-sky-600',
};

export function Badge({ tone = 'neutral', icon: Icon, children, className, solid = false }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        solid ? SOLID[tone] : TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon size={13} aria-hidden className="-ml-0.5 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

const STATUS_VISUAL: Record<OrderStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  pending: { tone: 'info', icon: Clock },
  confirmed: { tone: 'brand', icon: CheckCircle2 },
  picking: { tone: 'warning', icon: PackageOpen },
  ready: { tone: 'accent', icon: PackageCheck },
  out_for_delivery: { tone: 'brand', icon: Truck },
  delivered: { tone: 'success', icon: CheckCircle2 },
  picked_up: { tone: 'success', icon: ShoppingBag },
  failed: { tone: 'danger', icon: AlertTriangle },
  cancelled: { tone: 'neutral', icon: XCircle },
};

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  fulfillment?: FulfillmentType;
  className?: string;
}

/** Bestellstatus mit passender Farbe und Symbol ("Unterwegs", "Abholbereit" …) */
export function OrderStatusBadge({ status, fulfillment = 'delivery', className }: OrderStatusBadgeProps) {
  const visual = STATUS_VISUAL[status] ?? { tone: 'neutral' as const, icon: CircleDashed };
  const tone: BadgeTone = status === 'ready' && fulfillment === 'pickup' ? 'success' : visual.tone;
  return (
    <Badge tone={tone} icon={visual.icon} className={className}>
      {orderStatusLabel(status, fulfillment)}
    </Badge>
  );
}
