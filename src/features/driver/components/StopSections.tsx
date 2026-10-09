/**
 * Abschnitte der Stopp-Seite: Kunde & Navigation, Hinweise, Positionen, Zustellnachweis.
 */
import type { ReactNode } from 'react';
import {
  ArrowUpFromLine,
  Building,
  CheckCheck,
  CheckCircle2,
  DoorOpen,
  FileText,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Navigation,
  Package,
  Phone,
  Receipt,
  Recycle,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { DepositType, Driver, Order } from '@shared/types';
import { formatEuro, formatTime, PAYMENT_METHOD_LABEL } from '@shared/format';
import { cn } from '@/lib/cn';
import { Avatar, Badge, Button, Card, CardHeader, KeyValue, Notice, buttonClasses } from '@/components/ui';
import { BaseMap, HomeMarker, StoreMarker } from '@/components/map';
import { telHref } from '@/components/layout/Footer';
import { appleMapsUrl, crateCount, floorLabel, googleMapsUrl, paidWith, payKind } from '../lib/driverUtils';
import { OwnVehicle } from './TourMap';

// ───────────────────────────── Kunde & Navigation ─────────────────────────────

export function CustomerCard({ order, driver }: { order: Order; driver?: Driver }) {
  const a = order.address;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Avatar name={order.customerName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold leading-tight text-slate-900">{order.customerName}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {order.number}
              {a?.label ? ` · ${a.label}` : ''}
              {order.customerType === 'b2b' ? ' · Geschäftskunde' : ''}
            </p>
          </div>
        </div>
        {a ? (
          <div className="mt-4 flex items-start gap-3">
            <MapPin size={22} aria-hidden className="mt-0.5 shrink-0 text-brand-700" />
            <div className="min-w-0">
              <p className="text-[19px] font-bold leading-snug text-slate-900">{a.street}</p>
              <p className="text-[15px] text-slate-600">
                {a.zip} {a.city}
              </p>
              {a.name && a.name !== order.customerName ? <p className="mt-0.5 text-sm text-slate-500">Empfänger: {a.name}</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      {a ? (
        <div className="relative isolate h-40 border-y border-slate-100 sm:h-48">
          <BaseMap center={[a.lat, a.lng]} zoom={16} static className="h-full">
            <StoreMarker />
            <HomeMarker position={a} label={order.customerName} />
            {driver ? <OwnVehicle driverId={driver.id} color={driver.color} fallback={driver.position} /> : null}
          </BaseMap>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 p-4 sm:p-5">
        {a ? (
          <>
            <a href={appleMapsUrl(a)} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary', 'md', true, 'h-14! px-3!')}>
              <Navigation size={20} aria-hidden />
              <span className="truncate">Apple Karten</span>
            </a>
            <a href={googleMapsUrl(a)} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary', 'md', true, 'h-14! px-3!')}>
              <MapIcon size={20} aria-hidden />
              <span className="truncate">Google Maps</span>
            </a>
          </>
        ) : null}
        {order.customerPhone ? (
          <a href={telHref(order.customerPhone)} className={buttonClasses('outline', 'md', true, 'col-span-2 h-14! text-base!')}>
            <Phone size={20} aria-hidden className="text-emerald-600" />
            <span className="truncate">
              Anrufen · <span className="tabular-nums">{order.customerPhone}</span>
            </span>
          </a>
        ) : null}
      </div>
    </Card>
  );
}

// ───────────────────────────── Hinweise ─────────────────────────────

function NoteRow({ icon: Icon, title, children, strong }: { icon: LucideIcon; title: ReactNode; children?: ReactNode; strong?: boolean }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', strong ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800')}>
        <Icon size={20} aria-hidden />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[16px] font-bold leading-snug text-amber-950">{title}</p>
        {children ? <p className="mt-0.5 text-[15px] leading-snug text-amber-900">{children}</p> : null}
      </div>
    </li>
  );
}

export function hasNotes(order: Order): boolean {
  return !!(order.carryService || (order.address?.floor ?? 0) > 0 || order.address?.notes || order.notes || order.costCenter || order.reference);
}

export function NotesCard({ order }: { order: Order }) {
  const a = order.address;
  // Etage nur, wenn relevant (Obergeschoss oder Tragservice)
  const floor = (a?.floor ?? 0) > 0 || order.carryService ? floorLabel(a?.floor) : null;
  if (!hasNotes(order)) return null;
  return (
    <section aria-label="Hinweise" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-card sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-800">
        <TriangleAlert size={17} aria-hidden />
        Bitte beachten
      </h3>
      <ul className="divide-y divide-amber-200/70">
        {order.carryService ? (
          <NoteRow icon={ArrowUpFromLine} title="Tragservice gebucht" strong>
            Bitte bis in die Wohnung bzw. an den gewünschten Ort tragen.
          </NoteRow>
        ) : null}
        {floor ? (
          <NoteRow icon={Building} title={`${floor}${a?.floor ? (a.hasElevator ? ' · mit Aufzug' : ' · kein Aufzug') : ''}`} strong={!!a?.floor && !a.hasElevator && order.carryService} />
        ) : null}
        {a?.notes ? (
          <NoteRow icon={DoorOpen} title="Zur Adresse">
            {a.notes}
          </NoteRow>
        ) : null}
        {order.notes ? (
          <NoteRow icon={MessageSquareText} title="Hinweis des Kunden">
            {order.notes}
          </NoteRow>
        ) : null}
        {order.costCenter || order.reference ? (
          <NoteRow icon={FileText} title="Für den Lieferschein">
            {[order.costCenter ? `Kostenstelle: ${order.costCenter}` : null, order.reference ? `Referenz: ${order.reference}` : null].filter(Boolean).join(' · ')}
          </NoteRow>
        ) : null}
      </ul>
    </section>
  );
}

// ───────────────────────────── Positionen ─────────────────────────────

export function ItemsCard({
  order,
  checked,
  onToggle,
  onAll,
  interactive,
}: {
  order: Order;
  checked: Set<number>;
  onToggle: (index: number) => void;
  onAll: (all: boolean) => void;
  interactive: boolean;
}) {
  const count = order.lines.filter((_, i) => checked.has(i)).length;
  const all = count === order.lines.length;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-4 pb-2 sm:p-5 sm:pb-2">
        <CardHeader
          title="Positionen"
          subtitle={interactive ? `${count} von ${order.lines.length} abgehakt · ${crateCount(order)} Gebinde` : `${crateCount(order)} Gebinde`}
          icon={Package}
          className="mb-1"
          action={
            interactive ? (
              <Button variant="ghost" size="sm" icon={all ? RotateCcw : CheckCheck} onClick={() => onAll(!all)}>
                {all ? 'Zurücksetzen' : 'Alle'}
              </Button>
            ) : undefined
          }
        />
      </div>
      <ul className="border-t border-slate-100">
        {order.lines.map((line, i) => {
          const on = checked.has(i);
          const content = (
            <>
              {interactive ? (
                <span
                  aria-hidden
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                    on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white',
                  )}
                >
                  {on ? <CheckCheck size={17} strokeWidth={2.6} /> : null}
                </span>
              ) : null}
              <span className="w-10 shrink-0 text-right text-xl font-bold tabular-nums text-slate-900">{line.qty}×</span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[15px] font-semibold leading-snug', on ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900')}>
                  {line.name}
                </span>
                <span className="block text-[13px] text-slate-500">
                  {line.packaging}
                  {line.isRental ? ' · Leihartikel' : ''}
                </span>
              </span>
            </>
          );
          return (
            <li key={`${line.productId}-${i}`} className="border-b border-slate-100 last:border-b-0">
              {interactive ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onToggle(i)}
                  className={cn('flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5', on ? 'bg-emerald-50/50' : 'hover:bg-slate-50')}
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ───────────────────────────── Zustellnachweis ─────────────────────────────

export function ProofView({ order, types }: { order: Order; types: DepositType[] }) {
  const proof = order.proof;
  if (!proof) return null;
  const method = paidWith(order);
  const kind = payKind(order.paymentMethod);
  const empties = proof.emptiesCollected.filter((l) => l.qty > 0);
  const items: [ReactNode, ReactNode][] = [
    ['Zugestellt', `${formatTime(proof.at)} Uhr`],
    ['Empfangen von', proof.receivedBy ?? '–'],
    [
      'Leergut',
      empties.length
        ? empties.map((l) => `${l.qty}× ${types.find((t) => t.id === l.depositTypeId)?.shortName ?? l.depositTypeId}`).join(', ')
        : 'kein Leergut',
    ],
    [
      'Zahlung',
      kind === 'collect'
        ? `${formatEuro(proof.amountCollected ?? 0)} ${method === 'ec' ? 'per EC-Karte' : 'bar'} kassiert`
        : kind === 'prepaid'
          ? `bereits bezahlt (${PAYMENT_METHOD_LABEL[order.paymentMethod]})`
          : PAYMENT_METHOD_LABEL[order.paymentMethod],
    ],
  ];
  if (proof.note) items.push(['Notiz', proof.note]);
  return (
    <Card>
      <CardHeader
        title="Zustellnachweis"
        subtitle={`Endbetrag ${formatEuro(order.totals.total)} · Leergut-Gutschrift ${formatEuro(order.totals.depositRefund)}`}
        icon={Receipt}
      />
      <KeyValue items={items} />
      {proof.signatureDataUrl || proof.photoDataUrl ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {proof.signatureDataUrl ? (
            <figure className="rounded-xl border border-slate-200 bg-white p-2">
              <img src={proof.signatureDataUrl} alt="Unterschrift" className="h-32 w-full object-contain" />
              <figcaption className="mt-1 text-center text-xs text-slate-500">Unterschrift</figcaption>
            </figure>
          ) : null}
          {proof.photoDataUrl ? (
            <figure className="rounded-xl border border-slate-200 bg-white p-2">
              <img src={proof.photoDataUrl} alt="Zustellfoto" className="h-32 w-full rounded-lg object-cover" />
              <figcaption className="mt-1 text-center text-xs text-slate-500">Foto</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function DoneBanner({ order }: { order: Order }) {
  if (order.status === 'delivered') {
    return (
      <Notice tone="success" icon={CheckCircle2} title={`Zugestellt${order.proof ? ` um ${formatTime(order.proof.at)} Uhr` : ''}`}>
        {order.proof?.receivedBy ? `Entgegengenommen von ${order.proof.receivedBy}.` : 'Die Zustellung ist abgeschlossen.'}
      </Notice>
    );
  }
  if (order.status === 'failed') {
    return (
      <Notice tone="danger" icon={TriangleAlert} title="Zustellung fehlgeschlagen">
        {order.failureReason ?? 'Kein Grund angegeben.'} Der Markt wurde informiert.
      </Notice>
    );
  }
  return null;
}

export function EmptiesSummary({ announced, actual }: { announced: number; actual: number }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm ring-1 ring-inset ring-slate-100">
      <span className="flex items-center gap-2 font-medium text-slate-600">
        <Recycle size={16} aria-hidden />
        Gutschrift
      </span>
      <span className="flex items-center gap-2">
        {actual !== announced ? (
          <Badge tone={actual > announced ? 'success' : 'warning'}>angekündigt {formatEuro(announced)}</Badge>
        ) : null}
        <strong className="text-[15px] tabular-nums text-slate-900">{formatEuro(actual)}</strong>
      </span>
    </div>
  );
}
