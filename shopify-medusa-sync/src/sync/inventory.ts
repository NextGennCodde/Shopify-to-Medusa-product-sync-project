import { medusa, authHeaders } from "../medusa/client.js";
import { config } from "../config.js";

let cachedLocationId: string | null = null;

/**
 * Resolves which Medusa stock location to write inventory into.
 * Uses MEDUSA_STOCK_LOCATION_ID if set, otherwise falls back to the first
 * stock location on the account (fine for single-warehouse setups, which is
 * the common case for a store this size — flagged in the README for
 * multi-warehouse stores).
 */
export async function resolveStockLocationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;

  if (config.medusa.stockLocationId) {
    cachedLocationId = config.medusa.stockLocationId;
    return cachedLocationId as string;
  }

  const { stock_locations } = await medusa.admin.stockLocation.list(
    { limit: 1 },
    authHeaders()
  );

  if (!stock_locations?.length) {
    throw new Error(
      "No Medusa stock locations found. Create one in the Medusa admin, or set MEDUSA_STOCK_LOCATION_ID."
    );
  }

  cachedLocationId = stock_locations[0].id;
  return cachedLocationId as string;
}

/**
 * Sets the stocked quantity for one variant's inventory item at the resolved
 * location. Uses the location-levels batch endpoint with `create`, which
 * Medusa treats as an upsert for a given (inventory_item, location) pair —
 * so this is safe to call on every sync run, not just for new variants.
 */
export async function writeInventoryLevel(
  inventoryItemId: string,
  quantity: number
): Promise<void> {
  const locationId = await resolveStockLocationId();

  await medusa.admin.inventoryItem.batchInventoryItemLocationLevels(
    inventoryItemId,
    {
      create: [
        {
          location_id: locationId,
          stocked_quantity: quantity,
        },
      ],
    },
    authHeaders()
  );
}
