import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type L from 'leaflet';
import {
  ArrowUp,
  Building,
  Check,
  Lock,
  MapPin,
  MapPinOff,
  Pencil,
  Phone,
  Plus,
  Star,
  StickyNote,
  Tags,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Address, Customer, LatLng } from '@shared/types';
import { formatEuro } from '@shared/format';
import { todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useApiMutation, useMyCustomer, useMyOrders, useSettings } from '@/api/hooks';
import { useUser } from '@/stores/session';
import { cn } from '@/lib/cn';
import { BaseMap, HomeMarker, StoreMarker } from '@/components/map';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmModal,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Section,
  Skeleton,
  toast,
} from '@/components/ui';
import { BusinessNav } from './components/BusinessNav';
import { AddressFormModal, type AddressFormValue } from './components/AddressFormModal';

function floorText(a: Address): string | null {
  if (a.floor === undefined) return null;
  const f = a.floor < 0 ? 'Untergeschoss' : a.floor === 0 ? 'Erdgeschoss' : `${a.floor}. OG`;
  if (a.floor === 0) return f;
  return `${f} · ${a.hasElevator ? 'mit Aufzug' : 'ohne Aufzug'}`;
}

// ───────────────────────────── Standort-Karte ─────────────────────────────

function AddressCard({
  address,
  index,
  isDefault,
  selected,
  zoneName,
  onSelect,
  onEdit,
  onDelete,
  onDefault,
  busyDefault,
}: {
  address: Address;
  index: number;
  isDefault: boolean;
  selected: boolean;
  zoneName: string | null;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDefault: () => void;
  busyDefault: boolean;
}) {
  const floor = floorText(address);
  return (
    <li>
      <Card
        padding="none"
        className={cn('overflow-hidden transition-[border-color,box-shadow]', selected ? 'border-brand-400 ring-2 ring-brand-200' : 'hover:border-slate-300')}
      >
        <button type="button" onClick={onSelect} className="flex w-full items-start gap-3.5 p-4 text-left sm:p-5" aria-pressed={selected}>
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
              selected ? 'bg-brand-700 text-white' : isDefault ? 'bg-accent-100 text-accent-800' : 'bg-slate-100 text-slate-600',
            )}
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-base font-semibold text-slate-900">{address.label}</span>
              {isDefault ? (
                <Badge tone="accent" icon={Star}>
                  Standard
                </Badge>
              ) : null}
              {zoneName ? (
                <Badge tone="success">{zoneName}</Badge>
              ) : (
                <Badge tone="warning" icon={MapPinOff}>
                  außerhalb Liefergebiet
                </Badge>
              )}
            </span>
            <span className="mt-1 block text-[15px] leading-snug text-slate-700">
              {address.name ? <span className="block">{address.name}</span> : null}
              <span className="block">{address.street}</span>
              <span className="block">
                {address.zip} {address.city}
              </span>
            </span>
            {floor ? <span className="mt-1 block text-[13px] text-slate-500">{floor}</span> : null}
            {address.notes ? (
              <span className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900 ring-1 ring-inset ring-amber-200/70">
                <StickyNote size={15} aria-hidden className="mt-px shrink-0 text-amber-600" />
                <span>
                  <span className="font-semibold">Anlieferhinweis:</span> {address.notes}
                </span>
              </span>
            ) : (
              <span className="mt-2 block text-[13px] text-slate-400">Kein Anlieferhinweis hinterlegt</span>
            )}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2 sm:px-4">
          <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
            Bearbeiten
          </Button>
          {!isDefault ? (
            <Button variant="ghost" size="sm" icon={Star} onClick={onDefault} loading={busyDefault}>
              Als Standard
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={16} aria-hidden />
            Löschen
          </button>
        </div>
      </Card>
    </li>
  );
}

// ───────────────────────────── Kostenstellen ─────────────────────────────

function CostCenters({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const ordersQ = useMyOrders();
  const list = customer.b2b?.costCenters ?? [];
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const year = todayString().slice(0, 4);

  const usage = useMemo(() => {
    const map = new Map<string, { count: number; net: number }>();
    for (const o of ordersQ.data ?? []) {
      if (!o.costCenter || o.status === 'cancelled' || !o.createdAt.startsWith(year)) continue;
      const u = map.get(o.costCenter) ?? { count: 0, net: 0 };
      u.count += 1;
      u.net += o.totals.itemsNet;
      map.set(o.costCenter, u);
    }
    return map;
  }, [ordersQ.data, year]);

  const save = useApiMutation((next: string[]) => api.setCostCenters(next), {
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
    },
  });

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (list.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.info(`Die Kostenstelle „${name}“ gibt es bereits.`);
      return;
    }
    save.mutate([...list, name], {
      onSuccess: () => {
        setDraft('');
        toast.success(`Kostenstelle „${name}“ angelegt`);
      },
    });
  };

  const rename = () => {
    if (!editing) return;
    const name = editing.value.trim();
    const old = list[editing.index];
    if (!name || name === old) {
      setEditing(null);
      return;
    }
    if (list.some((c, i) => i !== editing.index && c.toLowerCase() === name.toLowerCase())) {
      toast.info(`Die Kostenstelle „${name}“ gibt es bereits.`);
      return;
    }
    save.mutate(
      list.map((c, i) => (i === editing.index ? name : c)),
      {
        onSuccess: () => {
          setEditing(null);
          toast.success(`Umbenannt in „${name}“`, { description: 'Bereits erteilte Bestellungen behalten die alte Bezeichnung.' });
        },
      },
    );
  };

  const move = (index: number) => {
    if (index <= 0) return;
    const next = [...list];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    save.mutate(next);
  };

  return (
    <Card padding="lg">
      <CardHeader
        icon={Tags}
        title="Kostenstellen"
        subtitle="Wählbar bei jeder Bestellung – erscheinen auf Lieferschein und Rechnung."
      />
      {list.length ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {list.map((c, i) => {
            const u = usage.get(c);
            const isEditing = editing?.index === i;
            return (
              <li key={c} className="flex items-center gap-3 px-3.5 py-2.5">
                {isEditing ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <Input
                      aria-label="Neuer Name der Kostenstelle"
                      value={editing.value}
                      maxLength={60}
                      autoFocus
                      onChange={(e) => setEditing({ index: i, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      containerClassName="flex-1"
                      className="h-10"
                    />
                    <IconButton icon={Check} label="Speichern" type="submit" variant="primary" size="sm" loading={save.isPending} />
                    <IconButton icon={X} label="Abbrechen" size="sm" onClick={() => setEditing(null)} />
                  </form>
                ) : (
                  <>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">{c}</span>
                      <span className="block text-[13px] text-slate-500">
                        {u ? `${u.count} ${u.count === 1 ? 'Bestellung' : 'Bestellungen'} ${year} · ${formatEuro(u.net)} netto` : `noch keine Bestellung ${year}`}
                      </span>
                    </span>
                    {i > 0 ? <IconButton icon={ArrowUp} label={`„${c}“ nach oben`} size="sm" onClick={() => move(i)} disabled={save.isPending} className="text-slate-400" /> : null}
                    <IconButton icon={Pencil} label={`„${c}“ umbenennen`} size="sm" onClick={() => setEditing({ index: i, value: c })} className="text-slate-500" />
                    <IconButton icon={Trash2} label={`„${c}“ entfernen`} size="sm" onClick={() => setToDelete(c)} className="text-slate-400 hover:text-red-600" />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Noch keine Kostenstellen – legen Sie z. B. „Küche“, „Schank“ oder „Events“ an.
        </p>
      )}

      <form onSubmit={add} className="mt-4 flex items-start gap-2">
        <Input
          aria-label="Neue Kostenstelle"
          placeholder="Neue Kostenstelle, z. B. Sommerfest"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          containerClassName="flex-1"
        />
        <Button type="submit" icon={Plus} disabled={!draft.trim() || list.length >= 30} loading={save.isPending && !editing}>
          Hinzufügen
        </Button>
      </form>
      {list.length >= 30 ? <p className="mt-2 text-sm text-slate-500">Maximal 30 Kostenstellen möglich.</p> : null}

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        tone="danger"
        title={`Kostenstelle „${toDelete ?? ''}“ entfernen?`}
        message="Sie steht bei neuen Bestellungen nicht mehr zur Auswahl. Bisherige Bestellungen und Rechnungen bleiben unverändert."
        confirmLabel="Entfernen"
        loading={save.isPending}
        onConfirm={() => {
          const name = toDelete;
          if (!name) return;
          save.mutate(
            list.filter((c) => c !== name),
            {
              onSuccess: () => {
                setToDelete(null);
                toast.success(`Kostenstelle „${name}“ entfernt`);
              },
            },
          );
        }}
      />
    </Card>
  );
}

// ───────────────────────────── Ansprechpartner & Besteller ─────────────────────────────

function Orderers({ customer }: { customer: Customer }) {
  const user = useUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ contactName: customer.contactName, phone: customer.phone });
  const save = useApiMutation((patch: { contactName: string; phone: string }) => api.updateMyCustomer(patch), {
    success: 'Ansprechpartner gespeichert',
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
      setOpen(false);
    },
  });
  const person = customer.contactName || user?.name || customer.name;

  return (
    <Card padding="lg">
      <CardHeader icon={Users} title="Ansprechpartner & Besteller" subtitle="Wer für Ihr Unternehmen bestellen darf" />
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5">
        <Avatar name={person} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-900">{person}</span>
            <Badge tone="brand">Hauptbesteller</Badge>
          </p>
          <p className="truncate text-sm text-slate-500">{user?.email ?? customer.email}</p>
          {customer.phone ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
              <Phone size={13} aria-hidden />
              {customer.phone}
            </p>
          ) : null}
          <p className="mt-1.5 text-[13px] text-slate-500">Alle Rechte: bestellen, Rechnungen, Standorte und Kostenstellen verwalten.</p>
        </div>
        <IconButton
          icon={Pencil}
          label="Ansprechpartner bearbeiten"
          size="sm"
          onClick={() => {
            setForm({ contactName: customer.contactName, phone: customer.phone });
            setOpen(true);
          }}
        />
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200">
            <UserPlus size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-700">
              Weitere Besteller einladen
              <Badge tone="info">bald verfügbar</Badge>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Eigene Zugänge für Küchenchef, Schichtleitung oder Office-Team – mit Bestellfreigabe, Budget je Kostenstelle und Benachrichtigungen.
            </p>
          </div>
        </div>
        <Button variant="outline" icon={Lock} disabled block className="mt-3" title="Diese Funktion ist bald verfügbar">
          Besteller einladen
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Ansprechpartner bearbeiten"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Abbrechen
            </Button>
            <Button type="submit" form="contact-form" loading={save.isPending}>
              Speichern
            </Button>
          </>
        }
      >
        <form
          id="contact-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.contactName.trim()) {
              toast.error('Bitte geben Sie einen Namen an.');
              return;
            }
            save.mutate({ contactName: form.contactName.trim(), phone: form.phone.trim() });
          }}
        >
          <Input label="Name" required value={form.contactName} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} autoFocus />
          <Input label="Telefon" type="tel" value={form.phone} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </form>
      </Modal>
    </Card>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

/** Lieferstandorte, Kostenstellen und Besteller (B2B) */
export default function LocationsPage() {
  const qc = useQueryClient();
  const settings = useSettings();
  const customerQ = useMyCustomer();
  const customer = customerQ.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [toDelete, setToDelete] = useState<Address | null>(null);
  const [defaultBusy, setDefaultBusy] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapBox = useRef<HTMLDivElement | null>(null);

  const addresses = useMemo(() => customer?.addresses ?? [], [customer?.addresses]);
  const zoneFor = (zip: string) => settings.zones.find((z) => z.zips.includes(zip))?.name ?? null;
  const points = useMemo<LatLng[]>(() => [[settings.location.lat, settings.location.lng], ...addresses.map((a) => [a.lat, a.lng] as LatLng)], [addresses, settings.location]);

  const saveAddress = useApiMutation(
    async ({ input, makeDefault }: AddressFormValue) => {
      const before = new Set((customer?.addresses ?? []).map((a) => a.id));
      let c = await api.saveAddress(input);
      const savedId = input.id ?? c.addresses.find((a) => !before.has(a.id))?.id;
      if (makeDefault && savedId && c.defaultAddressId !== savedId) c = await api.updateMyCustomer({ defaultAddressId: savedId });
      return { customer: c, savedId };
    },
    {
      success: (_r, v) => (v.input.id ? `Standort „${v.input.label}“ gespeichert` : `Standort „${v.input.label}“ angelegt`),
      onSuccess: ({ customer: c, savedId }) => {
        qc.setQueryData(qk.customer, c);
        setFormOpen(false);
        setEditing(null);
        if (savedId) focus(c.addresses.find((a) => a.id === savedId));
      },
    },
  );

  const deleteAddress = useApiMutation((id: string) => api.deleteAddress(id), {
    success: 'Standort gelöscht',
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
      setToDelete(null);
      setSelectedId(null);
    },
  });

  const setDefault = useApiMutation((id: string) => api.updateMyCustomer({ defaultAddressId: id }), {
    success: 'Standard-Lieferadresse geändert',
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
    },
  });

  const focus = (a: Address | undefined) => {
    if (!a) return;
    setSelectedId(a.id);
    mapRef.current?.flyTo([a.lat, a.lng], 16, { duration: 0.6 });
    if (window.matchMedia('(max-width: 1023px)').matches) mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (customerQ.isError) {
    return (
      <>
        <BusinessNav />
        <ErrorState error={customerQ.error} onRetry={() => void customerQ.refetch()} />
      </>
    );
  }

  return (
    <div>
      <BusinessNav />
      <PageHeader
        title="Standorte & Kostenstellen"
        subtitle="Lieferadressen mit Anlieferhinweisen, Kostenstellen für Ihre Buchhaltung und alle, die für Sie bestellen."
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            disabled={!customer || addresses.length >= 20}
            className="w-full sm:w-auto"
          >
            Standort hinzufügen
          </Button>
        }
      />

      <Section
        title={
          <span className="flex items-center gap-2">
            Lieferstandorte
            {customer ? <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-sm font-semibold text-slate-600 tabular-nums">{addresses.length}</span> : null}
          </span>
        }
        subtitle="Die Standard-Adresse ist an der Kasse vorausgewählt – pro Bestellung wählen Sie frei."
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
          {/* Karte */}
          <div ref={mapBox} className="lg:sticky lg:top-[8.5rem] lg:order-2">
            <Card padding="none" className="overflow-hidden">
              <div className="h-60 sm:h-80 lg:h-[30rem]">
                {customer ? (
                  <BaseMap fitTo={points} fitPadding={56} maxFitZoom={15} onReady={(m) => (mapRef.current = m)}>
                    <StoreMarker />
                    {addresses.map((a) => (
                      <HomeMarker
                        key={a.id}
                        position={a}
                        label={`${addresses.indexOf(a) + 1} · ${a.label}`}
                        color={a.id === selectedId ? '#1d58a0' : a.id === customer.defaultAddressId ? '#f2a900' : '#64748b'}
                        permanentLabel={a.id === selectedId}
                      />
                    ))}
                  </BaseMap>
                ) : (
                  <Skeleton className="h-full w-full rounded-none" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-500" aria-hidden /> Standard
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden /> weitere Standorte
                </span>
                <span className="flex items-center gap-1.5">
                  <Building size={13} aria-hidden className="text-brand-700" /> Markt Garching
                </span>
              </div>
            </Card>
          </div>

          {/* Liste */}
          <div className="lg:order-1">
            {!customer ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-44 w-full rounded-2xl" />
                ))}
              </div>
            ) : addresses.length ? (
              <ul className="space-y-3">
                {addresses.map((a, i) => (
                  <AddressCard
                    key={a.id}
                    address={a}
                    index={i}
                    isDefault={a.id === customer.defaultAddressId}
                    selected={a.id === selectedId}
                    zoneName={zoneFor(a.zip)}
                    onSelect={() => focus(a)}
                    onEdit={() => {
                      setEditing(a);
                      setFormOpen(true);
                    }}
                    onDelete={() => setToDelete(a)}
                    onDefault={() => {
                      setDefaultBusy(a.id);
                      setDefault.mutate(a.id, { onSettled: () => setDefaultBusy(null) });
                    }}
                    busyDefault={defaultBusy === a.id}
                  />
                ))}
                {addresses.length < 20 ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-5 text-[15px] font-semibold text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
                    >
                      <Plus size={18} aria-hidden />
                      Weiteren Standort anlegen (z. B. Biergarten, Lager, Filiale)
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : (
              <Card>
                <EmptyState
                  icon={MapPin}
                  title="Noch kein Lieferstandort"
                  description="Legen Sie Ihre Lieferadresse mit Anlieferhinweisen an – z. B. „Rampe Hintereingang, ab 7 Uhr“."
                  action={
                    <Button icon={Plus} onClick={() => setFormOpen(true)}>
                      Standort anlegen
                    </Button>
                  }
                />
              </Card>
            )}
          </div>
        </div>
      </Section>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 lg:grid-cols-2 lg:gap-6">
        {customer ? (
          <>
            <CostCenters customer={customer} />
            <Orderers customer={customer} />
          </>
        ) : (
          <>
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </>
        )}
      </div>

      <AddressFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        address={editing}
        defaultName={customer?.name ?? ''}
        isDefault={!!editing && editing.id === customer?.defaultAddressId}
        saving={saveAddress.isPending}
        onSave={(v) => saveAddress.mutate(v)}
      />

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        tone="danger"
        title={`Standort „${toDelete?.label ?? ''}“ löschen?`}
        message={
          toDelete ? (
            <>
              {toDelete.street}, {toDelete.zip} {toDelete.city} wird aus Ihren Lieferstandorten entfernt.
              {toDelete.id === customer?.defaultAddressId && addresses.length > 1 ? ' Ein anderer Standort wird dann zur Standard-Adresse.' : ''}
              {addresses.length === 1 ? ' Danach ist keine Lieferadresse mehr hinterlegt.' : ''} Bestehende Bestellungen bleiben unverändert.
            </>
          ) : undefined
        }
        confirmLabel="Löschen"
        loading={deleteAddress.isPending}
        onConfirm={() => toDelete && deleteAddress.mutate(toDelete.id)}
      />
    </div>
  );
}
