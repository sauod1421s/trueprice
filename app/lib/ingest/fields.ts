/**
 * توحيد الحقول: أسماء الأعمدة، الأسعار والعملات، التوفر، الحالة،
 * الباركود والتواريخ.
 */

import type { Availability, CanonicalField, Condition, RawRecord, SourceConfig } from "./types";

/** أسماء الأعمدة الشائعة لكل حقل (تُطابق بعد التوحيد: أحرف صغيرة بلا رموز) */
const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  externalId: ["id", "sku", "productid", "offerid", "itemid", "vendorcode", "معرف", "رمزالمنتج"],
  name: ["title", "name", "productname", "producttitle", "model_name", "اسمالمنتج", "الاسم", "المنتج"],
  price: ["price", "currentprice", "regularprice", "listprice", "السعر"],
  salePrice: ["saleprice", "specialprice", "discountprice", "offerprice", "سعرالخصم", "سعرالعرض"],
  currency: ["currency", "currencyid", "currencycode", "العملة"],
  url: ["link", "url", "producturl", "deeplink", "affiliatelink", "trackinglink", "الرابط", "رابطالمنتج"],
  store: ["store", "merchant", "merchantname", "shop", "shopname", "retailer", "seller", "advertiser", "advertisername", "المتجر", "البائع"],
  gtin: ["gtin", "ean", "upc", "barcode", "gtin13", "gtin14", "isbn", "الباركود"],
  mpn: ["mpn", "model", "modelnumber", "partnumber", "manufacturerpartnumber", "رقمالموديل", "الموديل"],
  brand: ["brand", "vendor", "manufacturer", "make", "الشركة", "العلامة", "الماركة", "الشركةالمصنعة"],
  availability: ["availability", "stock", "instock", "stockstatus", "available", "التوفر", "الحالةالتوفر"],
  condition: ["condition", "itemcondition", "حالةالمنتج", "الحالة"],
  updatedAt: ["updated", "updatedat", "lastupdated", "lastmodified", "modified", "date", "pricedate", "تاريخالتحديث"],
};

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/^g:/, "")
    .replace(/[\s_\-.:]/g, "")
    .replace(/[أإآ]/g, "ا");
}

/** يبني خريطة: الحقل الموحّد → اسم العمود الفعلي في الملف */
export function resolveColumns(
  headers: string[],
  source?: Pick<SourceConfig, "columnMap">
): Partial<Record<CanonicalField, string>> {
  const map: Partial<Record<CanonicalField, string>> = {};
  const byNorm = new Map(headers.map((h) => [normalizeHeader(h), h]));

  for (const field of Object.keys(FIELD_ALIASES) as CanonicalField[]) {
    const explicit = source?.columnMap?.[field];
    if (explicit && headers.includes(explicit)) {
      map[field] = explicit;
      continue;
    }
    for (const alias of FIELD_ALIASES[field]) {
      const hit = byNorm.get(normalizeHeader(alias));
      if (hit) {
        map[field] = hit;
        break;
      }
    }
  }
  return map;
}

export function pick(record: RawRecord, column: string | undefined): string {
  return column ? (record[column] ?? "").trim() : "";
}

/* ---------------------------------------------------------------
   السعر والعملة
--------------------------------------------------------------- */

/** العملات المعروفة (ISO 4217 الأكثر شيوعًا في الخليج والعالم) */
const KNOWN_CURRENCIES = new Set([
  "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP", "JOD", "USD", "EUR", "GBP", "CNY", "INR", "TRY",
]);

/** رموز محلية تعني الريال السعودي */
const SAR_ALIASES = ["ر.س", "رس", "ريال", "ريالسعودي", "sr", "sar", "rial", "riyal", "﷼"];

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٫": ".", "٬": ",",
};

export function normalizeCurrency(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const compact = t.toLowerCase().replace(/[\s.]/g, "");
  if (SAR_ALIASES.some((a) => a.replace(/[\s.]/g, "") === compact)) return "SAR";
  const upper = t.toUpperCase();
  if (upper === "RUR") return null;
  return KNOWN_CURRENCIES.has(upper) ? upper : null;
}

/**
 * يقرأ نصوصًا مثل: "1,299.00 SAR" | "SAR 1299" | "١٬٢٩٩ ر.س" | "1299"
 * يعيد الرقم والعملة إن وُجدت داخل النص.
 */
export function parsePrice(raw: string): {
  amount: number | null;
  currency: string | null;
  /** رمز عملة مذكور في النص لكنه غير معروف */
  unknownCurrency: string | null;
} {
  if (!raw || !raw.trim()) return { amount: null, currency: null, unknownCurrency: null };
  let s = raw.trim().replace(/[٠-٩۰-۹٫٬]/g, (c) => ARABIC_DIGITS[c] ?? c);

  // استخراج العملة من النص
  let currency: string | null = null;
  let unknownCurrency: string | null = null;
  const codeMatch = s.match(/\b([A-Za-z]{3})\b/);
  if (codeMatch) {
    currency = normalizeCurrency(codeMatch[1]);
    if (!currency) unknownCurrency = codeMatch[1].toUpperCase();
    s = s.replace(codeMatch[0], " ");
  }
  if (!currency && !unknownCurrency) {
    for (const alias of ["ر.س", "ريال", "﷼", "SR"]) {
      if (s.includes(alias)) {
        currency = "SAR";
        s = s.replace(alias, " ");
      }
    }
  }

  const numeric = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(numeric)) return { amount: null, currency, unknownCurrency };

  // تحديد الفاصل العشري: آخر فاصل يتبعه 1-2 أرقام فقط
  let normalized = numeric;
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  if (lastComma > lastDot && /,\d{1,2}$/.test(numeric)) {
    normalized = numeric.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = numeric.replace(/,/g, "");
  }

  const amount = Number(normalized);
  return { amount: Number.isFinite(amount) ? amount : null, currency, unknownCurrency };
}

/* ---------------------------------------------------------------
   التوفر والحالة
--------------------------------------------------------------- */

export function normalizeAvailability(raw: string): Availability {
  const t = raw.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!t) return "unknown";
  if (["instock", "available", "true", "yes", "1", "متوفر", "متاح", "متوفرة"].includes(t)) return "in_stock";
  if (["outofstock", "soldout", "unavailable", "false", "no", "0", "غيرمتوفر", "نفذ", "نفدت", "غيرمتاح"].includes(t)) return "out_of_stock";
  if (["preorder", "backorder", "حجزمسبق", "طلبمسبق"].includes(t)) return "preorder";
  return "unknown";
}

export function normalizeCondition(raw: string): Condition | null {
  const t = raw.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!t || ["new", "جديد", "جديدة", "brandnew"].includes(t)) return "new";
  if (["used", "مستعمل", "مستعملة", "secondhand", "preowned"].includes(t)) return "used";
  if (["refurbished", "renewed", "مجدد", "مجددة", "openbox"].includes(t)) return "refurbished";
  return null;
}

/* ---------------------------------------------------------------
   الباركود GTIN
--------------------------------------------------------------- */

/** يتحقق من رقم التحقق لـ GTIN-8/12/13/14 */
export function isValidGtin(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  let sum = 0;
  for (let i = body.length - 1, pos = 0; i >= 0; i--, pos++) {
    sum += Number(body[i]) * (pos % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** يوحّد الباركود إلى GTIN-14 (أو null إذا كان غير صالح) */
export function normalizeGtin(raw: string): string | null {
  const digits = raw.replace(/[٠-٩]/g, (c) => ARABIC_DIGITS[c] ?? c).replace(/\D/g, "");
  if (!digits || !isValidGtin(digits)) return null;
  return digits.padStart(14, "0");
}

/** يوحّد رقم الموديل للمقارنة: أحرف كبيرة بدون مسافات أو رموز */
export function normalizeMpn(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/[\s\-_/.]/g, "");
  return t.length >= 3 ? t : null;
}

/* ---------------------------------------------------------------
   التاريخ
--------------------------------------------------------------- */

/** يحوّل التاريخ إلى ISO، أو null إن لم يكن قابلًا للقراءة */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const t = raw.trim();
  // YML يستخدم "YYYY-MM-DD HH:mm"
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) ? t.replace(" ", "T") : t;
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
