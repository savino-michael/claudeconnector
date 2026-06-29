# claudeconnector

A read-only [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server that exposes the **Tenet Components** Supabase data to Claude (Claude
Code, Claude Desktop, or any MCP client).

All access is **read-only**: the server only ever issues `GET` requests against
the Supabase PostgREST API, and the credentials it uses are a scoped, read-only
JWT. There is no code path that can insert, update, or delete data.

## What it exposes

The connector serves a fixed allowlist of Tenet Components tables, grouped by
area:

| Category    | Tables |
| ----------- | ------ |
| Sales       | `sales_transactions`, `sales_line_items`, `sales_channels` |
| Products    | `products`, `product_types`, `product_source_mappings` |
| Financials  | `rpt_monthly_pl`, `rpt_monthly_bs`, `qb_accounts`, `qb_monthly_figures` |
| Reporting   | `rpt_monthly_product_sales`, `rpt_monthly_brand_sales` |
| Projections | `projection_assumptions`, `projection_results` |
| Shopify     | `shopify_payouts`, `shopify_payout_transactions` |
| Ads         | `ad_daily_data` |

## Tools

- **`list_tables`** — list the available tables grouped by category.
- **`describe_table`** — fetch one sample row to reveal a table's columns.
- **`query_table`** — read rows with optional `select`, `filters`, `order`,
  `limit`, and `offset`.

`filters` use [PostgREST operator syntax](https://postgrest.org/en/stable/references/api/tables_views.html#operators)
keyed by column, e.g.:

```json
{
  "table": "rpt_monthly_pl",
  "select": "month,revenue,net_income",
  "filters": { "month": "gte.2024-01-01" },
  "order": "month.desc",
  "limit": 12
}
```

Common operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`,
`in.(a,b)`, `is.null`. If you don't supply a `brand_id` filter, the configured
default brand scope (`DEFAULT_BRAND_ID`) is applied automatically; RLS enforces
the Tenet Components scope regardless.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the credentials
npm run build
```

Set the following in `.env` (gitignored — never commit real credentials):

| Variable | Description |
| -------- | ----------- |
| `SUPABASE_URL` | PostgREST base URL, e.g. `https://<project>.supabase.co/rest/v1` |
| `SUPABASE_ANON_KEY` | Supabase anon API key (`apikey` header) |
| `SUPABASE_READONLY_JWT` | Scoped read-only JWT (`Authorization: Bearer`) |
| `DEFAULT_BRAND_ID` | Optional default brand scope (e.g. `1`) |

The connector also reads credentials directly from `process.env`, so an MCP
client can inject them via its own `env` block instead of using a `.env` file.

## Registering with an MCP client

### Claude Code

```bash
claude mcp add tenet -- node /absolute/path/to/claudeconnector/dist/index.js
```

### Claude Desktop / generic MCP config

```json
{
  "mcpServers": {
    "tenet": {
      "command": "node",
      "args": ["/absolute/path/to/claudeconnector/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://<project>.supabase.co/rest/v1",
        "SUPABASE_ANON_KEY": "...",
        "SUPABASE_READONLY_JWT": "...",
        "DEFAULT_BRAND_ID": "1"
      }
    }
  }
}
```

## Development

```bash
npm run dev        # run from source with tsx (watch mode)
npm run typecheck  # type-check without emitting
node scripts/smoke.mjs   # start the built server and exercise the tools
```

> **Network note:** the server must be able to reach the Supabase host. In
> locked-down/sandboxed environments where egress to `*.supabase.co` is blocked,
> `list_tables` still works, but `describe_table`/`query_table` will return a
> network error until the host is allowlisted.
