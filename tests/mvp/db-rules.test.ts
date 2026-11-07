/**
 * قواعد MVP داخل القاعدة نفسها — تعمل فقط على القاعدة المحلية (npm run mvp:setup):
 *   set -a; . .local/mvp.env; set +a; TP_DATA_SOURCE=db npx vitest run tests/mvp/db-rules.test.ts
 * كل تعديل هنا داخل معاملة تُلغى (ROLLBACK)، فلا يتغير شيء في القاعدة.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { feedToStageRows } from "../../app/lib/admin/feedRows";
import { runImport } from "../../app/lib/ingest/importer";
import { buildCatalogIndex } from "../../app/lib/ingest/matching";

const url = process.env.DATABASE_URL;
const enabled = process.env.TP_DATA_SOURCE === "db" && !!url;
const ADMIN_A = "00000000-0000-4000-8000-0000000000a1";
const REVIEWER = "00000000-0000-4000-8000-0000000000b1";

describe.skipIf(!enabled)("MVP: القاعدة تفرض القواعد بنفسها", () => {
  let c: pg.Client;
  beforeAll(async () => {
    c = new pg.Client({ connectionString: url });
    await c.connect();
  });
  afterAll(async () => {
    await c.end();
  });

  async function inTx<T>(fn: () => Promise<T>): Promise<T> {
    await c.query("begin");
    try {
      return await fn();
    } finally {
      await c.query("rollback");
    }
  }
  async function as(uid: string) {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated", aal: "aal2" })]);
    await c.query("set local role authenticated");
  }
  async function fails(sql: string, params: unknown[] = []): Promise<string> {
    await c.query("savepoint s");
    try {
      await c.query(sql, params);
    } catch (e) {
      await c.query("rollback to savepoint s");
      return (e as Error).message;
    }
    throw new Error(`expected failure: ${sql}`);
  }

  it("دور الموقع العام لا يقرأ الجداول الخاصة، ويقرأ pub فقط", async () => {
    await inTx(async () => {
      await c.query("set local role web_reader");
      expect(await fails("select * from tp.price_observations limit 1")).toMatch(/permission denied/);
      expect(await fails("select * from admin_api.products limit 1")).toMatch(/permission denied/);
      const n = await c.query("select count(*)::int as n from pub.products");
      expect(n.rows[0].n).toBeGreaterThanOrEqual(52);
    });
  });

  it("الأسعار المرجعية القديمة (غير موثقة، تاريخ غير مؤكد) لا تصل للموقع", async () => {
    await inTx(async () => {
      await c.query("set local role web_reader");
      const r = await c.query(`select count(*)::int as n from pub.electronics_offers o join pub.products p on p.id = o.product_id
                               where p.legacy_id is not null`);
      expect(r.rows[0].n).toBe(0);
      const h = await c.query(`select count(*)::int as n from pub.price_history where legacy_id is not null`);
      expect(h.rows[0].n).toBe(0);
    });
  });

  it("كل سعر ظاهر في الموقع آخر قرار عليه موثق، والمرفوض لا يظهر في السجل", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      const shown = await c.query(`select count(*)::int as n from admin_api.offer_eligibility
                                   where cardinality(exclusion_reasons) = 0 and verification <> 'verified'`);
      expect(shown.rows[0].n).toBe(0);
      const rejected = await c.query(`select observation_id from admin_api.offer_eligibility where verification = 'rejected'`);
      await c.query("reset role");
      await c.query("set local role web_reader");
      for (const r of rejected.rows) {
        const h = await c.query("select 1 from pub.price_history where observation_id = $1", [r.observation_id]);
        expect(h.rowCount).toBe(0);
      }
    });
  });

  it("تحويل العملات معطّل مؤقتًا حتى للمشرف", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      expect(await fails("select admin_api.add_fx_rate('USD', 3.75, 'x', null, now())")).toMatch(/permission denied/);
      expect(await fails("select admin_api.approve_fx_rate(1)")).toMatch(/permission denied/);
    });
  });

  it("الريال فقط: صف بعملة أخرى يُرفض داخل القاعدة", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      const src = await c.query(`select id from admin_api.sources where status = 'approved' and kind = 'manual_upload' limit 1`);
      if (!src.rowCount) return; // يحتاج مصدرًا يدويًا (يُنشئه السيناريو)
      const prod = await c.query(`select id from admin_api.products limit 1`);
      const store = await c.query(`select id from admin_api.stores where status = 'active' limit 1`);
      const sha = "a".repeat(63) + "1";
      const run = await c.query(
        `select admin_api.register_import($1, 'imports/test-usd', 'f.csv', 10, $2, 't', 'csv', '{}', '{"accepted":1}') as id`,
        [src.rows[0].id, sha]
      );
      const msg = await fails("select admin_api.stage_import_rows($1, 1, $2::jsonb)", [
        run.rows[0].id,
        JSON.stringify([{ store_id: store.rows[0].id, offer_key: "usd-test", condition: "new", amount: "10", currency: "USD",
          as_of: new Date().toISOString(), url: "https://x.example.com/p", canonical_url: "https://x.example.com/p",
          name: "x", product_id: prod.rows[0].id }]),
      ]);
      expect(msg).toMatch(/mvp_sar_only/);
    });
  });

  it("الاستيراد الضخم معطّل: حد التشغيل الواحد 1,000 صف", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      const r = await c.query(`select value::int as v from admin_api.settings where key = 'max_commit_rows'`);
      expect(r.rows[0].v).toBe(1000);
      const o = await c.query(`select value::int as v from admin_api.settings where key = 'mvp_original_max_commit_rows'`);
      expect(o.rows[0].v).toBe(20000);
    });
  });

  it("المراجع لا يضيف منتجات ولا يستورد (صلاحيات القاعدة)", async () => {
    await inTx(async () => {
      await as(REVIEWER);
      expect(await fails(`insert into tp.brands (slug, name) values ('test-reviewer-brand', 'x')`)).toMatch(/row-level security|permission/);
      expect(await fails(`select admin_api.register_import('legacy-site-data', 'imports/x', 'f', 1, $1, 't', 'csv', '{}', '{}')`, ["b".repeat(64)]))
        .toMatch(/permission denied/);
    });
  });

  it("الاستيراد الآلي معطّل مؤقتًا", async () => {
    await inTx(async () => {
      const r = await c.query(`select bool_or(has_function_privilege('ingest_service', p.oid, 'execute')) as ok, count(*)::int as n
                               from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'ingest_api'`);
      expect(r.rows[0].n).toBe(4);
      expect(r.rows[0].ok).toBe(false);
    });
  });
  it("ملف شريك: المطابق بالباركود فقط يُرفع، والباقي ملاحظات محفوظة، والقاعدة تقبل الصيغة", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      const store = "test-feed-store";
      await c.query(`insert into tp.stores (id, name, name_ar, created_by) values ($1, 'Test Feed Store', 'متجر اختبار', $2)`, [store, ADMIN_A]);
      await c.query(`insert into tp.store_domains (domain, store_id) values ('feed.example.com', $1)`, [store]);
      await c.query(
        `insert into tp.sources (id, name, kind, vertical, store_id, default_currency, time_zone, status, permission_basis, approved_by, approved_at)
         values ('test-feed-src', 'Test feed', 'store_feed', 'electronics', $1, 'SAR', 'Asia/Riyadh', 'approved', 'اختبار آلي', $2, now())`,
        [store, ADMIN_A]
      );
      const p = await c.query<{ id: string; brand_id: string }>(
        `select id, brand_id from admin_api.products where category_kind = 'electronics' and status = 'active' order by id limit 1`
      );
      await c.query(`insert into tp.product_identifiers (product_id, kind, value, added_by) values ($1, 'gtin', '04006381333931', $2)`, [p.rows[0].id, ADMIN_A]);

      const feed = [
        "id,title,price,currency,link,gtin,condition,updated_at",
        "F-1,Some Phone,1999,SAR,https://feed.example.com/p/1,4006381333931,new,2026-11-05T08:00:00+03:00",
        "F-2,Unknown Thing,10,SAR,https://feed.example.com/p/2,,new,2026-11-05T08:00:00+03:00",
      ].join("\n");
      const result = runImport({
        source: { id: "test-feed-src", name: "Test feed", kind: "store_feed", storeId: store, timeZone: "Asia/Riyadh" },
        fileName: "feed.csv", content: feed, importedAt: new Date().toISOString(),
        catalog: buildCatalogIndex([{ id: Number(p.rows[0].id), label: "x", brand: "x", names: ["x"], gtins: ["04006381333931"], mpns: [] }]),
        registry: [{ id: store, name: "Test Feed Store", nameAr: "متجر اختبار", domains: ["feed.example.com"], aliases: [], marketplace: false }],
      });
      const staged = feedToStageRows(result, { activeStores: new Set([store]) });
      expect(staged.rows).toHaveLength(1);

      const run = await c.query<{ id: string }>(
        `select admin_api.register_import('test-feed-src', 'imports/test-feed', 'feed.csv', 100, $1, 't', 'csv', '{}', $2::jsonb, $3::jsonb) as id`,
        ["c".repeat(64), JSON.stringify({ ...staged.counts, accepted: staged.rows.length }), JSON.stringify(staged.issues)]
      );
      await c.query(`select admin_api.stage_import_rows($1, 1, $2::jsonb)`, [run.rows[0].id, JSON.stringify(staged.rows)]);
      await c.query(`select admin_api.seal_import($1, 1)`, [run.rows[0].id]);
      const sr = await c.query(`select product_id, external_id, date_confirmed, as_of from admin_api.import_staged_rows where run_id = $1`, [run.rows[0].id]);
      expect(sr.rows).toEqual([{ product_id: p.rows[0].id, external_id: "F-1", date_confirmed: true, as_of: new Date("2026-11-05T05:00:00Z") }]);
      const iss = await c.query(`select code from admin_api.import_row_issues where run_id = $1`, [run.rows[0].id]);
      expect(iss.rows.map((r) => r.code)).toEqual(["unmatched"]);

      // المصدر الموقوف لا يقبل أي استيراد جديد
      await c.query(`update tp.sources set status = 'suspended' where id = 'test-feed-src'`);
      expect(await fails(`select admin_api.register_import('test-feed-src', 'imports/test-feed-2', 'f', 1, $1, 't', 'csv', '{}', '{}')`, ["d".repeat(64)]))
        .toMatch(/not approved|suspended/);
    });
  });

  it("إخفاء منتج يزيله من الموقع دون حذف، والمراجع لا يعدّل الكتالوج ولا المصادر", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      const p = await c.query<{ id: string }>(`select id from admin_api.products where category_kind = 'electronics' and status = 'active' order by id limit 1`);
      await c.query(`update tp.products set status = 'archived' where id = $1`, [p.rows[0].id]);
      await c.query("reset role");
      await c.query("set local role web_reader");
      expect((await c.query(`select 1 from pub.products where id = $1`, [p.rows[0].id])).rowCount).toBe(0);
      await c.query("reset role");
      await as(ADMIN_A);
      expect((await c.query(`select 1 from admin_api.products where id = $1`, [p.rows[0].id])).rowCount).toBe(1);
      await c.query("reset role");
      await as(REVIEWER);
      expect(await fails(`insert into tp.product_identifiers (product_id, kind, value) values ($1, 'gtin', '04006381333931')`, [p.rows[0].id]))
        .toMatch(/row-level security|permission/);
      const u = await c.query(`update tp.sources set status = 'suspended' where id = 'legacy-site-data'`);
      expect(u.rowCount).toBe(0);
    });
  });
});
