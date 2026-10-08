import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Download, LogOut, Mail, MonitorSmartphone, Share, type LucideIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Customer } from '@shared/types';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { useSession } from '@/stores/session';
import {
  notificationPermission,
  requestNotificationPermission,
  showNotification,
  type NotificationPermissionState,
} from '@/lib/notifications';
import { promptInstall, useInstallState } from '@/components/pwa';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, ConfirmModal, Switch, toast } from '@/components/ui';

function Row({ icon: Icon, title, description, control, inline = false }: { icon: LucideIcon; title: ReactNode; description: ReactNode; control: ReactNode; inline?: boolean }) {
  return (
    <div className={cn('flex gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4', inline ? 'flex-row items-center' : 'flex-col')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-slate-900">{title}</p>
          <div className="mt-0.5 text-sm leading-snug text-slate-500">{description}</div>
        </div>
      </div>
      <div className={cn('flex shrink-0 items-center gap-2 sm:pl-0', !inline && 'pl-12')}>{control}</div>
    </div>
  );
}

function NotificationRow() {
  const [permission, setPermission] = useState<NotificationPermissionState>(() => notificationPermission());
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result === 'granted') {
        toast.success('Browser-Benachrichtigungen sind aktiv.');
        void showNotification('Getränke Altinger', { body: 'So informieren wir Sie, wenn Ihr Fahrer unterwegs ist.', tag: 'altinger-test' });
      } else if (result === 'denied') {
        toast.warning('Benachrichtigungen wurden im Browser blockiert.', { description: 'Sie können sie in den Website-Einstellungen Ihres Browsers wieder erlauben.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const ok = await showNotification('Ihre Lieferung ist unterwegs', { body: 'Toni ist in ca. 12 Minuten bei Ihnen (Beispiel).', tag: 'altinger-test', link: '/bestellungen' });
    if (ok) toast.success('Test-Benachrichtigung gesendet.');
    else toast.error('Die Benachrichtigung konnte nicht angezeigt werden.');
  };

  let description: ReactNode = 'Hinweise, wenn Ihre Bestellung bestätigt wird, der Fahrer losfährt oder vor der Tür steht – auch wenn die App im Hintergrund ist.';
  let control: ReactNode = (
    <Button size="sm" variant="secondary" icon={BellRing} onClick={() => void enable()} loading={busy}>
      Aktivieren
    </Button>
  );
  if (permission === 'granted') {
    control = (
      <>
        <Badge tone="success">Aktiv</Badge>
        <Button size="sm" variant="ghost" onClick={() => void test()}>
          Test senden
        </Button>
      </>
    );
  } else if (permission === 'denied') {
    description = 'Im Browser blockiert. Sie können Benachrichtigungen in den Website-Einstellungen Ihres Browsers wieder erlauben.';
    control = <Badge tone="warning">Blockiert</Badge>;
  } else if (permission === 'unsupported') {
    description = 'Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone funktionieren sie, wenn die App zum Home-Bildschirm hinzugefügt wurde.';
    control = <Badge tone="neutral">Nicht verfügbar</Badge>;
  }
  return <Row icon={BellRing} title="Browser-Benachrichtigungen" description={description} control={control} />;
}

function NewsletterRow({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const mutation = useApiMutation((value: boolean) => api.updateMyCustomer({ marketingOptIn: value }), {
    success: (_c, value) => (value ? 'Newsletter abonniert – danke!' : 'Newsletter abbestellt.'),
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
    },
  });
  const checked = mutation.isPending ? !!mutation.variables : !!customer.marketingOptIn;
  return (
    <Row
      icon={Mail}
      title="Newsletter & Angebote"
      description="Angebote der Woche und Aktionen per E-Mail und in der App – jederzeit abbestellbar."
      inline
      control={<Switch checked={checked} onChange={(v) => mutation.mutate(v)} disabled={mutation.isPending} ariaLabel="Newsletter und Angebote erhalten" />}
    />
  );
}

function InstallRow() {
  const state = useInstallState();
  const [busy, setBusy] = useState(false);
  if (state.standalone) {
    return <Row icon={MonitorSmartphone} title="App installiert" description="Sie nutzen Getränke Altinger bereits als App auf diesem Gerät." control={<Badge tone="success">Installiert</Badge>} />;
  }
  if (state.canPrompt) {
    const install = async () => {
      setBusy(true);
      try {
        const ok = await promptInstall();
        if (ok) toast.success('Die App wurde installiert.');
      } finally {
        setBusy(false);
      }
    };
    return (
      <Row
        icon={MonitorSmartphone}
        title="App installieren"
        description="Mit einem Tipp vom Home-Bildschirm bestellen – schneller Start, auch bei schwachem Empfang."
        control={
          <Button size="sm" variant="secondary" icon={Download} onClick={() => void install()} loading={busy}>
            Installieren
          </Button>
        }
      />
    );
  }
  if (state.iosManual) {
    return (
      <Row
        icon={MonitorSmartphone}
        title="App installieren"
        description={
          <>
            Tippen Sie in Safari auf <Share size={14} aria-label="Teilen" className="inline align-[-2px] text-brand-700" /> „Teilen“ und dann auf „Zum Home-Bildschirm“.
          </>
        }
        control={<Badge tone="info">iPhone &amp; iPad</Badge>}
      />
    );
  }
  return (
    <Row
      icon={MonitorSmartphone}
      title="App installieren"
      description="Öffnen Sie das Browser-Menü und wählen Sie „App installieren“ bzw. „Zum Startbildschirm hinzufügen“."
      control={<Badge tone="neutral">Über den Browser</Badge>}
    />
  );
}

/** Einstellungen: Benachrichtigungen, Newsletter, App, Abmelden */
export function SettingsCard({ customer }: { customer: Customer }) {
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    setBusy(true);
    try {
      await logout();
      toast.success('Sie wurden abgemeldet.', { id: 'logout' });
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Card padding="lg">
      <CardHeader title="Einstellungen" subtitle="Benachrichtigungen, Newsletter und App" />
      <div className="divide-y divide-slate-100">
        <NotificationRow />
        <NewsletterRow customer={customer} />
        <InstallRow />
        <Row
          icon={LogOut}
          title="Abmelden"
          description="Ihr Warenkorb bleibt auf diesem Gerät gespeichert."
          control={
            <Button size="sm" variant="outline" icon={LogOut} onClick={() => setConfirm(true)} className="text-red-600 hover:border-red-300 hover:bg-red-50">
              Abmelden
            </Button>
          }
        />
      </div>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void onLogout()}
        title="Wirklich abmelden?"
        message="Sie können sich jederzeit wieder mit Ihrer E-Mail-Adresse anmelden."
        confirmLabel="Abmelden"
        tone="danger"
        loading={busy}
      />
    </Card>
  );
}
