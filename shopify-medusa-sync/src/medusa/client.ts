import Medusa from "@medusajs/js-sdk";
import { config, assertMedusaAuthConfigured } from "../config.js";

assertMedusaAuthConfigured();

export const medusa = new Medusa({
  baseUrl: config.medusa.backendUrl,
  auth: { type: "jwt" },
});

let jwtToken = config.medusa.apiToken || "";

export async function ensureMedusaAuth(): Promise<void> {
  if (jwtToken) return;
  const res: any = await medusa.auth.login("user", "emailpass", {
    email: config.medusa.adminEmail,
    password: config.medusa.adminPassword,
  });
  
  if (typeof res === "string") {
    jwtToken = res;
  } else if (res?.token) {
    jwtToken = res.token;
  } else if (res?.access_token) {
    jwtToken = res.access_token;
  }
}

function authHeaders(): Record<string, string> {
  return jwtToken
    ? { Authorization: `Bearer ${jwtToken}` }
    : {};
}

export { authHeaders };
