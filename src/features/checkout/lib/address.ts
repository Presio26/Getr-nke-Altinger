import type { Address, AddressInput, Customer } from '@shared/types';

/** Formular-Zustand für eine neue Lieferadresse */
export interface AddressDraft {
  label: string;
  name: string;
  street: string;
  zip: string;
  city: string;
  /** '' = keine Angabe */
  floor: string;
  hasElevator: boolean;
  notes: string;
  lat?: number;
  lng?: number;
}

export type AddressErrors = Partial<Record<'name' | 'street' | 'zip' | 'city', string>>;

export function emptyDraft(customer?: Customer | null): AddressDraft {
  return {
    label: customer?.addresses.length ? 'Lieferadresse' : 'Zuhause',
    name: customer?.contactName || customer?.name || '',
    street: '',
    zip: '',
    city: '',
    floor: '',
    hasElevator: false,
    notes: '',
  };
}

export const ZIP_RE = /^\d{5}$/;

export function validateDraft(d: AddressDraft): AddressErrors {
  const e: AddressErrors = {};
  if (!d.name.trim()) e.name = 'Bitte geben Sie den Namen für den Lieferschein an.';
  if (!d.street.trim()) e.street = 'Bitte geben Sie Straße und Hausnummer an.';
  else if (!/\d/.test(d.street)) e.street = 'Bitte ergänzen Sie die Hausnummer.';
  if (!ZIP_RE.test(d.zip.trim())) e.zip = 'Bitte geben Sie eine fünfstellige PLZ an.';
  if (!d.city.trim()) e.city = 'Bitte geben Sie den Ort an.';
  return e;
}

export function draftToInput(d: AddressDraft): AddressInput {
  const input: AddressInput = {
    label: d.label.trim() || 'Lieferadresse',
    name: d.name.trim(),
    street: d.street.trim(),
    zip: d.zip.trim(),
    city: d.city.trim(),
  };
  if (d.notes.trim()) input.notes = d.notes.trim();
  if (d.floor !== '') {
    input.floor = Number(d.floor);
    if (Number(d.floor) > 0) input.hasElevator = d.hasElevator;
  }
  if (d.lat !== undefined && d.lng !== undefined) {
    input.lat = d.lat;
    input.lng = d.lng;
  }
  return input;
}

/** "1. Etage · ohne Aufzug" */
export function floorLabel(a: Pick<Address, 'floor' | 'hasElevator'>): string | null {
  if (a.floor === undefined || a.floor === null) return null;
  const f = a.floor === 0 ? 'Erdgeschoss' : a.floor < 0 ? 'Untergeschoss' : `${a.floor}. Etage`;
  if (a.floor <= 0 || a.hasElevator === undefined) return f;
  return `${f} · ${a.hasElevator ? 'mit Aufzug' : 'ohne Aufzug'}`;
}

export const FLOOR_OPTIONS = [
  { value: '', label: 'Keine Angabe' },
  { value: '-1', label: 'Untergeschoss / Keller' },
  { value: '0', label: 'Erdgeschoss' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}. Etage` })),
];
