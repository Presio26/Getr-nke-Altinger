import { Ban, Building2, Clock, ShieldCheck, User } from 'lucide-react';
import type { BusinessInfo, Customer } from '@shared/types';
import { SEGMENT_LABEL } from '@shared/format';
import { Badge, type BadgeTone } from '@/components/ui';

export const B2B_STATUS: Record<BusinessInfo['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Antrag offen', tone: 'warning' },
  active: { label: 'Freigeschaltet', tone: 'success' },
  blocked: { label: 'Gesperrt', tone: 'danger' },
};

/** Kundentyp (+ Freischaltungsstatus bei Geschäftskunden) */
export function CustomerTypeBadges({ customer, showSegment = true }: { customer: Customer; showSegment?: boolean }) {
  if (customer.type === 'b2c') {
    return (
      <Badge tone="neutral" icon={User}>
        Privat
      </Badge>
    );
  }
  const status = customer.b2b?.status ?? 'active';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone="brand" icon={Building2}>
        {showSegment && customer.b2b ? SEGMENT_LABEL[customer.b2b.segment] : 'Geschäft'}
      </Badge>
      {status !== 'active' ? (
        <Badge tone={B2B_STATUS[status].tone} icon={status === 'pending' ? Clock : Ban}>
          {B2B_STATUS[status].label}
        </Badge>
      ) : null}
    </span>
  );
}

export function StatusIcon({ status }: { status: BusinessInfo['status'] }) {
  const Icon = status === 'active' ? ShieldCheck : status === 'pending' ? Clock : Ban;
  return <Icon size={16} aria-hidden />;
}

export function defaultAddress(c: Customer) {
  return c.addresses.find((a) => a.id === c.defaultAddressId) ?? c.addresses[0];
}
