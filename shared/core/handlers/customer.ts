/**
 * Kundenkonto: Stammdaten, Adressen, Favoriten, Kostenstellen.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { Customer } from '../../types';
import type { Engine } from '../engine';
import { findProduct, requireCustomer } from '../access';
import { normalizeAddressInput, resolveAddress } from '../addresses';
import { emitCustomer } from '../notify';

/** Kundensicht ohne interne Notiz des Markts */
export function visibleCustomer(c: Customer): Customer {
  const { internalNote: _n, ...rest } = c;
  void _n;
  return rest;
}

export function customerHandlers(
  e: Engine,
): Pick<CoreHandlers, 'getMyCustomer' | 'updateMyCustomer' | 'saveAddress' | 'deleteAddress' | 'toggleFavorite' | 'setCostCenters'> {
  return {
    getMyCustomer(ctx) {
      return visibleCustomer(requireCustomer(e, ctx).customer);
    },

    updateMyCustomer(ctx, patch) {
      const { customer } = requireCustomer(e, ctx);
      if (!patch || typeof patch !== 'object') throw new ApiError('validation', 'Keine Änderungen übergeben.');
      if (patch.name !== undefined) {
        const name = String(patch.name).trim();
        if (!name) throw new ApiError('validation', 'Der Name darf nicht leer sein.');
        customer.name = name.slice(0, 120);
        if (customer.b2b) customer.b2b.companyName = customer.name;
      }
      if (patch.contactName !== undefined) customer.contactName = String(patch.contactName).trim().slice(0, 120);
      if (patch.phone !== undefined) customer.phone = String(patch.phone).trim().slice(0, 40);
      if (patch.marketingOptIn !== undefined) customer.marketingOptIn = !!patch.marketingOptIn;
      if (patch.defaultAddressId !== undefined) {
        if (!customer.addresses.some((a) => a.id === patch.defaultAddressId)) {
          throw new ApiError('validation', 'Die gewählte Adresse wurde nicht gefunden.');
        }
        customer.defaultAddressId = patch.defaultAddressId;
      }
      emitCustomer(e, customer);
      return visibleCustomer(customer);
    },

    async saveAddress(ctx, input) {
      const { customer: before } = requireCustomer(e, ctx);
      const normalized = normalizeAddressInput(input, { name: before.contactName || before.name, label: 'Zuhause' });
      const previous = normalized.id ? before.addresses.find((a) => a.id === normalized.id) : undefined;
      if (normalized.id && !previous) throw new ApiError('not_found', 'Die Adresse wurde nicht gefunden.');
      const address = await resolveAddress(e, normalized, previous);
      // nach dem await: aktuellen Datensatz verwenden
      const customer = requireCustomer(e, ctx).customer;
      const idx = customer.addresses.findIndex((a) => a.id === address.id);
      if (idx >= 0) customer.addresses[idx] = address;
      else {
        if (customer.addresses.length >= 20) throw new ApiError('validation', 'Sie können höchstens 20 Adressen speichern.');
        customer.addresses.push(address);
      }
      if (!customer.defaultAddressId || !customer.addresses.some((a) => a.id === customer.defaultAddressId)) {
        customer.defaultAddressId = address.id;
      }
      emitCustomer(e, customer);
      return visibleCustomer(customer);
    },

    deleteAddress(ctx, addressId) {
      const { customer } = requireCustomer(e, ctx);
      const idx = customer.addresses.findIndex((a) => a.id === addressId);
      if (idx < 0) throw new ApiError('not_found', 'Die Adresse wurde nicht gefunden.');
      const usedBy = e.db.subscriptions.find((s) => s.customerId === customer.id && s.active && s.addressId === addressId);
      if (usedBy) throw new ApiError('conflict', `Diese Adresse wird noch vom Abo „${usedBy.name}“ verwendet.`);
      customer.addresses.splice(idx, 1);
      if (customer.defaultAddressId === addressId) {
        if (customer.addresses[0]) customer.defaultAddressId = customer.addresses[0].id;
        else delete customer.defaultAddressId;
      }
      emitCustomer(e, customer);
      return visibleCustomer(customer);
    },

    toggleFavorite(ctx, productId) {
      const { customer } = requireCustomer(e, ctx);
      findProduct(e, productId);
      const i = customer.favorites.indexOf(productId);
      if (i >= 0) customer.favorites.splice(i, 1);
      else customer.favorites.push(productId);
      emitCustomer(e, customer);
      return visibleCustomer(customer);
    },

    setCostCenters(ctx, costCenters) {
      const { customer } = requireCustomer(e, ctx);
      if (customer.type !== 'b2b' || !customer.b2b) throw new ApiError('forbidden', 'Kostenstellen gibt es nur für Geschäftskunden.');
      if (!Array.isArray(costCenters)) throw new ApiError('validation', 'Ungültige Kostenstellen.');
      const list = [...new Set(costCenters.map((c) => String(c ?? '').trim().slice(0, 60)).filter(Boolean))];
      if (list.length > 30) throw new ApiError('validation', 'Höchstens 30 Kostenstellen möglich.');
      customer.b2b.costCenters = list;
      emitCustomer(e, customer);
      return visibleCustomer(customer);
    },
  };
}
