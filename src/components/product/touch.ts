import { useMediaQuery } from '@/lib/hooks';

/**
 * Größe für Mengen-Stepper in Listen: mit Maus kompakt ('sm', 36 px), auf Touch-Geräten
 * mindestens 44 px Trefferfläche ('md') – Regel „Touch-Ziele ≥ 44 px“ (ARCHITECTURE §7).
 */
export function useTouchStepperSize(): 'sm' | 'md' {
  return useMediaQuery('(pointer: coarse)') ? 'md' : 'sm';
}
