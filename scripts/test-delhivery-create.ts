/// <reference types="node" />
/**
 * Smoke-test Delhivery shipment creation (staging/production from .env).
 * Run: npx tsx --env-file=.env scripts/test-delhivery-create.ts
 */
import { createDelhiveryShipment } from '../src/lib/delhivery/create-shipment.js';
import { env } from '../src/config/env.js';

const orderNumber = `ORD-SMOKE-${Date.now().toString(36).toUpperCase()}`;

console.log('Delhivery env:', env.delhivery.environment, env.delhivery.accountType);
console.log('Base URL:', env.delhivery.baseUrl);
console.log('Pickup location:', env.delhivery.pickupLocationName);
console.log('Order ref:', orderNumber);
if (env.delhivery.environment === 'production') {
  console.log('Note: production create issues a real AWB and may debit the live wallet.');
}

try {
  const result = await createDelhiveryShipment({
    orderNumber,
    // Avoid Delhivery ER0005 ("suspicious order/consignee") — all-9s / 9876543210 / "Test*" get blocked on live.
    consigneeName: 'Rahul Mehta',
    address: 'Flat 4B, Palm Residency, MG Road',
    pin: '122001',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    phone: '9810012345',
    paymentMode: 'Prepaid',
    totalAmountRupees: 1299,
    quantity: 1,
    productsDesc: 'ODI Kids Space Explorer Kit',
    lines: [
      {
        weight_grams: 500,
        length_cm: 25,
        width_cm: 20,
        height_cm: 5,
        quantity: 1,
      },
    ],
    waybill: '',
  });

  console.log('\n✅ Shipment created successfully');
  console.log('Waybill:', result.waybill);
  console.log('Package status:', result.packageStatus);
  console.log('Remarks:', result.remarks);
} catch (err) {
  console.error('\n❌ Shipment creation failed');
  if (err && typeof err === 'object' && 'details' in err) {
    console.error(JSON.stringify((err as { details?: unknown }).details, null, 2));
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
