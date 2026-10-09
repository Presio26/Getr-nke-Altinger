import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CarFront,
  ChevronDown,
  Clock,
  Gift,
  HandPlatter,
  Mail,
  MapPin,
  MessageCircleQuestion,
  Navigation,
  PackageCheck,
  PartyPopper,
  Phone,
  Recycle,
  ShoppingBag,
  SquareParking,
  Store,
  TrainFront,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { LatLng, SlotTemplate } from '@shared/types';
import { WEEKDAY_SHORT, formatEuro } from '@shared/format';
import { useDepositTypes, useSettings } from '@/api/hooks';
import { telHref } from '@/components/layout/Footer';
import { BaseMap, StoreMarker, ZoneCircles } from '@/components/map';
import { Card, PageHeader, Section, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { cn } from '@/lib/cn';
import { OpenBadge, OpeningHoursList, mapsLinks } from './components/store';
import { ZipCheck, zoneTerms } from './components/ZipCheck';

/** "Mo – Fr 08:00–20:00 Uhr · Sa 08:00–14:00 Uhr" aus den Zeitfenster-Vorlagen */
function slotHours(slots: SlotTemplate[]): string {
  const byDay = new Map<number, { start: string; end: string }>();
  for (const s of slots) {
    const cur = byDay.get(s.weekday);
    byDay.set(s.weekday, { start: !cur || s.start < cur.start ? s.start : cur.start, end: !cur || s.end > cur.end ? s.end : cur.end });
  }
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => byDay.has(d));
  const groups: { from: number; to: number; text: string }[] = [];
  for (const d of order) {
    const h = byDay.get(d)!;
    const text = `${h.start}–${h.end} Uhr`;
    const last = groups[groups.length - 1];
    if (last && last.text === text && order.indexOf(d) === order.indexOf(last.to) + 1) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.map((g) => `${g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]} – ${WEEKDAY_SHORT[g.to]}`} ${g.text}`).join(' · ');
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon size={19} aria-hidden />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <div className="mt-0.5 text-[15px] leading-relaxed text-slate-800">{children}</div>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-slate-100 last:border-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-[15px] font-semibold text-slate-900 marker:hidden hover:text-brand-700 [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown size={19} aria-hidden className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4 pr-8 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}

export default function StorePage() {
  const settings = useSettings();
  const depositTypes = useDepositTypes();
  const links = mapsLinks(settings);
  const zones = useMemo(() => [...settings.zones].sort((a, b) => a.minOrder - b.minOrder), [settings.zones]);
  const home = zones.find((z) => z.zips.includes(settings.zip));

  // Kartenausschnitt: alle Liefergebiete vollständig
  const fit = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = [[settings.location.lat, settings.location.lng]];
    for (const z of settings.zones) {
      const dLat = z.radiusM / 111_320;
      const dLng = z.radiusM / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
      pts.push([z.center.lat - dLat, z.center.lng - dLng], [z.center.lat + dLat, z.center.lng + dLng]);
    }
    return pts;
  }, [settings.location, settings.zones]);

  const deliveryHours = slotHours(settings.deliverySlots);
  const pickupHours = slotHours(settings.pickupSlots);
  const sampleDeposits = depositTypes.filter((d) => ['kasten-bier-20', 'kasten-glas-12', 'kasten-pet-12', 'fass-30'].includes(d.id));

  const services: { icon: LucideIcon; title: string; text: string; to?: string; cta?: string }[] = [
    {
      icon: Truck,
      title: 'Lieferservice',
      text: `Lieferung bis an die Haustür in festen Zeitfenstern (${deliveryHours}) – ${home && home.fee === 0 ? 'in Garching kostenlos, ' : ''}mit Live-Verfolgung auf der Karte.`,
      to: '/sortiment',
      cta: 'Jetzt bestellen',
    },
    {
      icon: ShoppingBag,
      title: 'Click & Collect',
      text: `Online bestellen, Abholzeit wählen und mit Abholcode an der Kasse mitnehmen. Ihre Ware liegt ${settings.pickupHoldHours} Stunden bereit.`,
      to: '/sortiment',
      cta: 'Reservieren',
    },
    {
      icon: Recycle,
      title: 'Leergutannahme',
      text: 'Leergutautomat für Einzelflaschen und Annahme ganzer Kästen und Fässer im Markt. Bei Lieferung nimmt der Fahrer Ihr Leergut gleich mit.',
    },
    { icon: PartyPopper, title: 'Festservice & Verleih', text: 'Bierzeltgarnituren, Zapfanlagen, Kühlschränke, Zelte und Gläser – mit Party-Planer für die richtige Menge.', to: '/fest', cta: 'Fest planen' },
    {
      icon: PackageCheck,
      title: 'Kommissionsware',
      text: 'Für Feste: Volle, ungeöffnete Kästen und Fässer nehmen wir nach der Veranstaltung zurück – Sie zahlen nur, was getrunken wurde.',
      to: '/fest',
      cta: 'Mehr erfahren',
    },
    {
      icon: HandPlatter,
      title: 'Tragservice',
      text: `Für ${formatEuro(settings.carryServiceFee)} tragen wir Ihre Getränke bis in die Wohnung, den Keller oder die Küche – auch ohne Aufzug.`,
    },
    {
      icon: Gift,
      title: 'Geschenkservice',
      text: 'Präsente mit Wein, Sekt, Spirituosen oder regionalem Bier – liebevoll verpackt, auf Wunsch mit Grußkarte. Sprechen Sie uns im Markt an.',
    },
  ];

  return (
    <>
      <PageHeader
        title="Unser Markt in Garching"
        icon={Store}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <OpenBadge />
            <span>
              {settings.street}, {settings.zip} {settings.city}
            </span>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-6">
        <div className="space-y-4">
          <Card padding="lg">
            <div className="space-y-5">
              <InfoRow icon={MapPin} label="Adresse">
                <p className="font-semibold">{settings.legalName}</p>
                <p>{settings.street}</p>
                <p>
                  {settings.zip} {settings.city}
                </p>
              </InfoRow>
              <InfoRow icon={Phone} label="Telefon">
                <a href={telHref(settings.phone)} className="font-semibold text-brand-700 hover:text-brand-800">
                  {settings.phone}
                </a>
                <p className="text-sm text-slate-500">Bestellungen, Festberatung, Geschäftskunden</p>
              </InfoRow>
              <InfoRow icon={Mail} label="E-Mail">
                <a href={`mailto:${settings.email}`} className="break-all font-semibold text-brand-700 hover:text-brand-800">
                  {settings.email}
                </a>
              </InfoRow>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <a
                href={telHref(settings.phone)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-3 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-800"
              >
                <Phone size={18} aria-hidden /> Anrufen
              </a>
              <a
                href={links.google}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Navigation size={18} aria-hidden /> Route
              </a>
            </div>
          </Card>

          <Card padding="lg">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
                <Clock size={19} aria-hidden className="text-brand-600" /> Öffnungszeiten
              </h2>
            </div>
            <OpeningHoursList />
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Abholung (Click &amp; Collect): {pickupHours}. An Feiertagen geschlossen.
            </p>
          </Card>
        </div>

        <Card padding="none" className="relative min-h-[22rem] overflow-hidden lg:min-h-full">
          <BaseMap className="absolute inset-0" fitTo={fit} fitPadding={24} maxFitZoom={13}>
            <ZoneCircles zones={settings.zones} />
            <StoreMarker permanentLabel />
          </BaseMap>
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[500] flex flex-wrap gap-1.5 sm:bottom-4 sm:left-4 sm:right-auto">
            {zones.map((z) => (
              <span key={z.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color }} aria-hidden />
                {z.name}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Section id="liefergebiete" title="Liefergebiete & Konditionen" subtitle="Mindestbestellwert und Liefergebühr beziehen sich auf den Warenwert ohne Pfand.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
          <div>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Liefergebiet</TH>
                    <TH>Postleitzahlen</TH>
                    <TH className="text-right">Liefergebühr</TH>
                    <TH className="text-right">Mindestbestellwert</TH>
                    <TH className="text-right">Kostenlos ab</TH>
                  </tr>
                </THead>
                <TBody>
                  {zones.map((z) => {
                    const t = zoneTerms(z);
                    return (
                      <TR key={z.id}>
                        <TD>
                          <span className="flex items-center gap-2.5 font-semibold text-slate-900">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: z.color }} aria-hidden />
                            {z.name}
                          </span>
                        </TD>
                        <TD className="max-w-[16rem] text-slate-500 tabular-nums">{z.zips.join(', ')}</TD>
                        <TD className={cn('text-right font-semibold tabular-nums', t.alwaysFree ? 'text-emerald-700' : 'text-slate-900')}>{t.fee}</TD>
                        <TD className="text-right tabular-nums text-slate-900">{t.minOrder}</TD>
                        <TD className={cn('text-right tabular-nums', t.alwaysFree ? 'font-semibold text-emerald-700' : 'text-slate-900')}>
                          {t.alwaysFree ? 'immer' : t.freeFrom}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <ul className="space-y-3 md:hidden">
              {zones.map((z) => {
                const t = zoneTerms(z);
                return (
                  <li key={z.id}>
                    <Card padding="sm">
                      <p className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-900">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: z.color }} aria-hidden />
                        {z.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 tabular-nums">PLZ {z.zips.join(', ')}</p>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {[
                          ['Gebühr', t.fee, t.alwaysFree],
                          ['Mindestwert', t.minOrder, false],
                          ['Gratis ab', t.alwaysFree ? 'immer' : t.freeFrom, t.alwaysFree],
                        ].map(([label, value, hl]) => (
                          <div key={String(label)} className="rounded-xl bg-slate-50 px-2 py-2">
                            <dt className="text-xs text-slate-500">{label}</dt>
                            <dd className={cn('mt-0.5 text-sm font-bold tabular-nums', hl ? 'text-emerald-700' : 'text-slate-900')}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </Card>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-sm text-slate-500">
              Tragservice bis in die Wohnung: {formatEuro(settings.carryServiceFee)} · Bestellschluss {settings.orderCutoffMinutes} Minuten vor Beginn des Zeitfensters ·
              Geschäftskunden liefern wir nach Vereinbarung frei Haus.
            </p>
          </div>
          <Card padding="lg">
            <h3 className="text-base font-bold text-slate-900">Liefern wir auch zu Ihnen?</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Geben Sie Ihre Postleitzahl ein.</p>
            <ZipCheck compact />
          </Card>
        </div>
      </Section>

      <Section title="Unsere Services" subtitle="Mehr als Getränke – wir kümmern uns um alles rund ums Trinken und Feiern.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {services.map((s) => (
            <li key={s.title}>
              <Card padding="md" className="flex h-full gap-3.5 sm:flex-col sm:gap-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm shadow-brand-900/20">
                  <s.icon size={21} aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="text-[15px] font-semibold text-slate-900 sm:mt-3">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{s.text}</p>
                  {s.to ? (
                    <Link to={s.to} className="mt-auto inline-flex min-h-10 items-center gap-1.5 pt-2 text-sm font-semibold text-brand-700 hover:text-brand-800 sm:pt-3">
                      {s.cta} <ArrowRight size={16} aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Anfahrt & Parken">
        <div className="grid gap-4 md:grid-cols-3">
          <Card padding="lg">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <CarFront size={19} aria-hidden className="text-brand-600" /> Mit dem Auto
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Sie finden uns an der {settings.street} in {settings.city.replace(' b. München', '')} – gut erreichbar über die A9 (Ausfahrten Garching-Süd und Garching-Nord).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={links.apple}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <MapPin size={16} aria-hidden /> Apple Karten
              </a>
              <a
                href={links.google}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Navigation size={16} aria-hidden /> Google Maps
              </a>
            </div>
          </Card>
          <Card padding="lg">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <SquareParking size={19} aria-hidden className="text-brand-600" /> Parken
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Kostenlose Kundenparkplätze direkt vor dem Markt – ideal zum Einladen von Kästen. Auf Wunsch hilft Ihnen unser Team beim Einladen; Leergut können Sie
              direkt vom Kofferraum abgeben.
            </p>
          </Card>
          <Card padding="lg">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <TrainFront size={19} aria-hidden className="text-brand-600" /> Öffentlich
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Mit der U6 bis „Garching“, von dort sind es wenige Gehminuten. Schwere Kästen? Lassen Sie sich Ihren Einkauf einfach nach Hause liefern.
            </p>
          </Card>
        </div>
      </Section>

      <Section
        title={
          <span className="flex items-center gap-2">
            <MessageCircleQuestion size={20} aria-hidden className="text-brand-600" /> Häufige Fragen
          </span>
        }
      >
        <Card padding="none" className="px-5 sm:px-6">
          <Faq q="Wie funktioniert das Pfand?">
            Pfand weisen wir immer separat aus, z. B.{' '}
            {sampleDeposits.map((d, i) => (
              <span key={d.id}>
                {i ? ', ' : ''}
                {d.shortName} {formatEuro(d.amount)}
              </span>
            ))}
            . Bei Einwegflaschen und Dosen gilt das gesetzliche Einwegpfand von 0,25 € je Gebinde. Das Pfand erhalten Sie bei der Rückgabe vollständig zurück.
          </Faq>
          <Faq q="Nehmen Sie mein Leergut mit?">
            Ja. Geben Sie im Warenkorb an, wie viele leere Kästen Sie zurückgeben möchten – der Fahrer nimmt sie bei der Lieferung mit und wir schreiben das Pfand
            sofort gut. Bitte nur vollständige Kästen; Einzelflaschen nimmt unser Leergutautomat im Markt an.
          </Faq>
          <Faq q="Wann wird geliefert?">
            Wir liefern in Zeitfenstern: {deliveryHours}. Bestellschluss ist {settings.orderCutoffMinutes} Minuten vor Beginn des Zeitfensters. Sobald Ihr Fahrer
            unterwegs ist, verfolgen Sie die Lieferung live auf der Karte – inklusive voraussichtlicher Ankunftszeit.
          </Faq>
          <Faq q="Welche Zahlarten gibt es?">
            Bar oder mit EC-/Girocard bei Lieferung bzw. Abholung, außerdem PayPal und Kreditkarte. Freigeschaltete Geschäftskunden zahlen bequem auf Rechnung
            oder per SEPA-Lastschrift.
          </Faq>
          <Faq q="Gibt es einen Mindestbestellwert?">
            Für die Lieferung je nach Liefergebiet:{' '}
            {zones.map((z, i) => (
              <span key={z.id}>
                {i ? ', ' : ''}
                {z.name} ab {formatEuro(z.minOrder)}
              </span>
            ))}
            . Bei Click &amp; Collect gibt es keinen Mindestbestellwert.
          </Faq>
          <Faq q="Wie lange liegt meine Abholung bereit?">
            Ihre Click-&amp;-Collect-Bestellung reservieren wir {settings.pickupHoldHours} Stunden ab dem gewählten Abholzeitpunkt. Zeigen Sie an der Kasse einfach
            Ihren Abholcode oder QR-Code vor.
          </Faq>
          <Faq q="Kann ich Getränke für ein Fest auf Kommission bestellen?">
            Ja – volle, ungeöffnete Kästen und Fässer nehmen wir nach Ihrer Veranstaltung zurück. Zapfanlage, Garnituren und Kühlung gibt es gleich dazu.{' '}
            <Link to="/fest" className="font-semibold text-brand-700 hover:text-brand-800">
              Zum Festservice
            </Link>
          </Faq>
        </Card>
      </Section>
    </>
  );
}
