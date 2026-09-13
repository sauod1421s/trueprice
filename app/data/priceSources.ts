export type PriceSource = {
  id: string;
  name: string;
  type: "official" | "market";
  url: string;
};

export const priceSources: PriceSource[] = [
  {
    id: "official",
    name: "المصدر الرسمي",
    type: "official",
    url: "https://www.toyota.com.sa/ar/vehicles",
  },
  {
    id: "motory",
    name: "موتري",
    type: "market",
    url: "https://ksa.motory.com/ar/",
  },
  {
    id: "syarah",
    name: "سيارة",
    type: "market",
    url: "https://syarah.com/",
  },
  {
    id: "hatla2ee",
    name: "هتلاقي",
    type: "market",
    url: "https://ksa.hatla2ee.com/ar/",
  },
];

export type MarketPriceData = {
  model: string;
  year: number;
  trim: string;
  source: "motory" | "syarah" | "hatla2ee";
  price: number;
  url: string;
};

export const marketPrices: MarketPriceData[] = [
  // =====================================================
  // TOYOTA
  // =====================================================

  // Yaris 2026
  {
    model: "Yaris",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 66987,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/يارس/2026/",
  },
  {
    model: "Yaris",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 66360,
    url: "https://syarah.com/en/prices/toyota/yaris/2026",
  },
  {
    model: "Yaris",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 66500,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/yaris",
  },

  // Corolla 2026 - 1.5 XLI
  {
    model: "Corolla",
    year: 2026,
    trim: "1.5 XLI",
    source: "motory",
    price: 82627,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/كورولا/2026/",
  },
  {
    model: "Corolla",
    year: 2026,
    trim: "1.5 XLI",
    source: "syarah",
    price: 75325,
    url: "https://syarah.com/en/prices/toyota/corolla/2026",
  },
  {
    model: "Corolla",
    year: 2026,
    trim: "1.5 XLI",
    source: "syarah",
    price: 77050,
    url: "https://syarah.com/en/prices/toyota/corolla/2026",
  },
  {
    model: "Corolla",
    year: 2026,
    trim: "1.5 XLI",
    source: "hatla2ee",
    price: 84525,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/corolla",
  },

  // Camry 2026
  {
    model: "Camry",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 109825,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/كامري/2026/",
  },
  {
    model: "Camry",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 106950,
    url: "https://syarah.com/en/prices/toyota/camry/2026",
  },
  {
    model: "Camry",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 109825,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/camry",
  },

  // Crown 2026
  {
    model: "Crown",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 158355,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/كراون/2026/",
  },
  {
    model: "Crown",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 132250,
    url: "https://syarah.com/en/prices/toyota/crown/2026",
  },
  {
    model: "Crown",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 158355,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/crown",
  },

  // Raize 2026
  {
    model: "Raize",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 67045,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/رايز/2026/",
  },
  {
    model: "Raize",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 63450,
    url: "https://syarah.com/en/prices/toyota/raize/2026",
  },
  {
    model: "Raize",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 68827,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/raize",
  },

  // Urban Cruiser 2026
  {
    model: "Urban Cruiser",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 82915,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/اوربان-كروزر/2026/",
  },
  {
    model: "Urban Cruiser",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 84250,
    url: "https://syarah.com/en/prices/toyota/urban-cruiser/2026",
  },
  {
    model: "Urban Cruiser",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 84755,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/urban-cruiser",
  },

  // Veloz 2026
  {
    model: "Veloz",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 84007,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/فيلوز/2026/",
  },
  {
    model: "Veloz",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 80050,
    url: "https://syarah.com/en/prices/toyota/veloz/2026",
  },
  {
    model: "Veloz",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 84007,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/veloz",
  },

  // RAV4 2026
  {
    model: "RAV4",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 106662,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/راف-4/2026/",
  },
  {
    model: "RAV4",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 115000,
    url: "https://syarah.com/en/prices/toyota/rav4/2026",
  },
  {
    model: "RAV4",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 106662,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/rav4",
  },

  // Innova 2026
  {
    model: "Innova",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 123740,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/اينوفا/2026/",
  },
  {
    model: "Innova",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 121216,
    url: "https://syarah.com/en/prices/toyota/innova/2026",
  },
  {
    model: "Innova",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 127765,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/innova",
  },

  // Fortuner 2026
  {
    model: "Fortuner",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 128742,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/فورتشنر/2026/",
  },
  {
    model: "Fortuner",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 147905,
    url: "https://syarah.com/en/prices/toyota/fortuner/2026",
  },
  {
    model: "Fortuner",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 128742,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/fortuner",
  },

  // Highlander 2026
  {
    model: "Highlander",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 151455,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/هايلاندر/2026/",
  },
  {
    model: "Highlander",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 157588,
    url: "https://syarah.com/en/prices/toyota/highlander/2026",
  },
  {
    model: "Highlander",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 151455,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/highlander",
  },

  // Prado TX-2 2026
  {
    model: "Prado",
    year: 2026,
    trim: "TX-2",
    source: "motory",
    price: 193775,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/تويوتا/لاند-كروزر-برادو/2026/",
  },
  {
    model: "Prado",
    year: 2026,
    trim: "TX-2",
    source: "syarah",
    price: 208969,
    url: "https://syarah.com/en/prices/toyota/prado/2026",
  },
  {
    model: "Prado",
    year: 2026,
    trim: "TX-2",
    source: "hatla2ee",
    price: 199583,
    url: "https://ksa.hatla2ee.com/ar/car/price/toyota/prado",
  },

  // =====================================================
  // HYUNDAI
  // =====================================================

  // Accent 2026
  {
    model: "Accent",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 69619,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/هيونداي/اكسنت/2026/",
  },
  {
    model: "Accent",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 70150,
    url: "https://syarah.com/en/prices/hyundai/accent/2026",
  },
  {
    model: "Accent",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 71484,
    url: "https://ksa.hatla2ee.com/ar/car/price/hyundai/accent",
  },

  // Elantra 2026
  {
    model: "Elantra",
    year: 2026,
    trim: "1.5 GL",
    source: "motory",
    price: 84454,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/هيونداي/النترا/2026/",
  },
  {
    model: "Elantra",
    year: 2026,
    trim: "1.5 GL",
    source: "syarah",
    price: 86694,
    url: "https://syarah.com/en/prices/hyundai/elantra/2026",
  },
  {
    model: "Elantra",
    year: 2026,
    trim: "1.5 GL",
    source: "hatla2ee",
    price: 86694,
    url: "https://ksa.hatla2ee.com/ar/car/price/hyundai/elantra",
  },

  // Tucson 2026
  {
    model: "Tucson",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 106559,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/هيونداي/توسان/2026/",
  },
  {
    model: "Tucson",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 107704,
    url: "https://syarah.com/en/prices/hyundai/tucson/2026",
  },
  {
    model: "Tucson",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 107704,
    url: "https://ksa.hatla2ee.com/ar/car/price/hyundai/tucson",
  },

  // Creta 2026
  {
    model: "Creta",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 81004,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/هيونداي/كريتا/2026/",
  },
  {
    model: "Creta",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 86200,
    url: "https://syarah.com/en/prices/hyundai/creta/2026",
  },
  {
    model: "Creta",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 86200,
    url: "https://ksa.hatla2ee.com/ar/car/price/hyundai/creta",
  },

  // Sonata 2026
  {
    model: "Sonata",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 104154,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/هيونداي/سوناتا/2026/",
  },
  {
    model: "Sonata",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 107904,
    url: "https://syarah.com/en/prices/hyundai/sonata/2026",
  },
  {
    model: "Sonata",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 107904,
    url: "https://ksa.hatla2ee.com/ar/car/price/hyundai/sonata",
  },

  // Kona 2026
  {
    model: "Kona",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 86290,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/هيونداي/كونا/2026/",
  },
  {
    model: "Kona",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 86290,
    url: "https://syarah.com/en/prices/hyundai/kona/2026",
  },
  {
    model: "Kona",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 86290,
    url: "https://ksa.hatla2ee.com/ar/car/price/hyundai/kona",
  },

  // =====================================================
  // KIA
  // =====================================================

  // K4
  {
    model: "K4",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 86135,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/k4/2026/",
  },
  {
    model: "K4",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 86135,
    url: "https://syarah.com/en/prices/kia/k4/2026",
  },
  {
    model: "K4",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 86135,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/k4",
  },

  // K8
  {
    model: "K8",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 160885,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/k8/2026/",
  },
  {
    model: "K8",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 160885,
    url: "https://syarah.com/en/prices/kia/k8/2026",
  },
  {
    model: "K8",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 160885,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/k8",
  },

  // K5
  {
    model: "K5",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 103385,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/k5/2026/",
  },
  {
    model: "K5",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 103385,
    url: "https://syarah.com/en/prices/kia/k5/2026",
  },
  {
    model: "K5",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 103385,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/k5",
  },

  // Pegas
  {
    model: "Pegas",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 55085,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/بيجاس/2026/",
  },
  {
    model: "Pegas",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 53935,
    url: "https://syarah.com/en/prices/kia/pegas/2026",
  },
  {
    model: "Pegas",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 53935,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/pegas",
  },

  // K3
  {
    model: "K3",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 72335,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/k3/2026/",
  },
  {
    model: "K3",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 72335,
    url: "https://syarah.com/en/prices/kia/k3/2026",
  },
  {
    model: "K3",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 72335,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/k3",
  },

  // Carens
  {
    model: "Carens",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 91885,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/كارينز/2026/",
  },
  {
    model: "Carens",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 91885,
    url: "https://syarah.com/en/prices/kia/carens/2026",
  },
  {
    model: "Carens",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 91885,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/carens",
  },

  // Sportage L
  {
    model: "Sportage L",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 115292,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/سبورتاج/2026/",
  },
  {
    model: "Sportage L",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 103385,
    url: "https://syarah.com/en/prices/kia/sportage/2026",
  },
  {
    model: "Sportage L",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 103385,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/sportage",
  },

  // Sonet
  {
    model: "Sonet",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 74635,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/سونيت/2026/",
  },
  {
    model: "Sonet",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 74635,
    url: "https://syarah.com/en/prices/kia/sonet/2026",
  },
  {
    model: "Sonet",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 74635,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/sonet",
  },

  // Seltos
  {
    model: "Seltos",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 76935,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/كيا/سيلتوس/2026/",
  },
  {
    model: "Seltos",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 76935,
    url: "https://syarah.com/en/prices/kia/seltos/2026",
  },
  {
    model: "Seltos",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 76935,
    url: "https://ksa.hatla2ee.com/ar/car/price/kia/seltos",
  },

  // =====================================================
  // NISSAN
  // =====================================================

  // Magnite
  {
    model: "Magnite",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 70650,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/ماجنايت/2026/",
  },
  {
    model: "Magnite",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 69999,
    url: "https://syarah.com/en/prices/nissan/magnite/2026",
  },
  {
    model: "Magnite",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 69999,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/magnite",
  },

  // X-Trail
  {
    model: "X-Trail",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 104999,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/x-trail/2026/",
  },
  {
    model: "X-Trail",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 104999,
    url: "https://syarah.com/en/prices/nissan/x-trail/2026",
  },
  {
    model: "X-Trail",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 104999,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/x-trail",
  },

  // Altima
  {
    model: "Altima",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 112758,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/التيما/2026/",
  },
  {
    model: "Altima",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 112700,
    url: "https://syarah.com/en/prices/nissan/altima/2026",
  },
  {
    model: "Altima",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 112700,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/altima",
  },

  // X-Terra
  {
    model: "X-Terra",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 119906,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/x-terra/2026/",
  },
  {
    model: "X-Terra",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 118999,
    url: "https://syarah.com/en/prices/nissan/x-terra/2026",
  },
  {
    model: "X-Terra",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 118999,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/x-terra",
  },

  // Pathfinder
  {
    model: "Pathfinder",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 159262,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/pathfinder/2026/",
  },
  {
    model: "Pathfinder",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 164999,
    url: "https://syarah.com/en/prices/nissan/pathfinder/2026",
  },
  {
    model: "Pathfinder",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 164999,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/pathfinder",
  },

  // Patrol
  {
    model: "Patrol",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 270999,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/باترول/2026/",
  },
  {
    model: "Patrol",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 270999,
    url: "https://syarah.com/en/prices/nissan/patrol/2026",
  },
  {
    model: "Patrol",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 270999,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/patrol",
  },

  // Z
  {
    model: "Z",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 261999,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/نيسان/z/2026/",
  },
  {
    model: "Z",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 261999,
    url: "https://syarah.com/en/prices/nissan/z/2026",
  },
  {
    model: "Z",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 261999,
    url: "https://ksa.hatla2ee.com/ar/car/price/nissan/z",
  },

  // =====================================================
  // MG
  // =====================================================

  // MG 5
  {
    model: "MG 5",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 54450,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/mg/mg-5/2026/",
  },
  {
    model: "MG 5",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 54450,
    url: "https://syarah.com/en/prices/mg/mg-5/2026",
  },
  {
    model: "MG 5",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 54450,
    url: "https://ksa.hatla2ee.com/ar/car/price/mg/mg-5",
  },

  // MG 7
  {
    model: "MG 7",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 86650,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/mg/mg-7/2026/",
  },
  {
    model: "MG 7",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 86650,
    url: "https://syarah.com/en/prices/mg/mg-7/2026",
  },
  {
    model: "MG 7",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 86650,
    url: "https://ksa.hatla2ee.com/ar/car/price/mg/mg-7",
  },

  // MG HS
  {
    model: "MG HS",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 85040,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/mg/mg-hs/2026/",
  },
  {
    model: "MG HS",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 85040,
    url: "https://syarah.com/en/prices/mg/hs/2026",
  },
  {
    model: "MG HS",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 85040,
    url: "https://ksa.hatla2ee.com/ar/car/price/mg/hs",
  },

  // MG RX9
  {
    model: "MG RX9",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 116240,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/mg/rx9/2026/",
  },
  {
    model: "MG RX9",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 108765,
    url: "https://syarah.com/en/prices/mg/rx9/2026",
  },
  {
    model: "MG RX9",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 108765,
    url: "https://ksa.hatla2ee.com/ar/car/price/mg/rx9",
  },

  // MG One
  {
    model: "MG One",
    year: 2026,
    trim: "base",
    source: "motory",
    price: 74610,
    url: "https://ksa.motory.com/ar/السيارات-الجديدة/mg/mg-one/2026/",
  },
  {
    model: "MG One",
    year: 2026,
    trim: "base",
    source: "syarah",
    price: 74610,
    url: "https://syarah.com/en/prices/mg/one/2026",
  },
  {
    model: "MG One",
    year: 2026,
    trim: "base",
    source: "hatla2ee",
    price: 74610,
    url: "https://ksa.hatla2ee.com/ar/car/price/mg/one",
  },
];