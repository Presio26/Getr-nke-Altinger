/**
 * Telefonbestellung über die Adresse öffnen: `?neu=telefon` (optional `&kunde=<customerId>`).
 * So funktionieren Knöpfe, Links aus anderen Seiten und Lesezeichen gleich.
 */
import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PhoneOrderDrawer } from './PhoneOrderDrawer';

export const PHONE_ORDER_PARAM = 'neu';
export const PHONE_ORDER_VALUE = 'telefon';

/** Pfad zur Telefonbestellung (Bestell-Board), optional mit vorgewähltem Kunden */
export function phoneOrderHref(customerId?: string): string {
  return `/admin/bestellungen?${PHONE_ORDER_PARAM}=${PHONE_ORDER_VALUE}${customerId ? `&kunde=${encodeURIComponent(customerId)}` : ''}`;
}

/** Öffnet die Telefonbestellung auf der aktuellen Seite */
export function useOpenPhoneOrder(): (customerId?: string) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (customerId?: string) =>
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set(PHONE_ORDER_PARAM, PHONE_ORDER_VALUE);
        if (customerId) p.set('kunde', customerId);
        else p.delete('kunde');
        return p;
      }),
    [setParams],
  );
}

export function PhoneOrderLauncher() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const open = params.get(PHONE_ORDER_PARAM) === PHONE_ORDER_VALUE;
  const customerId = params.get('kunde');
  const close = () =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete(PHONE_ORDER_PARAM);
        p.delete('kunde');
        return p;
      },
      { replace: true },
    );
  return (
    <PhoneOrderDrawer
      open={open}
      onClose={close}
      initialCustomerId={customerId}
      onCreated={(order) => navigate(`/admin/bestellungen/${encodeURIComponent(order.id)}`, { replace: true })}
    />
  );
}
