/**
 * Bausteine der Bestell-Detailansicht im Markt (Seite und Schnellansicht im Drawer).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  PenLine,
  Recycle,
  Route as RouteIcon,
  Star,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { Order, OrderStatus, TourWithOrders } from '@shared/types';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  STOP_STATUS_LABEL,
  TOUR_STATUS_LABEL,
  formatDate,
  formatDateTime,
  formatEuro,
  formatTime,
  orderStatusLabel,
} from '@shared/format';
import { api } from '@/api/client';
import { qk, useDepositTypes, useSettings } from '@/api/hooks';
import { useDriverPosition } from '@/stores/positions';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, KeyValue, Notice, Select, Skeleton, Timeline, toast, type BadgeTone, type TimelineItem } from '@/components/ui';
import { BaseMap, DriverMarker, HomeMarker, StoreMarker, toLatLng } from '@/components/map';
import { cn } from '@/lib/cn';
import { useSaveTour } from '../api';
import { OPEN_STATUSES, firstName, minutesUntil, orderCrates, relDayInline } from '../model';
import { B2BTag } from './OrderBits';

// ───────────────────────────── Status-Fortschritt ─────────────────────────────

const DELIVERY_STEPS: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery', 'delivered'];
const PICKUP_STEPS: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready', 'picked_up'];
const SHORT: Partial<Record<OrderStatus, string>> = {
  pending: 'Eingegangen',
  confirmed: 'Bestätigt',
  picking: 'Kommissio\u00ADnierung',
  out_for_delivery: 'Unterwegs',
  delivered: 'Zugestellt',
  picked_up: 'Abgeholt',
};

function lastAt(order: Order, status: OrderStatus): string | undefined {
  for (let i = order.statusHistory.length - 1; i >= 0; i--) if (order.statusHistory[i].status === status) return order.statusHistory[i].at;
  return undefined;
}

/** Waagrechter Fortschritt: Eingegangen → … → Zugestellt/Abgeholt */
export function StatusStepper({ order, className }: { order: Order; className?: string }) {
  const steps = order.fulfillment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const reachedIdx = (() => {
    if (order.status === 'cancelled' || order.status === 'failed') {
      let max = -1;
      for (const h of order.statusHistory) max = Math.max(max, steps.indexOf(h.status));
      return max;
    }
    return steps.indexOf(order.status);
  })();
  const broken = order.status === 'cancelled' || order.status === 'failed';
  return (
    <ol className={cn('grid gap-1', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const done = i < reachedIdx || (i === reachedIdx && (s === 'delivered' || s === 'picked_up'));
        const current = i === reachedIdx && !done;
        const at = lastAt(order, s);
        const label = s === 'ready' ? orderStatusLabel('ready', order.fulfillment) : SHORT[s];
        return (
          <li key={s} className="relative flex min-w-0 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
            {i > 0 ? (
              <span aria-hidden className={cn('absolute right-1/2 top-3.5 h-0.5 w-full', i <= reachedIdx ? 'bg-brand-600' : 'bg-slate-200')} />
            ) : null}
            <span
              className={cn(
                'relative z-[1] flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white',
                done ? 'bg-brand-600 text-white' : current ? (broken ? 'bg-red-600 text-white' : 'bg-accent-500 text-brand-950') : 'bg-slate-100 text-slate-400',
              )}
            >
              {done ? <CheckCircle2 size={15} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                'mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs',
                done || current ? 'text-slate-800' : 'text-slate-400',
                current ? 'max-sm:whitespace-nowrap' : 'max-sm:sr-only',
              )}
            >
              {label}
            </span>
            <span className="mt-0.5 text-[11px] tabular-nums text-slate-400 max-sm:hidden">{at && (done || current) ? formatTime(at) : '\u00A0'}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────────── Kunde ─────────────────────────────

export function CustomerCard({ order }: { order: Order }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.adminCustomer(order.customerId),
    queryFn: () => api.adminGetCustomer(order.customerId),
    staleTime: 60_000,
  });
  const c = data?.customer;
  const orderCount = data?.orders.filter((o) => o.status !== 'cancelled').length;
  return (
    <Card>
      <CardHeader title="Kunde" icon={order.customerType === 'b2b' ? Building2 : UserRound} />
      <div className="flex items-center gap-3">
        <Avatar name={order.customerName} />
        <div className="min-w-0 flex-1">
          <Link to={`/admin/kunden/${order.customerId}`} className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 hover:text-brand-700 hover:underline">
            <span className="truncate">{order.customerName}</span>
            <B2BTag type={order.customerType} />
          </Link>
          <div className="truncate text-sm text-slate-500">
            {isLoading ? (
              <Skeleton className="mt-1 h-4 w-32" />
            ) : c?.b2b ? (
              `Kd.-Nr. ${c.b2b.customerNumber}${c.contactName && c.contactName !== c.name ? ` · ${c.contactName}` : ''}`
            ) : orderCount !== undefined ? (
              `${orderCount} ${orderCount === 1 ? 'Bestellung' : 'Bestellungen'} bisher`
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm">
        {order.customerPhone || c?.phone ? (
          <a href={`tel:${(order.customerPhone ?? c?.phone ?? '').replace(/\s+/g, '')}`} className="flex min-h-9 items-center gap-2.5 text-slate-700 hover:text-brand-700">
            <Phone size={16} aria-hidden className="text-slate-400" />
            {order.customerPhone ?? c?.phone}
          </a>
        ) : null}
        {c?.email ? (
          <a href={`mailto:${c.email}`} className="flex min-h-9 items-center gap-2.5 break-all text-slate-700 hover:text-brand-700">
            <Mail size={16} aria-hidden className="shrink-0 text-slate-400" />
            {c.email}
          </a>
        ) : null}
        {c?.b2b ? (
          <p className="flex flex-wrap items-center gap-1.5 pt-1">
            {c.b2b.discountPercent ? <Badge tone="brand">{c.b2b.discountPercent} % Rabatt</Badge> : null}
            {c.b2b.allowInvoice ? <Badge tone="neutral">Rechnungskauf</Badge> : null}
            {c.b2b.freeDelivery ? <Badge tone="success">frei Haus</Badge> : null}
          </p>
        ) : null}
      </div>
      <ButtonLink to={`/admin/kunden/${order.customerId}`} variant="outline" size="sm" block className="mt-4" iconRight={ExternalLink}>
        Kundenkonto öffnen
      </ButtonLink>
    </Card>
  );
}

// ───────────────────────────── Zahlung & Angaben ─────────────────────────────

const PAYMENT_TONE: Record<Order['paymentStatus'], BadgeTone> = { open: 'warning', paid: 'success', invoiced: 'info' };

export function PaymentCard({ order }: { order: Order }) {
  const items: [ReactNode, ReactNode][] = [
    ['Zahlart', PAYMENT_METHOD_LABEL[order.paymentMethod]],
    ['Status', <Badge tone={PAYMENT_TONE[order.paymentStatus]}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>],
    ['Betrag', <span className="tabular-nums">{formatEuro(order.totals.total)}</span>],
  ];
  if (order.proof?.amountCollected !== undefined) items.push(['Kassiert', <span className="tabular-nums">{formatEuro(order.proof.amountCollected)}</span>]);
  if (order.invoiceId) {
    items.push([
      'Rechnung',
      <Link to={`/business/rechnungen/${order.invoiceId}`} className="font-semibold text-brand-700 hover:underline">
        anzeigen
      </Link>,
    ]);
  }
  return (
    <Card>
      <CardHeader title="Zahlung" icon={Wallet} />
      <KeyValue items={items} />
    </Card>
  );
}

export function InfoCard({ order }: { order: Order }) {
  const items: [ReactNode, ReactNode][] = [];
  if (order.reference) items.push(['Referenz', order.reference]);
  if (order.costCenter) items.push(['Kostenstelle', order.costCenter]);
  if (order.couponCode) items.push(['Gutschein', <Badge tone="accent">{order.couponCode}</Badge>]);
  if (order.eventDate) items.push(['Veranstaltung', formatDate(order.eventDate, 'medium')]);
  if (order.commission) items.push(['Kommission', 'Rückgabe voller Gebinde möglich']);
  if (order.subscriptionId) items.push(['Herkunft', 'Abo / Dauerauftrag']);
  if (order.loyaltyPointsEarned) items.push(['Treuepunkte', `${order.loyaltyPointsEarned} Punkte`]);
  if (!items.length && !order.notes) return null;
  return (
    <Card>
      <CardHeader title="Angaben & Hinweise" icon={PenLine} />
      {order.notes ? (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-amber-700">Hinweis des Kunden</p>
          {order.notes}
        </div>
      ) : null}
      {items.length ? <KeyValue items={items} /> : null}
    </Card>
  );
}

export function RatingCard({ order }: { order: Order }) {
  if (!order.rating) return null;
  return (
    <Card>
      <CardHeader title="Bewertung" icon={Star} subtitle={formatDateTime(order.rating.at)} />
      <div className="flex items-center gap-1" aria-label={`${order.rating.stars} von 5 Sternen`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={20} aria-hidden className={n <= order.rating!.stars ? 'fill-accent-400 text-accent-500' : 'text-slate-300'} />
        ))}
      </div>
      {order.rating.comment ? <p className="mt-2 text-sm italic leading-relaxed text-slate-600">„{order.rating.comment}“</p> : null}
    </Card>
  );
}

// ───────────────────────────── Lieferung / Abholung ─────────────────────────────

export function FulfillmentCard({ order, driverColor }: { order: Order; driverColor?: string }) {
  const settings = useSettings();
  const a = order.address;
  const live = useDriverPosition(order.status === 'out_for_delivery' ? order.driverId : null);
  const now = new Date();
  const eta = minutesUntil(order.eta, now);
  const store = toLatLng(settings.location);

  if (order.fulfillment === 'pickup') {
    const expired = order.holdUntil && Date.parse(order.holdUntil) < now.getTime() && order.status !== 'picked_up' && order.status !== 'cancelled';
    return (
      <Card>
        <CardHeader title="Abholung im Markt" icon={Clock} subtitle={`${formatDate(order.slot.date, 'long')} · ${order.slot.start}–${order.slot.end} Uhr`} />
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-2xl bg-slate-900 px-5 py-3 text-center text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Abholcode</p>
            <p className="font-mono text-2xl font-bold tracking-[0.2em]">{order.pickupCode ?? '––––––'}</p>
          </div>
          <div className="min-w-0 text-sm text-slate-600">
            {order.holdUntil ? (
              <p className={cn(expired && 'font-semibold text-red-700')}>
                {expired ? 'Reservierung abgelaufen seit ' : 'Reserviert bis '}
                {formatDateTime(order.holdUntil)} Uhr
              </p>
            ) : (
              <p>Reservierung beginnt, sobald die Ware bereitsteht.</p>
            )}
            <p className="mt-1 text-slate-500">Der Kunde zeigt Code oder QR-Code an der Kasse vor – prüfen unter „Abholungen“.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <CardHeader title="Lieferung" icon={Truck} subtitle={`${formatDate(order.slot.date, 'long')} · ${order.slot.start}–${order.slot.end} Uhr`} className="mb-3" />
        {a ? (
          <div className="flex items-start gap-3 text-[15px]">
            <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{a.name}</p>
              <p className="text-slate-600">
                {a.street}, {a.zip} {a.city}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {a.floor !== undefined ? <Badge tone="neutral">{a.floor === 0 ? 'Erdgeschoss' : `${a.floor}. Stock`}{a.hasElevator ? ' · Aufzug' : ''}</Badge> : null}
                {order.carryService ? <Badge tone="accent">Tragservice</Badge> : null}
                {order.eta && order.status !== 'delivered' && order.status !== 'cancelled' ? (
                  <Badge tone="brand" icon={Clock}>
                    ETA {formatTime(order.eta)} Uhr{eta !== null && eta >= 0 && eta < 180 ? ` · in ${eta} Min.` : ''}
                  </Badge>
                ) : null}
              </p>
              {a.notes ? <p className="mt-2 text-sm text-slate-500">Hinweis: {a.notes}</p> : null}
            </div>
          </div>
        ) : (
          <Notice tone="warning">Für diese Lieferung ist keine Adresse hinterlegt.</Notice>
        )}
      </div>
      {a ? (
        <div className="h-56 border-t border-slate-100 sm:h-64">
          <BaseMap fitTo={[store, toLatLng(a)]} fitPadding={40} maxFitZoom={15}>
            <StoreMarker />
            <HomeMarker position={a} label={order.customerName} />
            {live ? <DriverMarker position={live} color={driverColor} /> : null}
          </BaseMap>
        </div>
      ) : null}
    </Card>
  );
}

// ───────────────────────────── Tour-Zuordnung ─────────────────────────────

export function TourAssignmentCard({ order, tours, loading }: { order: Order; tours: TourWithOrders[] | undefined; loading?: boolean }) {
  const save = useSaveTour();
  const current = tours?.find((t) => t.id === order.tourId);
  const stopIdx = current ? current.stops.findIndex((s) => s.orderId === order.id) : -1;
  const stop = current?.stops[stopIdx];
  const open = OPEN_STATUSES.includes(order.status);
  const candidates = (tours ?? []).filter((t) => t.status !== 'completed' && t.id !== current?.id && !t.simulation?.running && t.date === order.slot.date);
  const lockedCurrent = !!current && (current.simulation?.running || current.status === 'completed');
  const planLink = `/admin/touren?datum=${order.slot.date}${current ? `&tour=${current.id}` : ''}`;

  const assign = (tourId: string) => {
    const target = tours?.find((t) => t.id === tourId);
    if (!target) return;
    save.mutate(
      { id: target.id, date: target.date, driverId: target.driverId, orderIds: [...target.stops.map((s) => s.orderId), order.id] },
      { onSuccess: () => toast.success(`${order.number} ist jetzt in „${target.name}“ eingeplant`) },
    );
  };
  const remove = () => {
    if (!current) return;
    save.mutate(
      { id: current.id, date: current.date, driverId: current.driverId, orderIds: current.stops.map((s) => s.orderId).filter((id) => id !== order.id) },
      { onSuccess: () => toast.success(`${order.number} wurde aus „${current.name}“ entfernt`) },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Tour"
        icon={RouteIcon}
        action={
          <ButtonLink to={planLink} variant="ghost" size="sm" iconRight={ExternalLink}>
            Tourenplanung
          </ButtonLink>
        }
      />
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : current ? (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/70">
          <Avatar name={current.driver?.name ?? 'Fahrer'} color={current.driver?.color} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{current.name}</p>
            <p className="truncate text-sm text-slate-500">
              {current.driver ? firstName(current.driver.name) : 'Fahrer'} · Stopp {stopIdx + 1} von {current.stops.length}
              {stop?.eta && order.status !== 'delivered' ? ` · ETA ${formatTime(stop.eta)} Uhr` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={current.status === 'active' ? 'brand' : current.status === 'completed' ? 'success' : 'neutral'}>{TOUR_STATUS_LABEL[current.status]}</Badge>
            {stop && stop.status !== 'pending' ? <span className="text-xs text-slate-500">{STOP_STATUS_LABEL[stop.status]}</span> : null}
          </div>
        </div>
      ) : (
        <Notice tone={open ? 'warning' : 'info'} icon={AlertTriangle}>
          {open ? 'Diese Lieferung ist noch keiner Tour zugeordnet.' : 'Keine Tour zugeordnet.'}
        </Notice>
      )}
      {open && !lockedCurrent ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {candidates.length ? (
            <Select
              label={current ? 'In andere Tour verschieben' : 'Tour zuordnen'}
              containerClassName="min-w-0 flex-1 basis-60"
              value=""
              placeholder="Tour wählen …"
              disabled={save.isPending}
              options={candidates.map((t) => ({
                value: t.id,
                label: `${t.name} (${t.stops.length} Stopps, ${t.orders.reduce((s, o) => s + orderCrates(o), 0)} Geb.)`,
              }))}
              onChange={(e) => assign(e.target.value)}
            />
          ) : !current ? (
            <p className="min-w-0 flex-1 text-sm text-slate-500">Für {relDayInline(order.slot.date)} gibt es noch keine offene Tour.</p>
          ) : null}
          {current ? (
            <Button variant="outline" onClick={remove} loading={save.isPending}>
              Aus Tour entfernen
            </Button>
          ) : !candidates.length ? (
            <ButtonLink to={planLink} variant="secondary" icon={RouteIcon}>
              Tour planen
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      {current?.simulation?.running ? <p className="mt-2 text-xs text-slate-500">Die Tour wird gerade simuliert – Änderungen sind erst nach dem Stoppen möglich.</p> : null}
    </Card>
  );
}

// ───────────────────────────── Zustellnachweis ─────────────────────────────

export function ProofCard({ order }: { order: Order }) {
  const types = useDepositTypes();
  const p = order.proof;
  if (order.status === 'failed' && order.failureReason) {
    return (
      <Notice tone="danger" title="Zustellung fehlgeschlagen">
        {order.failureReason}
      </Notice>
    );
  }
  if (!p) return null;
  return (
    <Card>
      <CardHeader title={order.fulfillment === 'pickup' ? 'Übergabe' : 'Zustellnachweis'} icon={CheckCircle2} subtitle={`${formatDateTime(p.at)} Uhr`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 text-sm">
          <KeyValue
            items={[
              ['Entgegengenommen von', p.receivedBy || '–'],
              ...(p.amountCollected !== undefined ? ([['Kassiert', formatEuro(p.amountCollected)]] as [string, string][]) : []),
            ]}
          />
          {p.emptiesCollected.length ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
                <Recycle size={15} aria-hidden className="text-emerald-600" />
                Leergut mitgenommen
              </p>
              <ul className="space-y-0.5 text-slate-600">
                {p.emptiesCollected.map((l) => (
                  <li key={l.depositTypeId}>
                    {l.qty}× {types.find((t) => t.id === l.depositTypeId)?.shortName ?? l.depositTypeId}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.note ? <p className="text-slate-500">Notiz: {p.note}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {p.signatureDataUrl ? (
            <figure className="rounded-xl border border-slate-200 bg-white p-2">
              <img src={p.signatureDataUrl} alt="Unterschrift des Empfängers" className="h-24 w-full object-contain" />
              <figcaption className="mt-1 text-center text-xs text-slate-500">Unterschrift</figcaption>
            </figure>
          ) : null}
          {p.photoDataUrl ? (
            <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <a href={p.photoDataUrl} target="_blank" rel="noreferrer">
                <img src={p.photoDataUrl} alt="Foto als Zustellnachweis" className="h-28 w-full object-cover" />
              </a>
              <figcaption className="flex items-center justify-center gap-1 py-1 text-xs text-slate-500">
                <Camera size={12} aria-hidden /> Foto
              </figcaption>
            </figure>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────────── Verlauf ─────────────────────────────

export function HistoryTimeline({ order }: { order: Order }) {
  const items: TimelineItem[] = order.statusHistory.map((h, i) => {
    const last = i === order.statusHistory.length - 1;
    const bad = h.status === 'cancelled' || h.status === 'failed';
    return {
      title: orderStatusLabel(h.status, order.fulfillment),
      description: [h.by, h.note].filter(Boolean).join(' · ') || undefined,
      time: `${formatDate(h.at, 'medium')}, ${formatTime(h.at)}`,
      state: bad ? 'error' : last && h.status !== 'delivered' && h.status !== 'picked_up' ? 'current' : 'done',
    };
  });
  return <Timeline items={items} />;
}
