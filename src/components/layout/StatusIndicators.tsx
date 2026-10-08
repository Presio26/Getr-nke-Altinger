import { Navigation, NavigationOff, Wifi, WifiOff } from 'lucide-react';
import { useRealtimeStatus } from '@/api/hooks';
import { getApiMode } from '@/api/client';
import { usePositions } from '@/stores/positions';
import { cn } from '@/lib/cn';

type Tone = 'light' | 'dark';

/** Echtzeit-Verbindung: Live / Verbinde … / Offline (+ Modus Server/Lokal) */
export function ConnectionIndicator({ tone = 'light', showLabel = true, showMode = false, className }: { tone?: Tone; showLabel?: boolean; showMode?: boolean; className?: string }) {
  const status = useRealtimeStatus();
  const mode = getApiMode();
  const label = status === 'online' ? 'Live' : status === 'connecting' ? 'Verbinde …' : 'Offline';
  const dot = status === 'online' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-500';
  const Icon = status === 'offline' ? WifiOff : Wifi;
  const title =
    status === 'online'
      ? mode === 'local'
        ? 'Lokaler Demo-Modus: Daten werden in diesem Browser gespeichert und zwischen Tabs synchronisiert.'
        : 'Echtzeit-Verbindung zum Server aktiv'
      : status === 'connecting'
        ? 'Verbindung zum Server wird aufgebaut …'
        : 'Keine Echtzeit-Verbindung – Daten werden beim Wiederverbinden aktualisiert.';
  return (
    <span
      title={title}
      role="status"
      aria-label={`Verbindung: ${label}${showMode ? `, Modus ${mode === 'local' ? 'Lokal' : 'Server'}` : ''}`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
        tone === 'dark' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {status === 'online' ? <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dot)} /> : null}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
      </span>
      {showLabel ? <span>{label}</span> : <Icon size={14} aria-hidden />}
      {showMode ? <span className={cn('font-medium', tone === 'dark' ? 'text-white/60' : 'text-slate-400')}>· {mode === 'local' ? 'Lokal' : 'Server'}</span> : null}
    </span>
  );
}

/** GPS-Zustand der Fahrer-App */
export function GpsIndicator({ tone = 'dark', showLabel = false, className }: { tone?: Tone; showLabel?: boolean; className?: string }) {
  const gps = usePositions((s) => s.gps);
  const map = {
    off: { label: 'GPS aus', dot: 'bg-slate-400', Icon: NavigationOff },
    searching: { label: 'GPS sucht …', dot: 'bg-amber-400', Icon: Navigation },
    active: { label: gps.accuracy ? `GPS ±${gps.accuracy} m` : 'GPS aktiv', dot: 'bg-emerald-500', Icon: Navigation },
    denied: { label: 'GPS verweigert', dot: 'bg-red-500', Icon: NavigationOff },
    error: { label: 'GPS-Fehler', dot: 'bg-red-500', Icon: NavigationOff },
  } as const;
  const v = map[gps.status];
  return (
    <span
      role="status"
      title={gps.message ?? v.label}
      aria-label={v.label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
        tone === 'dark' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
        className,
      )}
    >
      <v.Icon size={14} aria-hidden className={gps.status === 'searching' ? 'animate-pulse' : undefined} />
      <span className={cn('h-2 w-2 rounded-full', v.dot)} aria-hidden />
      {showLabel ? <span>{v.label}</span> : null}
    </span>
  );
}
