import { Banknote, CreditCard, FileText, Landmark, ShieldCheck, Wallet, type LucideIcon } from 'lucide-react';
import type { Customer, FulfillmentType, PaymentMethod } from '@shared/types';
import { formatEuro, PAYMENT_METHOD_LABEL } from '@shared/format';
import { Badge, Notice, RadioCards } from '@/components/ui';

const ICON: Record<PaymentMethod, LucideIcon> = {
  cash: Banknote,
  ec: CreditCard,
  paypal: Wallet,
  card: CreditCard,
  invoice: FileText,
  sepa: Landmark,
};

function describe(method: PaymentMethod, fulfillment: FulfillmentType, customer: Customer): string {
  const pickup = fulfillment === 'pickup';
  switch (method) {
    case 'cash':
      return pickup ? 'Bar an der Kasse bei Abholung' : 'Bar beim Fahrer bei Lieferung';
    case 'ec':
      return pickup ? 'Mit EC-/Girocard an der Kasse' : 'Mit EC-/Girocard an der Tür – der Fahrer hat ein Kartenterminal dabei';
    case 'paypal':
      return 'Demo – es wird nichts belastet';
    case 'card':
      return 'Visa, Mastercard · Demo – es wird nichts belastet';
    case 'invoice': {
      const days = customer.b2b?.paymentTermsDays ?? 14;
      return `Zahlbar innerhalb von ${days} Tagen nach Rechnungsdatum (Sammelrechnung)`;
    }
    case 'sepa':
      return 'Bequemer Bankeinzug nach Rechnungsstellung';
  }
}

export interface PaymentStepProps {
  methods: PaymentMethod[];
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  fulfillment: FulfillmentType;
  customer: Customer;
}

/** Schritt Zahlung: erlaubte Zahlarten aus der Preisberechnung (quote.paymentMethods) */
export function PaymentStep({ methods, value, onChange, fulfillment, customer }: PaymentStepProps) {
  const options = methods.map((m) => ({
    value: m,
    icon: ICON[m],
    title: (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {PAYMENT_METHOD_LABEL[m]}
        {m === 'paypal' || m === 'card' ? <Badge tone="info">Demo</Badge> : null}
        {m === 'invoice' && customer.type === 'b2b' ? <Badge tone="brand">Geschäftskunden</Badge> : null}
      </span>
    ),
    description: describe(m, fulfillment, customer),
  }));
  const online = value === 'paypal' || value === 'card';
  return (
    <div>
      <RadioCards name="kasse-zahlung" aria-label="Zahlart wählen" value={value} onChange={(v) => onChange(v as PaymentMethod)} options={options} columns={2} />
      {online ? (
        <Notice tone="info" icon={ShieldCheck} className="mt-4" title="Demo-Zahlung">
          In dieser Demo wird nichts belastet. Ihre Bestellung gilt sofort als bezahlt – so, als hätten Sie bei {PAYMENT_METHOD_LABEL[value]} bestätigt.
        </Notice>
      ) : value === 'invoice' && customer.b2b ? (
        <p className="mt-3 text-sm text-slate-500">
          Kreditlimit {formatEuro(customer.b2b.creditLimit)} · Zahlungsziel {customer.b2b.paymentTermsDays} Tage. Die Rechnung finden Sie anschließend im Geschäftskunden-Portal.
        </p>
      ) : null}
    </div>
  );
}
