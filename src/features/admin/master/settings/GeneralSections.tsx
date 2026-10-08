import { Clock, Copy, Megaphone, Receipt, Store, Timer, X } from 'lucide-react';
import { WEEKDAY_LABEL, formatEuro } from '@shared/format';
import { Button, Input, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { parseEuro, parseIntInput } from '../lib';
import { EuroField, FormSection, TimeField } from '../ui';
import { WEEK_ORDER, type DraftValidation, type SettingsDraft } from './settingsDraft';

export interface SectionProps {
  draft: SettingsDraft;
  update: (fn: (d: SettingsDraft) => SettingsDraft) => void;
  v: DraftValidation;
}

// ───────────────────────────── Markt ─────────────────────────────

export function StoreSection({ draft, update, v }: SectionProps) {
  const set = (key: 'name' | 'legalName' | 'street' | 'zip' | 'city' | 'phone' | 'email' | 'announcement', value: string) => update((d) => ({ ...d, [key]: value }));
  return (
    <div className="space-y-6">
      <FormSection title="Markt & Kontakt" subtitle="Erscheint im Shop, auf Rechnungen und in Benachrichtigungen" icon={Store}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Marktname" required value={draft.name} onChange={(e) => set('name', e.target.value)} error={v.errors.name} maxLength={80} />
          <Input label="Firmierung" required value={draft.legalName} onChange={(e) => set('legalName', e.target.value)} error={v.errors.legalName} maxLength={120} hint="z. B. für Rechnungen und Impressum" />
          <Input label="Straße & Hausnummer" required value={draft.street} onChange={(e) => set('street', e.target.value)} error={v.errors.street} containerClassName="sm:col-span-2" maxLength={120} />
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 sm:col-span-2">
            <Input label="PLZ" required inputMode="numeric" value={draft.zip} onChange={(e) => set('zip', e.target.value.replace(/[^\d]/g, '').slice(0, 5))} error={v.errors.zip} />
            <Input label="Ort" required value={draft.city} onChange={(e) => set('city', e.target.value)} error={v.errors.city} maxLength={80} />
          </div>
          <Input label="Telefon" required type="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} error={v.errors.phone} maxLength={40} />
          <Input label="E-Mail" required type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} error={v.errors.email} maxLength={120} />
        </div>
      </FormSection>

      <FormSection title="Ansage-Banner" subtitle="Hinweis oben im Shop, z. B. Aktionen oder geänderte Öffnungszeiten" icon={Megaphone}>
        <Textarea
          aria-label="Ansage-Banner"
          rows={2}
          value={draft.announcement}
          onChange={(e) => set('announcement', e.target.value)}
          maxLength={300}
          placeholder="z. B. Am Feiertag (3. Oktober) bleibt der Markt geschlossen – Lieferungen erfolgen am Folgetag."
          error={v.errors.announcement}
          hint={draft.announcement.trim() ? `${draft.announcement.length} / 300 Zeichen` : 'Leer lassen, um kein Banner anzuzeigen.'}
        />
        {draft.announcement.trim() ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vorschau</p>
            <div className="flex items-center gap-2.5 rounded-xl bg-brand-900 px-4 py-2.5 text-sm font-medium text-white">
              <Megaphone size={16} aria-hidden className="shrink-0 text-accent-400" />
              <span className="min-w-0 flex-1">{draft.announcement.trim()}</span>
              <button type="button" onClick={() => set('announcement', '')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white" aria-label="Banner entfernen">
                <X size={16} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </FormSection>
    </div>
  );
}

// ───────────────────────────── Öffnungszeiten ─────────────────────────────

export function HoursSection({ draft, update, v }: SectionProps) {
  const setDay = (day: number, patch: Partial<SettingsDraft['hours'][number]>) =>
    update((d) => ({ ...d, hours: d.hours.map((h, i) => (i === day ? { ...h, ...patch } : h)) }));
  const copyMonday = () =>
    update((d) => ({ ...d, hours: d.hours.map((h, i) => (i >= 2 && i <= 5 ? { ...d.hours[1] } : h)) }));
  return (
    <FormSection
      title="Öffnungszeiten"
      subtitle="Gelten für den Markt und als Rahmen für Click & Collect"
      icon={Clock}
      action={
        <Button size="sm" variant="secondary" icon={Copy} onClick={copyMonday}>
          <span className="hidden sm:inline">Montag auf Di–Fr übertragen</span>
          <span className="sm:hidden">Mo → Di–Fr</span>
        </Button>
      }
    >
      <ul className="-my-2 divide-y divide-slate-100">
        {WEEK_ORDER.map((day) => {
          const h = draft.hours[day];
          const err = v.errors[`hours-${day}`];
          return (
            <li key={day} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex w-40 items-center gap-3">
                  <Switch checked={!h.closed} onChange={(open) => setDay(day, { closed: !open })} ariaLabel={`${WEEKDAY_LABEL[day]} geöffnet`} />
                  <span className={cn('font-medium', h.closed ? 'text-slate-400' : 'text-slate-900')}>{WEEKDAY_LABEL[day]}</span>
                </div>
                {h.closed ? (
                  <span className="text-sm text-slate-500">geschlossen</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <TimeField aria-label={`${WEEKDAY_LABEL[day]} öffnet`} value={h.open} onChange={(open) => setDay(day, { open })} invalid={!!err} containerClassName="w-24" />
                    <span className="text-slate-400">–</span>
                    <TimeField aria-label={`${WEEKDAY_LABEL[day]} schließt`} value={h.close} onChange={(close) => setDay(day, { close })} invalid={!!err} containerClassName="w-24" />
                    <span className="text-sm text-slate-500">Uhr</span>
                  </div>
                )}
              </div>
              {err ? <p className="mt-1.5 text-sm font-medium text-red-600 sm:pl-44">{err}</p> : null}
            </li>
          );
        })}
      </ul>
    </FormSection>
  );
}

// ───────────────────────────── Gebühren & Regeln ─────────────────────────────

export function RulesSection({ draft, update, v }: SectionProps) {
  const set = (key: 'orderCutoffMinutes' | 'pickupCutoffMinutes' | 'pickupHoldHours' | 'carryServiceFee' | 'loyaltyPointsPerEuro', value: string) =>
    update((d) => ({ ...d, [key]: value }));
  const cutoff = parseIntInput(draft.orderCutoffMinutes);
  const pickupCutoff = parseIntInput(draft.pickupCutoffMinutes);
  const hold = parseIntInput(draft.pickupHoldHours);
  const carry = parseEuro(draft.carryServiceFee);
  const points = parseIntInput(draft.loyaltyPointsPerEuro);
  const minutesText = (m: number | null) => (m === null ? '–' : m >= 60 && m % 60 === 0 ? `${m / 60} Std.` : m >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : `${m} Min.`);
  return (
    <div className="space-y-6">
      <FormSection title="Bestellschluss & Reservierung" subtitle="Wie kurzfristig Kunden ein Zeitfenster buchen können" icon={Timer}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Bestellschluss Lieferung"
            inputMode="numeric"
            suffix="Min."
            value={draft.orderCutoffMinutes}
            onChange={(e) => set('orderCutoffMinutes', e.target.value.replace(/[^\d]/g, ''))}
            error={v.errors.orderCutoffMinutes}
            hint={`bis ${minutesText(cutoff)} vor Fensterbeginn`}
          />
          <Input
            label="Bestellschluss Abholung"
            inputMode="numeric"
            suffix="Min."
            value={draft.pickupCutoffMinutes}
            onChange={(e) => set('pickupCutoffMinutes', e.target.value.replace(/[^\d]/g, ''))}
            error={v.errors.pickupCutoffMinutes}
            hint={`bis ${minutesText(pickupCutoff)} vor Fensterbeginn`}
          />
          <Input
            label="Reservierung halten"
            inputMode="numeric"
            suffix="Std."
            value={draft.pickupHoldHours}
            onChange={(e) => set('pickupHoldHours', e.target.value.replace(/[^\d]/g, ''))}
            error={v.errors.pickupHoldHours}
            hint={hold !== null ? `Click & Collect: bis ${hold} Std. nach Fensterende` : undefined}
          />
        </div>
      </FormSection>

      <FormSection title="Gebühren & Treuepunkte" subtitle="Liefergebühren je Gebiet stellen Sie unter „Liefergebiete“ ein" icon={Receipt}>
        <div className="grid gap-4 sm:grid-cols-2">
          <EuroField
            label="Tragservice (bis in die Wohnung)"
            value={draft.carryServiceFee}
            onChange={(e) => set('carryServiceFee', e.target.value)}
            error={v.errors.carryServiceFee}
            hint={carry !== null ? `${formatEuro(carry)} brutto je Bestellung` : undefined}
          />
          <Input
            label="Treuepunkte je Euro (Privatkunden)"
            inputMode="numeric"
            suffix="Pkt."
            value={draft.loyaltyPointsPerEuro}
            onChange={(e) => set('loyaltyPointsPerEuro', e.target.value.replace(/[^\d]/g, ''))}
            error={v.errors.loyaltyPointsPerEuro}
            hint={points !== null ? (points ? `Beispiel: 40 € Warenwert = ${40 * points} Punkte` : 'Treuepunkte sind ausgeschaltet') : undefined}
          />
        </div>
      </FormSection>
    </div>
  );
}
