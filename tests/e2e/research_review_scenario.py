"""
سيناريو مساعد الرصد كاملًا (محليًا، بيانات اختبار example.com فقط):
مصادر مسودة ← الإدخال مرفوض ← المشرف يعتمد المصادر برابط الشروط وإقرار ← إدخال بدور tp_research ←
قائمة المراجعة ← اعتماد مجمّع بإقرار ← الظهور في صفحة المنتج مع الرسم والسعر العادل.

يتطلب: قاعدة محلية جديدة (npm run mvp:setup، تطبّق 004) والموقع بوضع MVP المحلي.
    python tests/e2e/research_review_scenario.py BASE OUT
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "research-screens"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
os.makedirs(OUT, exist_ok=True)
expect.set_options(timeout=15_000)
results = []
STORES = ["apple", "jarir", "extra"]
PRICES = {"apple": "5299", "jarir": "5249", "extra": "5199"}


def step(name, fn):
    t0 = time.time()
    try:
        fn()
        results.append({"step": name, "status": "PASS", "seconds": round(time.time() - t0, 2)})
        print(f"PASS  {name}")
    except Exception as e:  # noqa: BLE001
        results.append({"step": name, "status": "FAIL", "error": str(e)[:400]})
        print(f"FAIL  {name}\n      {str(e)[:400]}")


def db(*args):
    """تنفيذ SQL على القاعدة المحلية (scripts/mvp/db.mjs sql) — يعيد (نجح؟، المخرجات)"""
    p = subprocess.run(["node", "scripts/mvp/db.mjs", "sql", *args], cwd=ROOT, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout + p.stderr).strip()


def ledger_sql():
    ok, out = db("-c", "select id from tp.products where legacy_id = 2")
    assert ok, out
    pid = json.loads(out)[0]["id"]
    observed = (datetime.now(timezone(timedelta(hours=3))) - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M+03:00")
    rows = [
        f"{pid},iPhone 17 512GB,{s},{PRICES[s]},,https://example.com/{s}/iphone-17-512,{observed},in_stock,yes,iPhone 17 / 512GB,اختبار"
        for s in STORES
    ]
    d = tempfile.mkdtemp(prefix="tp-research-")
    csv = os.path.join(d, "e2e-ledger.csv")
    with open(csv, "w", encoding="utf8") as f:
        f.write("product_id,product_name,store_id,price_sar,list_price_sar,url,observed_at,availability,vat_included,match,notes\n")
        f.write("\n".join(rows) + "\n")
    sql = subprocess.run(["node", "scripts/research/ledger-to-sql.mjs", csv, "electronics"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    path = os.path.join(d, "import.sql")
    with open(path, "w", encoding="utf8") as f:
        f.write(sql)
    return path


# مصدر مسودة ثالث (اختبار محلي فقط) حتى يتوفر 3 مصادر مستقلة للسعر العادل
ok, out = db("-c", """insert into tp.sources (id, name, kind, vertical, store_id, default_currency, time_zone,
    allow_automated, service_submission, status, permission_basis)
  values ('research-extra', 'مساعد الرصد — إكسترا (اختبار)', 'assisted_research', 'electronics', 'extra', 'SAR', 'Asia/Riyadh',
    false, true, 'draft', 'اختبار محلي') on conflict (id) do nothing returning id""")
assert ok, out
IMPORT_SQL = ledger_sql()

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(locale="ar-SA", viewport={"width": 1280, "height": 900}).new_page()

    def login():
        page.goto(f"{BASE}/admin")
        page.locator("li", has_text="مشرف تجريبي أ").get_by_role("button", name="دخول").click()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()

    step("1. دخول المشرف", login)

    def drafts_reject():
        ok, out = db(IMPORT_SQL)
        assert not ok and "not approved" in out, out
        page.goto(f"{BASE}/admin/stores")
        for s in STORES:
            expect(page.locator(f"[data-research-approve=research-{s}]")).to_be_visible()
        page.screenshot(path=os.path.join(OUT, "r0-draft-sources.png"), full_page=True)

    step("2. المصادر مسودة: القاعدة ترفض الإدخال، واللوحة تعرض نموذج الاعتماد", drafts_reject)

    def approve_requires_terms():
        form = page.locator("[data-research-approve=research-apple]")
        form.locator("input[name=termsUrl]").fill("https://www.apple.com/sa/legal/")
        form.locator("button[type=submit]").click()  # بلا إقرار: النموذج لا يُرسل (required)
        expect(page.locator("[data-flash=ok]")).to_have_count(0)
        expect(form).to_be_visible()

    step("3. اعتماد المصدر يتطلب رابط الشروط وإقرارًا صريحًا", approve_requires_terms)

    def approve_sources():
        for s in STORES:
            form = page.locator(f"[data-research-approve=research-{s}]")
            form.locator("input[name=termsUrl]").fill(f"https://example.com/{s}/terms")
            form.locator("input[name=attest]").check()
            form.locator("button[type=submit]").click()
            expect(page.locator("[data-flash=ok]").first).to_contain_text(f"research-{s}")
        expect(page.locator("[data-research-approve]")).to_have_count(0)
        expect(page.get_by_text("https://example.com/apple/terms")).to_be_visible()
        ok, out = db("-c", """select count(*)::int as n from tp.sources s join tp.audit_log a
            on a.entity_type = 'sources' and a.entity_id = s.id and a.actor_id = s.approved_by and a.after ->> 'status' = 'approved'
            where s.kind = 'assisted_research' and s.status = 'approved' and s.permission_evidence_url is not null""")
        assert ok and json.loads(out)[0]["n"] == 3, out
        page.screenshot(path=os.path.join(OUT, "r0b-sources-approved.png"), full_page=True)

    step("4. المشرف يعتمد 3 مصادر بعد مراجعة الشروط (مسجل باسمه في سجل التدقيق)", approve_sources)

    def import_as_research():
        ok, out = db(IMPORT_SQL)
        assert ok, out
        rows = json.loads(out)
        assert len(rows) == 3 and all(r["status"] == "committed" for r in rows), rows
        ok, out = db("-c", """select count(*)::int as n from tp.audit_log a join tp.import_runs r on a.entity_id = r.id::text
            where r.source_id like 'research-%' and a.action = 'import.commit' and a.actor_id is null
              and a.actor_label = 'service:' || r.source_id""")
        assert ok and json.loads(out)[0]["n"] == 3, out

    step("5. الإدخال بدور tp_research (سجل التدقيق: service:research-<متجر>)", import_as_research)

    def queue():
        page.goto(f"{BASE}/admin/review?kind=electronics")
        items = page.locator("li.card", has_text="مساعد الرصد")
        expect(items.first).to_be_visible()
        assert items.count() >= 3, items.count()
        first = items.first
        expect(first.locator("[data-source-link]")).to_be_visible()
        expect(first).to_contain_text("المطابقة:")
        ev = first.locator("input[name=evidenceUrl]").input_value()
        assert ev.startswith("https://"), ev  # الدليل مقترح من رابط المصدر
        page.screenshot(path=os.path.join(OUT, "r1-review-queue.png"), full_page=True)

    step("6. قائمة المراجعة: أسعار مساعد الرصد برابط المصدر والمطابقة ودليل مقترح", queue)

    def batch_requires_attest():
        items = page.locator("li.card", has_text="مساعد الرصد")
        for i in range(3):
            items.nth(i).locator("[data-pick]").check()
        page.locator("[data-batch-form] button[type=submit]").click()
        expect(page.locator("[data-flash=ok]")).to_have_count(0)

    step("7. الاعتماد المجمّع يتطلب إقرارًا بفتح الروابط", batch_requires_attest)

    def batch_approve():
        page.locator("[data-batch-form] input[name=attest]").check()
        page.locator("[data-batch-form] button[type=submit]").click()
        expect(page.locator("[data-flash=ok]").first).to_contain_text("اعتُمد 3")

    step("8. اعتماد 3 أسعار دفعة واحدة", batch_approve)

    def visible():
        page.goto(f"{BASE}/product/2")
        chart = page.locator("[data-price-comparison]").first
        expect(chart.locator("[data-chart]")).to_be_visible()
        assert chart.locator("[data-chart-row=used]").count() == 3
        assert chart.locator("[data-sources]").get_attribute("data-sources") == "3"
        expect(chart.locator("[data-stat=fair]")).not_to_contain_text("غير متاح")
        chart.screenshot(path=os.path.join(OUT, "r2-product-chart.png"))

    step("9. الأسعار المعتمدة تظهر في صفحة المنتج مع الرسم والسعر العادل", visible)
    browser.close()

json.dump(results, open(os.path.join(OUT, "research_results.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n{sum(r['status'] == 'PASS' for r in results)}/{len(results)} passed")
sys.exit(0 if all(r["status"] == "PASS" for r in results) else 1)
