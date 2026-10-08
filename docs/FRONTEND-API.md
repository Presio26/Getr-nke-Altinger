# Frontend-Bausteine – Referenz für Feature-Teams

Stand: Version 1.0.0 (nach der Schlussrunde). Ergänzt `docs/ARCHITECTURE.md` §6–7 – dort steht die Grundlage, hier
alle Exporte und Konventionen, die seitdem dazugekommen sind. Im Zweifel gilt der Code (`src/…`).

## Exporte

**`useCart()`** aus `@/stores/cart`
- Felder: `items: CheckoutItem[]`, `emptiesReturn: EmptiesLine[]`, `fulfillment`, `slotId?`, `addressId?`, `carryService`, `paymentMethod`, `couponCode?`, `notes?`, `reference?`, `costCenter?`, `eventDate?`, `commission`, `ownerId?`
- Methoden: `add(id, qty=1)`, `setQty(id, qty)` (0 entfernt), `remove(id)`, `setEmpties(depositTypeId, qty)` (auch lose Einzelflaschen), `set(patch: Partial<CartData>)`, `count()`, `qtyOf(id)`, `bindUser(userId)`
  - `clear()` – nach einer Bestellung: leert Artikel, Leergut, Gutschein, Zeitfenster …, **behält** Lieferart, Adresse, Zahlart und Kostenstelle
  - `reset()` – Demo-Reset (`data.reset`, ruft `RealtimeBridge` auf): **alles** auf den Ausgangsstand, nur `ownerId` bleibt
- Hilfen: `useCartCount()`, `useCartQty(id)`, `cartToCheckoutInput(cart): CheckoutInput`, `MAX_QTY = 999`; Speicherschlüssel `altinger.cart`

**`useSession()`** aus `@/stores/session`
- Felder: `status: 'loading'|'guest'|'authenticated'`, `session`, `user`, `token`
- Methoden: `login(email, pw)`, `demoLogin(userId)`, `register(input)`, `requestBusinessAccount(input)`, `logout()`, `refresh(): Promise<Session|null>`, `applySession(s|null)`
- Hilfen: `useUser()`, `useRole()`, `TOKEN_KEY = 'altinger.token'`
- **Sitzung je Browser-Tab:** Token im `sessionStorage` des Tabs; `localStorage` hält nur die zuletzt ausdrücklich gewählte
  Anmeldung als Startwert für neue Tabs. Ein Login in einem Tab schaltet andere Tabs nie um. Lokaler Modus: eigener Schlüssel
  `altinger.token.local`. Das Token wird nur bei einer echten 401-Antwort oder beim Abmelden gelöscht.

**`qk`** aus `@/api/hooks`
- Öffentlich und Kunde: `products`, `product(id)` (unter dem Präfix `products`), `customer`, `orders`, `order(id)`, `tracking(id?)` (ohne id = Präfix), `notifications`, `slots(query)`, `quote(input)`, `rentals(date)`, `zip(zip)`, `addressSearch(q)`, `subscriptions`, `invoices`, `invoice(id)`
- Markt (Präfix `admin`): `adminOrders(query={})`, `adminOrder(id)`, `adminDrivers`, `adminTours(date)`, `adminCustomers`, `adminCustomer(id)`, `adminStats(days)`, `adminInvoices`, `adminSubscriptions`
- Fahrer (Präfix `driver`): `driverToday`

**Hooks** aus `@/api/hooks`
- Grunddaten: `useBootstrap()`, `useBootstrapActions()` → `{update, reload}`, `useSettings()`, `useCategories()`, `useDepositTypes()`
- Sortiment: `useProducts()`, `useProductMap(): Map<ID, Product>`, `useProduct(id)`
- Kunde: `useMyCustomer()`, `useMyOrders()`, `useOrder(id)`, `useTracking(id, enabled=true)`, `useMySubscriptions()`, `useMyInvoices()`
- Benachrichtigungen: `useNotifications()`, `useUnreadCount()`
- Fahrer: `useDriverToday()` (nur für die Rolle `driver` aktiv, alle 60 s neu)
- Kasse: `useQuote(input|null, enabled=true)` (300 ms entprellt), `useSlots(query, enabled=true)`
- Preise: `usePrice(product, qty=1): PriceInfo` mit `{unitGross, unitNet, regularUnitGross, regularUnitNet, depositUnit, showNet, isOffer, discounted, note?, basePriceText, displayUnit, displayRegular, price}`; dazu `computePrice(...)` und `useCartSummary()` → `{count, itemsTotal, deposit, showNet, loading}`
- Mutationen: `useApiMutation(fn, {invalidate?, success?, silent?, onSuccess?, onError?, mutationOptions?})`, `useToggleFavorite()`
- Verbindung: `useRealtimeStatus(): 'connecting'|'online'|'offline'` (lokaler Modus: immer `online`); `BootstrapContext`

**Beträge und MwSt.** – nie selbst rechnen: `Quote.totals` bzw. `Order.totals` enthalten `vatBreakdown` (je Satz `rate`, `net`,
`vat`) und `netParts` (Nettowerte von Ware, Rabatt, Pfand, Leergut, Liefergebühr, Tragservice). Privatkunden: „inkl. MwSt.“
aus `vatBreakdown`; Geschäftskunden: „Nettobetrag 19 %“ / „zzgl. MwSt. 19 %“ je Zeile. Telefonbestellungen des Markts:
`api.adminQuote(customerId, input)` und `api.adminPlaceOrder(customerId, input)` (Herkunft `source: 'phone'`).

**UI-Kit** aus `@/components/ui` (wie Architektur §7, nur ergänzt)
- Buttons: `Button`, `ButtonLink` (zusätzlich `disabled`), `IconButton` (zusätzlich `loading`), `buttonClasses()`
- Karten und Badges: `Card`, `CardHeader` (+`className`), `Badge` (zusätzlich `solid`), `OrderStatusBadge`
- Formulare: `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioCards`, `fieldClasses`
  - `containerClassName` bei `Input`, `Textarea`, `Select` und `Checkbox`
  - `Select` zusätzlich mit `placeholder` und `options[].disabled`
  - `Switch` zusätzlich mit `ariaLabel`, `RadioCards` zusätzlich mit `name`
- Eingaben und Beträge: `QuantityStepper` (zusätzlich `removeAtMin`, `label`, `disabled`), `Money`
- Fenster: `Modal` (zusätzlich `description`, `bodyClassName`, `hideClose`), `ConfirmModal` (zusätzlich `cancelLabel`), `Drawer` (zusätzlich `footer`, `bodyClassName`)
- Navigation: `Tabs`, `SegmentedControl` (zusätzlich `block`)
- Zustände: `Spinner` (zusätzlich `label`), `Skeleton`, `EmptyState`, `ErrorState` (zusätzlich `action`), `LoadingScreen`, `PageLoader`, `usePageLoading`, `errorMessage(err)`
- Seitenaufbau: `PageHeader` (zusätzlich `documentTitle`), `Section` (zusätzlich `id`), `Divider`
- Daten: `StatCard` (zusätzlich `onClick`), `Avatar`, `Timeline`, `KeyValue`, `Table`, `THead`, `TBody`, `TR` (zusätzlich `selected`), `TH`, `TD`, `initials()`
- Hinweise: `Notice {tone?: 'info'|'warning'|'danger'|'success'|'brand', title?, icon?, action?}`
- `toast.success|error|info|warning(msg, {description?, href?, actionLabel?, duration?, id?})`, `toast.dismiss(id?)`, `<Toaster/>`

**Layout** aus `@/components/layout`
- `ShopLayout`, `DriverLayout`, `AdminLayout`, `RootLayout`, `RequireRole {roles}`, `Footer`, `telHref()`, `AccountMenu`, `NotificationBell`, `NotificationItem`
- **`StickyActionBar {children, offset?: 'tabbar'|'none', desktop?: boolean, className?}`** – feste Aktionsleiste für Mobilgeräte
  (z. B. Summe + „Zur Kasse“, „Zustellung abschließen“). `offset: 'tabbar'` (Standard) dockt über der Tab-Leiste des Shops an,
  `'none'` ganz unten (Fahrer-App); `desktop` zeigt sie auch ab `lg`. Die Komponente meldet ihre Höhe als CSS-Variable
  `--sticky-bar-h`; Footer, Toasts und Demo-Pille weichen aus. **Keine eigenen `fixed bottom-…`-Leisten bauen.**
- `ConnectionBanner` (sitzt bereits in allen Layouts) und `ConnectionIndicator {tone?, showLabel?, showMode?}`, `GpsIndicator`
- CSS-Variablen (`src/styles/index.css`): `--tabbar-h`, `--sticky-bar-h`, `--demo-pill-space`; passende Utilities `pb-tabbar`,
  `pb-tabbar-demo`, `bottom-tabbar`, `bottom-floating`, `bottom-floating-lg`, `pt-safe`/`pb-safe`/`px-safe`, `scrollbar-none`

**Fenstertitel (Titel-Register)** aus `@/lib/hooks`
- `useDocumentTitle(title)` – Titel der Seite; `PageHeader` meldet seinen Titel selbst an (`documentTitle` überschreibt ihn)
- `useFallbackDocumentTitle(title)` – Rückfall-Titel eines Layouts (gilt nur, solange keine Seite einen Titel setzt)
- Schema (zentral, Seiten müssen nichts anhängen): Shop „Sortiment · Getränke Altinger“, Fahrer „Tour 1 · Fahrer · Getränke Altinger“,
  Markt „Live-Karte · Markt · Getränke Altinger“; bei mehreren angemeldeten Titeln gewinnt der zuletzt angemeldete.
  Ohne Titel: „Markt-Dashboard · …“, „Fahrer-App · …“ bzw. der Standardtitel.
- Hilfen: `formatDocumentTitle(title, pathname)`, `refreshDocumentTitle()`

**Verbindung und Betriebsmodus** aus `@/api/client`
- `api` (typisierter Proxy), `initApi()`, `getApiMode(): 'remote'|'local'`, `isApiReady()`, `isModeSwitchable()` (nur bei `VITE_API_MODE=auto`)
- `probeServer(timeoutMs?) → 'remote'|'no-server'|'unreachable'`, `checkServerHealth()`, `waitForServer({timeoutMs?, onProgress?, signal?})`
  (Start-Bildschirm „Verbinde mit Server …“, bis 60 s), `wasServerReachableAtStart()`, `reconnectRealtime()` (Knopf im Banner)
- `realtime.subscribe(handler)`, `realtime.status()`, `realtime.onStatus(cb)`; `setAuthToken()`, `getAuthToken()`, `API_BASE_URL`,
  `NETWORK_ERROR_MESSAGE`
- Grundsatz: Im Server-Modus wird **nie still** auf lokale Daten umgeschaltet – fehlt der Server, zeigt die App den
  Verbindungsbildschirm bzw. das Banner „Keine Verbindung zum Server – wird automatisch erneut versucht“.

**Karte** aus `@/components/map`
- `BaseMap {center?, zoom?, className?, fitTo?, fitPadding?, maxFitZoom?, zoomControl?, static?, onReady?, children}`
- `StoreMarker {permanentLabel?}`
- `DriverMarker {position, color?, label?, heading?, pulse?, animationMs?}`
- `StopMarker {position, index, status?, label?, current?, onClick?}`
- `HomeMarker {position, label?, color?, permanentLabel?}`
- `RouteLine {coords, color?, dashed?, weight?, faded?}`
- `ZoneCircles {zones, showInfo?}`
- Hilfen: `toLatLng()`, `STOP_COLORS`
- Live-Positionen: `usePositions` und `useDriverPosition(driverId, fallback?)` aus `@/stores/positions`

**Produkt** aus `@/components/product`
- `ProductImage {product, size?, className?}`
- `ProductCard {product, layout?: 'grid'|'row', className?}` (React.memo)
- `PriceDisplay {product, qty?, size?, className?, compact?}`
- Weitere: `ProductBadges`, `FavoriteButton`, `productTint`, `illustrationKind`

**Demo-Zugänge** (nur Demo-Modus)
- `useUi()` aus `@/stores/ui`: `demoOpen`/`setDemoOpen(open)` (Demo-Umschalter öffnen), `demoBarVisible`/`setDemoBarVisible()`/`toggleDemoBar()`
  (Pille; auf Handy/Tablet und in der installierten App standardmäßig aus)
- `useDemoTripleTap()` aus `@/components/demo/useDemoTripleTap` – onClick-Handler fürs Logo: dreimal tippen öffnet den Umschalter
- Zugänge in der Oberfläche: Kontomenü „Demo-Leitfaden & Rollen wechseln“, Footer „Demo-Leitfaden“ / „Rollen wechseln“,
  Markt-Seitenleiste „Rollen wechseln (Demo)“, Tastenkürzel Alt + D, `/demo?als=<user-id>`

**Feature-interne Bausteine, die andere wiederverwenden dürfen**
- Markt (`src/features/admin/ops/…`): `phoneOrderHref(customerId?)` und `useOpenPhoneOrder()` aus `components/PhoneOrderLauncher`
  (Telefonbestellung per `?neu=telefon&kunde=<id>`), `QrScannerModal {open, onClose, onResult}` (Kamera-Scan mit jsQR, Fallback
  Code-Eingabe), `AutoPlanModal` (Vorschau „Touren automatisch planen“), Daten-Hooks `useAdminOrders`, `useAdminTours`, `useOrderStatus` …
  aus `ops/api.ts`
- Fahrer (`src/features/driver/lib/driverUtils.ts`): `ageCheck(order, products)` (Jugendschutz ab 16/18), `dueInfo()` (Betrag inkl.
  tatsächlich zurückgenommenem Leergut), `cashSuggestions()`, `isManualSimStop()`, `simulationWaitingStop()`

**Weitere Helfer**
- `useGeolocation(enabled, onFix?, options?) → {position, error}` aus `@/lib/geolocation`
- Aus `@/lib/hooks`: `useMediaQuery`, `useIsDesktop`, `useDebouncedValue`, `useNow`, `useOnline`, `useClickOutside`
- Aus `@/lib/storage`: `readStorage`, `writeStorage`, `readJson`, `writeJson` (fehlertolerant, `'local'` oder `'session'`)
- Aus `@/lib/platform`: `isIos`, `isSafari`, `isStandalone`, `hasFinePointer`, `isMac`
- Aus `@/lib/roles`: `roleHome`, `ROLE_LABEL`, `isCustomerRole`, `safeNext`
- Aus `@/lib/openingHours`: `groupOpeningHours`, `openState`
- Aus `@/components/pwa`: `useInstallState`, `promptInstall`, `useInstallAction`, `InstallHelpModal`

## Hinweise

- **Seiteninhalt:** Die Layouts haben schon Rand und Breite (Shop `max-w-7xl`, Fahrer `max-w-3xl`, Markt bis `100rem`). Randlose Karten brauchen negative Ränder (z. B. `-mx-4`).
- **Query-Keys:**
  - `qk.tracking(id?)` und `qk.order(id)` sind Funktionen; ohne id ergibt `qk.tracking()` den Präfix.
  - Einzelartikel liegen unter dem Präfix `products`.
  - Für den Markt gibt es fertige Keys: `adminOrders`, `adminOrder`, `adminTours`, `adminDrivers`, `adminCustomers`, `adminCustomer`, `adminStats`, `adminInvoices`, `adminSubscriptions`. Fahrer: `qk.driverToday`.
- **Echtzeit:** `RealtimeBridge` invalidiert die passenden Keys automatisch (siehe Architektur §6) – Seiten müssen nur die Hooks nutzen.
  Nach `data.reset` wird zusätzlich der Warenkorb mit `reset()` geleert.
- **GPS (Fahrer-App):** `useGeolocation(enabled, onFix)` aus `src/lib/geolocation.ts` verwenden – nur dann zeigt die Fahrer-Kopfzeile den GPS-Status an. GPS und Kamera gibt es nur über HTTPS (oder `localhost`).
- **Mobile Aktionsleisten:** immer `StickyActionBar`; schwebende Elemente mit `bottom-floating` positionieren, damit sie Tab-Leiste, Aktionsleiste und Demo-Pille nicht verdecken.
- **Wiederverwendbar:** `NotificationItem` (für die Benachrichtigungsseite), `useInstallState`/`promptInstall` (Install-Knopf im Demo-Leitfaden), `groupOpeningHours`/`openState` (Markt-Seite), `useToggleFavorite`, `useCartSummary`, `cartToCheckoutInput`.
