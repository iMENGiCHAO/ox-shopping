/* Shared seed item types (imported by demo-catalog.ts and seed.ts) */
export interface CategorySeedX {
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  image: string;
  sortOrder: number;
}

export interface ProductSeedX {
  name: string;
  nameEn: string;
  slug: string;
  sku: string;
  categorySlug: string;
  price: number;
  stock: number;
  soldCount: number;
  isPresale: boolean;
  images: string[];
  attributes: { name: string; values: string[]; selectable?: boolean; soldOutValues?: string[] }[];
  description: string;
}
