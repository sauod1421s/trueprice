import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import brands from "@/app/data/cars";
import { carSlugs } from "@/app/lib/catalog/carSlugs";

describe("ربط موديلات السيارات بالقاعدة", () => {
  it("معرّفات الصفحة تطابق معرّفات ملف البذرة واحدًا لواحد", () => {
    const seed = readFileSync(path.join(__dirname, "../../db/seed/100_catalog_seed.sql"), "utf8");
    const seeded = [...seed.matchAll(/"slug":"(car-[^"]*)","family_slug"/g)].map((m) => m[1]);
    const page = Object.entries(brands).flatMap(([id, b]) => carSlugs(id, b.models));
    expect(page).toHaveLength(seeded.length);
    expect(new Set(page).size).toBe(page.length);
    expect([...page].sort()).toEqual([...seeded].sort());
  });
});
