import { Link } from 'react-router-dom';
import { Clock, Mail, MapPin, Phone, Sparkles } from 'lucide-react';
import { useBootstrap, useSettings } from '@/api/hooks';
import { getApiMode } from '@/api/client';
import { useUi } from '@/stores/ui';
import { groupOpeningHours } from '@/lib/openingHours';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';

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

export function Footer() {
  const settings = useSettings();
  const { version } = useBootstrap();
  const demoBarVisible = useUi((s) => s.demoBarVisible);
  const setDemoBarVisible = useUi((s) => s.setDemoBarVisible);
  const hours = groupOpeningHours(settings.openingHours);
  const mode = getApiMode();

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
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
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
              <a href={telHref(settings.phone)} className="flex items-center gap-3 hover:text-white">
                <Phone size={17} className="shrink-0 text-slate-500" aria-hidden />
                {settings.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${settings.email}`} className="flex items-center gap-3 break-all hover:text-white">
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
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-accent-400">Service</h2>
          <ul className="space-y-2.5 text-sm">
            {SERVICE_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        {/* unten Platz für die mobile Tab-Leiste und – falls sichtbar – die Demo-Pille, damit nichts verdeckt wird */}
        <div
          className={cn(
            'mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-5 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8',
            demoBarVisible ? 'pb-tabbar-demo lg:pb-[4.5rem]' : 'pb-tabbar lg:pb-5',
          )}
        >
          <p>
            © {new Date().getFullYear()} {settings.legalName} · Demo-Version {version} · {mode === 'local' ? 'Lokaler Modus' : 'Server-Modus'}
          </p>
          <nav aria-label="Rechtliches" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/impressum" className="hover:text-slate-200">
              Impressum
            </Link>
            <Link to="/datenschutz" className="hover:text-slate-200">
              Datenschutz
            </Link>
            <Link to="/demo" className="hover:text-slate-200">
              Demo-Leitfaden
            </Link>
            {!demoBarVisible ? (
              <button type="button" onClick={() => setDemoBarVisible(true)} className="inline-flex items-center gap-1 hover:text-slate-200">
                <Sparkles size={13} aria-hidden /> Demo-Umschalter einblenden
              </button>
            ) : null}
          </nav>
        </div>
      </div>
    </footer>
  );
}
