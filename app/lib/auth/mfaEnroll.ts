/**
 * تسجيل عامل TOTP للتحقق الثنائي — طلب واحد في كل مرة.
 *
 * سبب الفصل: كانت الصفحة ترسل طلبي تسجيل متزامنين (بعد كلمة المرور + عند فتح خطوة التحقق)،
 * فيرفض Supabase الثاني بقيد تفرد الاسم (mfa_factors_user_friendly_name_unique) وتظهر رسالة
 * "تعذّر إكمال العملية". هنا: الاستدعاءات المتزامنة تنتظر نفس الطلب، والمفاتيح غير المكتملة
 * القديمة تُحذف قبل إنشاء مفتاح جديد، والاسم فريد لكل محاولة.
 */

type Res<T> = { data: T; error: unknown };
type Factor = { id: string; factor_type: string; status: string };

export type MfaApi = {
  listFactors(): Promise<Res<{ all: Factor[] } | null>>;
  unenroll(p: { factorId: string }): Promise<Res<unknown>>;
  enroll(p: { factorType: "totp"; friendlyName: string }): Promise<Res<{ id: string; totp: { qr_code: string; secret: string } } | null>>;
};

export type Enrollment = { factorId: string; qr: string; secret: string };

export function createEnroller(mfa: MfaApi, now: () => Date = () => new Date()): () => Promise<Enrollment> {
  let inflight: Promise<Enrollment> | null = null;

  async function run(): Promise<Enrollment> {
    const factors = await mfa.listFactors();
    if (factors.error) throw factors.error;
    for (const f of factors.data?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        const { error } = await mfa.unenroll({ factorId: f.id });
        if (error) throw error;
      }
    }
    const friendlyName = `TruePrice admin ${now().toISOString().slice(0, 19)}`;
    const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName });
    if (error) throw error;
    if (!data) throw new Error("enroll returned no data");
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }

  return () => {
    inflight ??= run().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
