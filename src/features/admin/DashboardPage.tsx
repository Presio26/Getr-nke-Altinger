/**
 * Markt-Dashboard: Kennzahlen des Tages, Umsatz 14 Tage, Live-Feed neuer Bestellungen,
 * Mini-Live-Karte, heutige Touren, Meldebestand und Schnellaktionen.
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tooltip as LeafletTooltip } from 'react-leaflet';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  ClipboardList,
  Euro,
  MapPinned,
  Package,
  PackageCheck,
  Route as RouteIcon,
  ScanLine,
  ShoppingBag,
  Star,
  Truck,
} from 'lucide-react';
import type { Order, TourWithOrders } from '@shared/types';
import { TOUR_STATUS_LABEL, formatDate, formatEuro, formatRelative, formatTime } from '@shared/format';
import { berlinParts, todayString } from '@shared/time';
import { useSettings } from '@/api/hooks';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { usePositions } from '@/stores/positions';
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  OrderStatusBadge,
  PageHeader,
  Skeleton,
  StatCard,
} from '@/components/ui';
import { BaseMap, StoreMarker, toLatLng } from '@/components/map';
import { useAdminDrivers, useAdminOrders, useAdminStats, useAdminTours } from './ops/api';
import { useFreshIds } from './ops/hooks';
import { firstName, orderCrates } from './ops/model';
import { B2BTag, FulfillmentIcon, LiveDot, ProgressBar } from './ops/components/OrderBits';
import { RevenueChart, RevenueLegend } from './ops/components/RevenueChart';
import { LiveDriverMarker, TourLayer, useDriversAway } from './ops/components/FleetLayers';

const DAYS = 14;
const ALL_QUERY = {};

function greeting(now: Date): string {
  const h = berlinParts(now).hour;
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

// ───────────────────────────── Kennzahlen ─────────────────────────────

function KpiRow() {
  const navigate = useNavigate();
  const { data: stats, isLoading, error, refetch } = useAdminStats(DAYS);
  if (error) {
    return (
      <Card className="mb-5">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Card>
    );
  }
  if (isLoading || !stats) {
    return (
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[7.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }
  const past = stats.revenueByDay.slice(0, -1);
  const avg = past.length ? past.reduce((s, d) => s + d.b2c + d.b2b, 0) / past.length : 0;
  const t = stats.today;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Bestellungen heute"
        value={t.orders}
        icon={ClipboardList}
        tone="brand"
        hint={`${t.deliveredToday} erledigt`}
        onClick={() => navigate('/admin/bestellungen?tag=heute')}
      />
      <StatCard
        label="Umsatz heute"
        value={formatEuro(t.revenue)}
        icon={Euro}
        tone="accent"
        trend={avg > 0 ? { value: ((t.revenue - avg) / avg) * 100, label: 'zum Ø' } : undefined}
      />
      <StatCard
        label="Offene Lieferungen"
        value={t.openDeliveries}
        icon={Truck}
        tone="neutral"
        hint="noch nicht zugestellt"
        onClick={() => navigate('/admin/touren')}
      />
      <StatCard
        label="Offene Abholungen"
        value={t.openPickups}
        icon={ShoppingBag}
        tone="success"
        hint="Click & Collect heute"
        onClick={() => navigate('/admin/abholungen')}
      />
      <StatCard
        label="Ø Bewertung"
        value={
          <span className="inline-flex items-center gap-1.5">
            {stats.ratingAvg ? stats.ratingAvg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
            <Star size={20} aria-hidden className="fill-accent-400 text-accent-500" />
          </span>
        }
        icon={Star}
        tone="warning"
        hint={`${stats.ratingCount} Bewertungen`}
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}

function RevenueCard() {
  const { data: stats, isLoading } = useAdminStats(DAYS);
  const total = stats?.revenueByDay.reduce((s, d) => s + d.b2c + d.b2b, 0) ?? 0;
  const orders = stats?.revenueByDay.reduce((s, d) => s + d.orders, 0) ?? 0;
  const b2b = stats?.revenueByDay.reduce((s, d) => s + d.b2b, 0) ?? 0;
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Umsatz der letzten {DAYS} Tage</h2>
          <p className="mt-0.5 text-sm text-slate-500">Warenwert brutto nach Liefer-/Abholtag, ohne Stornos</p>
        </div>
        {stats ? (
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs font-medium text-slate-500">Summe</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{formatEuro(total)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Bestellungen</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{orders}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-medium text-slate-500">Anteil B2B</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{total ? Math.round((b2b / total) * 100) : 0} %</p>
            </div>
          </div>
        ) : null}
      </div>
      <RevenueLegend />
      {isLoading || !stats ? (
        <Skeleton className="mt-3 h-[260px] w-full flex-1" />
      ) : (
        <div className="-mx-1 mt-3 flex min-h-[260px] flex-1 flex-col">
          <RevenueChart data={stats.revenueByDay} height="100%" />
        </div>
      )}
    </Card>
  );
}

// ───────────────────────────── Live-Feed ─────────────────────────────

function FeedRow({ order, fresh, now }: { order: Order; fresh: boolean; now: Date }) {
  return (
    <li>
      <Link
        to={`/admin/bestellungen/${order.id}`}
        className={cn(
          'flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50',
          fresh && 'animate-pop-in bg-accent-50 ring-1 ring-accent-300 hover:bg-accent-50',
        )}
      >
        <FulfillmentIcon type={order.fulfillment} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
              <span className="truncate">{order.customerName}</span>
              <B2BTag type={order.customerType} />
              {fresh ? (
                <Badge tone="accent" solid className="!px-1.5 !py-0 text-[10px]">
                  Neu
                </Badge>
              ) : null}
            </p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatEuro(order.totals.total)}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} className="!px-2 text-[11px]" />
            <span className="truncate text-xs text-slate-500">
              {order.number} · {formatRelative(order.createdAt, now)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function LiveFeedCard({ now }: { now: Date }) {
  const { data, isLoading, error, refetch } = useAdminOrders(ALL_QUERY, { refetchInterval: 60_000 });
  const ids = useMemo(() => data?.map((o) => o.id), [data]);
  const fresh = useFreshIds(ids, 12_000);
  const latest = (data ?? []).slice(0, 6);
  const pending = (data ?? []).filter((o) => o.status === 'pending').length;
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Neue Bestellungen <LiveDot />
          </span>
        }
        subtitle={pending ? `${pending} warten auf Bestätigung` : 'Alles bestätigt'}
        icon={BellRing}
        action={
          <ButtonLink to="/admin/bestellungen" variant="ghost" size="sm" iconRight={ArrowRight}>
            Board
          </ButtonLink>
        }
      />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
      ) : !latest.length ? (
        <EmptyState icon={ClipboardList} title="Noch keine Bestellungen" description="Neue Bestellungen erscheinen hier sofort." className="py-8" />
      ) : (
        <ul className="-mx-2 -my-1 space-y-0.5">
          {latest.map((o) => (
            <FeedRow key={o.id} order={o} fresh={fresh.has(o.id)} now={now} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────────── Mini-Karte & Touren ─────────────────────────────

function MiniMapCard({ tours }: { tours: TourWithOrders[] | undefined }) {
  const settings = useSettings();
  const { data: drivers } = useAdminDrivers();
  const positions = usePositions((s) => s.byDriver);
  const { away, atStore } = useDriversAway(drivers, positions);
  const colors = useMemo(() => new Map((drivers ?? []).map((d) => [d.id, d.color])), [drivers]);
  const active = (tours ?? []).filter((t) => t.status === 'active');
  const fit = useMemo(() => {
    const pts = [toLatLng(settings.location)];
    for (const t of tours ?? []) for (const o of t.orders) if (o.address) pts.push(toLatLng(o.address));
    return pts;
  }, [tours, settings.location]);
  return (
    <Card padding="none" className="flex min-w-0 flex-col overflow-hidden">
      <div className="p-4 sm:p-5">
        <CardHeader
          className="mb-0"
          title="Fahrer live"
          icon={MapPinned}
          subtitle={
            active.length
              ? `${active.length} ${active.length === 1 ? 'Tour' : 'Touren'} unterwegs`
              : atStore.length
                ? `${atStore.length} Fahrer am Markt`
                : 'Keine Tour unterwegs'
          }
          action={
            <ButtonLink to="/admin/live" variant="ghost" size="sm" iconRight={ArrowRight}>
              Live-Karte
            </ButtonLink>
          }
        />
      </div>
      <div className="relative h-64 border-t border-slate-100 lg:h-auto lg:min-h-64 lg:flex-1">
        <BaseMap fitTo={fit} fitPadding={28} maxFitZoom={14} zoomControl={false}>
          <StoreMarker>
            {atStore.length ? (
              <LeafletTooltip direction="bottom" permanent offset={[0, 4]}>
                {atStore.length} Fahrer am Markt
              </LeafletTooltip>
            ) : null}
          </StoreMarker>
          {(tours ?? [])
            .filter((t) => t.status !== 'completed')
            .map((t) => (
              <TourLayer key={t.id} tour={t} color={colors.get(t.driverId) ?? '#1d58a0'} emphasis={t.status === 'active' ? 'normal' : 'faded'} showStops={t.status === 'active'} />
            ))}
          {away.map((d) => (
            <LiveDriverMarker key={d.id} driver={d} />
          ))}
        </BaseMap>
      </div>
    </Card>
  );
}

function TourRow({ tour }: { tour: TourWithOrders }) {
  const done = tour.stops.filter((s) => s.status === 'delivered' || s.status === 'failed').length;
  const next = tour.stops[tour.currentStopIndex];
  const nextOrder = next ? tour.orders.find((o) => o.id === next.orderId) : undefined;
  const crates = tour.orders.reduce((s, o) => s + orderCrates(o), 0);
  const tone = tour.status === 'active' ? 'brand' : tour.status === 'completed' ? 'success' : 'neutral';
  return (
    <li>
      <Link to={`/admin/touren?datum=${tour.date}&tour=${tour.id}`} className="block rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50">
        <div className="flex items-center gap-3">
          <Avatar name={tour.driver?.name ?? 'Fahrer'} color={tour.driver?.color} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{tour.name}</p>
            <p className="truncate text-xs text-slate-500">
              {tour.driver ? firstName(tour.driver.name) : 'Fahrer'} · {tour.stops.length} Stopps · {crates} Geb.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <Badge tone={tone}>{tour.simulation?.running ? 'Simulation' : TOUR_STATUS_LABEL[tour.status]}</Badge>
            <span className="text-[11px] tabular-nums text-slate-500">
              {tour.status === 'planned' && tour.plannedStart
                ? `Start ${tour.plannedStart} Uhr`
                : tour.status === 'active' && nextOrder && next?.eta
                  ? `Nächster ${formatTime(next.eta)} Uhr`
                  : tour.status === 'completed' && tour.finishedAt
                    ? `zurück ${formatTime(tour.finishedAt)} Uhr`
                    : ''}
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 pl-11">
          <ProgressBar value={done} max={tour.stops.length} color={tour.driver?.color} className="flex-1" />
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">
            {done}/{tour.stops.length}
          </span>
        </div>
      </Link>
    </li>
  );
}

function ToursCard({ tours, isLoading, now }: { tours: TourWithOrders[] | undefined; isLoading: boolean; now: Date }) {
  const today = todayString(now);
  const list = (tours ?? []).filter((t) => t.date === today || t.status === 'active');
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title="Touren heute"
        icon={RouteIcon}
        subtitle={list.length ? `${list.reduce((s, t) => s + t.stops.length, 0)} Stopps auf ${list.length} Touren` : formatDate(today, 'long')}
        action={
          <ButtonLink to="/admin/touren" variant="ghost" size="sm" iconRight={ArrowRight}>
            Planen
          </ButtonLink>
        }
      />
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !list.length ? (
        <EmptyState
          icon={RouteIcon}
          title="Keine Touren für heute"
          description="Planen Sie die offenen Lieferungen automatisch oder von Hand."
          action={
            <ButtonLink to="/admin/touren" size="sm" icon={RouteIcon}>
              Touren planen
            </ButtonLink>
          }
          className="py-6"
        />
      ) : (
        <ul className="-mx-2 -my-1 space-y-0.5">
          {list.map((t) => (
            <TourRow key={t.id} tour={t} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LowStockCard() {
  const { data: stats, isLoading } = useAdminStats(DAYS);
  const list = (stats?.lowStock ?? []).slice().sort((a, b) => a.stock / Math.max(1, a.minStock) - b.stock / Math.max(1, b.minStock));
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title="Meldebestand"
        icon={AlertTriangle}
        subtitle={list.length ? `${list.length} Artikel nachbestellen` : 'Alle Bestände im grünen Bereich'}
        action={
          <ButtonLink to="/admin/sortiment" variant="ghost" size="sm" iconRight={ArrowRight}>
            Sortiment
          </ButtonLink>
        }
      />
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !list.length ? (
        <EmptyState icon={PackageCheck} title="Kein Artikel unter Meldebestand" className="py-6" />
      ) : (
        <ul className="-mx-2 -my-1 max-h-80 space-y-0.5 overflow-y-auto">
          {list.slice(0, 8).map((p) => {
            const pct = Math.min(100, Math.round((p.stock / Math.max(1, p.minStock)) * 100));
            const critical = p.stock === 0 || pct < 40;
            return (
              <li key={p.id}>
                <Link to={`/admin/sortiment/${p.id}`} className="block rounded-xl px-2 py-2 transition-colors hover:bg-slate-50">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                      {p.brand} {p.name}
                    </p>
                    <span className={cn('shrink-0 text-xs font-bold tabular-nums', critical ? 'text-red-600' : 'text-amber-700')}>
                      {p.stock} / {p.minStock}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {p.packaging}
                    {p.location ? ` · ${p.location}` : ''}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn('h-full rounded-full', critical ? 'bg-red-500' : 'bg-amber-500')} style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function DashboardPage() {
  const now = useNow(30_000);
  const today = todayString(now);
  const toursQuery = useAdminTours(today);

  return (
    <>
      <PageHeader
        title={greeting(now)}
        documentTitle="Dashboard"
        subtitle={`${formatDate(today, 'long')} · Tagesgeschäft auf einen Blick`}
        actions={
          <>
            <ButtonLink to="/admin/touren" variant="primary" icon={RouteIcon}>
              Touren planen
            </ButtonLink>
            <ButtonLink to="/admin/abholungen" variant="outline" icon={ScanLine}>
              Abholung prüfen
            </ButtonLink>
            <ButtonLink to="/admin/sortiment" variant="outline" icon={Package}>
              Sortiment
            </ButtonLink>
          </>
        }
      />

      <KpiRow />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <RevenueCard />
        </div>
        <LiveFeedCard now={now} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <MiniMapCard tours={toursQuery.data} />
        <ToursCard tours={toursQuery.data} isLoading={toursQuery.isLoading} now={now} />
        <div className="lg:col-span-2 xl:col-span-1">
          <LowStockCard />
        </div>
      </div>
    </>
  );
}
