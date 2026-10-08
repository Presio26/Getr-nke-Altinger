import { useState, type FormEvent } from 'react';
import { Building2, Mail, Phone, Save, User } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Customer, CustomerPatch } from '@shared/types';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Button, Input, Modal } from '@/components/ui';

/** Stammdaten bearbeiten (Name/Ansprechpartner, Telefon) */
export function ProfileEditModal({ customer, open, onClose }: { customer: Customer; open: boolean; onClose: () => void }) {
  const b2b = customer.type === 'b2b';
  const qc = useQueryClient();
  const [name, setName] = useState(customer.name);
  const [contactName, setContactName] = useState(customer.contactName);
  const [phone, setPhone] = useState(customer.phone);
  const [errors, setErrors] = useState<{ name?: string; contactName?: string; phone?: string }>({});

  const save = useApiMutation((patch: CustomerPatch) => api.updateMyCustomer(patch), {
    success: 'Ihre Daten wurden gespeichert.',
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!b2b && name.trim().length < 2) next.name = 'Bitte geben Sie Ihren Namen an.';
    if (b2b && contactName.trim().length < 2) next.contactName = 'Bitte geben Sie einen Ansprechpartner an.';
    if (phone.trim() && !/^[+\d][\d\s/()-]{4,}$/.test(phone.trim())) next.phone = 'Bitte geben Sie eine gültige Telefonnummer an.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const patch: CustomerPatch = { phone: phone.trim() };
    if (b2b) patch.contactName = contactName.trim();
    else {
      patch.name = name.trim();
      patch.contactName = name.trim();
    }
    save.mutate(patch);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Persönliche Daten bearbeiten"
      description={b2b ? 'Ansprechpartner und Telefon für Rückfragen zu Lieferungen.' : 'So erreichen wir Sie bei Fragen zu Ihrer Lieferung.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" form="profile-form" icon={Save} loading={save.isPending}>
            Speichern
          </Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={submit} noValidate className="space-y-4">
        {b2b ? (
          <>
            <Input label="Firma" icon={Building2} value={customer.name} disabled hint="Änderungen der Firmierung nimmt Ihr Ansprechpartner im Markt vor." />
            <Input
              label="Ansprechpartner"
              icon={User}
              autoComplete="name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              error={errors.contactName}
              required
              data-autofocus
            />
          </>
        ) : (
          <Input label="Vor- und Nachname" icon={User} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required data-autofocus />
        )}
        <Input label="Telefon" type="tel" icon={Phone} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} hint="Für Rückfragen des Fahrers" />
        <Input label="E-Mail-Adresse" icon={Mail} value={customer.email} disabled hint="Die E-Mail-Adresse ist Ihr Anmeldename. Für eine Änderung wenden Sie sich bitte an den Markt." />
      </form>
    </Modal>
  );
}
