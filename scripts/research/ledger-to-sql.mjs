#!/usr/bin/env node
/**
 * يحوّل سجل رصد الأسعار (CSV في data/research/) إلى معاملة SQL واحدة تُنفَّذ بدور الخدمة tp_research
 * عبر research_api (ترحيل 004): عملية استيراد لكل متجر في مصدره research-<store>، بنفس دوال الاستيراد الرسمية
 * register → stage → seal → commit. الأسعار تدخل «غير موثقة» ولا تظهر حتى يعتمدها مشرف بعد فتح الرابط.
 * المصدر يجب أن يكون معتمدًا من المشرف بعد مراجعة شروط الموقع، وإلا ترفض القاعدة الإدخال.
 *
 * أعمدة السجل (رأس إلزامي):
 *   product_id,product_name,store_id,price_sar,list_price_sar,url,observed_at,availability,vat_included,match,notes
 * - product_id: المعرّف الداخلي في القاعدة. product_name: نسخة للتحقق البشري فقط.
 * - url: رابط صفحة المنتج نفسها (https) — لا صفحات بحث ولا مواقع مقارنة.
 * - observed_at: وقت الرصد ISO مع المنطقة (+03:00). vat_included: yes (أسعار التجزئة السعودية شاملة الضريبة).
 * - availability: in_stock فقط إن ظهر زر شراء/إضافة للسلة فعّال؛ وإلا unknown (يُسجَّل ولا يُنشر).
 * - match: ما تمت مطابقته (الموديل/السعة/الذاكرة/الفئة/السنة). notes: ملاحظات.
 *
 * الاستخدام: node scripts/research/ledger-to-sql.mjs data/research/<file>.csv electronics|cars > /tmp/import.sql
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [file, vertical] = process.argv.slice(2);
if (!file || !["electronics", "cars"].includes(vertical)) {
  console.error("usage: ledger-to-sql.mjs <ledger.csv> electronics|cars");
  process.exit(2);
}
const raw = readFileSync(file, "utf8");
const sha = createHash("sha256").update(raw).digest("hex");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((c) => c !== "")) rows.push(row); }
  return rows;
}

const BASE_HEAD = ["product_id", "product_name", "store_id", "price_sar", "list_price_sar", "url", "observed_at", "availability", "vat_included", "match", "notes"];
// السيارات: عمودان إضافيان يطابقان سنة الموديل والفئة المسجلة للمنتج في القاعدة حرفيًا (القاعدة ترفض أي اختلاف)
const HEAD = vertical === "cars" ? [...BASE_HEAD, "model_year", "trim"] : BASE_HEAD;
const [head, ...body] = parseCsv(raw);
if (head.join(",") !== HEAD.join(",")) { console.error("bad header; expected:\n" + HEAD.join(",")); process.exit(1); }

const BLOCKED_HOSTS = /(^|\.)(motory\.com|syarah\.com|hatla2ee\.com|pricena\.com|yaoota\.com|themacindex\.com|getprice|pricespy)/i;
const errors = [];
const seen = new Set();
const rows = body.map((cells, idx) => {
  const r = Object.fromEntries(HEAD.map((h, i) => [h, (cells[i] ?? "").trim()]));
  const line = idx + 2;
  const err = (m) => errors.push(`line ${line}: ${m}`);
  if (!/^\d+$/.test(r.product_id)) err("product_id must be a number");
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(r.store_id)) err("store_id invalid");
  if (!/^\d+(\.\d{1,2})?$/.test(r.price_sar) || Number(r.price_sar) <= 0) err("price_sar invalid");
  if (r.list_price_sar && !/^\d+(\.\d{1,2})?$/.test(r.list_price_sar)) err("list_price_sar invalid");
  let u;
  try { u = new URL(r.url); } catch { err("url invalid"); }
  if (u && u.protocol !== "https:") err("url must be https");
  if (u && BLOCKED_HOSTS.test(u.hostname)) err(`comparison/aggregator site not allowed as source: ${u.hostname}`);
  if (u && /[?&](q|k|query|search)=|\/search/i.test(u.pathname + u.search)) err("search pages are not evidence; use the product page");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+03:00$/.test(r.observed_at)) err("observed_at must be ISO with +03:00");
  else if (Date.parse(r.observed_at) > Date.now() + 5 * 60_000) err("observed_at in the future");
  if (!["in_stock", "out_of_stock", "unknown"].includes(r.availability)) err("availability invalid");
  if (r.vat_included !== "yes") err("vat_included must be yes (Saudi retail prices include VAT)");
  if (r.match.length < 3) err("match note required");
  if (vertical === "cars" && (!/^(19|20)\d\d$/.test(r.model_year) || !r.trim)) err("cars need model_year and trim matching the product");
  const key = `${r.product_id}|${r.store_id}`;
  if (seen.has(key)) err(`duplicate product/store ${key}`);
  seen.add(key);
  const canonical = u ? `${u.origin}${u.pathname}`.replace(/\/+$/, "") : "";
  return {
    store_id: r.store_id,
    offer_key: `research-p${r.product_id}-${r.store_id}`,
    condition: "new",
    amount: r.price_sar,
    ...(r.list_price_sar ? { list_amount: r.list_price_sar } : {}),
    currency: "SAR",
    as_of: r.observed_at,
    availability: r.availability,
    name: r.product_name,
    url: r.url,
    canonical_url: canonical,
    product_id: r.product_id,
    date_confirmed: true,
    evidence: { vat_included: true, match: r.match, notes: r.notes || null, researcher: "assisted-research" },
    ...(vertical === "cars" ? { car: { model_year: r.model_year, trim: r.trim, seller_type: "dealer" } } : {}),
  };
});
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
if (!rows.length) { console.error("no rows"); process.exit(1); }

const name = basename(file);
const byStore = new Map();
for (const r of rows) byStore.set(r.store_id, [...(byStore.get(r.store_id) ?? []), r]);
const blocks = [...byStore.entries()].map(([store, list]) => {
  const json = JSON.stringify(list);
  if (json.includes("$tp_rows$")) { console.error("delimiter collision"); process.exit(1); }
  const fileName = `${name}#${store}`;
  const fileSha = createHash("sha256").update(`${sha}:${store}:${json}`).digest("hex");
  return `-- ${store}: ${list.length} rows → research-${store}
do $tp_import$
declare v_run uuid; v_sha text; v_res jsonb;
begin
  v_run := research_api.register_import('research-${store}', '${fileName}', ${Buffer.byteLength(json)}, '${fileSha}', ${list.length});
  perform research_api.stage_rows(v_run, 1, $tp_rows$${json}$tp_rows$::jsonb);
  v_sha := research_api.seal_import(v_run, ${list.length});
  v_res := research_api.commit_import(v_run, v_sha);
  raise notice 'research-${store}: run % committed %', v_run, v_res;
end $tp_import$;`;
});
process.stdout.write(`-- ${name} sha256=${sha} rows=${rows.length} stores=${byStore.size}
-- يُنفَّذ بدور الخدمة tp_research (لا يقرأ ولا يعدّل أي جدول ولا يعتمد): الأسعار تدخل غير موثقة حتى يعتمدها مشرف.
begin;
set local role tp_research;
${blocks.join("\n")}
commit;
select r.source_id, r.status, (select count(*) from tp.price_observations o where o.import_run_id = r.id) as observations
from tp.import_runs r join tp.import_files f on f.id = r.file_id
where f.file_name like '${name}#%' order by r.source_id;
`);
