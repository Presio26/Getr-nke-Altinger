import { useState } from 'react';
import { ChevronDown, Info, Recycle } from 'lucide-react';
import { formatEuro } from '@shared/format';
import { useDepositTypes, useMyCustomer } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { Card, QuantityStepper } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Leergut-Rückgabe: alle rückgabefähigen Pfandarten mit Stepper, Gutschrift je Zeile und gesamt.
 * Der Fahrer nimmt das Leergut bei der Lieferung mit (bzw. Rückgabe im Markt bei Abholung).
 */
export function EmptiesReturn({ fulfillment }: { fulfillment: 'delivery' | 'pickup' }) {
  const depositTypes = useDepositTypes();
  const empties = useCart((s) => s.emptiesReturn);
  const setEmpties = useCart((s) => s.setEmpties);
  const { data: customer } = useMyCustomer();
  const returnable = depositTypes.filter((d) => d.returnable);
  const qtyOf = (id: string) => empties.find((e) => e.depositTypeId === id)?.qty ?? 0;
  const credit = returnable.reduce((s, d) => s + d.amount * qtyOf(d.id), 0);
  const count = empties.reduce((s, e) => s + e.qty, 0);
  const balance = customer?.depositBalance ?? {};
  const held = returnable.filter((d) => (balance[d.id] ?? 0) > 0);
  // automatisch aufgeklappt, wenn Leergut vorgemerkt ist oder der Kunde Leergut von uns hat
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (count > 0 || held.length > 0);
  const setOpen = (fn: (v: boolean) => boolean) => setManual(fn(open));

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50/70 sm:p-5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Recycle size={22} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900">Leergut zurückgeben</span>
          <span className="block text-sm text-slate-500">
            {count > 0
              ? `${count} Gebinde vorgemerkt`
              : fulfillment === 'delivery'
                ? 'Der Fahrer nimmt Ihre leeren Kästen gleich mit.'
                : 'Bringen Sie Ihr Leergut einfach zur Abholung mit.'}
          </span>
        </span>
        {credit > 0 ? <span className="shrink-0 text-base font-bold tabular-nums text-emerald-700">−{formatEuro(credit)}</span> : null}
        <ChevronDown size={20} aria-hidden className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 pb-4 sm:px-5 sm:pb-5">
          {held.length ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
              <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
              <span>
                Laut Ihrem Leergut-Konto haben Sie noch{' '}
                {held.map((d, i) => (
                  <span key={d.id}>
                    {i ? (i === held.length - 1 ? ' und ' : ', ') : ''}
                    <strong>
                      {balance[d.id]} × {d.shortName}
                    </strong>
                  </span>
                ))}{' '}
                von uns.
              </span>
            </p>
          ) : null}
          <ul className="mt-2 divide-y divide-slate-100">
            {returnable.map((d) => {
              const q = qtyOf(d.id);
              return (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-slate-900">{d.shortName}</p>
                    <p className="text-[13px] text-slate-500">
                      {formatEuro(d.amount)} Pfand je Gebinde
                      {q > 0 ? <span className="font-semibold text-emerald-700"> · Gutschrift −{formatEuro(d.amount * q)}</span> : null}
                    </p>
                  </div>
                  <QuantityStepper value={q} onChange={(n) => setEmpties(d.id, n)} size="sm" min={0} max={99} label={d.shortName} />
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-sm">
            <span className="font-semibold text-emerald-900">Gutschrift Leergut</span>
            <span className="font-bold tabular-nums text-emerald-800">{credit > 0 ? `−${formatEuro(credit)}` : formatEuro(0)}</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            Bitte nur vollständige Kästen mit allen Flaschen zurückgeben – die Gutschrift wird mit Ihrer Bestellung verrechnet. Fehlen Flaschen, schreiben wir den
            tatsächlich mitgenommenen Wert gut. Einzelflaschen und Einwegpfand nehmen wir am Leergutautomaten im Markt an.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
