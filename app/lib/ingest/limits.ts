/**
 * حدود محرك الاستيراد نفسه (وليس الواجهة فقط)، لحماية الخادم والمتصفح
 * من الملفات الضخمة أو المصممة لاستهلاك الموارد.
 */

export type ImportLimits = {
  /** أقصى حجم للملف بالبايت */
  maxBytes: number;
  /** أقصى عدد صفوف بيانات */
  maxRows: number;
  /** أقصى عدد أعمدة */
  maxColumns: number;
  /** أقصى طول لأي حقل (حرف) */
  maxFieldLength: number;
  /** أقصى طول لاسم المنتج */
  maxNameLength: number;
  /** أقصى طول للرابط */
  maxUrlLength: number;
  /** أقصى عمق تداخل في XML */
  maxXmlDepth: number;
  /** أقصى مدة للاستيراد بالمللي ثانية */
  maxDurationMs: number;
};

export const DEFAULT_LIMITS: ImportLimits = {
  maxBytes: 15 * 1024 * 1024,
  maxRows: 50_000,
  maxColumns: 200,
  maxFieldLength: 4_000,
  maxNameLength: 500,
  maxUrlLength: 2_048,
  maxXmlDepth: 32,
  maxDurationMs: 30_000,
};

export type FatalCode =
  | "file_too_large"
  | "too_many_rows"
  | "too_many_columns"
  | "field_too_long"
  | "unterminated_quote"
  | "invalid_xml"
  | "time_limit"
  | "invalid_source";

/** خطأ يوقف استيراد الملف كله (لا يُستورد أي صف) */
export class ImportFatalError extends Error {
  constructor(
    public readonly code: FatalCode,
    message: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = "ImportFatalError";
  }
}

/** حجم النص بالبايت (UTF-8) دون إنشاء نسخة كاملة منه */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
