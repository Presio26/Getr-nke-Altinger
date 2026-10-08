import type { Role } from '@shared/types';

/** Startseite je Rolle (nach Anmeldung, bei falscher Rolle) */
export function roleHome(role: Role | null | undefined): string {
  switch (role) {
    case 'business':
      return '/business';
    case 'driver':
      return '/fahrer';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export const ROLE_LABEL: Record<Role, string> = {
  customer: 'Privatkunde',
  business: 'Geschäftskunde',
  driver: 'Fahrer',
  admin: 'Markt & Disposition',
};

/** true für Rollen mit Kundenkonto (Warenkorb, Bestellungen, Konto) */
export function isCustomerRole(role: Role | null | undefined): role is 'customer' | 'business' {
  return role === 'customer' || role === 'business';
}

/** Sicheres Weiterleitungsziel aus `?next=` (nur app-interne Pfade) */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next.startsWith('/login') || next.startsWith('/registrieren') || next.startsWith('/geschaeftskunde')) return null;
  return next;
}
