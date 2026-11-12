/**
 * موصّل Amazon Creators API (البديل الرسمي لـ PA-API 5 الذي أوقفته أمازون في 2026).
 *
 * - يجلب أسعار المنتجات التي سجّل المشرف لها رمز ASIN في الكتالوج فقط (store_sku لمتجر amazon)،
 *   فلا بحث عشوائي ولا منتجات خارج الكتالوج.
 * - الدخول: OAuth 2.0 (client_credentials) عبر Login with Amazon. بيانات الاعتماد (الإصدار 3.x)
 *   تُنشأ من Associates Central ← Tools ← Creators API. السعودية ضمن منطقة أوروبا (الإصدار 3.2).
 * - الطلب: POST https://creatorsapi.amazon/catalog/v1/getItems (حتى 10 رموز لكل طلب)
 *   مع الترويسة x-marketplace: www.amazon.sa.
 * - الناتج: ملف CSV بأعمدة يفهمها محرك الاستيراد، ثم نفس مسار المعاينة والاعتماد والمراجعة.
 *
 * متغيرات البيئة (على الخادم فقط):
 *   AMAZON_CREATORS_CREDENTIAL_ID, AMAZON_CREATORS_CREDENTIAL_SECRET, AMAZON_CREATORS_CREDENTIAL_VERSION (افتراضي 3.2),
 *   AMAZON_PARTNER_TAG (معرّف الشريك في amazon.sa), AMAZON_MARKETPLACE (افتراضي www.amazon.sa)
 */
import { ConnectorError, safeRequest } from "./http";
import type { Connector, ConnectorSource, Env } from "./types";

export const AMAZON_STORE_ID = "amazon";
export const CREATORS_API_URL = "https://creatorsapi.amazon/catalog/v1/getItems";
export const TOKEN_URLS: Record<string, string> = {
  "3.1": "https://api.amazon.com/auth/o2/token",
  "3.2": "https://api.amazon.co.uk/auth/o2/token",
  "3.3": "https://api.amazon.co.jp/auth/o2/token",
};
const REQUIRED = ["AMAZON_CREATORS_CREDENTIAL_ID", "AMAZON_CREATORS_CREDENTIAL_SECRET", "AMAZON_PARTNER_TAG"] as const;
const BATCH = 10;
export const MAX_ASINS_PER_RUN = 200;
const ASIN = /^[A-Z0-9]{10}$/;

export const RESOURCES = [
  "itemInfo.title",
  "itemInfo.byLineInfo",
  "itemInfo.externalIds",
  "offersV2.listings.price",
  "offersV2.listings.availability",
  "offersV2.listings.condition",
  "offersV2.listings.merchantInfo",
  "offersV2.listings.isBuyBoxWinner",
];

/* ---------------- قراءة متسامحة لحالة الأحرف (camelCase / PascalCase) ---------------- */
type J = Record<string, unknown>;
function pick(o: unknown, ...path: string[]): unknown {
  let cur: unknown = o;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    const k = Object.keys(cur as J).find((x) => x.toLowerCase() === key.toLowerCase());
    if (k === undefined) return undefined;
    cur = (cur as J)[k];
  }
  return cur;
}
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type AmazonOffer = {
  asin: string;
  title: string;
  brand: string;
  url: string;
  gtin: string;
  amount: number;
  currency: string;
  condition: string;
  availability: string;
  seller: string;
};

function firstExternalId(item: unknown): string {
  for (const kind of ["eans", "upcs", "isbns"]) {
    const vals = arr(pick(item, "itemInfo", "externalIds", kind, "displayValues"));
    const v = vals.map(str).find((x) => /^\d{8,14}$/.test(x));
    if (v) return v;
  }
  return "";
}

function availabilityText(listing: unknown): string {
  const t = str(pick(listing, "availability", "type")).toUpperCase();
  if (t.includes("OUT")) return "out of stock";
  if (t.includes("PREORDER")) return "preorder";
  if (t.includes("IN_STOCK") || t === "NOW" || t.includes("AVAILABLE")) return "in stock";
  return "";
}

/** يختار عرض "جديد": الفائز بصندوق الشراء أولًا، وإلا الأقل سعرًا */
export function parseItem(item: unknown): AmazonOffer | null {
  const asin = str(pick(item, "asin"));
  if (!ASIN.test(asin)) return null;
  const listings = arr(pick(item, "offersV2", "listings"))
    .map((l) => ({
      l,
      amount: Number(pick(l, "price", "money", "amount")),
      currency: str(pick(l, "price", "money", "currency")),
      condition: str(pick(l, "condition", "value")).toLowerCase(),
      buyBox: pick(l, "isBuyBoxWinner") === true,
    }))
    .filter((x) => Number.isFinite(x.amount) && x.amount > 0 && x.currency && (x.condition === "" || x.condition === "new"));
  if (listings.length === 0) return null;
  listings.sort((a, b) => Number(b.buyBox) - Number(a.buyBox) || a.amount - b.amount);
  const best = listings[0];
  return {
    asin,
    title: str(pick(item, "itemInfo", "title", "displayValue")),
    brand: str(pick(item, "itemInfo", "byLineInfo", "brand", "displayValue")),
    url: str(pick(item, "detailPageURL")),
    gtin: firstExternalId(item),
    amount: best.amount,
    currency: best.currency,
    condition: "new",
    availability: availabilityText(best.l),
    seller: str(pick(best.l, "merchantInfo", "name")),
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = ["id", "title", "brand", "price", "currency", "link", "gtin", "condition", "availability", "seller", "updated_at"];

export function offersToCsv(offers: readonly AmazonOffer[], fetchedAt: string): string {
  const lines = [CSV_HEADER.join(",")];
  for (const o of offers) {
    lines.push(
      [o.asin, o.title, o.brand, o.amount.toFixed(2), o.currency, o.url, o.gtin, o.condition, o.availability, o.seller, fetchedAt]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function config(env: Env) {
  const version = (env.AMAZON_CREATORS_CREDENTIAL_VERSION ?? "3.2").trim();
  return {
    id: env.AMAZON_CREATORS_CREDENTIAL_ID?.trim() ?? "",
    secret: env.AMAZON_CREATORS_CREDENTIAL_SECRET?.trim() ?? "",
    version,
    tag: env.AMAZON_PARTNER_TAG?.trim() ?? "",
    marketplace: (env.AMAZON_MARKETPLACE ?? "www.amazon.sa").trim(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const amazonCreatorsConnector: Connector & { pauseMs: number } = {
  id: "amazon-creators",
  label: "Amazon Creators API",
  pauseMs: 1100, // حدود الطلبات في الثانية
  appliesTo: (s: ConnectorSource) => s.kind === "official_api" && s.storeId === AMAZON_STORE_ID,
  missingConfig: (_s, env) => REQUIRED.filter((k) => !env[k]?.trim()),
  async run(ctx) {
    const cfg = config(ctx.env);
    const missing = this.missingConfig(ctx.source, ctx.env);
    if (missing.length) throw new ConnectorError("not_configured", `متغيرات ناقصة: ${missing.join("، ")}`);
    const tokenUrl = TOKEN_URLS[cfg.version];
    if (!tokenUrl) {
      throw new ConnectorError("unsupported_credential_version",
        `إصدار بيانات الاعتماد ${cfg.version} غير مدعوم. أنشئ بيانات اعتماد بالإصدار 3.x من Associates Central (السعودية = 3.2).`);
    }
    const asins = [...new Set((ctx.storeSkus ?? []).map((a) => a.trim().toUpperCase()).filter((a) => ASIN.test(a)))];
    if (asins.length === 0) {
      throw new ConnectorError("no_skus", "لا يوجد أي منتج له رمز ASIN في الكتالوج. أضف رمز أمازون للمنتج من صفحة الكتالوج أولًا.");
    }
    if (asins.length > MAX_ASINS_PER_RUN) throw new ConnectorError("too_many_skus", `أكثر من ${MAX_ASINS_PER_RUN} رمز في تشغيل واحد`);
    const now = ctx.now ?? (() => new Date());

    // 1) رمز الدخول
    const tokenRes = await safeRequest(tokenUrl, {
      fetch: ctx.fetch,
      timeoutMs: 15_000,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${Buffer.from(`${cfg.id}:${cfg.secret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials&scope=creatorsapi%3A%3Adefault",
      },
    }).catch((e) => {
      if (e instanceof ConnectorError && (e.code === "http_400" || e.code === "http_401")) {
        throw new ConnectorError("auth_failed", "رفضت أمازون بيانات الاعتماد (تحقق من Credential ID/Secret والإصدار)");
      }
      throw e;
    });
    const token = str(pick(await tokenRes.json(), "access_token"));
    if (!token) throw new ConnectorError("auth_failed", "لم تُرجع أمازون رمز دخول");

    // 2) الأسعار على دفعات
    const offers: AmazonOffer[] = [];
    let noOffer = 0;
    let apiErrors = 0;
    for (let i = 0; i < asins.length; i += BATCH) {
      if (i > 0 && this.pauseMs > 0) await sleep(this.pauseMs);
      const res = await safeRequest(CREATORS_API_URL, {
        fetch: ctx.fetch,
        timeoutMs: 20_000,
        init: {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-marketplace": cfg.marketplace },
          body: JSON.stringify({
            itemIds: asins.slice(i, i + BATCH),
            itemIdType: "ASIN",
            condition: "New",
            partnerTag: cfg.tag,
            partnerType: "Associates",
            marketplace: cfg.marketplace,
            resources: RESOURCES,
          }),
        },
      }).catch((e) => {
        if (e instanceof ConnectorError && (e.code === "http_401" || e.code === "http_403")) {
          throw new ConnectorError("access_denied",
            "رفضت أمازون الطلب: تأكد أن حساب Creators API مفعّل لـ amazon.sa وأن معرّف الشريك صحيح (أمازون تشترط مبيعات مؤهلة لتفعيل الوصول).");
        }
        throw e;
      });
      const body = await res.json();
      apiErrors += arr(pick(body, "errors")).length;
      for (const item of arr(pick(body, "itemsResult", "items"))) {
        const o = parseItem(item);
        if (o) offers.push(o);
        else noOffer++;
      }
    }

    const fetchedAt = now().toISOString();
    return {
      fileName: `${ctx.source.id}-${fetchedAt.slice(0, 19).replace(/[:T]/g, "-")}.csv`,
      format: "csv",
      content: offersToCsv(offers, fetchedAt),
      fetchedAt,
      meta: { requested: asins.length, offers: offers.length, noNewOffer: noOffer, apiErrors, marketplace: cfg.marketplace },
    };
  },
};
