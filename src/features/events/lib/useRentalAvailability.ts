import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { RentalAvailability } from '@shared/api';
import { addDays, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Gültiges Fest-Datum: frühestens morgen */
export function isValidEventDate(date: string | null | undefined): date is string {
  return !!date && DAY_RE.test(date) && date >= addDays(todayString(), 1);
}

/** Verfügbarkeit der Leihartikel am Fest-Datum (Map productId → Verfügbarkeit) */
export function useRentalAvailability(date: string | null | undefined) {
  const valid = isValidEventDate(date);
  const query = useQuery({
    queryKey: qk.rentals(valid ? date : ''),
    queryFn: () => api.rentalAvailability(date as string),
    enabled: valid,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const map = useMemo(() => new Map<string, RentalAvailability>((query.data ?? []).map((r) => [r.productId, r])), [query.data]);
  return { ...query, map, valid };
}
