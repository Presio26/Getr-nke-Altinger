import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Gift, KeyRound, Mail, MapPin, Phone, Repeat, Star, Truck, User, UserPlus } from 'lucide-react';
import type { AddressInput, RegisterInput } from '@shared/types';
import { useSession } from '@/stores/session';
import { safeNext } from '@/lib/roles';
import { Button, Card, Checkbox, Input, PageHeader, Select, Textarea, errorMessage, toast } from '@/components/ui';
import { AuthShell } from './AuthShell';
import { ZipHint } from './ZipHint';

const BENEFITS = [
  { icon: Gift, title: '10 % Willkommensrabatt', text: 'Mit dem Gutschein WILLKOMMEN10 auf Ihre erste Bestellung.' },
  { icon: Star, title: 'Treuepunkte sammeln', text: 'Für jeden Euro Einkauf gibt es Punkte – einlösbar im Markt.' },
  { icon: Repeat, title: 'Getränke-Abo', text: 'Wasser, Bier & Co. automatisch im Wunschrhythmus liefern lassen.' },
  { icon: Truck, title: 'Leergut bequem zurück', text: 'Der Fahrer nimmt Ihr Leergut mit, das Pfand wird direkt verrechnet.' },
];

const FLOORS = [
  { value: '', label: 'keine Angabe' },
  { value: '0', label: 'Erdgeschoss' },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}. Stock` })),
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Errors = Partial<Record<'name' | 'email' | 'password' | 'street' | 'zip' | 'city' | 'terms', string>>;

/** Registrierung für Privatkunden */
export default function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const register = useSession((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('Garching b. München');
  const [floor, setFloor] = useState('');
  const [elevator, setElevator] = useState(false);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasAddress = !!(street.trim() || zip.trim());

  const validate = (): Errors => {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Bitte geben Sie Ihren Namen an.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Bitte geben Sie eine gültige E-Mail-Adresse an.';
    if (password.length < 6) e.password = 'Mindestens 6 Zeichen.';
    if (hasAddress) {
      if (!street.trim()) e.street = 'Bitte Straße und Hausnummer angeben.';
      if (!/^\d{5}$/.test(zip.trim())) e.zip = 'Bitte eine 5-stellige PLZ angeben.';
      if (!city.trim()) e.city = 'Bitte den Ort angeben.';
    }
    if (!terms) e.terms = 'Bitte bestätigen Sie die Datenschutzhinweise.';
    return e;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const input: RegisterInput = { name: name.trim(), email: email.trim(), password };
    if (phone.trim()) input.phone = phone.trim();
    if (hasAddress) {
      const address: AddressInput = { label: 'Zuhause', name: name.trim(), street: street.trim(), zip: zip.trim(), city: city.trim() };
      if (notes.trim()) address.notes = notes.trim();
      if (floor !== '') address.floor = Number(floor);
      if (floor !== '' && Number(floor) > 0) address.hasElevator = elevator;
      input.address = address;
    }
    setBusy(true);
    try {
      const session = await register(input);
      toast.success(`Willkommen bei Getränke Altinger, ${session.user.name.split(' ')[0]}!`, {
        id: 'register',
        description: 'Ihr Kundenkonto ist eingerichtet.',
      });
      navigate(next ?? '/', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell eyebrow="Kostenloses Kundenkonto" headline="Einmal registrieren, bequem bestellen." benefits={BENEFITS}>
      <PageHeader title="Konto erstellen" subtitle="Für Privatkunden – in einer Minute erledigt. Geschäftskunden nutzen bitte den Geschäftskunden-Antrag." back={next ?? '/login'} />
      <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
        <Card padding="lg">
          <h2 className="mb-4 text-base font-bold text-slate-900">Ihre Daten</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Vor- und Nachname" icon={User} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required containerClassName="sm:col-span-2" />
            <Input label="E-Mail-Adresse" type="email" inputMode="email" icon={Mail} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
            <Input label="Telefon" type="tel" icon={Phone} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Für Rückfragen zur Lieferung" />
            <Input
              label="Passwort"
              type={showPw ? 'text' : 'password'}
              icon={KeyRound}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint="Mindestens 6 Zeichen"
              required
              containerClassName="sm:col-span-2"
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPw ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              }
            />
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-base font-bold text-slate-900">Lieferadresse</h2>
          <p className="mb-4 mt-0.5 text-sm text-slate-500">Optional – Sie können sie auch später bei der ersten Bestellung angeben.</p>
          <div className="grid gap-4 sm:grid-cols-6">
            <Input label="Straße und Hausnummer" icon={MapPin} autoComplete="street-address" value={street} onChange={(e) => setStreet(e.target.value)} error={errors.street} containerClassName="sm:col-span-6" />
            <Input
              label="PLZ"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              error={errors.zip}
              containerClassName="sm:col-span-2"
            />
            <Input label="Ort" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} containerClassName="sm:col-span-4" />
            <div className="sm:col-span-6">
              <ZipHint zip={zip} />
            </div>
            <Select label="Stockwerk" options={FLOORS} value={floor} onChange={(e) => setFloor(e.target.value)} containerClassName="sm:col-span-3" />
            <div className="flex items-end sm:col-span-3">
              <Checkbox label="Aufzug vorhanden" checked={elevator} onChange={(e) => setElevator(e.target.checked)} disabled={floor === '' || floor === '0'} />
            </div>
            <Textarea
              label="Hinweis für den Fahrer"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z. B. Hinterhof, Klingel Berger"
              containerClassName="sm:col-span-6"
            />
          </div>
        </Card>

        <Card padding="lg">
          <Checkbox
            label={
              <>
                Ich habe die{' '}
                <Link to="/datenschutz" className="text-brand-700 underline underline-offset-2" target="_blank">
                  Datenschutzhinweise
                </Link>{' '}
                gelesen und bin einverstanden.
              </>
            }
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          {errors.terms ? <p className="mt-1 text-sm font-medium text-red-600">{errors.terms}</p> : null}
          {formError ? (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
              {formError}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Schon Kunde?{' '}
              <Link to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-semibold text-brand-700">
                Anmelden
              </Link>
            </p>
            <Button type="submit" size="lg" icon={UserPlus} loading={busy}>
              Konto erstellen
            </Button>
          </div>
        </Card>
      </form>
    </AuthShell>
  );
}
