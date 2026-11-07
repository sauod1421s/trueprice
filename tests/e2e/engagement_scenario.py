"""
سيناريو الزائر والإدارة عبر المتصفح (Playwright) على نسخة قاعدة البيانات المحلية:
إحصائيات الزوار، البحث عن السيارات، البلاغ عن خطأ في سعر، الرقم المرجعي ومتابعته،
الرد من اللوحة، إعدادات التواصل، تعديل منتج، الصلاحيات، والخروج والدخول من جديد.

    python tests/e2e/engagement_scenario.py [BASE_URL] [OUT_DIR] [desktop|mobile]

بيانات الاختبار معلَّمة: رسائل تبدأ بـ "[اختبار آلي]"، وبيانات تواصل example.com تُمسح في النهاية.
"""
import os
import re
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15_000)

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "mvp-screenshots"
MODE = sys.argv[3] if len(sys.argv) > 3 else "desktop"
os.makedirs(OUT, exist_ok=True)
ADMIN_A, ADMIN_B, REVIEWER = "مشرف تجريبي أ", "مشرف تجريبي ب", "مراجع تجريبي"
STAMP = time.strftime("%H%M%S")
results = []
state = {}


def db(sql):
    """قراءة من القاعدة المحلية للتحقق من النتيجة (لا تعديل)"""
    out = subprocess.run(["/tmp/q.sh", sql], capture_output=True, text=True, check=True).stdout.strip()
    return out


def page_views():
    return int(re.search(r"\((\d+),\)", db("select count(*) from tp.page_views")).group(1))


def step(name, fn):
    t0 = time.time()
    try:
        fn()
        results.append((name, "PASS"))
        print(f"PASS  [{MODE}] {name} ({time.time() - t0:.1f}s)")
    except Exception as e:  # noqa: BLE001
        results.append((name, "FAIL"))
        for pg_name in ("page", "admin"):
            pg = globals().get(pg_name)
            try:
                pg and pg.screenshot(path=os.path.join(OUT, f"{MODE}-FAIL-{pg_name}.png"))
            except Exception:  # noqa: BLE001
                pass
        print(f"FAIL  [{MODE}] {name}\n      {str(e)[:500]}")
        raise


def shot(page, name, full=False):
    page.screenshot(path=os.path.join(OUT, f"{MODE}-{name}.png"), full_page=full)


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


with sync_playwright() as p:
    # زائر حقيقي: بلا علامة الأتمتة (navigator.webdriver=false) حتى تُحتسب زيارته
    human = p.chromium.launch(args=["--disable-blink-features=AutomationControlled"])
    bot = p.chromium.launch()
    if MODE == "mobile":
        device = dict(p.devices["iPhone 13"])
        # نفس محرك Chromium بمقاس وسلوك جوال؛ وكيل المستخدم وكيل iPhone
        ctx_opts = {**device, "locale": "ar-SA"}
    else:
        ctx_opts = {"viewport": {"width": 1366, "height": 900}, "locale": "ar-SA",
                    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"}
    visitor = human.new_context(**ctx_opts)
    page = visitor.new_page()

    def analytics_and_search():
        before = page_views()
        # الإشارة تُرسل بعد اكتمال تحميل الصفحة وتفاعلها (الزائر الذي يغادر قبل ذلك لا يُحتسب)
        page.goto(f"{BASE}/")
        expect(page.locator("h1").first).to_be_visible()
        page.wait_for_load_state("networkidle")
        page.goto(f"{BASE}/search?q=تويوتا")
        expect(page.locator("[data-car-result]").first).to_be_visible()
        expect(page.get_by_text("سيارات مطابقة")).to_be_visible()
        shot(page, "30-search-cars")
        page.locator("[data-car-result]").first.click()
        expect(page).to_have_url(re.compile(r"/cars/toyota$"))
        page.wait_for_load_state("networkidle")
        page.goto(f"{BASE}/product/1")
        expect(page.get_by_role("link", name=re.compile("أبلغ عن خطأ في السعر"))).to_be_visible()
        page.wait_for_timeout(800)
        after = page_views()
        assert after - before == 4, f"expected 4 new page views, got {after - before}"
        state["views"] = after
        # المتصفح المؤتمت (navigator.webdriver) لا يُحتسب
        b = bot.new_context(**ctx_opts).new_page()
        b.goto(f"{BASE}/search?q=bot-test")
        b.wait_for_timeout(800)
        b.context.close()
        assert page_views() == after, "automated browser visit was counted"
        row = db("select device, search_query from tp.page_views where kind = 'search' order by id desc limit 1")
        assert ("mobile" if MODE == "mobile" else "desktop") in row and "تويوتا" in row, row

    step("أ. الإحصائيات تحتسب الزائر الحقيقي فقط، والبحث يشمل السيارات", analytics_and_search)

    def report_price_error():
        page.get_by_role("link", name=re.compile("أبلغ عن خطأ في السعر")).click()
        expect(page).to_have_url(re.compile(r"/contact\?kind=price_error&ref=1"))
        expect(page.get_by_text("بخصوص:")).to_be_visible()
        page.fill("input[name=subject]", f"[اختبار آلي] سعر مختلف {STAMP}")
        msg = f"[اختبار آلي {MODE} {STAMP}] السعر المعروض يختلف عن سعر المتجر — رسالة اختبار وليست بلاغًا حقيقيًا."
        page.fill("textarea[name=message]", msg)
        page.fill("input[name=email]", "visitor@example.com")
        # إرسال فوري = آلي → يُرفض والرسالة تبقى في النموذج
        page.get_by_role("button", name="إرسال الطلب").click()
        expect(page.locator("[data-flash=err]")).to_contain_text("بسرعة غير طبيعية")
        expect(page.locator("textarea[name=message]")).to_have_value(msg)
        page.wait_for_timeout(3200)
        page.get_by_role("button", name="إرسال الطلب").click()
        expect(page.get_by_text("وصلنا طلبك")).to_be_visible()
        state["ref"] = page.locator("[data-reference]").inner_text().strip()
        state["code"] = page.locator("[data-tracking-code]").inner_text().strip()
        assert re.fullmatch(r"TP-[A-HJ-NP-Z2-9]{8}", state["ref"]), state["ref"]
        assert re.fullmatch(r"([A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}", state["code"]), state["code"]
        shot(page, "31-contact-sent")
        # الرمز لا يُخزَّن: لا يوجد في القاعدة إلا بصمته
        raw = state["code"].replace("-", "")
        assert raw not in db("select reference, encode(token_hash, 'hex') from tp.contact_requests"), "tracking code stored in clear"

    step("ب. بلاغ خطأ سعر من صفحة المنتج: منع الإرسال الآلي، ثم رقم مرجعي ورمز متابعة", report_price_error)

    def track_new():
        page.goto(f"{BASE}/track")
        page.fill("input[name=reference]", state["ref"].lower())
        page.fill("input[name=code]", "AAAA-BBBB-CCCC-DDDD")
        page.get_by_role("button", name="عرض الحالة").click()
        expect(page.locator("[data-flash=err]")).to_contain_text("لم نجد طلبًا")
        page.fill("input[name=code]", state["code"].lower())
        page.get_by_role("button", name="عرض الحالة").click()
        expect(page.locator("[data-status]")).to_have_attribute("data-status", "new")
        expect(page.get_by_text("لا توجد ردود بعد")).to_be_visible()
        # المتابعة لا تكشف البيانات الشخصية
        expect(page.locator("main")).not_to_contain_text("visitor@example.com")

    step("ج. المتابعة: الرمز الخاطئ لا يكشف شيئًا، والصحيح يعرض الحالة دون بيانات شخصية", track_new)

    admin_ctx = human.new_context(**ctx_opts)
    admin = admin_ctx.new_page()

    def admin_reply():
        login(admin, ADMIN_A)
        admin.goto(f"{BASE}/admin/requests")
        admin.get_by_role("link", name=state["ref"]).click()
        expect(admin.locator("[data-message]")).to_contain_text(STAMP)
        expect(admin.get_by_text("visitor@example.com")).to_be_visible()
        admin.fill("textarea[name=body]", "شكرًا لبلاغك — رد اختبار آلي.")
        admin.get_by_role("button", name="حفظ").click()
        flash(admin, "ok", "أُرسل الرد")
        admin.fill("textarea[name=body]", "ملاحظة داخلية سرية للاختبار")
        admin.check("input[value=internal]")
        admin.get_by_role("button", name="حفظ").click()
        flash(admin, "ok", "الملاحظة الداخلية")
        expect(admin.get_by_text("تم الرد").first).to_be_visible()
        shot(admin, "32-admin-request", full=True)

    step("د. اللوحة: قراءة الطلب والرد العام وملاحظة داخلية", admin_reply)

    def track_answered():
        page.goto(f"{BASE}/track")
        page.fill("input[name=reference]", state["ref"])
        page.fill("input[name=code]", state["code"])
        page.get_by_role("button", name="عرض الحالة").click()
        expect(page.locator("[data-status]")).to_have_attribute("data-status", "answered")
        expect(page.get_by_text("شكرًا لبلاغك — رد اختبار آلي.")).to_be_visible()
        expect(page.locator("main")).not_to_contain_text("ملاحظة داخلية سرية")
        shot(page, "33-track-answered")

    step("هـ. الزائر يرى الرد العام فقط (الملاحظة الداخلية لا تظهر له)", track_answered)

    def settings():
        admin.goto(f"{BASE}/admin/settings")
        # المتصفح يمنع الصيغة الخاطئة الواضحة؛ "a@b" يقبلها المتصفح ويرفضها الخادم
        admin.fill("input[name=contact_email]", "a@b")
        admin.get_by_role("button", name="حفظ").click()
        flash(admin, "err", "البريد الإلكتروني غير صحيح")
        admin.goto(f"{BASE}/admin/settings")
        admin.fill("input[name=contact_email]", "support@example.com")
        admin.fill("input[name=contact_whatsapp]", "+966 50 000 0000")
        admin.get_by_role("button", name="حفظ").click()
        flash(admin, "ok", "حُفظت")
        page.goto(f"{BASE}/contact")
        expect(page.get_by_role("link", name="support@example.com")).to_be_visible()
        expect(page.locator("a[href='https://wa.me/966500000000']")).to_be_visible()
        admin.goto(f"{BASE}/admin/settings")  # صفحة بلا رسالة سابقة، فالرسالة التالية تعني اكتمال الحفظ
        admin.fill("input[name=contact_email]", "")
        admin.fill("input[name=contact_whatsapp]", "")
        admin.get_by_role("button", name="حفظ").click()
        flash(admin, "ok", "حُفظت")
        page.goto(f"{BASE}/contact")
        expect(page.locator("main")).not_to_contain_text("support@example.com")

    step("و. إعدادات التواصل: تحقق من الصيغة، تظهر للزوار بعد ضبطها فقط، والمسح يخفيها", settings)

    def edit_product():
        admin.goto(f"{BASE}/admin/catalog")
        pid = db("select id from tp.products where legacy_id = 1")
        dbid = re.search(r"\((\d+),\)", pid).group(1)
        admin.goto(f"{BASE}/admin/catalog/{dbid}")
        original = admin.locator("textarea[name=description]").input_value()
        admin.fill("textarea[name=description]", f"وصف اختبار آلي {STAMP}")
        admin.get_by_role("button", name="حفظ التعديلات").click()
        flash(admin, "ok", "الأسعار وسجلها لم تتغير")
        page.goto(f"{BASE}/product/1")
        expect(page.get_by_text(f"وصف اختبار آلي {STAMP}")).to_be_visible()
        admin.goto(f"{BASE}/admin/catalog/{dbid}")
        admin.fill("textarea[name=description]", original)
        admin.get_by_role("button", name="حفظ التعديلات").click()
        flash(admin, "ok", "حُفظت")

    step("ز. تعديل مواصفات منتج يظهر في الموقع فورًا (ثم إعادته كما كان)", edit_product)

    def analytics_dashboard():
        admin.goto(f"{BASE}/admin/analytics?d=1")
        expect(admin.get_by_role("heading", name="إحصائيات الزوار")).to_be_visible()
        n = int(admin.locator("[data-stat='مشاهدات الصفحات']").inner_text().replace(",", ""))
        assert n == page_views(), f"dashboard {n} != db {page_views()}"
        expect(admin.locator("section[aria-label='أكثر كلمات البحث']")).to_contain_text("تويوتا")
        expect(admin.locator("section[aria-label='أكثر المنتجات مشاهدة']")).to_contain_text(re.compile(r"\S"))
        expect(admin.locator("section[aria-label='الأجهزة']")).to_contain_text("جوال" if MODE == "mobile" else "كمبيوتر")
        shot(admin, "34-analytics", full=True)
        admin.goto(f"{BASE}/admin/analytics?d=30&m=pageviews")
        expect(admin.get_by_role("img", name=re.compile("مشاهدات الصفحات يوميًا"))).to_be_visible()

    step("ح. لوحة الإحصائيات تطابق القاعدة: مشاهدات، بحث، منتجات، أجهزة، يومي/شهري", analytics_dashboard)

    def permissions_and_session():
        login(admin, REVIEWER)
        admin.goto(f"{BASE}/admin/requests")
        expect(admin.get_by_text("تتطلب صلاحية requests:read")).to_be_visible()
        expect(admin.locator("main")).not_to_contain_text(state["ref"])
        admin.goto(f"{BASE}/admin/analytics")
        expect(admin.get_by_text(re.compile("صلاحية stats:read"))).to_be_visible()
        # الخروج يمنع الوصول، والعودة بالرابط المباشر تعيد لصفحة الدخول
        admin.get_by_role("button", name="خروج").click()
        expect(admin.get_by_role("heading", name="الدخول إلى لوحة الإدارة (معاينة)")).to_be_visible()
        admin.goto(f"{BASE}/admin/requests")
        expect(admin.get_by_role("heading", name="الدخول إلى لوحة الإدارة (معاينة)")).to_be_visible()
        # دخول من جديد + إعادة تحميل: الجلسة تبقى
        login(admin, ADMIN_B)
        admin.goto(f"{BASE}/admin/requests")
        admin.reload()
        expect(admin.get_by_role("link", name=state["ref"])).to_be_visible()

    step("ط. الصلاحيات (المراجع لا يرى الطلبات ولا الإحصائيات) والخروج والدخول وإعادة التحميل", permissions_and_session)

    def no_horizontal_overflow():
        # لا تمرير أفقي في أي صفحة (عيب شائع في الجوال مع الصفحات العربية)
        login(admin, ADMIN_A)
        for url in ["/", "/search?q=سامسونج", "/product/1", "/cars", "/cars/toyota", "/contact", "/track", "/methodology"]:
            page.goto(f"{BASE}{url}")
            page.wait_for_load_state("networkidle")
            sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            assert sw <= cw + 1, f"{url}: horizontal overflow {sw} > {cw}"
        for url in ["/admin", "/admin/requests", "/admin/analytics", "/admin/settings", "/admin/catalog"]:
            admin.goto(f"{BASE}{url}")
            sw, cw = admin.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            assert sw <= cw + 1, f"{url}: horizontal overflow {sw} > {cw}"
        shot(page, "35-track", full=True)

    step("ي. لا تمرير أفقي في صفحات الموقع واللوحة", no_horizontal_overflow)

    human.close()
    bot.close()

print("\n".join(f"{s:4}  [{MODE}] {n}" for n, s in results))
