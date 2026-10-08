# Frontend-Bausteine – Referenz für Feature-Teams

Stand nach der Fundament-Phase (vom Integrations-Agenten zusammengestellt). Ergänzt `docs/ARCHITECTURE.md` §7.

## Exporte

**`useCart()`** aus `@/stores/cart`
- Felder: `items: CheckoutItem[]`, `emptiesReturn: EmptiesLine[]`, `fulfillment`, `slotId?`, `addressId?`, `carryService`, `paymentMethod`, `couponCode?`, `notes?`, `reference?`, `costCenter?`, `eventDate?`, `commission`, `ownerId?`
- Methoden: `add(id, qty=1)`, `setQty(id, qty)` (0 entfernt), `remove(id)`, `setEmpties(depositTypeId, qty)`, `set(patch: Partial<CartData>)`, `clear()` (behält Lieferart, Adresse, Zahlart und Kostenstelle), `count()`, `qtyOf(id)`, `bindUser(userId)`
- Hilfen: `useCartCount()`, `useCartQty(id)`, `cartToCheckoutInput(cart): CheckoutInput`, `MAX_QTY = 999`; Speicherschlüssel `altinger.cart`

**`useSession()`** aus `@/stores/session`
- Felder: `status: 'loading'|'guest'|'authenticated'`, `session`, `user`, `token`
- Methoden: `login(email, pw)`, `demoLogin(userId)`, `register(input)`, `requestBusinessAccount(input)`, `logout()`, `refresh(): Promise<Session|null>`, `applySession(s|null)`
- Hilfen: `useUser()`, `useRole()`, `TOKEN_KEY = 'altinger.token'`

**`qk`** aus `@/api/hooks`
- Öffentlich und Kunde: `products`, `product(id)` (unter dem Präfix `products`), `customer`, `orders`, `order(id)`, `tracking(id?)` (ohne id = Präfix), `notifications`, `slots(query)`, `quote(input)`, `rentals(date)`, `zip(zip)`, `addressSearch(q)`, `subscriptions`, `invoices`, `invoice(id)`
- Markt (Präfix `admin`): `adminOrders(query={})`, `adminOrder(id)`, `adminDrivers`, `adminTours(date)`, `adminCustomers`, `adminCustomer(id)`, `adminStats(days)`, `adminInvoices`, `adminSubscriptions`
- Fahrer (Präfix `driver`): `driverToday`

**Hooks** aus `@/api/hooks`
- Grunddaten: `useBootstrap()`, `useBootstrapActions()` → `{update, reload}`, `useSettings()`, `useCategories()`, `useDepositTypes()`
- Sortiment: `useProducts()`, `useProductMap(): Map<ID, Product>`, `useProduct(id)`
- Kunde: `useMyCustomer()`, `useMyOrders()`, `useOrder(id)`, `useTracking(id, enabled=true)`, `useMySubscriptions()`, `useMyInvoices()`
- Benachrichtigungen: `useNotifications()`, `useUnreadCount()`
- Fahrer: `useDriverToday()`
- Kasse: `useQuote(input|null, enabled=true)` (300 ms entprellt), `useSlots(query, enabled=true)`
- Preise: `usePrice(product, qty=1): PriceInfo` mit `{unitGross, unitNet, regularUnitGross, regularUnitNet, depositUnit, showNet, isOffer, discounted, note?, basePriceText, displayUnit, displayRegular, price}`; dazu `computePrice(...)` und `useCartSummary()` → `{count, itemsTotal, deposit, showNet, loading}`
- Mutationen: `useApiMutation(fn, {invalidate?, success?, silent?, onSuccess?, onError?, mutationOptions?})`, `useToggleFavorite()`
- Sonstiges: `useRealtimeStatus()`, `BootstrapContext`

**UI-Kit** aus `@/components/ui` (wie §7, nur ergänzt)
- Buttons: `Button`, `ButtonLink` (zusätzlich `disabled`), `IconButton` (zusätzlich `loading`), `buttonClasses()`
- Karten und Badges: `Card`, `CardHeader` (+`className`), `Badge` (zusätzlich `solid`), `OrderStatusBadge`
- Formulare: `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioCards`, `fieldClasses`
  - `containerClassName` bei `Input`, `Textarea`, `Select` und `Checkbox`
  - `Select` zusätzlich mit `placeholder` und `options[].disabled`
  - `Switch` zusätzlich mit `ariaLabel`, `RadioCards` zusätzlich mit `name`
- Eingaben und Beträge: `QuantityStepper` (zusätzlich `removeAtMin`, `label`, `disabled`), `Money`
- Fenster: `Modal` (zusätzlich `description`, `bodyClassName`, `hideClose`), `ConfirmModal` (zusätzlich `cancelLabel`), `Drawer` (zusätzlich `footer`, `bodyClassName`)
- Navigation: `Tabs`, `SegmentedControl` (zusätzlich `block`)
- Zustände: `Spinner` (zusätzlich `label`), `Skeleton`, `EmptyState`, `ErrorState` (zusätzlich `action`), `LoadingScreen`, `PageLoader`, `errorMessage(err)`
- Seitenaufbau: `PageHeader` (zusätzlich `documentTitle`), `Section` (zusätzlich `id`), `Divider`
- Daten: `StatCard` (zusätzlich `onClick`), `Avatar`, `Timeline`, `KeyValue`, `Table`, `THead`, `TBody`, `TR` (zusätzlich `selected`), `TH`, `TD`, `initials()`
- Hinweise: `Notice {tone?: 'info'|'warning'|'danger'|'success'|'brand', title?, icon?, action?}`
- `toast.success|error|info|warning(msg, {description?, href?, actionLabel?, duration?, id?})`, `toast.dismiss(id?)`, `<Toaster/>`

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

**Weitere Helfer**
- `useGeolocation(enabled, onFix?, options?) → {position, error}` aus `@/lib/geolocation`
- Aus `@/lib/roles`: `roleHome`, `ROLE_LABEL`, `isCustomerRole`, `safeNext`
- Aus `@/lib/openingHours`: `groupOpeningHours`, `openState`

## Hinweise

- **Seiteninhalt:** Die Layouts haben schon Rand und Breite (Shop `max-w-7xl`, Fahrer `max-w-3xl`, Markt bis `100rem`). Randlose Karten brauchen negative Ränder (z. B. `-mx-4`).
- **Query-Keys:**
  - `qk.tracking(id?)` und `qk.order(id)` sind Funktionen; ohne id ergibt `qk.tracking()` den Präfix.
  - Einzelartikel liegen unter dem Präfix `products`.
  - Für den Markt gibt es fertige Keys: `adminOrders`, `adminOrder`, `adminTours`, `adminDrivers`, `adminCustomers`, `adminCustomer`, `adminStats`, `adminInvoices`, `adminSubscriptions`. Fahrer: `qk.driverToday`.
- **GPS (Fahrer-App):** `useGeolocation(enabled, onFix)` aus `src/lib/geolocation.ts` verwenden – nur dann zeigt die Fahrer-Kopfzeile den GPS-Status an.
- **Wiederverwendbar:** `NotificationItem` (für die Benachrichtigungsseite), `useInstallState`/`promptInstall` (Install-Knopf im Demo-Leitfaden), `groupOpeningHours`/`openState` (Markt-Seite), `useToggleFavorite`, `useCartSummary`, `cartToCheckoutInput`.
