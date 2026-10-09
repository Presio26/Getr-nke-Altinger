/**
 * Problem melden: Zustellung fehlgeschlagen mit Grund + Freitext (api.failDelivery).
 */
import { useEffect, useState } from 'react';
import { Ban, IdCard, MapPinOff, MoreHorizontal, TriangleAlert, UserX } from 'lucide-react';
import { Button, Modal, RadioCards, Textarea } from '@/components/ui';

export const FAIL_REASONS = [
  { value: 'Nicht angetroffen', description: 'Niemand öffnet, kein Abstellort vereinbart', icon: UserX },
  { value: 'Annahme verweigert', description: 'Kunde nimmt die Lieferung nicht an', icon: Ban },
  { value: 'Adresse nicht gefunden', description: 'Hausnummer/Zufahrt nicht auffindbar', icon: MapPinOff },
  { value: 'Sonstiges', description: 'Bitte kurz beschreiben', icon: MoreHorizontal },
] as const;

/** Zusätzlicher Grund bei alkoholischen Getränken (Jugendschutz) */
export const AGE_FAIL_REASON = 'Alterskontrolle nicht bestanden';

export interface FailModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  loading?: boolean;
  customerName: string;
  /** Mindestalter, falls die Lieferung alkoholische Getränke enthält (Grund „Alterskontrolle“) */
  ageLimit?: number;
}

export function FailModal({ open, onClose, onSubmit, loading = false, customerName, ageLimit }: FailModalProps) {
  const [reason, setReason] = useState<string>(FAIL_REASONS[0].value);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(FAIL_REASONS[0].value);
      setText('');
      setTouched(false);
    }
  }, [open]);

  const needsText = reason === 'Sonstiges';
  const invalid = needsText && text.trim().length < 3;

  const submit = () => {
    setTouched(true);
    if (invalid) return;
    const detail = text.trim();
    onSubmit((detail ? `${reason} – ${detail}` : reason).slice(0, 300));
  };

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title="Problem melden"
      description={`Die Zustellung an ${customerName} wird als fehlgeschlagen markiert. Der Markt wird sofort informiert.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading} className="sm:min-w-28">
            Abbrechen
          </Button>
          <Button variant="danger" icon={TriangleAlert} onClick={submit} loading={loading} className="sm:min-w-40">
            Problem melden
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RadioCards
          aria-label="Grund"
          name="fail-reason"
          value={reason}
          onChange={setReason}
          columns={2}
          options={[
            ...FAIL_REASONS.filter((r) => r.value !== 'Sonstiges').map((r) => ({ value: r.value as string, title: r.value, description: r.description, icon: r.icon })),
            ...(ageLimit
              ? [{ value: AGE_FAIL_REASON, title: AGE_FAIL_REASON, description: `Kein Ausweis oder jünger als ${ageLimit} – Alkohol nicht übergeben`, icon: IdCard }]
              : []),
            ...FAIL_REASONS.filter((r) => r.value === 'Sonstiges').map((r) => ({ value: r.value as string, title: r.value, description: r.description, icon: r.icon })),
          ]}
        />
        <Textarea
          label={needsText ? 'Beschreibung' : 'Ergänzung (optional)'}
          required={needsText}
          placeholder={needsText ? 'Was ist passiert?' : 'z. B. Nachbar nicht erreichbar, Zettel hinterlassen'}
          value={text}
          maxLength={250}
          onChange={(e) => setText(e.target.value)}
          error={touched && invalid ? 'Bitte beschreiben Sie das Problem kurz.' : undefined}
          hint={`${text.length}/250 Zeichen`}
        />
      </div>
    </Modal>
  );
}
