/**
 * توحيد الحقول: أسماء الأعمدة، الأسعار والعملات، التوفر، الحالة،
 * الباركود والتواريخ.
 *
 * المبدأ: ما لا يمكن تفسيره بثقة يُرفض مع سبب واضح، ولا يُخمَّن.
 */

import type {
  Availability,
  CanonicalField,
  Condition,
  ParsedTimestamp,
  RawRecord,
  SourceConfig,
} from "./types";

/* ---------------------------------------------------------------
   أسماء الأعمدة
--------------------------------------------------------------- */

/** أسماء الأعمدة الشائعة لكل حقل (تُطابق بعد التوحيد: أحرف صغيرة بلا رموز) */
const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  externalId: ["id", "sku", "productid", "offerid", "itemid", "vendorcode", "معرف", "رمزالمنتج"],
  name: ["title", "name", "productname", "producttitle", "اسمالمنتج", "الاسم", "المنتج"],
  price: ["price", "currentprice", "regularprice", "listprice", "السعر"],
  salePrice: ["saleprice", "specialprice", "discountprice", "offerprice", "سعرالخصم", "سعرالعرض"],
  currency: ["currency", "currencyid", "currencycode", "العملة"],
  url: ["link", "url", "producturl", "deeplink", "affiliatelink", "trackinglink", "الرابط", "رابطالمنتج"],
  // المتجر = الجهة التي يُشترى منها (نون، جرير...). البائع حقل منفصل.
  store: ["store", "merchantname", "merchant", "shop", "shopname", "retailer", "advertiser", "advertisername", "المتجر"],
  seller: ["seller", "sellername", "marketplaceseller", "soldby", "البائع"],
  gtin: ["gtin", "ean", "upc", "barcode", "gtin13", "gtin14", "isbn", "الباركود"],
  mpn: ["mpn", "model", "modelnumber", "partnumber", "manufacturerpartnumber", "رقمالموديل", "الموديل"],
  brand: ["brand", "vendor", "manufacturer", "make", "الشركة", "العلامة", "الماركة", "الشركةالمصنعة"],
  availability: ["availability", "stock", "instock", "stockstatus", "available", "التوفر"],
  condition: ["condition", "itemcondition", "حالةالمنتج", "الحالة"],
  updatedAt: ["updated", "updatedat", "lastupdated", "lastmodified", "modified", "pricedate", "تاريخالتحديث"],
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
  const used = new Set<string>();

  // الربط الصريح أولًا
  for (const [field, col] of Object.entries(source?.columnMap ?? {}) as [CanonicalField, string][]) {
    if (col && headers.includes(col)) {
      map[field] = col;
      used.add(col);
    }
  }

  for (const field of Object.keys(FIELD_ALIASES) as CanonicalField[]) {
    if (map[field]) continue;
    for (const alias of FIELD_ALIASES[field]) {
      const hit = byNorm.get(normalizeHeader(alias));
      if (hit && !used.has(hit)) {
        map[field] = hit;
        used.add(hit);
        break;
      }
    }
  }

  // في YML: "price" هو السعر الحالي و "oldprice" هو السعر قبل الخصم
  const oldPrice = byNorm.get("oldprice");
  if (oldPrice && !source?.columnMap?.price && !source?.columnMap?.salePrice && map.price && !map.salePrice) {
    map.salePrice = map.price;
    map.price = oldPrice;
  }
  return map;
}

export function pick(record: RawRecord, column: string | undefined): string {
  return column ? (record[column] ?? "").trim() : "";
}

/* ---------------------------------------------------------------
   العملات
--------------------------------------------------------------- */

/** العملات المعروفة وعدد خاناتها العشرية (ISO 4217) */
export const CURRENCY_MINOR_UNITS: Record<string, number> = {
  SAR: 2, AED: 2, QAR: 2, EGP: 2, USD: 2, EUR: 2, GBP: 2, CNY: 2, INR: 2, TRY: 2,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3,
};

/** رموز محلية تعني الريال السعودي */
const SAR_ALIASES = new Set(["ر.س", "رس", "ريال", "ريالسعودي", "ريالات", "sr", "sar", "rial", "riyal", "riyals", "﷼"]);

function compactCurrencyToken(t: string): string {
  return t.toLowerCase().replace(/[\s.]/g, "");
}

export function normalizeCurrency(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const compact = compactCurrencyToken(t);
  if ([...SAR_ALIASES].some((a) => compactCurrencyToken(a) === compact)) return "SAR";
  const upper = t.toUpperCase().replace(/\.$/, "");
  return upper in CURRENCY_MINOR_UNITS ? upper : null;
}

/* ---------------------------------------------------------------
   الأسعار — قواعد صارمة
--------------------------------------------------------------- */

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٫": ".", "٬": ",",
};

export type PriceFailure =
  | "empty"
  | "scientific"
  | "extra_text"
  | "ambiguous"
  | "invalid_format"
  | "multiple_numbers"
  | "conflicting_currency"
  | "too_many_decimals";

export type PriceParse =
  | { ok: true; amount: number; currency: string | null }
  | { ok: false; reason: PriceFailure; currency: string | null; unknownCurrency: string | null };

export const PRICE_FAILURE_MESSAGE: Record<PriceFailure, string> = {
  empty: "السعر مفقود",
  scientific: "صيغة علمية غير مقبولة (مثل 1e3)",
  extra_text: "السعر يحتوي نصًا غير مفهوم",
  ambiguous: "فواصل السعر ملتبسة (آلاف أم كسور؟)",
  invalid_format: "صيغة السعر غير مقروءة",
  multiple_numbers: "يحتوي أكثر من رقم (مثل نطاق سعري)",
  conflicting_currency: "يحتوي عملتين مختلفتين",
  too_many_decimals: "خانات عشرية أكثر مما تسمح به العملة",
};

/**
 * يقرأ نصوصًا مثل: "1,299.00 SAR" | "SAR 1299" | "١٬٩٤٩ ر.س" | "1.299,50 SAR"
 *
 * قاعدة الالتباس: فاصل واحد يتبعه 3 أرقام تمامًا ("1.299" أو "1,299") يُفسَّر
 * كفاصل آلاف فقط إذا كانت العملة معروفة وخاناتها العشرية 2 (مثل الريال)،
 * لأن 3 خانات عشرية مستحيلة فيها. غير ذلك = ملتبس ويُرفض.
 */
export function parsePrice(raw: string, currencyHint?: string | null): PriceParse {
  const fail = (reason: PriceFailure, currency: string | null = null, unknownCurrency: string | null = null): PriceParse => ({
    ok: false,
    reason,
    currency,
    unknownCurrency,
  });

  if (!raw || !raw.trim()) return fail("empty");
  let s = raw
    .replace(/[٠-٩۰-۹٫٬]/g, (c) => ARABIC_DIGITS[c] ?? c)
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .trim();

  if (/\d\s*[eE]\s*[+-]?\d/.test(s)) return fail("scientific");

  // استخراج رموز العملة وأي نص آخر
  let currency: string | null = null;
  let unknownCurrency: string | null = null;
  const tokens = s.match(/[A-Za-z\u0600-\u06FF﷼]+(?:\.[A-Za-z\u0600-\u06FF]+)*\.?/g) ?? [];
  for (const token of tokens) {
    const c = normalizeCurrency(token);
    if (c) {
      if (currency && currency !== c) return fail("conflicting_currency", currency);
      currency = c;
    } else if (/^[A-Za-z]{3}$/.test(token)) {
      unknownCurrency = token.toUpperCase();
    } else {
      return fail("extra_text", currency, unknownCurrency);
    }
    s = s.replace(token, " ");
  }
  if (unknownCurrency) return fail("extra_text", currency, unknownCurrency);

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return fail("empty", currency);

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }
  if (/[-–]/.test(s)) return fail("multiple_numbers", currency);
  if (!/^[\d.,\s]+$/.test(s)) return fail("invalid_format", currency);

  const effectiveCurrency = currency ?? (currencyHint ? normalizeCurrency(currencyHint) : null);
  const minorUnits = effectiveCurrency ? CURRENCY_MINOR_UNITS[effectiveCurrency] : undefined;

  let value: number | null = null;

  if (s.includes(" ")) {
    // تجميع بالمسافات: "1 299" أو "1 299,50"
    const m = s.match(/^(\d{1,3}(?: \d{3})+)(?:[.,](\d{1,3}))?$/);
    if (!m) return fail("multiple_numbers", currency);
    value = Number(m[1].replace(/ /g, "") + (m[2] ? `.${m[2]}` : ""));
    if (m[2] && minorUnits !== undefined && m[2].length > minorUnits) return fail("too_many_decimals", currency);
  } else if (/^\d+$/.test(s)) {
    value = Number(s);
  } else if (/^\d{1,3}[.,]\d{3}$/.test(s)) {
    // "1.299" / "1,299": ملتبس إلا مع عملة خاناتها 2
    if (minorUnits !== 2) return fail("ambiguous", currency);
    value = Number(s.replace(/[.,]/, ""));
  } else if (/^\d+[.,]\d+$/.test(s)) {
    const decimals = s.split(/[.,]/)[1].length;
    if (decimals > 3 || (minorUnits !== undefined && decimals > minorUnits)) return fail("too_many_decimals", currency);
    if (minorUnits === undefined && decimals === 3) return fail("ambiguous", currency);
    value = Number(s.replace(",", "."));
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,3})?$/.test(s)) {
    const decimals = s.includes(".") ? s.split(".")[1].length : 0;
    if (minorUnits !== undefined && decimals > minorUnits) return fail("too_many_decimals", currency);
    value = Number(s.replace(/,/g, ""));
  } else if (/^\d{1,3}(\.\d{3})+(,\d{1,3})?$/.test(s)) {
    const decimals = s.includes(",") ? s.split(",")[1].length : 0;
    if (minorUnits !== undefined && decimals > minorUnits) return fail("too_many_decimals", currency);
    value = Number(s.replace(/\./g, "").replace(",", "."));
  } else {
    return fail("invalid_format", currency);
  }

  if (value === null || !Number.isFinite(value)) return fail("invalid_format", currency);
  return { ok: true, amount: negative ? -value : value, currency };
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
   الباركود والموديل
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
   التواريخ — UTC دائمًا، ولا اعتماد على توقيت الجهاز
--------------------------------------------------------------- */

export type TimestampFailure = "empty" | "no_timezone" | "unrecognized" | "invalid" | "invalid_timezone";

export type TimestampParse =
  | { ok: true; value: ParsedTimestamp }
  | { ok: false; reason: TimestampFailure };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function formatOffset(minutes: number): string {
  if (minutes === 0) return "Z";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function parseOffset(token: string): number | null {
  if (token === "Z" || token === "GMT" || token === "UTC") return 0;
  const m = token.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (Number(m[2]) > 14 || Number(m[3]) > 59) return null;
  return m[1] === "+" ? minutes : -minutes;
}

/** إزاحة منطقة IANA (بالدقائق) عند لحظة UTC معينة */
function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** يتحقق أن مكونات التاريخ حقيقية (يرفض 2026-02-30 مثلًا) */
function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * يقبل صيغتين فقط: ISO 8601 و RFC 2822. أي صيغة أخرى (مثل 05/11/2026)
 * تُرفض لأنها ملتبسة (يوم/شهر).
 * التاريخ بلا منطقة زمنية يُفسَّر بمنطقة المصدر المعلنة فقط، وإلا يُرفض.
 */
export function parseTimestamp(raw: string | null | undefined, sourceTimeZone?: string): TimestampParse {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };
  const t = raw.trim();

  let y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0;
  let offsetToken: string | null = null;

  const iso = t.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/
  );
  const rfc = t.match(
    /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(GMT|UTC|Z|[+-]\d{4})$/
  );

  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (iso[4]) [h, mi] = [Number(iso[4]), Number(iso[5])];
    if (iso[6]) s = Number(iso[6]);
    if (iso[7]) ms = Math.round(Number(`0.${iso[7]}`) * 1000);
    offsetToken = iso[8] ?? null;
  } else if (rfc) {
    const month = MONTHS[rfc[2].toLowerCase()];
    if (!month) return { ok: false, reason: "unrecognized" };
    [d, mo, y, h, mi] = [Number(rfc[1]), month, Number(rfc[3]), Number(rfc[4]), Number(rfc[5])];
    if (rfc[6]) s = Number(rfc[6]);
    offsetToken = rfc[7];
  } else {
    return { ok: false, reason: "unrecognized" };
  }

  if (!validParts(y, mo, d, h, mi, s)) return { ok: false, reason: "invalid" };
  const localMs = Date.UTC(y, mo - 1, d, h, mi, s, ms);

  if (offsetToken) {
    const offset = parseOffset(offsetToken);
    if (offset === null) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      value: { utc: new Date(localMs - offset * 60000).toISOString(), originalOffset: formatOffset(offset), assumedTimeZone: null },
    };
  }

  if (!sourceTimeZone) return { ok: false, reason: "no_timezone" };
  if (!isValidTimeZone(sourceTimeZone)) return { ok: false, reason: "invalid_timezone" };

  // تحويل الوقت المحلي في منطقة المصدر إلى UTC (خطوتان لتغطية التوقيت الصيفي)
  const first = zoneOffsetMinutes(localMs, sourceTimeZone);
  const offset = zoneOffsetMinutes(localMs - first * 60000, sourceTimeZone);
  return {
    ok: true,
    value: {
      utc: new Date(localMs - offset * 60000).toISOString(),
      originalOffset: formatOffset(offset),
      assumedTimeZone: sourceTimeZone,
    },
  };
}

export const TIMESTAMP_FAILURE_MESSAGE: Record<TimestampFailure, string> = {
  empty: "التاريخ مفقود",
  no_timezone: "تاريخ بدون منطقة زمنية ولم تُحدد منطقة للمصدر — تم تجاهله",
  unrecognized: "صيغة تاريخ غير مقبولة (نقبل ISO 8601 و RFC 2822 فقط)",
  invalid: "تاريخ غير صالح",
  invalid_timezone: "المنطقة الزمنية للمصدر غير صالحة",
};
