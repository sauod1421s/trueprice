/**
 * أدوات أسعار مشتركة.
 */

/** هل جميع الأسعار متطابقة؟ (مؤشر على أن المصادر قد لا تكون مستقلة) */
export function allPricesIdentical(prices: number[]): boolean {
  return prices.length > 1 && new Set(prices).size === 1;
}
