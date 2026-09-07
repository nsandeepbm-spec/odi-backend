/** Resolve admin-visible pickup date/time from order row (columns → JSON fallback). */
export function resolvePickupSchedule(order: {
  delhivery_pickup_date?: string | null;
  delhivery_pickup_time?: string | null;
  delhivery_raw?: unknown;
}): { date: string; time: string } | null {
  const colDate =
    typeof order.delhivery_pickup_date === 'string' ? order.delhivery_pickup_date.trim() : '';
  if (colDate) {
    const colTime =
      typeof order.delhivery_pickup_time === 'string' ? order.delhivery_pickup_time.trim() : '';
    return { date: colDate, time: colTime };
  }

  const raw =
    order.delhivery_raw && typeof order.delhivery_raw === 'object' && !Array.isArray(order.delhivery_raw)
      ? (order.delhivery_raw as Record<string, unknown>)
      : null;
  if (!raw) return null;

  const sched = raw.pickup_schedule;
  if (sched && typeof sched === 'object' && !Array.isArray(sched)) {
    const s = sched as Record<string, unknown>;
    const date = typeof s.date === 'string' ? s.date.trim() : '';
    if (date) {
      const time = typeof s.time === 'string' ? s.time.trim() : '';
      return { date, time };
    }
  }

  const pickup = raw.pickup;
  if (pickup && typeof pickup === 'object' && !Array.isArray(pickup)) {
    const p = pickup as Record<string, unknown>;
    const date =
      typeof p.pickup_date === 'string'
        ? p.pickup_date.trim()
        : typeof p.pickupDate === 'string'
          ? p.pickupDate.trim()
          : '';
    if (date) {
      const time =
        typeof p.pickup_time === 'string'
          ? p.pickup_time.trim()
          : typeof p.pickupTime === 'string'
            ? p.pickupTime.trim()
            : '';
      return { date, time };
    }
  }

  return null;
}

export function formatPickupTimeLabel(time: string): string {
  const t = time.trim();
  if (!t) return '—';
  const parts = t.split(':');
  const h = Number(parts[0]);
  const m = parts[1] ?? '00';
  if (!Number.isFinite(h)) return t.slice(0, 5);
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${m} ${ampm}`;
}
