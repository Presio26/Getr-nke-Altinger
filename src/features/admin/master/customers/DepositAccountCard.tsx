import { useEffect, useState, type FormEvent } from 'react';
import { Minus, PackageOpen, Plus, Recycle, SlidersHorizontal } from 'lucide-react';
import type { Customer } from '@shared/types';
import { formatEuro } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes } from '@/api/hooks';
import { Button, Input, Modal, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { depositValue } from '../lib';
import { FormSection } from '../ui';

function AdjustDepositModal({ customer, typeId, onClose }: { customer: Customer; typeId: string | null; onClose: () => void }) {
  const depositTypes = useDepositTypes();
  const [type, setType] = useState('');
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (typeId === null) return;
    setType(typeId || depositTypes.find((d) => d.returnable)?.id || depositTypes[0]?.id || '');
    setDelta(0);
    setNote('');
  }, [typeId, depositTypes]);

  const current = customer.depositBalance[type] ?? 0;
  const next = current + delta;
  const t = depositTypes.find((d) => d.id === type);
  const save = useApiMutation((v: { type: string; delta: number; note: string }) => api.adminAdjustDeposit(customer.id, v.type, v.delta, v.note || undefined), {
    invalidate: [qk.admin],
    success: (c) => `Leergut-Konto aktualisiert: ${t?.shortName ?? ''} jetzt ${c.depositBalance[type] ?? 0}`,
    onSuccess: () => onClose(),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!delta || next < 0) return;
    save.mutate({ type, delta, note: note.trim() });
  };

  return (
    <Modal
      open={typeId !== null}
      onClose={onClose}
      title="Leergut-Konto korrigieren"
      description={`${customer.name} – z. B. nach Zählung, Abholung oder Rückgabe im Markt.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" form="deposit-form" loading={save.isPending} disabled={!delta || next < 0}>
            Korrektur buchen
          </Button>
        </>
      }
    >
      <form id="deposit-form" onSubmit={submit} noValidate className="space-y-5">
        <Select
          label="Leergut-Art"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setDelta(0);
          }}
          options={depositTypes.map((d) => ({ value: d.id, label: `${d.shortName} · ${formatEuro(d.amount)} Pfand` }))}
        />
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Änderung</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex h-12 items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xs">
              <button type="button" onClick={() => setDelta((d) => d - 1)} disabled={next <= 0} aria-label="Ein Gebinde weniger" className="flex w-12 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30">
                <Minus size={18} aria-hidden />
              </button>
              <span className={cn('flex min-w-16 items-center justify-center border-x border-slate-200 px-3 text-lg font-bold tabular-nums', delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-slate-400')}>
                {delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0'}
              </span>
              <button type="button" onClick={() => setDelta((d) => d + 1)} aria-label="Ein Gebinde mehr" className="flex w-12 items-center justify-center text-slate-600 hover:bg-slate-50">
                <Plus size={18} aria-hidden />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Bestand <strong className="tabular-nums text-slate-900">{current}</strong> → <strong className="tabular-nums text-slate-900">{Math.max(0, next)}</strong>
              {t && delta ? <span className="text-slate-500"> ({formatEuro(Math.abs(delta) * t.amount)} Pfand)</span> : null}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-500">Plus = Kunde hat zusätzliches Leergut von uns · Minus = Rückgabe/Ausbuchung</p>
        </div>
        <Input label="Vermerk (erscheint in der internen Notiz)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Zählung bei Abholung" maxLength={200} />
      </form>
    </Modal>
  );
}

/** Leergut-Konto: Gebinde beim Kunden je Pfandart, Korrekturbuchungen */
export function DepositAccountCard({ customer }: { customer: Customer }) {
  const depositTypes = useDepositTypes();
  const [editType, setEditType] = useState<string | null>(null);
  const rows = Object.entries(customer.depositBalance)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty, type: depositTypes.find((d) => d.id === id) }))
    .sort((a, b) => b.qty - a.qty);
  const total = depositValue(customer.depositBalance, depositTypes);

  return (
    <FormSection
      title="Leergut-Konto"
      subtitle={total.count ? `${total.count} Gebinde · ${formatEuro(total.value)} Pfand` : 'Kein Leergut beim Kunden'}
      icon={Recycle}
      action={
        <Button size="sm" variant="secondary" icon={SlidersHorizontal} onClick={() => setEditType('')}>
          Buchen
        </Button>
      }
    >
      {rows.length ? (
        <ul className="-my-2 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <PackageOpen size={17} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-snug text-slate-900">{r.type?.shortName ?? r.id}</p>
                <p className="text-xs text-slate-500">je {formatEuro(r.type?.amount ?? 0)} · gesamt {formatEuro((r.type?.amount ?? 0) * r.qty)}</p>
              </div>
              <span className="text-lg font-bold tabular-nums text-slate-900">{r.qty}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditType(r.id)} aria-label={`${r.type?.shortName ?? r.id} korrigieren`}>
                Korrigieren
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Der Kunde hat derzeit kein Leergut von uns. Gelieferte Mehrweg-Gebinde werden automatisch gebucht.</p>
      )}
      <AdjustDepositModal customer={customer} typeId={editType} onClose={() => setEditType(null)} />
    </FormSection>
  );
}
