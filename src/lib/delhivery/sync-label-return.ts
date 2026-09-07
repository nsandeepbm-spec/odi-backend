import { getDelhiveryBaseUrl } from './config.js';
import { fetchDelhiveryPostJson } from './client.js';
import { delhiveryLabelAddressFromEnv } from './label-address.js';

/**
 * Delhivery stores return address on each waybill at manifestation time.
 * Empty return fields produce a long footer (address + hub city) that overlaps the order barcode.
 * POST /api/p/edit accepts return_* keys for Manifested / In Transit packages.
 */
export async function syncDelhiveryLabelReturnAddress(waybill: string): Promise<void> {
  const wbn = waybill.trim();
  if (!wbn) return;

  const label = delhiveryLabelAddressFromEnv();
  const url = `${getDelhiveryBaseUrl()}/api/p/edit`;
  const body = {
    waybill: wbn,
    return_add: label.returnAddress,
    return_city: label.returnCity,
    return_state: label.returnState,
    return_pin: label.returnPin,
    return_phone: label.returnPhone,
  };

  const res = await fetchDelhiveryPostJson(url, body);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[delhivery] label return-address sync failed', wbn, res.status, text.slice(0, 200));
    return;
  }

  try {
    const raw = (await res.json()) as { status?: boolean };
    if (raw.status !== true) {
      console.warn('[delhivery] label return-address sync rejected', wbn, raw);
    }
  } catch {
    // non-JSON success body — ignore
  }
}
