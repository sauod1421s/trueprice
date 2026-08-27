import type { PriceOffer } from "./types"

export function calculatePrices(offers: PriceOffer[]) {
  const prices = offers
    .filter(
      (offer) =>
        offer.available &&
        offer.verified &&
        typeof offer.price === "number"
    )
    .map((offer) => offer.price as number)

  if (!prices.length) {
    return {
      prices: [],
      lowestPrice: null,
      highestPrice: null,
      averagePrice: null,
      fairPrice: null,
    }
  }

  const sorted = [...prices].sort((a, b) => a - b)

  const averagePrice = Math.round(
    prices.reduce((sum, price) => sum + price, 0) /
      prices.length
  )

  let fairPrice = averagePrice

  if (sorted.length >= 3) {
    const middle = Math.floor(sorted.length / 2)

    fairPrice =
      sorted.length % 2 === 0
        ? Math.round(
            (sorted[middle - 1] + sorted[middle]) / 2
          )
        : sorted[middle]
  }

  return {
    prices,
    lowestPrice: sorted[0],
    highestPrice: sorted[sorted.length - 1],
    averagePrice,
    fairPrice,
  }
}