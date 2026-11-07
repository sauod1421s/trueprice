/**
 * إحصائيات الزوار وطلبات التواصل داخل القاعدة نفسها (db/schema/003_visitors_requests.sql).
 * يعمل على القاعدة المحلية فقط: npm run mvp:test-db
 * كل تعديل داخل معاملة تُلغى (ROLLBACK)، فلا يبقى شيء في القاعدة.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const enabled = process.env.TP_DATA_SOURCE === "db" && !!url;
const ADMIN_A = "00000000-0000-4000-8000-0000000000a1";
const REVIEWER = "00000000-0000-4000-8000-0000000000b1";
const NOBODY = "00000000-0000-4000-8000-00000000ffff";
const UA = "Mozilla/5.0 (test)";

describe.skipIf(!enabled)("الزوار والطلبات: القاعدة تفرض القواعد", () => {
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
  async function asPublic() {
    await c.query("reset role");
    await c.query("select set_config('request.jwt.claims', '', true)");
    await c.query("set local role web_reader");
  }
  async function as(uid: string, aal: "aal1" | "aal2" = "aal2") {
    await c.query("reset role");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
    await c.query("set local role authenticated");
  }
  async function fails(sql: string, params: unknown[] = []): Promise<{ message: string; code?: string }> {
    await c.query("savepoint s");
    try {
      await c.query(sql, params);
    } catch (e) {
      await c.query("rollback to savepoint s");
      return { message: (e as Error).message, code: (e as { code?: string }).code };
    }
    throw new Error(`expected failure: ${sql}`);
  }
  const view = (ip: string, path = "/", kind = "home", ref: string | null = null, q: string | null = null, ua = UA) =>
    c.query<{ ok: boolean }>("select pub.record_page_view($1, $2, $3, $4, $5, $6, $7, $8) as ok",
      [ip, ua, path, kind, ref, q, null, "mobile"]);
  const submit = (ip: string, message: string, extra: Partial<{ kind: string; email: string; phone: string; ref: string }> = {}) =>
    c.query<{ reference: string; tracking_code: string }>(
      "select * from pub.submit_contact_request($1, $2, $3, $4, $5, $6, $7, $8)",
      [ip, extra.kind ?? "inquiry", "زائر اختبار", extra.email ?? null, extra.phone ?? null, "سؤال اختبار", message, extra.ref ?? null]
    );

  it("الموقع العام يسجّل المشاهدة ولا يقرأ أي جدول خاص، ولا يُخزَّن IP أو المتصفح", async () => {
    await inTx(async () => {
      await asPublic();
      expect((await view("203.0.113.5")).rows[0].ok).toBe(true);
      for (const t of ["tp.page_views", "tp.visitor_salts", "tp.contact_requests", "tp.rate_limit_hits", "tp.site_settings"]) {
        expect((await fails(`select * from ${t} limit 1`)).message).toMatch(/permission denied/);
      }
      expect((await fails("select admin_api.visitor_stats(30)")).message).toMatch(/permission denied/);
      await c.query("reset role");
      const cols = await c.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'tp' and table_name = 'page_views'`
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).not.toEqual(expect.arrayContaining(["ip"]));
      expect(names.some((n) => /ip|agent|ua$/.test(n))).toBe(false);
    });
  });

  it("الإغراق: أكثر من 120 مشاهدة في 10 دقائق من نفس الزائر تُتجاهل", async () => {
    await inTx(async () => {
      await asPublic();
      let accepted = 0;
      for (let i = 0; i < 125; i++) if ((await view("198.51.100.7", `/product/${i}`, "product", String(i))).rows[0].ok) accepted++;
      expect(accepted).toBe(120);
      expect((await view("198.51.100.8")).rows[0].ok).toBe(true); // زائر آخر غير متأثر
    });
  });

  it("لوحة الإحصائيات: زوار فريدون، زيارات، مشاهدات، الأكثر بحثًا ومشاهدة", async () => {
    await inTx(async () => {
      await asPublic();
      const before = await (async () => {
        await as(ADMIN_A);
        const r = await c.query<{ s: { totals: Record<string, number> } }>("select admin_api.visitor_stats(1) as s");
        await asPublic();
        return r.rows[0].s.totals;
      })();
      await view("192.0.2.10", "/");
      await view("192.0.2.10", "/product/1", "product", "1");
      await view("192.0.2.10", "/search?q=x", "search", null, "ايفون 17");
      await view("192.0.2.11", "/product/1", "product", "1");
      await view("192.0.2.11", "/cars/toyota", "car_brand", "toyota");
      await view("192.0.2.11", "/", "home", null, null, "Mozilla/5.0 (other device)"); // متصفح آخر = زائر آخر
      await as(ADMIN_A);
      const s = (await c.query<{ s: {
        totals: Record<string, number>; daily: { visitors: number }[];
        top_products: { ref_id: string; n: number; name: string }[]; top_cars: { ref_id: string; name: string }[];
        top_searches: { q: string; n: number }[]; devices: { device: string; n: number }[];
      } }>("select admin_api.visitor_stats(1) as s")).rows[0].s;
      expect(s.totals.pageviews - before.pageviews).toBe(6);
      expect(s.totals.daily_unique_visitors_sum - before.daily_unique_visitors_sum).toBe(3);
      expect(s.totals.visits - before.visits).toBe(3);
      expect(s.daily).toHaveLength(1);
      expect(s.top_products.find((p) => p.ref_id === "1")).toMatchObject({ n: expect.any(Number), name: expect.stringMatching(/آيفون|iPhone/) });
      expect(s.top_cars.find((p) => p.ref_id === "toyota")?.name).toBeTruthy();
      expect(s.top_searches.find((x) => x.q === "ايفون 17")).toBeTruthy();
      // مشاهد بلا صلاحية
      await as(NOBODY);
      expect((await fails("select admin_api.visitor_stats(30)")).message).toMatch(/permission denied: stats:read/);
    });
  });

  it("طلب تواصل: رقم مرجعي ورمز متابعة، والمتابعة لا تكشف البيانات الشخصية ولا الملاحظات الداخلية", async () => {
    await inTx(async () => {
      await asPublic();
      const r = (await submit("203.0.113.20", "أريد الاستفسار عن طريقة حساب السعر العادل", { email: "Visitor@Example.com", phone: "+966 5 0000 0000" })).rows[0];
      expect(r.reference).toMatch(/^TP-[A-HJ-NP-Z2-9]{8}$/);
      expect(r.tracking_code).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);

      const track = (ref: string, code: string) =>
        c.query("select * from pub.track_contact_request($1, $2, $3)", ["203.0.113.20", ref, code]);
      expect((await track(r.reference, "AAAA-BBBB-CCCC-DDDD")).rowCount).toBe(0);
      expect((await track("TP-ZZZZZZZZ", r.tracking_code)).rowCount).toBe(0);
      const ok = await track(r.reference.toLowerCase(), r.tracking_code.toLowerCase().replace(/-/g, " "));
      expect(ok.rows[0]).toMatchObject({ reference: r.reference, status: "new", kind: "inquiry" });
      expect(Object.keys(ok.rows[0])).not.toEqual(expect.arrayContaining(["email", "phone", "name", "message"]));

      // المشرف يرى البيانات ويرد
      await as(ADMIN_A);
      const list = await c.query<{ id: string; reference: string; has_contact: boolean }>("select * from admin_api.list_requests(null, null, 50)");
      const mine = list.rows.find((x) => x.reference === r.reference)!;
      expect(mine.has_contact).toBe(true);
      const detail = (await c.query<{ d: Record<string, unknown> }>("select admin_api.request_detail($1) as d", [mine.id])).rows[0].d;
      expect(detail).toMatchObject({ email: "visitor@example.com", phone: "+966500000000" });
      expect(JSON.stringify(detail)).not.toMatch(/token|tracking/);
      await c.query("select admin_api.reply_request($1, $2, false)", [mine.id, "ملاحظة داخلية: تحقق من المصدر"]);
      await c.query("select admin_api.reply_request($1, $2, true)", [mine.id, "شكرًا لك، تم الرد على استفسارك"]);

      await asPublic();
      const after = (await track(r.reference, r.tracking_code)).rows[0] as { status: string; replies: { body: string }[] };
      expect(after.status).toBe("answered");
      expect(after.replies.map((x) => x.body)).toEqual(["شكرًا لك، تم الرد على استفسارك"]);

      await as(ADMIN_A);
      await c.query("select admin_api.set_request_status($1, 'spam')", [mine.id]);
      await asPublic();
      expect(((await track(r.reference, r.tracking_code)).rows[0] as { status: string }).status).toBe("closed");
    });
  });

  it("الحماية من الإزعاج: التحقق من المدخلات، التكرار، وحد المعدل لكل زائر", async () => {
    await inTx(async () => {
      await asPublic();
      expect((await fails("select * from pub.submit_contact_request('1.1.1.1', 'hack', null, null, null, 'abc', 'رسالة طويلة بما يكفي', null)")).code).toBe("TP400");
      expect((await fails("select * from pub.submit_contact_request('1.1.1.1', 'inquiry', null, 'not-an-email', null, 'abc', 'رسالة طويلة بما يكفي', null)")).code).toBe("TP400");
      expect((await fails("select * from pub.submit_contact_request('1.1.1.1', 'inquiry', null, null, null, 'abc', 'قصيرة', null)")).code).toBe("TP400");
      const links = "روابط http://a.example http://b.example http://c.example http://d.example";
      expect((await fails("select * from pub.submit_contact_request('1.1.1.1', 'inquiry', null, null, null, 'abc', $1, null)", [links])).code).toBe("TP400");

      await submit("198.51.100.30", "رسالة اختبار رقم واحد لا تتكرر");
      expect((await fails("select * from pub.submit_contact_request('198.51.100.30', 'inquiry', null, null, null, 'abc', 'رسالة اختبار رقم واحد لا تتكرر', null)")).code).toBe("TP409");
      // المحاولة المرفوضة تُلغى بكاملها (لا تُحتسب)، فالمقبول 5 في الساعة
      for (let i = 2; i <= 5; i++) await submit("198.51.100.30", `رسالة اختبار رقم ${i} مختلفة`);
      const sixth = await fails("select * from pub.submit_contact_request('198.51.100.30', 'inquiry', null, null, null, 'abc', 'رسالة اختبار رقم 99 مختلفة', null)");
      expect(sixth.code).toBe("TP429");
      // زائر آخر غير متأثر
      expect((await submit("198.51.100.31", "رسالة من زائر آخر مختلفة")).rowCount).toBe(1);
    });
  });

  it("الصلاحيات: المراجع لا يقرأ الطلبات، والمعالجة تتطلب تحققًا ثنائيًا", async () => {
    await inTx(async () => {
      await asPublic();
      const r = (await submit("203.0.113.40", "طلب لاختبار الصلاحيات في لوحة الإدارة")).rows[0];
      await as(ADMIN_A);
      const id = (await c.query<{ id: string }>("select id from admin_api.list_requests(null, null, 50) where reference = $1", [r.reference])).rows[0].id;

      await as(REVIEWER);
      expect((await fails("select * from admin_api.list_requests(null, null, 10)")).message).toMatch(/permission denied: requests:read/);
      expect((await fails("select admin_api.request_detail($1)", [id])).message).toMatch(/permission denied/);

      await as(ADMIN_A, "aal1");
      expect((await c.query("select * from admin_api.list_requests(null, null, 10)")).rowCount).toBeGreaterThan(0); // القراءة بلا MFA
      expect((await fails("select admin_api.set_request_status($1, 'closed')", [id])).message).toMatch(/permission denied: requests:manage/);
      expect((await fails("select admin_api.reply_request($1, 'x', true)", [id])).message).toMatch(/permission denied/);
      expect((await fails("select admin_api.set_site_setting('contact_email', 'a@b.co')")).message).toMatch(/permission denied: settings:manage/);
    });
  });

  it("إعدادات التواصل: تحقق من الصيغة، وتظهر للموقع العام فقط بعد ضبطها، والفارغ يزيلها", async () => {
    await inTx(async () => {
      await as(ADMIN_A);
      expect((await fails("select admin_api.set_site_setting('contact_email', 'bad')")).code).toBe("TP400");
      expect((await fails("select admin_api.set_site_setting('contact_whatsapp', '0500000000')")).code).toBe("TP400");
      expect((await fails("select admin_api.set_site_setting('other', 'x')")).code).toBe("TP400");
      await c.query("select admin_api.set_site_setting('contact_email', 'Support@Example.org')");
      await c.query("select admin_api.set_site_setting('contact_whatsapp', '+966 50 000 0000')");
      await asPublic();
      expect((await c.query("select * from pub.site_contact")).rows[0]).toEqual({ email: "Support@Example.org", whatsapp: "+966500000000" });
      await as(ADMIN_A);
      await c.query("select admin_api.set_site_setting('contact_whatsapp', '')");
      await asPublic();
      expect((await c.query("select * from pub.site_contact")).rows[0]).toEqual({ email: "Support@Example.org", whatsapp: null });
    });
  });

  it("فاحص الصلاحيات: 0 مخالفة بعد 003", async () => {
    // tp.privilege_violations مملوكة لـ tp_owner وغير متاحة لـ tp_app؛ تُفحص في npm run mvp:setup.
    // هنا نتأكد أن دوال 003 العامة غير قابلة للتنفيذ من PUBLIC.
    const r = await c.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('tp', 'pub', 'admin_api') and p.proname in
         ('record_page_view', 'submit_contact_request', 'track_contact_request', 'visitor_stats', 'daily_hash', 'rate_limited')
         and has_function_privilege('public', p.oid, 'execute')`
    );
    expect(r.rows[0].n).toBe(0);
  });
});
