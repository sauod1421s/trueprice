/**
 * نقطة الدخول الموحّدة للاستيراد: ملف → قراءة → توحيد → تحقق → مطابقة.
 *
 * - لا تحفظ شيئًا: تعيد النتيجة للمعاينة (وتجهّز صفوفًا لسجل الأسعار).
 * - الأخطاء القاتلة (ملف ضخم، اقتباس غير مغلق، XML تالف...) تُعاد في
 *   `fatal` ولا يُستورد أي صف — لا استيراد جزئي صامت.
 * - الحدود تُطبّق هنا داخل المحرك وليس في الواجهة فقط.
 */

import { parseCsv } from "./csv";
import { parseTimestamp, resolveColumns } from "./fields";
import { stableHash, streamKeyOf } from "./history";
import { DEFAULT_LIMITS, ImportFatalError, utf8Length, type FatalCode, type ImportLimits } from "./limits";
import { buildCatalogIndex, matchOffer, type CatalogEntry, type CatalogIndex } from "./matching";
import { normalizeRecord, type StorePending } from "./normalize";
import type { ApprovedAliases, StoreRecord } from "./stores";
import { parseXml } from "./xml";
import type {
  CanonicalField,
  FeedFormat,
  ImportIssue,
  MatchResult,
  NormalizedOffer,
  ParsedTimestamp,
  RawRecord,
  SourceConfig,
  StoreAliasProposal,
} from "./types";

export type ImportInput = {
  source: SourceConfig;
  fileName: string;
  content: string;
  /** "auto" يكتشف الصيغة من المحتوى */
  format?: FeedFormat | "auto";
  /** الكتالوج أو فهرسه المبني مسبقًا (الأفضل للأداء) */
  catalog: readonly CatalogEntry[] | CatalogIndex;
  /** وقت الاستيراد (يُمرر صراحة لتكون النتائج قابلة للاختبار) */
  importedAt: string;
  limits?: Partial<ImportLimits>;
  registry?: readonly StoreRecord[];
  approvedAliases?: ApprovedAliases;
  /** ساعة للقياس (للاختبار) */
  clock?: () => number;
};

export type ImportedRow = { offer: NormalizedOffer; match: MatchResult; streamKey: string };

export type ImportResult = {
  importId: string;
  /** بصمة محتوى الملف (تكشف إعادة استيراد نفس الملف) */
  contentHash: string;
  sourceId: string;
  fileName: string;
  format: FeedFormat | null;
  importedAt: string;
  fatal: { code: FatalCode; message: string; line?: number } | null;
  columns: Partial<Record<CanonicalField, string>>;
  feedGeneratedAt: ParsedTimestamp | null;
  totalRows: number;
  accepted: ImportedRow[];
  rejected: { row: number; record: RawRecord; issues: ImportIssue[] }[];
  warnings: ImportIssue[];
  storeProposals: StoreAliasProposal[];
  /** صفوف مكررة داخل نفس الملف (نفس العرض ونفس السعر) */
  duplicatesInFile: number;
  durationMs: number;
  summary: {
    accepted: number;
    rejected: number;
    matched: number;
    needsReview: number;
    unmatched: number;
    storePending: number;
    foreignCurrency: number;
    new: number;
    used: number;
    refurbished: number;
  };
};

const SOURCE_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function isValidSourceId(id: string): boolean {
  return SOURCE_ID.test(id);
}

function detectXml(content: string, fileName: string): boolean {
  const head = content.replace(/^﻿/, "").trimStart().slice(0, 200);
  return head.startsWith("<") || /\.(xml|rss|atom)$/i.test(fileName);
}

function emptyResult(input: ImportInput, contentHash: string, importId: string): ImportResult {
  return {
    importId,
    contentHash,
    sourceId: input.source.id,
    fileName: input.fileName,
    format: null,
    importedAt: input.importedAt,
    fatal: null,
    columns: {},
    feedGeneratedAt: null,
    totalRows: 0,
    accepted: [],
    rejected: [],
    warnings: [],
    storeProposals: [],
    duplicatesInFile: 0,
    durationMs: 0,
    summary: { accepted: 0, rejected: 0, matched: 0, needsReview: 0, unmatched: 0, storePending: 0, foreignCurrency: 0, new: 0, used: 0, refurbished: 0 },
  };
}

export function runImport(input: ImportInput): ImportResult {
  const clock = input.clock ?? (() => performance.now());
  const started = clock();
  const limits: ImportLimits = { ...DEFAULT_LIMITS, ...input.limits };
  const { source, content, fileName } = input;

  const contentHash = stableHash(content);
  const importId = stableHash(`${source.id}|${contentHash}|${input.importedAt}`);
  const result = emptyResult(input, contentHash, importId);

  const fatal = (e: ImportFatalError): ImportResult => ({
    ...result,
    fatal: { code: e.code, message: e.message, line: e.line },
    durationMs: clock() - started,
  });

  try {
    if (!isValidSourceId(source.id)) {
      throw new ImportFatalError("invalid_source", "معرّف المصدر غير صالح (أحرف لاتينية صغيرة وأرقام وشرطة، 2-63 حرفًا)");
    }
    // فحص سريع بعدد الأحرف أولًا، ثم بالبايت عند الحاجة
    if (content.length > limits.maxBytes || (content.length * 3 > limits.maxBytes && utf8Length(content) > limits.maxBytes)) {
      throw new ImportFatalError("file_too_large", `حجم الملف أكبر من ${(limits.maxBytes / 1024 / 1024).toFixed(0)} ميغابايت`);
    }

    const useXml = (input.format ?? "auto") === "auto" ? detectXml(content, fileName) : input.format !== "csv";

    let format: FeedFormat;
    let records: { row: number; record: RawRecord }[];
    let headers: string[];
    let feedStoreName: string | null = null;
    let feedDateRaw: string | null = null;
    const preRejected: ImportResult["rejected"] = [];

    if (useXml) {
      const parsed = parseXml(content, limits);
      format = parsed.format;
      records = parsed.records;
      feedDateRaw = parsed.meta.feedUpdatedAt;
      feedStoreName = parsed.meta.storeName;
      headers = [...new Set(records.flatMap((r) => Object.keys(r.record)))];
      if (headers.length > limits.maxColumns) {
        throw new ImportFatalError("too_many_columns", `أكثر من ${limits.maxColumns} حقل مختلف`);
      }
    } else {
      const parsed = parseCsv(content, limits);
      format = "csv";
      records = parsed.records;
      headers = parsed.headers;
      for (const e of parsed.rowErrors) {
        preRejected.push({ row: e.row, record: Object.create(null), issues: [{ row: e.row, severity: "error", code: e.code, message: e.message }] });
      }
    }

    const warnings: ImportIssue[] = [];
    let feedGeneratedAt: ParsedTimestamp | null = null;
    if (feedDateRaw) {
      const p = parseTimestamp(feedDateRaw, source.timeZone);
      if (p.ok) feedGeneratedAt = p.value;
      else warnings.push({ row: 0, severity: "warning", code: `feed_date_${p.reason}`, message: `تاريخ الملف غير مستخدم: "${feedDateRaw}"` });
    }

    const columns = resolveColumns(headers, source);
    const index = "byToken" in input.catalog ? (input.catalog as CatalogIndex) : buildCatalogIndex(input.catalog as readonly CatalogEntry[]);
    const accepted: ImportedRow[] = [];
    const rejected = [...preRejected];
    const proposals = new Map<string, StoreAliasProposal>();
    const seenInFile = new Set<string>();
    let duplicatesInFile = 0;

    for (let i = 0; i < records.length; i++) {
      if (i % 500 === 0 && clock() - started > limits.maxDurationMs) {
        throw new ImportFatalError("time_limit", `تجاوز الاستيراد ${limits.maxDurationMs / 1000} ثانية — لم يُستورد شيء`);
      }
      const { row, record } = records[i];
      const { offer, issues, storePending } = normalizeRecord(row, record, {
        source,
        columns,
        feedStoreName: source.defaultStore || source.storeId ? null : feedStoreName,
        feedGeneratedAt,
        importedAt: input.importedAt,
        limits,
        registry: input.registry,
        approvedAliases: input.approvedAliases,
      });

      if (!offer) {
        rejected.push({ row, record, issues });
        continue;
      }
      warnings.push(...issues);

      const streamKey = streamKeyOf(offer);
      const dupKey = `${streamKey}|${offer.price.amount}|${offer.listPrice?.amount ?? "-"}`;
      if (seenInFile.has(dupKey)) {
        duplicatesInFile++;
        continue;
      }
      seenInFile.add(dupKey);

      if (storePending) addProposal(proposals, storePending, row);
      accepted.push({ offer, match: matchOffer(offer, index), streamKey });
    }

    rejected.sort((a, b) => a.row - b.row);
    const count = (pred: (r: ImportedRow) => boolean) => accepted.filter(pred).length;

    return {
      ...result,
      format,
      columns,
      feedGeneratedAt,
      totalRows: records.length + preRejected.length,
      accepted,
      rejected,
      warnings,
      storeProposals: [...proposals.values()],
      duplicatesInFile,
      durationMs: clock() - started,
      summary: {
        accepted: accepted.length,
        rejected: rejected.length,
        matched: count((r) => r.match.status === "matched"),
        needsReview: count((r) => r.match.status === "needs_review"),
        unmatched: count((r) => r.match.status === "unmatched"),
        storePending: count((r) => r.offer.storeId === null),
        foreignCurrency: count((r) => r.offer.sarPrice === null),
        new: count((r) => r.offer.condition === "new"),
        used: count((r) => r.offer.condition === "used"),
        refurbished: count((r) => r.offer.condition === "refurbished"),
      },
    };
  } catch (e) {
    if (e instanceof ImportFatalError) return fatal(e);
    throw e;
  }
}

function addProposal(map: Map<string, StoreAliasProposal>, p: StorePending, row: number) {
  const key = p.normalized || `?${p.reason}`;
  const existing = map.get(key);
  if (existing) {
    if (existing.rows.length < 50) existing.rows.push(row);
    return;
  }
  map.set(key, { rawName: p.rawName, normalized: p.normalized, suggestedStoreId: p.suggestedStoreId, reason: p.reason, rows: [row] });
}
