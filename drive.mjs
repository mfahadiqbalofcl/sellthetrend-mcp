// Explore the logged-in STT dashboard: dump links + buttons so we can find product research.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["server.mjs"] });
const client = new Client({ name: "drive", version: "1.0.0" });
await client.connect(transport);
const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const tjson = (r) => JSON.parse(r.content.find((c) => c.type === "text").text);

const snap = tjson(await call("stt_navigate", { pathOrUrl: "/dashboard/desk" }));
console.log("TITLE:", snap.title, "| URL:", snap.url, "\n");
console.log("LINKS:");
for (const l of snap.links) if (l.href.includes("sellthetrend")) console.log("  " + l.text.replace(/\s+/g, " ").slice(0, 40).padEnd(40) + " -> " + l.href.replace("https://www.sellthetrend.com", ""));
console.log("\nBUTTONS:", snap.buttons.map((b) => b.replace(/\s+/g, " ")).filter(Boolean).join(" | "));
await client.close(); process.exit(0);
