/**
 * قارئ CSV (RFC 4180) بدون مكتبات خارجية.
 *
 * - يدعم: علامات الاقتباس، الاقتباس المزدوج، الأسطر المتعددة داخل الحقل،
 *   CRLF، BOM، واكتشاف الفاصل ( , ; tab | ).
 * - علامة اقتباس غير مغلقة = خطأ يوقف الملف (لا ندمج الصفوف بصمت).
 * - صف بعدد أعمدة مختلف = صف مرفوض بسبب واضح.
 * - حدود داخلية: عدد الصفوف والأعمدة وطول الحقل.
 */

import { DEFAULT_LIMITS, ImportFatalError, type ImportLimits } from "./limits";
import type { RawRecord } from "./types";

const DELIMITERS = [",", ";", "\t", "|"] as const;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** يكتشف الفاصل من السطر الأول (خارج علامات الاقتباس) */
export function detectDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = {};
  for (let i = 0; i < text.length && i < 64_000; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && (DELIMITERS as readonly string[]).includes(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    if ((counts[d] ?? 0) > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return best;
}

export type CsvRow = { line: number; cells: string[] };

/** يحوّل النص إلى صفوف، مع رقم السطر الذي يبدأ عنده كل صف */
export function parseCsvRows(input: string, limits: ImportLimits = DEFAULT_LIMITS, delimiter?: string): CsvRow[] {
  const text = stripBom(input);
  const d = delimiter ?? detectDelimiter(text);
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let quoteStartLine = 1;

  const pushField = () => {
    if (field.length > limits.maxFieldLength) {
      throw new ImportFatalError("field_too_long", `حقل أطول من ${limits.maxFieldLength} حرف (سطر ${rowStartLine})`, rowStartLine);
    }
    cells.push(field);
    field = "";
    if (cells.length > limits.maxColumns) {
      throw new ImportFatalError("too_many_columns", `أكثر من ${limits.maxColumns} عمود (سطر ${rowStartLine})`, rowStartLine);
    }
  };
  const pushRow = () => {
    if (cells.some((c) => c.trim() !== "")) {
      rows.push({ line: rowStartLine, cells });
      // +1 للرأس
      if (rows.length > limits.maxRows + 1) {
        throw new ImportFatalError("too_many_rows", `الملف يحتوي أكثر من ${limits.maxRows} صف`, rowStartLine);
      }
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
        if (field.length > limits.maxFieldLength) {
          throw new ImportFatalError("field_too_long", `حقل أطول من ${limits.maxFieldLength} حرف (يبدأ في سطر ${quoteStartLine})`, quoteStartLine);
        }
      }
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      quoteStartLine = line;
    } else if (ch === d) {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushField();
      pushRow();
      line++;
      rowStartLine = line;
    } else {
      field += ch;
      if (field.length > limits.maxFieldLength) {
        throw new ImportFatalError("field_too_long", `حقل أطول من ${limits.maxFieldLength} حرف (سطر ${rowStartLine})`, rowStartLine);
      }
    }
  }

  if (inQuotes) {
    throw new ImportFatalError(
      "unterminated_quote",
      `علامة اقتباس مفتوحة في سطر ${quoteStartLine} لم تُغلق حتى نهاية الملف — الملف غير مكتمل أو تالف، ولم يُستورد شيء`,
      quoteStartLine
    );
  }
  if (field !== "" || cells.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

export type CsvRowError = { row: number; code: "column_count_mismatch"; message: string };

/**
 * يحوّل CSV إلى سجلات مفاتيحها رؤوس الأعمدة.
 * رقم الصف = رقم السطر في الملف الذي يبدأ عنده الصف.
 */
export function parseCsv(
  input: string,
  limits: ImportLimits = DEFAULT_LIMITS
): { headers: string[]; records: { row: number; record: RawRecord }[]; rowErrors: CsvRowError[] } {
  const rows = parseCsvRows(input, limits);
  if (rows.length === 0) return { headers: [], records: [], rowErrors: [] };

  const headers = rows[0].cells.map((h) => h.trim());
  const records: { row: number; record: RawRecord }[] = [];
  const rowErrors: CsvRowError[] = [];

  for (const { line, cells } of rows.slice(1)) {
    // أعمدة زائدة فارغة (فاصل في نهاية السطر) مقبولة؛ غير ذلك = صف مرفوض
    const extra = cells.slice(headers.length);
    if (cells.length < headers.length || extra.some((c) => c.trim() !== "")) {
      rowErrors.push({
        row: line,
        code: "column_count_mismatch",
        message: `عدد الأعمدة ${cells.length} لا يطابق الرأس (${headers.length}) — قد يكون السطر مقطوعًا أو فيه فاصل زائد`,
      });
      continue;
    }
    // Object.create(null) يمنع أي تأثير لأعمدة باسم __proto__
    const record: RawRecord = Object.create(null);
    headers.forEach((h, j) => {
      if (h) record[h] = (cells[j] ?? "").trim();
    });
    records.push({ row: line, record });
  }

  return { headers, records, rowErrors };
}
