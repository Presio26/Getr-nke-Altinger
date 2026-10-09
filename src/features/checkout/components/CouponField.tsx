import { useState, type FormEvent } from 'react';
import { BadgePercent, Check, X } from 'lucide-react';
import type { Coupon } from '@shared/types';
import { Button, Input } from '@/components/ui';

export interface CouponFieldProps {
  /** eingelöster Gutschein laut Preisberechnung */
  applied?: Coupon;
  /** Code im Warenkorb (evtl. noch nicht bestätigt) */
  code?: string;
  onApply: (code: string) => void;
  onRemove: () => void;
  /** Fehlermeldung (ungültig) */
  error?: string | null;
  /** Hinweis (z. B. Mindestwarenwert noch nicht erreicht) */
  warning?: string | null;
  checking?: boolean;
}

/** Gutschein eingeben/entfernen */
export function CouponField({ applied, code, onApply, onRemove, error, warning, checking }: CouponFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = text.trim().toUpperCase();
    if (!c) return;
    onApply(c);
    setText('');
  };

  if (applied) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-200">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Check size={16} strokeWidth={3} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-sm font-bold text-emerald-800">{applied.code}</span>
          <span className="block truncate text-[13px] text-emerald-700">{applied.description}</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Gutschein entfernen"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <X size={17} aria-hidden />
        </button>
      </div>
    );
  }

  if (code && warning) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-3.5 py-2.5 ring-1 ring-inset ring-amber-200">
        <BadgePercent size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-amber-900">{warning}</span>
        <button type="button" onClick={onRemove} aria-label="Gutschein entfernen" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100">
          <X size={16} aria-hidden />
        </button>
      </div>
    );
  }

  if (!open && !error && !code) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800"
      >
        <BadgePercent size={17} aria-hidden />
        Gutscheincode einlösen
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <Input
        aria-label="Gutscheincode"
        placeholder="Gutscheincode"
        value={text}
        onChange={(e) => setText(e.target.value)}
        icon={BadgePercent}
        autoCapitalize="characters"
        autoComplete="off"
        autoFocus={open && !error}
        error={error ?? undefined}
        containerClassName="min-w-0 flex-1"
        className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
      />
      <Button type="submit" variant="outline" loading={checking} disabled={!text.trim()}>
        Einlösen
      </Button>
    </form>
  );
}
