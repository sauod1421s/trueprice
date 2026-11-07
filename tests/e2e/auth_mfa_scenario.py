"""
دخول اللوحة عبر مسار Supabase Auth كاملًا في المتصفح: كلمة مرور ← تسجيل TOTP ← رمز ← اللوحة
← إعادة تحميل ← خروج ← دخول جديد (تحدٍّ بالعامل المسجّل) ← صلاحيات المراجع ← رمز مزوّر.

يعمل مع tests/e2e/mock-gotrue.mjs (خادم يحاكي بروتوكول Supabase Auth محليًا) أو مع مشروع Supabase حقيقي.
    python tests/e2e/auth_mfa_scenario.py [BASE_URL] [users.json] [OUT_DIR]
"""
import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import time

from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15_000)
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
USERS = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "/tmp/mockauth/users.json"))
OUT = sys.argv[3] if len(sys.argv) > 3 else "mvp-screenshots"
os.makedirs(OUT, exist_ok=True)
A1, B1 = USERS[0], USERS[1]
results = []
secrets = {}


def totp(secret, offset=0):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    msg = struct.pack(">Q", int(time.time() // 30) + offset)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)


def step(name, fn):
    try:
        fn()
        results.append((name, "PASS"))
        print(f"PASS  {name}")
    except Exception as e:  # noqa: BLE001
        results.append((name, "FAIL"))
        print(f"FAIL  {name}\n      {str(e)[:400]}")
        page.screenshot(path=os.path.join(OUT, "auth-FAIL.png"))
        raise


def password(email, pw):
    page.goto(f"{BASE}/admin")
    page.fill("input[name=email]", email)
    page.fill("input[name=password]", pw)
    page.get_by_role("button", name="دخول").click()


with sync_playwright() as p:
    # خادم المصادقة محلي: يُستثنى من وكيل الشبكة (إن وُجد) دون تعطيله لبقية العناوين
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    browser = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1,auth.tpmock.test"} if proxy else None)
    ctx = browser.new_context(viewport={"width": 1280, "height": 860}, locale="ar-SA", ignore_https_errors=True)
    page = ctx.new_page()

    def wrong_password():
        password(A1["email"], "wrong-password")
        expect(page.locator(".card [role=alert]")).to_contain_text("البريد أو كلمة المرور غير صحيحة")

    step("1. كلمة مرور خاطئة تُرفض برسالة عربية", wrong_password)

    def enroll():
        password(A1["email"], A1["password"])
        secret = page.locator("code, [data-totp-secret]").first
        expect(secret).to_be_visible()
        secrets["a1"] = secret.inner_text().strip().replace(" ", "")
        expect(page.locator("img[alt='رمز QR لتطبيق المصادقة']")).to_be_visible()
        page.screenshot(path=os.path.join(OUT, "auth-01-enroll.png"))
        # جلسة بلا تحقق ثنائي (aal1) لا تصل لأي صفحة في اللوحة
        page.goto(f"{BASE}/admin/requests")
        expect(page).to_have_url(f"{BASE}/admin")
        expect(page.get_by_role("button", name="خروج")).to_have_count(0)

    step("2. بعد كلمة المرور: تسجيل TOTP إلزامي، وجلسة aal1 لا تفتح اللوحة", enroll)

    def verify():
        # إعادة فتح الصفحة أثناء التسجيل: يظهر رمز QR جديد فورًا (العامل السابق غير المفعّل يُلغى)
        page.goto(f"{BASE}/admin")
        secret = page.locator("code").first
        expect(secret).to_be_visible()
        secrets["a1"] = secret.inner_text().strip().replace(" ", "")
        page.fill("input[name=code]", "000000" if totp(secrets["a1"]) != "000000" else "111111")
        page.get_by_role("button", name="تحقق").click()
        expect(page.locator(".card [role=alert]")).to_contain_text("رمز التحقق غير صحيح")
        page.fill("input[name=code]", totp(secrets["a1"]))
        page.get_by_role("button", name="تحقق").click()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()
        expect(page.locator("main")).to_contain_text("Supabase Auth")
        page.screenshot(path=os.path.join(OUT, "auth-02-dashboard.png"))

    step("3. رمز خاطئ يُرفض، والصحيح يفتح اللوحة (aal2)", verify)

    def reload_and_pages():
        for url in ["/admin/requests", "/admin/analytics", "/admin/catalog", "/admin/users"]:
            page.goto(f"{BASE}{url}")
            expect(page.get_by_role("button", name="خروج")).to_be_visible()
        page.reload()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()

    step("4. التنقل بين أقسام اللوحة وإعادة التحميل مع بقاء الجلسة", reload_and_pages)

    def tampered_cookie():
        cookies = ctx.cookies()
        auth = [c for c in cookies if c["name"].startswith("sb-") and "auth-token" in c["name"]]
        assert auth, [c["name"] for c in cookies]
        c = auth[0]
        raw = c["value"]
        prefix = "base64-"
        sess = json.loads(base64.urlsafe_b64decode(raw[len(prefix):] + "==")) if raw.startswith(prefix) else json.loads(raw)
        head, body, sig = sess["access_token"].split(".")
        claims = json.loads(base64.urlsafe_b64decode(body + "=="))
        claims["sub"] = B1["id"]  # انتحال مستخدم آخر بتعديل الرمز دون توقيع صحيح
        forged = dict(sess, access_token=".".join([head, base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("="), sig]))
        val = prefix + base64.urlsafe_b64encode(json.dumps(forged).encode()).decode().rstrip("=")
        other = browser.new_context(ignore_https_errors=True)
        other.add_cookies([{**{k: c[k] for k in ("name", "domain", "path")}, "value": val}])
        pg2 = other.new_page()
        pg2.goto(f"{BASE}/admin/requests")
        expect(pg2).to_have_url(f"{BASE}/admin")
        expect(pg2.get_by_role("button", name="خروج")).to_have_count(0)
        other.close()

    step("5. رمز معدّل (انتحال مستخدم آخر) يُرفض على الخادم", tampered_cookie)

    def logout_relogin():
        page.get_by_role("button", name="خروج").click()
        expect(page.locator("input[name=email]")).to_be_visible()
        page.goto(f"{BASE}/admin/requests")
        expect(page).to_have_url(f"{BASE}/admin")
        password(A1["email"], A1["password"])
        # العامل مسجّل مسبقًا: لا QR، فقط رمز التحقق
        expect(page.locator("input[name=code]")).to_be_visible()
        expect(page.locator("img[alt='رمز QR لتطبيق المصادقة']")).to_have_count(0)
        page.fill("input[name=code]", totp(secrets["a1"]))
        page.get_by_role("button", name="تحقق").click()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()
        page.reload()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()

    step("6. الخروج يمنع الوصول، والدخول من جديد يطلب الرمز فقط ويبقى بعد إعادة التحميل", logout_relogin)

    def reviewer():
        page.get_by_role("button", name="خروج").click()
        expect(page.locator("input[name=email]")).to_be_visible()
        password(B1["email"], B1["password"])
        secret = page.locator("code, [data-totp-secret]").first
        expect(secret).to_be_visible()
        page.fill("input[name=code]", totp(secret.inner_text().strip().replace(" ", "")))
        page.get_by_role("button", name="تحقق").click()
        expect(page.get_by_role("button", name="خروج")).to_be_visible()
        expect(page.locator("main")).to_contain_text("مراجع")
        page.goto(f"{BASE}/admin/requests")
        expect(page.get_by_text("تتطلب صلاحية requests:read")).to_be_visible()
        page.goto(f"{BASE}/admin/users")
        expect(page.locator("main")).not_to_contain_text("a1@test.invalid")

    step("7. المراجع: تحقق ثنائي ثم صلاحيات المراجع فقط", reviewer)
    browser.close()

print("\n".join(f"{s}  {n}" for n, s in results))
sys.exit(0 if all(s == "PASS" for _, s in results) else 1)
