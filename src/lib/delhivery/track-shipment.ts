import { ApiError } from '../../utils/ApiError.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryGet } from './client.js';

export type DelhiveryTrackingScan = {
  scan: string;
  scanType: string | null;
  statusCode: string | null;
  instructions: string | null;
  scannedLocation: string | null;
  scanDateTime: string | null;
};

export type DelhiveryTrackingResult = {
  waybill: string;
  status: string | null;
  statusType: string | null;
  statusCode: string | null;
  statusLocation: string | null;
  statusDateTime: string | null;
  instructions: string | null;
  origin: string | null;
  destination: string | null;
  expectedDeliveryDate: string | null;
  pickedUpDate: string | null;
  deliveryDate: string | null;
  orderType: string | null;
  scans: DelhiveryTrackingScan[];
  raw: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Delhivery Order Tracking (Pull) API.
 * GET /api/v1/packages/json/?waybill=…&ref_ids=
 * @see https://delhivery-express-api-doc.readme.io/reference/order-tracking-api
 */
export async function fetchDelhiveryTracking(waybill: string): Promise<DelhiveryTrackingResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }
  const wbn = waybill.trim();
  if (!wbn) throw ApiError.badRequest('Waybill is required');

  const url =
    `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.trackShipment}` +
    `?waybill=${encodeURIComponent(wbn)}&ref_ids=`;

  const res = await fetchDelhiveryGet(url);
  const text = await res.text();

  let raw: unknown = {};
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw ApiError.internal('Invalid response from Delhivery tracking API', {
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery tracking API error', {
      status: res.status,
      delhivery: raw,
    });
  }

  const root = asRecord(raw);
  if (root && typeof root.Error === 'string' && root.Error.trim()) {
    throw ApiError.badRequest(root.Error.trim(), { delhivery: raw });
  }

  const shipmentData = Array.isArray(root?.ShipmentData) ? root!.ShipmentData : [];
  const first = shipmentData[0];
  const shipmentWrap = asRecord(first);
  const shipment = asRecord(shipmentWrap?.Shipment) ?? shipmentWrap;
  if (!shipment) {
    throw ApiError.notFound('No tracking data for this waybill');
  }

  const statusObj = asRecord(shipment.Status);
  const scansRaw = Array.isArray(shipment.Scans) ? shipment.Scans : [];
  const scans: DelhiveryTrackingScan[] = scansRaw
    .map((row) => {
      const wrap = asRecord(row);
      const detail = asRecord(wrap?.ScanDetail) ?? wrap;
      if (!detail) return null;
      return {
        scan: asString(detail.Scan) ?? 'Update',
        scanType: asString(detail.ScanType),
        statusCode: asString(detail.StatusCode),
        instructions: asString(detail.Instructions),
        scannedLocation: asString(detail.ScannedLocation),
        scanDateTime: asString(detail.ScanDateTime) ?? asString(detail.StatusDateTime),
      };
    })
    .filter((s): s is DelhiveryTrackingScan => s !== null);

  // Newest first for UI timeline
  scans.sort((a, b) => {
    const ta = a.scanDateTime ? Date.parse(a.scanDateTime) : 0;
    const tb = b.scanDateTime ? Date.parse(b.scanDateTime) : 0;
    return tb - ta;
  });

  return {
    waybill: asString(shipment.AWB) ?? wbn,
    status: asString(statusObj?.Status),
    statusType: asString(statusObj?.StatusType),
    statusCode: asString(statusObj?.StatusCode),
    statusLocation: asString(statusObj?.StatusLocation),
    statusDateTime: asString(statusObj?.StatusDateTime),
    instructions: asString(statusObj?.Instructions),
    origin: asString(shipment.Origin),
    destination: asString(shipment.Destination),
    expectedDeliveryDate: asString(shipment.ExpectedDeliveryDate),
    pickedUpDate: asString(shipment.PickedupDate) ?? asString(shipment.PickUpDate),
    deliveryDate: asString(shipment.DeliveryDate),
    orderType: asString(shipment.OrderType),
    scans,
    raw,
  };
}
