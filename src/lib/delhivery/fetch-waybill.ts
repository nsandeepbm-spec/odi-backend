import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryGet } from './client.js';

function parseWaybillBody(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    const trimmed = body.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    try {
      return parseWaybillBody(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      if (typeof item === 'string' && /^\d+$/.test(item.trim())) return item.trim();
      if (item && typeof item === 'object') {
        const wb = (item as Record<string, unknown>).waybill ?? (item as Record<string, unknown>).wbn;
        if (typeof wb === 'string' && wb.trim()) return wb.trim();
      }
    }
    return null;
  }

  if (body && typeof body === 'object') {
    const row = body as Record<string, unknown>;
    const direct =
      row.waybill ?? row.wbn ?? row.waybill_number ?? row.upload_wbn ?? row.wayBill;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    if (typeof direct === 'number') return String(direct);
  }

  return null;
}

/**
 * Delhivery Fetch Waybill — one AWB per request.
 * GET /waybill/api/fetch/json/?cl={client_name}
 *
 * Optional: you can skip this and leave `waybill` blank on create — Delhivery auto-assigns.
 */
export async function fetchDelhiveryWaybill(): Promise<string> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }

  const clientName = (env.delhivery.clientName ?? '').trim();
  if (!clientName) {
    throw ApiError.internal(
      'DELHIVERY_CLIENT_NAME is not configured (Delhivery account client name for waybill fetch)'
    );
  }

  const params = new URLSearchParams({ cl: clientName });
  const url = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.fetchWaybill}?${params.toString()}`;
  const res = await fetchDelhiveryGet(url);
  const text = await res.text();

  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery fetch waybill API error', {
      status: res.status,
      body: text.slice(0, 500),
    });
  }

  const waybill = parseWaybillBody(parsed);
  if (!waybill) {
    throw ApiError.internal('Delhivery fetch waybill did not return a waybill number', {
      body: text.slice(0, 500),
    });
  }

  return waybill;
}
