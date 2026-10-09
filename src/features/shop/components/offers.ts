import type { Product } from '@shared/types';
import { isOfferValid } from '@shared/core/pricing';
import { diffDays, todayString } from '@shared/time';

/** Artikel mit gültigem Angebot (günstiger als der Normalpreis) */
export function hasActiveOffer(p: Product, today = todayString()): boolean {
  return p.active && isOfferValid(p.offer, today) && p.offer.priceGross < p.priceGross;
}

/** Resttage eines Angebots (0 = endet heute) */
export function offerDaysLeft(validUntil: string, today = todayString()): number {
  return Math.max(0, diffDays(today, validUntil));
}

/** „nur noch heute“ / „noch bis morgen“ / „noch 3 Tage“ */
export function offerRemainingText(validUntil: string, today = todayString()): string {
  const d = offerDaysLeft(validUntil, today);
  if (d === 0) return 'nur noch heute';
  if (d === 1) return 'noch bis morgen';
  return `noch ${d} Tage`;
}
