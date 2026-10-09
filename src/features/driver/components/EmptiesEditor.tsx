/**
 * Leergut erfassen: Stepper je rückgabefähiger Leergut-Art, vorbefüllt mit dem angekündigten Leergut.
 * Gruppen: „Kästen & Fässer“ (Leergut-Konto) und „Einzelflaschen“ (lose Flaschen/Dosen, stückweise).
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DepositType, ID, Order } from '@shared/types';
import { formatEuro } from '@shared/format';
import { cn } from '@/lib/cn';
import { QuantityStepper } from '@/components/ui';
import { emptiesUnit, isLoose } from '../lib/driverUtils';

/** Höchstmengen je Art (der Core prüft lose Flaschen zusätzlich je Bestellung) */
const MAX = { crates: 200, loose: 500 } as const;

export interface EmptiesEditorProps {
  order: Order;
  types: DepositType[];
  value: Record<ID, number>;
  onChange: (next: Record<ID, number>) => void;
  disabled?: boolean;
}

export function EmptiesEditor({ order, types, value, onChange, disabled = false }: EmptiesEditorProps) {
  const crates = useMemo(() => types.filter((t) => t.returnable && !isLoose(t)), [types]);
  const loose = useMemo(() => types.filter((t) => t.returnable && isLoose(t)).sort((a, b) => a.amount - b.amount), [types]);
  const announced = useMemo(() => new Map(order.emptiesReturn.map((l) => [l.depositTypeId, l.qty])), [order.emptiesReturn]);
  // relevant: angekündigt, mitgeliefert oder beim Öffnen bereits erfasst (bleibt stabil, damit nichts springt)
  const [relevantIds] = useState(() => {
    const ids = new Set<ID>(order.emptiesReturn.map((l) => l.depositTypeId));
    for (const l of order.lines) if (l.depositTypeId) ids.add(l.depositTypeId);
    for (const [id, q] of Object.entries(value)) if (q > 0) ids.add(id);
    return ids;
  });
  const [showAll, setShowAll] = useState(false);
  const [showLoose, setShowLoose] = useState(() => loose.some((t) => relevantIds.has(t.id)));
  const primary = crates.filter((t) => relevantIds.has(t.id));
  const base = primary.length ? primary : crates.slice(0, 3);
  const others = crates.filter((t) => !base.includes(t));
  // eingeklappt: zusätzlich erfasste Arten bleiben sichtbar
  const visible = showAll ? [...base, ...others] : [...base, ...others.filter((t) => (value[t.id] ?? 0) > 0)];
  const looseCount = loose.reduce((s, t) => s + (value[t.id] ?? 0), 0);
  const looseVisible = showLoose ? loose : loose.filter((t) => (value[t.id] ?? 0) > 0);

  const set = (id: ID, qty: number) => {
    const next = { ...value };
    if (qty > 0) next[id] = qty;
    else delete next[id];
    onChange(next);
  };

  const row = (t: DepositType) => {
    const qty = value[t.id] ?? 0;
    const ann = announced.get(t.id) ?? 0;
    const differs = qty !== ann;
    return (
      <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-slate-900">{t.shortName}</p>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {formatEuro(t.amount)} {emptiesUnit(t)}
            {ann ? (
              <>
                {' · '}
                <span className={cn('font-semibold', differs ? 'text-amber-700' : 'text-slate-600')}>angekündigt: {ann}</span>
              </>
            ) : null}
          </p>
        </div>
        <QuantityStepper
          value={qty}
          onChange={(n) => set(t.id, n)}
          min={0}
          max={isLoose(t) ? MAX.loose : MAX.crates}
          size="lg"
          label={t.shortName}
          disabled={disabled}
        />
      </li>
    );
  };

  return (
    <div>
      {loose.length ? <GroupTitle title="Kästen & Fässer" hint="nur vollständige Kästen" /> : null}
      <ul className="divide-y divide-slate-100">{visible.map(row)}</ul>
      {others.length ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {showAll ? <ChevronUp size={17} aria-hidden /> : <ChevronDown size={17} aria-hidden />}
          {showAll ? 'Weniger Kastenarten' : `Weitere Kastenarten (${others.length})`}
        </button>
      ) : null}

      {loose.length ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setShowLoose((v) => !v)}
            aria-expanded={showLoose}
            className="mb-1 flex min-h-11 w-full items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold uppercase tracking-wide text-slate-500">Einzelflaschen</span>
              <span className="block text-[13px] text-slate-500">lose Mehrweg- und Einwegflaschen, Dosen – stückweise</span>
            </span>
            {looseCount ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[13px] font-semibold tabular-nums text-brand-800">{looseCount} Stück</span> : null}
            <span className="flex items-center gap-1 text-sm font-semibold text-brand-700">
              {showLoose ? 'Ausblenden' : 'Erfassen'}
              {showLoose ? <ChevronUp size={17} aria-hidden /> : <ChevronDown size={17} aria-hidden />}
            </span>
          </button>
          {looseVisible.length ? <ul className="divide-y divide-slate-100 pt-2">{looseVisible.map(row)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}

function GroupTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <p className="mb-2 flex items-baseline justify-between gap-3">
      <span className="text-[13px] font-bold uppercase tracking-wide text-slate-500">{title}</span>
      <span className="text-[13px] text-slate-400">{hint}</span>
    </p>
  );
}
