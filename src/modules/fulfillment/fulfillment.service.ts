import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { isDelhiveryConfigured } from '../../lib/delhivery/config.js';
import { createDelhiveryShipment } from '../../lib/delhivery/create-shipment.js';
import {
  defaultPickupSchedule,
  requestDelhiveryPickup,
} from '../../lib/delhivery/request-pickup.js';
import { parcelLinesFromProducts } from '../../lib/delhivery/shipping-charges.js';
import {
  formatPickupTimeLabel,
  resolvePickupSchedule,
} from '../../lib/delhivery/pickup-schedule.js';
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
   * Create Delhivery shipment for an order (waybill left blank → Delhivery auto-assigns).
   * Idempotent when `delhivery_waybill` already exists.
   * Called automatically after Razorpay pay / COD session — not from admin UI.
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
      .filter((row): row is { product: (typeof products)[number]; quantity: number } => row !== null);

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

    // Leave waybill blank — Delhivery assigns AWB in create response (single-piece B2C).
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
      waybill: '',
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

  /** Fire-and-forget — never blocks checkout or payment. */
  tryCreateShipment(orderId: string) {
    void this.createShipmentForOrder(orderId)
      .then((result) => {
        if (result.reused) {
          console.info('[fulfillment] shipment already exists', orderId, result.order.delhivery_waybill);
          return;
        }
        console.info(
          '[fulfillment] shipment created',
          orderId,
          result.waybill,
          'status=',
          result.order.status
        );
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const details =
          err && typeof err === 'object' && 'details' in err
            ? (err as { details?: unknown }).details
            : undefined;
        console.error('[fulfillment] auto shipment failed', orderId, message, details ?? '');
      });
  }

  /** Packing slip data for shipping label print (Delhivery JSON + order snapshot). */
  async getPackingSlipForOrder(orderId: string) {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    const waybill = typeof order.delhivery_waybill === 'string' ? order.delhivery_waybill.trim() : '';
    if (!waybill) {
      throw ApiError.badRequest('Order has no Delhivery waybill yet — create shipment first');
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('snapshot_name, quantity, unit_price_paise, line_total_paise')
      .eq('order_id', orderId);

    const { fetchDelhiveryPackingSlip } = await import('../../lib/delhivery/packing-slip.js');
    let slip: Awaited<ReturnType<typeof fetchDelhiveryPackingSlip>> | null = null;
    try {
      slip = await fetchDelhiveryPackingSlip(waybill);
    } catch (err) {
      console.warn(
        '[fulfillment] packing slip upstream failed, using order snapshot',
        orderId,
        err instanceof Error ? err.message : err
      );
    }

    const pkg = slip?.packages[0] ?? null;
    const addr = (order.shipping_address ?? {}) as ShippingAddress;
    const { env } = await import('../../config/env.js');
    const wh = env.delhivery.warehouse;

    return {
      waybill,
      orderNumber: order.order_number as string,
      sortCode: pkg?.sort_code ?? null,
      payment: pkg?.payment ?? env.delhivery.pdt ?? null,
      mot: env.delhivery.mot === 'E' ? 'Express' : 'Surface',
      status: pkg?.status ?? order.delhivery_status ?? null,
      consignee: {
        name:
          pkg?.name ??
          (`${addr.first_name ?? ''} ${addr.last_name ?? ''}`.trim() || 'Customer'),
        address: pkg?.address ?? addr.street ?? '',
        city: pkg?.city ?? addr.city ?? '',
        pin: pkg?.pin ?? addr.postal_code ?? '',
        phone: pkg?.phone ?? addr.phone ?? '',
        state: addr.state ?? '',
      },
      seller: {
        name: wh.registeredName ?? env.delhivery.pickupLocationName ?? 'ODI',
        address: wh.address ?? '',
        city: wh.city ?? '',
        state: wh.state ?? '',
        pin: env.delhivery.originPin ?? '',
        phone: wh.phone ?? '',
        email: wh.email ?? '',
      },
      productsDesc: pkg?.products_desc ?? (items ?? []).map((i) => i.snapshot_name).join(', '),
      quantity: pkg?.quantity ?? (items ?? []).reduce((s, i) => s + i.quantity, 0),
      weight: pkg?.weight ?? null,
      totalPaise: order.total_paise as number,
      codAmountPaise:
        typeof pkg?.cod_amount === 'number'
          ? Math.round(pkg.cod_amount * 100)
          : typeof pkg?.cod_amount === 'string' && pkg.cod_amount.trim()
            ? Math.round(Number(pkg.cod_amount) * 100)
            : null,
      items: items ?? [],
      delhiveryPackage: pkg,
      delhiveryRaw: slip?.raw ?? null,
      delhiveryEnvironment: env.delhivery.environment,
    };
  }

  /**
   * Official Delhivery Generate Shipping Label PDF for an order waybill.
   * GET /api/p/packing_slip?wbns=…&pdf=true&pdf_size=4R
   */
  async getShippingLabelPdfForOrder(
    orderId: string,
    options?: { pdfSize?: '4R' | 'A4' }
  ) {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    const waybill = typeof order.delhivery_waybill === 'string' ? order.delhivery_waybill.trim() : '';
    if (!waybill) {
      throw ApiError.badRequest('Order has no Delhivery waybill yet — create shipment first');
    }

    const { fetchDelhiveryShippingLabelPdf } = await import('../../lib/delhivery/packing-slip.js');
    const { syncDelhiveryLabelReturnAddress } = await import('../../lib/delhivery/sync-label-return.js');
    const { env } = await import('../../config/env.js');

    // Shorten return_add on Delhivery before PDF render (fixes footer/barcode overlap on old waybills).
    await syncDelhiveryLabelReturnAddress(waybill);

    const label = await fetchDelhiveryShippingLabelPdf(
      waybill,
      options?.pdfSize ?? env.delhivery.labelPdfSize
    );

    return {
      orderNumber: order.order_number as string,
      ...label,
    };
  }

  /**
   * Admin-only: schedule Delhivery pickup for an order that already has a waybill.
   * Sets status → shipped when pickup is accepted.
   */
  async requestPickupForOrder(
    orderId: string,
    options?: { pickupDate?: string; pickupTime?: string; packageCount?: number }
  ) {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    if (!order.delhivery_waybill) {
      throw ApiError.badRequest('Create shipment first — order has no Delhivery waybill yet');
    }
    if (order.delhivery_pickup_token) {
      return { order, reused: true };
    }

    const schedule = defaultPickupSchedule();
    const pickupDate = options?.pickupDate?.trim() || schedule.pickupDate;
    const pickupTime = options?.pickupTime?.trim() || schedule.pickupTime;
    const packageCount = options?.packageCount ?? 1;

    const pickup = await requestDelhiveryPickup({
      pickupDate,
      pickupTime,
      expectedPackageCount: packageCount,
    });

    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({
        delhivery_pickup_token: pickup.pickupId,
        delhivery_pickup_date: pickupDate,
        delhivery_pickup_time: pickupTime,
        delhivery_status: 'pickup_scheduled',
        delhivery_raw: {
          ...(typeof order.delhivery_raw === 'object' && order.delhivery_raw
            ? (order.delhivery_raw as Record<string, unknown>)
            : {}),
          pickup_schedule: { date: pickupDate, time: pickupTime },
          pickup: pickup.raw,
        },
        status: order.status === 'processing' || order.status === 'paid' ? 'shipped' : order.status,
      })
      .eq('id', orderId)
      .is('delhivery_pickup_token', null)
      .select('*')
      .maybeSingle();

    if (updErr) throw updErr;

    const finalOrder = updated ?? order;
    if (updated && updated.status === 'shipped' && order.status !== 'shipped') {
      await this.notifyShipped(finalOrder);
    }

    return { order: finalOrder, reused: false, pickupId: pickup.pickupId };
  }

  /**
   * Live Delhivery package tracking for an order waybill.
   * When `userId` is set, only that order owner may fetch.
   */
  async getTrackingForOrder(orderId: string, options?: { userId?: string }) {
    let qb = supabase.from('orders').select('id, user_id, delhivery_waybill, delhivery_status').eq('id', orderId);
    if (options?.userId) qb = qb.eq('user_id', options.userId);

    const { data: order, error } = await qb.maybeSingle();
    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    const waybill = typeof order.delhivery_waybill === 'string' ? order.delhivery_waybill.trim() : '';
    if (!waybill) {
      throw ApiError.badRequest('Order has no Delhivery waybill yet');
    }

    const { fetchDelhiveryTracking } = await import('../../lib/delhivery/track-shipment.js');
    const tracking = await fetchDelhiveryTracking(waybill);

    // Soft-sync status string for admin lists (non-blocking best effort)
    if (tracking.status && tracking.status !== order.delhivery_status) {
      void supabase
        .from('orders')
        .update({ delhivery_status: tracking.status })
        .eq('id', orderId)
        .then(({ error: syncErr }) => {
          if (syncErr) console.warn('[fulfillment] track status sync failed', orderId, syncErr.message);
        });
    }

    return tracking;
  }

  /** Admin Pickups page — needs schedule vs already scheduled with date/time. */
  async listPickupsForAdmin() {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, created_at, shipping_address, delhivery_waybill, delhivery_status, delhivery_pickup_token, delhivery_pickup_date, delhivery_pickup_time, delhivery_raw'
      )
      .not('delhivery_waybill', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;
    const rows = data ?? [];

    const mapRow = (o: (typeof rows)[number]) => {
      const addr = (o.shipping_address ?? {}) as ShippingAddress;
      const schedule = resolvePickupSchedule(o);
      return {
        id: o.id as string,
        orderNumber: o.order_number as string,
        status: o.status as string,
        delhiveryStatus: (o.delhivery_status as string | null) ?? null,
        createdAt: o.created_at as string,
        waybill: o.delhivery_waybill as string,
        pickupToken: (o.delhivery_pickup_token as string | null) ?? null,
        pickupDate: schedule?.date ?? null,
        pickupTime: schedule?.time ?? null,
        pickupTimeLabel: schedule?.time ? formatPickupTimeLabel(schedule.time) : null,
        customerName:
          `${addr.first_name ?? ''} ${addr.last_name ?? ''}`.trim() || 'Customer',
        city: addr.city ?? null,
        state: addr.state ?? null,
      };
    };

    const needs = rows
      .filter((o) => o.delhivery_waybill && !o.delhivery_pickup_token)
      .map(mapRow);

    const scheduled = rows
      .filter((o) => o.delhivery_pickup_token)
      .map(mapRow)
      .sort((a, b) => {
        const da = a.pickupDate ?? '';
        const db = b.pickupDate ?? '';
        if (da !== db) return db.localeCompare(da);
        const ta = a.pickupTime ?? '';
        const tb = b.pickupTime ?? '';
        if (ta !== tb) return tb.localeCompare(ta);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return { needs, scheduled };
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

  private async notifyShipped(order: {
    id: string;
    user_id: string;
    order_number: string;
    delhivery_waybill?: string | null;
    shipping_address?: unknown;
  }) {
    const { notificationsService } = await import('../notifications/notifications.service.js');
    await notificationsService.safeCreate({
      userId: order.user_id,
      type: 'order_shipped',
      title: 'Order shipped',
      body: `Order ${order.order_number} is on the way.`,
      link: `/dashboard/orders/${order.id}`,
      metadata: { order_id: order.id, order_number: order.order_number, status: 'shipped' },
    });
    const { sendOrderShippedEmailForOrder } = await import('../../lib/mailer/index.js');
    sendOrderShippedEmailForOrder(order);
  }
}

export const fulfillmentService = new FulfillmentService();
