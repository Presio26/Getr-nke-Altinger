import { Link } from 'react-router-dom';
import { ChevronRight, Package, QrCode, RotateCcw, ShoppingBag, Star, Truck } from 'lucide-react';
import type { Order, Product } from '@shared/types';
import { formatDate, formatEuro, formatSlot } from '@shared/format';
import { Button, ButtonLink, OrderStatusBadge } from '@/components/ui';
import { ProductImage } from '@/components/product';
import { cn } from '@/lib/cn';
import { isActiveOrder, statusHint } from '../lib/orderStatus';

export interface OrderCardProps {
  order: Order;
  products: Map<string, Product>;
  onReorder: (order: Order) => void;
}

const MAX_THUMBS = 4;

/** Karte in „Meine Bestellungen“: Nummer, Status, Termin, Artikelvorschau, Betrag, Aktionen */
export function OrderCard({ order, products, onReorder }: OrderCardProps) {
  const active = isActiveOrder(order);
  const pickup = order.fulfillment === 'pickup';
  const live = order.status === 'out_for_delivery';
  const count = order.lines.reduce((s, l) => s + l.qty, 0);
  const thumbs = order.lines.slice(0, MAX_THUMBS);
  const more = order.lines.length - thumbs.length;
  const FIcon = pickup ? ShoppingBag : Truck;
  const href = `/bestellung/${order.id}`;

  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-white shadow-card transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-raised',
        live ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200/70',
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              {/* Ganze Karte klickbar über das ::after des Links */}
              <Link to={href} className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none">
                {order.number}
              </Link>
            </h3>
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
          </div>
          <p className="mt-1 text-[13px] text-slate-500">Bestellt am {formatDate(order.createdAt, 'short')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900">{formatEuro(order.totals.total)}</p>
          <p className="text-[13px] text-slate-500">
            {count} {count === 1 ? 'Artikel' : 'Artikel'}
          </p>
        </div>
      </div>

      <div className="mx-4 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:mx-5">
        <FIcon size={17} aria-hidden className={cn('shrink-0', live ? 'text-brand-700' : 'text-slate-500')} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-800">
            {pickup ? 'Abholung' : 'Lieferung'} · {formatSlot(order.slot)}
          </p>
          <p className={cn('truncate text-[13px]', live ? 'font-semibold text-brand-700' : 'text-slate-500')}>
            {live ? <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-600 align-middle" aria-hidden /> : null}
            {statusHint(order)}
            {!pickup && order.address ? ` · ${order.address.street}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3 sm:px-5">
        <ul className="flex -space-x-2" aria-label="Artikel">
          {thumbs.map((l) => {
            const p = products.get(l.productId);
            return (
              <li
                key={l.productId}
                title={`${l.qty}× ${l.name}`}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-slate-200"
              >
                {p ? <ProductImage product={p} /> : <Package size={20} aria-hidden className="text-slate-400" />}
              </li>
            );
          })}
          {more > 0 ? (
            <li className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 ring-1 ring-slate-200">+{more}</li>
          ) : null}
        </ul>
        <p className="ml-2 line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-slate-500">
          {order.lines
            .slice(0, 3)
            .map((l) => `${l.qty}× ${l.name}`)
            .join(', ')}
          {order.lines.length > 3 ? ' …' : ''}
        </p>
      </div>

      {order.reference || order.costCenter ? (
        <p className="px-4 pt-2 text-[13px] text-slate-500 sm:px-5">
          {order.reference ? <>Referenz: <span className="font-medium text-slate-700">{order.reference}</span></> : null}
          {order.reference && order.costCenter ? ' · ' : null}
          {order.costCenter ? <>Kostenstelle: <span className="font-medium text-slate-700">{order.costCenter}</span></> : null}
        </p>
      ) : null}

      {/* Aktionen liegen über dem Karten-Link */}
      <div className="relative z-[1] mt-auto flex flex-wrap items-center gap-2 p-4 pt-4 sm:px-5">
        {live ? (
          <ButtonLink to={href} size="sm" icon={Truck}>
            Live verfolgen
          </ButtonLink>
        ) : pickup && order.status === 'ready' ? (
          <ButtonLink to={href} size="sm" variant="success" icon={QrCode}>
            Abholcode anzeigen
          </ButtonLink>
        ) : null}
        {!active && order.status !== 'cancelled' && !order.rating && order.status !== 'failed' ? (
          <ButtonLink to={`${href}#bewertung`} size="sm" variant="ghost" icon={Star}>
            Bewerten
          </ButtonLink>
        ) : null}
        {!active ? (
          <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => onReorder(order)}>
            Nochmal bestellen
          </Button>
        ) : null}
        <ButtonLink to={href} size="sm" variant="ghost" iconRight={ChevronRight} className="ml-auto">
          Details
        </ButtonLink>
      </div>
    </article>
  );
}
