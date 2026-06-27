// Generate a DETAILED PDF report from live catnip data (demo of the engine).
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { buildReportHtml, renderPdf } from "./report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.join(__dirname, "reports");
if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });

const keyword = "catnip";
const products = [
  { name: "Natural Plush Catnip Mice", price: "$19.99", orders: "3,795", sales: "$75,862" },
  { name: "Cat Teething Catnip Toy Set", price: "$14.87", orders: "271", sales: "$4,030" },
  { name: "Catnip Wall Ball Toy", price: "$12.95", orders: "224", sales: "$2,901" },
  { name: "Cat Massager Brush + Catnip", price: "$12.99", orders: "16", sales: "$208" },
  { name: "Interactive Cat Toy with Catnip", price: "Non-USD", orders: "42", sales: null },
  { name: "Sterling Whiskers™ Catnip & Silvervine Chew", price: "$12.49", orders: null, sales: null },
  { name: "Natural Mint Catnip Lick Ball", price: "$17.06", orders: null, sales: null },
  { name: "Meowijuana Catnip Spray", price: "$10.49", orders: null, sales: null },
  { name: "Rosewood Catnip Trout Cat Toy", price: "Non-USD", orders: null, sales: null },
];

const deep = [{
  name: "Catnip Wall Ball Toy",
  image: "https://cdn.shopify.com/s/files/1/0782/5132/7724/files/zedapaw-catnip-wall-ball-toy-1194913055.webp",
  cost: "$2.75", price: "$12.95", profit: "$10.20", orders: "224", sales: "$2,901",
  competition: "3% (Low competition)",
  insights: [
    "Low competition: Product is not over saturated in the market.",
    "In a popular niche: niche is in the top 10 niches on Sell The Trend.",
    "Losing interest: last added to a store over 2 months ago.",
    "Tight profit margin: ~$10.30 — add shipping or upsells/cross-sells.",
    "Not a new product: added to Sell The Trend over 9 months ago.",
  ],
  trend: { d30: "5", d14: "5", d7: "0" },
  stores: [
    { name: "zedapaw.shop", url: "https://zedapaw.shop/products/products-catnip-wall-ball-toy", revenue: "$1,155/m" },
    { name: "sellcenter369.com", url: "https://sellcenter369.com/products/the-catnip-cat-wall-stick-on-ball-toy-scratchers-treats-healthy-natural", revenue: "$4,640/m" },
  ],
  supplierUrls: [
    { name: "Nice House Store (AliExpress)", url: "https://www.aliexpress.com/item/3256811434346320.html" },
    { name: "One Pet Accessories (AliExpress)", url: "https://www.aliexpress.com/item/3256808172932433.html" },
  ],
  fbAdsUrl: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=Catnip+Wall+Ball+Toy",
  targeting: { interests: ["Cats", "Friskies", "Whiskas", "Grumpy Cat", "Must Love Cats", "Cat play and toys", "AKC"], gender: "Both", age: "18-65", occupation: "Veterinarian, Pet Groomer" },
}];

const recommendation =
  "<b>Recommendation for Whiskl:</b> lead with a catnip plush/kicker at ~$19.99 (proven by Natural Plush Catnip Mice: 3,795 orders / $75,862). " +
  "Catnip economics are excellent — ~$2.75 cost, ~$10 profit, only 3% competition. Differentiate with the <b>refillable</b> design + silvervine, " +
  "and monetize repeats via Whiskl Nip refills, Bliss spray (Meowijuana $10.49), and silvervine chew (Sterling Whiskers $12.49).";

const html = buildReportHtml(keyword, products, { recommendation, deep });
const out = path.join(REPORTS, `winning-product-report-${keyword}-detailed-${Date.now()}.pdf`);
await renderPdf(html, out);
console.log("PDF created:", out, "(" + Math.round(fs.statSync(out).size / 1024) + " KB)");
process.exit(0);
