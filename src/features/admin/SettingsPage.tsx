import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, FlaskConical, MapPinned, Receipt, RotateCcw, Save, Store, Ticket, Truck, type LucideIcon } from 'lucide-react';
import type { StoreSettings } from '@shared/types';
import { api } from '@/api/client';
import { useBootstrapActions, useSettings } from '@/api/hooks';
import { cn } from '@/lib/cn';
import { Button, ConfirmModal, PageHeader, Tabs, errorMessage, toast } from '@/components/ui';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { useUrlState } from './master/lib';
import { draftSignature, fromSettings, toSettings, validateSettingsDraft, type SettingsDraft, type SettingsTab } from './master/settings/settingsDraft';
import { HoursSection, RulesSection, StoreSection } from './master/settings/GeneralSections';
import { SlotsSection } from './master/settings/SlotsSection';
import { ZonesSection } from './master/settings/ZonesSection';
import { CouponsSection } from './master/settings/CouponsSection';
import { DemoSection, DriversSection } from './master/settings/DriversDemoSections';

const TABS: { id: SettingsTab; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'markt', label: 'Markt', icon: Store, hint: 'Name, Anschrift, Kontakt, Banner' },
  { id: 'zeiten', label: 'Öffnungszeiten', icon: Clock, hint: 'Je Wochentag' },
  { id: 'fenster', label: 'Zeitfenster', icon: CalendarDays, hint: 'Liefer- und Abholfenster' },
  { id: 'gebiete', label: 'Liefergebiete', icon: MapPinned, hint: 'PLZ, Gebühren, Karte' },
  { id: 'regeln', label: 'Gebühren & Regeln', icon: Receipt, hint: 'Bestellschluss, Tragservice' },
  { id: 'gutscheine', label: 'Gutscheine', icon: Ticket, hint: 'Rabattcodes' },
  { id: 'fahrer', label: 'Fahrer & Fahrzeuge', icon: Truck, hint: 'sofort gespeichert' },
  { id: 'demo', label: 'Demo', icon: FlaskConical, hint: 'Modus, Zurücksetzen' },
];

const DRAFT_TABS = new Set<SettingsTab>(['markt', 'zeiten', 'fenster', 'gebiete', 'regeln', 'gutscheine']);

export default function SettingsPage() {
  const settings = useSettings();
  const { update } = useBootstrapActions();
  const qc = useQueryClient();
  const { params, set: setUrl } = useUrlState();
  const tab = (TABS.some((t) => t.id === params.get('bereich')) ? params.get('bereich') : 'markt') as SettingsTab;
  const setTab = (id: string) => setUrl({ bereich: id === 'markt' ? null : id });

  const [base, setBase] = useState<StoreSettings>(settings);
  const [draft, setDraft] = useState<SettingsDraft>(() => fromSettings(settings));
  const [saving, setSaving] = useState(false);
  const baseSig = useMemo(() => draftSignature(fromSettings(base)), [base]);
  const dirty = draftSignature(draft) !== baseSig;
  const v = useMemo(() => validateSettingsDraft(draft), [draft]);
  const errorCount = Object.keys(v.errors).length;
  const leaving = useRef(false);

  // Einstellungen von außen (Echtzeit, Demo-Reset) übernehmen, solange nichts bearbeitet wird
  useEffect(() => {
    if (settings === base) return;
    if (!dirty) {
      setBase(settings);
      setDraft(fromSettings(settings));
    }
  }, [settings, base, dirty]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const updateDraft = (fn: (d: SettingsDraft) => SettingsDraft) => setDraft(fn);

  const discard = () => setDraft(fromSettings(base));

  const save = async () => {
    if (errorCount) {
      const first = TABS.find((t) => v.byTab[t.id]);
      if (first && first.id !== tab) setTab(first.id);
      toast.error(errorCount === 1 ? 'Eine Angabe ist ungültig – bitte prüfen.' : `${errorCount} Angaben sind ungültig – bitte prüfen.`, { id: 'settings-save' });
      return;
    }
    setSaving(true);
    try {
      const saved = await api.adminSaveSettings(toSettings(draft, base));
      update({ settings: saved });
      setBase(saved);
      setDraft(fromSettings(saved));
      void qc.invalidateQueries({ queryKey: ['slots'] });
      toast.success('Einstellungen gespeichert', { id: 'settings-save', description: 'Shop, Kasse und Zeitfenster zeigen die Änderungen sofort an.' });
    } catch (err) {
      toast.error(errorMessage(err), { id: 'settings-save' });
    } finally {
      setSaving(false);
    }
  };

  const tabLabel = (t: (typeof TABS)[number]) => (
    <span className="inline-flex items-center gap-1.5">
      {t.label}
      {v.byTab[t.id] ? <span aria-label="enthält Fehler" className="h-2 w-2 rounded-full bg-red-500" /> : null}
    </span>
  );

  const saveBar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-slate-900">Ungespeicherte Änderungen</span>
        {errorCount ? (
          <span className="text-red-600"> · {errorCount === 1 ? '1 Angabe ist ungültig' : `${errorCount} Angaben sind ungültig`}</span>
        ) : (
          <span className="hidden text-slate-500 sm:inline"> · werden erst nach dem Speichern im Shop wirksam</span>
        )}
      </p>
      <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
        <Button variant="ghost" icon={RotateCcw} onClick={discard} disabled={saving}>
          Verwerfen
        </Button>
        <Button icon={Save} onClick={() => void save()} loading={saving}>
          <span className="sm:hidden">Speichern</span>
          <span className="max-sm:hidden">Einstellungen speichern</span>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Einstellungen" documentTitle="Einstellungen · Markt" subtitle="Stammdaten des Markts, Öffnungszeiten, Zeitfenster, Liefergebiete und Gutscheine" />

      <div className="lg:hidden">
        <Tabs aria-label="Bereiche" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ id: t.id, label: tabLabel(t), icon: t.icon }))} className="-mx-4 mb-5 px-2 sm:-mx-6 sm:px-4" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Bereiche" className="hidden rounded-2xl border border-slate-200/70 bg-white p-2 shadow-card lg:sticky lg:top-24 lg:block">
          <ul className="space-y-0.5">
            {TABS.map((t) => {
              const active = t.id === tab;
              const errs = v.byTab[t.id] ?? 0;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    )}
                  >
                    <t.icon size={18} aria-hidden className={cn('shrink-0', active ? 'text-brand-700' : 'text-slate-400')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{t.label}</span>
                      <span className="block truncate text-xs text-slate-500">{t.hint}</span>
                    </span>
                    {errs ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{errs}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {tab === 'markt' ? <StoreSection draft={draft} update={updateDraft} v={v} /> : null}
          {tab === 'zeiten' ? <HoursSection draft={draft} update={updateDraft} v={v} /> : null}
          {tab === 'fenster' ? <SlotsSection draft={draft} update={updateDraft} v={v} /> : null}
          {tab === 'gebiete' ? <ZonesSection draft={draft} update={updateDraft} v={v} /> : null}
          {tab === 'regeln' ? <RulesSection draft={draft} update={updateDraft} v={v} /> : null}
          {tab === 'gutscheine' ? <CouponsSection draft={draft} update={updateDraft} v={v} /> : null}
          {tab === 'fahrer' ? <DriversSection /> : null}
          {tab === 'demo' ? (
            <DemoSection
              onReset={(fresh) => {
                setBase(fresh);
                setDraft(fromSettings(fresh));
              }}
              onSettingsSaved={(saved) => {
                // nur die Basis aktualisieren – ungespeicherte Änderungen anderer Bereiche bleiben erhalten
                setBase(saved);
                if (!dirty) setDraft(fromSettings(saved));
              }}
            />
          ) : null}

          {DRAFT_TABS.has(tab) && !dirty ? (
            <p className="mt-4 px-1 text-sm text-slate-500">Alle Änderungen sind gespeichert. Änderungen in diesem Bereich werden mit „Einstellungen speichern“ übernommen.</p>
          ) : null}
        </div>
      </div>

      {dirty ? (
        <>
          {/* Handy/Tablet: feste Aktionsleiste */}
          <StickyActionBar offset="none">{saveBar}</StickyActionBar>
          {/* Desktop: am Seitenende mitlaufend */}
          <div className="sticky bottom-0 z-20 -mx-8 mt-6 hidden border-t border-slate-200 bg-white/95 px-8 pb-safe-4 pt-3 shadow-bar backdrop-blur lg:block">{saveBar}</div>
        </>
      ) : null}

      <ConfirmModal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        tone="danger"
        title="Änderungen verwerfen?"
        message="Sie haben Einstellungen geändert, aber noch nicht gespeichert. Wenn Sie die Seite verlassen, gehen die Änderungen verloren."
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
      />
    </>
  );
}
