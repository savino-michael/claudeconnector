import { Config, isAllowedTable } from "./config.js";

export interface QueryOptions {
  /** Comma-separated PostgREST select expression, e.g. "month,revenue". Defaults to "*". */
  select?: string;
  /**
   * PostgREST filters keyed by column, value is an operator expression,
   * e.g. { brand_id: "eq.1", month: "gte.2024-01-01" }.
   */
  filters?: Record<string, string>;
  /** PostgREST order expression, e.g. "month.desc" or "revenue.desc.nullslast". */
  order?: string;
  /** Max rows to return. */
  limit?: number;
  /** Row offset for pagination. */
  offset?: number;
}

export interface QueryResult {
  rows: unknown[];
  /** Total matching rows reported by PostgREST (from Content-Range), if known. */
  total?: number;
  /** The fully-qualified request URL (no secrets), for debugging/transparency. */
  url: string;
}

export class ReadOnlySupabaseClient {
  constructor(private readonly config: Config) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${this.config.jwt}`,
      Accept: "application/json",
      ...extra,
    };
  }

  /**
   * Read rows from an allowlisted table. This is the only data path in the
   * connector and issues GET requests exclusively — there is no code path that
   * can write, update, or delete.
   */
  async query(table: string, options: QueryOptions = {}): Promise<QueryResult> {
    if (!isAllowedTable(table)) {
      throw new Error(
        `Table "${table}" is not in the read allowlist. Use the list_tables tool to see available tables.`,
      );
    }

    const params = new URLSearchParams();
    params.set("select", options.select?.trim() || "*");

    if (options.filters) {
      for (const [column, expr] of Object.entries(options.filters)) {
        if (typeof expr !== "string" || expr.length === 0) continue;
        params.append(column, expr);
      }
    }

    // Apply a default brand scope when the caller did not specify one.
    if (this.config.defaultBrandId && !(options.filters && "brand_id" in options.filters)) {
      params.set("brand_id", `eq.${this.config.defaultBrandId}`);
    }

    if (options.order) params.set("order", options.order);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.offset === "number") params.set("offset", String(options.offset));

    const url = `${this.config.baseUrl}/${encodeURIComponent(table)}?${params.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.headers({ Prefer: "count=estimated" }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Supabase request failed: HTTP ${res.status} ${res.statusText}. ${body}`.trim(),
      );
    }

    const rows = (await res.json()) as unknown[];

    let total: number | undefined;
    const contentRange = res.headers.get("content-range");
    if (contentRange) {
      const slashIdx = contentRange.indexOf("/");
      const totalStr = slashIdx >= 0 ? contentRange.slice(slashIdx + 1) : "";
      const parsed = Number.parseInt(totalStr, 10);
      if (!Number.isNaN(parsed)) total = parsed;
    }

    return { rows, total, url };
  }
}
