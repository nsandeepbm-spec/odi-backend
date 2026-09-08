import { ApiError } from '../../utils/ApiError.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryGet } from './client.js';

export type DelhiveryPackingSlipPackage = {
  waybill: string;
  order?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  pin?: string | null;
  phone?: string | null;
  payment?: string | null;
  cod_amount?: number | string | null;
  status?: string | null;
  sort_code?: string | null;
  products_desc?: string | null;
  quantity?: number | string | null;
  weight?: number | string | null;
  raw: Record<string, unknown>;
};

export type DelhiveryLabelPdfSize = '4R' | 'A4';

/**
 * Delhivery Packing Slip API — JSON for one or more waybills.
 * GET /api/p/packing_slip?wbns={waybill}
 * @see https://one.delhivery.com/developer-portal/document/b2c/detail/generate-shipping-label
 * @see https://delhivery-express-api-doc.readme.io/reference/packing-slip-api
 */
export async function fetchDelhiveryPackingSlip(
  waybill: string
): Promise<{ packages: DelhiveryPackingSlipPackage[]; raw: unknown }> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }
  const wbn = waybill.trim();
  if (!wbn) throw ApiError.badRequest('Waybill is required');

  const url = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.packingSlip}?wbns=${encodeURIComponent(wbn)}`;
  const res = await fetchDelhiveryGet(url);
  const text = await res.text();

  let raw: unknown = {};
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw ApiError.internal('Invalid response from Delhivery packing slip API', {
        status: res.status,
        body: text.slice(0, 400),
      });
    }
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery packing slip API error', {
      status: res.status,
      delhivery: raw,
    });
  }

  const packagesRaw = Array.isArray((raw as { packages?: unknown }).packages)
    ? ((raw as { packages: unknown[] }).packages)
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];

  const packages: DelhiveryPackingSlipPackage[] = packagesRaw.map((row) => {
    const p = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const wb =
      typeof p.wbn === 'string'
        ? p.wbn
        : typeof p.waybill === 'string'
          ? p.waybill
          : typeof p.waybill === 'number'
            ? String(p.waybill)
            : wbn;
    return {
      waybill: wb,
      order: typeof p.order === 'string' ? p.order : typeof p.oid === 'string' ? p.oid : null,
      name: typeof p.name === 'string' ? p.name : null,
      address: typeof p.address === 'string' ? p.address : typeof p.add === 'string' ? p.add : null,
      city: typeof p.city === 'string' ? p.city : null,
      pin: typeof p.pin === 'string' ? p.pin : typeof p.pin === 'number' ? String(p.pin) : null,
      phone: typeof p.phone === 'string' ? p.phone : null,
      payment: typeof p.payment === 'string' ? p.payment : typeof p.pt === 'string' ? p.pt : null,
      cod_amount: (p.cod_amount ?? p.codAmount ?? null) as number | string | null,
      status: typeof p.status === 'string' ? p.status : null,
      sort_code:
        typeof p.sort_code === 'string'
          ? p.sort_code
          : typeof p.sort_code === 'number'
            ? String(p.sort_code)
            : null,
      products_desc: typeof p.products_desc === 'string' ? p.products_desc : null,
      quantity: (p.quantity ?? p.qty ?? null) as number | string | null,
      weight: (p.weight ?? null) as number | string | null,
      raw: p,
    };
  });

  return { packages, raw };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function extractPdfUrl(raw: unknown): string | null {
  const root = asRecord(raw);
  if (!root) return null;

  const directKeys = [
    'packages_pdf_url',
    'pdf_download_link',
    'pdf_url',
    'pdfUrl',
    'download_url',
    'url',
  ];
  for (const key of directKeys) {
    const v = root[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }

  const links = root.pdf_links ?? root.pdfLinks ?? root.packages_pdf;
  if (Array.isArray(links) && links.length > 0) {
    const first = links[0];
    if (typeof first === 'string' && /^https?:\/\//i.test(first.trim())) return first.trim();
    const obj = asRecord(first);
    if (obj) {
      for (const key of ['url', 'pdf_url', 'link', 'href']) {
        const v = obj[key];
        if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
      }
    }
  }

  const packages = Array.isArray(root.packages) ? root.packages : [];
  for (const row of packages) {
    const p = asRecord(row);
    if (!p) continue;
    for (const key of ['pdf_url', 'pdf_download_link', 'packages_pdf_url', 'url']) {
      const v = p[key];
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
    }
  }

  return null;
}

export type DelhiveryShippingLabelPdf = {
  waybill: string;
  pdfSize: DelhiveryLabelPdfSize;
  /** PDF bytes when Delhivery returned binary (or we downloaded a link). */
  bytes: Buffer;
  contentType: string;
  /** Upstream PDF URL when Delhivery returned a link instead of bytes. */
  sourceUrl: string | null;
  rawMeta: unknown | null;
};

/**
 * Official Delhivery Generate Shipping Label (packing slip PDF).
 * GET /api/p/packing_slip?wbns=…&pdf=true&pdf_size=4R
 * Docs sizes: 4R (4×6) | A4 (8×11). Default without pdf_size is A4.
 * @see https://one.delhivery.com/developer-portal/document/b2c/detail/generate-shipping-label
 */
export async function fetchDelhiveryShippingLabelPdf(
  waybill: string,
  pdfSize: DelhiveryLabelPdfSize = '4R'
): Promise<DelhiveryShippingLabelPdf> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }
  const wbn = waybill.trim();
  if (!wbn) throw ApiError.badRequest('Waybill is required');

  const size = pdfSize.trim() || '4R';
  const url =
    `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.packingSlip}` +
    `?wbns=${encodeURIComponent(wbn)}&pdf=true&pdf_size=${encodeURIComponent(size)}`;

  // Request PDF bytes explicitly (default client Accept is application/json).
  let res = await fetchDelhiveryGet(url, { accept: 'application/pdf,*/*' });
  let contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  let buf = Buffer.from(await res.arrayBuffer());

  // Some staging accounts ignore pdf_size — retry with pdf=true only.
  if (
    res.ok &&
    !contentType.includes('application/pdf') &&
    buf.slice(0, 4).toString('utf8') !== '%PDF'
  ) {
    const fallbackUrl =
      `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.packingSlip}` +
      `?wbns=${encodeURIComponent(wbn)}&pdf=true`;
    const retry = await fetchDelhiveryGet(fallbackUrl, { accept: 'application/pdf,*/*' });
    if (retry.ok) {
      res = retry;
      contentType = (retry.headers.get('content-type') ?? '').toLowerCase();
      buf = Buffer.from(await retry.arrayBuffer());
    }
  }

  if (!res.ok) {
    let delhivery: unknown = null;
    try {
      delhivery = JSON.parse(buf.toString('utf8'));
    } catch {
      delhivery = buf.toString('utf8').slice(0, 400);
    }
    throw ApiError.internal('Delhivery shipping label PDF API error', {
      status: res.status,
      delhivery,
    });
  }

  // Direct PDF body
  if (
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    buf.slice(0, 4).toString('utf8') === '%PDF'
  ) {
    return {
      waybill: wbn,
      pdfSize: size as DelhiveryLabelPdfSize,
      bytes: buf,
      contentType: 'application/pdf',
      sourceUrl: null,
      rawMeta: null,
    };
  }

  // JSON with PDF URL(s)
  let raw: unknown = null;
  try {
    raw = JSON.parse(buf.toString('utf8'));
  } catch {
    throw ApiError.internal('Delhivery shipping label returned non-PDF response', {
      contentType,
      body: buf.toString('utf8').slice(0, 400),
    });
  }

  const pdfUrl = extractPdfUrl(raw);
  if (!pdfUrl) {
    throw ApiError.internal(
      'Delhivery shipping label PDF not available for this waybill yet — try again after manifestation',
      { delhivery: raw }
    );
  }

  const pdfRes = await fetch(pdfUrl);
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  if (!pdfRes.ok || pdfBytes.length < 50) {
    throw ApiError.internal('Failed to download Delhivery shipping label PDF', {
      status: pdfRes.status,
      pdfUrl,
    });
  }

  return {
    waybill: wbn,
    pdfSize: size as DelhiveryLabelPdfSize,
    bytes: pdfBytes,
    contentType: 'application/pdf',
    sourceUrl: pdfUrl,
    rawMeta: raw,
  };
}
