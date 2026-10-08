/**
 * Kommissionierschein (druckoptimiert). Wird per Portal direkt in <body> gerendert und
 * ist nur im Druck sichtbar – der App-Rahmen (Seitenleiste, Kopfzeile, Dialoge) wird ausgeblendet.
 */
import { createPortal } from 'react-dom';
import type { Order, Product, Tour } from '@shared/types';
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL, formatDate, formatDateTime, formatEuro } from '@shared/format';
import { useDepositTypes, useSettings } from '@/api/hooks';
import { Logo } from '@/components/brand/Logo';
import { orderCrates } from '../model';

const PRINT_CSS = `
@media screen { .ops-print-sheet { display: none !important; } }
@media print {
  @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
  body > *:not(.ops-print-sheet) { display: none !important; }
  .ops-print-sheet { display: block !important; color: #0f172a; font-size: 11pt; }
  .ops-print-sheet table { width: 100%; border-collapse: collapse; }
  .ops-print-sheet th, .ops-print-sheet td { border-bottom: 1px solid #cbd5e1; padding: 6pt 4pt; text-align: left; vertical-align: top; }
  .ops-print-sheet thead th { border-bottom: 1.5pt solid #0f172a; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; }
  .ops-print-sheet tr { break-inside: avoid; }
}
`;

export interface PickingSlipProps {
  order: Order;
  products: Map<string, Product>;
  tour?: Pick<Tour, 'name' | 'stops'> | null;
  driverName?: string;
}

function SlipContent({ order, products, tour, driverName }: PickingSlipProps) {
  const settings = useSettings();
  const depositTypes = useDepositTypes();
  const lines = [...order.lines].sort((a, b) => {
    const la = products.get(a.productId)?.location ?? 'ZZZ';
    const lb = products.get(b.productId)?.location ?? 'ZZZ';
    return la.localeCompare(lb, 'de', { numeric: true }) || a.name.localeCompare(b.name, 'de');
  });
  const stopIndex = tour ? tour.stops.findIndex((s) => s.orderId === order.id) : -1;
  const a = order.address;
  const toCollect = order.paymentStatus === 'open' && order.paymentMethod !== 'invoice' && order.paymentMethod !== 'sepa';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16pt' }}>
        <div>
          <Logo className="h-10" />
          <p style={{ marginTop: '6pt', fontSize: '9pt', color: '#475569' }}>
            {settings.legalName} · {settings.street} · {settings.zip} {settings.city} · Tel. {settings.phone}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '.08em', color: '#475569', fontWeight: 700 }}>Kommissionierschein</p>
          <p style={{ fontSize: '22pt', fontWeight: 800, lineHeight: 1.1 }}>{order.number}</p>
          <p style={{ fontSize: '9pt', color: '#475569' }}>gedruckt {formatDateTime(new Date())} Uhr</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12pt', marginTop: '14pt', padding: '10pt', border: '1.5pt solid #0f172a', borderRadius: '6pt' }}>
        <div>
          <p style={{ fontSize: '8.5pt', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>{FULFILLMENT_LABEL[order.fulfillment]}</p>
          <p style={{ fontSize: '13pt', fontWeight: 700 }}>
            {formatDate(order.slot.date, 'long')}
            <br />
            {order.slot.start}–{order.slot.end} Uhr
          </p>
          {order.pickupCode ? (
            <p style={{ marginTop: '4pt' }}>
              Abholcode: <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13pt', letterSpacing: '.12em' }}>{order.pickupCode}</strong>
            </p>
          ) : null}
          {tour ? (
            <p style={{ marginTop: '4pt' }}>
              {tour.name}
              {stopIndex >= 0 ? ` · Stopp ${stopIndex + 1} von ${tour.stops.length}` : ''}
              {driverName ? ` · Fahrer ${driverName}` : ''}
            </p>
          ) : null}
        </div>
        <div>
          <p style={{ fontSize: '8.5pt', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>
            {order.customerType === 'b2b' ? 'Geschäftskunde' : 'Kunde'}
          </p>
          <p style={{ fontSize: '13pt', fontWeight: 700 }}>{order.customerName}</p>
          {a ? (
            <p>
              {a.name !== order.customerName ? (
                <>
                  {a.name}
                  <br />
                </>
              ) : null}
              {a.street}, {a.zip} {a.city}
              {a.floor !== undefined ? ` · ${a.floor === 0 ? 'EG' : `${a.floor}. OG`}${a.hasElevator ? ' (Aufzug)' : ''}` : ''}
            </p>
          ) : null}
          {order.customerPhone ? <p>Tel. {order.customerPhone}</p> : null}
          {order.reference || order.costCenter ? (
            <p>
              {order.reference ? `Referenz: ${order.reference}` : ''}
              {order.reference && order.costCenter ? ' · ' : ''}
              {order.costCenter ? `Kostenstelle: ${order.costCenter}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      {order.notes || a?.notes || order.carryService ? (
        <div style={{ marginTop: '10pt', padding: '8pt 10pt', background: '#fef3c7', border: '1pt solid #f59e0b', borderRadius: '6pt' }}>
          <strong>Hinweise: </strong>
          {[order.carryService ? 'Tragservice bis in die Wohnung' : null, a?.notes, order.notes].filter(Boolean).join(' · ')}
        </div>
      ) : null}

      <table style={{ marginTop: '14pt' }}>
        <thead>
          <tr>
            <th style={{ width: '22pt' }}>✓</th>
            <th style={{ width: '42pt' }}>Menge</th>
            <th>Artikel</th>
            <th style={{ width: '70pt' }}>Lagerplatz</th>
            <th style={{ width: '80pt' }}>Art.-Nr.</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = products.get(l.productId);
            return (
              <tr key={l.productId}>
                <td>
                  <span style={{ display: 'inline-block', width: '11pt', height: '11pt', border: '1.2pt solid #0f172a', borderRadius: '2pt' }} />
                </td>
                <td style={{ fontWeight: 800, fontSize: '13pt' }}>{l.qty}×</td>
                <td>
                  <strong>{l.name}</strong>
                  <br />
                  <span style={{ color: '#475569', fontSize: '9.5pt' }}>
                    {l.packaging}
                    {l.isRental ? ' · Leihartikel' : ''}
                  </span>
                </td>
                <td>{p?.location ?? '–'}</td>
                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9pt' }}>{p?.sku ?? '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12pt', marginTop: '12pt' }}>
        <div>
          <p style={{ fontWeight: 700 }}>Summe: {orderCrates(order)} Gebinde</p>
          {order.emptiesReturn.length ? (
            <>
              <p style={{ fontWeight: 700, marginTop: '6pt' }}>Leergut mitnehmen / annehmen:</p>
              <ul style={{ margin: '2pt 0 0 12pt', listStyle: 'disc' }}>
                {order.emptiesReturn.map((l) => (
                  <li key={l.depositTypeId}>
                    {l.qty}× {depositTypes.find((d) => d.id === l.depositTypeId)?.shortName ?? l.depositTypeId}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p>Zahlart: {PAYMENT_METHOD_LABEL[order.paymentMethod]}</p>
          <p style={{ fontSize: '13pt', fontWeight: 800 }}>
            {toCollect ? 'Zu kassieren: ' : 'Betrag: '}
            {formatEuro(order.totals.total)}
          </p>
          {!toCollect ? <p style={{ fontSize: '9pt', color: '#475569' }}>{order.paymentStatus === 'paid' ? 'bereits bezahlt' : 'per Rechnung/Lastschrift'}</p> : null}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24pt', marginTop: '36pt' }}>
        <div style={{ borderTop: '1pt solid #0f172a', paddingTop: '4pt', fontSize: '9pt', color: '#475569' }}>Kommissioniert von / Datum</div>
        <div style={{ borderTop: '1pt solid #0f172a', paddingTop: '4pt', fontSize: '9pt', color: '#475569' }}>Kontrolliert / verladen</div>
      </div>
    </div>
  );
}

/** Unsichtbar am Bildschirm; erscheint beim Drucken (window.print) als einzige Seite */
export function PickingSlipPrint(props: PickingSlipProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ops-print-sheet" aria-hidden>
      <style>{PRINT_CSS}</style>
      <SlipContent {...props} />
    </div>,
    document.body,
  );
}

/** Vorschau am Bildschirm (gleicher Inhalt, in einer Karte) */
export function PickingSlipPreview(props: PickingSlipProps) {
  return (
    <div className="mx-auto max-w-[46rem] rounded-xl border border-slate-200 bg-white p-6 text-[13px] leading-relaxed text-slate-900 shadow-sm [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:border-slate-200 [&_td]:px-1 [&_td]:py-2 [&_td]:align-top [&_th]:border-b-2 [&_th]:border-slate-800 [&_th]:px-1 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide">
      <SlipContent {...props} />
    </div>
  );
}
