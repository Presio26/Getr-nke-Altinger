import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import { useUi } from '@/stores/ui';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui';
import { promptInstall, useInstallState } from './installState';

const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 8000;

/**
 * Installationshinweis:
 *  - Chrome/Edge/Android: eigener Knopf, der den Browser-Dialog (beforeinstallprompt) öffnet
 *  - iPhone/iPad (Safari): Anleitung "Teilen → Zum Home-Bildschirm"
 * Erscheint verzögert und nach "Später" erst wieder in 14 Tagen.
 */
export function InstallPrompt() {
  const { canPrompt, iosManual, standalone } = useInstallState();
  const dismissedAt = useUi((s) => s.installDismissedAt);
  const dismiss = useUi((s) => s.dismissInstall);
  const demoOpen = useUi((s) => s.demoOpen);
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const snoozed = dismissedAt !== null && Date.now() - dismissedAt < SNOOZE_MS;
  const hiddenRoute = pathname.startsWith('/login') || pathname.startsWith('/kasse') || pathname.startsWith('/fahrer/stopp');
  if (standalone || snoozed || !ready || demoOpen || hiddenRoute || (!canPrompt && !iosManual)) return null;

  const shop = !pathname.startsWith('/admin') && !pathname.startsWith('/fahrer');

  return (
    <div
      role="dialog"
      aria-label="App installieren"
      className={cn(
        'no-print fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-pop animate-pop-in sm:inset-x-auto sm:right-6 sm:w-96',
        shop ? 'bottom-tabbar lg:bottom-6' : 'bottom-safe-4',
      )}
    >
      <div className="flex items-start gap-3">
        <Logo variant="mark" className="h-12" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-900">Altinger als App installieren</p>
          {iosManual ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Tippen Sie unten auf <Share size={15} className="inline -translate-y-px text-brand-700" aria-label="Teilen" /> <strong>Teilen</strong> und dann auf{' '}
              <PlusSquare size={15} className="inline -translate-y-px text-brand-700" aria-hidden /> <strong>„Zum Home-Bildschirm“</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-slate-600">Schneller bestellen, Lieferungen live verfolgen und Benachrichtigungen erhalten – direkt vom Startbildschirm.</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hinweis schließen"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {canPrompt ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Später
          </Button>
          <Button
            size="sm"
            icon={Download}
            onClick={async () => {
              const ok = await promptInstall();
              if (!ok) dismiss();
            }}
          >
            Installieren
          </Button>
        </div>
      ) : null}
    </div>
  );
}
