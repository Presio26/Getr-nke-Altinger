import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, HardDrive, RefreshCw, Server, WifiOff, X } from 'lucide-react';
import { useRealtimeStatus } from '@/api/hooks';
import { getApiMode, isModeSwitchable, probeServer, reconnectRealtime } from '@/api/client';
import { useOnline } from '@/lib/hooks';
import { readStorage, writeStorage } from '@/lib/storage';
import { cn } from '@/lib/cn';

/** Verzögerung, bevor „Keine Verbindung“ erscheint (kurze Abbrüche, z. B. App kommt aus dem Hintergrund) */
const OFFLINE_DELAY_MS = 1500;
const RECONNECTED_MS = 2500;
const LOCAL_DISMISS_KEY = 'altinger.localBanner';
const SERVER_CHECK_MS = 30_000;

type View = 'none' | 'offline' | 'no-internet' | 'reconnected' | 'local';

/** Lokaler Modus: regelmäßig prüfen, ob (wieder) ein Server erreichbar ist → Wechsel anbieten */
function useServerAvailable(enabled: boolean): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = async () => {
      const result = await probeServer(2500).catch(() => 'unreachable' as const);
      if (alive) setAvailable(result === 'remote');
    };
    void check();
    const t = window.setInterval(() => void check(), SERVER_CHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [enabled]);
  return available;
}

function switchToServer() {
  const url = new URL(window.location.href);
  url.searchParams.set('api', 'auto');
  window.location.href = `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Verbindungs-Banner für alle Layouts (Shop, Fahrer, Markt) – sitzt in der jeweiligen (sticky) Kopfzeile:
 *  - remote, Echtzeit-Verbindung weg: „Keine Verbindung zum Server – wird automatisch erneut versucht“
 *  - Gerät offline: „Keine Internetverbindung …“
 *  - nach dem Wiederverbinden kurz „Wieder verbunden“ (Daten lädt RealtimeBridge neu)
 *  - lokaler Modus: „Lokaler Demo-Modus – Daten nur auf diesem Gerät“ (im Tab schließbar)
 */
export function ConnectionBanner({ className }: { className?: string }) {
  const status = useRealtimeStatus();
  const online = useOnline();
  const local = getApiMode() === 'local';
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [localDismissed, setLocalDismissed] = useState(() => readStorage(LOCAL_DISMISS_KEY, 'session') === '1');
  const shownOffline = useRef(false);
  const serverAvailable = useServerAvailable(local && isModeSwitchable());

  const disconnected = !local && (status === 'offline' || (status === 'connecting' && shownOffline.current) || !online);

  useEffect(() => {
    if (!disconnected) {
      setOfflineVisible(false);
      if (shownOffline.current) {
        shownOffline.current = false;
        setReconnected(true);
        const t = window.setTimeout(() => setReconnected(false), RECONNECTED_MS);
        return () => window.clearTimeout(t);
      }
      return;
    }
    setReconnected(false);
    const t = window.setTimeout(() => {
      shownOffline.current = true;
      setOfflineVisible(true);
    }, OFFLINE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [disconnected]);

  let view: View = 'none';
  if (local) view = localDismissed && !serverAvailable ? 'none' : 'local';
  else if (offlineVisible) view = online ? 'offline' : 'no-internet';
  else if (reconnected) view = 'reconnected';

  if (view === 'none') return null;

  const tone =
    view === 'reconnected'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : view === 'local'
        ? 'bg-sky-50 text-sky-900 border-sky-200'
        : 'bg-amber-50 text-amber-950 border-amber-200';

  return (
    <div role="status" className={cn('no-print border-b text-[13px] font-medium', tone, className)}>
      <div className="mx-auto flex min-h-9 max-w-7xl items-center gap-2 px-4 py-1 sm:px-6 lg:px-8">
        {view === 'reconnected' ? (
          <>
            <CheckCircle2 size={15} aria-hidden className="shrink-0 text-emerald-600" />
            <p className="min-w-0 flex-1 truncate">Wieder verbunden – die Daten wurden aktualisiert.</p>
          </>
        ) : view === 'local' ? (
          <>
            <HardDrive size={15} aria-hidden className="shrink-0 text-sky-600" />
            <p className="min-w-0 flex-1 leading-snug">
              Lokaler Demo-Modus – Daten nur auf diesem Gerät<span className="hidden sm:inline">, ohne Live-Abgleich mit anderen Geräten</span>.
            </p>
            {serverAvailable ? (
              <button
                type="button"
                onClick={switchToServer}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold text-sky-800 underline-offset-2 hover:bg-sky-100 hover:underline"
              >
                <Server size={14} aria-hidden /> <span className="sm:hidden">Verbinden</span>
                <span className="hidden sm:inline">Mit Server verbinden</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  writeStorage(LOCAL_DISMISS_KEY, '1', 'session');
                  setLocalDismissed(true);
                }}
                aria-label="Hinweis zum lokalen Modus schließen"
                className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-100"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </>
        ) : (
          <>
            <WifiOff size={15} aria-hidden className="shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1 leading-snug">
              {view === 'no-internet' ? 'Keine Internetverbindung – wird automatisch erneut versucht' : 'Keine Verbindung zum Server – wird automatisch erneut versucht'}
            </p>
            {view === 'offline' ? (
              <button
                type="button"
                onClick={() => reconnectRealtime()}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw size={14} aria-hidden className={status === 'connecting' ? 'animate-spin' : undefined} />
                <span className="hidden sm:inline">Jetzt verbinden</span>
                <span className="sr-only sm:hidden">Jetzt verbinden</span>
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
