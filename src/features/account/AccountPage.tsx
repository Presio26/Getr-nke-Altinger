import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Building2,
  ChevronRight,
  Clock,
  FileText,
  Gift,
  Heart,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Recycle,
  Repeat,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Customer } from '@shared/types';
import { formatDate, formatEuro, formatNumber, formatSlot, PRICE_GROUP_LABEL, SEGMENT_LABEL } from '@shared/format';
import { useDepositTypes, useMyCustomer, useMyInvoices, useMyOrders, useMySubscriptions, useSettings, useUnreadCount } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { telHref } from '@/components/layout';
import { openState } from '@/lib/openingHours';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Avatar, Badge, ButtonLink, Button, Card, CardHeader, ErrorState, KeyValue, Notice, OrderStatusBadge, PageHeader, Skeleton } from '@/components/ui';
import { ProfileEditModal } from './components/ProfileEditModal';
import { SettingsCard } from './components/SettingsCard';
import { depositSummary, isOpenOrder } from './lib/helpers';

/** 500 Treuepunkte = 5-€-Gutschein (Anzeige) */
const REWARD_POINTS = 500;
const REWARD_VALUE = 500;

// ───────────────────────────── Profil ─────────────────────────────

function ProfileCard({ customer, onEdit }: { customer: Customer; onEdit: () => void }) {
  const b2b = customer.type === 'b2b';
  const address = customer.addresses.find((a) => a.id === customer.defaultAddressId) ?? customer.addresses[0];
  return (
    <Card padding="lg" className="flex h-full flex-col">
      <div className="flex items-start gap-4">
        <Avatar name={customer.name} size="lg" />
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="truncate text-xl font-bold tracking-tight text-slate-900">{customer.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {b2b ? `Ansprechpartner: ${customer.contactName}` : 'Privatkunde'} · Kunde seit {formatDate(customer.createdAt, 'short')}
          </p>
          {b2b && customer.b2b ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="brand" icon={Building2}>
                Geschäftskunde
              </Badge>
              <Badge tone="neutral">Kd.-Nr. {customer.b2b.customerNumber}</Badge>
            </div>
          ) : null}
        </div>
        <div className="hidden shrink-0 sm:block">
          <Button variant="outline" size="sm" icon={Pencil} onClick={onEdit}>
            Bearbeiten
          </Button>
        </div>
      </div>
      <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <InfoItem icon={Mail} label="E-Mail">
          <span className="break-all">{customer.email}</span>
        </InfoItem>
        <InfoItem icon={Phone} label="Telefon">
          {customer.phone || <span className="text-slate-400">nicht hinterlegt</span>}
        </InfoItem>
        <InfoItem icon={MapPin} label="Standard-Lieferadresse" className="sm:col-span-2">
          {address ? (
            <>
              {address.street}, {address.zip} {address.city}
              <Link to="/konto/adressen" className="ml-2 whitespace-nowrap text-sm font-semibold text-brand-700 hover:text-brand-800">
                Ändern
              </Link>
            </>
          ) : (
            <Link to="/konto/adressen" className="font-semibold text-brand-700">
              Adresse hinzufügen
            </Link>
          )}
        </InfoItem>
        {b2b && customer.b2b ? (
          <InfoItem icon={Wallet} label="Kostenstellen" className="sm:col-span-2">
            {customer.b2b.costCenters.length ? (
              <span className="mt-1 flex flex-wrap gap-1.5">
                {customer.b2b.costCenters.map((c) => (
                  <Badge key={c} tone="neutral">
                    {c}
                  </Badge>
                ))}
              </span>
            ) : (
              <span className="text-slate-400">keine hinterlegt</span>
            )}
          </InfoItem>
        ) : null}
      </dl>
      {b2b && customer.b2b ? <B2BFigures customer={customer} /> : null}
      <LastOrder />
      <Button variant="outline" icon={Pencil} onClick={onEdit} block className="mt-4 sm:hidden">
        Daten bearbeiten
      </Button>
    </Card>
  );
}

function B2BFigures({ customer }: { customer: Customer }) {
  const { data: invoices } = useMyInvoices();
  const b = customer.b2b;
  if (!b || !invoices) return null;
  const open = invoices.filter((i) => i.status !== 'paid');
  const openSum = open.reduce((s, i) => s + i.gross, 0);
  const overdue = open.filter((i) => i.status === 'overdue');
  const credit = b.allowInvoice && b.creditLimit ? Math.max(0, b.creditLimit - openSum) : null;
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <Link to="/business/rechnungen" className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200/70 transition-colors hover:bg-brand-50/60">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Offene Rechnungen</span>
        <span className="mt-0.5 block text-lg font-bold tabular-nums text-slate-900">{formatEuro(openSum)}</span>
        <span className={cn('block text-xs', overdue.length ? 'font-semibold text-red-600' : 'text-slate-500')}>
          {overdue.length ? `${overdue.length} überfällig` : open.length ? `${open.length} offen, im Zahlungsziel` : 'alles bezahlt'}
        </span>
      </Link>
      <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200/70">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{credit !== null ? 'Kreditrahmen frei' : 'Zahlart'}</span>
        <span className="mt-0.5 block text-lg font-bold tabular-nums text-slate-900">{credit !== null ? formatEuro(credit) : 'Bar / Karte'}</span>
        <span className="block text-xs text-slate-500">{credit !== null ? `von ${formatEuro(b.creditLimit)}` : 'Rechnungskauf auf Anfrage'}</span>
      </div>
    </div>
  );
}

function LastOrder() {
  const { data: orders } = useMyOrders();
  const last = useMemo(() => [...(orders ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [orders]);
  if (!last) return null;
  const open = isOpenOrder(last);
  return (
    <Link
      to={`/bestellung/${last.id}`}
      className="group mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200/70 transition-colors hover:bg-brand-50/60 sm:mt-auto"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', open ? 'bg-brand-700 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200')}>
        <Package size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{open ? 'Aktuelle Bestellung' : 'Letzte Bestellung'}</span>
        <span className="block truncate text-[15px] font-semibold text-slate-900">
          {last.number}
          <span className="font-normal text-slate-500"> · {last.fulfillment === 'pickup' ? 'Abholung' : 'Lieferung'}</span>
        </span>
        <span className="block truncate text-sm text-slate-500">{formatSlot(last.slot)}</span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <OrderStatusBadge status={last.status} fulfillment={last.fulfillment} />
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-300 group-hover:text-brand-600" />
    </Link>
  );
}

function InfoItem({ icon: Icon, label, children, className }: { icon: LucideIcon; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 gap-3', className)}>
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-[15px] font-medium text-slate-900">{children}</dd>
      </div>
    </div>
  );
}

// ───────────────────────────── Treuepunkte (B2C) ─────────────────────────────

function LoyaltyCard({ points, perEuro }: { points: number; perEuro: number }) {
  const vouchers = Math.floor(points / REWARD_POINTS);
  const progress = points % REWARD_POINTS;
  const missing = REWARD_POINTS - progress;
  const pct = Math.round((progress / REWARD_POINTS) * 100);
  return (
    <section
      aria-label="Treuepunkte"
      className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white shadow-raised sm:p-6"
    >
      <Star aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rotate-12 text-white/[0.06]" fill="currentColor" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-300">Altinger Treuepunkte</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-accent-300 ring-1 ring-white/10">
          <Gift size={18} aria-hidden />
        </span>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight tabular-nums">{formatNumber(points)}</span>
        <span className="text-sm font-medium text-white/70">Punkte</span>
      </p>
      <p className="mt-1 text-sm text-white/80">
        {vouchers > 0 ? (
          <>
            Entspricht <strong className="text-white">{vouchers === 1 ? 'einem Gutschein' : `${vouchers} Gutscheinen`}</strong> über{' '}
            {formatEuro(REWARD_VALUE)} – einlösbar an der Kasse im Markt.
          </>
        ) : (
          <>Ab {formatNumber(REWARD_POINTS)} Punkten gibt es einen Gutschein über {formatEuro(REWARD_VALUE)}.</>
        )}
      </p>
      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between text-xs font-medium text-white/70">
          <span>Nächster Gutschein</span>
          <span className="tabular-nums">
            {formatNumber(progress)} / {formatNumber(REWARD_POINTS)}
          </span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={REWARD_POINTS} aria-valuenow={progress} aria-label="Fortschritt bis zum nächsten Gutschein">
          <div className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-300 transition-[width] duration-500" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        <p className="mt-2 text-sm text-white/85">
          Noch <strong className="text-white tabular-nums">{formatNumber(missing)} Punkte</strong> bis zum nächsten Gutschein über {formatEuro(REWARD_VALUE)}.
        </p>
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
          {perEuro === 1 ? '1 Punkt' : `${formatNumber(perEuro)} Punkte`} je vollem Euro Einkaufswert · Gutschrift nach Lieferung bzw. Abholung
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────── Firmendaten (B2B) ─────────────────────────────

function CompanyCard({ customer }: { customer: Customer }) {
  const settings = useSettings();
  const b = customer.b2b;
  if (!b) return null;
  const status =
    b.status === 'active' ? <Badge tone="success">Freigeschaltet</Badge> : b.status === 'pending' ? <Badge tone="warning">Wird geprüft</Badge> : <Badge tone="danger">Gesperrt</Badge>;
  return (
    <Card padding="lg" className="flex h-full flex-col">
      <CardHeader icon={Building2} title="Firmendaten & Konditionen" subtitle={SEGMENT_LABEL[b.segment]} action={status} />
      <KeyValue
        items={[
          ['Kundennummer', <span className="tabular-nums">{b.customerNumber}</span>],
          ['Preisgruppe', PRICE_GROUP_LABEL[b.priceGroup]],
          ['Rabatt', b.discountPercent ? `${formatNumber(b.discountPercent)} % auf Netto-Listenpreise` : 'Listenpreise (Staffelpreise ab 10 Stk.)'],
          ['Zahlungsziel', b.allowInvoice ? `${b.paymentTermsDays} Tage netto` : 'Barzahlung / Karte'],
          ...(b.allowInvoice && b.creditLimit ? ([['Kreditlimit', formatEuro(b.creditLimit)]] as [ReactNode, ReactNode][]) : []),
          ['Lieferung', b.freeDelivery ? 'immer frei Haus' : 'nach Liefergebiet'],
          ...(b.vatId ? ([['USt-IdNr.', b.vatId]] as [ReactNode, ReactNode][]) : []),
          [
            'Ansprechpartner',
            <span className="block">
              {b.accountManager ?? 'Team Geschäftskunden'}
              <a href={telHref(settings.phone)} className="block text-sm font-semibold text-brand-700 hover:text-brand-800">
                {settings.phone}
              </a>
            </span>,
          ],
        ]}
      />
      <div className="mt-auto pt-5">
        <ButtonLink to="/business" variant="secondary" icon={Building2} iconRight={ArrowRight} block>
          Zum Geschäftskunden-Portal
        </ButtonLink>
      </div>
    </Card>
  );
}

// ───────────────────────────── Kacheln ─────────────────────────────

interface Tile {
  to: string;
  title: string;
  text: ReactNode;
  icon: LucideIcon;
  tone: string;
  badge?: number;
}

function TileLink({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <Link
      to={tile.to}
      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-raised sm:p-5"
    >
      <span className={cn('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tile.tone)}>
        <Icon size={21} aria-hidden />
        {tile.badge ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white tabular-nums">
            {tile.badge > 99 ? '99+' : tile.badge}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-900">{tile.title}</span>
        <span className="mt-0.5 block truncate text-sm text-slate-500">{tile.text}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-300 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  );
}

function useTiles(customer: Customer): Tile[] {
  const b2b = customer.type === 'b2b';
  const { data: orders } = useMyOrders();
  const { data: subs } = useMySubscriptions();
  const unread = useUnreadCount();
  const depositTypes = useDepositTypes();
  return useMemo(() => {
    const open = (orders ?? []).filter(isOpenOrder).length;
    const activeSubs = (subs ?? []).filter((s) => s.active).length;
    const deposit = depositSummary(customer.depositBalance, depositTypes);
    const list: Tile[] = [
      {
        to: '/bestellungen',
        title: b2b ? 'Bestellungen' : 'Meine Bestellungen',
        text: orders ? (open ? `${open} offen · ${orders.length} insgesamt` : orders.length ? `${orders.length} Bestellungen` : 'Noch keine Bestellung') : 'Verlauf & Live-Tracking',
        icon: Package,
        tone: 'bg-brand-50 text-brand-700',
      },
      {
        to: b2b ? '/business/dauerauftraege' : '/konto/abos',
        title: b2b ? 'Daueraufträge' : 'Abos',
        text: subs ? (activeSubs ? `${activeSubs} aktiv` : 'Noch keine eingerichtet') : 'Regelmäßig beliefert werden',
        icon: Repeat,
        tone: 'bg-emerald-50 text-emerald-700',
      },
      {
        to: '/konto/leergut',
        title: 'Leergut-Konto',
        text: deposit.totalQty ? `${deposit.totalQty} Gebinde · ${formatEuro(deposit.totalValue)} Pfand` : 'Kein offenes Leergut',
        icon: Recycle,
        tone: 'bg-teal-50 text-teal-700',
      },
      {
        to: '/konto/adressen',
        title: b2b ? 'Lieferadressen' : 'Adressen',
        text: customer.addresses.length ? `${customer.addresses.length} ${customer.addresses.length === 1 ? 'Adresse' : 'Adressen'} gespeichert` : 'Lieferadresse hinzufügen',
        icon: MapPin,
        tone: 'bg-sky-50 text-sky-700',
      },
      {
        to: '/konto/favoriten',
        title: 'Favoriten',
        text: customer.favorites.length ? `${customer.favorites.length} Artikel gemerkt` : 'Lieblingsgetränke merken',
        icon: Heart,
        tone: 'bg-rose-50 text-rose-600',
      },
      {
        to: '/konto/benachrichtigungen',
        title: 'Benachrichtigungen',
        text: unread ? `${unread} ungelesen` : 'Alles gelesen',
        icon: Bell,
        tone: 'bg-accent-100 text-accent-800',
        badge: unread,
      },
    ];
    if (b2b) {
      list.splice(2, 0, {
        to: '/business/rechnungen',
        title: 'Rechnungen',
        text: 'Offene Posten & PDF-Ansicht',
        icon: FileText,
        tone: 'bg-violet-50 text-violet-700',
      });
    }
    return list;
  }, [b2b, orders, subs, unread, depositTypes, customer.depositBalance, customer.addresses.length, customer.favorites.length]);
}

// ───────────────────────────── Hilfe ─────────────────────────────

function HelpCard() {
  const settings = useSettings();
  const now = useNow(60_000);
  const state = openState(settings.openingHours, now);
  return (
    <Card padding="lg" className="h-full">
      <CardHeader title="Fragen zu Ihrem Konto?" subtitle="Wir helfen Ihnen gerne persönlich weiter." />
      <ul className="space-y-3 text-[15px]">
        <li>
          <a href={telHref(settings.phone)} className="flex items-center gap-3 rounded-xl p-2 -m-2 font-semibold text-slate-900 hover:bg-slate-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Phone size={18} aria-hidden />
            </span>
            <span>
              {settings.phone}
              <span className="block text-sm font-normal text-slate-500">Telefon im Markt</span>
            </span>
          </a>
        </li>
        <li>
          <a href={`mailto:${settings.email}`} className="flex items-center gap-3 rounded-xl p-2 -m-2 font-semibold text-slate-900 hover:bg-slate-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Mail size={18} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block break-all">{settings.email}</span>
              <span className="block text-sm font-normal text-slate-500">Antwort meist am selben Tag</span>
            </span>
          </a>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Clock size={18} aria-hidden />
          </span>
          <span className="text-sm text-slate-600">
            <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', state.open ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
            {state.text}
            <span className="block text-slate-500">
              {settings.street}, {settings.zip} {settings.city}
            </span>
          </span>
        </li>
      </ul>
    </Card>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

function AccountSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function AccountContent({ customer }: { customer: Customer }) {
  const settings = useSettings();
  const tiles = useTiles(customer);
  const [editing, setEditing] = useState(false);
  const b2b = customer.type === 'b2b';
  return (
    <>
      {b2b && customer.b2b?.status === 'pending' ? (
        <Notice tone="warning" title="Ihr Geschäftskundenkonto wird geprüft" className="mb-5">
          Bis zur Freischaltung bestellen Sie zu Listenpreisen mit Bar- oder Kartenzahlung. Wir melden uns in der Regel innerhalb eines Werktags.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <ProfileCard customer={customer} onEdit={() => setEditing(true)} />
        {b2b ? <CompanyCard customer={customer} /> : <LoyaltyCard points={customer.loyaltyPoints} perEuro={settings.loyaltyPointsPerEuro} />}
      </div>

      <section aria-labelledby="tiles-title" className="mt-8 sm:mt-10">
        <h2 id="tiles-title" className="mb-4 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
          Ihr Konto im Überblick
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <TileLink key={t.to} tile={t} />
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-5 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <SettingsCard customer={customer} />
        <HelpCard />
      </div>

      {editing ? <ProfileEditModal customer={customer} open onClose={() => setEditing(false)} /> : null}
    </>
  );
}

/** Kontoübersicht für Privat- und Geschäftskunden */
export default function AccountPage() {
  const { data: customer, isLoading, error, refetch } = useMyCustomer();
  const user = useSession((s) => s.user);
  const first = (customer?.type === 'b2b' ? customer.contactName : customer?.name ?? user?.name ?? '').split(' ')[0];
  return (
    <>
      <PageHeader
        title="Mein Konto"
        subtitle={first ? `Willkommen zurück, ${first}! Hier verwalten Sie Ihre Daten, Adressen und Einstellungen.` : 'Ihre Daten, Adressen und Einstellungen.'}
      />
      {isLoading ? <AccountSkeleton /> : error || !customer ? <ErrorState error={error} onRetry={() => void refetch()} /> : <AccountContent customer={customer} />}
    </>
  );
}
