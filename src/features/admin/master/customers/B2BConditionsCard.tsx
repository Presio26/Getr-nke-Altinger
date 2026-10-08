import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Ban, Briefcase, Clock, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import type { BusinessInfo, BusinessSegment, Customer, PriceGroup } from '@shared/types';
import { formatEuro, PRICE_GROUP_LABEL, SEGMENT_LABEL } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Badge, Button, Input, Notice, SegmentedControl, Select, Switch } from '@/components/ui';
import { cn } from '@/lib/cn';
import { euroInput, formatPercent, parseDecimalInput, parseEuro, parseIntInput } from '../lib';
import { EuroField, FormSection } from '../ui';

interface Draft {
  companyName: string;
  segment: BusinessSegment;
  vatId: string;
  priceGroup: PriceGroup;
  discount: string;
  terms: string;
  limit: string;
  allowInvoice: boolean;
  freeDelivery: boolean;
  status: BusinessInfo['status'];
  manager: string;
}

function toDraft(b: BusinessInfo): Draft {
  return {
    companyName: b.companyName,
    segment: b.segment,
    vatId: b.vatId ?? '',
    priceGroup: b.priceGroup,
    discount: String(b.discountPercent).replace('.', ','),
    terms: String(b.paymentTermsDays),
    limit: euroInput(b.creditLimit),
    allowInvoice: b.allowInvoice,
    freeDelivery: b.freeDelivery,
    status: b.status,
    manager: b.accountManager ?? '',
  };
}

/** B2B-Konditionen bearbeiten (Preisgruppe, Rabatt, Zahlungsziel, Kreditlimit, Rechnung, frei Haus, Status) */
export function B2BConditionsCard({ customer, openAmount }: { customer: Customer; openAmount: number }) {
  const b = customer.b2b!;
  const serverDraft = useMemo(() => toDraft(b), [b]);
  const [draft, setDraft] = useState<Draft>(serverDraft);
  const [showErrors, setShowErrors] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(serverDraft);

  // Server-Stand übernehmen, solange nichts bearbeitet wird (Echtzeit-Aktualisierung)
  const serverKey = JSON.stringify(serverDraft);
  const [lastServerKey, setLastServerKey] = useState(serverKey);
  useEffect(() => {
    if (serverKey === lastServerKey) return;
    setLastServerKey(serverKey);
    if (!dirty) setDraft(serverDraft);
  }, [serverKey, lastServerKey, dirty, serverDraft]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const pct = parseDecimalInput(draft.discount);
  const days = parseIntInput(draft.terms);
  const credit = parseEuro(draft.limit);
  const errors = {
    companyName: !draft.companyName.trim() ? 'Bitte den Firmennamen angeben.' : undefined,
    discount: pct === null || pct < 0 || pct > 50 ? 'Zwischen 0 und 50 %.' : undefined,
    terms: days === null || days < 0 || days > 120 ? 'Zwischen 0 und 120 Tagen.' : undefined,
    limit: credit === null || credit < 0 ? 'Bitte einen gültigen Betrag angeben.' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);

  const save = useApiMutation((c: Customer) => api.adminSaveCustomer(c), {
    invalidate: [qk.admin],
    success: (c) =>
      c.b2b?.status !== b.status
        ? c.b2b?.status === 'active'
          ? `${c.name} ist freigeschaltet`
          : c.b2b?.status === 'blocked'
            ? `${c.name} wurde gesperrt`
            : 'Konditionen gespeichert'
        : 'Konditionen gespeichert',
    onSuccess: (c) => {
      setShowErrors(false);
      if (c.b2b) setDraft(toDraft(c.b2b));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!valid) return;
    save.mutate({
      ...customer,
      b2b: {
        ...b,
        companyName: draft.companyName.trim(),
        segment: draft.segment,
        vatId: draft.vatId.trim() || undefined,
        priceGroup: draft.priceGroup,
        discountPercent: pct ?? 0,
        paymentTermsDays: days ?? 14,
        creditLimit: credit ?? 0,
        allowInvoice: draft.allowInvoice,
        freeDelivery: draft.freeDelivery,
        status: draft.status,
        accountManager: draft.manager.trim() || undefined,
      },
    });
  };

  const usage = b.creditLimit > 0 ? Math.min(100, (openAmount / b.creditLimit) * 100) : 0;

  return (
    <FormSection
      title="Geschäftskunden-Konditionen"
      subtitle={`Kundennummer ${b.customerNumber}`}
      icon={Briefcase}
      action={dirty ? <Badge tone="warning">Nicht gespeichert</Badge> : undefined}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Kontostatus</p>
          <SegmentedControl
            block
            aria-label="Kontostatus"
            value={draft.status}
            onChange={(v) => set('status', v as Draft['status'])}
            options={[
              { value: 'pending', label: 'Antrag', icon: Clock },
              { value: 'active', label: 'Aktiv', icon: ShieldCheck },
              { value: 'blocked', label: 'Gesperrt', icon: Ban },
            ]}
          />
          {draft.status !== b.status ? (
            <Notice tone={draft.status === 'blocked' ? 'danger' : draft.status === 'active' ? 'success' : 'info'} className="mt-3">
              {draft.status === 'active'
                ? 'Beim Speichern wird das Konto freigeschaltet und der Kunde benachrichtigt.'
                : draft.status === 'blocked'
                  ? 'Beim Speichern wird das Konto gesperrt: keine Geschäftskundenpreise und kein Kauf auf Rechnung mehr. Der Kunde wird benachrichtigt.'
                  : 'Das Konto wird wieder als „Antrag offen“ geführt.'}
            </Notice>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Firmenname" value={draft.companyName} onChange={(e) => set('companyName', e.target.value)} error={showErrors ? errors.companyName : undefined} maxLength={120} />
          <Select label="Branche" value={draft.segment} onChange={(e) => set('segment', e.target.value as BusinessSegment)} options={Object.entries(SEGMENT_LABEL).map(([value, label]) => ({ value, label }))} />
          <Input label="USt-IdNr." value={draft.vatId} onChange={(e) => set('vatId', e.target.value)} placeholder="DE123456789" maxLength={30} />
          <Input label="Ansprechpartner im Markt" value={draft.manager} onChange={(e) => set('manager', e.target.value)} placeholder="z. B. Herr Altinger" maxLength={80} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Preisgruppe" value={draft.priceGroup} onChange={(e) => set('priceGroup', e.target.value as PriceGroup)} options={Object.entries(PRICE_GROUP_LABEL).map(([value, label]) => ({ value, label }))} />
          <Input label="Rabatt" inputMode="decimal" suffix="%" value={draft.discount} onChange={(e) => set('discount', e.target.value)} error={showErrors ? errors.discount : undefined} />
          <Input label="Zahlungsziel" inputMode="numeric" suffix="Tage" value={draft.terms} onChange={(e) => set('terms', e.target.value.replace(/[^\d]/g, ''))} error={showErrors ? errors.terms : undefined} />
          <EuroField label="Kreditlimit" value={draft.limit} onChange={(e) => set('limit', e.target.value)} error={showErrors ? errors.limit : undefined} />
        </div>

        {b.creditLimit > 0 ? (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">Auslastung Kreditlimit</span>
              <span className="tabular-nums text-slate-600">
                {formatEuro(openAmount)} von {formatEuro(b.creditLimit)} ({formatPercent(usage)})
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage)} aria-label="Auslastung Kreditlimit">
              <div
                className={cn('h-full rounded-full transition-[width]', usage >= 90 ? 'bg-red-500' : usage >= 70 ? 'bg-amber-400' : 'bg-emerald-500')}
                style={{ width: `${Math.max(usage, openAmount > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
          <Switch checked={draft.allowInvoice} onChange={(v) => set('allowInvoice', v)} label="Kauf auf Rechnung erlaubt" description="Zahlart Rechnung und SEPA-Lastschrift an der Kasse." className="py-2" />
          <Switch checked={draft.freeDelivery} onChange={(v) => set('freeDelivery', v)} label="Lieferung immer frei Haus" description="Keine Liefergebühr unabhängig vom Bestellwert." className="py-2" />
        </div>

        {b.costCenters.length ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Kostenstellen (pflegt der Kunde)</p>
            <div className="flex flex-wrap gap-1.5">
              {b.costCenters.map((c) => (
                <Badge key={c} tone="neutral">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" icon={RotateCcw} disabled={!dirty || save.isPending} onClick={() => setDraft(serverDraft)}>
            Zurücksetzen
          </Button>
          <Button type="submit" icon={Save} loading={save.isPending} disabled={!dirty}>
            Konditionen speichern
          </Button>
        </div>
      </form>
    </FormSection>
  );
}
