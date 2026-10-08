import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  CircleEllipsis,
  ClipboardCheck,
  FileText,
  Hotel,
  KeyRound,
  LayoutGrid,
  Mail,
  MapPin,
  Percent,
  Phone,
  Send,
  Store,
  Trophy,
  User,
  UtensilsCrossed,
} from 'lucide-react';
import type { BusinessRequestInput, BusinessSegment } from '@shared/types';
import { SEGMENT_LABEL } from '@shared/format';
import { useSession } from '@/stores/session';
import { ButtonLink, Button, Card, Input, Notice, PageHeader, RadioCards, Textarea, errorMessage, toast } from '@/components/ui';
import { AuthShell } from './AuthShell';
import { ZipHint } from './ZipHint';

const BENEFITS = [
  { icon: Percent, title: 'Nettopreise & Staffelrabatte', text: 'Gruppenrabatte für Gastronomie und Vereine, Staffelpreise ab 10 Gebinden.' },
  { icon: FileText, title: 'Kauf auf Rechnung', text: 'Zahlungsziel, SEPA-Lastschrift und Sammelrechnungen als PDF.' },
  { icon: CalendarClock, title: 'Daueraufträge', text: 'Wöchentliche Lieferung zum festen Termin – inklusive Leergut-Abholung.' },
  { icon: Building2, title: 'Standorte & Kostenstellen', text: 'Mehrere Lieferadressen, Bestellreferenzen und Kostenstellen je Bestellung.' },
];

const SEGMENT_ICON: Record<BusinessSegment, typeof Briefcase> = {
  gastronomie: UtensilsCrossed,
  buero: Briefcase,
  verein: Trophy,
  hotel: Hotel,
  handel: Store,
  sonstiges: CircleEllipsis,
};

const SEGMENT_HINT: Record<BusinessSegment, string> = {
  gastronomie: 'Wirtshaus, Café, Bar, Catering',
  buero: 'Büro-Getränke für Ihr Team',
  verein: 'Sportheim, Feste, Veranstaltungen',
  hotel: 'Hotel, Pension, Ferienwohnungen',
  handel: 'Kiosk, Laden, Wiederverkauf',
  sonstiges: 'Schulen, Behörden, Praxen …',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VAT_RE = /^DE\s?\d{9}$/i;

type Field = 'companyName' | 'contactName' | 'email' | 'phone' | 'password' | 'street' | 'zip' | 'city' | 'vatId';

/** Antrag auf ein Geschäftskundenkonto */
export default function BusinessRequestPage() {
  const requestBusinessAccount = useSession((s) => s.requestBusinessAccount);
  const [segment, setSegment] = useState<BusinessSegment>('gastronomie');
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    password: '',
    vatId: '',
    street: '',
    zip: '',
    city: 'Garching b. München',
    message: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (form.companyName.trim().length < 2) e.companyName = 'Bitte geben Sie den Firmennamen an.';
    if (form.contactName.trim().length < 2) e.contactName = 'Bitte geben Sie eine Ansprechperson an.';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Bitte geben Sie eine gültige E-Mail-Adresse an.';
    if (form.phone.trim().length < 5) e.phone = 'Bitte geben Sie eine Telefonnummer an.';
    if (form.password.length < 6) e.password = 'Mindestens 6 Zeichen.';
    if (!form.street.trim()) e.street = 'Bitte Straße und Hausnummer angeben.';
    if (!/^\d{5}$/.test(form.zip.trim())) e.zip = 'Bitte eine 5-stellige PLZ angeben.';
    if (!form.city.trim()) e.city = 'Bitte den Ort angeben.';
    if (form.vatId.trim() && !VAT_RE.test(form.vatId.trim())) e.vatId = 'Format: DE und 9 Ziffern, z. B. DE123456789';
    return e;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError('Bitte prüfen Sie die markierten Felder.');
      return;
    }
    const input: BusinessRequestInput = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim(),
      segment,
      address: {
        label: 'Firmensitz',
        name: form.companyName.trim(),
        street: form.street.trim(),
        zip: form.zip.trim(),
        city: form.city.trim(),
      },
    };
    if (form.vatId.trim()) input.vatId = form.vatId.replace(/\s/g, '').toUpperCase();
    if (form.message.trim()) input.message = form.message.trim();
    setBusy(true);
    try {
      await requestBusinessAccount(input);
      setDone(input.companyName);
      toast.success('Antrag eingegangen', { id: 'b2b-request', description: 'Wir prüfen Ihre Angaben und melden uns kurzfristig.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <Card padding="lg" className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
            <ClipboardCheck size={30} aria-hidden />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Vielen Dank – Ihr Antrag wird geprüft</h1>
          <p className="mx-auto mt-2 max-w-lg text-[15px] leading-relaxed text-slate-600">
            Das Geschäftskundenkonto für <strong>{done}</strong> ist angelegt und Sie sind bereits angemeldet. Unser Team prüft Ihre Angaben in der Regel innerhalb
            eines Werktags. Nach der Freischaltung sehen Sie Ihre Konditionen netto und können auf Rechnung bestellen.
          </p>
          <Notice tone="info" icon={BadgeCheck} className="mx-auto mt-6 max-w-lg text-left" title="Bis zur Freischaltung">
            Sie können das Sortiment bereits ansehen und zu regulären Preisen bestellen (Barzahlung, EC-Karte, PayPal).
          </Notice>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink to="/business" icon={Building2}>
              Zum Geschäftskunden-Portal
            </ButtonLink>
            <ButtonLink to="/sortiment" variant="outline" icon={LayoutGrid}>
              Sortiment ansehen
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <AuthShell
      eyebrow="Für Gastronomie, Büros & Vereine"
      headline="Geschäftskunde bei Getränke Altinger werden."
      benefits={BENEFITS}
      aside={
        <p className="text-sm leading-relaxed text-white/75">
          Fragen? Rufen Sie uns an: <a className="font-semibold text-white" href="tel:+49893202562">089 3202562</a> – Ihr persönlicher Ansprechpartner berät Sie gern.
        </p>
      }
    >
      <PageHeader
        title="Geschäftskundenkonto beantragen"
        subtitle="Füllen Sie das Formular aus – nach kurzer Prüfung schalten wir Ihre Konditionen frei."
        back="/login"
      />
      <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
        <Card padding="lg">
          <h2 className="mb-1 text-base font-bold text-slate-900">Branche</h2>
          <p className="mb-4 text-sm text-slate-500">Danach richten sich Preisgruppe und Lieferrhythmus.</p>
          <RadioCards
            aria-label="Branche"
            columns={2}
            value={segment}
            onChange={(v) => setSegment(v as BusinessSegment)}
            options={(Object.keys(SEGMENT_LABEL) as BusinessSegment[]).map((s) => ({
              value: s,
              title: SEGMENT_LABEL[s],
              description: SEGMENT_HINT[s],
              icon: SEGMENT_ICON[s],
            }))}
          />
        </Card>

        <Card padding="lg">
          <h2 className="mb-4 text-base font-bold text-slate-900">Unternehmen &amp; Ansprechperson</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Firmenname" icon={Building2} autoComplete="organization" value={form.companyName} onChange={set('companyName')} error={errors.companyName} required containerClassName="sm:col-span-2" />
            <Input label="Ansprechperson" icon={User} autoComplete="name" value={form.contactName} onChange={set('contactName')} error={errors.contactName} required />
            <Input
              label="USt-IdNr."
              value={form.vatId}
              onChange={set('vatId')}
              error={errors.vatId}
              placeholder="DE123456789"
              hint="Optional, für Rechnungen ohne Rückfragen"
              autoCapitalize="characters"
            />
            <Input label="E-Mail-Adresse" type="email" inputMode="email" icon={Mail} autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
            <Input label="Telefon" type="tel" icon={Phone} autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} required />
            <Input
              label="Passwort für das Kundenportal"
              type="password"
              icon={KeyRound}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              error={errors.password}
              hint="Mindestens 6 Zeichen"
              required
              containerClassName="sm:col-span-2"
            />
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="mb-4 text-base font-bold text-slate-900">Firmensitz / Lieferadresse</h2>
          <div className="grid gap-4 sm:grid-cols-6">
            <Input label="Straße und Hausnummer" icon={MapPin} autoComplete="street-address" value={form.street} onChange={set('street')} error={errors.street} required containerClassName="sm:col-span-6" />
            <Input
              label="PLZ"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={form.zip}
              onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
              error={errors.zip}
              required
              containerClassName="sm:col-span-2"
            />
            <Input label="Ort" autoComplete="address-level2" value={form.city} onChange={set('city')} error={errors.city} required containerClassName="sm:col-span-4" />
            <div className="sm:col-span-6">
              <ZipHint zip={form.zip} />
            </div>
            <Textarea
              label="Ihr Bedarf (optional)"
              rows={3}
              value={form.message}
              onChange={set('message')}
              placeholder="z. B. ca. 20 Kästen pro Woche, Lieferung dienstags vor 10 Uhr, Fassbier für Veranstaltungen"
              containerClassName="sm:col-span-6"
            />
          </div>
        </Card>

        {formError ? (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Mit dem Absenden akzeptieren Sie unsere{' '}
            <Link to="/datenschutz" className="font-semibold text-brand-700" target="_blank">
              Datenschutzhinweise
            </Link>
            .
          </p>
          <Button type="submit" size="lg" icon={Send} loading={busy}>
            Antrag senden
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
