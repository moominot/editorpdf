// Edició del text existent d'un PDF: se substitueix un fragment (rectangle de tapa + text nou) i, en desar,
// s'intenta eliminar el text original del flux de contingut perquè no quedi sota la tapa.
import { S, commit, pageById } from './state.js';
import { getPdfPage, pageInfo } from './pdfsource.js';
import { uid } from './util.js';
import { toast } from './ui.js';
import { startEdit, selectObj, BASELINE } from './objects.js';
import { t, addStrings } from './i18n.js';
import { stripFromContent } from './contentstream.js';

addStrings({
  teRotated: ['Aquest fragment de text està girat; només es pot editar text horitzontal.', 'Este fragmento de texto está girado; solo se puede editar texto horizontal.', 'This text fragment is rotated; only horizontal text can be edited.'],
  teNoItem: ['No s\'ha pogut identificar aquest fragment de text.', 'No se pudo identificar este fragmento de texto.', 'Could not identify this text fragment.'],
});

function guessFont(page, item, styles) {
  let name = '', bold = false, italic = false;
  try { const f = page.commonObjs.get(item.fontName); name = (f.name || f.fallbackName || '').toLowerCase(); bold = !!f.bold; italic = !!f.italic; } catch { /* encara no carregada */ }
  const fam = (styles?.[item.fontName]?.fontFamily || '').toLowerCase();
  bold = bold || /bold|black|heavy|semibold|demi/.test(name);
  italic = italic || /italic|oblique/.test(name);
  let font = 'Helvetica';
  if (/courier|mono|consolas|lucida console/.test(name) || fam.includes('monospace')) font = 'Courier';
  else if ((/times|serif|georgia|garamond|palatino|cambria|book|minion|roman/.test(name) && !/sans/.test(name)) || (fam.includes('serif') && !fam.includes('sans'))) font = 'Times';
  return { font, bold, italic };
}

// Mostreja el fons i el color del text dins d'un rectangle del canvas de la pàgina
function sampleColors(pv, rectClient) {
  const cv = pv.canvas; const pr = pv.el.getBoundingClientRect();
  const k = cv.width / pr.width;
  const x = Math.max(0, Math.floor((rectClient.left - pr.left) * k)), y = Math.max(0, Math.floor((rectClient.top - pr.top) * k));
  const w = Math.min(cv.width - x, Math.ceil(rectClient.width * k)), h = Math.min(cv.height - y, Math.ceil(rectClient.height * k));
  const out = { bg: '#ffffff', fg: '#000000' };
  if (w < 2 || h < 2) return out;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const m = 3;
  const px = Math.max(0, x - m), py = Math.max(0, y - m), pw2 = Math.min(cv.width - px, w + 2 * m), ph2 = Math.min(cv.height - py, h + 2 * m);
  const d = ctx.getImageData(px, py, pw2, ph2).data;
  const hist = new Map();
  for (let j = 0; j < ph2; j++) for (let i = 0; i < pw2; i++) {
    const inside = i >= x - px && i < x - px + w && j >= y - py && j < y - py + h;
    if (inside) continue;
    const o = (j * pw2 + i) * 4; const key = ((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3);
    const h0 = hist.get(key); if (h0) h0.c++; else hist.set(key, { c: 1, rgb: [d[o], d[o + 1], d[o + 2]] });
  }
  let best = null, bc = -1; for (const [, v] of hist) if (v.c > bc) { bc = v.c; best = v; }
  const bg = best ? best.rgb : [255, 255, 255];
  // el fons real: píxel més proper a la moda dins la marca (evita quantització)
  const d2 = ctx.getImageData(x, y, w, h).data;
  let maxDist = 0, far = [0, 0, 0];
  for (let i = 0; i < d2.length; i += 4) {
    const dist = Math.abs(d2[i] - bg[0]) + Math.abs(d2[i + 1] - bg[1]) + Math.abs(d2[i + 2] - bg[2]);
    if (dist > maxDist) { maxDist = dist; far = [d2[i], d2[i + 1], d2[i + 2]]; }
  }
  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  out.bg = hex(bg); out.fg = maxDist > 60 ? hex(far) : '#000000';
  return out;
}

export async function editSpan(pv, span) {
  const e = pv.entry; if (!e || e.blank) return;
  const idx = pv.tl?.textDivs?.indexOf(span) ?? -1;
  let item = idx >= 0 ? pv.textItems?.[idx] : null;
  if (!item || item.str !== span.textContent) item = pv.textItems?.find((i) => i.str === span.textContent) || null;
  if (!item) return toast(t('teNoItem'), 'err');
  const [a, b, , , ex, ey] = item.transform;
  if (Math.abs(b) > 0.01 * Math.abs(a || 1)) return toast(t('teRotated'), 'err');
  const size = Math.hypot(a, b);
  const info = await pageInfo(e.src, e.idx);
  const page = await getPdfPage(e.src, e.idx);
  const f = guessFont(page, item, pv.textStyles);
  const cols = sampleColors(pv, span.getBoundingClientRect());
  const u = ex - info.view[0], vBase = info.view[3] - ey;
  const w = Math.max(item.width, 2);
  const cover = {
    id: uid('o'), type: 'rect', x: u - 1, y: vBase - size * 0.95, w: w + 2, h: size * 1.25,
    stroke: '', fill: cols.bg, width: 0,
    rm: { x0: ex - 1.5, y0: ey - size * 0.35, x1: ex + w + 1.5, y1: ey + size * 1.0 },
  };
  const text = {
    id: uid('o'), type: 'text', x: u, y: vBase - (BASELINE[f.font] ?? 0.9465) * size, w: null,
    text: item.str, size: +size.toFixed(2), color: cols.fg, font: f.font, bold: f.bold, italic: f.italic, _new: true,
  };
  e.objs.push(cover, text);
  commit('content');
  pv.refreshLayers();
  selectObj(pv.pid, text.id);
  startEdit(pv.pid, text.id);
}

// ----------------------------------------------------------------------------------------------
// Eliminació del text original en el flux de contingut
// ----------------------------------------------------------------------------------------------
export async function stripTextInBox(doc, pg, rm) { return stripTextInBoxes(doc, pg, [rm]); }
export async function stripTextInBoxes(doc, pg, boxes) {
  const L = window.PDFLib;
  const contents = pg.node.Contents();
  if (!contents) return 0;
  const streams = [];
  if (contents instanceof L.PDFArray) for (let i = 0; i < contents.size(); i++) streams.push(contents.lookup(i));
  else streams.push(contents);
  const parts = [];
  for (const st of streams) {
    let bytes;
    try { bytes = L.decodePDFRawStream(st).decode(); } catch { bytes = st.getContents?.(); }
    if (!bytes) return 0;
    parts.push(new TextDecoder('latin1').decode(bytes));
  }
  const src = parts.join('\n');
  const { text, count } = stripFromContent(src, boxes);
  if (!count) return 0;
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0) & 255);
  const ref = doc.context.register(doc.context.stream(bytes));
  pg.node.set(L.PDFName.of('Contents'), ref);
  return count;
}
