/**
 * جلب آمن من مصادر خارجية (للخادم فقط).
 *  - HTTPS فقط، ومهلة زمنية، وحد أقصى للحجم يُطبَّق أثناء القراءة (لا يُحمَّل ملف ضخم كاملًا).
 *  - التحويلات (redirect) تُتبع يدويًا فقط إلى HTTPS، وبحد أقصى 3.
 *  - رسائل الأخطاء لا تحتوي الرابط كاملًا (روابط الملفات غالبًا تحمل رمز دخول) ولا ترويسات الطلب.
 */

export class ConnectorError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ConnectorError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** يخفي مسار الرابط واستعلامه: يبقى المضيف فقط للعرض في السجلات */
export function redactUrl(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return "رابط غير صالح";
  }
}

export function requireHttps(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ConnectorError("bad_url", "رابط المصدر غير صالح");
  }
  if (u.protocol !== "https:") throw new ConnectorError("insecure_url", "رابط المصدر يجب أن يبدأ بـ https://");
  if (u.username || u.password) throw new ConnectorError("credentials_in_url", "لا تضع اسم مستخدم أو كلمة مرور داخل الرابط");
  return u;
}

export type ReadOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  init?: RequestInit;
};

/** يرسل الطلب ويعيد الاستجابة بعد التحقق من الحالة، مع تتبع آمن للتحويلات */
export async function safeRequest(rawUrl: string, opts: ReadOptions = {}): Promise<Response> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let url = requireHttps(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url.toString(), { ...opts.init, redirect: "manual", signal: ctrl.signal });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      throw new ConnectorError(
        aborted ? "timeout" : "network",
        aborted ? `انتهت المهلة (${Math.round(timeoutMs / 1000)} ث) عند ${url.host}` : `تعذّر الاتصال بـ ${url.host}`
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new ConnectorError("bad_redirect", `تحويل بلا وجهة من ${url.host}`);
      url = requireHttps(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) {
      throw new ConnectorError(`http_${res.status}`, `ردّ ${url.host} بالحالة ${res.status}`);
    }
    return res;
  }
  throw new ConnectorError("too_many_redirects", "تحويلات كثيرة من المصدر");
}

/** يقرأ النص مع إيقاف القراءة عند تجاوز الحد */
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ConnectorError("too_large", `حجم الملف (${Math.round(declared / 1048576)} م.ب) أكبر من الحد ${Math.round(maxBytes / 1048576)} م.ب`);
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ConnectorError("too_large", `الملف أكبر من الحد ${Math.round(maxBytes / 1048576)} م.ب`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(buf);
}

export async function fetchTextCapped(rawUrl: string, opts: ReadOptions = {}): Promise<string> {
  const res = await safeRequest(rawUrl, opts);
  return readTextCapped(res, opts.maxBytes ?? 25 * 1024 * 1024);
}
