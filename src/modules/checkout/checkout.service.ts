import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { computeDiscountPaise, generateOrderNumber } from '../../lib/money.js';
import { getRazorpay } from '../../lib/razorpay.js';
import { addressesService } from '../addresses/addresses.service.js';
import { cartService } from '../cart/cart.service.js';
import { couponsService } from '../coupons/coupons.service.js';
import { productsService, assertProductPurchasable } from '../products/products.service.js';

type LineInput = { productId?: string; slug?: string; quantity: number };
type ResolvedLine = { productId: string; quantity: number };

type ShippingSnapshot = {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  street: string;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
};

export class CheckoutService {
  async createSession(
    userId: string,
    userEmail: string,
    input: {
      addressId?: string;
      shippingAddress?: ShippingSnapshot;
      items?: LineInput[];
      useCart?: boolean;
      couponCode?: string | null;
      /** 'razorpay' (default) creates Razorpay order; 'cod' skips payment gateway. */
      paymentMethod?: 'razorpay' | 'cod';
    },
    idempotencyKey: string
  ) {
    // Idempotent replay
    const { data: existing } = await supabase
      .from('orders')
      .select('id, order_number, total_paise, currency, razorpay_order_id, status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      const existingIsCod = !existing.razorpay_order_id;
      return {
        orderId: existing.id,
        orderNumber: existing.order_number,
        razorpayOrderId: existing.razorpay_order_id ?? null,
        amount: existing.total_paise,
        currency: existing.currency,
        keyId: existingIsCod ? null : env.razorpay.keyId,
        isCod: existingIsCod,
        reused: true,
      };
    }

    const shipping = await this.resolveShipping(userId, input);
    const lines = await this.resolveLines(userId, input);
    const productIds = lines.map((l) => l.productId);
    const products = await productsService.getByIds(productIds);

    if (products.length !== new Set(productIds).size) {
      throw ApiError.badRequest('One or more products are invalid');
    }

    const primaryImages = await this.primaryImageMap(productIds);

    let subtotalPaise = 0;
    const orderItems: {
      product_id: string;
      snapshot_name: string;
      snapshot_slug: string;
      snapshot_image_url: string | null;
      unit_price_paise: number;
      quantity: number;
      line_total_paise: number;
    }[] = [];

    for (const line of lines) {
      const product = products.find((p) => p.id === line.productId)!;
      assertProductPurchasable(product, line.quantity);
      const lineTotal = product.price_paise * line.quantity;
      subtotalPaise += lineTotal;
      orderItems.push({
        product_id: product.id,
        snapshot_name: product.name,
        snapshot_slug: product.slug,
        snapshot_image_url: primaryImages.get(product.id) ?? null,
        unit_price_paise: product.price_paise,
        quantity: line.quantity,
        line_total_paise: lineTotal,
      });
    }

    let discountPaise = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;

    if (input.couponCode?.trim()) {
      const coupon = await couponsService.findByCode(input.couponCode);
      if (!coupon) throw ApiError.notFound('Coupon not found');
      await couponsService.assertUsable(coupon, userId, subtotalPaise);
      discountPaise = computeDiscountPaise(coupon, subtotalPaise);
      couponId = coupon.id;
      couponCode = coupon.code;
    }

    const shippingPaise = 0;
    const totalPaise = Math.max(0, subtotalPaise - discountPaise + shippingPaise);
    if (totalPaise < 100) {
      throw ApiError.badRequest('Order total must be at least ₹1');
    }

    const orderNumber = generateOrderNumber();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: userId,
        status: 'pending',
        subtotal_paise: subtotalPaise,
        discount_paise: discountPaise,
        shipping_paise: shippingPaise,
        total_paise: totalPaise,
        currency: 'INR',
        coupon_id: couponId,
        coupon_code: couponCode,
        shipping_address: { ...shipping, email: shipping.email ?? userEmail },
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single();

    if (orderError) {
      if (orderError.code === '23505') {
        // Race on idempotency — re-fetch
        const { data: raced } = await supabase
          .from('orders')
          .select('id, order_number, total_paise, currency, razorpay_order_id')
          .eq('idempotency_key', idempotencyKey)
          .single();
        if (raced) {
          const racedIsCod = !raced.razorpay_order_id;
          return {
            orderId: raced.id,
            orderNumber: raced.order_number,
            razorpayOrderId: raced.razorpay_order_id ?? null,
            amount: raced.total_paise,
            currency: raced.currency,
            keyId: racedIsCod ? null : env.razorpay.keyId,
            isCod: racedIsCod,
            reused: true,
          };
        }
      }
      throw orderError;
    }

    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItems.map((item) => ({ ...item, order_id: order.id }))
    );
    if (itemsError) throw itemsError;

    await this.notifyOrderCreated({
      id: order.id,
      user_id: userId,
      order_number: orderNumber,
      total_paise: totalPaise,
    });

    const isCod = input.paymentMethod === 'cod';

    {
      const { sendOrderPlacedEmail } = await import('../../lib/mailer/index.js');
      const shipEmail =
        typeof shipping.email === 'string' && shipping.email.includes('@')
          ? shipping.email
          : userEmail;
      sendOrderPlacedEmail({
        to: shipEmail,
        name: `${shipping.first_name} ${shipping.last_name}`.trim(),
        orderNumber,
        totalPaise,
        isCod,
      });
    }

    if (!isCod) {
      // Online payment: create Razorpay order + payment placeholder
      const rzp = getRazorpay();
      const rzpOrder = await rzp.orders.create({
        amount: totalPaise,
        currency: 'INR',
        receipt: order.id.slice(0, 40),
        notes: { order_id: order.id, order_number: orderNumber },
      });

      await supabase
        .from('orders')
        .update({ razorpay_order_id: rzpOrder.id })
        .eq('id', order.id);

      await supabase.from('payments').insert({
        order_id: order.id,
        provider: 'razorpay',
        provider_order_id: rzpOrder.id,
        amount_paise: totalPaise,
        currency: 'INR',
        status: 'created',
      });

      if (input.useCart) {
        await cartService.clear(userId);
      }

      return {
        orderId: order.id,
        orderNumber,
        razorpayOrderId: rzpOrder.id,
        amount: totalPaise,
        currency: 'INR',
        keyId: env.razorpay.keyId,
        isCod: false,
        reused: false,
      };
    }

    // COD: order stays 'pending'; admin marks it paid after delivery
    await supabase.from('payments').insert({
      order_id: order.id,
      provider: 'cod',
      amount_paise: totalPaise,
      currency: 'INR',
      status: 'created',
    });

    if (input.useCart) {
      await cartService.clear(userId);
    }

    return {
      orderId: order.id,
      orderNumber,
      razorpayOrderId: null,
      amount: totalPaise,
      currency: 'INR',
      keyId: null,
      isCod: true,
      reused: false,
    };
  }

  private async resolveShipping(
    userId: string,
    input: { addressId?: string; shippingAddress?: ShippingSnapshot }
  ): Promise<ShippingSnapshot> {
    if (input.addressId) {
      const addr = await addressesService.getOwned(userId, input.addressId);
      if (!addr) throw ApiError.notFound('Address not found');
      return {
        first_name: addr.first_name,
        last_name: addr.last_name,
        phone: addr.phone,
        email: addr.email,
        street: addr.street,
        city: addr.city,
        state: addr.state,
        postal_code: addr.postal_code,
        country: addr.country,
      };
    }
    if (!input.shippingAddress) {
      throw ApiError.badRequest('Provide addressId or shippingAddress');
    }
    return input.shippingAddress;
  }

  private async resolveLines(
    userId: string,
    input: { items?: LineInput[]; useCart?: boolean }
  ): Promise<ResolvedLine[]> {
    if (input.useCart) {
      const cart = await cartService.getCart(userId);
      if (!cart.items.length) throw ApiError.badRequest('Cart is empty');
      return cart.items.map((i) => ({
        productId: i.product_id as string,
        quantity: i.quantity as number,
      }));
    }
    if (!input.items?.length) throw ApiError.badRequest('No items provided');

    const resolved: ResolvedLine[] = [];
    for (const item of input.items) {
      if (item.productId) {
        resolved.push({ productId: item.productId, quantity: item.quantity });
        continue;
      }
      if (!item.slug) throw ApiError.badRequest('Provide productId or slug');
      const product = await productsService.getBySlug(item.slug);
      if (!product) throw ApiError.notFound(`Product not found: ${item.slug}`);
      resolved.push({ productId: product.id, quantity: item.quantity });
    }
    return resolved;
  }

  private async primaryImageMap(productIds: string[]) {
    const map = new Map<string, string>();
    if (!productIds.length) return map;
    const { data } = await supabase
      .from('product_images')
      .select('product_id, url, is_primary, sort_order')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true });

    for (const img of data ?? []) {
      if (!map.has(img.product_id) || img.is_primary) {
        map.set(img.product_id, img.url);
      }
    }
    return map;
  }

  /** Customer + admins each get their own row (scoped by user_id). */
  private async notifyOrderCreated(order: {
    id: string;
    user_id: string;
    order_number: string;
    total_paise: number;
  }) {
    const { notificationsService } = await import('../notifications/notifications.service.js');
    const amountInr = (order.total_paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });

    await notificationsService.safeCreate({
      userId: order.user_id,
      type: 'order_created',
      title: 'Order placed',
      body: `Order ${order.order_number} · ${amountInr} — complete payment to confirm.`,
      link: `/dashboard/orders/${order.id}`,
      metadata: { order_id: order.id, order_number: order.order_number },
    });

    // Admins get separate rows on their own user_id — never shared across customers
    await notificationsService.notifyAdmins(
      {
        type: 'admin_order_created',
        title: 'New order placed',
        body: `${order.order_number} · ${amountInr}`,
        link: `/dashboard/admin/orders/${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          user_id: order.user_id,
        },
      },
      { excludeUserId: order.user_id }
    );
  }
}

export const checkoutService = new CheckoutService();
