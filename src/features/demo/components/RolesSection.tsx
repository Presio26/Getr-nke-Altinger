import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Laptop, Link2, MonitorSmartphone, Pencil, Smartphone, Undo2, type LucideIcon } from 'lucide-react';
import type { DemoUser } from '@shared/types';
import { useBootstrap } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { ROLE_LABEL } from '@/lib/roles';
import { cn } from '@/lib/cn';
import { Avatar, Badge, Button, Input, Notice, Section, type BadgeTone } from '@/components/ui';
import { DEMO_ROLES, DEVICE_LABEL, GUEST_ID, type DemoDevice, type DemoRole } from '../data';
import { currentOrigin, demoUrl, isLocalOnlyHost, normalizeBaseUrl, useOpenAs, useQrBase } from '../hooks';
import { QrImage, QrModal } from './QrCode';

const DEVICE_ICON: Record<DemoDevice, LucideIcon> = {
  iphone: Smartphone,
  laptop: Laptop,
  tablet: MonitorSmartphone,
  any: MonitorSmartphone,
  beamer: MonitorSmartphone,
};

const ROLE_TONE: Record<string, BadgeTone> = { customer: 'neutral', business: 'brand', driver: 'success', admin: 'accent', guest: 'neutral' };

interface CardModel extends DemoRole {
  roleLabel: string;
}

function RoleCard({
  model,
  active,
  pending,
  disabled,
  qrUrl,
  onOpen,
}: {
  model: CardModel;
  active: boolean;
  pending: boolean;
  disabled: boolean;
  qrUrl: string;
  onOpen: () => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const DeviceIcon = DEVICE_ICON[model.device];
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border bg-white p-4 shadow-card transition-[border-color,box-shadow] sm:p-5',
        active ? 'border-brand-300 ring-1 ring-brand-300' : 'border-slate-200/70',
      )}
      aria-label={model.name}
    >
      <div className="flex items-start gap-3">
        <Avatar name={model.name} color={model.color} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug text-slate-900">{model.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={ROLE_TONE[model.role ?? 'guest']}>{model.roleLabel}</Badge>
            {active ? (
              <Badge tone="success" icon={Check}>
                {model.id === GUEST_ID ? 'Aktuelle Ansicht' : 'Angemeldet'}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">{model.description}</p>

      <ul className="mt-3 hidden space-y-1.5 sm:block">
        {model.highlights.map((h) => (
          <li key={h} className="flex gap-2 text-[13px] leading-snug text-slate-600">
            <Check size={15} aria-hidden className="mt-px shrink-0 text-emerald-600" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-end gap-3 pt-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <DeviceIcon size={14} aria-hidden className="text-slate-400" />
            Empfohlen: {DEVICE_LABEL[model.device]}
          </p>
          <Button
            size="sm"
            variant={active ? 'secondary' : 'primary'}
            iconRight={ArrowRight}
            loading={pending}
            disabled={disabled && !pending}
            onClick={onOpen}
            className="w-full"
          >
            Jetzt öffnen
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="group relative shrink-0 rounded-xl border border-slate-200 bg-white p-1.5 transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-card"
          aria-label={`QR-Code für ${model.name} vergrößern`}
          title="QR-Code vergrößern"
        >
          <QrImage text={qrUrl} label="" className="h-[4.5rem] w-[4.5rem] rounded-md" />
        </button>
      </div>

      <QrModal open={qrOpen} onClose={() => setQrOpen(false)} url={qrUrl} name={model.name} roleLabel={model.roleLabel} />
    </article>
  );
}

/** Hinweis + Eingabe, wohin die QR-Codes zeigen (wichtig, wenn die App über localhost läuft) */
function QrBaseSetting({ base, custom, save }: ReturnType<typeof useQrBase>) {
  const origin = currentOrigin();
  const localOnly = isLocalOnlyHost(base);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(custom ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeBaseUrl(value);
    if (!normalized) {
      setError('Bitte eine Adresse wie http://192.168.1.20:5173 oder https://altinger-demo.onrender.com eingeben.');
      return;
    }
    save(normalized === origin ? null : normalized);
    setError(null);
    setEditing(false);
  };

  const form = (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
      <Input
        aria-label="Adresse für die QR-Codes"
        icon={Link2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="http://192.168.1.20:5173"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        error={error ?? undefined}
        containerClassName="min-w-0 flex-1"
      />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 sm:flex-none">
          Übernehmen
        </Button>
        {custom ? (
          <Button
            variant="ghost"
            icon={Undo2}
            onClick={() => {
              save(null);
              setValue('');
              setError(null);
              setEditing(false);
            }}
          >
            Standard
          </Button>
        ) : null}
      </div>
    </form>
  );

  if (localOnly) {
    return (
      <Notice tone="warning" title="Die QR-Codes zeigen auf „localhost“" className="mb-6">
        <p>
          Diese Adresse ist nur auf diesem Gerät erreichbar. Damit das iPhone die Codes öffnen kann, tragen Sie die WLAN-Adresse (siehe Server-Ausgabe
          „Im WLAN“) oder die öffentliche Adresse der App ein.
        </p>
        {form}
      </Notice>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
      <Link2 size={17} aria-hidden className="shrink-0 text-brand-600" />
      <span className="min-w-0 flex-1">
        QR-Codes öffnen <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-800">{base}/demo?als=…</code>
        {custom ? <span className="text-slate-400"> (eigene Adresse)</span> : null}
      </span>
      {!editing ? (
        <Button
          size="sm"
          variant="ghost"
          icon={Pencil}
          onClick={() => {
            setValue(custom ?? origin);
            setEditing(true);
          }}
        >
          Adresse ändern
        </Button>
      ) : null}
      {editing ? <div className="w-full">{form}</div> : null}
    </div>
  );
}

/** Rollen-Karten mit „Jetzt öffnen“ und QR-Code je Demo-Zugang */
export function RolesSection() {
  const { demoUsers } = useBootstrap();
  const user = useSession((s) => s.user);
  const { openAs, pending } = useOpenAs();
  const qr = useQrBase();

  const models = useMemo<CardModel[]>(() => {
    const byId = new Map<string, DemoUser>(demoUsers.map((u) => [u.id, u]));
    return DEMO_ROLES.filter((r) => r.id === GUEST_ID || byId.size === 0 || byId.has(r.id)).map((r) => {
      const u = byId.get(r.id);
      return {
        ...r,
        name: u?.name ?? r.name,
        description: u?.description ?? r.description,
        roleLabel: r.roleLabel ?? (r.role ? ROLE_LABEL[r.role] : 'Ohne Anmeldung'),
      };
    });
  }, [demoUsers]);

  const demoDisabled = demoUsers.length === 0;
  const groups: { id: DemoRole['group']; title: string; subtitle: string }[] = [
    { id: 'kunden', title: 'Kundinnen & Kunden', subtitle: 'Privat- und Geschäftskunden – am besten auf dem iPhone bzw. Laptop' },
    { id: 'team', title: 'Team Altinger', subtitle: 'Marktleitung am Laptop, Fahrerinnen und Fahrer auf dem iPhone' },
  ];

  return (
    <Section
      id="zugaenge"
      title="Zugänge & Rollen"
      subtitle="„Jetzt öffnen“ meldet dieses Gerät an. Der QR-Code öffnet die Rolle direkt auf einem anderen Gerät – Passwort für alle Konten: demo"
    >
      {demoDisabled ? (
        <Notice tone="warning" title="Demo-Anmeldung ist deaktiviert" className="mb-6">
          Der Server läuft mit DEMO_MODE=false. Melden Sie sich über „Anmelden“ mit E-Mail und Passwort an.
        </Notice>
      ) : null}
      <QrBaseSetting {...qr} />
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{g.title}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{g.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {models
                .filter((m) => m.group === g.id)
                .map((m) => (
                  <RoleCard
                    key={m.id}
                    model={m}
                    active={m.id === GUEST_ID ? !user : user?.id === m.id}
                    pending={pending === `role:${m.id}`}
                    disabled={!!pending || (demoDisabled && m.id !== GUEST_ID)}
                    qrUrl={demoUrl(qr.base, m.id)}
                    onOpen={() => void openAs(m.id, `role:${m.id}`)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
