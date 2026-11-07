/**
 * بحث المنتجات: مطابقة بالكلمات (عربي/إنجليزي) بدل مطابقة النص كاملًا.
 *
 * - يوحّد الحروف العربية (أ/إ/آ → ا، ة → ه، ى → ي) ويحذف التشكيل والتطويل.
 * - يحوّل الأرقام العربية والفارسية إلى أرقام لاتينية.
 * - يفصل الحروف عن الأرقام ("s26" → "s 26"، "17pro" → "17 pro").
 * - يحوّل المرادفات إلى صيغة واحدة (آيفون = iphone، برو = pro، جوال = smartphones ...).
 * - كل كلمة في البحث يجب أن تطابق بداية كلمة في بيانات المنتج.
 */

export type SearchableProduct = {
  name: string;
  nameAr: string;
  brand: string;
  brandAr: string;
  category: string;
  categoryAr: string;
  storage?: string;
  memory?: string;
};

const SYNONYMS: Record<string, string> = {
  // العلامات
  ايفون: "iphone",
  ايفن: "iphone",
  ابل: "apple",
  ايباد: "ipad",
  ماكبوك: "macbook",
  ماك: "mac",
  ايربودز: "airpods",
  جالكسي: "galaxy",
  جلاكسي: "galaxy",
  جالاكسي: "galaxy",
  قالكسي: "galaxy",
  غالكسي: "galaxy",
  سامسونج: "samsung",
  سامسونغ: "samsung",
  سامسونق: "samsung",
  شاومي: "xiaomi",
  ريدمي: "redmi",
  هواوي: "huawei",
  هونر: "honor",
  هونور: "honor",
  جوجل: "google",
  قوقل: "google",
  بكسل: "pixel",
  لينوفو: "lenovo",
  سوني: "sony",
  بلايستيشن: "playstation",
  بلاستيشن: "playstation",
  ps: "playstation",
  هايسنس: "hisense",

  // الفئات والطرازات
  برو: "pro",
  ماكس: "max",
  الترا: "ultra",
  الترى: "ultra",
  بلس: "plus",
  اير: "air",
  ميني: "mini",
  نوت: "note",
  ساعه: "watch",
  ساعات: "watch",
  smartwatch: "watch",
  smartwatches: "watch",
  جوال: "smartphones",
  جوالات: "smartphones",
  هاتف: "smartphones",
  موبايل: "smartphones",
  phone: "smartphones",
  phones: "smartphones",
  mobile: "smartphones",
  smartphone: "smartphones",
  تابلت: "tablets",
  لوحي: "tablets",
  لوحيه: "tablets",
  tablet: "tablets",
  لابتوب: "laptops",
  لابتوبات: "laptops",
  laptop: "laptops",
  تلفزيون: "tv",
  تلفزيونات: "tv",
  تلفاز: "tv",
  شاشه: "tv",
  سماعه: "audio",
  سماعات: "audio",
  العاب: "gaming",

  // الوحدات
  جيجابايت: "gb",
  جيجا: "gb",
  جيجابايتس: "gb",
  تيرابايت: "tb",
  تيرا: "tb",
  انش: "inch",
  بوصه: "inch",
};

const STOPWORDS = new Set([
  "سعر",
  "اسعار",
  "بكم",
  "كم",
  "في",
  "من",
  "price",
  "prices",
  "the",
]);

const PHRASES: Array<[RegExp, string]> = [
  [/ماك\s+بوك/g, "macbook"],
  [/mac\s+book/g, "macbook"],
  [/بلاي\s*ستيشن/g, "playstation"],
  [/اجهزه\s+لوحيه/g, "tablets"],
];

export function normalizeText(text: string): string {
  let t = text
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[ً-ْٰ]/g, "")
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    // فصل الحروف عن الأرقام
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2");

  for (const [re, rep] of PHRASES) t = t.replace(re, rep);

  return t.replace(/\s+/g, " ").trim();
}

function canonical(token: string): string {
  if (SYNONYMS[token]) return SYNONYMS[token];
  // "الايفون" → "ايفون"
  if (token.startsWith("ال") && token.length > 3) {
    const stripped = token.slice(2);
    if (SYNONYMS[stripped]) return SYNONYMS[stripped];
  }
  return token;
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(" ").map(canonical);
}

export function queryTokens(query: string): string[] {
  return tokenize(query).filter((t) => !STOPWORDS.has(t));
}

function productTokens(p: SearchableProduct): {
  name: string[];
  all: string[];
} {
  const name = [...tokenize(p.name), ...tokenize(p.nameAr)];
  const rest = [
    p.brand,
    p.brandAr,
    p.category,
    p.categoryAr,
    p.storage ?? "",
    p.memory ?? "",
  ].flatMap(tokenize);
  return { name, all: [...name, ...rest] };
}

/**
 * يعيد درجة المطابقة (0 = لا يطابق).
 */
export function scoreProduct(p: SearchableProduct, tokens: string[]): number {
  if (tokens.length === 0) return 1;

  const { name, all } = productTokens(p);
  let score = 0;

  for (const q of tokens) {
    const isNumber = /^\d+$/.test(q);
    // الأرقام يجب أن تطابق تمامًا (حتى لا يطابق "1" الرقم "128")
    const matches = (t: string) => (isNumber ? t === q : t.startsWith(q));

    if (!all.some(matches)) return 0;

    if (name.some((t) => t === q)) score += 3;
    else if (name.some(matches)) score += 2;
    else score += 1;
  }

  return score;
}

export function searchProducts<T extends SearchableProduct>(
  products: T[],
  query: string
): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return products;

  return products
    .map((p, index) => ({ p, index, score: scoreProduct(p, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.p);
}

/* ------------------------------------------------------------------ السيارات في البحث */

export type SearchableCar = { brandId: string; brandAr: string; brand: string; name: string; years: number[] };

/** موديلات السيارات المطابقة (كل كلمة يجب أن تطابق العلامة أو الموديل أو السنة) */
export function searchCars<T extends SearchableCar>(cars: T[], query: string, limit = 12): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const scored: { c: T; score: number; index: number }[] = [];
  cars.forEach((c, index) => {
    const nameT = [...tokenize(c.name)];
    const brandT = [...tokenize(c.brand), ...tokenize(c.brandAr), ...tokenize(c.brandId)];
    const yearT = c.years.map(String);
    const all = [...nameT, ...brandT, ...yearT];
    let score = 0;
    for (const q of tokens) {
      const isNumber = /^\d+$/.test(q);
      const matches = (t: string) => (isNumber ? t === q : t.startsWith(q));
      if (!all.some(matches)) return;
      score += nameT.some(matches) ? 2 : 1;
    }
    scored.push({ c, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((x) => x.c);
}
