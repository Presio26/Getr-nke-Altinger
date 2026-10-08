import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Percent, Plus, Ticket, Trash2 } from 'lucide-react';
import type { Coupon } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { todayString } from '@shared/time';
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, Input, Modal, SegmentedControl, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { euroInput, parseEuro, parseIntInput } from '../lib';
import { EuroField, FormSection } from '../ui';
import type { SectionProps } from './GeneralSections';

function valueText(c: Coupon) {
  return c.type === 'percent' ? `${c.value} %` : formatEuro(c.value);
}

interface CouponForm {
  code: string;
  description: string;
  type: 'percent' | 'fixed';
  value: string;
  minOrder: string;
  validUntil: string;
  b2cOnly: boolean;
  active: boolean;
}

function toForm(c: Coupon | null): CouponForm {
  if (!c) return { code: '', description: '', type: 'percent', value: '10', minOrder: '20,00', validUntil: '', b2cOnly: false, active: true };
  return {
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.type === 'percent' ? String(c.value) : euroInput(c.value),
    minOrder: c.minOrder ? euroInput(c.minOrder) : '',
    validUntil: c.validUntil ?? '',
    b2cOnly: !!c.b2cOnly,
    active: c.active,
  };
}

function CouponModal({
  open,
  coupon,
  existingCodes,
  onClose,
  onApply,
  onRemove,
}: {
  open: boolean;
  coupon: Coupon | null;
  existingCodes: string[];
  onClose: () => void;
  onApply: (c: Coupon) => void;
  onRemove: () => void;
}) {
  const [f, setF] = useState<CouponForm>(toForm(coupon));
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (open) {
      setF(toForm(coupon));
      setShow(false);
    }
  }, [open, coupon]);
  const set = <K extends keyof CouponForm>(k: K, val: CouponForm[K]) => setF((x) => ({ ...x, [k]: val }));

  const code = f.code.trim().toUpperCase();
  const value = f.type === 'percent' ? parseIntInput(f.value) : parseEuro(f.value);
  const min = f.minOrder.trim() ? parseEuro(f.minOrder) : 0;
  const errors = {
    code: !/^[A-Z0-9-]{3,30}$/.test(code)
      ? '3–30 Zeichen: A–Z, 0–9 und Bindestrich.'
      : existingCodes.includes(code) && code !== coupon?.code
        ? 'Diesen Code gibt es bereits.'
        : undefined,
    value: value === null || value <= 0 || (f.type === 'percent' && value > 100) ? (f.type === 'percent' ? 'Prozent von 1 bis 100.' : 'Bitte einen gültigen Betrag angeben.') : undefined,
    minOrder: min === null || min < 0 ? 'Bitte einen gültigen Betrag angeben.' : undefined,
    validUntil: f.validUntil && f.validUntil < todayString() && f.validUntil !== coupon?.validUntil ? 'Das Datum liegt in der Vergangenheit.' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (!valid || value === null) return;
    const out: Coupon = { code, description: f.description.trim(), type: f.type, value, active: f.active };
    if (min) out.minOrder = min;
    if (f.validUntil) out.validUntil = f.validUntil;
    if (f.b2cOnly) out.b2cOnly = true;
    onApply(out);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={coupon ? `Gutschein ${coupon.code} bearbeiten` : 'Gutschein anlegen'}
      description="Wird mit „Einstellungen speichern“ für alle Kunden wirksam."
      footer={
        <>
          {coupon ? (
            <Button variant="ghost" icon={Trash2} onClick={onRemove} className="text-red-700 hover:bg-red-50 hover:text-red-800 sm:mr-auto">
              Löschen
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" form="coupon-form">
            Übernehmen
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={submit} noValidate className="space-y-4">
        <Input
          label="Code"
          required
          value={f.code}
          onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
          error={show ? errors.code : undefined}
          className="font-mono uppercase tracking-wider"
          placeholder="z. B. SOMMER10"
          maxLength={30}
          autoFocus={!coupon}
        />
        <Textarea label="Beschreibung (für Kunden sichtbar)" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={200} placeholder="z. B. 10 % Rabatt ab 20 € Warenwert" />
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Art des Rabatts</p>
          <SegmentedControl
            block
            aria-label="Art des Rabatts"
            value={f.type}
            onChange={(t) => {
              set('type', t as CouponForm['type']);
              set('value', t === 'percent' ? '10' : '5,00');
            }}
            options={[
              { value: 'percent', label: 'Prozent', icon: Percent },
              { value: 'fixed', label: 'Festbetrag' },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {f.type === 'percent' ? (
            <Input label="Rabatt" required inputMode="numeric" suffix="%" value={f.value} onChange={(e) => set('value', e.target.value.replace(/[^\d]/g, ''))} error={show ? errors.value : undefined} />
          ) : (
            <EuroField label="Rabatt" required value={f.value} onChange={(e) => set('value', e.target.value)} error={show ? errors.value : undefined} />
          )}
          <EuroField label="Mindestwarenwert" value={f.minOrder} onChange={(e) => set('minOrder', e.target.value)} error={show ? errors.minOrder : undefined} hint="leer = ohne Mindestwert" />
          <Input label="Gültig bis (optional)" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} error={show ? errors.validUntil : undefined} />
        </div>
        <Checkbox label="Nur für Privatkunden" description="Geschäftskunden können den Code nicht einlösen." checked={f.b2cOnly} onChange={(e) => set('b2cOnly', e.target.checked)} />
        <Switch checked={f.active} onChange={(a) => set('active', a)} label="Aktiv" description="Deaktivierte Gutscheine können nicht eingelöst werden." />
      </form>
    </Modal>
  );
}

/** Gutscheine anlegen, bearbeiten, deaktivieren */
export function CouponsSection({ draft, update }: SectionProps) {
  const [editing, setEditing] = useState<{ coupon: Coupon | null; index: number } | null>(null);
  const today = todayString();
  const coupons = draft.coupons;

  const apply = (c: Coupon) => {
    update((d) => {
      const list = [...d.coupons];
      if (editing && editing.index >= 0) list[editing.index] = c;
      else list.push(c);
      return { ...d, coupons: list };
    });
    setEditing(null);
  };
  const setActive = (i: number, active: boolean) => update((d) => ({ ...d, coupons: d.coupons.map((c, j) => (j === i ? { ...c, active } : c)) }));

  return (
    <FormSection
      title="Gutscheine"
      subtitle="Rabattcodes für die Kasse"
      icon={Ticket}
      action={
        <Button size="sm" icon={Plus} onClick={() => setEditing({ coupon: null, index: -1 })}>
          Gutschein anlegen
        </Button>
      }
    >
      {coupons.length ? (
        <ul className="-my-2 divide-y divide-slate-100">
          {coupons.map((c, i) => {
            const expired = !!c.validUntil && c.validUntil < today;
            return (
              <li key={`${c.code}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className={cn('flex h-12 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed text-sm font-bold tabular-nums', c.active && !expired ? 'border-accent-400 bg-accent-50 text-accent-800' : 'border-slate-300 bg-slate-50 text-slate-500')}>
                  {valueText(c)}
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[15px] font-bold tracking-wider text-slate-900">{c.code}</span>
                    {c.b2cOnly ? <Badge tone="neutral">nur Privat</Badge> : null}
                    {expired ? <Badge tone="danger">abgelaufen</Badge> : !c.active ? <Badge tone="neutral">inaktiv</Badge> : null}
                  </p>
                  <p className="truncate text-sm text-slate-600">{c.description || '–'}</p>
                  <p className="text-xs text-slate-500">
                    {c.minOrder ? `ab ${formatEuro(c.minOrder)} Warenwert` : 'ohne Mindestwert'}
                    {c.validUntil ? ` · gültig bis ${formatDate(c.validUntil, 'short')}` : ' · unbefristet'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.active} onChange={(a) => setActive(i, a)} ariaLabel={`Gutschein ${c.code} ${c.active ? 'deaktivieren' : 'aktivieren'}`} />
                  <IconButton icon={Pencil} label={`Gutschein ${c.code} bearbeiten`} onClick={() => setEditing({ coupon: c, index: i })} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card padding="none" className="shadow-none">
          <EmptyState icon={Ticket} title="Noch keine Gutscheine" description="Legen Sie z. B. einen Willkommensrabatt für Neukunden an." />
        </Card>
      )}
      <CouponModal
        open={!!editing}
        coupon={editing?.coupon ?? null}
        existingCodes={coupons.map((c) => c.code)}
        onClose={() => setEditing(null)}
        onApply={apply}
        onRemove={() => {
          if (editing && editing.index >= 0) update((d) => ({ ...d, coupons: d.coupons.filter((_, j) => j !== editing.index) }));
          setEditing(null);
        }}
      />
    </FormSection>
  );
}
