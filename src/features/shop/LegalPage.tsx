import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileWarning, Scale, ShieldCheck } from 'lucide-react';
import { useSettings } from '@/api/hooks';
import { telHref } from '@/components/layout/Footer';
import { Card, Notice, PageHeader } from '@/components/ui';
import { cn } from '@/lib/cn';

// ───────────────────────────── Bausteine ─────────────────────────────

interface Chapter {
  id: string;
  title: string;
  body: ReactNode;
}

function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-3 text-[15px] leading-relaxed text-slate-600 first:mt-0', className)}>{children}</p>;
}

function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-slate-600">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Platzhalter im Text, z. B. [HRB-Nummer] */
function Ph({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900">[{children}]</mark>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-[15px] text-slate-800">{children}</dd>
    </div>
  );
}

function LegalLayout({ chapters, intro }: { chapters: Chapter[]; intro?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Inhalt" className="hidden lg:block">
        <div className="sticky top-[8.75rem]">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">Inhalt</p>
          <ol className="space-y-0.5 text-sm">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-slate-600 hover:bg-slate-200/50 hover:text-slate-900">
                  <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-slate-400">{i + 1}.</span>
                  {c.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>
      <div className="min-w-0 space-y-4">
        {intro}
        <Card padding="lg">
          <div className="divide-y divide-slate-100">
            {chapters.map((c, i) => (
              <section key={c.id} id={c.id} className="scroll-mt-40 py-6 first:pt-0 last:pb-0">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  <span className="mr-2 tabular-nums text-slate-400">{i + 1}.</span>
                  {c.title}
                </h2>
                <div className="mt-3">{c.body}</div>
              </section>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PlaceholderNotice() {
  return (
    <Notice tone="warning" icon={FileWarning} title="Platzhalter – vor Livegang durch geprüfte Rechtstexte ersetzen">
      Dieser Text ist ein Gerüst für die Demo und keine Rechtsberatung. Gelb markierte Angaben fehlen noch. Vor dem Livegang bitte vollständig von einer
      fachkundigen Stelle (z. B. Rechtsanwalt oder Datenschutzbeauftragte/r) prüfen und ergänzen lassen.
    </Notice>
  );
}

// ───────────────────────────── Impressum ─────────────────────────────

function Impressum() {
  const s = useSettings();
  const chapters: Chapter[] = [
    {
      id: 'anbieter',
      title: 'Angaben gemäß § 5 DDG',
      body: (
        <dl className="divide-y divide-slate-100">
          <Fact label="Anbieter">
            <span className="font-semibold">{s.legalName}</span>
            <br />
            {s.street}
            <br />
            {s.zip} {s.city}
          </Fact>
          <Fact label="Vertreten durch">
            Geschäftsführung: <Ph>Name der Geschäftsführerin / des Geschäftsführers</Ph>
          </Fact>
          <Fact label="Telefon">
            <a href={telHref(s.phone)} className="font-medium text-brand-700 hover:text-brand-800">
              {s.phone}
            </a>
          </Fact>
          <Fact label="E-Mail">
            <a href={`mailto:${s.email}`} className="break-all font-medium text-brand-700 hover:text-brand-800">
              {s.email}
            </a>
          </Fact>
          <Fact label="Registereintrag">
            Registergericht: Amtsgericht <Ph>Ort</Ph> · Registernummer: HRB <Ph>Nummer</Ph>
          </Fact>
          <Fact label="Umsatzsteuer-ID">
            gemäß § 27a UStG: DE <Ph>Nummer</Ph>
          </Fact>
        </dl>
      ),
    },
    {
      id: 'verantwortlich',
      title: 'Verantwortlich für den Inhalt',
      body: (
        <P>
          Verantwortlich nach § 18 Abs. 2 MStV: <Ph>Name</Ph>, {s.street}, {s.zip} {s.city}.
        </P>
      ),
    },
    {
      id: 'streitbeilegung',
      title: 'Verbraucherstreitbeilegung',
      body: (
        <P>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.{' '}
          <Ph>Bitte prüfen und ggf. anpassen</Ph>
        </P>
      ),
    },
    {
      id: 'jugendschutz',
      title: 'Jugendschutz',
      body: (
        <P>
          Alkoholische Getränke geben wir nur an Personen ab 16 Jahren ab, Spirituosen und spirituosenhaltige Getränke nur an Personen ab 18 Jahren. Bei der
          Abholung und Lieferung behalten wir uns eine Altersprüfung vor.
        </P>
      ),
    },
    {
      id: 'haftung',
      title: 'Haftung für Inhalte und Links',
      body: (
        <>
          <P>
            Die Inhalte dieser App wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität können wir jedoch keine Gewähr
            übernehmen. Preise und Verfügbarkeiten können sich kurzfristig ändern; maßgeblich ist die Bestellbestätigung.
          </P>
          <P>
            Für Inhalte externer Seiten, auf die wir verlinken (z. B. Kartendienste), sind ausschließlich deren Betreiber verantwortlich. Bei Bekanntwerden von
            Rechtsverletzungen entfernen wir entsprechende Links umgehend.
          </P>
        </>
      ),
    },
    {
      id: 'bildnachweis',
      title: 'Abbildungen, Marken und Kartendaten',
      body: (
        <UL
          items={[
            'Alle Produktabbildungen sind stilisierte Illustrationen und zeigen keine Originalverpackungen oder Logos der Hersteller.',
            'Genannte Marken- und Produktnamen sind Eigentum der jeweiligen Rechteinhaber.',
            <>
              Kartendaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL). Kartendarstellung mit Leaflet.
            </>,
          ]}
        />
      ),
    },
  ];
  return <LegalLayout chapters={chapters} intro={<PlaceholderNotice />} />;
}

// ───────────────────────────── Datenschutz ─────────────────────────────

function Datenschutz() {
  const s = useSettings();
  const stand = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date());
  const chapters: Chapter[] = [
    {
      id: 'verantwortlicher',
      title: 'Verantwortlicher',
      body: (
        <>
          <P>
            Verantwortlich für die Datenverarbeitung in dieser App ist die {s.legalName}, {s.street}, {s.zip} {s.city}, Telefon{' '}
            <a href={telHref(s.phone)} className="font-medium text-brand-700">
              {s.phone}
            </a>
            , E-Mail{' '}
            <a href={`mailto:${s.email}`} className="break-all font-medium text-brand-700">
              {s.email}
            </a>
            .
          </P>
          <P>
            Datenschutzbeauftragte/r: <Ph>Name und Kontakt, falls benannt</Ph>
          </P>
        </>
      ),
    },
    {
      id: 'ueberblick',
      title: 'Überblick',
      body: (
        <>
          <P>Wir verarbeiten personenbezogene Daten nur, soweit es für die Bereitstellung der App, Ihre Bestellungen und die Lieferung erforderlich ist:</P>
          <UL
            items={[
              'Bestands- und Kontaktdaten (Name, Anschrift, E-Mail, Telefon, bei Geschäftskunden Firmendaten und USt-ID)',
              'Bestell- und Zahlungsdaten (Artikel, Lieferart, Zeitfenster, Zahlart, Leergut, Rechnungen)',
              'Lieferdaten (Lieferadresse, Hinweise für den Fahrer, Zustellnachweis mit Unterschrift oder Foto)',
              'Standortdaten der Fahrerinnen und Fahrer während einer aktiven Tour',
              'technische Daten beim Aufruf der App (IP-Adresse, Zeitpunkt, Browser)',
            ]}
          />
        </>
      ),
    },
    {
      id: 'hosting',
      title: 'Hosting und Server-Logfiles',
      body: (
        <>
          <P>
            Die App und der Bestellserver werden bei <Ph>Hosting-Anbieter, Sitz</Ph> in einem Rechenzentrum in der EU betrieben. Beim Aufruf werden technisch
            notwendige Daten verarbeitet: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Browser und Betriebssystem.
          </P>
          <P>
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sicherer und stabiler Betrieb). Logfiles werden nach <Ph>7</Ph> Tagen gelöscht. Mit dem Anbieter
            besteht ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO).
          </P>
        </>
      ),
    },
    {
      id: 'konto',
      title: 'Kundenkonto und Bestellungen',
      body: (
        <>
          <P>
            Für Kundenkonto, Bestellungen, Abos/Daueraufträge und Rechnungen verarbeiten wir Ihre Bestands-, Kontakt- und Bestelldaten zur Vertragserfüllung
            (Art. 6 Abs. 1 lit. b DSGVO). Rechnungs- und Buchungsbelege bewahren wir aufgrund gesetzlicher Pflichten (Art. 6 Abs. 1 lit. c DSGVO, § 257 HGB, § 147 AO)
            sechs bzw. zehn Jahre auf.
          </P>
          <P>
            Ihr Leergut-Konto, Treuepunkte und Favoriten speichern wir, solange Ihr Kundenkonto besteht. Sie können Ihr Konto jederzeit löschen lassen.
          </P>
        </>
      ),
    },
    {
      id: 'lieferung',
      title: 'Lieferung und Live-Verfolgung',
      body: (
        <>
          <P>
            Für die Zustellung erhalten unsere Fahrerinnen und Fahrer Ihren Namen, die Lieferadresse, Telefonnummer, Lieferhinweise und den offenen Betrag. Als
            Zustellnachweis speichern wir den Namen der empfangenden Person sowie optional eine Unterschrift oder ein Foto der abgestellten Ware.
          </P>
          <P>
            Ist Ihre Bestellung unterwegs, sehen Sie die ungefähre Position des Fahrzeugs und die voraussichtliche Ankunftszeit. Diese Ansicht steht nur
            Ihnen als Empfänger und nur für die Dauer der Zustellung zur Verfügung.
          </P>
        </>
      ),
    },
    {
      id: 'fahrer',
      title: 'Standortdaten der Fahrerinnen und Fahrer',
      body: (
        <>
          <P>
            Während einer aktiven Tour übermittelt die Fahrer-App etwa alle 3–5 Sekunden den GPS-Standort des Fahrzeugs (Position, Richtung, Geschwindigkeit,
            Genauigkeit). Zweck sind die Disposition, die Tourenplanung und die Information der Kundinnen und Kunden über die Ankunftszeit.
          </P>
          <UL
            items={[
              'Die Ortung erfolgt nur, wenn die Fahrerin oder der Fahrer eine Tour gestartet und die Standortfreigabe auf dem Gerät erteilt hat – nie außerhalb der Arbeitszeit.',
              'Die aktuelle Position sehen nur die Disposition im Markt und die Kundinnen und Kunden, deren Lieferung auf dieser Tour gerade unterwegs ist.',
              <>
                Gespeichert wird nur die jeweils letzte Position; Bewegungsprofile werden nicht angelegt. Löschung nach Tourende spätestens nach <Ph>24 Stunden</Ph>.
              </>,
              <>
                Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO i. V. m. den Regelungen zum Beschäftigtendatenschutz <Ph>§ 26 BDSG / Betriebsvereinbarung – bitte prüfen</Ph>.
              </>,
              'Die Fahrerinnen und Fahrer werden vor dem ersten Einsatz gesondert informiert.',
            ]}
          />
        </>
      ),
    },
    {
      id: 'speicher',
      title: 'Cookies und lokale Speicherung',
      body: (
        <>
          <P>Wir setzen keine Tracking- oder Werbe-Cookies ein. Die App speichert lediglich technisch notwendige Angaben im Speicher Ihres Browsers (LocalStorage/SessionStorage):</P>
          <UL
            items={[
              <>
                <strong className="font-semibold text-slate-800">Anmeldung</strong> – Sitzungsschlüssel, damit Sie angemeldet bleiben
              </>,
              <>
                <strong className="font-semibold text-slate-800">Warenkorb</strong> – Artikel, Leergut und Kassen-Eingaben bis zur Bestellung
              </>,
              <>
                <strong className="font-semibold text-slate-800">Anzeige</strong> – z. B. geschlossene Hinweise und Ansichtseinstellungen
              </>,
              <>
                <strong className="font-semibold text-slate-800">Offline-Betrieb</strong> – App-Dateien im Zwischenspeicher (Service Worker), damit die App auch bei
                schwacher Verbindung startet
              </>,
            ]}
          />
          <P>
            Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG (unbedingt erforderlich) sowie Art. 6 Abs. 1 lit. b DSGVO. Sie können die Daten jederzeit über die
            Browsereinstellungen löschen; danach sind Sie abgemeldet und Ihr Warenkorb ist leer.
          </P>
        </>
      ),
    },
    {
      id: 'karten',
      title: 'Karten, Routen und Adresssuche',
      body: (
        <>
          <P>
            Für Kartenansichten laden wir Kartenkacheln von OpenStreetMap (OpenStreetMap Foundation, Vereinigtes Königreich). Dabei wird Ihre IP-Adresse an
            deren Server übermittelt. Für die Routenberechnung nutzt unser Server den Dienst OSRM, für die Adresssuche den Dienst Photon (komoot); dabei werden
            nur Koordinaten bzw. der eingegebene Suchbegriff übermittelt.
          </P>
          <P>
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (anschauliche Darstellung und genaue Lieferzeiten). Für die Übermittlung in das Vereinigte Königreich
            besteht ein Angemessenheitsbeschluss der EU-Kommission. <Ph>Auftragsverarbeitung/Alternativen prüfen</Ph>
          </P>
        </>
      ),
    },
    {
      id: 'mitteilungen',
      title: 'Benachrichtigungen',
      body: (
        <P>
          Auf Wunsch informieren wir Sie per Browser-Benachrichtigung über den Status Ihrer Bestellung (z. B. „Fahrer ist unterwegs“). Dafür ist Ihre
          Einwilligung erforderlich (Art. 6 Abs. 1 lit. a DSGVO), die Sie jederzeit in den Browser- oder Geräteeinstellungen widerrufen können.
        </P>
      ),
    },
    {
      id: 'zahlung',
      title: 'Zahlungsdienstleister',
      body: (
        <P>
          Bei Zahlung mit PayPal oder Kreditkarte werden die zur Zahlungsabwicklung erforderlichen Daten an den jeweiligen Zahlungsdienstleister übermittelt (Art. 6
          Abs. 1 lit. b DSGVO): <Ph>Anbieter und Datenschutzhinweise ergänzen</Ph>. In der Demo-Version findet keine echte Zahlung statt.
        </P>
      ),
    },
    {
      id: 'rechte',
      title: 'Ihre Rechte',
      body: (
        <>
          <P>Sie haben jederzeit das Recht auf:</P>
          <UL
            items={[
              'Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)',
              'Berichtigung unrichtiger Daten (Art. 16 DSGVO)',
              'Löschung (Art. 17 DSGVO) und Einschränkung der Verarbeitung (Art. 18 DSGVO)',
              'Datenübertragbarkeit (Art. 20 DSGVO)',
              'Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO)',
              'Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)',
            ]}
          />
          <P>
            Eine kurze Nachricht an{' '}
            <a href={`mailto:${s.email}`} className="break-all font-medium text-brand-700">
              {s.email}
            </a>{' '}
            genügt.
          </P>
        </>
      ),
    },
    {
      id: 'beschwerde',
      title: 'Beschwerderecht',
      body: (
        <P>
          Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren. Zuständig für uns ist das Bayerische Landesamt für Datenschutzaufsicht (BayLDA),
          Promenade 18, 91522 Ansbach.
        </P>
      ),
    },
  ];
  return (
    <LegalLayout
      chapters={chapters}
      intro={
        <>
          <PlaceholderNotice />
          <p className="text-sm text-slate-500">Stand: {stand}</p>
        </>
      }
    />
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function LegalPage() {
  const { pathname } = useLocation();
  const privacy = pathname.startsWith('/datenschutz');
  return (
    <>
      <PageHeader
        title={privacy ? 'Datenschutzerklärung' : 'Impressum'}
        icon={privacy ? ShieldCheck : Scale}
        subtitle={
          privacy ? (
            'Wie wir mit Ihren Daten umgehen – verständlich erklärt.'
          ) : (
            <>
              Anbieterkennzeichnung · siehe auch{' '}
              <Link to="/datenschutz" className="font-medium text-brand-700 hover:text-brand-800">
                Datenschutz
              </Link>
            </>
          )
        }
      />
      {privacy ? <Datenschutz /> : <Impressum />}
    </>
  );
}
