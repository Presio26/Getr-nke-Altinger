import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MapPin, Navigation, Phone } from 'lucide-react';
import type { StoreSettings } from '@shared/types';
import { WEEKDAY_LABEL } from '@shared/format';
import { berlinParts } from '@shared/time';
import { useSettings } from '@/api/hooks';
import { telHref } from '@/components/layout/Footer';
import { BaseMap, StoreMarker } from '@/components/map';
import { Card } from '@/components/ui';
import { groupOpeningHours, openState } from '@/lib/openingHours';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';

/** Routen-Links für Apple Karten und Google Maps */
export function mapsLinks(s: Pick<StoreSettings, 'location' | 'name' | 'street' | 'zip' | 'city'>) {
  const { lat, lng } = s.location;
  const label = `${s.name}, ${s.street}, ${s.zip} ${s.city}`;
  return {
    apple: `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label)}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  };
}

/** „Jetzt geöffnet · bis 20:00 Uhr“ als Pille */
export function OpenBadge({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const settings = useSettings();
  const now = useNow(60_000);
  const state = openState(settings.openingHours, now);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold',
        onDark
          ? 'bg-white/10 text-white ring-1 ring-inset ring-white/15 backdrop-blur'
          : state.open
            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
            : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {state.open ? <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" /> : null}
        <span className={cn('relative h-2 w-2 rounded-full', state.open ? 'bg-emerald-500' : onDark ? 'bg-white/50' : 'bg-slate-400')} />
      </span>
      {state.open ? 'Jetzt geöffnet' : 'Jetzt geschlossen'}
      <span className={cn('font-medium', onDark ? 'text-white/70' : 'opacity-75')}>· {state.text.replace(/^Geöffnet /, '')}</span>
    </span>
  );
}

/** Öffnungszeiten je Wochentag (Mo–So), heutiger Tag hervorgehoben */
export function OpeningHoursList({ className, grouped = false }: { className?: string; grouped?: boolean }) {
  const settings = useSettings();
  const now = useNow(60_000);
  const today = berlinParts(now).weekday;
  if (grouped) {
    return (
      <dl className={cn('space-y-1.5 text-[15px]', className)}>
        {groupOpeningHours(settings.openingHours).map((l) => (
          <div key={l.days} className="flex justify-between gap-4">
            <dt className="text-slate-500">{l.days}</dt>
            <dd className={cn('tabular-nums', l.closed ? 'text-slate-400' : 'font-semibold text-slate-900')}>{l.hours}</dd>
          </div>
        ))}
      </dl>
    );
  }
  const days = [1, 2, 3, 4, 5, 6, 0];
  return (
    <dl className={cn('divide-y divide-slate-100 text-[15px]', className)}>
      {days.map((d) => {
        const h = settings.openingHours[d] ?? null;
        const isToday = d === today;
        return (
          <div key={d} className={cn('flex items-center justify-between gap-4 py-2', isToday && '-mx-3 rounded-xl border-0 bg-brand-50 px-3 font-semibold')}>
            <dt className={cn(isToday ? 'text-brand-900' : 'text-slate-600')}>
              {WEEKDAY_LABEL[d]}
              {isToday ? <span className="ml-2 rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-bold text-white">Heute</span> : null}
            </dt>
            <dd className={cn('tabular-nums', h ? (isToday ? 'text-brand-900' : 'font-medium text-slate-900') : 'text-slate-400')}>
              {h ? `${h.open} – ${h.close} Uhr` : 'geschlossen'}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Kompakte Markt-Karte (Startseite): Kartenausschnitt, Adresse, Öffnungsstatus, Aktionen */
export function StoreMapCard({ className }: { className?: string }) {
  const settings = useSettings();
  const links = mapsLinks(settings);
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative h-56 md:h-full md:min-h-[20rem]">
          <BaseMap static zoom={15} className="absolute inset-0">
            <StoreMarker permanentLabel />
          </BaseMap>
        </div>
        <div className="flex flex-col p-5 sm:p-7">
          <OpenBadge className="self-start" />
          <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900">Besuchen Sie uns in Garching</h3>
          <p className="mt-2 flex items-start gap-2 text-[15px] text-slate-600">
            <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              {settings.street}, {settings.zip} {settings.city}
            </span>
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              <Clock size={14} aria-hidden /> Öffnungszeiten
            </p>
            <OpeningHoursList grouped />
          </div>
          <div className="mt-5 flex flex-wrap gap-2 md:mt-auto md:pt-5">
            <a
              href={links.google}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-800"
            >
              <Navigation size={18} aria-hidden /> Route planen
            </a>
            <a
              href={telHref(settings.phone)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Phone size={18} aria-hidden /> Anrufen
            </a>
            <Link to="/markt" className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold text-brand-700 hover:bg-brand-50">
              Mehr zum Markt <ArrowRight size={17} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
