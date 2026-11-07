/**
 * خادم اختبار يحاكي بروتوكول Supabase Auth (GoTrue) محليًا — للاختبار الآلي فقط، وليس Supabase.
 *
 * الغرض: تشغيل مسار الدخول الحقيقي في التطبيق من البداية للنهاية دون شبكة:
 *   مكتبة @supabase/supabase-js في المتصفح (كلمة المرور → تسجيل TOTP → رمز التحقق) ← ملفات تعريف الجلسة
 *   ← التحقق من توقيع الرمز على الخادم (getClaims عبر JWKS) ← صلاحيات القاعدة ← الخروج.
 * الرموز موقّعة ES256 بمفتاح يُولَّد عند التشغيل، ورموز TOTP حقيقية (RFC 6238).
 *
 *   node tests/e2e/mock-gotrue.mjs <cert.pem> <key.pem> <public-url> <app-origin> <users.json>
 */
import { createHmac, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";

const [certPath, keyPath, PUBLIC_URL, APP_ORIGIN, usersPath] = process.argv.slice(2);
const ISS = `${PUBLIC_URL}/auth/v1`;
const KID = randomUUID();
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const users = JSON.parse(readFileSync(usersPath, "utf8")); // [{ id, email, password }]
const factors = new Map(); // userId -> [{ id, secret, status, friendly_name, created_at }]
const challenges = new Map(); // challengeId -> { factorId, expires }
const refresh = new Map(); // token -> { userId, aal, sessionId }
const sessions = new Set();
const log = (...a) => console.log(new Date().toISOString(), ...a);

const b64u = (b) => Buffer.from(b).toString("base64url");
function jwt(payload) {
  const head = b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const body = b64u(JSON.stringify(payload));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}
function decode(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- TOTP (RFC 6238, SHA1, 6 أرقام، 30 ثانية) */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32encode(buf) {
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function b32decode(s) {
  let bits = "";
  for (const c of s.replace(/=+$/, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
const totpOk = (secret, code) => {
  const now = Math.floor(Date.now() / 30_000);
  return [now - 1, now, now + 1].some((s) => totp(secret, s) === code);
};

/* ---------------------------------------------------------------- الجلسات */
function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
    factors: (factors.get(u.id) ?? []).map((f) => ({
      id: f.id, friendly_name: f.friendly_name, factor_type: "totp", status: f.status, created_at: f.created_at, updated_at: f.created_at,
    })),
  };
}
function issue(u, aal, sessionId = randomUUID()) {
  const now = Math.floor(Date.now() / 1000);
  sessions.add(sessionId);
  const amr = [{ method: "password", timestamp: now }, ...(aal === "aal2" ? [{ method: "totp", timestamp: now }] : [])];
  const access_token = jwt({
    iss: ISS, sub: u.id, aud: "authenticated", role: "authenticated", email: u.email, aal, amr,
    session_id: sessionId, iat: now, exp: now + 3600, is_anonymous: false,
  });
  const refresh_token = b64u(randomBytes(24));
  refresh.set(refresh_token, { userId: u.id, aal, sessionId });
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(u) };
}
function bearerUser(req) {
  const t = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const p = decode(t);
  if (!p || p.exp < Date.now() / 1000 || !sessions.has(p.session_id)) return null;
  const u = users.find((x) => x.id === p.sub);
  return u ? { u, p } : null;
}

/* ---------------------------------------------------------------- HTTP */
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const err = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, message: msg });

createServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": APP_ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ?? "*",
      "Access-Control-Max-Age": "600",
    });
    return res.end();
  }
  const url = new URL(req.url, PUBLIC_URL);
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  let body = {};
  if (req.method === "POST" || req.method === "PUT") {
    let raw = "";
    for await (const c of req) raw += c;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return err(res, 400, "bad_json", "invalid JSON");
    }
  }
  log(req.method, path, url.searchParams.get("grant_type") ?? "");

  if (req.method === "GET" && path === "/.well-known/jwks.json") {
    return send(res, 200, { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] }] });
  }
  if (req.method === "POST" && path === "/token" && url.searchParams.get("grant_type") === "password") {
    const u = users.find((x) => x.email === String(body.email ?? "").toLowerCase() && x.password === body.password);
    if (!u) return err(res, 400, "invalid_credentials", "Invalid login credentials");
    return send(res, 200, issue(u, "aal1"));
  }
  if (req.method === "POST" && path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const r = refresh.get(body.refresh_token);
    if (!r || !sessions.has(r.sessionId)) return err(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
    refresh.delete(body.refresh_token);
    return send(res, 200, issue(users.find((x) => x.id === r.userId), r.aal, r.sessionId));
  }
  if (req.method === "POST" && path === "/logout") {
    const a = bearerUser(req);
    if (a) sessions.delete(a.p.session_id);
    return send(res, 204);
  }

  const a = bearerUser(req);
  if (!a) return err(res, 401, "bad_jwt", "invalid JWT");
  const list = factors.get(a.u.id) ?? [];
  factors.set(a.u.id, list);

  if (req.method === "GET" && path === "/user") return send(res, 200, userJson(a.u));
  if (req.method === "POST" && path === "/factors") {
    if (body.factor_type !== "totp") return err(res, 422, "mfa_factor_type", "only totp in mock");
    const secret = b32encode(randomBytes(20));
    const f = { id: randomUUID(), secret, status: "unverified", friendly_name: body.friendly_name ?? null, created_at: new Date().toISOString() };
    list.push(f);
    const uri = `otpauth://totp/TruePrice:${encodeURIComponent(a.u.email)}?secret=${secret}&issuer=TruePrice`;
    // ليس QR حقيقيًا (المحاكي لا يولّد QR)؛ Supabase الحقيقي يعيد صورة QR صالحة
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#fff"/><text x="10" y="85" font-size="12">mock QR</text></svg>`;
    return send(res, 200, { id: f.id, type: "totp", friendly_name: f.friendly_name, totp: { qr_code: svg, secret, uri } });
  }
  const m = /^\/factors\/([0-9a-f-]{36})(\/challenge|\/verify)?$/.exec(path);
  if (m) {
    const f = list.find((x) => x.id === m[1]);
    if (!f) return err(res, 404, "mfa_factor_not_found", "Factor not found");
    if (req.method === "DELETE" && !m[2]) {
      factors.set(a.u.id, list.filter((x) => x.id !== f.id));
      return send(res, 200, { id: f.id });
    }
    if (req.method === "POST" && m[2] === "/challenge") {
      const id = randomUUID();
      challenges.set(id, { factorId: f.id, expires: Date.now() + 300_000 });
      return send(res, 200, { id, type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
    }
    if (req.method === "POST" && m[2] === "/verify") {
      const c = challenges.get(body.challenge_id);
      if (!c || c.factorId !== f.id || c.expires < Date.now()) return err(res, 422, "mfa_challenge_expired", "Challenge expired");
      challenges.delete(body.challenge_id);
      if (!totpOk(f.secret, String(body.code ?? ""))) return err(res, 422, "mfa_verification_failed", "Invalid TOTP code entered");
      f.status = "verified";
      sessions.delete(a.p.session_id);
      return send(res, 200, issue(a.u, "aal2"));
    }
  }
  return err(res, 404, "not_found", `no route ${req.method} ${path}`);
}).listen(443, "127.0.0.1", () => log(`mock GoTrue on ${PUBLIC_URL} (app origin ${APP_ORIGIN})`));
