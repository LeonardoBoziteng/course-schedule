/**
 * 生成 PWA / iOS 图标（纯 Node 实现，无第三方依赖）。
 * 运行：npm run gen:icons
 * 输出：public/icons/pwa-192x192.png / pwa-512x512.png / apple-touch-icon.png(180x180)
 *
 * 图案：品牌色纵向渐变底 + 白色 2x2「课程表」网格
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'icons')

/* ---------- 极简 PNG 编码 ---------- */
const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba: Uint8Array，长度 width*height*4 */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------- 绘制 ---------- */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t)

/** 判断点是否在圆角矩形内 */
function inRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  // 中心十字区域
  if (px >= x0 + r && px <= x1 - r) return true
  if (py >= y0 + r && py <= y1 - r) return true
  // 四个圆角
  for (const [cx, cy] of [
    [x0 + r, y0 + r],
    [x1 - r, y0 + r],
    [x0 + r, y1 - r],
    [x1 - r, y1 - r],
  ]) {
    const dx = px - cx
    const dy = py - cy
    if (dx * dx + dy * dy <= r * r) return true
  }
  return false
}

function drawIcon(size) {
  const [topR, topG, topB] = hexToRgb('#6a7df7')
  const [botR, botG, botB] = hexToRgb('#4353dc')

  const m = size * 0.19 // 外边距
  const gap = size * 0.05 // 网格缝隙
  const region = size - 2 * m
  const cell = (region - gap) / 2
  const cellR = cell * 0.24

  const tiles = []
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x0 = m + col * (cell + gap)
      const y0 = m + row * (cell + gap)
      tiles.push([x0, y0, x0 + cell, y0 + cell, cellR])
    }
  }

  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const t = size === 1 ? 0 : y / (size - 1)
    const r = lerp(topR, botR, t)
    const g = lerp(topG, botG, t)
    const b = lerp(topB, botB, t)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inTile = tiles.some(([x0, y0, x1, y1, r]) => inRoundRect(x, y, x0, y0, x1, y1, r))
      if (inTile) {
        rgba[i] = 255
        rgba[i + 1] = 255
        rgba[i + 2] = 255
      } else {
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
      }
      rgba[i + 3] = 255
    }
  }
  return encodePNG(size, size, rgba)
}

const targets = [
  { size: 192, file: 'pwa-192x192.png' },
  { size: 512, file: 'pwa-512x512.png' },
  { size: 180, file: 'apple-touch-icon.png' },
]

mkdirSync(OUT_DIR, { recursive: true })
for (const { size, file } of targets) {
  const out = join(OUT_DIR, file)
  writeFileSync(out, drawIcon(size))
  console.log(`generated ${out} (${size}x${size})`)
}
