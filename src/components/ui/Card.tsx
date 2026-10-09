import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover-Effekt (z. B. klickbare Kacheln) */
  interactive?: boolean;
}

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-7',
} as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', interactive = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white shadow-card',
        PADDING[padding],
        interactive &&
          'cursor-pointer transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-raised focus-within:border-brand-300',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      {Icon ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon size={20} aria-hidden />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 self-center">
        <h3 className="text-base font-semibold leading-snug text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
