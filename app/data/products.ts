export type PriceOffer = {
  store: string;
  storeAr: string;
  price: number;
  url: string;
  isVerified: boolean;
  checkedAt: string;
};

export type Product = {
  id: number;
  name: string;
  nameAr: string;
  brand: string;
  brandAr: string;
  category: string;
  categoryAr: string;
  memory: string;
  storage: string;
  price: number;
  prices: number[];
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  fairPrice: number;
  store: string;
  confidence: number;
  offers: PriceOffer[];
  description?: string;
  screen?: string;
  chip?: string;
  camera?: string;
  frontCamera?: string;
  connectivity?: string;
  refreshRate?: string;
  officialPrice?: number;
  lastUpdated?: string;
};

const CHECKED_AT = "2026-08-27";

function offer(
  store: string,
  storeAr: string,
  price: number,
  url: string
): PriceOffer {
  return {
    store,
    storeAr,
    price,
    url,
    isVerified: true,
    checkedAt: CHECKED_AT,
  };
}

function makeProduct(
  id: number,
  name: string,
  nameAr: string,
  brand: string,
  brandAr: string,
  category: string,
  categoryAr: string,
  storage: string,
  memory: string,
  offers: PriceOffer[],
  extra: Partial<Product> = {}
): Product {
  const prices = offers.map((x) => x.price);

  const lowestPrice = prices.length ? Math.min(...prices) : 0;
  const highestPrice = prices.length ? Math.max(...prices) : 0;

  const averagePrice = prices.length
    ? Math.round(
        prices.reduce((sum, price) => sum + price, 0) / prices.length
      )
    : 0;

  const sorted = [...prices].sort((a, b) => a - b);

  const fairPrice = sorted.length
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;

  return {
    id,
    name,
    nameAr,
    brand,
    brandAr,
    category,
    categoryAr,
    storage,
    memory,
    price: lowestPrice,
    prices,
    averagePrice,
    lowestPrice,
    highestPrice,
    fairPrice,
    store: offers[0]?.store ?? "غير محدد",
    confidence: Math.min(100, 50 + offers.length * 15),
    offers,
    lastUpdated: CHECKED_AT,
    ...extra,
  };
}

/* =====================================================
   روابط المتاجر
===================================================== */

const AMAZON =
  "https://www.amazon.sa/s?k=";

const NOON =
  "https://www.noon.com/saudi-en/search?q=";

const JARIR =
  "https://www.jarir.com/sa-en/search.html?q=";

const EXTRA =
  "https://www.extra.com/en-sa/search/?text=";

const APPLE =
  "https://www.apple.com/sa-ar/shop/buy-iphone";

const SAMSUNG =
  "https://www.samsung.com/sa_en";

const HUAWEI =
  "https://consumer.huawei.com/sa-en/";

const XIAOMI =
  "https://www.mi.com/global/";

const HONOR =
  "https://www.honor.com/sa/";

const GOOGLE =
  "https://store.google.com/";

const LENOVO =
  "https://www.lenovo.com/sa/en/";

const ASUS =
  "https://www.asus.com/sa-en/";

const HP =
  "https://www.hp.com/sa-en/";

const SONY =
  "https://www.sony.com/en-sa/";

const LG =
  "https://www.lg.com/sa_en/";

const TCL =
  "https://www.tcl.com/sa/en";

const HISENSE =
  "https://global.hisense.com/";

/* =====================================================
   المنتجات
===================================================== */

export const products: Product[] = [

  /* ===================================================
     APPLE - iPHONE
  =================================================== */

  makeProduct(
    1,
    "iPhone 17 256GB",
    "آيفون 17 - 256 جيجابايت",
    "Apple",
    "أبل",
    "Smartphones",
    "جوالات",
    "256GB",
    "8GB",
    [
      offer("Apple", "أبل", 3799, `${APPLE}/iphone-17`),
      offer("Amazon", "أمازون", 3749, `${AMAZON}iPhone+17+256GB`),
      offer("Noon", "نون", 3787, `${NOON}iPhone+17+256GB`),
      offer("Jarir", "جرير", 3799, `${JARIR}iPhone+17+256GB`),
    ],
    {
      officialPrice: 3799,
      screen: "6.3-inch Super Retina XDR",
      chip: "Apple A19",
      camera: "48MP",
      frontCamera: "18MP",
      refreshRate: "120Hz",
    }
  ),

  makeProduct(
    2,
    "iPhone 17 512GB",
    "آيفون 17 - 512 جيجابايت",
    "Apple",
    "أبل",
    "Smartphones",
    "جوالات",
    "512GB",
    "8GB",
    [
      offer("Apple", "أبل", 4799, `${APPLE}/iphone-17`),
      offer("Amazon", "أمازون", 4749, `${AMAZON}iPhone+17+512GB`),
      offer("Noon", "نون", 4799, `${NOON}iPhone+17+512GB`),
      offer("Jarir", "جرير", 4799, `${JARIR}iPhone+17+512GB`),
    ],
    {
      officialPrice: 4799,
      screen: "6.3-inch Super Retina XDR",
      chip: "Apple A19",
      camera: "48MP",
      refreshRate: "120Hz",
    }
  ),

  makeProduct(
    3,
    "iPhone 17 Pro 256GB",
    "آيفون 17 Pro - 256 جيجابايت",
    "Apple",
    "أبل",
    "Smartphones",
    "جوالات",
    "256GB",
    "12GB",
    [
      offer("Apple", "أبل", 5199, `${APPLE}/iphone-17-pro`),
      offer("Amazon", "أمازون", 5099, `${AMAZON}iPhone+17+Pro+256GB`),
      offer("Noon", "نون", 5149, `${NOON}iPhone+17+Pro+256GB`),
      offer("Jarir", "جرير", 5199, `${JARIR}iPhone+17+Pro+256GB`),
    ],
    {
      officialPrice: 5199,
      screen: "6.3-inch Super Retina XDR",
      chip: "Apple A19 Pro",
      camera: "Pro Fusion 48MP",
      refreshRate: "120Hz",
    }
  ),

  makeProduct(
    4,
    "iPhone 17 Pro Max 256GB",
    "آيفون 17 Pro Max - 256 جيجابايت",
    "Apple",
    "أبل",
    "Smartphones",
    "جوالات",
    "256GB",
    "12GB",
    [
      offer("Apple", "أبل", 5699, `${APPLE}/iphone-17-pro`),
      offer("Amazon", "أمازون", 5599, `${AMAZON}iPhone+17+Pro+Max+256GB`),
      offer("Noon", "نون", 5649, `${NOON}iPhone+17+Pro+Max+256GB`),
      offer("Jarir", "جرير", 5699, `${JARIR}iPhone+17+Pro+Max+256GB`),
    ],
    {
      officialPrice: 5699,
      screen: "6.9-inch Super Retina XDR",
      chip: "Apple A19 Pro",
      camera: "Pro Fusion 48MP",
      refreshRate: "120Hz",
    }
  ),

  makeProduct(
    5,
    "iPhone 16 128GB",
    "آيفون 16 - 128 جيجابايت",
    "Apple",
    "أبل",
    "Smartphones",
    "جوالات",
    "128GB",
    "8GB",
    [
      offer("Apple", "أبل", 3299, `${APPLE}/iphone-16`),
      offer("Amazon", "أمازون", 2999, `${AMAZON}iPhone+16+128GB`),
      offer("Noon", "نون", 3099, `${NOON}iPhone+16+128GB`),
      offer("Jarir", "جرير", 3199, `${JARIR}iPhone+16+128GB`),
    ],
    {
      officialPrice: 3299,
      screen: "6.1-inch Super Retina XDR",
      chip: "Apple A18",
      camera: "48MP Fusion",
    }
  ),

  makeProduct(
    6,
    "iPhone 15 128GB",
    "آيفون 15 - 128 جيجابايت",
    "Apple",
    "أبل",
    "Smartphones",
    "جوالات",
    "128GB",
    "6GB",
    [
      offer("Amazon", "أمازون", 2499, `${AMAZON}iPhone+15+128GB`),
      offer("Noon", "نون", 2599, `${NOON}iPhone+15+128GB`),
      offer("Jarir", "جرير", 2699, `${JARIR}iPhone+15+128GB`),
      offer("eXtra", "إكسترا", 2649, `${EXTRA}iPhone+15+128GB`),
    ],
    {
      screen: "6.1-inch Super Retina XDR",
      chip: "Apple A16",
      camera: "48MP",
    }
  ),

  /* ===================================================
     APPLE - IPAD
  =================================================== */

  makeProduct(
    20,
    "iPad 128GB Wi-Fi",
    "آيباد - 128 جيجابايت Wi-Fi",
    "Apple",
    "أبل",
    "Tablets",
    "أجهزة لوحية",
    "128GB",
    "—",
    [
      offer("Apple", "أبل", 2099, `${APPLE}/../buy-ipad/ipad`),
      offer("Amazon", "أمازون", 1999, `${AMAZON}iPad+128GB`),
      offer("Noon", "نون", 2049, `${NOON}iPad+128GB`),
      offer("Jarir", "جرير", 2099, `${JARIR}iPad+128GB`),
    ],
    {
      officialPrice: 2099,
      screen: "11-inch Liquid Retina",
      chip: "Apple A16",
      camera: "12MP",
    }
  ),

  makeProduct(
    21,
    "iPad Air M4 11 256GB",
    "آيباد Air M4 - 11 إنش - 256 جيجابايت",
    "Apple",
    "أبل",
    "Tablets",
    "أجهزة لوحية",
    "256GB",
    "8GB",
    [
      offer("Apple", "أبل", 3949, `${APPLE}/../buy-ipad/ipad-air`),
      offer("Amazon", "أمازون", 3799, `${AMAZON}iPad+Air+M4+256GB`),
      offer("Noon", "نون", 3899, `${NOON}iPad+Air+M4+256GB`),
      offer("Jarir", "جرير", 3949, `${JARIR}iPad+Air+M4+256GB`),
    ],
    {
      officialPrice: 3949,
      screen: "11-inch Liquid Retina",
      chip: "Apple M4",
    }
  ),

  makeProduct(
    22,
    "iPad Pro M5 11 256GB",
    "آيباد Pro M5 - 11 إنش - 256 جيجابايت",
    "Apple",
    "أبل",
    "Tablets",
    "أجهزة لوحية",
    "256GB",
    "12GB",
    [
      offer("Apple", "أبل", 5599, `${APPLE}/../buy-ipad/ipad-pro`),
      offer("Amazon", "أمازون", 5399, `${AMAZON}iPad+Pro+M5+256GB`),
      offer("Noon", "نون", 5499, `${NOON}iPad+Pro+M5+256GB`),
      offer("Jarir", "جرير", 5599, `${JARIR}iPad+Pro+M5+256GB`),
    ],
    {
      officialPrice: 5599,
      screen: "11-inch Ultra Retina XDR",
      chip: "Apple M5",
    }
  ),

  /* ===================================================
     APPLE - MAC
  =================================================== */

  makeProduct(
    30,
    "MacBook Air 13 M5",
    "ماك بوك Air 13 M5",
    "Apple",
    "أبل",
    "Laptops",
    "لابتوبات",
    "512GB SSD",
    "16GB",
    [
      offer("Apple", "أبل", 5999, `${APPLE}/../buy-mac/macbook-air`),
      offer("Amazon", "أمازون", 5799, `${AMAZON}MacBook+Air+M5`),
      offer("Noon", "نون", 5899, `${NOON}MacBook+Air+M5`),
      offer("Jarir", "جرير", 5999, `${JARIR}MacBook+Air+M5`),
    ],
    {
      officialPrice: 5999,
      screen: "13.6-inch Liquid Retina",
      chip: "Apple M5",
    }
  ),

  makeProduct(
    31,
    "MacBook Pro 14 M5",
    "ماك بوك Pro 14 M5",
    "Apple",
    "أبل",
    "Laptops",
    "لابتوبات",
    "512GB SSD",
    "24GB",
    [
      offer("Apple", "أبل", 9499, `${APPLE}/../buy-mac`),
      offer("Amazon", "أمازون", 9199, `${AMAZON}MacBook+Pro+14+M5`),
      offer("Noon", "نون", 9349, `${NOON}MacBook+Pro+14+M5`),
      offer("Jarir", "جرير", 9499, `${JARIR}MacBook+Pro+14+M5`),
    ],
    {
      officialPrice: 9499,
      screen: "14-inch Liquid Retina XDR",
      chip: "Apple M5",
    }
  ),

  /* ===================================================
     APPLE - WATCH / AIRPODS
  =================================================== */

  makeProduct(
    40,
    "Apple Watch Series 11",
    "Apple Watch Series 11",
    "Apple",
    "أبل",
    "Smartwatches",
    "ساعات ذكية",
    "—",
    "—",
    [
      offer("Apple", "أبل", 1799, `${APPLE}/../buy-watch`),
      offer("Amazon", "أمازون", 1699, `${AMAZON}Apple+Watch+Series+11`),
      offer("Noon", "نون", 1749, `${NOON}Apple+Watch+Series+11`),
      offer("Jarir", "جرير", 1799, `${JARIR}Apple+Watch+Series+11`),
    ]
  ),

  makeProduct(
    41,
    "Apple Watch Ultra 3",
    "Apple Watch Ultra 3",
    "Apple",
    "أبل",
    "Smartwatches",
    "ساعات ذكية",
    "—",
    "—",
    [
      offer("Apple", "أبل", 3599, `${APPLE}/../buy-watch`),
      offer("Amazon", "أمازون", 3449, `${AMAZON}Apple+Watch+Ultra+3`),
      offer("Noon", "نون", 3499, `${NOON}Apple+Watch+Ultra+3`),
      offer("Jarir", "جرير", 3599, `${JARIR}Apple+Watch+Ultra+3`),
    ]
  ),

  makeProduct(
    42,
    "AirPods Pro 3",
    "AirPods Pro 3",
    "Apple",
    "أبل",
    "Audio",
    "سماعات",
    "—",
    "—",
    [
      offer("Apple", "أبل", 1049, `${APPLE}/../buy-airpods`),
      offer("Amazon", "أمازون", 949, `${AMAZON}AirPods+Pro+3`),
      offer("Noon", "نون", 999, `${NOON}AirPods+Pro+3`),
      offer("Jarir", "جرير", 1049, `${JARIR}AirPods+Pro+3`),
    ]
  ),

  /* ===================================================
     SAMSUNG - GALAXY
  =================================================== */

  makeProduct(
    100,
    "Galaxy S26 256GB",
    "جالكسي S26 - 256 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "256GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 3499, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 3349, `${AMAZON}Galaxy+S26+256GB`),
      offer("Noon", "نون", 3399, `${NOON}Galaxy+S26+256GB`),
      offer("Jarir", "جرير", 3499, `${JARIR}Galaxy+S26+256GB`),
    ],
    {
      officialPrice: 3499,
      screen: "6.3-inch",
      chip: "Snapdragon",
      camera: "50MP",
    }
  ),

  makeProduct(
    101,
    "Galaxy S26 512GB",
    "جالكسي S26 - 512 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 4599, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 4399, `${AMAZON}Galaxy+S26+512GB`),
      offer("Noon", "نون", 4499, `${NOON}Galaxy+S26+512GB`),
      offer("Jarir", "جرير", 4599, `${JARIR}Galaxy+S26+512GB`),
    ],
    {
      officialPrice: 4599,
      screen: "6.3-inch",
      chip: "Snapdragon",
    }
  ),

  makeProduct(
    102,
    "Galaxy S26+ 512GB",
    "جالكسي S26+ - 512 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 5349, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 5149, `${AMAZON}Galaxy+S26++512GB`),
      offer("Noon", "نون", 5249, `${NOON}Galaxy+S26++512GB`),
      offer("Jarir", "جرير", 5349, `${JARIR}Galaxy+S26++512GB`),
    ],
    {
      officialPrice: 5349,
      screen: "6.7-inch",
      chip: "Snapdragon",
    }
  ),

  makeProduct(
    103,
    "Galaxy S26 Ultra 256GB",
    "جالكسي S26 Ultra - 256 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "256GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 5499, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 5199, `${AMAZON}Galaxy+S26+Ultra+256GB`),
      offer("Noon", "نون", 5299, `${NOON}Galaxy+S26+Ultra+256GB`),
      offer("Jarir", "جرير", 5399, `${JARIR}Galaxy+S26+Ultra+256GB`),
    ],
    {
      officialPrice: 5499,
      screen: "6.9-inch",
      camera: "200MP",
    }
  ),

  makeProduct(
    104,
    "Galaxy S26 Ultra 512GB",
    "جالكسي S26 Ultra - 512 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 6299, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 5999, `${AMAZON}Galaxy+S26+Ultra+512GB`),
      offer("Noon", "نون", 6099, `${NOON}Galaxy+S26+Ultra+512GB`),
      offer("Jarir", "جرير", 6199, `${JARIR}Galaxy+S26+Ultra+512GB`),
    ],
    {
      officialPrice: 6299,
      screen: "6.9-inch",
      camera: "200MP",
    }
  ),

  makeProduct(
    105,
    "Galaxy S26 Ultra 1TB",
    "جالكسي S26 Ultra - 1 تيرابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "1TB",
    "16GB",
    [
      offer("Samsung", "سامسونج", 7499, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 7199, `${AMAZON}Galaxy+S26+Ultra+1TB`),
      offer("Noon", "نون", 7299, `${NOON}Galaxy+S26+Ultra+1TB`),
      offer("Jarir", "جرير", 7399, `${JARIR}Galaxy+S26+Ultra+1TB`),
    ],
    {
      officialPrice: 7499,
      screen: "6.9-inch",
      camera: "200MP",
    }
  ),

  /* ===================================================
     SAMSUNG - A SERIES
  =================================================== */

  makeProduct(
    110,
    "Galaxy A57 256GB",
    "جالكسي A57 - 256 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "256GB",
    "8GB",
    [
      offer("Samsung", "سامسونج", 1799, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 1699, `${AMAZON}Galaxy+A57+256GB`),
      offer("Noon", "نون", 1749, `${NOON}Galaxy+A57+256GB`),
      offer("Jarir", "جرير", 1799, `${JARIR}Galaxy+A57+256GB`),
    ],
    {
      screen: "6.7-inch AMOLED",
      camera: "50MP",
    }
  ),

  makeProduct(
    111,
    "Galaxy A37 256GB",
    "جالكسي A37 - 256 جيجابايت",
    "Samsung",
    "سامسونج",
    "Smartphones",
    "جوالات",
    "256GB",
    "8GB",
    [
      offer("Samsung", "سامسونج", 1399, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 1299, `${AMAZON}Galaxy+A37+256GB`),
      offer("Noon", "نون", 1349, `${NOON}Galaxy+A37+256GB`),
      offer("Jarir", "جرير", 1399, `${JARIR}Galaxy+A37+256GB`),
    ],
    {
      screen: "6.6-inch AMOLED",
      camera: "50MP",
    }
  ),

  /* ===================================================
     SAMSUNG - TABLETS
  =================================================== */

  makeProduct(
    120,
    "Galaxy Tab S11 256GB",
    "جالكسي Tab S11 - 256 جيجابايت",
    "Samsung",
    "سامسونج",
    "Tablets",
    "أجهزة لوحية",
    "256GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 4299, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 4099, `${AMAZON}Galaxy+Tab+S11+256GB`),
      offer("Noon", "نون", 4199, `${NOON}Galaxy+Tab+S11+256GB`),
      offer("Jarir", "جرير", 4299, `${JARIR}Galaxy+Tab+S11+256GB`),
    ],
    {
      screen: "11-inch",
    }
  ),

  makeProduct(
    121,
    "Galaxy Tab S11 Ultra 256GB",
    "جالكسي Tab S11 Ultra - 256 جيجابايت",
    "Samsung",
    "سامسونج",
    "Tablets",
    "أجهزة لوحية",
    "256GB",
    "12GB",
    [
      offer("Samsung", "سامسونج", 5599, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 5399, `${AMAZON}Galaxy+Tab+S11+Ultra`),
      offer("Noon", "نون", 5499, `${NOON}Galaxy+Tab+S11+Ultra`),
      offer("Jarir", "جرير", 5599, `${JARIR}Galaxy+Tab+S11+Ultra`),
    ],
    {
      screen: "14.6-inch",
    }
  ),

  /* ===================================================
     SAMSUNG - WATCH
  =================================================== */

  makeProduct(
    130,
    "Galaxy Watch8 40mm",
    "جالكسي Watch8 - 40mm",
    "Samsung",
    "سامسونج",
    "Smartwatches",
    "ساعات ذكية",
    "—",
    "—",
    [
      offer("Samsung", "سامسونج", 1199, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 1099, `${AMAZON}Galaxy+Watch8+40mm`),
      offer("Noon", "نون", 1149, `${NOON}Galaxy+Watch8+40mm`),
      offer("Jarir", "جرير", 1199, `${JARIR}Galaxy+Watch8+40mm`),
    ]
  ),

  makeProduct(
    131,
    "Galaxy Watch8 44mm",
    "جالكسي Watch8 - 44mm",
    "Samsung",
    "سامسونج",
    "Smartwatches",
    "ساعات ذكية",
    "—",
    "—",
    [
      offer("Samsung", "سامسونج", 1299, `${SAMSUNG}/sa_en`),
      offer("Amazon", "أمازون", 1199, `${AMAZON}Galaxy+Watch8+44mm`),
      offer("Noon", "نون", 1249, `${NOON}Galaxy+Watch8+44mm`),
      offer("Jarir", "جرير", 1299, `${JARIR}Galaxy+Watch8+44mm`),
    ]
  ),

  /* ===================================================
     XIAOMI
  =================================================== */

  makeProduct(
    200,
    "Xiaomi 17 512GB",
    "شاومي 17 - 512 جيجابايت",
    "Xiaomi",
    "شاومي",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("eXtra", "إكسترا", 3799, `${EXTRA}Xiaomi+17+512GB`),
      offer("Amazon", "أمازون", 3599, `${AMAZON}Xiaomi+17+512GB`),
      offer("Noon", "نون", 3699, `${NOON}Xiaomi+17+512GB`),
      offer("Jarir", "جرير", 3799, `${JARIR}Xiaomi+17+512GB`),
    ],
    {
      screen: "6.35-inch AMOLED",
      chip: "Snapdragon",
      camera: "50MP",
    }
  ),

  makeProduct(
    201,
    "Xiaomi 17 Ultra 512GB",
    "شاومي 17 Ultra - 512 جيجابايت",
    "Xiaomi",
    "شاومي",
    "Smartphones",
    "جوالات",
    "512GB",
    "16GB",
    [
      offer("eXtra", "إكسترا", 5299, `${EXTRA}Xiaomi+17+Ultra`),
      offer("Amazon", "أمازون", 5099, `${AMAZON}Xiaomi+17+Ultra`),
      offer("Noon", "نون", 5199, `${NOON}Xiaomi+17+Ultra`),
      offer("Jarir", "جرير", 5299, `${JARIR}Xiaomi+17+Ultra`),
    ],
    {
      screen: "6.8-inch",
      chip: "Snapdragon",
      camera: "200MP",
    }
  ),

  makeProduct(
    202,
    "Xiaomi 15 512GB",
    "شاومي 15 - 512 جيجابايت",
    "Xiaomi",
    "شاومي",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("eXtra", "إكسترا", 3499, `${EXTRA}Xiaomi+15+512GB`),
      offer("Amazon", "أمازون", 3299, `${AMAZON}Xiaomi+15+512GB`),
      offer("Noon", "نون", 3399, `${NOON}Xiaomi+15+512GB`),
      offer("Jarir", "جرير", 3499, `${JARIR}Xiaomi+15+512GB`),
    ],
    {
      screen: "6.3-inch",
      chip: "Snapdragon",
      camera: "50MP",
    }
  ),

  makeProduct(
    203,
    "Redmi Note 15 Pro 256GB",
    "ريدمي Note 15 Pro - 256 جيجابايت",
    "Xiaomi",
    "شاومي",
    "Smartphones",
    "جوالات",
    "256GB",
    "8GB",
    [
      offer("eXtra", "إكسترا", 1349, `${EXTRA}Redmi+Note+15+Pro`),
      offer("Amazon", "أمازون", 1199, `${AMAZON}Redmi+Note+15+Pro`),
      offer("Noon", "نون", 1249, `${NOON}Redmi+Note+15+Pro`),
      offer("Jarir", "جرير", 1349, `${JARIR}Redmi+Note+15+Pro`),
    ],
    {
      screen: "6.83-inch AMOLED",
      camera: "200MP",
    }
  ),

  /* ===================================================
     HUAWEI
  =================================================== */

  makeProduct(
    300,
    "Huawei Pura 80 Pro",
    "هواوي Pura 80 Pro",
    "Huawei",
    "هواوي",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("Huawei", "هواوي", 3999, HUAWEI),
      offer("Amazon", "أمازون", 3799, `${AMAZON}Huawei+Pura+80+Pro`),
      offer("Noon", "نون", 3899, `${NOON}Huawei+Pura+80+Pro`),
      offer("Jarir", "جرير", 3999, `${JARIR}Huawei+Pura+80+Pro`),
    ],
    {
      screen: "6.8-inch OLED",
      camera: "50MP",
    }
  ),

  makeProduct(
    301,
    "Huawei Mate X7",
    "هواوي Mate X7",
    "Huawei",
    "هواوي",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("Huawei", "هواوي", 6999, HUAWEI),
      offer("Amazon", "أمازون", 6799, `${AMAZON}Huawei+Mate+X7`),
      offer("Noon", "نون", 6899, `${NOON}Huawei+Mate+X7`),
      offer("Jarir", "جرير", 6999, `${JARIR}Huawei+Mate+X7`),
    ]
  ),

  /* ===================================================
     HONOR
  =================================================== */

  makeProduct(
    400,
    "HONOR Magic8 Pro",
    "هونر Magic8 Pro",
    "HONOR",
    "هونر",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("HONOR", "هونر", 3999, HONOR),
      offer("Amazon", "أمازون", 3799, `${AMAZON}HONOR+Magic8+Pro`),
      offer("Noon", "نون", 3899, `${NOON}HONOR+Magic8+Pro`),
      offer("Jarir", "جرير", 3999, `${JARIR}HONOR+Magic8+Pro`),
    ],
    {
      screen: "6.7-inch AMOLED",
      camera: "200MP",
    }
  ),

  makeProduct(
    401,
    "HONOR 400 Pro",
    "هونر 400 Pro",
    "HONOR",
    "هونر",
    "Smartphones",
    "جوالات",
    "512GB",
    "12GB",
    [
      offer("HONOR", "هونر", 2499, HONOR),
      offer("Amazon", "أمازون", 2299, `${AMAZON}HONOR+400+Pro`),
      offer("Noon", "نون", 2399, `${NOON}HONOR+400+Pro`),
      offer("Jarir", "جرير", 2499, `${JARIR}HONOR+400+Pro`),
    ]
  ),

  /* ===================================================
     GOOGLE PIXEL
  =================================================== */

  makeProduct(
    500,
    "Google Pixel 10 Pro 256GB",
    "جوجل Pixel 10 Pro - 256 جيجابايت",
    "Google",
    "جوجل",
    "Smartphones",
    "جوالات",
    "256GB",
    "16GB",
    [
      offer("Google", "Google", 3999, GOOGLE),
      offer("Amazon", "أمازون", 3799, `${AMAZON}Google+Pixel+10+Pro`),
      offer("Noon", "نون", 3899, `${NOON}Google+Pixel+10+Pro`),
      offer("Jarir", "جرير", 3999, `${JARIR}Google+Pixel+10+Pro`),
    ],
    {
      screen: "6.3-inch OLED",
      camera: "50MP",
    }
  ),

  makeProduct(
    501,
    "Google Pixel 10 128GB",
    "جوجل Pixel 10 - 128 جيجابايت",
    "Google",
    "جوجل",
    "Smartphones",
    "جوالات",
    "128GB",
    "12GB",
    [
      offer("Google", "Google", 2999, GOOGLE),
      offer("Amazon", "أمازون", 2799, `${AMAZON}Google+Pixel+10`),
      offer("Noon", "نون", 2899, `${NOON}Google+Pixel+10`),
      offer("Jarir", "جرير", 2999, `${JARIR}Google+Pixel+10`),
    ]
  ),

  /* ===================================================
     LENOVO - LAPTOPS
  =================================================== */

  makeProduct(
    600,
    "Lenovo Yoga 7",
    "لينوفو Yoga 7",
    "Lenovo",
    "لينوفو",
    "Laptops",
    "لابتوبات",
    "512GB SSD",
    "16GB",
    [
      offer("Lenovo", "لينوفو", 3299, LENOVO),
      offer("Amazon", "أمازون", 3099, `${AMAZON}Lenovo+Yoga+7`),
      offer("Noon", "نون", 3199, `${NOON}Lenovo+Yoga+7`),
      offer("Jarir", "جرير", 3299, `${JARIR}Lenovo+Yoga+7`),
    ],
    {
      screen: "14-inch",
      chip: "AMD Ryzen",
    }
  ),

  makeProduct(
    601,
    "Lenovo Legion 5",
    "لينوفو Legion 5",
    "Lenovo",
    "لينوفو",
    "Laptops",
    "لابتوبات",
    "1TB SSD",
    "16GB",
    [
      offer("Lenovo", "لينوفو", 5499, LENOVO),
      offer("Amazon", "أمازون", 5199, `${AMAZON}Lenovo+Legion+5`),
      offer("Noon", "نون", 5349, `${NOON}Lenovo+Legion+5`),
      offer("Jarir", "جرير", 5499, `${JARIR}Lenovo+Legion+5`),
    ],
    {
      screen: "15.6-inch",
      chip: "AMD Ryzen",
      refreshRate: "165Hz",
    }
  ),

  /* ===================================================
     ASUS
  =================================================== */

  makeProduct(
    700,
    "ASUS Zenbook 14",
    "ASUS Zenbook 14",
    "ASUS",
    "ASUS",
    "Laptops",
    "لابتوبات",
    "1TB SSD",
    "16GB",
    [
      offer("ASUS", "ASUS", 4499, ASUS),
      offer("Amazon", "أمازون", 4299, `${AMAZON}ASUS+Zenbook+14`),
      offer("Noon", "نون", 4399, `${NOON}ASUS+Zenbook+14`),
      offer("Jarir", "جرير", 4499, `${JARIR}ASUS+Zenbook+14`),
    ],
    {
      screen: "14-inch OLED",
      chip: "Intel Core Ultra",
    }
  ),

  makeProduct(
    701,
    "ASUS ROG Zephyrus G16",
    "ASUS ROG Zephyrus G16",
    "ASUS",
    "ASUS",
    "Laptops",
    "لابتوبات",
    "1TB SSD",
    "32GB",
    [
      offer("ASUS", "ASUS", 8999, ASUS),
      offer("Amazon", "أمازون", 8599, `${AMAZON}ASUS+ROG+Zephyrus+G16`),
      offer("Noon", "نون", 8799, `${NOON}ASUS+ROG+Zephyrus+G16`),
      offer("Jarir", "جرير", 8999, `${JARIR}ASUS+ROG+Zephyrus+G16`),
    ],
    {
      screen: "16-inch OLED",
      chip: "Intel Core Ultra",
      refreshRate: "240Hz",
    }
  ),

  /* ===================================================
     HP
  =================================================== */

  makeProduct(
    800,
    "HP Pavilion 14",
    "HP Pavilion 14",
    "HP",
    "HP",
    "Laptops",
    "لابتوبات",
    "512GB SSD",
    "16GB",
    [
      offer("HP", "HP", 2799, HP),
      offer("Amazon", "أمازون", 2599, `${AMAZON}HP+Pavilion+14`),
      offer("Noon", "نون", 2699, `${NOON}HP+Pavilion+14`),
      offer("Jarir", "جرير", 2799, `${JARIR}HP+Pavilion+14`),
    ],
    {
      screen: "14-inch",
      chip: "Intel Core",
    }
  ),

  makeProduct(
    801,
    "HP Victus 16",
    "HP Victus 16",
    "HP",
    "HP",
    "Laptops",
    "لابتوبات",
    "1TB SSD",
    "16GB",
    [
      offer("HP", "HP", 4499, HP),
      offer("Amazon", "أمازون", 4199, `${AMAZON}HP+Victus+16`),
      offer("Noon", "نون", 4349, `${NOON}HP+Victus+16`),
      offer("Jarir", "جرير", 4499, `${JARIR}HP+Victus+16`),
    ],
    {
      screen: "16.1-inch",
      chip: "Intel Core",
      refreshRate: "144Hz",
    }
  ),

  /* ===================================================
     MSI
  =================================================== */

  makeProduct(
    900,
    "MSI Katana 15",
    "MSI Katana 15",
    "MSI",
    "MSI",
    "Laptops",
    "لابتوبات",
    "1TB SSD",
    "16GB",
    [
      offer("MSI", "MSI", 4999, "https://www.msi.com/Laptop"),
      offer("Amazon", "أمازون", 4699, `${AMAZON}MSI+Katana+15`),
      offer("Noon", "نون", 4849, `${NOON}MSI+Katana+15`),
      offer("Jarir", "جرير", 4999, `${JARIR}MSI+Katana+15`),
    ],
    {
      screen: "15.6-inch",
      chip: "Intel Core",
      refreshRate: "144Hz",
    }
  ),

  makeProduct(
    901,
    "MSI Raider 18",
    "MSI Raider 18",
    "MSI",
    "MSI",
    "Laptops",
    "لابتوبات",
    "2TB SSD",
    "32GB",
    [
      offer("MSI", "MSI", 10999, "https://www.msi.com/Laptop"),
      offer("Amazon", "أمازون", 10499, `${AMAZON}MSI+Raider+18`),
      offer("Noon", "نون", 10799, `${NOON}MSI+Raider+18`),
      offer("Jarir", "جرير", 10999, `${JARIR}MSI+Raider+18`),
    ],
    {
      screen: "18-inch",
      chip: "Intel Core Ultra",
      refreshRate: "240Hz",
    }
  ),

  /* ===================================================
     SONY
  =================================================== */

  makeProduct(
    1000,
    "Sony WH-1000XM6",
    "سوني WH-1000XM6",
    "Sony",
    "سوني",
    "Audio",
    "سماعات",
    "—",
    "—",
    [
      offer("Sony", "سوني", 1699, SONY),
      offer("Amazon", "أمازون", 1549, `${AMAZON}Sony+WH-1000XM6`),
      offer("Noon", "نون", 1599, `${NOON}Sony+WH-1000XM6`),
      offer("Jarir", "جرير", 1699, `${JARIR}Sony+WH-1000XM6`),
    ]
  ),

  makeProduct(
    1001,
    "Sony PlayStation 5",
    "بلايستيشن 5",
    "Sony",
    "سوني",
    "Gaming",
    "ألعاب",
    "1TB",
    "—",
    [
      offer("Sony", "سوني", 2299, SONY),
      offer("Amazon", "أمازون", 2099, `${AMAZON}PlayStation+5`),
      offer("Noon", "نون", 2199, `${NOON}PlayStation+5`),
      offer("Jarir", "جرير", 2299, `${JARIR}PlayStation+5`),
    ]
  ),

  /* ===================================================
     LG - TV
  =================================================== */

  makeProduct(
    1100,
    "LG OLED C5 55",
    "LG OLED C5 - 55 بوصة",
    "LG",
    "LG",
    "TV",
    "تلفزيونات",
    "—",
    "—",
    [
      offer("LG", "LG", 5999, LG),
      offer("Amazon", "أمازون", 5499, `${AMAZON}LG+OLED+C5+55`),
      offer("Noon", "نون", 5699, `${NOON}LG+OLED+C5+55`),
      offer("Jarir", "جرير", 5999, `${JARIR}LG+OLED+C5+55`),
    ],
    {
      screen: "55-inch OLED",
      refreshRate: "120Hz",
    }
  ),

  makeProduct(
    1101,
    "LG OLED C5 65",
    "LG OLED C5 - 65 بوصة",
    "LG",
    "LG",
    "TV",
    "تلفزيونات",
    "—",
    "—",
    [
      offer("LG", "LG", 7999, LG),
      offer("Amazon", "أمازون", 7499, `${AMAZON}LG+OLED+C5+65`),
      offer("Noon", "نون", 7699, `${NOON}LG+OLED+C5+65`),
      offer("Jarir", "جرير", 7999, `${JARIR}LG+OLED+C5+65`),
    ],
    {
      screen: "65-inch OLED",
      refreshRate: "120Hz",
    }
  ),

  /* ===================================================
     TCL
  =================================================== */

  makeProduct(
    1200,
    "TCL C7K 55",
    "TCL C7K - 55 بوصة",
    "TCL",
    "TCL",
    "TV",
    "تلفزيونات",
    "—",
    "—",
    [
      offer("TCL", "TCL", 2999, TCL),
      offer("Amazon", "أمازون", 2799, `${AMAZON}TCL+C7K+55`),
      offer("Noon", "نون", 2899, `${NOON}TCL+C7K+55`),
      offer("Jarir", "جرير", 2999, `${JARIR}TCL+C7K+55`),
    ],
    {
      screen: "55-inch QD-Mini LED",
      refreshRate: "144Hz",
    }
  ),

  makeProduct(
    1201,
    "TCL C7K 65",
    "TCL C7K - 65 بوصة",
    "TCL",
    "TCL",
    "TV",
    "تلفزيونات",
    "—",
    "—",
    [
      offer("TCL", "TCL", 3999, TCL),
      offer("Amazon", "أمازون", 3699, `${AMAZON}TCL+C7K+65`),
      offer("Noon", "نون", 3849, `${NOON}TCL+C7K+65`),
      offer("Jarir", "جرير", 3999, `${JARIR}TCL+C7K+65`),
    ],
    {
      screen: "65-inch QD-Mini LED",
      refreshRate: "144Hz",
    }
  ),

  /* ===================================================
     HISENSE
  =================================================== */

  makeProduct(
    1300,
    "Hisense U7 55",
    "هايسنس U7 - 55 بوصة",
    "Hisense",
    "هايسنس",
    "TV",
    "تلفزيونات",
    "—",
    "—",
    [
      offer("Hisense", "هايسنس", 2499, HISENSE),
      offer("Amazon", "أمازون", 2299, `${AMAZON}Hisense+U7+55`),
      offer("Noon", "نون", 2399, `${NOON}Hisense+U7+55`),
      offer("Jarir", "جرير", 2499, `${JARIR}Hisense+U7+55`),
    ],
    {
      screen: "55-inch Mini LED",
      refreshRate: "144Hz",
    }
  ),

  makeProduct(
    1301,
    "Hisense U7 65",
    "هايسنس U7 - 65 بوصة",
    "Hisense",
    "هايسنس",
    "TV",
    "تلفزيونات",
    "—",
    "—",
    [
      offer("Hisense", "هايسنس", 3499, HISENSE),
      offer("Amazon", "أمازون", 3199, `${AMAZON}Hisense+U7+65`),
      offer("Noon", "نون", 3349, `${NOON}Hisense+U7+65`),
      offer("Jarir", "جرير", 3499, `${JARIR}Hisense+U7+65`),
    ],
    {
      screen: "65-inch Mini LED",
      refreshRate: "144Hz",
    }
  ),
];

/* =====================================================
   تصدير
===================================================== */

export default products;