import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Customer, DepositType, ID, Invoice, Order, Product, StoreSettings } from '@shared/types';
import { formatDate, formatEuro, formatNumber, PAYMENT_METHOD_LABEL } from '@shared/format';
import { diffDays } from '@shared/time';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { buildInvoiceLayout } from '../lib/invoiceLayout';

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

function deliveredOn(o: Order): string {
  return o.proof?.at ?? o.slot.date;
}


/** Druckfertige Rechnung (A4) mit Briefkopf, Positionen je Lieferschein und Zahlungshinweis */
export function InvoiceDocument({ invoice, orders, customer, settings, productMap, depositTypes, variant = 'screen', orderHref }: InvoiceDocumentProps) {
  const print = variant === 'print';
  const b2b = customer.b2b;
  const billing = customer.addresses.find((a) => a.id === customer.defaultAddressId) ?? customer.addresses[0] ?? orders.find((o) => o.address)?.address;
  const layout = buildInvoiceLayout(invoice, orders, depositTypes);
  const sorted = layout.notes.map((n) => n.order);
  const days = sorted.map((o) => deliveredOn(o).slice(0, 10)).sort();
  const period = days.length ? (days[0] === days[days.length - 1] ? formatDate(days[0], 'short') : `${formatDate(days[0], 'short')} – ${formatDate(days[days.length - 1], 'short')}`) : '—';
  const termDays = Math.max(0, diffDays(invoice.date, invoice.dueDate));
  const allSepa = sorted.length > 0 && sorted.every((o) => o.paymentMethod === 'sepa');
  let pos = 0;

  const th = cn('whitespace-nowrap px-1.5 py-2 font-semibold text-slate-500', print ? 'text-[7.5pt] uppercase tracking-wide' : 'text-[11px] uppercase tracking-wide');
  const td = 'px-1.5 py-1.5';
  /** Pfand-/Leergut-/Gebührenzeilen: kompakter */
  const tdx = 'px-1.5 py-1';
  const hideNarrow = print ? '' : 'hidden sm:table-cell';
  /** Spaltenbreiten nur ab sm bzw. im Druck */
  const w = (cls: string) => (print ? cls : cls.split(' ').map((c) => `sm:${c}`).join(' '));

  const totalRow = (label: ReactNode, value: string, opts: { strong?: boolean; muted?: boolean; rule?: boolean } = {}) => (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6 py-1',
        opts.strong && 'mt-1 border-t-2 border-slate-900 pt-2 font-bold text-slate-900',
        opts.rule && 'mt-1 border-t border-slate-300 pt-1.5',
        opts.muted && 'text-slate-500',
      )}
    >
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
        {layout.notes.map((note) => {
          const o = note.order;
          const href = orderHref?.(o);
          const subRow = (label: ReactNode, value: number, strong = false) => (
            <tr className={cn('align-top', strong ? 'border-t border-slate-300 font-semibold text-slate-900' : 'border-t border-slate-200 text-slate-700')}>
              {print ? (
                <td className={cn(td, 'text-right')} colSpan={6}>
                  {label}
                </td>
              ) : (
                <>
                  <td className={cn(td, '!pl-1 sm:hidden')}>{label}</td>
                  <td className={cn(td, 'hidden text-right sm:table-cell')} colSpan={6}>
                    {label}
                  </td>
                </>
              )}
              <td className={cn(td, 'whitespace-nowrap !pr-1 text-right tabular-nums')}>{formatEuro(value)}</td>
            </tr>
          );
          return (
            <section key={o.id} className={print ? undefined : 'break-inside-avoid-page'}>
              <div
                className={cn(
                  'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg bg-slate-100/80 px-3 py-2',
                  print && 'break-after-avoid text-[8.5pt]',
                )}
              >
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
                    <th scope="col" className={cn(th, w('w-10'), '!pl-1', hideNarrow)}>
                      Pos.
                    </th>
                    <th scope="col" className={cn(th, hideNarrow, w('w-[24mm]'))}>
                      Art.-Nr.
                    </th>
                    <th scope="col" className={cn(th, !print && '!pl-1 sm:!pl-1.5')}>
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
                        <td className={cn(td, '!pl-1 tabular-nums text-slate-500', hideNarrow)}>{pos}</td>
                        <td className={cn(td, 'whitespace-nowrap font-mono tabular-nums text-slate-500', hideNarrow, print ? 'text-[8pt]' : 'text-[12px]')}>{sku}</td>
                        <td className={cn(td, !print && '!pl-1 sm:!pl-1.5')}>
                          <span className="block font-medium text-slate-900">{l.name}</span>
                          <span className="block text-slate-500">
                            {l.packaging}
                            {l.priceNote ? ` · ${l.priceNote.replace(/ %/g, ' %')}` : ''}
                            {!print ? (
                              <span className="block font-medium text-slate-600 sm:hidden">
                                {formatNumber(l.qty)} × {formatEuro(l.unitNet)} netto · {l.vatRate}&nbsp;% MwSt.
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
                <tbody className={cn('border-t border-slate-200', print ? 'text-[8.5pt]' : 'text-[12.5px]')}>
                  {note.extras.length ? subRow('Warenwert netto', note.goodsNet) : null}
                  {note.extras.map((x) => (
                    <tr key={x.key} className="align-top text-slate-600">
                      <td className={cn(tdx, hideNarrow)} />
                      <td className={cn(tdx, hideNarrow)} />
                      <td className={cn(tdx, !print && '!pl-1 sm:!pl-1.5')}>
                        <span className={cn('text-slate-800', !print && 'block sm:inline')}>
                          {x.kind === 'deposit' ? `Pfand ${x.label}` : x.kind === 'refund' ? `Leergut-Rücknahme ${x.label}` : x.label}
                        </span>
                        {x.unitGross ? (
                          <>
                            <span className={cn('text-slate-500', !print && 'hidden sm:inline')}>
                              {' '}
                              <span className="whitespace-nowrap">à {formatEuro(x.unitGross)} brutto</span>
                            </span>
                            {!print ? (
                              <span className="block text-slate-500 sm:hidden">
                                {formatNumber(x.qty ?? 0)} × {formatEuro(x.unitGross)} brutto{x.rate ? ` · ${x.rate}\u00a0% MwSt.` : ''}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                      <td className={cn(tdx, hideNarrow, 'text-right tabular-nums')}>{x.qty ? formatNumber(x.qty) : ''}</td>
                      <td className={cn(tdx, hideNarrow)} />
                      <td className={cn(tdx, 'whitespace-nowrap text-right tabular-nums text-slate-500', hideNarrow)}>{x.rate ? `${x.rate} %` : ''}</td>
                      <td className={cn(tdx, 'whitespace-nowrap !pr-1 text-right tabular-nums text-slate-900')}>{formatEuro(x.net)}</td>
                    </tr>
                  ))}
                  {subRow(note.extras.length ? `Summe Lieferschein ${o.number} netto` : 'Warenwert netto', note.totalNet, true)}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      {/* Summen – alle Werte vom Core; netto + MwSt. = Rechnungsbetrag */}
      <section className={cn('mt-6 flex break-inside-avoid', print ? 'justify-end' : 'sm:justify-end')}>
        <dl className={print ? 'w-[92mm]' : 'w-full sm:w-[96mm]'}>
          {totalRow('Warenwert netto', formatEuro(layout.goodsNet + layout.goodsAdjust))}
          {layout.feesNet ? totalRow('Liefer-/Servicegebühren netto', formatEuro(layout.feesNet)) : null}
          {layout.discountNet ? totalRow('Rabatt netto', formatEuro(-layout.discountNet)) : null}
          {layout.deposit ? totalRow('Pfand netto', formatEuro(layout.deposit)) : null}
          {layout.depositRefund ? totalRow('Leergut-Rücknahme netto', formatEuro(-layout.depositRefund)) : null}
          {totalRow(<span className="font-semibold text-slate-900">Summe netto</span>, formatEuro(layout.subtotalNet), { rule: true })}
          {layout.vat.map((v) => (
            <Fragment key={v.rate}>
              {totalRow(
                <>
                  zzgl. MwSt.{Number.isFinite(v.rate) ? ` ${v.rate} %` : ''}
                  {v.base !== undefined && layout.vat.length > 1 ? <span className="text-slate-500"> auf {formatEuro(v.base)}</span> : null}
                </>,
                formatEuro(v.vat),
              )}
            </Fragment>
          ))}
          {totalRow('Rechnungsbetrag', formatEuro(layout.gross), { strong: true })}
        </dl>
      </section>
      <p className={cn('mt-2 text-right text-slate-500', print ? 'text-[7.5pt]' : 'text-[11px]')}>
        Pfand und Leergut-Rücknahme netto; die Umsatzsteuer darauf ist in der MwSt. enthalten (Leergut mindert das Entgelt).
      </p>

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
