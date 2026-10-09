import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, Building, CheckCircle2, Info, MapPin, MapPinned, MessageSquareText, Pencil, Plus, Star, Trash2, Truck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Address, Customer } from '@shared/types';
import { formatDistance, formatEuro } from '@shared/format';
import { haversine } from '@shared/core/geo';
import { api } from '@/api/client';
import { qk, useApiMutation, useMyCustomer, useMySubscriptions, useSettings } from '@/api/hooks';
import { cn } from '@/lib/cn';
import { BaseMap, HomeMarker } from '@/components/map';
import { Badge, Button, Card, ConfirmModal, IconButton, EmptyState, ErrorState, Notice, PageHeader, Skeleton } from '@/components/ui';
import { AddressFormModal } from './components/AddressFormModal';
import { floorLabel, zoneHint } from './lib/helpers';

function AddressMap({ address }: { address: Address }) {
  const fitTo = useMemo<[number, number][]>(() => [[address.lat, address.lng]], [address.lat, address.lng]);
  return (
    <div className="relative h-40 overflow-hidden bg-slate-100">
      <BaseMap static center={fitTo[0]} zoom={15} fitTo={fitTo} maxFitZoom={15} zoomControl={false}>
        <HomeMarker position={address} label={address.label} />
      </BaseMap>
    </div>
  );
}

interface CardProps {
  address: Address;
  customer: Customer;
  usedBy: string[];
  onEdit: () => void;
  onDelete: () => void;
  onDefault: () => void;
  settingDefault: boolean;
}

function AddressCard({ address, customer, usedBy, onEdit, onDelete, onDefault, settingDefault }: CardProps) {
  const settings = useSettings();
  const isDefault = customer.defaultAddressId === address.id;
  const hint = zoneHint(settings, address.zip, !!customer.b2b?.freeDelivery && customer.b2b.status === 'active');
  const distance = haversine(address, settings.location);
  const floor = floorLabel(address.floor);
  return (
    <Card padding="none" className={cn('flex flex-col overflow-hidden', isDefault && 'ring-2 ring-brand-600/80')}>
      <AddressMap address={address} />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{address.label}</h3>
              {isDefault ? (
                <Badge tone="brand" icon={Star}>
                  Standard
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-[15px] leading-snug text-slate-700">
              {address.name ? <span className="block font-medium text-slate-900">{address.name}</span> : null}
              {address.street}
              <br />
              {address.zip} {address.city}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 tabular-nums" title="Luftlinie zum Markt">
            {formatDistance(distance)} zum Markt
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {floor ? (
            <Badge tone="neutral" icon={Building}>
              {floor}
            </Badge>
          ) : null}
          {address.floor !== undefined && address.floor > 0 ? (
            <Badge tone={address.hasElevator ? 'success' : 'warning'} icon={ArrowUpDown}>
              {address.hasElevator ? 'mit Aufzug' : 'ohne Aufzug'}
            </Badge>
          ) : null}
          {usedBy.length ? (
            <Badge tone="info" icon={Truck}>
              {usedBy.length === 1 ? `für „${usedBy[0]}“` : `${usedBy.length} Abos`}
            </Badge>
          ) : null}
        </div>

        {address.notes ? (
          <p className="mt-3 flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <MessageSquareText size={16} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
            <span className="min-w-0">{address.notes}</span>
          </p>
        ) : null}

        <p className={cn('mt-3 flex items-start gap-2 text-sm', hint.inArea ? 'text-emerald-800' : 'text-amber-800')}>
          {hint.inArea ? <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" /> : <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-600" />}
          <span>
            {hint.zone ? <strong className="font-semibold">{hint.zone.name}: </strong> : null}
            {hint.text}
          </span>
        </p>

        <div className="flex-1" />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {!isDefault ? (
            <Button size="sm" variant="secondary" icon={Star} onClick={onDefault} loading={settingDefault}>
              Als Standard
            </Button>
          ) : null}
          <Button size="sm" variant="outline" icon={Pencil} onClick={onEdit}>
            Bearbeiten
          </Button>
          <IconButton size="sm" icon={Trash2} label={`Adresse „${address.label}“ löschen`} onClick={onDelete} className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" />
        </div>
      </div>
    </Card>
  );
}

function ZoneOverview({ freeDelivery }: { freeDelivery: boolean }) {
  const settings = useSettings();
  return (
    <Notice tone="info" icon={MapPin} className="mt-6" title="Unser Liefergebiet">
      <ul className="mt-1 space-y-0.5">
        {settings.zones.map((z) => (
          <li key={z.id}>
            <strong className="font-semibold">{z.name}</strong> (PLZ {z.zips.join(', ')}):{' '}
            {freeDelivery || !z.fee ? 'Lieferung kostenlos' : `${formatEuro(z.fee)} Liefergebühr, ab ${formatEuro(z.freeFrom)} frei Haus`} · Mindestbestellwert{' '}
            {formatEuro(z.minOrder)}
          </li>
        ))}
      </ul>
      <p className="mt-1.5">Außerhalb des Liefergebiets reservieren Sie bequem per Click &amp; Collect.</p>
    </Notice>
  );
}

/** Lieferadressen verwalten */
export default function AddressesPage() {
  const { data: customer, isLoading, error, refetch } = useMyCustomer();
  const { data: subs } = useMySubscriptions();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const setDefault = useApiMutation((id: string) => api.updateMyCustomer({ defaultAddressId: id }), {
    success: 'Standard-Lieferadresse geändert.',
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
    },
  });
  const remove = useApiMutation((id: string) => api.deleteAddress(id), {
    success: 'Adresse gelöscht.',
    onSuccess: (c) => {
      qc.setQueryData(qk.customer, c);
      setDeleting(null);
    },
    onError: () => setDeleting(null),
  });

  const sorted = useMemo(() => {
    if (!customer) return [];
    return [...customer.addresses].sort((a, b) => Number(b.id === customer.defaultAddressId) - Number(a.id === customer.defaultAddressId));
  }, [customer]);

  const usedBy = (id: string) => (subs ?? []).filter((s) => s.active && s.addressId === id).map((s) => s.name);
  const blockedBy = deleting ? usedBy(deleting.id) : [];
  const navigate = useNavigate();
  const b2b = customer?.type === 'b2b';

  return (
    <>
      <PageHeader
        title={b2b ? 'Lieferadressen' : 'Meine Adressen'}
        subtitle="Wohin dürfen wir liefern? Die Standardadresse ist an der Kasse vorausgewählt."
        back="/konto"
        actions={
          customer && customer.addresses.length ? (
            <Button icon={Plus} onClick={() => setEditing('new')} className="w-full sm:w-auto">
              Neue Adresse
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : error || !customer ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : customer.addresses.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPinned}
            title="Noch keine Adresse gespeichert"
            description="Legen Sie Ihre Lieferadresse an – mit Stockwerk und Hinweis für den Fahrer kommt Ihre Lieferung sicher an."
            action={
              <Button icon={Plus} onClick={() => setEditing('new')}>
                Adresse hinzufügen
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((a) => (
              <AddressCard
                key={a.id}
                address={a}
                customer={customer}
                usedBy={usedBy(a.id)}
                onEdit={() => setEditing(a)}
                onDelete={() => setDeleting(a)}
                onDefault={() => setDefault.mutate(a.id)}
                settingDefault={setDefault.isPending && setDefault.variables === a.id}
              />
            ))}
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 p-6 text-center text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-card">
                <Plus size={22} aria-hidden />
              </span>
              <span className="text-[15px] font-semibold">Weitere Adresse hinzufügen</span>
              <span className="max-w-60 text-sm">z. B. Büro, Eltern oder das Vereinsheim für Ihr nächstes Fest</span>
            </button>
          </div>
          <ZoneOverview freeDelivery={!!customer.b2b?.freeDelivery && customer.b2b.status === 'active'} />
        </>
      )}

      {editing && customer ? (
        <AddressFormModal customer={customer} address={editing === 'new' ? null : editing} open onClose={() => setEditing(null)} />
      ) : null}
      {deleting && blockedBy.length ? (
        <ConfirmModal
          open
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            setDeleting(null);
            navigate(customer?.type === 'b2b' ? '/business/dauerauftraege' : '/konto/abos');
          }}
          title="Adresse wird noch verwendet"
          message={
            <>
              „{deleting.label}“ ist die Lieferadresse {blockedBy.length === 1 ? `von „${blockedBy[0]}“` : `von ${blockedBy.length} ${customer?.type === 'b2b' ? 'Daueraufträgen' : 'Abos'}`}. Bitte wählen Sie dort zuerst
              eine andere Adresse oder pausieren Sie {blockedBy.length === 1 ? 'es' : 'sie'}.
            </>
          }
          confirmLabel={customer?.type === 'b2b' ? 'Zu den Daueraufträgen' : 'Zu den Abos'}
          cancelLabel="Schließen"
        />
      ) : (
        <ConfirmModal
          open={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id)}
          title="Adresse löschen?"
          message={
            deleting ? (
              <>
                „{deleting.label}“ – {deleting.street}, {deleting.zip} {deleting.city} wird entfernt.
                {customer?.defaultAddressId === deleting.id && customer.addresses.length > 1 ? ' Eine andere Adresse wird dann Ihre Standardadresse.' : ''}
              </>
            ) : null
          }
          confirmLabel="Löschen"
          tone="danger"
          loading={remove.isPending}
        />
      )}
    </>
  );
}
