/**
 * Datenzugriff für das Tagesgeschäft (Bestellungen, Touren, Fahrer, Statistik).
 * Alle Keys stammen aus `qk` – die RealtimeBridge invalidiert sie bei Echtzeit-Ereignissen.
 */
import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminOrderQuery } from '@shared/api';
import type { DayString, EmptiesLine, ID, Order, OrderStatus, TourInput } from '@shared/types';
import { orderStatusLabel } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { usePositions } from '@/stores/positions';
import { pathTo } from './model';

export function useAdminOrders(query: AdminOrderQuery = {}, options: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.adminOrders(query),
    queryFn: () => api.adminListOrders(query),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
    enabled: options.enabled ?? true,
  });
}

export function useAdminOrder(orderId: ID | undefined) {
  return useQuery({
    queryKey: qk.adminOrder(orderId ?? ''),
    queryFn: () => api.getOrder(orderId as ID),
    enabled: !!orderId,
  });
}

export function useAdminTours(date: DayString | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.adminTours(date ?? ''),
    queryFn: () => api.adminListTours(date as DayString),
    placeholderData: keepPreviousData,
    enabled: enabled && !!date,
  });
}

export function useAdminStats(days: number) {
  return useQuery({
    queryKey: qk.adminStats(days),
    queryFn: () => api.adminGetStats(days),
    refetchInterval: 120_000,
  });
}

/** Fahrerliste; übernimmt die gemeldeten Positionen in den Live-Positions-Store */
export function useAdminDrivers() {
  const query = useQuery({
    queryKey: qk.adminDrivers,
    queryFn: () => api.adminListDrivers(),
    refetchInterval: 60_000,
  });
  const drivers = query.data;
  useEffect(() => {
    if (!drivers) return;
    usePositions.getState().seed(Object.fromEntries(drivers.map((d) => [d.id, d.position])));
  }, [drivers]);
  return query;
}

// ───────────────────────────── Mutationen ─────────────────────────────

export interface StatusVars {
  order: Order;
  to: OrderStatus;
  note?: string;
  /** tatsächlich angenommenes Leergut (bei „Abgeholt“/„Zugestellt“) */
  emptiesCollected?: EmptiesLine[];
}

/**
 * Status setzen. Fehlende Zwischenschritte (z. B. Bestätigt → Kommissionierung → Bereit)
 * werden nacheinander nachgezogen, damit „Bereitgestellt“/„Abgeholt“ mit einem Klick gehen.
 */
export function useOrderStatus(options: { success?: boolean } = {}) {
  const qc = useQueryClient();
  return useApiMutation(
    async ({ order, to, note, emptiesCollected }: StatusVars) => {
      const path = pathTo(order, to) ?? [to];
      let current = order;
      for (const step of path) {
        current =
          step === to && emptiesCollected
            ? await api.adminUpdateOrderStatus(current.id, step, note, emptiesCollected)
            : await api.adminUpdateOrderStatus(current.id, step, step === to ? note : undefined);
      }
      return current;
    },
    {
      invalidate: [qk.admin],
      success: options.success === false ? undefined : (o) => `${o.number}: ${orderStatusLabel(o.status, o.fulfillment)}`,
      onSuccess: (o) => {
        qc.setQueryData(qk.adminOrder(o.id), o);
      },
    },
  );
}

export function useSaveTour() {
  return useApiMutation((input: TourInput) => api.adminSaveTour(input), { invalidate: [qk.admin] });
}
