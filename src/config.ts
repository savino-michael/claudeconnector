import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader so the server works when launched as a bare
 * `node dist/index.js` by an MCP client. Values already present in
 * process.env always win (e.g. when the client injects env directly).
 */
function loadDotEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // file not present — fine, env may be supplied another way
    }
  }
}

loadDotEnv();

export interface TableInfo {
  name: string;
  category: string;
  description: string;
  /** Whether passing an explicit brand_id filter is recommended for speed. */
  large?: boolean;
}

/**
 * Allowlist of tables this connector is permitted to read. The scoped JWT and
 * RLS already restrict access to Tenet Components (brand_id = 1); this list is
 * a second guard so the connector cannot be coaxed into probing other relations.
 */
export const TABLES: TableInfo[] = [
  // Sales
  { name: "sales_transactions", category: "Sales", description: "Individual sales transactions (orders).", large: true },
  { name: "sales_line_items", category: "Sales", description: "Line items belonging to sales transactions.", large: true },
  { name: "sales_channels", category: "Sales", description: "Sales channels (e.g. Shopify, wholesale)." },

  // Products
  { name: "product_source_mappings", category: "Products", description: "Maps external/source product identifiers to internal products." },
  { name: "product_types", category: "Products", description: "Product type / category reference data." },
  { name: "products", category: "Products", description: "Product catalog." },

  // Financials
  { name: "rpt_monthly_pl", category: "Financials", description: "Monthly profit & loss report." },
  { name: "rpt_monthly_bs", category: "Financials", description: "Monthly balance sheet report." },
  { name: "qb_accounts", category: "Financials", description: "QuickBooks chart of accounts." },
  { name: "qb_monthly_figures", category: "Financials", description: "QuickBooks monthly figures by account." },

  // Reporting
  { name: "rpt_monthly_product_sales", category: "Reporting", description: "Monthly sales aggregated by product." },
  { name: "rpt_monthly_brand_sales", category: "Reporting", description: "Monthly sales aggregated by brand." },

  // Projections
  { name: "projection_assumptions", category: "Projections", description: "Assumptions feeding financial projections." },
  { name: "projection_results", category: "Projections", description: "Computed projection results." },

  // Shopify
  { name: "shopify_payouts", category: "Shopify", description: "Shopify payout summaries." },
  { name: "shopify_payout_transactions", category: "Shopify", description: "Individual transactions within Shopify payouts." },

  // Ads
  { name: "ad_daily_data", category: "Ads", description: "Daily advertising performance data.", large: true },
];

export const TABLE_NAMES = TABLES.map((t) => t.name);

export function isAllowedTable(name: string): boolean {
  return TABLE_NAMES.includes(name);
}

export interface Config {
  baseUrl: string;
  anonKey: string;
  jwt: string;
  defaultBrandId?: string;
}

export function loadConfig(): Config {
  const baseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const jwt = process.env.SUPABASE_READONLY_JWT ?? "";
  const defaultBrandId = process.env.DEFAULT_BRAND_ID || undefined;

  const missing: string[] = [];
  if (!baseUrl) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!jwt) missing.push("SUPABASE_READONLY_JWT");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill them in, or pass them via the MCP client env.`,
    );
  }

  return { baseUrl, anonKey, jwt, defaultBrandId };
}
