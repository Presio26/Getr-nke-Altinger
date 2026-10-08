import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui';

const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * Registriert den Service Worker (nur Produktions-Build) und meldet neue Versionen.
 * Der neue Service Worker übernimmt sofort (autoUpdate); die Seite lädt aber erst neu,
 * wenn der Nutzer es möchte – so wird z. B. keine Unterschrift beim Fahrer unterbrochen.
 */
export function UpdatePrompt() {
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let timer = 0;
    let cancelled = false;
    void (async () => {
      try {
        const { Workbox } = await import('workbox-window');
        if (cancelled) return;
        const wb = new Workbox('/sw.js', { scope: '/' });
        wb.addEventListener('controlling', (event) => {
          if (event.isUpdate) setUpdated(true);
        });
        wb.addEventListener('waiting', () => {
          // Fallback, falls skipWaiting nicht greift
          wb.messageSkipWaiting();
        });
        const reg = await wb.register();
        if (reg) timer = window.setInterval(() => void reg.update().catch(() => {}), UPDATE_CHECK_MS);
      } catch (err) {
        console.warn('[pwa] Service Worker konnte nicht registriert werden:', err);
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!updated) return null;
  return (
    <div
      role="status"
      className="no-print fixed inset-x-3 top-safe-2 z-[55] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-brand-900 p-3 pl-4 text-white shadow-pop animate-toast-in"
    >
      <RefreshCw size={20} aria-hidden className="shrink-0 text-accent-300" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">Neue Version verfügbar.</span> Laden Sie neu, um sie zu verwenden.
      </p>
      <Button size="sm" variant="accent" onClick={() => window.location.reload()}>
        Neu laden
      </Button>
      <button type="button" onClick={() => setUpdated(false)} aria-label="Später" className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10">
        <X size={17} aria-hidden />
      </button>
    </div>
  );
}
