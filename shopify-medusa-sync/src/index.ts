import fs from "node:fs";
import path from "node:path";
import { runSync } from "./sync/run.js";

const STATE_FILE = path.resolve(process.cwd(), "sync-state.json");

interface SyncState {
  lastRunAt: string | null;
}

function loadState(): SyncState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { lastRunAt: null };
  }
}

function saveState(state: SyncState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const isFull = args.includes("--full");
  const isDryRun = args.includes("--dry-run");

  const state = loadState();
  const runStartedAt = new Date().toISOString();

  // Default behavior is incremental: only products Shopify has touched since
  // the last successful run are fetched. --full forces a complete re-sync,
  // useful for the very first run or if state ever gets out of sync.
  const updatedSince = isFull ? null : state.lastRunAt;

  console.log(
    isFull
      ? "Running FULL sync (all products)..."
      : updatedSince
        ? `Running incremental sync (products updated since ${updatedSince})...`
        : "No previous sync recorded — running full sync..."
  );
  if (isDryRun) console.log("(dry run — no writes will be made to Medusa)");

  const stats = await runSync({ updatedSince, dryRun: isDryRun });

  console.log("\n--- Sync summary ---");
  console.log(`Products seen:        ${stats.productsSeen}`);
  console.log(`Products created:     ${stats.productsCreated}`);
  console.log(`Products updated:     ${stats.productsUpdated}`);
  console.log(`Products failed:      ${stats.productsFailed}`);
  console.log(`Categories created:   ${stats.categoriesCreated}`);
  console.log(`Inventory levels set: ${stats.inventoryLevelsWritten}`);

  if (stats.errors.length) {
    console.log("\nErrors:");
    for (const e of stats.errors) {
      console.log(`  - ${e.shopifyProductId}: ${e.message}`);
    }
  }

  if (!isDryRun) {
    saveState({ lastRunAt: runStartedAt });
  }

  process.exit(stats.productsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Sync failed to start:", err);
  process.exit(1);
});
