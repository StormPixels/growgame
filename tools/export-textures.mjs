// Mengekspor semua tekstur bawaan sebagai PNG 32x32 ke public/textures
// (titik awal untuk diedit). Jalankan: node tools/export-textures.mjs
// Tidak butuh library apa pun: kanvas mini + penulis PNG ada di file ini.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { textureManifest } from '../src/textures.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'textures');

function parseColor(s) {
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  throw new Error('warna tidak dikenal: ' + s);
}

class MiniCtx { // hanya fungsi yang dipakai penggambar tekstur
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); this.stack = []; this.ox = 0; this.oy = 0; this.path = []; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; }
  save() { this.stack.push([this.ox, this.oy]); }
  restore() { [this.ox, this.oy] = this.stack.pop(); }
  translate(x, y) { this.ox += x; this.oy += y; }
  blend(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4, da = this.px[i + 3] / 255, oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) this.px[i + k] = ([r, g, b][k] * a + this.px[i + k] * da * (1 - a)) / oa;
    this.px[i + 3] = oa * 255;
  }
  fillRect(x, y, w, h) {
    const col = parseColor(this.fillStyle);
    for (let yy = Math.round(y + this.oy); yy < Math.round(y + this.oy + h); yy++) for (let xx = Math.round(x + this.ox); xx < Math.round(x + this.ox + w); xx++) this.blend(xx, yy, col);
  }
  beginPath() { this.path = []; this.cur = null; }
  moveTo(x, y) { this.cur = [x, y]; }
  lineTo(x, y) { if (this.cur) this.path.push({ t: 'l', x1: this.cur[0], y1: this.cur[1], x2: x, y2: y }); this.cur = [x, y]; }
  arc(cx, cy, r, a0, a1) { this.path.push({ t: 'a', cx, cy, r, a0, a1 }); }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, x + 0.5 - this.ox, y + 0.5 - this.oy); }
  fill() {
    const col = parseColor(this.fillStyle);
    this.each((x, y, px, py) => { for (const s of this.path) if (s.t === 'a' && Math.hypot(px - s.cx, py - s.cy) <= s.r) { this.blend(x, y, col); break; } });
  }
  stroke() {
    const col = parseColor(this.strokeStyle), hw = this.lineWidth / 2;
    this.each((x, y, px, py) => {
      for (const s of this.path) {
        let hit = false;
        if (s.t === 'l') {
          const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L)) : 0;
          hit = Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)) <= hw;
        } else {
          let a = Math.atan2(py - s.cy, px - s.cx);
          if (a < s.a0) a += Math.PI * 2;
          hit = a >= s.a0 && a <= s.a1 && Math.abs(Math.hypot(px - s.cx, py - s.cy) - s.r) <= hw;
        }
        if (hit) { this.blend(x, y, col); break; }
      }
    });
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let n = 0;
for (const e of textureManifest()) {
  const ctx = new MiniCtx(32, 32);
  e.draw(ctx);
  const file = path.join(OUT, e.path + '.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(32, 32, ctx.px));
  n++;
}
console.log(`${n} tekstur 32x32 ditulis ke ${OUT}`);
