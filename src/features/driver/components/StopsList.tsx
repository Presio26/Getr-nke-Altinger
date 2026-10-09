/**
 * Stopp-Liste einer Tour: Reihenfolge, Adresse, Zeitfenster/ETA, Gebinde, Zahlung, Hinweise, Status.
 * Der aktuelle Stopp ist hervorgehoben; jeder Eintrag öffnet die Stopp-Seite.
 */
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, IdCard, Package, Recycle, Route as RouteIcon } from 'lucide-react';
import type { TourWithOrders } from '@shared/types';
import { formatDistance, formatDuration, formatTime, STOP_STATUS_LABEL } from '@shared/format';
import { cn } from '@/lib/cn';
import { useDepositTypes, useProductMap } from '@/api/hooks';
import { Badge } from '@/components/ui';
import { ageCheck, crateCount, currentStopIndex, emptiesLabel, STOP_TONE } from '../lib/driverUtils';
import { PaymentChip, StopFlags, StopNumber } from './StopBits';

export function StopsList({ tour }: { tour: TourWithOrders }) {
  const current = currentStopIndex(tour);
  const types = useDepositTypes();
  const productMap = useProductMap();
  const legs = tour.route?.legs ?? [];
  const returnLeg = legs[tour.stops.length];

  return (
    <ol className="space-y-3">
      {tour.stops.map((stop, i) => {
        const order = tour.orders.find((o) => o.id === stop.orderId);
        if (!order) return null;
        const isCurrent = i === current && tour.status !== 'completed';
        const done = stop.status === 'delivered' || stop.status === 'failed';
        const leg = legs[i];
        const empties = order.emptiesReturn.some((l) => l.qty > 0) ? emptiesLabel(order.emptiesReturn, types) : null;
        const age = done ? null : ageCheck(order, productMap);
        return (
          <li key={stop.orderId}>
            {leg ? (
              <div className="mb-1.5 flex items-center gap-2 pl-4 text-xs font-medium text-slate-400">
                <RouteIcon size={13} aria-hidden />
                {i === 0 ? 'ab Markt' : `ab Stopp ${i}`} · {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
              </div>
            ) : null}
            <Link
              to={`/fahrer/stopp/${order.id}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'group flex gap-3 rounded-2xl border bg-white p-4 shadow-card transition-[box-shadow,border-color] hover:shadow-raised',
                isCurrent ? 'border-accent-400 ring-2 ring-accent-300/70' : 'border-slate-200/70',
                done && 'bg-slate-50/80',
              )}
            >
              <StopNumber index={i + 1} status={stop.status} current={isCurrent} />
              <div className="min-w-0 flex-1">
                {isCurrent && stop.status === 'pending' ? (
                  <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-accent-700">Nächster Stopp</p>
                ) : null}
                {stop.status !== 'pending' ? (
                  <Badge tone={STOP_TONE[stop.status]} solid={stop.status === 'arrived'} className="mb-1">
                    {STOP_STATUS_LABEL[stop.status]}
                    {stop.doneAt ? ` · ${formatTime(stop.doneAt)} Uhr` : stop.arrivedAt ? ` seit ${formatTime(stop.arrivedAt)} Uhr` : ''}
                  </Badge>
                ) : null}
                <p className={cn('text-[17px] font-bold leading-snug', done ? 'text-slate-500' : 'text-slate-900')}>{order.customerName}</p>
                <p className={cn('mt-0.5 text-[15px] leading-snug', done ? 'text-slate-400' : 'text-slate-600')}>
                  {order.address ? `${order.address.street}, ${order.address.zip} ${order.address.city.replace(' b. München', '')}` : 'Keine Lieferadresse'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} aria-hidden />
                    {order.slot.start}–{order.slot.end}
                    {stop.eta && stop.status === 'pending' ? <strong className="ml-1 font-semibold text-slate-800">· ca. {formatTime(stop.eta)}</strong> : null}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Package size={14} aria-hidden />
                    {crateCount(order)} Gebinde
                  </span>
                  {empties ? (
                    <span className="inline-flex items-center gap-1">
                      <Recycle size={14} aria-hidden />
                      Leergut: {empties}
                    </span>
                  ) : null}
                </div>
                {!done ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <PaymentChip order={order} />
                    {age ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[13px] font-semibold text-red-800 ring-1 ring-inset ring-red-200">
                        <IdCard size={14} aria-hidden />
                        Alter prüfen · ab {age.minAge}
                      </span>
                    ) : null}
                    <StopFlags order={order} className="contents" />
                  </div>
                ) : stop.status === 'failed' && order.failureReason ? (
                  <p className="mt-2 text-sm font-medium text-red-700">Grund: {order.failureReason}</p>
                ) : null}
              </div>
              <ChevronRight size={22} aria-hidden className="shrink-0 self-center text-slate-300 transition-colors group-hover:text-brand-600" />
            </Link>
          </li>
        );
      })}
      {returnLeg ? (
        <li className="flex items-center gap-2 pl-4 text-xs font-medium text-slate-400">
          <RouteIcon size={13} aria-hidden />
          Rückfahrt zum Markt · {formatDistance(returnLeg.distance)} · {formatDuration(returnLeg.duration)}
        </li>
      ) : null}
    </ol>
  );
}
