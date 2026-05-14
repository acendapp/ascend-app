// Generates PNG icons for the Ascend app home screen icon
// Navy background (#080E1C) + blue lightning bolt (#4A9EFF)
// Run: node gen-icons.js

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── PNG encoder ──────────────────────────────────────────────────────────────

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.concat([typeB, data])
  const crc = crc32(crcBuf)
  return Buffer.concat([u32(data.length), typeB, data, u32(crc)])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function encodePNG(pixels, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = chunk('IHDR', Buffer.concat([u32(size), u32(size), Buffer.from([8, 2, 0, 0, 0])]))
  const rows = []
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0])) // filter=None
    rows.push(pixels.slice(y * size * 3, (y + 1) * size * 3))
  }
  const raw    = Buffer.concat(rows)
  const deflated = zlib.deflateSync(raw, { level: 9 })
  const idat   = chunk('IDAT', deflated)
  const iend   = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, idat, iend])
}

// ── Rasteriser ───────────────────────────────────────────────────────────────

// Point-in-polygon (ray casting)
function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function generateIcon(size) {
  const BG   = [0x08, 0x0E, 0x1C]   // #080E1C
  const BOLT = [0x4A, 0x9E, 0xFF]   // #4A9EFF
  const R    = size * 0.215          // corner radius (~22% for squircle feel)

  // Lightning bolt polygon — original space (0..512)
  // SVG: translate(128,77) scale(2.56)
  // Points: 58,0 30,65 50,65 22,140 90,55 66,55 95,0
  const sx = 2.56, sy = 2.56, tx = 106.24, ty = 76.80
  const rawPts = [[58,0],[30,65],[50,65],[22,140],[90,55],[66,55],[95,0]]
  const bolt512 = rawPts.map(([x, y]) => [x * sx + tx, y * sy + ty])
  // Scale bolt to target size
  const scale = size / 512
  const bolt = bolt512.map(([x, y]) => [x * scale, y * scale])

  const pixels = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded corner mask
      const inCorner = isInRoundedRect(x + 0.5, y + 0.5, size, R)
      let color
      if (!inCorner) {
        color = null // transparent → render as white (won't matter, masked by OS)
      } else if (pointInPoly(x + 0.5, y + 0.5, bolt)) {
        color = BOLT
      } else {
        color = BG
      }
      const i = (y * size + x) * 3
      if (color) {
        pixels[i]     = color[0]
        pixels[i + 1] = color[1]
        pixels[i + 2] = color[2]
      } else {
        // outside rounded rect — use bg (iOS clips to its own shape anyway)
        pixels[i]     = BG[0]
        pixels[i + 1] = BG[1]
        pixels[i + 2] = BG[2]
      }
    }
  }
  return pixels
}

function isInRoundedRect(x, y, size, r) {
  // Check if point is inside a rounded rectangle
  const cx = x < r ? r : x > size - r ? size - r : x
  const cy = y < r ? r : y > size - r ? size - r : y
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= size - r) || (y >= r && y <= size - r)
}

// ── Generate files ────────────────────────────────────────────────────────────

const sizes = [192, 512, 180]
const outDir = path.join(__dirname, 'public')

for (const size of sizes) {
  const pixels = generateIcon(size)
  const png    = encodePNG(pixels, size)
  const file   = path.join(outDir, `icon-${size}.png`)
  fs.writeFileSync(file, png)
  console.log(`✓ ${file} (${png.length} bytes)`)
}

console.log('Done.')
