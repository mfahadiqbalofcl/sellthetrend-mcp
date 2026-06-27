// Smoke test: spawn the server over stdio and list its tools. No STT login needed.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["server.mjs"] });
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("TOOLS (" + tools.length + "):");
for (const t of tools) console.log(" - " + t.name + " :: " + t.description.slice(0, 70));
await client.close();
process.exit(0);
