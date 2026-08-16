import { medusa, authHeaders, ensureMedusaAuth } from "../medusa/client.js";
import { config } from "../config.js";
import { iterateAllProducts } from "../shopify/client.js";
import { mapProductCore, mapVariants } from "./mapper.js";
import { CategorySync } from "./categories.js";
import { writeInventoryLevel } from "./inventory.js";
import type { ShopifyProduct, SyncStats } from "../types.js";

interface RunOptions {
  updatedSince?: string | null;
  dryRun?: boolean;
}

/**
 * Looks up an existing Medusa product by the Shopify product ID we stamp
 * into `external_id` on create. This is what makes re-running the sync safe:
 * a product is only ever created once, every subsequent run updates it.
 */
async function findExistingProduct(shopifyProductId: string) {
  const { products } = await medusa.admin.product.list(
    { external_id: shopifyProductId, limit: 1, fields: "id,*variants,*variants.inventory_items" },
    authHeaders()
  );
  return products?.[0] ?? null;
}

/**
 * Matches Shopify variants to existing Medusa variants using the
 * `shopify_variant_id` we store in each variant's metadata on create.
 * Medusa's product API doesn't have a native "external ID" field at the
 * variant level (only at the product level), so metadata is the stable
 * join key across sync runs — matching on title/SKU alone breaks the
 * moment a merchant renames a variant in Shopify.
 */
function buildVariantIdMap(existingProduct: any): Map<string, string> {
  const map = new Map<string, string>();
  for (const variant of existingProduct?.variants ?? []) {
    const shopifyId = variant.metadata?.shopify_variant_id;
    if (shopifyId) {
      map.set(shopifyId, variant.id);
    }
  }
  return map;
}

async function upsertOne(
  shopifyProduct: ShopifyProduct,
  categorySync: CategorySync,
  stats: SyncStats,
  dryRun: boolean
) {
  const core = mapProductCore(shopifyProduct);
  const mappedVariants = mapVariants(shopifyProduct);
  const categoryIds = await categorySync.resolveMedusaCategoryIds(shopifyProduct.collections);

  const existing = await findExistingProduct(shopifyProduct.id);
  const variantIdMap = buildVariantIdMap(existing);

  const variantsPayload = mappedVariants.map((v) => {
    const medusaVariantId = variantIdMap.get(v.shopifyVariantId);
    return {
      ...(medusaVariantId ? { id: medusaVariantId } : {}),
      ...v.payload,
      metadata: { shopify_variant_id: v.shopifyVariantId },
    };
  });

  // Medusa v2.16+ removed 'options' from the product update endpoint.
  // It is only valid during product creation. Build two separate payloads.
  const sharedPayload = {
    title: core.title,
    handle: core.handle,
    description: core.description,
    status: core.status,
    images: core.images,
    thumbnail: core.thumbnail,
    categories: categoryIds.map((id) => ({ id })),
    variants: variantsPayload,
    ...(config.medusa.salesChannelId
      ? { sales_channels: [{ id: config.medusa.salesChannelId }] }
      : {}),
  };

  const createPayload = {
    ...sharedPayload,
    options: core.options,
    external_id: shopifyProduct.id,
  };

  let savedProduct: any;

  if (dryRun) {
    console.log(
      `[dry-run] Would ${existing ? "update" : "create"} "${core.title}" (${shopifyProduct.id}) with ${variantsPayload.length} variant(s), ${categoryIds.length} categor(y/ies)`
    );
    existing ? stats.productsUpdated++ : stats.productsCreated++;
    return;
  }

  if (existing) {
    const { product } = await medusa.admin.product.update(
      existing.id,
      sharedPayload,
      undefined,
      authHeaders()
    );
    savedProduct = product;
    stats.productsUpdated++;
  } else {
    const { product } = await medusa.admin.product.create(
      createPayload as any,
      undefined,
      authHeaders()
    );
    savedProduct = product;
    stats.productsCreated++;
  }

  // Inventory levels are a separate Medusa resource from the variant itself,
  // so they're written in a second pass keyed off the inventory_item_id that
  // Medusa auto-creates per variant when manage_inventory is true.
  for (const mapped of mappedVariants) {
    const savedVariant = (savedProduct.variants ?? []).find(
      (v: any) => v.metadata?.shopify_variant_id === mapped.shopifyVariantId
    );
    const inventoryItemId = savedVariant?.inventory_items?.[0]?.inventory_item_id;
    if (!inventoryItemId) continue;

    await writeInventoryLevel(inventoryItemId, mapped.quantity);
    stats.inventoryLevelsWritten++;
  }
}

export async function runSync(options: RunOptions = {}): Promise<SyncStats> {
  await ensureMedusaAuth();

  const stats: SyncStats = {
    productsSeen: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsFailed: 0,
    categoriesCreated: 0,
    inventoryLevelsWritten: 0,
    errors: [],
  };

  const categorySync = new CategorySync();

  for await (const shopifyProduct of iterateAllProducts(options.updatedSince)) {
    stats.productsSeen++;
    try {
      await upsertOne(shopifyProduct, categorySync, stats, !!options.dryRun);
    } catch (err: any) {
      stats.productsFailed++;
      stats.errors.push({
        shopifyProductId: shopifyProduct.id,
        message: err?.message ?? String(err),
      });
      console.error(`Failed to sync product ${shopifyProduct.id} (${shopifyProduct.title}):`, err);
    }
  }

  stats.categoriesCreated = categorySync.categoriesCreated;
  return stats;
}
