/**
 * Optionaler Hinweiston bei neuen Bestellungen (Markt-Dashboard, Bestell-Board).
 * Einstellung je Gerät (localStorage), Standard: aus. Ton per WebAudio – keine Audiodatei nötig.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Order } from '@shared/types';

const KEY = 'altinger.admin.orderChime';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = typeof window !== 'undefined' ? read() : false;

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      enabled = read();
      fn();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function setOrderChimeEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // privater Modus o. Ä. – gilt dann nur für diese Sitzung
  }
  for (const fn of listeners) fn();
  if (value) void playOrderChime(); // Probeton (zugleich Freigabe des Audiokontexts durch die Nutzeraktion)
}

/** [aktiv, setzen] */
export function useOrderChime(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => enabled, () => false);
  return [value, setOrderChimeEnabled];
}

// ───────────────────────────── WebAudio ─────────────────────────────

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

// Browser erlauben Ton erst nach einer Nutzeraktion: Kontext beim ersten Klick/Tastendruck freigeben
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!enabled) return;
    const c = audioContext();
    if (c && c.state === 'suspended') void c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/** Zweiklang „Ding-Dong“ (ca. 0,6 s) */
export async function playOrderChime(): Promise<void> {
  // ohne vorherige Nutzeraktion bleibt der Browser stumm – dann gar nicht erst versuchen
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  const c = audioContext();
  if (!c) return;
  try {
    if (c.state === 'suspended') await c.resume();
  } catch {
    return;
  }
  if (c.state !== 'running') return;
  const t0 = c.currentTime + 0.02;
  const tone = (freq: number, start: number, dur: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  };
  tone(988, t0, 0.32); // H5
  tone(784, t0 + 0.22, 0.45); // G5
}

/**
 * Spielt den Hinweiston, wenn in der Liste neue, noch unbestätigte Bestellungen auftauchen
 * (nicht beim ersten Laden). Nur aktiv, wenn der Ton eingeschaltet ist.
 */
export function useNewOrderChime(orders: Order[] | undefined) {
  const [on] = useOrderChime();
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders) return;
    if (!known.current) {
      known.current = new Set(orders.map((o) => o.id));
      return;
    }
    const seen = known.current;
    const added = orders.filter((o) => !seen.has(o.id));
    for (const o of added) seen.add(o.id);
    if (on && added.some((o) => o.status === 'pending' || Date.now() - Date.parse(o.createdAt) < 5 * 60_000)) void playOrderChime();
  }, [orders, on]);
}
