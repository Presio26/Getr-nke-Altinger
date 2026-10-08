/**
 * Markt: Live-Karte aller Fahrer – Positionen in Echtzeit, aktive Routen mit Stopps,
 * Fahrerliste mit nächstem Stopp/ETA, Folgen-Modus und Demo-Simulation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { Crosshair, Gauge, Layers, LocateFixed, MapPin, Navigation, Play, Route as RouteIcon, Square, Store, Truck } from 'lucide-react';
import type { Driver, TourWithOrders } from '@shared/types';
import { DRIVER_STATUS_LABEL, TOUR_STATUS_LABEL, formatTime } from '@shared/format';
import { todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useSettings } from '@/api/hooks';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDriverPosition, usePositions } from '@/stores/positions';
import { Avatar, Badge, Button, EmptyState, ErrorState, SegmentedControl, Skeleton, Switch, errorMessage, toast, type BadgeTone } from '@/components/ui';
import { BaseMap, StoreMarker, ZoneCircles, toLatLng } from '@/components/map';
import { useAdminDrivers, useAdminTours } from './ops/api';
import { DEFAULT_SIM_SPEED, firstName, formatAgo, minutesUntil } from './ops/model';
import { LiveDot, ProgressBar } from './ops/components/OrderBits';
import { LiveDriverMarker, TourLayer, useDriversAway } from './ops/components/FleetLayers';

const DRIVER_TONE: Record<Driver['status'], BadgeTone> = { off: 'neutral', available: 'success', on_tour: 'brand', break: 'warning' };
const SPEEDS = [4, 8, 16];

/** aktuelle bzw. nächste Tour eines Fahrers */
function tourFor(driverId: string, tours: TourWithOrders[]): TourWithOrders | undefined {
  const mine = tours.filter((t) => t.driverId === driverId);
  return (
    mine.find((t) => t.status === 'active') ??
    mine.filter((t) => t.status === 'planned').sort((a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? ''))[0] ??
    mine.filter((t) => t.status === 'completed').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0]
  );
}

/** "vor 3 s" – tickt sekündlich, ohne die Karte neu zu zeichnen */
function Ago({ iso }: { iso?: string }) {
  const now = useNow(1000);
  return <>{formatAgo(iso, now)}</>;
}

function EtaIn({ iso }: { iso?: string }) {
  const now = useNow(5000);
  const min = minutesUntil(iso, now);
  if (min === null) return null;
  if (min <= 0) return <span className="font-semibold text-emerald-700">jetzt</span>;
  return <span>in {min} Min.</span>;
}

// ───────────────────────────── Karte: Folgen ─────────────────────────────

function FollowController({ driverId, onStop }: { driverId: string | null; onStop: () => void }) {
  const map = useMap();
  const pos = usePositions((s) => (driverId ? s.byDriver[driverId] : undefined));
  const stopRef = useRef(onStop);
  stopRef.current = onStop;
  useEffect(() => {
    if (!driverId) return;
    const stop = () => stopRef.current();
    map.on('dragstart', stop);
    return () => {
      map.off('dragstart', stop);
    };
  }, [map, driverId]);
  useEffect(() => {
    if (!driverId || !pos) return;
    if (map.getZoom() < 15) map.setView([pos.lat, pos.lng], 16, { animate: true });
    else map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.9 });
  }, [map, driverId, pos]);
  return null;
}

// ───────────────────────────── Fahrerliste ─────────────────────────────

function DriverCard({
  driver,
  tour,
  following,
  onFollow,
  onFocus,
  onSimulate,
  onStop,
  busy,
}: {
  driver: Driver;
  tour?: TourWithOrders;
  following: boolean;
  onFollow: () => void;
  onFocus: () => void;
  onSimulate: (t: TourWithOrders) => void;
  onStop: (t: TourWithOrders) => void;
  busy: boolean;
}) {
  const pos = useDriverPosition(driver.id, driver.position);
  const next = tour && tour.status === 'active' ? tour.stops[tour.currentStopIndex] : undefined;
  const nextOrder = next ? tour?.orders.find((o) => o.id === next.orderId) : undefined;
  const done = tour ? tour.stops.filter((s) => s.status === 'delivered' || s.status === 'failed').length : 0;
  const sim = !!tour?.simulation?.running;
  // Simulation: Geschwindigkeit ohne Zeitraffer anzeigen
  const factor = pos?.simulated ? Math.max(1, tour?.simulation?.speedFactor ?? 1) : 1;
  const kmh = pos?.speed !== undefined ? Math.round((pos.speed * 3.6) / factor) : null;
  const returning = tour?.status === 'active' && tour.currentStopIndex >= tour.stops.length;

  return (
    <li
      className={cn(
        'rounded-2xl border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.05)] transition-[border-color,box-shadow]',
        following ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200/80',
      )}
    >
      <button type="button" onClick={onFocus} className="flex w-full items-center gap-3 text-left" title="Auf der Karte zeigen">
        <Avatar name={driver.name} color={driver.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{driver.name}</p>
          <p className="truncate text-xs text-slate-500">{driver.vehicle}</p>
        </div>
        <Badge tone={DRIVER_TONE[driver.status]} className="shrink-0">
          {DRIVER_STATUS_LABEL[driver.status]}
        </Badge>
      </button>

      {tour ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-200/60">
          <div className="flex items-center justify-between gap-2 text-xs">
            <Link to={`/admin/touren?datum=${tour.date}&tour=${tour.id}`} className="min-w-0 truncate font-semibold text-slate-800 hover:text-brand-700 hover:underline">
              {tour.name}
            </Link>
            <span className="shrink-0 text-slate-500">
              {tour.status === 'planned' ? `Start ${tour.plannedStart ?? '–'} Uhr` : `${done}/${tour.stops.length} Stopps`}
            </span>
          </div>
          {tour.status !== 'planned' ? <ProgressBar value={done} max={tour.stops.length} color={driver.color} className="mt-2" /> : null}
          {nextOrder && next ? (
            <div className="mt-2.5 flex items-start gap-2 text-sm">
              <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">
                  {tour.currentStopIndex + 1}. {nextOrder.customerName}
                </p>
                <p className="truncate text-xs text-slate-500">{nextOrder.address ? `${nextOrder.address.street}, ${nextOrder.address.zip}` : ''}</p>
              </div>
              {next.eta ? (
                <div className="shrink-0 text-right text-xs">
                  <p className="font-semibold tabular-nums text-slate-900">{next.status === 'arrived' ? 'vor Ort' : `${formatTime(next.eta)} Uhr`}</p>
                  {next.status !== 'arrived' ? (
                    <p className="text-slate-500">
                      <EtaIn iso={next.eta} />
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : returning ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <Store size={14} aria-hidden className="text-slate-400" /> Alle Stopps erledigt – Rückfahrt zum Markt
            </p>
          ) : tour.status === 'completed' ? (
            <p className="mt-1 text-xs text-slate-500">{TOUR_STATUS_LABEL.completed}{tour.finishedAt ? ` um ${formatTime(tour.finishedAt)} Uhr` : ''}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Heute keine Tour zugeordnet.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1" title="Letzte Positionsmeldung">
          <Navigation size={12} aria-hidden />
          <Ago iso={pos?.timestamp} />
        </span>
        {kmh !== null && kmh > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Gauge size={12} aria-hidden />
            {kmh} km/h
          </span>
        ) : null}
        {pos?.simulated ? <Badge tone="accent">simuliert</Badge> : null}
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant={following ? 'primary' : 'outline'} icon={following ? LocateFixed : Crosshair} onClick={onFollow} disabled={!pos} className="flex-1">
          {following ? 'Folgt' : 'Folgen'}
        </Button>
        {tour && tour.status !== 'completed' ? (
          sim ? (
            <Button size="sm" variant="secondary" icon={Square} onClick={() => onStop(tour)} loading={busy} className="flex-1">
              Stoppen
            </Button>
          ) : (
            <Button size="sm" variant="secondary" icon={Play} onClick={() => onSimulate(tour)} loading={busy} disabled={!tour.stops.length} className="flex-1">
              Simulieren
            </Button>
          )
        ) : null}
      </div>
    </li>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function LiveMapPage() {
  const settings = useSettings();
  const qc = useQueryClient();
  const today = todayString();
  const { data: drivers, isLoading: driversLoading, error: driversError, refetch } = useAdminDrivers();
  const toursQuery = useAdminTours(today);
  const tours = useMemo(() => toursQuery.data ?? [], [toursQuery.data]);
  const positions = usePositions((s) => s.byDriver);
  const { away, atStore } = useDriversAway(drivers, positions);
  const [follow, setFollow] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [showPlanned, setShowPlanned] = useState(true);
  const [speed, setSpeed] = useState(String(DEFAULT_SIM_SPEED));
  const [busyTour, setBusyTour] = useState<string | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const colors = useMemo(() => new Map((drivers ?? []).map((d) => [d.id, d.color])), [drivers]);

  const fit = useMemo(() => {
    const pts = [toLatLng(settings.location)];
    for (const t of tours) if (t.status !== 'completed') for (const o of t.orders) if (o.address) pts.push(toLatLng(o.address));
    return pts;
  }, [tours, settings.location]);

  const startable = tours.filter((t) => t.status !== 'completed' && !t.simulation?.running && t.stops.length);
  const running = tours.filter((t) => t.simulation?.running);
  const activeCount = tours.filter((t) => t.status === 'active').length;

  const simOne = useMutation({
    mutationFn: async ({ tour, stop }: { tour: TourWithOrders; stop?: boolean }) =>
      stop ? api.stopSimulation(tour.id) : api.simulateTour(tour.id, { speedFactor: Number(speed), autoComplete: true }),
    onMutate: ({ tour }) => setBusyTour(tour.id),
    onSettled: () => setBusyTour(null),
    onSuccess: async (t, { stop }) => {
      await qc.invalidateQueries({ queryKey: qk.admin });
      if (stop) toast.success(`Simulation „${t.name}“ gestoppt`);
      else {
        toast.success(`Simulation „${t.name}“ läuft`, { description: `Zeitraffer ${speed}× · Stopps werden automatisch zugestellt.` });
        setFollow(t.driverId);
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const simAll = useMutation({
    mutationFn: async (stop: boolean) => {
      const list = stop ? running : startable;
      const results = await Promise.allSettled(
        list.map((t) => (stop ? api.stopSimulation(t.id) : api.simulateTour(t.id, { speedFactor: Number(speed), autoComplete: true }))),
      );
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      return { ok: results.length - failed.length, failed: failed.map((f) => errorMessage(f.reason)) };
    },
    onSuccess: async ({ ok, failed }, stop) => {
      await qc.invalidateQueries({ queryKey: qk.admin });
      if (ok) toast.success(stop ? `${ok} ${ok === 1 ? 'Simulation' : 'Simulationen'} gestoppt` : `${ok} ${ok === 1 ? 'Tour fährt' : 'Touren fahren'} jetzt im Zeitraffer ${speed}×`);
      if (failed.length) toast.warning(`${failed.length} nicht möglich`, { description: failed[0] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const focusDriver = (d: Driver) => {
    const p = usePositions.getState().byDriver[d.id] ?? d.position;
    if (p && mapRef.current) mapRef.current.flyTo([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 15), { duration: 0.8 });
  };

  const sortedDrivers = useMemo(() => {
    const order: Record<Driver['status'], number> = { on_tour: 0, available: 1, break: 2, off: 3 };
    return [...(drivers ?? [])].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  }, [drivers]);

  return (
    <div className="-mx-4 -my-5 flex flex-col sm:-mx-6 sm:-my-7 lg:-mx-8 lg:h-[calc(100dvh-4rem-env(safe-area-inset-top))] lg:flex-row">
      {/* Karte */}
      <div className="relative h-[58dvh] min-h-80 lg:order-2 lg:h-auto lg:flex-1">
        <BaseMap fitTo={fit} fitPadding={56} maxFitZoom={15} onReady={(m) => (mapRef.current = m)}>
          {showZones ? <ZoneCircles zones={settings.zones} /> : null}
          <StoreMarker>
            {atStore.length ? (
              <LeafletTooltip direction="bottom" permanent offset={[0, 4]}>
                {atStore.length === 1 ? `${firstName(atStore[0].name)} am Markt` : `${atStore.length} Fahrer am Markt`}
              </LeafletTooltip>
            ) : null}
          </StoreMarker>
          {tours
            .filter((t) => t.status === 'active' || (showPlanned && t.status === 'planned'))
            .sort((a, b) => (a.status === 'active' ? 1 : 0) - (b.status === 'active' ? 1 : 0))
            .map((t) => (
              <TourLayer
                key={t.id}
                tour={t}
                color={colors.get(t.driverId) ?? '#1d58a0'}
                emphasis={t.status === 'active' ? 'strong' : 'faded'}
                showStops={t.status === 'active'}
              />
            ))}
          {away.map((d) => (
            <LiveDriverMarker key={d.id} driver={d} />
          ))}
          <FollowController driverId={follow} onStop={() => setFollow(null)} />
        </BaseMap>

        {/* Karten-Overlays */}
        <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/95 px-3 py-1.5 shadow-card ring-1 ring-slate-200 backdrop-blur">
            <Layers size={16} aria-hidden className="text-slate-400" />
            <Switch checked={showZones} onChange={setShowZones} ariaLabel="Liefergebiete anzeigen" />
            <span className="text-xs font-medium text-slate-700">Gebiete</span>
            <Switch checked={showPlanned} onChange={setShowPlanned} ariaLabel="Geplante Routen anzeigen" />
            <span className="text-xs font-medium text-slate-700">Geplant</span>
          </div>
          {follow ? (
            <button
              type="button"
              onClick={() => setFollow(null)}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-raised"
            >
              <LocateFixed size={14} aria-hidden />
              Folgt {firstName(drivers?.find((d) => d.id === follow)?.name ?? '')} · beenden
            </button>
          ) : null}
        </div>
      </div>

      {/* Seitenleiste */}
      <aside className="min-w-0 border-slate-200 bg-slate-50 lg:order-1 lg:w-[23rem] lg:shrink-0 lg:overflow-y-auto lg:border-r xl:w-[25rem]">
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
                Flotte live <LiveDot />
              </h1>
              <p className="text-sm text-slate-500">
                {activeCount ? `${activeCount} ${activeCount === 1 ? 'Tour' : 'Touren'} unterwegs` : 'Keine Tour unterwegs'} · {drivers?.length ?? 0} Fahrer
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 to-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.05)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-brand-950">
                <Truck size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Demo-Simulation</p>
                <p className="text-xs text-slate-600">Touren fahren im Zeitraffer, Stopps werden automatisch zugestellt.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SegmentedControl aria-label="Zeitraffer" size="sm" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))} />
              {running.length ? (
                <Button size="sm" variant="outline" icon={Square} loading={simAll.isPending} onClick={() => simAll.mutate(true)} className="flex-1">
                  {running.length === 1 ? 'Simulation stoppen' : `Alle ${running.length} stoppen`}
                </Button>
              ) : null}
              {startable.length || !running.length ? (
                <Button
                  size="sm"
                  variant="accent"
                  icon={Play}
                  loading={simAll.isPending}
                  disabled={!startable.length}
                  onClick={() => simAll.mutate(false)}
                  className="flex-1"
                  title={startable.length ? undefined : 'Für heute gibt es keine Tour, die gestartet werden kann'}
                >
                  {startable.length ? `${startable.length} ${startable.length === 1 ? 'Tour' : 'Touren'} starten` : 'Keine Tour geplant'}
                </Button>
              ) : null}
            </div>
          </section>

          {driversError ? (
            <ErrorState error={driversError} onRetry={() => void refetch()} className="py-6" />
          ) : driversLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : !sortedDrivers.length ? (
            <EmptyState icon={Truck} title="Keine Fahrer angelegt" />
          ) : (
            <ul className="space-y-3" aria-label="Fahrer">
              {sortedDrivers.map((d) => {
                const tour = tourFor(d.id, tours);
                return (
                  <DriverCard
                    key={d.id}
                    driver={d}
                    tour={tour}
                    following={follow === d.id}
                    onFollow={() => setFollow((f) => (f === d.id ? null : d.id))}
                    onFocus={() => focusDriver(d)}
                    onSimulate={(t) => simOne.mutate({ tour: t })}
                    onStop={(t) => simOne.mutate({ tour: t, stop: true })}
                    busy={!!tour && busyTour === tour.id}
                  />
                );
              })}
            </ul>
          )}

          <p className="flex items-start gap-2 px-1 pb-2 text-xs leading-relaxed text-slate-500">
            <RouteIcon size={14} aria-hidden className="mt-0.5 shrink-0" />
            Positionen kommen in Echtzeit vom Fahrer-Handy (bzw. aus der Simulation). Ziehen Sie die Karte, um den Folgen-Modus zu beenden.
          </p>
        </div>
      </aside>
    </div>
  );
}
