import { env } from '../../config/env.js';

/** Strip a trailing city/state token from an address line (avoids duplicate on Delhivery labels). */
function stripTrailingToken(address: string, token: string | null | undefined): string {
  const base = address.trim();
  const t = token?.trim();
  if (!base || !t) return base;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return base.replace(new RegExp(`[,\\s-]*${escaped}\\s*$`, 'i'), '').trim();
}

export type DelhiveryLabelAddressFields = {
  sellerName: string;
  sellerAddress: string;
  returnAddress: string;
  returnCity: string;
  returnState: string;
  returnPin: string;
  returnPhone: string;
  returnCountry: string;
};

/**
 * Seller + return address fields for Delhivery shipment create and warehouse register.
 * Keeps return_add short (street only) so the label footer does not overlap the order barcode.
 */
export function delhiveryLabelAddressFromEnv(): DelhiveryLabelAddressFields {
  const wh = env.delhivery.warehouse;
  const pickupName = env.delhivery.pickupLocationName?.trim() || 'ODI';

  const sellerName = wh.registeredName?.trim() || pickupName;
  const sellerAddress = wh.address?.trim() || '';

  const returnCity = wh.returnCity?.trim() || wh.city?.trim() || '';
  const returnState = wh.returnState?.trim() || wh.state?.trim() || '';
  const returnPin = (wh.returnPin?.trim() || env.delhivery.originPin?.trim() || '').replace(/\D/g, '');
  const returnPhone = wh.phone?.replace(/\D/g, '').slice(-10) || '';
  const returnCountry = wh.returnCountry?.trim() || 'India';

  let returnAddress = wh.returnAddress?.trim() || sellerAddress;
  returnAddress = stripTrailingToken(returnAddress, returnCity);
  returnAddress = stripTrailingToken(returnAddress, returnState);
  if (!returnAddress) returnAddress = sellerAddress.slice(0, 120);

  return {
    sellerName: sellerName.slice(0, 80),
    sellerAddress: sellerAddress.slice(0, 200),
    returnAddress: returnAddress.slice(0, 200),
    returnCity: returnCity.slice(0, 80),
    returnState: returnState.slice(0, 80),
    returnPin: returnPin.slice(0, 6),
    returnPhone,
    returnCountry: returnCountry.slice(0, 40),
  };
}
