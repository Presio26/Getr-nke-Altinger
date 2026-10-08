/**
 * Schnellansicht einer Bestellung im Drawer (Board/Liste): Status, Aktionen, Kunde, Positionen.
 */
import { ArrowRight, CalendarClock, MapPin, Phone, StickyNote } from 'lucide-react';
import type { Driver, Order } from '@shared/types';
import { FULFILLMENT_LABEL, formatDateTime, formatRelative, formatSlot } from '@shared/format';
import { ButtonLink, Drawer, OrderStatusBadge } from '@/components/ui';
import { orderCrates, firstName } from '../model';
import { B2BTag, FulfillmentIcon } from './OrderBits';
import { EmptiesList, OrderLinesList, OrderTotals } from './OrderLines';
import { StatusActions } from './StatusActions';

export function OrderQuickView({ order, driver, onClose, now }: { order: Order | null; driver?: Driver; onClose: () => void; now: Date }) {
  return (
    <Drawer
      open={!!order}
      onClose={onClose}
      width="min(34rem, 100vw)"
      title={order ? `Bestellung ${order.number}` : ''}
      footer={
        order ? (
          <ButtonLink to={`/admin/bestellungen/${order.id}`} block iconRight={ArrowRight}>
            Alle Details öffnen
          </ButtonLink>
        ) : null
      }
    >
      {order ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
              <FulfillmentIcon type={order.fulfillment} size="sm" />
              {FULFILLMENT_LABEL[order.fulfillment]}
            </span>
            <span className="text-sm text-slate-400" title={formatDateTime(order.createdAt)}>
              · eingegangen {formatRelative(order.createdAt, now)}
            </span>
          </div>

          <StatusActions order={order} tour={order.tourId ? { status: order.status === 'out_for_delivery' ? 'active' : 'planned' } : null} />

          <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
              {order.customerName}
              <B2BTag type={order.customerType} />
            </p>
            <div className="mt-2 space-y-1.5 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <CalendarClock size={15} aria-hidden className="shrink-0 text-slate-400" />
                {formatSlot(order.slot, now)}
              </p>
              {order.address ? (
                <p className="flex items-start gap-2">
                  <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
                  <span>
                    {order.address.street}, {order.address.zip} {order.address.city}
                    {order.address.notes ? <span className="block text-slate-500">{order.address.notes}</span> : null}
                  </span>
                </p>
              ) : null}
              {order.customerPhone ? (
                <a href={`tel:${order.customerPhone.replace(/\s+/g, '')}`} className="flex items-center gap-2 hover:text-brand-700">
                  <Phone size={15} aria-hidden className="shrink-0 text-slate-400" />
                  {order.customerPhone}
                </a>
              ) : null}
              {driver ? (
                <p className="flex items-center gap-2">
                  <span className="ml-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: driver.color }} aria-hidden />
                  Fahrer {firstName(driver.name)}
                </p>
              ) : null}
              {order.notes ? (
                <p className="flex items-start gap-2 text-amber-800">
                  <StickyNote size={15} aria-hidden className="mt-0.5 shrink-0" />
                  {order.notes}
                </p>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">
              Positionen <span className="font-normal text-slate-500">· {orderCrates(order)} Gebinde</span>
            </h3>
            <OrderLinesList order={order} compact />
          </section>

          <EmptiesList lines={order.emptiesReturn} />
          <OrderTotals order={order} />
        </div>
      ) : null}
    </Drawer>
  );
}
