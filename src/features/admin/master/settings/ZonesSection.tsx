import { useMemo, useState, type KeyboardEvent } from 'react';
import { Crosshair, MapPinned, Plus, Trash2, X } from 'lucide-react';
import type { DeliveryZone, LatLng } from '@shared/types';
import { formatEuro } from '@shared/format';
import { PLZ_INFO } from '@shared/core/geo';
import { useSettings } from '@/api/hooks';
import { Button, ConfirmModal, Input } from '@/components/ui';
import { BaseMap, StoreMarker, ZoneCircles } from '@/components/map';
import { cn } from '@/lib/cn';
import { HEX_RE, parseDecimalInput, parseEuro, ZIP_RE } from '../lib';
import { ColorField, EuroField } from '../ui';
import { newKey, type ZoneDraft } from './settingsDraft';
import type { SectionProps } from './GeneralSections';

const ZONE_COLORS = ['#1d58a0', '#f2a900', '#7c3aed', '#0d9488', '#db2777', '#ea580c', '#16a34a', '#0284c7'];

function zipCenter(zips: string[]): { lat: number; lng: number } | null {
  const known = zips.map((z) => PLZ_INFO[z]?.center).filter((c): c is { lat: number; lng: number } => !!c);
  if (!known.length) return null;
  return {
    lat: Math.round((known.reduce((s, c) => s + c.lat, 0) / known.length) * 10000) / 10000,
    lng: Math.round((known.reduce((s, c) => s + c.lng, 0) / known.length) * 10000) / 10000,
  };
}

function ZipEditor({ zips, onChange, error }: { zips: string[]; onChange: (z: string[]) => void; error?: string }) {
  const [input, setInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const add = () => {
    const parts = input.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const bad = parts.filter((p) => !ZIP_RE.test(p));
    const good = parts.filter((p) => ZIP_RE.test(p) && !zips.includes(p));
    if (good.length) onChange([...zips, ...good]);
    setHint(bad.length ? `Keine gültige PLZ: ${bad.join(', ')}` : null);
    setInput(bad.join(' '));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      add();
    }
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">Postleitzahlen</p>
      <div className={cn('flex flex-wrap items-center gap-1.5 rounded-xl border bg-white p-1.5 shadow-xs', error ? 'border-red-400' : 'border-slate-300')}>
        {zips.map((z) => (
          <span key={z} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 pl-2.5 pr-1 text-sm font-semibold tabular-nums text-slate-800" title={PLZ_INFO[z]?.city}>
            {z}
            {PLZ_INFO[z] ? <span className="hidden font-normal text-slate-500 sm:inline">{PLZ_INFO[z].city}</span> : null}
            <button type="button" onClick={() => onChange(zips.filter((x) => x !== z))} aria-label={`PLZ ${z} entfernen`} className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800">
              <X size={13} aria-hidden />
            </button>
          </span>
        ))}
        <input
          aria-label="PLZ hinzufügen"
          inputMode="numeric"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^\d\s,;]/g, ''))}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={zips.length ? 'weitere PLZ …' : 'PLZ eingeben, z. B. 85748'}
          className="h-8 min-w-28 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-slate-400 sm:text-sm"
        />
      </div>
      {error ? <p className="mt-1.5 text-sm font-medium text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-sm font-medium text-amber-700">{hint}</p> : <p className="mt-1.5 text-sm text-slate-500">Mit Enter, Komma oder Leerzeichen hinzufügen.</p>}
    </div>
  );
}

/** Liefergebiete: PLZ, Gebühr, Mindestwert, frei ab, Farbe – mit Karte */
export function ZonesSection({ draft, update, v }: SectionProps) {
  const settings = useSettings();
  const [remove, setRemove] = useState<ZoneDraft | null>(null);
  const zones = draft.zones;

  const patch = (key: string, p: Partial<ZoneDraft>) => update((d) => ({ ...d, zones: d.zones.map((z) => (z.key === key ? { ...z, ...p } : z)) }));
  const addZone = () =>
    update((d) => ({
      ...d,
      zones: [
        ...d.zones,
        {
          key: newKey('z'),
          id: '',
          name: 'Neues Liefergebiet',
          zips: [],
          fee: '4,90',
          minOrder: '30,00',
          freeFrom: '75,00',
          color: ZONE_COLORS.find((c) => !d.zones.some((z) => z.color.toLowerCase() === c)) ?? ZONE_COLORS[0],
          center: { ...settings.location },
          radiusKm: '5',
        },
      ],
    }));

  const mapZones = useMemo<DeliveryZone[]>(
    () =>
      zones.map((z) => ({
        id: z.key,
        name: z.name || 'Liefergebiet',
        zips: z.zips,
        fee: parseEuro(z.fee) ?? 0,
        minOrder: parseEuro(z.minOrder) ?? 0,
        freeFrom: parseEuro(z.freeFrom) ?? 0,
        color: HEX_RE.test(z.color) ? z.color : '#1d58a0',
        center: z.center,
        radiusM: Math.max(100, Math.round((parseDecimalInput(z.radiusKm) ?? 1) * 1000)),
      })),
    [zones],
  );
  const fit = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = [[settings.location.lat, settings.location.lng]];
    for (const z of mapZones) {
      const dLat = z.radiusM / 111_320;
      const dLng = z.radiusM / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
      pts.push([z.center.lat + dLat, z.center.lng + dLng], [z.center.lat - dLat, z.center.lng - dLng]);
    }
    return pts;
  }, [mapZones, settings.location.lat, settings.location.lng]);

  return (
    <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="min-w-0 space-y-4 2xl:order-1">
        {zones.map((z) => {
          const fee = parseEuro(z.fee);
          const free = parseEuro(z.freeFrom);
          const center = zipCenter(z.zips);
          return (
            <section key={z.key} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                <span aria-hidden className="h-4 w-4 shrink-0 rounded-full ring-4 ring-slate-100" style={{ background: HEX_RE.test(z.color) ? z.color : '#cbd5e1' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{z.name || 'Liefergebiet'}</p>
                  <p className="truncate text-xs text-slate-500">
                    {z.zips.length} PLZ · {fee === 0 ? 'Lieferung kostenlos' : fee !== null ? `${formatEuro(fee)} Liefergebühr` : '–'}
                    {fee && free ? ` · frei ab ${formatEuro(free)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemove(z)} className="text-red-700 hover:bg-red-50 hover:text-red-800">
                  Entfernen
                </Button>
              </header>
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Name" value={z.name} onChange={(e) => patch(z.key, { name: e.target.value })} error={v.errors[`zone-${z.key}-name`]} maxLength={80} />
                  <ColorField label="Farbe auf der Karte" value={z.color} onChange={(c) => patch(z.key, { color: c })} error={v.errors[`zone-${z.key}-color`]} />
                </div>
                <ZipEditor zips={z.zips} onChange={(zips) => patch(z.key, { zips })} error={v.errors[`zone-${z.key}-zips`]} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <EuroField label="Liefergebühr" value={z.fee} onChange={(e) => patch(z.key, { fee: e.target.value })} error={v.errors[`zone-${z.key}-fee`]} hint="0 = kostenlos" />
                  <EuroField label="Mindestbestellwert" value={z.minOrder} onChange={(e) => patch(z.key, { minOrder: e.target.value })} error={v.errors[`zone-${z.key}-minOrder`]} hint="Warenwert brutto" />
                  <EuroField label="Lieferfrei ab" value={z.freeFrom} onChange={(e) => patch(z.key, { freeFrom: e.target.value })} error={v.errors[`zone-${z.key}-freeFrom`]}
                    hint={fee && free === 0 ? <span className="font-medium text-amber-700">Bei 0 € liefern Sie immer kostenlos.</span> : 'ab diesem Warenwert kostenlos'}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    label="Radius auf der Karte"
                    inputMode="decimal"
                    suffix="km"
                    value={z.radiusKm}
                    onChange={(e) => patch(z.key, { radiusKm: e.target.value })}
                    error={v.errors[`zone-${z.key}-radiusKm`]}
                    containerClassName="w-40"
                  />
                  <Button
                    variant="outline"
                    icon={Crosshair}
                    disabled={!center}
                    onClick={() => center && patch(z.key, { center })}
                    title={center ? 'Kartenmittelpunkt aus den bekannten PLZ berechnen' : 'Für diese PLZ sind keine Koordinaten hinterlegt'}
                  >
                    Mittelpunkt aus PLZ
                  </Button>
                  <p className="pb-3 text-xs text-slate-500">
                    Mitte {z.center.lat.toFixed(4).replace('.', ',')}, {z.center.lng.toFixed(4).replace('.', ',')}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
        <button
          type="button"
          onClick={addZone}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 py-5 text-[15px] font-semibold text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-800"
        >
          <Plus size={18} aria-hidden /> Liefergebiet hinzufügen
        </button>
      </div>

      <div className="order-first min-w-0 2xl:sticky 2xl:top-24 2xl:order-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <MapPinned size={18} aria-hidden className="text-brand-700" />
            <p className="font-semibold text-slate-900">Kartenvorschau</p>
          </div>
          <div className="h-72 sm:h-96 2xl:h-[28rem]">
            <BaseMap fitTo={fit} fitPadding={12} maxFitZoom={13}>
              <ZoneCircles zones={mapZones} />
              <StoreMarker />
            </BaseMap>
          </div>
          <ul className="grid gap-x-6 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-2 2xl:grid-cols-1">
            {mapZones.map((z) => (
              <li key={z.id} className="flex items-center gap-2 text-slate-600">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: z.color }} />
                <span className="min-w-0 flex-1 truncate">{z.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">ab {formatEuro(z.minOrder)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ConfirmModal
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (remove) update((d) => ({ ...d, zones: d.zones.filter((z) => z.key !== remove.key) }));
          setRemove(null);
        }}
        tone="danger"
        title={`„${remove?.name ?? ''}“ entfernen?`}
        message="Kunden mit diesen Postleitzahlen können nach dem Speichern nicht mehr beliefert werden."
        confirmLabel="Entfernen"
      />
    </div>
  );
}
