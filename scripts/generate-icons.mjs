#!/usr/bin/env node
/**
 * MoneMoni — PWA icon generator.
 *
 * Draws the app mark (a rounded square in the brand colour with three
 * ascending bars) and writes it out as a PNG.
 *
 * No image dependency is used: the PNG encoder is hand-rolled on top of
 * `node:zlib`'s `deflateSync` and a CRC-32 implementation, so the script
 * only needs Node built-ins.
 *
 * Usage: npm run icons
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

/* -------------------------------------------------------------------------- */
/* Design                                                                     */
/* -------------------------------------------------------------------------- */

/** Everything is drawn in a 512 × 512 space and scaled to the target size. */
const DESIGN_SIZE = 512

const BRAND = [37, 99, 235] // #2563eb
const WHITE = [255, 255, 255]

/** Rounded rectangles, painted back to front. */
const SHAPES = [
  { color: BRAND, x: 0, y: 0, w: 512, h: 512, r: 112 },
  { color: WHITE, x: 140, y: 270, w: 56, h: 122, r: 16 },
  { color: WHITE, x: 228, y: 210, w: 56, h: 182, r: 16 },
  { color: WHITE, x: 316, y: 150, w: 56, h: 242, r: 16 },
]

/** Sub-samples per pixel axis — gives the edges a smooth anti-aliased look. */
const SAMPLES = 4

/* -------------------------------------------------------------------------- */
/* PNG encoding                                                               */
/* -------------------------------------------------------------------------- */

/** CRC-32 (IEEE 802.3) lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 checksum of a buffer. */
function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Builds one PNG chunk: length, type, data, CRC. */
function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typed = Buffer.concat([Buffer.from(type, "ascii"), data])

  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typed), 0)

  return Buffer.concat([length, typed, checksum])
}

/**
 * Encodes raw RGBA bytes as a PNG.
 *
 * Colour type 6 (truecolour with alpha), bit depth 8, filter type 0 on every
 * scanline.
 */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  header[10] = 0 // compression: deflate
  header[11] = 0 // filter: adaptive
  header[12] = 0 // interlace: none

  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter type: none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

/** Signed distance to a rounded rectangle (negative inside). */
function sdRoundedRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2
  const cy = y + h / 2
  const qx = Math.abs(px - cx) - (w / 2 - r)
  const qy = Math.abs(py - cy) - (h / 2 - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const inside = Math.min(Math.max(qx, qy), 0)
  return outside + inside - r
}

/** Colour of the topmost shape covering the point, or transparent. */
function colorAt(x, y) {
  for (let i = SHAPES.length - 1; i >= 0; i -= 1) {
    const shape = SHAPES[i]
    if (sdRoundedRect(x, y, shape.x, shape.y, shape.w, shape.h, shape.r) <= 0) {
      return [shape.color[0], shape.color[1], shape.color[2], 255]
    }
  }
  return [0, 0, 0, 0]
}

/** Renders the mark at `size` × `size` pixels as raw RGBA bytes. */
function renderIcon(size) {
  const scale = size / DESIGN_SIZE
  const rgba = Buffer.alloc(size * size * 4)
  const total = SAMPLES * SAMPLES

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES) / scale
          const y = (py + (sy + 0.5) / SAMPLES) / scale
          const [r, g, b, a] = colorAt(x, y)
          // Premultiplied accumulation keeps edge colours correct.
          red += r * (a / 255)
          green += g * (a / 255)
          blue += b * (a / 255)
          alpha += a / 255
        }
      }

      const offset = (py * size + px) * 4
      rgba[offset] = alpha > 0 ? Math.round(red / alpha) : 0
      rgba[offset + 1] = alpha > 0 ? Math.round(green / alpha) : 0
      rgba[offset + 2] = alpha > 0 ? Math.round(blue / alpha) : 0
      rgba[offset + 3] = Math.round((alpha / total) * 255)
    }
  }

  return rgba
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const OUTPUT_DIR = join(ROOT_DIR, "public", "icons")

const TARGETS = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
]

mkdirSync(OUTPUT_DIR, { recursive: true })

for (const target of TARGETS) {
  const png = encodePng(target.size, target.size, renderIcon(target.size))
  const path = join(OUTPUT_DIR, target.file)
  writeFileSync(path, png)
  console.log(`wrote ${path} (${target.size}×${target.size}, ${png.length} bytes)`)
}
