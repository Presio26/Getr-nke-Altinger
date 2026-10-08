/**
 * Platzhalter für neu im Vertrag ergänzte Methoden – werden vom Core-Team in der
 * Fehlerbehebungsrunde implementiert und dann aus dieser Datei entfernt.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { Engine } from '../engine';

const notYet = (): never => {
  throw new ApiError('not_found', 'Diese Funktion ist noch nicht verfügbar.');
};

export function pendingHandlers(
  _e: Engine,
): Pick<CoreHandlers, 'adminSetSubscriptionActive' | 'adminQuote' | 'adminPlaceOrder'> {
  return {
    adminSetSubscriptionActive: notYet,
    adminQuote: notYet,
    adminPlaceOrder: notYet,
  };
}
