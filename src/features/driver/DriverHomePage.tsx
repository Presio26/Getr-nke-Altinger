import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Clock,
  Coffee,
  Flag,
  MapPin,
  MessageSquare,
  Moon,
  Navigation,
  Package,
  Route,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { DriverStatus, TourWithOrders } from '@shared/types';
import { DRIVER_STATUS_LABEL, formatDate, formatDistance, formatDuration, formatEuro, formatTime, TOUR_STATUS_LABEL } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation, useDriverToday, useNotifications } from '@/api/hooks';
import { useDocumentTitle, useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Skeleton, Spinner, toast, type BadgeTone } from '@/components/ui';
import { NotificationItem } from '@/components/layout';
import { currentStopIndex, firstName, greeting, isStopDone, plural, sumStats, tourStats } from './lib/driverUtils';
import { ProgressBar, StopNumber } from './components/StopBits';
import { SimulationWaitNotice } from './components/TourControls';
import { RoutePreview } from './components/TourMap';

const TOUR_TONE: Record<TourWithOrders['status'], BadgeTone> = { planned: 'brand', active: 'accent', completed: 'success' };

interface StatusOption {
  value: DriverStatus;
  label: string;
  icon: LucideIcon;
  active: string;
  disabled?: boolean;
}

const STATUS_STYLE: Record<DriverStatus, string> = {
  available: 'bg-emerald-600 text-white ring-emerald-700 shadow-emerald-900/20',
  on_tour: 'bg-accent-500 text-brand-950 ring-accent-600 shadow-accent-800/20',
  break: 'bg-sky-600 text-white ring-sky-700 shadow-sky-900/20',
  off: 'bg-slate-700 text-white ring-slate-800 shadow-slate-900/20',
};

const STATUS_HINT: Record<DriverStatus, string> = {
  available: 'Sie sind einsatzbereit und können Touren erhalten.',
  on_tour: 'Sie sind auf Tour. Feierabend ist nach dem Tourende möglich.',
  break: 'Pause – der Markt sieht Sie als nicht verfügbar.',
  off: 'Feierabend – Sie erhalten heute keine weiteren Touren.',
};

const KPI_TONE = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-600',
  accent: 'bg-accent-100 text-accent-700',
  neutral: 'bg-slate-100 text-slate-600',
} as const;

/** Kompakte Kennzahl (gut lesbar, wenig Platz – Handy zuerst) */
function Kpi({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone: keyof typeof KPI_TONE }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-card sm:p-4">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', KPI_TONE[tone])}>
        <Icon size={20} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-slate-500">{label}</p>
        <p className="truncate text-[1.375rem] font-bold leading-tight tracking-tight text-slate-900 tabular-nums">{value}</p>
        {hint ? <p className="truncate text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function StatusSwitcher({ status, hasActiveTour }: { status: DriverStatus; hasActiveTour: boolean }) {
  const mutation = useApiMutation((s: DriverStatus) => api.setDriverStatus(s), {
    invalidate: [qk.driverToday],
    onSuccess: (d) => {
      toast.success(`Status: ${DRIVER_STATUS_LABEL[d.status]}`, { id: 'driver-status', duration: 2500 });
    },
  });
  const options: StatusOption[] = hasActiveTour
    ? [
        { value: 'on_tour', label: 'Auf Tour', icon: Truck, active: STATUS_STYLE.on_tour },
        { value: 'break', label: 'Pause', icon: Coffee, active: STATUS_STYLE.break },
        { value: 'off', label: 'Feierabend', icon: Moon, active: STATUS_STYLE.off, disabled: true },
      ]
    : [
        { value: 'available', label: 'Verfügbar', icon: CircleCheck, active: STATUS_STYLE.available },
        { value: 'break', label: 'Pause', icon: Coffee, active: STATUS_STYLE.break },
        { value: 'off', label: 'Feierabend', icon: Moon, active: STATUS_STYLE.off },
      ];
  const pending = mutation.isPending ? mutation.variables : null;

  return (
    <Card>
      <CardHeader title="Ihr Status" subtitle={STATUS_HINT[status]} className="mb-3" />
      <div role="radiogroup" aria-label="Fahrerstatus" className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const selected = o.value === status;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.disabled || mutation.isPending}
              onClick={() => !selected && mutation.mutate(o.value)}
              className={cn(
                'flex h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-[15px] font-semibold ring-1 ring-inset transition-[background-color,box-shadow,transform] active:scale-[0.98]',
                selected ? cn(o.active, 'shadow-md') : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100',
                o.disabled && !selected && 'opacity-45',
              )}
            >
              {pending === o.value ? <Spinner size={22} className="text-current" /> : <o.icon size={22} aria-hidden />}
              <span className="leading-none">{o.label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function TourCard({ tour, now }: { tour: TourWithOrders; now: Date }) {
  const stats = tourStats(tour);
  const idx = currentStopIndex(tour);
  const nextStop = idx >= 0 ? tour.stops[idx] : undefined;
  const nextOrder = nextStop ? tour.orders.find((o) => o.id === nextStop.orderId) : undefined;
  const active = tour.status === 'active';
  const done = tour.status === 'completed';

  let timing: string;
  if (done && tour.finishedAt) timing = `Beendet um ${formatTime(tour.finishedAt)} Uhr`;
  else if (active && tour.startedAt) timing = `Gestartet um ${formatTime(tour.startedAt)} Uhr`;
  else if (tour.plannedStart) timing = `Geplanter Start ${tour.plannedStart} Uhr`;
  else timing = formatDate(tour.date, 'relative', now);

  return (
    <Link
      to={`/fahrer/tour/${tour.id}`}
      className={cn(
        'group block rounded-2xl border bg-white p-4 shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:shadow-raised active:translate-y-0 sm:p-5',
        active ? 'border-accent-400 ring-2 ring-accent-300/70' : 'border-slate-200/70',
      )}
    >
      {tour.route?.legs.length ? <RoutePreview tour={tour} className="-mx-5 -mt-5 mb-4 hidden h-52 rounded-t-2xl border-b border-slate-100 lg:block" /> : null}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
            active ? 'bg-accent-500 text-brand-950' : done ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-700',
          )}
        >
          {done ? <CheckCircle2 size={24} aria-hidden /> : <Truck size={24} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-lg font-bold leading-snug text-slate-900">{tour.name}</h3>
            <Badge tone={TOUR_TONE[tour.status]} solid={active}>
              {TOUR_STATUS_LABEL[tour.status]}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Clock size={14} aria-hidden className="shrink-0" />
            {timing}
          </p>
        </div>
        <ChevronRight size={22} aria-hidden className="mt-3 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 text-center ring-1 ring-inset ring-slate-100">
        {(
          [
            ['Stopps', String(stats.stops)],
            ['Gebinde', String(stats.crates)],
            ['Strecke', tour.route ? formatDistance(tour.route.distance) : '–'],
            ['Fahrzeit', tour.route ? formatDuration(tour.route.duration) : '–'],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
            <dd className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600">
            {stats.done} von {stats.stops} Stopps erledigt
          </span>
          <span className="flex items-center gap-1" aria-hidden>
            {tour.stops.map((s, i) => (
              <StopNumber key={s.orderId} index={i + 1} status={s.status} size="sm" className="h-6 w-6 text-[11px]" />
            ))}
          </span>
        </div>
        <ProgressBar value={stats.progress} tone={done ? 'success' : active ? 'accent' : 'brand'} />
      </div>

      {active && nextOrder && nextStop ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-900 p-3 text-white">
          <StopNumber index={idx + 1} status={nextStop.status} surface="dark" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-300">
              {nextStop.status === 'arrived' ? 'Sie sind vor Ort' : 'Nächster Stopp'}
              {nextStop.eta && nextStop.status === 'pending' ? ` · ca. ${formatTime(nextStop.eta)} Uhr` : ''}
            </p>
            <p className="truncate text-[15px] font-semibold">{nextOrder.customerName}</p>
            <p className="truncate text-sm text-white/70">{nextOrder.address?.street}</p>
          </div>
          <Navigation size={20} aria-hidden className="shrink-0 text-accent-300" />
        </div>
      ) : null}

      <div
        className={cn(
          'mt-4 flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors',
          active ? 'bg-accent-500 text-brand-950 group-hover:bg-accent-400' : done ? 'bg-slate-100 text-slate-700' : 'bg-brand-700 text-white group-hover:bg-brand-800',
        )}
      >
        {active ? 'Weiter zur Tour' : done ? 'Tour ansehen' : 'Tour öffnen'}
        <ArrowRight size={19} aria-hidden />
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-6 lg:space-y-0" aria-busy>
      <div className="space-y-5">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function MarketMessages() {
  const { data } = useNotifications();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const items = (data ?? []).slice(0, 3);
  if (!items.length) return null;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 pt-4 sm:px-5">
        <CardHeader title="Nachrichten vom Markt" icon={MessageSquare} className="mb-2" />
      </div>
      <div className="px-1.5 pb-2 sm:px-2.5">
        {items.map((n) => (
          <NotificationItem
            key={n.id}
            n={n}
            compact
            onOpen={(x) => {
              if (!x.read) {
                void api
                  .markNotificationsRead([x.id])
                  .then(() => qc.invalidateQueries({ queryKey: qk.notifications }))
                  .catch(() => undefined);
              }
              if (x.link) navigate(x.link);
            }}
          />
        ))}
      </div>
    </Card>
  );
}

/** Fahrer-App: Tagesübersicht */
export default function DriverHomePage() {
  useDocumentTitle('Heute');
  const now = useNow(60_000);
  const { data, isLoading, error, refetch } = useDriverToday();
  const tours = useMemo(() => data?.tours ?? [], [data]);
  const stats = useMemo(() => sumStats(tours.map(tourStats)), [tours]);

  if (isLoading) return <HomeSkeleton />;
  if (error || !data) return <ErrorState error={error ?? new Error('Die Tagesübersicht konnte nicht geladen werden.')} onRetry={() => void refetch()} />;

  const { driver } = data;
  const active = tours.find((t) => t.status === 'active');
  const activeIdx = active ? currentStopIndex(active) : -1;
  const activeNext = active && activeIdx >= 0 ? active.orders.find((o) => o.id === active.stops[activeIdx].orderId) : undefined;
  const openTours = tours.filter((t) => t.status !== 'completed').length;
  const doneStopsAll = tours.every((t) => t.stops.every(isStopDone));

  return (
    <div className="space-y-5 pb-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:pb-0">
      <div className="space-y-5">
        {active ? <SimulationWaitNotice tour={active} /> : null}
        {/* Begrüßung */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white shadow-raised sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-accent-400/15 blur-2xl" />
          <p className="text-sm font-medium text-white/75">{formatDate(now, 'long')}</p>
          <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight">
            {greeting(now)}, {firstName(driver.name)}
          </h1>
          <p className="mt-1 text-[15px] text-white/80">
            {tours.length === 0
              ? 'Heute ist noch keine Tour für Sie geplant.'
              : openTours === 0
                ? 'Alle Touren für heute sind erledigt – danke!'
                : `${plural(openTours, 'Tour', 'Touren')} · ${plural(stats.open, 'offener Stopp', 'offene Stopps')}`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ring-white/15">
              <Truck size={15} aria-hidden className="text-accent-300" />
              {driver.vehicle}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ring-white/15">
              <Package size={15} aria-hidden className="text-accent-300" />
              max. {driver.capacityCrates} Gebinde
            </span>
          </div>
          {active ? (
            <Link
              to={activeNext ? `/fahrer/stopp/${activeNext.id}` : `/fahrer/tour/${active.id}`}
              className="mt-5 flex min-h-14 items-center gap-3 rounded-2xl bg-accent-500 px-4 py-2.5 font-semibold text-brand-950 shadow-lg shadow-black/15 transition-colors hover:bg-accent-400 active:bg-accent-600"
            >
              <Navigation size={22} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold opacity-75">
                  {activeNext ? `${active.name} · weiter mit Stopp ${activeIdx + 1}` : active.name}
                </span>
                <span className="block truncate text-[17px] font-bold">{activeNext ? activeNext.customerName : 'Rückfahrt – Tour beenden'}</span>
              </span>
              <ArrowRight size={20} aria-hidden className="shrink-0" />
            </Link>
          ) : null}
        </section>

        <StatusSwitcher status={driver.status} hasActiveTour={!!active} />

        {/* Kennzahlen heute */}
        <section aria-label="Kennzahlen heute" className={cn('grid grid-cols-2 gap-3', tours.length === 0 && 'hidden')}>
          <Kpi label="Stopps heute" value={stats.stops} icon={MapPin} tone="brand" hint={stats.open ? `${stats.open} offen` : 'keine offen'} />
          <Kpi
            label="Erledigt"
            value={`${stats.done}/${stats.stops}`}
            icon={Flag}
            tone="success"
            hint={stats.failed ? `${stats.failed} fehlgeschlagen` : doneStopsAll && stats.stops ? 'alles zugestellt' : `${Math.round(stats.progress * 100)} %`}
          />
          <Kpi label="Gebinde" value={stats.crates} icon={Package} tone="accent" hint={`Leergut: ${stats.emptiesExpected}`} />
          <Kpi
            label="Bar kassiert"
            value={formatEuro(stats.collectedCash)}
            icon={Wallet}
            tone="neutral"
            hint={stats.toCollect ? `offen: ${formatEuro(stats.toCollect)}` : 'nichts mehr offen'}
          />
        </section>

      </div>

      {/* Touren */}
      <section aria-labelledby="tours-title" className="space-y-3">
        <div className="flex items-end justify-between gap-3 pt-1 lg:pt-0">
          <div>
            <h2 id="tours-title" className="text-xl font-bold tracking-tight text-slate-900">
              Ihre Touren heute
            </h2>
            <p className="text-sm text-slate-500">{formatDate(now, 'medium')} · aktualisiert sich automatisch</p>
          </div>
          {tours.length ? (
            <Badge tone="neutral" icon={Route}>
              {plural(tours.length, 'Tour', 'Touren')}
            </Badge>
          ) : null}
        </div>
        {tours.length === 0 ? (
          <Card>
            <EmptyState
              icon={CalendarX2}
              title="Heute keine Touren"
              description={
                driver.status === 'available'
                  ? 'Sie sind als verfügbar gemeldet. Sobald der Markt Ihnen eine Tour zuweist, erscheint sie hier automatisch.'
                  : 'Sobald der Markt Ihnen eine Tour zuweist, erscheint sie hier automatisch. Melden Sie sich dafür als „Verfügbar“.'
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4">
            {tours.map((t) => (
              <TourCard key={t.id} tour={t} now={now} />
            ))}
          </div>
        )}
        <div className="pt-2">
          <MarketMessages />
        </div>
      </section>
    </div>
  );
}
