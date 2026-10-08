import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CreditCard, LogIn, Repeat2, ShoppingBag, Star, Truck } from 'lucide-react';
import type { Quote } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useSession } from '@/stores/session';
import { useCart } from '@/stores/cart';
import { ButtonLink, Card, ErrorState, SegmentedControl, Skeleton, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CouponField } from './CouponField';
import { DeliveryProgress } from './DeliveryProgress';
import type { CartQuoteState } from './useCartQuote';

/** Ziel und Beschriftung des Kassen-Buttons je nach Rolle */
export function useCheckoutTarget(): { to: string; label: string; guest: boolean; staff: boolean } {
  const role = useSession((s) => s.user?.role ?? null);
  const status = useSession((s) => s.status);
  if (status !== 'authenticated' || !role) return { to: `/login?next=${encodeURIComponent('/kasse')}`, label: 'Anmelden & zur Kasse', guest: true, staff: false };
  if (role === 'driver' || role === 'admin') return { to: '/kasse', label: 'Zur Kasse', guest: false, staff: true };
  return { to: '/kasse', label: 'Zur Kasse', guest: false, staff: false };
}

/** Gründe, warum „Zur Kasse“ noch nicht möglich ist */
export function blockingReasons(state: CartQuoteState): string[] {
  const reasons = state.blocking.map((e) => e.message);
  if (state.lineErrors.length) reasons.push('Bitte passen Sie die markierten Positionen an.');
  if (state.couponError) reasons.push('Bitte entfernen Sie den ungültigen Gutschein.');
  return reasons;
}

function Row({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: 'credit' | 'muted'; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="min-w-0 text-[15px] text-slate-600">
        {label}
        {hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
      </dt>
      <dd className={cn('shrink-0 text-[15px] font-medium tabular-nums', tone === 'credit' ? 'text-emerald-700' : tone === 'muted' ? 'text-slate-500' : 'text-slate-900')}>{value}</dd>
    </div>
  );
}

function Totals({ quote, state, count }: { quote: Quote; state: CartQuoteState; count: number }) {
  const t = quote.totals;
  const net = quote.customerType === 'b2b';
  const fulfillment = state.input.fulfillment;
  const delivery =
    fulfillment === 'pickup' ? (
      'kostenlos'
    ) : state.zone && quote.zone ? (
      t.deliveryFee > 0 ? (
        formatEuro(t.deliveryFee)
      ) : (
        <span className="font-semibold text-emerald-700">kostenlos</span>
      )
    ) : (
      <span className="text-sm text-slate-500">an der Kasse</span>
    );
  return (
    <dl className="divide-y divide-slate-100">
      <div className="pb-2">
        {net ? (
          <>
            <Row label={`Warenwert netto (${count} Gebinde)`} value={formatEuro(t.itemsNet)} />
            <Row label="zzgl. MwSt. auf Waren" value={formatEuro(t.itemsGross - t.itemsNet)} />
          </>
        ) : (
          <Row label={`Warenwert (${count} Gebinde)`} value={formatEuro(t.itemsGross)} />
        )}
        {t.discount > 0 ? <Row label={`Gutschein ${quote.coupon?.code ?? ''}`} value={`−${formatEuro(t.discount)}`} tone="credit" /> : null}
        <Row
          label={fulfillment === 'pickup' ? 'Abholung im Markt' : 'Lieferung'}
          hint={fulfillment === 'delivery' && !(state.zone && quote.zone) ? 'wird anhand Ihrer Adresse berechnet' : undefined}
          value={delivery}
        />
        {t.carryFee > 0 ? <Row label="Tragservice" value={formatEuro(t.carryFee)} /> : null}
      </div>
      {t.deposit > 0 || t.depositRefund > 0 ? (
        <div className="py-2">
          {t.deposit > 0 ? <Row label="Pfand" value={formatEuro(t.deposit)} /> : null}
          {t.depositRefund > 0 ? <Row label="Leergut-Rückgabe" value={`−${formatEuro(t.depositRefund)}`} tone="credit" /> : null}
        </div>
      ) : null}
      <div className="pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base font-bold text-slate-900">{t.total < 0 ? 'Auszahlung an Sie' : net ? 'Gesamtbetrag (brutto)' : 'Gesamtbetrag'}</dt>
          <dd className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{formatEuro(Math.abs(t.total))}</dd>
        </div>
        <p className="mt-0.5 text-right text-xs text-slate-500">
          {net ? `darin ${formatEuro(t.vat)} MwSt.` : `inkl. ${formatEuro(t.vat)} MwSt.`}
          {t.deposit > 0 ? ' · inkl. Pfand' : ''}
        </p>
      </div>
    </dl>
  );
}

/** Zusammenfassung (rechts bzw. unter den Positionen): Lieferfortschritt, Gutschein, Summen, Kasse, Abo */
export function CartSummary({ state, count, hasRental }: { state: CartQuoteState; count: number; hasRental: boolean }) {
  const role = useSession((s) => s.user?.role ?? null);
  const fulfillment = useCart((s) => s.fulfillment);
  const setCart = useCart((s) => s.set);
  const target = useCheckoutTarget();
  const reasons = blockingReasons(state);
  const blocked = reasons.length > 0 || target.staff;
  const quote = state.quote;
  const outsideZone = quote?.errors.find((e) => e.code === 'zone')?.message;
  const aboLink = role === 'business' ? { to: '/business/dauerauftraege?neu=warenkorb', label: 'Als Dauerauftrag speichern' } : role === 'customer' ? { to: '/konto/abos?neu=warenkorb', label: 'Als Abo speichern' } : null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Zusammenfassung</h2>
          {state.fetching && quote ? <Spinner size={16} label="Preise werden aktualisiert" /> : null}
        </div>
        <SegmentedControl
          block
          aria-label="Lieferart"
          value={fulfillment}
          onChange={(v) => setCart({ fulfillment: v as 'delivery' | 'pickup', slotId: undefined })}
          options={[
            { value: 'delivery', label: 'Lieferung', icon: Truck },
            { value: 'pickup', label: 'Abholung', icon: ShoppingBag },
          ]}
        />
        <DeliveryProgress fulfillment={fulfillment} zone={state.zone} itemsGross={state.itemsGross} outsideZone={outsideZone} />
        <CouponField
          itemsGross={state.itemsGross}
          discount={quote?.totals.discount ?? 0}
          coupon={quote?.coupon}
          error={state.couponError}
          warning={state.couponWarning}
        />
      </div>

      <div className="border-t border-slate-100 p-4 sm:p-5">
        {state.error && !quote ? (
          <ErrorState error={state.error} onRetry={state.refetch} className="py-4" />
        ) : !quote ? (
          <div className="space-y-3" aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            <Skeleton className="mt-2 h-8 w-full" />
          </div>
        ) : (
          <Totals quote={quote} state={state} count={count} />
        )}

        {quote && quote.customerType === 'b2c' && quote.loyaltyPointsEarned > 0 && role === 'customer' ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-900">
            <Star size={16} aria-hidden className="shrink-0 fill-accent-400 text-accent-500" />
            Sie sammeln {quote.loyaltyPointsEarned} Treuepunkte mit dieser Bestellung.
          </p>
        ) : null}

        {reasons.length ? (
          <div className="mt-4 space-y-1.5 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
            {reasons.map((r) => (
              <p key={r} className="flex items-start gap-2">
                <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
                {r}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <ButtonLink to={target.to} size="lg" block disabled={blocked} icon={target.guest ? LogIn : undefined} iconRight={target.guest ? undefined : ArrowRight}>
            {target.label}
          </ButtonLink>
          {target.staff ? <p className="text-center text-xs text-slate-500">Mit einem Mitarbeiterkonto können Sie nicht bestellen.</p> : null}
          {target.guest ? (
            <p className="text-center text-xs text-slate-500">
              Noch kein Konto?{' '}
              <Link to={`/registrieren?next=${encodeURIComponent('/kasse')}`} className="font-semibold text-brand-700 hover:text-brand-800">
                Jetzt registrieren
              </Link>{' '}
              – Ihr Warenkorb bleibt erhalten.
            </p>
          ) : null}
          {aboLink && !hasRental ? (
            <Link to={aboLink.to} className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-brand-700 hover:bg-brand-50">
              <Repeat2 size={17} aria-hidden /> {aboLink.label}
            </Link>
          ) : null}
        </div>
        <p className="mt-3 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-slate-500">
          <CreditCard size={14} aria-hidden className="mt-0.5 shrink-0" />
          Zeitfenster und Zahlart (bar, EC-Karte, PayPal, Kreditkarte{role === 'business' ? ', Rechnung' : ''}) wählen Sie im nächsten Schritt.
        </p>
      </div>
    </Card>
  );
}
