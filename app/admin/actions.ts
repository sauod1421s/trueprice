"use server";

/**
 * عمليات لوحة الإدارة (MVP). كل عملية:
 *  1) تأخذ الهوية من جلسة الخادم فقط (لا من حقول النموذج).
 *  2) تنفّذ بهوية المستخدم في القاعدة، فتطبّق القاعدة نفسها الصلاحيات والتحقق الثنائي
 *     ومنع المراجعة الذاتية (حسب data-security.md: التحقق داخل كل عملية).
 *  3) تعيد التوجيه برسالة نجاح أو خطأ مفهومة.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  commitImport,
  createProduct,
  createSource,
  createStore,
  decide,
  discardImport,
  friendlyDbError,
  importLookups,
  stageImport,
} from "../lib/admin/db";
import { draftRow, draftRowsFromCsv, type ProductRef } from "../lib/admin/priceRows";
import {
  currentClaims,
  makeSessionValue,
  PREVIEW_COOKIE,
  PREVIEW_USERS,
  previewAuthEnabled,
  SESSION_MAX_AGE_SECONDS,
} from "../lib/admin/session";

function text(fd: FormData, key: string, max = 500): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function back(path: string, kind: "ok" | "err", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

async function claimsOrLogin() {
  const claims = await currentClaims();
  if (!claims) redirect("/admin");
  return claims;
}

/* ------------------------------------------------------------------ الدخول التجريبي */

export async function loginAs(fd: FormData) {
  if (!previewAuthEnabled()) back("/admin", "err", "دخول المعاينة غير مفعّل في هذه البيئة");
  const uid = text(fd, "uid", 64);
  if (!PREVIEW_USERS.some((u) => u.id === uid)) back("/admin", "err", "مستخدم غير معروف");
  const store = await cookies();
  store.set(PREVIEW_COOKIE, makeSessionValue(uid, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: false, // محلي فقط (http://localhost)
  });
  redirect("/admin");
}

export async function logout() {
  const store = await cookies();
  store.delete(PREVIEW_COOKIE);
  redirect("/admin");
}

/* ------------------------------------------------------------------ الكتالوج */

export async function addProduct(fd: FormData) {
  const claims = await claimsOrLogin();
  const name = text(fd, "name", 200);
  const nameAr = text(fd, "nameAr", 200);
  if (!name || !nameAr) back("/admin/catalog", "err", "الاسم بالعربية والإنجليزية مطلوب");
  let created: { publicId: number };
  try {
    created = await createProduct(claims, {
      categoryId: text(fd, "categoryId", 20),
      brandId: text(fd, "brandId", 20) || undefined,
      newBrandName: text(fd, "newBrandName", 120) || undefined,
      newBrandNameAr: text(fd, "newBrandNameAr", 120) || undefined,
      name,
      nameAr,
      storage: text(fd, "storage", 120),
      memory: text(fd, "memory", 120),
      screen: text(fd, "screen", 300),
      chip: text(fd, "chip", 300),
      description: text(fd, "description", 2000),
      isDemo: fd.get("isDemo") === "on",
    });
  } catch (e) {
    back("/admin/catalog", "err", friendlyDbError(e));
  }
  back("/admin/catalog", "ok", `أُضيف المنتج (رقم ${created.publicId}). أضف له سعرًا من صفحة الأسعار.`);
}

/* ------------------------------------------------------------------ المتاجر والمصادر */

export async function addStore(fd: FormData) {
  const claims = await claimsOrLogin();
  const isDemo = fd.get("isDemo") === "on";
  let id = text(fd, "id", 60).toLowerCase();
  if (isDemo && !id.startsWith("demo-")) id = `demo-${id}`;
  try {
    await createStore(claims, {
      id,
      name: text(fd, "name", 120),
      nameAr: text(fd, "nameAr", 120),
      isMarketplace: fd.get("isMarketplace") === "on",
    });
  } catch (e) {
    back("/admin/stores", "err", friendlyDbError(e));
  }
  back("/admin/stores", "ok", `أُضيف المتجر ${id}`);
}

export async function addSource(fd: FormData) {
  const claims = await claimsOrLogin();
  const kind = text(fd, "kind", 30) === "store_feed" ? "store_feed" : "manual_upload";
  const basis = text(fd, "permissionBasis", 500);
  if (!basis) back("/admin/stores", "err", "اذكر أساس الإذن باستخدام بيانات هذا المصدر");
  try {
    await createSource(claims, {
      id: text(fd, "id", 60).toLowerCase(),
      name: text(fd, "name", 120),
      kind,
      storeId: text(fd, "storeId", 60) || undefined,
      permissionBasis: basis,
      evidenceUrl: text(fd, "evidenceUrl", 500) || undefined,
      approve: fd.get("approve") === "on",
    });
  } catch (e) {
    back("/admin/stores", "err", friendlyDbError(e));
  }
  back("/admin/stores", "ok", "أُضيف مصدر السعر");
}

/* ------------------------------------------------------------------ الاستيراد */

async function lookupsFor(claims: Awaited<ReturnType<typeof claimsOrLogin>>) {
  const l = await importLookups(claims);
  return {
    l,
    ctx: {
      products: new Map<number, ProductRef>(l.products.map((p) => [p.publicId, { publicId: p.publicId, name: p.name }])),
      stores: new Set(l.stores.map((s) => s.id)),
      now: new Date(),
    },
  };
}

/** إدخال سعر واحد من النموذج → معاينة مختومة (لا يظهر شيء في الموقع) */
export async function stageSinglePrice(fd: FormData) {
  const claims = await claimsOrLogin();
  const sourceId = text(fd, "sourceId", 60);
  const { ctx } = await lookupsFor(claims);
  const input = {
    line: 1,
    productId: text(fd, "productId", 20),
    storeId: text(fd, "storeId", 60),
    price: text(fd, "price", 40),
    currency: text(fd, "currency", 10) || "SAR",
    url: text(fd, "url", 1000),
    asOf: text(fd, "asOf", 40),
    availability: text(fd, "availability", 20) || "in_stock",
  };
  const r = draftRow(input, ctx);
  if (!r.row) back("/admin/prices", "err", r.errors.map((e) => e.message).join(" · "));
  let runId: string;
  try {
    ({ runId } = await stageImport(claims, {
      sourceId,
      fileName: "إدخال يدوي من اللوحة",
      format: "manual",
      content: JSON.stringify(input),
      rows: [r.row],
      issues: 0,
    }));
  } catch (e) {
    back("/admin/prices", "err", friendlyDbError(e));
  }
  redirect(`/admin/prices/${runId}`);
}

/** CSV صغير (حتى 1,000 صف) → معاينة مختومة */
export async function stageCsv(fd: FormData) {
  const claims = await claimsOrLogin();
  const sourceId = text(fd, "sourceId", 60);
  const file = fd.get("file");
  let content = text(fd, "csv", 600_000);
  let fileName = "csv-لصق.csv";
  if (file instanceof File && file.size > 0) {
    content = await file.text();
    fileName = file.name.slice(0, 200);
  }
  if (!content) back("/admin/prices", "err", "الصق محتوى CSV أو اختر ملفًا");
  const { ctx } = await lookupsFor(claims);
  const { rows, errors } = draftRowsFromCsv(content, ctx);
  if (errors.length) {
    back("/admin/prices", "err", errors.slice(0, 5).map((e) => (e.line ? `سطر ${e.line}: ${e.message}` : e.message)).join(" · "));
  }
  let runId: string;
  try {
    ({ runId } = await stageImport(claims, { sourceId, fileName, format: "csv", content, rows, issues: 0 }));
  } catch (e) {
    back("/admin/prices", "err", friendlyDbError(e));
  }
  redirect(`/admin/prices/${runId}`);
}

export async function commitRun(fd: FormData) {
  const claims = await claimsOrLogin();
  const runId = text(fd, "runId", 64);
  const hash = text(fd, "contentSha256", 64);
  let stats: Record<string, number>;
  try {
    stats = await commitImport(claims, runId, hash);
  } catch (e) {
    back(`/admin/prices/${runId}`, "err", friendlyDbError(e));
  }
  back(
    `/admin/prices/${runId}`,
    "ok",
    `اعتُمد الاستيراد: ${stats.new ?? 0} جديد، ${stats.price_changed ?? 0} تغيّر سعره، ${stats.refreshed ?? 0} بلا تغيير` +
      (stats.stale ? `، ${stats.stale} أقدم من السعر الموجود (تُجوهل ولا يُرجَع السعر للخلف)` : "") +
      ". الأسعار الجديدة بانتظار المراجعة ولا تظهر قبل اعتمادها."
  );
}

export async function discardRun(fd: FormData) {
  const claims = await claimsOrLogin();
  const runId = text(fd, "runId", 64);
  try {
    await discardImport(claims, runId, "ألغاه المشرف من شاشة المعاينة");
  } catch (e) {
    back(`/admin/prices/${runId}`, "err", friendlyDbError(e));
  }
  back("/admin/prices", "ok", "أُلغي الاستيراد ولم يُطبَّق أي سعر");
}

/* ------------------------------------------------------------------ المراجعة */

export async function reviewPrice(fd: FormData) {
  const claims = await claimsOrLogin();
  const status = text(fd, "status", 10) === "rejected" ? "rejected" : "verified";
  const note = text(fd, "note", 1000);
  const expectedRaw = text(fd, "expectedPreviousEventId", 20);
  const returnTo = text(fd, "returnTo", 100) || "/admin/review";
  if (status === "rejected" && note.length < 3) back(returnTo, "err", "الرفض يتطلب ملاحظة توضح السبب (3 أحرف على الأقل)");
  try {
    await decide(claims, {
      observationId: Number(text(fd, "observationId", 20)),
      status,
      expectedPreviousEventId: expectedRaw ? Number(expectedRaw) : null,
      reasonCode: text(fd, "reasonCode", 40) || undefined,
      note: note || undefined,
      evidenceUrl: text(fd, "evidenceUrl", 1000) || undefined,
    });
  } catch (e) {
    back(returnTo, "err", friendlyDbError(e));
  }
  back(returnTo, "ok", status === "verified" ? "اعتُمد السعر وأصبح ظاهرًا في صفحة المنتج" : "رُفض السعر ولن يظهر ولن يدخل في السعر العادل");
}
