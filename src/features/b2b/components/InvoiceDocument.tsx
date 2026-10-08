import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Customer, DepositType, ID, Invoice, Order, Product, StoreSettings } from '@shared/types';
import { formatDate, formatEuro, formatNumber, PAYMENT_METHOD_LABEL } from '@shared/format';
import { diffDays } from '@shared/time';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { emptiesLines } from '../lib/b2b';

/** Bankverbindung der Demo – bewusst als Platzhalter gekennzeichnet */
export const DEMO_IBAN = 'DE00 0000 0000 0000 0000 00 (Demo)';

export interface InvoiceDocumentProps {
  invoice: Invoice;
  orders: Order[];
  customer: Customer;
  settings: StoreSettings;
  productMap: Map<ID, Product>;
  depositTypes: DepositType[];
  /** screen = Karte in der App (responsiv), print = feste A4-Darstellung für den Druck */
  variant?: 'screen' | 'print';
  /** Link-Ziel für Lieferscheine (nur Bildschirm) */
  orderHref?: (order: Order) => string;
}

/** MwSt. je Steuersatz – exakt wie der Core rechnet, Rundungsrest beim größten Satz (Summe = invoice.vat) */
function vatByRate(orders: readonly Order[], total: number): { rate: number; vat: number }[] {
  const exact = new Map<number, number>();
  for (const o of orders) {
    const itemsGross = o.lines.reduce((s, l) => s + l.lineGross, 0);
    const fees = o.totals.deliveryFee + o.totals.carryFee;
    if (itemsGross > 0) {
      const byRate = new Map<number, number>();
      for (const l of o.lines) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + l.lineGross);
      for (const [rate, gross] of byRate) {
        const share = gross / itemsGross;
        const base = gross - o.totals.discount * share + fees * share;
        exact.set(rate, (exact.get(rate) ?? 0) + (base * rate) / (100 + rate));
      }
    } else if (fees > 0) {
      exact.set(19, (exact.get(19) ?? 0) + (fees * 19) / 119);
    }
  }
  const list = [...exact].map(([rate, v]) => ({ rate, vat: Math.round(v) })).sort((a, b) => b.rate - a.rate);
  if (!list.length) return [{ rate: 19, vat: total }];
  const diff = total - list.reduce((s, x) => s + x.vat, 0);
  if (diff) {
    const biggest = list.reduce((a, b) => (b.vat > a.vat ? b : a));
    biggest.vat += diff;
  }
  return list.filter((x) => x.vat !== 0 || list.length === 1);
}

function deliveredOn(o: Order): string {
  return o.proof?.at ?? o.slot.date;
}

/** Druckfertige Rechnung (A4) mit Briefkopf, Positionen je Lieferschein und Zahlungshinweis */
export function InvoiceDocument({ invoice, orders, customer, settings, productMap, depositTypes, variant = 'screen', orderHref }: InvoiceDocumentProps) {
  const print = variant === 'print';
  const b2b = customer.b2b;
  const billing = customer.addresses.find((a) => a.id === customer.defaultAddressId) ?? customer.addresses[0] ?? orders.find((o) => o.address)?.address;
  const sorted = [...orders].sort((a, b) => deliveredOn(a).localeCompare(deliveredOn(b)) || a.number.localeCompare(b.number));
  const days = sorted.map((o) => deliveredOn(o).slice(0, 10)).sort();
  const period = days.length ? (days[0] === days[days.length - 1] ? formatDate(days[0], 'short') : `${formatDate(days[0], 'short')} – ${formatDate(days[days.length - 1], 'short')}`) : '—';
  const termDays = Math.max(0, diffDays(invoice.date, invoice.dueDate));

  const linesNet = sorted.reduce((s, o) => s + o.lines.reduce((x, l) => x + l.lineNet, 0), 0);
  const discountGross = sorted.reduce((s, o) => s + o.totals.discount, 0);
  const feesGross = sorted.reduce((s, o) => s + o.totals.deliveryFee + o.totals.carryFee, 0);
  const discountNet = Math.round((discountGross * 100) / 119);
  const feesNet = Math.round((feesGross * 100) / 119);
  const rounding = invoice.net - (linesNet - discountNet + feesNet);
  const vats = vatByRate(sorted, invoice.vat);
  const allSepa = sorted.length > 0 && sorted.every((o) => o.paymentMethod === 'sepa');
  let pos = 0;

  const th = cn('whitespace-nowrap px-1.5 py-2 font-semibold text-slate-500', print ? 'text-[7.5pt] uppercase tracking-wide' : 'text-[11px] uppercase tracking-wide');
  const td = 'px-1.5 py-1.5';
  const hideNarrow = print ? '' : 'hidden sm:table-cell';
  /** Spaltenbreiten nur ab sm bzw. im Druck */
  const w = (cls: string) => (print ? cls : cls.split(' ').map((c) => `sm:${c}`).join(' '));

  const totalRow = (label: ReactNode, value: string, opts: { strong?: boolean; muted?: boolean } = {}) => (
    <div className={cn('flex items-baseline justify-between gap-6 py-1', opts.strong && 'mt-1 border-t-2 border-slate-900 pt-2 font-bold text-slate-900', opts.muted && 'text-slate-500')}>
      <dt>{label}</dt>
      <dd className={cn('tabular-nums', opts.strong ? (print ? 'text-[12pt]' : 'text-base') : '')}>{value}</dd>
    </div>
  );

  return (
    <article
      aria-label={`Rechnung ${invoice.number}`}
      className={cn(
        'invoice-document bg-white text-slate-800',
        print
          ? 'w-full text-[9.5pt] leading-[1.45]'
          : 'mx-auto w-full max-w-[210mm] rounded-2xl px-5 py-6 text-[13px] leading-relaxed shadow-raised ring-1 ring-slate-200/80 sm:min-h-[297mm] sm:px-[14mm] sm:py-[13mm]',
      )}
    >
      {/* Briefkopf */}
      <header className="flex items-start justify-between gap-6">
        <Logo className={print ? 'h-[15mm]' : 'h-11 sm:h-14'} />
        <div className={cn('text-right text-slate-500', print ? 'text-[8.5pt]' : 'hidden text-xs sm:block')}>
          <p className="font-semibold text-slate-800">{settings.legalName}</p>
          <p>{settings.street}</p>
          <p>
            {settings.zip} {settings.city}
          </p>
          <p className="mt-1">Tel. {settings.phone}</p>
          <p>{settings.email}</p>
        </div>
      </header>

      {/* Anschrift + Rechnungsdaten */}
      <section className={cn('grid gap-6', print ? 'mt-[12mm] grid-cols-[1fr_auto] gap-x-[8mm]' : 'mt-8 grid-cols-1 sm:mt-[12mm] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-10')}>
        <div>
          <p className={cn('mb-2 border-b border-slate-300 pb-0.5 text-slate-500', print ? 'inline-block whitespace-nowrap text-[6.5pt]' : 'inline-block text-[10px]')}>
            {settings.legalName} · {settings.street} · {settings.zip} {settings.city}
          </p>
          <address className="not-italic leading-snug">
            <span className="block font-semibold text-slate-900">{customer.name}</span>
            {customer.contactName && customer.contactName !== customer.name ? <span className="block">z. Hd. {customer.contactName}</span> : null}
            {billing ? (
              <>
                <span className="block">{billing.street}</span>
                <span className="block">
                  {billing.zip} {billing.city}
                </span>
              </>
            ) : null}
          </address>
        </div>
        <dl className={cn('grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start rounded-xl bg-slate-50 p-3.5', print && 'text-[8.5pt]')}>
          {(
            [
              ['Rechnungsnr.', invoice.number],
              ['Rechnungsdatum', formatDate(invoice.date, 'short')],
              ['Kundennr.', b2b?.customerNumber ?? '—'],
              ...(b2b?.vatId ? [['USt-IdNr.', b2b.vatId]] : []),
              ['Leistungszeitraum', period],
              ['Fällig am', formatDate(invoice.dueDate, 'short')],
            ] as [string, string][]
          ).map(([k, v]) => (
            <Fragment key={k}>
              <dt className="whitespace-nowrap text-slate-500">{k}</dt>
              <dd className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">{v}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <h2 className={cn('font-bold tracking-tight text-slate-900', print ? 'mt-[10mm] text-[16pt]' : 'mt-8 text-xl sm:mt-[10mm] sm:text-2xl')}>
        Rechnung {invoice.number}
      </h2>
      <p className="mt-2 text-slate-600">
        Sehr geehrte Damen und Herren, für unsere Lieferungen im Zeitraum {period} berechnen wir Ihnen wie folgt. Vielen Dank für Ihren Auftrag!
      </p>

      {/* Positionen je Lieferschein */}
      <div className="mt-6 space-y-5">
        {sorted.map((o) => {
          const lineNet = o.lines.reduce((s, l) => s + l.lineNet, 0);
          const deposits = new Map<string, { label: string; qty: number; amount: number }>();
          for (const l of o.lines) {
            if (!l.depositUnit || !l.depositTypeId) continue;
            const type = depositTypes.find((d) => d.id === l.depositTypeId);
            const d = deposits.get(l.depositTypeId) ?? { label: type?.shortName ?? 'Pfand', qty: 0, amount: l.depositUnit };
            d.qty += l.qty;
            deposits.set(l.depositTypeId, d);
          }
          const empties = emptiesLines(o.proof?.emptiesCollected ?? o.emptiesReturn, depositTypes);
          const href = orderHref?.(o);
          return (
            <section key={o.id} className="break-inside-avoid-page">
              <div className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg bg-slate-100/80 px-3 py-2', print && 'text-[8.5pt]')}>
                <p className="font-semibold text-slate-900">
                  Lieferschein{' '}
                  {href && !print ? (
                    <Link to={href} className="text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700">
                      {o.number}
                    </Link>
                  ) : (
                    o.number
                  )}{' '}
                  <span className="font-normal text-slate-500">· {o.fulfillment === 'pickup' ? 'abgeholt' : 'geliefert'} am {formatDate(deliveredOn(o), 'short')}</span>
                </p>
                <p className="text-slate-500">
                  {[o.reference ? `Ihre Ref.: ${o.reference}` : null, o.costCenter ? `Kostenstelle: ${o.costCenter}` : null, PAYMENT_METHOD_LABEL[o.paymentMethod]]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <table className="mt-1 w-full border-collapse text-left">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th scope="col" className={cn(th, w('w-10'), '!pl-1')}>
                      Pos.
                    </th>
                    <th scope="col" className={cn(th, hideNarrow, w('w-[24mm]'))}>
                      Art.-Nr.
                    </th>
                    <th scope="col" className={th}>
                      Bezeichnung
                    </th>
                    <th scope="col" className={cn(th, hideNarrow, w('w-16'), 'text-right')}>
                      Menge
                    </th>
                    <th scope="col" className={cn(th, hideNarrow, w('w-[24mm]'), 'text-right')}>
                      Einzel netto
                    </th>
                    <th scope="col" className={cn(th, hideNarrow, w('w-14'), 'text-right')}>
                      MwSt.
                    </th>
                    <th scope="col" className={cn(th, w('w-[26mm]'), '!pr-1 text-right')}>
                      Gesamt netto
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {o.lines.map((l) => {
                    pos += 1;
                    const sku = productMap.get(l.productId)?.sku ?? '—';
                    return (
                      <tr key={l.productId} className="align-top">
                        <td className={cn(td, '!pl-1 tabular-nums text-slate-500')}>{pos}</td>
                        <td className={cn(td, 'whitespace-nowrap font-mono tabular-nums text-slate-500', hideNarrow, print ? 'text-[8pt]' : 'text-[12px]')}>{sku}</td>
                        <td className={td}>
                          <span className="block font-medium text-slate-900">{l.name}</span>
                          <span className="block text-slate-500">
                            {l.packaging}
                            {l.priceNote ? ` · ${l.priceNote.replace(/ %/g, '\u00a0%')}` : ''}
                            {!print ? (
                              <span className="block font-medium text-slate-600 sm:hidden">
                                {formatNumber(l.qty)} × {formatEuro(l.unitNet)} netto
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className={cn(td, hideNarrow, 'text-right tabular-nums')}>{formatNumber(l.qty)}</td>
                        <td className={cn(td, hideNarrow, 'whitespace-nowrap text-right tabular-nums')}>{formatEuro(l.unitNet)}</td>
                        <td className={cn(td, 'whitespace-nowrap text-right tabular-nums text-slate-500', hideNarrow)}>{l.vatRate} %</td>
                        <td className={cn(td, 'whitespace-nowrap !pr-1 text-right font-medium tabular-nums text-slate-900')}>{formatEuro(l.lineNet)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className={cn('mt-1 flex flex-col gap-0.5 border-t border-slate-200 pt-1.5 text-slate-600 sm:flex-row sm:items-start sm:justify-between sm:gap-6', print && '!flex-row justify-between gap-6 text-[8.5pt]')}>
                <div className="min-w-0 space-y-0.5">
                  {[...deposits.values()].map((d) => (
                    <p key={`d-${d.label}`}>
                      Pfand: {d.qty} × {d.label} à {formatEuro(d.amount)} = <span className="tabular-nums">{formatEuro(d.qty * d.amount)}</span>
                    </p>
                  ))}
                  {empties.map((e) => (
                    <p key={`e-${e.type.id}`}>
                      Leergut-Rücknahme: {e.qty} × {e.type.shortName} = <span className="tabular-nums">{formatEuro(-e.value)}</span>
                    </p>
                  ))}
                  {o.totals.deliveryFee + o.totals.carryFee > 0 ? <p>Liefer-/Servicegebühr brutto: {formatEuro(o.totals.deliveryFee + o.totals.carryFee)}</p> : null}
                </div>
                <p className="shrink-0 font-semibold text-slate-900">
                  Warenwert netto <span className="ml-2 tabular-nums">{formatEuro(lineNet)}</span>
                </p>
              </div>
            </section>
          );
        })}
      </div>

      {/* Summen */}
      <section className={cn('mt-6 flex', print ? 'justify-end' : 'sm:justify-end')}>
        <dl className={print ? 'w-[82mm]' : 'w-full sm:w-[82mm]'}>
          {totalRow('Summe Positionen netto', formatEuro(linesNet))}
          {discountGross ? totalRow('Rabatt netto', formatEuro(-discountNet)) : null}
          {feesGross ? totalRow('Liefer-/Servicegebühren netto', formatEuro(feesNet)) : null}
          {rounding ? totalRow('Rundungsausgleich', formatEuro(rounding), { muted: true }) : null}
          <div className="my-1 border-t border-slate-200" />
          {totalRow(<span className="font-semibold text-slate-900">Nettobetrag</span>, formatEuro(invoice.net))}
          {vats.map((v) => (
            <Fragment key={v.rate}>{totalRow(`zzgl. MwSt. ${v.rate} %`, formatEuro(v.vat))}</Fragment>
          ))}
          {totalRow('zzgl. Pfand', formatEuro(invoice.deposit))}
          {invoice.depositRefund ? totalRow('abzgl. Leergut-Rücknahme', formatEuro(-invoice.depositRefund)) : null}
          {totalRow('Rechnungsbetrag', formatEuro(invoice.gross), { strong: true })}
        </dl>
      </section>

      {/* Zahlungshinweis */}
      <section
        className={cn(
          'mt-6 rounded-xl border p-4 break-inside-avoid',
          invoice.status === 'paid' ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/70',
          print && 'text-[9pt]',
        )}
      >
        {invoice.status === 'paid' ? (
          <p>
            <span className="font-semibold text-emerald-800">Bezahlt.</span> Der Rechnungsbetrag von {formatEuro(invoice.gross)} ist
            {invoice.paidAt ? ` am ${formatDate(invoice.paidAt, 'short')}` : ''} bei uns eingegangen – vielen Dank.
          </p>
        ) : allSepa ? (
          <p>
            <span className="font-semibold text-slate-900">Zahlung per SEPA-Lastschrift:</span> Der Rechnungsbetrag von {formatEuro(invoice.gross)} wird zum{' '}
            {formatDate(invoice.dueDate, 'short')} von Ihrem Konto eingezogen. Bitte sorgen Sie für ausreichende Deckung.
          </p>
        ) : (
          <>
            <p>
              <span className="font-semibold text-slate-900">Zahlungshinweis:</span> Bitte überweisen Sie den Rechnungsbetrag von{' '}
              <span className="font-semibold tabular-nums">{formatEuro(invoice.gross)}</span> ohne Abzug bis zum{' '}
              <span className="font-semibold">{formatDate(invoice.dueDate, 'short')}</span> ({termDays} Tage netto).
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <dt className="text-slate-500">Kontoinhaber</dt>
              <dd className="font-medium">{settings.legalName}</dd>
              <dt className="text-slate-500">IBAN</dt>
              <dd className="font-mono font-medium tabular-nums">{DEMO_IBAN}</dd>
              <dt className="text-slate-500">Verwendungszweck</dt>
              <dd className="font-medium">
                {invoice.number}
                {b2b?.customerNumber ? ` / ${b2b.customerNumber}` : ''}
              </dd>
            </dl>
          </>
        )}
      </section>

      <p className="mt-5 text-slate-600">
        Bei Fragen zu dieser Rechnung erreichen Sie uns unter {settings.phone} oder {settings.email}. Mit freundlichen Grüßen – Ihr Team von {settings.name}
      </p>

      {/* Fußzeile */}
      <footer className={cn('mt-8 border-t border-slate-200 pt-3 text-slate-400', print ? 'text-[7.5pt]' : 'text-[11px]')}>
        <div className={cn('grid gap-x-4 gap-y-2', print ? 'grid-cols-[1.25fr_1fr_1.1fr]' : 'grid-cols-1 sm:grid-cols-[1.25fr_1fr_1.1fr]')}>
          <p>
            {settings.legalName}
            <br />
            {settings.street} · {settings.zip} {settings.city}
          </p>
          <p>
            Tel. {settings.phone}
            <br />
            {settings.email}
          </p>
          <p>
            Bankverbindung (Demo)
            <br />
            <span className="whitespace-nowrap">IBAN {DEMO_IBAN.replace(' (Demo)', '')}</span>
          </p>
        </div>
        <p className="mt-2">Demo-Rechnung aus der Getränke-Altinger-App mit fiktiven Daten – kein steuerlich gültiger Beleg.</p>
      </footer>
    </article>
  );
}
