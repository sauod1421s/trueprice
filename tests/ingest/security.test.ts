import { describe, expect, it } from "vitest";
import { runImport } from "@/app/lib/ingest/importer";
import type { ImportLimits } from "@/app/lib/ingest/limits";
import { parseXml } from "@/app/lib/ingest/xml";
import { AT, src, TEST_CATALOG } from "./helpers";

const go = (content: string, fileName = "x.csv", limits?: Partial<ImportLimits>, clock?: () => number) =>
  runImport({ source: src({ defaultCurrency: "SAR" }), fileName, content, catalog: TEST_CATALOG, importedAt: AT, limits, clock });

const rss = (items: string, extra = "") =>
  `<?xml version="1.0"?>${extra}<rss xmlns:g="http://base.google.com/ns/1.0"><channel><title>T</title>${items}</channel></rss>`;

describe("حدود الموارد داخل المحرك نفسه", () => {
  it("حجم الملف (بالبايت وليس عدد الأحرف)", () => {
    expect(go("a".repeat(2_000), "x.csv", { maxBytes: 1_000 }).fatal?.code).toBe("file_too_large");
    // 400 حرف عربي = 800 بايت
    expect(go("name\n" + "ب".repeat(600), "x.csv", { maxBytes: 1_000 }).fatal?.code).toBe("file_too_large");
  });

  it("عدد الصفوف", () => {
    const content = "name,price\n" + Array.from({ length: 30 }, (_, i) => `P${i},${i + 1}`).join("\n");
    const r = go(content, "x.csv", { maxRows: 10 });
    expect(r.fatal?.code).toBe("too_many_rows");
    expect(r.accepted).toEqual([]);
  });

  it("عدد الأعمدة", () => {
    const head = Array.from({ length: 50 }, (_, i) => `c${i}`).join(",");
    expect(go(`${head}\n${"1,".repeat(49)}1`, "x.csv", { maxColumns: 20 }).fatal?.code).toBe("too_many_columns");
  });

  it("طول الحقل في CSV وXML (منع الحقول الضخمة)", () => {
    expect(go(`name,price\n${"x".repeat(5_000)},1`, "x.csv", { maxFieldLength: 1_000 }).fatal?.code).toBe("field_too_long");
    const xml = rss(`<item><g:title>${"x".repeat(5_000)}</g:title><g:price>1 SAR</g:price></item>`);
    expect(go(xml, "x.xml", { maxFieldLength: 1_000 }).fatal?.code).toBe("field_too_long");
  });

  it("اسم المنتج والرابط الطويلان يُرفضان كصف", () => {
    const r = go(`title,price,link\n${"n".repeat(600)},10,https://a.example.com/\nok,10,https://a.example.com/${"p".repeat(2_100)}`);
    expect(r.rejected.flatMap((x) => x.issues.map((i) => i.code)).sort()).toEqual(expect.arrayContaining(["name_too_long", "url_too_long"]));
  });

  it("المهلة الزمنية: يتوقف ولا يستورد شيئًا", () => {
    let t = 0;
    const content = "title,price,link\n" + Array.from({ length: 2_000 }, (_, i) => `P${i},${i + 1},https://a.example.com/${i}`).join("\n");
    const r = go(content, "x.csv", { maxDurationMs: 100 }, () => (t += 50));
    expect(r.fatal?.code).toBe("time_limit");
    expect(r.accepted).toEqual([]);
  });
});

describe("ملفات XML خبيثة", () => {
  it("Billion laughs (توسيع الكيانات) يُرفض", () => {
    const dtd = `<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;"><!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;"><!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">]>`;
    const r = go(rss(`<item><g:title>&lol5;</g:title><g:price>1 SAR</g:price></item>`, dtd), "x.xml");
    // إما رفض الملف أو بقاء الكيان دون توسيع — المهم ألا يتضخم الناتج
    expect(JSON.stringify(r)).not.toContain("lollol");
    expect(JSON.stringify(r).length).toBeLessThan(20_000);
  });

  it("XXE: الكيانات الخارجية لا تُقرأ", () => {
    const dtd = `<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>`;
    const r = go(rss(`<item><g:title>&xxe;</g:title><g:price>1 SAR</g:price><g:link>https://a.example.com/</g:link></item>`, dtd), "x.xml");
    const text = JSON.stringify(r);
    expect(text).not.toContain("root:");
  });

  it("التداخل العميق يُرفض", () => {
    const deep = "<a>".repeat(200) + "x" + "</a>".repeat(200);
    expect(() => parseXml(`<?xml version="1.0"?>${deep}`, { ...defaultLimits(), maxXmlDepth: 32 })).toThrow();
  });

  it("أسماء الحقول __proto__ و constructor لا تلوث الكائنات", () => {
    const r = go(rss(`<item><__proto__><polluted>yes</polluted></__proto__><constructor>x</constructor><g:title>P</g:title><g:price>1 SAR</g:price><g:link>https://a.example.com/</g:link></item>`), "x.xml");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.fatal === null || r.fatal.code === "invalid_xml").toBe(true);
  });

  it("الملف المقطوع يُرفض بالكامل", () => {
    const r = go(rss(`<item><g:title>P</g:title><g:price>1 SAR</g:price>`).slice(0, -20), "x.xml");
    expect(r.fatal?.code).toBe("invalid_xml");
  });
});

describe("ملفات CSV ضخمة/خبيثة", () => {
  it("اقتباس مفتوح في ملف كبير يتوقف برقم السطر بدل ابتلاع الملف", () => {
    const content = "title,price\n" + "\"open,1\n" + Array.from({ length: 5_000 }, (_, i) => `P${i},${i}`).join("\n");
    const r = go(content);
    // يتوقف عند أول حد يُبلغ (طول الحقل أو نهاية الملف) ويذكر سطر بداية الاقتباس
    expect(["unterminated_quote", "field_too_long"]).toContain(r.fatal?.code);
    expect(r.fatal?.line).toBe(2);
    expect(r.accepted).toEqual([]);
  });

  it("حقن الصيغ (=CMD) يبقى نصًا ولا يُفسر", () => {
    const r = go('title,price,link\n"=HYPERLINK(""http://evil"")",10,https://a.example.com/');
    expect(r.accepted[0]?.offer.name ?? r.rejected[0].record.title).toContain("=HYPERLINK");
  });

  it("ملف كبير ضمن الحدود يُعالج بسرعة معقولة", () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => `Item ${i},${(i % 900) + 100},SAR,https://a.example.com/p/${i}`);
    const content = "title,price,currency,link\n" + rows.join("\n");
    const t0 = performance.now();
    const r = go(content);
    const ms = performance.now() - t0;
    expect(r.fatal).toBe(null);
    expect(r.summary.accepted).toBe(20_000);
    expect(ms).toBeLessThan(15_000);
  });
});

function defaultLimits(): ImportLimits {
  return {
    maxBytes: 15 * 1024 * 1024,
    maxRows: 50_000,
    maxColumns: 200,
    maxFieldLength: 4_000,
    maxNameLength: 500,
    maxUrlLength: 2_048,
    maxXmlDepth: 32,
    maxDurationMs: 30_000,
  };
}
