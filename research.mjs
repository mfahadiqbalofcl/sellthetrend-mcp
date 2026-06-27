// Direct, clean-lifecycle exploration (same launch config as login.mjs so the
// Cloudflare clearance is reused). Dumps the dashboard nav so we can find product research.
import { chromium } from "playwright";
import dotenv from "dotenv"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const ctx = await chromium.launchPersistentContext(path.join(__dirname, ".auth", "profile"), {
  headless: false, viewport: { width: 1366, height: 900 },
});
const p = ctx.pages()[0] || (await ctx.newPage());
async function gotoStable(url) {
  await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let i = 0; i < 4; i++) {
    if (!(await p.locator("text=verify you are human").count().catch(() => 0))) break;
    await p.waitForTimeout(3000);
    await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  }
  await p.waitForTimeout(1200);
}
await gotoStable("https://www.sellthetrend.com/dashboard/desk");
const snap = await p.evaluate(() => ({
  title: document.title, url: location.href,
  challenged: document.body.innerText.includes("verify you are human"),
  links: [...document.querySelectorAll("a")].map((a) => ({ t: a.innerText.trim(), h: a.href }))
    .filter((x) => x.t && x.h.includes("sellthetrend.com")).slice(0, 80),
}));
console.log("TITLE:", snap.title, "| URL:", snap.url, "| CHALLENGED:", snap.challenged);
console.log("LINKS:");
for (const l of snap.links) console.log("  " + l.t.replace(/\s+/g, " ").slice(0, 38).padEnd(38) + " -> " + l.h.replace("https://www.sellthetrend.com", ""));
await ctx.close(); process.exit(0);
