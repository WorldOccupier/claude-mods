export type RatePoint = { date: string; rate: number }

declare module 'claude-code' {
  interface PluginState {
    'gbp-inr': { rates: RatePoint[] }
  }
}
