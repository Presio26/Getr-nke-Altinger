import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Info, Loader2, MapPin, MapPinned, Save, Search, User, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address, AddressInput, Customer } from '@shared/types';
import { plzInfo } from '@shared/core/geo';
import { api } from '@/api/client';
import { qk, useSettings } from '@/api/hooks';
import { useDebouncedValue } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { BaseMap, HomeMarker } from '@/components/map';
import { Button, Checkbox, Input, Modal, Select, Textarea, errorMessage, toast } from '@/components/ui';
import { FLOOR_OPTIONS, zoneHint } from '../lib/helpers';

const LABEL_PRESETS = ['Zuhause', 'Büro', 'Eltern', 'Ferienwohnung', 'Vereinsheim', 'Gaststätte'];

interface Coords {
  lat: number;
  lng: number;
  /** Anschrift, zu der die Koordinaten gehören */
  key: string;
}

const addrKey = (street: string, zip: string, city: string) => `${street.trim().toLowerCase()}|${zip.trim()}|${city.trim().toLowerCase()}`;

export interface AddressFormModalProps {
  customer: Customer;
  /** zu bearbeitende Adresse; ohne = neue Adresse */
  address?: Address | null;
  open: boolean;
  onClose: () => void;
}

/** Adresse anlegen/bearbeiten – mit Adresssuche (Autovervollständigung), Etage, Aufzug und Fahrerhinweis */
export function AddressFormModal({ customer, address, open, onClose }: AddressFormModalProps) {
  const settings = useSettings();
  const qc = useQueryClient();
  const isNew = !address;
  const [label, setLabel] = useState(address?.label ?? (customer.addresses.length ? '' : customer.type === 'b2b' ? 'Firma' : 'Zuhause'));
  const [name, setName] = useState(address?.name ?? (customer.type === 'b2b' ? customer.name : customer.contactName || customer.name));
  const [street, setStreet] = useState(address?.street ?? '');
  const [zip, setZip] = useState(address?.zip ?? '');
  const [city, setCity] = useState(address?.city ?? '');
  const [floor, setFloor] = useState(address?.floor !== undefined ? String(address.floor) : '');
  const [elevator, setElevator] = useState(!!address?.hasElevator);
  const [notes, setNotes] = useState(address?.notes ?? '');
  const [makeDefault, setMakeDefault] = useState(isNew ? customer.addresses.length === 0 : customer.defaultAddressId === address?.id);
  const [coords, setCoords] = useState<Coords | null>(address ? { lat: address.lat, lng: address.lng, key: addrKey(address.street, address.zip, address.city) } : null);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'street' | 'zip' | 'city' | 'label', string>>>({});
  const [busy, setBusy] = useState(false);

  // Ort aus PLZ ergänzen
  useEffect(() => {
    if (/^\d{5}$/.test(zip) && !city.trim()) {
      const info = plzInfo(zip);
      if (info) setCity(info.city);
    }
  }, [zip, city]);

  const debounced = useDebouncedValue(query.trim(), 350);
  const search = useQuery({
    queryKey: qk.addressSearch(debounced),
    queryFn: () => api.searchAddress(debounced),
    enabled: debounced.length >= 3,
    staleTime: 5 * 60_000,
  });
  const searching = query.trim().length >= 3 && (debounced !== query.trim() || search.isFetching);
  const suggestions = debounced.length >= 3 ? (search.data ?? []) : [];

  const pick = (s: AddressInput) => {
    setStreet(s.street);
    setZip(s.zip);
    setCity(s.city);
    if (s.lat !== undefined && s.lng !== undefined) setCoords({ lat: s.lat, lng: s.lng, key: addrKey(s.street, s.zip, s.city) });
    setQuery('');
    setErrors({});
  };

  const currentKey = addrKey(street, zip, city);
  const validCoords = coords && coords.key === currentKey ? coords : null;
  const hint = /^\d{5}$/.test(zip) ? zoneHint(settings, zip, !!customer.b2b?.freeDelivery && customer.b2b.status === 'active') : null;
  const fitTo = useMemo<[number, number][] | undefined>(
    () => (validCoords ? [[validCoords.lat, validCoords.lng]] : undefined),
    // bewusst nur bei geänderten Koordinaten neu berechnen
    [validCoords?.lat, validCoords?.lng],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!street.trim()) next.street = 'Bitte geben Sie Straße und Hausnummer an.';
    else if (!/\d/.test(street)) next.street = 'Bitte ergänzen Sie die Hausnummer.';
    if (!/^\d{5}$/.test(zip.trim())) next.zip = 'Bitte eine 5-stellige PLZ angeben.';
    if (!city.trim()) next.city = 'Bitte den Ort angeben.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const input: AddressInput = {
      label: label.trim() || 'Adresse',
      name: name.trim(),
      street: street.trim(),
      zip: zip.trim(),
      city: city.trim(),
    };
    if (address) input.id = address.id;
    if (notes.trim()) input.notes = notes.trim();
    if (floor !== '') {
      input.floor = Number(floor);
      input.hasElevator = Number(floor) > 0 ? elevator : false;
    }
    if (validCoords) {
      input.lat = validCoords.lat;
      input.lng = validCoords.lng;
    }
    setBusy(true);
    try {
      const before = new Set(customer.addresses.map((a) => a.id));
      let updated = await api.saveAddress(input);
      const savedId = address?.id ?? updated.addresses.find((a) => !before.has(a.id))?.id;
      if (makeDefault && savedId && updated.defaultAddressId !== savedId) {
        updated = await api.updateMyCustomer({ defaultAddressId: savedId });
      }
      qc.setQueryData(qk.customer, updated);
      toast.success(isNew ? 'Adresse gespeichert.' : 'Adresse aktualisiert.', {
        description: `${input.street}, ${input.zip} ${input.city}`,
      });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const floorNum = floor === '' ? null : Number(floor);

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="lg"
      title={isNew ? 'Neue Adresse' : 'Adresse bearbeiten'}
      description="Suchen Sie Ihre Anschrift – wir übernehmen Straße, PLZ, Ort und die genaue Lage für den Fahrer."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" form="address-form" icon={Save} loading={busy}>
            {isNew ? 'Adresse speichern' : 'Änderungen speichern'}
          </Button>
        </>
      }
    >
      <form id="address-form" onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
        {/* Adresssuche */}
        <div className="rounded-2xl bg-brand-50/60 p-3 ring-1 ring-inset ring-brand-100 sm:p-4">
          <Input
            label="Adresse suchen"
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z. B. Mühlgasse 6, Garching"
            autoComplete="off"
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions[0]) pick(suggestions[0]);
              }
            }}
            suffix={
              searching ? (
                <Loader2 size={18} className="animate-spin text-brand-600" aria-label="Suche läuft" />
              ) : query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Suche leeren" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={16} aria-hidden />
                </button>
              ) : null
            }
            data-autofocus={isNew ? true : undefined}
          />
          {query.trim().length >= 3 && !searching ? (
            suggestions.length ? (
              <ul role="listbox" aria-label="Vorschläge" className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {suggestions.map((s, i) => {
                  const z = zoneHint(settings, s.zip);
                  return (
                    <li key={`${s.street}-${s.zip}-${i}`} className="border-b border-slate-100 last:border-0">
                      <button type="button" role="option" aria-selected={false} onClick={() => pick(s)} className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-slate-50">
                        <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-slate-900">{s.street}</span>
                          <span className="block truncate text-sm text-slate-500">
                            {s.zip} {s.city}
                          </span>
                        </span>
                        <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', z.inArea ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>
                          {z.zone ? z.zone.name : 'nur Abholung'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : search.isError ? (
              <p className="mt-2 text-sm text-red-600">Die Adresssuche ist gerade nicht erreichbar – bitte tragen Sie die Adresse unten ein.</p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Keine Treffer – bitte tragen Sie die Adresse unten von Hand ein.</p>
            )
          ) : (
            <p className="mt-2 text-xs text-slate-500">Mindestens 3 Zeichen eingeben. Sie können die Felder auch direkt ausfüllen.</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <Input label="Bezeichnung" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Zuhause" maxLength={40} />
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Vorschläge für die Bezeichnung">
              {LABEL_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLabel(p)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[13px] font-semibold transition-colors',
                    label === p ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Input label="Name auf Klingel / Lieferschein" icon={User} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" containerClassName="sm:col-span-6" />
          <Input label="Straße und Hausnummer" icon={MapPin} value={street} onChange={(e) => setStreet(e.target.value)} error={errors.street} autoComplete="street-address" required containerClassName="sm:col-span-6" />
          <Input
            label="PLZ"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            error={errors.zip}
            required
            containerClassName="sm:col-span-2"
          />
          <Input label="Ort" value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} autoComplete="address-level2" required containerClassName="sm:col-span-4" />

          {hint ? (
            <p
              className={cn(
                'flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm sm:col-span-6',
                hint.inArea ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900',
              )}
            >
              {hint.inArea ? <CheckCircle2 size={17} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" /> : <Info size={17} aria-hidden className="mt-0.5 shrink-0 text-amber-600" />}
              <span>
                {hint.zone ? <strong className="font-semibold">Liefergebiet {hint.zone.name}: </strong> : null}
                {hint.text}
              </span>
            </p>
          ) : null}

          {validCoords && fitTo ? (
            <div className="relative h-44 overflow-hidden rounded-2xl ring-1 ring-slate-200 sm:col-span-6">
              <BaseMap static center={fitTo[0]} zoom={16} fitTo={fitTo} maxFitZoom={16} zoomControl={false}>
                <HomeMarker position={validCoords} label={label || 'Lieferadresse'} />
              </BaseMap>
              <span className="pointer-events-none absolute left-2 top-2 z-[400] inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                <MapPinned size={13} aria-hidden className="text-emerald-600" /> Lage für den Fahrer erkannt
              </span>
            </div>
          ) : null}

          <Select label="Stockwerk" options={FLOOR_OPTIONS} value={floor} onChange={(e) => setFloor(e.target.value)} containerClassName="sm:col-span-3" />
          <div className="flex items-end sm:col-span-3">
            <Checkbox
              label="Aufzug vorhanden"
              description={floorNum !== null && floorNum > 0 ? 'Wichtig für den Tragservice' : 'nur bei Obergeschossen'}
              checked={elevator && floorNum !== null && floorNum > 0}
              onChange={(e) => setElevator(e.target.checked)}
              disabled={floorNum === null || floorNum <= 0}
            />
          </div>
          <Textarea
            label="Hinweis für den Fahrer"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="z. B. Hinterhof, Klingel Berger – Kästen bitte vor die Kellertür"
            maxLength={300}
            containerClassName="sm:col-span-6"
          />
          <div className="sm:col-span-6">
            <Checkbox
              label="Als Standard-Lieferadresse verwenden"
              description="Wird an der Kasse und für neue Abos vorausgewählt."
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
              disabled={!isNew && customer.defaultAddressId === address?.id}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
