/** A category or brand as services return it (T-302). */
export interface CatalogItem {
  id: string;
  name: string;
  archived: boolean;
  /** Products (archived ones too) that reference the item. */
  productCount: number;
}
