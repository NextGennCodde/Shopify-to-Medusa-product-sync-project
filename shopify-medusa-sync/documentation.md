# Shopify to MedusaJS Product Sync — Comprehensive Workflow & System Documentation

Welcome to the **Shopify-to-MedusaJS Product Synchronization System**. This documentation provides an in-depth walkthrough of the sync project architecture, workflow execution, data mappings, and a complete breakdown of every file in the codebase.

---

## 1. Executive Summary & Architecture Overview

This project bridges **Shopify Admin GraphQL API** and **MedusaJS v2 Engine API** to keep product catalogs seamlessly synchronized. It is engineered with idempotency, rate-limit resilience, and incremental sync capabilities.

### Key Capabilities
- **Product Details & Metadata**: Syncs titles, handles, HTML descriptions, publication status (`ACTIVE` -> `published`, `DRAFT`/`ARCHIVED` -> `draft`), images, options (e.g. Size, Color), and thumbnail selections.
- **Variants & Pricing**: Syncs complex multi-option variants, SKUs, and prices (converted to Medusa v2 decimal floats for specified currency codes).
- **Categories**: Converts Shopify Collections into Medusa Product Categories with in-memory request caching per execution run.
- **Inventory Levels**: Links variant stock quantities to Medusa Stock Locations using Medusa’s batch location level upsert endpoint.
- **Idempotent Upserts**: Stamp Medusa products with Shopify's GraphQL ID (`external_id`) and variants with `metadata.shopify_variant_id`. Re-running the sync updates existing records rather than creating duplicates.
- **Incremental Synchronization**: Stores execution timestamps in `sync-state.json` to query only products updated in Shopify since the last sync run (`updated_at:>=`).

```
                              +--------------------------+
                              |   Shopify GraphQL API    |
                              +------------+-------------+
                                           |
                                  (GraphQL Queries)
                                           v
                              +--------------------------+
                              |  src/shopify/client.ts   |
                              |   (Rate-limit aware)     |
                              +------------+-------------+
                                           |
                                   (Async Generator)
                                           v
+--------------------------+  +--------------------------+  +--------------------------+
|   src/sync/categories.ts | <|     src/sync/run.ts      |> |   src/sync/inventory.ts  |
|  (Collection -> Category)|  |    (Sync Orchestrator)   |  | (Location level stock)   |
+--------------------------+  +------------+-------------+  +--------------------------+
                                           |
                                  (Mapped Payloads)
                                           v
                              +--------------------------+
                              |  src/medusa/client.ts    |
                              |   (@medusajs/js-sdk)     |
                              +------------+-------------+
                                           |
                                (Admin REST / SDK calls)
                                           v
                              +--------------------------+
                              |   Medusa v2 Engine API   |
                              +--------------------------+
```

---

## 2. Complete Step-by-Step Setup Guide

### Prerequisites
- Node.js `>= 18.0.0`
- NPM / PNPM / YARN
- A Shopify Store with a Custom App created in **Settings > Apps and integrations > Develop apps** with `read_products` scope.
- A running Medusa v2 server (Local instance or deployed on Medusa Cloud).

### Installation & Configuration

1. **Clone / Navigate to workspace & Install dependencies**:
   ```bash
   cd shopify-medusa-sync
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. **Fill in `.env` variables**:
   ```env
   # Shopify Store Domain & Admin API Token
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   SHOPIFY_API_VERSION=2025-01

   # Medusa v2 Server Credentials
   MEDUSA_BACKEND_URL=http://localhost:9000
   MEDUSA_ADMIN_EMAIL=admin@medusajs.com
   MEDUSA_ADMIN_PASSWORD=supersecret

   # Optional Overrides
   MEDUSA_STOCK_LOCATION_ID=
   MEDUSA_SALES_CHANNEL_ID=
   DEFAULT_CURRENCY_CODE=usd
   ```

4. **Compile & Run**:
   - **Incremental Sync**: `npm run sync`
   - **Full Re-Sync**: `npm run sync:full`
   - **Dry Run (Simulation)**: `npm run sync:dry-run`
   - **Production Build**: `npm run build`

---

## 3. File-by-File Codebase Walkthrough

Here is an explicit breakdown of what every file does in `src/`:

### 3.1 `src/config.ts` — Environment Configuration & Validation
- **Purpose**: Loads `.env` via `dotenv` and exposes a central strongly-typed `config` object.
- **Key Functions**:
  - `required(name, value)`: Helper that throws an explicit error if a mandatory environment variable is missing.
  - `assertMedusaAuthConfigured()`: Verifies that either a `MEDUSA_API_TOKEN` or `MEDUSA_ADMIN_EMAIL` + `MEDUSA_ADMIN_PASSWORD` pair is present.

### 3.2 `src/types.ts` — TypeScript Type Definitions
- **Purpose**: Defines standard data contracts between Shopify, Medusa, and the Sync engine.
- **Key Interfaces**:
  - `ShopifyProduct`, `ShopifyVariant`, `ShopifyImage`, `ShopifyCollection`: Minimal representation of incoming GraphQL responses.
  - `InventoryInstruction`: Internal model pairing variant IDs with stock quantities.
  - `SyncStats`: Tracks overall sync statistics (`productsSeen`, `productsCreated`, `productsUpdated`, `categoriesCreated`, `inventoryLevelsWritten`, `errors`).

### 3.3 `src/shopify/queries.ts` — GraphQL Queries
- **Purpose**: Holds `PRODUCTS_QUERY` string for querying Shopify's Admin GraphQL API.
- **Key Details**:
  - Fetches product fields (`id`, `title`, `handle`, `descriptionHtml`, `status`, `updatedAt`).
  - Fetches up to 10 images (`url`, `altText`).
  - Fetches product `options` (e.g., Size, Color) and `collections` (title, ID).
  - Fetches up to 100 variants per product with `price`, `inventoryQuantity`, `selectedOptions`, and `inventoryItem.id`.

### 3.4 `src/shopify/client.ts` — Shopify API Client & Rate-Limit Handler
- **Purpose**: Communicates with Shopify GraphQL API with pagination and leaky-bucket throttling.
- **Key Features**:
  - `shopifyGraphQL<T>()`: Low-level POST request handler. Parses `extensions.cost.throttleStatus` returned by Shopify. If available points drop below 200, it automatically sleeps to prevent HTTP 429 errors. Handles retries if HTTP 429 occurs.
  - `fetchProductsPage()`: Fetches a single page of products, supporting cursor-based pagination (`after`) and date filtering (`updatedSince`).
  - `iterateAllProducts()`: An **Async Generator** (`async generator*`) yielding products one by one across paginated requests.

### 3.5 `src/medusa/client.ts` — Medusa JS SDK Initialization
- **Purpose**: Initializes `@medusajs/js-sdk` client for Medusa v2.
- **Key Details**:
  - Exports `medusa` SDK instance configured with `baseUrl`.
  - `ensureMedusaAuth()`: Authenticates admin credentials via `medusa.auth.login("user", "emailpass", ...)` if an explicit API token was not provided in `.env`.
  - `authHeaders()`: Formats Authorization headers (`Bearer <token>`) required by Medusa API calls.

### 3.6 `src/sync/mapper.ts` — Shopify to Medusa Payload Transformation
- **Purpose**: Contains pure mapping functions translating Shopify GraphQL nodes into Medusa v2 creation/update structures.
- **Key Mappings**:
  - **Price Handling (`toMedusaAmount`)**: Medusa v2 accepts actual decimal floats (`14.99` for $14.99). Shopify provides string numbers (`"14.99"`). `toMedusaAmount` parses the string without multiplying by 100 (unlike Medusa v1).
  - **Variant Option Mapping (`mapVariantOptionValues`)**: Converts Shopify `selectedOptions` array into `{ Size: "Large", Color: "Red" }` dictionary format expected by Medusa variants.
  - `mapProductCore()`: Transforms main product fields and status (`ACTIVE` -> `published`, draft otherwise).
  - `mapVariants()`: Transforms variant list into Medusa variant payload format.

### 3.7 `src/sync/categories.ts` — Category Synchronization
- **Purpose**: Maps Shopify Collections to Medusa Product Categories.
- **Class `CategorySync`**:
  - Maintained as a class with an internal in-memory `cache: Map<shopifyCollectionId, medusaCategoryId>`.
  - `resolveMedusaCategoryIds()`: Queries existing Medusa categories by collection title.
  - If a matching category exists in Medusa, returns its ID. If not found, creates a new Medusa `productCategory` with `is_active: true` and caches the ID.

### 3.8 `src/sync/inventory.ts` — Stock Location & Inventory Sync
- **Purpose**: Updates variant inventory levels in Medusa stock locations.
- **Key Functions**:
  - `resolveStockLocationId()`: Resolves target Medusa stock location. Uses `MEDUSA_STOCK_LOCATION_ID` if specified in `.env`, or fetches the first available stock location from `medusa.admin.stockLocation.list()`.
  - `writeInventoryLevel(inventoryItemId, quantity)`: Calls `medusa.admin.inventoryItem.batchInventoryItemLocationLevels()` using the `create` array. Medusa treats `(inventory_item_id, location_id)` pairs as an upsert, safely updating stock quantities across repeated runs.

### 3.9 `src/sync/run.ts` — Sync Orchestrator
- **Purpose**: Main execution loop tying together Shopify fetching, mapping, category resolution, Medusa upserting, and inventory writing.
- **Key Workflow**:
  1. Calls `ensureMedusaAuth()`.
  2. Iterates products yielded by `iterateAllProducts()`.
  3. `findExistingProduct()`: Queries Medusa by `external_id == shopifyProduct.id`.
  4. `buildVariantIdMap()`: Maps existing Medusa variants by reading `variant.metadata.shopify_variant_id`.
  5. Assembles `basePayload`. If product exists, calls `medusa.admin.product.update()`. If new, calls `medusa.admin.product.create()` with `external_id`.
  6. In a second pass, retrieves variant `inventory_item_id` and calls `writeInventoryLevel()` for each variant.
  7. Tracks stats and handles individual product errors without crashing the main loop.

### 3.10 `src/index.ts` — CLI Entrypoint & State File Management
- **Purpose**: Parses CLI arguments (`--full`, `--dry-run`), manages state in `sync-state.json`, and invokes `runSync()`.
- **State Logic**:
  - Reads `sync-state.json` to find `lastRunAt` timestamp.
  - When `--full` is absent and `lastRunAt` exists, runs incremental sync fetching only items updated since `lastRunAt`.
  - Saves new ISO timestamp upon successful completion.

---

## 4. Field Mapping Matrix

| Data Concept | Shopify GraphQL Source | MedusaJS v2 Target | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| **Product External ID** | `product.id` | `product.external_id` | Stamp ID (`gid://shopify/Product/...`) for exact match on re-syncs |
| **Title** | `product.title` | `product.title` | Direct pass-through |
| **Handle** | `product.handle` | `product.handle` | Direct pass-through |
| **Description** | `product.descriptionHtml` | `product.description` | Direct HTML string pass-through |
| **Status** | `product.status` | `product.status` | `ACTIVE` -> `published`, `DRAFT`/`ARCHIVED` -> `draft` |
| **Images** | `product.images[].url` | `product.images[].url` | Array of image URLs |
| **Thumbnail** | `product.images[0].url` | `product.thumbnail` | First image URL or `null` |
| **Options** | `product.options[].name/values` | `product.options[].title/values` | Product option definitions (e.g. Size, Color) |
| **Collections / Categories** | `product.collections[].title` | `product.categories[].id` | Linked via `CategorySync` lookup/create |
| **Variant Metadata** | `variant.id` | `variant.metadata.shopify_variant_id` | Join key for variant updates across syncs |
| **Variant SKU** | `variant.sku` | `variant.sku` | Direct pass-through |
| **Variant Price** | `variant.price` | `variant.prices[].amount` | String `"19.99"` -> float `19.99` with `currency_code` |
| **Variant Options** | `variant.selectedOptions` | `variant.options` | Array converted to key-value object |
| **Inventory Quantity** | `variant.inventoryQuantity` | `inventory_level.stocked_quantity` | Written to resolved Stock Location via batch endpoint |

---

## 5. Execution Summary & Command Reference

| Command | Purpose | When to Use |
| :--- | :--- | :--- |
| `npm run sync` | Incremental sync based on `sync-state.json` timestamp | Daily scheduled cron job or manual update |
| `npm run sync:full` | Full re-sync bypassing state timestamp | Initial sync run or complete catalog audit |
| `npm run sync:dry-run` | Simulation run (reads Shopify, logs payload, skips writes) | Verification before deploying structural updates |
| `npm run build` | Compiles TypeScript into `dist/` | Production deployment |

---

## 6. Extending the System

1. **Real-time Webhooks**:
   Instead of scheduled CLI polling, attach `runSync()` logic to Shopify Webhooks (`products/create`, `products/update`).
2. **Deletion Sync**:
   Add a webhooks listener for `products/delete` to archive or unpublish corresponding Medusa products matching `external_id`.
3. **Multi-Currency & Multi-Location**:
   Extend `mapVariants` to iterate across Shopify Market price lists and map location inventory levels to specific Medusa Stock Locations.
