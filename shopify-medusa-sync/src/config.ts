import "dotenv/config";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const config = {
  shopify: {
    storeDomain: required("SHOPIFY_STORE_DOMAIN", process.env.SHOPIFY_STORE_DOMAIN),
    accessToken: required(
      "SHOPIFY_ADMIN_ACCESS_TOKEN",
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
    ),
    apiVersion: process.env.SHOPIFY_API_VERSION || "2025-01",
  },
  medusa: {
    backendUrl: required("MEDUSA_BACKEND_URL", process.env.MEDUSA_BACKEND_URL),
    apiToken: process.env.MEDUSA_API_TOKEN || "",
    adminEmail: process.env.MEDUSA_ADMIN_EMAIL || "",
    adminPassword: process.env.MEDUSA_ADMIN_PASSWORD || "",
    stockLocationId: process.env.MEDUSA_STOCK_LOCATION_ID || "",
    salesChannelId: process.env.MEDUSA_SALES_CHANNEL_ID || "",
  },
  sync: {
    defaultCurrencyCode: (process.env.DEFAULT_CURRENCY_CODE || "usd").toLowerCase(),
    pageSize: 50,
  },
};

export function assertMedusaAuthConfigured() {
  if (!config.medusa.apiToken && !(config.medusa.adminEmail && config.medusa.adminPassword)) {
    throw new Error(
      "Provide either MEDUSA_API_TOKEN or MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD in .env"
    );
  }
}
