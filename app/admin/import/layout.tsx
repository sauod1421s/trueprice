import { requireAdmin } from "../_components/AdminShell";

// صفحة الاستيراد مكوّن عميل؛ هذا التخطيط يشترط جلسة إدارة بتحقق ثنائي (aal2) قبل عرضها،
// مثل بقية صفحات /admin.
export const dynamic = "force-dynamic";

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
