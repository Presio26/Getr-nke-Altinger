import { useEffect, useState } from 'react';
import { History, Recycle } from 'lucide-react';
import type { DepositType, EmptiesLine } from '@shared/types';
import { formatEuro } from '@shared/format';
import { Button, Modal, QuantityStepper } from '@/components/ui';
import { useTouchStepperSize } from '@/components/product';
import { emptiesMax, emptiesUnit, groupEmpties } from '@/features/shop/components/cart/emptiesGroups';

export interface EmptiesModalProps {
  open: boolean;
  onClose: () => void;
  value: EmptiesLine[];
  onSave: (lines: EmptiesLine[]) => void;
  depositTypes: DepositType[];
  /** Leergut-Konto des Kunden (Anzahl je Pfandart) */
  balance: Record<string, number>;
}

/** Leergut-Rückgabe bearbeiten: Mengen je Pfandart, gruppiert nach „Kästen & Fässer“ und „Einzelflaschen“ */
export function EmptiesModal({ open, onClose, value, onSave, depositTypes, balance }: EmptiesModalProps) {
  const groups = groupEmpties(depositTypes);
  const returnable = groups.flatMap((g) => g.types);
  const stepper = useTouchStepperSize();
  const [draft, setDraft] = useState<Record<string, number>>({});
  useEffect(() => {
    if (open) setDraft(Object.fromEntries(value.map((l) => [l.depositTypeId, l.qty])));
  }, [open, value]);

  const total = returnable.reduce((s, t) => s + (draft[t.id] ?? 0) * t.amount, 0);
  const count = Object.values(draft).reduce((s, n) => s + n, 0);
  const fromAccount = returnable.filter((t) => !t.loose && (balance[t.id] ?? 0) > 0);

  const save = () => {
    onSave(
      Object.entries(draft)
        .filter(([, qty]) => qty > 0)
        .map(([depositTypeId, qty]) => ({ depositTypeId, qty })),
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Leergut-Rückgabe"
      description="Geben Sie an, welches Leergut wir mitnehmen sollen – das Pfand schreiben wir Ihnen gut."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button icon={Recycle} onClick={save}>
            {count ? `Übernehmen (${formatEuro(-total)})` : 'Übernehmen'}
          </Button>
        </>
      }
    >
      {fromAccount.length ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-3.5 py-3 text-sm text-brand-900 ring-1 ring-inset ring-brand-100">
          <span className="flex items-start gap-2">
            <History size={16} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
            <span>Laut Ihrem Leergut-Konto haben Sie noch Kästen bzw. Fässer von uns.</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => setDraft((d) => ({ ...d, ...Object.fromEntries(fromAccount.map((t) => [t.id, balance[t.id]])) }))}>
            Übernehmen
          </Button>
        </div>
      ) : null}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`leergut-modal-${g.id}`} className="mt-2 first:mt-0">
          <h3 id={`leergut-modal-${g.id}`} className="flex flex-wrap items-baseline gap-x-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {g.title}
            <span className="text-[11px] font-medium normal-case tracking-normal text-slate-400">{g.hint}</span>
          </h3>
          <ul className="divide-y divide-slate-100">
            {g.types.map((t) => {
              const qty = draft[t.id] ?? 0;
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-slate-900">{t.shortName}</p>
                    <p className="text-[13px] text-slate-500">
                      {formatEuro(t.amount)} Pfand {emptiesUnit(t)}
                      {!t.loose && balance[t.id] ? <span className="text-brand-700"> · im Konto: {balance[t.id]}</span> : null}
                    </p>
                  </div>
                  <QuantityStepper value={qty} min={0} max={emptiesMax(t)} size={stepper} label={t.shortName} onChange={(n) => setDraft((d) => ({ ...d, [t.id]: n }))} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
        <span className="font-semibold text-slate-700">Gutschrift</span>
        <span className="text-lg font-bold tabular-nums text-emerald-700">{formatEuro(-total)}</span>
      </div>
    </Modal>
  );
}
