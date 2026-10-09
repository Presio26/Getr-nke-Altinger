import { useRole } from '@/stores/session';
import { SubscriptionsView } from './components/SubscriptionsView';

/** Abos (Privatkunden); Geschäftskunden sehen hier ihre Daueraufträge */
export default function SubscriptionsPage() {
  const role = useRole();
  return <SubscriptionsView variant={role === 'business' ? 'b2b' : 'b2c'} />;
}
