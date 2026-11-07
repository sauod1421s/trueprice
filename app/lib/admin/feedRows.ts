/**
 * تحويل نتيجة محرك الاستيراد (ملف شريك: CSV / Google Merchant / YML / XML)
 * إلى صفوف تستقبلها admin_api.stage_import_rows، مع سجل واضح لكل صف لم يُرفع.
 *
 * منطق خالص بلا اتصال بالقاعدة — يُختبر وحده. التحليل يتم على الخادم فقط
 * (لا نثق بأي تحليل من المتصفح).
 *
 * قواعد MVP (محافظة عمدًا):
 *  - يُرفع فقط الصف المطابق بمعرّف قاطع (باركود GTIN أو رقم موديل MPN).
 *    المطابقة بالاسم لا تُدمج تلقائيًا أبدًا: تُسجَّل كملاحظة ليضيف المشرف
 *    الباركود الصحيح للمنتج ثم يعيد الرفع.
 *  - الريال السعودي فقط، والحالة "جديد" فقط.
 *  - المتجر يجب أن يكون مسجلًا ونشطًا في القاعدة.
 *  - إذا لم يذكر الملف تاريخًا للسعر يُعلَّم السعر "تاريخ غير مؤكد" فيُستبعد
 *    من السعر العادل حتى يُراجع.
 */
import { offerKeyOf, stableHash, streamKeyOf } from "../ingest/history";
import type { ImportResult, ImportedRow } from "../ingest/importer";
import type { StageRow } from "./priceRows";

/** صف ملف شريك كما يُرسل للقاعدة (يحمل معرّف المنتج الداخلي مباشرة) */
export type FeedStageRow = StageRow & {
  external_id?: string;
  seller_key?: string;
  seller_name?: string;
  source_updated_at?: string;
  source_offset?: string;
  assumed_time_zone?: string;
  feed_generated_at?: string;
};

/** ملاحظة صف لم يُرفع — تُحفظ في tp.import_row_issues */
export type FeedIssue = {
  row: number;
  severity: "error" | "warning";
  code: string;
  field?: string;
  message: string;
  excerpt?: Record<string, unknown>;
};

export type FeedStageResult = {
  rows: FeedStageRow[];
  issues: FeedIssue[];
  counts: {
    total: number;
    staged: number;
    rejected: number;
    needsReview: number;
    unmatched: number;
    storeUnknown: number;
    foreignCurrency: number;
    notNew: number;
    undated: number;
  };
};

const OFFER_KEY = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const SELLER_KEY = /^[^\s]{1,120}$/;
/** حد ملاحظات الصفوف في عملية واحدة (أكثر من ذلك يُختصر بملاحظة ملخص) */
export const MAX_FEED_ISSUES = 500;

function cut(s: string | null | undefined, n = 160): string | undefined {
  if (!s) return undefined;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * مفتاح العرض في القاعدة: المعرّف الخارجي إن كان صالحًا، وإلا بصمة ثابتة
 * من (الباركود ← الرابط الفعلي ← الاسم) — نفس العرض يعطي نفس المفتاح في كل
 * رفع، فيتراكم سجل أسعاره بدل أن يبدأ من جديد.
 */
export function feedOfferKey(row: ImportedRow): string {
  const ext = row.offer.externalId?.trim();
  if (ext && OFFER_KEY.test(ext)) return ext;
  return `f-${stableHash(offerKeyOf(row.offer))}`;
}

function excerptOf(row: ImportedRow): Record<string, unknown> {
  const o = row.offer;
  return {
    name: cut(o.name),
    store: cut(o.storeName, 80),
    price: `${o.price.amount} ${o.price.currency}`,
    gtin: o.gtin ?? undefined,
    mpn: o.mpn ?? undefined,
  };
}

export function feedToStageRows(
  result: ImportResult,
  ctx: { activeStores: ReadonlySet<string>; maxIssues?: number }
): FeedStageResult {
  const maxIssues = ctx.maxIssues ?? MAX_FEED_ISSUES;
  const rows: FeedStageRow[] = [];
  const issues: FeedIssue[] = [];
  const counts: FeedStageResult["counts"] = {
    total: result.totalRows,
    staged: 0,
    rejected: result.rejected.length,
    needsReview: 0,
    unmatched: 0,
    storeUnknown: 0,
    foreignCurrency: 0,
    notNew: 0,
    undated: 0,
  };
  let dropped = 0;
  const note = (i: FeedIssue) => {
    if (issues.length < maxIssues) issues.push(i);
    else dropped++;
  };

  for (const r of result.rejected) {
    note({
      row: r.row,
      severity: "error",
      code: "row_rejected",
      message: cut(r.issues.map((x) => x.message).join(" · "), 900) ?? "صف غير صالح",
    });
  }

  const seen = new Set<string>();
  for (const item of result.accepted) {
    const { offer, match } = item;
    const ex = excerptOf(item);

    if (offer.price.currency !== "SAR" || offer.sarPrice === null) {
      counts.foreignCurrency++;
      note({ row: offer.row, severity: "warning", code: "currency_not_supported", field: "price",
        message: `السعر بعملة ${offer.price.currency}: الريال السعودي فقط حاليًا (تحويل العملات معطّل)`, excerpt: ex });
      continue;
    }
    if (offer.condition !== "new") {
      counts.notNew++;
      note({ row: offer.row, severity: "warning", code: "condition_not_supported", field: "condition",
        message: "الحالة ليست جديدة: المستعمل والمجدد غير مدعومين في هذه المرحلة", excerpt: ex });
      continue;
    }
    if (!offer.storeId || !ctx.activeStores.has(offer.storeId)) {
      counts.storeUnknown++;
      note({ row: offer.row, severity: "warning", code: "store_unknown", field: "store",
        message: offer.storeId
          ? `المتجر ${offer.storeId} غير مسجل أو غير نشط في القاعدة`
          : `اسم المتجر "${cut(offer.storeName, 80)}" غير معروف: سجّل المتجر أو حدد متجرًا افتراضيًا للمصدر`,
        excerpt: ex });
      continue;
    }
    if (match.status === "needs_review") {
      counts.needsReview++;
      note({ row: offer.row, severity: "warning", code: "needs_review", field: "name",
        message: `${match.reason} — أقرب منتج: ${match.candidates[0]?.label ?? "—"}. أضف الباركود أو رقم الموديل للمنتج الصحيح ثم أعد الرفع`,
        excerpt: { ...ex, candidates: match.candidates.slice(0, 3).map((c) => cut(c.label, 80)) } });
      continue;
    }
    if (match.status === "unmatched") {
      counts.unmatched++;
      note({ row: offer.row, severity: "warning", code: "unmatched", field: "name",
        message: `${match.reason} — المنتج غير موجود في الكتالوج`, excerpt: ex });
      continue;
    }

    const key = streamKeyOf(offer);
    if (seen.has(key)) {
      note({ row: offer.row, severity: "warning", code: "duplicate_offer",
        message: "نفس العرض تكرر في الملف بسعر مختلف: أُخذ أول ظهور فقط", excerpt: ex });
      continue;
    }
    seen.add(key);

    const dated = offer.sourceUpdatedAt ?? offer.feedGeneratedAt;
    if (!dated) counts.undated++;
    const sellerKey = offer.sellerKey && SELLER_KEY.test(offer.sellerKey) ? offer.sellerKey : undefined;

    rows.push({
      store_id: offer.storeId,
      offer_key: feedOfferKey(item),
      condition: "new",
      amount: offer.sarPrice.toFixed(2),
      currency: "SAR",
      ...(offer.sarListPrice !== null && offer.sarListPrice > offer.sarPrice
        ? { list_amount: offer.sarListPrice.toFixed(2) } : {}),
      as_of: dated?.utc ?? result.importedAt,
      availability: offer.availability,
      name: cut(offer.name, 500) ?? match.label,
      url: offer.url,
      canonical_url: offer.canonicalUrl,
      product_id: String(match.productId),
      // بلا تاريخ في الملف = تاريخ غير مؤكد (يُستبعد من السعر العادل)
      date_confirmed: dated !== null && dated !== undefined,
      ...(offer.externalId ? { external_id: cut(offer.externalId, 200) } : {}),
      ...(sellerKey ? { seller_key: sellerKey, seller_name: cut(offer.sellerName, 200) ?? sellerKey } : {}),
      ...(offer.sourceUpdatedAt
        ? {
            source_updated_at: offer.sourceUpdatedAt.utc,
            source_offset: offer.sourceUpdatedAt.originalOffset,
            ...(offer.sourceUpdatedAt.assumedTimeZone ? { assumed_time_zone: offer.sourceUpdatedAt.assumedTimeZone } : {}),
          }
        : {}),
      ...(offer.feedGeneratedAt ? { feed_generated_at: offer.feedGeneratedAt.utc } : {}),
    });
  }

  if (dropped > 0) {
    issues[issues.length - 1] = {
      row: 0,
      severity: "warning",
      code: "issues_truncated",
      message: `اختُصرت الملاحظات: ${dropped + 1} ملاحظة إضافية لم تُعرض. راجع الملف الأصلي.`,
    };
  }
  counts.staged = rows.length;
  return { rows, issues, counts };
}

/** ملخص عربي قصير لعدّادات الرفع */
export function feedSummary(c: FeedStageResult["counts"]): string {
  const parts = [`${c.staged} صف جاهز للمعاينة من ${c.total}`];
  if (c.needsReview) parts.push(`${c.needsReview} يحتاج مطابقة يدوية`);
  if (c.unmatched) parts.push(`${c.unmatched} غير موجود في الكتالوج`);
  if (c.storeUnknown) parts.push(`${c.storeUnknown} متجره غير معروف`);
  if (c.foreignCurrency) parts.push(`${c.foreignCurrency} بعملة غير الريال`);
  if (c.notNew) parts.push(`${c.notNew} ليس جديدًا`);
  if (c.rejected) parts.push(`${c.rejected} صف غير صالح`);
  if (c.undated) parts.push(`${c.undated} بلا تاريخ (تاريخ غير مؤكد)`);
  return parts.join(" · ");
}
