/**
 * Pure-JS SVG radar/spider chart generator for server-side use.
 * Produces a pentagon chart with 5 categories.
 * Output is an SVG string → convert to PNG via sharp before embedding in DOCX.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * @param categories  Array of category labels (ideally 5)
 * @param values      Parallel array of progress values 0–100
 * @param size        Canvas size in px (square), default 360
 */
export function generateRadarChartSvg(
  categories: string[],
  values: number[],
  size = 360,
): string {
  const n   = categories.length
  const cx  = size / 2
  const cy  = size / 2
  const chartR = size * 0.30   // polygon radius
  const labelR = size * 0.46   // label text radius

  // Polar → Cartesian: start from top (−90°), go clockwise
  const pc = (i: number, r: number): [number, number] => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2
    return [+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)]
  }

  const polyPts = (r: number) =>
    Array.from({ length: n }, (_, i) => pc(i, r).join(',')).join(' ')

  const parts: string[] = []

  // ── Background ────────────────────────────────────────────────
  parts.push(`<rect width="${size}" height="${size}" fill="white"/>`)

  // ── Grid rings (25 / 50 / 75 / 100 %) ────────────────────────
  const gridLevels = [0.25, 0.50, 0.75, 1.00]
  for (const lv of gridLevels) {
    const sw = lv === 1.0 ? 1.4 : 0.7
    const sc = lv === 1.0 ? '#6B8CBA' : '#B8CCE4'
    parts.push(`<polygon points="${polyPts(chartR * lv)}" fill="none" stroke="${sc}" stroke-width="${sw}"/>`)
  }

  // ── Axis spokes ───────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const [x, y] = pc(i, chartR)
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#B8CCE4" stroke-width="0.8"/>`)
  }

  // ── Data polygon ──────────────────────────────────────────────
  const dataPoints = Array.from({ length: n }, (_, i) => {
    const frac = Math.min(100, Math.max(0, values[i] ?? 0)) / 100
    return pc(i, chartR * frac).join(',')
  }).join(' ')
  parts.push(
    `<polygon points="${dataPoints}" fill="#4472C4" fill-opacity="0.28" stroke="#4472C4" stroke-width="2.2" stroke-linejoin="round"/>`,
  )

  // ── Data dots ─────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const frac = Math.min(100, Math.max(0, values[i] ?? 0)) / 100
    const [x, y] = pc(i, chartR * frac)
    parts.push(`<circle cx="${x}" cy="${y}" r="3.8" fill="#4472C4" stroke="white" stroke-width="1.5"/>`)
  }

  // ── Category labels ───────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const [x, y] = pc(i, labelR)
    const dx     = x - cx
    const anchor = dx < -4 ? 'end' : dx > 4 ? 'start' : 'middle'
    const pct    = Math.round(values[i] ?? 0)
    const label  = esc(categories[i])

    // Split long labels at space near midpoint
    const words    = categories[i].split(' ')
    const midpoint = Math.ceil(words.length / 2)
    const line1    = esc(words.slice(0, midpoint).join(' '))
    const line2    = words.length > 1 ? esc(words.slice(midpoint).join(' ')) : ''

    if (line2) {
      parts.push(
        `<text text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="#1B3769">` +
        `<tspan x="${x}" dy="0" y="${y - 8}">${line1}</tspan>` +
        `<tspan x="${x}" dy="13">${line2}</tspan>` +
        `</text>`,
      )
      parts.push(
        `<text x="${x}" y="${y + 20}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="9" fill="#4472C4">${pct}%</text>`,
      )
    } else {
      parts.push(
        `<text x="${x}" y="${y - 4}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="#1B3769">${label}</text>`,
      )
      parts.push(
        `<text x="${x}" y="${y + 10}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="9" fill="#4472C4">${pct}%</text>`,
      )
    }
  }

  // ── Ring % hints (on first axis, top) ─────────────────────────
  for (const lv of [0.50, 1.00]) {
    const [rx, ry] = pc(0, chartR * lv)
    parts.push(
      `<text x="${rx + 3}" y="${ry + 1}" font-family="Arial,sans-serif" font-size="7" fill="#AAAAAA">${Math.round(lv * 100)}%</text>`,
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    parts.join('') +
    `</svg>`
  )
}
