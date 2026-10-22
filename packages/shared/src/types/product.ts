/** Category or brand as a product shows it; archived ones still display (T-303). */
export interface ProductRef {
  id: string;
  name: string;
  archived: boolean;
}

/**
 * A product as services return it (T-303). No confidential fields (cost,
 * profit): the same DTO goes to OWNER and STAFF (CLAUDE.md rule 6).
 */
export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: ProductRef | null;
  brand: ProductRef | null;
  unitsPerBlock: number;
  /** Whole som for one piece (OQ-15). */
  salePrice: number;
  /** salePrice × unitsPerBlock. */
  blockPrice: number;
  /** Pieces, store-wide. */
  minStock: number;
  /** `YYYY-MM-DD`, information only (FR-1.1). */
  expiryDate: string | null;
  /** Opaque token that changes with every new image; null — no image. */
  imageVersion: string | null;
  archived: boolean;
  /** Pieces across the store's warehouses. */
  stockQty: number;
  /** FR-1.3: minStock > 0 and stockQty < minStock (business-logic §9). */
  lowStock: boolean;
}

export interface ProductPage {
  items: Product[];
  /** Rows matching the filters, all pages. */
  total: number;
  page: number;
  pageSize: number;
}
