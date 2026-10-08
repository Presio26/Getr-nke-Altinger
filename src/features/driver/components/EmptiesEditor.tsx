/**
 * Leergut erfassen: Stepper je rückgabefähiger Leergut-Art, vorbefüllt mit dem angekündigten Leergut.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DepositType, ID, Order } from '@shared/types';
import { formatEuro } from '@shared/format';
import { cn } from '@/lib/cn';
import { QuantityStepper } from '@/components/ui';

export interface EmptiesEditorProps {
  order: Order;
  types: DepositType[];
  value: Record<ID, number>;
  onChange: (next: Record<ID, number>) => void;
  disabled?: boolean;
}

export function EmptiesEditor({ order, types, value, onChange, disabled = false }: EmptiesEditorProps) {
  const returnable = useMemo(() => types.filter((t) => t.returnable), [types]);
  const announced = useMemo(() => new Map(order.emptiesReturn.map((l) => [l.depositTypeId, l.qty])), [order.emptiesReturn]);
  // relevant: angekündigt, mitgeliefert oder beim Öffnen bereits erfasst (bleibt stabil, damit nichts springt)
  const [relevantIds] = useState(() => {
    const ids = new Set<ID>(order.emptiesReturn.map((l) => l.depositTypeId));
    for (const l of order.lines) if (l.depositTypeId) ids.add(l.depositTypeId);
    for (const [id, q] of Object.entries(value)) if (q > 0) ids.add(id);
    return ids;
  });
  const [showAll, setShowAll] = useState(false);
  const primary = returnable.filter((t) => relevantIds.has(t.id));
  const base = primary.length ? primary : returnable.slice(0, 3);
  const others = returnable.filter((t) => !base.includes(t));
  // eingeklappt: zusätzlich erfasste Arten bleiben sichtbar
  const visible = showAll ? [...base, ...others] : [...base, ...others.filter((t) => (value[t.id] ?? 0) > 0)];

  const set = (id: ID, qty: number) => {
    const next = { ...value };
    if (qty > 0) next[id] = qty;
    else delete next[id];
    onChange(next);
  };

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {visible.map((t) => {
          const qty = value[t.id] ?? 0;
          const ann = announced.get(t.id) ?? 0;
          const differs = qty !== ann;
          return (
            <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-snug text-slate-900">{t.shortName}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  {formatEuro(t.amount)} je Gebinde
                  {ann ? (
                    <>
                      {' · '}
                      <span className={cn('font-semibold', differs ? 'text-amber-700' : 'text-slate-600')}>angekündigt: {ann}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <QuantityStepper value={qty} onChange={(n) => set(t.id, n)} min={0} max={200} size="lg" label={t.shortName} disabled={disabled} />
            </li>
          );
        })}
      </ul>
      {others.length ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {showAll ? <ChevronUp size={17} aria-hidden /> : <ChevronDown size={17} aria-hidden />}
          {showAll ? 'Weniger Leergut-Arten' : `Weitere Leergut-Arten (${others.length})`}
        </button>
      ) : null}
    </div>
  );
}
