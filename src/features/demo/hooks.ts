/**
 * Hooks des Demo-Leitfadens: Rollenwechsel per Klick, lokal gespeicherter Drehbuch-Fortschritt,
 * QR-Adresse und QR-Code-Erzeugung.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import type { Session } from '@shared/types';
import { useSession } from '@/stores/session';
import { roleHome, ROLE_LABEL } from '@/lib/roles';
import { readJson, readStorage, writeJson, writeStorage } from '@/lib/storage';
import { errorMessage, toast } from '@/components/ui';
import { GUEST_ID } from './data';

// ───────────────────────────── Rollenwechsel ─────────────────────────────

export interface OpenAsOptions {
  /** Ziel nach dem Wechsel; ohne Angabe die Startseite der Rolle */
  to?: string;
  /** Verlaufseintrag ersetzen (z. B. bei /demo?als=…) */
  replace?: boolean;
  /** nach dem Wechsel auf der aktuellen Seite bleiben */
  stay?: boolean;
}

/**
 * Als Demo-Nutzer anmelden (bzw. als Gast abmelden) und zur passenden Seite wechseln.
 * Ist der Nutzer bereits angemeldet, wird nur navigiert.
 */
export function useOpenAs() {
  const navigate = useNavigate();
  const demoLogin = useSession((s) => s.demoLogin);
  const logout = useSession((s) => s.logout);
  const [pending, setPending] = useState<string | null>(null);

  const openAs = useCallback(
    async (as: string | undefined, key: string, options: OpenAsOptions = {}): Promise<boolean> => {
      setPending(key);
      try {
        const current = useSession.getState().user;
        let session: Session | null = null;
        if (as === GUEST_ID) {
          if (current) {
            await logout();
            toast.success('Sie sind jetzt als Gast unterwegs.', { id: 'demo-login', description: 'Ohne Anmeldung – so sehen Neukunden den Shop.' });
          }
        } else if (as && current?.id !== as) {
          session = await demoLogin(as);
          toast.success(`Angemeldet als ${session.user.name}`, { id: 'demo-login', description: ROLE_LABEL[session.user.role] });
        }
        if (!options.stay) {
          const role = as === GUEST_ID ? null : (session?.user.role ?? useSession.getState().user?.role ?? null);
          navigate(options.to ?? roleHome(role), { replace: options.replace });
        }
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        return false;
      } finally {
        setPending(null);
      }
    },
    [demoLogin, logout, navigate],
  );

  return { openAs, pending };
}

// ───────────────────────────── Drehbuch-Fortschritt ─────────────────────────────

const PROGRESS_KEY = 'altinger.demo.progress';
const progressListeners = new Set<() => void>();
let progressSnapshot: string[] = loadProgress();

function loadProgress(): string[] {
  const raw = readJson<unknown>(PROGRESS_KEY, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function setProgress(next: string[]): void {
  progressSnapshot = next;
  writeJson(PROGRESS_KEY, next);
  progressListeners.forEach((l) => l());
}

function subscribeProgress(cb: () => void): () => void {
  progressListeners.add(cb);
  // Abgleich mit anderen Tabs (z. B. Beamer-Fenster und Laptop)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PROGRESS_KEY) return;
    progressSnapshot = loadProgress();
    cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    progressListeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Abgehakte Drehbuch-Schritte (lokal gespeichert, tabübergreifend synchron) */
export function useStepProgress() {
  const done = useSyncExternalStore(subscribeProgress, () => progressSnapshot, () => progressSnapshot);
  const toggle = useCallback((id: string) => {
    const set = new Set(progressSnapshot);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setProgress([...set]);
  }, []);
  const reset = useCallback(() => setProgress([]), []);
  return { done, toggle, reset };
}

// ───────────────────────────── QR-Adresse ─────────────────────────────

const QR_BASE_KEY = 'altinger.demo.qrBase';

export function currentOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** true, wenn die Adresse nur auf diesem Gerät erreichbar ist (localhost …) */
export function isLocalOnlyHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

/** Eingabe normalisieren: "192.168.1.20:5173" → "http://192.168.1.20:5173"; ungültig → null */
export function normalizeBaseUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || /\s/.test(raw)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Basis-Adresse für die QR-Codes (Standard: aktuelle Herkunft, abweichend lokal gespeichert) */
export function useQrBase() {
  const [custom, setCustom] = useState<string | null>(() => normalizeBaseUrl(readStorage(QR_BASE_KEY) ?? ''));
  const save = useCallback((value: string | null) => {
    writeStorage(QR_BASE_KEY, value);
    setCustom(value);
  }, []);
  return { base: custom ?? currentOrigin(), custom, save };
}

export function demoUrl(base: string, as: string): string {
  return `${base.replace(/\/+$/, '')}/demo?als=${encodeURIComponent(as)}`;
}

// ───────────────────────────── QR-Code ─────────────────────────────

const qrCache = new Map<string, string>();

/** QR-Code als SVG-Daten-URL (null = wird erzeugt, '' = Fehler) */
export function useQrDataUrl(text: string): string | null {
  const [url, setUrl] = useState<string | null>(() => qrCache.get(text) ?? null);
  useEffect(() => {
    const hit = qrCache.get(text);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    setUrl(null);
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0d1f38ff', light: '#ffffffff' } })
      .then((svg) => {
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        qrCache.set(text, dataUrl);
        if (alive) setUrl(dataUrl);
      })
      .catch(() => {
        if (alive) setUrl('');
      });
    return () => {
      alive = false;
    };
  }, [text]);
  return url;
}
