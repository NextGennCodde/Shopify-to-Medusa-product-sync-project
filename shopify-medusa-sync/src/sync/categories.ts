import { medusa, authHeaders } from "../medusa/client.js";
import type { ShopifyCollection } from "../types.js";

/**
 * Shopify collections and Medusa categories aren't a 1:1 concept (Shopify
 * also has "smart" rule-based collections), but for sync purposes we treat
 * every Shopify collection a product belongs to as a flat Medusa category
 * with the same name. That's the simplest mapping that satisfies "sync
 * categories" without inventing a hierarchy Shopify doesn't expose to us.
 *
 * Categories are cached in-memory for the life of one sync run, since the
 * same collection shows up across many products and we don't want to
 * re-query/re-create it every time.
 */
export class CategorySync {
  private cache = new Map<string, string>(); // shopify collection id -> medusa category id
  private createdCount = 0;

  get categoriesCreated() {
    return this.createdCount;
  }

  async resolveMedusaCategoryIds(collections: ShopifyCollection[]): Promise<string[]> {
    const ids: string[] = [];
    for (const collection of collections) {
      const id = await this.resolveOne(collection);
      ids.push(id);
    }
    return ids;
  }

  private async resolveOne(collection: ShopifyCollection): Promise<string> {
    const cached = this.cache.get(collection.id);
    if (cached) return cached;

    const existing = await medusa.admin.productCategory.list(
      { q: collection.title, limit: 1 },
      authHeaders()
    );

    const match = existing.product_categories?.find(
      (c: any) => c.name.toLowerCase() === collection.title.toLowerCase()
    );

    if (match) {
      this.cache.set(collection.id, match.id);
      return match.id;
    }

    const created = await medusa.admin.productCategory.create(
      {
        name: collection.title,
        is_active: true,
      },
      undefined,
      authHeaders()
    );

    this.createdCount += 1;
    this.cache.set(collection.id, created.product_category.id);
    return created.product_category.id;
  }
}
