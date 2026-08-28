export type PriceOffer = {
  store: string
  storeAr: string
  price: number | null
  url: string
  available: boolean
  verified: boolean
  checkedAt: string | null
}

export type Product = {
  id: number
  name: string
  nameAr: string
  brand: string
  brandAr: string
  category: string
  categoryAr: string
  memory: string
  storage: string

  battery?: string
  waterResistance?: string
  colors?: string[]
  amazonUrl?: string

  offers: PriceOffer[]
  price: number | null
  prices: number[]
  averagePrice: number | null
  lowestPrice: number | null
  highestPrice: number | null
  fairPrice: number | null
  confidence: number
}