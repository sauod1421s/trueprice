/**
 * حسابات الأسعار الخاصة بالإلكترونيات (مؤقتة حتى محرك التقييم في المرحلة 3).
 */

export type PriceSpread = {
  lowest: number;
  highest: number;
  /** الفرق بين أعلى وأقل سعر مرجعي */
  saving: number;
  /** نسبة التوفير من أعلى سعر */
  savingPercent: number;
  count: number;
};

/**
 * التوفير المحتمل = أعلى سعر مرجعي − أقل سعر مرجعي.
 * أي كم يوفر المشتري إذا اختار أرخص مرجع بدل أغلاه.
 * يعيد null إذا كان هناك أقل من سعرين صالحين.
 */
export function priceSpread(
  prices: Array<number | null | undefined>
): PriceSpread | null {
  const valid = prices.filter(
    (p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0
  );

  if (valid.length < 2) return null;

  const lowest = Math.min(...valid);
  const highest = Math.max(...valid);
  const saving = highest - lowest;

  return {
    lowest,
    highest,
    saving,
    savingPercent: highest > 0 ? (saving / highest) * 100 : 0,
    count: valid.length,
  };
}

/** هل جميع الأسعار متطابقة؟ (مؤشر على أن المصادر قد لا تكون مستقلة) */
export function allPricesIdentical(prices: number[]): boolean {
  return prices.length > 1 && new Set(prices).size === 1;
}
