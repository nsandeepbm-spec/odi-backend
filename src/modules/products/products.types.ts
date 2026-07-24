export type ProductStatus = 'draft' | 'live' | 'coming_soon' | 'archived';

export interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
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
  price_paise: number;
  compare_at_paise: number | null;
  stock_qty: number;
  status: ProductStatus;
  tag: string | null;
  features: string[];
  categories: string[];
  kit_contents: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithMeta extends ProductRow {
  images: ProductImageRow[];
  rating_avg: number;
  rating_count: number;
}
