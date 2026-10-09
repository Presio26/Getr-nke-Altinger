import type { GeoPoint } from '@shared/types';

/** Routenplaner-Links (öffnen die Karten-App des Geräts) */
export function appleMapsRoute(to: GeoPoint, label?: string): string {
  const q = label ? `&q=${encodeURIComponent(label)}` : '';
  return `https://maps.apple.com/?daddr=${to.lat},${to.lng}${q}`;
}

export function googleMapsRoute(to: GeoPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
}

/** Inhalt des Abhol-QR-Codes (siehe Order.pickupCode) */
export function pickupQrContent(orderId: string, pickupCode: string): string {
  return `ALTINGER:${orderId}:${pickupCode}`;
}
