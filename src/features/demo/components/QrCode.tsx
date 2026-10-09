import { useState } from 'react';
import { Check, Copy, QrCode as QrIcon, ScanLine } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Modal, Notice, Skeleton } from '@/components/ui';
import { isLocalOnlyHost, useQrDataUrl } from '../hooks';

/** QR-Code als Bild (SVG); zeigt beim Erzeugen einen Platzhalter. Größe über className (z. B. "h-24 w-24"). */
export function QrImage({ text, className, label }: { text: string; className: string; label: string }) {
  const url = useQrDataUrl(text);
  if (url === null) return <Skeleton className={cn('shrink-0', className)} />;
  if (url === '') {
    return (
      <span className={cn('flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400', className)}>
        <QrIcon size={28} aria-label="QR-Code nicht verfügbar" />
      </span>
    );
  }
  return <img src={url} alt={label} className={cn('block shrink-0 select-none', className)} draggable={false} />;
}

/** Großer QR-Code zum Scannen (z. B. über den Beamer) mit kopierbarem Link */
export function QrModal({ open, onClose, url, name, roleLabel }: { open: boolean; onClose: () => void; url: string; name: string; roleLabel: string }) {
  const [copied, setCopied] = useState(false);
  const localOnly = isLocalOnlyHost(url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Als ${name} öffnen`}
      description={`${roleLabel} · mit der iPhone-Kamera scannen – die App meldet sich automatisch an.`}
    >
      <div className="flex flex-col items-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
          <QrImage text={url} label={`QR-Code: als ${name} öffnen`} className="h-[min(260px,62vw)] w-[min(260px,62vw)]" />
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
          <ScanLine size={16} aria-hidden className="text-brand-600" />
          Kamera-App öffnen und auf den Code richten
        </p>
        <div className="mt-4 flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3.5 pr-1.5">
          <code className="min-w-0 flex-1 truncate text-[13px] text-slate-700" title={url}>
            {url}
          </code>
          <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={() => void copy()} aria-live="polite">
            {copied ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
        {localOnly ? (
          <Notice tone="warning" className="mt-4 w-full" title="Adresse nur auf diesem Gerät erreichbar">
            „localhost“ funktioniert auf dem iPhone nicht. Tragen Sie im Abschnitt „Zugänge“ die WLAN- oder Internet-Adresse der App ein.
          </Notice>
        ) : null}
      </div>
    </Modal>
  );
}
