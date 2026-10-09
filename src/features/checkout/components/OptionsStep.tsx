import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Hash, PackageOpen, PartyPopper, Pencil, Plus, Recycle, type LucideIcon } from 'lucide-react';
import type { Address, Customer, DepositType, EmptiesLine, FulfillmentType, StoreSettings } from '@shared/types';
import { formatEuro } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { Button, Checkbox, Input, Select, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { EmptiesModal } from './EmptiesModal';
import { floorLabel } from '../lib/address';

export interface OptionsStepProps {
  fulfillment: FulfillmentType;
  customer: Customer;
  settings: StoreSettings;
  depositTypes: DepositType[];
  /** aktuell gewählte Lieferadresse (für Etagen-Hinweis beim Tragservice) */
  address?: Pick<Address, 'floor' | 'hasElevator'> | null;
  carryService: boolean;
  onCarry: (v: boolean) => void;
  empties: EmptiesLine[];
  onEmpties: (lines: EmptiesLine[]) => void;
  /** Meldungen der Preisberechnung zur Leergut-Rückgabe (z. B. Obergrenze laut Leergut-Konto) */
  emptiesErrors?: string[];
  /** Leihartikel oder Fass im Warenkorb */
  hasEventItems: boolean;
  /** Leihartikel im Warenkorb (Datum Pflicht) */
  hasRental: boolean;
  eventDate?: string;
  onEventDate: (v: string | undefined) => void;
  eventDateError?: string;
  commission: boolean;
  onCommission: (v: boolean) => void;
  notes: string;
  onNotes: (v: string) => void;
  reference: string;
  onReference: (v: string) => void;
  costCenter: string;
  onCostCenter: (v: string) => void;
}

function OptionRow({ icon: Icon, title, children, aside }: { icon: LucideIcon; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Icon size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <p className="pt-0.5 text-[15px] font-semibold text-slate-900">{title}</p>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Schritt Optionen: Tragservice, Leergut, Festbedarf, Hinweis, B2B-Angaben */
export function OptionsStep(p: OptionsStepProps) {
  const [emptiesOpen, setEmptiesOpen] = useState(false);
  const delivery = p.fulfillment === 'delivery';
  const b2b = p.customer.type === 'b2b';
  const costCenters = p.customer.b2b?.costCenters ?? [];
  const typeById = new Map(p.depositTypes.map((t) => [t.id, t]));
  const emptiesTotal = p.empties.reduce((s, l) => s + (typeById.get(l.depositTypeId)?.amount ?? 0) * l.qty, 0);
  const floor = p.address ? floorLabel(p.address) : null;

  return (
    <div className="divide-y divide-slate-100">
      {delivery ? (
        <div className="pb-4">
          <Switch
            checked={p.carryService}
            onChange={p.onCarry}
            label={
              <span className="flex flex-wrap items-center gap-x-2">
                Tragservice bis in die Wohnung
                <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-800">+{formatEuro(p.settings.carryServiceFee)}</span>
              </span>
            }
            description={
              <>
                Unser Fahrer trägt alle Kästen bis an Ihre Wohnungstür und nimmt das Leergut von dort mit.
                {floor ? <span className="mt-0.5 block font-medium text-slate-600">Ihre Adresse: {floor}</span> : null}
              </>
            }
          />
        </div>
      ) : null}

      <OptionRow
        icon={Recycle}
        title="Leergut-Rückgabe"
        aside={
          <Button size="sm" variant={p.empties.length ? 'ghost' : 'secondary'} icon={p.empties.length ? Pencil : Plus} onClick={() => setEmptiesOpen(true)}>
            {p.empties.length ? 'Bearbeiten' : 'Leergut angeben'}
          </Button>
        }
      >
        {p.empties.length ? (
          <div className="mt-2 rounded-xl bg-emerald-50/70 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-100">
            <ul className="space-y-0.5 text-sm text-slate-700">
              {p.empties.map((l) => (
                <li key={l.depositTypeId} className="flex justify-between gap-3">
                  <span>
                    <span className="font-semibold tabular-nums">{l.qty}×</span> {typeById.get(l.depositTypeId)?.shortName ?? l.depositTypeId}
                  </span>
                  <span className="tabular-nums text-emerald-700">{formatEuro(-(typeById.get(l.depositTypeId)?.amount ?? 0) * l.qty)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 border-t border-emerald-100 pt-1.5 text-sm font-semibold text-emerald-800">Gutschrift gesamt: {formatEuro(-emptiesTotal)}</p>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-slate-500">
            {delivery
              ? 'Leere Kästen, Fässer und lose Flaschen nimmt der Fahrer mit – das Pfand wird direkt verrechnet.'
              : 'Bringen Sie Ihr Leergut zur Abholung mit – wir verrechnen das Pfand direkt.'}
          </p>
        )}
        {p.emptiesErrors?.length ? (
          <div className="mt-2 space-y-1.5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">
            {p.emptiesErrors.map((m) => (
              <p key={m}>{m}</p>
            ))}
            <button type="button" onClick={() => setEmptiesOpen(true)} className="min-h-9 font-semibold underline underline-offset-2">
              Leergut anpassen
            </button>
          </div>
        ) : null}
      </OptionRow>

      {p.hasEventItems ? (
        <OptionRow icon={PartyPopper} title="Ihre Veranstaltung">
          <p className="mt-0.5 text-sm text-slate-500">
            {p.hasRental ? 'Für Leihartikel brauchen wir das Datum Ihres Festes, damit wir alles reservieren können.' : 'Fass bestellt? Sagen Sie uns, wann Ihr Fest ist.'}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              type="date"
              label="Datum der Veranstaltung"
              value={p.eventDate ?? ''}
              min={todayString()}
              max={addDays(todayString(), 365)}
              onChange={(e) => p.onEventDate(e.target.value || undefined)}
              error={p.eventDateError}
              required={p.hasRental}
            />
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-1">
            <Checkbox
              checked={p.commission}
              onChange={(e) => p.onCommission(e.target.checked)}
              label="Als Kommissionsware bestellen"
              description="Volle, ungeöffnete Kästen und Fässer nehmen wir nach dem Fest zurück und erstatten sie – ideal, wenn Sie noch nicht genau wissen, wie viel getrunken wird."
            />
          </div>
        </OptionRow>
      ) : null}

      <div className="py-4 last:pb-0">
        <Textarea
          label={delivery ? 'Hinweis an Markt und Fahrer' : 'Hinweis an den Markt'}
          value={p.notes}
          onChange={(e) => p.onNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={delivery ? 'z. B. Bitte im Hof abstellen, Leergut steht neben der Garage.' : 'z. B. Ich komme mit dem Lastenrad.'}
        />
      </div>

      {b2b ? (
        <div className={cn('grid gap-4 pt-4 sm:grid-cols-2')}>
          <Input
            label="Ihre Bestellreferenz"
            icon={Hash}
            value={p.reference}
            onChange={(e) => p.onReference(e.target.value)}
            maxLength={80}
            placeholder="z. B. PO-2026-114"
            hint="Erscheint auf Lieferschein und Rechnung."
          />
          {costCenters.length ? (
            <Select
              label="Kostenstelle"
              value={p.costCenter}
              onChange={(e) => p.onCostCenter(e.target.value)}
              options={[{ value: '', label: 'Keine Kostenstelle' }, ...costCenters.map((c) => ({ value: c, label: c }))]}
              hint="Für Ihre interne Zuordnung auf der Rechnung."
            />
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
              <PackageOpen size={16} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                Noch keine Kostenstellen angelegt.{' '}
                <Link to="/business/standorte" className="font-semibold text-brand-700 hover:text-brand-800">
                  Jetzt anlegen
                </Link>
              </span>
            </div>
          )}
        </div>
      ) : null}

      <EmptiesModal
        open={emptiesOpen}
        onClose={() => setEmptiesOpen(false)}
        value={p.empties}
        onSave={p.onEmpties}
        depositTypes={p.depositTypes}
        balance={p.customer.depositBalance}
      />
    </div>
  );
}
