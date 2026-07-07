#!/usr/bin/env node
/**
 * Generate a placeholder CueDeck app icon (`build/icon.png`, 512x512 RGBA).
 *
 * This exists so `electron-builder` has an icon to package on every platform
 * without committing an opaque binary blob that nobody can regenerate. It draws
 * a simple, recognizable "cue card" mark (a rounded card with a clapperboard
 * stripe) on the brand background. Replace `build/icon.png` with real artwork
 * before a public release — see RELEASING.md.
 *
 * Pure Node (uses the built-in `zlib`); no native/image deps required so it runs
 * anywhere CI does. Run with: `npm run icons`.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512

// Brand palette (matches the app's dark theme surfaces / accent).
const BG = [15, 17, 23, 255] // #0f1117 app background
const CARD = [245, 246, 248, 255] // #f5f6f8 light card
const ACCENT = [99, 102, 241, 255] // indigo accent stripe
const CARD_SHADOW = [0, 0, 0, 60]

/** Allocate a transparent RGBA framebuffer. */
function makeCanvas(size) {
  return new Uint8Array(size * size * 4)
}

function setPx(buf, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  if (a >= 255) {
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = 255
    return
  }
  // Simple source-over alpha blend onto whatever is already there.
  const sa = a / 255
  const da = buf[i + 3] / 255
  const outA = sa + da * (1 - sa)
  if (outA === 0) return
  for (let c = 0; c < 3; c++) {
    const src = [r, g, b][c]
    const dst = buf[i + c]
    buf[i + c] = Math.round((src * sa + dst * da * (1 - sa)) / outA)
  }
  buf[i + 3] = Math.round(outA * 255)
}

/** Filled axis-aligned rounded rectangle. */
function roundedRect(buf, x0, y0, x1, y1, radius, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // Corner rounding: reject pixels outside the quarter-circles.
      let dx = 0
      let dy = 0
      if (x < x0 + radius && y < y0 + radius) {
        dx = x0 + radius - x
        dy = y0 + radius - y
      } else if (x >= x1 - radius && y < y0 + radius) {
        dx = x - (x1 - radius - 1)
        dy = y0 + radius - y
      } else if (x < x0 + radius && y >= y1 - radius) {
        dx = x0 + radius - x
        dy = y - (y1 - radius - 1)
      } else if (x >= x1 - radius && y >= y1 - radius) {
        dx = x - (x1 - radius - 1)
        dy = y - (y1 - radius - 1)
      }
      if (dx * dx + dy * dy > radius * radius) continue
      setPx(buf, x, y, color)
    }
  }
}

function build() {
  const buf = makeCanvas(SIZE)

  // Background: fill the whole canvas with the brand dark surface.
  roundedRect(buf, 0, 0, SIZE, SIZE, 96, BG)

  // Drop shadow behind the card (offset down-right).
  roundedRect(buf, 120, 132, 400, 404, 28, CARD_SHADOW)

  // The cue card itself.
  const cx0 = 108
  const cy0 = 116
  const cx1 = 404
  const cy1 = 396
  roundedRect(buf, cx0, cy0, cx1, cy1, 28, CARD)

  // Clapperboard-style accent stripe across the top of the card.
  roundedRect(buf, cx0, cy0, cx1, cy0 + 64, 28, ACCENT)
  // Square off the stripe's bottom corners so only the top follows the card.
  roundedRect(buf, cx0, cy0 + 40, cx1, cy0 + 64, 0, ACCENT)

  // Three "text line" bars on the card body to read as a cue card / list.
  const barColor = [203, 213, 225, 255] // slate-300
  const barX0 = cx0 + 36
  const barX1 = cx1 - 36
  for (let n = 0; n < 3; n++) {
    const by = cy0 + 118 + n * 62
    roundedRect(buf, barX0, by, barX1 - n * 34, by + 26, 13, barColor)
  }

  return buf
}

// --- Minimal PNG encoder (truecolor + alpha, no interlace) ---

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([len, typeBytes, data, crc])
}

function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: truecolor + alpha
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // Prepend a per-scanline filter byte (0 = None).
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '..', 'build', 'icon.png')
mkdirSync(dirname(outPath), { recursive: true })
const png = encodePng(build(), SIZE)
writeFileSync(outPath, png)
console.log(`Wrote ${outPath} (${SIZE}x${SIZE}, ${png.length} bytes)`)
