// Checks every colour pair Luncheon uses against the Ellenial accessibility rules:
// text 4.5:1 (large text 3:1), controls, outlines and icons 3:1. Run: node scripts/check-contrast.mjs
// Exits with an error if any pair fails, so it can run before shipping.

const lum = (hex) => {
  const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const themes = {
  light: { bg: '#FEF2E2', surface: '#FFFBF5', soft: '#F1EAF8', peri: '#B7B1E6', onPeri: '#1F1A2E', accent: '#342E86', onAccent: '#FFFFFF', ink: '#1F1A2E', muted: '#575166', edge: '#8A8299', ok: '#2F5A3D' },
  dark: { bg: '#17141F', surface: '#221E2C', soft: '#2D2640', peri: '#463C6E', onPeri: '#F3EEF8', accent: '#B39AE8', onAccent: '#1A1430', ink: '#F3EEF8', muted: '#C2BACF', edge: '#7D7393', ok: '#BFD8C2' },
}

// [what, foreground, background, minimum]
const pairs = (t) => [
  ['text on page', t.ink, t.bg, 4.5],
  ['text on card', t.ink, t.surface, 4.5],
  ['text on lavender (fixed card, stale label)', t.ink, t.soft, 4.5],
  ['muted text on page', t.muted, t.bg, 4.5],
  ['muted text on card (walk, price, note)', t.muted, t.surface, 4.5],
  ['muted text on lavender (fixed card note)', t.muted, t.soft, 4.5],
  ['eyebrow / link hover on page', t.accent, t.bg, 4.5],
  ['link hover on card', t.accent, t.surface, 4.5],
  ['"Updated" label on card', t.ok, t.surface, 4.5],
  ['selected chip text on Periwinkle', t.onPeri, t.peri, 4.5],
  ['selected chip edge (Indigo) on page', t.accent, t.bg, 3],
  ['chip edge on page', t.edge, t.bg, 3],
  ['chip edge on card fill', t.edge, t.surface, 3],
  ['dashed "no menu" outline on page', t.edge, t.bg, 3],
  ['jump link text on lavender', t.ink, t.soft, 4.5],
  ['jump link edge on page', t.edge, t.bg, 3],
  ['"Show all" button on card', t.accent, t.surface, 4.5],
  ['focus ring on page', t.accent, t.bg, 3],
  ['focus ring on card', t.accent, t.surface, 3],
]

let failed = 0
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`)
  for (const [what, fg, bg, min] of pairs(t)) {
    const r = ratio(fg, bg)
    const ok = r >= min
    if (!ok) failed++
    console.log(`${ok ? '✓' : '✕'} ${r.toFixed(2).padStart(5)}:1 (needs ${min}) ${what}  ${fg} on ${bg}`)
  }
}
if (failed) { console.error(`\n${failed} pair(s) fail`); process.exit(1) }
console.log('\nAll pairs pass.')
