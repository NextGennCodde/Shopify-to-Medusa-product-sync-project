import fetch from "node-fetch";
import { config } from "../config.js";
import { PRODUCTS_QUERY } from "./queries.js";
import type {
  ShopifyProduct,
  ShopifyProductPage,
} from "../types.js";

const ENDPOINT = `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a single GraphQL request to Shopify, retrying on throttling.
 * Shopify's Admin GraphQL API uses a "leaky bucket" cost model rather than a
 * fixed requests-per-second cap, so we back off based on the throttle status
 * Shopify returns in `extensions.cost`, instead of guessing a fixed delay.
 */
async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  attempt = 1
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.shopify.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429) {
    if (attempt > 5) {
      throw new Error("Shopify GraphQL: exceeded retry budget after repeated 429s");
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 1;
    await sleep(retryAfter * 1000);
    return shopifyGraphQL<T>(query, variables, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify GraphQL request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL returned errors: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }

  // Proactively pace ourselves if we're close to the throttle limit, rather
  // than waiting to get a 429 back. Cheap insurance for large catalogs.
  const throttle = json.extensions?.cost?.throttleStatus;
  if (throttle && throttle.currentlyAvailable < 200) {
    const waitMs = Math.ceil((200 - throttle.currentlyAvailable) / Math.max(throttle.restoreRate, 1)) * 1000;
    await sleep(Math.min(waitMs, 5000));
  }

  if (!json.data) {
    throw new Error("Shopify GraphQL response had no data");
  }

  return json.data;
}

interface ProductsQueryResult {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: any }[];
  };
}

function normalizeProduct(node: any): ShopifyProduct {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    descriptionHtml: node.descriptionHtml,
    status: node.status,
    updatedAt: node.updatedAt,
    images: node.images.edges.map((e: any) => ({
      url: e.node.url,
      altText: e.node.altText,
    })),
    options: node.options.map((o: any) => ({
      name: o.name,
      values: o.values,
    })),
    collections: node.collections.edges.map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
    })),
    variants: node.variants.edges.map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      sku: e.node.sku,
      price: e.node.price,
      inventoryQuantity: e.node.inventoryQuantity,
      selectedOptions: e.node.selectedOptions,
      inventoryItem: e.node.inventoryItem,
    })),
  };
}

/**
 * Fetches a single page of products.
 *
 * @param after Cursor to resume from (for pagination).
 * @param updatedSince If provided, only products updated after this ISO date
 *   are returned — used for incremental syncs so re-runs don't re-process the
 *   entire catalog every time.
 */
export async function fetchProductsPage(
  after: string | null,
  updatedSince?: string | null
): Promise<ShopifyProductPage> {
  const searchQuery = updatedSince ? `updated_at:>='${updatedSince}'` : null;

  const data = await shopifyGraphQL<ProductsQueryResult>(PRODUCTS_QUERY, {
    first: config.sync.pageSize,
    after,
    query: searchQuery,
  });

  return {
    products: data.products.edges.map((e) => normalizeProduct(e.node)),
    hasNextPage: data.products.pageInfo.hasNextPage,
    endCursor: data.products.pageInfo.endCursor,
  };
}

/** Generator that yields every product, page by page, handling cursors internally. */
export async function* iterateAllProducts(
  updatedSince?: string | null
): AsyncGenerator<ShopifyProduct> {
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page: ShopifyProductPage = await fetchProductsPage(after, updatedSince);
    for (const product of page.products) {
      yield product;
    }
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }
}
