import { useEffect, useState, type FormEvent } from 'react';
import { Building2, MapPin, MessageSquareText, ShieldCheck } from 'lucide-react';
import type { Customer, PriceGroup } from '@shared/types';
import { PRICE_GROUP_LABEL, SEGMENT_LABEL } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Button, Input, Modal, Select, Switch } from '@/components/ui';
import { euroInput, parseDecimalInput, parseEuro, parseIntInput } from '../lib';
import { EuroField } from '../ui';
import { defaultAddress } from './customerUi';

const GROUP_DEFAULTS: Record<PriceGroup, { discount: number; terms: number; limit: number }> = {
  standard: { discount: 0, terms: 14, limit: 100000 },
  gastro: { discount: 6, terms: 14, limit: 300000 },
  gastro_plus: { discount: 9, terms: 21, limit: 500000 },
  verein: { discount: 5, terms: 14, limit: 150000 },
};

/** Geschäftskunden-Antrag prüfen und mit Konditionen freischalten */
export function ActivateBusinessModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [group, setGroup] = useState<PriceGroup>('standard');
  const [discount, setDiscount] = useState('0');
  const [terms, setTerms] = useState('14');
  const [limit, setLimit] = useState('1000,00');
  const [allowInvoice, setAllowInvoice] = useState(true);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [manager, setManager] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!customer?.b2b) return;
    const b = customer.b2b;
    const preset: PriceGroup = b.segment === 'gastronomie' || b.segment === 'hotel' ? 'gastro' : b.segment === 'verein' ? 'verein' : b.priceGroup;
    const d = GROUP_DEFAULTS[preset];
    setGroup(preset);
    setDiscount(String(b.discountPercent || d.discount).replace('.', ','));
    setTerms(String(b.paymentTermsDays || d.terms));
    setLimit(euroInput(b.creditLimit || d.limit));
    setAllowInvoice(true);
    setFreeDelivery(b.freeDelivery);
    setManager(b.accountManager ?? 'Marktleitung');
    setShowErrors(false);
  }, [customer?.id]);

  const pickGroup = (g: PriceGroup) => {
    setGroup(g);
    const d = GROUP_DEFAULTS[g];
    setDiscount(String(d.discount));
    setTerms(String(d.terms));
    setLimit(euroInput(d.limit));
  };

  const pct = parseDecimalInput(discount);
  const days = parseIntInput(terms);
  const credit = parseEuro(limit);
  const errors = {
    discount: pct === null || pct < 0 || pct > 50 ? 'Rabatt zwischen 0 und 50 %.' : undefined,
    terms: days === null || days < 0 || days > 120 ? 'Zahlungsziel zwischen 0 und 120 Tagen.' : undefined,
    limit: credit === null || credit < 0 ? 'Bitte einen gültigen Betrag angeben.' : undefined,
  };
  const valid = !errors.discount && !errors.terms && !errors.limit;

  const save = useApiMutation((c: Customer) => api.adminSaveCustomer(c), {
    invalidate: [qk.admin],
    success: (c) => `${c.name} ist als Geschäftskunde freigeschaltet`,
    onSuccess: () => onClose(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!customer?.b2b || !valid) return;
    save.mutate({
      ...customer,
      b2b: {
        ...customer.b2b,
        priceGroup: group,
        discountPercent: pct ?? 0,
        paymentTermsDays: days ?? 14,
        creditLimit: credit ?? 0,
        allowInvoice,
        freeDelivery,
        accountManager: manager.trim() || undefined,
        status: 'active',
      },
    });
  };

  const b = customer?.b2b;
  const addr = customer ? defaultAddress(customer) : undefined;
  const note = customer?.internalNote?.startsWith('Nachricht zum Antrag:') ? customer.internalNote.replace('Nachricht zum Antrag:', '').trim() : null;

  return (
    <Modal
      open={!!customer}
      onClose={onClose}
      size="lg"
      title="Geschäftskunden freischalten"
      description="Prüfen Sie den Antrag und legen Sie die Konditionen fest. Der Kunde wird sofort benachrichtigt."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" form="activate-b2b" variant="success" icon={ShieldCheck} loading={save.isPending}>
            Freischalten
          </Button>
        </>
      }
    >
      {customer && b ? (
        <form id="activate-b2b" onSubmit={submit} noValidate className="space-y-5">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-inset ring-slate-200/70">
            <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Building2 size={18} aria-hidden className="text-brand-700" />
              {b.companyName}
            </p>
            <p className="mt-1 text-slate-600">
              {SEGMENT_LABEL[b.segment]} · Kundennr. {b.customerNumber}
              {b.vatId ? ` · USt-IdNr. ${b.vatId}` : ''}
            </p>
            <p className="mt-1 text-slate-600">
              {customer.contactName} · {customer.email} · {customer.phone}
            </p>
            {addr ? (
              <p className="mt-1 flex items-center gap-1.5 text-slate-600">
                <MapPin size={14} aria-hidden /> {addr.street}, {addr.zip} {addr.city}
              </p>
            ) : null}
            {note ? (
              <p className="mt-3 flex gap-2 rounded-xl bg-white p-3 text-slate-700 ring-1 ring-inset ring-slate-200">
                <MessageSquareText size={16} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
                <span>„{note}“</span>
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Preisgruppe"
              value={group}
              onChange={(e) => pickGroup(e.target.value as PriceGroup)}
              options={Object.entries(PRICE_GROUP_LABEL).map(([value, label]) => ({ value, label }))}
              hint="Setzt passende Standardwerte."
            />
            <Input label="Rabatt auf Netto-Listenpreise" inputMode="decimal" suffix="%" value={discount} onChange={(e) => setDiscount(e.target.value)} error={showErrors ? errors.discount : undefined} />
            <Input label="Zahlungsziel" inputMode="numeric" suffix="Tage" value={terms} onChange={(e) => setTerms(e.target.value.replace(/[^\d]/g, ''))} error={showErrors ? errors.terms : undefined} />
            <EuroField label="Kreditlimit" value={limit} onChange={(e) => setLimit(e.target.value)} error={showErrors ? errors.limit : undefined} />
            <Input label="Ansprechpartner im Markt" value={manager} onChange={(e) => setManager(e.target.value)} containerClassName="sm:col-span-2" maxLength={80} />
          </div>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
            <Switch checked={allowInvoice} onChange={setAllowInvoice} label="Kauf auf Rechnung erlauben" description="Zusätzlich Rechnung und SEPA-Lastschrift an der Kasse." className="py-2" />
            <Switch checked={freeDelivery} onChange={setFreeDelivery} label="Immer frei Haus liefern" description="Keine Liefergebühr unabhängig vom Bestellwert." className="py-2" />
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
