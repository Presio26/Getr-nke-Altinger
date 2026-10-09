import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCheck, Database, Pencil, Phone, Plus, RotateCcw, Server, Truck, Wifi } from 'lucide-react';
import type { Driver, DriverStatus, StoreSettings } from '@shared/types';
import { DRIVER_STATUS_LABEL, formatDateTime } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation, useBootstrap, useBootstrapActions, useSettings } from '@/api/hooks';
import { Badge, Button, ButtonLink, ConfirmModal, EmptyState, ErrorState, IconButton, Input, KeyValue, Modal, Select, Skeleton, Switch, errorMessage, toast, type BadgeTone } from '@/components/ui';
import { HEX_RE, parseIntInput, useAdminDrivers } from '../lib';
import { ColorField, FormSection } from '../ui';

const STATUS_TONE: Record<DriverStatus, BadgeTone> = { off: 'neutral', available: 'success', on_tour: 'brand', break: 'warning' };
const DRIVER_COLORS = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0d9488', '#ca8a04', '#dc2626'];

function DriverModal({ driver, open, onClose, usedColors }: { driver: Driver | null; open: boolean; onClose: () => void; usedColors: string[] }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [capacity, setCapacity] = useState('60');
  const [status, setStatus] = useState<DriverStatus>('off');
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(driver?.name ?? '');
    setPhone(driver?.phone ?? '');
    setVehicle(driver?.vehicle ?? '');
    setColor(driver?.color ?? DRIVER_COLORS.find((c) => !usedColors.includes(c)) ?? DRIVER_COLORS[0]);
    setCapacity(String(driver?.capacityCrates ?? 60));
    setStatus(driver?.status ?? 'off');
    setShow(false);
  }, [open, driver, usedColors]);

  const cap = parseIntInput(capacity);
  const errors = {
    name: !name.trim() ? 'Bitte den Namen angeben.' : undefined,
    capacity: cap === null || cap < 1 || cap > 500 ? 'Ganze Zahl von 1 bis 500.' : undefined,
    color: !HEX_RE.test(color) ? 'Hex-Farbe, z. B. #2563EB.' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const save = useApiMutation((d: Driver) => api.adminSaveDriver(d), {
    invalidate: [qk.admin],
    success: (d) => (driver ? `${d.name} gespeichert` : `${d.name} wurde angelegt`),
    onSuccess: () => onClose(),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (!valid) return;
    save.mutate({
      ...(driver ?? {}),
      id: driver?.id ?? '',
      name: name.trim(),
      phone: phone.trim(),
      vehicle: vehicle.trim(),
      color: color.toLowerCase(),
      capacityCrates: cap ?? 60,
      status,
    });
  };
  const onTour = driver?.status === 'on_tour';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={driver ? `${driver.name} bearbeiten` : 'Fahrer anlegen'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" form="driver-form" loading={save.isPending}>
            {driver ? 'Speichern' : 'Anlegen'}
          </Button>
        </>
      }
    >
      <form id="driver-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={show ? errors.name : undefined} maxLength={80} autoFocus={!driver} />
          <Input label="Telefon" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="0171 …" />
          <Input label="Fahrzeug & Kennzeichen" value={vehicle} onChange={(e) => setVehicle(e.target.value)} containerClassName="sm:col-span-2" maxLength={80} placeholder="z. B. Mercedes Sprinter · M-GA 2041" />
          <Input label="Ladekapazität" required inputMode="numeric" suffix="Kästen" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))} error={show ? errors.capacity : undefined} hint="Max. Gebinde pro Fahrt" />
          <Select
            label="Status"
            value={status}
            disabled={onTour}
            onChange={(e) => setStatus(e.target.value as DriverStatus)}
            options={(['available', 'break', 'off', 'on_tour'] as DriverStatus[]).map((s) => ({ value: s, label: DRIVER_STATUS_LABEL[s], disabled: s === 'on_tour' && !onTour }))}
            hint={onTour ? 'Der Fahrer ist gerade auf Tour.' : undefined}
          />
        </div>
        <ColorField label="Kennfarbe auf Karten" value={color} onChange={setColor} error={show ? errors.color : undefined} />
        <div className="flex flex-wrap gap-2">
          {DRIVER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Farbe ${c}`}
              aria-pressed={color.toLowerCase() === c}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white aria-pressed:border-brand-600 aria-pressed:shadow-[0_0_0_2px_var(--color-brand-600)]"
            >
              <span className="h-6 w-6 rounded-full" style={{ background: c }} />
            </button>
          ))}
        </div>
      </form>
    </Modal>
  );
}

/** Fahrer & Fahrzeuge (sofort gespeichert über adminSaveDriver) */
export function DriversSection() {
  const { data, isLoading, error, refetch } = useAdminDrivers();
  const [edit, setEdit] = useState<{ driver: Driver | null } | null>(null);
  const drivers = data ?? [];
  return (
    <FormSection
      title="Fahrer & Fahrzeuge"
      subtitle="Änderungen werden sofort gespeichert und erscheinen in Tourenplanung und Live-Karte"
      icon={Truck}
      action={
        <Button size="sm" icon={Plus} onClick={() => setEdit({ driver: null })}>
          Fahrer anlegen
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !drivers.length ? (
        <EmptyState icon={Truck} title="Noch keine Fahrer" description="Legen Sie Ihre Fahrer und Fahrzeuge an, um Touren zu planen." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {drivers.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: d.color }}>
                <Truck size={22} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{d.name}</span>
                  <Badge tone={STATUS_TONE[d.status]}>{DRIVER_STATUS_LABEL[d.status]}</Badge>
                </p>
                <p className="truncate text-sm text-slate-600">{d.vehicle || 'kein Fahrzeug hinterlegt'}</p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  {d.phone ? (
                    <a href={`tel:${d.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                      <Phone size={12} aria-hidden /> {d.phone}
                    </a>
                  ) : null}
                  <span>max. {d.capacityCrates} Kästen</span>
                </p>
              </div>
              <IconButton icon={Pencil} label={`${d.name} bearbeiten`} onClick={() => setEdit({ driver: d })} />
            </li>
          ))}
        </ul>
      )}
      <DriverModal open={!!edit} driver={edit?.driver ?? null} onClose={() => setEdit(null)} usedColors={drivers.map((d) => d.color.toLowerCase())} />
    </FormSection>
  );
}

/** Demo: Betriebsmodus anzeigen, automatische Bestätigung, Demo-Daten zurücksetzen */
export function DemoSection({ onReset, onSettingsSaved }: { onReset: (settings: StoreSettings) => void; onSettingsSaved?: (settings: StoreSettings) => void }) {
  const bootstrap = useBootstrap();
  const settings = useSettings();
  const { update } = useBootstrapActions();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);

  // sofort gespeichert (wie Fahrer) – unabhängig von ungespeicherten Änderungen in anderen Bereichen
  const setAutoConfirm = async (value: boolean) => {
    setSavingAuto(true);
    try {
      const saved = await api.adminSaveSettings({ ...settings, demoAutoConfirm: value });
      update({ settings: saved });
      onSettingsSaved?.(saved);
      toast.success(value ? 'Neue Bestellungen werden automatisch bestätigt' : 'Der Markt bestätigt neue Bestellungen selbst', {
        id: 'demo-auto-confirm',
        description: value ? 'Gilt für Bestellungen, die ab jetzt eingehen (nach wenigen Sekunden).' : 'Neue Bestellungen bleiben „Eingegangen“, bis Sie sie bestätigen.',
      });
    } catch (err) {
      toast.error(errorMessage(err), { id: 'demo-auto-confirm' });
    } finally {
      setSavingAuto(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api.resetDemo();
      const fresh = await api.getBootstrap();
      update(fresh);
      onReset(fresh.settings);
      await qc.invalidateQueries();
      toast.success('Demo-Daten wurden zurückgesetzt', { id: 'data-reset', description: 'Alle Ansichten zeigen wieder den Ausgangsstand.' });
      setConfirm(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remote = bootstrap.mode === 'remote';
  return (
    <div className="space-y-6">
      <FormSection title="Betriebsmodus" icon={remote ? Server : Database}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${remote ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'}`}>
            {remote ? <Wifi size={26} aria-hidden /> : <Database size={26} aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-slate-900">{remote ? 'Server-Modus (live)' : 'Offline-Demo im Browser'}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {remote
                ? 'Alle Geräte – Kunden-Handy, Fahrer-iPhone und Markt-PC – arbeiten mit denselben Daten auf dem Server und sehen Änderungen in Echtzeit.'
                : 'Die Daten liegen nur in diesem Browser. Mehrere Tabs desselben Browsers synchronisieren sich untereinander.'}
            </p>
            <KeyValue
              className="mt-4 max-w-md"
              items={[
                ['Modus', remote ? 'remote (Node-Server)' : 'local (Browser)'],
                ['Version', bootstrap.version],
                ['Grunddaten geladen', formatDateTime(bootstrap.serverTime)],
                ['Demo-Zugänge', `${bootstrap.demoUsers.length}`],
              ]}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Bestellungen automatisch bestätigen" subtitle="Für unbeaufsichtigte Vorführungen – sofort gespeichert" icon={CheckCheck}>
        <Switch
          checked={!!settings.demoAutoConfirm}
          onChange={(v) => void setAutoConfirm(v)}
          disabled={savingAuto}
          label="Neue Bestellungen automatisch bestätigen"
          description={
            settings.demoAutoConfirm
              ? 'An: Neue Bestellungen werden nach wenigen Sekunden automatisch bestätigt (Verlauf „Automatisch bestätigt“). Telefonbestellungen sind immer sofort bestätigt.'
              : 'Aus (empfohlen für die Vorführung): Neue Bestellungen bleiben „Eingegangen“, bis der Markt sie im Bestell-Board bestätigt.'
          }
        />
      </FormSection>

      <FormSection title="Demo-Daten zurücksetzen" subtitle="Für einen sauberen Start vor jeder Vorführung" icon={RotateCcw}>
        <p className="text-sm leading-relaxed text-slate-600">
          Setzt Sortiment, Kunden, Bestellungen, Touren, Rechnungen und Einstellungen auf den Ausgangsstand von heute zurück. Laufende Fahrtsimulationen werden beendet; angemeldete Geräte bleiben angemeldet und laden automatisch neu.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="danger" icon={RotateCcw} onClick={() => setConfirm(true)}>
            Demo-Daten zurücksetzen
          </Button>
          <ButtonLink to="/demo" variant="ghost" icon={BookOpen}>
            Demo-Leitfaden
          </ButtonLink>
        </div>
      </FormSection>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void reset()}
        loading={busy}
        tone="danger"
        title="Alle Daten zurücksetzen?"
        message="Alle Änderungen seit dem letzten Zurücksetzen gehen verloren – auch neue Bestellungen, Kunden und Einstellungen. Das lässt sich nicht rückgängig machen."
        confirmLabel="Zurücksetzen"
      />
    </div>
  );
}

