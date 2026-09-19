// app/data/cars.ts

export type CarModel = {
  name: string;
  year: number;
  price?: number;
  trim?: string;
  engine?: string;
  power?: string;
  fuel?: string;
  sourceName?: string;
  sourceUrl?: string;
};

export type CarBrand = {
  name: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  models: CarModel[];
};

export const brands: Record<string, CarBrand> = {
  // =========================================================
  // TOYOTA
  // =========================================================
  toyota: {
    name: "Toyota",
    description: "أسعار سيارات تويوتا المنشورة في السوق السعودي.",
    sourceName: "Toyota السعودية",
    sourceUrl: "https://www.toyota.com.sa/ar/vehicles",
    models: [
      {
        name: "Yaris",
        year: 2026,
        price: 66987.5,
        engine: "1.3L",
        power: "97 hp",
        fuel: "gasoline",
      },
      {
        name: "Corolla",
        year: 2026,
        price: 82627.5,
        trim: "1.5L XLI",
        engine: "1.5L",
        power: "119 hp",
        fuel: "gasoline",
      },
      {
        name: "Camry",
        year: 2026,
        price: 109825,
        engine: "2.5L",
        fuel: "gasoline/hybrid",
      },
      {
        name: "Crown",
        year: 2026,
        price: 158355,
        fuel: "hybrid",
      },
      {
        name: "GR86",
        year: 2026,
        price: 147487.5,
        fuel: "gasoline",
      },
      {
        name: "Supra",
        year: 2026,
        price: 278760,
        fuel: "gasoline",
      },
      {
        name: "Raize",
        year: 2026,
        price: 68827.5,
        fuel: "gasoline",
      },
      {
        name: "Urban Cruiser",
        year: 2026,
        price: 84755,
        fuel: "gasoline",
      },
      {
        name: "Veloz",
        year: 2026,
        price: 84007.5,
        fuel: "gasoline",
      },
      {
        name: "Corolla Cross",
        year: 2025,
        price: 103845,
        fuel: "gasoline",
      },
      {
        name: "RAV4",
        year: 2026,
        price: 106662.5,
        fuel: "gasoline",
      },
      {
        name: "Innova",
        year: 2026,
        price: 127765,
        fuel: "gasoline",
      },
      {
        name: "Land Cruiser Hardtop",
        year: 2026,
        price: 158240,
        fuel: "gasoline",
      },
      {
        name: "Fortuner",
        year: 2026,
        price: 128742.5,
        fuel: "gasoline",
      },
      {
        name: "Highlander",
        year: 2026,
        price: 151455,
        fuel: "gasoline",
      },
      {
        name: "Prado",
        year: 2026,
        price: 199582.5,
        trim: "TX-2",
        engine: "2.4L turbo",
        power: "267 hp",
        fuel: "gasoline",
      },
      {
        name: "Land Cruiser",
        year: 2026,
        price: 263407.5,
        fuel: "gasoline",
      },
      {
        name: "LC300 HEV MAX",
        year: 2026,
        price: 334535,
        fuel: "hybrid",
      },

      { name: "Corolla Hybrid", year: 2026 },
      { name: "Corolla Executive", year: 2026 },
      { name: "Camry Hybrid", year: 2026 },
      { name: "Land Cruiser 70", year: 2026 },
      { name: "Land Cruiser 300", year: 2026 },
      { name: "Hilux", year: 2026 },
      { name: "Hiace", year: 2026 },
      { name: "Coaster", year: 2026 },
    ],
  },

  // =========================================================
  // HYUNDAI
  // =========================================================
  hyundai: {
    name: "Hyundai",
    description:
      "أسعار هيونداي المنشورة من موزعيها المعتمدين في السعودية.",
    sourceName: "موزعو هيونداي في السعودية",
    sourceUrl: "https://hyundaiksa.com/",
    models: [
      {
        name: "Accent",
        year: 2026,
        price: 71484,
        engine: "1.5L",
        power: "113 hp",
        fuel: "gasoline",
      },
      {
        name: "Elantra",
        year: 2026,
        price: 86694,
        trim: "1.5 GL",
        engine: "1.5L",
        power: "157 hp",
        fuel: "gasoline",
      },
      {
        name: "Tucson",
        year: 2026,
        price: 107704,
        engine: "1.6L turbo",
        power: "178 hp",
        fuel: "gasoline",
      },
      {
        name: "Creta",
        year: 2026,
        price: 86200,
        engine: "1.5L turbo",
        power: "160 hp",
        fuel: "gasoline",
      },
      {
        name: "Sonata",
        year: 2026,
        price: 107904,
        engine: "2.5L turbo",
        power: "290 hp",
        fuel: "gasoline",
      },
      {
        name: "Kona",
        year: 2026,
        price: 86290,
        engine: "2.0L",
        power: "195 hp",
        fuel: "gasoline",
      },
      {
        name: "Palisade",
        year: 2026,
        price: 177039,
        engine: "2.5L turbo",
        power: "277 hp",
        fuel: "gasoline",
      },
      {
        name: "Staria Premium",
        year: 2026,
        price: 177447,
        engine: "3.5L",
        power: "268 hp",
        fuel: "gasoline",
      },

      { name: "Santa Fe", year: 2026 },
      { name: "Santa Cruz", year: 2026 },
      { name: "Ioniq 5", year: 2026 },
      { name: "Ioniq 6", year: 2026 },
      { name: "Tucson Hybrid", year: 2026 },
      { name: "Palisade Hybrid", year: 2026 },
      { name: "Staria", year: 2026 },
      { name: "H-1", year: 2026 },
    ],
  },

  // =========================================================
  // KIA
  // =========================================================
  kia: {
    name: "Kia",
    description: "أسعار كيا المنشورة من موزع كيا في السعودية.",
    sourceName: "كيا الجبر",
    sourceUrl: "https://www.kia.com/aljabr/ar/",
    models: [
      { name: "K4", year: 2026, price: 86135, fuel: "gasoline" },
      { name: "K8", year: 2026, price: 160885, fuel: "gasoline" },
      { name: "K5", year: 2026, price: 103385, fuel: "gasoline" },
      { name: "Pegas", year: 2026, price: 53935, fuel: "gasoline" },
      { name: "K3", year: 2026, price: 72335, fuel: "gasoline" },
      { name: "Carens", year: 2026, price: 91885, fuel: "gasoline" },
      { name: "Sportage L", year: 2026, price: 103385, fuel: "gasoline" },
      { name: "Sonet", year: 2026, price: 74635, fuel: "gasoline" },
      { name: "Seltos", year: 2026, price: 76935, fuel: "gasoline" },
      { name: "Carnival", year: 2026, price: 149385, fuel: "gasoline" },
      { name: "Telluride", year: 2026, price: 160885, fuel: "gasoline" },

      { name: "Sorento", year: 2026 },
      { name: "Sorento Hybrid", year: 2026 },
      { name: "EV3", year: 2026 },
      { name: "EV6", year: 2026 },
      { name: "EV9", year: 2026 },
      { name: "Stinger", year: 2026 },
    ],
  },

  // =========================================================
  // NISSAN
  // =========================================================
  nissan: {
    name: "Nissan",
    description: "أسعار سيارات نيسان المنشورة في السوق السعودي.",
    sourceName: "نيسان السعودية",
    sourceUrl: "https://ar.nissan-saudiarabia.com/vehicles/new.html",
    models: [
      { name: "Magnite", year: 2026, price: 69999, fuel: "gasoline" },
      { name: "Kicks", year: 2026, price: 89599, fuel: "gasoline" },
      { name: "X-Trail", year: 2026, price: 104999, fuel: "gasoline" },
      { name: "Altima", year: 2026, price: 112700, fuel: "gasoline" },
      { name: "X-Terra", year: 2026, price: 118999, fuel: "gasoline" },
      { name: "Pathfinder", year: 2026, price: 164999, fuel: "gasoline" },
      { name: "Patrol", year: 2026, price: 270999, fuel: "gasoline" },
      { name: "Patrol PRO-4X", year: 2026, price: 380999, fuel: "gasoline" },
      { name: "Patrol NISMO", year: 2026, price: 450999, fuel: "gasoline" },
      { name: "Z", year: 2026, price: 261999, fuel: "gasoline" },

      { name: "Sunny", year: 2026 },
      { name: "Sentra", year: 2026 },
      { name: "Murano", year: 2026 },
      { name: "Armada", year: 2026 },
      { name: "Navara", year: 2026 },
    ],
  },

  // =========================================================
  // MG
  // =========================================================
  mg: {
    name: "MG",
    description: "أسعار سيارات MG المنشورة في السوق السعودي.",
    sourceName: "MG السعودية",
    sourceUrl: "https://www.mg-sa.com/ar/",
    models: [
      {
        name: "MG 5",
        year: 2026,
        price: 54450,
        engine: "1.5L",
        power: "110 hp",
        fuel: "gasoline",
      },
      {
        name: "MG 7",
        year: 2026,
        price: 86650,
        engine: "2.0L turbo",
        power: "261 hp",
        fuel: "gasoline",
      },
      {
        name: "MG HS",
        year: 2026,
        price: 85040,
        engine: "2.0L turbo",
        fuel: "gasoline",
      },
      {
        name: "MG HS Hybrid+",
        year: 2026,
        price: 116089,
        power: "221 hp",
        fuel: "hybrid",
      },
      {
        name: "MG RX9",
        year: 2026,
        price: 108765,
        engine: "2.0L turbo",
        fuel: "gasoline",
      },
      {
        name: "MG One",
        year: 2026,
        price: 74610,
        engine: "1.5L turbo",
        power: "168 hp",
        fuel: "gasoline",
      },

      { name: "MG 3", year: 2026 },
      { name: "MG GT", year: 2026 },
      { name: "MG ZS", year: 2026 },
      { name: "MG ZS EV", year: 2026 },
      { name: "MG Whale", year: 2026 },
    ],
  },

  // =========================================================
  // FORD
  // =========================================================
  ford: {
    name: "Ford",
    description: "سيارات فورد المتاحة في السوق السعودي.",
    sourceName: "Ford السعودية",
    sourceUrl: "https://www.me.ford.com/sa/",
    models: [
      { name: "Territory", year: 2026, price: 98175 },
      { name: "Taurus", year: 2026 },
      { name: "Everest", year: 2026 },
      { name: "Explorer", year: 2026, price: 230000 },
      { name: "Expedition", year: 2026, price: 244950 },
      { name: "Bronco", year: 2026, price: 230000 },
      { name: "Mustang", year: 2026 },
      { name: "F-150", year: 2026 },
      { name: "Ranger", year: 2026 },
      { name: "Transit", year: 2026 },
    ],
  },

  // =========================================================
  // HONDA
  // =========================================================
  honda: {
    name: "Honda",
    description: "سيارات هوندا المتاحة في السوق السعودي.",
    sourceName: "Honda السعودية",
    sourceUrl: "https://honda-mideast.com/sa/",
    models: [
      { name: "City", year: 2026, price: 70725 },
      { name: "Civic", year: 2026 },
      { name: "Accord", year: 2026, price: 133285 },
      { name: "HR-V", year: 2026, price: 91885 },
      { name: "CR-V", year: 2026, price: 149385 },
      { name: "Pilot", year: 2026, price: 209300 },
      { name: "Odyssey", year: 2026, price: 189635 },
      { name: "ZR-V", year: 2026 },
    ],
  },

  // =========================================================
  // MAZDA
  // =========================================================
  mazda: {
    name: "Mazda",
    description: "سيارات مازدا المتاحة في السوق السعودي.",
    sourceName: "Mazda السعودية",
    sourceUrl: "https://www.mazda.com.sa/",
    models: [
      { name: "Mazda 2", year: 2026 },
      { name: "Mazda 3", year: 2026 },
      { name: "Mazda 6", year: 2026 },
      { name: "CX-3", year: 2026 },
      { name: "CX-30", year: 2026 },
      { name: "CX-5", year: 2026 },
      { name: "CX-60", year: 2026 },
      { name: "CX-90", year: 2026 },
      { name: "BT-50", year: 2026 },
    ],
  },

  // =========================================================
  // SUZUKI
  // =========================================================
  suzuki: {
    name: "Suzuki",
    description: "سيارات سوزوكي المتاحة في السوق السعودي.",
    sourceName: "Suzuki السعودية",
    sourceUrl: "https://suzuki.sa/",
    models: [
      { name: "Swift", year: 2026 },
      { name: "Dzire", year: 2026, price: 57385 },
      { name: "Baleno", year: 2026, price: 72450 },
      { name: "Ciaz", year: 2026 },
      { name: "Fronx", year: 2026, price: 69000 },
      { name: "Jimny", year: 2026, price: 85215 },
      { name: "Ertiga", year: 2026, price: 73600 },
      { name: "XL7", year: 2026 },
      { name: "Grand Vitara", year: 2026, price: 79235 },
    ],
  },

  // =========================================================
  // ISUZU
  // =========================================================
  isuzu: {
    name: "Isuzu",
    description: "سيارات وشاحنات إيسوزو المتاحة في السوق السعودي.",
    sourceName: "Isuzu السعودية",
    sourceUrl: "https://www.isuzu.com.sa/",
    models: [
      { name: "D-Max", year: 2026 },
      { name: "MU-X", year: 2026 },
      { name: "N-Series", year: 2026 },
      { name: "F-Series", year: 2026 },
      { name: "Giga", year: 2026 },
    ],
  },

  // =========================================================
  // CHANGAN
  // =========================================================
  changan: {
    name: "Changan",
    description: "سيارات شانجان المتاحة في السوق السعودي.",
    sourceName: "Changan السعودية",
    sourceUrl: "https://changan.sa/",
    models: [
      { name: "Alsvin", year: 2026 },
      { name: "Eado Plus", year: 2026, price: 69500 },
      { name: "CS35 Plus", year: 2026, price: 70900 },
      { name: "CS55 Plus", year: 2026 },
      { name: "CS75 Plus", year: 2026, price: 102250 },
      { name: "CS95", year: 2026, price: 116600 },
      { name: "UNI-T", year: 2026 },
      { name: "UNI-V", year: 2026, price: 91200 },
      { name: "UNI-K", year: 2026 },
      { name: "UNI-S", year: 2026, price: 93725 },
    ],
  },

  // =========================================================
  // GEELY
  // =========================================================
  geely: {
    name: "Geely",
    description: "سيارات جيلي المتاحة في السوق السعودي.",
    sourceName: "Geely السعودية",
    sourceUrl: "https://geelyksa.com/",
    models: [
      { name: "Emgrand", year: 2026 },
      { name: "Coolray", year: 2026 },
      { name: "Monjaro", year: 2026 },
      { name: "Okavango", year: 2026 },
      { name: "Starray", year: 2026 },
      { name: "Tugella", year: 2026 },
      { name: "Geometry C", year: 2026 },
      { name: "EX5", year: 2026 },
    ],
  },

  // =========================================================
  // GAC
  // =========================================================
  gac: {
    name: "GAC",
    description: "سيارات GAC المتاحة في السوق السعودي.",
    sourceName: "GAC السعودية",
    sourceUrl: "https://gac-motor.sa/",
    models: [
      { name: "Empow", year: 2026 },
      { name: "Emzoom", year: 2026 },
      { name: "Emkoo", year: 2026 },
      { name: "GS3", year: 2026 },
      { name: "GS4", year: 2026 },
      { name: "GS8", year: 2026 },
      { name: "M8", year: 2026 },
      { name: "Aion Y", year: 2026 },
      { name: "Aion V", year: 2026 },
    ],
  },

  // =========================================================
  // HAVAL
  // =========================================================
  haval: {
    name: "Haval",
    description: "سيارات هافال المتاحة في السوق السعودي.",
    sourceName: "Haval السعودية",
    sourceUrl: "https://haval.sa/",
    models: [
      { name: "Jolion", year: 2026 },
      { name: "Jolion Pro", year: 2026 },
      { name: "H6", year: 2026 },
      { name: "H6 GT", year: 2026 },
      { name: "H9", year: 2026 },
      { name: "Dargo", year: 2026 },
      { name: "Dargo X", year: 2026 },
    ],
  },

  // =========================================================
  // JETOUR
  // =========================================================
  jetour: {
    name: "Jetour",
    description: "سيارات جيتور المتاحة في السوق السعودي.",
    sourceName: "Jetour السعودية",
    sourceUrl: "https://jetour.sa/",
    models: [
      { name: "X50", year: 2026 },
      { name: "X70", year: 2026 },
      { name: "X70 Plus", year: 2026 },
      { name: "X90 Plus", year: 2026 },
      { name: "Dashing", year: 2026 },
      { name: "X90", year: 2026 },
      { name: "T2", year: 2026 },
      { name: "T2 i-DM", year: 2026 },
    ],
  },

  // =========================================================
  // CHERY
  // =========================================================
  chery: {
    name: "Chery",
    description: "سيارات شيري المتاحة في السوق السعودي.",
    sourceName: "Chery السعودية",
    sourceUrl: "https://cheryksa.com/",
    models: [
      { name: "Arrizo 5", year: 2026 },
      { name: "Arrizo 6 Pro", year: 2026 },
      { name: "Tiggo 4 Pro", year: 2026 },
      { name: "Tiggo 7 Pro", year: 2026 },
      { name: "Tiggo 8 Pro", year: 2026 },
      { name: "Tiggo 8 Pro Max", year: 2026 },
      { name: "Tiggo 9", year: 2026 },
    ],
  },

  // =========================================================
  // CHEVROLET
  // =========================================================
  chevrolet: {
    name: "Chevrolet",
    description: "سيارات شفروليه المتاحة في السوق السعودي.",
    sourceName: "Chevrolet السعودية",
    sourceUrl: "https://www.chevroletarabia.com/sa-ar",
    models: [
      { name: "Groove", year: 2026 },
      { name: "Captiva", year: 2026 },
      { name: "Equinox", year: 2026 },
      { name: "Traverse", year: 2026 },
      { name: "Tahoe", year: 2026 },
      { name: "Suburban", year: 2026 },
      { name: "Trailblazer", year: 2026 },
      { name: "Blazer", year: 2026 },
      { name: "Silverado", year: 2026 },
      { name: "Corvette", year: 2026 },
      { name: "Camaro", year: 2026 },
    ],
  },

  // =========================================================
  // GMC
  // =========================================================
  gmc: {
    name: "GMC",
    description: "سيارات GMC المتاحة في السوق السعودي.",
    sourceName: "GMC السعودية",
    sourceUrl: "https://www.gmcarabia.com/sa-ar",
    models: [
      { name: "Terrain", year: 2026 },
      { name: "Acadia", year: 2026 },
      { name: "Yukon", year: 2026 },
      { name: "Yukon XL", year: 2026 },
      { name: "Sierra", year: 2026 },
      { name: "Canyon", year: 2026 },
      { name: "Hummer EV", year: 2026 },
    ],
  },

  // =========================================================
  // MITSUBISHI
  // =========================================================
  mitsubishi: {
    name: "Mitsubishi",
    description: "سيارات ميتسوبيشي المتاحة في السوق السعودي.",
    sourceName: "Mitsubishi السعودية",
    sourceUrl: "https://www.mitsubishi-motors.com.sa/",
    models: [
      { name: "Attrage", year: 2026 },
      { name: "ASX", year: 2026 },
      { name: "Outlander", year: 2026 },
      { name: "Outlander Sport", year: 2026 },
      { name: "Pajero Sport", year: 2026 },
      { name: "Montero Sport", year: 2026 },
      { name: "L200", year: 2026 },
    ],
  },

  // =========================================================
  // JEEP
  // =========================================================
  jeep: {
    name: "Jeep",
    description: "سيارات جيب المتاحة في السوق السعودي.",
    sourceName: "Jeep السعودية",
    sourceUrl: "https://www.jeep.com/sa/",
    models: [
      { name: "Renegade", year: 2026 },
      { name: "Compass", year: 2026 },
      { name: "Cherokee", year: 2026 },
      { name: "Grand Cherokee", year: 2026 },
      { name: "Wrangler", year: 2026 },
      { name: "Gladiator", year: 2026 },
      { name: "Wagoneer", year: 2026 },
      { name: "Grand Wagoneer", year: 2026 },
    ],
  },

  // =========================================================
  // LEXUS
  // =========================================================
  lexus: {
    name: "Lexus",
    description: "سيارات لكزس المتاحة في السوق السعودي.",
    sourceName: "Lexus السعودية",
    sourceUrl: "https://www.lexus.com.sa/",
    models: [
      { name: "IS", year: 2026 },
      { name: "ES", year: 2026 },
      { name: "LS", year: 2026 },
      { name: "UX", year: 2026 },
      { name: "NX", year: 2026 },
      { name: "RX", year: 2026 },
      { name: "GX", year: 2026 },
      { name: "LX", year: 2026 },
      { name: "LM", year: 2026 },
      { name: "LBX", year: 2026 },
    ],
  },

  // =========================================================
  // BMW
  // =========================================================
  bmw: {
    name: "BMW",
    description: "سيارات BMW المتاحة في السوق السعودي.",
    sourceName: "BMW السعودية",
    sourceUrl: "https://www.bmw-saudiarabia.com/",
    models: [
      { name: "2 Series", year: 2026 },
      { name: "3 Series", year: 2026 },
      { name: "4 Series", year: 2026 },
      { name: "5 Series", year: 2026 },
      { name: "7 Series", year: 2026 },
      { name: "X1", year: 2026 },
      { name: "X2", year: 2026 },
      { name: "X3", year: 2026 },
      { name: "X5", year: 2026 },
      { name: "X6", year: 2026 },
      { name: "X7", year: 2026 },
      { name: "i4", year: 2026 },
      { name: "i5", year: 2026 },
      { name: "i7", year: 2026 },
      { name: "iX", year: 2026 },
    ],
  },

  // =========================================================
  // MERCEDES-BENZ
  // =========================================================
  mercedes: {
    name: "Mercedes-Benz",
    description: "سيارات مرسيدس-بنز المتاحة في السوق السعودي.",
    sourceName: "Mercedes-Benz السعودية",
    sourceUrl: "https://www.mercedes-benz-mena.com/sa/en/",
    models: [
      { name: "A-Class", year: 2026 },
      { name: "C-Class", year: 2026 },
      { name: "E-Class", year: 2026 },
      { name: "S-Class", year: 2026 },
      { name: "CLA", year: 2026 },
      { name: "GLA", year: 2026 },
      { name: "GLB", year: 2026 },
      { name: "GLC", year: 2026 },
      { name: "GLE", year: 2026 },
      { name: "GLS", year: 2026 },
      { name: "G-Class", year: 2026 },
      { name: "EQS", year: 2026 },
      { name: "EQE", year: 2026 },
    ],
  },

  // =========================================================
  // AUDI
  // =========================================================
  audi: {
    name: "Audi",
    description: "سيارات أودي المتاحة في السوق السعودي.",
    sourceName: "Audi السعودية",
    sourceUrl: "https://www.audi-saudiarabia.com/",
    models: [
      { name: "A3", year: 2026 },
      { name: "A4", year: 2026 },
      { name: "A5", year: 2026 },
      { name: "A6", year: 2026 },
      { name: "A8", year: 2026 },
      { name: "Q2", year: 2026 },
      { name: "Q3", year: 2026 },
      { name: "Q5", year: 2026 },
      { name: "Q7", year: 2026 },
      { name: "Q8", year: 2026 },
      { name: "e-tron", year: 2026 },
    ],
  },

  // =========================================================
  // VOLKSWAGEN
  // =========================================================
  volkswagen: {
    name: "Volkswagen",
    description: "سيارات فولكس واجن المتاحة في السوق السعودي.",
    sourceName: "Volkswagen السعودية",
    sourceUrl: "https://www.volkswagen-me.com/",
    models: [
      { name: "Golf", year: 2026 },
      { name: "Jetta", year: 2026 },
      { name: "Passat", year: 2026 },
      { name: "Tiguan", year: 2026 },
      { name: "Touareg", year: 2026 },
      { name: "Teramont", year: 2026 },
      { name: "ID.4", year: 2026 },
      { name: "ID.7", year: 2026 },
    ],
  },

  // =========================================================
  // BYD
  // =========================================================
  byd: {
    name: "BYD",
    description: "سيارات BYD المتاحة في السوق السعودي.",
    sourceName: "BYD السعودية",
    sourceUrl: "https://www.byd.sa/",
    models: [
      { name: "Atto 3", year: 2026 },
      { name: "Seal", year: 2026 },
      { name: "Han", year: 2026 },
      { name: "Song Plus", year: 2026 },
      { name: "Qin Plus", year: 2026 },
      { name: "Song Plus DM-i", year: 2026 },
      { name: "Seagull", year: 2026 },
      { name: "Dolphin", year: 2026 },
    ],
  },

  // =========================================================
  // EXEED
  // =========================================================
  exeed: {
    name: "Exeed",
    description: "سيارات Exeed المتاحة في السوق السعودي.",
    sourceName: "Exeed السعودية",
    sourceUrl: "https://exeed-sa.com/",
    models: [
      { name: "LX", year: 2026 },
      { name: "TXL", year: 2026 },
      { name: "VX", year: 2026 },
      { name: "RX", year: 2026 },
      { name: "ES", year: 2026 },
    ],
  },

  // =========================================================
  // HONGQI
  // =========================================================
  hongqi: {
    name: "Hongqi",
    description: "سيارات هونشي المتاحة في السوق السعودي.",
    sourceName: "Hongqi السعودية",
    sourceUrl: "https://hongqi.sa/",
    models: [
      { name: "H5", year: 2026 },
      { name: "H6", year: 2026 },
      { name: "H9", year: 2026 },
      { name: "HS3", year: 2026 },
      { name: "HS5", year: 2026 },
      { name: "HS7", year: 2026 },
      { name: "E-HS9", year: 2026 },
    ],
  },

  // =========================================================
  // GREAT WALL
  // =========================================================
  greatwall: {
    name: "Great Wall",
    description: "سيارات جريت وول المتاحة في السوق السعودي.",
    sourceName: "Great Wall السعودية",
    sourceUrl: "https://gwm.sa/",
    models: [
      { name: "Poer", year: 2026 },
      { name: "Poer King Kong", year: 2026 },
      { name: "Wingle", year: 2026 },
      { name: "Tank 300", year: 2026 },
      { name: "Tank 500", year: 2026 },
      { name: "Tank 700", year: 2026 },
    ],
  },

  // =========================================================
  // TANK
  // =========================================================
  tank: {
    name: "Tank",
    description: "سيارات Tank المتاحة في السوق السعودي.",
    sourceName: "Tank السعودية",
    sourceUrl: "https://gwm.sa/",
    models: [
      { name: "Tank 300", year: 2026 },
      { name: "Tank 500", year: 2026 },
      { name: "Tank 700", year: 2026 },
      { name: "Tank 800", year: 2026 },
    ],
  },

  // =========================================================
  // JAC
  // =========================================================
  jac: {
    name: "JAC",
    description: "سيارات JAC المتاحة في السوق السعودي.",
    sourceName: "JAC السعودية",
    sourceUrl: "https://jac-saudi.com/",
    models: [
      { name: "JS3", year: 2026 },
      { name: "JS4", year: 2026 },
      { name: "JS6", year: 2026 },
      { name: "JS8", year: 2026 },
      { name: "T8", year: 2026 },
      { name: "T9", year: 2026 },
      { name: "X200", year: 2026 },
    ],
  },

  // =========================================================
  // MAHINDRA
  // =========================================================
  mahindra: {
    name: "Mahindra",
    description: "سيارات ماهيندرا المتاحة في السوق السعودي.",
    sourceName: "Mahindra السعودية",
    sourceUrl: "https://mahindra.com.sa/",
    models: [
      { name: "XUV700", year: 2026 },
      { name: "Scorpio", year: 2026 },
      { name: "Scorpio-N", year: 2026 },
      { name: "Thar", year: 2026 },
      { name: "Pik Up", year: 2026 },
    ],
  },

  // =========================================================
  // RENAULT
  // =========================================================
  renault: {
    name: "Renault",
    description: "سيارات رينو المتاحة في السوق السعودي.",
    sourceName: "Renault السعودية",
    sourceUrl: "https://www.renault.sa/",
    models: [
      { name: "Symbol", year: 2026 },
      { name: "Duster", year: 2026 },
      { name: "Koleos", year: 2026 },
      { name: "Arkana", year: 2026 },
      { name: "Megane", year: 2026 },
      { name: "Master", year: 2026 },
      { name: "Express", year: 2026 },
    ],
  },

  // =========================================================
  // PEUGEOT
  // =========================================================
  peugeot: {
    name: "Peugeot",
    description: "سيارات بيجو المتاحة في السوق السعودي.",
    sourceName: "Peugeot السعودية",
    sourceUrl: "https://www.peugeot-saudi.com/",
    models: [
      { name: "208", year: 2026 },
      { name: "2008", year: 2026 },
      { name: "3008", year: 2026 },
      { name: "5008", year: 2026 },
      { name: "408", year: 2026 },
      { name: "508", year: 2026 },
      { name: "Partner", year: 2026 },
    ],
  },

  // =========================================================
  // LAND ROVER
  // =========================================================
  landrover: {
    name: "Land Rover",
    description: "سيارات لاند روفر المتاحة في السوق السعودي.",
    sourceName: "Land Rover السعودية",
    sourceUrl: "https://www.landrover-saudi.com/",
    models: [
      { name: "Range Rover", year: 2026 },
      { name: "Range Rover Sport", year: 2026 },
      { name: "Range Rover Velar", year: 2026 },
      { name: "Range Rover Evoque", year: 2026 },
      { name: "Defender", year: 2026 },
      { name: "Discovery", year: 2026 },
      { name: "Discovery Sport", year: 2026 },
    ],
  },

  // =========================================================
  // VOLVO
  // =========================================================
  volvo: {
    name: "Volvo",
    description: "سيارات فولفو المتاحة في السوق السعودي.",
    sourceName: "Volvo السعودية",
    sourceUrl: "https://www.volvocars.com/sa/",
    models: [
      { name: "S60", year: 2026 },
      { name: "S90", year: 2026 },
      { name: "XC40", year: 2026 },
      { name: "XC60", year: 2026 },
      { name: "XC90", year: 2026 },
      { name: "EX30", year: 2026 },
      { name: "EX40", year: 2026 },
      { name: "EX90", year: 2026 },
    ],
  },

  // =========================================================
  // PORSCHE
  // =========================================================
  porsche: {
    name: "Porsche",
    description: "سيارات بورشه المتاحة في السوق السعودي.",
    sourceName: "Porsche السعودية",
    sourceUrl: "https://www.porsche.com/middle-east/_sa/",
    models: [
      { name: "718 Cayman", year: 2026 },
      { name: "718 Boxster", year: 2026 },
      { name: "911", year: 2026 },
      { name: "Taycan", year: 2026 },
      { name: "Panamera", year: 2026 },
      { name: "Macan", year: 2026 },
      { name: "Cayenne", year: 2026 },
    ],
  },

  // =========================================================
  // TESLA
  // =========================================================
  tesla: {
    name: "Tesla",
    description: "سيارات Tesla المتاحة في السوق السعودي.",
    sourceName: "Tesla السعودية",
    sourceUrl: "https://www.tesla.com/",
    models: [
      { name: "Model 3", year: 2026 },
      { name: "Model Y", year: 2026 },
      { name: "Model S", year: 2026 },
      { name: "Model X", year: 2026 },
      { name: "Cybertruck", year: 2026 },
    ],
  },

  // =========================================================
  // LUCID
  // =========================================================
  lucid: {
    name: "Lucid",
    description: "سيارات Lucid المتاحة في السوق السعودي.",
    sourceName: "Lucid السعودية",
    sourceUrl: "https://lucidmotors.com/",
    models: [
      { name: "Air", year: 2026 },
      { name: "Gravity", year: 2026 },
    ],
  },

  // =========================================================
  // GENESIS
  // =========================================================
  genesis: {
    name: "Genesis",
    description: "سيارات جينيسيس المتاحة في السوق السعودي.",
    sourceName: "Genesis السعودية",
    sourceUrl: "https://www.genesis.com/sa/en/",
    models: [
      { name: "G70", year: 2026 },
      { name: "G80", year: 2026 },
      { name: "G90", year: 2026 },
      { name: "GV60", year: 2026 },
      { name: "GV70", year: 2026 },
      { name: "GV80", year: 2026 },
      { name: "GV80 Coupe", year: 2026 },
    ],
  },
};

export default brands;