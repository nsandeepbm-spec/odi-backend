export function clampPage(page: unknown, fallback = 1): number {
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

export function clampPerPage(perPage: unknown, fallback = 20, max = 100): number {
  const n = Number(perPage);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function paginationMeta(total: number, page: number, perPage: number) {
  return {
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}
