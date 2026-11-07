import { Badge } from "../../components/ui";
import { listUsers } from "../../lib/admin/db";
import { addUser, changeRole } from "../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const ROLE_LABEL: Record<string, string> = { admin: "مشرف", reviewer: "مراجع", viewer: "مشاهد" };

export default async function UsersPage({ searchParams }: Props) {
  const { ok, err } = await searchParams;
  const ctx = await requireAdmin();
  const allowed = can(ctx, "user:manage");
  const users = allowed ? await listUsers(ctx.claims) : [];

  return (
    <AdminShell ctx={ctx} active="/admin/users" title="المستخدمون والأدوار" subtitle="الحسابات تُنشأ في Supabase Auth، والأدوار تُمنح هنا. لا أحد يمنح نفسه دورًا.">
      <Flash ok={ok} err={err} />
      {!allowed ? (
        <p className="card p-5 text-sm text-ink-2">إدارة المستخدمين للمشرفين فقط.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
          <section className="card p-5">
            <h2 className="font-bold">إضافة مستخدم</h2>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-xs leading-6 text-ink-3">
              <li>أنشئ الحساب في لوحة Supabase: Authentication → Users → Add user (بريد وكلمة مرور، مع تأكيد تلقائي).</li>
              <li>انسخ معرّف المستخدم (User UID) والصقه هنا مع الاسم والدور.</li>
              <li>عند أول دخول يُطلب منه إعداد التحقق الثنائي.</li>
            </ol>
            <form action={addUser} className="mt-4 space-y-3">
              <Field label="معرّف المستخدم (UUID)">
                <input name="user_id" required dir="ltr" className={inputCls} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </Field>
              <Field label="الاسم المعروض">
                <input name="display_name" required minLength={2} maxLength={120} className={inputCls} />
              </Field>
              <Field label="الدور">
                <select name="role" className={inputCls} defaultValue="reviewer">
                  <option value="reviewer">مراجع — يعتمد الأسعار أو يرفضها</option>
                  <option value="viewer">مشاهد — قراءة فقط</option>
                  <option value="admin">مشرف — كل الصلاحيات</option>
                </select>
              </Field>
              <SubmitButton>إضافة ومنح الدور</SubmitButton>
            </form>
          </section>

          <section className="card overflow-x-auto p-5">
            <h2 className="font-bold">المستخدمون ({users.length})</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-start text-ink-3">
                  <th className="py-2 text-start font-medium">الاسم</th>
                  <th className="py-2 text-start font-medium">الأدوار</th>
                  <th className="py-2 text-start font-medium">تعديل</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId} className="border-b border-line align-top">
                    <td className="py-2">
                      <div className="font-medium">{u.displayName}</div>
                      <div className="text-xs text-ink-3" dir="ltr">{u.userId}</div>
                      {u.status !== "active" && <Badge tone="warn">معطّل</Badge>}
                    </td>
                    <td className="py-2">
                      {u.roles.length ? u.roles.map((r) => <Badge key={r}>{ROLE_LABEL[r] ?? r}</Badge>) : <span className="text-ink-3">بلا دور</span>}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(["admin", "reviewer", "viewer"] as const).map((r) => {
                          const has = u.roles.includes(r);
                          if (u.userId === ctx.claims.sub) return null;
                          return (
                            <form key={r} action={changeRole}>
                              <input type="hidden" name="user_id" value={u.userId} />
                              <input type="hidden" name="role" value={r} />
                              <input type="hidden" name="op" value={has ? "revoke" : "grant"} />
                              <button className={`min-h-8 rounded-full border px-2.5 text-xs ${has ? "border-bad/40 text-bad" : "border-line text-ink-2 hover:border-brand"}`}>
                                {has ? `سحب ${ROLE_LABEL[r]}` : `منح ${ROLE_LABEL[r]}`}
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
