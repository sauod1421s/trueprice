import { marketPrices } from "./priceSources";

export type FairPriceResult = {
  fairPrice: number | null;
  marketLow: number | null;
  marketHigh: number | null;
  marketAverage: number | null;
  marketCount: number;
  sourceCount: number;
  sources: {
    source: string;
    price: number;
    url: string;
  }[];
  status:
    | "excellent"
    | "fair"
    | "high"
    | "not-enough-data";
  difference: number | null;
  differencePercent: number | null;
};

function roundPrice(price: number) {
  return Math.round(price / 50) * 50;
}

export function calculateFairPrice(
  model: string,
  year: number,
  officialPrice: number,
  trim?: string
): FairPriceResult {
  const prices = marketPrices.filter((item) => {
    const sameModel =
      item.model.trim().toLowerCase() ===
      model.trim().toLowerCase();

    const sameYear = item.year === year;

    const sameTrim =
      !trim ||
      item.trim.trim().toLowerCase() ===
        trim.trim().toLowerCase();

    return sameModel && sameYear && sameTrim;
  });

  const uniqueSources = Array.from(
    new Set(prices.map((item) => item.source))
  );

  /*
   * لا نحسب السعر العادل إلا إذا توفرت
   * 3 مصادر سوقية مستقلة.
   */
  if (uniqueSources.length < 3) {
    return {
      fairPrice: null,
      marketLow: prices.length
        ? Math.min(...prices.map((p) => p.price))
        : null,
      marketHigh: prices.length
        ? Math.max(...prices.map((p) => p.price))
        : null,
      marketAverage: prices.length
        ? Math.round(
            prices.reduce(
              (sum, item) => sum + item.price,
              0
            ) / prices.length
          )
        : null,
      marketCount: prices.length,
      sourceCount: uniqueSources.length,
      sources: prices.map((item) => ({
        source: item.source,
        price: item.price,
        url: item.url,
      })),
      status: "not-enough-data",
      difference: null,
      differencePercent: null,
    };
  }

  const values = prices
    .map((item) => item.price)
    .sort((a, b) => a - b);

  const marketLow = values[0];
  const marketHigh = values[values.length - 1];

  const marketAverage = Math.round(
    values.reduce((sum, value) => sum + value, 0) /
      values.length
  );

  const middle = Math.floor(values.length / 2);

  const median =
    values.length % 2 === 0
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle];

  const fairPrice = roundPrice(median);

  const difference = officialPrice - fairPrice;

  const differencePercent =
    (difference / fairPrice) * 100;

  let status: FairPriceResult["status"];

  if (differencePercent <= -5) {
    status = "excellent";
  } else if (differencePercent <= 5) {
    status = "fair";
  } else {
    status = "high";
  }

  return {
    fairPrice,
    marketLow,
    marketHigh,
    marketAverage,
    marketCount: prices.length,
    sourceCount: uniqueSources.length,
    sources: prices.map((item) => ({
      source: item.source,
      price: item.price,
      url: item.url,
    })),
    status,
    difference,
    differencePercent,
  };
}

export function getFairPriceLabel(
  status: FairPriceResult["status"]
) {
  switch (status) {
    case "excellent":
      return "سعر ممتاز";

    case "fair":
      return "السعر عادل";

    case "high":
      return "أعلى من السعر العادل";

    default:
      return "بيانات السوق غير كافية";
  }
}

export function getFairPriceIcon(
  status: FairPriceResult["status"]
) {
  switch (status) {
    case "excellent":
      return "🟢";

    case "fair":
      return "🟡";

    case "high":
      return "🔴";

    default:
      return "🔵";
  }
}