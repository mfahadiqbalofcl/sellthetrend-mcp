# Sell The Trend MCP 🐾📊

An **MCP (Model Context Protocol) server** that turns your Sell The Trend account into an AI-drivable product-research engine — and generates **detailed, decision-ready PDF dossiers** for any niche.

Sell The Trend has **no public API**, so this server drives your **own logged-in account** through a real browser (Playwright). It gives an AI assistant (Claude Code, etc.) generic browser primitives *plus* purpose-built research + reporting tools.

> ⚠️ **Personal-use tool, your own paid account, your own data.** Automating a SaaS dashboard can be against its Terms of Service — use responsibly and at your own risk. Not affiliated with, or endorsed by, Sell The Trend.

---

## ✨ What it does
- 🔎 **`stt_research`** — search NEXUS for a niche/keyword → **structured** product data (name, sell price, orders, sales).
- 📄 **`stt_research_report`** — research a keyword and generate a **detailed PDF dossier**: full product list + deep dossiers for the top products (cost, profit, **saturation %**, AI insights, competitor stores + revenue + URLs, AliExpress suppliers, **Facebook Ad Library** link, FB targeting, product image).
- 🧭 **Browser primitives** (`stt_navigate`, `stt_snapshot`, `stt_extract`, `stt_click`, `stt_fill`, `stt_evaluate`, `stt_screenshot`) — reach **anything** in your dashboard (ad finders, spy tools, store intel…).
- 🔐 **`stt_login` / `stt_status`** — one-click human login (handles the "verify you are human" check) + session status.

## ✅ Requirements
- **Node.js 18+**
- A **Sell The Trend** account (free trial works)
- **Claude Code** (or any MCP client)

## 🚀 Installation
```bash
git clone https://github.com/mfahadiqbalofcl/sellthetrend-mcp.git
cd sellthetrend-mcp
npm install
npx playwright install chromium      # one-time browser download
cp .env.example .env                 # then add YOUR Sell The Trend login (never commit it)
```
Open `.env` and set:
```
STT_EMAIL=you@example.com
STT_PASSWORD=your-password
STT_HEADLESS=false        # keep false — STT blocks headless logins
```

## 🔌 Register with Claude Code
```bash
claude mcp add sellthetrend -s user -- node /ABSOLUTE/PATH/TO/sellthetrend-mcp/server.mjs
```
Then **restart Claude Code** so the tools load. Verify: `claude mcp list` → `sellthetrend ✔ Connected`.

## 🔑 First login (once per server start)
STT guards login with a Cloudflare "verify you are human" check that only a human can pass. So:
1. In Claude, call **`stt_login`** (or just ask: *"log into Sell The Trend"*).
2. A browser window opens (email + password pre-filled). **Tick "verify you are human" → Sign in.**
3. The session is held by the running server and reused for every tool call.

*(Standalone alternative when the server isn't running: `node login.mjs`.)*

## 💡 Usage examples (in Claude)
- *"Research the **catnip** niche on Sell The Trend and give me a detailed PDF report."* → drops a dossier in `./reports/`.
- *"Find winning **cat dental** products with their cost, profit and saturation."*
- *"Open the Facebook Ad finder and show me the top pet ads."*
- *"Screenshot my NEXUS page."*

Reports are saved to **`./reports/winning-product-report-<keyword>-<timestamp>.pdf`** — summary table + per-product dossiers with embedded image, economics, AI insights, competitor stores (URLs + revenue), AliExpress suppliers, FB Ad Library link, and targeting.

## ⚙️ Configuration (`.env`)
| Var | Purpose |
|---|---|
| `STT_EMAIL` / `STT_PASSWORD` | your login (pre-fills the form) |
| `STT_HEADLESS` | `false` recommended (headless logins are blocked) |
| `STT_PROXY_SERVER` / `STT_PROXY_USERNAME` / `STT_PROXY_PASSWORD` | optional residential proxy to avoid IP rate-limits |
| `STT_DASHBOARD_URL` / `STT_SEARCH_PATH` / `STT_CARD_SELECTOR` | optional overrides if STT changes its UI |

## 🧰 Troubleshooting
- **"verify you are human" loops / logged out** → call `stt_login` again (session expired). Never `kill -9` the browser — that discards the session.
- **Empty results** → STT changed selectors; use `stt_navigate` + `stt_snapshot` to find the new path and set overrides in `.env`.
- **IP blocked** → add a residential proxy via `STT_PROXY_*`.

## 📁 Project layout
```
server.mjs      # the MCP server (14 tools)
report.mjs      # parser + detailed PDF report engine
login.mjs       # standalone one-time manual login
make_report.mjs # generate a report from sample data
smoke.mjs       # lists the tools (sanity check)
reports/        # generated PDFs (gitignored)
```

## ⚖️ Disclaimer
For personal research on your own account. Respect Sell The Trend's Terms of Service and robots policies. The author/operator is responsible for how it's used. MIT-licensed code; the data belongs to Sell The Trend and its sources.
