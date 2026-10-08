/**
 * Anmeldung, Registrierung, Geschäftskunden-Antrag, Sitzungen.
 */
import { ApiError, type CoreHandlers, type Ctx } from '../../api';
import type { Customer, Session } from '../../types';
import type { Engine } from '../engine';
import { nextId, type StoredUser } from '../db';
import { normalizeAddressInput, resolveAddress } from '../addresses';
import { notifyAdmin } from '../notify';
import { EMAIL_RE, publicUser, randomToken } from '../util';
import { demoUsers } from './system';
import { DEMO_USER_INFO } from '../seed/people';
import { SEGMENT_LABEL } from '../../format';

const SEGMENTS = Object.keys(SEGMENT_LABEL);

export function createSession(e: Engine, user: StoredUser): Session {
  let token = randomToken(32);
  while (e.db.sessions[token]) token = randomToken(32);
  e.db.sessions[token] = user.id;
  return { token, user: publicUser(user) };
}

function normEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function requireText(v: unknown, message: string, max = 120): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new ApiError('validation', message);
  return s.slice(0, max);
}

function checkNewCredentials(e: Engine, email: string, password: unknown): string {
  if (!EMAIL_RE.test(email)) throw new ApiError('validation', 'Bitte geben Sie eine gültige E-Mail-Adresse an.');
  if (typeof password !== 'string' || password.length < 6) {
    throw new ApiError('validation', 'Das Passwort muss mindestens 6 Zeichen lang sein.');
  }
  if (e.db.users.some((u) => u.email.toLowerCase() === email)) {
    throw new ApiError('conflict', 'Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an.');
  }
  return password;
}

export function authHandlers(
  e: Engine,
): Pick<CoreHandlers, 'getDemoUsers' | 'login' | 'demoLogin' | 'register' | 'requestBusinessAccount' | 'logout' | 'me'> {
  return {
    getDemoUsers() {
      return e.demoMode ? demoUsers(e) : [];
    },

    login(_ctx, email, password) {
      const mail = normEmail(email);
      const user = e.db.users.find((u) => u.email.toLowerCase() === mail);
      if (!user || typeof password !== 'string' || user.password !== password) {
        throw new ApiError('unauthorized', 'E-Mail-Adresse oder Passwort ist falsch.');
      }
      return createSession(e, user);
    },

    demoLogin(_ctx, userId) {
      if (!e.demoMode) throw new ApiError('forbidden', 'Die Demo-Anmeldung ist deaktiviert.');
      if (!DEMO_USER_INFO.some((d) => d.id === userId)) throw new ApiError('not_found', 'Diesen Demo-Zugang gibt es nicht.');
      const user = e.db.users.find((u) => u.id === userId);
      if (!user) throw new ApiError('not_found', 'Diesen Demo-Zugang gibt es nicht.');
      return createSession(e, user);
    },

    async register(ctx, input) {
      const name = requireText(input?.name, 'Bitte geben Sie Ihren Namen an.');
      const email = normEmail(input?.email);
      const password = checkNewCredentials(e, email, input?.password);
      const phone = typeof input?.phone === 'string' ? input.phone.trim().slice(0, 40) : '';
      const addrInput = input?.address ? normalizeAddressInput(input.address, { name, label: 'Zuhause' }) : undefined;
      const address = addrInput ? await resolveAddress(e, addrInput) : undefined;
      // nach dem await erneut prüfen (parallele Registrierung)
      if (e.db.users.some((u) => u.email.toLowerCase() === email)) {
        throw new ApiError('conflict', 'Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an.');
      }
      const iso = ctx.now.toISOString();
      const customer: Customer = {
        id: nextId(e.db, 'c'),
        type: 'b2c',
        name,
        contactName: name,
        email,
        phone,
        addresses: address ? [address] : [],
        favorites: [],
        loyaltyPoints: 0,
        depositBalance: {},
        createdAt: iso,
      };
      if (address) customer.defaultAddressId = address.id;
      const user: StoredUser = { id: nextId(e.db, 'u'), role: 'customer', name, email, customerId: customer.id, createdAt: iso, password };
      if (phone) user.phone = phone;
      e.db.customers.push(customer);
      e.db.users.push(user);
      notifyAdmin(e, { title: 'Neue Registrierung', body: `${name} hat ein Kundenkonto angelegt.`, kind: 'system', link: `/admin/kunden/${customer.id}` }, ctx.now);
      return createSession(e, user);
    },

    async requestBusinessAccount(ctx, input) {
      const companyName = requireText(input?.companyName, 'Bitte geben Sie den Firmennamen an.');
      const contactName = requireText(input?.contactName, 'Bitte geben Sie eine Ansprechperson an.');
      const phone = requireText(input?.phone, 'Bitte geben Sie eine Telefonnummer an.', 40);
      const email = normEmail(input?.email);
      const password = checkNewCredentials(e, email, input?.password);
      const segment = SEGMENTS.includes(input?.segment) ? input.segment : 'sonstiges';
      const addrInput = normalizeAddressInput(input?.address, { name: companyName, label: 'Firmensitz' });
      const address = await resolveAddress(e, addrInput);
      if (e.db.users.some((u) => u.email.toLowerCase() === email)) {
        throw new ApiError('conflict', 'Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an.');
      }
      const iso = ctx.now.toISOString();
      e.db.seq.customer += 1;
      const customer: Customer = {
        id: nextId(e.db, 'c'),
        type: 'b2b',
        name: companyName,
        contactName,
        email,
        phone,
        addresses: [address],
        defaultAddressId: address.id,
        favorites: [],
        loyaltyPoints: 0,
        depositBalance: {},
        createdAt: iso,
        b2b: {
          companyName,
          segment,
          customerNumber: `K-${e.db.seq.customer}`,
          priceGroup: 'standard',
          discountPercent: 0,
          paymentTermsDays: 14,
          creditLimit: 0,
          allowInvoice: false,
          freeDelivery: false,
          costCenters: [],
          status: 'pending',
        },
      };
      const vatId = typeof input?.vatId === 'string' ? input.vatId.trim().slice(0, 30) : '';
      if (vatId && customer.b2b) customer.b2b.vatId = vatId;
      const message = typeof input?.message === 'string' ? input.message.trim().slice(0, 1000) : '';
      if (message) customer.internalNote = `Nachricht zum Antrag: ${message}`;
      const user: StoredUser = { id: nextId(e.db, 'u'), role: 'business', name: contactName, email, phone, customerId: customer.id, createdAt: iso, password };
      e.db.customers.push(customer);
      e.db.users.push(user);
      notifyAdmin(
        e,
        {
          title: 'Neuer Geschäftskunden-Antrag',
          body: `${companyName} (${SEGMENT_LABEL[segment]}) möchte als Geschäftskunde bestellen – bitte Konditionen prüfen und freischalten.`,
          kind: 'system',
          link: `/admin/kunden/${customer.id}`,
        },
        ctx.now,
      );
      return createSession(e, user);
    },

    logout(ctx: Ctx) {
      if (ctx.token && e.db.sessions[ctx.token]) delete e.db.sessions[ctx.token];
    },

    me(ctx) {
      if (!ctx.user || !ctx.token) return null;
      return { token: ctx.token, user: ctx.user };
    },
  };
}
