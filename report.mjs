// Report engine: parse NEXUS list + per-product detail → detailed, decision-ready PDF.
import { chromium } from "playwright";

const num = (s) => (s ? Number(String(s).replace(/[^0-9.]/g, "")) || 0 : 0);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

/** Parse the NEXUS results grid innerText → list of {name, price, orders, sales}. */
export function parseProducts(text) {
  const L = text.split("\n").map((s) => s.trim());
  const out = [], seen = new Set();
  for (let i = 0; i < L.length; i++) {
    if (L[i] !== "Orders") continue;
    const price = L[i - 1] || "", name = L[i - 2] || "";
    if (!name || name.length < 3 || name.length > 160) continue;
    let j = i + 1, orders = null;
    if (/^[\d,]+$/.test(L[j])) { orders = L[j]; j++; }
    let sales = null;
    if (L[j] === "Sales") { const sv = L[j + 1] || ""; sales = /^\$/.test(sv) ? sv : (sv === "Non-USD" || sv.startsWith("No Orders") ? sv : null); }
    const key = name.toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    out.push({ name, price: /^\$/.test(price) ? price : price === "Non-USD" ? "Non-USD" : null, orders, sales });
  }
  return out;
}

/** Parse a single product's NEXUS detail modal innerText + links/images → rich dossier. */
export function parseProductDetail(name, text, links = [], imgs = []) {
  const L = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const before = (label) => { const i = L.indexOf(label); return i > 0 ? L[i - 1] : null; };
  const after = (label) => { const i = L.indexOf(label); return i >= 0 && i < L.length - 1 ? L[i + 1] : null; };
  const comp = (() => { const i = L.findIndex((l) => /^Low competition$|^Medium competition$|^High competition$/.test(l)); return i > 0 ? `${L[i - 1]} (${L[i]})` : null; })();
  const insights = L.filter((l) => /^(Low competition|Medium competition|High competition|In a popular niche|Losing interest|Gaining interest|Tight profit margin|Healthy profit margin|Not a new product|New product):/.test(l));
  const product = imgs.find((s) => /^https?:/.test(s) && /cdn\.shopify|\.webp|\.jpg|\.jpeg|\.png/.test(s) && !/flags|rating|assets\/images|ali\.png/.test(s));
  const stores = links.filter((x) => x.h && /\/products\//.test(x.h) && !/sellthetrend|aliexpress/.test(x.h)).map((x) => ({ name: x.t, url: x.h }));
  const suppliers = links.filter((x) => /aliexpress\.com\/item/.test(x.h)).map((x) => ({ name: x.t, url: x.h }));
  const fbAds = (links.find((x) => /facebook\.com\/ads\/library/.test(x.h)) || {}).h || null;
  // revenue lines like "$1,155/m"
  const revenues = L.filter((l) => /\$[\d,]+\/m/.test(l));
  stores.forEach((s, i) => { if (revenues[i]) s.revenue = revenues[i]; });
  const interestsStart = L.indexOf("Interest"), audStart = L.indexOf("Audience Details");
  const interests = interestsStart >= 0 && audStart > interestsStart ? L.slice(interestsStart + 1, audStart).filter((x) => x.length < 30 && !/Magazines|Jobs|Societies|Public Figures/.test(x)).slice(0, 12) : [];
  return {
    name, image: product || null,
    cost: before("Product cost"), price: before("Selling price"), profit: before("Profit margin"),
    orders: before("Orders"), sales: before("Total sales"),
    suppliersCount: before("# of suppliers"), storesCount: before("# stores selling"),
    competition: comp, insights,
    trend: { d30: after("Total last 30 days"), d14: after("Total last 14 days"), d7: after("Total last 7 days") },
    stores, supplierUrls: suppliers, fbAdsUrl: fbAds,
    targeting: { interests, gender: after("Gender"), age: after("Age"), occupation: after("Occupation") },
  };
}

function dossier(d) {
  const econ = [["Product cost", d.cost], ["Selling price", d.price], ["Profit / unit", d.profit], ["Orders", d.orders ? Number(String(d.orders).replace(/,/g, "")).toLocaleString() : "—"], ["Total sales", d.sales], ["Competition", d.competition]];
  return `<section class="dossier">
    <div class="dhead">
      ${d.image ? `<img class="pimg" src="${esc(d.image)}">` : `<div class="pimg ph">🐾</div>`}
      <div><div class="brand">Product dossier</div><h2>${esc(d.name)}</h2>
        ${d.competition ? `<span class="chip ${/Low/.test(d.competition) ? "good" : ""}">${esc(d.competition)}</span>` : ""}
      </div>
    </div>
    <div class="grid">${econ.map(([k, v]) => `<div class="cell"><div class="k">${k}</div><div class="v">${esc(v || "—")}</div></div>`).join("")}</div>
    ${d.trend && (d.trend.d30 || d.trend.d7) ? `<p class="mini"><b>Order velocity:</b> 30d ${esc(d.trend.d30 || "—")} · 14d ${esc(d.trend.d14 || "—")} · 7d ${esc(d.trend.d7 || "—")}</p>` : ""}
    ${d.insights?.length ? `<h3>AI insights</h3><ul class="ins">${d.insights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${d.stores?.length ? `<h3>Stores already selling it</h3><table><thead><tr><th>Store</th><th>Est. revenue</th><th>Page (ad copy · pics · reviews)</th></tr></thead><tbody>${d.stores.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.revenue || "—")}</td><td><a href="${esc(s.url)}">${esc(s.url.replace(/^https?:\/\//, "").slice(0, 46))}</a></td></tr>`).join("")}</tbody></table>` : ""}
    ${d.supplierUrls?.length ? `<h3>Suppliers (cost · reviews · video)</h3><ul class="lnk">${d.supplierUrls.map((s) => `<li>🛒 <a href="${esc(s.url)}">${esc(s.name || s.url)}</a></li>`).join("")}</ul>` : ""}
    <h3>Ad & creative intelligence</h3>
    <ul class="lnk">
      ${d.fbAdsUrl ? `<li>📣 <a href="${esc(d.fbAdsUrl)}">Live Facebook ad copy + videos (Ad Library)</a></li>` : ""}
      ${d.targeting?.interests?.length ? `<li>🎯 <b>FB targeting:</b> ${d.targeting.interests.map(esc).join(", ")}</li>` : ""}
      ${d.targeting?.age ? `<li>👤 <b>Audience:</b> ${esc(d.targeting.gender || "")} · ${esc(d.targeting.age || "")} · ${esc(d.targeting.occupation || "")}</li>` : ""}
    </ul>
  </section>`;
}

/** Build the detailed report HTML. products = list rows; meta.deep = [dossier objects]. */
export function buildReportHtml(keyword, products, meta = {}) {
  const dated = meta.date || new Date().toISOString().slice(0, 10);
  const totalOrders = products.reduce((a, p) => a + num(p.orders), 0);
  const totalSales = products.reduce((a, p) => a + num(p.sales), 0);
  const top = products.filter((p) => num(p.orders) > 0).sort((a, b) => num(b.sales) - num(a.sales))[0];
  const rows = products.map((p, i) => `<tr><td class="rank">${i + 1}</td><td class="nm">${esc(p.name)}</td><td class="c">${esc(p.price || "—")}</td><td class="c">${p.orders ? Number(String(p.orders).replace(/,/g, "")).toLocaleString() : "—"}</td><td class="c">${p.sales && p.sales.startsWith("$") ? esc(p.sales) : "—"}</td></tr>`).join("");
  const deep = (meta.deep || []).map(dossier).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1b19}
  .page{padding:34px 40px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6BB1A8;padding-bottom:16px}
  .brand{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#4f938b}
  h1{font-size:29px;font-weight:800;margin-top:6px;letter-spacing:-.02em}h1 span{color:#EBA17C}
  .meta{text-align:right;font-size:11.5px;color:#6b675f;line-height:1.7}
  .stats{display:flex;gap:12px;margin:20px 0}
  .stat{flex:1;border:1px solid #eadfce;border-radius:12px;padding:13px 15px;background:#FBF7F1}
  .stat .k{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#8a8479;font-weight:700}
  .stat .v{font-size:21px;font-weight:800;margin-top:3px}
  .lead{background:#232220;color:#FBF7F1;border-radius:14px;padding:16px 18px;margin:4px 0 18px}
  .lead .k{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#EBA17C;font-weight:700}
  .lead .v{font-size:18px;font-weight:700;margin-top:4px}.lead .sub{font-size:12.5px;color:#cfc7ba;margin-top:5px}
  h2{font-size:18px;font-weight:800;letter-spacing:-.01em}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#4f938b;margin:16px 0 7px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
  th{text-align:left;background:#F3ECE2;padding:8px 9px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#6b675f}
  td{padding:7px 9px;border-bottom:1px solid #efe7da;vertical-align:top}
  td.c{text-align:right;font-variant-numeric:tabular-nums}td.rank{color:#b3a999;font-weight:700;width:22px}td.nm{font-weight:600}
  a{color:#4f938b;text-decoration:none;word-break:break-all}
  .dossier{margin-top:26px;padding-top:20px;border-top:2px solid #eadfce;page-break-inside:avoid}
  .dhead{display:flex;gap:16px;align-items:center}
  .pimg{width:96px;height:96px;border-radius:14px;object-fit:cover;border:1px solid #eadfce;background:#F3ECE2;flex:none}
  .pimg.ph{display:flex;align-items:center;justify-content:center;font-size:34px}
  .chip{display:inline-block;margin-top:6px;font-size:10px;font-weight:800;text-transform:uppercase;background:#e7ded2;color:#5b554d;padding:3px 9px;border-radius:20px}
  .chip.good{background:#6BB1A8;color:#fff}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
  .cell{border:1px solid #eadfce;border-radius:10px;padding:9px 11px;background:#FBF7F1}
  .cell .k{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#8a8479;font-weight:700}
  .cell .v{font-size:16px;font-weight:800;margin-top:2px}
  .mini{font-size:12px;color:#5b554d;margin-top:10px}
  ul.ins,ul.lnk{margin:2px 0 0 0;padding-left:16px;font-size:12px;line-height:1.6}
  ul.lnk{list-style:none;padding-left:0}ul.lnk li{margin-bottom:3px}
  .rec{margin-top:18px;border-left:4px solid #6BB1A8;padding:8px 0 8px 16px;font-size:13px}.rec b{color:#4f938b}
  .note{margin-top:18px;font-size:10.5px;color:#8a8479;line-height:1.6;border-top:1px solid #efe7da;padding-top:11px}
  </style></head><body><div class="page">
    <div class="top"><div><div class="brand">Winning Product Report · detailed</div><h1>${esc(cap(keyword))} <span>· niche dossier</span></h1></div>
      <div class="meta"><b>Source:</b> Sell The Trend · NEXUS AI<br><b>Date:</b> ${dated}<br><b>Products:</b> ${products.length} · <b>Deep-dived:</b> ${(meta.deep || []).length}</div></div>
    <div class="stats"><div class="stat"><div class="k">Products scanned</div><div class="v">${products.length}</div></div>
      <div class="stat"><div class="k">Total orders</div><div class="v">${totalOrders.toLocaleString()}</div></div>
      <div class="stat"><div class="k">Total tracked sales</div><div class="v">$${totalSales.toLocaleString()}</div></div></div>
    ${top ? `<div class="lead"><div class="k">Top proven winner</div><div class="v">${esc(top.name)}</div><div class="sub">Sells at ${esc(top.price)} · ${Number(String(top.orders).replace(/,/g, "")).toLocaleString()} orders · ${esc(top.sales)} tracked sales</div></div>` : ""}
    <h3>All ${esc(keyword)} products (by tracked sales)</h3>
    <table><thead><tr><th>#</th><th>Product</th><th>Sell</th><th>Orders</th><th>Sales</th></tr></thead><tbody>${rows}</tbody></table>
    ${meta.recommendation ? `<div class="rec">${meta.recommendation}</div>` : ""}
    ${deep}
    <div class="note">Generated from live Sell The Trend NEXUS data via sellthetrend-mcp. Embedded image is the competing store's product photo. Linked store pages are live sales pages (model the ad copy, pics, reviews). Supplier links are AliExpress listings (cost, customer reviews, demo video). The Facebook Ad Library link shows live ad creatives + videos. Figures are platform estimates — validate landed cost + saturation before committing budget.</div>
  </div></body></html>`;
}

/** Render HTML to PDF via an ephemeral headless browser (works while the main browser is headful). */
export async function renderPdf(html, outPath) {
  const b = await chromium.launch({ headless: true });
  try {
    const p = await b.newPage();
    await p.setContent(html, { waitUntil: "networkidle" });
    await p.pdf({ path: outPath, format: "A4", printBackground: true });
    return outPath;
  } finally { await b.close(); }
}
