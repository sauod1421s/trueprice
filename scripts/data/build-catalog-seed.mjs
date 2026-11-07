/**
 * يولّد db/seed/100_catalog_seed.sql من بيانات الموقع الحالية كما هي (app/data/products.ts و cars.ts):
 * نفس الملف يُنفَّذ محليًا (npm run mvp:setup) وعلى Supabase (بعد الموافقة)، فما يُختبر هنا هو ما يُنفَّذ هناك.
 *
 * القواعد (من قرارات المشروع المعتمدة):
 *   - لا تُخترع أسعار. كل سعر حالي يُستورد عبر مسار الاستيراد نفسه (تسجيل → رفع → ختم → اعتماد)
 *     من مصدر legacy_manual: غير موثق، وتاريخه غير مؤكد (تفرضه القاعدة)، ولا يدخل في السعر العادل.
 *   - روابط المنتجات الحالية /product/[id] محفوظة عبر legacy_id.
 *   - السيارات: جديدة فقط في البيانات الحالية، مربوطة بمنتج (سنة الموديل + الفئة). أسعار cars.ts لا تُعامل
 *     كأسعار وكلاء رسمية. الفئة غير المذكورة في المصدر تُسجَّل "غير محددة" ولا تُخمَّن.
 *   - cars.ts لا يذكر تاريخ جمع الأسعار، فتاريخ الملاحظة = تاريخ آخر تعديل للملف في Git (تاريخ التسجيل)،
 *     ويبقى "غير مؤكد". إن تغيّر الملف يرفض المولّد العمل حتى يُحدَّث هذا التاريخ عمدًا.
 *
 * الاستخدام: node scripts/data/build-catalog-seed.mjs        (يكتب الملف)
 *            node scripts/data/build-catalog-seed.mjs --check (يفشل إن كان الملف المحفوظ قديمًا)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "db/seed/100_catalog_seed.sql");

// آخر تعديل لـ app/data/cars.ts في Git (067f013 «Fix car brand pages»). يُحدَّث يدويًا فقط مع تغيّر الملف.
const CARS_RECORDED_AT = "2026-09-19T22:05:34+03:00";
const CARS_DATA_SHA256 = "da8ca3f12d692f228099839f474f8327b9bcdf684f9055b9d4d7167df11191ca";

const ELECTRONICS_SOURCE = "legacy-site-data";
const CARS_SOURCE = "legacy-site-cars";
const MARKETPLACES = new Set(["amazon", "noon"]);
const TRIM_UNSPECIFIED = "غير محددة";

const slugPart = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const legacySlug = (s) => slugPart(s).slice(0, 55); // نفس دالة النسخة السابقة (لا تتغير المعرّفات)
function boundedSlug(s) {
  if (s.length <= 63) return s;
  const h = createHash("sha256").update(s).digest("hex").slice(0, 8);
  return `${s.slice(0, 54).replace(/-+$/, "")}-${h}`;
}

async function loadTs(rel, outRel, rewrite = (x) => x) {
  const src = rewrite(readFileSync(join(ROOT, rel), "utf8"));
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = join(ROOT, ".local/tmp/seedgen", outRel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, out);
  return { file, src };
}

export async function buildSeed() {
  const prodMod = await loadTs("app/data/products.ts", "data/products.mjs");
  const carsMod = await loadTs("app/data/cars.ts", "data/cars.mjs");
  const carBrandsMod = await loadTs("app/lib/carBrands.ts", "lib/carBrands.mjs", (s) =>
    s.replace(/from "\.\.\/data\/cars"/, 'from "../data/cars.mjs"')
  );
  const carsSha = createHash("sha256").update(readFileSync(join(ROOT, "app/data/cars.ts"))).digest("hex");
  if (carsSha !== CARS_DATA_SHA256) {
    throw new Error(
      `app/data/cars.ts تغيّر (sha256=${carsSha}). حدّث CARS_RECORDED_AT إلى تاريخ التعديل الجديد ثم CARS_DATA_SHA256 في هذا الملف.`
    );
  }
  const bust = `?t=${Date.now()}`;
  const { products } = await import(pathToFileURL(prodMod.file).href + bust);
  const brands = (await import(pathToFileURL(carsMod.file).href + bust)).default;
  const { brandNameAr } = await import(pathToFileURL(carBrandsMod.file).href + bust);

  // ---------------- الإلكترونيات (نفس منطق النسخة السابقة حرفيًا)
  const categories = [...new Map(products.map((p) => [p.category, p.categoryAr])).entries()].map(([en, ar], i) => ({
    slug: legacySlug(en), name_en: en, name_ar: ar, sort_order: i * 10,
  }));
  const ebrands = [...new Map(products.map((p) => [p.brand, p.brandAr])).entries()].map(([en, ar]) => ({
    slug: legacySlug(en), name: en, name_ar: ar,
  }));
  const eproducts = products.map((p) => ({
    legacy_id: p.id,
    category: legacySlug(p.category),
    brand: legacySlug(p.brand),
    family_slug: `f-${p.id}-${legacySlug(p.name)}`,
    slug: `p-${p.id}-${legacySlug(p.name)}`,
    name: p.name,
    name_ar: p.nameAr,
    details: {
      memory: p.memory ?? null, storage: p.storage ?? null, screen: p.screen ?? null, chip: p.chip ?? null,
      camera: p.camera ?? null, front_camera: p.frontCamera ?? null, battery: p.battery ?? null,
      connectivity: p.connectivity ?? null, water_resistance: p.waterResistance ?? null,
      refresh_rate: p.refreshRate ?? null, colors: p.colors ?? [], description: p.description ?? null,
      amazon_url: p.amazonUrl && p.amazonUrl.startsWith("https://") ? p.amazonUrl : null,
    },
  }));
  const estores = new Map();
  for (const p of products) for (const o of p.offers) estores.set(legacySlug(o.store), { name: o.store, name_ar: o.storeAr });
  const erows = [];
  for (const p of products) {
    const seen = new Map();
    for (const o of p.offers) {
      const store = legacySlug(o.store);
      const n = (seen.get(store) ?? 0) + 1;
      seen.set(store, n);
      erows.push({
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
        product_slug: `p-${p.id}-${legacySlug(p.name)}`,
        date_confirmed: false,
      });
    }
  }

  // ---------------- السيارات
  const cbrands = [];
  const families = new Map();
  const cproducts = [];
  const cstores = [];
  const crows = [];
  const usedSlugs = new Set();
  for (const [brandId, brand] of Object.entries(brands)) {
    cbrands.push({ slug: legacySlug(brandId), name: brand.name, name_ar: brandNameAr[brandId] ?? brand.name });
    const storeId = boundedSlug(`${legacySlug(brandId)}-brand-site`);
    let brandHasPrice = false;
    for (const m of brand.models) {
      const famSlug = boundedSlug(`car-${legacySlug(brandId)}-${slugPart(m.name)}`);
      if (!families.has(famSlug)) families.set(famSlug, { slug: famSlug, brand: legacySlug(brandId), name: m.name });
      const trim = m.trim && m.trim.trim() ? m.trim.trim() : TRIM_UNSPECIFIED;
      let base = boundedSlug(`car-${legacySlug(brandId)}-${slugPart(m.name)}-${m.year}${m.trim ? `-${slugPart(m.trim)}` : ""}`);
      let s = base;
      for (let i = 2; usedSlugs.has(s); i++) s = boundedSlug(`${base}-${i}`);
      usedSlugs.add(s);
      cproducts.push({
        slug: s, family_slug: famSlug, brand: legacySlug(brandId),
        name: `${brand.name} ${m.name}`, name_ar: `${brandNameAr[brandId] ?? brand.name} ${m.name}`,
        model_year: m.year, trim,
        specs: { engine: m.engine ?? null, power: m.power ?? null, fuel: m.fuel ?? null },
      });
      if (typeof m.price === "number") {
        brandHasPrice = true;
        const url = m.sourceUrl && m.sourceUrl.startsWith("https://") ? m.sourceUrl : brand.sourceUrl;
        crows.push({
          store_id: storeId,
          offer_key: `legacy-car-${s}`,
          condition: "new",
          amount: String(m.price),
          currency: "SAR",
          as_of: CARS_RECORDED_AT,
          availability: "unknown",
          name: `${brand.name} ${m.name} ${m.year}`,
          url,
          canonical_url: url,
          product_slug: s,
          date_confirmed: false,
          car: { model_year: m.year, trim },
        });
      }
    }
    if (brandHasPrice) {
      cstores.push({ id: storeId, name: `${brand.sourceName} (موقع العلامة)`, name_ar: `${brand.sourceName} (موقع العلامة)` });
    }
  }

  const payload = {
    electronics: { categories, brands: ebrands, products: eproducts, stores: [...estores].map(([id, s]) => ({ id, ...s, is_marketplace: MARKETPLACES.has(id) })) },
    cars: {
      category: { slug: "cars", name_ar: "السيارات", name_en: "Cars", sort_order: 1000 },
      specs: [
        { key: "engine", label_ar: "المحرك" },
        { key: "power", label_ar: "القوة" },
        { key: "fuel", label_ar: "الوقود" },
      ],
      brands: cbrands, families: [...families.values()], products: cproducts, stores: cstores,
    },
    sources: [
      { id: ELECTRONICS_SOURCE, name: "بيانات الموقع الحالية (قبل MVP)", vertical: "electronics",
        permission_basis: "أسعار مرجعية مُدخلة يدويًا في الموقع الحالي — غير موثقة وتاريخها غير مؤكد" },
      { id: CARS_SOURCE, name: "بيانات السيارات في الموقع الحالي (قبل MVP)", vertical: "cars",
        permission_basis: "أسعار سيارات مرجعية مُدخلة يدويًا في الموقع الحالي (app/data/cars.ts) — غير موثقة وتاريخها غير مؤكد، ولا تُعامل كأسعار وكلاء رسمية" },
    ],
    imports: [
      { source: ELECTRONICS_SOURCE, file_name: "app-data-products.json", origin: "app/data/products.ts", rows: erows },
      { source: CARS_SOURCE, file_name: "app-data-cars.json", origin: "app/data/cars.ts", rows: crows },
    ],
  };
  const stats = {
    electronics_products: eproducts.length, electronics_prices: erows.length, electronics_stores: estores.size,
    car_brands: cbrands.length, car_families: families.size, car_products: cproducts.length,
    car_prices: crows.length, car_stores: cstores.length,
  };
  return { sql: renderSql(payload, stats, carsSha), stats };
}

function renderSql(payload, stats, carsSha) {
  const json = JSON.stringify(payload);
  if (json.includes("$json$")) throw new Error("payload contains the dollar-quote tag");
  const srcSha = createHash("sha256").update(json).digest("hex");
  return `-- =====================================================================
-- TruePrice — نقل الكتالوج الحالي (الإلكترونيات + السيارات) وأسعاره المرجعية إلى القاعدة.
-- مولَّد آليًا بـ scripts/data/build-catalog-seed.mjs من app/data — لا يُعدَّل يدويًا.
-- payload sha256=${srcSha}  cars.ts sha256=${carsSha}
--
-- المحتوى: ${stats.electronics_products} منتجًا إلكترونيًا، ${stats.electronics_prices} سعرًا مرجعيًا، ${stats.electronics_stores} متجرًا؛
--          ${stats.car_brands} علامة سيارات، ${stats.car_families} عائلة موديل، ${stats.car_products} سيارة جديدة (سنة + فئة)،
--          ${stats.car_prices} سعرًا مرجعيًا للسيارات من ${stats.car_stores} موقع علامة.
-- كل الأسعار تدخل غير موثقة وتاريخها غير مؤكد، فلا تظهر كأسعار معتمدة ولا تدخل في السعر العادل.
--
-- يُنفَّذ بدور postgres (Supabase SQL Editor) بعد: المخطط 001، طبقة MVP 002، دور التطبيق 010،
-- وتهيئة أول مشرف (tp.bootstrap_first_admins). يعمل بهوية أول مشرف عبر صلاحيات اللوحة نفسها
-- (RLS + admin_api) فيُسجَّل كل شيء في التدقيق باسمه. معاملة واحدة، وإعادة التشغيل آمنة:
-- ما هو موجود يُتخطى، والاستيراد لا يتكرر. لا حذف ولا تعديل لبيانات قائمة.
-- =====================================================================
begin;

do $seed$
declare
  d        jsonb := $json$${json}$json$::jsonb;
  v_admin  uuid;
  v_cat    bigint;
  v_brand  bigint;
  v_fam    bigint;
  v_prod   bigint;
  v_spec   bigint;
  v_run    uuid;
  v_hash   text;
  v_rows   jsonb;
  v_n      int;
  v_text   text;
  e        jsonb;
  i        int;
begin
  select b.admins[1] into v_admin from tp.bootstrap_state b;
  if v_admin is null then
    raise exception 'لم تُنفَّذ تهيئة أول مشرف بعد: شغّل tp.bootstrap_first_admins أولًا';
  end if;

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;

  -- ---------------- الإلكترونيات
  for e in select * from jsonb_array_elements(d -> 'electronics' -> 'categories') loop
    insert into tp.categories (kind, slug, name_ar, name_en, sort_order)
    values ('electronics', e ->> 'slug', e ->> 'name_ar', e ->> 'name_en', (e ->> 'sort_order')::int)
    on conflict (slug) do nothing;
  end loop;
  for e in select * from jsonb_array_elements((d -> 'electronics' -> 'brands') || (d -> 'cars' -> 'brands')) loop
    insert into tp.brands (slug, name, name_ar) values (e ->> 'slug', e ->> 'name', e ->> 'name_ar')
    on conflict (slug) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(d -> 'electronics' -> 'products') loop
    continue when exists (select 1 from tp.products where legacy_id = (e ->> 'legacy_id')::int);
    select id into strict v_cat from tp.categories where slug = e ->> 'category';
    select id into strict v_brand from tp.brands where slug = e ->> 'brand';
    insert into tp.product_families (category_id, category_kind, brand_id, slug, name, name_ar)
    values (v_cat, 'electronics', v_brand, e ->> 'family_slug', e ->> 'name', e ->> 'name_ar')
    on conflict (slug) do nothing;
    select id into strict v_fam from tp.product_families where slug = e ->> 'family_slug';
    insert into tp.products (legacy_id, family_id, category_id, category_kind, brand_id, slug, name, name_ar, status)
    values ((e ->> 'legacy_id')::int, v_fam, v_cat, 'electronics', v_brand, e ->> 'slug', e ->> 'name', e ->> 'name_ar', 'active')
    returning id into v_prod;
    insert into tp.product_details (product_id, memory, storage, screen, chip, camera, front_camera, battery,
                                    connectivity, water_resistance, refresh_rate, colors, description, amazon_url)
    select v_prod, x.memory, x.storage, x.screen, x.chip, x.camera, x.front_camera, x.battery, x.connectivity,
           x.water_resistance, x.refresh_rate,
           coalesce(array(select jsonb_array_elements_text(e -> 'details' -> 'colors')), '{}'), x.description, x.amazon_url
    from jsonb_to_record(e -> 'details') as x(memory text, storage text, screen text, chip text, camera text,
         front_camera text, battery text, connectivity text, water_resistance text, refresh_rate text,
         description text, amazon_url text);
  end loop;

  for e in select * from jsonb_array_elements((d -> 'electronics' -> 'stores') || (d -> 'cars' -> 'stores')) loop
    insert into tp.stores (id, name, name_ar, is_marketplace, created_by)
    values (e ->> 'id', e ->> 'name', e ->> 'name_ar', coalesce((e ->> 'is_marketplace')::boolean, false), v_admin)
    on conflict (id) do nothing;
  end loop;

  -- ---------------- السيارات (جديدة: منتج = علامة + موديل + سنة + فئة؛ العائلة جاهزة للمستعمل لاحقًا)
  insert into tp.categories (kind, slug, name_ar, name_en, sort_order)
  values ('cars', d -> 'cars' -> 'category' ->> 'slug', d -> 'cars' -> 'category' ->> 'name_ar',
          d -> 'cars' -> 'category' ->> 'name_en', (d -> 'cars' -> 'category' ->> 'sort_order')::int)
  on conflict (slug) do nothing;
  select id into strict v_cat from tp.categories where slug = d -> 'cars' -> 'category' ->> 'slug' and kind = 'cars';

  for e in select * from jsonb_array_elements(d -> 'cars' -> 'specs') loop
    insert into tp.spec_definitions (category_id, key, label_ar, data_type)
    values (v_cat, e ->> 'key', e ->> 'label_ar', 'text')
    on conflict (category_id, key) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(d -> 'cars' -> 'families') loop
    select id into strict v_brand from tp.brands where slug = e ->> 'brand';
    insert into tp.product_families (category_id, category_kind, brand_id, slug, name)
    values (v_cat, 'cars', v_brand, e ->> 'slug', e ->> 'name')
    on conflict (slug) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(d -> 'cars' -> 'products') loop
    continue when exists (select 1 from tp.products where slug = e ->> 'slug');
    select f.id, f.brand_id into strict v_fam, v_brand from tp.product_families f where f.slug = e ->> 'family_slug';
    insert into tp.products (family_id, category_id, category_kind, brand_id, slug, name, name_ar, model_year, trim, status)
    values (v_fam, v_cat, 'cars', v_brand, e ->> 'slug', e ->> 'name', e ->> 'name_ar',
            (e ->> 'model_year')::smallint, e ->> 'trim', 'active')
    returning id into v_prod;
    for v_text in select k from jsonb_object_keys(e -> 'specs') k loop
      continue when e -> 'specs' ->> v_text is null;
      select id into strict v_spec from tp.spec_definitions where category_id = v_cat and key = v_text;
      insert into tp.product_specs (product_id, spec_id, category_id, value_text)
      values (v_prod, v_spec, v_cat, e -> 'specs' ->> v_text)
      on conflict do nothing;
    end loop;
  end loop;

  -- ---------------- مصادر البيانات الحالية: مرجعية يدوية غير موثقة
  for e in select * from jsonb_array_elements(d -> 'sources') loop
    insert into tp.sources (id, name, kind, vertical, default_currency, time_zone, status, permission_basis, approved_by, approved_at)
    values (e ->> 'id', e ->> 'name', 'legacy_manual', (e ->> 'vertical')::tp.category_kind, 'SAR', 'Asia/Riyadh',
            'approved', e ->> 'permission_basis', v_admin, now())
    on conflict (id) do nothing;
  end loop;

  -- ---------------- الأسعار الحالية عبر مسار الاستيراد نفسه (مرة واحدة لكل مصدر)
  for e in select * from jsonb_array_elements(d -> 'imports') loop
    continue when exists (select 1 from tp.import_runs where source_id = e ->> 'source' and status = 'committed');
    select jsonb_agg((r.x - 'product_slug') || jsonb_build_object('product_id', p.id::text) order by r.ord), count(p.id)
      into v_rows, v_n
    from jsonb_array_elements(e -> 'rows') with ordinality as r(x, ord)
    left join tp.products p on p.slug = r.x ->> 'product_slug';
    if v_n <> jsonb_array_length(e -> 'rows') then
      raise exception 'seed: % rows of % reference unknown products', jsonb_array_length(e -> 'rows') - v_n, e ->> 'source';
    end if;
    v_text := v_rows::text;
    v_hash := encode(sha256(convert_to(v_text, 'UTF8')), 'hex');
    v_run := admin_api.register_import(e ->> 'source', 'imports/legacy/' || v_hash, e ->> 'file_name',
                                       octet_length(v_text), v_hash, 'catalog-seed-1', 'manual',
                                       jsonb_build_object('source', e ->> 'origin'),
                                       jsonb_build_object('accepted', v_n));
    i := 0;
    while i < v_n loop
      perform admin_api.stage_import_rows(v_run, i + 1,
        (select jsonb_agg(x order by ord) from jsonb_array_elements(v_rows) with ordinality as t(x, ord)
          where ord > i and ord <= i + 500));
      i := i + 500;
    end loop;
    v_hash := admin_api.seal_import(v_run, v_n);
    perform admin_api.commit_import(v_run, v_hash);
  end loop;

  reset role;
end $seed$;

commit;
`;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const { sql, stats } = await buildSeed();
  if (process.argv.includes("--check")) {
    let current = "";
    try { current = readFileSync(OUT, "utf8"); } catch {}
    if (current !== sql) {
      console.error("db/seed/100_catalog_seed.sql قديم مقارنة بـ app/data. شغّل: node scripts/data/build-catalog-seed.mjs");
      process.exit(1);
    }
    console.log("seed SQL up to date", stats);
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, sql);
    console.log("wrote", OUT, stats);
  }
}
