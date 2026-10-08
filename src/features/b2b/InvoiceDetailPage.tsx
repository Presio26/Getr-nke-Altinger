import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, FileSearch, FileText, LayoutDashboard, Printer } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { ApiError } from '@shared/api';
import { api } from '@/api/client';
import { qk, useDepositTypes, useMyInvoices, useProductMap } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useNow } from '@/lib/hooks';
import { printPage } from '@/lib/download';
import { Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { BusinessNav } from './components/BusinessNav';
import { InvoiceDocument } from './components/InvoiceDocument';
import { InvoiceStatusBadge } from './components/InvoiceStatusBadge';
import { dueText } from './lib/b2b';

const BODY_CLASS = 'invoice-print-mode';

/**
 * Druck: Nur die Rechnung (#invoice-print-root, per Portal direkt im <body>) wird gedruckt,
 * der App-Rahmen (#root, Toasts, Dialoge) wird ausgeblendet – solange diese Seite offen ist.
 */
const PRINT_CSS = `
#invoice-print-root { display: none; }
@media print {
  @page { size: A4; margin: 14mm 16mm 14mm 18mm; }
  html, body { background: #fff !important; }
  body.${BODY_CLASS} { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
  body.${BODY_CLASS} > *:not(#invoice-print-root) { display: none !important; }
  body.${BODY_CLASS} #invoice-print-root { display: block !important; }
  #invoice-print-root, #invoice-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #invoice-print-root table { page-break-inside: auto; }
  #invoice-print-root tr { page-break-inside: avoid; }
}
`;

/** Rechnung als druckfertige A4-Ansicht (Geschäftskunde: eigene, Markt: alle) */
export default function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams();
  const now = useNow(60_000);
  const role = useSession((s) => s.user?.role ?? null);
  const authenticated = useSession((s) => s.status === 'authenticated');
  const productMap = useProductMap();
  const depositTypes = useDepositTypes();
  const isAdmin = role === 'admin';
  const backTo = isAdmin ? '/admin/rechnungen' : '/business/rechnungen';

  // Geschäftskunden: nur eigene Rechnungen anfragen (veraltete/fremde Links → sofort „nicht gefunden“)
  const mine = useMyInvoices();
  const notMine = !isAdmin && mine.isSuccess && !mine.data.some((i) => i.id === invoiceId);
  const query = useQuery({
    queryKey: qk.invoice(invoiceId),
    queryFn: () => api.getInvoice(invoiceId),
    enabled: authenticated && !!invoiceId && (isAdmin || (mine.isSuccess && !notMine)),
    retry: (count, err) => !(err instanceof ApiError && (err.code === 'not_found' || err.code === 'forbidden')) && count < 2,
  });

  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, []);

  const data = query.data;
  const notFound = notMine || (query.error instanceof ApiError && (query.error.code === 'not_found' || query.error.code === 'forbidden'));
  const orderHref = (o: Order) => (isAdmin ? `/admin/bestellungen/${o.id}` : `/bestellung/${o.id}`);

  const header = (
    <PageHeader
      back={backTo}
      title={data ? `Rechnung ${data.invoice.number.replace(/-/g, '\u2011')}` : 'Rechnung'}
      documentTitle={data ? `Rechnung ${data.invoice.number}` : 'Rechnung'}
      subtitle={
        data ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <InvoiceStatusBadge status={data.invoice.status} />
            <span>
              {formatEuro(data.invoice.gross)} · {dueText(data.invoice, now)}
            </span>
            {isAdmin ? (
              <span className="inline-flex items-center gap-1">
                · <Building2 size={14} aria-hidden /> {data.customer.name}
              </span>
            ) : null}
          </span>
        ) : undefined
      }
      actions={
        <>
          <ButtonLink to={backTo} variant="outline" icon={ArrowLeft} className="flex-1 sm:flex-none">
            Zurück
          </ButtonLink>
          <Button icon={Printer} onClick={printPage} disabled={!data} className="flex-1 sm:flex-none">
            <span className="sm:hidden">Drucken / PDF</span>
            <span className="hidden sm:inline">Drucken / als PDF speichern</span>
          </Button>
        </>
      }
    />
  );

  // Nicht gefunden – gleiches Muster wie im Shop: Seitenüberschrift (h1) + EmptyState mit Aktionen
  if (notFound) {
    return (
      <div className="no-print">
        {!isAdmin ? <BusinessNav /> : null}
        <PageHeader title="Rechnung nicht gefunden" back={backTo} />
        <Card padding="none">
          <EmptyState
            icon={FileSearch}
            title="Diese Rechnung gibt es nicht – oder sie gehört zu einem anderen Konto"
            description="Bitte prüfen Sie den Link. Alle Ihre Rechnungen finden Sie jederzeit in der Übersicht."
            action={
              <>
                <ButtonLink to={backTo} icon={FileText}>
                  Zur Rechnungsübersicht
                </ButtonLink>
                <ButtonLink to={isAdmin ? '/admin' : '/business'} variant="outline" icon={LayoutDashboard}>
                  {isAdmin ? 'Zum Dashboard' : 'Zum Geschäftskunden-Portal'}
                </ButtonLink>
              </>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="no-print">
      <style>{PRINT_CSS}</style>
      {!isAdmin ? <BusinessNav /> : null}
      {header}

      {query.isError || (!isAdmin && mine.isError) ? (
        <Card padding="none">
          <ErrorState
            error={query.error ?? mine.error}
            onRetry={() => void (mine.isError ? mine.refetch() : query.refetch())}
            action={
              <ButtonLink to={backTo} variant="outline" icon={ArrowLeft}>
                Zur Rechnungsübersicht
              </ButtonLink>
            }
          />
        </Card>
      ) : !data ? (
        <div className="mx-auto w-full max-w-[210mm] rounded-2xl bg-white px-5 py-6 shadow-raised ring-1 ring-slate-200/80 sm:px-[14mm] sm:py-[13mm]">
          <div className="flex justify-between">
            <Skeleton className="h-12 w-44" />
            <Skeleton className="hidden h-16 w-40 sm:block" />
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="mt-10 h-7 w-64" />
          <div className="mt-6 space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-center text-[13px] text-slate-500 sm:hidden">Tipp: Für die A4-Ansicht „Drucken / PDF“ wählen.</p>
          <InvoiceDocument
            invoice={data.invoice}
            orders={data.orders}
            customer={data.customer}
            settings={data.settings}
            productMap={productMap}
            depositTypes={depositTypes}
            orderHref={orderHref}
          />
          <p className="mx-auto mt-4 max-w-[210mm] text-center text-[13px] text-slate-400">
            Rechnung vom {formatDate(data.invoice.date, 'long')} · {data.orders.length} {data.orders.length === 1 ? 'Lieferung' : 'Lieferungen'}
          </p>
          {createPortal(
            <div id="invoice-print-root">
              <InvoiceDocument
                invoice={data.invoice}
                orders={data.orders}
                customer={data.customer}
                settings={data.settings}
                productMap={productMap}
                depositTypes={depositTypes}
                variant="print"
              />
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
