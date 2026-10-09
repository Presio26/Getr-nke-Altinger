/**
 * Markt: Tourenplanung/Disposition – ungeplante Lieferungen, Touren je Fahrer,
 * Reihenfolge, Optimierung, automatische Planung, Demo-Simulation und Karte.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ListPlus, Plus, Route as RouteIcon, Sparkles, Truck } from 'lucide-react';
import type { Driver, Order, TourWithOrders } from '@shared/types';
import { formatDate, formatDistance, formatDuration } from '@shared/format';
import { todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useApiMutation, useSettings } from '@/api/hooks';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  toast,
} from '@/components/ui';
import { BaseMap, HomeMarker, StoreMarker, toLatLng } from '@/components/map';
import { useAdminDrivers, useAdminOrders, useAdminTours, useSaveTour } from './ops/api';
import { useParamState } from './ops/hooks';
import { DAY_RE, DEFAULT_SIM_SPEED, OPEN_STATUSES, firstName, orderCrates, relDayInline } from './ops/model';
import { DayPicker } from './ops/components/DayPicker';
import { B2BIcon } from './ops/components/OrderBits';
import { AutoPlanModal } from './ops/components/AutoPlanModal';
import { TourCard } from './ops/components/TourCard';
import { TourEditorModal } from './ops/components/TourEditorModal';
import { LiveDriverMarker, TourLayer } from './ops/components/FleetLayers';

type Busy = { id: string; kind: 'optimize' | 'simulate' | 'stop' | 'delete' } | null;

// ───────────────────────────── Ungeplante Lieferungen ─────────────────────────────

function UnplannedPanel({
  orders,
  loading,
  selected,
  onToggle,
  onToggleAll,
  tours,
  onNewTour,
  onAddTo,
  adding,
  date,
}: {
  orders: Order[];
  loading: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  tours: TourWithOrders[];
  onNewTour: () => void;
  onAddTo: (tourId: string) => void;
  adding: boolean;
  date: string;
}) {
  const crates = orders.filter((o) => selected.includes(o.id)).reduce((s, o) => s + orderCrates(o), 0);
  const targets = tours.filter((t) => t.status !== 'completed' && !t.simulation?.running && t.date === date);
  return (
    <Card padding="none" className="flex min-h-0 flex-col overflow-hidden xl:max-h-[calc(100dvh-8.5rem)]">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-900">Ungeplante Lieferungen</h2>
        <div className="flex min-h-6 items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {orders.length} {orders.length === 1 ? 'Auftrag' : 'Aufträge'} · {orders.reduce((s, o) => s + orderCrates(o), 0)} Gebinde
          </p>
          {orders.length > 1 ? (
            <button type="button" onClick={onToggleAll} className="-my-1.5 -mr-2 min-h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
              {selected.length === orders.length ? 'Keine' : 'Alle'} wählen
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !orders.length ? (
          <EmptyState icon={CalendarCheck} title="Alles eingeplant" description="Alle offenen Lieferungen dieses Tages sind einer Tour zugeordnet." className="py-6 xl:py-10" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => {
              const checked = selected.includes(o.id);
              return (
                <li key={o.id}>
                  <label className={cn('flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50', checked && 'bg-brand-50/50 hover:bg-brand-50/70')}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(o.id)}
                      aria-label={`${o.number} auswählen`}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md accent-brand-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900">
                        {o.customerName}
                        <B2BIcon type={o.customerType} />
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500" title={o.address ? `${o.address.street}, ${o.address.zip} ${o.address.city}` : undefined}>
                        {o.number} · {o.address ? `${o.address.street}, ${o.address.zip}` : '–'}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">
                          {o.slot.start}–{o.slot.end}
                        </Badge>
                        <Badge tone="neutral">{orderCrates(o)} Geb.</Badge>
                        {o.status === 'pending' ? <Badge tone="info">unbestätigt</Badge> : null}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected.length ? (
        <div className="space-y-2 border-t border-slate-200 bg-white px-4 py-3 shadow-bar">
          <p className="text-xs font-medium text-slate-600">
            <strong className="text-slate-900">{selected.length}</strong> ausgewählt · {crates} Gebinde
          </p>
          <div className="flex gap-2">
            <Button size="sm" icon={Plus} onClick={onNewTour} className="flex-1">
              Neue Tour
            </Button>
            {targets.length ? (
              <Select
                aria-label="Zu bestehender Tour hinzufügen"
                value=""
                placeholder={adding ? 'Wird hinzugefügt …' : 'Zu Tour …'}
                disabled={adding}
                options={targets.map((t) => ({ value: t.id, label: `${t.name} (${t.driver ? firstName(t.driver.name) : ''})` }))}
                onChange={(e) => e.target.value && onAddTo(e.target.value)}
                containerClassName="min-w-0 flex-1"
                className="!h-9 text-sm"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ───────────────────────────── Karte ─────────────────────────────

function ToursMap({
  tours,
  drivers,
  unplanned,
  selectedId,
  onSelect,
}: {
  tours: TourWithOrders[];
  drivers: Map<string, Driver>;
  unplanned: Order[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const settings = useSettings();
  const selected = tours.find((t) => t.id === selectedId) ?? null;
  const fit = useMemo(() => {
    const pts = [toLatLng(settings.location)];
    const source = selected ? selected.orders : [...tours.flatMap((t) => t.orders), ...unplanned];
    for (const o of source) if (o.address) pts.push(toLatLng(o.address));
    return pts;
  }, [selected, tours, unplanned, settings.location]);
  const ordered = [...tours].sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));
  return (
    <Card padding="none" className="relative isolate h-72 overflow-hidden sm:h-96 lg:h-[26rem] xl:h-[calc(100dvh-8.5rem)]">
      <BaseMap fitTo={fit} fitPadding={44} maxFitZoom={15}>
        <StoreMarker />
        {ordered.map((t) => (
          <TourLayer
            key={t.id}
            tour={t}
            color={drivers.get(t.driverId)?.color ?? '#1d58a0'}
            emphasis={selectedId ? (t.id === selectedId ? 'strong' : 'faded') : 'normal'}
            showStops={t.id === selectedId}
          />
        ))}
        {unplanned.map((o) => (o.address ? <HomeMarker key={o.id} position={o.address} color="#64748b" label={`${o.number} · ${o.customerName} (ungeplant)`} /> : null))}
        {tours
          .filter((t) => t.status === 'active')
          .map((t) => {
            const d = drivers.get(t.driverId);
            return d ? <LiveDriverMarker key={d.id} driver={d} /> : null;
          })}
      </BaseMap>
      {tours.length ? (
        <div className="pointer-events-none absolute bottom-6 left-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
          {tours.map((t) => {
            const d = drivers.get(t.driverId);
            const active = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={cn(
                  'pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold shadow-card ring-1 backdrop-blur',
                  active ? 'text-slate-900 ring-brand-400' : 'text-slate-600 ring-slate-200 hover:text-slate-900',
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d?.color ?? '#1d58a0' }} aria-hidden />
                {d ? firstName(d.name) : t.name}
                {t.route ? <span className="hidden font-normal text-slate-500 sm:inline">{formatDistance(t.route.distance)}</span> : null}
              </button>
            );
          })}
          {unplanned.length ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-card ring-1 ring-slate-200">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden />
              {unplanned.length} ungeplant
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function ToursPage() {
  const now = useNow(60_000);
  const today = todayString(now);
  const [dateParam, setDateParam] = useParamState('datum', today);
  const date = DAY_RE.test(dateParam) ? dateParam : today;
  const [tourParam, setTourParam] = useParamState('tour', '');
  const qc = useQueryClient();

  const toursQuery = useAdminTours(date);
  const ordersQuery = useAdminOrders(useMemo(() => ({ date, fulfillment: 'delivery' as const }), [date]));
  const { data: driverList } = useAdminDrivers();
  const drivers = useMemo(() => new Map((driverList ?? []).map((d) => [d.id, d])), [driverList]);
  const tours = useMemo(() => toursQuery.data ?? [], [toursQuery.data]);

  const unplanned = useMemo(
    () =>
      (ordersQuery.data ?? [])
        .filter((o) => !o.tourId && OPEN_STATUSES.includes(o.status) && o.address)
        .sort((a, b) => a.slot.start.localeCompare(b.slot.start) || (a.address?.zip ?? '').localeCompare(b.address?.zip ?? '')),
    [ordersQuery.data],
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ tourId: string | null; preselected: string[] } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [savingTour, setSavingTour] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmDelete, setConfirmDelete] = useState<TourWithOrders | null>(null);

  // Auswahl bereinigen, wenn Aufträge eingeplant wurden oder der Tag wechselt
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => unplanned.some((o) => o.id === id)));
  }, [unplanned]);

  const selectedTourId = tours.some((t) => t.id === tourParam) ? tourParam : (tours.find((t) => t.status === 'active') ?? tours[0])?.id ?? null;

  const save = useSaveTour();
  const optimize = useApiMutation((tour: TourWithOrders) => api.adminOptimizeTour(tour.id), {
    invalidate: [qk.admin],
    onSuccess: (t, before) => {
      // Vorher/Nachher vergleichen – der Core übernimmt nur echte Verbesserungen
      const savedM = before.route && t.route ? before.route.distance - t.route.distance : 0;
      const savedS = before.route && t.route ? before.route.duration - t.route.duration : 0;
      const changed = before.stops.map((s) => s.orderId).join('|') !== t.stops.map((s) => s.orderId).join('|');
      const parts = [savedM >= 50 ? formatDistance(savedM) : null, savedS >= 60 ? formatDuration(savedS) : null].filter(Boolean);
      if (changed && parts.length) {
        toast.success(`„${t.name}“ optimiert`, { description: `${parts.join(' / ')} kürzer – neue Reihenfolge übernommen.` });
      } else {
        toast.info('Die Reihenfolge ist bereits optimal', { description: `„${t.name}“ bleibt unverändert.` });
      }
    },
  });
  const [autoPlanOpen, setAutoPlanOpen] = useState(false);
  const onAutoPlanned = (created: TourWithOrders[]) => {
    setAutoPlanOpen(false);
    if (!created.length) toast.info('Keine bestätigten Lieferungen ohne Tour', { description: 'Es gab nichts automatisch zu planen.' });
    else
      toast.success(created.length === 1 ? '1 Tour automatisch geplant' : `${created.length} Touren automatisch geplant`, {
        description: created.map((t) => `${t.driver ? firstName(t.driver.name) : t.name}: ${t.stops.length} ${t.stops.length === 1 ? 'Stopp' : 'Stopps'}`).join(' · '),
      });
    if (created[0]) setTourParam(created[0].id);
  };
  const simulate = useApiMutation((tour: TourWithOrders) => api.simulateTour(tour.id, { speedFactor: DEFAULT_SIM_SPEED, autoComplete: true }), {
    invalidate: [qk.admin],
    onSuccess: (t) => {
      toast.success(`Simulation „${t.name}“ läuft`, {
        description: `Zeitraffer ${DEFAULT_SIM_SPEED}× – verfolgen Sie die Fahrt auf der Live-Karte.`,
        href: '/admin/live',
        actionLabel: 'Live-Karte öffnen',
      });
    },
  });
  const stopSim = useApiMutation((tour: TourWithOrders) => api.stopSimulation(tour.id), { invalidate: [qk.admin], success: 'Simulation gestoppt' });
  const remove = useApiMutation((tour: TourWithOrders) => api.adminDeleteTour(tour.id), {
    invalidate: [qk.admin],
    success: (_r, t) => `„${t.name}“ gelöscht – Aufträge sind wieder ungeplant`,
  });

  const run = (kind: NonNullable<Busy>['kind'], tour: TourWithOrders, m: { mutate: (v: TourWithOrders, o?: { onSettled?: () => void }) => void }) => {
    setBusy({ id: tour.id, kind });
    m.mutate(tour, { onSettled: () => setBusy(null) });
  };

  const saveOrder = (tour: TourWithOrders, orderIds: string[], message?: string) => {
    setOverrides((o) => ({ ...o, [tour.id]: orderIds }));
    setSavingTour(tour.id);
    save.mutate(
      { id: tour.id, date: tour.date, driverId: tour.driverId, orderIds },
      {
        onSuccess: () => {
          if (message) toast.success(message);
        },
        onSettled: () => {
          setSavingTour(null);
          setOverrides((o) => {
            const next = { ...o };
            delete next[tour.id];
            return next;
          });
        },
      },
    );
  };

  const move = (tour: TourWithOrders, orderId: string, dir: -1 | 1) => {
    const ids = overrides[tour.id] ?? tour.stops.map((s) => s.orderId);
    const i = ids.indexOf(orderId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(tour, next);
  };

  const addSelectedTo = (tourId: string) => {
    const tour = tours.find((t) => t.id === tourId);
    if (!tour) return;
    const ids = [...tour.stops.map((s) => s.orderId), ...selected];
    const n = selected.length;
    setSelected([]);
    setTourParam(tour.id);
    saveOrder(tour, ids, `${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} zu „${tour.name}“ hinzugefügt`);
  };

  const loading = toursQuery.isLoading || ordersQuery.isLoading;
  const totalStops = tours.reduce((s, t) => s + t.stops.length, 0);
  const isPast = date < today;
  const editorTour = editor?.tourId ? tours.find((t) => t.id === editor.tourId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Tourenplanung"
        documentTitle="Touren"
        subtitle={`${formatDate(date, 'long')} · ${tours.length} ${tours.length === 1 ? 'Tour' : 'Touren'} mit ${totalStops} Stopps · ${unplanned.length} ungeplant`}
        actions={
          <>
            <Button
              variant="accent"
              icon={Sparkles}
              disabled={!unplanned.length || isPast}
              onClick={() => setAutoPlanOpen(true)}
              title={unplanned.length ? 'Offene Lieferungen automatisch auf verfügbare Fahrer verteilen' : 'Keine ungeplanten Lieferungen'}
            >
              Automatisch planen
            </Button>
            <Button icon={Plus} onClick={() => setEditor({ tourId: null, preselected: selected })} disabled={isPast}>
              Neue Tour
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <DayPicker value={date} onChange={(d) => setDateParam(d === today ? '' : d)} />
        {toursQuery.isFetching && !toursQuery.isLoading ? <span className="text-xs text-slate-400">wird aktualisiert …</span> : null}
      </div>

      {toursQuery.error ? (
        <Card>
          <ErrorState error={toursQuery.error} onRetry={() => void toursQuery.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-w-0 lg:row-span-2 xl:sticky xl:top-24 xl:row-span-1 xl:self-start">
            <UnplannedPanel
              orders={unplanned}
              loading={loading}
              selected={selected}
              onToggle={(id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
              onToggleAll={() => setSelected((prev) => (prev.length === unplanned.length ? [] : unplanned.map((o) => o.id)))}
              tours={tours}
              date={date}
              onNewTour={() => setEditor({ tourId: null, preselected: selected })}
              onAddTo={addSelectedTo}
              adding={save.isPending}
            />
          </div>

          <div className="order-first min-w-0 lg:order-none lg:col-start-2 xl:sticky xl:top-24 xl:col-start-3 xl:row-start-1 xl:self-start">
            <ToursMap tours={tours} drivers={drivers} unplanned={unplanned} selectedId={selectedTourId} onSelect={setTourParam} />
          </div>

          <div className="min-w-0 space-y-4 lg:col-start-2 xl:row-start-1">
            {loading ? (
              <>
                <Skeleton className="h-80 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </>
            ) : !tours.length ? (
              <Card>
                <EmptyState
                  icon={RouteIcon}
                  title="Noch keine Touren"
                  description={
                    unplanned.length
                      ? `Für ${relDayInline(date)} warten ${unplanned.length} Lieferungen auf eine Tour. Planen Sie automatisch oder stellen Sie eine Tour von Hand zusammen.`
                      : 'Für diesen Tag gibt es keine Lieferungen.'
                  }
                  action={
                    unplanned.length && !isPast ? (
                      <>
                        <Button variant="accent" icon={Sparkles} onClick={() => setAutoPlanOpen(true)}>
                          Automatisch planen
                        </Button>
                        <Button variant="outline" icon={ListPlus} onClick={() => setEditor({ tourId: null, preselected: [] })}>
                          Tour zusammenstellen
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              tours.map((t) => (
                <TourCard
                  key={t.id}
                  tour={t}
                  driver={drivers.get(t.driverId)}
                  selected={t.id === selectedTourId}
                  orderIds={overrides[t.id]}
                  saving={savingTour === t.id}
                  busy={busy?.id === t.id ? busy.kind : null}
                  onSelect={() => setTourParam(t.id)}
                  onMove={(id, dir) => move(t, id, dir)}
                  onRemove={(o) =>
                    saveOrder(
                      t,
                      (overrides[t.id] ?? t.stops.map((s) => s.orderId)).filter((id) => id !== o.id),
                      `${o.number} aus „${t.name}“ entfernt`,
                    )
                  }
                  onEdit={() => setEditor({ tourId: t.id, preselected: [] })}
                  onOptimize={() => run('optimize', t, optimize)}
                  onSimulate={() => run('simulate', t, simulate)}
                  onStopSimulation={() => run('stop', t, stopSim)}
                  onDelete={() => setConfirmDelete(t)}
                />
              ))
            )}
            {tours.some((t) => t.status === 'active') ? (
              <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
                <Truck size={14} aria-hidden /> Laufende Touren: erledigte Stopps sind fixiert, offene Stopps können noch umsortiert werden.
              </p>
            ) : null}
          </div>
        </div>
      )}

      <AutoPlanModal open={autoPlanOpen} onClose={() => setAutoPlanOpen(false)} date={date} unplanned={unplanned} onApplied={onAutoPlanned} />

      <TourEditorModal
        open={!!editor}
        onClose={() => setEditor(null)}
        date={date}
        drivers={driverList ?? []}
        tour={editorTour}
        unplanned={unplanned}
        preselected={editor?.preselected}
        tours={tours}
        onSaved={(id) => {
          setSelected([]);
          setTourParam(id);
          void qc.invalidateQueries({ queryKey: qk.adminTours(date) });
        }}
      />

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          const t = confirmDelete;
          if (!t) return;
          setBusy({ id: t.id, kind: 'delete' });
          remove.mutate(t, {
            onSettled: () => {
              setBusy(null);
              setConfirmDelete(null);
            },
          });
        }}
        loading={remove.isPending}
        tone="danger"
        title={confirmDelete ? `„${confirmDelete.name}“ löschen?` : ''}
        message={confirmDelete ? `Die ${confirmDelete.stops.length} Aufträge werden wieder als ungeplant geführt. Die Tour verschwindet auch aus der Fahrer-App.` : undefined}
        confirmLabel="Tour löschen"
      />
    </>
  );
}
