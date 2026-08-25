import { ApiError } from '../../utils/ApiError.js';
import { getDelhiveryBaseUrl, isDelhiveryConfigured } from './config.js';
import { fetchDelhiveryPostJson } from './client.js';

export type DelhiveryCancelShipmentResult = {
  waybill: string;
  success: boolean;
  raw: Record<string, unknown>;
};

/**
 * Delhivery Cancel Order API.
 * POST /api/p/edit  body: { waybill, cancellation: true }
 * Allowed statuses: Manifested, In Transit, Pending, Open, Scheduled
 * @see https://delhivery-express-api-doc.readme.io/reference/cancel-order-api
 */
export async function cancelDelhiveryShipment(
  waybill: string
): Promise<DelhiveryCancelShipmentResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }
  const wbn = waybill.trim();
  if (!wbn) throw ApiError.badRequest('Waybill is required to cancel shipment');

  const url = `${getDelhiveryBaseUrl()}/api/p/edit`;
  const res = await fetchDelhiveryPostJson(url, {
    waybill: wbn,
    cancellation: true,
  });
  const text = await res.text();

  let raw: Record<string, unknown> = {};
  if (text) {
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw ApiError.internal('Invalid response from Delhivery cancel API', {
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  }

  const success = raw.status === true || raw.success === true || res.ok;
  if (!res.ok || !success) {
    const message =
      (typeof raw.error === 'string' && raw.error) ||
      (typeof raw.message === 'string' && raw.message) ||
      (typeof raw.rmk === 'string' && raw.rmk) ||
      'Delhivery shipment cancellation failed';
    throw ApiError.internal(message, { status: res.status, delhivery: raw, waybill: wbn });
  }

  return { waybill: wbn, success: true, raw };
}
