/**
 * React-Query-Hooks, Query-Keys (`qk`) und Preis-Hook für die gesamte Oberfläche.
 *
 * Regeln (docs/ARCHITECTURE.md §6):
 *  - Server-Daten nur über React Query; Keys ausschließlich aus `qk`.
 *  - Echtzeit-Ereignisse invalidieren die Keys automatisch (RealtimeBridge).
 *  - Alle Admin-Keys beginnen mit `qk.admin`, alle Fahrer-Keys mit `qk.driver`.
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { AdminOrderQuery } from '@shared/api';
import type {
  Bootstrap,
  Category,
  CheckoutInput,
  Customer,
  DayString,
  DepositType,
  ID,
  Product,
  SlotQuery,
  StoreSettings,
} from '@shared/types';
import { priceProduct, type ProductPrice } from '@shared/core/pricing';
import { api, realtime, type RealtimeStatus } from '@/api/client';
import { useSession } from '@/stores/session';
import { useCart } from '@/stores/cart';
import { useDebouncedValue } from '@/lib/hooks';
import { toast } from '@/components/ui/Toast';
import { errorMessage } from '@/components/ui/States';

// ───────────────────────────── Query-Keys ─────────────────────────────

export const qk = {
  /** Sortiment (öffentlich); Präfix auch für Einzelartikel */
  products: ['products'] as const,
  product: (id: ID) => ['products', 'detail', id] as const,
  /** eigenes Kundenkonto (customer/business) */
  customer: ['customer'] as const,
  /** eigene Bestellungen (Liste) */
  orders: ['orders'] as const,
  order: (id: ID) => ['order', id] as const,
  /** ohne id = Präfix für alle Sendungsverfolgungen */
  tracking: (id?: ID) => (id ? (['tracking', id] as const) : (['tracking'] as const)),
  notifications: ['notifications'] as const,
  slots: (query: SlotQuery) => ['slots', query] as const,
  quote: (input: CheckoutInput | null) => ['quote', input] as const,
  rentals: (date: DayString) => ['rentals', date] as const,
  zip: (zip: string) => ['zip', zip] as const,
  addressSearch: (q: string) => ['address-search', q] as const,
  subscriptions: ['subscriptions'] as const,
  invoices: ['invoices'] as const,
  invoice: (id: ID) => ['invoices', 'detail', id] as const,

  /** Präfix für ALLE Admin-Abfragen */
  admin: ['admin'] as const,
  adminOrders: (query: AdminOrderQuery = {}) => ['admin', 'orders', query] as const,
  adminOrder: (id: ID) => ['admin', 'order', id] as const,
  adminDrivers: ['admin', 'drivers'] as const,
  adminTours: (date: DayString) => ['admin', 'tours', date] as const,
  adminCustomers: ['admin', 'customers'] as const,
  adminCustomer: (id: ID) => ['admin', 'customer', id] as const,
  adminStats: (days: number) => ['admin', 'stats', days] as const,
  adminInvoices: ['admin', 'invoices'] as const,
  adminSubscriptions: ['admin', 'subscriptions'] as const,

  /** Präfix für ALLE Fahrer-Abfragen */
  driver: ['driver'] as const,
  driverToday: ['driver', 'today'] as const,
};

// ───────────────────────────── Bootstrap ─────────────────────────────

export interface BootstrapContextValue {
  bootstrap: Bootstrap;
  /** Teilaktualisierung, z. B. neue Einstellungen aus Echtzeit-Ereignis */
  update(patch: Partial<Bootstrap>): void;
  /** Grunddaten neu laden (z. B. nach Demo-Reset) */
  reload(): Promise<void>;
}

/** Wird in App.tsx befüllt, bevor der Router gerendert wird – in Seiten nie null. */
export const BootstrapContext = createContext<BootstrapContextValue | null>(null);

function useBootstrapContext(): BootstrapContextValue {
  const ctx = useContext(BootstrapContext);
  if (!ctx) throw new Error('BootstrapContext fehlt – useBootstrap() nur innerhalb von <App /> verwenden.');
  return ctx;
}

export function useBootstrap(): Bootstrap {
  return useBootstrapContext().bootstrap;
}

export function useBootstrapActions(): Pick<BootstrapContextValue, 'update' | 'reload'> {
  const { update, reload } = useBootstrapContext();
  return { update, reload };
}

export function useSettings(): StoreSettings {
  return useBootstrap().settings;
}

export function useCategories(): Category[] {
  return useBootstrap().categories;
}

export function useDepositTypes(): DepositType[] {
  return useBootstrap().depositTypes;
}

// ───────────────────────────── Sortiment ─────────────────────────────

export function useProducts() {
  return useQuery({
    queryKey: qk.products,
    queryFn: () => api.listProducts(),
    staleTime: 60_000,
  });
}

/** Artikel als Map id → Produkt (leer, solange geladen wird) */
export function useProductMap(): Map<ID, Product> {
  const { data } = useProducts();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
}

export function useProduct(id: ID | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.product(id ?? ''),
    queryFn: () => api.getProduct(id as ID),
    enabled: !!id,
    staleTime: 60_000,
    // sofortige Anzeige aus der Sortimentsliste, falls vorhanden
    placeholderData: () => qc.getQueryData<Product[]>(qk.products)?.find((p) => p.id === id),
  });
}

// ───────────────────────────── Kunde & Bestellungen ─────────────────────────────

function useIsCustomer(): boolean {
  return useSession((s) => s.status === 'authenticated' && (s.user?.role === 'customer' || s.user?.role === 'business'));
}

function useIsAuthenticated(): boolean {
  return useSession((s) => s.status === 'authenticated');
}

/** Eigenes Kundenkonto – nur aktiv, wenn als customer/business angemeldet */
export function useMyCustomer() {
  const enabled = useIsCustomer();
  return useQuery({
    queryKey: qk.customer,
    queryFn: () => api.getMyCustomer(),
    enabled,
    staleTime: 60_000,
  });
}

export function useMyOrders() {
  const enabled = useIsCustomer();
  return useQuery({
    queryKey: qk.orders,
    queryFn: () => api.listMyOrders(),
    enabled,
  });
}

export function useOrder(id: ID | null | undefined) {
  const enabled = useIsAuthenticated() && !!id;
  return useQuery({
    queryKey: qk.order(id ?? ''),
    queryFn: () => api.getOrder(id as ID),
    enabled,
  });
}

/** Sendungsverfolgung; Positionen kommen live über usePositions, hier nur Fallback-Abgleich */
export function useTracking(id: ID | null | undefined, enabled = true) {
  const auth = useIsAuthenticated();
  return useQuery({
    queryKey: qk.tracking(id ?? ''),
    queryFn: () => api.getTracking(id as ID),
    enabled: auth && enabled && !!id,
    refetchInterval: 30_000,
  });
}

export function useNotifications() {
  const enabled = useIsAuthenticated();
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.listNotifications(),
    enabled,
    refetchInterval: 120_000,
  });
}

/** Anzahl ungelesener Benachrichtigungen */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return useMemo(() => (data ?? []).filter((n) => !n.read).length, [data]);
}

export function useMySubscriptions() {
  const enabled = useIsCustomer();
  return useQuery({ queryKey: qk.subscriptions, queryFn: () => api.listMySubscriptions(), enabled });
}

export function useMyInvoices() {
  const enabled = useSession((s) => s.status === 'authenticated' && s.user?.role === 'business');
  return useQuery({ queryKey: qk.invoices, queryFn: () => api.listMyInvoices(), enabled });
}

export function useDriverToday() {
  const enabled = useSession((s) => s.status === 'authenticated' && s.user?.role === 'driver');
  return useQuery({ queryKey: qk.driverToday, queryFn: () => api.getDriverToday(), enabled, refetchInterval: 60_000 });
}

// ───────────────────────────── Kasse ─────────────────────────────

/** Preisberechnung des Cores (entprellt, behält das letzte Ergebnis während der Neuberechnung) */
export function useQuote(input: CheckoutInput | null, enabled = true) {
  const debounced = useDebouncedValue(input, 300);
  return useQuery({
    queryKey: qk.quote(debounced),
    queryFn: () => api.quote(debounced as CheckoutInput),
    enabled: enabled && !!debounced && debounced.items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useSlots(query: SlotQuery, enabled = true) {
  return useQuery({
    queryKey: qk.slots(query),
    queryFn: () => api.listSlots(query),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ───────────────────────────── Preise ─────────────────────────────

export interface PriceInfo {
  /** Brutto-Stückpreis nach Angebot/Rabatt (Cent) */
  unitGross: number;
  /** Netto-Stückpreis (Cent) */
  unitNet: number;
  /** regulärer Brutto-Stückpreis (zum Durchstreichen) */
  regularUnitGross: number;
  /** regulärer Netto-Stückpreis */
  regularUnitNet: number;
  /** Pfand je Gebinde (Cent) */
  depositUnit: number;
  /** Geschäftskunde → Nettopreise anzeigen */
  showNet: boolean;
  /** Angebotspreis aktiv */
  isOffer: boolean;
  /** günstiger als regulär (Angebot, Rabatt oder Staffel) */
  discounted: boolean;
  /** Hinweis, z. B. "Angebot der Woche", "Gastro-Rabatt 8 %" */
  note?: string;
  /** Grundpreis brutto, z. B. "1,95 €/l" (leer bei Leihartikeln) */
  basePriceText: string;
  /** anzuzeigender Stückpreis (netto bei B2B, sonst brutto) */
  displayUnit: number;
  /** anzuzeigender regulärer Stückpreis */
  displayRegular: number;
  /** vollständiges Ergebnis aus priceProduct */
  price: ProductPrice;
}

/**
 * Preis eines Artikels für den aktuellen Kunden (B2C, wenn nicht angemeldet).
 * Einzige Wahrheit: priceProduct() aus @shared/core/pricing.
 */
export function usePrice(product: Product, qty = 1): PriceInfo {
  const { data: customer } = useMyCustomer();
  const depositTypes = useBootstrap().depositTypes;
  return useMemo(() => computePrice(product, customer ?? null, qty, depositTypes), [product, customer, qty, depositTypes]);
}

export function computePrice(product: Product, customer: Customer | null, qty: number, depositTypes: DepositType[]): PriceInfo {
  const p = priceProduct(product, customer, Math.max(1, qty), new Date(), depositTypes);
  return {
    unitGross: p.unitGross,
    unitNet: p.unitNet,
    regularUnitGross: p.regularUnitGross,
    regularUnitNet: p.regularUnitNet,
    depositUnit: p.depositUnit,
    showNet: p.showNet,
    isOffer: p.priceSource === 'offer',
    discounted: p.showNet ? p.unitNet < p.regularUnitNet : p.discounted,
    note: p.priceNote,
    basePriceText: p.basePrice,
    displayUnit: p.showNet ? p.unitNet : p.unitGross,
    displayRegular: p.showNet ? p.regularUnitNet : p.regularUnitGross,
    price: p,
  };
}

export interface CartSummary {
  /** Anzahl Gebinde */
  count: number;
  /** Warenwert (netto bei B2B, sonst brutto), ohne Pfand */
  itemsTotal: number;
  /** Pfand gesamt */
  deposit: number;
  showNet: boolean;
  /** true, solange Artikel noch geladen werden */
  loading: boolean;
}

/** Schnelle Warenkorb-Summe für Kopfzeile/Badges (verbindlich rechnet api.quote) */
export function useCartSummary(): CartSummary {
  const items = useCart((s) => s.items);
  const { data: products, isLoading } = useProducts();
  const { data: customer } = useMyCustomer();
  const depositTypes = useBootstrap().depositTypes;
  return useMemo(() => {
    const map = new Map((products ?? []).map((p) => [p.id, p]));
    let count = 0;
    let itemsTotal = 0;
    let deposit = 0;
    let showNet = customer?.type === 'b2b';
    for (const item of items) {
      count += item.qty;
      const product = map.get(item.productId);
      if (!product) continue;
      const p = priceProduct(product, customer ?? null, item.qty, new Date(), depositTypes);
      showNet = p.showNet;
      itemsTotal += p.showNet ? p.lineNet : p.lineGross;
      deposit += p.depositTotal;
    }
    return { count, itemsTotal, deposit, showNet, loading: isLoading };
  }, [items, products, customer, depositTypes, isLoading]);
}

// ───────────────────────────── Mutationen ─────────────────────────────

export interface ApiMutationOptions<TData, TVars> {
  /** nach Erfolg invalidieren */
  invalidate?: QueryKey[];
  /** Erfolgsmeldung (Toast); Funktion erhält das Ergebnis */
  success?: string | ((data: TData, vars: TVars) => string);
  /** Fehler-Toast unterdrücken (eigene Fehleranzeige) */
  silent?: boolean;
  onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
  onError?: (error: Error, vars: TVars) => void;
  mutationOptions?: Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn' | 'onSuccess' | 'onError'>;
}

/**
 * Mutation mit Standardverhalten: Keys invalidieren, Erfolg/Fehler als Toast.
 * Beispiel: useApiMutation((id: string) => api.cancelOrder(id), { invalidate: [qk.orders], success: 'Bestellung storniert' })
 */
export function useApiMutation<TData, TVars = void>(fn: (vars: TVars) => Promise<TData>, options: ApiMutationOptions<TData, TVars> = {}) {
  const qc = useQueryClient();
  const { invalidate, success, silent, onSuccess, onError, mutationOptions } = options;
  return useMutation<TData, Error, TVars>({
    ...mutationOptions,
    mutationFn: fn,
    async onSuccess(data, vars) {
      if (invalidate?.length) await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success);
      await onSuccess?.(data, vars);
    },
    onError(error, vars) {
      if (!silent) toast.error(errorMessage(error));
      onError?.(error, vars);
    },
  });
}

/** Favorit umschalten (aktualisiert das Kundenkonto sofort) */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation<Customer, Error, ID, Customer | undefined>({
    mutationFn: (productId) => api.toggleFavorite(productId),
    async onMutate(productId) {
      await qc.cancelQueries({ queryKey: qk.customer });
      const prev = qc.getQueryData<Customer>(qk.customer);
      if (prev) {
        const has = prev.favorites.includes(productId);
        qc.setQueryData<Customer>(qk.customer, {
          ...prev,
          favorites: has ? prev.favorites.filter((f) => f !== productId) : [...prev.favorites, productId],
        });
      }
      return prev;
    },
    onSuccess(customer, productId) {
      qc.setQueryData(qk.customer, customer);
      toast.success(customer.favorites.includes(productId) ? 'Zu Ihren Favoriten hinzugefügt' : 'Aus Ihren Favoriten entfernt', {
        id: 'favorite',
        duration: 2500,
      });
    },
    onError(error, _id, prev) {
      if (prev) qc.setQueryData(qk.customer, prev);
      toast.error(errorMessage(error));
    },
  });
}

// ───────────────────────────── Echtzeit-Status ─────────────────────────────

/** Verbindungsstatus der Echtzeit-Verbindung ('online' im lokalen Modus) */
export function useRealtimeStatus(): RealtimeStatus {
  const subscribe = useCallback((cb: () => void) => realtime.onStatus(cb), []);
  return useSyncExternalStore(subscribe, realtime.status, realtime.status);
}
