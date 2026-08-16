import { config } from "../config.js";
import type { ShopifyProduct, ShopifyVariant } from "../types.js";

/**
 * Medusa v2 stores prices as the actual decimal amount for the currency
 * (e.g. 14.99 for $14.99) — NOT smallest-unit integers like Medusa v1 did
 * (where 14.99 USD was stored as 1499). Shopify's GraphQL `price` field is
 * already a decimal string like "14.99", so this is a straight parseFloat,
 * deliberately with no *100 anywhere in this file.
 */
function toMedusaAmount(shopifyPrice: string): number {
  const amount = Number.parseFloat(shopifyPrice);
  if (Number.isNaN(amount)) {
    throw new Error(`Could not parse Shopify price "${shopifyPrice}" as a number`);
  }
  return amount;
}

function mapStatus(shopifyStatus: ShopifyProduct["status"]): "draft" | "published" {
  return shopifyStatus === "ACTIVE" ? "published" : "draft";
}

/**
 * Medusa options are shared across all of a product's variants and each
 * variant selects one value per option (e.g. { Size: "M", Color: "Blue" }).
 * Shopify's `selectedOptions` on each variant already gives us that
 * per-variant mapping directly, so this is mostly a pass-through — the only
 * translation needed is turning the array into the { OptionName: value }
 * record shape Medusa's create/update variant payloads expect.
 */
function mapVariantOptionValues(variant: ShopifyVariant): Record<string, string> {
  const result: Record<string, string> = {};
  for (const opt of variant.selectedOptions) {
    result[opt.name] = opt.value;
  }
  return result;
}

export interface MappedVariant {
  shopifyVariantId: string;
  shopifyInventoryItemId: string | null;
  quantity: number;
  payload: {
    title: string;
    sku: string | null;
    options: Record<string, string>;
    manage_inventory: boolean;
    prices: { currency_code: string; amount: number }[];
  };
}

export function mapVariants(product: ShopifyProduct): MappedVariant[] {
  return product.variants.map((variant) => ({
    shopifyVariantId: variant.id,
    shopifyInventoryItemId: variant.inventoryItem?.id ?? null,
    quantity: variant.inventoryQuantity ?? 0,
    payload: {
      title: variant.title,
      sku: variant.sku,
      options: mapVariantOptionValues(variant),
      manage_inventory: true,
      prices: Array.from(
        new Set([config.sync.defaultCurrencyCode, "eur", "usd"])
      ).map((code) => ({
        currency_code: code,
        amount: toMedusaAmount(variant.price),
      })),
    },
  }));
}

export interface MappedProduct {
  externalId: string;
  title: string;
  handle: string;
  description: string | null;
  status: "draft" | "published";
  images: { url: string }[];
  thumbnail: string | null;
  options: { title: string; values: string[] }[];
}

export function mapProductCore(product: ShopifyProduct): MappedProduct {
  return {
    externalId: product.id,
    title: product.title,
    handle: product.handle,
    description: product.descriptionHtml,
    status: mapStatus(product.status),
    images: product.images.map((img) => ({ url: img.url })),
    thumbnail: product.images[0]?.url ?? null,
    options: product.options.map((o) => ({ title: o.name, values: o.values })),
  };
}
