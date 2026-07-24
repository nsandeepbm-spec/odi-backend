/** Compute coupon discount in paise from a validated coupon row + subtotal. */
export function computeDiscountPaise(
  coupon: {
    type: 'percent' | 'fixed_paise';
    value: number;
    max_discount_paise: number | null;
  },
  subtotalPaise: number
): number {
  let discount =
    coupon.type === 'percent'
      ? Math.floor((subtotalPaise * coupon.value) / 100)
      : coupon.value;

  if (coupon.max_discount_paise != null) {
    discount = Math.min(discount, coupon.max_discount_paise);
  }

  return Math.max(0, Math.min(discount, subtotalPaise));
}

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}
