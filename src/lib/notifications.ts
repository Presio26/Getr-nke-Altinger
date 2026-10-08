/**
 * Browser-Benachrichtigungen (System-Hinweise) – optional, nur mit Erlaubnis des Nutzers.
 * Innerhalb der App erscheinen Hinweise immer zusätzlich als Toast.
 */

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Erlaubnis anfragen (muss durch eine Nutzeraktion ausgelöst werden) */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Navigation für Klicks auf System-Benachrichtigungen (wird von der App registriert) */
let navigateHandler: ((link: string) => void) | null = null;
export function setNotificationNavigator(fn: ((link: string) => void) | null): void {
  navigateHandler = fn;
}

export interface ShowNotificationOptions {
  body?: string;
  /** App-interner Link, z. B. "/bestellung/o-123" */
  link?: string;
  /** gleiche Tags ersetzen sich gegenseitig */
  tag?: string;
}

/**
 * Zeigt eine System-Benachrichtigung, sofern erlaubt. Liefert true bei Erfolg.
 * Nutzt bevorzugt den Service Worker (nötig auf Android/als installierte App).
 */
export async function showNotification(title: string, options: ShowNotificationOptions = {}): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const init: NotificationOptions = {
    body: options.body,
    tag: options.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link: options.link },
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, init);
      return true;
    }
  } catch {
    // Fallback unten
  }
  try {
    const n = new Notification(title, init);
    n.onclick = () => {
      window.focus();
      if (options.link) {
        if (navigateHandler) navigateHandler(options.link);
        else window.location.assign(options.link);
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
