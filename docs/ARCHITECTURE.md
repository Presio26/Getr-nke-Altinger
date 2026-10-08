# Getränke Altinger – Architektur & Team-Briefing

Dieses Dokument ist die **verbindliche Grundlage** für alle, die am Code arbeiten.
Vertrag: `shared/types.ts` (Domänenmodell) und `shared/api.ts` (API-Schnittstelle).
Änderungen am Vertrag nur, wenn unbedingt nötig – und dann rückwärtskompatibel (nur ergänzen).

## 1. Produkt in einem Satz

Eine installierbare Web-App (PWA – Desktop, iPhone/iPad, Android) für **Getränke-Altinger GmbH,
Freisinger Landstraße 19, 85748 Garching b. München (Tel. 089 3202562)**, mit der Privat- (B2C) und
Geschäftskunden (B2B) Getränke bestellen (Lieferung) oder im Markt reservieren (Click & Collect),
die Lieferung live auf der Karte verfolgen – plus Fahrer-App und Markt-/Dispositions-Dashboard.

Rollen / Bereiche:

| Rolle      | Bereich            | Pfad-Präfix   | Gerät           |
|------------|--------------------|---------------|-----------------|
| Gast/B2C   | Shop               | `/`           | Handy + Desktop |
| `customer` | Shop + Konto       | `/`, `/konto` | Handy + Desktop |
| `business` | Shop + B2B-Portal  | `/business`   | Desktop + Handy |
| `driver`   | Fahrer-App         | `/fahrer`     | Handy (iPhone)  |
| `admin`    | Markt-Dashboard    | `/admin`      | Desktop/Tablet  |

Demo-Zugänge (Passwort immer `demo`, außerdem Ein-Klick-Login über den Demo-Umschalter):

| User-ID       | Rolle    | Name                          | E-Mail                         |
|---------------|----------|-------------------------------|--------------------------------|
| `u-anna`      | customer | Anna Berger (Privat, Garching)| anna.berger@example.com        |
| `u-gasthaus`  | business | Gasthaus Zum Mühlbach (Gastro)| einkauf@gasthaus-muehlbach.de  |
| `u-nordbyte`  | business | NordByte Software GmbH (Büro) | office@nordbyte.example        |
| `u-toni`      | driver   | Toni Huber (Fahrer)           | toni@altinger.example          |
| `u-lukas`     | driver   | Lukas Brandl (Fahrer)         | lukas@altinger.example         |
| `u-admin`     | admin    | Marktleitung                  | markt@altinger.example         |

Alle Firmen-/Personennamen der Demo sind **fiktiv**. Markenartikel (Augustiner, Paulaner …) sind übliche
Sortimentsartikel eines bayerischen Getränkemarkts; Preise sind Demo-Werte.

## 2. Tech-Stack (fest, keine weiteren Abhängigkeiten ohne Rücksprache)

- **Frontend:** React 18.3, TypeScript 5.9 (strict), Vite 7, Tailwind CSS v4 (`@tailwindcss/vite`, Theme in `src/styles/index.css` via `@theme`),
  react-router-dom **6.30** (`createBrowserRouter`/`RouterProvider` oder `<Routes>` – v6-API!), @tanstack/react-query 5, zustand 5,
  lucide-react 0.577 (Icons), leaflet 1.9 + react-leaflet **4.2** (React-18-API), recharts **2.15**, date-fns 4 (`import { de } from 'date-fns/locale'`),
  qrcode (QR-Erzeugung), clsx. PWA: vite-plugin-pwa 1.0 (Workbox, `registerType: 'autoUpdate'`).
- **Server:** Node 20+/22, Express **4** (nicht 5!), socket.io 4, ausgeführt mit `tsx` (kein separater Build). Persistenz: JSON-Datei `data/db.json`.
- **Gemeinsamer Code:** `shared/` – läuft unverändert im Browser **und** in Node (keine DOM- oder Node-APIs; `fetch` ist erlaubt).
- **Tests:** vitest (Core-Logik, `shared/**/*.test.ts`), Playwright 1.56 (E2E, `e2e/`). Chromium liegt unter `/opt/pw-browsers`.

Imports: In `shared/` und `server/` **nur relative Imports** (z. B. `../shared/core`). In `src/` Aliase `@/…` (= `src/`) und `@shared/…` (= `shared/`).

## 3. Betriebsmodi

Die App läuft in zwei Modi – **gleiche Oberfläche, gleicher Core**:

1. **remote** (Standard): Node-Server (`server/index.ts`) hält die Daten, Clients sprechen per
   `POST /api/rpc/:method` (Body `{ "args": [...] }`, Header `Authorization: Bearer <token>`) →
   Antwort `{ "result": ... }` bzw. HTTP-Fehler mit `{ "error": ApiErrorBody }`.
   Echtzeit über socket.io (`/socket.io`, Handshake `auth: { token }`), Ereignis-Name `"rt"`, Payload `RealtimeEvent`.
   Mehrere Geräte (Fahrer-iPhone + Kunden-Handy + Markt-PC) sehen dieselben Daten live.
2. **local** (Fallback/Static-Hosting): kein Server erreichbar → der Core läuft im Browser,
   Daten in `localStorage` (`altinger-db-v1`), Echtzeit zwischen Tabs per `BroadcastChannel('altinger-rt')`
   + `storage`-Event. Ideal für eine Offline-Demo auf einem Gerät.

Moduswahl in `src/api/client.ts` → `initApi()`: `import.meta.env.VITE_API_MODE` = `remote` | `local` | `auto` (Default `auto`:
`GET /api/health` mit 2,5 s Timeout; Erfolg → remote, sonst local).

## 4. Verzeichnisstruktur & Modulgrenzen

```
shared/
  types.ts            Domänenmodell (Vertrag)
  api.ts              Api-Interface, Ctx, CoreHandlers, ApiError (Vertrag)
  time.ts             Zeitzone Europe/Berlin: today(), dayString(), timeString(), berlinDate(day,time) …
  format.ts           Formatierung & Labels (Euro, Datum, Slot, Status-Texte …) – von UI & Rechnung genutzt
  core/
    index.ts          createCore(), createSeedDb(), Typ Db  ← Einstiegspunkt
    db.ts             Db-Typ, Hilfsfunktionen (ids, seq)
    pricing.ts        priceProduct(), calculateQuote() – reine Funktionen
    slots.ts          Zeitfenster generieren/prüfen
    geo.ts            Distanz, Interpolation, PLZ-Zentren, Zonen-Lookup
    routing.ts        OSRM-Routing mit Luftlinien-Fallback; Geocoding (Photon) mit PLZ-Fallback
    simulator.ts      Demo-Fahrtsimulation entlang der Route
    handlers/*.ts     Implementierung aller Api-Methoden (auth, catalog, customer, orders, driver, admin …)
    seed/*.ts         Demo-Daten (Sortiment, Kunden, Fahrer, Touren, Historie) + routes.json
server/
  index.ts            Express + socket.io + statische Auslieferung von dist/ (Produktion)
  persistence.ts      data/db.json laden/speichern (atomar, entprellt)
src/
  main.tsx, App.tsx, routes.tsx
  api/
    client.ts         api (Proxy), initApi(), getApiMode(), setAuthToken(), realtime
    remote.ts         HTTP-RPC + socket.io
    local.ts          Core im Browser + BroadcastChannel
    hooks.ts          React-Query-Hooks + Query-Keys (qk) + usePrice()
    RealtimeBridge.tsx  Echtzeit-Ereignisse → Query-Invalidierung, Positions-Store, Toasts
  stores/             zustand: session.ts, cart.ts, positions.ts, ui.ts
  components/
    ui/               UI-Kit (siehe §7) – Export über components/ui/index.ts
    layout/           ShopLayout, DriverLayout, AdminLayout, RequireRole, Footer …
    map/              BaseMap, Marker, RouteLine … (Leaflet)
    product/          ProductImage (SVG-Illustration), ProductCard, PriceDisplay
    brand/            Logo
    demo/             DemoSwitcher
  features/
    auth/             Login, Registrierung, Geschäftskunden-Antrag
    shop/             Start, Sortiment, Produkt, Angebote, Warenkorb, Markt-Info
    checkout/         Kasse, Bestellbestätigung
    orders/           Bestellübersicht, Bestelldetail mit Live-Tracking, Abhol-QR
    account/          Konto, Adressen, Favoriten, Abos, Leergut-Konto, Benachrichtigungen
    events/           Festservice: Leihartikel + Party-Planer
    b2b/              Geschäftskunden-Portal
    driver/           Fahrer-App
    admin/            Markt-Dashboard
    demo/             Demo-Leitfaden (/demo)
  lib/                kleine Browser-Helfer (Bild verkleinern, Notifications, Geolocation …)
  styles/index.css    Tailwind + Theme
e2e/                  Playwright-Tests
docs/                 Konzept, Architektur, Demo-Drehbuch
```

### 4.1 Core (`shared/core/index.ts`) – exakte Schnittstelle

```ts
export interface CoreOptions {
  db: Db;
  mode: 'remote' | 'local';
  /** Ereignis an Empfänger verteilen (Server: socket.io-Räume, local: BroadcastChannel) */
  emit: (event: RealtimeEvent, audience: Audience) => void;
  /** nach jeder Änderung aufgerufen (Server: entprellt in Datei schreiben, local: sofort localStorage) */
  persist: (db: Db) => void;
  now?: () => Date;
  routing?: RoutingProvider;   // Default: OSRM (router.project-osrm.org) mit Luftlinien-Fallback, Timeout 4 s
  geocoder?: Geocoder;         // Default: Photon (photon.komoot.io) mit PLZ-Zentrum-Fallback
  /** Demo-Modus: resetDemo für alle erlaubt (Default true) */
  demoMode?: boolean;
}
export interface Core {
  handlers: CoreHandlers;
  userForToken(token: string | null | undefined): User | null;
  ctx(token?: string | null): Ctx;
  /** RPC-Dispatch per Methodenname; wirft ApiError('not_found') bei unbekannter Methode */
  call(method: string, ctx: Ctx, args: unknown[]): Promise<unknown>;
  /** Simulationen voranschieben – Host ruft ca. 1×/s auf */
  tick(): void;
  getDb(): Db;
  /** Daten ersetzen ohne persist (z. B. Sync aus anderem Tab) */
  replaceDb(db: Db): void;
  hasRunningSimulation(): boolean;
}
export function createCore(options: CoreOptions): Core;
export function createSeedDb(now: Date): Db;
/** true, wenn die Demo-Daten von einem früheren Kalendertag stammen (dann neu seeden) */
export function isSeedStale(db: Db, now: Date): boolean;
export type { Db };
```

`Db` ist ein JSON-serialisierbares Objekt (`users` mit `password`, `sessions: Record<token, userId>`, `customers`, `products`,
`orders`, `drivers`, `tours`, `subscriptions`, `invoices`, `notifications`, `settings`, `categories`, `depositTypes`, `seq`, `seededAt`, `schemaVersion`).

Berechtigungen prüft **ausschließlich der Core** (Ctx.user.role). Ein Kunde sieht nur eigene Daten, ein Fahrer nur zugewiesene Touren/Aufträge.

Echtzeit-Zielgruppen (`Audience`): Bestelländerungen → `{ admin: true, customerIds: [order.customerId], driverIds: [order.driverId] }`;
Fahrerposition → `{ admin: true, driverIds: [driverId], customerIds: [Kunden mit Auftrag out_for_delivery auf der aktiven Tour] }`;
Produktänderungen → `{ all: true }`.

### 4.2 Zeit & Zeitzone

Alle Kalender-Logik (heute, Zeitfenster, Bestellschluss) in **Europe/Berlin**, unabhängig von der Server-Zeitzone.
Immer `shared/time.ts` verwenden, nie `new Date().toISOString().slice(0,10)` für „heute“.

### 4.3 Preise, Pfand, MwSt.

- Alle Beträge in **Cent** (Integer). `Product.priceGross` = B2C-Bruttopreis je Gebinde.
- **B2C** sieht Bruttopreise, „zzgl. 3,10 € Pfand“, Grundpreis „1,99 €/l“ (Preisangabenverordnung).
- **B2B** sieht **Nettopreise** (+ MwSt. im Warenkorb), Gruppenrabatt (`b2b.discountPercent`) bzw. Staffelpreise (`tierPrices`) – der günstigste Preis gewinnt.
- Pfand wird separat ausgewiesen; Leergut-Rückgabe wird gutgeschrieben (`depositRefund`).
- Einzige Wahrheit: `shared/core/pricing.ts` → `priceProduct(product, customer|null, qty, now)` und `calculateQuote(...)`.
  Die UI ruft für Produktkarten `usePrice(product, qty)` (Hook in `src/api/hooks.ts`) auf; für Warenkorb/Kasse `api.quote()`.

## 5. Routen (Frontend)

| Pfad | Seite | Zugriff | Datei (Feature-Ordner) |
|---|---|---|---|
| `/` | Startseite | alle | shop/HomePage.tsx |
| `/sortiment` , `/sortiment/:categoryId` | Sortiment, Suche `?q=`, Filter | alle | shop/CatalogPage.tsx |
| `/produkt/:productId` | Produktdetail | alle | shop/ProductPage.tsx |
| `/angebote` | Angebote | alle | shop/OffersPage.tsx |
| `/warenkorb` | Warenkorb (+ Leergut-Rückgabe) | alle | shop/CartPage.tsx |
| `/markt` | Markt-Info (Öffnungszeiten, Karte, Service) | alle | shop/StorePage.tsx |
| `/kasse` | Kasse (Lieferung/Abholung, Slot, Zahlung) | customer, business | checkout/CheckoutPage.tsx |
| `/bestellungen` | Meine Bestellungen | customer, business | orders/OrdersPage.tsx |
| `/bestellung/:orderId` | Bestelldetail + **Live-Tracking** / Abhol-QR | customer, business (admin darf auch) | orders/OrderDetailPage.tsx |
| `/konto` | Kontoübersicht | customer, business | account/AccountPage.tsx |
| `/konto/adressen` | Adressen | customer, business | account/AddressesPage.tsx |
| `/konto/favoriten` | Favoriten | customer, business | account/FavoritesPage.tsx |
| `/konto/abos` | Abos (B2C) / Daueraufträge | customer, business | account/SubscriptionsPage.tsx |
| `/konto/leergut` | Leergut-Konto | customer, business | account/DepositPage.tsx |
| `/konto/benachrichtigungen` | Benachrichtigungen | angemeldet | account/NotificationsPage.tsx |
| `/fest` | Festservice: Leihartikel + Party-Planer | alle | events/EventsPage.tsx |
| `/login`, `/registrieren`, `/geschaeftskunde` | Anmeldung, Registrierung, B2B-Antrag | alle | auth/*.tsx |
| `/business` | B2B-Übersicht | business | b2b/BusinessDashboardPage.tsx |
| `/business/schnellbestellung` | Schnellerfassung/Bestellmatrix | business | b2b/QuickOrderPage.tsx |
| `/business/rechnungen`, `/business/rechnungen/:invoiceId` | Rechnungen (+ Druckansicht) | business | b2b/InvoicesPage.tsx, b2b/InvoiceDetailPage.tsx |
| `/business/dauerauftraege` | Daueraufträge | business | b2b/StandingOrdersPage.tsx |
| `/business/standorte` | Lieferstandorte & Kostenstellen | business | b2b/LocationsPage.tsx |
| `/fahrer` | Fahrer: Heute | driver | driver/DriverHomePage.tsx |
| `/fahrer/tour/:tourId` | Tour: Karte, Stopps, Ladeliste | driver | driver/TourPage.tsx |
| `/fahrer/stopp/:orderId` | Stopp: Navigation, Leergut, Kassieren, Unterschrift, Foto | driver | driver/StopPage.tsx |
| `/admin` | Dashboard | admin | admin/DashboardPage.tsx |
| `/admin/bestellungen`, `/admin/bestellungen/:orderId` | Bestellungen (Board/Liste), Detail | admin | admin/OrdersBoardPage.tsx, admin/OrderAdminDetailPage.tsx |
| `/admin/touren` | Tourenplanung/Disposition | admin | admin/ToursPage.tsx |
| `/admin/live` | Live-Karte aller Fahrer | admin | admin/LiveMapPage.tsx |
| `/admin/abholungen` | Click & Collect / Abholcode prüfen | admin | admin/PickupsPage.tsx |
| `/admin/sortiment`, `/admin/sortiment/:productId` | Artikel & Bestand | admin | admin/ProductsPage.tsx, admin/ProductEditPage.tsx |
| `/admin/kunden`, `/admin/kunden/:customerId` | Kunden & B2B-Konditionen | admin | admin/CustomersPage.tsx, admin/CustomerDetailPage.tsx |
| `/admin/rechnungen` | Rechnungen | admin | admin/InvoicesAdminPage.tsx |
| `/admin/abos` | Abos & Daueraufträge | admin | admin/SubscriptionsAdminPage.tsx |
| `/admin/statistik` | Auswertungen | admin | admin/StatsPage.tsx |
| `/admin/einstellungen` | Öffnungszeiten, Zeitfenster, Liefergebiete, Gebühren, Gutscheine, Demo-Reset | admin | admin/SettingsPage.tsx |
| `/demo` | Demo-Leitfaden | alle | demo/DemoGuidePage.tsx |
| `/impressum`, `/datenschutz` | Rechtstexte (Platzhalter) | alle | shop/LegalPage.tsx |

Jede Seitendatei hat einen **Default-Export** (React-Komponente). `src/routes.tsx` lädt alle Seiten per `React.lazy`.

## 6. Daten im Frontend

- **Server-Daten** nur über React Query (Hooks in `src/api/hooks.ts`, Query-Keys im Objekt `qk`).
  Mutationen: `useMutation` + `queryClient.invalidateQueries({ queryKey: … })`, Fehler per `toast.error(err.message)`.
- `src/api/RealtimeBridge.tsx` invalidiert bei Echtzeit-Ereignissen automatisch die passenden Keys:
  `order.*` → `qk.orders`, `qk.order(id)`, `qk.tracking(id)`, `qk.admin`, `qk.driver`; `tour.*` → `qk.admin`, `qk.driver`, `qk.tracking`;
  `product.updated` → `qk.products`; `notification` → `qk.notifications` + Toast; `data.reset` → alles.
  `driver.position` → **kein Refetch**, sondern `usePositions` (zustand) aktualisieren → Karten bewegen den Marker flüssig.
- **Client-Zustand** (zustand): `useSession` (Token, User), `useCart` (persistiert), `usePositions`, `useUi`.

## 7. Design-System

Ton: modern, warm, bayerisch-bodenständig, hochwertig. **Sie-Form** in allen Texten. Mobile first.

- Farben (Tailwind-Theme, `src/styles/index.css`):
  - `brand-50 … brand-950`: Altinger-Blau (Primär, `brand-600` = #1d58a0, `brand-700` = #194782, `brand-900` = #16335a)
  - `accent-50 … accent-900`: Bier-Gold (`accent-400` = #fbbf24-ähnlich, `accent-500` = #f2a900) für Angebote/Highlights
  - Neutral: Tailwind `slate`; Erfolg `emerald`; Warnung `amber`; Fehler `red`; Info `sky`.
- Typografie: Systemschrift (`-apple-system, system-ui, "Segoe UI", Roboto, …`), Überschriften `font-bold tracking-tight`, Zahlen `tabular-nums`.
- Radius: Karten `rounded-2xl`, Buttons/Inputs `rounded-xl`, Badges `rounded-full`. Schatten dezent (`shadow-sm`, Karten `shadow-[0_1px_2px_rgba(15,23,42,.06),0_4px_16px_rgba(15,23,42,.04)]`).
- Touch-Ziele ≥ 44 px, Safe-Areas (`env(safe-area-inset-*)`) für iPhone (untere Tab-Leiste!), `100dvh` statt `100vh`.
- Hintergrund App: `bg-slate-50`, Karten `bg-white`.
- Icons: lucide-react, Strichstärke Standard, Größe 18–20 px in Buttons.

### UI-Kit (`@/components/ui`) – verbindliche Komponenten & Props

```ts
Button       { variant?: 'primary'|'secondary'|'outline'|'ghost'|'danger'|'success'|'accent'; size?: 'sm'|'md'|'lg';
               icon?: LucideIcon; iconRight?: LucideIcon; loading?: boolean; block?: boolean } & ButtonHTMLAttributes
ButtonLink   wie Button, aber { to: string } (react-router Link)
IconButton   { icon: LucideIcon; label: string; variant?: …; size?: 'sm'|'md'|'lg'; badge?: number } & ButtonHTMLAttributes
Card         { padding?: 'none'|'sm'|'md'|'lg'; className?; interactive?: boolean } & HTMLAttributes<div>
CardHeader   { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: LucideIcon }
Badge        { tone?: 'neutral'|'brand'|'accent'|'success'|'warning'|'danger'|'info'; icon?: LucideIcon; children }
OrderStatusBadge { status: OrderStatus; fulfillment?: FulfillmentType }
Input        { label?; hint?; error?; icon?: LucideIcon; suffix?: ReactNode } & InputHTMLAttributes   (forwardRef)
Textarea     { label?; hint?; error? } & TextareaHTMLAttributes
Select       { label?; hint?; error?; options: { value: string; label: string }[] } & SelectHTMLAttributes
Checkbox     { label: ReactNode; description?: ReactNode } & InputHTMLAttributes
Switch       { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled? }
RadioCards   { value: string; onChange: (v: string) => void; options: { value: string; title: ReactNode; description?: ReactNode; icon?: LucideIcon; disabled?: boolean; aside?: ReactNode }[]; columns?: 1|2|3 }
QuantityStepper { value: number; onChange: (n: number) => void; min?: number; max?: number; size?: 'sm'|'md'|'lg' }
Money        { cents: number; className?; strike?: boolean; showSign?: boolean }
Modal        { open: boolean; onClose: () => void; title?: ReactNode; children; footer?: ReactNode; size?: 'sm'|'md'|'lg'|'xl' }  (Desktop: Dialog, Mobil: Bottom-Sheet)
ConfirmModal { open; onClose; onConfirm; title; message?; confirmLabel?; tone?: 'danger'|'primary'; loading? }
Tabs         { tabs: { id: string; label: ReactNode; count?: number; icon?: LucideIcon }[]; value: string; onChange: (id: string) => void }
SegmentedControl { options: { value: string; label: ReactNode; icon?: LucideIcon }[]; value: string; onChange: (v: string) => void; size?: 'sm'|'md' }
Spinner      { size?: number; className? }
Skeleton     { className? }
EmptyState   { icon?: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode }
ErrorState   { error: unknown; onRetry?: () => void }
LoadingScreen { label?: string }
PageHeader   { title: ReactNode; subtitle?: ReactNode; back?: string | boolean; actions?: ReactNode; icon?: LucideIcon }
Section      { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children; className? }
StatCard     { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: 'brand'|'accent'|'success'|'warning'|'danger'|'neutral'; trend?: { value: number; label?: string } }
Avatar       { name: string; color?: string; size?: 'sm'|'md'|'lg' }
Timeline     { items: { title: ReactNode; description?: ReactNode; time?: ReactNode; state: 'done'|'current'|'upcoming'|'error' }[] }
KeyValue     { items: [ReactNode, ReactNode][]; className? }
Table, THead, TBody, TR, TH, TD   (gestylte Tabellen-Primitives; TR { onClick? } macht Zeile klickbar)
Divider      { label?: ReactNode }
Drawer       { open; onClose; title?; children; side?: 'right'|'left'; width?: string }   (Seitenleiste, z. B. Admin-Details)
toast        toast.success(msg) / toast.error(msg) / toast.info(msg)  + <Toaster /> (in App gemountet)
```

Weitere gemeinsame Bausteine:
- `@/components/product`: `ProductImage { product; size?: number; className? }` (SVG-Illustration: Kasten mit Flaschen, Sixpack, Flasche, Dose, Fass, Leihartikel – Farben aus `product.color/accent`), `ProductCard { product; layout?: 'grid'|'row' }` (mit Preis, Pfand, Grundpreis, In-den-Warenkorb + Mengen-Stepper, Favoriten-Herz), `PriceDisplay { product; qty? ; size? }`.
- `@/components/map`: `BaseMap { center?: LatLng; zoom?; className?; fitTo?: LatLng[]; children }`, `StoreMarker`, `DriverMarker { position: GeoPosition|GeoPoint; color?; label?; heading?; pulse? }` (animiert weich zwischen Positionen),
  `StopMarker { position: GeoPoint; index: number; status?: StopStatus; label?; onClick? }`, `HomeMarker { position; label? }`, `RouteLine { coords: LatLng[]; color?; dashed?; weight? }`, `ZoneCircles { zones }`.
- `@/components/brand`: `Logo { variant?: 'full'|'mark'|'white'; className? }`.
- `@/components/layout`: `ShopLayout`, `DriverLayout`, `AdminLayout`, `RequireRole { roles: Role[]; children }`.
- `@/stores/cart`: `useCart()` → `{ items, emptiesReturn, fulfillment, slotId, addressId, carryService, paymentMethod, couponCode, notes, reference, costCenter, eventDate, commission, add(productId, qty?), setQty(productId, qty), remove(productId), setEmpties(depositTypeId, qty), set(patch), clear(), count() }`.
- `@/stores/session`: `useSession()` → `{ status: 'loading'|'guest'|'authenticated', session, user, login(email, pw), demoLogin(userId), logout(), refresh() }`; Hilfs-Hook `useUser()`.
- `@/api/hooks`: `qk`, `useBootstrap()`, `useSettings()`, `useCategories()`, `useDepositTypes()`, `useProducts()`, `useProduct(id)`, `useMyCustomer()`, `useMyOrders()`, `useOrder(id)`, `useTracking(id)`, `useNotifications()`, `useQuote(input, enabled?)`, `useSlots(query)`, `usePrice(product, qty?)`, `useApiMutation(fn, { invalidate?: QueryKey[]; success?: string })`.
- `@shared/format`: `formatEuro`, `formatDate`, `formatDateTime`, `formatTime`, `formatSlot`, `formatRelative`, `formatDistance`, `formatDuration`, `formatLiters`, `basePrice`, `ORDER_STATUS_LABEL`, `PAYMENT_METHOD_LABEL`, `FULFILLMENT_LABEL`, `SEGMENT_LABEL`, `PRICE_GROUP_LABEL`, `WEEKDAY_LABEL`, `INTERVAL_LABEL`.

## 8. Arbeitsregeln

- Jede Person/jeder Agent ändert **nur die eigenen Dateien** (siehe Auftrag). Gemeinsame Dateien (UI-Kit, Core, Stores, Hooks) nur bei echtem Bedarf
  und **additiv** ändern (neue Exporte/Props ergänzen, nichts umbenennen oder entfernen).
- `npm run typecheck` muss fehlerfrei sein. Keine `any`-Schlupflöcher ohne Grund, keine `// @ts-ignore`.
- Texte deutsch, Sie-Form, korrekte Umlaute (ä, ö, ü, ß). Beträge immer über `formatEuro`.
- Leere Zustände, Ladezustände und Fehlerzustände immer behandeln (Skeleton/EmptyState/ErrorState).
- Responsiv prüfen: 390×844 (iPhone) und 1440×900 (Desktop).
- Keine externen Bilder/Fonts/CDNs zur Laufzeit außer Karten-Kacheln (OpenStreetMap) und optional OSRM/Photon (mit Fallback).
