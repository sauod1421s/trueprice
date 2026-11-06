/**
 * تحويل صف خام إلى عرض سعر موحّد مع التحقق من صلاحيته.
 *
 * يُرفض الصف إذا: لا يوجد اسم، أو السعر مفقود/صفري/سالب، أو العملة
 * غير معروفة أو ليست ريالًا سعوديًا، أو الرابط غير صالح، أو تعذّر تحديد
 * المتجر، أو كانت حالة المنتج غير مفهومة.
 */

import {
  normalizeAvailability,
  normalizeCondition,
  normalizeCurrency,
  normalizeGtin,
  normalizeMpn,
  parseDate,
  parsePrice,
  pick,
} from "./fields";
import { resolveStoreKey } from "./stores";
import type { CanonicalField, ImportIssue, NormalizedOffer, RawRecord, SourceConfig } from "./types";

export type NormalizeContext = {
  source: SourceConfig;
  columns: Partial<Record<CanonicalField, string>>;
  /** اسم المتجر من رأس الملف (مثل shop.name في YML) */
  feedStoreName?: string | null;
  /** تاريخ تحديث الملف ككل إن لم يكن لكل صف تاريخ */
  feedUpdatedAt?: string | null;
};

/** حد أعلى منطقي لسعر منتج إلكتروني بالريال (يكشف أخطاء مثل الهللات) */
const MAX_REASONABLE_PRICE = 1_000_000;

export function normalizeRecord(
  row: number,
  record: RawRecord,
  ctx: NormalizeContext
): { offer: NormalizedOffer | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const col = ctx.columns;
  const err = (field: CanonicalField | undefined, code: string, message: string) =>
    issues.push({ row, field, severity: "error", code, message });
  const warn = (field: CanonicalField | undefined, code: string, message: string) =>
    issues.push({ row, field, severity: "warning", code, message });

  /* الاسم */
  const name = pick(record, col.name);
  if (!name) err("name", "missing_name", "اسم المنتج مفقود");

  /* السعر والعملة */
  const regular = parsePrice(pick(record, col.price));
  const sale = parsePrice(pick(record, col.salePrice));
  const currencyColumn = pick(record, col.currency);

  let price: number | null = null;
  let listPrice: number | null = null;
  if (regular.amount === null) {
    err("price", "missing_price", "السعر مفقود أو غير مقروء");
  } else if (regular.amount <= 0) {
    err("price", "non_positive_price", "السعر صفر أو سالب");
  } else if (regular.amount > MAX_REASONABLE_PRICE) {
    err("price", "implausible_price", "السعر أعلى من الحد المنطقي — قد يكون بالهللات");
  } else {
    price = regular.amount;
    if (sale.amount !== null && sale.amount > 0 && sale.amount < regular.amount) {
      listPrice = regular.amount;
      price = sale.amount;
    }
  }

  let currency: string | null = null;
  if (currencyColumn) {
    currency = normalizeCurrency(currencyColumn);
    if (!currency) err("currency", "unknown_currency", `عملة غير معروفة: "${currencyColumn}"`);
  } else if (regular.unknownCurrency) {
    err("currency", "unknown_currency", `عملة غير معروفة: "${regular.unknownCurrency}"`);
  } else if (regular.currency) {
    currency = regular.currency;
  } else if (ctx.source.defaultCurrency) {
    currency = normalizeCurrency(ctx.source.defaultCurrency);
    if (currency) warn("currency", "default_currency", `لم تُذكر العملة؛ استُخدمت عملة المصدر (${currency})`);
  } else {
    err("currency", "missing_currency", "العملة غير مذكورة");
  }
  if (currency && currency !== "SAR") {
    err("currency", "unsupported_currency", `العملة ${currency} غير مدعومة — نقبل الريال السعودي فقط`);
  }

  /* الرابط */
  const url = pick(record, col.url);
  let validUrl = false;
  try {
    const u = new URL(url);
    validUrl = u.protocol === "https:" || u.protocol === "http:";
  } catch {
    validUrl = false;
  }
  if (!validUrl) err("url", "invalid_url", "رابط المنتج مفقود أو غير صالح");

  /* المتجر */
  const storeName = pick(record, col.store) || ctx.source.defaultStore || ctx.feedStoreName || "";
  const storeKey = resolveStoreKey(storeName, validUrl ? url : "");
  if (!storeKey) err("store", "unknown_store", "تعذّر تحديد المتجر (أضف اسم المتجر للمصدر)");

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

  /* تاريخ التحديث */
  const updatedRaw = pick(record, col.updatedAt);
  let sourceUpdatedAt = parseDate(updatedRaw);
  if (updatedRaw && !sourceUpdatedAt) warn("updatedAt", "invalid_date", `تاريخ غير مقروء: "${updatedRaw}"`);
  if (!sourceUpdatedAt) {
    sourceUpdatedAt = parseDate(ctx.feedUpdatedAt ?? null);
    if (!sourceUpdatedAt) warn("updatedAt", "no_source_date", "المصدر لم يذكر وقت تحديث السعر");
  }

  if (issues.some((i) => i.severity === "error")) return { offer: null, issues };

  return {
    offer: {
      row,
      sourceId: ctx.source.id,
      externalId: pick(record, col.externalId) || null,
      name,
      price: price!,
      listPrice,
      currency: "SAR",
      url,
      store: storeName || storeKey!,
      storeKey: storeKey!,
      gtin,
      mpn,
      brand,
      availability: normalizeAvailability(pick(record, col.availability)),
      condition: condition!,
      sourceUpdatedAt,
    },
    issues,
  };
}
