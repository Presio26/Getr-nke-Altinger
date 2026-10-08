/**
 * GPS-Freigabe der Fahrer-App: Zustand des Positions-Teilens (läuft im DriverLayout weiter,
 * auch wenn der Fahrer zwischen Tour- und Stopp-Seite wechselt).
 */
import { create } from 'zustand';
import type { ID } from '@shared/types';
import { readStorage, writeStorage } from '@/lib/storage';

const PAUSE_KEY = 'altinger.driver.gpsPaused';

export type WakeLockState = 'off' | 'active' | 'unsupported' | 'blocked';

interface GpsShareState {
  /** Tour, für die der Fahrer das Teilen bewusst pausiert hat */
  pausedTourId: ID | null;
  /** Zeitpunkt der letzten erfolgreich übertragenen Position */
  lastSentAt: string | null;
  /** Anzahl übertragener Positionen in dieser Sitzung */
  sentCount: number;
  /** letzte Übertragung fehlgeschlagen (z. B. offline) */
  sendFailed: boolean;
  /** Bildschirm bleibt an (Screen Wake Lock) */
  wakeLock: WakeLockState;
  /** Teilen läuft gerade (Tour aktiv, nicht pausiert, keine Simulation) */
  sharing: boolean;
  setPaused(tourId: ID | null): void;
  markSent(at: string): void;
  markFailed(): void;
  setWakeLock(state: WakeLockState): void;
  setSharing(sharing: boolean): void;
}

export const useGpsShare = create<GpsShareState>()((set) => ({
  pausedTourId: readStorage(PAUSE_KEY) || null,
  lastSentAt: null,
  sentCount: 0,
  sendFailed: false,
  wakeLock: 'off',
  sharing: false,
  setPaused(tourId) {
    writeStorage(PAUSE_KEY, tourId);
    set({ pausedTourId: tourId });
  },
  markSent(at) {
    set((s) => ({ lastSentAt: at, sentCount: s.sentCount + 1, sendFailed: false }));
  },
  markFailed() {
    set({ sendFailed: true });
  },
  setWakeLock(wakeLock) {
    set({ wakeLock });
  },
  setSharing(sharing) {
    set({ sharing });
  },
}));

/** Mindestabstand zwischen zwei Positionsmeldungen an den Server */
export const GPS_SEND_INTERVAL_MS = 4000;
