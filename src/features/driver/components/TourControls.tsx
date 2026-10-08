/**
 * Steuerung einer Tour: Starten/Beenden, GPS-Freigabe und Demo-Fahrtsimulation.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Flag,
  LocateFixed,
  LocateOff,
  MonitorSmartphone,
  Navigation,
  PackageCheck,
  Play,
  Sparkles,
  Square,
} from 'lucide-react';
import type { TourWithOrders } from '@shared/types';
import { formatEuro, formatRelative, formatTime } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { usePositions } from '@/stores/positions';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Button, Card, ConfirmModal, Notice, SegmentedControl, Switch } from '@/components/ui';
import { currentStopIndex, plural, tourStats } from '../lib/driverUtils';
import { useGpsShare } from '../lib/gpsShare';
import { GpsHelpModal } from './DriverGpsBridge';
import { StopNumber } from './StopBits';

// ───────────────────────────── Haupt-Aktion ─────────────────────────────

export function TourActionCard({ tour, loadedInfo, onShowLoad }: { tour: TourWithOrders; loadedInfo: { done: number; total: number }; onShowLoad: () => void }) {
  const navigate = useNavigate();
  const setPaused = useGpsShare((s) => s.setPaused);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const stats = tourStats(tour);
  const idx = currentStopIndex(tour);
  const nextStop = idx >= 0 ? tour.stops[idx] : undefined;
  const nextOrder = nextStop ? tour.orders.find((o) => o.id === nextStop.orderId) : undefined;

  const start = useApiMutation(() => api.startTour(tour.id), {
    invalidate: [qk.driverToday],
    success: 'Tour gestartet – Ihre Kunden wurden benachrichtigt.',
    onSuccess: () => setPaused(null),
  });
  const finish = useApiMutation(() => api.finishTour(tour.id), {
    invalidate: [qk.driverToday],
    success: 'Tour beendet – gute Rückfahrt!',
    onSuccess: () => {
      setConfirmFinish(false);
      navigate('/fahrer');
    },
  });

  if (tour.status === 'completed') {
    return (
      <Notice tone="success" icon={CheckCircle2} title={`Tour abgeschlossen${tour.finishedAt ? ` um ${formatTime(tour.finishedAt)} Uhr` : ''}`}>
        {plural(stats.delivered, 'Stopp', 'Stopps')} zugestellt{stats.failed ? `, ${stats.failed} fehlgeschlagen` : ''}
        {stats.collected ? ` · kassiert ${formatEuro(stats.collected)}` : ''}.
      </Notice>
    );
  }

  if (tour.status === 'planned') {
    const allLoaded = loadedInfo.total > 0 && loadedInfo.done === loadedInfo.total;
    return (
      <Card className="space-y-3">
        <button
          type="button"
          onClick={onShowLoad}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ring-inset transition-colors',
            allLoaded ? 'bg-emerald-50 ring-emerald-200 hover:bg-emerald-100/70' : 'bg-amber-50 ring-amber-200 hover:bg-amber-100/70',
          )}
        >
          <PackageCheck size={22} aria-hidden className={allLoaded ? 'text-emerald-600' : 'text-amber-600'} />
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-slate-800">
            {allLoaded ? 'Ladeliste vollständig verladen' : `Ladeliste: ${loadedInfo.done} von ${loadedInfo.total} Positionen verladen`}
          </span>
          <ArrowRight size={18} aria-hidden className="text-slate-400" />
        </button>
        <Button size="lg" block icon={Play} loading={start.isPending} onClick={() => start.mutate()} className="h-14! text-[17px]!">
          Tour starten
        </Button>
        <p className="text-center text-sm leading-snug text-slate-500">
          Ihre Kunden werden benachrichtigt, dass die Lieferung unterwegs ist. Danach wird Ihr Standort live geteilt.
        </p>
      </Card>
    );
  }

  // aktiv
  return (
    <Card className="space-y-3">
      {nextOrder && nextStop ? (
        <Link
          to={`/fahrer/stopp/${nextOrder.id}`}
          className="flex min-h-16 items-center gap-3 rounded-2xl bg-accent-500 px-4 py-3 text-brand-950 shadow-sm transition-colors hover:bg-accent-400 active:bg-accent-600"
        >
          <StopNumber index={idx + 1} status={nextStop.status} surface="accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold opacity-75">
              {nextStop.status === 'arrived' ? 'Sie sind vor Ort' : 'Nächster Stopp'}
              {nextStop.eta && nextStop.status === 'pending' ? ` · ca. ${formatTime(nextStop.eta)} Uhr` : ''}
            </span>
            <span className="block truncate text-[17px] font-bold">{nextOrder.customerName}</span>
            <span className="block truncate text-sm font-medium opacity-80">{nextOrder.address?.street}</span>
          </span>
          <Navigation size={22} aria-hidden className="shrink-0" />
        </Link>
      ) : (
        <Notice tone="success" icon={CheckCircle2} title="Alle Stopps erledigt">
          Fahren Sie zurück zum Markt und beenden Sie die Tour.
        </Notice>
      )}
      {stats.open === 0 ? (
        <Button variant="success" size="lg" block icon={Flag} onClick={() => setConfirmFinish(true)} className="h-14! text-[17px]!">
          Tour beenden
        </Button>
      ) : (
        <p className="text-center text-sm leading-relaxed text-slate-500">
          <Flag size={15} aria-hidden className="mr-1.5 inline-block align-[-2px]" />
          Tour beenden, sobald alle Stopps erledigt sind (noch {stats.open} offen).
        </p>
      )}
      <ConfirmModal
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        onConfirm={() => finish.mutate()}
        loading={finish.isPending}
        title="Tour beenden?"
        message="Ihr Status wird auf „Verfügbar“ gesetzt und die Standortfreigabe endet."
        confirmLabel="Tour beenden"
      />
    </Card>
  );
}

// ───────────────────────────── GPS-Freigabe ─────────────────────────────

function sinceText(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return `vor ${s} s`;
  return formatRelative(iso, now);
}

export function GpsShareCard({ tour }: { tour: TourWithOrders }) {
  const now = useNow(1000);
  const gps = usePositions((s) => s.gps);
  const { pausedTourId, setPaused, lastSentAt, sendFailed, wakeLock } = useGpsShare();
  const [help, setHelp] = useState(false);
  const paused = pausedTourId === tour.id;
  const simulating = !!tour.simulation?.running;
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;

  let tone: 'ok' | 'wait' | 'off' | 'bad' = 'off';
  let text: string;
  if (simulating) {
    tone = 'ok';
    text = 'Die Demo-Simulation liefert gerade Ihre Position.';
  } else if (paused) {
    text = 'Pausiert – Kunden sehen Ihre zuletzt bekannte Position.';
  } else if (gps.status === 'active') {
    tone = sendFailed ? 'wait' : 'ok';
    const since = sinceText(lastSentAt, now);
    text = sendFailed
      ? 'Übertragung unterbrochen – wird automatisch wiederholt.'
      : `Live${since ? ` · zuletzt ${since} übertragen` : ''}${gps.accuracy ? ` · ±${gps.accuracy} m` : ''}`;
  } else if (gps.status === 'denied') {
    tone = 'bad';
    text = 'Standortfreigabe verweigert – bitte in den Einstellungen erlauben.';
  } else if (gps.status === 'error') {
    tone = 'bad';
    text = insecure ? 'Standort nur über HTTPS verfügbar.' : (gps.message ?? 'Standort nicht verfügbar.');
  } else {
    tone = 'wait';
    text = 'GPS-Signal wird gesucht …';
  }

  const dot = { ok: 'bg-emerald-500', wait: 'bg-amber-400', off: 'bg-slate-400', bad: 'bg-red-500' }[tone];
  const Icon = paused || tone === 'bad' ? LocateOff : LocateFixed;

  return (
    <Card padding="sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            tone === 'ok' ? 'bg-emerald-50 text-emerald-600' : tone === 'bad' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Icon size={22} aria-hidden />
          <span className={cn('absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white', dot)} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Switch
            checked={!paused}
            onChange={(on) => setPaused(on ? null : tour.id)}
            label="Standort live teilen"
            description={<span aria-live="polite">{text}</span>}
            disabled={simulating}
            className="min-h-0 py-0"
          />
          {tone === 'bad' ? (
            <button type="button" onClick={() => setHelp(true)} className="mt-1.5 text-sm font-semibold text-brand-700 underline underline-offset-2">
              So geben Sie den Standort frei
            </button>
          ) : null}
          {wakeLock === 'active' ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
              <MonitorSmartphone size={14} aria-hidden />
              Bildschirm bleibt während der Tour an
            </p>
          ) : null}
        </div>
      </div>
      <GpsHelpModal open={help} onClose={() => setHelp(false)} />
    </Card>
  );
}

// ───────────────────────────── Demo-Simulation ─────────────────────────────

/** Kompakter Simulationsstatus über der Karte (mit Stopp-Knopf) */
export function SimulationMapBadge({ tour }: { tour: TourWithOrders }) {
  const stop = useApiMutation(() => api.stopSimulation(tour.id), {
    invalidate: [qk.driverToday],
    success: 'Simulation gestoppt',
  });
  if (!tour.simulation?.running) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900/90 py-1 pl-3 pr-1 text-[13px] font-semibold text-white shadow-raised ring-1 ring-white/10 backdrop-blur">
      <Sparkles size={15} aria-hidden className="text-accent-400" />
      Demo-Fahrt · {tour.simulation.speedFactor}×
      <button
        type="button"
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className="flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 transition-colors hover:bg-white/25 disabled:opacity-60"
      >
        <Square size={12} aria-hidden className="fill-current" />
        Stopp
      </button>
    </div>
  );
}

const SPEEDS = [
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
  { value: '8', label: '8×' },
];

export function SimulationCard({ tour }: { tour: TourWithOrders }) {
  const sim = tour.simulation;
  const running = !!sim?.running;
  const [speed, setSpeed] = useState(String(sim?.speedFactor && [2, 4, 8].includes(sim.speedFactor) ? sim.speedFactor : 4));
  const [autoComplete, setAutoComplete] = useState(sim?.autoComplete ?? true);

  const simulate = useApiMutation((opts: { speedFactor: number; autoComplete: boolean }) => api.simulateTour(tour.id, opts), {
    invalidate: [qk.driverToday],
    onSuccess: () => {
      // Karte mit dem fahrenden Fahrzeug zeigen
      if (!running) window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });
  const stop = useApiMutation(() => api.stopSimulation(tour.id), {
    invalidate: [qk.driverToday],
    success: 'Simulation gestoppt',
  });

  const startSim = (s = speed, ac = autoComplete) => simulate.mutate({ speedFactor: Number(s), autoComplete: ac });

  if (tour.status === 'completed') return null;

  return (
    <Card className={cn('border-dashed', running ? 'border-slate-400 bg-slate-50' : 'border-slate-300')}>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-accent-400">
          <Sparkles size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
            Demo: Fahrt simulieren
            {running ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" aria-hidden />
                läuft · {sim?.speedFactor}×
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {running
              ? sim?.autoComplete
                ? 'Ihr Fahrzeug fährt die Route ab und stellt die Stopps automatisch zu.'
                : 'Ihr Fahrzeug fährt die Route ab und wartet an jedem Stopp auf Ihre Zustellung.'
              : 'Bewegt Ihr Fahrzeug entlang der Route – Kunden und Markt sehen die Fahrt live.'}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-medium text-slate-800">Geschwindigkeit</span>
          <SegmentedControl
            aria-label="Geschwindigkeit der Simulation"
            options={SPEEDS}
            value={speed}
            onChange={(v) => {
              setSpeed(v);
              if (running) startSim(v, autoComplete);
            }}
          />
        </div>
        <Switch
          checked={autoComplete}
          onChange={(v) => {
            setAutoComplete(v);
            if (running) startSim(speed, v);
          }}
          label="Stopps automatisch zustellen"
          description={autoComplete ? 'Unbeaufsichtigte Vorführung' : 'Sie schließen jeden Stopp selbst ab'}
        />
        {running ? (
          <Button variant="outline" block icon={Square} loading={stop.isPending} onClick={() => stop.mutate()} className="h-12!">
            Simulation stoppen
          </Button>
        ) : (
          <Button
            variant="secondary"
            block
            icon={Sparkles}
            loading={simulate.isPending}
            onClick={() => startSim()}
            className="h-12! bg-slate-900! text-white! hover:bg-slate-800! active:bg-slate-950!"
          >
            {tour.status === 'planned' ? 'Tour starten & Fahrt simulieren' : 'Fahrt simulieren'}
          </Button>
        )}
      </div>
    </Card>
  );
}
