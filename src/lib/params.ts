import { ApiError } from '../utils/ApiError.js';

/** Express 5 params can be string | string[]; normalize to a single string. */
export function param(value: string | string[] | undefined, name = 'id'): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || typeof v !== 'string') {
    throw ApiError.badRequest(`Missing route parameter: ${name}`);
  }
  return v;
}
