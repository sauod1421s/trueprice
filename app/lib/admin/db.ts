/**
 * عمليات لوحة الإدارة على القاعدة — كلها بهوية المستخدم (withClaims).
 * التفويض النهائي في القاعدة نفسها: RLS ودوال admin_api تتحقق من الدور والتحقق
 * الثنائي ومنع المراجعة الذاتية، فلا يستطيع أي استدعاء تجاوزها من هنا.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withClaims, type DbClaims } from "../db/pool";
import { NEW_PRODUCT_ID_OFFSET, publicIdOf } from "../catalog/mode";
import type { DraftRow, StageRow } from "./priceRows";
import type { FeedIssue, FeedStageResult, FeedStageRow } from "./feedRows";
import type { CatalogEntry } from "../ingest/matching";
import type { ApprovedAliases, StoreRecord } from "../ingest/stores";
import type { FeedFormat } from "../ingest/types";

export type Option = { id: string; label: string };

export async function myPermissions(claims: DbClaims): Promise<string[]> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ p: string }>("select p from admin_api.my_permissions() as p");
    return r.rows.map((x) => x.p);
  });
}

export async function myProfile(claims: DbClaims): Promise<{ displayName: string | null; roles: string[] }> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ display_name: string | null; roles: string[] }>("select * from admin_api.my_profile()");
    return { displayName: r.rows[0]?.display_name ?? null, roles: r.rows[0]?.roles ?? [] };
  });
}

export async function dashboardCounts(claims: DbClaims) {
  return withClaims(claims, async (c) => {
    const r = await c.query<Record<string, string>>(`
      select
        (select count(*) from admin_api.products where category_kind = 'electronics') as products,
        (select count(*) from admin_api.stores where status = 'active') as stores,
        (select count(*) from admin_api.sources where status = 'approved') as sources,
        (select count(*) from admin_api.offer_eligibility where verification = 'unverified' and source_id <> 'legacy-site-data') as pending,
        (select count(*) from admin_api.offer_eligibility where verification = 'verified') as verified,
        (select count(*) from admin_api.offer_eligibility where verification = 'rejected') as rejected,
        (select count(*) from admin_api.import_runs where status = 'previewed') as previewed`);
    return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)])) as Record<
      "products" | "stores" | "sources" | "pending" | "verified" | "rejected" | "previewed",
      number
    >;
  });
}

/* ------------------------------------------------------------------ الكتالوج */

export type AdminProduct = {
  id: number;
  publicId: number;
  name: string;
  nameAr: string;
  brand: string;
  category: string;
  status: string;
  isDemo: boolean;
};

export async function catalogOptions(claims: DbClaims) {
  return withClaims(claims, async (c) => {
    const cats = await c.query<{ id: string; name_ar: string }>(
      `select id, name_ar from admin_api.categories where kind = 'electronics' and status = 'active' order by sort_order, id`
    );
    const brands = await c.query<{ id: string; name: string; name_ar: string | null }>(
      `select id, name, name_ar from admin_api.brands where status = 'active' order by name`
    );
    return {
      categories: cats.rows.map((r) => ({ id: r.id, label: r.name_ar })),
      brands: brands.rows.map((r) => ({ id: r.id, label: r.name_ar ? `${r.name_ar} (${r.name})` : r.name })),
    };
  });
}

export async function listProducts(claims: DbClaims, limit = 200): Promise<AdminProduct[]> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{
      id: string; legacy_id: number | null; name: string; name_ar: string | null; brand: string;
      category: string; status: string; is_demo: boolean | null;
    }>(
      `select p.id, p.legacy_id, p.name, p.name_ar, b.name as brand, c.name_ar as category, p.status, d.is_demo
       from admin_api.products p
       join admin_api.brands b on b.id = p.brand_id
       join admin_api.categories c on c.id = p.category_id
       left join admin_api.product_details d on d.product_id = p.id
       where p.category_kind = 'electronics'
       order by p.created_at desc, p.id desc limit $1`,
      [limit]
    );
    return r.rows.map((x) => ({
      id: Number(x.id),
      publicId: publicIdOf(Number(x.id), x.legacy_id),
      name: x.name,
      nameAr: x.name_ar ?? x.name,
      brand: x.brand,
      category: x.category,
      status: x.status,
      isDemo: x.is_demo === true,
    }));
  });
}

export function slugify(s: string, prefix = ""): string {
  const base = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const tail = randomUUID().slice(0, 6);
  return `${prefix}${base || "item"}-${tail}`.slice(0, 63);
}

export type NewProductInput = {
  categoryId: string;
  brandId?: string;
  newBrandName?: string;
  newBrandNameAr?: string;
  name: string;
  nameAr: string;
  storage?: string;
  memory?: string;
  screen?: string;
  chip?: string;
  description?: string;
  isDemo: boolean;
};

/** منتج جديد = علامة (إن لزم) + عائلة + منتج + تفاصيل، في معاملة واحدة */
export async function createProduct(claims: DbClaims, input: NewProductInput): Promise<{ id: number; publicId: number }> {
  return withClaims(claims, async (c) => {
    const cat = await c.query<{ id: string; kind: string }>(
      `select id, kind from admin_api.categories where id = $1 and kind = 'electronics'`,
      [input.categoryId]
    );
    if (!cat.rows[0]) throw new Error("التصنيف غير موجود");

    let brandId = input.brandId;
    if (!brandId) {
      if (!input.newBrandName) throw new Error("اختر علامة تجارية أو أضف علامة جديدة");
      const b = await c.query<{ id: string }>(
        `insert into tp.brands (slug, name, name_ar) values ($1, $2, $3) returning id`,
        [slugify(input.newBrandName, input.isDemo ? "demo-" : ""), input.newBrandName, input.newBrandNameAr || null]
      );
      brandId = b.rows[0].id;
    }
    const prefix = input.isDemo ? "demo-" : "";
    const fam = await c.query<{ id: string }>(
      `insert into tp.product_families (category_id, category_kind, brand_id, slug, name, name_ar)
       values ($1, 'electronics', $2, $3, $4, $5) returning id`,
      [input.categoryId, brandId, slugify(input.name, prefix), input.name, input.nameAr]
    );
    const p = await c.query<{ id: string }>(
      `insert into tp.products (family_id, category_id, category_kind, brand_id, slug, name, name_ar, status)
       values ($1, $2, 'electronics', $3, $4, $5, $6, 'active') returning id`,
      [fam.rows[0].id, input.categoryId, brandId, slugify(input.name, prefix), input.name, input.nameAr]
    );
    const id = Number(p.rows[0].id);
    await c.query(
      `insert into tp.product_details (product_id, storage, memory, screen, chip, description, is_demo)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.storage || null, input.memory || null, input.screen || null, input.chip || null,
       input.description || null, input.isDemo]
    );
    return { id, publicId: NEW_PRODUCT_ID_OFFSET + id };
  });
}

/* ------------------------------------------------------------------ المتاجر والمصادر */

export type AdminStore = { id: string; name: string; nameAr: string; status: string; isDemo: boolean };
export type AdminSource = {
  id: string; name: string; kind: string; storeId: string | null; status: string;
  permissionBasis: string | null; approvedAt: string | null;
};

export async function listStoresAndSources(claims: DbClaims) {
  return withClaims(claims, async (c) => {
    const stores = await c.query<{ id: string; name: string; name_ar: string; status: string }>(
      `select id, name, name_ar, status from admin_api.stores where merged_into is null order by created_at desc, id`
    );
    const sources = await c.query<{
      id: string; name: string; kind: string; store_id: string | null; status: string;
      permission_basis: string | null; approved_at: Date | null;
    }>(
      `select id, name, kind, store_id, status, permission_basis, approved_at
       from admin_api.sources where vertical = 'electronics' order by created_at desc, id`
    );
    return {
      stores: stores.rows.map<AdminStore>((s) => ({
        id: s.id, name: s.name, nameAr: s.name_ar, status: s.status, isDemo: s.id.startsWith("demo-"),
      })),
      sources: sources.rows.map<AdminSource>((s) => ({
        id: s.id, name: s.name, kind: s.kind, storeId: s.store_id, status: s.status,
        permissionBasis: s.permission_basis, approvedAt: s.approved_at?.toISOString() ?? null,
      })),
    };
  });
}

export async function createStore(
  claims: DbClaims,
  input: { id: string; name: string; nameAr: string; isMarketplace: boolean }
) {
  return withClaims(claims, async (c) => {
    await c.query(
      `insert into tp.stores (id, name, name_ar, is_marketplace, created_by) values ($1, $2, $3, $4, $5)`,
      [input.id, input.name, input.nameAr, input.isMarketplace, claims.sub]
    );
  });
}

/** MVP: مصادر الإدخال من اللوحة فقط (رفع يدوي، أو ملف متجر واحد). الآلي معطّل مؤقتًا */
export async function createSource(
  claims: DbClaims,
  input: {
    id: string; name: string; kind: "manual_upload" | "store_feed"; storeId?: string;
    permissionBasis: string; evidenceUrl?: string; approve: boolean;
  }
) {
  return withClaims(claims, async (c) => {
    await c.query(
      `insert into tp.sources (id, name, kind, vertical, store_id, default_currency, time_zone, status,
                               permission_basis, permission_evidence_url, approved_by, approved_at)
       values ($1, $2, $3, 'electronics', $4, 'SAR', 'Asia/Riyadh', $5, $6, $7, $8, $9)`,
      [
        input.id, input.name, input.kind, input.kind === "store_feed" ? input.storeId || null : null,
        input.approve ? "approved" : "draft", input.permissionBasis, input.evidenceUrl || null,
        input.approve ? claims.sub : null, input.approve ? new Date() : null,
      ]
    );
  });
}

/* ------------------------------------------------------------------ الاستيراد */

export async function importLookups(claims: DbClaims) {
  return withClaims(claims, async (c) => {
    const products = await c.query<{ id: string; legacy_id: number | null; name: string; name_ar: string | null }>(
      `select id, legacy_id, name, name_ar from admin_api.products
       where category_kind = 'electronics' and status = 'active' order by (legacy_id is null) desc, created_at desc, id`
    );
    const stores = await c.query<{ id: string; name_ar: string }>(
      `select id, name_ar from admin_api.stores where status = 'active' and merged_into is null order by id`
    );
    const sources = await c.query<{ id: string; name: string; kind: string; store_id: string | null }>(
      `select id, name, kind, store_id from admin_api.sources
       where status = 'approved' and vertical = 'electronics' and kind in ('manual_upload', 'store_feed', 'legacy_manual')
       order by created_at desc`
    );
    return {
      products: products.rows.map((p) => ({
        dbId: p.id,
        publicId: publicIdOf(Number(p.id), p.legacy_id),
        name: p.name_ar ?? p.name,
      })),
      stores: stores.rows.map((s) => ({ id: s.id, label: s.name_ar })),
      sources: sources.rows.map((s) => ({ id: s.id, label: s.name, kind: s.kind, storeId: s.store_id })),
    };
  });
}

/**
 * تسجيل + رفع + ختم: لا يظهر شيء في الموقع. يعيد رقم التشغيل وبصمة المعاينة
 * التي يجب تقديمها نفسها عند الاعتماد (أي تغيير بعد الختم يُرفض).
 */
export async function stageImport(
  claims: DbClaims,
  input: { sourceId: string; fileName: string; format: "csv" | "manual"; content: string; rows: DraftRow[]; issues: number }
): Promise<{ runId: string; contentSha256: string }> {
  return withClaims(claims, async (c) => {
    const ids = await c.query<{ id: string; legacy_id: number | null }>(
      `select id, legacy_id from admin_api.products where category_kind = 'electronics'`
    );
    const byPublic = new Map(ids.rows.map((r) => [publicIdOf(Number(r.id), r.legacy_id), r.id]));
    const rows: StageRow[] = input.rows.map(({ publicProductId, line: _line, ...rest }) => {
      void _line;
      const dbId = byPublic.get(publicProductId);
      if (!dbId) throw new Error(`المنتج ${publicProductId} غير موجود`);
      return { ...rest, product_id: dbId };
    });

    // "الملف" = محتوى الإدخال + وقت الإرسال، فيُرفض إرسال نفس الملف مرتين فقط عند CSV متطابق
    const fileBody = input.format === "manual" ? `${input.content}\n${new Date().toISOString()}` : input.content;
    return registerStageSeal(c, {
      sourceId: input.sourceId, fileName: input.fileName, format: input.format, fileBody, rows,
      totals: { accepted: rows.length, rejected: input.issues }, issues: [],
    });
  });
}

/** تسجيل الملف + رفع الصفوف على دفعات + الختم، داخل معاملة المستخدم نفسها */
async function registerStageSeal(
  c: PoolClient,
  input: {
    sourceId: string; fileName: string; format: "csv" | "manual" | FeedFormat; fileBody: string;
    rows: readonly (StageRow | FeedStageRow)[]; totals: Record<string, number>; issues: readonly FeedIssue[];
  }
): Promise<{ runId: string; contentSha256: string }> {
  const sha = createHash("sha256").update(input.fileBody).digest("hex");
  const run = await c.query<{ id: string }>(
    `select admin_api.register_import($1, $2, $3, $4, $5, 'mvp-admin-1', $6, $7::jsonb, $8::jsonb, $9::jsonb) as id`,
    [
      input.sourceId, `imports/mvp/${sha}`, input.fileName, Math.max(1, Buffer.byteLength(input.fileBody)), sha,
      input.format, JSON.stringify({ max_rows: 1000 }), JSON.stringify(input.totals), JSON.stringify(input.issues),
    ]
  );
  const runId = run.rows[0].id;
  for (let i = 0; i < input.rows.length; i += 500) {
    await c.query(`select admin_api.stage_import_rows($1, $2, $3::jsonb)`, [
      runId, i + 1, JSON.stringify(input.rows.slice(i, i + 500)),
    ]);
  }
  const sealed = await c.query<{ h: string }>(`select admin_api.seal_import($1, $2) as h`, [runId, input.rows.length]);
  return { runId, contentSha256: sealed.rows[0].h };
}

/* ------------------------------------------------------------------ ملفات الشركاء */

export type FeedSource = {
  id: string; name: string; kind: string; storeId: string | null;
  defaultCurrency: string | null; timeZone: string | null; columnMap: Record<string, string>;
};

/**
 * كل ما يحتاجه محرك الاستيراد من القاعدة: الكتالوج مع الباركودات وأرقام الموديل،
 * وسجل المتاجر النشطة بنطاقاتها وأسمائها البديلة المعتمدة، وإعداد المصدر.
 */
export async function feedContext(claims: DbClaims, sourceId: string) {
  return withClaims(claims, async (c) => {
    const src = await c.query<{
      id: string; name: string; kind: string; store_id: string | null; default_currency: string | null;
      time_zone: string | null; column_map: Record<string, string>;
    }>(
      `select id, name, kind, store_id, default_currency, time_zone, column_map from admin_api.sources
       where id = $1 and status = 'approved' and vertical = 'electronics' and kind in ('manual_upload', 'store_feed')`,
      [sourceId]
    );
    const products = await c.query<{ id: string; name: string; name_ar: string | null; brand: string }>(
      `select p.id, p.name, p.name_ar, b.name as brand from admin_api.products p
       join admin_api.brands b on b.id = p.brand_id
       where p.category_kind = 'electronics' and p.status = 'active'`
    );
    const idents = await c.query<{ product_id: string; kind: string; value: string }>(
      `select product_id, kind::text, value from admin_api.product_identifiers where kind in ('gtin', 'mpn')`
    );
    const stores = await c.query<{ id: string; name: string; name_ar: string; is_marketplace: boolean }>(
      `select id, name, name_ar, is_marketplace from admin_api.stores where status = 'active' and merged_into is null`
    );
    const domains = await c.query<{ domain: string; store_id: string }>(`select domain, store_id from admin_api.store_domains`);
    const aliases = await c.query<{ normalized: string; store_id: string }>(`select normalized, store_id from admin_api.store_aliases`);

    const byProduct = new Map<string, { gtins: string[]; mpns: string[] }>();
    for (const i of idents.rows) {
      const e = byProduct.get(i.product_id) ?? { gtins: [], mpns: [] };
      (i.kind === "gtin" ? e.gtins : e.mpns).push(i.value);
      byProduct.set(i.product_id, e);
    }
    const catalog: CatalogEntry[] = products.rows.map((p) => ({
      id: Number(p.id),
      label: p.name_ar ?? p.name,
      brand: p.brand,
      names: [p.name, p.name_ar ?? "", `${p.brand} ${p.name}`].filter(Boolean),
      gtins: byProduct.get(p.id)?.gtins ?? [],
      mpns: byProduct.get(p.id)?.mpns ?? [],
    }));
    const registry: StoreRecord[] = stores.rows.map((s) => ({
      id: s.id,
      name: s.name,
      nameAr: s.name_ar,
      domains: domains.rows.filter((d) => d.store_id === s.id).map((d) => d.domain),
      aliases: [s.name, s.name_ar, s.id],
      marketplace: s.is_marketplace,
    }));
    const s = src.rows[0];
    return {
      source: s
        ? ({ id: s.id, name: s.name, kind: s.kind, storeId: s.store_id, defaultCurrency: s.default_currency,
             timeZone: s.time_zone, columnMap: s.column_map ?? {} } satisfies FeedSource)
        : null,
      catalog,
      registry,
      approvedAliases: Object.fromEntries(aliases.rows.map((a) => [a.normalized, a.store_id])) as ApprovedAliases,
      activeStores: new Set(stores.rows.map((x) => x.id)),
      identifiedProducts: byProduct.size,
    };
  });
}

export async function stageFeed(
  claims: DbClaims,
  input: { sourceId: string; fileName: string; format: FeedFormat; content: string; staged: FeedStageResult }
): Promise<{ runId: string; contentSha256: string }> {
  return withClaims(claims, (c) =>
    registerStageSeal(c, {
      sourceId: input.sourceId, fileName: input.fileName, format: input.format, fileBody: input.content,
      rows: input.staged.rows,
      // seal_import يطابق عدد الصفوف المرفوعة مع totals.accepted
      totals: { ...input.staged.counts, accepted: input.staged.rows.length, rejected: input.staged.counts.total - input.staged.rows.length },
      issues: input.staged.issues,
    })
  );
}

/* ------------------------------------------------------------------ تعديل الكتالوج والمصادر */

export type ProductIdentifier = { id: number; productId: number; kind: string; value: string };

export async function listIdentifiers(claims: DbClaims): Promise<ProductIdentifier[]> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ id: string; product_id: string; kind: string; value: string }>(
      `select id, product_id, kind::text, value from admin_api.product_identifiers order by id desc limit 500`
    );
    return r.rows.map((x) => ({ id: Number(x.id), productId: Number(x.product_id), kind: x.kind, value: x.value }));
  });
}

/** يضيف باركود GTIN-14 أو رقم موديل (موحّدين مسبقًا) لمنتج إلكترونيات */
export async function addIdentifier(
  claims: DbClaims,
  input: { productId: number; kind: "gtin" | "mpn"; value: string }
): Promise<void> {
  await withClaims(claims, async (c) => {
    const p = await c.query<{ brand_id: string }>(
      `select brand_id from admin_api.products where id = $1 and category_kind = 'electronics'`,
      [input.productId]
    );
    if (!p.rows[0]) throw new Error("المنتج غير موجود");
    await c.query(
      `insert into tp.product_identifiers (product_id, kind, value, brand_id, added_by) values ($1, $2, $3, $4, $5)`,
      [input.productId, input.kind, input.value, input.kind === "mpn" ? p.rows[0].brand_id : null, claims.sub]
    );
  });
}

export async function removeIdentifier(claims: DbClaims, id: number): Promise<void> {
  await withClaims(claims, async (c) => {
    const r = await c.query(`delete from tp.product_identifiers where id = $1 and kind in ('gtin', 'mpn')`, [id]);
    if (r.rowCount !== 1) throw new Error("المعرّف غير موجود");
  });
}

/** إخفاء منتج من الموقع (أرشفة) أو إعادته — لا يُحذف شيء ويبقى سجل أسعاره */
export async function setProductStatus(claims: DbClaims, productId: number, status: "active" | "archived"): Promise<void> {
  await withClaims(claims, async (c) => {
    const r = await c.query(
      `update tp.products set status = $2 where id = $1 and category_kind = 'electronics' and status <> $2`,
      [productId, status]
    );
    if (r.rowCount !== 1) throw new Error("المنتج غير موجود أو حالته كما هي");
  });
}

/** إيقاف مصدر مؤقتًا أو إعادة اعتماده — المصدر الموقوف لا يقبل أي استيراد جديد */
export async function setSourceStatus(claims: DbClaims, sourceId: string, status: "approved" | "suspended"): Promise<void> {
  await withClaims(claims, async (c) => {
    const r = await c.query(
      status === "approved"
        ? `update tp.sources set status = 'approved', approved_by = $2, approved_at = now()
           where id = $1 and status = 'suspended' and kind <> 'legacy_manual'`
        : `update tp.sources set status = 'suspended' where id = $1 and status = 'approved' and kind <> 'legacy_manual'`,
      status === "approved" ? [sourceId, claims.sub] : [sourceId]
    );
    if (r.rowCount !== 1) throw new Error("المصدر غير موجود أو حالته لا تسمح بهذا التغيير");
  });
}

export type RunSummary = {
  id: string; sourceId: string; status: string; fileName: string; rows: number | null;
  startedAt: string; startedBy: string | null; committedAt: string | null; contentSha256: string | null;
  stats: Record<string, number> | null;
};

async function runRows(c: PoolClient, where: string, params: unknown[]): Promise<RunSummary[]> {
  const r = await c.query<{
    id: string; source_id: string; status: string; file_name: string; staged_rows: number | null;
    started_at: Date; started_by: string | null; committed_at: Date | null; content_sha256: string | null;
    totals: { commit?: Record<string, number> } | null;
  }>(
    `select r.id, r.source_id, r.status, f.file_name, r.staged_rows, r.started_at, pr.display_name as started_by,
            r.committed_at, r.content_sha256, r.totals
     from admin_api.import_runs r
     join admin_api.import_files f on f.id = r.file_id
     left join tp.profiles pr on pr.user_id = r.started_by
     ${where} order by r.started_at desc limit 30`,
    params
  );
  return r.rows.map((x) => ({
    id: x.id, sourceId: x.source_id, status: x.status, fileName: x.file_name, rows: x.staged_rows,
    startedAt: x.started_at.toISOString(), startedBy: x.started_by,
    committedAt: x.committed_at?.toISOString() ?? null, contentSha256: x.content_sha256,
    stats: x.totals?.commit ?? null,
  }));
}

export async function listRuns(claims: DbClaims) {
  return withClaims(claims, (c) => runRows(c, "", []));
}

export async function runDetail(claims: DbClaims, runId: string) {
  return withClaims(claims, async (c) => {
    const [run] = await runRows(c, "where r.id = $1", [runId]);
    if (!run) return null;
    const rows = await c.query<{
      row_no: number; store_id: string; product_id: string | null; amount: string; currency: string;
      as_of: Date; url: string; availability: string; name: string; product_name: string | null; legacy_id: number | null;
      current_price: string | null;
    }>(
      `select sr.row_no, sr.store_id, sr.product_id, sr.amount, sr.currency, sr.as_of, sr.url, sr.availability,
              sr.name, coalesce(p.name_ar, p.name) as product_name, p.legacy_id,
              (select o.amount from admin_api.offer_streams os
                 join admin_api.stream_state ss on ss.stream_id = os.id
                 join admin_api.price_observations o on o.id = ss.current_observation_id
               where os.store_id = sr.store_id and os.offer_key = sr.offer_key and os.condition = sr.condition
                 and os.seller_id is null) as current_price
       from admin_api.import_staged_rows sr
       left join admin_api.products p on p.id = sr.product_id
       where sr.run_id = $1 order by sr.row_no limit 1000`,
      [runId]
    );
    const issues = await c.query<{ row_no: number; severity: string; code: string; message: string; excerpt: Record<string, unknown> | null }>(
      `select row_no, severity::text, code, message, excerpt from admin_api.import_row_issues
       where run_id = $1 order by row_no, id limit 500`,
      [runId]
    );
    return {
      run,
      issues: issues.rows.map((i) => ({
        rowNo: i.row_no, severity: i.severity, code: i.code, message: i.message,
        name: typeof i.excerpt?.name === "string" ? i.excerpt.name : null,
      })),
      rows: rows.rows.map((r) => ({
        rowNo: r.row_no,
        storeId: r.store_id,
        product: r.product_name ?? "—",
        publicId: r.product_id ? publicIdOf(Number(r.product_id), r.legacy_id) : null,
        amount: Number(r.amount),
        currency: r.currency,
        asOf: r.as_of.toISOString(),
        url: r.url,
        availability: r.availability,
        currentPrice: r.current_price === null ? null : Number(r.current_price),
      })),
    };
  });
}

export async function commitImport(claims: DbClaims, runId: string, contentSha256: string) {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ stats: Record<string, number> }>(`select admin_api.commit_import($1, $2) as stats`, [
      runId, contentSha256,
    ]);
    return r.rows[0].stats;
  });
}

export async function discardImport(claims: DbClaims, runId: string, reason: string) {
  return withClaims(claims, async (c) => {
    await c.query(`select admin_api.discard_import($1, $2)`, [runId, reason]);
  });
}

/* ------------------------------------------------------------------ المراجعة */

export type ReviewItem = {
  observationId: number;
  product: string;
  publicId: number | null;
  storeId: string;
  storeAr: string;
  amount: number;
  currency: string;
  asOf: string;
  sourceId: string;
  verification: string;
  reasons: string[];
  lastEventId: number | null;
  previousAmount: number | null;
  importedBy: string | null;
  isDemo: boolean;
};

export const LEGACY_SOURCE_ID = "legacy-site-data";

export async function reviewQueue(
  claims: DbClaims,
  status: "unverified" | "verified" | "rejected" = "unverified",
  opts: { legacy: boolean } = { legacy: false }
) {
  return withClaims(claims, async (c) => {
    const r = await c.query<{
      observation_id: string; product: string | null; product_id: string | null; legacy_id: number | null;
      store_id: string; store_ar: string; amount: string; currency: string; as_of: Date; source_id: string;
      verification: string; exclusion_reasons: string[]; last_event: string | null; prev_amount: string | null;
      imported_by: string | null; is_demo: boolean | null;
    }>(
      `select e.observation_id, coalesce(p.name_ar, p.name) as product, e.product_id, p.legacy_id,
              e.effective_store_id as store_id, st.name_ar as store_ar, e.amount, e.currency, e.as_of, e.source_id,
              e.verification, e.exclusion_reasons,
              (select max(v.id) from admin_api.verification_events v where v.observation_id = e.observation_id) as last_event,
              (select po.amount from admin_api.offer_events ev
                 join admin_api.price_observations po on po.id = ev.previous_observation_id
               where ev.observation_id = e.observation_id and ev.kind = 'price_changed' limit 1) as prev_amount,
              (select pr.display_name from admin_api.price_observations o
                 join admin_api.import_runs ir on ir.id = o.import_run_id
                 left join tp.profiles pr on pr.user_id = ir.started_by
               where o.id = e.observation_id) as imported_by,
              d.is_demo
       from admin_api.offer_eligibility e
       join admin_api.stores st on st.id = e.effective_store_id
       left join admin_api.products p on p.id = e.product_id
       left join admin_api.product_details d on d.product_id = e.product_id
       where e.verification = $1::tp.verification and e.category_kind = 'electronics'
         and ((e.source_id = $2) = $3)
       order by e.as_of desc, e.observation_id desc limit 200`,
      [status, LEGACY_SOURCE_ID, opts.legacy]
    );
    return r.rows.map<ReviewItem>((x) => ({
      observationId: Number(x.observation_id),
      product: x.product ?? "غير مطابق",
      publicId: x.product_id ? publicIdOf(Number(x.product_id), x.legacy_id) : null,
      storeId: x.store_id,
      storeAr: x.store_ar,
      amount: Number(x.amount),
      currency: x.currency,
      asOf: x.as_of.toISOString(),
      sourceId: x.source_id,
      verification: x.verification,
      reasons: x.exclusion_reasons,
      lastEventId: x.last_event === null ? null : Number(x.last_event),
      previousAmount: x.prev_amount === null ? null : Number(x.prev_amount),
      importedBy: x.imported_by,
      isDemo: x.is_demo === true,
    }));
  });
}

export async function decide(
  claims: DbClaims,
  input: {
    observationId: number; status: "verified" | "rejected"; expectedPreviousEventId: number | null;
    reasonCode?: string; note?: string; evidenceUrl?: string;
  }
): Promise<number> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ id: string }>(
      `select admin_api.verify_observation($1, $2, $3, $4, $5, $6) as id`,
      [input.observationId, input.status, input.expectedPreviousEventId, input.reasonCode || null,
       input.note || null, input.evidenceUrl || null]
    );
    return Number(r.rows[0].id);
  });
}

export async function legacyPendingCount(claims: DbClaims): Promise<number> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ n: string }>(
      `select count(*) as n from admin_api.offer_eligibility where verification = 'unverified' and source_id = $1`,
      [LEGACY_SOURCE_ID]
    );
    return Number(r.rows[0].n);
  });
}

export async function recentDecisions(claims: DbClaims, limit = 15) {
  return withClaims(claims, async (c) => {
    const r = await c.query<{
      id: string; observation_id: string; status: string; note: string | null; at: Date; actor: string | null;
      amount: string; store_id: string; product: string | null;
    }>(
      `select v.id, v.observation_id, v.status, v.note, v.at, pr.display_name as actor, o.amount, os.store_id,
              coalesce(p.name_ar, p.name) as product
       from admin_api.verification_events v
       join admin_api.price_observations o on o.id = v.observation_id
       join admin_api.offer_streams os on os.id = o.stream_id
       left join admin_api.products p on p.id = os.product_id
       left join tp.profiles pr on pr.user_id = v.actor_id
       order by v.id desc limit $1`,
      [limit]
    );
    return r.rows.map((x) => ({
      id: Number(x.id), observationId: Number(x.observation_id), status: x.status, note: x.note,
      at: x.at.toISOString(), actor: x.actor, amount: Number(x.amount), storeId: x.store_id, product: x.product,
    }));
  });
}

/** يحوّل أخطاء القاعدة إلى رسالة عربية مفهومة للمشرف */
export function friendlyDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  if (msg.includes("self review")) return "لا يمكنك مراجعة سعر استوردته أو اعتمدت استيراده بنفسك (مبدأ العينين).";
  if (msg.includes("stale review")) return "تغيّرت حالة هذا السعر منذ فتحت الصفحة (راجعه شخص آخر). حدّث الصفحة.";
  if (msg.includes("already")) return "هذا القرار مسجل بالفعل على هذا السعر.";
  if (msg.includes("reversed by a different reviewer")) return "عكس القرار يجب أن يكون من مراجع آخر.";
  if (msg.includes("requires a note")) return "عكس القرار أو الرفض يتطلب ملاحظة توضح السبب.";
  if (msg.includes("evidence_url")) return "الأسعار اليدوية تحتاج رابط دليل (لقطة أو صفحة المتجر) قبل الاعتماد.";
  if (msg.includes("permission denied")) return "ليست لديك صلاحية لهذه العملية.";
  if (msg.includes("does not match the sealed preview") || msg.includes("changed after the preview"))
    return "محتوى الاستيراد لا يطابق المعاينة المختومة. أعد الرفع.";
  if (msg.includes("cannot be committed")) return "هذا الاستيراد لا يمكن اعتماده (معتمد أو ملغى مسبقًا).";
  if (msg.includes("duplicate file")) return "هذا الملف نفسه مسجل من قبل.";
  if (msg.includes("mvp_sar_only")) return "الأسعار بالريال السعودي فقط في MVP.";
  if (msg.includes("exceeds max_commit_rows")) return "عدد الصفوف أكبر من حد MVP (1,000 صف). الاستيراد الضخم معطّل مؤقتًا.";
  if (msg.includes("cannot grant a role to yourself")) return "لا يمكنك منح دور لنفسك.";
  if (msg.includes("cannot revoke the last active admin")) return "لا يمكن سحب دور آخر مشرف فعّال.";
  if (msg.includes("user must exist in Supabase Auth")) return "هذا المعرّف غير موجود في Supabase Auth. أنشئ الحساب أولًا من لوحة Supabase.";
  if (msg.includes("display name must be")) return "الاسم المعروض مطلوب (من 2 إلى 120 حرفًا).";
  if (msg.includes("role not assigned")) return "هذا الدور غير ممنوح لهذا المستخدم.";
  if (msg.includes("invalid email")) return "البريد الإلكتروني غير صحيح.";
  if (msg.includes("invalid whatsapp")) return "رقم الواتساب بالصيغة الدولية فقط، مثال: ‎+9665XXXXXXXX";
  if (msg.includes("reply must be")) return "الرد مطلوب (حتى 4000 حرف).";
  if (msg.includes("request not found")) return "الطلب غير موجود.";
  if (msg.includes("aal2") || msg.includes("mfa")) return "هذه العملية تتطلب التحقق الثنائي.";
  if (code === "23505") return "القيمة موجودة مسبقًا (المعرّف مستخدم).";
  if (code === "23514" && msg.includes("rejection")) return "الرفض يتطلب ملاحظة.";
  if (code === "23514") return "قيمة غير مقبولة: تحقق من الحقول (المعرّف بأحرف لاتينية صغيرة وشرطة، والروابط تبدأ بـ https://).";
  return `تعذّر تنفيذ العملية: ${msg.split("\n")[0].slice(0, 200)}`;
}

/* ------------------------------------------------------------------ المستخدمون والأدوار */

export type AdminUser = { userId: string; displayName: string; status: string; roles: string[] };

export async function listUsers(claims: DbClaims): Promise<AdminUser[]> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ user_id: string; display_name: string; status: string; roles: string[] }>(
      "select * from admin_api.list_users()"
    );
    return r.rows.map((x) => ({ userId: x.user_id, displayName: x.display_name, status: x.status, roles: x.roles }));
  });
}

export async function upsertProfile(claims: DbClaims, userId: string, displayName: string): Promise<void> {
  await withClaims(claims, (c) => c.query("select admin_api.upsert_profile($1, $2)", [userId, displayName]));
}

export async function setRole(claims: DbClaims, userId: string, role: string, grant: boolean): Promise<void> {
  await withClaims(claims, (c) =>
    c.query(grant ? "select admin_api.grant_role($1, $2)" : "select admin_api.revoke_role($1, $2)", [userId, role])
  );
}

/* ------------------------------------------------------------------ إحصائيات الزوار */

export type VisitorStats = {
  from: string;
  to: string;
  totals: { pageviews: number; daily_unique_visitors_sum: number; visits: number };
  daily: { day: string; pageviews: number; visitors: number; visits: number }[];
  top_pages: { path: string; n: number }[];
  top_products: { ref_id: string; n: number; name: string | null }[];
  top_cars: { ref_id: string; n: number; name: string | null }[];
  top_searches: { q: string; n: number }[];
  referrers: { host: string; n: number }[];
  devices: { device: string; n: number }[];
};

export async function visitorStats(claims: DbClaims, days: number): Promise<VisitorStats> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ v: VisitorStats }>(`select admin_api.visitor_stats($1) as v`, [days]);
    const v = r.rows[0].v;
    const num = (x: unknown) => Number(x) || 0;
    return {
      ...v,
      totals: {
        pageviews: num(v.totals.pageviews),
        daily_unique_visitors_sum: num(v.totals.daily_unique_visitors_sum),
        visits: num(v.totals.visits),
      },
      daily: v.daily.map((d) => ({ day: d.day, pageviews: num(d.pageviews), visitors: num(d.visitors), visits: num(d.visits) })),
    };
  });
}

/* ------------------------------------------------------------------ طلبات التواصل */

export type RequestRow = {
  id: number; reference: string; kind: string; status: string; subject: string;
  createdAt: string; updatedAt: string; hasContact: boolean; replies: number;
};

export async function listRequests(
  claims: DbClaims,
  filter: { status?: string | null; kind?: string | null }
): Promise<{ rows: RequestRow[]; counts: Record<string, number> }> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{
      id: string; reference: string; kind: string; status: string; subject: string; created_at: Date; updated_at: Date;
      has_contact: boolean; replies: number;
    }>(`select * from admin_api.list_requests($1, $2, 200)`, [filter.status ?? null, filter.kind ?? null]);
    const counts = await c.query<{ status: string; n: number }>(`select * from admin_api.request_counts()`);
    return {
      rows: r.rows.map((x) => ({
        id: Number(x.id), reference: x.reference, kind: x.kind, status: x.status, subject: x.subject,
        createdAt: x.created_at.toISOString(), updatedAt: x.updated_at.toISOString(), hasContact: x.has_contact, replies: x.replies,
      })),
      counts: Object.fromEntries(counts.rows.map((x) => [x.status, x.n])),
    };
  });
}

export type RequestDetail = {
  id: number; reference: string; kind: string; status: string; name: string | null; email: string | null;
  phone: string | null; subject: string; message: string; related_ref: string | null; created_at: string; updated_at: string;
  replies: { id: number; body: string; is_public: boolean; at: string; author: string | null }[];
};

export async function requestDetail(claims: DbClaims, id: number): Promise<RequestDetail | null> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ v: RequestDetail | null }>(`select admin_api.request_detail($1) as v`, [id]);
    return r.rows[0]?.v ?? null;
  });
}

export async function setRequestStatus(claims: DbClaims, id: number, status: string): Promise<void> {
  await withClaims(claims, (c) => c.query(`select admin_api.set_request_status($1, $2)`, [id, status]));
}

export async function replyRequest(claims: DbClaims, id: number, body: string, isPublic: boolean): Promise<void> {
  await withClaims(claims, (c) => c.query(`select admin_api.reply_request($1, $2, $3)`, [id, body, isPublic]));
}

/* ------------------------------------------------------------------ إعدادات التواصل */

export async function siteSettings(claims: DbClaims): Promise<Record<string, { value: string; updatedAt: string }>> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{ key: string; value: string; updated_at: Date }>(`select * from admin_api.site_settings()`);
    return Object.fromEntries(r.rows.map((x) => [x.key, { value: x.value, updatedAt: x.updated_at.toISOString() }]));
  });
}

export async function setSiteSetting(claims: DbClaims, key: "contact_email" | "contact_whatsapp", value: string): Promise<void> {
  await withClaims(claims, (c) => c.query(`select admin_api.set_site_setting($1, $2)`, [key, value]));
}

/* ------------------------------------------------------------------ تعديل منتج */

export const DETAIL_FIELDS = {
  storage: "التخزين",
  memory: "الذاكرة",
  screen: "الشاشة",
  chip: "المعالج",
  camera: "الكاميرا الخلفية",
  front_camera: "الكاميرا الأمامية",
  battery: "البطارية",
  connectivity: "الاتصال",
  water_resistance: "مقاومة الماء",
  refresh_rate: "معدل التحديث",
} as const;
export type DetailField = keyof typeof DETAIL_FIELDS;

export type EditableProduct = {
  id: number; publicId: number; name: string; nameAr: string | null; status: string; brand: string; category: string;
  details: Partial<Record<DetailField, string | null>> & { description: string | null; colors: string[]; is_demo: boolean };
};

export async function productForEdit(claims: DbClaims, id: number): Promise<EditableProduct | null> {
  return withClaims(claims, async (c) => {
    const r = await c.query<{
      id: string; legacy_id: number | null; name: string; name_ar: string | null; status: string; brand: string; category: string;
    }>(
      `select p.id, p.legacy_id, p.name, p.name_ar, p.status::text, b.name as brand, cat.name_ar as category
       from admin_api.products p join admin_api.brands b on b.id = p.brand_id join admin_api.categories cat on cat.id = p.category_id
       where p.id = $1 and p.category_kind = 'electronics'`,
      [id]
    );
    const p = r.rows[0];
    if (!p) return null;
    const d = await c.query<Record<string, unknown>>(`select * from admin_api.product_details where product_id = $1`, [id]);
    const row = d.rows[0] ?? {};
    const details: EditableProduct["details"] = {
      description: (row.description as string | null) ?? null,
      colors: (row.colors as string[] | undefined) ?? [],
      is_demo: Boolean(row.is_demo),
    };
    for (const k of Object.keys(DETAIL_FIELDS) as DetailField[]) details[k] = (row[k] as string | null) ?? null;
    return {
      id: Number(p.id), publicId: publicIdOf(Number(p.id), p.legacy_id), name: p.name, nameAr: p.name_ar,
      status: p.status, brand: p.brand, category: p.category, details,
    };
  });
}

/** يعدّل الاسم والمواصفات فقط (لا يمس الأسعار أو سجلها). كل حقل فارغ = غير محدد. */
export async function updateProduct(
  claims: DbClaims,
  id: number,
  input: { name: string; nameAr: string | null; description: string | null; colors: string[]; details: Partial<Record<DetailField, string | null>> }
): Promise<void> {
  await withClaims(claims, async (c) => {
    const u = await c.query(
      `update tp.products set name = $2, name_ar = $3 where id = $1 and category_kind = 'electronics'`,
      [id, input.name, input.nameAr]
    );
    if (u.rowCount !== 1) throw new Error("المنتج غير موجود");
    const keys = Object.keys(DETAIL_FIELDS) as DetailField[];
    const cols = [...keys, "description", "colors"];
    const vals = [...keys.map((k) => input.details[k] ?? null), input.description, input.colors];
    await c.query(
      `insert into tp.product_details (product_id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
       on conflict (product_id) do update set ${cols.map((k) => `${k} = excluded.${k}`).join(", ")}`,
      [id, ...vals]
    );
  });
}
