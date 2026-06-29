#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig, TABLES, TABLE_NAMES } from "./config.js";
import { ReadOnlySupabaseClient } from "./supabase.js";

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new ReadOnlySupabaseClient(config);

  const server = new McpServer({
    name: "claudeconnector",
    version: "0.1.0",
  });

  // ---- list_tables -------------------------------------------------------
  server.tool(
    "list_tables",
    "List the read-only Tenet Components tables available through this connector, grouped by category.",
    {},
    async () => {
      const byCategory: Record<string, { name: string; description: string; large?: boolean }[]> = {};
      for (const t of TABLES) {
        (byCategory[t.category] ??= []).push({
          name: t.name,
          description: t.description,
          ...(t.large ? { large: true } : {}),
        });
      }
      return textResult({
        note: "All access is read-only and scoped to Tenet Components (brand_id = 1) by RLS.",
        tables: byCategory,
      });
    },
  );

  // ---- describe_table ----------------------------------------------------
  server.tool(
    "describe_table",
    "Inspect a table's columns by fetching a single sample row. Useful before building a query_table call.",
    {
      table: z.enum(TABLE_NAMES as [string, ...string[]]).describe("Table name (must be in the allowlist)."),
    },
    async ({ table }) => {
      try {
        const result = await client.query(table, { limit: 1 });
        const sample = result.rows[0];
        const columns = sample && typeof sample === "object" ? Object.keys(sample as object) : [];
        return textResult({
          table,
          columns,
          sampleRow: sample ?? null,
          totalRows: result.total ?? "unknown",
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ---- query_table -------------------------------------------------------
  server.tool(
    "query_table",
    [
      "Read rows from a Tenet Components table (read-only).",
      "Filters use PostgREST operator syntax keyed by column, e.g.",
      '{"brand_id":"eq.1","month":"gte.2024-01-01"}. Common operators: eq, neq, gt, gte, lt, lte, like, ilike, in.(a,b), is.null.',
      "If no brand_id filter is given, the configured default brand scope is applied automatically.",
    ].join(" "),
    {
      table: z.enum(TABLE_NAMES as [string, ...string[]]).describe("Table to read from."),
      select: z
        .string()
        .optional()
        .describe('Comma-separated columns to return, e.g. "month,revenue". Defaults to all columns.'),
      filters: z
        .record(z.string())
        .optional()
        .describe('PostgREST filters keyed by column, e.g. {"month":"gte.2024-01-01"}.'),
      order: z.string().optional().describe('Order expression, e.g. "month.desc".'),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_LIMIT)
        .optional()
        .describe(`Max rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
      offset: z.number().int().nonnegative().optional().describe("Row offset for pagination."),
    },
    async ({ table, select, filters, order, limit, offset }) => {
      try {
        const result = await client.query(table, {
          select,
          filters,
          order,
          limit: limit ?? DEFAULT_LIMIT,
          offset,
        });
        return textResult({
          table,
          returned: result.rows.length,
          totalMatching: result.total ?? "unknown",
          rows: result.rows,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stdout is reserved for the MCP protocol; log to stderr.
  console.error("claudeconnector MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting claudeconnector:", err);
  process.exit(1);
});
