"""
سيناريو مزايا اللوحة الجديدة على نسخة MVP المحلية — عبر المتصفح (Playwright):
ملف شريك بالباركود، الملاحظات، إيقاف المصدر، إخفاء منتج، الأدوار، وصفحة السيارات من القاعدة.

يُشغَّل بعد tests/e2e/mvp_scenario.py على نفس القاعدة:
    python tests/e2e/admin_feed_scenario.py [BASE_URL] [OUT_DIR]

كل البيانات بيانات اختبار معلَّمة: منتج "تجريبي"، متجر demo-*، روابط example.com.
الباركود 4006381333931 رقم مثال عام يُستخدم في الاختبارات فقط.
"""
import os
import re
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15_000)

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "mvp-screenshots"
os.makedirs(OUT, exist_ok=True)
ADMIN_A, ADMIN_B, REVIEWER = "مشرف تجريبي أ", "مشرف تجريبي ب", "مراجع تجريبي"
GTIN = "4006381333931"
results = []
state = {}


def step(name, fn):
    t0 = time.time()
    try:
        fn()
        results.append((name, "PASS", round(time.time() - t0, 2)))
        print(f"PASS  {name}")
    except Exception as e:  # noqa: BLE001
        results.append((name, "FAIL", str(e)[:400]))
        print(f"FAIL  {name}\n      {str(e)[:400]}")
        raise


def shot(page, name, full=True):
    page.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=full)


def login(page, who):
    page.goto(f"{BASE}/admin")
    if page.get_by_role("button", name="خروج").count():
        page.get_by_role("button", name="خروج").click()
        expect(page.get_by_role("heading", name="الدخول إلى لوحة الإدارة (معاينة)")).to_be_visible()
    page.locator("li", has_text=who).get_by_role("button", name="دخول").click()
    expect(page.get_by_role("button", name="خروج")).to_be_visible()


def flash(page, kind, contains=None):
    el = page.locator(f"[data-flash={kind}]").first
    expect(el).to_be_visible()
    if contains:
        expect(el).to_contain_text(contains)
    return el.inner_text()


def write_feed(rows):
    f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8")
    f.write("\n".join(rows))
    f.close()
    return f.name


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, locale="ar-SA")
    page = ctx.new_page()

    def setup():
        login(page, ADMIN_A)
        page.goto(f"{BASE}/admin/catalog")
        page.select_option("select[name=brandId]", "")
        page.fill("input[name=newBrandName]", "FeedDemoBrand")
        page.fill("input[name=newBrandNameAr]", "علامة ملف تجريبية")
        page.fill("input[name=nameAr]", "سماعة ملف شريك تجريبية")
        page.fill("input[name=name]", "Feed Demo Headphones (test data)")
        page.check("input[name=isDemo]")
        page.get_by_role("button", name="إضافة المنتج").click()
        msg = flash(page, "ok", "أُضيف المنتج")
        state["pid"] = int(re.search(r"رقم (\d+)", msg).group(1))
        # باركود للمنتج: يُوحَّد إلى GTIN-14
        sel = "form:has(button:text('إضافة المعرّف')) select[name=productId]"
        value = page.locator(f"{sel} option", has_text="سماعة ملف شريك").first.get_attribute("value")
        page.select_option(sel, value)
        page.select_option("select[name=kind]", "gtin")
        page.fill("input[name=value]", GTIN)
        page.get_by_role("button", name="إضافة المعرّف").click()
        flash(page, "ok", "0" + GTIN)
        # باركود غير صالح يُرفض برسالة واضحة
        page.fill("input[name=value]", "4006381333932")
        page.get_by_role("button", name="إضافة المعرّف").click()
        flash(page, "err", "الباركود غير صالح")
        expect(page.get_by_text("0" + GTIN).first).to_be_visible()
        shot(page, "20-catalog-identifier")

        page.goto(f"{BASE}/admin/stores")
        page.fill("input[name=id] >> nth=0", "feed-store")
        page.fill("input[name=name] >> nth=0", "Demo Feed Store")
        page.fill("input[name=nameAr] >> nth=0", "متجر ملف تجريبي")
        page.check("input[name=isDemo]")
        page.get_by_role("button", name="إضافة المتجر").click()
        flash(page, "ok", "demo-feed-store")
        form = "form:has(button:text('إضافة المصدر'))"
        page.fill(f"{form} input[name=id]", "demo-feed")
        page.fill(f"{form} input[name=name]", "ملف متجر تجريبي")
        page.select_option(f"{form} select[name=kind]", "store_feed")
        page.select_option(f"{form} select[name=storeId]", "demo-feed-store")
        page.fill(f"{form} input[name=permissionBasis]", "بيانات اختبار للعرض فقط — لا تمثل متجرًا حقيقيًا")
        page.get_by_role("button", name="إضافة المصدر").click()
        flash(page, "ok", "مصدر")

    step("أ. منتج تجريبي + باركود (والخاطئ يُرفض) + متجر ومصدر ملف", setup)

    def feed():
        page.goto(f"{BASE}/admin/prices")
        path = write_feed([
            "id,title,price,currency,link,gtin,condition,updated_at",
            f"FD-1,Feed Demo Headphones,1234,SAR,https://demo-feed-store.example.com/p/1?utm_source=x,{GTIN},new,2026-11-06T09:00:00+03:00",
            "FD-2,Feed Demo Headphones Pro,1500,SAR,https://demo-feed-store.example.com/p/2,,new,2026-11-06T09:00:00+03:00",
            f"FD-3,Feed Demo Headphones,330,USD,https://demo-feed-store.example.com/p/3,{GTIN},new,2026-11-06T09:00:00+03:00",
        ])
        form = "form:has(button:text('تحليل الملف ومعاينته'))"
        page.select_option(f"{form} select[name=sourceId]", "demo-feed")
        page.set_input_files(f"{form} input[name=file]", path)
        page.get_by_role("button", name="تحليل الملف ومعاينته").click()
        flash(page, "ok", "1 صف جاهز للمعاينة من 3")
        expect(page.get_by_role("heading", name="معاينة الاستيراد قبل الاعتماد")).to_be_visible()
        expect(page.get_by_text("صفوف لم تُرفع (2)")).to_be_visible()
        expect(page.get_by_text("عملة غير الريال", exact=True)).to_be_visible()
        state["run"] = page.url
        shot(page, "21-feed-preview-with-issues")
        # لا شيء ظاهر قبل الاعتماد والمراجعة
        pub = ctx.new_page()
        pub.goto(f"{BASE}/product/{state['pid']}")
        expect(pub.get_by_text("لا توجد أسعار معتمدة لهذا المنتج بعد")).to_be_visible()
        pub.close()
        page.get_by_role("button", name="اعتماد الاستيراد (يذهب للمراجعة)").click()
        flash(page, "ok", "1 جديد")

    step("ب. ملف شريك: المطابق بالباركود فقط يُرفع، والباقي ملاحظات ظاهرة", feed)

    def review():
        login(page, ADMIN_B)
        page.goto(f"{BASE}/admin/review")
        item = page.locator("li.card", has_text="سماعة ملف شريك تجريبية").first
        expect(item).to_contain_text("demo-feed")
        item.locator("input[name=evidenceUrl]").fill("https://example.com/evidence/demo-feed.png")
        item.get_by_role("button", name="اعتماد السعر").click()
        flash(page, "ok", "اعتُمد السعر")
        page.goto(f"{BASE}/product/{state['pid']}")
        expect(page.locator("main")).to_contain_text("1,234")
        shot(page, "22-feed-price-on-product")

    step("ج. مراجعة من مشرف آخر ثم ظهور السعر في صفحة المنتج", review)

    def suspend_source():
        login(page, ADMIN_A)
        page.goto(f"{BASE}/admin/stores")
        page.locator("li", has_text="demo-feed").get_by_role("button", name=re.compile("إيقاف مؤقت")).click()
        flash(page, "ok", "أُوقف المصدر demo-feed")
        page.goto(f"{BASE}/admin/prices")
        options = page.locator("form:has(button:text('تحليل الملف ومعاينته')) select[name=sourceId] option").all_inner_texts()
        assert not any("ملف متجر تجريبي" in o for o in options), options
        page.goto(f"{BASE}/admin/stores")
        page.locator("li", has_text="demo-feed").get_by_role("button", name="إعادة الاعتماد").click()
        flash(page, "ok", "أُعيد اعتماد المصدر demo-feed")

    step("د. إيقاف المصدر يمنع الاستيراد منه، وإعادة اعتماده", suspend_source)

    def hide_product():
        page.goto(f"{BASE}/admin/catalog")
        row = page.locator("tr", has_text="سماعة ملف شريك تجريبية")
        row.get_by_role("button", name="إخفاء").click()
        flash(page, "ok", "أُخفي المنتج")
        resp = ctx.new_page()
        r = resp.goto(f"{BASE}/product/{state['pid']}")
        assert r.status == 404, r.status
        resp.close()
        page.locator("tr", has_text="سماعة ملف شريك تجريبية").get_by_role("button", name="إظهار").click()
        flash(page, "ok", "أُعيد المنتج")
        page.goto(f"{BASE}/product/{state['pid']}")
        expect(page.locator("main")).to_contain_text("1,234")

    step("هـ. إخفاء منتج يزيله من الموقع دون حذف (وسعره محفوظ عند إظهاره)", hide_product)

    def roles():
        page.goto(f"{BASE}/admin/users")
        row = page.locator("tr", has_text=REVIEWER)
        row.get_by_role("button", name="منح مشاهد").click()
        flash(page, "ok", "مُنح الدور")
        expect(page.locator("tr", has_text=REVIEWER)).to_contain_text("مشاهد")
        page.locator("tr", has_text=REVIEWER).get_by_role("button", name="سحب مشاهد").click()
        flash(page, "ok", "سُحب الدور")
        # المراجع لا يرى إدارة المستخدمين
        login(page, REVIEWER)
        page.goto(f"{BASE}/admin/users")
        expect(page.locator("main")).not_to_contain_text("إضافة ومنح الدور")
        shot(page, "23-users-reviewer-view", full=False)

    step("و. منح دور وسحبه من صفحة المستخدمين (والمراجع لا يديرها)", roles)

    def cars():
        page.goto(f"{BASE}/cars/toyota")
        expect(page.get_by_role("heading", level=1)).to_contain_text("تويوتا")
        expect(page.get_by_text("السعر المرجعي").first).to_be_visible()
        assert page.get_by_text("سعر معتمد من مراجع").count() == 0
        shot(page, "24-cars-db-mode", full=False)

    step("ز. صفحة السيارات من القاعدة: المرجع القديم موسوم ولا سعر معتمد بلا مراجعة", cars)

    browser.close()

print("\n".join(f"{s:4}  {n}" for n, s, *_ in results))
