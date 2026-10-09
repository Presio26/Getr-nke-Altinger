import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { InvoiceStatus } from '@shared/types';
import { INVOICE_STATUS_LABEL } from '@shared/format';
import { Badge } from '@/components/ui';
import { INVOICE_STATUS_TONE } from '../lib/b2b';

const ICON = { open: Clock, overdue: AlertTriangle, paid: CheckCircle2 } as const;

/** Rechnungsstatus „offen“ / „überfällig“ / „bezahlt“ */
export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const label = INVOICE_STATUS_LABEL[status];
  return (
    <Badge tone={INVOICE_STATUS_TONE[status]} icon={ICON[status]} className={className}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
}
