import brands from "../data/cars";

/** الأسماء العربية لعلامات السيارات (موحّدة لكل الصفحات) */
export const brandNameAr: Record<string, string> = {
  toyota: "تويوتا",
  hyundai: "هيونداي",
  kia: "كيا",
  nissan: "نيسان",
  mg: "MG",
  ford: "فورد",
  honda: "هوندا",
  mazda: "مازدا",
  suzuki: "سوزوكي",
  isuzu: "إيسوزو",
  changan: "شانجان",
  geely: "جيلي",
  gac: "GAC",
  haval: "هافال",
  jetour: "جيتور",
  chery: "شيري",
  chevrolet: "شفروليه",
  gmc: "GMC",
  mitsubishi: "ميتسوبيشي",
  jeep: "جيب",
  lexus: "لكزس",
  bmw: "BMW",
  mercedes: "مرسيدس-بنز",
  audi: "أودي",
  volkswagen: "فولكس واجن",
  byd: "BYD",
  exeed: "إكسيد",
  hongqi: "هونشي",
  greatwall: "جريت وول",
  tank: "تانك",
  jac: "جاك",
  mahindra: "ماهيندرا",
  renault: "رينو",
  peugeot: "بيجو",
  landrover: "لاند روفر",
  volvo: "فولفو",
  porsche: "بورشه",
  tesla: "تسلا",
  lucid: "لوسيد",
  genesis: "جينيسيس",
};

export type BrandSummary = {
  id: string;
  name: string;
  nameAr: string;
  initial: string;
  description: string;
  modelCount: number;
  /** أقل سعر مرجعي منشور بين موديلات العلامة (غير موثق) */
  minPrice: number | null;
};

export function brandInitial(name: string): string {
  return name.length <= 3 ? name.toUpperCase() : name.charAt(0).toUpperCase();
}

export function getBrandSummary(id: string): BrandSummary | null {
  const brand = brands[id];
  if (!brand) return null;

  const prices = brand.models
    .map((m) => m.price)
    .filter((p): p is number => typeof p === "number" && p > 0);

  return {
    id,
    name: brand.name,
    nameAr: brandNameAr[id] ?? brand.name,
    initial: brandInitial(brand.name),
    description: brand.description,
    modelCount: brand.models.length,
    minPrice: prices.length ? Math.min(...prices) : null,
  };
}

export const brandSummaries: BrandSummary[] = Object.keys(brands)
  .map((id) => getBrandSummary(id))
  .filter((b): b is BrandSummary => b !== null);

/** العلامات المعروضة في الصفحة الرئيسية (نفس الخمس السابقة) */
export const featuredBrandIds = ["toyota", "hyundai", "kia", "nissan", "mg"];
