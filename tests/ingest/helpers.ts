import { readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogEntry } from "@/app/lib/ingest/matching";
import type { StoreRecord } from "@/app/lib/ingest/stores";
import type { SourceConfig } from "@/app/lib/ingest/types";

/** ملفات اختبار خيالية فقط (انظر tests/fixtures/feeds/README.md) */
export const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/feeds", name), "utf8");

/** كتالوج اختبار خيالي */
export const TEST_CATALOG: CatalogEntry[] = [
  { id: 1, label: "Test Phone X 256GB", brand: "TestBrand", names: ["Test Phone X 256GB"], gtins: ["04006381333931"], mpns: ["TPX256BK"] },
  { id: 2, label: "Test Phone X 512GB", brand: "TestBrand", names: ["Test Phone X 512GB"], gtins: [], mpns: [] },
  { id: 3, label: "Test Tablet 11", brand: "TestBrand", names: ["Test Tablet 11"], gtins: [], mpns: [] },
];

/** سجل متاجر خيالي للاختبار (نطاقات example محجوزة ولا تخص أي متجر) */
export const TEST_REGISTRY: StoreRecord[] = [
  { id: "alpha", name: "Test Store Alpha", nameAr: "ألفا", domains: ["alpha.example.com"], aliases: ["test store alpha", "alpha"], marketplace: false },
  { id: "gamma", name: "Gamma", nameAr: "جاما", domains: ["gamma.example.com"], aliases: ["gamma"], marketplace: false },
  { id: "delta", name: "Delta", nameAr: "دلتا", domains: ["delta.example.sa"], aliases: ["متجر دلتا التجريبي"], marketplace: false },
  { id: "market", name: "Test Market", nameAr: "السوق", domains: ["market.example.com"], aliases: ["test market"], marketplace: true },
];

export const src = (over: Partial<SourceConfig> = {}): SourceConfig => ({
  id: "test-source",
  name: "Test source",
  kind: "manual_upload",
  ...over,
});

export const AT = "2026-11-06T16:00:00.000Z";

export function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");
}
