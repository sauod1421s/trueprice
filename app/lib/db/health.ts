/**
 * تشخيص اتصال القاعدة بلا أسرار: يحوّل أي خطأ اتصال إلى رمز قصير ثابت.
 * لا يُعاد نص رسالة الخطأ أبدًا (قد يحتوي اسم خادم أو مستخدم)، فقط الرمز.
 */
import { DbConfigError } from "./connection";

export type DbHealthReason =
  | "not_configured"   // TP_DATA_SOURCE ليس db أو DATABASE_URL فارغ
  | "config"           // DATABASE_URL غير صالح أو DATABASE_CA_CERT مفقود/غير صالح
  | "dns"              // اسم الخادم غير موجود
  | "network"          // رفض الاتصال أو انقطاعه
  | "timeout"          // انتهت المهلة
  | "tls"              // فشل التحقق من شهادة الخادم (DATABASE_CA_CERT لا يطابق)
  | "auth_failed"      // كلمة مرور tp_app خاطئة (أو دُوّرت بإعادة تشغيل ملف الإعداد)
  | "tenant_not_found" // خادم Supavisor أو اسم المستخدم tp_app.<ref> لا يطابق المشروع
  | "schema_missing"   // ملف الإعداد لم يُنفَّذ (المخطط pub أو دوره غير موجود)
  | "permission"       // الصلاحيات لا تطابق المتوقع
  | "unknown";

type ErrLike = { name?: unknown; code?: unknown; message?: unknown };

export function classifyDbError(e: unknown): DbHealthReason {
  const err = (e ?? {}) as ErrLike;
  const name = typeof err.name === "string" ? err.name : "";
  const code = typeof err.code === "string" ? err.code : "";
  const msg = typeof err.message === "string" ? err.message : "";

  if (e instanceof DbConfigError || name === "DbConfigError") return "config";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ETIMEDOUT" || /timeout/i.test(msg)) return "timeout";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE" || code === "EHOSTUNREACH") return "network";
  if (
    code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID" || code === "CERT_HAS_EXPIRED" || /certificate/i.test(msg)
  ) return "tls";
  if (code === "28P01" || code === "28000") return "auth_failed";
  if (/tenant or user not found/i.test(msg)) return "tenant_not_found";
  if (code === "3F000" || code === "42P01" || code === "42704" || code === "22023") return "schema_missing";
  if (code === "42501") return "permission";
  return "unknown";
}
