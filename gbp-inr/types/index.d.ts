export type RatePoint = { t: number; rate: number }

export type Series = {
  points: RatePoint[]
  price: number
  prevClose: number
  dayHigh: number
  dayLow: number
  yearHigh: number
  yearLow: number
  offset: number
  zone: string
  fetchedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'gbp-inr': { series: Record<string, Series>; range: string }
  }
}
