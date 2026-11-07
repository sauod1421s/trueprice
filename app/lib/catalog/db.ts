/**
 * قراءة الكتالوج من قاعدة البيانات للموقع العام (دور web_reader، مخطط pub فقط).
 *
 * ما يصل هنا هو ما تسمح به القاعدة نفسها: الأسعار المعتمدة والحديثة والمتوفرة
 * بالريال من مصادر معتمدة (pub.electronics_offers). غير الموثق والمرفوض لا يصل أصلًا.
 */
import type { PriceOffer } from "../../data/products";
import staticProducts from "../../data/products";
import { withPublic } from "../db/pool";
import { electronicsFairPrice } from "../valuation/electronics";
import { publicIdOf, showLegacyReference } from "./mode";
import type { CatalogProduct, CatalogProductDetail, PriceHistoryPoint, VerifiedCarOffer } from "./types";

type ProductRow = {
  id: string;
  legacy_id: number | null;
  slug: string;
  name: string;
  name_ar: string | null;
  brand: string;
  brand_ar: string | null;
  category: string | null;
  category_ar: string;
  memory: string | null;
  storage: string | null;
  screen: string | null;
  chip: string | null;
  camera: string | null;
  front_camera: string | null;
  battery: string | null;
  connectivity: string | null;
  water_resistance: string | null;
  refresh_rate: string | null;
  colors: string[] | null;
  description: string | null;
  amazon_url: string | null;
  is_demo: boolean | null;
};

type OfferRow = {
  product_id: string;
  store_id: string;
  store_name_ar: string;
  price_sar: string;
  canonical_url: string;
  price_as_of: Date;
};

const PRODUCT_SQL = `
  select p.id, p.legacy_id, p.slug, p.name, p.name_ar, b.name as brand, b.name_ar as brand_ar,
         c.name_en as category, c.name_ar as category_ar,
         d.memory, d.storage, d.screen, d.chip, d.camera, d.front_camera, d.battery, d.connectivity,
         d.water_resistance, d.refresh_rate, d.colors, d.description, d.amazon_url, d.is_demo
  from pub.products p
  join pub.brands b on b.id = p.brand_id
  join pub.categories c on c.id = p.category_id
  left join pub.product_details d on d.product_id = p.id
  where p.category_kind = 'electronics'`;

const ORDER_SQL = ` order by (p.legacy_id is null), c.sort_order, p.legacy_id, p.id`;

const legacyById = new Map(staticProducts.map((p) => [p.id, p]));

function toOffer(o: OfferRow): PriceOffer {
  return {
    store: o.store_id,
    storeAr: o.store_name_ar,
    price: Number(o.price_sar),
    url: o.canonical_url,
    isVerified: true,
    verificationStatus: "verified",
    entryMethod: "import",
    checkedAt: o.price_as_of.toISOString().slice(0, 10),
    dateConfirmed: true,
  };
}

function toProduct(r: ProductRow, offers: PriceOffer[]): CatalogProduct {
  const prices = offers.map((o) => o.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  const highest = prices.length ? Math.max(...prices) : 0;
  const average = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  const fair = electronicsFairPrice(offers);
  const legacy = r.legacy_id !== null ? legacyById.get(r.legacy_id) : undefined;
  const newest = offers.map((o) => o.checkedAt).sort().at(-1);
  const sortedOffers = [...offers].sort((a, b) => a.price - b.price);

  return {
    id: publicIdOf(Number(r.id), r.legacy_id),
    name: r.name,
    nameAr: r.name_ar ?? r.name,
    brand: r.brand,
    brandAr: r.brand_ar ?? r.brand,
    category: r.category ?? "Other",
    categoryAr: r.category_ar,
    memory: r.memory ?? "—",
    storage: r.storage ?? "—",
    price: lowest,
    prices,
    averagePrice: average,
    lowestPrice: lowest,
    highestPrice: highest,
    fairPrice: fair.fairPrice ?? 0,
    store: sortedOffers[0]?.storeAr ?? "غير محدد",
    confidence: 0,
    offers: sortedOffers,
    screen: r.screen ?? undefined,
    chip: r.chip ?? undefined,
    camera: r.camera ?? undefined,
    frontCamera: r.front_camera ?? undefined,
    connectivity: r.connectivity ?? undefined,
    refreshRate: r.refresh_rate ?? undefined,
    description: r.description ?? undefined,
    lastUpdated: newest,
    lastUpdatedConfirmed: newest !== undefined,
    isDemo: r.is_demo ?? false,
    battery: r.battery ?? undefined,
    waterResistance: r.water_resistance ?? undefined,
    colors: r.colors && r.colors.length > 0 ? r.colors : undefined,
    amazonUrl: r.amazon_url ?? undefined,
    legacyReference: showLegacyReference() && legacy ? legacy.offers : undefined,
  };
}

function groupOffers(rows: OfferRow[]): Map<string, PriceOffer[]> {
  const m = new Map<string, PriceOffer[]>();
  for (const row of rows) {
    const list = m.get(row.product_id) ?? [];
    list.push(toOffer(row));
    m.set(row.product_id, list);
  }
  return m;
}

export async function dbProducts(): Promise<CatalogProduct[]> {
  return withPublic(async (c) => {
    const products = await c.query<ProductRow>(PRODUCT_SQL + ORDER_SQL);
    const offers = await c.query<OfferRow>(
      `select product_id, store_id, store_name_ar, price_sar, canonical_url, price_as_of
       from pub.electronics_offers where condition = 'new'`
    );
    const byProduct = groupOffers(offers.rows);
    return products.rows.map((r) => toProduct(r, byProduct.get(r.id) ?? []));
  });
}

/** منتج واحد بالمعرّف العام (legacy_id أو 900000 + id) مع سجل الأسعار الموثقة */
export async function dbProduct(publicId: number): Promise<CatalogProductDetail | null> {
  if (!Number.isSafeInteger(publicId) || publicId <= 0) return null;
  return withPublic(async (c) => {
    const found = await c.query<ProductRow>(
      PRODUCT_SQL + ` and (p.legacy_id = $1 or (p.legacy_id is null and p.id = $1 - 900000))`,
      [publicId]
    );
    const row = found.rows[0];
    if (!row) return null;
    const offers = await c.query<OfferRow>(
      `select product_id, store_id, store_name_ar, price_sar, canonical_url, price_as_of
       from pub.electronics_offers where condition = 'new' and product_id = $1`,
      [row.id]
    );
    const history = await c.query<{
      observation_id: string; store_id: string; store_name_ar: string; price_sar: string;
      as_of: Date; verified_at: Date | null; is_current: boolean | null;
    }>(
      `select observation_id, store_id, store_name_ar, price_sar, as_of, verified_at, is_current
       from pub.price_history where product_id = $1 order by as_of desc, observation_id desc limit 200`,
      [row.id]
    );
    const points: PriceHistoryPoint[] = history.rows.map((h) => ({
      observationId: Number(h.observation_id),
      storeId: h.store_id,
      storeAr: h.store_name_ar,
      price: Number(h.price_sar),
      asOf: h.as_of.toISOString(),
      verifiedAt: h.verified_at?.toISOString() ?? null,
      isCurrent: h.is_current === true,
    }));
    return { ...toProduct(row, offers.rows.map(toOffer)), history: points };
  });
}

export async function dbCounts(): Promise<{ products: number; stores: number }> {
  return withPublic(async (c) => {
    const r = await c.query<{ products: string; stores: string }>(
      // بيانات العرض/الاختبار لا تدخل في أرقام الموقع
      `select (select count(*) from pub.products p left join pub.product_details d on d.product_id = p.id
               where p.category_kind = 'electronics' and not coalesce(d.is_demo, false)) as products,
              (select count(*) from pub.stores where id not like 'demo-%') as stores`
    );
    return { products: Number(r.rows[0].products), stores: Number(r.rows[0].stores) };
  });
}

/** أسعار السيارات الجديدة المعتمدة لعلامة واحدة، مفهرسة بمعرّف الموديل (slug) */
export async function dbVerifiedCarOffers(brandSlug: string): Promise<Map<string, VerifiedCarOffer[]>> {
  return withPublic(async (c) => {
    const r = await c.query<{
      slug: string; store_id: string; store_name_ar: string; price_sar: string; list_price_sar: string | null;
      canonical_url: string; price_as_of: Date; verified_at: Date | null;
    }>(
      `select p.slug, o.store_id, o.store_name_ar, o.price_sar, o.list_price_sar, o.canonical_url, o.price_as_of, o.verified_at
       from pub.new_car_offers o
       join pub.products p on p.id = o.product_id and p.category_kind = 'cars'
       join pub.brands b on b.id = p.brand_id
       where b.slug = $1
       order by p.slug, o.price_sar, o.store_id`,
      [brandSlug]
    );
    const out = new Map<string, VerifiedCarOffer[]>();
    for (const x of r.rows) {
      const list = out.get(x.slug) ?? [];
      list.push({
        storeId: x.store_id,
        storeAr: x.store_name_ar,
        price: Number(x.price_sar),
        listPrice: x.list_price_sar === null ? null : Number(x.list_price_sar),
        url: x.canonical_url,
        asOf: x.price_as_of.toISOString(),
        verifiedAt: x.verified_at?.toISOString() ?? null,
      });
      out.set(x.slug, list);
    }
    return out;
  });
}
