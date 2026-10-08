import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgePercent,
  Building2,
  CalendarClock,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Hourglass,
  Mail,
  MapPin,
  Package,
  Phone,
  Recycle,
  Repeat,
  ShieldAlert,
  ShoppingBasket,
  Truck,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Customer, Invoice, Order } from '@shared/types';
import { formatDate, formatEuro, formatSlot, formatTime, PRICE_GROUP_LABEL, SEGMENT_LABEL, WEEKDAY_LABEL } from '@shared/format';
import { useDepositTypes, useMyCustomer, useMyInvoices, useMyOrders, useMySubscriptions, useProductMap, useProducts, useSettings } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { useDocumentTitle, useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { telHref } from '@/components/layout';
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Notice,
  OrderStatusBadge,
  Skeleton,
  toast,
} from '@/components/ui';
import { BusinessNav } from './components/BusinessNav';
import { InvoiceStatusBadge } from './components/InvoiceStatusBadge';
import { UsualProductLine } from './components/ProductLine';
import { creditUsage, depositAccount, dueText, lastOrder, monthStats, openItems, reorderableLines, upcomingOrders, usualItems } from './lib/b2b';

// ───────────────────────────── Kopf ─────────────────────────────

function parseManager(raw: string | undefined): { name: string; role: string } {
  if (!raw) return { name: 'Geschäftskunden-Service', role: 'Getränke Altinger' };
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(raw);
  return m ? { name: m[1], role: m[2] } : { name: raw, role: 'Ihr Ansprechpartner' };
}

function CompanyHeader({ customer }: { customer: Customer }) {
  const settings = useSettings();
  const b2b = customer.b2b;
  const manager = parseManager(b2b?.accountManager);
  const facts: { icon: LucideIcon; label: string }[] = [];
  if (b2b) {
    facts.push({
      icon: BadgePercent,
      label: b2b.discountPercent > 0 ? `${PRICE_GROUP_LABEL[b2b.priceGroup]} · ${String(b2b.discountPercent).replace('.', ',')} % Rabatt` : `Preisgruppe ${PRICE_GROUP_LABEL[b2b.priceGroup]}`,
    });
    if (b2b.allowInvoice) facts.push({ icon: FileText, label: `Rechnung · ${b2b.paymentTermsDays} Tage netto` });
    if (b2b.freeDelivery) facts.push({ icon: Truck, label: 'Lieferung frei Haus' });
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white shadow-raised">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/5" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 right-40 h-64 w-64 rounded-full bg-accent-400/10" />
      <div className="relative grid grid-cols-1 gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-300">
            <Building2 size={15} aria-hidden />
            Geschäftskunden-Portal
          </p>
          <h1 className="mt-2 text-[1.65rem] font-bold leading-tight tracking-tight sm:text-3xl">{customer.name}</h1>
          <p className="mt-1.5 text-[15px] text-white/75">
            Kd-Nr. <span className="font-semibold text-white tabular-nums">{b2b?.customerNumber ?? '—'}</span>
            {b2b ? <> · {SEGMENT_LABEL[b2b.segment]}</> : null}
            {b2b?.vatId ? <span className="hidden sm:inline"> · USt-IdNr. {b2b.vatId}</span> : null}
          </p>
          {facts.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {facts.map((f) => (
                <li key={f.label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold ring-1 ring-inset ring-white/15">
                  <f.icon size={14} aria-hidden className="text-accent-300" />
                  {f.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm lg:w-80">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Ihr Ansprechpartner im Markt</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={manager.name} color="#f2a900" className="ring-white/20 text-brand-950" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{manager.name}</p>
              <p className="truncate text-sm text-white/70">{manager.role}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={telHref(settings.phone)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50"
            >
              <Phone size={15} aria-hidden />
              {settings.phone}
            </a>
            <a
              href={`mailto:${settings.email}?subject=${encodeURIComponent(`Anfrage ${b2b?.customerNumber ?? ''} ${customer.name}`.trim())}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/20"
            >
              <Mail size={15} aria-hidden />
              E-Mail
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeaderSkeleton() {
  return (
    <div className="rounded-3xl bg-brand-900/90 p-6 sm:p-7">
      <Skeleton className="h-3 w-40 opacity-40" />
      <Skeleton className="mt-4 h-8 w-72 max-w-full opacity-40" />
      <Skeleton className="mt-3 h-4 w-56 opacity-40" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-7 w-40 rounded-full opacity-40" />
        <Skeleton className="h-7 w-36 rounded-full opacity-40" />
      </div>
    </div>
  );
}

// ───────────────────────────── Kennzahlen ─────────────────────────────

function Kpi({
  label,
  icon: Icon,
  tone = 'brand',
  value,
  children,
  to,
  loading,
}: {
  label: string;
  icon: LucideIcon;
  tone?: 'brand' | 'danger' | 'success' | 'accent' | 'neutral' | 'warning';
  value: ReactNode;
  children?: ReactNode;
  to?: string;
  loading?: boolean;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    danger: 'bg-red-50 text-red-600',
    success: 'bg-emerald-50 text-emerald-600',
    accent: 'bg-accent-100 text-accent-700',
    neutral: 'bg-slate-100 text-slate-600',
    warning: 'bg-amber-50 text-amber-600',
  } as const;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-[13px] font-medium leading-snug text-slate-500 sm:text-sm">{label}</span>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9', tones[tone])}>
          <Icon size={17} aria-hidden />
        </span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-28" />
          <Skeleton className="mt-2.5 h-3.5 w-36" />
        </>
      ) : (
        <>
          <div className="mt-1 text-[1.35rem] font-bold tracking-tight text-slate-900 tabular-nums sm:text-[1.7rem]">{value}</div>
          {children ? <div className="mt-1.5 text-[13px] leading-snug text-slate-500">{children}</div> : null}
        </>
      )}
    </>
  );
  const cls = 'flex h-full w-full flex-col rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-card sm:p-5';
  if (to) {
    return (
      <Link to={to} className={cn(cls, 'transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-raised')}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

function CreditBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-2.5">
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Auslastung des Kreditlimits"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }} />
      </div>
    </div>
  );
}

// ───────────────────────────── Schnellaktionen ─────────────────────────────

function ActionTile({
  icon: Icon,
  title,
  description,
  to,
  onClick,
  accent,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  to?: string;
  onClick?: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  const cls = cn(
    'group flex h-full w-full items-center gap-3.5 rounded-2xl border p-4 text-left shadow-card transition-[box-shadow,transform,border-color]',
    accent ? 'border-accent-300/70 bg-accent-50' : 'border-slate-200/70 bg-white',
    disabled ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-raised',
  );
  const inner = (
    <>
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          accent ? 'bg-accent-500 text-brand-950' : 'bg-brand-50 text-brand-700 group-hover:bg-brand-700 group-hover:text-white',
          'transition-colors',
        )}
      >
        <Icon size={21} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{description}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

// ───────────────────────────── Nächste Lieferungen ─────────────────────────────

function UpcomingOrder({ order, now }: { order: Order; now: Date }) {
  const live = order.status === 'out_for_delivery';
  const crates = order.lines.reduce((s, l) => s + l.qty, 0);
  return (
    <li>
      <Link
        to={`/bestellung/${order.id}`}
        className={cn(
          'group flex flex-col gap-3 rounded-2xl border p-4 transition-colors sm:flex-row sm:items-center',
          live ? 'border-brand-200 bg-brand-50/50 hover:bg-brand-50' : 'border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/70',
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              live ? 'bg-brand-700 text-white' : order.fulfillment === 'pickup' ? 'bg-accent-100 text-accent-800' : 'bg-slate-100 text-slate-600',
            )}
          >
            {order.fulfillment === 'pickup' ? <ShoppingBasket size={20} aria-hidden /> : <Truck size={20} aria-hidden />}
            {live ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent-500 ring-2 ring-white" />
              </span>
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-slate-900">{formatSlot(order.slot, now)}</span>
              <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">
              {order.number} · {crates} Gebinde · {formatEuro(order.totals.total)}
              {order.costCenter ? ` · ${order.costCenter}` : ''}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-slate-500">
              <MapPin size={13} aria-hidden className="shrink-0 text-slate-400" />
              <span className="truncate">
                {order.fulfillment === 'pickup' ? 'Abholung im Markt' : order.address ? `${order.address.label} · ${order.address.street}` : 'Lieferung'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          {live && order.eta ? (
            <span className="text-sm font-semibold text-brand-800">
              <Clock size={14} aria-hidden className="mr-1 inline -translate-y-px" />
              ca. {formatTime(order.eta)} Uhr
            </span>
          ) : (
            <span />
          )}
          <span
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors',
              live ? 'bg-brand-700 text-white group-hover:bg-brand-800' : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200',
            )}
          >
            {live ? 'Live verfolgen' : 'Details'}
            <ArrowRight size={15} aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}

// ───────────────────────────── Letzte Rechnungen ─────────────────────────────

function InvoiceRow({ invoice, now }: { invoice: Invoice; now: Date }) {
  return (
    <li>
      <Link to={`/business/rechnungen/${invoice.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <FileText size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-slate-900 tabular-nums">{invoice.number}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(invoice.gross)}</span>
          </span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className={cn('min-w-0 truncate text-[13px]', invoice.status === 'overdue' ? 'font-medium text-red-600' : 'text-slate-500')}>
              {invoice.status === 'paid' ? `vom ${formatDate(invoice.date, 'short')}` : dueText(invoice, now)}
            </span>
            <InvoiceStatusBadge status={invoice.status} className="shrink-0" />
          </span>
        </span>
      </Link>
    </li>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

/** Geschäftskunden-Portal: Übersicht */
export default function BusinessDashboardPage() {
  const now = useNow(60_000);
  const customerQ = useMyCustomer();
  const ordersQ = useMyOrders();
  const invoicesQ = useMyInvoices();
  const subsQ = useMySubscriptions();
  const productsQ = useProducts();
  const productMap = useProductMap();
  const depositTypes = useDepositTypes();
  const addToCart = useCart((s) => s.add);
  const settings = useSettings();
  useDocumentTitle('Geschäftskunden-Portal');

  const customer = customerQ.data;
  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  const upcoming = useMemo(() => upcomingOrders(orders), [orders]);
  const usual = useMemo(() => usualItems(orders, productMap, 6), [orders, productMap]);
  const last = useMemo(() => lastOrder(orders), [orders]);
  const items = useMemo(() => openItems(invoices), [invoices]);
  const credit = useMemo(() => creditUsage(invoices, orders), [invoices, orders]);
  const month = useMemo(() => monthStats(orders, now), [orders, now]);
  const deposit = useMemo(() => (customer ? depositAccount(customer, depositTypes) : null), [customer, depositTypes]);
  const activeSubs = (subsQ.data ?? []).filter((s) => s.active).sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  if (customerQ.isError) {
    return (
      <>
        <BusinessNav />
        <ErrorState error={customerQ.error} onRetry={() => void customerQ.refetch()} />
      </>
    );
  }

  const b2b = customer?.b2b;
  const ordersLoading = ordersQ.isLoading;
  const invoicesLoading = invoicesQ.isLoading;
  const monthName = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'Europe/Berlin' }).format(now);

  const repeatLast = () => {
    if (!last) return;
    const lines = reorderableLines(last, productMap);
    if (!lines.length) {
      toast.info('Die Artikel dieser Bestellung sind derzeit nicht erhältlich.');
      return;
    }
    for (const l of lines) addToCart(l.productId, l.qty);
    const skipped = last.lines.filter((l) => !l.isRental).length - lines.length;
    toast.success(`${lines.length} Artikel aus ${last.number} im Warenkorb`, {
      description: skipped > 0 ? `${skipped} Artikel ist derzeit nicht erhältlich und wurde ausgelassen.` : 'Mengen wie bei Ihrer letzten Bestellung.',
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
    });
  };

  return (
    <div className="pb-4">
      <BusinessNav />

      {customer ? <CompanyHeader customer={customer} /> : <HeaderSkeleton />}

      {b2b?.status === 'pending' ? (
        <Notice tone="warning" icon={Hourglass} title="Ihr Konto wird geprüft" className="mt-5">
          Bis zur Freischaltung gelten Privatkundenkonditionen – Sie können bereits bestellen und bar, mit EC-Karte, PayPal oder Kreditkarte bezahlen. Nach der Freischaltung
          sehen Sie Ihre persönlichen Netto-Konditionen und können auf Rechnung bestellen.
        </Notice>
      ) : null}
      {b2b?.status === 'blocked' ? (
        <Notice tone="danger" icon={ShieldAlert} title="Ihr Geschäftskundenkonto ist derzeit gesperrt" className="mt-5">
          Bestellungen sind vorübergehend nicht möglich. Bitte wenden Sie sich an den Markt unter {settings.phone}.
        </Notice>
      ) : null}

      {/* Kennzahlen */}
      <section aria-label="Kennzahlen" className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Offene Posten"
          icon={Wallet}
          tone={items.overdueCount ? 'danger' : 'brand'}
          value={formatEuro(items.openAmount)}
          to="/business/rechnungen"
          loading={invoicesLoading}
        >
          {items.openCount === 0 ? (
            invoices.length ? 'Alle Rechnungen bezahlt' : 'Keine offenen Rechnungen'
          ) : (
            <>
              {items.openCount} {items.openCount === 1 ? 'Rechnung' : 'Rechnungen'}
              {items.overdueCount ? <span className="block font-semibold text-red-600">davon {formatEuro(items.overdueAmount)} überfällig</span> : null}
              {!items.overdueCount && items.nextDue ? <span className="block">nächste fällig {formatDate(items.nextDue.dueDate, 'short')}</span> : null}
            </>
          )}
        </Kpi>
        <Kpi
          label="Kreditlimit"
          icon={CreditCard}
          tone={b2b && b2b.creditLimit > 0 && credit.total / b2b.creditLimit >= 0.9 ? 'danger' : 'success'}
          value={b2b && b2b.creditLimit > 0 ? `${Math.min(999, Math.round((credit.total / b2b.creditLimit) * 100))} %` : '—'}
          loading={!customer || invoicesLoading || ordersLoading}
        >
          {b2b && b2b.creditLimit > 0 ? (
            <>
              <span className="tabular-nums">
                {formatEuro(credit.total)} von {formatEuro(b2b.creditLimit)}
              </span>
              <CreditBar used={credit.total} limit={b2b.creditLimit} />
              <span className="mt-1.5 block">frei: {formatEuro(Math.max(0, b2b.creditLimit - credit.total))}</span>
            </>
          ) : b2b?.status === 'pending' ? (
            'wird nach der Freischaltung festgelegt'
          ) : (
            'kein Kauf auf Rechnung vereinbart'
          )}
        </Kpi>
        <Kpi label={`Umsatz ${monthName}`} icon={Package} tone="accent" value={formatEuro(month.net)} loading={ordersLoading}>
          {month.count} {month.count === 1 ? 'Bestellung' : 'Bestellungen'} · netto
          <span className="block">Vormonat: {formatEuro(month.prevNet)}</span>
        </Kpi>
        <Kpi label="Leergut-Konto" icon={Recycle} tone="neutral" value={formatEuro(deposit?.value ?? 0)} to="/konto/leergut" loading={!deposit}>
          {deposit && deposit.units > 0 ? (
            <>
              {deposit.units} Gebinde bei Ihnen
              <span className="block truncate">{deposit.lines.slice(0, 2).map((l) => `${l.qty} × ${l.type.shortName}`).join(' · ')}</span>
            </>
          ) : (
            'kein Leergut offen'
          )}
        </Kpi>
      </section>

      {/* Schnellaktionen */}
      <section aria-label="Schnellaktionen" className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <ActionTile icon={Zap} title="Schnellbestellung" description="Ihre Artikel als Bestellmatrix – in Sekunden erfasst" to="/business/schnellbestellung" accent />
        <ActionTile
          icon={Repeat}
          title="Letzte Bestellung wiederholen"
          description={last ? `${last.number} vom ${formatDate(last.createdAt, 'short')} · ${last.lines.length} Artikel` : ordersLoading ? 'Bestellungen werden geladen …' : 'Noch keine Bestellung vorhanden'}
          onClick={repeatLast}
          disabled={!last || productsQ.isLoading}
        />
        <ActionTile
          icon={CalendarClock}
          title="Dauerauftrag anlegen"
          description={
            activeSubs.length
              ? `${activeSubs.length} aktiv · nächste Lieferung ${formatDate(activeSubs[0].nextDate, 'medium')}`
              : 'Feste Lieferung jede Woche – inkl. Leergut-Abholung'
          }
          to="/business/dauerauftraege"
        />
        <ActionTile
          icon={FileText}
          title="Rechnungen"
          description={items.openCount ? `${items.openCount} offen · ${formatEuro(items.openAmount)}` : 'Alle Rechnungen als PDF'}
          to="/business/rechnungen"
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        <div className="min-w-0 space-y-5 lg:space-y-6">
          {/* Nächste Lieferungen */}
          <Card padding="lg">
            <CardHeader
              icon={Truck}
              title="Nächste Lieferungen"
              subtitle={upcoming.length ? `${upcoming.length} offene ${upcoming.length === 1 ? 'Bestellung' : 'Bestellungen'}` : undefined}
              action={
                <ButtonLink to="/bestellungen" variant="ghost" size="sm" iconRight={ArrowRight}>
                  Alle
                </ButtonLink>
              }
            />
            {ordersQ.isError ? (
              <ErrorState error={ordersQ.error} onRetry={() => void ordersQ.refetch()} className="py-6" />
            ) : ordersLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-[88px] w-full rounded-2xl" />
                <Skeleton className="h-[88px] w-full rounded-2xl" />
              </div>
            ) : upcoming.length ? (
              <ul className="space-y-3">
                {upcoming.slice(0, 4).map((o) => (
                  <UpcomingOrder key={o.id} order={o} now={now} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Truck}
                title="Keine offenen Lieferungen"
                description="Sobald Sie bestellen, sehen Sie hier Termin, Status und den Live-Standort des Fahrers."
                action={
                  <ButtonLink to="/business/schnellbestellung" icon={Zap} variant="secondary">
                    Jetzt bestellen
                  </ButtonLink>
                }
                className="py-8"
              />
            )}
          </Card>

          {/* Standardsortiment */}
          <Card padding="lg">
            <CardHeader
              icon={ShoppingBasket}
              title="Ihr Standardsortiment"
              subtitle="Ihre meistbestellten Artikel – Netto-Preise mit Ihren Konditionen"
              action={
                <span className="hidden sm:block">
                  <ButtonLink to="/business/schnellbestellung" variant="ghost" size="sm" iconRight={ArrowRight}>
                    Zur Bestellmatrix
                  </ButtonLink>
                </span>
              }
            />
            {ordersLoading || productsQ.isLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-13 w-13 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-9 w-16 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : usual.length ? (
              <ul className="divide-y divide-slate-100">
                {usual.map((u) => {
                  const product = productMap.get(u.productId);
                  if (!product) return null;
                  return (
                    <UsualProductLine
                      key={u.productId}
                      product={product}
                      customer={customer ?? null}
                      depositTypes={depositTypes}
                      typicalQty={u.typicalQty}
                      orderCount={u.orderCount}
                    />
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={ShoppingBasket}
                title="Noch kein Standardsortiment"
                description="Nach Ihren ersten Bestellungen erscheinen hier Ihre meistbestellten Artikel zum schnellen Nachbestellen."
                action={
                  <ButtonLink to="/sortiment" variant="secondary">
                    Sortiment ansehen
                  </ButtonLink>
                }
                className="py-8"
              />
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:space-y-6">
          {/* Letzte Rechnungen */}
          <Card padding="lg">
            <CardHeader
              icon={FileText}
              title="Letzte Rechnungen"
              action={
                <ButtonLink to="/business/rechnungen" variant="ghost" size="sm" iconRight={ArrowRight}>
                  Alle
                </ButtonLink>
              }
            />
            {invoicesQ.isError ? (
              <ErrorState error={invoicesQ.error} onRetry={() => void invoicesQ.refetch()} className="py-6" />
            ) : invoicesLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : invoices.length ? (
              <ul className="-mx-2 space-y-0.5">
                {invoices.slice(0, 4).map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} now={now} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={FileText}
                title="Noch keine Rechnungen"
                description="Lieferungen auf Rechnung werden gesammelt und regelmäßig abgerechnet."
                className="py-6"
              />
            )}
          </Card>

          {/* Konditionen */}
          <Card padding="lg">
            <CardHeader icon={BadgePercent} title="Ihre Konditionen" />
            {b2b ? (
              <dl className="divide-y divide-slate-100 text-[15px]">
                {[
                  ['Preisgruppe', PRICE_GROUP_LABEL[b2b.priceGroup]],
                  ['Rabatt auf Listenpreise', b2b.discountPercent > 0 ? `${String(b2b.discountPercent).replace('.', ',')} %` : '—'],
                  ['Staffelpreise', 'ab 10 bzw. 25 Gebinden'],
                  ['Zahlungsziel', `${b2b.paymentTermsDays} Tage netto`],
                  ['Kauf auf Rechnung', b2b.status === 'pending' ? 'nach Freischaltung' : b2b.allowInvoice && b2b.status === 'active' ? 'ja, auch per SEPA' : 'nein'],
                  ['Lieferung', b2b.freeDelivery ? 'immer frei Haus' : 'nach Liefergebiet'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <dt className="shrink-0 text-slate-500">{k}</dt>
                    <dd className="text-right font-medium text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            )}
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-500">
              Es gilt jeweils der günstigste Preis aus Rabatt, Staffel und Angebot. Alle Preise netto zzgl. MwSt. und Pfand.
            </p>
          </Card>

          {/* Daueraufträge */}
          {activeSubs.length ? (
            <Card padding="lg">
              <CardHeader
                icon={CalendarClock}
                title="Daueraufträge"
                action={
                  <ButtonLink to="/business/dauerauftraege" variant="ghost" size="sm" iconRight={ArrowRight}>
                    Verwalten
                  </ButtonLink>
                }
              />
              <ul className="space-y-2.5">
                {activeSubs.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-[15px]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{s.name}</span>
                      <span className="block truncate text-[13px] text-slate-500">
                        {WEEKDAY_LABEL[s.weekday]}s ab {s.slotStart} Uhr · {s.items.length} Artikel
                      </span>
                    </span>
                    <Badge tone="brand">{formatDate(s.nextDate, 'relative', now)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

        </div>
      </div>
    </div>
  );
}
