import { useState } from 'react';
import { AlertTriangle, ChevronDown, Info, Recycle } from 'lucide-react';
import type { QuoteMessage } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useDepositTypes, useMyCustomer } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { Card, QuantityStepper } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTouchStepperSize } from '@/components/product';
import { emptiesErrors, emptiesMax, emptiesUnit, groupEmpties } from './emptiesGroups';

/**
 * Leergut-Rückgabe: rückgabefähige Pfandarten gruppiert („Kästen & Fässer“, „Einzelflaschen“) mit Stepper,
 * Gutschrift je Zeile und gesamt; Meldungen der Preisberechnung (Leergut-Konto, Höchstmenge) an der Zeile.
 * Der Fahrer nimmt das Leergut bei der Lieferung mit (bzw. Rückgabe im Markt bei Abholung).
 */
export function EmptiesReturn({ fulfillment, errors }: { fulfillment: 'delivery' | 'pickup'; errors?: QuoteMessage[] }) {
  const depositTypes = useDepositTypes();
  const empties = useCart((s) => s.emptiesReturn);
  const setEmpties = useCart((s) => s.setEmpties);
  const { data: customer } = useMyCustomer();
  const groups = groupEmpties(depositTypes);
  const returnable = groups.flatMap((g) => g.types);
  const qtyOf = (id: string) => empties.find((e) => e.depositTypeId === id)?.qty ?? 0;
  const credit = returnable.reduce((s, d) => s + d.amount * qtyOf(d.id), 0);
  const count = empties.reduce((s, e) => s + e.qty, 0);
  const balance = customer?.depositBalance ?? {};
  const held = returnable.filter((d) => !d.loose && (balance[d.id] ?? 0) > 0);
  const issues = emptiesErrors(errors, returnable);
  const stepper = useTouchStepperSize();
  // automatisch aufgeklappt, wenn Leergut vorgemerkt ist, der Kunde Leergut von uns hat oder etwas zu korrigieren ist
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (count > 0 || held.length > 0 || issues.byType.size > 0 || issues.general.length > 0);
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
              ? `${count} Stück vorgemerkt`
              : fulfillment === 'delivery'
                ? 'Der Fahrer nimmt Ihre leeren Kästen und Flaschen gleich mit.'
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
          {issues.general.map((m) => (
            <p key={m} className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
              <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
              {m}
            </p>
          ))}
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`leergut-${g.id}`} className="mt-4">
              <h3 id={`leergut-${g.id}`} className="flex flex-wrap items-baseline gap-x-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                {g.title}
                <span className="text-[11px] font-medium normal-case tracking-normal text-slate-400">{g.hint}</span>
              </h3>
              <ul className="mt-1 divide-y divide-slate-100">
                {g.types.map((d) => {
                  const q = qtyOf(d.id);
                  const issue = issues.byType.get(d.id);
                  const fix = issue ? suggestedQty(issue) : null;
                  return (
                    <li key={d.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium text-slate-900">{d.shortName}</p>
                          <p className="text-[13px] text-slate-500">
                            {formatEuro(d.amount)} Pfand {emptiesUnit(d)}
                            {q > 0 && !issue ? <span className="font-semibold text-emerald-700"> · Gutschrift −{formatEuro(d.amount * q)}</span> : null}
                          </p>
                        </div>
                        <QuantityStepper value={q} onChange={(n) => setEmpties(d.id, n)} size={stepper} min={0} max={emptiesMax(d)} label={d.shortName} />
                      </div>
                      {issue ? (
                        <div className="mt-2 flex flex-col items-start gap-1 rounded-xl bg-red-50 px-3 py-2 text-[13px] leading-snug text-red-800 ring-1 ring-inset ring-red-200" role="alert">
                          <span>{issue}</span>
                          {fix !== null && fix !== q ? (
                            <button type="button" onClick={() => setEmpties(d.id, fix)} className="min-h-9 font-semibold text-red-800 underline underline-offset-2">
                              {fix > 0 ? `Auf ${fix} korrigieren` : 'Entfernen'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-sm">
            <span className="font-semibold text-emerald-900">Gutschrift Leergut</span>
            <span className="font-bold tabular-nums text-emerald-800">{credit > 0 ? `−${formatEuro(credit)}` : formatEuro(0)}</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            Kästen bitte nur vollständig mit allen Flaschen zurückgeben – fehlen Flaschen, schreiben wir den tatsächlich mitgenommenen Wert gut. Lose Flaschen zählen
            wir bei der Übergabe nach. Die Gutschrift wird mit Ihrer Bestellung verrechnet.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/** „höchstens 3 × …“ → 3, „kein Leergut …“ → 0, sonst null */
function suggestedQty(message: string): number | null {
  const m = /höchstens (\d+)/.exec(message);
  if (m) return Number(m[1]);
  if (/kein Leergut/.test(message)) return 0;
  return null;
}
