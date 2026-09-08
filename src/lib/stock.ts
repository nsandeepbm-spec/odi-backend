import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();
  return code === '42883' || message.includes('does not exist') || message.includes('could not find the function');
}

/** Atomically subtract qty. Requires `decrement_product_stock` in schema.sql (run on existing DBs). */
export async function decrementProductStock(productId: string, qty: number): Promise<void> {
  const { error } = await supabase.rpc('decrement_product_stock', {
    p_product_id: productId,
    p_qty: qty,
  });
  if (!error) return;

  if (!isMissingRpc(error)) {
    throw ApiError.badRequest(
      /insufficient/i.test(error.message ?? '')
        ? 'Insufficient stock for one or more items'
        : error.message || 'Could not update stock'
    );
  }

  const { data: product, error: readErr } = await supabase
    .from('products')
    .select('stock_qty')
    .eq('id', productId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!product || product.stock_qty < qty) {
    throw ApiError.badRequest('Insufficient stock for one or more items');
  }
  const { data: saved, error: updErr } = await supabase
    .from('products')
    .update({ stock_qty: product.stock_qty - qty })
    .eq('id', productId)
    .gte('stock_qty', qty)
    .select('id')
    .maybeSingle();
  if (updErr) throw updErr;
  if (!saved) throw ApiError.badRequest('Insufficient stock for one or more items');
}

export async function incrementProductStock(productId: string, qty: number): Promise<void> {
  const { error } = await supabase.rpc('increment_product_stock', {
    p_product_id: productId,
    p_qty: qty,
  });
  if (!error) return;

  if (!isMissingRpc(error)) {
    throw ApiError.badRequest(error.message || 'Could not restore stock');
  }

  const { data: product, error: readErr } = await supabase
    .from('products')
    .select('stock_qty')
    .eq('id', productId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!product) return;
  const { data: saved, error: updErr } = await supabase
    .from('products')
    .update({ stock_qty: product.stock_qty + qty })
    .eq('id', productId)
    .select('id')
    .maybeSingle();
  if (updErr) throw updErr;
  if (!saved) throw ApiError.badRequest('Could not restore product stock');
}

export async function applyStockDeltaForOrder(orderId: string, direction: 'decrement' | 'increment') {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId);
  if (error) throw error;

  for (const item of items ?? []) {
    if (!item.product_id || !item.quantity) continue;
    if (direction === 'decrement') {
      await decrementProductStock(item.product_id, item.quantity);
    } else {
      await incrementProductStock(item.product_id, item.quantity);
    }
  }
}
