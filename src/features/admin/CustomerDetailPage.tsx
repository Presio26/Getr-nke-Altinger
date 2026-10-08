import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CreditCard, Mail, Package, Phone, Receipt, ShieldCheck, ShoppingCart, Star, UserPlus, Wallet } from 'lucide-react';
import { formatDate, formatEuro, formatRelative } from '@shared/format';
import { useDepositTypes } from '@/api/hooks';
import { Avatar, ButtonLink, Card, ErrorState, Notice, PageHeader, Skeleton, StatCard, Button } from '@/components/ui';
import { customerFigures, emptyFigures, formatCount, formatPercent, useAdminCustomer } from './master/lib';
import { StatsSkeleton } from './master/ui';
import { CustomerTypeBadges } from './master/customers/customerUi';
import { B2BConditionsCard } from './master/customers/B2BConditionsCard';
import { DepositAccountCard } from './master/customers/DepositAccountCard';
import { AddressesCard, NoteCard, ProfileCard } from './master/customers/CustomerSideCards';
import { CustomerActivity } from './master/customers/CustomerActivity';
import { ActivateBusinessModal } from './master/customers/ActivateBusinessModal';

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const { data, isLoading, error, refetch } = useAdminCustomer(customerId);
  const depositTypes = useDepositTypes();
  const [activateOpen, setActivateOpen] = useState(false);

  const figures = useMemo(() => {
    if (!data) return emptyFigures();
    return customerFigures([data.customer], data.orders, data.invoices, depositTypes).get(data.customer.id) ?? emptyFigures();
  }, [data, depositTypes]);

  if (isLoading) {
    return (
      <>
        <div className="mb-7 flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <StatsSkeleton className="mb-6" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title="Kunde" back="/admin/kunden" />
        <Card>
          <ErrorState
            error={error ?? new Error('Der Kunde wurde nicht gefunden.')}
            onRetry={() => void refetch()}
            action={
              <ButtonLink to="/admin/kunden" variant="ghost">
                Zur Kundenliste
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  const { customer, orders, invoices, subscriptions, users } = data;
  const b2b = customer.b2b;
  const avg = figures.orders ? Math.round(figures.revenue / figures.orders) : 0;
  const ratings = orders.filter((o) => o.rating);
  const ratingAvg = ratings.length ? ratings.reduce((s, o) => s + (o.rating?.stars ?? 0), 0) / ratings.length : 0;

  return (
    <>
      <PageHeader
        back="/admin/kunden"
        documentTitle={`${customer.name} · Kunden`}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={customer.name} size="lg" className="hidden sm:inline-flex" />
            <span className="min-w-0">{customer.name}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:pl-[4.25rem]">
            <CustomerTypeBadges customer={customer} />
            {b2b ? <span>Kundennr. {b2b.customerNumber}</span> : null}
            <span>Kunde seit {formatDate(customer.createdAt, 'short')}</span>
          </span>
        }
        actions={
          <>
            {customer.phone ? (
              <a
                href={`tel:${customer.phone.replace(/\s+/g, '')}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-800 shadow-xs hover:bg-slate-50"
              >
                <Phone size={18} aria-hidden /> Anrufen
              </a>
            ) : null}
            {customer.email ? (
              <a
                href={`mailto:${customer.email}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-800 shadow-xs hover:bg-slate-50"
              >
                <Mail size={18} aria-hidden /> E-Mail
              </a>
            ) : null}
          </>
        }
      />

      {b2b?.status === 'pending' ? (
        <Notice
          tone="warning"
          icon={UserPlus}
          title="Antrag auf ein Geschäftskundenkonto"
          className="mb-6"
          action={
            <Button size="sm" variant="success" icon={ShieldCheck} onClick={() => setActivateOpen(true)}>
              Prüfen & freischalten
            </Button>
          }
        >
          Eingegangen am {formatDate(customer.createdAt, 'short')}. Bis zur Freischaltung bestellt der Kunde zu Privatkundenpreisen ohne Rechnungskauf.
        </Notice>
      ) : b2b?.status === 'blocked' ? (
        <Notice tone="danger" title="Konto gesperrt" className="mb-6">
          Der Kunde erhält keine Geschäftskundenkonditionen und kann nicht auf Rechnung bestellen.
        </Notice>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Bestellungen" value={formatCount(figures.orders)} hint={figures.lastOrderAt ? `zuletzt ${formatRelative(figures.lastOrderAt)}` : 'noch keine'} icon={ShoppingCart} tone="brand" />
        <StatCard label="Umsatz" value={formatEuro(figures.revenue)} hint={figures.orders ? `Ø ${formatEuro(avg)} je Bestellung` : 'Warenwert brutto'} icon={Package} tone="success" />
        <StatCard
          label="Offene Posten"
          value={formatEuro(figures.openAmount)}
          hint={figures.overdueAmount ? <span className="font-semibold text-red-600">davon {formatEuro(figures.overdueAmount)} überfällig</span> : figures.openAmount ? 'nichts überfällig' : 'alles bezahlt'}
          icon={Receipt}
          tone={figures.overdueAmount ? 'danger' : 'warning'}
        />
        {b2b ? (
          <StatCard
            label="Kreditlimit"
            value={formatEuro(b2b.creditLimit)}
            hint={b2b.creditLimit ? `${formatPercent(Math.min(100, (figures.openAmount / b2b.creditLimit) * 100))} ausgeschöpft · ${b2b.paymentTermsDays} Tage Ziel` : 'kein Limit vereinbart'}
            icon={CreditCard}
            tone="accent"
          />
        ) : (
          <StatCard
            label="Bewertung"
            value={ratings.length ? `${ratingAvg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} / 5` : '–'}
            hint={ratings.length ? `${ratings.length} Bewertungen · ${formatCount(customer.loyaltyPoints)} Treuepunkte` : `${formatCount(customer.loyaltyPoints)} Treuepunkte`}
            icon={ratings.length ? Star : Wallet}
            tone="accent"
          />
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-6">
          {b2b ? <B2BConditionsCard customer={customer} openAmount={figures.openAmount} /> : null}
          <CustomerActivity customer={customer} orders={orders} invoices={invoices} subscriptions={subscriptions} users={users} />
          {!b2b ? <AddressesCard customer={customer} /> : null}
        </div>
        <div className="min-w-0 space-y-6">
          <ProfileCard key={customer.id} customer={customer} />
          <DepositAccountCard customer={customer} />
          {b2b ? <AddressesCard customer={customer} /> : null}
          <NoteCard key={`note-${customer.id}`} customer={customer} />
        </div>
      </div>

      <ActivateBusinessModal customer={activateOpen ? customer : null} onClose={() => setActivateOpen(false)} />
    </>
  );
}
