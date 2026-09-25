/** Map a Delhivery package status onto the ODI order lifecycle. */

export type DeliveryStage = 'processing' | 'shipped' | 'delivered';

const RANK: Record<string, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

export function deliveryStageFromDelhivery(input: {
  status?: string | null;
  statusType?: string | null;
}): DeliveryStage | null {
  const type = (input.statusType ?? '').trim().toUpperCase();
  const status = (input.status ?? '').trim().toLowerCase();
  if (!type && !status) return null;

  if (type === 'DL' || status === 'delivered' || /\bdelivered\b/.test(status)) {
    return 'delivered';
  }

  if (
    type === 'PU' ||
    status.includes('in transit') ||
    status.includes('dispatched') ||
    status.includes('out for delivery') ||
    status.includes('picked up') ||
    status === 'pickedup'
  ) {
    return 'shipped';
  }

  if (
    type === 'PP' ||
    type === 'UD' ||
    status.includes('manifest') ||
    status.includes('pickup') ||
    status.includes('not picked') ||
    status === 'pending'
  ) {
    return 'processing';
  }

  return null;
}

/** Forward-only. Never moves cancelled or refunded orders. */
export function promotedOrderStatus(current: string, stage: DeliveryStage | null): string | null {
  if (!stage) return null;
  if (current === 'cancelled' || current === 'refunded') return null;
  const cur = RANK[current];
  const next = RANK[stage];
  if (cur == null || next == null || next <= cur) return null;
  return stage;
}

export function isDeliveredShipment(input: {
  status?: string | null;
  delhiveryStatus?: string | null;
  statusType?: string | null;
}): boolean {
  if (input.status === 'delivered') return true;
  return (
    deliveryStageFromDelhivery({
      status: input.delhiveryStatus ?? input.status,
      statusType: input.statusType,
    }) === 'delivered'
  );
}
