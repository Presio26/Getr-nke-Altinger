import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, LogIn, LogOut, Mail, MapPinned, ShoppingBag, Sparkles, Truck } from 'lucide-react';
import type { DemoUser, Role } from '@shared/types';
import { useBootstrap } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { roleHome, ROLE_LABEL, safeNext } from '@/lib/roles';
import { Avatar, Badge, Button, ButtonLink, Card, Divider, Input, Notice, PageHeader, Spinner, errorMessage, toast, type BadgeTone } from '@/components/ui';
import { AuthShell } from './AuthShell';

const ROLE_TONE: Record<Role, BadgeTone> = { customer: 'neutral', business: 'brand', driver: 'success', admin: 'accent' };
const ROLE_COLOR: Record<Role, string> = { customer: '#0d9488', business: '#1d58a0', driver: '#16a34a', admin: '#d08300' };

const BENEFITS = [
  { icon: Truck, title: 'Lieferung bis an die Tür', text: 'Kästen, Fässer und Festbedarf – auf Wunsch mit Tragservice bis in die Wohnung.' },
  { icon: MapPinned, title: 'Live-Tracking', text: 'Sehen Sie auf der Karte, wo Ihr Fahrer gerade ist und wann er ankommt.' },
  { icon: ShoppingBag, title: 'Click & Collect', text: 'Online reservieren, im Markt abholen – ohne Wartezeit, mit Abholcode.' },
  { icon: Building2, title: 'Für Geschäftskunden', text: 'Nettopreise, Staffelrabatte, Rechnungskauf und Daueraufträge.' },
];

function DemoAccessGrid({ users, onPick, pending }: { users: DemoUser[]; onPick: (u: DemoUser) => void; pending: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {users.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onPick(u)}
          disabled={!!pending}
          className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-brand-300 hover:shadow-card disabled:opacity-60"
        >
          <Avatar name={u.name} color={ROLE_COLOR[u.role]} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-slate-900">{u.name}</span>
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-slate-500" title={u.description}>
              {u.description}
            </span>
            <Badge tone={ROLE_TONE[u.role]} className="mt-1.5">
              {ROLE_LABEL[u.role]}
            </Badge>
          </span>
          {pending === u.id ? (
            <Spinner size={18} />
          ) : (
            <ArrowRight size={18} aria-hidden className="shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
          )}
        </button>
      ))}
    </div>
  );
}

/** Anmeldung mit E-Mail/Passwort und Demo-Schnellzugängen */
export default function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { demoUsers } = useBootstrap();
  const user = useSession((s) => s.user);
  const login = useSession((s) => s.login);
  const demoLogin = useSession((s) => s.demoLogin);
  const logout = useSession((s) => s.logout);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Bitte geben Sie E-Mail-Adresse und Passwort ein.');
      return;
    }
    setBusy(true);
    try {
      const session = await login(email, password);
      toast.success(`Willkommen, ${session.user.name.split(' ')[0]}!`, { id: 'login' });
      navigate(next ?? roleHome(session.user.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pickDemo = async (u: DemoUser) => {
    setError(null);
    setPending(u.id);
    try {
      const session = await demoLogin(u.id);
      toast.success(`Angemeldet als ${session.user.name}`, { id: 'login', description: ROLE_LABEL[session.user.role] });
      navigate(next ?? roleHome(session.user.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <AuthShell eyebrow="Getränke Altinger · Garching" headline="Ihr Getränkemarkt – jetzt auch in der Hosentasche." benefits={BENEFITS}>
      <PageHeader title="Anmelden" subtitle="Melden Sie sich an, um zu bestellen, Lieferungen zu verfolgen und Ihre Vorteile zu nutzen." />

      {user ? (
        <Notice
          tone="brand"
          icon={LogIn}
          title={`Sie sind angemeldet als ${user.name}`}
          className="mb-5"
          action={
            <div className="flex flex-wrap gap-2">
              <ButtonLink to={next ?? roleHome(user.role)} size="sm" iconRight={ArrowRight}>
                Weiter
              </ButtonLink>
              <Button size="sm" variant="ghost" icon={LogOut} onClick={() => void logout()}>
                Abmelden
              </Button>
            </div>
          }
        >
          {ROLE_LABEL[user.role]} · {user.email}
        </Notice>
      ) : null}

      <Card padding="lg" className="max-w-xl">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input
            label="E-Mail-Adresse"
            type="email"
            autoComplete="username"
            inputMode="email"
            icon={Mail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@beispiel.de"
            required
          />
          <Input
            label="Passwort"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            icon={KeyRound}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            suffix={
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                {showPw ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            }
          />
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <Button type="submit" block size="lg" loading={busy} icon={LogIn}>
            Anmelden
          </Button>
          <p className="text-center text-sm text-slate-500">
            Noch kein Konto?{' '}
            <Link to={next ? `/registrieren?next=${encodeURIComponent(next)}` : '/registrieren'} className="font-semibold text-brand-700 hover:text-brand-800">
              Jetzt registrieren
            </Link>{' '}
            ·{' '}
            <Link to="/geschaeftskunde" className="font-semibold text-brand-700 hover:text-brand-800">
              Geschäftskunde werden
            </Link>
          </p>
        </form>
      </Card>

      {demoUsers.length ? (
        <section className="mt-8 max-w-3xl" aria-labelledby="demo-heading">
          <Divider label="Demo" />
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="demo-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Sparkles size={18} className="text-accent-500" aria-hidden />
                Demo-Schnellzugänge
              </h2>
              <p className="text-sm text-slate-500">Ein Klick genügt – das Passwort für alle Demo-Konten lautet „demo“.</p>
            </div>
          </div>
          <DemoAccessGrid users={demoUsers} onPick={(u) => void pickDemo(u)} pending={pending} />
        </section>
      ) : null}
    </AuthShell>
  );
}
