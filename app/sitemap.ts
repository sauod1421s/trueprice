import type { MetadataRoute } from "next";
import products from "./data/products";
import brands from "./data/cars";
import { SITE_URL } from "./lib/site";

/*
 * لا نضع lastModified لأن تواريخ الأسعار الحالية غير مؤكدة.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, priority: 1 },
    { url: `${SITE_URL}/search`, priority: 0.8 },
    { url: `${SITE_URL}/cars`, priority: 0.8 },
    { url: `${SITE_URL}/methodology`, priority: 0.5 },
  ];

  const productPages = products.map((p) => ({
    url: `${SITE_URL}/product/${p.id}`,
    priority: 0.7,
  }));

  const brandPages = Object.keys(brands).map((id) => ({
    url: `${SITE_URL}/cars/${id}`,
    priority: 0.6,
  }));

  return [...staticPages, ...productPages, ...brandPages];
}
