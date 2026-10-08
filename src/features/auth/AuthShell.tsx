import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { signetGlyph } from '@/components/brand/signet';
import { cn } from '@/lib/cn';

export interface Benefit {
  icon: LucideIcon;
  title: string;
  text: string;
}

/** Zweispaltiges Layout für Anmeldung/Registrierung: Formular links, Markenfläche rechts (ab lg) */
export function AuthShell({
  children,
  aside,
  benefits,
  eyebrow,
  headline,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  benefits: Benefit[];
  eyebrow: string;
  headline: string;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:gap-12', className)}>
      <div className="min-w-0">{children}</div>
      <aside className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-8 text-white shadow-raised lg:sticky lg:top-36 lg:block">
        <svg viewBox="0 0 64 64" aria-hidden className="pointer-events-none absolute -bottom-20 -right-16 h-72 w-72 opacity-[0.06]" dangerouslySetInnerHTML={{ __html: signetGlyph({ glass: '#fff', crate: '#fff', slot: 'transparent', cap: '#fff' }) }} />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-300">{eyebrow}</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight">{headline}</h2>
        <ul className="relative mt-7 space-y-5">
          {benefits.map((b) => (
            <li key={b.title} className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent-300 ring-1 ring-white/10">
                <b.icon size={20} aria-hidden />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{b.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-white/70">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
        {aside ? <div className="relative mt-8 border-t border-white/10 pt-6">{aside}</div> : null}
      </aside>
    </div>
  );
}
