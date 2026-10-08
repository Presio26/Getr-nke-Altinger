import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { todayString } from '@shared/time';
import { useCart } from '@/stores/cart';
import { useDocumentTitle } from '@/lib/hooks';
import { Section } from '@/components/ui';
import { EventsHero } from './components/EventsHero';
import { PartyPlanner } from './components/PartyPlanner';
import { RentalCatalog } from './components/RentalCatalog';
import { CommissionSection, ContactSection, FaqSection } from './components/InfoSections';
import { suggestEventDate } from './lib/planner';
import { isValidEventDate } from './lib/useRentalAvailability';

/** Festservice: Party-Planer, Leihartikel mit Verfügbarkeit, Kommission, FAQ, Kontakt */
export default function EventsPage() {
  useDocumentTitle('Festservice & Verleih');
  const [eventDate, setEventDate] = useState<string>(() => {
    const fromCart = useCart.getState().eventDate;
    return isValidEventDate(fromCart) ? fromCart : suggestEventDate(todayString());
  });

  // Sprungmarken (/fest#planer, /fest#verleih) nach dem ersten Rendern anspringen
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => window.clearTimeout(t);
  }, [hash]);

  return (
    <div className="-mt-1 sm:-mt-3">
      <EventsHero />

      <Section
        id="planer"
        title="Party-Planer"
        subtitle="Gäste, Dauer und Getränke-Mix eingeben – wir rechnen Mengen und Leihartikel aus unserem Sortiment aus."
        className="scroll-mt-28 lg:scroll-mt-36"
      >
        <PartyPlanner eventDate={eventDate} onEventDateChange={setEventDate} />
      </Section>

      <Section
        id="verleih"
        title="Leihartikel für Ihr Fest"
        subtitle="Preise pro Veranstaltung – mit tagesgenauer Verfügbarkeit."
        className="scroll-mt-28 lg:scroll-mt-36"
      >
        <RentalCatalog eventDate={eventDate} onEventDateChange={setEventDate} />
      </Section>

      <Section title="Kommissionsware – so einfach geht’s" subtitle="Sie zahlen nur, was auf Ihrem Fest getrunken wurde.">
        <CommissionSection />
      </Section>

      <Section title="Häufige Fragen">
        <FaqSection />
      </Section>

      <div className="mt-10 sm:mt-12">
        <ContactSection />
      </div>
    </div>
  );
}
