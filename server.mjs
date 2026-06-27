#!/usr/bin/env node
/**
 * sellthetrend-mcp — unofficial MCP server for Sell The Trend.
 * Sell The Trend has no public API, so this drives YOUR OWN logged-in account
 * with a headless browser. It exposes generic browser primitives (navigate,
 * click, fill, extract, evaluate, screenshot) so it can do anything you can do
 * in the dashboard, plus a few convenience tools for product research.
 *
 * Personal-use tool for your own paid account. Automated access may be against
 * a SaaS's ToS — use at your discretion.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chromium } from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseProducts, parseProductDetail, buildReportHtml, renderPdf } from "./report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const BASE = process.env.STT_BASE_URL || "https://www.sellthetrend.com";
const EMAIL = process.env.STT_EMAIL || "";
const PASSWORD = process.env.STT_PASSWORD || "";
const HEADLESS = (process.env.STT_HEADLESS ?? "true") !== "false";
const MANUAL = process.env.STT_MANUAL_LOGIN === "1";
const LOGIN_URL = process.env.STT_LOGIN_URL || BASE + "/login";
const DASHBOARD_URL = process.env.STT_DASHBOARD_URL || BASE + "/dashboard/desk";
const AUTH_DIR = path.join(__dirname, ".auth");
const PROFILE_DIR = path.join(AUTH_DIR, "profile"); // persistent browser profile (survives STT's human-check after one manual login)
const REPORTS_DIR = path.join(__dirname, "reports");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
const NEXUS_SEARCH = (kw) => BASE + "/dashboard/products/everything?search=" + encodeURIComponent(kw);

let ctx, page;

async function ensureBrowser() {
  if (page && !page.isClosed?.()) return page;
  // Persistent context: reuses the cookies from the one-time manual login (node login.mjs).
  // Optional proxy (e.g. a residential proxy) to avoid IP-based rate-limits/blocks.
  const proxy = process.env.STT_PROXY_SERVER
    ? { server: process.env.STT_PROXY_SERVER, username: process.env.STT_PROXY_USERNAME || undefined, password: process.env.STT_PROXY_PASSWORD || undefined }
    : undefined;
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1366, height: 900 },
    proxy,
  });
  page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(45000);
  return page;
}
async function saveState() { /* persistent context auto-saves to PROFILE_DIR */ }
async function looksLoggedOut(p) {
  if (/\/login|\/sign-?in/i.test(p.url())) return true;
  const pwd = await p.locator('input[type="password"]').count().catch(() => 0);
  return pwd > 0;
}
async function fillFirst(p, selectors, value) {
  for (const s of selectors) {
    const loc = p.locator(s).first();
    if (await loc.count().catch(() => 0)) { await loc.fill(value).catch(() => {}); return true; }
  }
  return false;
}
async function clickFirst(p, selectors) {
  for (const s of selectors) {
    const loc = p.locator(s).first();
    if (await loc.count().catch(() => 0)) { await loc.click().catch(() => {}); return true; }
  }
  return false;
}
async function doCredLogin(p) {
  await p.goto(LOGIN_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(1200);
  await fillFirst(p, ['input[type="email"]', 'input[name="email"]', "#email", 'input[name="username"]', 'input[placeholder*="mail" i]'], EMAIL);
  await fillFirst(p, ['input[type="password"]', 'input[name="password"]', "#password"], PASSWORD);
  // exact-text so we never hit "Sign in with Google"/"Sign in with Facebook"
  await clickFirst(p, ['button[type="submit"]', 'button:text-is("Sign in")', 'button:text-is("Log in")', 'button:text-is("Login")', 'input[type="submit"]']);
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(2500);
}
// Navigate, and if Cloudflare throws a "verify you are human" interstitial, reload a few
// times — with a valid session cookie present these managed challenges usually self-clear.
async function gotoStable(p, url) {
  await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let i = 0; i < 3; i++) {
    const challenged = await p.locator("text=verify you are human").count().catch(() => 0);
    if (!challenged) break;
    await p.waitForTimeout(3000);
    await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  }
  await p.waitForTimeout(700);
}
// Open each top product's NEXUS detail modal and extract a full dossier (cost, profit,
// saturation, stores+URLs, suppliers, FB ad library, targeting, image).
async function deepResearch(p, names, limit = 3) {
  const out = [];
  for (const name of names.slice(0, limit)) {
    try {
      await p.evaluate((nm) => {
        const a = [...document.querySelectorAll('a.nexusResearch,a[data-track="product research"]')]
          .find((x) => { const c = x.closest('[class*=product]'); return c && c.innerText.includes(nm); });
        if (a) a.click();
      }, name);
      await p.waitForTimeout(2600);
      const raw = await p.evaluate(() => {
        const m = document.querySelector("#modal-for-product");
        if (!m) return null;
        return {
          text: m.innerText,
          imgs: [...m.querySelectorAll("img")].map((i) => i.src).filter((s) => /^https?:/.test(s)),
          links: [...m.querySelectorAll("a")].map((a) => ({ t: a.textContent.replace(/\s+/g, " ").trim(), h: a.href })).filter((x) => /^https?:/.test(x.h)),
        };
      });
      if (raw) out.push(parseProductDetail(name, raw.text, raw.links, raw.imgs));
      await p.evaluate(() => {
        const m = document.querySelector("#modal-for-product");
        const c = m && (m.querySelector('[data-dismiss="modal"]') || m.querySelector(".close"));
        if (c) c.click(); else if (m) { m.classList.remove("show"); m.style.display = "none"; }
        document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());
      });
      await p.waitForTimeout(900);
    } catch {}
  }
  return out;
}
async function ensureLogin() {
  const p = await ensureBrowser();
  await gotoStable(p, DASHBOARD_URL);
  if (!(await looksLoggedOut(p))) { await saveState(); return p; }
  if (EMAIL && PASSWORD && !MANUAL) {
    await doCredLogin(p);
    await gotoStable(p, DASHBOARD_URL);
    if (!(await looksLoggedOut(p))) { await saveState(); return p; }
    throw new Error("Not logged in (STT blocks automated login with a human-check). Call the `stt_login` tool — a browser window opens for you to solve the check + sign in, then retry.");
  }
  throw new Error("Not logged in. Call the `stt_login` tool — a browser window opens (email/password pre-filled); solve 'verify you are human' + Sign in, then every other tool works for the rest of this session.");
}
async function snapshot(p) {
  const data = await p.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").slice(0, 6000),
    links: [...document.querySelectorAll("a")].map((a) => ({ text: a.innerText.trim(), href: a.href })).filter((x) => x.text).slice(0, 60),
    buttons: [...document.querySelectorAll("button,[role=button]")].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 50),
  }));
  return JSON.stringify(data, null, 2);
}
const ok = (text) => ({ content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }] });
const fail = (e) => ({ content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true });

const server = new McpServer({ name: "sellthetrend", version: "0.1.0" });

server.tool("stt_status", "Report Sell The Trend session/auth status and whether you're logged in.", {}, async () => {
  try {
    const p = await ensureBrowser();
    let url = "", loggedOut = true;
    try { await p.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded" }); url = p.url(); loggedOut = await looksLoggedOut(p); } catch {}
    return ok({ base: BASE, headless: HEADLESS, hasCreds: !!(EMAIL && PASSWORD), savedSession: fs.existsSync(PROFILE_DIR), currentUrl: url, loggedIn: !loggedOut });
  } catch (e) { return fail(e); }
});

server.tool("stt_login", "Open Sell The Trend login in THIS server's browser window and wait (up to 5 min) for you to solve the human-check + sign in. Run once per server start if stt_status shows loggedIn:false. (Server must be headful: STT_HEADLESS=false.)", {}, async () => {
  try {
    const p = await ensureBrowser();
    await p.goto(LOGIN_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await fillFirst(p, ['input[type="email"]', 'input[name="email"]', "#email"], EMAIL);
    await fillFirst(p, ['input[type="password"]', 'input[name="password"]', "#password"], PASSWORD);
    await p.waitForURL(/\/dashboard/, { timeout: 300000 });
    await saveState();
    return ok("✅ Logged in — session active for this server. Other tools will work now.");
  } catch (e) {
    return fail("Login not detected within 5 min. In the open browser window: solve 'verify you are human' + click Sign in, then call stt_login again. " + (e?.message || ""));
  }
});

server.tool("stt_navigate", "Log in if needed, navigate to a Sell The Trend path or full URL, and return a text snapshot (title, url, text, links, buttons).",
  { pathOrUrl: z.string().describe("e.g. '/dashboard/desk' or a full https URL on sellthetrend.com") },
  async ({ pathOrUrl }) => {
    try {
      const p = await ensureLogin();
      const url = pathOrUrl.startsWith("http") ? pathOrUrl : BASE + (pathOrUrl.startsWith("/") ? "" : "/") + pathOrUrl;
      await gotoStable(p, url);
      return ok(await snapshot(p));
    } catch (e) { return fail(e); }
  });

server.tool("stt_snapshot", "Return a text snapshot of the CURRENT page (title, url, visible text, links, buttons).", {}, async () => {
  try { return ok(await snapshot(await ensureBrowser())); } catch (e) { return fail(e); }
});

server.tool("stt_extract", "Extract data from the current page via a CSS selector. Returns innerText (or a given attribute) of each match.",
  { selector: z.string(), attribute: z.string().optional(), limit: z.number().optional().default(50) },
  async ({ selector, attribute, limit }) => {
    try {
      const p = await ensureBrowser();
      const items = await p.$$eval(selector, (els, attr) => els.map((el) => (attr ? el.getAttribute(attr) || "" : (el.innerText || "").trim())), attribute || null);
      return ok(items.slice(0, limit));
    } catch (e) { return fail(e); }
  });

server.tool("stt_click", "Click an element by CSS selector or visible text.",
  { selector: z.string().optional(), text: z.string().optional() },
  async ({ selector, text }) => {
    try {
      const p = await ensureBrowser();
      if (selector) await p.locator(selector).first().click();
      else if (text) await p.getByText(text, { exact: false }).first().click();
      else throw new Error("Provide selector or text.");
      await p.waitForTimeout(1200);
      return ok("Clicked. Now at: " + p.url());
    } catch (e) { return fail(e); }
  });

server.tool("stt_fill", "Fill an input by CSS selector; optionally submit with Enter.",
  { selector: z.string(), value: z.string(), submit: z.boolean().optional().default(false) },
  async ({ selector, value, submit }) => {
    try {
      const p = await ensureBrowser();
      const loc = p.locator(selector).first();
      await loc.fill(value);
      if (submit) { await loc.press("Enter"); await p.waitForTimeout(1500); }
      return ok("Filled" + (submit ? " and submitted." : "."));
    } catch (e) { return fail(e); }
  });

server.tool("stt_evaluate", "Run JavaScript in the page and return the JSON-serializable result. The escape hatch for anything the other tools don't cover.",
  { script: z.string().describe("JS expression evaluated in page context, e.g. \"document.querySelectorAll('.product-card').length\"") },
  async ({ script }) => {
    try {
      const p = await ensureBrowser();
      // SECURITY: intentional eval. `script` is evaluated INSIDE the browser page
      // sandbox via Playwright (NOT in Node — no fs/process/network access beyond the
      // page). The caller is the trusted local MCP client driving the user's OWN
      // logged-in account, so this grants no privilege the operator doesn't already
      // have (equivalent to typing in the page's DevTools console). It is the
      // deliberate "do anything" escape hatch this server was asked to provide.
      const result = await p.evaluate((code) => eval(code), script);
      return ok(result);
    } catch (e) { return fail(e); }
  });

server.tool("stt_screenshot", "Take a PNG screenshot of the current page so you can see the dashboard.",
  { fullPage: z.boolean().optional().default(false) },
  async ({ fullPage }) => {
    try {
      const p = await ensureBrowser();
      const buf = await p.screenshot({ fullPage });
      return { content: [{ type: "image", data: buf.toString("base64"), mimeType: "image/png" }] };
    } catch (e) { return fail(e); }
  });

server.tool("stt_save_session", "Persist the current browser session after a manual login so future runs stay logged in.", {}, async () => {
  try { await saveState(); return ok("Session saved to .auth/state.json"); } catch (e) { return fail(e); }
});

server.tool("stt_search_products", "Search Sell The Trend product research for a niche/keyword and return found product cards. Best-effort — if cards are empty, use stt_navigate + stt_snapshot to find the real path/selector and set STT_SEARCH_PATH / STT_CARD_SELECTOR in .env.",
  { query: z.string() },
  async ({ query }) => {
    try {
      const p = await ensureLogin();
      await p.goto(BASE + (process.env.STT_SEARCH_PATH || "/dashboard/desk"), { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1800);
      await fillFirst(p, ['input[type="search"]', 'input[placeholder*="search" i]', 'input[name*="search" i]'], query);
      await p.keyboard.press("Enter").catch(() => {});
      await p.waitForTimeout(3000);
      const cardSel = process.env.STT_CARD_SELECTOR || "[class*='product'], [class*='card']";
      const cards = await p.$$eval(cardSel, (els) => els.map((e) => (e.innerText || "").trim().replace(/\s+/g, " ")).filter(Boolean)).catch(() => []);
      return ok({ query, cardsFound: cards.length, cards: cards.slice(0, 30), page: JSON.parse(await snapshot(p)) });
    } catch (e) { return fail(e); }
  });

server.tool("stt_winning_products", "Open Sell The Trend winning/handpicked products and return a snapshot. Tune STT_WINNING_PATH in .env if the default isn't right.", {}, async () => {
  try {
    const p = await ensureLogin();
    await p.goto(BASE + (process.env.STT_WINNING_PATH || "/dashboard/desk"), { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2500);
    return ok(await snapshot(p));
  } catch (e) { return fail(e); }
});

server.tool("stt_research", "Search Sell The Trend NEXUS for a niche/keyword and return STRUCTURED product data (name, sell price, orders, sales). The reliable way to pull winning-product data.",
  { keyword: z.string() },
  async ({ keyword }) => {
    try {
      const p = await ensureLogin();
      await gotoStable(p, NEXUS_SEARCH(keyword));
      await p.waitForTimeout(2500);
      const products = parseProducts(await p.evaluate(() => document.body.innerText));
      return ok({ keyword, count: products.length, products });
    } catch (e) { return fail(e); }
  });

server.tool("stt_research_report", "Research a niche/keyword on NEXUS and generate a DETAILED PDF dossier under ./reports/: full product list + deep dossiers (cost, profit, saturation, stores+URLs, suppliers, Facebook ad library, targeting, image) for the top products. Use this by default whenever researching a product.",
  { keyword: z.string(), recommendation: z.string().optional().describe("optional HTML recommendation paragraph to embed"), deepCount: z.number().optional().default(3).describe("how many top products to deep-dive (default 3)") },
  async ({ keyword, recommendation, deepCount }) => {
    try {
      const p = await ensureLogin();
      await gotoStable(p, NEXUS_SEARCH(keyword));
      await p.waitForTimeout(2800);
      const products = parseProducts(await p.evaluate(() => document.body.innerText));
      const names = products.filter((x) => x.orders).map((x) => x.name);
      const deep = await deepResearch(p, names, deepCount);
      const html = buildReportHtml(keyword, products, { recommendation, deep });
      const out = path.join(REPORTS_DIR, `winning-product-report-${keyword.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}.pdf`);
      await renderPdf(html, out);
      return ok({ keyword, count: products.length, deepDived: deep.length, pdf: out });
    } catch (e) { return fail(e); }
  });

// Graceful shutdown so the browser flushes session cookies to the profile (avoids
// losing the login on exit). Never SIGKILL the server/browser — it discards the session.
for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, async () => { try { await ctx?.close(); } catch {} process.exit(0); });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[sellthetrend-mcp] running (headless=" + HEADLESS + ", creds=" + !!(EMAIL && PASSWORD) + ")");
