import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/hooks';
import { roleHome } from '@/lib/roles';
import { useSession } from '@/stores/session';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Zurück-Pfeil: string = Ziel-Pfad, true = Browser-Verlauf zurück */
  back?: string | boolean;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** Fenstertitel (Default: title, wenn Text) */
  documentTitle?: string;
}

function canGoBack(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' ? state.idx > 0 : window.history.length > 1;
}

/** Seitenkopf: Titel, Untertitel, Zurück-Pfeil, Aktionen */
export function PageHeader({ title, subtitle, back, actions, icon: Icon, className, documentTitle }: PageHeaderProps) {
  const navigate = useNavigate();
  const role = useSession((s) => s.user?.role ?? null);
  useDocumentTitle(documentTitle ?? (typeof title === 'string' ? title : null));

  const onBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (canGoBack()) navigate(-1);
    else navigate(roleHome(role));
  };

  return (
    <header className={cn('mb-5 flex flex-wrap items-start gap-x-4 gap-y-3 sm:mb-7', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {back ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Zurück"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
        ) : null}
        {Icon ? (
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-sm sm:flex">
            <Icon size={24} aria-hidden />
          </div>
        ) : null}
        <div className={cn('min-w-0 flex-1', back ? 'pt-1.5' : Icon ? 'sm:pt-0.5' : '')}>
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle ? <div className="mt-1 text-[15px] leading-relaxed text-slate-500">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:pt-1">{actions}</div> : null}
    </header>
  );
}

export interface SectionProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}

/** Inhaltsabschnitt mit Überschrift */
export function Section({ title, subtitle, action, children, className, id }: SectionProps) {
  return (
    <section id={id} className={cn('mt-8 first:mt-0 sm:mt-10', className)}>
      {title || action ? (
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface DividerProps {
  label?: ReactNode;
  className?: string;
}

export function Divider({ label, className }: DividerProps) {
  if (!label) return <hr className={cn('my-4 border-slate-200', className)} />;
  return (
    <div className={cn('my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400', className)} role="separator">
      <span className="h-px flex-1 bg-slate-200" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
