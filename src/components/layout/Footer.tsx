import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';
import { Clock, Mail, MapPin, Phone, Sparkles, Users } from 'lucide-react';
import { useSettings } from '@/api/hooks';
import { getApiMode } from '@/api/client';
import { useUi } from '@/stores/ui';
import { groupOpeningHours } from '@/lib/openingHours';
import { APP_VERSION } from '@/lib/version';
import { Logo } from '@/components/brand/Logo';
import { usePageLoading } from '@/components/ui';

const SERVICE_LINKS = [
  { to: '/sortiment', label: 'Sortiment' },
  { to: '/angebote', label: 'Angebote der Woche' },
  { to: '/fest', label: 'Festservice & Verleih' },
  { to: '/geschaeftskunde', label: 'Geschäftskunde werden' },
  { to: '/markt', label: 'Markt & Anfahrt' },
];

/** Telefonnummer als tel:-Link ("089 3202562" → "+49893202562") */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return `tel:${digits.startsWith('0') ? `+49${digits.slice(1)}` : digits}`;
}

/** Touch-Ziele im Footer: mindestens 40 px hoch */
const LINK = 'inline-flex min-h-10 items-center';

/** höchstens so lange nach einem Seitenwechsel auf die ersten Daten warten, bevor der Footer erscheint */
const SETTLE_MAX_MS = 4000;

/**
 * Footer erst zeigen, wenn die Seite steht: nach einem Seitenwechsel warten, bis die erstmals geladenen
 * Daten (Abfragen ohne Daten) da sind – sonst schiebt das Nachladen den Footer sichtbar nach unten (CLS).
 * Spätere Hintergrund-Aktualisierungen blenden ihn nicht mehr aus.
 */
function usePageSettled(): boolean {
  const { pathname } = useLocation();
  const initialLoads = useIsFetching({ predicate: (q) => q.state.data === undefined });
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const settled = settledPath === pathname;
  useEffect(() => {
    if (settled) return;
    const t = window.setTimeout(() => setSettledPath(pathname), initialLoads === 0 ? 60 : SETTLE_MAX_MS);
    return () => window.clearTimeout(t);
  }, [initialLoads, pathname, settled]);
  return settled;
}

export function Footer() {
  const settings = useSettings();
  const demoBarVisible = useUi((s) => s.demoBarVisible);
  const setDemoBarVisible = useUi((s) => s.setDemoBarVisible);
  const setDemoOpen = useUi((s) => s.setDemoOpen);
  const loading = usePageLoading();
  const settled = usePageSettled();
  const hours = groupOpeningHours(settings.openingHours);
  const mode = getApiMode();

  // Während eine Seite lädt, keinen Footer zeigen – sonst springt er beim Erscheinen der Seite (CLS)
  if (loading || !settled) return null;

  return (
    <footer className="mt-16 bg-brand-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div className="space-y-4">
          <Logo variant="white" className="h-11" />
          <p className="max-w-xs text-sm leading-relaxed text-slate-400">
            Ihr Getränkemarkt in Garching – mit Lieferservice, Click &amp; Collect und Festservice für Privat- und Geschäftskunden.
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-accent-400">Markt</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex gap-3 pb-2">
              <MapPin size={17} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
              <span>
                {settings.legalName}
                <br />
                {settings.street}
                <br />
                {settings.zip} {settings.city}
              </span>
            </li>
            <li>
              <a href={telHref(settings.phone)} className={`${LINK} gap-3 hover:text-white`}>
                <Phone size={17} className="shrink-0 text-slate-500" aria-hidden />
                {settings.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${settings.email}`} className={`${LINK} gap-3 break-all hover:text-white`}>
                <Mail size={17} className="shrink-0 text-slate-500" aria-hidden />
                {settings.email}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-400">
            <Clock size={14} aria-hidden /> Öffnungszeiten
          </h2>
          <dl className="space-y-2 text-sm">
            {hours.map((h) => (
              <div key={h.days} className="flex justify-between gap-4">
                <dt className="text-slate-400">{h.days}</dt>
                <dd className={h.closed ? 'text-slate-500' : 'font-medium text-white tabular-nums'}>{h.hours}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-accent-400">Service</h2>
          <ul className="text-sm">
            {SERVICE_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className={`${LINK} hover:text-white`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        {/* unten Platz für Tab-Leiste, feste Aktionsleiste und – falls sichtbar – die Demo-Pille (CSS-Variablen) */}
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pt-4 text-xs text-slate-500 pb-tabbar-demo sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="py-1">
            © {new Date().getFullYear()} {settings.legalName} · Demo-Version {APP_VERSION} · {mode === 'local' ? 'Lokaler Modus' : 'Server-Modus'}
          </p>
          <nav aria-label="Rechtliches und Demo" className="-mx-2 flex flex-wrap items-center gap-x-1">
            <Link to="/impressum" className={`${LINK} rounded-lg px-2 hover:text-slate-200`}>
              Impressum
            </Link>
            <Link to="/datenschutz" className={`${LINK} rounded-lg px-2 hover:text-slate-200`}>
              Datenschutz
            </Link>
            <Link to="/demo" className={`${LINK} rounded-lg px-2 hover:text-slate-200`}>
              Demo-Leitfaden
            </Link>
            <button type="button" onClick={() => setDemoOpen(true)} className={`${LINK} gap-1.5 rounded-lg px-2 hover:text-slate-200`}>
              <Users size={13} aria-hidden /> Rollen wechseln
            </button>
            <button type="button" onClick={() => setDemoBarVisible(!demoBarVisible)} className={`${LINK} gap-1.5 rounded-lg px-2 hover:text-slate-200`}>
              <Sparkles size={13} aria-hidden /> {demoBarVisible ? 'Demo-Pille ausblenden' : 'Demo-Pille einblenden'}
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
