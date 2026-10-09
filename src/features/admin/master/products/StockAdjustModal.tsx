import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Minus, PackageCheck, Plus } from 'lucide-react';
import type { Product } from '@shared/types';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Button, Input, Modal, SegmentedControl, Select } from '@/components/ui';
import { ProductImage } from '@/components/product';
import { cn } from '@/lib/cn';
import { parseIntInput, stockLevel } from '../lib';
import { StockDot, stockLabel, stockTextClass } from '../ui';

type Mode = 'in' | 'out' | 'count';

const REASONS: Record<Mode, string[]> = {
  in: ['Wareneingang', 'Retoure vom Kunden', 'Umlagerung', 'Korrektur'],
  out: ['Bruch / Schwund', 'Verkauf im Markt', 'Eigenverbrauch', 'Abgelaufen (MHD)', 'Korrektur'],
  count: ['Inventur'],
};

/** Bestandskorrektur: Zugang, Abgang oder Inventur (Ist-Bestand) mit Grund → api.adminAdjustStock */
export function StockAdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('in');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(REASONS.in[0]);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!product) return;
    setMode('in');
    setQty('');
    setReason(REASONS.in[0]);
    setNote('');
    setTouched(false);
  }, [product?.id]);

  const n = parseIntInput(qty);
  const current = product?.stock ?? 0;
  const delta = n === null ? null : mode === 'in' ? n : mode === 'out' ? -n : n - current;
  const next = delta === null ? null : current + delta;

  const error = useMemo(() => {
    if (n === null) return 'Bitte geben Sie eine ganze Zahl ein.';
    if (n < 0) return 'Bitte geben Sie eine positive Zahl ein.';
    if (mode !== 'count' && n === 0) return 'Die Menge muss größer als 0 sein.';
    if (next !== null && next < 0) return `Es sind nur ${current} Gebinde am Lager.`;
    if (delta === 0) return 'Der gezählte Bestand entspricht dem aktuellen Bestand.';
    return null;
  }, [n, mode, next, current, delta]);

  const save = useApiMutation(
    (vars: { id: string; delta: number; reason: string }) => api.adminAdjustStock(vars.id, vars.delta, vars.reason),
    {
      invalidate: [qk.products, qk.admin],
      success: (p) => `Bestand aktualisiert: ${p.brand} ${p.name} – jetzt ${p.stock}`,
      onSuccess: () => onClose(),
    },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!product || error || delta === null) return;
    const text = [reason, note.trim()].filter(Boolean).join(': ');
    save.mutate({ id: product.id, delta, reason: text });
  };

  const changeMode = (m: string) => {
    const next = m as Mode;
    setMode(next);
    setReason(REASONS[next][0]);
    setQty(next === 'count' ? String(current) : '');
    setTouched(false);
  };

  const level = next !== null && next >= 0 && product ? stockLevel({ ...product, stock: next }) : null;

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Bestand korrigieren"
      description={product ? `${product.brand} ${product.name} · ${product.packaging}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" form="stock-adjust-form" icon={PackageCheck} loading={save.isPending}>
            Bestand buchen
          </Button>
        </>
      }
    >
      {product ? (
        <form id="stock-adjust-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-3">
            <ProductImage product={product} size={56} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-500">Aktueller Bestand</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">{product.stock}</p>
            </div>
            <ArrowRight size={18} aria-hidden className="text-slate-300" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-500">Neuer Bestand</p>
              <p className={cn('text-2xl font-bold tabular-nums', next === null || next < 0 ? 'text-slate-300' : 'text-slate-900')}>
                {next === null || next < 0 ? '–' : next}
              </p>
            </div>
          </div>

          <SegmentedControl
            block
            aria-label="Art der Buchung"
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'in', label: 'Zugang', icon: Plus },
              { value: 'out', label: 'Abgang', icon: Minus },
              { value: 'count', label: 'Inventur' },
            ]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={mode === 'count' ? 'Gezählter Bestand' : 'Menge (Gebinde)'}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
              error={touched ? error : undefined}
              autoFocus
              required
            />
            <Select label="Grund" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS[mode].map((r) => ({ value: r, label: r }))} />
          </div>
          <Input label="Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Lieferschein 4711" maxLength={120} />

          {level && !error ? (
            <p className={cn('flex items-center gap-2 text-sm font-medium', stockTextClass(level))}>
              <StockDot level={level} />
              {stockLabel(level)}
              {!product.isRental ? <span className="font-normal text-slate-500">· Meldebestand {product.minStock}</span> : null}
            </p>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}
