/**
 * معرّف كل سيارة في القاعدة (slug) محسوبًا من بيانات الموقع الحالية بنفس قواعد
 * scripts/data/build-catalog-seed.mjs — فيُربط كل موديل في صفحة العلامة بسعره المعتمد
 * دون تغيير بيانات app/data/cars.ts. اختبار tests/mvp/carSlugs.test.ts يضمن التطابق التام.
 */
import { createHash } from "node:crypto";

const slugPart = (s: string) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const legacySlug = (s: string) => slugPart(s).slice(0, 55);

function boundedSlug(s: string): string {
  if (s.length <= 63) return s;
  const h = createHash("sha256").update(s).digest("hex").slice(0, 8);
  return `${s.slice(0, 54).replace(/-+$/, "")}-${h}`;
}

/** معرّف العلامة في القاعدة */
export function carBrandSlug(brandId: string): string {
  return legacySlug(brandId);
}

/** معرّفات موديلات علامة واحدة بنفس ترتيبها في app/data/cars.ts */
export function carSlugs(brandId: string, models: readonly { name: string; year: number; trim?: string }[]): string[] {
  const used = new Set<string>();
  return models.map((m) => {
    const base = boundedSlug(`car-${legacySlug(brandId)}-${slugPart(m.name)}-${m.year}${m.trim ? `-${slugPart(m.trim)}` : ""}`);
    let s = base;
    for (let i = 2; used.has(s); i++) s = boundedSlug(`${base}-${i}`);
    used.add(s);
    return s;
  });
}
