import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

// ───────────────────────────── Feld-Rahmen ─────────────────────────────

interface FieldShellProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, required, className, children }: FieldShellProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required ? (
            <span className="ml-0.5 text-red-600" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

/** Grundstil für Eingabefelder (16 px auf Mobilgeräten verhindert das Zoomen in iOS) */
export const fieldClasses = (invalid?: boolean) =>
  cn(
    'block w-full rounded-xl border bg-white text-base text-slate-900 shadow-xs transition-[border-color,box-shadow] duration-150 sm:text-[15px]',
    'placeholder:text-slate-400 focus:outline-none focus:ring-4',
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
      : 'border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-500/15',
  );

// ───────────────────────────── Input ─────────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: LucideIcon;
  /** rechts im Feld, z. B. "€" oder ein Button */
  suffix?: ReactNode;
  /** Klassen für den äußeren Container */
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon: Icon, suffix, className, containerClassName, id: idProp, required, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <div className="relative">
        {Icon ? (
          <Icon size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        ) : null}
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(fieldClasses(!!error), 'h-11 px-3.5', Icon && 'pl-10', suffix && 'pr-12', className)}
          {...rest}
        />
        {suffix ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-slate-500">{suffix}</div>
        ) : null}
      </div>
    </FieldShell>
  );
});

// ───────────────────────────── Textarea ─────────────────────────────

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, containerClassName, id: idProp, required, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(fieldClasses(!!error), 'min-h-[5.5rem] px-3.5 py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </FieldShell>
  );
});

// ───────────────────────────── Select ─────────────────────────────

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: { value: string; label: string; disabled?: boolean }[];
  /** leere, nicht wählbare erste Option */
  placeholder?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, containerClassName, id: idProp, required, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(fieldClasses(!!error), 'h-11 appearance-none pl-3.5 pr-10', className)}
          {...rest}
        >
          {placeholder !== undefined ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </FieldShell>
  );
});

// ───────────────────────────── Checkbox ─────────────────────────────

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, containerClassName, id: idProp, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <label
      htmlFor={id}
      className={cn('group flex min-h-11 cursor-pointer items-start gap-3 py-1.5', disabled && 'cursor-not-allowed opacity-60', containerClassName)}
    >
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          aria-describedby={description ? `${id}-desc` : undefined}
          className={cn(
            'peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white shadow-xs transition-colors',
            'checked:border-brand-700 checked:bg-brand-700 hover:border-slate-400 checked:hover:bg-brand-800',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
            className,
          )}
          {...rest}
        />
        <Check size={14} strokeWidth={3} aria-hidden className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100" />
      </span>
      <span className="min-w-0 text-[15px] leading-snug">
        <span className="font-medium text-slate-800">{label}</span>
        {description ? (
          <span id={`${id}-desc`} className="mt-0.5 block text-sm text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});

// ───────────────────────────── Switch ─────────────────────────────

export interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Screenreader-Beschriftung, wenn kein label angegeben ist */
  ariaLabel?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className, ariaLabel }: SwitchProps) {
  const id = useId();
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? `${id}-label` : undefined}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 after:absolute after:-inset-2 after:content-['']",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-700' : 'bg-slate-300',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-5.5 w-5.5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-[0.25rem]',
        )}
      />
    </button>
  );
  if (!label && !description) return <span className={className}>{control}</span>;
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 py-1', className)}>
      <div className="min-w-0">
        {label ? (
          <span id={`${id}-label`} className="block text-[15px] font-medium text-slate-800" onClick={() => !disabled && onChange(!checked)}>
            {label}
          </span>
        ) : null}
        {description ? (
          <span id={`${id}-desc`} className="mt-0.5 block text-sm text-slate-500">
            {description}
          </span>
        ) : null}
      </div>
      {control}
    </div>
  );
}

// ───────────────────────────── RadioCards ─────────────────────────────

export interface RadioCardOption {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  /** rechts, z. B. Preis */
  aside?: ReactNode;
}

export interface RadioCardsProps {
  value: string;
  onChange: (value: string) => void;
  options: RadioCardOption[];
  columns?: 1 | 2 | 3;
  /** Name der Radio-Gruppe (Default: automatisch) */
  name?: string;
  className?: string;
  'aria-label'?: string;
}

const COLS = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3' } as const;

export function RadioCards({ value, onChange, options, columns = 1, name, className, ...aria }: RadioCardsProps) {
  const autoName = useId();
  const group = name ?? autoName;
  return (
    <div role="radiogroup" aria-label={aria['aria-label']} className={cn('grid gap-3', COLS[columns], className)}>
      {options.map((o) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <label
            key={o.value}
            className={cn(
              'relative flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-[border-color,box-shadow,background-color] duration-150',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500',
              selected ? 'border-brand-600 bg-brand-50/40 shadow-[0_0_0_1px_var(--color-brand-600)]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60',
              o.disabled && 'cursor-not-allowed opacity-55 hover:border-slate-200 hover:bg-white',
            )}
          >
            <input
              type="radio"
              name={group}
              value={o.value}
              checked={selected}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {Icon ? (
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                  selected ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                <Icon size={20} aria-hidden />
              </span>
            ) : (
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-brand-700' : 'border-slate-300',
                )}
              >
                {selected ? <span className="h-2.5 w-2.5 rounded-full bg-brand-700" /> : null}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug text-slate-900">{o.title}</span>
              {o.description ? <span className="mt-0.5 block text-sm leading-snug text-slate-500">{o.description}</span> : null}
            </span>
            {o.aside ? <span className="shrink-0 self-center text-sm font-semibold text-slate-900">{o.aside}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
