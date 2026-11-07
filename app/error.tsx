"use client";

/**
 * خطأ غير متوقع في صفحة (مثل انقطاع قاعدة البيانات): رسالة مفهومة بلا أي تفاصيل داخلية.
 * في الإنتاج لا تصل رسالة الخطأ الأصلية من الخادم للمتصفح أصلًا (رمز digest فقط).
 */
import { RefreshCw } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <main className="bg-mint-wash">
      <div className="container-page grid min-h-[62vh] place-items-center py-14">
        <div className="max-w-md text-center" role="alert" data-error-page>
          <div className="font-mono text-sm font-semibold text-coral-ink">!</div>
          <h1 className="mt-2 text-2xl font-bold">الخدمة غير متاحة مؤقتًا</h1>
          <p className="mt-3 leading-8 text-ink-2">
            تعذر تحميل هذه الصفحة الآن. لم يُفقد شيء — حاول مرة أخرى بعد لحظات.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-on-brand"
            >
              <RefreshCw size={16} aria-hidden /> إعادة المحاولة
            </button>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-5">
              الرئيسية
            </Link>
          </div>
          {digest && <p className="num mt-4 text-xs text-ink-3" dir="ltr">ref: {digest}</p>}
        </div>
      </div>
    </main>
  );
}
