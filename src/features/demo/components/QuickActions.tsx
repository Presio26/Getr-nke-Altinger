import { useCallback, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  CircleCheck,
  Clock3,
  Flag,
  Gauge,
  Hand,
  LogIn,
  Map as MapIcon,
  MonitorSmartphone,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route,
  Server,
  Smartphone,
  Square,
  Truck,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import type { Order, TourWithOrders } from '@shared/types';
import { TOUR_STATUS_LABEL } from '@shared/format';
import { todayString } from '@shared/time';
import { api, getApiMode } from '@/api/client';
import { qk, useBootstrap, useBootstrapActions, useDriverToday, useRealtimeStatus, useSettings } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { isMac } from '@/lib/platform';
import { readJson, writeJson } from '@/lib/storage';
import { cn } from '@/lib/cn';
import { Badge, Button, ButtonLink, Card, CardHeader, Checkbox, ConfirmModal, ErrorState, Notice, SegmentedControl, Skeleton, Switch, errorMessage, toast } from '@/components/ui';
import { ANNA_CUSTOMER_ID, TOUR1_ID } from '../data';
import { useOpenAs, useStepProgress } from '../hooks';

// ───────────────────────────── Simulation ─────────────────────────────

/** Tour für die Schnellaktion: Markt → „Tour 1“, Fahrer → eigene laufende bzw. nächste Tour */
function pickTour(tours: TourWithOrders[] | undefined, preferTour1: boolean): TourWithOrders | null {
  if (!tours?.length) return null;
  if (preferTour1) {
    const t1 = tours.find((t) => t.id === TOUR1_ID) ?? tours.find((t) => /^Tour 1\b/.test(t.name));
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

/** Optionen der Schnellaktion – lokal gemerkt (je Gerät) */
interface SimPrefs {
  speed: string;
  autoComplete: boolean;
  /** Annas Stopp(s) wartet auf den Fahrer (manualOrderIds), auch wenn sonst automatisch zugestellt wird */
  annaManual: boolean;
}

const SIM_PREFS_KEY = 'altinger.demo.sim';
const DEFAULT_SIM_PREFS: SimPrefs = { speed: '8', autoComplete: true, annaManual: true };

function loadSimPrefs(): SimPrefs {
  const raw = readJson<Partial<SimPrefs> | null>(SIM_PREFS_KEY, null);
  if (!raw || typeof raw !== 'object') return DEFAULT_SIM_PREFS;
  return {
    speed: SPEED_OPTIONS.some((o) => o.value === raw.speed) ? String(raw.speed) : DEFAULT_SIM_PREFS.speed,
    autoComplete: typeof raw.autoComplete === 'boolean' ? raw.autoComplete : DEFAULT_SIM_PREFS.autoComplete,
    annaManual: typeof raw.annaManual === 'boolean' ? raw.annaManual : DEFAULT_SIM_PREFS.annaManual,
  };
}

function useSimPrefs() {
  const [prefs, setPrefs] = useState<SimPrefs>(loadSimPrefs);
  const update = useCallback((patch: Partial<SimPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writeJson(SIM_PREFS_KEY, next);
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

const DONE_STATUSES: Order['status'][] = ['delivered', 'picked_up', 'failed', 'cancelled'];

/** Annas noch offene Aufträge auf dieser Tour (in Stopp-Reihenfolge) */
function annaStops(tour: TourWithOrders): { index: number; order: Order }[] {
  const out: { index: number; order: Order }[] = [];
  tour.stops.forEach((stop, index) => {
    if (stop.status === 'delivered' || stop.status === 'failed') return;
    const order = tour.orders.find((o) => o.id === stop.orderId);
    if (order && order.customerId === ANNA_CUSTOMER_ID && !DONE_STATUSES.includes(order.status)) out.push({ index, order });
  });
  return out;
}

function stopNumbers(stops: { index: number }[]): string {
  const nums = stops.map((s) => String(s.index + 1));
  if (nums.length <= 1) return `Stopp ${nums[0] ?? ''}`.trim();
  return `Stopps ${nums.slice(0, -1).join(', ')} und ${nums[nums.length - 1]}`;
}

type SimPhase =
  | { kind: 'planned' }
  | { kind: 'completed' }
  /** Tour gestartet, aber ohne Simulation (echte Fahrt mit GPS) */
  | { kind: 'live' }
  | { kind: 'paused' }
  | { kind: 'driving'; index: number; order?: Order }
  | { kind: 'dwell'; index: number; order?: Order; done: boolean }
  | { kind: 'waiting'; index: number; order?: Order }
  | { kind: 'returning' };

/** Was macht die Simulation gerade? (aus tour.simulation und den Stopps abgeleitet) */
function simPhase(tour: TourWithOrders): SimPhase {
  if (tour.status === 'completed') return { kind: 'completed' };
  if (tour.status === 'planned') return { kind: 'planned' };
  const sim = tour.simulation;
  if (!sim) return { kind: 'live' };
  if (!sim.running) return { kind: 'paused' };
  const index = sim.legIndex;
  if (index >= tour.stops.length) return { kind: 'returning' };
  const stop = tour.stops[index];
  const order = tour.orders.find((o) => o.id === stop?.orderId);
  if (stop && (stop.status !== 'pending' || sim.dwellUntil)) {
    const manual = !sim.autoComplete || !!sim.manualOrderIds?.includes(stop.orderId);
    const open = stop.status === 'arrived' || stop.status === 'pending';
    return manual && open ? { kind: 'waiting', index, order } : { kind: 'dwell', index, order, done: !open };
  }
  return { kind: 'driving', index, order };
}

function PhaseLine({ icon: Icon, tone, children }: { icon: LucideIcon; tone: 'brand' | 'amber' | 'emerald' | 'slate'; children: ReactNode }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-800 ring-brand-200/70',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200/70',
  } as const;
  return (
    <div className={cn('flex gap-2.5 rounded-xl p-3 text-[13px] leading-snug ring-1 ring-inset', tones[tone])} role="status">
      <Icon size={17} aria-hidden className="mt-px shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

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

  const [prefs, setPrefs] = useSimPrefs();
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null);

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: qk.admin }), qc.invalidateQueries({ queryKey: qk.driver }), qc.invalidateQueries({ queryKey: qk.tracking() })]);

  if (!isAdmin && !isDriver) {
    return (
      <Card>
        <CardHeader icon={Route} title="Fahrt simulieren" subtitle="Fahrzeug fährt die echte Route – ohne GPS und ohne Fahrt." />
        <div className="space-y-3">
          <Button block icon={Play} disabled>
            Tour 1 simulieren
          </Button>
          <Notice tone="info" icon={LogIn} title="Nur für Marktleitung und Fahrer">
            Melden Sie sich auf diesem Gerät als Marktleitung an, um Tour 1 per Knopfdruck fahren zu lassen.
            <div className="mt-2.5">
              <Button size="sm" variant="secondary" icon={LogIn} loading={loginPending === 'sim-login'} onClick={() => void openAs('u-admin', 'sim-login', { stay: true })}>
                Als Marktleitung anmelden
              </Button>
            </div>
          </Notice>
        </div>
      </Card>
    );
  }

  let body: ReactNode;
  if (query.isPending) {
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
    const short = shortTourName(tour.name);
    const phase = simPhase(tour);
    const sim = tour.simulation;
    const running = !!sim?.running && tour.status === 'active';
    const anna = annaStops(tour);
    const driverName = (isAdmin ? tour.driver?.name : driverToday.data?.driver.name) ?? 'Der Fahrer';
    const driverFirst = driverName.split(' ')[0];
    const doneStops = tour.stops.filter((s) => s.status === 'delivered' || s.status === 'failed').length;
    const liveHref = isAdmin ? '/admin/live' : `/fahrer/tour/${tour.id}`;
    const manualIds = prefs.autoComplete && prefs.annaManual ? anna.map((a) => a.order.id) : [];

    const start = async () => {
      setBusy('start');
      try {
        await api.simulateTour(tour.id, { speedFactor: Number(prefs.speed), autoComplete: prefs.autoComplete, manualOrderIds: manualIds });
        await refresh();
        const how = !prefs.autoComplete
          ? `Das Fahrzeug wartet an jedem Stopp, bis ${driverFirst} zustellt.`
          : manualIds.length
            ? `Stopps werden automatisch zugestellt – bei Anna Berger wartet das Fahrzeug, bis ${driverFirst} selbst zustellt.`
            : 'Alle Stopps werden automatisch zugestellt.';
        toast.success(phase.kind === 'paused' ? `${short} fährt weiter` : `${short} fährt los`, {
          id: 'demo-sim',
          description: `${prefs.speed}-facher Zeitraffer. ${how}`,
          href: liveHref,
          actionLabel: isAdmin ? 'Live-Karte' : 'Zur Tour',
        });
      } catch (err) {
        toast.error(errorMessage(err), { id: 'demo-sim' });
      } finally {
        setBusy(null);
      }
    };

    const stop = async () => {
      setBusy('stop');
      try {
        await api.stopSimulation(tour.id);
        await refresh();
        toast.info('Simulation angehalten', { id: 'demo-sim', description: 'Die Tour bleibt gestartet – das Fahrzeug steht, bis Sie fortsetzen.' });
      } catch (err) {
        toast.error(errorMessage(err), { id: 'demo-sim' });
      } finally {
        setBusy(null);
      }
    };

    const stopLink = (order: Order | undefined) =>
      order && isDriver ? (
        <ButtonLink to={`/fahrer/stopp/${order.id}`} size="sm" variant="secondary" icon={Hand} className="mt-2">
          Stopp öffnen
        </ButtonLink>
      ) : null;

    let status: ReactNode = null;
    switch (phase.kind) {
      case 'driving':
        status = (
          <PhaseLine icon={Navigation} tone="brand">
            Unterwegs zu Stopp {phase.index + 1} von {tour.stops.length}
            {phase.order ? `: ${phase.order.customerName}` : ''}
          </PhaseLine>
        );
        break;
      case 'dwell':
        status = (
          <PhaseLine icon={Clock3} tone="slate">
            {phase.done
              ? `Stopp ${phase.index + 1}${phase.order ? ` (${phase.order.customerName})` : ''} ist erledigt – das Fahrzeug fährt gleich weiter.`
              : `Hält bei ${phase.order?.customerName ?? `Stopp ${phase.index + 1}`} – stellt gleich automatisch zu und fährt weiter.`}
          </PhaseLine>
        );
        break;
      case 'waiting':
        status = (
          <PhaseLine icon={Hand} tone="amber">
            <strong className="font-semibold">Wartet bei {phase.order?.customerName ?? `Stopp ${phase.index + 1}`}.</strong> {driverFirst} schließt den Stopp in der
            Fahrer-App ab (Leergut, Zahlung, Unterschrift, Foto) – danach fährt die Simulation von selbst weiter.
            {stopLink(phase.order)}
          </PhaseLine>
        );
        break;
      case 'returning':
        status = (
          <PhaseLine icon={Flag} tone="emerald">
            Alle Stopps erledigt – Rückfahrt zum Markt. Danach ist die Tour abgeschlossen.
          </PhaseLine>
        );
        break;
      case 'paused':
        status = (
          <PhaseLine icon={Pause} tone="slate">
            Simulation angehalten – die Tour bleibt gestartet, das Fahrzeug steht.
          </PhaseLine>
        );
        break;
      case 'live':
        status = (
          <PhaseLine icon={Smartphone} tone="slate">
            {short} ist ohne Simulation gestartet – die Position kommt vom GPS des Fahrer-Handys. Die Simulation kann die Fahrt übernehmen.
          </PhaseLine>
        );
        break;
      default:
        break;
    }

    const runningSettings = running && sim
      ? [
          `${sim.speedFactor}× Zeitraffer`,
          sim.autoComplete ? 'Stopps automatisch' : `${driverFirst} stellt jeden Stopp zu`,
          ...(sim.autoComplete && sim.manualOrderIds?.length
            ? [
                sim.manualOrderIds.some((id) => tour.orders.find((o) => o.id === id)?.customerId === ANNA_CUSTOMER_ID)
                  ? `Annas Stopp: ${driverFirst}`
                  : `${sim.manualOrderIds.length} Stopp(s) manuell`,
              ]
            : []),
        ]
      : [];

    body = (
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200/70">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold leading-snug text-slate-900">{tour.name}</p>
            <Badge tone={running ? 'brand' : tour.status === 'completed' ? 'success' : phase.kind === 'paused' ? 'warning' : 'neutral'} className="shrink-0">
              {running ? 'Simulation läuft' : phase.kind === 'paused' ? 'Angehalten' : TOUR_STATUS_LABEL[tour.status]}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            {driverName} · {doneStops} von {tour.stops.length} Stopps erledigt
          </p>
          {tour.status === 'active' ? (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-700"
                style={{ width: `${tour.stops.length ? Math.max(6, (doneStops / tour.stops.length) * 100) : 0}%` }}
              />
            </div>
          ) : null}
          {runningSettings.length ? (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Einstellungen der laufenden Simulation">
              {runningSettings.map((s) => (
                <li key={s} className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {status}

        {tour.status === 'completed' ? (
          <Notice tone="success" icon={CircleCheck} title={`${short} ist abgeschlossen`}>
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
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Gauge size={16} aria-hidden className="text-slate-400" /> Zeitraffer
                </span>
                <SegmentedControl size="sm" options={SPEED_OPTIONS} value={prefs.speed} onChange={(v) => setPrefs({ speed: v })} aria-label="Zeitraffer" />
              </div>
              <Switch
                checked={prefs.autoComplete}
                onChange={(v) => setPrefs({ autoComplete: v })}
                label="Stopps automatisch zustellen"
                description={prefs.autoComplete ? 'Die übrigen Stopps laufen ohne Zutun durch.' : `Wartet an jedem Stopp, bis ${driverFirst} zustellt.`}
              />
              <Switch
                checked={prefs.autoComplete && prefs.annaManual && anna.length > 0}
                onChange={(v) => setPrefs({ annaManual: v })}
                disabled={!prefs.autoComplete || anna.length === 0}
                label="Annas Stopp selbst zustellen"
                description={
                  anna.length === 0
                    ? `Anna Berger hat keinen offenen Auftrag auf ${short}.`
                    : !prefs.autoComplete
                      ? `Ohne automatische Zustellung stellt ${driverFirst} ohnehin jeden Stopp selbst zu.`
                      : prefs.annaManual
                        ? `Bei Anna Berger (${stopNumbers(anna)}) wartet das Fahrzeug, bis ${driverFirst} in der Fahrer-App zustellt.`
                        : 'Auch Annas Lieferung wird automatisch zugestellt.'
                }
              />
            </div>
            <Button block icon={Play} loading={busy === 'start'} onClick={() => void start()}>
              {phase.kind === 'paused' ? 'Simulation fortsetzen' : phase.kind === 'live' ? 'Simulation übernehmen' : `${short} simulieren`}
            </Button>
            <p className="-mt-1 text-xs leading-relaxed text-slate-500">Einstellungen werden auf diesem Gerät gemerkt.</p>
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

// ───────────────────────────── Automatische Bestätigung ─────────────────────────────

function AutoConfirmCard() {
  const settings = useSettings();
  const role = useSession((s) => s.user?.role ?? null);
  const isAdmin = role === 'admin';
  const { update } = useBootstrapActions();
  const { openAs, pending } = useOpenAs();
  const [saving, setSaving] = useState(false);
  const on = !!settings.demoAutoConfirm;

  const save = async (value: boolean) => {
    setSaving(true);
    try {
      // frische Einstellungen des Markts (inkl. inaktiver Gutscheine) als Grundlage – nur der Schalter ändert sich
      const fresh = await api.getBootstrap();
      const saved = await api.adminSaveSettings({ ...fresh.settings, demoAutoConfirm: value });
      update({ settings: saved });
      toast.success(value ? 'Neue Bestellungen werden automatisch bestätigt' : 'Der Markt bestätigt neue Bestellungen selbst', {
        id: 'demo-auto-confirm',
        description: value ? 'Gilt für Bestellungen, die ab jetzt eingehen (nach wenigen Sekunden).' : 'Neue Bestellungen bleiben „Eingegangen“, bis sie im Bestell-Board bestätigt werden.',
      });
    } catch (err) {
      toast.error(errorMessage(err), { id: 'demo-auto-confirm' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={CheckCheck} title="Neue Bestellungen bestätigen" subtitle={on ? 'Zurzeit: automatisch nach wenigen Sekunden' : 'Zurzeit: die Marktleitung bestätigt live'} />
      <Switch
        checked={on}
        onChange={(v) => void save(v)}
        disabled={!isAdmin || saving}
        label="Neue Bestellungen automatisch bestätigen"
        description={
          on
            ? 'An: Neue Bestellungen werden nach wenigen Sekunden automatisch bestätigt – praktisch für unbeaufsichtigte Vorführungen.'
            : 'Aus (empfohlen): Annas Bestellung bleibt „Eingegangen“, bis die Marktleitung im Bestell-Board auf „Bestätigen“ klickt.'
        }
      />
      {!isAdmin ? (
        <Notice tone="info" icon={LogIn} title="Nur als Marktleitung umschaltbar" className="mt-3">
          Der Schalter gilt für alle Geräte und lässt sich nur mit dem Zugang der Marktleitung ändern.
          <div className="mt-2.5">
            <Button size="sm" variant="secondary" icon={LogIn} loading={pending === 'confirm-login'} onClick={() => void openAs('u-admin', 'confirm-login', { stay: true })}>
              Als Marktleitung anmelden
            </Button>
          </div>
        </Notice>
      ) : null}
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
        <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
          Fest eingestellt über VITE_API_MODE={ENV_MODE}.
          {ENV_MODE === 'remote' ? ' Plan B ohne Internet: die App lokal auf dem Laptop starten und dort „/demo?api=local“ öffnen (siehe Drehbuch).' : ''}
        </p>
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

// ───────────────────────────── Hinweise ─────────────────────────────

function TipsCard() {
  const shortcut = isMac() ? '⌥ D' : 'Alt + D';
  const tips: { icon: LucideIcon; title: string; text: ReactNode }[] = [
    {
      icon: Smartphone,
      title: 'Leitfaden auf dem iPhone',
      text: (
        <>
          Die Demo-Pille ist auf dem Handy ausgeblendet. Zum Leitfaden und Rollenwechsel: <strong>dreimal schnell aufs Logo tippen</strong> (Shop und
          Fahrer-App) oder ganz unten im Seitenfuß „Demo-Leitfaden“ bzw. „Rollen wechseln“. Am Laptop: Kontomenü → „Demo-Leitfaden &amp; Rollen wechseln“
          oder {shortcut}.
        </>
      ),
    },
    {
      icon: MonitorSmartphone,
      title: 'Mehrere Rollen in Tabs',
      text: (
        <>
          Jeder Browser-Tab behält seine Anmeldung – Anna, Toni und die Marktleitung können nebeneinander offen sein. Ein neuer Tab startet mit der zuletzt
          gewählten Rolle. Für die Vorführung empfehlen wir <strong>getrennte Geräte bzw. Browserprofile</strong>.
        </>
      ),
    },
    {
      icon: Truck,
      title: 'Ablauf an Annas Stopp',
      text: 'Annas vorbereitete Bestellung ist der erste Stopp auf Tour 1 und wird bar bezahlt – ideal für Leergut, Altersprüfung, Kassieren mit Rückgeld, Unterschrift und Foto.',
    },
  ];
  return (
    <Card>
      <CardHeader icon={Smartphone} title="Hinweise für die Vorführung" />
      <ul className="space-y-3.5">
        {tips.map((t) => (
          <li key={t.title} className="flex gap-2.5">
            <t.icon size={17} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
            <div className="min-w-0 text-[13px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-900">{t.title}</p>
              <p className="mt-0.5">{t.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Schnellaktionen für die Vorführung (Desktop: mitlaufende Seitenspalte) */
export function QuickActions() {
  return (
    <div className="space-y-4">
      <SimulationCard />
      <AutoConfirmCard />
      <ResetCard />
      <ModeCard />
      <TipsCard />
    </div>
  );
}
