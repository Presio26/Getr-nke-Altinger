import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/45',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200 disabled:text-brand-800/50',
  outline:
    'border border-slate-300 bg-white text-slate-800 shadow-xs hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/45',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-600/45',
  accent:
    'bg-accent-500 text-brand-950 shadow-sm shadow-accent-700/15 hover:bg-accent-400 active:bg-accent-600 disabled:bg-accent-500/50',
};

const SIZE: Record<ButtonSize, string> = {
  // sm: 36 px sichtbar, Trefferfläche per ::after auf 44 px erweitert
  sm: "h-9 gap-1.5 rounded-xl px-3 text-sm after:absolute after:-inset-1 after:content-['']",
  md: 'h-11 gap-2 rounded-xl px-4 text-[15px]',
  lg: 'h-13 gap-2.5 rounded-xl px-6 text-base',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false, className?: string) {
  return cn(
    'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    'disabled:pointer-events-none disabled:shadow-none',
    VARIANT[variant],
    SIZE[size],
    block && 'w-full',
    className,
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  block?: boolean;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

function Content({ icon: Icon, iconRight: IconRight, loading, size = 'md', children }: CommonProps & { children?: ReactNode }) {
  const s = ICON_SIZE[size];
  return (
    <>
      {loading ? <Spinner size={s} className="text-current" /> : Icon ? <Icon size={s} aria-hidden className="shrink-0" /> : null}
      {children !== undefined && children !== null && children !== false ? <span className="truncate">{children}</span> : null}
      {IconRight && !loading ? <IconRight size={s} aria-hidden className="shrink-0" /> : null}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, loading = false, block = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, block, className)}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} loading={loading} size={size}>
        {children}
      </Content>
    </button>
  );
});

export type ButtonLinkProps = CommonProps & Omit<LinkProps, 'to'> & { to: string; disabled?: boolean };

/** Link im Button-Stil (react-router) */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  block = false,
  className,
  children,
  to,
  disabled,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      aria-disabled={disabled || undefined}
      className={buttonClasses(variant, size, block, cn(disabled && 'pointer-events-none opacity-50', className))}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} loading={loading} size={size}>
        {children}
      </Content>
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Pflicht: Beschriftung für Screenreader (und Tooltip) */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Zahl im Badge (0/undefined = kein Badge) */
  badge?: number;
  loading?: boolean;
}

const ICON_BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-9 w-9 rounded-xl after:absolute after:-inset-1 after:content-['']",
  md: 'h-11 w-11 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', badge, loading, className, type = 'button', disabled, title, ...rest },
  ref,
) {
  const s = ICON_SIZE[size] + (size === 'sm' ? 0 : 2);
  return (
    <button
      ref={ref}
      type={type}
      aria-label={badge ? `${label} (${badge})` : label}
      title={title ?? label}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center transition-colors duration-150 active:translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        ICON_BTN_SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={s} /> : <Icon size={s} aria-hidden />}
      {badge ? (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
});
