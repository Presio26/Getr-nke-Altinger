import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@shared/types';
import { useSession } from '@/stores/session';
import { roleHome } from '@/lib/roles';
import { PageLoader, toast } from '@/components/ui';

export interface RequireRoleProps {
  roles: Role[];
  children: ReactNode;
}

const AUDIENCE: Record<Role, string> = {
  customer: 'Privatkunden',
  business: 'Geschäftskunden',
  driver: 'Fahrer',
  admin: 'die Marktleitung',
};

function RoleRedirect({ to, message }: { to: string; message: string | null }) {
  useEffect(() => {
    if (message) toast.info(message, { id: 'role-redirect' });
  }, [message]);
  // Ladeanzeige bis zur Zielseite: kein kurz aufblitzender Footer (Layout-Shift)
  return (
    <>
      <Navigate to={to} replace />
      <PageLoader />
    </>
  );
}

/**
 * Zugriffsschutz: nicht angemeldet → /login?next=…; falsche Rolle → Startseite der eigenen Rolle.
 * (Berechtigungen prüft zusätzlich immer der Core.)
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const status = useSession((s) => s.status);
  const role = useSession((s) => s.user?.role ?? null);
  const location = useLocation();
  // Rolle beim Betreten der Seite – wechselt sie währenddessen (Demo-Umschalter), ohne Hinweis weiterleiten
  const enteredAs = useRef(role);

  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated' || !role) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return (
      <>
        <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
        <PageLoader />
      </>
    );
  }
  if (!roles.includes(role)) {
    const allowed = roles.map((r) => AUDIENCE[r]).join(' und ');
    const silent = enteredAs.current !== role;
    return (
      <RoleRedirect
        to={roleHome(role)}
        message={silent ? null : `Dieser Bereich ist für ${allowed} vorgesehen – Sie wurden zu Ihrer Startseite weitergeleitet.`}
      />
    );
  }
  return <>{children}</>;
}
