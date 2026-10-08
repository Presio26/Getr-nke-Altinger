import { useCallback, useRef, type MouseEvent } from 'react';
import { useUi } from '@/stores/ui';

const WINDOW_MS = 900;

/**
 * Versteckter Zugang zum Demo-Umschalter: dreimal schnell aufs Logo tippen (für Handy/Tablet, wo die
 * Demo-Pille standardmäßig ausgeblendet ist). Liefert einen onClick-Handler für den Logo-Link –
 * die ersten beiden Klicks navigieren wie gewohnt, der dritte öffnet den Umschalter.
 */
export function useDemoTripleTap() {
  const taps = useRef<number[]>([]);
  return useCallback((e: MouseEvent) => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < WINDOW_MS), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      e.preventDefault();
      useUi.getState().setDemoOpen(true);
    }
  }, []);
}
