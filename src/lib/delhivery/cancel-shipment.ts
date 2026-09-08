import { ApiError } from '../../utils/ApiError.js';
import { DELHIVERY_API_PATHS, getDelhiveryBaseUrl, isDelhiveryConfigured } from './config.js';
import { fetchDelhiveryPostJson } from './client.js';

export type DelhiveryCancelShipmentResult = {
  waybill: string;
  success: boolean;
  raw: Record<string, unknown>;
};

function truthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true;
  return false;
}

function falsyFlag(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'false') return true;
  return false;
}

function delhiveryCancelMessage(raw: Record<string, unknown>, fallback: string): string {
  for (const key of ['error', 'message', 'msg', 'rmk', 'remark']) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function isAlreadyCancelledPayload(raw: Record<string, unknown>, message: string): boolean {
  const blob = `${message} ${JSON.stringify(raw)}`.toLowerCase();
  return (
    /already\s+cancel/.test(blob) ||
    /cancel(?:led|ed)\s+already/.test(blob) ||
    /shipment\s+is\s+cancel/.test(blob) ||
    /waybill\s+already\s+cancel/.test(blob)
  );
}

/**
 * Delhivery Shipment Cancellation.
 * POST /api/p/edit  body: { waybill, cancellation: "true" }
 * Forward (COD/Prepaid) allowed only: Manifested, In Transit, Pending.
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

  const url = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.editOrCancelShipment}`;
  const res = await fetchDelhiveryPostJson(url, {
    waybill: wbn,
    cancellation: 'true',
  });
  const text = await res.text();

  let raw: Record<string, unknown> = {};
  if (text) {
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw ApiError.badRequest('Invalid response from Delhivery cancel API', {
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  }

  const message = delhiveryCancelMessage(raw, '');
  const failed =
    !res.ok ||
    falsyFlag(raw.status) ||
    falsyFlag(raw.success) ||
    (typeof raw.error === 'string' && raw.error.trim().length > 0);

  if (failed && !truthyFlag(raw.status) && !truthyFlag(raw.success)) {
    if (isAlreadyCancelledPayload(raw, message)) {
      return { waybill: wbn, success: true, raw };
    }
    throw ApiError.badRequest(
      message || 'Delhivery could not cancel this shipment',
      { status: res.status, delhivery: raw, waybill: wbn }
    );
  }

  return { waybill: wbn, success: true, raw };
}
