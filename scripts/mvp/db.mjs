#!/usr/bin/env node
/**
 * نسخة MVP المحلية — قاعدة PostgreSQL مؤقتة على جهازك فقط (لا Supabase، لا إنترنت).
 *
 *   node scripts/mvp/db.mjs setup   # أول مرة: إنشاء القاعدة + المخطط + طبقة MVP + نقل الكتالوج الحالي
 *   node scripts/mvp/db.mjs dev     # تشغيل القاعدة + الموقع (next dev) بوضع MVP
 *   node scripts/mvp/db.mjs start   # تشغيل القاعدة + نسخة البناء (next start) بوضع MVP
 *   node scripts/mvp/db.mjs reset   # حذف القاعدة المحلية وإعادة الإعداد من البداية
 *   node scripts/mvp/db.mjs env     # طباعة متغيرات البيئة (بدون كلمات المرور)
 *
 * كل الملفات المولدة (البيانات، كلمات المرور، سر الجلسة) في .local/ وهي مستبعدة من Git.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { seedCatalog } from "./seed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCAL = join(ROOT, ".local");
const DATA_DIR = join(LOCAL, "pgdata");
const ENV_FILE = join(LOCAL, "mvp.env");
const DB_NAME = "trueprice";

function loadOrCreateEnv() {
  mkdirSync(LOCAL, { recursive: true });
  if (existsSync(ENV_FILE)) {
    return Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
    );
  }
  const pw = () => randomBytes(18).toString("base64url");
  const port = process.env.TP_PG_PORT || "54329";
  const env = {
    TP_PG_PORT: port,
    TP_PG_SUPERUSER_PASSWORD: pw(),
    TP_MIGRATOR_PASSWORD: pw(),
    TP_APP_PASSWORD: pw(),
    TP_PREVIEW_SESSION_SECRET: randomBytes(32).toString("base64url"),
  };
  env.DATABASE_URL = `postgres://tp_app:${env.TP_APP_PASSWORD}@127.0.0.1:${port}/${DB_NAME}`;
  writeFileSync(
    ENV_FILE,
    "# مولّد محليًا بواسطة scripts/mvp/db.mjs — لا يُرفع إلى Git (.local/ مستبعد)\n" +
      Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
    { mode: 0o600 }
  );
  return env;
}

function cluster(env) {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: env.TP_PG_SUPERUSER_PASSWORD,
    port: Number(env.TP_PG_PORT),
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "timezone=UTC"],
    onLog: () => {},
  });
}

function client(env, user, password, database = DB_NAME) {
  return new pg.Client({ host: "127.0.0.1", port: Number(env.TP_PG_PORT), user, password, database });
}

async function runFile(c, file, label) {
  const sql = readFileSync(join(ROOT, file), "utf8");
  process.stdout.write(`  • ${label} ... `);
  const t0 = Date.now();
  await c.query(sql);
  console.log(`تم (${Date.now() - t0} ms)`);
}

async function setup() {
  const env = loadOrCreateEnv();
  const pgc = cluster(env);
  const fresh = !existsSync(join(DATA_DIR, "PG_VERSION"));
  console.log(fresh ? "إنشاء قاعدة PostgreSQL محلية في .local/pgdata" : "القاعدة المحلية موجودة — إعادة تطبيق الترحيل (آمن)");
  if (fresh) await pgc.initialise();
  await pgc.start();
  try {
    const su = client(env, "postgres", env.TP_PG_SUPERUSER_PASSWORD, "postgres");
    await su.connect();
    const exists = await su.query("select 1 from pg_database where datname = $1", [DB_NAME]);
    if (!exists.rowCount) await su.query(`create database ${DB_NAME}`);
    await su.end();

    const admin = client(env, "postgres", env.TP_PG_SUPERUSER_PASSWORD);
    await admin.connect();
    await runFile(admin, "db/local/000_supabase_shim.sql", "محاكاة أدوار Supabase (محلي فقط)");
    await admin.query(`alter role supa_postgres password '${env.TP_MIGRATOR_PASSWORD.replace(/'/g, "''")}'`);

    const migrator = client(env, "supa_postgres", env.TP_MIGRATOR_PASSWORD);
    await migrator.connect();
    await runFile(migrator, "db/schema/001_trueprice_v1_1.sql", "مخطط v1.1 كما هو (دور ترحيل غير مدير)");
    await runFile(migrator, "db/mvp/002_mvp_overlay.sql", "طبقة MVP (تفاصيل المنتج، سجل الأسعار، التعطيل المؤقت)");
    await migrator.end();

    await admin.query("select set_config('tp.app_password', $1, false)", [env.TP_APP_PASSWORD]);
    await runFile(admin, "db/local/003_local_preview_users.sql", "دور التطبيق ومستخدمو المعاينة");
    const violations = await admin.query("select * from tp.privilege_violations()");
    console.log(`  • فاحص الصلاحيات: ${violations.rowCount} مخالفة`);
    await admin.end();

    const app = client(env, "tp_app", env.TP_APP_PASSWORD);
    await app.connect();
    await seedCatalog(app, ROOT);
    await app.end();
    console.log("\nجاهز. شغّل الموقع: npm run mvp:dev  ثم افتح http://localhost:3000");
  } finally {
    await pgc.stop();
  }
}

function appEnv(env) {
  return {
    ...process.env,
    TP_DATA_SOURCE: "db",
    DATABASE_URL: env.DATABASE_URL,
    TP_PREVIEW_AUTH: "on",
    TP_PREVIEW_SESSION_SECRET: env.TP_PREVIEW_SESSION_SECRET,
    TRUEPRICE_ADMIN_PREVIEW: "on",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

async function runWithDb(args) {
  const env = loadOrCreateEnv();
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
    console.error("القاعدة المحلية غير موجودة. شغّل أولًا: npm run mvp:setup");
    process.exit(1);
  }
  const pgc = cluster(env);
  await pgc.start();
  console.log(`PostgreSQL المحلية تعمل على 127.0.0.1:${env.TP_PG_PORT} (قاعدة ${DB_NAME})`);
  const child = spawn(process.execPath, [join(ROOT, "node_modules/next/dist/bin/next"), ...args], {
    cwd: ROOT,
    env: appEnv(env),
    stdio: "inherit",
  });
  const stop = async (code) => {
    await pgc.stop().catch(() => {});
    process.exit(code ?? 0);
  };
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => stop(code));
}

const cmd = process.argv[2];
if (cmd === "setup") await setup();
else if (cmd === "dev") await runWithDb(["dev", ...process.argv.slice(3)]);
else if (cmd === "start") await runWithDb(["start", ...process.argv.slice(3)]);
else if (cmd === "build") await runWithDb(["build", ...process.argv.slice(3)]);
else if (cmd === "reset") {
  rmSync(DATA_DIR, { recursive: true, force: true });
  await setup();
} else if (cmd === "env") {
  const env = loadOrCreateEnv();
  console.log(`TP_DATA_SOURCE=db\nDATABASE_URL=postgres://tp_app:****@127.0.0.1:${env.TP_PG_PORT}/${DB_NAME}\nTP_PREVIEW_AUTH=on`);
} else {
  console.log("الاستخدام: node scripts/mvp/db.mjs setup|dev|start|build|reset|env");
  process.exit(1);
}
