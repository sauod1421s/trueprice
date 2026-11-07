"""
انقطاع قاعدة البيانات + الأداء + عدم تسريب بيانات الإدارة — على نسخة القاعدة المحلية.

    python tests/e2e/resilience_perf.py [BASE_URL] [PG_BIN_DIR] [PG_DATA_DIR]

1) الأداء: زمن الاستجابة الأول (TTFB) والتحميل الكامل لأهم الصفحات (كمبيوتر وجوال)، 5 مرات لكل صفحة.
2) عدم التسريب: الصفحات العامة وكود المتصفح لا تحتوي أي سر أو بيانات طلبات، واللوحة تمنع غير المسجلين.
3) الانقطاع: إيقاف PostgreSQL أثناء عمل الموقع ← رسائل مفهومة بلا تفاصيل داخلية، ثم تشغيلها ← يعود الموقع
   تلقائيًا دون إعادة تشغيل التطبيق.
"""
import json
import os
import re
import statistics
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
PG_BIN = sys.argv[2] if len(sys.argv) > 2 else "node_modules/@embedded-postgres/linux-x64/native/bin"
PG_DATA = sys.argv[3] if len(sys.argv) > 3 else ".local/pgdata"
PAGES = ["/", "/search?q=ايفون", "/product/1", "/cars", "/cars/toyota", "/contact", "/methodology"]
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{(' — ' + detail) if detail else ''}")


def get(path, headers=None):
    req = urllib.request.Request(BASE + urllib.parse.quote(path, safe="/?=&"), headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def pg_ctl(action):
    cmd = f"{PG_BIN}/pg_ctl -D {PG_DATA} {action} -w -t 30"
    if action == "start":
        cmd += f" -o '-p {os.environ.get('TP_PG_PORT', '54329')}' -l /tmp/pg-restart.log"
    subprocess.run(["su", "pgtest", "-s", "/bin/bash", "-c", f"cd {os.getcwd()} && {cmd}"], check=True,
                   capture_output=True, text=True)


# ------------------------------------------------------------------ 1) الأداء
perf = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode, opts in {
        "desktop": {"viewport": {"width": 1366, "height": 900}},
        "mobile": dict(p.devices["iPhone 13"]),
    }.items():
        ctx = browser.new_context(**opts)
        page = ctx.new_page()
        for path in PAGES:
            ttfb, load = [], []
            for _ in range(5):
                page.goto(BASE + path, wait_until="load")
                t = page.evaluate("JSON.stringify(performance.getEntriesByType('navigation')[0])")
                nav = json.loads(t)
                ttfb.append(nav["responseStart"] - nav["requestStart"])
                load.append(nav["loadEventEnd"] - nav["startTime"])
            perf[(mode, path)] = (statistics.median(ttfb), statistics.median(load))
        ctx.close()
    browser.close()

print("\nالأداء (الوسيط من 5 مرات، خادم محلي):")
print(f"{'الصفحة':<22}{'كمبيوتر TTFB':>14}{'كمبيوتر تحميل':>15}{'جوال TTFB':>12}{'جوال تحميل':>12}")
for path in PAGES:
    d, m = perf[("desktop", path)], perf[("mobile", path)]
    print(f"{path:<22}{d[0]:>12.0f}ms{d[1]:>13.0f}ms{m[0]:>10.0f}ms{m[1]:>10.0f}ms")
worst = max(v[1] for v in perf.values())
check("كل الصفحات تكتمل في أقل من 1.5 ثانية محليًا (الوسيط)", worst < 1500, f"الأبطأ {worst:.0f}ms")

# ------------------------------------------------------------------ 2) عدم التسريب
secrets = []
env_file = ".local/mvp.env"
if os.path.exists(env_file):
    for line in open(env_file, encoding="utf-8"):
        if "=" in line:
            k, v = line.strip().split("=", 1)
            if "PASSWORD" in k or "SECRET" in k:
                secrets.append(v)
leaks = []
for path in PAGES + ["/track", "/admin"]:
    status, body = get(path)
    for s in secrets:
        if s and s in body:
            leaks.append(f"{path}: secret value")
    for needle in ["postgres://", "postgresql://", "service_role", "sb_secret_", "tp_app:", "visitor@example.com"]:
        if needle in body:
            leaks.append(f"{path}: {needle}")
# ملفات JavaScript التي يحمّلها المتصفح
chunks = set()
for path in ["/", "/contact", "/admin"]:
    _, body = get(path)
    chunks.update(re.findall(r'src="(/_next/static/[^"]+\.js)"', body))
for c in sorted(chunks):
    _, js = get(c)
    for s in secrets:
        if s and len(s) >= 12 and s in js:
            leaks.append(f"{c}: secret value")
    for needle in ["DATABASE_URL\"", "TP_FORM_SECRET", "TP_PREVIEW_SESSION_SECRET", "postgres://"]:
        if needle in js:
            leaks.append(f"{c}: {needle}")
check(f"لا أسرار ولا بيانات طلبات في الصفحات العامة وملفات المتصفح ({len(chunks)} ملف JS)", not leaks, "; ".join(leaks[:5]))

status, body = get("/admin/requests")
check("اللوحة بلا تسجيل دخول لا تعرض أي طلب", status in (200, 307, 404) and "TP-" not in body and "الدخول إلى لوحة الإدارة" in body
      if status == 200 else status in (307, 404), f"HTTP {status}")
status, _ = get("/admin/requests/1")
_, body = get("/admin/requests/1")
check("صفحة طلب بعينه بلا دخول لا تكشف محتواه", "data-message" not in body, f"HTTP {status}")

# ------------------------------------------------------------------ 3) الانقطاع والتعافي
LEAKY = ["ECONNREFUSED", "127.0.0.1:54", "at async", "postgres", "pg_", "Error:"]
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    admin = browser.new_page()
    # مشرف مسجّل دخوله قبل الانقطاع
    admin.goto(BASE + "/admin")
    admin.locator("li", has_text="مشرف تجريبي أ").get_by_role("button", name="دخول").click()
    admin.get_by_role("button", name="خروج").wait_for()
    pg_ctl("stop")
    time.sleep(1)
    for path in ["/product/1", "/", "/search?q=ايفون", "/contact"]:
        page.goto(BASE + path)
        try:
            page.get_by_text(re.compile("الخدمة غير متاحة مؤقتًا")).first.wait_for(timeout=10_000)
            friendly = True
        except Exception:  # noqa: BLE001
            friendly = False
        text = page.locator("body").inner_text()
        leaky = [n for n in LEAKY if n in text]
        check(f"انقطاع القاعدة: {path} يعرض رسالة مفهومة بلا تفاصيل داخلية", friendly and not leaky, ",".join(leaky))
    admin.goto(BASE + "/admin/requests")
    try:
        admin.get_by_text("الخدمة غير متاحة مؤقتًا").first.wait_for(timeout=10_000)
        ok = True
    except Exception:  # noqa: BLE001
        ok = False
    text = admin.locator("body").inner_text()
    check("انقطاع القاعدة: اللوحة تعرض رسالة مفهومة ولا تكشف بيانات", ok and not [n for n in LEAKY if n in text])
    browser.close()

st = urllib.request.Request(BASE + "/api/v", data=b'{"p":"/"}', method="POST", headers={
    "Origin": BASE, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"})
with urllib.request.urlopen(st, timeout=15) as r:
    check("انقطاع القاعدة: الإحصائيات لا تُعطل الصفحة (204)", r.status == 204, f"HTTP {r.status}")
status, body = get("/api/health")
hj = json.loads(body) if body.startswith("{") else {}
check("انقطاع القاعدة: /api/health يعيد 503 برمز تشخيص بلا تفاصيل داخلية",
      status == 503 and hj.get("db", {}).get("reason") == "network" and not [n for n in LEAKY if n in body], body[:160])
status, body = get("/cars")
check("انقطاع القاعدة: صفحة السيارات الثابتة تبقى تعمل", status == 200 and "السيارات" in body, f"HTTP {status}")

pg_ctl("start")
time.sleep(1)
recovered = []
for path in ["/product/1", "/", "/contact", "/search?q=ايفون"]:
    ok = False
    for _ in range(5):
        status, body = get(path)
        if status == 200 and "الخدمة غير متاحة مؤقتًا" not in body:
            ok = True
            break
        time.sleep(1)
    recovered.append(ok)
check("بعد عودة القاعدة: يتعافى الموقع تلقائيًا دون إعادة تشغيل التطبيق", all(recovered), str(recovered))
status, body = get("/api/health")
check("بعد عودة القاعدة: /api/health يعيد 200 والقاعدة متصلة", status == 200 and '"ok":true' in body, body[:160])

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} PASS")
sys.exit(1 if failed else 0)
