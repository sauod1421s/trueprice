import { describe, expect, it } from "vitest";
import { feedToStageRows } from "@/app/lib/admin/feedRows";
import {
  amazonCreatorsConnector, CREATORS_API_URL, offersToCsv, parseItem, TOKEN_URLS,
} from "@/app/lib/connectors/amazonCreators";
import { feedUrlConnector, feedUrlVar, sniffFormat } from "@/app/lib/connectors/feedUrl";
import { ConnectorError, fetchTextCapped, redactUrl } from "@/app/lib/connectors/http";
import { readiness } from "@/app/lib/connectors/registry";
import type { ConnectorSource } from "@/app/lib/connectors/types";
import { runImport } from "@/app/lib/ingest/importer";
import { buildCatalogIndex, matchOffer } from "@/app/lib/ingest/matching";
import type { NormalizedOffer } from "@/app/lib/ingest/types";
import { src, TEST_CATALOG, TEST_REGISTRY } from "../ingest/helpers";

/** كل البيانات هنا خيالية: رموز ASIN وهمية، ونطاقات example محجوزة، ولا اتصال بالشبكة */
const NOW = () => new Date("2026-11-12T09:00:00.000Z");

function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const h = routes[url];
    if (!h) return new Response("not found", { status: 404 });
    return h(init);
  };
  return { f, calls };
}

const amazonSource: ConnectorSource = {
  id: "amazon-creators", name: "Amazon.sa", kind: "official_api", storeId: "amazon", networkId: null,
  status: "approved", allowAutomated: true,
};
const feedSource: ConnectorSource = {
  id: "alpha-arabclicks", name: "Alpha via ArabClicks", kind: "affiliate_feed", storeId: "alpha", networkId: "arabclicks",
  status: "approved", allowAutomated: true,
};
const AMZ_ENV = {
  AMAZON_CREATORS_CREDENTIAL_ID: "test-id", AMAZON_CREATORS_CREDENTIAL_SECRET: "test-secret",
  AMAZON_CREATORS_CREDENTIAL_VERSION: "3.2", AMAZON_PARTNER_TAG: "test-21",
};

const item = (asin: string, listings: unknown[], extra: Record<string, unknown> = {}) => ({
  asin,
  detailPageURL: `https://www.amazon.sa/dp/${asin}?tag=test-21`,
  itemInfo: {
    title: { displayValue: `Test Phone X 256GB ${asin}` },
    byLineInfo: { brand: { displayValue: "TestBrand" } },
    externalIds: { eans: { displayValues: ["4006381333931"] } },
  },
  offersV2: { listings },
  ...extra,
});
const listing = (amount: number, over: Record<string, unknown> = {}) => ({
  price: { money: { amount, currency: "SAR" } },
  condition: { value: "New" },
  availability: { type: "IN_STOCK" },
  merchantInfo: { name: "Amazon.sa" },
  isBuyBoxWinner: false,
  ...over,
});

describe("الجلب الآمن", () => {
  it("يرفض http والروابط التي تحمل كلمة مرور", async () => {
    await expect(fetchTextCapped("http://a.example.com/f.xml")).rejects.toMatchObject({ code: "insecure_url" });
    await expect(fetchTextCapped("https://u:p@a.example.com/f.xml")).rejects.toMatchObject({ code: "credentials_in_url" });
  });
  it("يوقف القراءة عند تجاوز الحد، ولا يعرض إلا المضيف في الرسائل", async () => {
    const { f } = fakeFetch({ "https://a.example.com/f.csv?token=SECRET": () => new Response("x".repeat(5000)) });
    const err = await fetchTextCapped("https://a.example.com/f.csv?token=SECRET", { fetch: f, maxBytes: 1000 }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("too_large");
    expect(err.message).not.toContain("SECRET");
    expect(redactUrl("https://a.example.com/f.csv?token=SECRET")).toBe("a.example.com");
  });
  it("لا يتبع تحويلًا إلى http", async () => {
    const { f } = fakeFetch({
      "https://a.example.com/f": () => new Response(null, { status: 302, headers: { location: "http://b.example.com/f" } }),
    });
    await expect(fetchTextCapped("https://a.example.com/f", { fetch: f })).rejects.toMatchObject({ code: "insecure_url" });
  });
  it("حالة HTTP غير ناجحة تُرجع رمزها", async () => {
    const { f } = fakeFetch({});
    await expect(fetchTextCapped("https://a.example.com/x", { fetch: f })).rejects.toMatchObject({ code: "http_404" });
  });
});

describe("جاهزية المصدر", () => {
  it("لا يعمل مصدر غير معتمد أو غير مسموح له بالجلب الآلي أو بإعدادات ناقصة", () => {
    expect(readiness({ ...amazonSource, status: "draft" }, AMZ_ENV)).toMatchObject({ ready: false, reason: "المصدر غير معتمد بعد" });
    expect(readiness({ ...amazonSource, allowAutomated: false }, AMZ_ENV).ready).toBe(false);
    expect(readiness(amazonSource, {})).toMatchObject({ ready: false, missing: expect.arrayContaining(["AMAZON_PARTNER_TAG"]) });
    expect(readiness(amazonSource, AMZ_ENV)).toMatchObject({ ready: true, connector: { id: "amazon-creators" } });
    expect(readiness({ ...feedSource, kind: "manual_upload" }, {}).connector).toBeNull();
    expect(readiness(feedSource, { [feedUrlVar(feedSource.id)]: "https://feeds.example.com/x" })).toMatchObject({ ready: true });
  });
  it("اسم متغير الرابط مشتق من معرّف المصدر", () => {
    expect(feedUrlVar("noon-arabclicks")).toBe("TP_FEED_URL__NOON_ARABCLICKS");
  });
});

describe("موصّل رابط الملف (ArabClicks / Admitad / متجر)", () => {
  it("يجلب الملف من متغير البيئة ويخمّن الصيغة", async () => {
    const url = "https://feeds.example.com/alpha.yml?code=SECRET";
    const yml = `<?xml version="1.0"?><yml_catalog date="2026-11-12 10:00"><shop><offers></offers></shop></yml_catalog>`;
    const { f } = fakeFetch({ [url]: () => new Response(yml) });
    const out = await feedUrlConnector.run({ source: feedSource, env: { [feedUrlVar(feedSource.id)]: url }, fetch: f, now: NOW });
    expect(out.format).toBe("yml");
    expect(out.meta).toEqual({ host: "feeds.example.com", bytes: yml.length });
    expect(JSON.stringify(out.meta)).not.toContain("SECRET");
    expect(sniffFormat("id,title\n1,x")).toBe("csv");
  });
});

describe("Amazon Creators API", () => {
  it("يختار عرض الجديد الفائز بصندوق الشراء، ويتجاهل المستعمل والعناصر بلا عرض", () => {
    const o = parseItem(item("B0TEST0001", [
      listing(1700, { condition: { value: "Used" } }),
      listing(1899),
      listing(1950, { isBuyBoxWinner: true, merchantInfo: { name: "Seller A" } }),
    ]));
    expect(o).toMatchObject({ asin: "B0TEST0001", amount: 1950, seller: "Seller A", gtin: "4006381333931", availability: "in stock" });
    expect(parseItem(item("B0TEST0002", []))).toBeNull();
    expect(parseItem(item("bad", [listing(1)]))).toBeNull();
  });

  it("يقرأ الاستجابة بأحرف كبيرة أيضًا (PascalCase)", () => {
    const o = parseItem({
      ASIN: "B0TEST0003", DetailPageURL: "https://www.amazon.sa/dp/B0TEST0003",
      OffersV2: { Listings: [{ Price: { Money: { Amount: 999, Currency: "SAR" } }, Condition: { Value: "New" } }] },
    });
    expect(o).toMatchObject({ asin: "B0TEST0003", amount: 999, currency: "SAR" });
  });

  it("التشغيل الكامل: رمز دخول ← دفعات من 10 ← CSV، بلا أسرار في الناتج", async () => {
    const asins = Array.from({ length: 12 }, (_, i) => `B0TEST${String(i).padStart(4, "0")}`);
    let tokenAuth = "";
    const bodies: { itemIds: string[]; marketplace: string; partnerTag: string }[] = [];
    const { f, calls } = fakeFetch({
      [TOKEN_URLS["3.2"]]: (init) => {
        tokenAuth = String((init?.headers as Record<string, string>).authorization);
        return Response.json({ access_token: "tok", expires_in: 3600 });
      },
      [CREATORS_API_URL]: (init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        return Response.json({ itemsResult: { items: b.itemIds.map((a: string, i: number) => item(a, i === 0 ? [] : [listing(1000 + i)])) } });
      },
    });
    const conn = { ...amazonCreatorsConnector, pauseMs: 0 };
    const out = await conn.run({ source: amazonSource, env: AMZ_ENV, fetch: f, now: NOW, storeSkus: [...asins, "b0test0000", "nope"] });
    expect(tokenAuth).toBe(`Basic ${Buffer.from("test-id:test-secret").toString("base64")}`);
    expect(bodies.map((b) => b.itemIds.length)).toEqual([10, 2]);
    expect(bodies[0]).toMatchObject({ marketplace: "www.amazon.sa", partnerTag: "test-21" });
    const apiCall = calls.find((c) => c.url === CREATORS_API_URL)!;
    expect((apiCall.init?.headers as Record<string, string>)["x-marketplace"]).toBe("www.amazon.sa");
    expect(out.meta).toMatchObject({ requested: 12, offers: 10, noNewOffer: 2 });
    expect(out.content).not.toContain("test-secret");
    expect(out.content).not.toContain("tok");
  });

  it("إصدار اعتماد غير مدعوم أو عدم وجود رموز ASIN = خطأ واضح قبل أي اتصال", async () => {
    const { f, calls } = fakeFetch({});
    await expect(amazonCreatorsConnector.run({ source: amazonSource, env: { ...AMZ_ENV, AMAZON_CREATORS_CREDENTIAL_VERSION: "2.2" }, fetch: f, storeSkus: ["B0TEST0001"] }))
      .rejects.toMatchObject({ code: "unsupported_credential_version" });
    await expect(amazonCreatorsConnector.run({ source: amazonSource, env: AMZ_ENV, fetch: f, storeSkus: [] }))
      .rejects.toMatchObject({ code: "no_skus" });
    expect(calls).toHaveLength(0);
  });

  it("رفض الوصول (403) يُترجم لرسالة تشرح شرط تفعيل الحساب", async () => {
    const { f } = fakeFetch({
      [TOKEN_URLS["3.2"]]: () => Response.json({ access_token: "tok" }),
      [CREATORS_API_URL]: () => new Response("{}", { status: 403 }),
    });
    await expect(amazonCreatorsConnector.run({ source: amazonSource, env: AMZ_ENV, fetch: f, storeSkus: ["B0TEST0001"] }))
      .rejects.toMatchObject({ code: "access_denied" });
  });
});

describe("من أمازون إلى المعاينة: نفس مسار الاستيراد والمطابقة", () => {
  const catalog = [
    { ...TEST_CATALOG[0], gtins: [], skus: [{ storeId: "amazon", value: "B0TEST0001" }] },
    TEST_CATALOG[1],
  ];
  const registry = [...TEST_REGISTRY, { id: "amazon", name: "Amazon.sa", nameAr: "أمازون", domains: ["amazon.sa"], aliases: ["amazon"], marketplace: true }];

  it("يطابق برمز ASIN المسجل، ويُرفع بالريال وبتاريخ الجلب المؤكد", () => {
    const fetchedAt = "2026-11-12T09:00:00.000Z";
    const content = offersToCsv([
      { asin: "B0TEST0001", title: "Test Phone X 256GB", brand: "TestBrand", url: "https://www.amazon.sa/dp/B0TEST0001", gtin: "", amount: 1899, currency: "SAR", condition: "new", availability: "in stock", seller: "Amazon.sa" },
      { asin: "B0TEST0009", title: "Unknown 3000", brand: "Other", url: "https://www.amazon.sa/dp/B0TEST0009", gtin: "", amount: 100, currency: "SAR", condition: "new", availability: "in stock", seller: "Amazon.sa" },
    ], fetchedAt);
    const result = runImport({
      source: src({ id: "amazon-creators", kind: "store_feed", storeId: "amazon", timeZone: "Asia/Riyadh" }),
      fileName: "amazon.csv", content, catalog, importedAt: "2026-11-12T09:00:05.000Z", registry,
    });
    expect(result.fatal).toBeNull();
    expect(result.accepted[0].match).toMatchObject({ status: "matched", method: "store_sku", productId: 1 });
    const staged = feedToStageRows(result, { activeStores: new Set(["amazon"]) });
    expect(staged.rows).toHaveLength(1);
    expect(staged.rows[0]).toMatchObject({ product_id: "1", store_id: "amazon", amount: "1899.00", currency: "SAR", date_confirmed: true, as_of: fetchedAt });
    expect(staged.counts.unmatched).toBe(1);
  });

  it("رمز المتجر لا يطابق متجرًا آخر، والرمز المكرر لمنتجين يذهب للمراجعة", () => {
    const idx = buildCatalogIndex([
      { ...TEST_CATALOG[0], skus: [{ storeId: "amazon", value: "B0DUP00001" }] },
      { ...TEST_CATALOG[1], skus: [{ storeId: "amazon", value: "B0DUP00001" }] },
    ]);
    const base = { name: "x", brand: null, gtin: null, mpn: null } as unknown as NormalizedOffer;
    expect(matchOffer({ ...base, storeId: "noon", externalId: "B0DUP00001" }, idx).status).not.toBe("matched");
    expect(matchOffer({ ...base, storeId: "amazon", externalId: "b0dup00001" }, idx)).toMatchObject({ status: "needs_review" });
  });
});
