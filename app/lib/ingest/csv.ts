/**
 * قارئ CSV (RFC 4180) بدون مكتبات خارجية.
 * يدعم: علامات الاقتباس، الاقتباس المزدوج داخل الحقل، الأسطر المتعددة داخل
 * الحقل، CRLF، BOM، واكتشاف الفاصل تلقائيًا ( , ; tab | ).
 */

import type { RawRecord } from "./types";

const DELIMITERS = [",", ";", "\t", "|"] as const;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** يكتشف الفاصل من السطر الأول (خارج علامات الاقتباس) */
export function detectDelimiter(text: string): string {
  const firstLine: string[] = [];
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    firstLine.push(ch);
  }
  const line = firstLine.join("");
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (!q && ch === d) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** يحوّل النص إلى صفوف من الحقول */
export function parseCsvRows(input: string, delimiter?: string): string[][] {
  const text = stripBom(input);
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

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
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // تجاهل الأسطر الفارغة تمامًا
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * يحوّل CSV إلى سجلات مفاتيحها رؤوس الأعمدة.
 * رقم الصف في النتيجة = رقم السطر في الملف (الرأس = 1).
 */
export function parseCsv(input: string): {
  headers: string[];
  records: { row: number; record: RawRecord }[];
} {
  const rows = parseCsvRows(input);
  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells, i) => {
    const record: RawRecord = {};
    headers.forEach((h, j) => {
      if (h) record[h] = (cells[j] ?? "").trim();
    });
    return { row: i + 2, record };
  });

  return { headers, records };
}
