/**
 * نقل كتالوج الموقع الحالي (app/data/products.ts) إلى القاعدة المحلية — بدون حذف أي شيء.
 *
 * - التصنيفات والعلامات والمنتجات (legacy_id = نفس رقم الرابط الحالي /product/[id]).
 * - تفاصيل صفحة المنتج (الشاشة، المعالج، الألوان، الوصف...).
 * - المتاجر الحالية.
 * - الأسعار الحالية تُستورد عبر نفس مسار الاستيراد (تسجيل → رفع → ختم → اعتماد) من مصدر
 *   "legacy_manual": تبقى غير موثقة، وتاريخها غير مؤكد (تفرضه القاعدة)، فلا تظهر كأسعار
 *   معتمدة ولا تدخل في السعر العادل حتى تُراجع. لا تُخترع أي أسعار جديدة.
 *
 * كل العمليات بهوية "مشرف تجريبي أ" عبر نفس صلاحيات اللوحة (RLS + admin_api)، وتُسجَّل في التدقيق.
 * إعادة التشغيل آمنة: ما هو موجود يُتخطى.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const ADMIN_A = "00000000-0000-4000-8000-0000000000a1";
export const REVIEWER = "00000000-0000-4000-8000-0000000000b1";
const LEGACY_SOURCE = "legacy-site-data";
const MARKETPLACES = new Set(["amazon", "noon"]);

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55) || "x";

async function loadStaticProducts(root) {
  // يُحوَّل ملف TypeScript الحالي إلى JavaScript مؤقتًا ويُقرأ كما هو (بدون نسخ البيانات يدويًا)
  const src = readFileSync(join(root, "app/data/products.ts"), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const dir = join(root, ".local/tmp");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "static-products.mjs");
  writeFileSync(file, out.outputText);
  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
  return mod.products;
}

async function asUser(c, uid, fn) {
  await c.query("begin");
  try {
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated", aal: "aal2" }),
    ]);
    await c.query("set local role authenticated");
    const r = await fn();
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

export async function seedCatalog(c, root) {
  const products = await loadStaticProducts(root);
  process.stdout.write(`  • نقل الكتالوج الحالي (${products.length} منتجًا) ... `);

  // دور المراجع (عبر دالة منح الأدوار نفسها)
  await asUser(c, ADMIN_A, async () => {
    const has = await c.query("select 1 from tp.user_roles where user_id = $1 and role_id = 'reviewer'", [REVIEWER]);
    if (!has.rowCount) await c.query("select admin_api.grant_role($1, 'reviewer')", [REVIEWER]);
  });

  const summary = await asUser(c, ADMIN_A, async () => {
    // التصنيفات بنفس ترتيب ظهورها في الموقع
    const cats = [...new Map(products.map((p) => [p.category, p.categoryAr])).entries()];
    const catId = new Map();
    for (const [i, [en, ar]] of cats.entries()) {
      const r = await c.query(
        `insert into tp.categories (kind, slug, name_ar, name_en, sort_order) values ('electronics', $1, $2, $3, $4)
         on conflict (slug) do update set name_ar = excluded.name_ar returning id`,
        [slug(en), ar, en, i * 10]
      );
      catId.set(en, r.rows[0].id);
    }

    const brandId = new Map();
    for (const [en, ar] of new Map(products.map((p) => [p.brand, p.brandAr]))) {
      const r = await c.query(
        `insert into tp.brands (slug, name, name_ar) values ($1, $2, $3)
         on conflict (slug) do update set name_ar = excluded.name_ar returning id`,
        [slug(en), en, ar]
      );
      brandId.set(en, r.rows[0].id);
    }

    const dbId = new Map();
    for (const p of products) {
      const existing = await c.query("select id from tp.products where legacy_id = $1", [p.id]);
      if (existing.rowCount) {
        dbId.set(p.id, existing.rows[0].id);
        continue;
      }
      const fam = await c.query(
        `insert into tp.product_families (category_id, category_kind, brand_id, slug, name, name_ar)
         values ($1, 'electronics', $2, $3, $4, $5) returning id`,
        [catId.get(p.category), brandId.get(p.brand), `f-${p.id}-${slug(p.name)}`, p.name, p.nameAr]
      );
      const prod = await c.query(
        `insert into tp.products (legacy_id, family_id, category_id, category_kind, brand_id, slug, name, name_ar, status)
         values ($1, $2, $3, 'electronics', $4, $5, $6, $7, 'active') returning id`,
        [p.id, fam.rows[0].id, catId.get(p.category), brandId.get(p.brand), `p-${p.id}-${slug(p.name)}`, p.name, p.nameAr]
      );
      const id = prod.rows[0].id;
      dbId.set(p.id, id);
      await c.query(
        `insert into tp.product_details (product_id, memory, storage, screen, chip, camera, front_camera, battery,
           connectivity, water_resistance, refresh_rate, colors, description, amazon_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [id, p.memory ?? null, p.storage ?? null, p.screen ?? null, p.chip ?? null, p.camera ?? null,
         p.frontCamera ?? null, p.battery ?? null, p.connectivity ?? null, p.waterResistance ?? null,
         p.refreshRate ?? null, p.colors ?? [], p.description ?? null,
         p.amazonUrl && p.amazonUrl.startsWith("https://") ? p.amazonUrl : null]
      );
    }

    // المتاجر الحالية
    const stores = new Map();
    for (const p of products) for (const o of p.offers) stores.set(slug(o.store), { name: o.store, nameAr: o.storeAr });
    for (const [id, s] of stores) {
      await c.query(
        `insert into tp.stores (id, name, name_ar, is_marketplace, created_by) values ($1, $2, $3, $4, $5)
         on conflict (id) do nothing`,
        [id, s.name, s.nameAr, MARKETPLACES.has(id), ADMIN_A]
      );
    }

    // مصدر البيانات الحالية: مرجعي يدوي غير موثق
    await c.query(
      `insert into tp.sources (id, name, kind, vertical, default_currency, time_zone, status, permission_basis, approved_by, approved_at)
       values ($1, 'بيانات الموقع الحالية (قبل MVP)', 'legacy_manual', 'electronics', 'SAR', 'Asia/Riyadh', 'approved',
               'أسعار مرجعية مُدخلة يدويًا في الموقع الحالي — غير موثقة وتاريخها غير مؤكد', $2, now())
       on conflict (id) do nothing`,
      [LEGACY_SOURCE, ADMIN_A]
    );
    return { categories: cats.length, stores: stores.size, dbId };
  });

  // الأسعار الحالية عبر مسار الاستيراد نفسه (مرة واحدة)
  const already = await asUser(c, ADMIN_A, async () =>
    (await c.query("select 1 from admin_api.import_runs where source_id = $1 and status = 'committed'", [LEGACY_SOURCE])).rowCount
  );
  let imported = 0;
  if (!already) {
    const rows = [];
    for (const p of products) {
      const seen = new Map();
      for (const o of p.offers) {
        const store = slug(o.store);
        const n = (seen.get(store) ?? 0) + 1;
        seen.set(store, n);
        rows.push({
          store_id: store,
          offer_key: `legacy-${p.id}-${store}${n > 1 ? `-${n}` : ""}`,
          condition: "new",
          amount: String(o.price),
          currency: "SAR",
          as_of: `${o.checkedAt}T00:00:00+03:00`,
          availability: "unknown",
          name: p.name,
          url: o.url,
          canonical_url: o.url,
          product_id: String(summary.dbId.get(p.id)),
          date_confirmed: false,
        });
      }
    }
    const body = JSON.stringify(rows);
    const sha = createHash("sha256").update(body).digest("hex");
    await asUser(c, ADMIN_A, async () => {
      const run = (await c.query(
        `select admin_api.register_import($1, $2, 'app-data-products.json', $3, $4, 'mvp-seed-1', 'manual',
                '{"source":"app/data/products.ts"}'::jsonb, $5::jsonb) as id`,
        [LEGACY_SOURCE, `imports/legacy/${sha}`, Buffer.byteLength(body), sha, JSON.stringify({ accepted: rows.length })]
      )).rows[0].id;
      for (let i = 0; i < rows.length; i += 500) {
        await c.query("select admin_api.stage_import_rows($1, $2, $3::jsonb)", [run, i + 1, JSON.stringify(rows.slice(i, i + 500))]);
      }
      const h = (await c.query("select admin_api.seal_import($1, $2) as h", [run, rows.length])).rows[0].h;
      await c.query("select admin_api.commit_import($1, $2)", [run, h]);
    });
    imported = rows.length;
  }
  console.log(
    `تم (${summary.categories} تصنيفات، ${summary.stores} متجرًا، ${imported ? `${imported} سعرًا مرجعيًا غير موثق` : "الأسعار المرجعية موجودة مسبقًا"})`
  );
}
