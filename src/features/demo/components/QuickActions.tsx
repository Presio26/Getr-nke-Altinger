import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, LogIn, Map as MapIcon, MonitorSmartphone, Play, RotateCcw, Route, Server, Square, Wifi, WifiOff } from 'lucide-react';
import type { TourWithOrders } from '@shared/types';
import { TOUR_STATUS_LABEL } from '@shared/format';
import { todayString } from '@shared/time';
import { api, getApiMode } from '@/api/client';
import { qk, useBootstrap, useBootstrapActions, useDriverToday, useRealtimeStatus } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { cn } from '@/lib/cn';
import { Badge, Button, ButtonLink, Card, CardHeader, Checkbox, ConfirmModal, ErrorState, Notice, SegmentedControl, Skeleton, Switch, errorMessage, toast } from '@/components/ui';
import { useOpenAs, useStepProgress } from '../hooks';

// ───────────────────────────── Simulation ─────────────────────────────

/** Tour für die Schnellaktion: Markt → „Tour 1“, Fahrer → eigene laufende bzw. nächste Tour */
function pickTour(tours: TourWithOrders[] | undefined, preferTour1: boolean): TourWithOrders | null {
  if (!tours?.length) return null;
  if (preferTour1) {
    const t1 = tours.find((t) => t.id === 't-1') ?? tours.find((t) => /^Tour 1\b/.test(t.name));
    if (t1) return t1;
  }
  return tours.find((t) => t.status === 'active') ?? tours.find((t) => t.status === 'planned') ?? tours[0];
}

function shortTourName(name: string): string {
  return name.split(' · ')[0] || name;
}

const SPEED_OPTIONS = [
  { value: '4', label: '4×' },
  { value: '8', label: '8×' },
  { value: '15', label: '15×' },
];

function SimulationCard() {
  const role = useSession((s) => s.user?.role ?? null);
  const isAdmin = role === 'admin';
  const isDriver = role === 'driver';
  const today = todayString();
  const qc = useQueryClient();
  const { openAs, pending: loginPending } = useOpenAs();

  const adminTours = useQuery({ queryKey: qk.adminTours(today), queryFn: () => api.adminListTours(today), enabled: isAdmin });
  const driverToday = useDriverToday();
  const query = isAdmin ? adminTours : driverToday;
  const tours = isAdmin ? adminTours.data : driverToday.data?.tours;
  const tour = pickTour(tours, isAdmin);

  const [speed, setSpeed] = useState('4');
  const [autoComplete, setAutoComplete] = useState(true);
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null);

  const running = !!tour && tour.status === 'active' && !!tour.simulation?.running;
  const label = tour ? `${shortTourName(tour.name)} simulieren` : 'Tour 1 simulieren';
  const liveHref = isAdmin ? '/admin/live' : tour ? `/fahrer/tour/${tour.id}` : '/fahrer';

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.admin }), qc.invalidateQueries({ queryKey: qk.driver }), qc.invalidateQueries({ queryKey: qk.tracking() })]);

  const start = async () => {
    if (!tour) return;
    setBusy('start');
    try {
      await api.simulateTour(tour.id, { speedFactor: Number(speed), autoComplete });
      await refresh();
      toast.success(`${shortTourName(tour.name)} fährt los`, {
        id: 'demo-sim',
        description: `Simulation mit ${speed}-fachem Zeitraffer${autoComplete ? ', Stopps werden automatisch zugestellt' : ''}.`,
        href: liveHref,
        actionLabel: isAdmin ? 'Live-Karte' : 'Zur Tour',
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    if (!tour) return;
    setBusy('stop');
    try {
      await api.stopSimulation(tour.id);
      await refresh();
      toast.info('Simulation angehalten', { id: 'demo-sim', description: 'Die Tour bleibt gestartet – das Fahrzeug steht.' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  let body: ReactNode;
  if (!isAdmin && !isDriver) {
    body = (
      <div className="space-y-3">
        <Button block icon={Play} disabled>
          Tour 1 simulieren
        </Button>
        <Notice tone="info" icon={LogIn} title="Nur für Marktleitung und Fahrer">
          Melden Sie sich als Marktleitung an, um Tour 1 per Knopfdruck fahren zu lassen.
          <div className="mt-2.5">
            <Button size="sm" variant="secondary" icon={LogIn} loading={loginPending === 'sim-login'} onClick={() => void openAs('u-admin', 'sim-login', { stay: true })}>
              Als Marktleitung anmelden
            </Button>
          </div>
        </Notice>
      </div>
    );
  } else if (query.isPending) {
    body = (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} className="py-4" />;
  } else if (!tour) {
    body = <Notice tone="info" title="Heute keine Touren">Für heute ist keine Tour geplant. Setzen Sie die Demo-Daten zurück, um die Beispieltouren neu zu erzeugen.</Notice>;
  } else {
    const doneStops = tour.stops.filter((s) => s.status === 'delivered' || s.status === 'failed').length;
    const driverName = isAdmin ? tour.driver?.name : driverToday.data?.driver.name;
    body = (
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200/70">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold leading-snug text-slate-900">{tour.name}</p>
            <Badge tone={tour.status === 'active' ? 'brand' : tour.status === 'completed' ? 'success' : 'neutral'} className="shrink-0">
              {running ? 'Simulation läuft' : TOUR_STATUS_LABEL[tour.status]}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            {driverName ? `${driverName} · ` : ''}
            {doneStops} von {tour.stops.length} Stopps erledigt
          </p>
          {running ? (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div className="h-full rounded-full bg-brand-600 transition-[width] duration-700" style={{ width: `${tour.stops.length ? Math.max(6, (doneStops / tour.stops.length) * 100) : 0}%` }} />
            </div>
          ) : null}
        </div>

        {tour.status === 'completed' ? (
          <Notice tone="success" title={`${shortTourName(tour.name)} ist abgeschlossen`}>
            Für eine neue Vorführung die Demo-Daten zurücksetzen.
          </Notice>
        ) : running ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ButtonLink to={liveHref} icon={MapIcon}>
              {isAdmin ? 'Live-Karte' : 'Zur Tour'}
            </ButtonLink>
            <Button variant="outline" icon={Square} loading={busy === 'stop'} onClick={() => void stop()}>
              Anhalten
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Gauge size={16} aria-hidden className="text-slate-400" /> Zeitraffer
                </span>
                <SegmentedControl size="sm" options={SPEED_OPTIONS} value={speed} onChange={setSpeed} aria-label="Zeitraffer" />
              </div>
              <Switch
                checked={autoComplete}
                onChange={setAutoComplete}
                label="Stopps automatisch zustellen"
                description={autoComplete ? 'Läuft ohne Zutun durch.' : 'Wartet am Stopp, bis der Fahrer zustellt.'}
              />
            </div>
            <Button block icon={Play} loading={busy === 'start'} onClick={() => void start()}>
              {label}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader icon={Route} title="Fahrt simulieren" subtitle="Fahrzeug fährt die echte Route – ohne GPS und ohne Fahrt." />
      {body}
    </Card>
  );
}

// ───────────────────────────── Demo-Reset ─────────────────────────────

function ResetCard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alsoProgress, setAlsoProgress] = useState(true);
  const { reload } = useBootstrapActions();
  const qc = useQueryClient();
  const progress = useStepProgress();

  const reset = async () => {
    setBusy(true);
    try {
      await api.resetDemo();
      if (alsoProgress) progress.reset();
      setOpen(false);
      toast.success('Demo-Daten wurden zurückgesetzt', { id: 'data-reset', description: 'Bestellungen, Touren und Bestände sind wieder im Ausgangszustand.' });
      await Promise.allSettled([reload(), useSession.getState().refresh()]);
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={RotateCcw} title="Demo-Daten zurücksetzen" subtitle="Frische Beispieldaten für heute – auf allen verbundenen Geräten." />
      <Button block variant="outline" icon={RotateCcw} onClick={() => setOpen(true)}>
        Demo-Daten zurücksetzen
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void reset()}
        loading={busy}
        tone="danger"
        title="Demo-Daten zurücksetzen?"
        confirmLabel="Zurücksetzen"
        message={
          <div className="space-y-3">
            <p>Alle Bestellungen, Touren und Änderungen seit dem Start werden verworfen und die Beispieldaten neu erzeugt. Anmeldungen bleiben erhalten.</p>
            <Checkbox label="Auch die Haken im Drehbuch zurücksetzen" checked={alsoProgress} onChange={(e) => setAlsoProgress(e.target.checked)} />
          </div>
        }
      />
    </Card>
  );
}

// ───────────────────────────── Betriebsmodus ─────────────────────────────

const ENV_MODE = String(import.meta.env.VITE_API_MODE ?? '').trim().toLowerCase();
const MODE_FIXED = ENV_MODE === 'remote' || ENV_MODE === 'local';

function ModeCard() {
  const mode = getApiMode();
  const status = useRealtimeStatus();
  const { version } = useBootstrap();
  const remote = mode === 'remote';
  const statusText = remote ? (status === 'online' ? 'Echtzeit verbunden' : status === 'connecting' ? 'Verbindung wird aufgebaut …' : 'Echtzeit getrennt') : 'Tabs synchron';
  const StatusIcon = status === 'offline' ? WifiOff : Wifi;

  const switchMode = () => {
    const target = remote ? 'local' : 'auto';
    window.location.assign(`/demo?api=${target}`);
  };

  return (
    <Card>
      <CardHeader
        icon={remote ? Server : MonitorSmartphone}
        title="Betriebsmodus"
        subtitle={`Version ${version}`}
        action={<Badge tone={remote ? 'brand' : 'accent'}>{remote ? 'Server' : 'Lokal'}</Badge>}
      />
      <p className="text-sm leading-relaxed text-slate-600">
        {remote
          ? 'Alle Geräte teilen dieselben Daten live: Kundin auf dem iPhone, Fahrer unterwegs und Markt am Laptop sehen jede Änderung sofort.'
          : 'Die App läuft komplett in diesem Browser – ohne Server und ohne Internet. Tabs gleichen sich live ab, andere Geräte haben eigene Daten.'}
      </p>
      <p className={cn('mt-3 flex items-center gap-2 text-[13px] font-medium', status === 'online' ? 'text-emerald-700' : status === 'connecting' ? 'text-amber-700' : 'text-red-700')}>
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          {status === 'online' ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /> : null}
          <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', status === 'online' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-red-500')} />
        </span>
        <StatusIcon size={15} aria-hidden />
        {statusText}
      </p>
      {MODE_FIXED ? (
        <p className="mt-3 text-[13px] text-slate-500">Fest eingestellt über VITE_API_MODE={ENV_MODE}.</p>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <Button size="sm" variant="ghost" icon={remote ? MonitorSmartphone : Server} onClick={switchMode} className="-ml-2">
            {remote ? 'Lokalen Modus testen' : 'Zurück zum Server-Modus'}
          </Button>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {remote ? 'Gilt nur für diesen Tab – praktisch als Plan B ohne Internet.' : 'Prüft beim Laden, ob der Server erreichbar ist.'}
          </p>
        </div>
      )}
    </Card>
  );
}

/** Schnellaktionen für die Vorführung (Desktop: mitlaufende Seitenspalte) */
export function QuickActions() {
  return (
    <div className="space-y-4">
      <SimulationCard />
      <ModeCard />
      <ResetCard />
    </div>
  );
}
