import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { isDelhiveryConfigured } from '../../lib/delhivery/config.js';
import { createDelhiveryShipment } from '../../lib/delhivery/create-shipment.js';
import { fetchDelhiveryWaybill } from '../../lib/delhivery/fetch-waybill.js';
import { parcelLinesFromProducts } from '../../lib/delhivery/shipping-charges.js';
import { productsService } from '../products/products.service.js';

type ShippingAddress = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string | null;
  postal_code?: string;
  country?: string | null;
};

export class FulfillmentService {
  /**
   * Create Delhivery shipment for an order (fetch waybill → manifest → save AWB).
   * Idempotent when `delhivery_waybill` already exists.
   */
  async createShipmentForOrder(orderId: string) {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    if (order.delhivery_waybill) {
      return { order, reused: true };
    }

    if (!isDelhiveryConfigured()) {
      throw ApiError.internal('Delhivery is not configured');
    }

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id, snapshot_name, quantity')
      .eq('order_id', orderId);
    if (itemsErr) throw itemsErr;
    if (!items?.length) throw ApiError.badRequest('Order has no line items');

    const productIds = items.map((i) => i.product_id).filter(Boolean) as string[];
    const products = await productsService.getByIds(productIds);

    const resolved = items
      .map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) return null;
        return { product, quantity: item.quantity };
      })
      .filter((row): row is { product: typeof products[number]; quantity: number } => row !== null);

    if (!resolved.length) {
      throw ApiError.badRequest('Order products not found for shipment weight/dimensions');
    }

    const lines = parcelLinesFromProducts(resolved);

    const addr = (order.shipping_address ?? {}) as ShippingAddress;
    const pin = addr.postal_code ?? '';
    if (!pin) throw ApiError.badRequest('Order shipping address missing postal code');

    const { data: payments } = await supabase
      .from('payments')
      .select('provider')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1);

    const provider = payments?.[0]?.provider ?? (order.razorpay_order_id ? 'razorpay' : 'cod');
    const isCod = provider === 'cod';
    const paymentMode = isCod ? 'COD' : 'Prepaid';
    const totalRupees = order.total_paise / 100;
    const quantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const productsDesc = items.map((i) => i.snapshot_name).join(', ');

    let prefetchedWaybill: string | null = null;
    try {
      prefetchedWaybill = await fetchDelhiveryWaybill();
    } catch (waybillErr) {
      console.warn(
        '[fulfillment] waybill prefetch failed — Delhivery will auto-assign on create',
        orderId,
        waybillErr instanceof Error ? waybillErr.message : waybillErr
      );
    }

    const result = await createDelhiveryShipment({
      orderNumber: order.order_number,
      consigneeName: `${addr.first_name ?? ''} ${addr.last_name ?? ''}`.trim() || 'Customer',
      address: addr.street ?? '',
      pin,
      city: addr.city ?? '',
      state: addr.state,
      country: addr.country,
      phone: addr.phone ?? '',
      paymentMode,
      codAmountRupees: isCod ? totalRupees : undefined,
      totalAmountRupees: totalRupees,
      quantity,
      productsDesc,
      lines,
      waybill: prefetchedWaybill,
    });

    const nextStatus =
      order.status === 'pending' || order.status === 'paid' ? 'processing' : order.status;

    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({
        delhivery_waybill: result.waybill,
        delhivery_status: result.packageStatus ?? 'manifested',
        delhivery_raw: result.raw,
        status: nextStatus,
      })
      .eq('id', orderId)
      .is('delhivery_waybill', null)
      .select('*')
      .maybeSingle();

    if (updErr) throw updErr;

    const finalOrder = updated ?? order;
    if (updated && order.status !== nextStatus) {
      await this.notifyProcessing(finalOrder);
    }

    return { order: finalOrder, reused: false, waybill: result.waybill };
  }

  /** Fire-and-forget wrapper — never blocks checkout or payment. */
  tryCreateShipment(orderId: string) {
    void this.createShipmentForOrder(orderId).catch((err) => {
      console.error('[fulfillment] auto shipment failed', orderId, err);
    });
  }

  private async notifyProcessing(order: { id: string; user_id: string; order_number: string }) {
    const { notificationsService } = await import('../notifications/notifications.service.js');
    await notificationsService.safeCreate({
      userId: order.user_id,
      type: 'order_processing',
      title: 'Order is being prepared',
      body: `Order ${order.order_number} is now processing.`,
      link: `/dashboard/orders/${order.id}`,
      metadata: { order_id: order.id, order_number: order.order_number, status: 'processing' },
    });
  }
}

export const fulfillmentService = new FulfillmentService();
