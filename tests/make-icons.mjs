// Genera les icones PNG de l'app (img/icon-192.png, icon-512.png, icon-maskable-512.png). Ús: node tests/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) { let c, crc = -1; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, pix) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pix.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Dibuix en un llenç 64x64 (el mateix que img/icon.svg), mostrejat amb supermostreig 3x3
function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const S = 64, scale = maskable ? 0.72 : 1; // la versió "maskable" deixa marge de seguretat
  const inRR = (x, y, x0, y0, x1, y1, r) => { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  const dist = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; let t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); return Math.hypot(x - ax - t * dx, y - ay - t * dy); };
  const sample = (u, v) => { // u,v en [0,64)
    if (!maskable && !inRR(u, v, 0, 0, 64, 64, 14)) return [0, 0, 0, 0];
    let c = [37, 99, 235, 255];
    const x = (u - 32) / scale + 32, y = (v - 32) / scale + 32;
    // pàgina
    const inPage = x >= 18 && x <= 48 && y >= 10 && y <= 54 && !(x > 38 && y < 20 + (x - 38) * 0 && false);
    if (inPage) { c = [255, 255, 255, 255]; if (x > 38 && y < 20 && (x - 38) + (20 - y) > 10) c = [191, 219, 254, 255]; if (x > 38 && y < 20 && (x - 38) <= (20 - y) - 0) { /* cantonada plegada */ } }
    if (inPage && (y >= 28.2 && y <= 29.8 && x >= 23 && x <= 41 || y >= 33.2 && y <= 34.8 && x >= 23 && x <= 35)) c = [148, 163, 184, 255];
    // signatura vermella
    const pts = [[23, 44], [27, 41], [31, 35], [34, 41], [35, 44], [38, 40], [41, 38]];
    for (let i = 0; i < pts.length - 1; i++) if (dist(x, y, ...pts[i], ...pts[i + 1]) < 1.4) c = [220, 38, 38, 255];
    return c;
  };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) { const c = sample(((i + (sx + 0.5) / 3) / size) * S, ((j + (sy + 0.5) / 3) / size) * S); r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; }
    const o = (j * size + i) * 4;
    if (a > 0) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = a / 9; }
  }
  return px;
}
writeFileSync('img/icon-192.png', png(192, render(192, false)));
writeFileSync('img/icon-512.png', png(512, render(512, false)));
writeFileSync('img/icon-maskable-512.png', png(512, render(512, true)));
console.log('ok');
