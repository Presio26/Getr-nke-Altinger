/**
 * Rechnungen (B2B): Liste, Detail, Erstellung, Zahlungseingang.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { Invoice } from '../../types';
import { addDays, todayString } from '../../time';
import { formatDate, formatEuro } from '../../format';
import type { Engine } from '../engine';
import { nextId } from '../db';
import { findCustomer, findInvoice, requireAdmin, requireUser } from '../access';
import { billableOrders, invoiceNumber, invoiceTotals, withInvoiceStatus } from '../invoices';
import { emitInvoice, emitOrder, notifyCustomer } from '../notify';
import { visibleCustomer } from './customer';

export function invoiceHandlers(
  e: Engine,
): Pick<CoreHandlers, 'listMyInvoices' | 'getInvoice' | 'adminListInvoices' | 'adminCreateInvoice' | 'adminMarkInvoicePaid'> {
  return {
    listMyInvoices(ctx) {
      const user = requireUser(ctx);
      if (user.role !== 'business' && user.role !== 'customer') return [];
      return e.db.invoices
        .filter((i) => i.customerId === user.customerId)
        .map((i) => withInvoiceStatus(i, ctx.now))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
    },

    getInvoice(ctx, invoiceId) {
      const user = requireUser(ctx);
      const invoice = findInvoice(e, invoiceId);
      const isAdmin = user.role === 'admin';
      if (!isAdmin && invoice.customerId !== user.customerId) throw new ApiError('not_found', 'Die Rechnung wurde nicht gefunden.');
      const customer = findCustomer(e, invoice.customerId);
      const orders = invoice.orderIds
        .map((id) => e.db.orders.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => !!o);
      return {
        invoice: withInvoiceStatus(invoice, ctx.now),
        orders,
        customer: isAdmin ? customer : visibleCustomer(customer),
        settings: e.db.settings,
      };
    },

    adminListInvoices(ctx) {
      requireAdmin(ctx);
      return e.db.invoices
        .map((i) => withInvoiceStatus(i, ctx.now))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
    },

    adminCreateInvoice(ctx, customerId) {
      requireAdmin(ctx);
      const customer = findCustomer(e, customerId);
      if (customer.type !== 'b2b' || !customer.b2b) throw new ApiError('validation', 'Rechnungen gibt es nur für Geschäftskunden.');
      const orders = billableOrders(e.db, customer.id);
      if (!orders.length) {
        throw new ApiError('validation', 'Für diesen Kunden gibt es keine gelieferten, noch nicht abgerechneten Bestellungen auf Rechnung.');
      }
      const today = todayString(ctx.now);
      e.db.seq.invoice += 1;
      const invoice: Invoice = {
        id: nextId(e.db, 'inv'),
        number: invoiceNumber(today.slice(0, 4), e.db.seq.invoice),
        customerId: customer.id,
        customerName: customer.name,
        orderIds: orders.map((o) => o.id),
        date: today,
        dueDate: addDays(today, Math.max(0, customer.b2b.paymentTermsDays)),
        ...invoiceTotals(orders),
        status: 'open',
      };
      e.db.invoices.push(invoice);
      for (const o of orders) {
        o.invoiceId = invoice.id;
        o.paymentStatus = 'invoiced';
        o.updatedAt = ctx.now.toISOString();
        emitOrder(e, o);
      }
      const shown = withInvoiceStatus(invoice, ctx.now);
      emitInvoice(e, shown);
      notifyCustomer(
        e,
        customer.id,
        {
          title: `Neue Rechnung ${invoice.number}`,
          body: `${orders.length} Lieferung${orders.length === 1 ? '' : 'en'}, ${formatEuro(invoice.gross)} – zahlbar bis ${formatDate(invoice.dueDate, 'short')}.`,
          kind: 'invoice',
          link: `/business/rechnungen/${invoice.id}`,
        },
        ctx.now,
      );
      return shown;
    },

    adminMarkInvoicePaid(ctx, invoiceId) {
      requireAdmin(ctx);
      const invoice = findInvoice(e, invoiceId);
      if (invoice.status !== 'paid') {
        invoice.status = 'paid';
        invoice.paidAt = ctx.now.toISOString();
        for (const id of invoice.orderIds) {
          const o = e.db.orders.find((x) => x.id === id);
          if (!o) continue;
          o.paymentStatus = 'paid';
          o.updatedAt = ctx.now.toISOString();
          emitOrder(e, o);
        }
      }
      const shown = withInvoiceStatus(invoice, ctx.now);
      emitInvoice(e, shown);
      return shown;
    },
  };
}
