/**
 * طبقة بيانات الكتالوج للموقع العام — نقطة واحدة تقرأ منها كل الصفحات.
 *
 * الوضع الافتراضي "static" يعيد نفس بيانات الموقع الحالي دون أي تغيير.
 * وضع "db" (نسخة MVP المحلية) يقرأ من القاعدة، ويجعل الصفحات تُعرض لحظيًا
 * حتى يظهر السعر فور اعتماده.
 */
import { connection } from "next/server";
import brands from "../../data/cars";
import staticProducts from "../../data/products";
import { dataSource } from "./mode";
import type { CatalogProduct, CatalogProductDetail, SiteStats, VerifiedCarOffer } from "./types";

export { dataSource, showLegacyReference, publicIdOf, NEW_PRODUCT_ID_OFFSET } from "./mode";
export type { CatalogProduct, CatalogProductDetail, PriceHistoryPoint, SiteStats, VerifiedCarOffer } from "./types";

const carStats = {
  carBrands: Object.keys(brands).length,
  carModels: Object.values(brands).reduce((n, b) => n + b.models.length, 0),
};

/** في وضع db: الصفحة تُعرض عند كل طلب (لا نسخة ثابتة قديمة بعد اعتماد سعر) */
async function requestTimeIfDb(): Promise<boolean> {
  if (dataSource() !== "db") return false;
  await connection();
  return true;
}

export async function getProducts(): Promise<CatalogProduct[]> {
  if (await requestTimeIfDb()) {
    const { dbProducts } = await import("./db");
    return dbProducts();
  }
  return staticProducts;
}

export async function getProduct(id: number): Promise<CatalogProductDetail | null> {
  if (await requestTimeIfDb()) {
    const { dbProduct } = await import("./db");
    return dbProduct(id);
  }
  const p = staticProducts.find((x) => x.id === id);
  return p ? { ...p, history: [] } : null;
}

export async function getSiteStats(): Promise<SiteStats> {
  if (await requestTimeIfDb()) {
    const { dbCounts } = await import("./db");
    return { ...(await dbCounts()), ...carStats };
  }
  return {
    products: staticProducts.length,
    stores: new Set(staticProducts.flatMap((p) => p.offers.map((o) => o.store))).size,
    ...carStats,
  };
}

/**
 * أسعار السيارات الجديدة المعتمدة لعلامة (وضع db فقط). في الوضع الثابت تعيد خريطة فارغة
 * دون أي اتصال، فتبقى صفحة العلامة ثابتة ومطابقة للموقع الحالي تمامًا.
 */
export async function getVerifiedCarOffers(brandId: string): Promise<Map<string, VerifiedCarOffer[]>> {
  if (!(await requestTimeIfDb())) return new Map();
  const [{ dbVerifiedCarOffers }, { carBrandSlug }] = await Promise.all([import("./db"), import("./carSlugs")]);
  return dbVerifiedCarOffers(carBrandSlug(brandId));
}

/** معرّفات تُبنى مسبقًا وقت البناء (المنتجات الحالية) — الجديدة تُعرض عند الطلب */
export function staticProductIds(): number[] {
  return staticProducts.map((p) => p.id);
}
