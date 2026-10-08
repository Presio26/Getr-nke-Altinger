/**
 * GPS-Teilen während einer aktiven Tour – im DriverLayout montiert, damit die Übertragung auf
 * Tour- UND Stopp-Seite weiterläuft:
 *  - useGeolocation → api.updateDriverPosition, gedrosselt (ca. alle 4 s)
 *  - eigene Position sofort im Positions-Store (Marker bewegt sich ohne Server-Umweg)
 *  - Screen Wake Lock, solange eine Tour aktiv ist (falls vom Browser unterstützt)
 *  - Hinweisleiste bei verweigerter Freigabe bzw. fehlendem HTTPS
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPinOff, ShieldAlert } from 'lucide-react';
import { api } from '@/api/client';
import { useDriverToday } from '@/api/hooks';
import { useGeolocation, type GeoFix } from '@/lib/geolocation';
import { isIos } from '@/lib/platform';
import { usePositions } from '@/stores/positions';
import { Button, Modal } from '@/components/ui';
import { GPS_SEND_INTERVAL_MS, useGpsShare } from '../lib/gpsShare';

function useScreenWakeLock(enabled: boolean) {
  const setWakeLock = useGpsShare((s) => s.setWakeLock);
  useEffect(() => {
    if (!enabled) {
      setWakeLock('off');
      return;
    }
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) {
      setWakeLock('unsupported');
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        setWakeLock('active');
        s.addEventListener('release', () => {
          if (!cancelled) setWakeLock('blocked');
        });
      } catch {
        if (!cancelled) setWakeLock('blocked');
      }
    };
    void request();
    // Nach dem Zurückkehren in die App (Bildschirm aus/an, App-Wechsel) neu anfordern
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      setWakeLock('off');
    };
  }, [enabled, setWakeLock]);
}

/** Hilfe zur Standortfreigabe (iPhone/Android) */
export function GpsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ios = isIos();
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Standort freigeben"
      description="Damit Kunden und Markt Ihre Position live sehen, braucht die App Zugriff auf den Standort."
      footer={
        <Button onClick={onClose} block className="sm:w-auto">
          Verstanden
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-slate-700">
        {insecure ? (
          <p className="rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-inset ring-amber-200">
            Diese Seite ist nicht über HTTPS geöffnet. Browser geben den Standort nur über eine sichere Verbindung frei –
            bitte öffnen Sie die App über die HTTPS-Adresse. Für Vorführungen können Sie alternativ die Fahrtsimulation verwenden.
          </p>
        ) : null}
        <div className={ios ? undefined : 'order-last'}>
          <p className="font-semibold text-slate-900">iPhone / iPad</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Einstellungen → Datenschutz &amp; Sicherheit → Ortungsdienste aktivieren</li>
            <li>„Safari-Websites“ (bzw. die installierte App) → „Beim Verwenden der App“</li>
            <li>„Genauer Standort“ einschalten und die Seite neu laden</li>
          </ol>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Android (Chrome)</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Auf das Schloss-Symbol neben der Adresse tippen</li>
            <li>Berechtigungen → Standort → „Zulassen“</li>
            <li>Seite neu laden</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Unsichtbarer Dienst + Hinweisleiste. Einmal im DriverLayout montieren.
 */
export function DriverGpsBridge() {
  const { data } = useDriverToday();
  const driverId = data?.driver.id;
  const activeTour = data?.tours.find((t) => t.status === 'active');
  const pausedTourId = useGpsShare((s) => s.pausedTourId);
  const markSent = useGpsShare((s) => s.markSent);
  const markFailed = useGpsShare((s) => s.markFailed);
  const setSharing = useGpsShare((s) => s.setSharing);
  const simulating = !!activeTour?.simulation?.running;
  const enabled = !!activeTour && pausedTourId !== activeTour.id && !simulating;
  const gpsStatus = usePositions((s) => s.gps.status);
  const gpsMessage = usePositions((s) => s.gps.message);
  const [help, setHelp] = useState(false);

  const latest = useRef<GeoFix | null>(null);
  const lastSentTs = useRef<string | null>(null);
  const lastSentAt = useRef(0);
  const inflight = useRef(false);

  const flush = useCallback(async () => {
    const fix = latest.current;
    if (!fix || inflight.current || fix.timestamp === lastSentTs.current) return;
    if (Date.now() - lastSentAt.current < GPS_SEND_INTERVAL_MS - 150) return;
    inflight.current = true;
    lastSentAt.current = Date.now();
    lastSentTs.current = fix.timestamp;
    try {
      await api.updateDriverPosition({
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        timestamp: fix.timestamp,
        ...(fix.heading !== undefined ? { heading: fix.heading } : {}),
        ...(fix.speed !== undefined ? { speed: fix.speed } : {}),
      });
      markSent(new Date().toISOString());
    } catch {
      // z. B. kurz offline – nächster Fix versucht es erneut
      markFailed();
    } finally {
      inflight.current = false;
    }
  }, [markSent, markFailed]);

  const onFix = useCallback(
    (fix: GeoFix) => {
      latest.current = fix;
      if (driverId) {
        usePositions.getState().setPosition(driverId, {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          timestamp: fix.timestamp,
          ...(fix.heading !== undefined ? { heading: fix.heading } : {}),
          ...(fix.speed !== undefined ? { speed: fix.speed } : {}),
        });
      }
      void flush();
    },
    [driverId, flush],
  );

  useGeolocation(enabled, onFix);
  useScreenWakeLock(!!activeTour);

  useEffect(() => {
    setSharing(enabled);
    if (!enabled) {
      latest.current = null;
      return;
    }
    // nachlaufend senden, falls Fixes schneller kommen als das Intervall
    const t = window.setInterval(() => void flush(), 1000);
    return () => window.clearInterval(t);
  }, [enabled, flush, setSharing]);

  useEffect(() => () => setSharing(false), [setSharing]);

  const problem = enabled && (gpsStatus === 'denied' || gpsStatus === 'error');
  if (!problem) return help ? <GpsHelpModal open onClose={() => setHelp(false)} /> : null;

  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
  const Icon = insecure ? ShieldAlert : MapPinOff;
  return (
    <>
      <div role="alert" className="border-b border-amber-200 bg-amber-50 text-amber-950">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 lg:max-w-6xl">
          <Icon size={20} aria-hidden className="shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
            {gpsStatus === 'denied'
              ? 'Standortfreigabe verweigert – Kunden sehen Ihre Position nicht.'
              : insecure
                ? 'GPS nur über HTTPS verfügbar – Ihre Position wird nicht übertragen.'
                : (gpsMessage ?? 'Der Standort ist derzeit nicht verfügbar.')}
            {activeTour ? (
              <Link to={`/fahrer/tour/${activeTour.id}`} className="ml-1 hidden font-semibold underline underline-offset-2 sm:inline">
                Zur Tour
              </Link>
            ) : null}
          </p>
          <Button size="sm" variant="outline" onClick={() => setHelp(true)} className="border-amber-300 bg-white/70">
            Hilfe
          </Button>
        </div>
      </div>
      <GpsHelpModal open={help} onClose={() => setHelp(false)} />
    </>
  );
}
