/**
 * Kleine gemeinsame Helfer für Touren-Handler.
 */
import type { Order } from '../../types';
import { orderStatusLabel } from '../../format';

export { OPEN_STATUSES } from '../orderOps';

export function orderStatusText(o: Order): string {
  return orderStatusLabel(o.status, o.fulfillment);
}
