import { SubscriptionsView } from '@/features/account/components/SubscriptionsView';

/** Daueraufträge für Geschäftskunden (gleiche Logik wie Abos, B2B-Wording, Rechnung als Standard-Zahlart) */
export default function StandingOrdersPage() {
  return <SubscriptionsView variant="b2b" />;
}
