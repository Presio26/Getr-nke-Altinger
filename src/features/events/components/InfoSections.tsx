import { ArrowRight, Beer, Building2, CheckCircle2, ChevronDown, Mail, MapPin, PackageCheck, PartyPopper, Phone, Undo2, Users } from 'lucide-react';
import { useSettings } from '@/api/hooks';
import { telHref } from '@/components/layout';
import { ButtonLink, Card } from '@/components/ui';

// ───────────────────────────── Kommission ─────────────────────────────

export function CommissionSection() {
  const steps = [
    { icon: PackageCheck, title: 'Großzügig bestellen', text: 'Lieber einen Kasten mehr – damit Ihnen auf dem Fest nichts ausgeht.' },
    { icon: PartyPopper, title: 'Entspannt feiern', text: 'Angebrochene Kästen und angestochene Fässer werden ganz normal berechnet.' },
    { icon: Undo2, title: 'Volle Kästen zurück', text: 'Ungeöffnete, volle Kästen nehmen wir zurück und schreiben sie Ihnen gut.' },
  ];
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card padding="lg">
        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-100 text-accent-800">
                <s.icon size={22} aria-hidden />
              </span>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Schritt {i + 1}</p>
              <p className="mt-0.5 text-[15px] font-semibold text-slate-900">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
              {i < steps.length - 1 ? <ArrowRight size={18} aria-hidden className="absolute right-0 top-3.5 hidden text-slate-300 sm:block" /> : null}
            </li>
          ))}
        </ol>
      </Card>
      <Card padding="lg" className="bg-emerald-50/60 ring-1 ring-inset ring-emerald-100">
        <h3 className="text-base font-bold text-slate-900">Das gilt für Kommissionsware</h3>
        <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
          {[
            'Rückgabe innerhalb von 3 Tagen nach dem Fest – im Markt oder bei der Abholung der Leihartikel',
            'Nur volle, ungeöffnete Kästen und unangestochene Fässer',
            'Gutschrift auf Ihre Rechnung bzw. Rückzahlung an der Kasse',
            'Ausgenommen: Spirituosen, Eis und Sonderbestellungen',
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <CheckCircle2 size={17} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ───────────────────────────── FAQ ─────────────────────────────

const FAQ = [
  {
    q: 'Wie früh sollte ich Leihartikel reservieren?',
    a: 'Für Wochenenden im Sommer und rund um Feiertage empfehlen wir zwei bis drei Wochen Vorlauf – besonders für Zapfanlagen, Kühlanhänger und große Mengen Bierzeltgarnituren. Die Verfügbarkeit sehen Sie oben tagesgenau.',
  },
  {
    q: 'Liefern Sie auch Garnituren, Zapfanlage und Kühlung?',
    a: 'Ja. Wir liefern Getränke und Leihartikel in Garching und Umgebung zum gewählten Zeitfenster und holen alles nach dem Fest wieder ab. Alternativ holen Sie am Vortag selbst im Markt ab – mit Pkw-Anhänger passt auch der Kühlanhänger.',
  },
  {
    q: 'Wie funktioniert die Zapfanlage – brauche ich Erfahrung?',
    a: 'Nein. Unsere Durchlaufkühler sind sofort einsatzbereit, CO₂ ist dabei. Bei der Übergabe zeigen wir Ihnen in fünf Minuten das Anstechen und Zapfen. Ein 30-l-Fass reicht für rund 60 Halbe.',
  },
  {
    q: 'Was kostet der Verleih und wie lange darf ich die Sachen behalten?',
    a: 'Alle Leihpreise gelten pro Veranstaltung: Abholung am Vortag, Rückgabe am Tag danach. Bitte geben Sie Gläser gespült zurück; Bruch berechnen wir zum Wiederbeschaffungswert (z. B. 6,00 € pro Maßkrug).',
  },
  {
    q: 'Kann ich übrig gebliebene Getränke zurückgeben?',
    a: 'Ja – bei Bestellungen über den Festservice gilt Kommission: Volle, ungeöffnete Kästen und unangestochene Fässer nehmen wir innerhalb von drei Tagen zurück und schreiben Ihnen den Betrag gut.',
  },
  {
    q: 'Gibt es Konditionen für Vereine und Firmen?',
    a: 'Für Vereine, Gastronomie und Firmen bieten wir eigene Preisgruppen, Kauf auf Rechnung und einen persönlichen Ansprechpartner. Beantragen Sie einfach ein Geschäftskundenkonto – wir schalten es in der Regel innerhalb eines Werktags frei.',
  },
];

export function FaqSection() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {FAQ.map((f) => (
        <details key={f.q} className="group rounded-2xl border border-slate-200/70 bg-white shadow-card open:shadow-raised">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

// ───────────────────────────── Kontakt ─────────────────────────────

export function ContactSection() {
  const settings = useSettings();
  return (
    <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white shadow-raised">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:p-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-300">Große Feste &amp; Vereine</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Sommerfest, Vereinsjubiläum, Firmenfeier?</h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/75">
            Ab rund 150 Gästen planen wir gerne persönlich mit Ihnen – mit Mengenempfehlung aus Erfahrung, Lieferung zum Festplatz und Abholung am nächsten Tag.
          </p>
          <ul className="mt-5 grid gap-2.5 text-sm text-white/85 sm:grid-cols-2">
            {[
              { icon: Users, text: 'Persönliche Beratung im Markt' },
              { icon: Beer, text: 'Holzfass-Anstich auf Wunsch' },
              { icon: Building2, text: 'Vereins- & Firmenkonditionen' },
              { icon: Undo2, text: 'Kommission für alle Getränke' },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-2.5">
                <f.icon size={17} aria-hidden className="shrink-0 text-accent-300" />
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 lg:pt-6">
          <a href={telHref(settings.phone)} className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/15">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-brand-950">
              <Phone size={20} aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-bold tabular-nums">{settings.phone}</span>
              <span className="block text-sm text-white/65">Festservice-Hotline im Markt</span>
            </span>
          </a>
          <a href={`mailto:${settings.email}?subject=${encodeURIComponent('Anfrage Festservice')}`} className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/15">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Mail size={20} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{settings.email}</span>
              <span className="block text-sm text-white/65">Anfrage mit Datum und Gästezahl</span>
            </span>
          </a>
          <p className="flex items-center gap-2 px-1 text-sm text-white/65">
            <MapPin size={16} aria-hidden className="shrink-0" />
            {settings.street}, {settings.zip} {settings.city}
          </p>
          <ButtonLink to="/geschaeftskunde" variant="outline" iconRight={ArrowRight} block className="border-white/25 bg-transparent text-white hover:border-white/40 hover:bg-white/10">
            Verein oder Firma? Geschäftskunde werden
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
