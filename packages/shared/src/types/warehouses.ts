/** A sub-warehouse as the warehouses page shows it (T-304). */
export interface SubWarehouseItem {
  id: string;
  warehouseId: string;
  name: string;
  archived: boolean;
  /** Some product has qty > 0 here — archiving is refused (ENTITY_NOT_EMPTY). */
  hasStock: boolean;
}

/** A warehouse with all of its sub-warehouses (archived ones too), sorted by name. */
export interface WarehouseItem {
  id: string;
  name: string;
  archived: boolean;
  /** Any of its sub-warehouses has stock. */
  hasStock: boolean;
  subWarehouses: SubWarehouseItem[];
}

/**
 * What document forms offer (purchase, sale, stock count): active warehouses
 * with their active sub-warehouses only.
 */
export interface WarehouseOption {
  id: string;
  name: string;
  subWarehouses: { id: string; name: string }[];
}
