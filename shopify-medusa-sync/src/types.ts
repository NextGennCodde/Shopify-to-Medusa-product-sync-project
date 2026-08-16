// Minimal shapes of the Shopify GraphQL data we actually consume.
// Deliberately narrow (not the full Shopify schema) so the mapper stays simple
// and it's obvious at a glance what this sync depends on.

export interface ShopifyImage {
  url: string;
  altText: string | null;
}

export interface ShopifySelectedOption {
  name: string;
  value: string;
}

export interface ShopifyVariant {
  id: string; // gid://shopify/ProductVariant/...
  title: string;
  sku: string | null;
  price: string; // Shopify returns prices as decimal strings, e.g. "19.99"
  inventoryQuantity: number | null;
  selectedOptions: ShopifySelectedOption[];
  inventoryItem: {
    id: string;
  } | null;
}

export interface ShopifyOption {
  name: string;
  values: string[];
}

export interface ShopifyCollection {
  id: string;
  title: string;
}

export interface ShopifyProduct {
  id: string; // gid://shopify/Product/...
  title: string;
  handle: string;
  descriptionHtml: string | null;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  images: ShopifyImage[];
  options: ShopifyOption[];
  variants: ShopifyVariant[];
  collections: ShopifyCollection[];
  updatedAt: string;
}

export interface ShopifyProductPage {
  products: ShopifyProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
}

// A single, flattened "inventory instruction" the sync produces per variant,
// consumed separately from product create/update since Medusa inventory
// levels are a distinct resource from the product/variant itself.
export interface InventoryInstruction {
  shopifyVariantId: string;
  medusaVariantId: string;
  quantity: number;
}

export interface SyncStats {
  productsSeen: number;
  productsCreated: number;
  productsUpdated: number;
  productsFailed: number;
  categoriesCreated: number;
  inventoryLevelsWritten: number;
  errors: { shopifyProductId: string; message: string }[];
}
