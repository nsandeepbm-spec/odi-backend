/// <reference types="node" />
/**
 * Smoke-test Delhivery pickup request (staging/production from .env).
 * Run: npm run test:delhivery-pickup
 *
 * Does not create a shipment — pickup only, matching B2C curl:
 * POST /fm/request/new/  { pickup_location, expected_package_count, pickup_date, pickup_time }
 */
import { defaultPickupSchedule, requestDelhiveryPickup } from '../src/lib/delhivery/request-pickup.js';
import { env } from '../src/config/env.js';

const schedule = defaultPickupSchedule();

console.log('Delhivery env:', env.delhivery.environment, env.delhivery.accountType);
console.log('Base URL:', env.delhivery.baseUrl);
console.log('Pickup location:', env.delhivery.pickupLocationName);
console.log('Date / time:', schedule.pickupDate, schedule.pickupTime);

try {
  const result = await requestDelhiveryPickup({
    pickupDate: schedule.pickupDate,
    pickupTime: schedule.pickupTime,
    expectedPackageCount: 1,
  });

  console.log('\n✅ Pickup request created');
  console.log('Pickup ID:', result.pickupId);
  console.log(JSON.stringify(result.raw, null, 2));
} catch (err) {
  console.error('\n❌ Pickup request failed');
  console.error(err);
  process.exit(1);
}
