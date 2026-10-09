import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, TicketPercent, X } from 'lucide-react';
import type { Coupon, QuoteMessage } from '@shared/types';
import { formatEuro } from '@shared/format';
import { checkCoupon, findCoupon } from '@shared/core/pricing';
import { todayString } from '@shared/time';
import { api } from '@/api/client';
import { useMyCustomer, useSettings } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { Button, errorMessage, toast } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Gutscheincode: Prüfung über api.validateCoupon, gespeichert im Warenkorb (couponCode).
 * Hinweise/Fehler des Quotes (z. B. Mindestwarenwert unterschritten) werden am eingelösten Code gezeigt.
 */
export function CouponField({
  itemsGross,
  discount,
  coupon,
  error,
  warning,
}: {
  itemsGross: number;
  discount: number;
  coupon?: Coupon;
  error?: QuoteMessage;
  warning?: QuoteMessage;
}) {
  const settings = useSettings();
  const { data: customer } = useMyCustomer();
  const code = useCart((s) => s.couponCode);
  const set = useCart((s) => s.set);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const validate = useMutation({
    mutationFn: (value: string) => api.validateCoupon(value, itemsGross),
    onSuccess(c) {
      set({ couponCode: c.code });
      setDraft('');
      setMessage(null);
      setOpen(false);
      toast.success(`Gutschein „${c.code}“ eingelöst`, { id: 'coupon', description: c.description });
    },
    onError(err) {
      setMessage(errorMessage(err));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = draft.trim().toUpperCase();
    if (!v) {
      setMessage('Bitte geben Sie einen Gutscheincode ein.');
      return;
    }
    // Vorprüfung mit den öffentlichen Gutscheindaten (spart einen fehlschlagenden Serveraufruf); verbindlich prüft der Server
    const local = checkCoupon(findCoupon(settings, v), v, customer?.type ?? 'b2c', itemsGross, todayString());
    if (!local.ok) {
      setMessage(local.message);
      return;
    }
    validate.mutate(v);
  };

  if (code) {
    const known = coupon ?? settings.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase());
    const problem = error ?? warning;
    return (
      <div
        className={cn(
          'rounded-xl px-3 py-2.5 ring-1 ring-inset',
          error ? 'bg-red-50 ring-red-200' : warning ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200',
        )}
      >
        <div className="flex items-start gap-2.5">
          {problem ? (
            <AlertTriangle size={18} aria-hidden className={cn('mt-0.5 shrink-0', error ? 'text-red-600' : 'text-amber-600')} />
          ) : (
            <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-slate-900">
              Gutschein <span className="font-mono tracking-wide">{code}</span>
              {discount > 0 ? <span className="ml-1.5 font-bold text-emerald-700">−{formatEuro(discount)}</span> : null}
            </p>
            {problem ? (
              <p className={cn('mt-0.5', error ? 'text-red-800' : 'text-amber-900')}>{problem.message}</p>
            ) : known ? (
              <p className="mt-0.5 text-slate-600">{known.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => set({ couponCode: undefined })}
            aria-label="Gutschein entfernen"
            className="-mr-1 -mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 hover:text-slate-800"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
        <TicketPercent size={17} aria-hidden /> Gutscheincode einlösen
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="coupon-code" className="mb-1.5 block text-sm font-medium text-slate-700">
        Gutscheincode
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 24));
            setMessage(null);
          }}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="z. B. GARCHING"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? 'coupon-error' : undefined}
          className={cn(
            'h-11 min-w-0 flex-1 rounded-xl border bg-white px-3.5 font-mono text-base uppercase tracking-wide text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 sm:text-[15px]',
            message ? 'border-red-400 focus:ring-red-500/15' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/15',
          )}
        />
        <Button type="submit" variant="secondary" loading={validate.isPending}>
          Einlösen
        </Button>
      </div>
      {message ? (
        <p id="coupon-error" className="mt-1.5 text-sm font-medium text-red-600">
          {message}
        </p>
      ) : null}
    </form>
  );
}
