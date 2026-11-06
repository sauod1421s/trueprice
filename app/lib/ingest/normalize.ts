/**
 * تحويل صف خام إلى عرض سعر موحّد مع التحقق من صلاحيته.
 *
 * يُرفض الصف إذا: لا يوجد اسم، أو السعر مفقود/ملتبس/صفري/غير منطقي، أو
 * العملة غير معروفة، أو الرابط غير صالح، أو كانت حالة المنتج غير مفهومة،
 * أو تجاوز حقل الحدود.
 *
 * العملات الأجنبية المعروفة تُقبل مع حفظ المبلغ والعملة الأصليين، لكن
 * sarPrice = null فلا تدخل التقييم حتى يُعتمد تحويل.
 *
 * المتجر غير المعروف لا يُرفض الصف بسببه: يُقبل مع storeId = null ومقترح
 * اسم بديل للمشرف، ولا يدخل السجل أو التقييم حتى يُعتمد.
 */

import {
  CURRENCY_MINOR_UNITS,
  normalizeAvailability,
  normalizeCondition,
  normalizeCurrency,
  normalizeGtin,
  normalizeMpn,
  parsePrice,
  parseTimestamp,
  pick,
  PRICE_FAILURE_MESSAGE,
  TIMESTAMP_FAILURE_MESSAGE,
} from "./fields";
import { DEFAULT_LIMITS, type ImportLimits } from "./limits";
import { canonicalProductUrl, resolveStore, sellerKeyFor, type ApprovedAliases, type StoreRecord } from "./stores";
import type {
  CanonicalField,
  ImportIssue,
  Money,
  NormalizedOffer,
  ParsedTimestamp,
  RawRecord,
  SourceConfig,
} from "./types";

export type NormalizeContext = {
  source: SourceConfig;
  columns: Partial<Record<CanonicalField, string>>;
  /** اسم المتجر من رأس الملف (مثل shop.name في YML) */
  feedStoreName?: string | null;
  /** وقت توليد الملف ككل (لا يُستخدم كوقت تحديث للسعر) */
  feedGeneratedAt?: ParsedTimestamp | null;
  /** وقت الاستيراد (UTC ISO) — لكشف التواريخ المستقبلية */
  importedAt: string;
  limits?: ImportLimits;
  registry?: readonly StoreRecord[];
  approvedAliases?: ApprovedAliases;
};

export type StorePending = { normalized: string; rawName: string; suggestedStoreId: string | null; reason: string };

/** حد أعلى منطقي لسعر منتج إلكتروني (بالعملة الأصلية) يكشف أخطاء مثل الهللات */
const MAX_REASONABLE_PRICE = 1_000_000;

/** هامش التسامح للتواريخ المستقبلية (فروق ساعات الأنظمة) */
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export function normalizeRecord(
  row: number,
  record: RawRecord,
  ctx: NormalizeContext
): { offer: NormalizedOffer | null; issues: ImportIssue[]; storePending: StorePending | null } {
  const limits = ctx.limits ?? DEFAULT_LIMITS;
  const issues: ImportIssue[] = [];
  const col = ctx.columns;
  const err = (field: CanonicalField | undefined, code: string, message: string) =>
    issues.push({ row, field, severity: "error", code, message });
  const warn = (field: CanonicalField | undefined, code: string, message: string) =>
    issues.push({ row, field, severity: "warning", code, message });

  /* الاسم */
  const name = pick(record, col.name);
  if (!name) err("name", "missing_name", "اسم المنتج مفقود");
  else if (name.length > limits.maxNameLength) err("name", "name_too_long", `اسم المنتج أطول من ${limits.maxNameLength} حرف`);

  /* العملة: من عمود العملة أولًا، ثم من نص السعر، ثم من إعداد المصدر */
  const currencyColumn = pick(record, col.currency);
  let currency: string | null = null;
  if (currencyColumn) {
    currency = normalizeCurrency(currencyColumn);
    if (!currency) err("currency", "unknown_currency", `عملة غير معروفة: "${currencyColumn}"`);
  }

  /* السعر والسعر قبل الخصم */
  const regularRaw = pick(record, col.price);
  const saleRaw = pick(record, col.salePrice);
  const regular = regularRaw ? parsePrice(regularRaw, currency) : null;
  const sale = saleRaw ? parsePrice(saleRaw, currency) : null;

  const textCurrencies = [regular, sale]
    .map((p) => p?.currency ?? null)
    .filter((c): c is string => !!c);
  for (const c of textCurrencies) {
    if (currency && c !== currency) err("currency", "conflicting_currency", `عملة السعر (${c}) تختلف عن عمود العملة (${currency})`);
    currency = currency ?? c;
  }
  for (const p of [regular, sale]) {
    if (p && !p.ok && p.unknownCurrency) err("currency", "unknown_currency", `عملة غير معروفة: "${p.unknownCurrency}"`);
  }

  if (!currency && !issues.some((i) => i.field === "currency")) {
    if (ctx.source.defaultCurrency) {
      currency = normalizeCurrency(ctx.source.defaultCurrency);
      if (currency) warn("currency", "default_currency", `لم تُذكر العملة؛ استُخدمت عملة المصدر (${currency})`);
    }
    if (!currency) err("currency", "missing_currency", "العملة غير مذكورة");
  }

  // إعادة قراءة السعر بالعملة النهائية (قد تحسم الالتباس)
  const finalRegular = regularRaw ? parsePrice(regularRaw, currency) : null;
  const finalSale = saleRaw ? parsePrice(saleRaw, currency) : null;

  let price: number | null = null;
  let listPrice: number | null = null;

  const validAmount = (p: ReturnType<typeof parsePrice> | null, field: CanonicalField, label: string): number | null => {
    if (!p) return null;
    if (!p.ok) {
      if (!p.unknownCurrency) err(field, `price_${p.reason}`, `${label}: ${PRICE_FAILURE_MESSAGE[p.reason]} ("${field === "price" ? regularRaw : saleRaw}")`);
      return null;
    }
    if (p.amount <= 0) {
      err(field, "non_positive_price", `${label}: صفر أو سالب`);
      return null;
    }
    if (p.amount > MAX_REASONABLE_PRICE) {
      err(field, "implausible_price", `${label}: أعلى من الحد المنطقي — قد يكون بالهللات`);
      return null;
    }
    return p.amount;
  };

  const regularAmount = validAmount(finalRegular, "price", "السعر");
  const saleAmount = validAmount(finalSale, "salePrice", "سعر الخصم");

  if (!regularRaw && !saleRaw) {
    err("price", "missing_price", "السعر مفقود");
  } else if (regularAmount !== null && saleAmount !== null) {
    if (saleAmount < regularAmount) {
      price = saleAmount;
      listPrice = regularAmount;
    } else {
      price = regularAmount;
      if (saleAmount > regularAmount) warn("salePrice", "sale_above_regular", "سعر الخصم أعلى من السعر الأصلي — تم تجاهله");
    }
  } else if (regularAmount !== null && !saleRaw) {
    price = regularAmount;
  } else if (saleAmount !== null && !regularRaw) {
    price = saleAmount;
  }
  // إذا كان أحد السعرين موجودًا لكنه غير صالح، الصف مرفوض (الخطأ مسجّل أعلاه)

  /* الرابط */
  const url = pick(record, col.url);
  let canonicalUrl: string | null = null;
  if (url.length > limits.maxUrlLength) {
    err("url", "url_too_long", `الرابط أطول من ${limits.maxUrlLength} حرف`);
  } else {
    canonicalUrl = canonicalProductUrl(url);
    if (!canonicalUrl) {
      try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
        // رابط تتبع لا يمكن استخراج وجهته: مقبول لكن بلا وجهة معروفة
        canonicalUrl = url;
        warn("url", "redirect_without_target", "رابط تتبع لا يكشف الرابط الفعلي للمنتج");
      } catch {
        err("url", "invalid_url", "رابط المنتج مفقود أو غير صالح");
      }
    }
  }

  /* المتجر والبائع */
  const storeName = pick(record, col.store) || ctx.source.defaultStore || ctx.feedStoreName || "";
  const resolution = resolveStore({
    storeName,
    canonicalUrl,
    sourceStoreId: ctx.source.storeId,
    registry: ctx.registry,
    approvedAliases: ctx.approvedAliases,
  });
  let storeId: string | null = null;
  let storePending: StorePending | null = null;
  if (resolution.status === "resolved") {
    storeId = resolution.storeId;
    if (resolution.warning) warn("store", "store_from_domain", resolution.warning);
  } else {
    storePending = { normalized: resolution.normalized, rawName: storeName, suggestedStoreId: resolution.suggestedStoreId, reason: resolution.reason };
    warn("store", "store_pending", `المتجر يحتاج مراجعة: ${resolution.reason}`);
  }
  const sellerName = pick(record, col.seller) || null;
  const sellerKey = sellerName ? sellerKeyFor(sellerName, storeId, ctx.registry) : null;

  /* الحالة: جديد / مستعمل / مجدد */
  const conditionRaw = pick(record, col.condition);
  const condition = normalizeCondition(conditionRaw);
  if (!condition) err("condition", "unknown_condition", `حالة المنتج غير مفهومة: "${conditionRaw}"`);

  /* الباركود والموديل والشركة */
  const gtinRaw = pick(record, col.gtin);
  const gtin = gtinRaw ? normalizeGtin(gtinRaw) : null;
  if (gtinRaw && !gtin) warn("gtin", "invalid_gtin", `باركود غير صالح وتم تجاهله: "${gtinRaw}"`);
  const mpnRaw = pick(record, col.mpn);
  const mpn = mpnRaw ? normalizeMpn(mpnRaw) : null;
  const brand = pick(record, col.brand) || null;
  if (!gtin && !mpn) warn(undefined, "no_identifiers", "لا يوجد باركود ولا رقم موديل — المطابقة ستحتاج مراجعة يدوية");

  /* تاريخ التحديث (من الصف فقط) */
  const updatedRaw = pick(record, col.updatedAt);
  let sourceUpdatedAt: ParsedTimestamp | null = null;
  if (updatedRaw) {
    const parsed = parseTimestamp(updatedRaw, ctx.source.timeZone);
    if (parsed.ok) {
      if (Date.parse(parsed.value.utc) > Date.parse(ctx.importedAt) + FUTURE_TOLERANCE_MS) {
        warn("updatedAt", "future_date", `تاريخ التحديث في المستقبل وتم تجاهله: "${updatedRaw}"`);
      } else {
        sourceUpdatedAt = parsed.value;
      }
    } else {
      warn("updatedAt", `date_${parsed.reason}`, `${TIMESTAMP_FAILURE_MESSAGE[parsed.reason]}: "${updatedRaw}"`);
    }
  } else {
    warn("updatedAt", "no_source_date", "المصدر لم يذكر وقت تحديث هذا السعر");
  }

  if (issues.some((i) => i.severity === "error")) return { offer: null, issues, storePending: null };

  const money = (amount: number): Money => ({ amount, currency: currency! });
  const isSar = currency === "SAR";
  if (!isSar) {
    warn("currency", "foreign_currency_unconverted", `العملة ${currency} محفوظة كما هي؛ لن تدخل التقييم قبل اعتماد تحويل`);
  }
  // تقريب حسب خانات العملة لتجنب أخطاء الفاصلة العائمة
  const round = (v: number) => {
    const f = 10 ** (CURRENCY_MINOR_UNITS[currency!] ?? 2);
    return Math.round(v * f) / f;
  };

  return {
    offer: {
      row,
      sourceId: ctx.source.id,
      externalId: pick(record, col.externalId) || null,
      name,
      price: money(round(price!)),
      listPrice: listPrice !== null ? money(round(listPrice)) : null,
      sarPrice: isSar ? round(price!) : null,
      sarListPrice: isSar && listPrice !== null ? round(listPrice) : null,
      fx: null,
      url,
      canonicalUrl: canonicalUrl!,
      storeName: storeName || storeId || "",
      storeId,
      sellerName,
      sellerKey,
      gtin,
      mpn,
      brand,
      availability: normalizeAvailability(pick(record, col.availability)),
      condition: condition!,
      sourceUpdatedAt,
      feedGeneratedAt: ctx.feedGeneratedAt ?? null,
    },
    issues,
    storePending,
  };
}
