import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Check, Eye, EyeOff, LogOut, RotateCcw, Server, Sparkles, MonitorSmartphone, ChevronRight } from 'lucide-react';
import type { DemoUser, Role } from '@shared/types';
import { api, getApiMode } from '@/api/client';
import { useBootstrap } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { roleHome, ROLE_LABEL } from '@/lib/roles';
import { isMac } from '@/lib/platform';
import { useIsDesktop } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Avatar, Badge, Button, ConfirmModal, Modal, Notice, Spinner, errorMessage, toast, type BadgeTone } from '@/components/ui';

const ROLE_TONE: Record<Role, BadgeTone> = {
  customer: 'neutral',
  business: 'brand',
  driver: 'success',
  admin: 'accent',
};

const ROLE_COLOR: Record<Role, string> = {
  customer: '#0d9488',
  business: '#1d58a0',
  driver: '#16a34a',
  admin: '#d08300',
};

function DemoUserCard({ u, active, loading, onSelect }: { u: DemoUser; active: boolean; loading: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={loading}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-white p-3 text-left transition-[border-color,box-shadow,background-color]',
        active ? 'border-brand-600 bg-brand-50/50 shadow-[0_0_0_1px_var(--color-brand-600)]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <Avatar name={u.name} color={ROLE_COLOR[u.role]} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[15px] font-semibold text-slate-900">{u.name}</span>
          <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{u.description}</span>
      </span>
      <span className="shrink-0 text-slate-400">
        {loading ? <Spinner size={18} /> : active ? <Check size={20} className="text-brand-700" aria-label="angemeldet" /> : <ChevronRight size={18} aria-hidden />}
      </span>
    </button>
  );
}

/**
 * Demo-Umschalter: Ein-Klick-Anmeldung als Kunde, Geschäftskunde, Fahrer oder Markt + Demo-Reset.
 *
 * Zugang:
 *  - Desktop: kleine Pille unten links (Alt+D blendet ein/aus); im Markt-Dashboard stattdessen in der Seitenleiste
 *  - Handy/Tablet und installierte App: Pille standardmäßig AUS (echtes App-Gefühl) – Zugang über Kontomenü,
 *    Footer („Rollen wechseln“) oder dreimal aufs Logo tippen; einblenden lässt sie sich trotzdem
 *  - die Pille liegt nie über Tab-Leiste, fester Aktionsleiste (--sticky-bar-h) oder Footer-Links (--demo-pill-space)
 */
export function DemoSwitcher() {
  const { demoUsers } = useBootstrap();
  const visible = useUi((s) => s.demoBarVisible);
  const toggleBar = useUi((s) => s.toggleDemoBar);
  const setVisible = useUi((s) => s.setDemoBarVisible);
  const open = useUi((s) => s.demoOpen);
  const setOpen = useUi((s) => s.setDemoOpen);
  const user = useSession((s) => s.user);
  const demoLogin = useSession((s) => s.demoLogin);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const mode = getApiMode();
  const desktop = useIsDesktop();
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');
  // im Markt-Dashboard (Desktop) sitzt der Zugang in der Seitenleiste – keine schwebende Pille über „Folgen“ & Co.
  const showPill = visible && demoUsers.length > 0 && !(admin && desktop);

  // Platz für die Pille im Footer freihalten, solange sie schwebt
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--demo-pill-space', showPill ? '3.25rem' : '0px');
    return () => {
      root.style.setProperty('--demo-pill-space', '0px');
    };
  }, [showPill]);

  // Tastenkürzel Alt+D (⌥D)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyD') {
        e.preventDefault();
        toggleBar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleBar]);

  if (!demoUsers.length) return null;

  const select = async (u: DemoUser) => {
    setPending(u.id);
    try {
      const session = await demoLogin(u.id);
      setOpen(false);
      navigate(roleHome(session.user.role));
      toast.success(`Angemeldet als ${session.user.name}`, { id: 'demo-login', description: ROLE_LABEL[session.user.role] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await api.resetDemo();
      setConfirmReset(false);
      setOpen(false);
      toast.success('Demo-Daten wurden zurückgesetzt', { id: 'data-reset' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  const onLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/');
    toast.success('Sie wurden abgemeldet.', { id: 'logout' });
  };

  const customers = demoUsers.filter((u) => u.role === 'customer' || u.role === 'business');
  const team = demoUsers.filter((u) => u.role === 'driver' || u.role === 'admin');
  const shortcut = isMac() ? '⌥ D' : 'Alt + D';

  return (
    <>
      {showPill ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            // klein: mobil nur das 40-px-Symbol, ab lg Symbol + „Demo“; über Tab-Leiste und StickyActionBar
            'no-print fixed left-3 z-40 flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 text-[13px] font-semibold text-white shadow-lg shadow-slate-900/20 ring-1 ring-white/10 backdrop-blur transition-[transform,background-color] hover:bg-slate-900 active:scale-95 bottom-floating lg:left-4 lg:px-3',
          )}
          aria-label={`Demo-Umschalter öffnen${user ? ` (angemeldet: ${user.name})` : ''}`}
          title={`Demo-Umschalter (${shortcut})${user ? ` · ${user.name}` : ''}`}
        >
          <Sparkles size={16} className="text-accent-400" aria-hidden />
          <span className="hidden lg:inline">Demo</span>
        </button>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Demo-Umschalter"
        description="Mit einem Klick zwischen den Rollen wechseln – Passwort für alle Demo-Konten: demo"
      >
        <div className="space-y-5">
          <Notice tone="brand" icon={mode === 'local' ? MonitorSmartphone : Server} title={mode === 'local' ? 'Lokaler Modus' : 'Server-Modus'}>
            {mode === 'local'
              ? 'Alle Daten liegen in diesem Browser. Mehrere Tabs (z. B. Kunde, Fahrer, Markt) synchronisieren sich live.'
              : 'Alle Geräte im Netzwerk sehen dieselben Daten live – z. B. Fahrer-iPhone, Kunden-Handy und Markt-PC.'}
          </Notice>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Kundinnen &amp; Kunden</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {customers.map((u) => (
                <DemoUserCard key={u.id} u={u} active={user?.id === u.id} loading={pending === u.id} onSelect={() => void select(u)} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Team Altinger</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {team.map((u) => (
                <DemoUserCard key={u.id} u={u} active={user?.id === u.id} loading={pending === u.id} onSelect={() => void select(u)} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Link
              to="/demo"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-50 px-3.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
            >
              <BookOpen size={17} aria-hidden /> Demo-Leitfaden
            </Link>
            <Button variant="outline" size="sm" icon={RotateCcw} onClick={() => setConfirmReset(true)} className="h-10">
              Demo-Daten zurücksetzen
            </Button>
            {user ? (
              <Button variant="ghost" size="sm" icon={LogOut} onClick={() => void onLogout()} className="h-10">
                Abmelden
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon={visible ? EyeOff : Eye}
              className="h-10 sm:ml-auto"
              title={`Demo-Pille ${visible ? 'ausblenden' : 'einblenden'} (${shortcut})`}
              onClick={() => {
                setVisible(!visible);
                setOpen(false);
                toast.info(visible ? 'Demo-Pille ausgeblendet' : 'Demo-Pille eingeblendet', {
                  description: visible
                    ? `Zugang weiter über das Kontomenü, „Rollen wechseln“ im Seitenfuß, ${shortcut} oder dreimal aufs Logo tippen.`
                    : `Ausblenden mit ${shortcut} oder hier im Demo-Umschalter.`,
                  id: 'demo-hidden',
                });
              }}
            >
              {visible ? 'Pille ausblenden' : 'Pille einblenden'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
        loading={resetting}
        tone="danger"
        title="Demo-Daten zurücksetzen?"
        message="Alle Bestellungen, Touren und Änderungen seit dem Start werden verworfen. Das Sortiment, die Kunden und die Beispiel-Touren werden neu erzeugt – auf allen verbundenen Geräten."
        confirmLabel="Zurücksetzen"
      />
    </>
  );
}
