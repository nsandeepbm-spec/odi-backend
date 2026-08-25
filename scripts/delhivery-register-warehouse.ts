/// <reference types="node" />
/**
 * Register the pickup location (ClientWarehouse) under the account that owns the
 * active Delhivery token. Run: npm run delhivery:register-warehouse
 *
 * This is the fix for "ClientWarehouse matching query does not exist" — creating the
 * warehouse with the same token we ship with guarantees the account and environment match.
 * Pass --edit to update an existing warehouse instead of creating one.
 */
import {
  createDelhiveryWarehouse,
  editDelhiveryWarehouse,
  warehouseInputFromEnv,
} from '../src/lib/delhivery/warehouse.js';
import { env } from '../src/config/env.js';

const isEdit = process.argv.includes('--edit');

const input = warehouseInputFromEnv();

console.log('Delhivery env:', env.delhivery.environment, env.delhivery.accountType);
console.log('Base URL:', env.delhivery.baseUrl);
console.log('Mode:', isEdit ? 'edit existing' : 'create new');
console.log('Warehouse name:', input.name);
console.log('PIN:', input.pin, '| City:', input.city, '| State:', input.state);

try {
  const result = isEdit
    ? await editDelhiveryWarehouse(input)
    : await createDelhiveryWarehouse(input);

  console.log(`\n✅ Warehouse ${isEdit ? 'updated' : 'registered'}: ${result.name}`);
  console.log(JSON.stringify(result.raw, null, 2));
  console.log('\nNext: npm run test:delhivery-create');
} catch (err) {
  console.error(`\n❌ Warehouse ${isEdit ? 'edit' : 'registration'} failed`);
  if (err && typeof err === 'object' && 'details' in err) {
    console.error('Delhivery response:', JSON.stringify((err as { details?: unknown }).details, null, 2));
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
