// Smoke test: spin up the built server over stdio and exercise its tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
});

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const list = await client.callTool({ name: "list_tables", arguments: {} });
console.log("\nlist_tables ->\n", list.content[0].text.slice(0, 400), "...");

// This hits the network; expected to error in sandboxes where the host is blocked.
const q = await client.callTool({
  name: "query_table",
  arguments: { table: "rpt_monthly_pl", order: "month.desc", limit: 1 },
});
console.log("\nquery_table(rpt_monthly_pl) isError:", q.isError ?? false);
console.log(q.content[0].text.slice(0, 300));

await client.close();
process.exit(0);
