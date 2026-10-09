import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, FilePlus2, Package, Receipt, Repeat, ShoppingBag, Truck, UserRound } from 'lucide-react';
import type { Customer, Invoice, Order, Subscription, User } from '@shared/types';
import { FULFILLMENT_LABEL, INTERVAL_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, WEEKDAY_LABEL, formatDate, formatEuro, formatSlot } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation, useProductMap } from '@/api/hooks';
import { ROLE_LABEL } from '@/lib/roles';
import { Badge, Button, Card, EmptyState, Money, OrderStatusBadge, Tabs } from '@/components/ui';
import { isBillable } from '../lib';
import { InvoiceStatusBadge, MarkPaidButton, PrintInvoiceButton, dueText } from '../invoices/invoiceUi';

type TabId = 'orders' | 'invoices' | 'subs' | 'users';

const PAGE = 8;

function OrdersTab({ orders }: { orders: Order[] }) {
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  if (!orders.length) return <EmptyState icon={ShoppingBag} title="Noch keine Bestellungen" description="Sobald der Kunde bestellt, erscheinen die Bestellungen hier." />;
  const shown = all ? orders : orders.slice(0, PAGE);
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {shown.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => navigate(`/admin/bestellungen/${encodeURIComponent(o.id)}`)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                {o.fulfillment === 'delivery' ? <Truck size={18} aria-hidden /> : <ShoppingBag size={18} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-slate-900">{o.number}</span>
                  <OrderStatusBadge status={o.status} fulfillment={o.fulfillment} />
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {FULFILLMENT_LABEL[o.fulfillment]} · {formatSlot(o.slot)} · {o.lines.reduce((s, l) => s + l.qty, 0)} Gebinde
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money cents={o.totals.total} className="font-semibold text-slate-900" />
                <p className="text-xs text-slate-500">
                  {PAYMENT_METHOD_LABEL[o.paymentMethod]} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {orders.length > PAGE ? (
        <div className="border-t border-slate-100 px-4 py-3 text-center sm:px-5">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? 'Weniger anzeigen' : `Alle ${orders.length} Bestellungen anzeigen`}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function InvoicesTab({ customer, invoices, orders }: { customer: Customer; invoices: Invoice[]; orders: Order[] }) {
  const billable = orders.filter(isBillable);
  const billableSum = billable.reduce((s, o) => s + o.totals.total, 0);
  const create = useApiMutation(() => api.adminCreateInvoice(customer.id), {
    invalidate: [qk.admin],
    success: (inv) => `Rechnung ${inv.number} über ${formatEuro(inv.gross)} erstellt`,
  });
  const isB2B = customer.type === 'b2b';
  return (
    <>
      {isB2B ? (
        <div className="p-4 sm:p-5">
          {billable.length ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <FilePlus2 size={20} aria-hidden className="mt-px shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {billable.length} {billable.length === 1 ? 'Lieferung ist' : 'Lieferungen sind'} noch nicht abgerechnet
                  </p>
                  <p className="mt-0.5 opacity-90">
                    {formatEuro(billableSum)} auf Rechnung/SEPA · {billable.map((o) => o.number).join(', ')}
                  </p>
                </div>
              </div>
              <Button size="sm" icon={FilePlus2} onClick={() => create.mutate()} loading={create.isPending} className="self-start sm:self-center">
                Rechnung erstellen
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Alle gelieferten Rechnungs-Bestellungen sind abgerechnet.</p>
          )}
        </div>
      ) : null}
      {invoices.length ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap font-semibold text-slate-900">{inv.number}</span>
                  <InvoiceStatusBadge status={inv.status} />
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  vom {formatDate(inv.date, 'short')} · {inv.orderIds.length} {inv.orderIds.length === 1 ? 'Lieferung' : 'Lieferungen'} ·{' '}
                  <span className={inv.status === 'overdue' ? 'font-medium text-red-600' : undefined}>{dueText(inv)}</span>
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Money cents={inv.gross} className="text-[15px] font-semibold text-slate-900 sm:min-w-24 sm:text-right" />
                <div className="flex items-center gap-1">
                  <MarkPaidButton invoice={inv} />
                  <PrintInvoiceButton invoice={inv} compact />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Receipt} title="Noch keine Rechnungen" description={isB2B ? 'Rechnungen fassen gelieferte Bestellungen auf Rechnung zusammen.' : 'Privatkunden zahlen bei Lieferung oder online.'} />
      )}
    </>
  );
}

function SubscriptionsTab({ subscriptions }: { subscriptions: Subscription[] }) {
  const products = useProductMap();
  if (!subscriptions.length) return <EmptyState icon={Repeat} title="Keine Abos oder Daueraufträge" description="Der Kunde hat keine regelmäßigen Lieferungen eingerichtet." />;
  return (
    <ul className="divide-y divide-slate-100">
      {subscriptions.map((s) => (
        <li key={s.id} className="flex gap-3 px-4 py-4 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Repeat size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{s.name}</span>
              <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Aktiv' : 'Pausiert'}</Badge>
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              {INTERVAL_LABEL[s.interval].replace(/^./, (c) => c.toUpperCase())} · {WEEKDAY_LABEL[s.weekday]} ab {s.slotStart} Uhr · {PAYMENT_METHOD_LABEL[s.paymentMethod]}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {s.items.map((i) => {
                const p = products.get(i.productId);
                return `${i.qty} × ${p ? `${p.brand} ${p.name}` : i.productId}`;
              }).join(' · ')}
            </p>
          </div>
          <div className="shrink-0 text-right text-sm">
            <p className="flex items-center justify-end gap-1 text-slate-500">
              <CalendarClock size={14} aria-hidden /> nächste
            </p>
            <p className="font-semibold text-slate-900">{formatDate(s.nextDate, 'relative')}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UsersTab({ users }: { users: User[] }) {
  if (!users.length) return <EmptyState icon={UserRound} title="Kein App-Zugang" description="Der Kunde ist nur im Markt angelegt und hat (noch) kein Benutzerkonto in der App." />;
  return (
    <ul className="divide-y divide-slate-100">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <UserRound size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{u.name}</p>
            <p className="truncate text-sm text-slate-500">{u.email}</p>
          </div>
          <div className="shrink-0 text-right">
            <Badge tone={u.role === 'business' ? 'brand' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
            <p className="mt-1 text-xs text-slate-500">seit {formatDate(u.createdAt, 'short')}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Bestellungen, Rechnungen, Abos und Nutzer eines Kunden */
export function CustomerActivity({
  customer,
  orders,
  invoices,
  subscriptions,
  users,
}: {
  customer: Customer;
  orders: Order[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  users: User[];
}) {
  const billableCount = useMemo(() => orders.filter(isBillable).length, [orders]);
  const [tab, setTab] = useState<TabId>(() => (customer.type === 'b2b' && billableCount ? 'invoices' : 'orders'));
  const tabs = [
    { id: 'orders', label: 'Bestellungen', count: orders.length, icon: Package },
    ...(customer.type === 'b2b' || invoices.length ? [{ id: 'invoices', label: 'Rechnungen', count: invoices.length, icon: Receipt }] : []),
    { id: 'subs', label: customer.type === 'b2b' ? 'Daueraufträge' : 'Abos', count: subscriptions.length, icon: Repeat },
    { id: 'users', label: 'Nutzer', count: users.length, icon: UserRound },
  ];
  return (
    <Card padding="none" className="overflow-hidden">
      <Tabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} className="px-2 sm:px-3" aria-label="Kundenaktivität" />
      {tab === 'orders' ? <OrdersTab orders={orders} /> : null}
      {tab === 'invoices' ? <InvoicesTab customer={customer} invoices={invoices} orders={orders} /> : null}
      {tab === 'subs' ? <SubscriptionsTab subscriptions={subscriptions} /> : null}
      {tab === 'users' ? <UsersTab users={users} /> : null}
    </Card>
  );
}

