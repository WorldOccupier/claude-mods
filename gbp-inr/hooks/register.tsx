import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RatePoint } from '../types'

const PANE = 'gbp-inr'
const DAYS = 90
const EVERY_MS = 30 * 60_000
const DAY_MS = 24 * 60 * 60_000
const BARS = '▁▂▃▄▅▆▇█'

const rates = atom({ plugin: 'gbp-inr', key: 'rates' } as const, [])

const rangeUrl = (now: number) => {
  const from = new Date(now - DAYS * DAY_MS).toISOString().slice(0, 10)
  const to = new Date(now).toISOString().slice(0, 10)

  return `https://api.frankfurter.dev/v1/${from}..${to}?base=GBP&symbols=INR`
}

function svgChart(points: RatePoint[]): string {
  const W = 480
  const H = 240
  const P = 36
  const values = points.map(point => point.rate)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => P + (i / Math.max(1, points.length - 1)) * (W - 2 * P)
  const y = (rate: number) => H - P - ((rate - lo) / span) * (H - 2 * P)
  const line = points.map((point, i) => `${x(i).toFixed(1)},${y(point.rate).toFixed(1)}`).join(' ')
  const first = points[0].date
  const last = points[points.length - 1].date

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#888" stroke-opacity="0.4"/>
  <polyline points="${line}" fill="none" stroke="#2563eb" stroke-width="2"/>
  <text x="${P}" y="${P - 10}" font-size="12" fill="#888">${hi.toFixed(2)}</text>
  <text x="${P}" y="${H - P + 16}" font-size="12" fill="#888">${lo.toFixed(2)}</text>
  <text x="${P}" y="${H - 6}" font-size="11" fill="#888">${first}</text>
  <text x="${W - P}" y="${H - 6}" font-size="11" fill="#888" text-anchor="end">${last}</text>
</svg>`
}

function sparkline(points: RatePoint[], width: number): string {
  const shown = points.slice(-width)
  const values = shown.map(point => point.rate)
  const lo = Math.min(...values)
  const span = Math.max(...values) - lo || 1

  return shown.map(point => BARS[Math.round(((point.rate - lo) / span) * (BARS.length - 1))]).join('')
}

export const register: Register = on => {
  let stop: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gbp-inr',
      description: 'Show the GBP to INR rate history in a pane',
    })
    void $.ui.open({ id: PANE, title: 'GBP → INR' })

    const load = async () => {
      const ran = await $.process.run(['curl', '-fsS', '--max-time', '20', rangeUrl(await $.clock.now())], { timeoutMs: 30000 })
      if (ran.exitCode !== 0) return

      const byDate = JSON.parse(ran.stdout)?.rates ?? {}
      const series = Object.keys(byDate)
        .sort()
        .filter(date => typeof byDate[date]?.INR === 'number')
        .map(date => ({ date, rate: byDate[date].INR }))
      if (series.length === 0) return

      await update($, rates, () => series)
    }

    void load()
    stop = $.clock.every(EVERY_MS, () => void load())

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stop?.()
    stop = undefined

    return next(e)
  })

  on('command.run', { command: 'gbp-inr' }, async $ => {
    await $.ui.open({ id: PANE, title: 'GBP → INR' })

    return { text: 'GBP → INR pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const points = await read($, rates)

    if (points.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Loading rate history…</Text>
        </Box>
      )
    }

    const first = points[0]
    const last = points[points.length - 1]
    const change = last.rate - first.rate
    const sign = change >= 0 ? '+' : ''
    const summary = `1 GBP = ${last.rate.toFixed(2)} INR on ${last.date}  (${sign}${change.toFixed(2)} since ${first.date})`

    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Svg } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text>{summary}</Text>
          <Svg source={svgChart(points)} alt={`GBP to INR, ${points.length} days, latest ${last.rate.toFixed(2)}`} />
        </Box>
      )
    }

    const width = Math.max(10, (e.viewport?.columns ?? 40) - 4)

    return (
      <Box flexDirection="column">
        <Text>{summary}</Text>
        <Text>{sparkline(points, width)}</Text>
      </Box>
    )
  })
}
