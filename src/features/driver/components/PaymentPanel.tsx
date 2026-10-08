/**
 * Kassieren an der Haustür: zu zahlender Betrag (Bestellsumme ± Leergut-Abweichung),
 * Bar/EC-Auswahl, erhaltener Betrag und Rückgeld. PayPal/Karte = bereits bezahlt, Rechnung/SEPA = per Rechnung.
 */
import { BadgeCheck, Banknote, CreditCard, FileText, HandCoins, Wallet } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatEuro, PAYMENT_METHOD_LABEL } from '@shared/format';
import { cn } from '@/lib/cn';
import { Checkbox, Input, Notice, SegmentedControl } from '@/components/ui';
import { cashSuggestions, centsToInput, parseEuroInput, payKind, type DueInfo } from '../lib/driverUtils';

export interface PaymentState {
  method: 'cash' | 'ec';
  received: string;
  ecConfirmed: boolean;
}

export interface PaymentPanelProps {
  order: Order;
  due: DueInfo;
  value: PaymentState;
  onChange: (patch: Partial<PaymentState>) => void;
  showErrors?: boolean;
  disabled?: boolean;
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'plus' | 'minus' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={cn('text-[15px]', strong ? 'font-semibold text-slate-900' : 'text-slate-600')}>{label}</dt>
      <dd
        className={cn(
          'shrink-0 tabular-nums',
          strong ? 'text-[15px] font-bold text-slate-900' : 'text-[15px] font-medium text-slate-800',
          tone === 'minus' && 'text-emerald-700',
          tone === 'plus' && 'text-amber-700',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** erhaltener Betrag in Cent (null = ungültig/leer) */
export function receivedCents(state: PaymentState): number | null {
  return parseEuroInput(state.received);
}

export function PaymentPanel({ order, due, value, onChange, showErrors = false, disabled = false }: PaymentPanelProps) {
  const kind = payKind(order.paymentMethod);
  const diffText =
    due.refundDiff === 0
      ? null
      : due.refundDiff > 0
        ? `Mehr Leergut als angekündigt: ${formatEuro(due.refundDiff)} weniger`
        : `Weniger Leergut als angekündigt: ${formatEuro(-due.refundDiff)} mehr`;

  const breakdown = (
    <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3.5 py-1.5 ring-1 ring-inset ring-slate-100">
      <Row label="Bestellsumme" value={formatEuro(due.orderTotal)} />
      {due.announcedRefund ? <Row label="inkl. Leergut-Gutschrift" value={formatEuro(-due.announcedRefund)} /> : null}
      {due.refundDiff !== 0 ? (
        <Row label="Leergut-Abweichung" value={formatEuro(-due.refundDiff, { sign: true })} tone={due.refundDiff > 0 ? 'minus' : 'plus'} />
      ) : null}
    </dl>
  );

  if (kind === 'prepaid') {
    return (
      <div className="space-y-3">
        <Notice tone="success" icon={BadgeCheck} title={`Bereits bezahlt (${PAYMENT_METHOD_LABEL[order.paymentMethod]})`}>
          Hier ist nichts zu kassieren.
          {diffText ? ` ${diffText} – die Leergut-Abweichung wird vom Markt mit dem Kundenkonto verrechnet.` : ''}
        </Notice>
        {due.refundDiff !== 0 ? breakdown : null}
      </div>
    );
  }

  if (kind === 'invoice') {
    return (
      <div className="space-y-3">
        <Notice tone="info" icon={FileText} title={order.paymentMethod === 'sepa' ? 'Per SEPA-Lastschrift' : 'Per Rechnung'}>
          Hier ist nichts zu kassieren. {formatEuro(due.due)} {order.paymentMethod === 'sepa' ? 'werden per Lastschrift eingezogen' : 'erscheinen auf der Sammelrechnung'}
          {due.refundDiff !== 0 ? ' (inkl. Leergut-Abweichung)' : ''}.
        </Notice>
        {due.refundDiff !== 0 ? breakdown : null}
      </div>
    );
  }

  // bar / EC
  const payout = due.due < 0;
  const received = receivedCents(value);
  const change = received !== null ? received - due.due : null;
  const missingCash = value.method === 'cash' && !payout && (received === null || received < due.due);
  const suggestions = cashSuggestions(due.due);

  return (
    <div className="space-y-4">
      {breakdown}
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5',
          payout ? 'bg-emerald-600 text-white' : 'bg-brand-900 text-white',
        )}
      >
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {payout ? <HandCoins size={22} aria-hidden /> : <Wallet size={22} aria-hidden className="text-accent-300" />}
          {payout ? 'An Kunden auszahlen' : 'Zu kassieren'}
        </span>
        <span className="text-[1.75rem] font-bold leading-none tabular-nums" data-testid="amount-due">
          {formatEuro(Math.abs(due.due))}
        </span>
      </div>
      {diffText ? <p className="-mt-2 text-sm font-medium text-slate-500">{diffText}.</p> : null}

      {payout ? (
        <Notice tone="success" icon={Banknote}>
          Das zurückgenommene Leergut übersteigt den Bestellwert. Bitte zahlen Sie {formatEuro(-due.due)} bar aus.
        </Notice>
      ) : (
        <>
          <SegmentedControl
            block
            aria-label="Zahlart an der Tür"
            value={value.method}
            onChange={(v) => onChange({ method: v as PaymentState['method'] })}
            options={[
              { value: 'cash', label: 'Bar', icon: Banknote },
              { value: 'ec', label: 'EC-Karte', icon: CreditCard },
            ]}
          />
          {value.method !== order.paymentMethod ? (
            <p className="-mt-2 text-sm text-amber-700">
              Bestellt war „{PAYMENT_METHOD_LABEL[order.paymentMethod]}“ – die Änderung wird im Zustellnachweis vermerkt.
            </p>
          ) : null}

          {value.method === 'cash' ? (
            <div className="space-y-3">
              <Input
                label="Erhaltener Betrag"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={value.received}
                onChange={(e) => onChange({ received: e.target.value })}
                suffix="€"
                disabled={disabled}
                error={showErrors && missingCash ? 'Bitte geben Sie den erhaltenen Betrag ein (mindestens der zu kassierende Betrag).' : undefined}
                className="font-semibold tabular-nums"
              />
              <div className="flex flex-wrap gap-2">
                {suggestions.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ received: centsToInput(c) })}
                    className={cn(
                      'h-11 rounded-xl px-3.5 text-[15px] font-semibold tabular-nums ring-1 ring-inset transition-colors',
                      received === c ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {i === 0 ? `Passend · ${formatEuro(c)}` : formatEuro(c)}
                  </button>
                ))}
              </div>
              {change !== null && received !== null ? (
                <div
                  className={cn(
                    'flex items-center justify-between rounded-xl px-4 py-3 ring-1 ring-inset',
                    change >= 0 ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-800 ring-red-200',
                  )}
                  aria-live="polite"
                >
                  <span className="text-[15px] font-semibold">{change >= 0 ? 'Rückgeld' : 'Es fehlen noch'}</span>
                  <span className="text-2xl font-bold tabular-nums" data-testid="change">
                    {formatEuro(Math.abs(change))}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className={cn('rounded-xl px-3 ring-1 ring-inset', showErrors && !value.ecConfirmed ? 'bg-red-50/60 ring-red-300' : 'bg-slate-50 ring-slate-200')}>
              <Checkbox
                checked={value.ecConfirmed}
                onChange={(e) => onChange({ ecConfirmed: e.target.checked })}
                disabled={disabled}
                label={`Zahlung über ${formatEuro(due.due)} am EC-Terminal erfolgreich`}
                description="Erst abhaken, wenn das Terminal „Zahlung erfolgt“ anzeigt."
                containerClassName="py-2.5"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Ist das Kassieren vollständig? */
export function paymentComplete(order: Order, due: DueInfo, state: PaymentState): boolean {
  if (payKind(order.paymentMethod) !== 'collect' || due.due <= 0) return true;
  if (state.method === 'ec') return state.ecConfirmed;
  const r = receivedCents(state);
  return r !== null && r >= due.due;
}
