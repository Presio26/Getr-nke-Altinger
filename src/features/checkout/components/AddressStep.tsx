import { Building2, Home, MapPin, Plus, ShoppingBag, Truck } from 'lucide-react';
import type { AddressInput, Customer, Quote } from '@shared/types';
import { formatEuro } from '@shared/format';
import { Badge, Button, Input, Notice, RadioCards, Select, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AddressAutocomplete } from './AddressAutocomplete';
import { FLOOR_OPTIONS, floorLabel, type AddressDraft, type AddressErrors } from '../lib/address';

export const NEW_ADDRESS = '__neu';

export interface AddressStepProps {
  customer: Customer;
  /** gewählte gespeicherte Adresse oder NEW_ADDRESS */
  value: string;
  onChange: (value: string) => void;
  draft: AddressDraft;
  onDraft: (patch: Partial<AddressDraft>) => void;
  errors: AddressErrors;
  quote: Quote | undefined;
  /** PLZ der aktuellen Auswahl ist bekannt (sonst keine Gebietsanzeige) */
  zipKnown: boolean;
  onSwitchToPickup: () => void;
}

const businessLike = /büro|firma|gast|café|cafe|restaurant|verein|hotel|laden|lager|praxis|kanzlei|werk/i;

/** Zone, Gebühr, Mindestbestellwert des gewählten Liefergebiets */
function ZoneStrip({ quote }: { quote: Quote }) {
  const z = quote.zone;
  if (!z) return null;
  const free = quote.totals.deliveryFee === 0;
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-brand-50/70 p-3.5 text-sm ring-1 ring-inset ring-brand-100 sm:grid-cols-3">
      <div className="col-span-2 flex items-center gap-2.5 sm:col-span-1">
        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: z.color }} aria-hidden />
        <span className="min-w-0">
          <span className="block text-xs font-medium text-slate-500">Liefergebiet</span>
          <span className="block truncate font-semibold text-slate-900">{z.name}</span>
        </span>
      </div>
      <div className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">Liefergebühr</span>
        <span className={cn('block font-semibold', free ? 'text-emerald-700' : 'text-slate-900')}>
          {free ? 'kostenlos' : formatEuro(quote.totals.deliveryFee)}
          {!free && z.freeFrom ? <span className="font-normal text-slate-500"> · frei ab {formatEuro(z.freeFrom)}</span> : null}
        </span>
      </div>
      <div className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">Mindestbestellwert</span>
        <span className={cn('block font-semibold', quote.missingForMinOrder > 0 ? 'text-red-700' : 'text-slate-900')}>
          {formatEuro(z.minOrder)}
          {quote.missingForMinOrder > 0 ? <span className="font-normal"> · noch {formatEuro(quote.missingForMinOrder)}</span> : null}
        </span>
      </div>
    </div>
  );
}

/** Schritt Lieferadresse: gespeicherte Adressen oder neue Adresse mit Autovervollständigung */
export function AddressStep({ customer, value, onChange, draft, onDraft, errors, quote, zipKnown, onSwitchToPickup }: AddressStepProps) {
  const isNew = value === NEW_ADDRESS;
  const zoneError = zipKnown ? quote?.errors.find((e) => e.code === 'zone') : undefined;
  const addressError = quote?.errors.find((e) => e.code === 'address');

  const options = [
    ...customer.addresses.map((a) => ({
      value: a.id,
      icon: businessLike.test(a.label) || customer.type === 'b2b' ? Building2 : Home,
      title: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {a.label}
          {a.id === customer.defaultAddressId ? <Badge tone="brand">Standard</Badge> : null}
        </span>
      ),
      description: (
        <>
          {a.name ? <span className="block">{a.name}</span> : null}
          <span className="block">
            {a.street}, {a.zip} {a.city}
          </span>
          {floorLabel(a) ? <span className="block text-slate-400">{floorLabel(a)}</span> : null}
        </>
      ),
    })),
    {
      value: NEW_ADDRESS,
      icon: Plus,
      title: 'Neue Adresse',
      description: 'Lieferadresse eingeben – wird in Ihrem Konto gespeichert.',
    },
  ];

  const pick = (a: AddressInput) => {
    onDraft({
      street: a.street || draft.street,
      zip: a.zip || draft.zip,
      city: a.city || draft.city,
      lat: a.lat,
      lng: a.lng,
    });
  };

  return (
    <div>
      <RadioCards name="kasse-adresse" aria-label="Lieferadresse wählen" value={value} onChange={onChange} options={options} columns={2} />

      {isNew ? (
        <div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <AddressAutocomplete onPick={pick} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name auf dem Lieferschein"
              value={draft.name}
              onChange={(e) => onDraft({ name: e.target.value })}
              autoComplete="name"
              error={errors.name}
              required
            />
            <Input
              label="Bezeichnung"
              value={draft.label}
              onChange={(e) => onDraft({ label: e.target.value })}
              placeholder="z. B. Zuhause, Büro, Eltern"
              maxLength={40}
            />
            <Input
              label="Straße und Hausnummer"
              value={draft.street}
              onChange={(e) => onDraft({ street: e.target.value, lat: undefined, lng: undefined })}
              autoComplete="street-address"
              error={errors.street}
              containerClassName="sm:col-span-2"
              required
            />
            <Input
              label="PLZ"
              value={draft.zip}
              onChange={(e) => onDraft({ zip: e.target.value.replace(/\D/g, '').slice(0, 5), lat: undefined, lng: undefined })}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              error={errors.zip}
              required
            />
            <Input
              label="Ort"
              value={draft.city}
              onChange={(e) => onDraft({ city: e.target.value })}
              autoComplete="address-level2"
              error={errors.city}
              required
            />
            <Select label="Etage" options={FLOOR_OPTIONS} value={draft.floor} onChange={(e) => onDraft({ floor: e.target.value })} />
            <div className="flex items-end">
              <Switch
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5"
                checked={draft.hasElevator}
                onChange={(v) => onDraft({ hasElevator: v })}
                label="Aufzug vorhanden"
                disabled={!(Number(draft.floor) > 0)}
              />
            </div>
            <Textarea
              label="Hinweis für den Fahrer"
              value={draft.notes}
              onChange={(e) => onDraft({ notes: e.target.value })}
              placeholder="z. B. Hinterhof, Klingel Berger, Leergut steht in der Garage"
              maxLength={300}
              rows={2}
              containerClassName="sm:col-span-2"
            />
          </div>
        </div>
      ) : null}

      {zoneError ? (
        <Notice
          tone="danger"
          icon={MapPin}
          className="mt-4"
          title="Diese Adresse liegt außerhalb unseres Liefergebiets"
          action={
            <Button size="sm" variant="outline" icon={ShoppingBag} onClick={onSwitchToPickup}>
              Im Markt abholen
            </Button>
          }
        >
          {zoneError.message}
        </Notice>
      ) : addressError && !isNew ? (
        <Notice tone="danger" className="mt-4">
          {addressError.message}
        </Notice>
      ) : quote?.zone && zipKnown ? (
        <ZoneStrip quote={quote} />
      ) : isNew && !zipKnown ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Truck size={16} aria-hidden className="shrink-0 text-slate-400" />
          Sobald Sie die PLZ eingeben, zeigen wir Liefergebiet, Gebühr und Mindestbestellwert.
        </p>
      ) : null}
    </div>
  );
}
