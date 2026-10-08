import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock, Printer } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '@shared/types';
import { formatDate, formatEuro, INVOICE_STATUS_LABEL } from '@shared/format';
import { diffDays, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Badge, Button, ButtonLink, ConfirmModal, type BadgeTone } from '@/components/ui';

const TONE: Record<InvoiceStatus, BadgeTone> = { open: 'info', overdue: 'danger', paid: 'success' };
const ICON = { open: Clock, overdue: AlertTriangle, paid: CheckCircle2 } as const;

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge tone={TONE[status]} icon={ICON[status]}>
      {INVOICE_STATUS_LABEL[status].replace(/^./, (c) => c.toUpperCase())}
    </Badge>
  );
}

/** "fällig in 5 Tagen" / "heute fällig" / "seit 3 Tagen überfällig" / "bezahlt am 03.10.2026" */
export function dueText(inv: Invoice, today = todayString()): string {
  if (inv.status === 'paid') return inv.paidAt ? `bezahlt am ${formatDate(inv.paidAt, 'short')}` : 'bezahlt';
  const d = diffDays(today, inv.dueDate);
  if (d === 0) return 'heute fällig';
  if (d === 1) return 'morgen fällig';
  if (d > 0) return `fällig in ${d} Tagen`;
  if (d === -1) return 'seit gestern überfällig';
  return `seit ${-d} Tagen überfällig`;
}

export function invoicePrintPath(inv: Invoice): string {
  return `/business/rechnungen/${encodeURIComponent(inv.id)}`;
}

/** Druckansicht der Rechnung (B2B-Rechnungsseite, für den Markt freigegeben) */
export function PrintInvoiceButton({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  return (
    <ButtonLink
      to={invoicePrintPath(invoice)}
      size="sm"
      variant="ghost"
      icon={Printer}
      aria-label={`Druckansicht ${invoice.number} öffnen`}
      title="Druckansicht öffnen"
      className={compact ? 'w-9 px-0' : undefined}
    >
      {compact ? null : 'Druckansicht'}
    </ButtonLink>
  );
}

/** "Als bezahlt markieren" mit Rückfrage */
export function MarkPaidButton({ invoice, size = 'sm', block = false }: { invoice: Invoice; size?: 'sm' | 'md'; block?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const pay = useApiMutation((id: string) => api.adminMarkInvoicePaid(id), {
    invalidate: [qk.admin],
    success: (inv) => `Zahlungseingang für ${inv.number} gebucht`,
    onSuccess: () => setConfirm(false),
  });
  if (invoice.status === 'paid') return null;
  return (
    <>
      <Button size={size} variant="success" icon={CircleDollarSign} onClick={() => setConfirm(true)} block={block}>
        Als bezahlt
      </Button>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => pay.mutate(invoice.id)}
        loading={pay.isPending}
        title={`${invoice.number} als bezahlt markieren?`}
        message={
          <>
            Zahlungseingang über <strong>{formatEuro(invoice.gross)}</strong> von {invoice.customerName} buchen. Die zugehörigen Lieferungen werden als bezahlt
            geführt.
          </>
        }
        confirmLabel="Zahlung buchen"
      />
    </>
  );
}
