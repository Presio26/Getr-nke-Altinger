import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MapPin, MapPinOff, Save, Search } from 'lucide-react';
import type { Address, AddressInput } from '@shared/types';
import { formatEuro } from '@shared/format';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { useDebouncedValue, useClickOutside } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { BaseMap, HomeMarker, StoreMarker } from '@/components/map';
import { Button, Checkbox, Input, Modal, Notice, Select, Switch, Textarea } from '@/components/ui';

const NOTE_CHIPS = ['Rampe Hintereingang', 'Anlieferung ab 7 Uhr', 'Bitte vorher anrufen', 'Kellerabgang links', 'Leergut steht im Hof', 'Lastenaufzug vorhanden'];

const FLOORS = [
  { value: '', label: 'keine Angabe' },
  { value: '-1', label: 'Keller / Untergeschoss' },
  { value: '0', label: 'Erdgeschoss' },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}. Obergeschoss` })),
];

export interface AddressFormValue {
  input: AddressInput;
  makeDefault: boolean;
}

export interface AddressFormModalProps {
  open: boolean;
  onClose: () => void;
  /** vorhandene Adresse bearbeiten (sonst neu) */
  address?: Address | null;
  /** Vorgabe für den Empfänger (Firmenname) */
  defaultName: string;
  isDefault: boolean;
  saving: boolean;
  onSave: (value: AddressFormValue) => void;
}

type Field = 'label' | 'street' | 'zip' | 'city';

/** Lieferstandort anlegen/bearbeiten – mit Adresssuche (api.searchAddress) und Liefergebiets-Prüfung */
export function AddressFormModal({ open, onClose, address, defaultName, isDefault, saving, onSave }: AddressFormModalProps) {
  const [form, setForm] = useState({ label: '', name: '', street: '', zip: '', city: '', notes: '', floor: '', hasElevator: false });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [search, setSearch] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      label: address?.label ?? '',
      name: address?.name ?? defaultName,
      street: address?.street ?? '',
      zip: address?.zip ?? '',
      city: address?.city ?? '',
      notes: address?.notes ?? '',
      floor: address?.floor !== undefined ? String(address.floor) : '',
      hasElevator: !!address?.hasElevator,
    });
    setCoords(address ? { lat: address.lat, lng: address.lng } : null);
    setMakeDefault(false);
    setErrors({});
    setSearch('');
    setSuggestOpen(false);
  }, [open, address, defaultName]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'street' || key === 'zip' || key === 'city') setCoords(null);
    if (errors[key as Field]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Adresssuche (Geocoding, entprellt)
  const term = useDebouncedValue(search.trim(), 350);
  const suggestions = useQuery({
    queryKey: qk.addressSearch(term),
    queryFn: () => api.searchAddress(term),
    enabled: open && term.length >= 3,
    staleTime: 5 * 60_000,
  });
  const suggestRef = useClickOutside<HTMLDivElement>(() => setSuggestOpen(false), suggestOpen);

  // Liefergebiet zur PLZ
  const zipValid = /^\d{5}$/.test(form.zip.trim());
  const zone = useQuery({
    queryKey: qk.zip(form.zip.trim()),
    queryFn: () => api.checkZip(form.zip.trim()),
    enabled: open && zipValid,
    staleTime: 10 * 60_000,
  });

  const pick = (s: AddressInput) => {
    setForm((f) => ({ ...f, street: s.street || f.street, zip: s.zip || f.zip, city: s.city || f.city }));
    setCoords(s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng } : null);
    setErrors({});
    setSearch('');
    setSuggestOpen(false);
  };

  const addChip = (chip: string) => {
    const current = form.notes.trim();
    if (current.toLowerCase().includes(chip.toLowerCase())) return;
    set('notes', (current ? `${current}, ${chip}` : chip).slice(0, 300));
  };

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (!form.label.trim()) e.label = 'Bitte geben Sie eine Bezeichnung an, z. B. „Biergarten“.';
    if (!form.street.trim()) e.street = 'Bitte Straße und Hausnummer angeben.';
    else if (!/\d/.test(form.street)) e.street = 'Bitte ergänzen Sie die Hausnummer.';
    if (!/^\d{5}$/.test(form.zip.trim())) e.zip = '5-stellige PLZ';
    if (!form.city.trim()) e.city = 'Bitte den Ort angeben.';
    return e;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const input: AddressInput = {
      label: form.label.trim(),
      name: form.name.trim() || defaultName,
      street: form.street.trim(),
      zip: form.zip.trim(),
      city: form.city.trim(),
    };
    if (address?.id) input.id = address.id;
    if (form.notes.trim()) input.notes = form.notes.trim();
    if (form.floor !== '') {
      input.floor = Number(form.floor);
      input.hasElevator = form.hasElevator;
    }
    if (coords) {
      input.lat = coords.lat;
      input.lng = coords.lng;
    }
    onSave({ input, makeDefault: makeDefault && !isDefault });
  };

  const results = suggestions.data ?? [];
  const mapPoint = useMemo(() => (coords ? ([coords.lat, coords.lng] as [number, number]) : null), [coords]);

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title={address ? `Standort „${address.label}“ bearbeiten` : 'Neuen Lieferstandort anlegen'}
      description="Adresse suchen oder direkt eintragen – Anlieferhinweise sieht der Fahrer auf seiner Tour."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form="address-form" icon={Save} loading={saving}>
            {address ? 'Änderungen speichern' : 'Standort speichern'}
          </Button>
        </>
      }
    >
      <form id="address-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Bezeichnung" required placeholder="z. B. Biergarten, Lager, Filiale" value={form.label} maxLength={40} onChange={(e) => set('label', e.target.value)} error={errors.label} />
          <Input label="Empfänger auf dem Lieferschein" placeholder={defaultName} value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
        </div>

        {/* Adresssuche */}
        <div ref={suggestRef} className="relative">
          <Input
            label="Adresse suchen"
            icon={Search}
            placeholder="Straße, Hausnummer, Ort …"
            value={search}
            autoComplete="off"
            onChange={(e) => {
              setSearch(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (results[0]) pick(results[0]);
              }
              if (e.key === 'Escape') setSuggestOpen(false);
            }}
            suffix={suggestions.isFetching ? <Loader2 size={16} className="animate-spin text-slate-400" aria-label="Suche läuft" /> : null}
            hint="Vorschläge übernehmen Straße, PLZ, Ort und Kartenposition."
          />
          {suggestOpen && search.trim().length >= 3 && term === search.trim() && !suggestions.isFetching ? (
            <ul className="absolute inset-x-0 top-[4.75rem] z-20 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-pop animate-fade-in" role="listbox">
              {results.length ? (
                results.slice(0, 6).map((s, i) => (
                  <li key={`${s.street}-${s.zip}-${i}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(s)}
                      className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50"
                    >
                      <MapPin size={17} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{s.street || 'Ohne Straße'}</span>
                        <span className="block truncate text-sm text-slate-500">
                          {s.zip} {s.city}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-sm text-slate-500">
                  {suggestions.isError ? 'Die Adresssuche ist gerade nicht erreichbar – bitte tragen Sie die Adresse direkt ein.' : 'Keine passende Adresse gefunden.'}
                </li>
              )}
            </ul>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
          <Input label="Straße und Hausnummer" required autoComplete="street-address" value={form.street} onChange={(e) => set('street', e.target.value)} error={errors.street} />
          <Input
            label="PLZ"
            required
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={form.zip}
            onChange={(e) => set('zip', e.target.value.replace(/\D/g, '').slice(0, 5))}
            error={errors.zip}
          />
          <Input label="Ort" required autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} error={errors.city} />
        </div>

        {zipValid ? (
          zone.isLoading ? null : zone.data ? (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 size={16} aria-hidden className="shrink-0" />
              <span>
                Liefergebiet <strong>{zone.data.name}</strong> · Mindestbestellwert {formatEuro(zone.data.minOrder)}
              </span>
            </p>
          ) : (
            <Notice tone="warning" icon={MapPinOff} className="p-3">
              Die PLZ {form.zip} liegt außerhalb unseres Liefergebiets. Sie können den Standort trotzdem speichern – Bestellungen sind dorthin nur zur Abholung möglich.
            </Notice>
          )
        ) : null}

        {mapPoint ? (
          <div className="h-36 overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <BaseMap center={mapPoint} zoom={16} static zoomControl={false} fitTo={[mapPoint]} maxFitZoom={16}>
              <StoreMarker />
              <HomeMarker position={{ lat: mapPoint[0], lng: mapPoint[1] }} color="#1d58a0" />
            </BaseMap>
          </div>
        ) : null}

        <div>
          <Textarea
            label="Anlieferhinweise für den Fahrer"
            placeholder="z. B. Rampe Hintereingang, Anlieferung ab 7 Uhr, Leergut steht im Hof"
            value={form.notes}
            maxLength={300}
            rows={3}
            onChange={(e) => set('notes', e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {NOTE_CHIPS.map((chip) => {
              const active = form.notes.toLowerCase().includes(chip.toLowerCase());
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => addChip(chip)}
                  disabled={active}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors',
                    active ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  + {chip}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
          <Select label="Stockwerk" value={form.floor} onChange={(e) => set('floor', e.target.value)} options={FLOORS} />
          {form.floor !== '' && Number(form.floor) !== 0 ? (
            <Switch checked={form.hasElevator} onChange={(v) => set('hasElevator', v)} label="Aufzug vorhanden" description="Wichtig für schwere Kästen und Fässer" />
          ) : (
            <span className="hidden sm:block" />
          )}
        </div>

        {!isDefault ? (
          <Checkbox
            label="Als Standard-Lieferadresse verwenden"
            description="Wird an der Kasse und in der Schnellbestellung vorausgewählt."
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
        ) : null}
      </form>
    </Modal>
  );
}
