import { BellRing, Clock, MapPin, Phone, Truck } from 'lucide-react';
import type { Order, TrackingInfo } from '@shared/types';
import { formatTime } from '@shared/format';
import { Avatar } from '@/components/ui';
import { telHref } from '@/components/layout/Footer';
import { cn } from '@/lib/cn';
import type { EtaInfo } from '../lib/useLiveTracking';

export interface LivePanelProps {
  order: Order;
  tracking: TrackingInfo | undefined;
  eta: EtaInfo | null;
  /** Stand der Daten (für „aktualisiert vor …“) */
  loading?: boolean;
  className?: string;
}

/** Fortschritt „Stopps vor Ihnen“ als Punkte */
function StopDots({ before }: { before: number }) {
  const shown = Math.min(before, 6);
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="h-2 w-2 rounded-full bg-brand-300" />
      ))}
      <span className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-brand-950">
        <MapPin size={12} strokeWidth={2.6} />
      </span>
    </span>
  );
}

/** ETA-Karte, Stopps, Fahrer und Hinweise während der Lieferung */
export function LivePanel({ order, tracking, eta, loading, className }: LivePanelProps) {
  const driver = tracking?.driver;
  const tour = tracking?.tour;
  const first = driver?.name.split(' ')[0];
  const out = order.status === 'out_for_delivery';
  const arrived = out && (!!order.arrivedAt || eta?.minutes === 0);
  const stopsBefore = tour?.stopsBefore ?? 0;
  const nextUp = out && !arrived && tour?.status === 'active' && stopsBefore === 0;

  return (
    <div className={cn('space-y-3', className)}>
      {arrived ? (
        <div className="relative overflow-hidden rounded-2xl bg-emerald-600 p-4 text-white shadow-raised sm:p-5" role="status">
          <span className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-center gap-3.5">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <span className="absolute inset-0 animate-ping rounded-2xl bg-white/20" aria-hidden />
              <BellRing size={24} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">{first ?? 'Ihr Fahrer'} ist da!</p>
              <p className="mt-0.5 text-sm text-white/85">
                {order.arrivedAt ? `Angekommen um ${formatTime(order.arrivedAt)} Uhr – ` : ''}bitte öffnen Sie die Tür.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ETA */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
              <Clock size={14} aria-hidden />
              {out ? 'Voraussichtliche Ankunft' : 'Geplante Ankunft'}
            </p>
            {arrived ? (
              <p className="mt-1 text-[1.7rem] font-bold leading-tight tracking-tight text-emerald-700">Angekommen</p>
            ) : eta ? (
              <>
                <p className="mt-1 text-[1.7rem] font-bold leading-tight tracking-tight text-slate-900" aria-live="polite">
                  in ca. <span className="tabular-nums">{eta.minutes}</span> Min.
                </p>
                <p className="mt-0.5 text-[15px] text-slate-600">
                  gegen <span className="font-semibold tabular-nums text-slate-900">{formatTime(eta.arrival)} Uhr</span>
                  <span className="text-slate-400"> · Fenster {order.slot.start}–{order.slot.end}</span>
                </p>
              </>
            ) : (
              <p className="mt-1 text-xl font-bold leading-tight text-slate-900">
                {loading ? 'Wird berechnet …' : `${order.slot.start}–${order.slot.end} Uhr`}
              </p>
            )}
          </div>
          {out && !arrived ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
              Live
            </span>
          ) : null}
        </div>

        {out && !arrived ? (
          <div
            className={cn(
              'mt-4 flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-[15px]',
              nextUp ? 'bg-accent-50 text-accent-900 ring-1 ring-inset ring-accent-200' : 'bg-slate-50 text-slate-700',
            )}
          >
            <span className="font-semibold">
              {nextUp ? 'Sie sind als Nächstes dran!' : stopsBefore === 1 ? 'Noch 1 Stopp vor Ihnen' : `Noch ${stopsBefore} Stopps vor Ihnen`}
            </span>
            <StopDots before={stopsBefore} />
          </div>
        ) : !out ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">
            {tour && tour.stopsBefore > 0
              ? `Ihre Bestellung ist verladen. Auf der Tour sind ${tour.stopsBefore} ${tour.stopsBefore === 1 ? 'Stopp' : 'Stopps'} vor Ihnen geplant.`
              : 'Ihre Bestellung ist verladen. Sobald der Fahrer losfährt, sehen Sie ihn hier live auf der Karte.'}
          </p>
        ) : null}
      </div>

      {/* Fahrer */}
      {driver ? (
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card">
          <Avatar name={driver.name} color={driver.color} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-500">Ihr Fahrer</p>
            <p className="truncate text-base font-bold text-slate-900">{driver.name}</p>
            <p className="flex items-center gap-1.5 truncate text-[13px] text-slate-500">
              <Truck size={14} aria-hidden className="shrink-0" />
              <span className="truncate">{driver.vehicle}</span>
            </p>
          </div>
          <a
            href={telHref(driver.phone)}
            aria-label={`${driver.name} anrufen`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Phone size={18} aria-hidden />
            <span className="hidden sm:inline">Anrufen</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mobil: kompakte Live-Leiste direkt über der Karte – Ankunft, nächster Stopp, Fahrer + Anrufen im ersten Bild.
 * (Desktop zeigt stattdessen das ausführliche LivePanel neben der Karte.)
 */
export function LiveStrip({ order, tracking, eta, loading, className }: LivePanelProps) {
  const driver = tracking?.driver;
  const tour = tracking?.tour;
  const first = driver?.name.split(' ')[0];
  const out = order.status === 'out_for_delivery';
  const arrived = out && (!!order.arrivedAt || eta?.minutes === 0);
  const stopsBefore = tour?.stopsBefore ?? 0;
  const nextUp = out && !arrived && tour?.status === 'active' && stopsBefore === 0;

  const stopText = arrived
    ? order.arrivedAt
      ? `Angekommen um ${formatTime(order.arrivedAt)} Uhr – bitte öffnen Sie die Tür.`
      : 'Bitte öffnen Sie die Tür.'
    : out
      ? nextUp
        ? 'Sie sind als Nächstes dran!'
        : stopsBefore === 1
          ? 'Noch 1 Stopp vor Ihnen'
          : `Noch ${stopsBefore} Stopps vor Ihnen`
      : tour && tour.stopsBefore > 0
        ? `Verladen · ${tour.stopsBefore} ${tour.stopsBefore === 1 ? 'Stopp' : 'Stopps'} vor Ihnen geplant`
        : 'Verladen – Abfahrt in Kürze';

  return (
    <div className={cn('overflow-hidden bg-white', arrived && 'bg-emerald-600 text-white', className)} role="status" aria-live="polite">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {arrived ? (
            <p className="flex items-center gap-2 text-lg font-bold leading-tight">
              <BellRing size={20} aria-hidden className="shrink-0" />
              {first ?? 'Ihr Fahrer'} ist da!
            </p>
          ) : eta && out ? (
            <p className="text-lg font-bold leading-tight text-slate-900">
              Ankunft in ca. <span className="tabular-nums">{eta.minutes}</span> Min.{' '}
              <span className="inline-block whitespace-nowrap text-sm font-medium text-slate-500">gegen {formatTime(eta.arrival)} Uhr</span>
            </p>
          ) : (
            <p className="text-lg font-bold leading-tight text-slate-900">
              {eta ? (
                <>
                  Geplant gegen <span className="tabular-nums">{formatTime(eta.arrival)}</span> Uhr
                </>
              ) : loading ? (
                'Ankunft wird berechnet …'
              ) : (
                `Lieferung ${order.slot.start}–${order.slot.end} Uhr`
              )}
            </p>
          )}
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1.5 text-sm font-semibold',
              arrived ? 'text-white/90' : nextUp ? 'text-accent-800' : 'text-slate-600',
            )}
          >
            {!arrived ? <MapPin size={14} aria-hidden className={cn('shrink-0', nextUp ? 'text-accent-600' : 'text-slate-400')} /> : null}
            {stopText}
          </p>
        </div>
        {out && !arrived ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            Live
          </span>
        ) : null}
      </div>
      {driver ? (
        <div className={cn('flex items-center gap-3 border-t px-4 py-2.5', arrived ? 'border-white/20' : 'border-slate-100')}>
          <Avatar name={driver.name} color={driver.color} size="md" />
          <div className="min-w-0 flex-1">
            <p className={cn('truncate text-[15px] font-semibold', arrived ? 'text-white' : 'text-slate-900')}>{driver.name}</p>
            <p className={cn('truncate text-xs', arrived ? 'text-white/80' : 'text-slate-500')}>Ihr Fahrer · {driver.vehicle.split('·')[0].trim()}</p>
          </div>
          <a
            href={telHref(driver.phone)}
            aria-label={`${driver.name} anrufen`}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold shadow-sm transition-colors',
              arrived ? 'bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-emerald-600 text-white hover:bg-emerald-700',
            )}
          >
            <Phone size={18} aria-hidden />
            Anrufen
          </a>
        </div>
      ) : null}
    </div>
  );
}
