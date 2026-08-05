export type ProductStatus = 'draft' | 'live' | 'coming_soon' | 'archived';

export type ProductImageKind = 'card' | 'gallery';

export interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
  kind: ProductImageKind;
  created_at: string;
}

export interface ProductImagesBundle {
  card: Pick<ProductImageRow, 'id' | 'url' | 'alt' | 'sort_order' | 'kind'> | null;
  gallery: Array<Pick<ProductImageRow, 'id' | 'url' | 'alt' | 'sort_order' | 'kind'>>;
  all: Array<Pick<ProductImageRow, 'id' | 'url' | 'alt' | 'sort_order' | 'kind'>>;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  volume: string | null;
  description: string | null;
  long_description: string | null;
  author: string | null;
  publisher: string | null;
  language: string | null;
  age_range: string | null;
  pages: number | null;
  publisher_bio: string | null;
  author_bio: string | null;
  editorial_review: string | null;
  editorial_review_author: string | null;
  editorial_review_rating: number | null;
  price_paise: number;
  compare_at_paise: number | null;
  stock_qty: number;
  status: ProductStatus;
  tag: string | null;
  is_featured: boolean;
  features: string[];
  categories: string[];
  kit_contents: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithMeta extends ProductRow {
  images: ProductImageRow[];
  /** Structured for storefront: hero + gallery strip */
  media: ProductImagesBundle;
  rating_avg: number;
  rating_count: number;
}
