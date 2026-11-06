/**
 * نقطة الدخول الموحّدة للاستيراد: ملف → قراءة → توحيد → تحقق → مطابقة
 * → ملاحظات أسعار جاهزة للسجل (كلها "غير موثقة").
 *
 * الدالة لا تحفظ شيئًا: تعيد النتيجة للمعاينة. الحفظ الدائم ينتظر قرار
 * قاعدة البيانات.
 */

import { parseCsv } from "./csv";
import { resolveColumns } from "./fields";
import { observationId, stableHash, toObservation } from "./history";
import { matchOffer, type CatalogEntry } from "./matching";
import { normalizeRecord } from "./normalize";
import { parseXml } from "./xml";
import type {
  CanonicalField,
  FeedFormat,
  ImportIssue,
  MatchResult,
  NormalizedOffer,
  PriceObservation,
  RawRecord,
  SourceConfig,
} from "./types";

export type ImportInput = {
  source: SourceConfig;
  fileName: string;
  content: string;
  /** "auto" يكتشف الصيغة من المحتوى */
  format?: FeedFormat | "auto";
  catalog: readonly CatalogEntry[];
  /** وقت الاستيراد (يُمرر صراحة لتكون النتائج قابلة للاختبار) */
  importedAt: string;
};

export type ImportedRow = {
  offer: NormalizedOffer;
  match: MatchResult;
  observation: PriceObservation;
};

export type ImportResult = {
  importId: string;
  sourceId: string;
  fileName: string;
  format: FeedFormat;
  importedAt: string;
  columns: Partial<Record<CanonicalField, string>>;
  totalRows: number;
  accepted: ImportedRow[];
  rejected: { row: number; record: RawRecord; issues: ImportIssue[] }[];
  warnings: ImportIssue[];
  /** صفوف مكررة داخل نفس الملف (نفس المتجر والمنتج والسعر والتاريخ) */
  duplicatesInFile: number;
  summary: {
    accepted: number;
    rejected: number;
    matched: number;
    needsReview: number;
    unmatched: number;
    new: number;
    used: number;
    refurbished: number;
  };
};

export function detectFormat(content: string, fileName = ""): FeedFormat | "xml-detect" {
  const head = content.replace(/^﻿/, "").trimStart().slice(0, 500);
  if (head.startsWith("<")) return "xml-detect";
  if (/\.(xml|rss|atom)$/i.test(fileName)) return "xml-detect";
  return "csv";
}

export function runImport(input: ImportInput): ImportResult {
  const { source, content, fileName, catalog, importedAt } = input;
  const importId = stableHash(`${source.id}|${fileName}|${importedAt}|${content.length}`);

  const requested = input.format ?? "auto";
  const useXml = requested === "auto" ? detectFormat(content, fileName) === "xml-detect" : requested !== "csv";

  let format: FeedFormat;
  let records: { row: number; record: RawRecord }[];
  let headers: string[];
  let feedUpdatedAt: string | null = null;
  let feedStoreName: string | null = null;

  if (useXml) {
    const parsed = parseXml(content);
    format = parsed.format;
    records = parsed.records;
    feedUpdatedAt = parsed.meta.feedUpdatedAt;
    feedStoreName = parsed.meta.storeName;
    headers = [...new Set(records.flatMap((r) => Object.keys(r.record)))];
  } else {
    const parsed = parseCsv(content);
    format = "csv";
    records = parsed.records;
    headers = parsed.headers;
  }

  const columns = resolveColumns(headers, source);
  const accepted: ImportedRow[] = [];
  const rejected: ImportResult["rejected"] = [];
  const warnings: ImportIssue[] = [];
  const seenInFile = new Set<string>();
  let duplicatesInFile = 0;

  for (const { row, record } of records) {
    const { offer, issues } = normalizeRecord(row, record, {
      source,
      columns,
      feedStoreName: source.defaultStore ? null : feedStoreName,
      feedUpdatedAt,
    });

    if (!offer) {
      rejected.push({ row, record, issues });
      continue;
    }
    warnings.push(...issues);

    const id = observationId(offer);
    if (seenInFile.has(id)) {
      duplicatesInFile++;
      continue;
    }
    seenInFile.add(id);

    const match = matchOffer(offer, catalog);
    const productId = match.status === "matched" ? match.productId : null;
    accepted.push({ offer, match, observation: toObservation(offer, productId, importId, importedAt) });
  }

  const count = (pred: (r: ImportedRow) => boolean) => accepted.filter(pred).length;

  return {
    importId,
    sourceId: source.id,
    fileName,
    format,
    importedAt,
    columns,
    totalRows: records.length,
    accepted,
    rejected,
    warnings,
    duplicatesInFile,
    summary: {
      accepted: accepted.length,
      rejected: rejected.length,
      matched: count((r) => r.match.status === "matched"),
      needsReview: count((r) => r.match.status === "needs_review"),
      unmatched: count((r) => r.match.status === "unmatched"),
      new: count((r) => r.offer.condition === "new"),
      used: count((r) => r.offer.condition === "used"),
      refurbished: count((r) => r.offer.condition === "refurbished"),
    },
  };
}
