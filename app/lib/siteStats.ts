import products from "../data/products";
import brands from "../data/cars";

/** أرقام حقيقية محسوبة من البيانات بدل أرقام ثابتة مكتوبة يدويًا */
export const siteStats = {
  products: products.length,
  stores: new Set(products.flatMap((p) => p.offers.map((o) => o.store))).size,
  carBrands: Object.keys(brands).length,
  carModels: Object.values(brands).reduce((n, b) => n + b.models.length, 0),
};
