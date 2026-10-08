import { useCallback } from 'react';
import type L from 'leaflet';
import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { useSettings } from '@/api/hooks';
import { BaseMap, StoreMarker } from '@/components/map';
import { telHref } from '@/components/layout/Footer';
import { groupOpeningHours, openState } from '@/lib/openingHours';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { appleMapsRoute, googleMapsRoute } from '../lib/links';

/** Öffnungszeiten als kompakte Liste mit "Jetzt geöffnet"-Hinweis */
export function OpeningHoursList({ className }: { className?: string }) {
  const settings = useSettings();
  const now = useNow(60_000);
  const state = openState(settings.openingHours, now);
  const lines = groupOpeningHours(settings.openingHours);
  return (
    <div className={className}>
      <p className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', state.open ? 'text-emerald-700' : 'text-slate-600')}>
        <span className={cn('h-2 w-2 rounded-full', state.open ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden />
        {state.text}
      </p>
      <dl className="space-y-1 text-sm">
        {lines.map((l) => (
          <div key={l.days} className="flex justify-between gap-4">
            <dt className="text-slate-500">{l.days}</dt>
            <dd className={cn('tabular-nums', l.closed ? 'text-slate-400' : 'font-medium text-slate-800')}>{l.hours}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Routenplaner-Knöpfe (Apple Karten / Google Maps) */
export function RouteLinks({ className }: { className?: string }) {
  const settings = useSettings();
  const label = `${settings.name}, ${settings.street}, ${settings.zip} ${settings.city}`;
  const linkCls =
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:border-slate-400 hover:bg-slate-50';
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <a href={appleMapsRoute(settings.location, label)} target="_blank" rel="noopener noreferrer" className={linkCls}>
        <Navigation size={16} aria-hidden className="text-brand-700" />
        Apple Karten
      </a>
      <a href={googleMapsRoute(settings.location)} target="_blank" rel="noopener noreferrer" className={linkCls}>
        <Navigation size={16} aria-hidden className="text-brand-700" />
        Google Maps
      </a>
    </div>
  );
}

/** Markt-Infos für Click & Collect: Adresse, Telefon, Öffnungszeiten, Mini-Karte, Route */
export function StoreInfo({
  showMap = true,
  showHours = true,
  stacked = false,
  className,
}: {
  showMap?: boolean;
  showHours?: boolean;
  /** Karte unter den Angaben (schmale Spalten) */
  stacked?: boolean;
  className?: string;
}) {
  const settings = useSettings();
  const store = settings.location;
  // Karte nach Größenänderungen wieder auf den Markt zentrieren (statische Vorschau)
  const onReady = useCallback(
    (map: L.Map) => {
      map.on('resize', () => map.setView([store.lat, store.lng], map.getZoom(), { animate: false }));
    },
    [store.lat, store.lng],
  );
  return (
    <div className={cn('grid gap-4', showMap && !stacked && 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]', className)}>
      <div className="min-w-0 space-y-4">
        <div className="flex gap-3">
          <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-700" />
          <div className="text-[15px] leading-snug">
            <p className="font-semibold text-slate-900">{settings.name}</p>
            <p className="text-slate-600">{settings.street}</p>
            <p className="text-slate-600">
              {settings.zip} {settings.city}
            </p>
            <a href={telHref(settings.phone)} className="mt-1 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
              <Phone size={14} aria-hidden />
              {settings.phone}
            </a>
          </div>
        </div>
        {showHours ? (
          <div className="flex gap-3">
            <Clock size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-700" />
            <OpeningHoursList className="min-w-0 flex-1" />
          </div>
        ) : null}
      </div>
      {showMap ? (
        <div className="min-w-0">
          <div className="h-48 overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <BaseMap static zoom={15} zoomControl={false} onReady={onReady}>
              <StoreMarker permanentLabel />
            </BaseMap>
          </div>
        </div>
      ) : null}
    </div>
  );
}
