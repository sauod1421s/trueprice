/**
 * تحويل إدخال المشرف (نموذج سعر واحد أو CSV صغير) إلى صفوف استيراد للقاعدة.
 * منطق خالص بلا اتصال بالقاعدة — يُختبر وحده. يعيد استخدام محللات المرحلة 1
 * (parseCsvRows / parsePrice / parseTimestamp / canonicalProductUrl).
 *
 * قواعد MVP:
 *  - الريال السعودي فقط (العملات الأخرى تُرفض برسالة واضحة؛ التحويل معطّل مؤقتًا).
 *  - حتى MVP_MAX_ROWS صف في المرة الواحدة (الاستيراد الضخم معطّل مؤقتًا).
 *  - المنتج والمتجر يُحددان صراحة (product_id و store_id) — لا مطابقة بالاسم.
 */
import { DEFAULT_LIMITS } from "../ingest/limits";
import { parseCsv } from "../ingest/csv";
import { normalizeAvailability, parsePrice, parseTimestamp } from "../ingest/fields";
import { canonicalProductUrl } from "../ingest/stores";
import type { Availability } from "../ingest/types";

export const MVP_MAX_ROWS = 1000;
export const MVP_MAX_BYTES = 512 * 1024;

/** الصف كما تستقبله admin_api.stage_import_rows */
export type StageRow = {
  store_id: string;
  offer_key: string;
  condition: "new";
  amount: string;
  currency: "SAR";
  list_amount?: string;
  as_of: string;
  availability: Availability;
  name: string;
  url: string;
  canonical_url: string;
  /** المعرّف الداخلي في القاعدة (يُحوَّل من المعرّف العام قبل الرفع) */
  product_id: string;
  date_confirmed: boolean;
};

/** ما يدخله المشرف قبل تحويل معرّف المنتج العام إلى الداخلي */
export type DraftRow = Omit<StageRow, "product_id"> & { publicProductId: number; line: number };

export type RowError = { line: number; message: string };

export type ProductRef = { publicId: number; name: string };

const OFFER_KEY = /^[a-z0-9][a-z0-9._-]{0,119}$/i;

function slugPart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
}

export type RawPriceInput = {
  line: number;
  productId: string;
  storeId: string;
  price: string;
  currency?: string;
  listPrice?: string;
  url: string;
  asOf?: string;
  availability?: string;
  offerKey?: string;
  name?: string;
};

/** يتحقق من صف واحد ويعيد صفًا جاهزًا أو أخطاءه */
export function draftRow(
  input: RawPriceInput,
  ctx: { products: ReadonlyMap<number, ProductRef>; stores: ReadonlySet<string>; now: Date }
): { row: DraftRow | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const err = (message: string) => errors.push({ line: input.line, message });

  const publicId = Number(input.productId.trim());
  const product = Number.isSafeInteger(publicId) ? ctx.products.get(publicId) : undefined;
  if (!product) err(`رقم المنتج "${input.productId}" غير موجود في الكتالوج`);

  const storeId = input.storeId.trim().toLowerCase();
  if (!ctx.stores.has(storeId)) err(`المتجر "${input.storeId}" غير مسجل أو غير نشط`);

  const currency = (input.currency ?? "").trim().toUpperCase();
  if (currency && currency !== "SAR" && currency !== "ر.س" && currency !== "ريال") {
    err(`العملة ${currency} غير مدعومة في MVP: الأسعار بالريال السعودي فقط (تحويل العملات معطّل مؤقتًا)`);
  }

  const price = parsePrice(input.price, "SAR");
  let amount: number | null = null;
  if (!price.ok) err(`السعر "${input.price}" غير صالح`);
  else if (price.currency && price.currency !== "SAR") err(`السعر بعملة ${price.currency}: الريال فقط في MVP`);
  else if (price.amount <= 0 || price.amount > 10_000_000) err("السعر خارج النطاق المقبول");
  else amount = price.amount;

  let listAmount: number | null = null;
  if (input.listPrice && input.listPrice.trim()) {
    const lp = parsePrice(input.listPrice, "SAR");
    if (!lp.ok || (lp.currency && lp.currency !== "SAR")) err("السعر قبل الخصم غير صالح");
    else listAmount = lp.amount;
  }

  const canonical = canonicalProductUrl(input.url.trim());
  if (!canonical || !/^https:\/\//.test(input.url.trim())) err("الرابط يجب أن يبدأ بـ https://");

  let asOf = ctx.now.toISOString();
  if (input.asOf && input.asOf.trim()) {
    const t = parseTimestamp(input.asOf, "Asia/Riyadh");
    if (!t.ok) err(`تاريخ السعر "${input.asOf}" غير صالح (استخدم صيغة 2026-11-07T10:00+03:00)`);
    else if (Date.parse(t.value.utc) > ctx.now.getTime() + 10 * 60_000) err("تاريخ السعر في المستقبل");
    else asOf = t.value.utc;
  }

  const offerKey = (input.offerKey ?? "").trim() || `${storeId}-p${publicId}`;
  if (!OFFER_KEY.test(offerKey)) err("مفتاح العرض يحتوي أحرفًا غير مسموحة");

  if (errors.length || !product || amount === null || !canonical) return { row: null, errors };

  return {
    errors,
    row: {
      line: input.line,
      publicProductId: publicId,
      store_id: storeId,
      offer_key: offerKey,
      condition: "new",
      amount: amount.toFixed(2),
      currency: "SAR",
      ...(listAmount !== null && listAmount > amount ? { list_amount: listAmount.toFixed(2) } : {}),
      as_of: asOf,
      availability: input.availability ? normalizeAvailability(input.availability) : "in_stock",
      name: (input.name ?? "").trim() || product.name,
      url: input.url.trim(),
      canonical_url: canonical,
      date_confirmed: true,
    },
  };
}

const HEADER_ALIASES: Record<string, keyof Omit<RawPriceInput, "line">> = {
  product_id: "productId", "رقم المنتج": "productId",
  store_id: "storeId", "المتجر": "storeId",
  price: "price", "السعر": "price",
  currency: "currency", "العملة": "currency",
  list_price: "listPrice",
  url: "url", "الرابط": "url",
  as_of: "asOf", "تاريخ السعر": "asOf",
  availability: "availability", "التوفر": "availability",
  offer_key: "offerKey",
  name: "name",
};

/** CSV صغير بأعمدة صريحة: product_id, store_id, price, url (+ currency, as_of, availability, list_price) */
export function draftRowsFromCsv(
  text: string,
  ctx: { products: ReadonlyMap<number, ProductRef>; stores: ReadonlySet<string>; now: Date }
): { rows: DraftRow[]; errors: RowError[] } {
  if (new TextEncoder().encode(text).length > MVP_MAX_BYTES) {
    return { rows: [], errors: [{ line: 0, message: `حجم الملف أكبر من ${MVP_MAX_BYTES / 1024} كيلوبايت (الاستيراد الضخم معطّل مؤقتًا في MVP)` }] };
  }
  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(text, { ...DEFAULT_LIMITS, maxRows: MVP_MAX_ROWS + 1 });
  } catch (e) {
    const tooMany = e instanceof Error && /صف|rows/i.test(e.message);
    return {
      rows: [],
      errors: [{ line: 0, message: tooMany ? `أكثر من ${MVP_MAX_ROWS} صف: الاستيراد الضخم معطّل مؤقتًا في MVP` : `تعذّر قراءة الملف: ${e instanceof Error ? e.message : "خطأ"}` }],
    };
  }
  const { headers, records, rowErrors } = parsed;
  const map = new Map<string, keyof Omit<RawPriceInput, "line">>();
  for (const h of headers) {
    const key = HEADER_ALIASES[h.trim().toLowerCase()] ?? HEADER_ALIASES[h.trim()];
    if (key) map.set(h, key);
  }
  const missing = (["productId", "storeId", "price", "url"] as const).filter((k) => ![...map.values()].includes(k));
  if (missing.length) {
    return { rows: [], errors: [{ line: 1, message: `أعمدة مطلوبة مفقودة: product_id, store_id, price, url` }] };
  }
  if (records.length > MVP_MAX_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `أكثر من ${MVP_MAX_ROWS} صف: الاستيراد الضخم معطّل مؤقتًا في MVP` }] };
  }

  const errors: RowError[] = rowErrors.map((e) => ({ line: e.row, message: e.message }));
  const rows: DraftRow[] = [];
  for (const { row, record } of records) {
    const input: RawPriceInput = { line: row, productId: "", storeId: "", price: "", url: "" };
    for (const [header, key] of map) (input as Record<string, unknown>)[key] = record[header] ?? "";
    const r = draftRow(input, ctx);
    errors.push(...r.errors);
    if (r.row) rows.push(r.row);
  }
  if (rows.length === 0 && errors.length === 0) errors.push({ line: 0, message: "الملف لا يحتوي صفوفًا" });
  return { rows, errors };
}

export { slugPart };
