/**
 * Routen der App (docs/ARCHITECTURE.md §5). Alle Seiten werden per React.lazy geladen;
 * Ladeanzeigen stecken in den Layouts (Suspense um <Outlet />), Fehler zeigt RouteError im Layout.
 */
import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, isRouteErrorResponse, Link, useRouteError, type RouteObject } from 'react-router-dom';
import { Home, RefreshCw } from 'lucide-react';
import type { Role } from '@shared/types';
import { AdminLayout, DriverLayout, RequireRole, RootLayout, ShopLayout } from '@/components/layout';
import { Button, ButtonLink, ErrorState } from '@/components/ui';
import { Logo } from '@/components/brand/Logo';

// ───────────────────────────── Seiten (lazy) ─────────────────────────────

// Shop
const HomePage = lazy(() => import('@/features/shop/HomePage'));
const CatalogPage = lazy(() => import('@/features/shop/CatalogPage'));
const ProductPage = lazy(() => import('@/features/shop/ProductPage'));
const OffersPage = lazy(() => import('@/features/shop/OffersPage'));
const CartPage = lazy(() => import('@/features/shop/CartPage'));
const StorePage = lazy(() => import('@/features/shop/StorePage'));
const LegalPage = lazy(() => import('@/features/shop/LegalPage'));
// Kasse & Bestellungen
const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage'));
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage'));
// Konto
const AccountPage = lazy(() => import('@/features/account/AccountPage'));
const AddressesPage = lazy(() => import('@/features/account/AddressesPage'));
const FavoritesPage = lazy(() => import('@/features/account/FavoritesPage'));
const SubscriptionsPage = lazy(() => import('@/features/account/SubscriptionsPage'));
const DepositPage = lazy(() => import('@/features/account/DepositPage'));
const NotificationsPage = lazy(() => import('@/features/account/NotificationsPage'));
// Festservice
const EventsPage = lazy(() => import('@/features/events/EventsPage'));
// Anmeldung
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const BusinessRequestPage = lazy(() => import('@/features/auth/BusinessRequestPage'));
// Geschäftskunden
const BusinessDashboardPage = lazy(() => import('@/features/b2b/BusinessDashboardPage'));
const QuickOrderPage = lazy(() => import('@/features/b2b/QuickOrderPage'));
const InvoicesPage = lazy(() => import('@/features/b2b/InvoicesPage'));
const InvoiceDetailPage = lazy(() => import('@/features/b2b/InvoiceDetailPage'));
const StandingOrdersPage = lazy(() => import('@/features/b2b/StandingOrdersPage'));
const LocationsPage = lazy(() => import('@/features/b2b/LocationsPage'));
// Fahrer
const DriverHomePage = lazy(() => import('@/features/driver/DriverHomePage'));
const TourPage = lazy(() => import('@/features/driver/TourPage'));
const StopPage = lazy(() => import('@/features/driver/StopPage'));
// Markt / Admin
const DashboardPage = lazy(() => import('@/features/admin/DashboardPage'));
const OrdersBoardPage = lazy(() => import('@/features/admin/OrdersBoardPage'));
const OrderAdminDetailPage = lazy(() => import('@/features/admin/OrderAdminDetailPage'));
const ToursPage = lazy(() => import('@/features/admin/ToursPage'));
const LiveMapPage = lazy(() => import('@/features/admin/LiveMapPage'));
const PickupsPage = lazy(() => import('@/features/admin/PickupsPage'));
const ProductsPage = lazy(() => import('@/features/admin/ProductsPage'));
const ProductEditPage = lazy(() => import('@/features/admin/ProductEditPage'));
const CustomersPage = lazy(() => import('@/features/admin/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/features/admin/CustomerDetailPage'));
const InvoicesAdminPage = lazy(() => import('@/features/admin/InvoicesAdminPage'));
const SubscriptionsAdminPage = lazy(() => import('@/features/admin/SubscriptionsAdminPage'));
const StatsPage = lazy(() => import('@/features/admin/StatsPage'));
const SettingsPage = lazy(() => import('@/features/admin/SettingsPage'));
// Sonstiges
const DemoGuidePage = lazy(() => import('@/features/demo/DemoGuidePage'));
const NotFoundPage = lazy(() => import('@/features/NotFoundPage'));

// ───────────────────────────── Fehleranzeigen ─────────────────────────────

function isChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk/i.test(msg);
}

/** Fehler innerhalb eines Layouts (Kopfzeile/Navigation bleiben sichtbar) */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error('[route]', error);
  const chunk = isChunkError(error);
  return (
    <ErrorState
      error={chunk ? new Error('Die App wurde aktualisiert oder die Verbindung ist unterbrochen. Bitte laden Sie die Seite neu.') : error}
      onRetry={() => window.location.reload()}
      action={
        <ButtonLink to="/" variant="ghost" icon={Home}>
          Zur Startseite
        </ButtonLink>
      }
      className="min-h-[50vh]"
    />
  );
}

/** Letzte Rückfallebene (außerhalb aller Layouts) */
function RootError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error('[root]', error);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 px-6">
      <Logo className="h-12" />
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-card">
        <ErrorState error={isChunkError(error) ? new Error('Die App wurde aktualisiert. Bitte laden Sie die Seite neu.') : error} />
        <div className="flex justify-center gap-2 pb-8">
          <Button icon={RefreshCw} onClick={() => window.location.reload()}>
            Neu laden
          </Button>
          <Link to="/" className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-slate-700 hover:bg-slate-100" reloadDocument>
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Routen ─────────────────────────────

const guard = (roles: Role[], element: ReactNode) => <RequireRole roles={roles}>{element}</RequireRole>;
const CUSTOMER: Role[] = ['customer', 'business'];
const SIGNED_IN: Role[] = ['customer', 'business', 'driver', 'admin'];

const shopRoutes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: 'sortiment/:categoryId?', element: <CatalogPage /> },
  { path: 'produkt/:productId', element: <ProductPage /> },
  { path: 'angebote', element: <OffersPage /> },
  { path: 'warenkorb', element: <CartPage /> },
  { path: 'markt', element: <StorePage /> },
  { path: 'fest', element: <EventsPage /> },
  { path: 'kasse', element: guard(CUSTOMER, <CheckoutPage />) },
  { path: 'bestellungen', element: guard(CUSTOMER, <OrdersPage />) },
  { path: 'bestellung/:orderId', element: guard([...CUSTOMER, 'admin'], <OrderDetailPage />) },
  { path: 'konto', element: guard(CUSTOMER, <AccountPage />) },
  { path: 'konto/adressen', element: guard(CUSTOMER, <AddressesPage />) },
  { path: 'konto/favoriten', element: guard(CUSTOMER, <FavoritesPage />) },
  { path: 'konto/abos', element: guard(CUSTOMER, <SubscriptionsPage />) },
  { path: 'konto/leergut', element: guard(CUSTOMER, <DepositPage />) },
  { path: 'konto/benachrichtigungen', element: guard(SIGNED_IN, <NotificationsPage />) },
  { path: 'login', element: <LoginPage /> },
  { path: 'registrieren', element: <RegisterPage /> },
  { path: 'geschaeftskunde', element: <BusinessRequestPage /> },
  { path: 'business', element: guard(['business'], <BusinessDashboardPage />) },
  { path: 'business/schnellbestellung', element: guard(['business'], <QuickOrderPage />) },
  { path: 'business/rechnungen', element: guard(['business'], <InvoicesPage />) },
  { path: 'business/rechnungen/:invoiceId', element: guard(['business', 'admin'], <InvoiceDetailPage />) },
  { path: 'business/dauerauftraege', element: guard(['business'], <StandingOrdersPage />) },
  { path: 'business/standorte', element: guard(['business'], <LocationsPage />) },
  { path: 'demo', element: <DemoGuidePage /> },
  { path: 'impressum', element: <LegalPage /> },
  { path: 'datenschutz', element: <LegalPage /> },
  { path: '*', element: <NotFoundPage /> },
];

const driverRoutes: RouteObject[] = [
  { index: true, element: <DriverHomePage /> },
  { path: 'tour/:tourId', element: <TourPage /> },
  { path: 'stopp/:orderId', element: <StopPage /> },
];

const adminRoutes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'bestellungen', element: <OrdersBoardPage /> },
  { path: 'bestellungen/:orderId', element: <OrderAdminDetailPage /> },
  { path: 'touren', element: <ToursPage /> },
  { path: 'live', element: <LiveMapPage /> },
  { path: 'abholungen', element: <PickupsPage /> },
  { path: 'sortiment', element: <ProductsPage /> },
  { path: 'sortiment/:productId', element: <ProductEditPage /> },
  { path: 'kunden', element: <CustomersPage /> },
  { path: 'kunden/:customerId', element: <CustomerDetailPage /> },
  { path: 'rechnungen', element: <InvoicesAdminPage /> },
  { path: 'abos', element: <SubscriptionsAdminPage /> },
  { path: 'statistik', element: <StatsPage /> },
  { path: 'einstellungen', element: <SettingsPage /> },
  { path: '*', element: <NotFoundPage /> },
];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      {
        path: '/fahrer',
        element: guard(['driver'], <DriverLayout />),
        children: [{ errorElement: <RouteError />, children: driverRoutes }],
      },
      {
        path: '/admin',
        element: guard(['admin'], <AdminLayout />),
        children: [{ errorElement: <RouteError />, children: adminRoutes }],
      },
      {
        path: '/',
        element: <ShopLayout />,
        children: [{ errorElement: <RouteError />, children: shopRoutes }],
      },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
