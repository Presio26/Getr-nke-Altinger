/**
 * Bestellkarte für das Kanban-Board (kompakt, mit Ein-Klick-Aktion zum nächsten Status).
 * Ausgelegt für schmale Spalten (ab ca. 10 rem), damit alle sechs Spalten auf 1440 px passen.
 */
import { memo } from 'react';
import { AlertTriangle, CalendarClock, Clock, Route as RouteIcon, Sparkles } from 'lucide-react';
import type { Driver, Order } from '@shared/types';
import { formatDateTime, formatEuro, formatTime } from '@shared/format';
import { OrderStatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ageShort, firstName, lastStatusAt, orderCrates, slotCompact } from '../model';
import { B2BIcon, CratesPill, FulfillmentIcon, SourceIcon } from './OrderBits';
import { QuickStepButton } from './StatusActions';

export interface OrderCardProps {
  order: Order;
  now: Date;
  driver?: Driver;
  fresh?: boolean;
  onOpen: (order: Order) => void;
}

function TourLine({ order, driver, now }: { order: Order; driver?: Driver; now: Date }) {
  if (order.fulfillment !== 'delivery') return null;
  if (order.status === 'failed') {
    return (
      <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700">
        <AlertTriangle size={13} aria-hidden className="mt-px shrink-0" />
        <span className="line-clamp-2">{order.failureReason ?? 'Zustellung fehlgeschlagen'}</span>
      </p>
    );
  }
  if (order.status === 'out_for_delivery') {
    const eta = order.eta ? Math.round((Date.parse(order.eta) - now.getTime()) / 60_000) : null;
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: driver?.color ?? '#1d58a0' }} aria-hidden />
        <span className="truncate">
          {driver ? firstName(driver.name) : 'Fahrer'}
          {order.eta ? ` · ${formatTime(order.eta)}` : ''}
          {eta !== null && eta < 120 ? (eta <= 0 ? ' · jetzt' : ` (${eta} Min.)`) : ''}
        </span>
      </p>
    );
  }
  if (order.driverId && driver) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: driver.color }} aria-hidden />
        <span className="truncate">Tour {firstName(driver.name)}</span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <RouteIcon size={13} aria-hidden className="shrink-0" />
      <span className="truncate">Ohne Tour</span>
    </p>
  );
}

function OrderCardImpl({ order, now, driver, fresh = false, onOpen }: OrderCardProps) {
  const done = order.status === 'delivered' || order.status === 'picked_up' || order.status === 'cancelled';
  return (
    <article
      data-order={order.id}
      className={cn(
        'group relative rounded-xl bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(15,23,42,.06)] ring-1 ring-slate-200/80 transition-[box-shadow,transform,background-color]',
        'hover:-translate-y-px hover:shadow-raised hover:ring-slate-300 has-[.card-link:focus-visible]:ring-2 has-[.card-link:focus-visible]:ring-brand-500',
        fresh && 'animate-pop-in bg-accent-50 ring-2 ring-accent-400',
        order.status === 'cancelled' && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-1.5">
        <FulfillmentIcon type={order.fulfillment} size="sm" />
        <button
          type="button"
          onClick={() => onOpen(order)}
          aria-label={`Bestellung ${order.number}, ${order.customerName} – Details öffnen`}
          className="card-link min-w-0 flex-1 truncate text-left text-[13px] font-bold tabular-nums text-slate-900 outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
        >
          {order.number}
        </button>
        {fresh ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-500 px-1.5 py-px text-[10px] font-bold uppercase text-brand-950">
            <Sparkles size={10} aria-hidden />
            Neu
          </span>
        ) : (
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400" title={`Eingang ${formatDateTime(order.createdAt)} Uhr`}>
            {ageShort(done ? lastStatusAt(order) : order.createdAt, now)}
          </span>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 break-words text-[13px] font-semibold leading-snug text-slate-800" title={order.customerName}>
        {order.customerName}
        <B2BIcon type={order.customerType} />
        <SourceIcon source={order.source} />
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        <CalendarClock size={13} aria-hidden className="shrink-0 text-slate-400" />
        <span className="truncate">{slotCompact(order.slot, now)}</span>
      </p>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <CratesPill crates={orderCrates(order)} />
        <span className="font-semibold tabular-nums text-slate-900">{formatEuro(order.totals.total)}</span>
      </div>
      {!done ? (
        <div className="mt-1.5 empty:hidden">
          <TourLine order={order} driver={driver} now={now} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
          <span className="flex items-center gap-1 text-[11px] tabular-nums text-slate-400">
            <Clock size={11} aria-hidden />
            {formatTime(lastStatusAt(order))}
          </span>
        </div>
      )}
      <div className="relative z-[1] mt-2 empty:hidden">
        <QuickStepButton order={order} block arrow={false} className="!h-8 !px-2 !text-[13px]" />
      </div>
    </article>
  );
}

export const OrderCard = memo(OrderCardImpl);
