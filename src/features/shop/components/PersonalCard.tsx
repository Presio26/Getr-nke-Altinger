import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, MapPinned, Navigation, PackageCheck, Recycle, ShoppingBag, Truck, type LucideIcon } from 'lucide-react';
import type { Customer, Order } from '@shared/types';
import { formatEuro, formatSlot } from '@shared/format';
import { zoneForZip } from '@shared/core/geo';
import { berlinParts } from '@shared/time';
import { useDepositTypes, useMyCustomer, useMyOrders, useSettings } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { ButtonLink, Card, OrderStatusBadge, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { depositSummary, isOpenOrder } from '@/features/account/lib/helpers';
import { zoneTerms } from './ZipCheck';

/** Begrüßung je Tageszeit (Europe/Berlin) */
function greeting(now = new Date()): string {
  const h = berlinParts(now).hour;
  if (h < 11) return 'Guten Morgen';
  if (h >= 18) return 'Guten Abend';
  return 'Grüß Gott';
}

/** Nächste offene Bestellung (frühestes Zeitfenster zuerst) */
function nextOpenOrder(orders: Order[] | undefined): { order: Order | null; more: number } {
  const open = (orders ?? []).filter(isOpenOrder).sort((a, b) => `${a.slot.date} ${a.slot.start}`.localeCompare(`${b.slot.date} ${b.slot.start}`));
  return { order: open[0] ?? null, more: Math.max(0, open.length - 1) };
}

function orderHeadline(o: Order): { title: string; icon: LucideIcon; live: boolean } {
  const pickup = o.fulfillment === 'pickup';
  if (pickup) {
    if (o.status === 'ready') return { title: 'Ihre Bestellung liegt zur Abholung bereit', icon: PackageCheck, live: false };
    return { title: `Ihre Abholung: ${formatSlot(o.slot)}`, icon: ShoppingBag, live: false };
  }
  if (o.status === 'out_for_delivery') return { title: 'Ihre Lieferung ist unterwegs', icon: Navigation, live: true };
  if (o.status === 'ready') return { title: `Ihre Lieferung ist verladen – ${formatSlot(o.slot)}`, icon: Truck, live: true };
  return { title: `Ihre Lieferung kommt ${formatSlot(o.slot)}`, icon: Truck, live: false };
}

function DeliveryArea({ customer }: { customer: Customer }) {
  const settings = useSettings();
  const address = customer.addresses.find((a) => a.id === customer.defaultAddressId) ?? customer.addresses[0];
  if (!address) {
    return (
      <Link to="/konto/adressen" className="group flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm hover:bg-slate-100">
        <MapPin size={18} aria-hidden className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 text-slate-700">Hinterlegen Sie eine Lieferadresse – dann zeigen wir Ihnen Liefergebühr und Mindestbestellwert.</span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-slate-300 group-hover:text-brand-600" />
      </Link>
    );
  }
  const zone = zoneForZip(settings, address.zip);
  const terms = zone ? zoneTerms(zone) : null;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
      <span className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', zone ? '' : 'bg-red-500')} style={zone ? { background: zone.color } : undefined} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-slate-900">
          {zone ? `Wir liefern zu Ihnen: ${zone.name}` : 'Ihre Adresse liegt außerhalb unseres Liefergebiets'}
        </p>
        <p className="truncate text-slate-500">
          {address.label} · {address.street}, {address.zip} {address.city}
        </p>
        {terms && zone ? (
          <p className="mt-1 text-slate-600">
            {terms.alwaysFree ? (
              <span className="font-semibold text-emerald-700">Lieferung immer kostenlos</span>
            ) : (
              <>
                Liefergebühr {terms.fee} · <span className="font-semibold text-emerald-700">kostenlos ab {terms.freeFrom}</span>
              </>
            )}
            <span className="text-slate-400"> · </span>Mindestbestellwert {terms.minOrder}
          </p>
        ) : !zone ? (
          <p className="mt-1 text-slate-600">Gern reservieren wir Ihre Getränke zur Abholung im Markt (Click &amp; Collect).</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Persönliche Kopfkarte für angemeldete Privatkunden (statt PLZ-Abfrage): Begrüßung, laufende Bestellung mit
 * Live-Link bzw. Liefergebiet der Standardadresse und Leergut zu Hause.
 */
export function PersonalCard() {
  const user = useSession((s) => s.user);
  const { data: customer, isLoading } = useMyCustomer();
  const { data: orders, isLoading: ordersLoading } = useMyOrders();
  const types = useDepositTypes();
  const { order, more } = useMemo(() => nextOpenOrder(orders), [orders]);
  const deposit = useMemo(() => depositSummary(customer?.depositBalance, types), [customer, types]);
  const name = customer?.contactName || customer?.name || user?.name || '';

  return (
    <Card padding="none" className="relative z-10 mx-0 -mt-10 shadow-raised sm:mx-6 lg:mx-10">
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">Schön, dass Sie da sind</p>
          <h2 className="mt-1 text-xl font-bold leading-tight tracking-tight text-slate-900">
            {greeting()}
            {name ? `, ${name}` : ''}!
          </h2>
          {deposit.totalQty > 0 ? (
            <Link to="/konto/leergut" className="group mt-2 inline-flex min-h-10 items-center gap-2 text-sm text-slate-600 hover:text-brand-700">
              <Recycle size={16} aria-hidden className="shrink-0 text-emerald-600" />
              <span>
                <strong className="font-semibold text-slate-800">
                  {deposit.totalQty} {deposit.totalQty === 1 ? 'Kasten' : 'Kästen'} Leergut
                </strong>{' '}
                bei Ihnen · {formatEuro(deposit.totalValue)} Pfand
              </span>
              <ChevronRight size={15} aria-hidden className="shrink-0 text-slate-300 group-hover:text-brand-600" />
            </Link>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Ihr Getränkemarkt in Garching – heute bestellt, pünktlich geliefert.</p>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {isLoading || ordersLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : order ? (
            <OrderTeaser order={order} more={more} />
          ) : customer ? (
            <DeliveryArea customer={customer} />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function OrderTeaser({ order, more }: { order: Order; more: number }) {
  const head = orderHeadline(order);
  const Icon = head.icon;
  return (
    <div className="rounded-xl bg-brand-50/70 p-3.5 ring-1 ring-inset ring-brand-100">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-slate-900">{head.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
            <span>
              {order.number} · {formatEuro(order.totals.total)}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ButtonLink to={`/bestellung/${order.id}`} size="md" icon={head.live ? MapPinned : undefined} variant={head.live ? 'primary' : 'outline'}>
          {head.live ? 'Live verfolgen' : 'Bestellung ansehen'}
        </ButtonLink>
        {more > 0 ? (
          <Link to="/bestellungen" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
            + {more} weitere offene {more === 1 ? 'Bestellung' : 'Bestellungen'}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
