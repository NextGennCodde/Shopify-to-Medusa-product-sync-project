# Shopify → MedusaJS Product Sync

Syncs products from a Shopify store into a Medusa v2 store: title, description,
status, images, options, variants, prices, categories (from Shopify
collections), and inventory quantities. Safe to run repeatedly — it upserts
rather than duplicating products or variants on re-runs.

## Setup

```bash
npm install
cp .env.example .env   # fill in your Shopify + Medusa credentials
```

Run it:

```bash
npm run sync            # incremental sync (see below)
npm run sync:full       # full re-sync of every product
npm run sync:dry-run    # logs what it would do, writes nothing
```

## How it works

```
src/
  shopify/
    queries.ts   GraphQL query for products (title, images, options,
                 variants, prices, inventory, collections)
    client.ts    GraphQL client — pagination + Shopify's leaky-bucket
                 rate-limit handling, exposed as an async generator so the
                 sync loop doesn't need to think about cursors
  medusa/
    client.ts    Medusa Admin SDK setup (API token or email/password auth)
  sync/
    mapper.ts    Shopify product/variant -> Medusa create/update payload
    categories.ts  Shopify collections -> Medusa product categories,
                    with an in-memory cache per run
    inventory.ts    Writes stock levels to a Medusa stock location
    run.ts          Orchestrates the above: fetch -> find-or-create ->
                     upsert -> write inventory, per product
  index.ts        CLI entry point: arg parsing, incremental-sync state
```

### How updates are handled (no duplicate products/variants)

- **Products**: on first sync, each Medusa product is created with
  `external_id` set to the Shopify product's GraphQL ID. Every later run
  looks up the product by that `external_id` first — if found, it's updated
  in place; if not, it's created. This is what makes the sync idempotent.
- **Variants**: Medusa's product API doesn't expose an external-ID field at
  the variant level, only at the product level. To still match variants
  reliably across runs (not just by title/SKU, which breaks the moment
  someone renames a variant in Shopify), each variant is created with
  `metadata.shopify_variant_id` set. On update, existing variants are looked
  up by that metadata field and their Medusa `id` is included in the update
  payload, so Medusa updates the existing variant instead of creating a new
  one alongside it.
- **Categories**: matched by name against existing Medusa categories before
  creating a new one, and cached in memory for the run so the same Shopify
  collection isn't looked up/created once per product.

### Incremental syncs

The CLI writes a `sync-state.json` file with the timestamp of the last
successful run. Subsequent runs only fetch Shopify products updated since
then (via Shopify's `updated_at:>=` search filter), rather than reprocessing
the whole catalog every time. `--full` bypasses this and re-syncs everything
— useful for the first run, or to recover if state ever gets out of sync
with reality.

### Prices

Medusa v2 stores prices as the **actual decimal amount** for a currency
(e.g. `14.99` for $14.99) — this changed from Medusa v1, which stored prices
as integer cents (`1499`). Shopify's GraphQL `price` field is already a
decimal string, so the mapper does a direct `parseFloat` with no `* 100`
anywhere. Only one currency (`DEFAULT_CURRENCY_CODE` in `.env`) is synced
per variant; multi-currency Shopify markets aren't handled by this version.

### Inventory

Medusa auto-creates an inventory item per variant when `manage_inventory` is
enabled (default here). The sync writes stock quantities to a single
resolved stock location (`MEDUSA_STOCK_LOCATION_ID`, or the account's first
location if unset) using the batch location-levels endpoint, which is safe
to call on every run since it upserts the level for that
(inventory item, location) pair.

## Known limitations / things I'd tackle next with more time

- **Single currency, single stock location.** Both are realistic for a
  small-to-mid store but would need real per-market/per-warehouse logic for
  a larger one.
- **No deletion sync.** If a product is deleted or unpublished in Shopify,
  this sync doesn't remove or archive it in Medusa. Given how destructive
  that could be if run against the wrong environment, I'd want that as an
  explicit, confirmed opt-in flag rather than default behavior.
- **Metafields, SEO fields, and multi-image variants** aren't mapped — the
  brief specified details/images/categories/prices/inventory, so I kept the
  field set to that rather than guessing at extras.
- **Rate limiting** is handled for Shopify's GraphQL cost-based throttling;
  Medusa's admin API doesn't publish a fixed rate limit as of this writing,
  so no explicit backoff is implemented there beyond normal error handling.
- **Testing**: given the take-home scope, I didn't have a live Shopify/Medusa
  pair to test end-to-end against, so this is unit-testable-by-design (pure
  mapping functions in `mapper.ts`, isolated API clients) but doesn't ship
  with a test suite. Happy to add one if useful to see.
