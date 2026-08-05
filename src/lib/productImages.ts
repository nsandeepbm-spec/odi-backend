import type { ProductImageRow } from '../modules/products/products.types.js';

export type ProductImageKind = 'card' | 'gallery';

export interface ProductImageView {
  id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  kind: ProductImageKind;
}

export interface ProductImagesBundle {
  card: ProductImageView | null;
  gallery: ProductImageView[];
  /** Flat list (card first, then gallery) for legacy clients */
  all: ProductImageView[];
}

export function normalizeImageKind(kind: string | undefined, isPrimary?: boolean): ProductImageKind {
  if (kind === 'card' || kind === 'gallery') return kind;
  return isPrimary ? 'card' : 'gallery';
}

export function toImageView(row: ProductImageRow & { kind?: string }): ProductImageView {
  return {
    id: row.id,
    url: row.url,
    alt: row.alt,
    sort_order: row.sort_order,
    kind: normalizeImageKind(row.kind, row.is_primary),
  };
}

/** Split DB rows into card hero + ordered gallery strip (e-commerce standard). */
export function bundleProductImages(rows: (ProductImageRow & { kind?: string })[]): ProductImagesBundle {
  const views = rows.map(toImageView);
  const card =
    views.find((i) => i.kind === 'card') ??
    views.find((i) => rows.find((r) => r.id === i.id)?.is_primary) ??
    views[0] ??
    null;

  const gallery = views
    .filter((i) => i.id !== card?.id && i.kind === 'gallery')
    .sort((a, b) => a.sort_order - b.sort_order);

  const all = card ? [card, ...gallery] : gallery;

  return { card, gallery, all };
}

export type ImageInput = {
  url: string;
  alt?: string | null;
  sort_order?: number;
  kind?: ProductImageKind;
  /** @deprecated use kind: 'card' */
  is_primary?: boolean;
};

/** Normalize admin payload → DB rows (exactly one card, gallery sorted). */
export function normalizeImageInputs(images: ImageInput[]) {
  if (images.length === 0) return [];

  let cardIndex = images.findIndex((i) => i.kind === 'card' || i.is_primary === true);
  if (cardIndex < 0) cardIndex = 0;

  const card = images[cardIndex];
  const gallery = images.filter((_, idx) => idx !== cardIndex);

  const rows: Array<{
    url: string;
    alt: string | null;
    sort_order: number;
    kind: ProductImageKind;
    is_primary: boolean;
  }> = [
    {
      url: card.url,
      alt: card.alt ?? null,
      sort_order: 0,
      kind: 'card',
      is_primary: true,
    },
  ];

  gallery.forEach((img, i) => {
    rows.push({
      url: img.url,
      alt: img.alt ?? null,
      sort_order: img.sort_order ?? i + 1,
      kind: 'gallery',
      is_primary: false,
    });
  });

  return rows;
}
