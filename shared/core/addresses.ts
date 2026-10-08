/**
 * Adressen prüfen und mit Koordinaten versehen (Geocoding mit PLZ-Fallback).
 */
import { ApiError } from '../api';
import type { Address, AddressInput } from '../types';
import type { Engine } from './engine';
import { nextId } from './db';
import { plzInfo } from './geo';
import { safeGeocode } from './routing';
import { ZIP_RE } from './util';

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Pflichtfelder prüfen und Texte bereinigen (ohne Koordinaten) */
export function normalizeAddressInput(input: AddressInput | undefined | null, defaults: { name?: string; label?: string } = {}): AddressInput {
  if (!input || typeof input !== 'object') throw new ApiError('validation', 'Bitte geben Sie eine Adresse an.');
  const street = str(input.street);
  const zip = str(input.zip, 5);
  const city = str(input.city) || plzInfo(zip)?.city || '';
  if (!street) throw new ApiError('validation', 'Bitte geben Sie Straße und Hausnummer an.');
  if (!ZIP_RE.test(zip)) throw new ApiError('validation', 'Bitte geben Sie eine gültige fünfstellige PLZ an.');
  if (!city) throw new ApiError('validation', 'Bitte geben Sie den Ort an.');
  const out: AddressInput = {
    label: str(input.label, 40) || defaults.label || 'Adresse',
    name: str(input.name) || defaults.name || '',
    street,
    zip,
    city,
  };
  if (input.id) out.id = String(input.id);
  const notes = str(input.notes, 300);
  if (notes) out.notes = notes;
  if (input.floor !== undefined && input.floor !== null) {
    const floor = Number(input.floor);
    if (!Number.isInteger(floor) || floor < -2 || floor > 30) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Stockwerk an.');
    out.floor = floor;
  }
  if (input.hasElevator !== undefined) out.hasElevator = !!input.hasElevator;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (input.lat !== undefined && input.lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    out.lat = lat;
    out.lng = lng;
  }
  return out;
}

/**
 * Vollständige Adresse inkl. Koordinaten. Fehlen lat/lng (oder hat sich die Anschrift
 * gegenüber `previous` geändert), wird geocodiert; Fallback PLZ-Zentrum, sonst Markt.
 */
export async function resolveAddress(e: Engine, input: AddressInput, previous?: Address): Promise<Address> {
  let lat = input.lat;
  let lng = input.lng;
  const moved = previous && (previous.street !== input.street || previous.zip !== input.zip || previous.city !== input.city);
  if (lat === undefined || lng === undefined) {
    if (previous && !moved) {
      lat = previous.lat;
      lng = previous.lng;
    } else {
      const p = await safeGeocode(e.geocoder, { street: input.street, zip: input.zip, city: input.city });
      lat = p?.lat ?? e.db.settings.location.lat;
      lng = p?.lng ?? e.db.settings.location.lng;
    }
  }
  const address: Address = {
    id: input.id ?? previous?.id ?? nextId(e.db, 'a'),
    label: input.label,
    name: input.name,
    street: input.street,
    zip: input.zip,
    city: input.city,
    lat,
    lng,
  };
  if (input.notes) address.notes = input.notes;
  if (input.floor !== undefined) address.floor = input.floor;
  if (input.hasElevator !== undefined) address.hasElevator = input.hasElevator;
  return address;
}
