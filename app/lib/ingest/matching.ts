/**
 * مطابقة عروض الملفات مع منتجات الكتالوج.
 *
 * الأولوية:
 * 0. رمز المنتج لدى المتجر نفسه (ASIN في أمازون، SKU في نون/جرير) — مطابقة مؤكدة
 *    إذا سجّله المشرف لمنتج واحد ولنفس المتجر.
 * 1. الباركود (GTIN) — مطابقة مؤكدة إذا كان لمنتج واحد ولا يتعارض مع الشركة.
 * 2. رقم الموديل + الشركة المصنعة — مطابقة مؤكدة إذا كانت فريدة.
 * 3. الاسم والمواصفات — لا تُعتمد تلقائيًا أبدًا؛ تذهب لقائمة المراجعة
 *    اليدوية مع أفضل المرشحين.
 *
 * الأداء: فهرس يُبنى مرة واحدة (باركود → منتج، موديل → منتج، كلمة → منتجات)،
 * فلا يُقارن كل صف بكل منتج في الكتالوج.
 */

import type { Product } from "../../data/products";
import { tokenize } from "../search";
import { normalizeGtin, normalizeMpn } from "./fields";
import type { MatchCandidate, MatchResult, NormalizedOffer } from "./types";

export type CatalogEntry = {
  id: number;
  label: string;
  brand: string;
  names: string[];
  /** باركودات معروفة لهذا المنتج (GTIN-14 موحّد) */
  gtins: string[];
  /** أرقام موديل معروفة (موحّدة) */
  mpns: string[];
  /** رموز المنتج لدى متاجر محددة (ASIN، SKU) — يسجلها المشرف */
  skus?: { storeId: string; value: string }[];
};

/**
 * يبني الكتالوج من بيانات المنتجات الحالية.
 * البيانات الحالية لا تحتوي باركود أو أرقام موديل، لذلك تذهب كل المطابقات
 * حاليًا إلى المراجعة اليدوية حتى تُضاف هذه المعرّفات.
 */
export function catalogFromProducts(
  products: readonly Product[],
  identifiers: Record<number, { gtins?: string[]; mpns?: string[] }> = {}
): CatalogEntry[] {
  return products.map((p) => ({
    id: p.id,
    label: p.nameAr || p.name,
    brand: p.brand,
    names: [p.name, p.nameAr, `${p.brand} ${p.name}`].filter(Boolean),
    gtins: (identifiers[p.id]?.gtins ?? []).map(normalizeGtin).filter((g): g is string => !!g),
    mpns: (identifiers[p.id]?.mpns ?? []).map(normalizeMpn).filter((m): m is string => !!m),
  }));
}

type IndexedName = { tokens: Set<string>; numbers: string[] };

type IndexedEntry = CatalogEntry & { brandKey: string; indexedNames: IndexedName[] };

export type CatalogIndex = {
  entries: IndexedEntry[];
  byGtin: Map<string, IndexedEntry[]>;
  byMpn: Map<string, IndexedEntry[]>;
  /** "متجر|رمز" → المنتجات */
  bySku: Map<string, IndexedEntry[]>;
  /** كلمة → المنتجات التي تحتويها */
  byToken: Map<string, Set<IndexedEntry>>;
};

function brandKey(b: string | null | undefined): string {
  return b ? tokenize(b).join("") : "";
}

const isNumber = (t: string) => /^\d+$/.test(t);

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** يبني فهرس الكتالوج (مرة واحدة لكل استيراد أو كل تغيّر في الكتالوج) */
export function buildCatalogIndex(catalog: readonly CatalogEntry[]): CatalogIndex {
  const byGtin = new Map<string, IndexedEntry[]>();
  const byMpn = new Map<string, IndexedEntry[]>();
  const bySku = new Map<string, IndexedEntry[]>();
  const byToken = new Map<string, Set<IndexedEntry>>();
  const entries: IndexedEntry[] = catalog.map((e) => {
    const indexedNames = e.names.map((n) => {
      const t = tokenize(n);
      return { tokens: new Set(t), numbers: t.filter(isNumber) };
    });
    return { ...e, brandKey: brandKey(e.brand), indexedNames };
  });
  for (const e of entries) {
    for (const g of e.gtins) push(byGtin, g, e);
    for (const m of e.mpns) push(byMpn, m, e);
    for (const k of e.skus ?? []) push(bySku, skuKey(k.storeId, k.value), e);
    for (const n of e.indexedNames) {
      for (const t of n.tokens) {
        if (!byToken.has(t)) byToken.set(t, new Set());
        byToken.get(t)!.add(e);
      }
    }
  }
  return { entries, byGtin, byMpn, bySku, byToken };
}

/** رمز المتجر يُقارن بلا حساسية لحالة الأحرف وبلا مسافات */
export function skuKey(storeId: string, value: string): string {
  return `${storeId.trim().toLowerCase()}|${value.trim().toUpperCase()}`;
}

function brandsConflict(offerBrandKey: string, entry: IndexedEntry): boolean {
  return !!offerBrandKey && !!entry.brandKey && offerBrandKey !== entry.brandKey;
}

/** درجة تشابه الاسم (0..1) مع شرط تطابق الأرقام (السعة/الجيل/المقاس) */
function nameScore(offerSet: Set<string>, offerNums: string[], entry: IndexedEntry): number {
  let best = 0;
  for (const n of entry.indexedNames) {
    // أي رقم مختلف (17 مقابل 16، 256 مقابل 512) = منتج مختلف
    const numsMatch = n.numbers.every((x) => offerSet.has(x)) && offerNums.every((x) => n.tokens.has(x) || x.length > 4);
    if (!numsMatch) continue;
    let inter = 0;
    for (const t of n.tokens) if (offerSet.has(t)) inter++;
    const union = n.tokens.size + offerSet.size - inter;
    const score = union ? inter / union : 0;
    if (score > best) best = score;
  }
  return best;
}

export const NAME_CANDIDATE_THRESHOLD = 0.45;

/** أقصى عدد مرشحين يُفحصون بالتفصيل لكل صف (حماية الأداء) */
const MAX_CANDIDATES_SCANNED = 400;

export function matchOffer(offer: NormalizedOffer, index: CatalogIndex): MatchResult {
  const offerBrand = brandKey(offer.brand);

  /* 0) رمز المنتج لدى المتجر نفسه */
  if (offer.storeId && offer.externalId) {
    const hits = index.bySku.get(skuKey(offer.storeId, offer.externalId)) ?? [];
    if (hits.length === 1) return { status: "matched", method: "store_sku", productId: hits[0].id, label: hits[0].label };
    if (hits.length > 1) {
      return {
        status: "needs_review",
        reason: "رمز المتجر مسجّل لأكثر من منتج",
        candidates: hits.map((e) => ({ productId: e.id, label: e.label, score: 1, reasons: ["رمز متجر مطابق"] })),
      };
    }
  }

  /* 1) الباركود */
  if (offer.gtin) {
    const hits = index.byGtin.get(offer.gtin) ?? [];
    if (hits.length === 1) {
      const e = hits[0];
      if (brandsConflict(offerBrand, e)) {
        return {
          status: "needs_review",
          reason: "الباركود يطابق منتجًا لكن الشركة المصنعة مختلفة",
          candidates: [{ productId: e.id, label: e.label, score: 1, reasons: ["باركود مطابق", "تعارض في الشركة"] }],
        };
      }
      return { status: "matched", method: "gtin", productId: e.id, label: e.label };
    }
    if (hits.length > 1) {
      return {
        status: "needs_review",
        reason: "الباركود مسجّل لأكثر من منتج",
        candidates: hits.map((e) => ({ productId: e.id, label: e.label, score: 1, reasons: ["باركود مطابق"] })),
      };
    }
  }

  /* 2) رقم الموديل + الشركة */
  if (offer.mpn) {
    const hits = index.byMpn.get(offer.mpn) ?? [];
    const sameBrand = offerBrand ? hits.filter((e) => !brandsConflict(offerBrand, e)) : [];
    if (sameBrand.length === 1) {
      const e = sameBrand[0];
      return { status: "matched", method: "model", productId: e.id, label: e.label };
    }
    if (hits.length > 0) {
      return {
        status: "needs_review",
        reason: !offer.brand
          ? "رقم الموديل مطابق لكن الشركة المصنعة غير مذكورة"
          : sameBrand.length > 1
          ? "رقم الموديل مطابق لأكثر من منتج"
          : "رقم الموديل مطابق لكن الشركة المصنعة مختلفة",
        candidates: hits.map((e) => ({ productId: e.id, label: e.label, score: 0.9, reasons: ["رقم موديل مطابق"] })),
      };
    }
  }

  /* 3) الاسم والمواصفات — مرشحون من الفهرس فقط، ولا دمج تلقائي */
  const offerTokens = tokenize(`${offer.brand ?? ""} ${offer.name}`);
  const offerSet = new Set(offerTokens);
  const offerNums = offerTokens.filter(isNumber);

  // نجمع المنتجات التي تشارك كلمة واحدة على الأقل، بدءًا بالكلمات الأندر
  const postings = [...offerSet]
    .map((t) => index.byToken.get(t))
    .filter((p): p is Set<IndexedEntry> => !!p)
    .sort((a, b) => a.size - b.size);
  const pool = new Set<IndexedEntry>();
  for (const p of postings) {
    for (const e of p) {
      pool.add(e);
      if (pool.size >= MAX_CANDIDATES_SCANNED) break;
    }
    if (pool.size >= MAX_CANDIDATES_SCANNED) break;
  }

  const candidates: MatchCandidate[] = [];
  for (const e of pool) {
    if (brandsConflict(offerBrand, e)) continue;
    const score = nameScore(offerSet, offerNums, e);
    if (score >= NAME_CANDIDATE_THRESHOLD) {
      candidates.push({
        productId: e.id,
        label: e.label,
        score,
        reasons: [`تشابه الاسم ${(score * 100).toFixed(0)}%`, "الأرقام (السعة/الجيل) متطابقة"],
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.productId - b.productId);

  if (candidates.length > 0) {
    return { status: "needs_review", reason: "مطابقة بالاسم فقط — تحتاج تأكيدًا يدويًا", candidates: candidates.slice(0, 3) };
  }
  return {
    status: "unmatched",
    reason: offer.gtin || offer.mpn ? "المعرّف غير موجود في الكتالوج" : "لا يوجد منتج مشابه في الكتالوج",
  };
}
