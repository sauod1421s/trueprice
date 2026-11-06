/**
 * مطابقة عروض الملفات مع منتجات الكتالوج.
 *
 * الأولوية:
 * 1. الباركود (GTIN) — مطابقة مؤكدة إذا كان لمنتج واحد ولا يتعارض مع الشركة.
 * 2. رقم الموديل + الشركة المصنعة — مطابقة مؤكدة إذا كانت فريدة.
 * 3. الاسم والمواصفات — لا تُعتمد تلقائيًا أبدًا؛ تذهب لقائمة المراجعة
 *    اليدوية مع أفضل المرشحين.
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
};

/**
 * يبني الكتالوج من بيانات المنتجات الحالية.
 * ملاحظة: البيانات الحالية لا تحتوي باركود أو أرقام موديل، لذلك ستذهب
 * كل المطابقات حاليًا إلى المراجعة اليدوية حتى تُضاف هذه المعرّفات.
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

function brandKey(b: string | null | undefined): string {
  return b ? tokenize(b).join("") : "";
}

function brandsConflict(a: string | null, b: string): boolean {
  const ka = brandKey(a);
  const kb = brandKey(b);
  return !!ka && !!kb && ka !== kb;
}

const isNumber = (t: string) => /^\d+$/.test(t);

/** درجة تشابه الاسم (0..1) مع شرط تطابق الأرقام (السعة/الجيل/المقاس) */
function nameScore(offerTokens: string[], entry: CatalogEntry): { score: number; reasons: string[] } {
  let best = { score: 0, reasons: [] as string[] };
  const offerSet = new Set(offerTokens);
  const offerNums = offerTokens.filter(isNumber);

  for (const n of entry.names) {
    const t = tokenize(n);
    const set = new Set(t);
    const nums = t.filter(isNumber);

    // أي رقم مختلف (17 مقابل 16، 256 مقابل 512) = منتج مختلف
    const numsMatch =
      nums.every((x) => offerSet.has(x)) && offerNums.every((x) => set.has(x) || x.length > 4);
    if (!numsMatch) continue;

    const inter = [...set].filter((x) => offerSet.has(x)).length;
    const union = new Set([...set, ...offerSet]).size;
    const score = union ? inter / union : 0;
    if (score > best.score) {
      best = { score, reasons: [`تشابه الاسم ${(score * 100).toFixed(0)}%`, "الأرقام (السعة/الجيل) متطابقة"] };
    }
  }
  return best;
}

export const NAME_CANDIDATE_THRESHOLD = 0.45;

export function matchOffer(offer: NormalizedOffer, catalog: readonly CatalogEntry[]): MatchResult {
  /* 1) الباركود */
  if (offer.gtin) {
    const hits = catalog.filter((e) => e.gtins.includes(offer.gtin!));
    if (hits.length === 1) {
      const e = hits[0];
      if (brandsConflict(offer.brand, e.brand)) {
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
    const hits = catalog.filter((e) => e.mpns.includes(offer.mpn!));
    const sameBrand = hits.filter((e) => brandKey(offer.brand) && !brandsConflict(offer.brand, e.brand));
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

  /* 3) الاسم والمواصفات — مرشحون فقط، لا دمج تلقائي */
  const offerTokens = tokenize(`${offer.brand ?? ""} ${offer.name}`);
  const candidates: MatchCandidate[] = [];
  for (const e of catalog) {
    if (brandsConflict(offer.brand, e.brand)) continue;
    const { score, reasons } = nameScore(offerTokens, e);
    if (score >= NAME_CANDIDATE_THRESHOLD) {
      candidates.push({ productId: e.id, label: e.label, score, reasons });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    return {
      status: "needs_review",
      reason: "مطابقة بالاسم فقط — تحتاج تأكيدًا يدويًا",
      candidates: candidates.slice(0, 3),
    };
  }

  return {
    status: "unmatched",
    reason: offer.gtin || offer.mpn ? "المعرّف غير موجود في الكتالوج" : "لا يوجد منتج مشابه في الكتالوج",
  };
}
