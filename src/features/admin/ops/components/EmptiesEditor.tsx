/**
 * Leergut erfassen (Abholung an der Theke, Telefonbestellung): Mengen je Leergut-Art.
 * Zuerst die naheliegenden Arten (angemeldet, zur Bestellung passend, beim Kunden vorhanden),
 * die übrigen auf Wunsch eingeblendet.
 */
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DepositType, EmptiesLine } from '@shared/types';
import { formatEuro } from '@shared/format';
import { QuantityStepper } from '@/components/ui';
import { cn } from '@/lib/cn';

export type EmptiesValue = Record<string, number>;

export function emptiesToLines(value: EmptiesValue): EmptiesLine[] {
  return Object.entries(value)
    .filter(([, qty]) => qty > 0)
    .map(([depositTypeId, qty]) => ({ depositTypeId, qty }));
}

export function linesToEmpties(lines: EmptiesLine[]): EmptiesValue {
  return Object.fromEntries(lines.map((l) => [l.depositTypeId, l.qty]));
}

/** Gutschrift brutto wie im Core: nur rücknahmefähiges Leergut */
export function emptiesRefund(value: EmptiesValue, types: DepositType[]): number {
  return Object.entries(value).reduce((s, [id, qty]) => s + (types.find((t) => t.id === id && t.returnable)?.amount ?? 0) * Math.max(0, qty), 0);
}

export interface EmptiesEditorProps {
  value: EmptiesValue;
  onChange: (value: EmptiesValue) => void;
  depositTypes: DepositType[];
  /** zuerst angezeigte Arten */
  primaryIds?: string[];
  /** Leergut-Konto des Kunden (Hinweis „hat x bei sich“) */
  balance?: Record<string, number>;
  /** angemeldete Mengen (Hinweis „angemeldet: x“) */
  announced?: Record<string, number>;
  disabled?: boolean;
  className?: string;
}

export function EmptiesEditor({ value, onChange, depositTypes, primaryIds = [], balance = {}, announced, disabled, className }: EmptiesEditorProps) {
  const [showAll, setShowAll] = useState(false);
  const returnable = useMemo(() => depositTypes.filter((d) => d.returnable), [depositTypes]);
  // feste Reihenfolge (wie die Leergut-Arten), damit beim Zählen nichts springt
  const primarySet = useMemo(
    () => new Set([...primaryIds, ...Object.keys(balance).filter((id) => balance[id] > 0 && !returnable.find((d) => d.id === id)?.loose)]),
    [primaryIds, balance, returnable],
  );
  const isPrimary = (id: string) => primarySet.has(id) || (value[id] ?? 0) > 0;
  const restCount = returnable.filter((d) => !isPrimary(d.id)).length;
  const hasPrimary = returnable.some((d) => isPrimary(d.id));
  const shown = showAll || !hasPrimary ? returnable : returnable.filter((d) => isPrimary(d.id));

  return (
    <div className={className}>
      <ul className="space-y-1.5">
        {shown.map((d) => {
          const held = balance[d.id] ?? 0;
          const ann = announced?.[d.id];
          const qty = value[d.id] ?? 0;
          const hints = [`${formatEuro(d.amount)} je Stück`, held && !d.loose ? `Kunde hat ${held} bei sich` : null, ann !== undefined ? `angemeldet: ${ann}` : null].filter(Boolean);
          return (
            <li key={d.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-slate-800">{d.shortName}</p>
                <p className={cn('text-[11px] text-slate-500', ann !== undefined && ann !== qty && 'font-semibold text-amber-700')}>{hints.join(' · ')}</p>
              </div>
              <QuantityStepper
                value={qty}
                onChange={(n) => onChange({ ...value, [d.id]: n })}
                min={0}
                max={999}
                size="sm"
                label={`Leergut ${d.shortName}`}
                disabled={disabled}
              />
            </li>
          );
        })}
      </ul>
      {hasPrimary && (restCount || showAll) ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          aria-expanded={showAll}
        >
          <ChevronDown size={16} aria-hidden className={cn('transition-transform', showAll && 'rotate-180')} />
          {showAll ? 'Weniger Leergut-Arten' : `Weitere Leergut-Arten (${restCount})`}
        </button>
      ) : null}
    </div>
  );
}
