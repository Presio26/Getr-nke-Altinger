import { useState, type ReactNode } from 'react';
import { CircleCheck, Download, FileText, Laptop, LocateFixed, Lock, LockOpen, Share, Smartphone, SquarePlus, type LucideIcon } from 'lucide-react';
import { promptInstall, useInstallState } from '@/components/pwa';
import { isIos } from '@/lib/platform';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, CardHeader, Notice, Section, toast } from '@/components/ui';

function InstallSteps({ icon: Icon, title, steps, highlight }: { icon: LucideIcon; title: string; steps: ReactNode[]; highlight: boolean }) {
  return (
    <div className={cn('rounded-xl p-3.5 ring-1 ring-inset', highlight ? 'bg-brand-50/70 ring-brand-200' : 'bg-slate-50 ring-slate-200/70')}>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon size={16} aria-hidden className={highlight ? 'text-brand-700' : 'text-slate-400'} />
        {title}
        {highlight ? <Badge tone="brand">Dieses Gerät</Badge> : null}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-slate-600 marker:font-semibold marker:text-slate-400">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function InstallCard() {
  const { canPrompt, standalone } = useInstallState();
  const [busy, setBusy] = useState(false);
  const ios = isIos();

  const install = async () => {
    setBusy(true);
    try {
      const ok = await promptInstall();
      if (ok) toast.success('Die App wurde installiert.', { id: 'install' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader icon={Download} title="App installieren" subtitle="Kein App-Store nötig – ein Symbol auf dem Home-Bildschirm genügt." />
      {standalone ? (
        <Notice tone="success" icon={CircleCheck} title="Läuft bereits als App" className="mb-3">
          Diese Ansicht ist als installierte App geöffnet.
        </Notice>
      ) : canPrompt ? (
        <Button icon={Download} loading={busy} onClick={() => void install()} className="mb-4 self-start">
          Jetzt installieren
        </Button>
      ) : null}
      <div className="space-y-2.5">
        <InstallSteps
          icon={Smartphone}
          title="iPhone & iPad"
          highlight={ios && !standalone}
          steps={[
            'In Safari öffnen',
            <>
              Unten auf <Share size={14} aria-label="Teilen" className="inline -translate-y-px text-brand-700" /> <strong>Teilen</strong> tippen
            </>,
            <>
              <SquarePlus size={14} aria-hidden className="inline -translate-y-px text-brand-700" /> <strong>„Zum Home-Bildschirm“</strong> → „Hinzufügen“
            </>,
          ]}
        />
        <InstallSteps
          icon={Laptop}
          title="Desktop & Android"
          highlight={!ios && !standalone}
          steps={[
            canPrompt ? 'Knopf „Jetzt installieren“ oben verwenden' : 'In Chrome oder Edge öffnen',
            'Installieren-Symbol in der Adressleiste bzw. Menü → „App installieren“',
          ]}
        />
      </div>
    </Card>
  );
}

function GpsCard() {
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const https = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const geo = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  let notice: ReactNode;
  if (https) {
    notice = (
      <Notice tone="success" icon={Lock} title="Sichere Verbindung (HTTPS)">
        GPS (Fahrer-App) und Kamera (QR-Scan bei Abholungen) funktionieren auf allen Geräten – auch auf dem iPhone.
      </Notice>
    );
  } else if (secure) {
    notice = (
      <Notice tone="info" icon={LockOpen} title="Lokal sicher, im WLAN nicht">
        Auf diesem Gerät (localhost) ist GPS erlaubt. Ein iPhone im WLAN braucht HTTPS – sonst sperrt Safari die Ortung.
      </Notice>
    );
  } else {
    notice = (
      <Notice tone="warning" icon={LockOpen} title="Ohne HTTPS kein GPS auf dem iPhone">
        Nutzen Sie für die Vorführung die Fahrtsimulation oder ein HTTPS-Deployment (z. B. Render) bzw. ein mkcert-Zertifikat im WLAN.
      </Notice>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader icon={LocateFixed} title="GPS & HTTPS" subtitle="Live-Ortung des Fahrers braucht eine sichere Verbindung." />
      {notice}
      <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-slate-600">
        <li className="flex gap-2">
          <CircleCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
          Standort wird nur während einer aktiven Tour gesendet.
        </li>
        <li className="flex gap-2">
          <CircleCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
          Beim ersten Start fragt das iPhone nach der Freigabe – „Beim Verwenden der App erlauben“.
        </li>
        <li className="flex gap-2">
          <CircleCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
          {geo ? 'Dieser Browser unterstützt Ortung.' : 'Dieser Browser bietet keine Ortung an – die Simulation funktioniert trotzdem.'}
        </li>
      </ul>
    </Card>
  );
}

const DOCS: { file: string; title: string; text: string }[] = [
  { file: 'docs/KONZEPT.md', title: 'Konzeptpapier', text: 'Ausgangslage, Ziele, Nutzen, Datenschutz, Roadmap und offene Fragen' },
  { file: 'docs/DEMO-DREHBUCH.md', title: 'Demo-Drehbuch', text: 'Ablauf mit Geräten, exakten Beschriftungen, Zeitbedarf und Plan B' },
  { file: 'docs/DEPLOYMENT.md', title: 'Deployment', text: 'In 10 Minuten online (Render), Docker, HTTPS im WLAN' },
  { file: 'README.md', title: 'README', text: 'Schnellstart, Demo-Zugänge, Konfiguration, Tests' },
];

function DocsCard() {
  return (
    <Card className="flex flex-col">
      <CardHeader icon={FileText} title="Unterlagen fürs Treffen" subtitle="Im Projektordner – zum Ausdrucken oder Mitschicken." />
      <ul className="divide-y divide-slate-100">
        {DOCS.map((d) => (
          <li key={d.file} className="py-2.5 first:pt-0 last:pb-0">
            <p className="text-sm font-semibold text-slate-900">{d.title}</p>
            <p className="text-[13px] leading-snug text-slate-500">{d.text}</p>
            <code className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{d.file}</code>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Installation, GPS/HTTPS und Unterlagen */
export function TechSection() {
  return (
    <Section id="technik" title="Vorbereitung & Technik" subtitle="Damit am Tag der Vorführung alles sitzt.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InstallCard />
        <GpsCard />
        <DocsCard />
      </div>
    </Section>
  );
}
