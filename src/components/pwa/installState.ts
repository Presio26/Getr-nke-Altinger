/**
 * Installations-Zustand der PWA (beforeinstallprompt) – modulweit, damit auch Seiten wie der
 * Demo-Leitfaden einen "App installieren"-Knopf anbieten können.
 */
import { useSyncExternalStore } from 'react';
import { isIos, isSafari, isStandalone } from '@/lib/platform';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export interface InstallState {
  /** Browser bietet Installation an (Chrome/Edge/Android) */
  canPrompt: boolean;
  /** iPhone/iPad-Safari: nur manuell über "Teilen → Zum Home-Bildschirm" */
  iosManual: boolean;
  /** läuft bereits als installierte App */
  standalone: boolean;
}

let snapshot: InstallState = compute();
function compute(): InstallState {
  const standalone = installed || isStandalone();
  return {
    canPrompt: !!deferred && !standalone,
    iosManual: !standalone && isIos() && isSafari(),
    standalone,
  };
}

function subscribe(cb: () => void) {
  const wrapped = () => {
    snapshot = compute();
    cb();
  };
  listeners.add(wrapped);
  return () => listeners.delete(wrapped);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Installationsdialog des Browsers öffnen. true = installiert */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const choice = await ev.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  snapshot = compute();
  notify();
  return choice.outcome === 'accepted';
}
