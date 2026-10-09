import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  ExternalLink,
  FileText,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MapPinned,
  PackageSearch,
  Phone,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import type { Order, TrackingInfo } from '@shared/types';
import { ApiError } from '@shared/api';
import { formatDate, formatTime, FULFILLMENT_LABEL } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes, useOrder, useProductMap, useSettings } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { cn } from '@/lib/cn';
import { useDriverPosition } from '@/stores/positions';
import { telHref } from '@/components/layout/Footer';
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Notice,
  OrderStatusBadge,
  PageHeader,
  Select,
  Skeleton,
  Timeline,
} from '@/components/ui';
import { OrderLinesList } from './components/OrderLinesList';
import { TotalsBlock } from './components/TotalsBlock';
import { TrackingMap } from './components/TrackingMap';
import { LivePanel, LiveStrip } from './components/LivePanel';
import { PickupPanel } from './components/PickupPanel';
import { SuccessBanner } from './components/SuccessBanner';
import { RatingCard } from './components/RatingCard';
import { EmptiesCard, ProofCard } from './components/DeliveryDetails';
import { OrderInfoCard } from './components/OrderInfoCard';
import { RouteLinks, StoreInfo } from './components/StoreInfo';
import { buildTimeline, canCustomerCancel, isTrackable } from './lib/orderStatus';
import { useEtaCountdown, useLiveTracking } from './lib/useLiveTracking';
import { useReorder } from './lib/useReorder';

const CANCEL_REASONS = [
  { value: '', label: 'Bitte wählen (optional)' },
  { value: 'Termin passt nicht mehr', label: 'Termin passt nicht mehr' },
  { value: 'Versehentlich bestellt', label: 'Versehentlich bestellt' },
  { value: 'Bestellung geändert – neue Bestellung folgt', label: 'Ich bestelle neu (geänderte Bestellung)' },
  { value: 'Anderer Grund', label: 'Anderer Grund' },
];

function DetailSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-7 h-5 w-48" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Live-Bereich für Lieferungen (verladen/unterwegs): Karte + ETA + Fahrer */
function LiveSection({ order }: { order: Order }) {
  const settings = useSettings();
  const tracking = useLiveTracking(order.id, true);
  const t = tracking.data;
  const eta = useEtaCountdown(t, tracking.dataUpdatedAt);
  const livePos = useDriverPosition(t?.driver?.id, t?.driver?.position ?? null);
  const home = order.address;
  // Solange die Tour noch nicht läuft, steht der Fahrer am Markt – Karte zeigt Markt + Zuhause
  const driverOnRoad = order.status === 'out_for_delivery';

  return (
    <section aria-label="Live-Verfolgung" className="mb-6 lg:mb-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        <div className="-mx-4 sm:mx-0">
          <div className="overflow-hidden sm:rounded-2xl sm:shadow-card sm:ring-1 sm:ring-slate-200/70">
            {/* Mobil: Ankunft, nächster Stopp und Fahrer im ersten Bild – direkt über der Karte */}
            <LiveStrip order={order} tracking={t} eta={eta} loading={tracking.isLoading} className="border-y border-slate-200/70 sm:border-t-0 lg:hidden" />
            <div className="relative h-[55dvh] min-h-[300px] bg-slate-100 lg:h-[560px]">
              {home ? (
                <TrackingMap
                  className="h-full"
                  home={home}
                  homeLabel={`${home.street} · Ihre Lieferadresse`}
                  driver={t?.driver ? { position: driverOnRoad ? livePos : undefined, color: t.driver.color, name: t.driver.name } : undefined}
                  route={t?.tour?.routeToCustomer}
                  extraFit={driverOnRoad ? undefined : settings.location}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">Keine Lieferadresse hinterlegt.</div>
              )}
              <div
                className={cn(
                  'pointer-events-none absolute right-3 top-3 z-[500] items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-slate-700 shadow-card ring-1 ring-slate-200',
                  driverOnRoad ? 'flex' : 'hidden lg:flex',
                )}
              >
                {driverOnRoad ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inset-0 animate-ping rounded-full bg-red-400/70" />
                      <span className="relative h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    Live-Position
                  </>
                ) : (
                  <>
                    <Truck size={14} aria-hidden className="text-brand-700" />
                    Verladen – Abfahrt in Kürze
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <LivePanel order={order} tracking={t} eta={eta} loading={tracking.isLoading} className="hidden lg:block" />
      </div>
    </section>
  );
}

/** Bestelldetail mit Live-Tracking (Lieferung) bzw. Abhol-QR (Click & Collect) */
export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params, setParams] = useSearchParams();
  const isNew = params.get('neu') === '1';
  const role = useSession((s) => s.user?.role);
  const isAdmin = role === 'admin';
  const { data: order, isLoading, error, refetch } = useOrder(orderId);
  const products = useProductMap();
  const depositTypes = useDepositTypes();
  const settings = useSettings();
  const reorder = useReorder();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { hash } = useLocation();
  const loaded = !!order;

  useEffect(() => {
    if (isNew) window.scrollTo({ top: 0 });
  }, [isNew]);

  // Sprungmarke (z. B. „Bewerten“ aus der Bestellübersicht) nach dem Laden anfahren
  useEffect(() => {
    if (!loaded || !hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => window.clearTimeout(t);
  }, [loaded, hash]);

  const closeBanner = () => {
    const next = new URLSearchParams(params);
    next.delete('neu');
    setParams(next, { replace: true });
  };

  const cancel = useApiMutation((reason: string) => api.cancelOrder(orderId as string, reason || undefined), {
    invalidate: [qk.order(orderId ?? ''), qk.orders, qk.customer],
    onSuccess: () => {
      setCancelOpen(false);
      void qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });

  // Fahrername für die Timeline (aus der zuletzt geladenen Sendungsverfolgung, falls vorhanden)
  const driverFirstName = orderId ? qc.getQueryData<TrackingInfo>(qk.tracking(orderId))?.driver?.name.split(' ')[0] : undefined;
  const timeline = useMemo(() => (order ? buildTimeline(order, { driverFirstName }) : []), [order, driverFirstName]);

  if (isLoading) return <DetailSkeleton />;
  if (error || !order) {
    const notFound = !error || (error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden'));
    const listPath = isAdmin ? '/admin/bestellungen' : '/bestellungen';
    return (
      <>
        <PageHeader title={notFound ? 'Bestellung nicht gefunden' : 'Bestellung'} back={listPath} />
        <Card padding="none">
          {notFound ? (
            <EmptyState
              icon={PackageSearch}
              title="Diese Bestellung gibt es nicht – oder sie gehört zu einem anderen Konto"
              description="Bitte prüfen Sie den Link. Ihre eigenen Bestellungen finden Sie jederzeit in der Übersicht."
              action={
                <>
                  <ButtonLink to={listPath} icon={ClipboardList}>
                    {isAdmin ? 'Zu den Bestellungen' : 'Zu meinen Bestellungen'}
                  </ButtonLink>
                  <ButtonLink to={isAdmin ? '/admin' : '/'} variant="outline" icon={Home}>
                    {isAdmin ? 'Zum Dashboard' : 'Zur Startseite'}
                  </ButtonLink>
                </>
              }
            />
          ) : (
            <ErrorState
              error={error}
              onRetry={() => void refetch()}
              action={
                <ButtonLink to={listPath} variant="outline" icon={ClipboardList}>
                  Zu den Bestellungen
                </ButtonLink>
              }
            />
          )}
        </Card>
      </>
    );
  }

  const pickup = order.fulfillment === 'pickup';
  const trackable = isTrackable(order);
  const completed = order.status === 'delivered' || order.status === 'picked_up';
  const showNet = order.customerType === 'b2b';
  const canCancel = !isAdmin && canCustomerCancel(order);
  const itemCount = order.lines.reduce((s, l) => s + l.qty, 0);

  const statusCard = (
    <Card>
      <CardHeader
        title="Status"
        subtitle={`Zuletzt aktualisiert ${formatDate(order.updatedAt, 'relative')}, ${formatTime(order.updatedAt)} Uhr`}
        icon={pickup ? ShoppingBag : Truck}
      />
      <Timeline items={timeline} />
    </Card>
  );

  return (
    <>
      {isNew ? <SuccessBanner order={order} onClose={closeBanner} /> : null}

      <PageHeader
        title={`Bestellung ${order.number}`}
        documentTitle={`Bestellung ${order.number}`}
        back={isAdmin ? '/admin/bestellungen' : '/bestellungen'}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
            <span>
              {FULFILLMENT_LABEL[order.fulfillment]} ·{' '}
              <span className="whitespace-nowrap">
                bestellt {formatDate(order.createdAt, 'short').slice(0, 6)}, {formatTime(order.createdAt)} Uhr
              </span>
            </span>
          </span>
        }
        actions={
          isAdmin ? (
            <ButtonLink to={`/admin/bestellungen/${order.id}`} variant="outline" icon={LayoutDashboard}>
              Im Markt-Dashboard öffnen
            </ButtonLink>
          ) : completed || order.status === 'cancelled' ? (
            <Button variant="outline" icon={RotateCcw} onClick={() => reorder(order)}>
              Nochmal bestellen
            </Button>
          ) : undefined
        }
      />

      {isAdmin ? (
        <Notice tone="brand" icon={LayoutDashboard} className="mb-5" title="Kundenansicht">
          Sie sehen die Bestellung von {order.customerName} so, wie sie der Kunde sieht.
        </Notice>
      ) : null}

      {order.status === 'failed' ? (
        <Notice tone="danger" className="mb-5" title="Die Zustellung war leider nicht möglich">
          {order.failureReason ? `${order.failureReason}. ` : ''}Wir melden uns bei Ihnen, um einen neuen Termin zu vereinbaren – oder rufen Sie uns an:{' '}
          <a href={telHref(settings.phone)} className="font-semibold underline">
            {settings.phone}
          </a>
          .
        </Notice>
      ) : null}
      {order.status === 'cancelled' ? (
        <Notice tone="warning" icon={XCircle} className="mb-5" title="Diese Bestellung wurde storniert">
          Es wurde nichts berechnet{order.paymentMethod === 'paypal' || order.paymentMethod === 'card' ? ' – eine bereits erfolgte Zahlung wird erstattet' : ''}.
        </Notice>
      ) : null}

      {trackable && !pickup ? <LiveSection order={order} /> : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {pickup && order.status !== 'cancelled' && !completed ? <PickupPanel order={order} /> : null}

          {/* Status auf dem Handy früh zeigen (abgeschlossen: erst Beleg) */}
          {!completed ? <div className="lg:hidden">{statusCard}</div> : null}

          <Card>
            <CardHeader
              title="Ihre Artikel"
              subtitle={`${itemCount} ${itemCount === 1 ? 'Artikel' : 'Artikel'}${showNet ? ' · Nettopreise' : ''}`}
              icon={ShoppingBag}
              action={
                !isAdmin && !completed && order.status !== 'cancelled' ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => reorder(order)}>
                    <span className="hidden sm:inline">Nochmal bestellen</span>
                    <span className="sm:hidden">Nochmal</span>
                  </Button>
                ) : undefined
              }
              className="mb-1"
            />
            <OrderLinesList lines={order.lines} products={products} showNet={showNet} />
            <div className="mt-2 rounded-xl bg-slate-50 p-4">
              <TotalsBlock
                totals={order.totals}
                customerType={order.customerType}
                fulfillment={order.fulfillment}
                couponCode={order.couponCode}
                totalLabel={completed ? 'Gesamtbetrag' : 'Voraussichtlicher Betrag'}
              />
            </div>
          </Card>

          {completed ? <RatingCard order={order} readOnly={isAdmin} /> : null}
          {/* Abgeholte Click-&-Collect-Bestellung: Abholcode nur noch eingeklappt */}
          {pickup && completed ? <PickupPanel order={order} /> : null}
          {completed ? <div className="lg:hidden">{statusCard}</div> : null}

          <EmptiesCard order={order} depositTypes={depositTypes} />
          {order.status === 'delivered' ? <ProofCard order={order} /> : null}
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-36">
          <div className="hidden lg:block">{statusCard}</div>
          <OrderInfoCard order={order} />

          {pickup && order.status !== 'cancelled' ? (
            <Card>
              <CardHeader title="Markt & Anfahrt" icon={MapPinned} />
              <StoreInfo stacked />
              <RouteLinks className="mt-4" />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Hilfe & Aktionen" icon={LifeBuoy} />
            <div className="space-y-2.5">
              {order.invoiceId ? (
                <ButtonLink to={`/business/rechnungen/${order.invoiceId}`} variant="secondary" icon={Receipt} block>
                  Rechnung ansehen
                </ButtonLink>
              ) : order.paymentMethod === 'invoice' && order.status !== 'cancelled' ? (
                <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                  <FileText size={16} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
                  Die Rechnung erhalten Sie nach der Lieferung mit der nächsten Sammelrechnung.
                </p>
              ) : null}
              {canCancel ? (
                <Button variant="outline" icon={XCircle} block onClick={() => setCancelOpen(true)} className="text-red-700 hover:border-red-300 hover:bg-red-50">
                  Bestellung stornieren
                </Button>
              ) : null}
              <a
                href={telHref(settings.phone)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Phone size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900">Markt anrufen</span>
                  <span className="block text-sm text-slate-500">{settings.phone}</span>
                </span>
                <ExternalLink size={16} aria-hidden className="text-slate-300" />
              </a>
              <a
                href={`mailto:${settings.email}?subject=${encodeURIComponent(`Frage zu Bestellung ${order.number}`)}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Mail size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900">E-Mail schreiben</span>
                  <span className="block truncate text-sm text-slate-500">{settings.email}</span>
                </span>
                <ExternalLink size={16} aria-hidden className="text-slate-300" />
              </a>
              {!canCancel && !isAdmin && (order.status === 'picking' || order.status === 'ready') ? (
                <p className="px-1 text-[13px] leading-relaxed text-slate-500">
                  Ihre Bestellung wird bereits bearbeitet. Für Änderungen oder eine Stornierung rufen Sie uns bitte an.
                </p>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      <ConfirmModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancel.mutate(cancelReason)}
        loading={cancel.isPending}
        tone="danger"
        title="Bestellung wirklich stornieren?"
        confirmLabel="Ja, stornieren"
        cancelLabel="Behalten"
        message={
          <div className="space-y-3">
            <p>
              Bestellung {order.number} ({pickup ? 'Abholung' : 'Lieferung'} {formatDate(order.slot.date, 'relative')}, {order.slot.start}–{order.slot.end} Uhr) wird storniert. Das
              Zeitfenster wird wieder freigegeben.
            </p>
            <Select label="Grund" options={CANCEL_REASONS} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
        }
      />
    </>
  );
}
