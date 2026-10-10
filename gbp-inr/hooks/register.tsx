import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RatePoint, Series } from '../types'

const PANE = 'gbp-inr'
const EVERY_MS = 60_000
const MAX_POINTS = 120
const BARS = '▁▂▃▄▅▆▇█'

// Each range is one Yahoo Finance chart query: intraday for 1D and 7D, daily for 30D.
const RANGES: Record<string, { query: string; label: string }> = {
  '1D': { query: 'range=1d&interval=5m', label: 'today' },
  '7D': { query: 'range=5d&interval=30m', label: 'past week' },
  '30D': { query: 'range=1mo&interval=1d', label: 'past month' },
}

const CLAY = '#D97757'
const AMBER = '#F0A070'
const CREAM = '#F5E6DC'
const MUTED = '#8C8279'
const DOWN = '#E5675C'

const series = atom({ plugin: 'gbp-inr', key: 'series' } as const, {})
const range = atom({ plugin: 'gbp-inr', key: 'range' } as const, '1D')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const local = (t: number, offset: number) => new Date(t + offset * 1000)
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`

function axisLabel(t: number, key: string, offset: number): string {
  const d = local(t, offset)
  if (key === '1D') return hhmm(d)
  if (key === '7D') return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`
  return dayMonth(d)
}

function tipLabel(t: number, key: string, offset: number, zone: string): string {
  const d = local(t, offset)
  if (key === '30D') return `${DAYS[d.getUTCDay()]} ${dayMonth(d)}`
  return `${DAYS[d.getUTCDay()]} ${dayMonth(d)} · ${hhmm(d)} ${zone}`
}

function thin(points: RatePoint[]): RatePoint[] {
  if (points.length <= MAX_POINTS) return points
  const step = (points.length - 1) / (MAX_POINTS - 1)
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * step)]!)
}

const fmt = (n: number) => n.toFixed(2)

// The whole card is one SVG: hero price, chart with a hover readout in the header.
function svgCard(key: string, s: Series): string {
  const points = thin(s.points)
  const W = 320
  const H = 385
  const L = 14
  const R = 50
  const CT = 118
  const CB = 360
  const first = points[0]!.rate
  const change = s.price - (key === '1D' ? s.prevClose : first)
  const pct = (change / (s.price - change)) * 100
  const up = change >= 0
  const tone = up ? CLAY : DOWN
  const sign = up ? '+' : '−'
  const values = points.map(p => p.rate)
  const floor = Math.min(...values)
  const ceil = Math.max(...values)
  const pad = (ceil - floor) * 0.12 || 0.1
  const lo = floor - pad
  const hi = ceil + pad
  const x = (i: number) => L + (i / Math.max(1, points.length - 1)) * (W - L - R)
  const y = (rate: number) => CT + (1 - (rate - lo) / (hi - lo)) * (CB - CT)
  const coords = points.map((p, i) => [x(i), y(p.rate)] as const)
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('')
  const [ex, ey] = coords[coords.length - 1]!
  const area = `${line}L${ex.toFixed(1)},${CB}L${L},${CB}Z`

  const ticks = [0, 1, 2, 3]
    .map(i => {
      const rate = hi - ((hi - lo) * (i + 0.5)) / 4
      const ty = y(rate).toFixed(1)
      return `<line x1="${L}" x2="${W - R + 4}" y1="${ty}" y2="${ty}" class="grid"/><text x="${W - 4}" y="${(+ty + 4).toFixed(1)}" text-anchor="end" class="axis">${fmt(rate)}</text>`
    })
    .join('')
  const xticks = [0, 0.5, 1]
    .map(f => {
      const i = Math.round(f * (points.length - 1))
      const anchor = f === 0 ? 'start' : f === 1 ? 'end' : 'middle'
      return `<text x="${x(i).toFixed(1)}" y="${CB + 18}" text-anchor="${anchor}" class="axis">${axisLabel(points[i]!.t, key, s.offset)}</text>`
    })
    .join('')

  const prevY = key === '1D' && s.prevClose > lo && s.prevClose < hi
    ? `<line x1="${L}" x2="${W - R + 4}" y1="${y(s.prevClose).toFixed(1)}" y2="${y(s.prevClose).toFixed(1)}" class="prev"/><text x="${L + 2}" y="${(y(s.prevClose) - 5).toFixed(1)}" class="prevlabel">prev close ${fmt(s.prevClose)}</text>`
    : ''

  const strip = (W - L - R) / Math.max(1, points.length - 1)
  const hover = coords
    .map(([cx, cy], i) => {
      const rate = points[i]!.rate
      const delta = rate - (s.price - change)
      return `<g class="pt"><rect x="${(cx - strip / 2).toFixed(1)}" y="0" width="${(strip + 0.6).toFixed(1)}" height="${CB + 30}" fill="transparent"/>`
        + `<g class="hv"><line class="guide" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${CT - 6}" y2="${CB}"/>`
        + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${tone}" opacity=".25"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" class="dot"/>`
        + `<text x="16" y="74" font-size="40" font-weight="700" fill="${CREAM}" style="font-variant-numeric:tabular-nums">₹${fmt(rate)}</text>`
        + `<text x="16" y="101" font-size="12.5" font-weight="600" fill="${delta >= 0 ? CLAY : DOWN}">${tipLabel(points[i]!.t, key, s.offset, s.zone)}  ·  ${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))}</text></g></g>`
    })
    .join('')

  const updated = hhmm(local(s.fetchedAt, s.offset))
  const lastAt = s.points[s.points.length - 1]!.t
  const closed = s.fetchedAt - lastAt > 30 * 60_000
  const status = closed ? `Market closed · ${tipLabel(lastAt, '1D', s.offset, s.zone)}` : `Live · ${RANGES[key]!.label}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.4}" height="${H * 1.4}" font-family="ui-sans-serif,-apple-system,Inter,system-ui,sans-serif">
<defs>
<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone}" stop-opacity=".45"/><stop offset=".7" stop-color="${tone}" stop-opacity=".08"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></linearGradient>
<linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${up ? '#B5532F' : '#A8433A'}"/><stop offset="1" stop-color="${up ? AMBER : '#FF8A7A'}"/></linearGradient>
<radialGradient id="glow" cx=".85" cy="0" r=".9"><stop offset="0" stop-color="${CLAY}" stop-opacity=".22"/><stop offset="1" stop-color="${CLAY}" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<style>
.axis{fill:${MUTED};font-size:11px;font-variant-numeric:tabular-nums}
.grid{stroke:${CREAM};stroke-opacity:.07;stroke-dasharray:2 4}
.prev{stroke:${MUTED};stroke-opacity:.6;stroke-dasharray:4 4}
.prevlabel{fill:${MUTED};font-size:10px}
.lbl{fill:${MUTED};font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.hv{visibility:hidden;pointer-events:none}
.pt:hover .hv{visibility:visible}
.guide{stroke:${CREAM};stroke-opacity:.35;stroke-dasharray:3 3}
.dot{fill:${CREAM};stroke:${tone};stroke-width:2.5}
svg:has(.pt:hover) .hero{visibility:hidden}
.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.1s ease-out forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.fade{opacity:0;animation:fade .9s .3s ease-out forwards}
@keyframes fade{to{opacity:1}}
</style>
<rect width="${W}" height="${H}" rx="16" fill="url(#glow)"/>
<circle cx="22" cy="22" r="4" fill="${closed ? MUTED : CLAY}">${closed ? '' : '<animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/>'}</circle>
<text x="32" y="26" class="lbl" fill="${CLAY}" style="fill:${closed ? MUTED : CLAY}">${status}</text>
<text x="${W - 16}" y="26" text-anchor="end" class="axis">${closed ? "" : `updated ${updated} ${s.zone}`}</text>
<g class="hero"><text x="16" y="74" font-size="40" font-weight="700" fill="${CREAM}" style="font-variant-numeric:tabular-nums">₹${fmt(s.price)}</text>
<rect x="16" y="86" width="${(String(fmt(Math.abs(change))).length + String(Math.abs(pct).toFixed(2)).length) * 8 + 52}" height="22" rx="11" fill="${tone}" fill-opacity=".16"/>
<text x="26" y="101" font-size="12.5" font-weight="600" fill="${tone}" style="font-variant-numeric:tabular-nums">${up ? '▲' : '▼'} ${sign}${fmt(Math.abs(change))}  ${sign}${Math.abs(pct).toFixed(2)}%</text></g>
<text x="${W - 16}" y="74" text-anchor="end" class="lbl">per £1</text>
${ticks}${prevY}
<path d="${area}" fill="url(#fill)" class="fade"/>
<path d="${line}" fill="none" stroke="${tone}" stroke-width="6" stroke-opacity=".35" filter="url(#soft)" pathLength="1" class="draw"/>
<path d="${line}" fill="none" stroke="url(#stroke)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pathLength="1" class="draw"/>
<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="5" fill="${tone}"><animate attributeName="r" values="5;14;5" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".6;0;.6" dur="2s" repeatCount="indefinite"/></circle>
<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4.5" class="dot"/>
${xticks}
${hover}
</svg>`
}

function sparkline(points: RatePoint[], width: number): string {
  const shown = thin(points).slice(-width)
  const values = shown.map(point => point.rate)
  const lo = Math.min(...values)
  const span = Math.max(...values) - lo || 1

  return shown.map(point => BARS[Math.round(((point.rate - lo) / span) * (BARS.length - 1))]).join('')
}

function parse(stdout: string, fetchedAt: number): Series | undefined {
  const result = JSON.parse(stdout)?.chart?.result?.[0]
  const meta = result?.meta
  const stamps: number[] = result?.timestamp ?? []
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? []
  if (!meta || typeof meta.regularMarketPrice !== 'number') return undefined

  const points = stamps
    .map((t, i) => ({ t: t * 1000, rate: closes[i] }))
    .filter((p): p is RatePoint => typeof p.rate === 'number')
  // The latest quote can be stamped hours after the last bar (weekends); only extend the line when it is the next tick.
  const quoteAt = meta.regularMarketTime * 1000
  const lastAt = points[points.length - 1]?.t ?? 0
  const gap = points.length > 1 ? lastAt - points[points.length - 2]!.t : 0
  if (quoteAt > lastAt && quoteAt - lastAt <= gap * 1.5) points.push({ t: quoteAt, rate: meta.regularMarketPrice })
  if (points.length < 2) return undefined

  return {
    points,
    price: meta.regularMarketPrice,
    prevClose: meta.chartPreviousClose ?? meta.previousClose ?? points[0]!.rate,
    dayHigh: meta.regularMarketDayHigh ?? meta.regularMarketPrice,
    dayLow: meta.regularMarketDayLow ?? meta.regularMarketPrice,
    yearHigh: meta.fiftyTwoWeekHigh ?? meta.regularMarketPrice,
    yearLow: meta.fiftyTwoWeekLow ?? meta.regularMarketPrice,
    offset: meta.gmtoffset ?? 0,
    zone: meta.currentTradingPeriod?.regular?.timezone ?? meta.timezone ?? 'UTC',
    fetchedAt,
  }
}

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gbp-inr',
      description: 'Show the live GBP to INR rate in a pane',
    })
    void $.ui.open({ id: PANE, title: 'GBP → INR' })

    const load = async () => {
      const fetched: Record<string, Series> = {}
      await Promise.all(
        Object.entries(RANGES).map(async ([key, { query }]) => {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/GBPINR=X?${query}`
          const ran = await $.process.run(['curl', '-fsS', '-A', 'Mozilla/5.0', '--max-time', '20', url], { timeoutMs: 30000 })
          if (ran.exitCode !== 0) return
          try {
            const parsed = parse(ran.stdout, await $.clock.now())
            if (parsed) fetched[key] = parsed
          } catch {}
        }),
      )
      if (Object.keys(fetched).length === 0) return

      await update($, series, current => ({ ...current, ...fetched }))
    }

    void load()
    timer = $.clock.every(EVERY_MS, () => void load())

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    timer?.cancel()
    timer = undefined

    return next(e)
  })

  on('command.run', { command: 'gbp-inr' }, async $ => {
    await $.ui.open({ id: PANE, title: 'GBP → INR' })

    return { text: 'GBP → INR pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const all = await read($, series)
    const stored = await read($, range)
    const key = stored in RANGES ? stored : '1D'
    const s = all[key]

    const rangeButtons = Object.keys(RANGES).map(name => (
      <Button
        key={`range-${name}`}
        label={name}
        variant={name === key ? 'primary' : 'secondary'}
        onPress={() => update($, range, () => name)}
      />
    ))

    if (!s) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color={MUTED}>Fetching the live GBP → INR rate…</Text>
        </Box>
      )
    }

    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Svg } = $.ui.resolve(e)

      return (
        <Box flexDirection="column" padding={1} gap={1} flexGrow={1}>
          <Svg width={448} height={539} source={svgCard(key, s)} alt={`GBP to INR ${fmt(s.price)}, ${RANGES[key]!.label}`} isInteractive />
          <Box flexDirection="row" gap={1} justifyContent="center">{rangeButtons}</Box>
        </Box>
      )
    }

    const base = key === '1D' ? s.prevClose : s.points[0]!.rate
    const pct = ((s.price - base) / base) * 100
    const width = Math.max(10, (e.viewport?.columns ?? 40) - 4)

    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold color={CLAY}>{`GBP → INR  ₹${fmt(s.price)}  ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</Text>
        <Text color={pct >= 0 ? CLAY : DOWN}>{sparkline(s.points, width)}</Text>
        <Text color={MUTED}>{`${RANGES[key]!.label} · low ${fmt(Math.min(...s.points.map(p => p.rate)))} · high ${fmt(Math.max(...s.points.map(p => p.rate)))}`}</Text>
        <Box flexDirection="row" gap={1}>{rangeButtons}</Box>
      </Box>
    )
  })
}
