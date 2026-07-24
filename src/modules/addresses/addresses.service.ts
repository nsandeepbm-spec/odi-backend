import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';

export class AddressesService {
  async list(userId: string) {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async getOwned(userId: string, id: string) {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  private async clearDefault(userId: string) {
    await supabase
      .from('user_addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true);
  }

  async create(userId: string, input: Record<string, unknown>) {
    if (input.is_default) await this.clearDefault(userId);

    const { data, error } = await supabase
      .from('user_addresses')
      .insert({ ...input, user_id: userId })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async update(userId: string, id: string, patch: Record<string, unknown>) {
    const existing = await this.getOwned(userId, id);
    if (!existing) throw ApiError.notFound('Address not found');

    if (patch.is_default === true) await this.clearDefault(userId);

    const { data, error } = await supabase
      .from('user_addresses')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async remove(userId: string, id: string) {
    const existing = await this.getOwned(userId, id);
    if (!existing) throw ApiError.notFound('Address not found');

    const { error } = await supabase
      .from('user_addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

export const addressesService = new AddressesService();
