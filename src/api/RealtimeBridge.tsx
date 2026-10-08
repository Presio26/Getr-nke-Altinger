/**
 * Verbindet Echtzeit-Ereignisse mit dem Frontend-Zustand (docs/ARCHITECTURE.md §6):
 *  - Query-Invalidierung je Ereignistyp
 *  - Fahrerpositionen → usePositions (kein Refetch, Marker bewegen sich flüssig)
 *  - Benachrichtigungen → Toast (+ optional System-Benachrichtigung, wenn erlaubt und App im Hintergrund)
 *  - Einstellungen → Bootstrap-Kontext, Demo-Reset → alles neu laden
 *
 * Einmal innerhalb von Router + BootstrapContext montieren (macht App/routes.tsx).
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppNotification, Customer, Order, Product, RealtimeEvent, User } from '@shared/types';
import { realtime } from '@/api/client';
import { qk, useBootstrapActions } from '@/api/hooks';
import { usePositions } from '@/stores/positions';
import { useSession } from '@/stores/session';
import { useCart } from '@/stores/cart';
import { toast } from '@/components/ui/Toast';
import { setNotificationNavigator, showNotification } from '@/lib/notifications';

function isForUser(n: AppNotification, user: User | null): boolean {
  if (!user) return false;
  if (n.recipient === user.id) return true;
  if (n.recipient === 'admin') return user.role === 'admin';
  if (n.recipient === 'drivers') return user.role === 'driver';
  return false;
}

/**
 * Gemeinsame Toast-ID je Bestellung: Kurz hintereinander eintreffende Status-Hinweise derselben Bestellung
 * (z. B. „wird zusammengestellt“ → „liegt bereit“ → „Danke für Ihren Einkauf“) ersetzen sich statt zu stapeln.
 */
function notificationToastId(n: Pick<AppNotification, 'id' | 'link' | 'kind'>): string {
  const m = n.link?.match(/^\/(?:bestellung|admin\/bestellungen|fahrer\/stopp)\/([^/?#]+)/);
  if (m && (n.kind === 'order' || n.kind === 'delivery')) return `order-${m[1]}`;
  return `n-${n.id}`;
}

function upsertProduct(qc: QueryClient, product: Product) {
  qc.setQueryData<Product[]>(qk.products, (list) => {
    if (!list) return list;
    const i = list.findIndex((p) => p.id === product.id);
    if (i === -1) return [...list, product];
    const next = list.slice();
    next[i] = product;
    return next;
  });
  qc.setQueryData(qk.product(product.id), product);
}

function applyOrder(qc: QueryClient, order: Order) {
  // Detail sofort aktualisieren, Listen/Ansichten neu laden
  if (qc.getQueryData(qk.order(order.id))) qc.setQueryData(qk.order(order.id), order);
  qc.setQueryData<Order[]>(qk.orders, (list) => {
    if (!list) return list;
    const i = list.findIndex((o) => o.id === order.id);
    if (i === -1) return list;
    const next = list.slice();
    next[i] = order;
    return next;
  });
  void qc.invalidateQueries({ queryKey: qk.orders });
  void qc.invalidateQueries({ queryKey: qk.order(order.id) });
  void qc.invalidateQueries({ queryKey: qk.tracking(order.id) });
  void qc.invalidateQueries({ queryKey: qk.admin });
  void qc.invalidateQueries({ queryKey: qk.driver });
  // Treuepunkte/Leergut-Konto ändern sich mit Zustellung bzw. Abholung
  if (order.status === 'delivered' || order.status === 'picked_up' || order.status === 'cancelled') {
    void qc.invalidateQueries({ queryKey: qk.customer });
  }
}

export function RealtimeBridge() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { update, reload } = useBootstrapActions();
  const actions = useRef({ update, reload, navigate });
  actions.current = { update, reload, navigate };

  // Klicks auf System-Benachrichtigungen in der App navigieren lassen
  useEffect(() => {
    setNotificationNavigator((link) => actions.current.navigate(link));
    return () => setNotificationNavigator(null);
  }, []);

  useEffect(() => {
    const handle = (event: RealtimeEvent) => {
      switch (event.type) {
        case 'order.created':
        case 'order.updated':
          applyOrder(qc, event.order);
          break;

        case 'tour.updated':
        case 'tour.deleted':
          void qc.invalidateQueries({ queryKey: qk.admin });
          void qc.invalidateQueries({ queryKey: qk.driver });
          void qc.invalidateQueries({ queryKey: qk.tracking() });
          break;

        case 'driver.position':
          usePositions.getState().setPosition(event.driverId, event.position, event.tourId);
          break;

        case 'driver.updated':
          if (event.driver.position) usePositions.getState().setPosition(event.driver.id, event.driver.position);
          void qc.invalidateQueries({ queryKey: qk.admin });
          void qc.invalidateQueries({ queryKey: qk.driver });
          break;

        case 'product.updated':
          upsertProduct(qc, event.product);
          void qc.invalidateQueries({ queryKey: qk.admin });
          break;

        case 'customer.updated': {
          const mine = qc.getQueryData<Customer>(qk.customer);
          if (mine?.id === event.customer.id) qc.setQueryData(qk.customer, event.customer);
          void qc.invalidateQueries({ queryKey: qk.admin });
          break;
        }

        case 'notification': {
          void qc.invalidateQueries({ queryKey: qk.notifications });
          const user = useSession.getState().user;
          const n = event.notification;
          if (isForUser(n, user)) {
            toast.info(n.title, { description: n.body, href: n.link, id: notificationToastId(n) });
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
              void showNotification(n.title, { body: n.body, link: n.link, tag: n.id });
            }
          }
          break;
        }

        case 'settings.updated':
          actions.current.update({ settings: event.settings });
          void qc.invalidateQueries({ queryKey: ['slots'] });
          break;

        case 'invoice.updated':
          void qc.invalidateQueries({ queryKey: qk.invoices });
          void qc.invalidateQueries({ queryKey: qk.admin });
          break;

        case 'subscription.updated':
          void qc.invalidateQueries({ queryKey: qk.subscriptions });
          void qc.invalidateQueries({ queryKey: qk.admin });
          break;

        case 'data.reset': {
          usePositions.getState().clear();
          // Warenkorb komplett leeren (Artikel, Leergut, Gutschein, Festdatum, Kommission, Zeitfenster, Adresse)
          const cart = useCart.getState();
          const hadCart = cart.items.length > 0 || cart.emptiesReturn.length > 0 || !!cart.couponCode || !!cart.eventDate || cart.commission;
          cart.reset();
          void (async () => {
            await Promise.allSettled([actions.current.reload(), useSession.getState().refresh()]);
            await qc.invalidateQueries();
            toast.info('Demo-Daten wurden zurückgesetzt', {
              id: 'data-reset',
              description: hadCart
                ? 'Alle Ansichten zeigen wieder den Ausgangsstand – Ihr Warenkorb wurde geleert.'
                : 'Alle Ansichten zeigen wieder den Ausgangsstand.',
            });
          })();
          break;
        }
      }
    };
    return realtime.subscribe(handle);
  }, [qc]);

  // Die Einstellungen im Bootstrap hängen von der Rolle ab (nur der Markt erhält auch inaktive Gutscheine)
  // → nach An-/Abmeldung bzw. Nutzerwechsel neu laden, sonst bearbeitet der Markt eine gefilterte Liste
  const role = useSession((s) => s.user?.role ?? null);
  const lastRole = useRef(role);
  useEffect(() => {
    if (lastRole.current === role) return;
    lastRole.current = role;
    void actions.current.reload().catch(() => undefined);
  }, [role]);

  // Nach Verbindungsabbruch: verpasste Änderungen nachladen (Grunddaten, Anmeldung, alle Ansichten)
  useEffect(() => {
    let wasOffline = realtime.status() === 'offline';
    return realtime.onStatus((status) => {
      if (status === 'offline') wasOffline = true;
      if (status === 'online' && wasOffline) {
        wasOffline = false;
        void actions.current.reload().catch(() => undefined);
        const session = useSession.getState();
        // war der Server beim Start nicht erreichbar, ist die Anmeldung evtl. noch nicht geprüft
        if (session.status !== 'authenticated' && session.token) void session.refresh().catch(() => undefined);
        void qc.invalidateQueries();
      }
    });
  }, [qc]);

  return null;
}
