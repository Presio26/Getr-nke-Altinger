import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, Laptop, ListChecks, Presentation, Server, MonitorSmartphone, Smartphone, UserRound, Users, type LucideIcon } from 'lucide-react';
import { getApiMode } from '@/api/client';
import { useBootstrap, useRealtimeStatus, useSettings } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { ROLE_LABEL } from '@/lib/roles';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { signetGlyph } from '@/components/brand/signet';
import { Button, ButtonLink, PageLoader, toast } from '@/components/ui';
import { DEMO_ROLES, GUEST_ID, GUIDE_STEPS, TOTAL_MINUTES } from './data';
import { useOpenAs, useStepProgress } from './hooks';
import { RolesSection } from './components/RolesSection';
import { ScriptSection } from './components/ScriptSection';
import { QuickActions } from './components/QuickActions';
import { TechSection } from './components/TechSection';

const SETUP: { icon: LucideIcon; device: string; role: string }[] = [
  { icon: Smartphone, device: 'iPhone 1', role: 'Kundin Anna' },
  { icon: Smartphone, device: 'iPhone 2', role: 'Fahrer Toni' },
  { icon: Laptop, device: 'Laptop', role: 'Marktleitung' },
  { icon: Presentation, device: 'Beamer', role: 'Spiegelt den Laptop' },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Hero() {
  const settings = useSettings();
  const user = useSession((s) => s.user);
  const status = useRealtimeStatus();
  const { done } = useStepProgress();
  const mode = getApiMode();
  const doneCount = GUIDE_STEPS.filter((s) => done.includes(s.id)).length;

  const chips: { icon: LucideIcon; text: string; dot?: string }[] = [
    {
      icon: mode === 'remote' ? Server : MonitorSmartphone,
      text: mode === 'remote' ? 'Server-Modus' : 'Lokaler Modus',
      dot: mode === 'local' || status === 'online' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-400',
    },
    { icon: UserRound, text: user ? `${user.name} · ${ROLE_LABEL[user.role]}` : 'Nicht angemeldet' },
    { icon: ListChecks, text: `${doneCount} von ${GUIDE_STEPS.length} Schritten` },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 px-5 py-7 text-white shadow-raised sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <svg
        viewBox="0 0 64 64"
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 opacity-[0.07] lg:-bottom-28 lg:right-24 lg:h-[26rem] lg:w-[26rem]"
        dangerouslySetInnerHTML={{ __html: signetGlyph({ glass: '#fff', crate: '#fff', slot: 'transparent', cap: '#fff' }) }}
      />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-center xl:gap-14">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-300">
            Vorführung<span className="hidden sm:inline"> · {settings.legalName}</span>
          </p>
          <h1 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">Demo-Leitfaden</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/75 sm:text-base">
            Alles für die Präsentation an einem Ort: Zugänge für jede Rolle mit QR-Code fürs iPhone, das Drehbuch in {GUIDE_STEPS.length} Schritten (ca.{' '}
            {TOTAL_MINUTES} Minuten) und die wichtigsten Schnellaktionen.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c.text} className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white ring-1 ring-inset ring-white/15">
                {c.dot ? <span className={cn('h-2 w-2 shrink-0 rounded-full', c.dot)} aria-hidden /> : null}
                <c.icon size={15} aria-hidden className="shrink-0 text-white/70" />
                <span className="truncate">{c.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 hidden flex-wrap gap-2.5 lg:flex">
            <Button variant="accent" icon={ArrowDown} onClick={() => scrollToId('drehbuch')}>
              Zum Drehbuch
            </Button>
            <Button variant="ghost" icon={Users} onClick={() => scrollToId('zugaenge')} className="bg-white/10 text-white hover:bg-white/15 hover:text-white active:bg-white/20">
              Zugänge &amp; QR-Codes
            </Button>
          </div>
        </div>

        <div className="hidden rounded-2xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/10 sm:block sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Aufstellung im Raum</p>
          <ul className="mt-3 grid grid-cols-2 gap-2.5">
            {SETUP.map((s) => (
              <li key={s.device} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/[0.06] p-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent-300">
                  <s.icon size={18} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{s.device}</span>
                  <span className="block text-xs leading-snug text-white/60">{s.role}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-white/55">
            {settings.name} · {settings.street} · {settings.zip} {settings.city}
          </p>
        </div>
      </div>
    </section>
  );
}

/** /demo?als=<userId>: automatisch anmelden und zur Startseite der Rolle wechseln (z. B. per QR-Code vom iPhone) */
function useAutoLogin(): string | null {
  const [params, setParams] = useSearchParams();
  const als = params.get('als')?.trim() || null;
  const { demoUsers } = useBootstrap();
  const { openAs } = useOpenAs();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!als || handled.current === als) return;
    handled.current = als;
    const clearParam = () => {
      handled.current = null;
      const next = new URLSearchParams(params);
      next.delete('als');
      setParams(next, { replace: true });
    };
    if (als !== GUEST_ID && !demoUsers.some((u) => u.id === als)) {
      toast.error(demoUsers.length ? 'Diesen Demo-Zugang gibt es nicht.' : 'Die Demo-Anmeldung ist auf diesem Server deaktiviert.', {
        id: 'demo-login',
        description: 'Wählen Sie unten einen der Zugänge.',
      });
      clearParam();
      return;
    }
    void openAs(als, 'auto', { replace: true }).then((ok) => {
      // Fehler wurde bereits als Hinweis angezeigt – Leitfaden ohne Parameter anzeigen
      if (!ok) clearParam();
    });
    // params/setParams/demoUsers bewusst nicht als Abhängigkeit: nur auf einen neuen ?als=-Wert reagieren
  }, [als, openAs]);

  return als;
}

/** Demo-Leitfaden für die Präsentation (/demo) */
export default function DemoGuidePage() {
  useDocumentTitle('Demo-Leitfaden');
  const als = useAutoLogin();
  const { demoUsers } = useBootstrap();

  if (als) {
    const name = als === GUEST_ID ? 'Gast' : (demoUsers.find((u) => u.id === als)?.name ?? DEMO_ROLES.find((r) => r.id === als)?.name ?? 'Demo-Zugang');
    return <PageLoader label={als === GUEST_ID ? 'Shop wird ohne Anmeldung geöffnet …' : `Anmeldung als ${name} …`} className="min-h-[60vh]" />;
  }

  return (
    <div className="pb-6">
      <Hero />

      <nav aria-label="Abschnitte" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0 lg:hidden">
        {[
          ['zugaenge', 'Zugänge'],
          ['drehbuch', 'Drehbuch'],
          ['schnellaktionen', 'Schnellaktionen'],
          ['technik', 'Technik'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToId(id);
            }}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-xs hover:border-slate-300"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-8 sm:mt-10">
        <RolesSection />
      </div>

      <div className="mt-10 grid items-start gap-6 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-8">
        <section id="drehbuch" aria-label="Drehbuch" className="min-w-0 scroll-mt-24">
          <ScriptSection />
        </section>
        <aside id="schnellaktionen" aria-label="Schnellaktionen" className="min-w-0 scroll-mt-24 lg:sticky lg:top-36">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Schnellaktionen</h2>
          <QuickActions />
        </aside>
      </div>

      <TechSection />

      <p className="mt-10 text-center text-[13px] text-slate-400">
        Alle Personen, Firmen und Bestellungen der Demo sind fiktiv. Preise und Öffnungszeiten sind Beispielwerte.{' '}
        <ButtonLink to="/" variant="ghost" size="sm" className="ml-1 align-middle">
          Zum Shop
        </ButtonLink>
      </p>
    </div>
  );
}
