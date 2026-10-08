import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface StepCardProps {
  id: string;
  step: number;
  title: ReactNode;
  subtitle?: ReactNode;
  /** rechts im Kopf, z. B. ein Link */
  action?: ReactNode;
  /** Schritt vollständig (grüner Haken statt Nummer) */
  complete?: boolean;
  /** Hervorhebung bei fehlender Angabe */
  invalid?: boolean;
  children: ReactNode;
  className?: string;
}

/** Nummerierter Kassen-Abschnitt */
export function StepCard({ id, step, title, subtitle, action, complete = false, invalid = false, children, className }: StepCardProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'scroll-mt-24 rounded-2xl border bg-white shadow-card transition-[border-color,box-shadow] duration-200 lg:scroll-mt-40',
        invalid ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200/70',
        className,
      )}
    >
      <header className="flex items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <span
          aria-hidden
          className={cn(
            'mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-colors',
            invalid ? 'bg-red-600 text-white' : complete ? 'bg-emerald-600 text-white' : 'bg-brand-700 text-white',
          )}
        >
          {complete && !invalid ? <Check size={16} strokeWidth={3} /> : step}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={`${id}-title`} className="text-lg font-bold leading-snug tracking-tight text-slate-900">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm leading-snug text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

/** Abschnitt sanft in den sichtbaren Bereich scrollen */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
