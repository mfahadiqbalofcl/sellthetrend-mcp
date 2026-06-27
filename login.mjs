#!/usr/bin/env node
/**
 * One-time manual login for Sell The Trend.
 * STT blocks automated logins with a "verify you are human" challenge, so a human
 * must sign in once. This opens a REAL browser (pre-filled from .env), you solve the
 * check + sign in, and the session is cached in .auth/profile — the MCP reuses it.
 */
import { chromium } from "playwright";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const ctx = await chromium.launchPersistentContext(path.join(__dirname, ".auth", "profile"), {
  headless: false,
  viewport: { width: 1366, height: 900 },
});
const p = ctx.pages()[0] || (await ctx.newPage());
await p.goto("https://www.sellthetrend.com/login", { waitUntil: "domcontentloaded" });
await p.fill('input[type="email"]', process.env.STT_EMAIL || "").catch(() => {});
await p.fill('input[type="password"]', process.env.STT_PASSWORD || "").catch(() => {});

console.log("\n========== Sell The Trend — one-time login ==========");
console.log("A browser window just opened. In it:");
console.log("  1) Tick 'Please verify you are human'");
console.log("  2) Click the pink 'Sign in'  (email + password are pre-filled)");
console.log("Waiting up to 5 minutes for your dashboard to load...\n");

try {
  await p.waitForURL(/\/dashboard/, { timeout: 300000 });
  console.log("✅ Logged in. Session cached in .auth/profile — the MCP will reuse it.");
} catch {
  console.log("⏱️  Didn't detect /dashboard. If you did sign in, the session is still cached.");
  console.log("    If not, just run again:  node login.mjs");
}
await ctx.close();
process.exit(0);
