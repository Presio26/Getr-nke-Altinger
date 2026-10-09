import type { ReactNode } from 'react';
import { CreditCard, FileText, Gift, Hash, MapPin, MessageSquareText, PartyPopper, ShoppingBag, Sparkles, Truck, Wallet, type LucideIcon } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatDate, formatSlot, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@shared/format';
import { Badge, Card, CardHeader } from '@/components/ui';

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <div className="mt-0.5 text-[15px] leading-snug text-slate-900">{children}</div>
      </div>
    </div>
  );
}

function floorText(floor: number | undefined, elevator: boolean | undefined): string | null {
  if (floor === undefined) return null;
  const f = floor === 0 ? 'Erdgeschoss' : floor < 0 ? 'Untergeschoss' : `${floor}. Etage`;
  return elevator === undefined ? f : `${f} · ${elevator ? 'mit Aufzug' : 'ohne Aufzug'}`;
}

/** Lieferart, Termin, Adresse, Zahlung und Zusatzangaben einer Bestellung */
export function OrderInfoCard({ order }: { order: Order }) {
  const pickup = order.fulfillment === 'pickup';
  const a = order.address;
  const paid = order.paymentStatus === 'paid';
  return (
    <Card>
      <CardHeader title="Bestelldetails" icon={FileText} />
      <div className="divide-y divide-slate-100">
        <Row icon={pickup ? ShoppingBag : Truck} label={pickup ? 'Abholung im Markt' : 'Lieferung'}>
          <span className="font-semibold">{formatSlot(order.slot)}</span>
        </Row>
        {!pickup && a ? (
          <Row icon={MapPin} label="Lieferadresse">
            <p className="font-semibold">{a.name || order.customerName}</p>
            <p>{a.street}</p>
            <p>
              {a.zip} {a.city}
            </p>
            {floorText(a.floor, a.hasElevator) ? <p className="mt-0.5 text-sm text-slate-500">{floorText(a.floor, a.hasElevator)}</p> : null}
            {a.notes ? <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">Hinweis: {a.notes}</p> : null}
          </Row>
        ) : null}
        {order.carryService ? (
          <Row icon={Sparkles} label="Tragservice">
            Wir tragen Ihre Getränke bis in die Wohnung.
          </Row>
        ) : null}
        <Row icon={order.paymentMethod === 'invoice' || order.paymentMethod === 'sepa' ? Wallet : CreditCard} label="Zahlung">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span>
            <Badge tone={paid ? 'success' : order.paymentStatus === 'invoiced' ? 'info' : 'neutral'}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
          </span>
          {!paid && (order.paymentMethod === 'cash' || order.paymentMethod === 'ec') && order.status !== 'cancelled' ? (
            <p className="mt-0.5 text-sm text-slate-500">{pickup ? 'Bezahlung an der Kasse im Markt.' : 'Bezahlung bequem bei Lieferung.'}</p>
          ) : null}
        </Row>
        {order.reference || order.costCenter ? (
          <Row icon={Hash} label="Referenz & Kostenstelle">
            {order.reference ? <p>Bestellreferenz: <span className="font-semibold">{order.reference}</span></p> : null}
            {order.costCenter ? <p>Kostenstelle: <span className="font-semibold">{order.costCenter}</span></p> : null}
          </Row>
        ) : null}
        {order.eventDate ? (
          <Row icon={PartyPopper} label="Veranstaltung">
            <p className="font-semibold">{formatDate(order.eventDate, 'long')}</p>
            {order.commission ? <p className="text-sm text-slate-500">Kommissionsware: volle, ungeöffnete Gebinde nehmen wir nach dem Fest zurück.</p> : null}
          </Row>
        ) : null}
        {order.notes ? (
          <Row icon={MessageSquareText} label="Ihr Hinweis">
            <p className="whitespace-pre-line">{order.notes}</p>
          </Row>
        ) : null}
        {order.loyaltyPointsEarned ? (
          <Row icon={Gift} label="Treuepunkte">
            {order.status === 'delivered' || order.status === 'picked_up' ? (
              <span>
                <span className="font-semibold text-emerald-700">+{order.loyaltyPointsEarned} Punkte</span> gutgeschrieben
              </span>
            ) : order.status === 'cancelled' ? (
              <span className="text-slate-500">keine (storniert)</span>
            ) : (
              <span>
                <span className="font-semibold">+{order.loyaltyPointsEarned} Punkte</span> nach {pickup ? 'Abholung' : 'Zustellung'}
              </span>
            )}
          </Row>
        ) : null}
      </div>
    </Card>
  );
}
