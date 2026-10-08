import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Building, Contact, Home, MapPin, NotebookPen, Pencil, Save, Star } from 'lucide-react';
import type { Customer, LatLng } from '@shared/types';
import { formatDate, formatDistance } from '@shared/format';
import { haversine, zoneForZip } from '@shared/core/geo';
import { api } from '@/api/client';
import { qk, useApiMutation, useSettings } from '@/api/hooks';
import { Badge, Button, Input, KeyValue, Switch, Textarea } from '@/components/ui';
import { BaseMap, HomeMarker, StoreMarker } from '@/components/map';
import { formatCount } from '../lib';
import { FormSection } from '../ui';

function useSave(success: string, onDone?: () => void) {
  return useApiMutation((c: Customer) => api.adminSaveCustomer(c), { invalidate: [qk.admin], success, onSuccess: () => onDone?.() });
}

// ───────────────────────────── Stammdaten ─────────────────────────────

export function ProfileCard({ customer }: { customer: Customer }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [contact, setContact] = useState(customer.contactName);
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone);
  const [marketing, setMarketing] = useState(!!customer.marketingOptIn);
  const save = useSave('Stammdaten gespeichert', () => setEditing(false));

  const start = () => {
    setName(customer.name);
    setContact(customer.contactName);
    setEmail(customer.email);
    setPhone(customer.phone);
    setMarketing(!!customer.marketingOptIn);
    setEditing(true);
  };
  const emailInvalid = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || emailInvalid) return;
    save.mutate({ ...customer, name: name.trim(), contactName: contact.trim(), email: email.trim(), phone: phone.trim(), marketingOptIn: marketing });
  };

  return (
    <FormSection
      title="Stammdaten"
      icon={Contact}
      action={
        !editing ? (
          <Button size="sm" variant="ghost" icon={Pencil} onClick={start}>
            Bearbeiten
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Input label={customer.type === 'b2b' ? 'Anzeigename (Firma)' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} error={!name.trim() ? 'Bitte einen Namen angeben.' : undefined} />
          <Input label="Ansprechpartner" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Input label="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailInvalid ? 'Bitte eine gültige E-Mail-Adresse angeben.' : undefined} />
          <Input label="Telefon" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Switch checked={marketing} onChange={setMarketing} label="Werbe-Einwilligung" description="Kunde erhält Angebote per E-Mail." />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>
              Abbrechen
            </Button>
            <Button type="submit" icon={Save} loading={save.isPending}>
              Speichern
            </Button>
          </div>
        </form>
      ) : (
        <KeyValue
          items={[
            ['Ansprechpartner', customer.contactName || '–'],
            [
              'E-Mail',
              customer.email ? (
                <a href={`mailto:${customer.email}`} className="break-all text-brand-700 hover:underline">
                  {customer.email}
                </a>
              ) : (
                '–'
              ),
            ],
            [
              'Telefon',
              customer.phone ? (
                <a href={`tel:${customer.phone.replace(/\s+/g, '')}`} className="text-brand-700 hover:underline">
                  {customer.phone}
                </a>
              ) : (
                '–'
              ),
            ],
            ['Kunde seit', formatDate(customer.createdAt, 'short')],
            ...(customer.type === 'b2c'
              ? ([
                  [
                    'Treuepunkte',
                    <span key="p" className="inline-flex items-center gap-1">
                      <Star size={14} aria-hidden className="text-accent-500" /> {formatCount(customer.loyaltyPoints)}
                    </span>,
                  ],
                ] as [string, ReactNode][])
              : []),
            ['Werbe-Einwilligung', customer.marketingOptIn ? 'ja' : 'nein'],
          ]}
        />
      )}
    </FormSection>
  );
}

// ───────────────────────────── Adressen ─────────────────────────────

export function AddressesCard({ customer }: { customer: Customer }) {
  const settings = useSettings();
  const points = useMemo<LatLng[]>(
    () => [[settings.location.lat, settings.location.lng], ...customer.addresses.map((a) => [a.lat, a.lng] as LatLng)],
    [customer.addresses, settings.location.lat, settings.location.lng],
  );
  return (
    <FormSection title="Adressen" subtitle={customer.addresses.length === 1 ? '1 Lieferadresse' : `${customer.addresses.length} Lieferadressen`} icon={MapPin}>
      {customer.addresses.length ? (
        <>
          <div className="-mx-4 -mt-5 mb-4 h-56 overflow-hidden border-b border-slate-100 sm:-mx-6">
            <BaseMap fitTo={points} fitPadding={36} maxFitZoom={15} zoomControl={false}>
              <StoreMarker />
              {customer.addresses.map((a) => (
                <HomeMarker key={a.id} position={a} label={`${a.label}: ${a.street}`} />
              ))}
            </BaseMap>
          </div>
          <ul className="space-y-3">
            {customer.addresses.map((a) => {
              const zone = zoneForZip(settings, a.zip);
              const dist = haversine(settings.location, a);
              const Icon = /büro|firma|gast|lokal|halle|verein|hotel/i.test(a.label) ? Building : Home;
              return (
                <li key={a.id} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon size={17} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                      {a.label}
                      {a.id === customer.defaultAddressId ? <Badge tone="brand">Standard</Badge> : null}
                    </p>
                    <p className="text-slate-700">{a.name}</p>
                    <p className="text-slate-700">
                      {a.street}, {a.zip} {a.city}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDistance(dist)} Luftlinie · {zone ? zone.name : 'außerhalb der Liefergebiete'}
                      {a.floor !== undefined ? ` · ${a.floor === 0 ? 'EG' : `${a.floor}. OG`}${a.hasElevator ? ', Aufzug' : ''}` : ''}
                    </p>
                    {a.notes ? <p className="mt-1 text-xs italic text-slate-500">„{a.notes}“</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-slate-500">Keine Adresse hinterlegt – der Kunde holt bisher nur im Markt ab.</p>
      )}
    </FormSection>
  );
}

// ───────────────────────────── Interne Notiz ─────────────────────────────

export function NoteCard({ customer }: { customer: Customer }) {
  const [note, setNote] = useState(customer.internalNote ?? '');
  const [base, setBase] = useState(customer.internalNote ?? '');
  const dirty = note !== base;
  useEffect(() => {
    const server = customer.internalNote ?? '';
    if (server === base) return;
    setBase(server);
    if (!dirty) setNote(server);
  }, [customer.internalNote, base, dirty]);
  const save = useSave('Interne Notiz gespeichert', () => setBase(note));
  return (
    <FormSection title="Interne Notiz" subtitle="Nur für den Markt sichtbar" icon={NotebookPen}>
      <Textarea
        aria-label="Interne Notiz"
        rows={5}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="z. B. Anlieferung über Hof, Schlüssel bei Nachbar, Ansprechpartner bevorzugt vormittags erreichbar …"
        maxLength={2000}
        hint={`${note.length} / 2000`}
      />
      <div className="mt-3 flex justify-end gap-2">
        {dirty ? (
          <Button variant="ghost" onClick={() => setNote(base)} disabled={save.isPending}>
            Verwerfen
          </Button>
        ) : null}
        <Button icon={Save} variant={dirty ? 'primary' : 'outline'} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ ...customer, internalNote: note })}>
          Notiz speichern
        </Button>
      </div>
    </FormSection>
  );
}

