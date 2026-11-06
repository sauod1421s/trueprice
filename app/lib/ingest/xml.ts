/**
 * قارئ ملفات XML للمنتجات:
 * - Google Merchant (RSS 2.0 بعناصر g:* أو Atom)
 * - YML (yml_catalog/shop/offers/offer) — صيغة شائعة في شبكات العمولة
 * - XML عام: أكبر قائمة عناصر متكررة في الملف
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { DEFAULT_LIMITS, ImportFatalError, type ImportLimits } from "./limits";
import type { FeedFormat, RawRecord } from "./types";

type XmlNode = string | number | boolean | XmlObject | XmlNode[];
type XmlObject = { [key: string]: XmlNode };

export type XmlParseResult = {
  format: Exclude<FeedFormat, "csv">;
  records: { row: number; record: RawRecord }[];
  meta: { feedUpdatedAt: string | null; storeName: string | null };
};

function makeParser(limits: ImportLimits) {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    allowBooleanAttributes: true,
    maxNestedTags: limits.maxXmlDepth,
    // الكيانات الخارجية مرفوضة من المكتبة؛ الداخلية بحدود صارمة
    processEntities: {
      enabled: true,
      maxEntityCount: 50,
      maxEntitySize: 1_000,
      maxTotalExpansions: 1_000,
      maxExpandedLength: 50_000,
    },
  });
}

function isObject(v: unknown): v is XmlObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** نص العقدة سواء كانت قيمة مباشرة أو كائنًا فيه #text */
function textOf(v: XmlNode | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (isObject(v)) {
    if ("#text" in v) return textOf(v["#text"]);
    if ("@_href" in v) return textOf(v["@_href"]);
  }
  return "";
}

/** يسطّح عنصر منتج إلى مفتاح → نص (يحذف بادئة g: ويضم السمات) */
function flatten(node: XmlObject, limits: ImportLimits): RawRecord {
  const out: RawRecord = Object.create(null);
  for (const [rawKey, value] of Object.entries(node)) {
    const key = rawKey.replace(/^@_/, "").replace(/^g:/, "");
    if (key === "#text") continue;
    // عناصر مكررة (مثل barcode متعددة) — نأخذ الأولى غير الفارغة
    const text = Array.isArray(value)
      ? value.map((v) => textOf(v)).find((t) => t !== "") ?? ""
      : textOf(value);
    if (text.length > limits.maxFieldLength) {
      throw new ImportFatalError("field_too_long", `قيمة العنصر "${key}" أطول من ${limits.maxFieldLength} حرف`);
    }
    if (text !== "" && !(key in out)) out[key] = text;
  }
  return out;
}

function toRecords(items: XmlNode[], limits: ImportLimits): { row: number; record: RawRecord }[] {
  const objects = items.filter(isObject);
  if (objects.length > limits.maxRows) {
    throw new ImportFatalError("too_many_rows", `الملف يحتوي أكثر من ${limits.maxRows} منتج`);
  }
  return objects.map((item, i) => ({ row: i + 1, record: flatten(item, limits) }));
}

/** يبحث عن أكبر قائمة كائنات متكررة (للصيغة العامة) */
function largestObjectArray(node: XmlNode, depth = 0): XmlObject[] {
  if (depth > 8) return [];
  let best: XmlObject[] = [];
  if (Array.isArray(node)) {
    const objs = node.filter(isObject);
    if (objs.length > best.length) best = objs;
    for (const child of node) {
      const c = largestObjectArray(child, depth + 1);
      if (c.length > best.length) best = c;
    }
  } else if (isObject(node)) {
    for (const [k, child] of Object.entries(node)) {
      if (k.startsWith("@_")) continue;
      const c = largestObjectArray(child, depth + 1);
      if (c.length > best.length) best = c;
    }
  }
  return best;
}

export function parseXml(input: string, limits: ImportLimits = DEFAULT_LIMITS): XmlParseResult {
  // التحقق أولًا: المكتبة متسامحة مع الملفات المقطوعة، ونحن لا نريد ذلك
  const valid = XMLValidator.validate(input);
  if (valid !== true) {
    throw new ImportFatalError("invalid_xml", `ملف XML غير صالح (سطر ${valid.err.line}): ${valid.err.msg}`, valid.err.line);
  }

  let doc: XmlObject;
  try {
    doc = makeParser(limits).parse(input) as XmlObject;
  } catch (e) {
    throw new ImportFatalError("invalid_xml", `ملف XML غير صالح: ${(e as Error).message}`);
  }

  // Google Merchant — RSS
  const rss = doc.rss;
  if (isObject(rss) && isObject(rss.channel)) {
    const items = asArray(rss.channel.item as XmlNode | XmlNode[] | undefined);
    return {
      format: "google-merchant",
      records: toRecords(items, limits),
      meta: {
        feedUpdatedAt: textOf(rss.channel.lastBuildDate) || textOf(rss.channel.pubDate) || null,
        storeName: textOf(rss.channel.title) || null,
      },
    };
  }

  // Google Merchant — Atom
  const feed = doc.feed;
  if (isObject(feed) && feed.entry !== undefined) {
    return {
      format: "google-merchant",
      records: toRecords(asArray(feed.entry as XmlNode | XmlNode[]), limits),
      meta: {
        feedUpdatedAt: textOf(feed.updated) || null,
        storeName: textOf(feed.title) || null,
      },
    };
  }

  // YML
  const yml = doc.yml_catalog;
  if (isObject(yml) && isObject(yml.shop)) {
    const shop = yml.shop;
    const offers = isObject(shop.offers) ? asArray(shop.offers.offer as XmlNode | XmlNode[] | undefined) : [];
    const currencies = isObject(shop.currencies) ? asArray(shop.currencies.currency as XmlNode | XmlNode[] | undefined) : [];
    const records = toRecords(offers, limits).map(({ row, record }) => {
      // availability في YML سمة available="true|false"
      if (record.available !== undefined && record.availability === undefined) {
        record.availability = record.available === "true" ? "in_stock" : record.available === "false" ? "out_of_stock" : record.available;
      }
      // إذا لم يُذكر currencyId وكان للمتجر عملة واحدة فقط
      if (!record.currencyId && currencies.length === 1 && isObject(currencies[0])) {
        const only = textOf(currencies[0]["@_id"]);
        if (only) record.currencyId = only;
      }
      return { row, record };
    });
    return {
      format: "yml",
      records,
      meta: {
        feedUpdatedAt: textOf(yml["@_date"]) || null,
        storeName: textOf(shop.name) || textOf(shop.company) || null,
      },
    };
  }

  // XML عام
  const items = largestObjectArray(doc);
  return {
    format: "xml",
    records: toRecords(items, limits),
    meta: { feedUpdatedAt: null, storeName: null },
  };
}
