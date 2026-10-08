import { Hammer } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui';

/** Platzhalter – wird vom Feature-Team ersetzt. */
export default function Page() {
  return (
    <>
      <PageHeader title="Meine Bestellungen" />
      <EmptyState icon={Hammer} title="Wird gerade gebaut" description="Diese Seite entsteht gerade und ist in Kürze verfügbar." />
    </>
  );
}
