import { Layers, Plus, Trash2 } from 'lucide-react';
import { formatEuro } from '@shared/format';
import { Button, IconButton, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatPercent, grossFromNet, parseEuro, parseIntInput } from '../lib';
import { EuroField } from '../ui';
import { newTierKey, type DraftErrors, type TierDraft } from './productDraft';

/** Staffelpreise (B2B, netto): ab Menge → Netto-Stückpreis */
export function TierEditor({
  tiers,
  onChange,
  listNet,
  vatRate,
  errors,
  showErrors,
}: {
  tiers: TierDraft[];
  onChange: (tiers: TierDraft[]) => void;
  /** Listen-Netto (aus Bruttopreis), null wenn Preis ungültig */
  listNet: number | null;
  vatRate: number;
  errors: DraftErrors;
  showErrors: boolean;
}) {
  const update = (key: string, patch: Partial<TierDraft>) => onChange(tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const add = () => {
    const maxQty = Math.max(0, ...tiers.map((t) => parseIntInput(t.minQty) ?? 0));
    const lastNet = tiers.length ? parseEuro(tiers[tiers.length - 1].priceNet) : listNet;
    const suggestion = lastNet ? Math.round(lastNet * 0.96) : null;
    onChange([...tiers, { key: newTierKey(), minQty: String(maxQty ? maxQty * 2 : 10), priceNet: suggestion ? (suggestion / 100).toFixed(2).replace('.', ',') : '' }]);
  };

  return (
    <div>
      {tiers.length ? (
        <div className="space-y-3">
          <div className="hidden grid-cols-[7rem_10rem_minmax(0,1fr)_2.75rem] gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>ab Menge</span>
            <span>Netto je Gebinde</span>
            <span>Brutto · Ersparnis</span>
            <span />
          </div>
          {tiers.map((t) => {
            const net = parseEuro(t.priceNet);
            const err = showErrors ? errors[`tier-${t.key}`] : undefined;
            const saving = net !== null && listNet ? (1 - net / listNet) * 100 : null;
            return (
              <div key={t.key}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2.75rem] items-center gap-3 sm:grid-cols-[7rem_10rem_minmax(0,1fr)_2.75rem]">
                  <Input
                    aria-label="ab Menge"
                    inputMode="numeric"
                    value={t.minQty}
                    onChange={(e) => update(t.key, { minQty: e.target.value.replace(/[^\d]/g, '') })}
                    suffix="Stk."
                    aria-invalid={err ? true : undefined}
                    className={cn(err && 'border-red-400')}
                  />
                  <EuroField
                    aria-label="Netto-Stückpreis"
                    value={t.priceNet}
                    onChange={(e) => update(t.key, { priceNet: e.target.value })}
                    aria-invalid={err ? true : undefined}
                    className={cn(err && 'border-red-400')}
                  />
                  <p className="hidden text-sm text-slate-600 sm:block">
                    {net !== null && net > 0 ? (
                      <>
                        <span className="tabular-nums">{formatEuro(grossFromNet(net, vatRate))}</span> brutto
                        {saving !== null && saving > 0 ? <span className="ml-2 font-semibold text-emerald-700">−{formatPercent(saving, 1)}</span> : null}
                      </>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </p>
                  <IconButton icon={Trash2} label="Staffel entfernen" variant="ghost" onClick={() => onChange(tiers.filter((x) => x.key !== t.key))} />
                </div>
                {err ? <p className="mt-1 text-sm font-medium text-red-600">{err}</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-500">
          <Layers size={18} aria-hidden className="shrink-0 text-slate-400" />
          Keine Staffelpreise. Geschäftskunden erhalten den Listenpreis bzw. ihren Gruppenrabatt – der günstigste Preis gewinnt.
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" icon={Plus} onClick={add}>
          Staffel hinzufügen
        </Button>
        {listNet ? <span className="text-sm text-slate-500">Listen-Netto: {formatEuro(listNet)}</span> : null}
      </div>
    </div>
  );
}
