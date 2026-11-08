"""
سيناريو مساعد الرصد → مراجعة المشرف → الظهور في الموقع (محليًا، بيانات اختبار example.com فقط).

يتطلب: الموقع بوضع MVP المحلي (local-preview) وقاعدة طُبّق عليها 004، وملف SQL الاستيراد مُنفَّذ مسبقًا
(scripts/research/ledger-to-sql.mjs على سجل اختبار لمنتج legacy_id=2).
    python tests/e2e/research_review_scenario.py BASE OUT
"""
import json
import os
import sys
import time

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "research-screens"
os.makedirs(OUT, exist_ok=True)
expect.set_options(timeout=15_000)
results = []


def step(name, fn):
    t0 = time.time()
    try:
        fn()
        results.append({"step": name, "status": "PASS", "seconds": round(time.time() - t0, 2)})
        print(f"PASS  {name}")
    except Exception as e:  # noqa: BLE001
        results.append({"step": name, "status": "FAIL", "error": str(e)[:400]})
        print(f"FAIL  {name}\n      {str(e)[:400]}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(locale="ar-SA", viewport={"width": 1280, "height": 900}).new_page()

    def login():
        page.goto(f"{BASE}/admin")
        page.locator("li", has_text="مشرف تجريبي أ").get_by_role("button", name="دخول").click()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()

    step("1. دخول المشرف", login)

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

    step("2. قائمة المراجعة: أسعار مساعد الرصد برابط المصدر والمطابقة ودليل مقترح", queue)

    def batch_requires_attest():
        items = page.locator("li.card", has_text="مساعد الرصد")
        for i in range(3):
            items.nth(i).locator("[data-pick]").check()
        page.locator("[data-batch-form] button[type=submit]").click()
        # الإقرار إلزامي (required) فلا يُرسل النموذج
        expect(page.locator("[data-flash=ok]")).to_have_count(0)

    step("3. الاعتماد المجمّع يتطلب إقرارًا بفتح الروابط", batch_requires_attest)

    def batch_approve():
        page.locator("[data-batch-form] input[name=attest]").check()
        page.locator("[data-batch-form] button[type=submit]").click()
        expect(page.locator("[data-flash=ok]").first).to_contain_text("اعتُمد 3")

    step("4. اعتماد 3 أسعار دفعة واحدة", batch_approve)

    def visible():
        page.goto(f"{BASE}/product/2")
        chart = page.locator("[data-price-comparison]").first
        expect(chart.locator("[data-chart]")).to_be_visible()
        assert chart.locator("[data-chart-row=used]").count() == 3
        assert chart.locator("[data-sources]").get_attribute("data-sources") == "3"
        expect(chart.locator("[data-stat=fair]")).not_to_contain_text("غير متاح")
        chart.screenshot(path=os.path.join(OUT, "r2-product-chart.png"))

    step("5. الأسعار المعتمدة تظهر في صفحة المنتج مع الرسم والسعر العادل", visible)
    browser.close()

json.dump(results, open(os.path.join(OUT, "research_results.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n{sum(r['status'] == 'PASS' for r in results)}/{len(results)} passed")
