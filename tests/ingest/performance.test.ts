import { describe, expect, it } from "vitest";
import { runImport } from "@/app/lib/ingest/importer";
import { buildCatalogIndex, type CatalogEntry } from "@/app/lib/ingest/matching";
import { AT, src } from "./helpers";

/**
 * قياس أداء المطابقة ببيانات اصطناعية (ليست منتجات حقيقية).
 * قبل الفهرسة: 5,000 صف × 2,000 منتج ≈ 97 ثانية (مقارنة كل صف بكل منتج).
 */
const BRANDS = ["Brandon", "Kestrel", "Lumio", "Norvik", "Orbis", "Pyxa", "Quanta", "Rivo"];
const KINDS = ["Phone", "Tablet", "Laptop", "Watch", "Earbuds", "Monitor", "Speaker", "Camera"];

function syntheticCatalog(n: number): CatalogEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const brand = BRANDS[i % BRANDS.length];
    const label = `${brand} ${KINDS[(i >> 3) % KINDS.length]} Model${i} ${64 * ((i % 4) + 1)}GB`;
    return { id: i + 1, label, brand, names: [label], gtins: [], mpns: [`SYN${i}`] };
  });
}

describe("أداء المطابقة المفهرسة", () => {
  const catalog = syntheticCatalog(2_000);

  it("5,000 صف مقابل 2,000 منتج في وقت قصير", () => {
    const rows = Array.from({ length: 5_000 }, (_, i) => {
      const p = catalog[(i * 7) % catalog.length];
      // نصف الصفوف بالموديل والنصف بالاسم فقط
      const mpn = i % 2 === 0 ? `SYN${p.id - 1}` : "";
      return `${p.label} (synthetic),${100 + (i % 500)},SAR,https://a.example.com/p/${i},${p.brand},${mpn}`;
    });
    const content = "title,price,currency,link,brand,mpn\n" + rows.join("\n");
    const index = buildCatalogIndex(catalog);

    const t0 = performance.now();
    const r = runImport({ source: src(), fileName: "perf.csv", content, catalog: index, importedAt: AT });
    const ms = performance.now() - t0;

    expect(r.fatal).toBe(null);
    expect(r.summary.accepted).toBe(5_000);
    expect(r.summary.matched).toBe(2_500);
    // الاسم وحده لا يدمج تلقائيًا
    expect(r.summary.needsReview + r.summary.unmatched).toBe(2_500);
    // الحد الأقصى متسامح لبيئة CI؛ القياس المحلي يُذكر في التقرير
    expect(ms).toBeLessThan(10_000);
    console.info(`[perf] 5000×2000 matching: ${ms.toFixed(0)}ms`);
  });

  it("بناء الفهرس خطي تقريبًا", () => {
    const t0 = performance.now();
    buildCatalogIndex(syntheticCatalog(20_000));
    expect(performance.now() - t0).toBeLessThan(5_000);
  });
});
