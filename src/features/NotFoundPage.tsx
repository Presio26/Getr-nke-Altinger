import { Home, LayoutGrid, SearchX } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/stores/session';
import { roleHome } from '@/lib/roles';
import { useDocumentTitle } from '@/lib/hooks';
import { ButtonLink } from '@/components/ui';

/** 404 – Seite nicht gefunden */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const role = useSession((s) => s.user?.role ?? null);
  useDocumentTitle('Seite nicht gefunden');
  const home = roleHome(role);

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="relative mb-6">
        <span className="text-[7rem] font-black leading-none tracking-tighter text-slate-200 sm:text-[9rem]" aria-hidden>
          404
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-raised">
            <SearchX size={30} aria-hidden />
          </span>
        </span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Diese Seite gibt es leider nicht</h1>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-500">
        Die Adresse <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-700">{pathname}</code> wurde nicht gefunden. Vielleicht hat sich ein
        Tippfehler eingeschlichen – oder der Inhalt ist umgezogen.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <ButtonLink to={home} icon={Home}>
          Zur Startseite
        </ButtonLink>
        {home === '/' ? (
          <ButtonLink to="/sortiment" variant="outline" icon={LayoutGrid}>
            Sortiment ansehen
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
