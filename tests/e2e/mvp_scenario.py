"""
سيناريو دورة العمل الكاملة على نسخة MVP المحلية — عبر المتصفح فعليًا (Playwright).

يتطلب: الموقع يعمل بوضع MVP على قاعدة نظيفة (npm run mvp:reset ثم npm run mvp:dev).
    pip install playwright && python -m playwright install chromium
    python tests/e2e/mvp_scenario.py [BASE_URL] [OUT_DIR]

كل البيانات التي ينشئها السيناريو بيانات اختبار معلَّمة: منتج "تجريبي"، متاجر demo-*،
روابط example.com — لا تمثل أسعار سوق ولا متاجر حقيقية.
"""
import json
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15_000)  # أول طلب بعد تشغيل الخادم قد يكون أبطأ

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "mvp-screenshots"
os.makedirs(OUT, exist_ok=True)

ADMIN_A, ADMIN_B, REVIEWER = "مشرف تجريبي أ", "مشرف تجريبي ب", "مراجع تجريبي"
EVIDENCE = "https://example.com/evidence/demo-screenshot.png"
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
        raise


def shot(page, name, full=True):
    page.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=full)


def login(page, who):
    page.goto(f"{BASE}/admin")
    if page.get_by_role("button", name="خروج").count():
        page.get_by_role("button", name="خروج").click()
        expect(page.get_by_text("الدخول إلى لوحة الإدارة (معاينة)")).to_be_visible()
    card = page.locator("li", has_text=who)
    card.get_by_role("button", name="دخول").click()
    expect(page.get_by_role("button", name="خروج")).to_be_visible()
    expect(page.locator("main")).to_contain_text(who)


def flash_ok(page, contains=None):
    el = page.locator("[data-flash=ok]").first
    if contains:
        expect(el).to_contain_text(contains)
    expect(el).to_be_visible()
    return el.inner_text()


def flash_err(page, contains=None):
    el = page.locator("[data-flash=err]").first
    if contains:
        expect(el).to_contain_text(contains)
    expect(el).to_be_visible()
    return el.inner_text()


state = {}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, locale="ar-SA")
    page = ctx.new_page()

    def public_before():
        page.goto(f"{BASE}/")
        expect(page.get_by_role("heading", level=1)).to_contain_text("السعر الحقيقي")
        shot(page, "01-home")
        page.goto(f"{BASE}/search?q=" + "ايفون 17")
        expect(page.get_by_text("آيفون 17").first).to_be_visible()
        shot(page, "02-search-arabic")
        page.goto(f"{BASE}/search?q=Galaxy%20S26")
        expect(page.get_by_text("Galaxy S26").first).to_be_visible()
        page.goto(f"{BASE}/product/1")
        expect(page.get_by_text("لا توجد أسعار معتمدة لهذا المنتج بعد")).to_be_visible()
        expect(page.get_by_text("أسعار مرجعية قديمة غير معتمدة")).to_be_visible()
        shot(page, "03-product-legacy-before")
        page.goto(f"{BASE}/cars")
        expect(page.locator("main")).to_be_visible()

    step("0. الموقع الحالي يعمل من القاعدة (الرئيسية، البحث عربي/إنجليزي، صفحة منتج، السيارات)", public_before)

    def add_product():
        login(page, ADMIN_A)
        shot(page, "04-admin-dashboard", full=False)
        page.goto(f"{BASE}/admin/catalog")
        page.select_option("select[name=brandId]", "")
        page.fill("input[name=newBrandName]", "DemoBrand")
        page.fill("input[name=newBrandNameAr]", "علامة تجريبية")
        page.fill("input[name=nameAr]", "هاتف عرض تجريبي X1")
        page.fill("input[name=name]", "Demo Phone X1 (test data)")
        page.fill("input[name=storage]", "256 جيجابايت")
        page.fill("input[name=memory]", "8 جيجابايت")
        page.fill("textarea[name=description]", "منتج اختبار لتجربة دورة العمل فقط — ليس منتجًا حقيقيًا.")
        page.check("input[name=isDemo]")
        page.get_by_role("button", name="إضافة المنتج").click()
        msg = flash_ok(page, "أُضيف المنتج")
        state["pid"] = int(re.search(r"رقم (\d+)", msg).group(1))
        shot(page, "05-admin-product-added")

    step("1. إضافة منتج من لوحة الإدارة", add_product)

    def add_stores_and_source():
        page.goto(f"{BASE}/admin/stores")
        for key, ar in [("a", "أ"), ("b", "ب"), ("c", "ج"), ("d", "د")]:
            page.goto(f"{BASE}/admin/stores")
            page.fill("input[name=id] >> nth=0", f"store-{key}")
            page.fill("input[name=name] >> nth=0", f"Demo Store {key.upper()}")
            page.fill("input[name=nameAr] >> nth=0", f"متجر تجريبي {ar}")
            page.check("input[name=isDemo]")
            page.get_by_role("button", name="إضافة المتجر").click()
            flash_ok(page, f"demo-store-{key}")
        page.fill("form:has(button:text('إضافة المصدر')) input[name=id]", "demo-manual")
        page.fill("form:has(button:text('إضافة المصدر')) input[name=name]", "إدخال يدوي تجريبي")
        page.select_option("select[name=kind]", "manual_upload")
        page.fill("input[name=permissionBasis]", "بيانات اختبار للعرض فقط — لا تمثل متجرًا حقيقيًا")
        page.fill("input[name=evidenceUrl]", "https://example.com/demo-source-terms")
        page.get_by_role("button", name="إضافة المصدر").click()
        flash_ok(page, "مصدر")
        shot(page, "06-admin-stores-sources")

    step("2. إضافة متاجر ومصدر سعر", add_stores_and_source)

    def import_sar():
        pid = state["pid"]
        page.goto(f"{BASE}/admin/prices")
        # (سلبي) عملة غير الريال تُرفض قبل أي حفظ
        page.select_option("form:has(button:text('معاينة الملف')) select[name=sourceId]", "demo-manual")
        page.fill("textarea[name=csv]", f"product_id,store_id,price,currency,url\n{pid},demo-store-a,300,USD,https://demo-store-a.example.com/p/x1")
        page.get_by_role("button", name="معاينة الملف").click()
        flash_err(page, "الريال")
        shot(page, "07a-admin-import-usd-rejected", full=False)
        csv = "\n".join([
            "product_id,store_id,price,currency,url",
            f"{pid},demo-store-a,1000,SAR,https://demo-store-a.example.com/p/x1",
            f"{pid},demo-store-b,1050,SAR,https://demo-store-b.example.com/p/x1",
            f"{pid},demo-store-c,1100,SAR,https://demo-store-c.example.com/p/x1",
            f"{pid},demo-store-d,1500,SAR,https://demo-store-d.example.com/p/x1",
        ])
        page.select_option("form:has(button:text('معاينة الملف')) select[name=sourceId]", "demo-manual")
        page.fill("textarea[name=csv]", csv)
        page.get_by_role("button", name="معاينة الملف").click()
        page.wait_for_url(re.compile(r"/admin/prices/[0-9a-f-]{36}"))
        state["run1"] = page.url

    step("3. استيراد أسعار بالريال (والعملة الأجنبية تُرفض)", import_sar)

    def preview():
        expect(page.get_by_text("معاينة الاستيراد قبل الاعتماد")).to_be_visible()
        expect(page.locator("tbody tr")).to_have_count(4)
        shot(page, "07-admin-import-preview")
        # لا شيء ظاهر في الموقع قبل الاعتماد
        pub = ctx.new_page()
        pub.goto(f"{BASE}/product/{state['pid']}")
        expect(pub.get_by_text("لا توجد أسعار معتمدة لهذا المنتج بعد")).to_be_visible()
        pub.close()
        page.goto(state["run1"])
        page.get_by_role("button", name="اعتماد الاستيراد (يذهب للمراجعة)").click()
        flash_ok(page, "4 جديد")

    step("4. معاينة السعر قبل الاعتماد ثم تطبيق الاستيراد", preview)

    def approve():
        # (سلبي) من استورد لا يعتمد بنفسه
        page.goto(f"{BASE}/admin/review")
        item = page.locator("li.card", has_text="demo-store-a").first
        item.locator("input[name=evidenceUrl]").fill(EVIDENCE)
        item.get_by_role("button", name="اعتماد السعر").click()
        flash_err(page, "مبدأ العينين")
        shot(page, "08a-admin-self-review-blocked", full=False)
        login(page, REVIEWER)
        page.goto(f"{BASE}/admin/review")
        shot(page, "08-admin-review-queue", full=False)
        for store in ["demo-store-a", "demo-store-b", "demo-store-c"]:
            page.goto(f"{BASE}/admin/review")
            item = page.locator("li.card", has_text=store).first
            item.locator("input[name=evidenceUrl]").fill(EVIDENCE)
            item.get_by_role("button", name="اعتماد السعر").click()
            flash_ok(page, "اعتُمد")

    step("5. اعتماد السعر من مشرف مخوّل (ومنع المراجعة الذاتية)", approve)

    def on_product_page():
        page.goto(f"{BASE}/product/{state['pid']}")
        main = page.locator("main")
        expect(main.get_by_text("بيانات تجريبية للعرض فقط")).to_be_visible()
        text = main.inner_text()
        for v in ["1,000", "1,050", "1,100"]:
            assert v in text, v
        assert "1,500" not in text, "السعر غير المعتمد ظهر"
        assert "مخفي مؤقتًا" not in text, "السعر العادل لم يظهر"
        shot(page, "09-product-approved")

    step("6. ظهور السعر في صفحة المنتج (أقل/متوسط/أعلى/عادل)", on_product_page)

    def update_price():
        login(page, ADMIN_A)
        page.goto(f"{BASE}/admin/prices")
        f = page.locator("form:has(button:text('معاينة السعر'))")
        f.locator("select[name=sourceId]").select_option("demo-manual")
        f.locator("select[name=productId]").select_option(str(state["pid"]))
        f.locator("select[name=storeId]").select_option("demo-store-a")
        f.locator("input[name=price]").fill("950")
        f.locator("input[name=url]").fill("https://demo-store-a.example.com/p/x1")
        f.get_by_role("button", name="معاينة السعر").click()
        page.wait_for_url(re.compile(r"/admin/prices/[0-9a-f-]{36}"))
        expect(page.locator("tbody tr")).to_have_count(1)
        assert "1,000" in page.locator("tbody").inner_text(), "المعاينة لا تعرض السعر الحالي"
        shot(page, "10a-admin-update-preview")
        page.get_by_role("button", name="اعتماد الاستيراد (يذهب للمراجعة)").click()
        flash_ok(page, "1 تغيّر سعره")
        login(page, REVIEWER)
        page.goto(f"{BASE}/admin/review")
        item = page.locator("li.card", has_text="demo-store-a").first
        expect(item).to_contain_text("السابق")
        item.locator("input[name=evidenceUrl]").fill(EVIDENCE)
        item.get_by_role("button", name="اعتماد السعر").click()
        flash_ok(page, "اعتُمد")
        page.goto(f"{BASE}/product/{state['pid']}")
        hist = page.locator("section[aria-labelledby=price-history]")
        expect(hist.locator("tbody tr")).to_have_count(4)  # 950 الحالي + 1000 السابق + b + c
        t = hist.inner_text()
        assert "950" in t and "1,000" in t and "سابق" in t
        shot(page, "10-product-history-after-update")

    step("7. تحديث السعر مع الاحتفاظ بالسعر السابق", update_price)

    def reject():
        page.goto(f"{BASE}/admin/review")
        item = page.locator("li.card", has_text="demo-store-d").first
        item.locator("input[name=note][required]").fill("سعر غير موثق: لا يطابق صفحة المتجر")
        item.get_by_role("button", name="رفض السعر").click()
        flash_ok(page, "رُفض")
        page.goto(f"{BASE}/admin/review?status=rejected")
        expect(page.locator("li.card", has_text="demo-store-d")).to_be_visible()
        shot(page, "11a-admin-rejected-list")
        page.goto(f"{BASE}/product/{state['pid']}")
        text = page.locator("main").inner_text()
        assert "1,500" not in text
        # متوسط الأسعار المعتمدة غير الشاذة فقط: 950، 1050، 1100 → 1,033 (المرفوض 1,500 لا يدخل)
        fair = page.locator("section", has_text="السعر العادل").first.inner_text()
        assert "1,033" in fair, fair
        # الرسم البياني: 3 أشرطة موثقة + خط متوسط السوق + خط السعر العادل، ولا شريط للسعر المرفوض
        chart = page.locator("[data-price-comparison]").first
        expect(chart.locator("[data-chart]")).to_be_visible()
        assert chart.locator("[data-chart-row=used]").count() == 3
        assert chart.locator("[data-chart-marker='السعر العادل']").count() == 1
        assert chart.locator("[data-chart-marker='متوسط السوق']").count() == 1
        assert chart.locator("[data-sources]").get_attribute("data-sources") == "3"
        assert "1,500" not in chart.inner_text()
        chart.scroll_into_view_if_needed()
        chart.screenshot(path=os.path.join(OUT, "11b-price-comparison-chart.png"))
        shot(page, "11-product-after-reject")
        page.goto(f"{BASE}/search?q=" + "هاتف عرض")
        expect(page.get_by_text("هاتف عرض تجريبي X1")).to_be_visible()
        shot(page, "12-search-demo-product")

    step("8. رفض سعر غير موثق وعدم دخوله في السعر العادل", reject)

    def mobile():
        m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, locale="ar-SA")
        mp = m.new_page()
        mp.goto(f"{BASE}/product/{state['pid']}")
        mp.screenshot(path=os.path.join(OUT, "13-mobile-product.png"), full_page=True)
        mchart = mp.locator("[data-price-comparison]").first
        expect(mchart.locator("[data-chart]")).to_be_visible()
        box = mchart.bounding_box()
        assert box and box["width"] <= 390, box  # لا يتجاوز عرض الجوال
        assert mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "تمرير أفقي في صفحة المنتج"
        mchart.screenshot(path=os.path.join(OUT, "13b-mobile-chart.png"))
        mp.goto(f"{BASE}/")
        mp.screenshot(path=os.path.join(OUT, "14-mobile-home.png"), full_page=False)
        m.close()

    step("تجربة الجوال (لقطات)", mobile)
    browser.close()

json.dump({"base": BASE, "product_public_id": state.get("pid"), "steps": results},
          open(os.path.join(OUT, "scenario_results.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n{sum(r['status'] == 'PASS' for r in results)}/{len(results)} passed")
