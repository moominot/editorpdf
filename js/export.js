// Generació del PDF final amb pdf-lib a partir de l'estat (pàgines, objectes, formularis, OCR)
import { S } from './state.js';
import { pageInfo, getPdfPage } from './pdfsource.js';
import { hexToRgb01 } from './util.js';
import { BASELINE, LINE_H } from './objects.js';

const L = () => window.PDFLib;
const FONTKIT = () => window.fontkit;

const fontFileCache = new Map();
async function fetchFont(file) {
  if (!fontFileCache.has(file)) fontFileCache.set(file, fetch(new URL('../vendor/fonts/' + file, import.meta.url)).then((r) => r.arrayBuffer()));
  return fontFileCache.get(file);
}
const DEJAVU = {
  Helvetica: ['DejaVuSans', '-Bold', '-Oblique', '-BoldOblique'],
  Times: ['DejaVuSerif', '-Bold', '-Italic', '-BoldItalic'],
  Courier: ['DejaVuSansMono', '-Bold', '-Oblique', '-BoldOblique'],
};
const STD = {
  Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
  Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
  Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
};

class FontPool {
  constructor(doc) { this.doc = doc; this.cache = new Map(); this.kit = false; }
  async get(family = 'Helvetica', bold = false, italic = false, text = '') {
    const v = (bold ? 1 : 0) + (italic ? 2 : 0);
    const fam = STD[family] ? family : 'Helvetica';
    const std = await this.std(fam, v);
    try { std.encodeText(text); return std; } catch { /* caràcters fora de WinAnsi */ }
    return this.unicode(fam, v);
  }
  async std(fam, v) {
    const k = `s${fam}${v}`;
    if (!this.cache.has(k)) this.cache.set(k, await this.doc.embedFont(L().StandardFonts[STD[fam][v]]));
    return this.cache.get(k);
  }
  async unicode(fam, v) {
    const k = `u${fam}${v}`;
    if (!this.cache.has(k)) {
      if (!this.kit) { this.doc.registerFontkit(FONTKIT()); this.kit = true; }
      const [base, ...suf] = DEJAVU[fam];
      const bytes = await fetchFont(base + (v === 0 ? '' : suf[v - 1]) + '.ttf');
      this.cache.set(k, await this.doc.embedFont(bytes, { subset: true }));
    }
    return this.cache.get(k);
  }
}

export function wrapText(text, font, size, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!maxW) { out.push(para); continue; }
    const words = para.split(/( +)/); // conserva els espais
    let line = '';
    for (const w of words) {
      const cand = line + w;
      if (line && font.widthOfTextAtSize(cand.replace(/ +$/, ''), size) > maxW) {
        out.push(line.replace(/ +$/, '')); line = w.replace(/^ +/, '');
      } else line = cand;
      while (font.widthOfTextAtSize(line, size) > maxW && line.length > 1) { // paraula més llarga que la caixa
        let i = line.length - 1;
        while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > maxW) i--;
        out.push(line.slice(0, i)); line = line.slice(i);
      }
    }
    out.push(line);
  }
  return out;
}

const rgbOf = (hex) => { const [r, g, b] = hexToRgb01(hex); return L().rgb(r, g, b); };

async function drawText(pg, fonts, o, view) {
  const lines = (o.text || '').length ? o.text : '';
  if (!lines) return;
  const font = await fonts.get(o.font, o.bold, o.italic, o.text);
  const size = o.size, lh = size * LINE_H;
  const arr = wrapText(o.text, font, size, o.w ? o.w + 0.5 : 0);
  const base = (BASELINE[o.font] ?? 0.9465) * size;
  const color = rgbOf(o.color);
  arr.forEach((line, i) => {
    if (!line) return;
    let x = view[0] + o.x;
    if (o.w && o.align && o.align !== 'left') {
      const lw = font.widthOfTextAtSize(line, size);
      x += o.align === 'center' ? (o.w - lw) / 2 : o.w - lw;
    }
    pg.drawText(line, { x, y: view[3] - (o.y + base + i * lh), size, font, color });
  });
}

function drawInk(pg, o, view) {
  const { pushGraphicsState, popGraphicsState, setLineWidth, setLineCap, setLineJoin, LineCapStyle, LineJoinStyle, setStrokingColor, moveTo, lineTo, stroke } = L();
  const ops = [pushGraphicsState(), setLineWidth(o.width), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round), setStrokingColor(rgbOf(o.color))];
  for (const path of o.paths) {
    if (!path.length) continue;
    const X = (p) => view[0] + p[0], Y = (p) => view[3] - p[1];
    ops.push(moveTo(X(path[0]), Y(path[0])));
    if (path.length === 1) ops.push(lineTo(X(path[0]) + 0.01, Y(path[0])));
    for (let i = 1; i < path.length; i++) ops.push(lineTo(X(path[i]), Y(path[i])));
    ops.push(stroke());
  }
  ops.push(popGraphicsState());
  pg.pushOperators(...ops);
}

function addMarkup(doc, pg, o, view) {
  const { PDFString, PDFName } = L();
  const ctx = doc.context;
  const [r, g, b] = hexToRgb01(o.color);
  const quads = []; let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  let content = `${r} ${g} ${b} rg ${r} ${g} ${b} RG\n/GS gs\n`;
  for (const rc of o.rects) {
    const x0 = view[0] + rc.x, x1 = x0 + rc.w, yT = view[3] - rc.y, yB = yT - rc.h;
    quads.push(x0, yT, x1, yT, x0, yB, x1, yB);
    bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x1); by0 = Math.min(by0, yB); by1 = Math.max(by1, yT);
    const th = Math.max(0.6, rc.h * 0.07);
    if (o.type === 'hl') content += `${x0} ${yB} ${rc.w} ${rc.h} re f\n`;
    else {
      const yy = o.type === 'ul' ? yB + th * 0.8 : yB + rc.h * 0.48;
      content += `${th} w ${x0} ${yy} m ${x1} ${yy} l S\n`;
    }
  }
  const ap = ctx.stream(content, {
    Type: 'XObject', Subtype: 'Form', BBox: [bx0, by0, bx1, by1],
    Resources: { ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 } } },
  });
  const apRef = ctx.register(ap);
  const sub = { hl: 'Highlight', ul: 'Underline', st: 'StrikeOut' }[o.type];
  const annot = ctx.obj({
    Type: 'Annot', Subtype: sub, Rect: [bx0, by0, bx1, by1], QuadPoints: quads, C: [r, g, b], F: 4,
    AP: { N: apRef }, T: PDFString.of('PDF Simple'),
  });
  pg.node.addAnnot(ctx.register(annot));
}

async function drawObjects(doc, pg, entry, view, fonts, imgCache) {
  const { degrees } = L();
  for (const o of entry.objs) {
    switch (o.type) {
      case 'text': await drawText(pg, fonts, o, view); break;
      case 'rect': {
        const opt = { x: view[0] + o.x, y: view[3] - o.y - o.h, width: o.w, height: o.h };
        if (o.fill) opt.color = rgbOf(o.fill);
        if (o.stroke && o.width > 0) { opt.borderColor = rgbOf(o.stroke); opt.borderWidth = o.width; }
        if (opt.color || opt.borderColor) pg.drawRectangle(opt);
        break;
      }
      case 'ink': drawInk(pg, o, view); break;
      case 'img': {
        const im = S.images.get(o.img); if (!im) break;
        let emb = imgCache.get(o.img);
        if (!emb) { emb = im.mime === 'image/jpeg' ? await doc.embedJpg(im.bytes) : await doc.embedPng(im.bytes); imgCache.set(o.img, emb); }
        pg.drawImage(emb, { x: view[0] + o.x, y: view[3] - o.y - o.h, width: o.w, height: o.h, opacity: o.opacity ?? 1 });
        break;
      }
      case 'hl': case 'ul': case 'st': addMarkup(doc, pg, o, view); break;
    }
  }
  // capa de text OCR invisible
  const ocrW = entry.ocr ? S.ocrStore.get(entry.ocr.id)?.words || [] : [];
  if (ocrW.length) {
    for (const w of ocrW) {
      const txt = w.t; if (!txt) continue;
      const font = await fonts.get('Helvetica', false, false, txt);
      let size = Math.max(2, w.h * 0.85);
      const natural = font.widthOfTextAtSize(txt, size);
      if (natural > 0 && w.w > 0 && w.rot % 180 === 0) { const f = w.w / natural; if (f < 1) size = Math.max(1.5, size * f); }
      pg.drawText(txt, { x: view[0] + w.x, y: view[3] - w.y, size, font, opacity: 0, rotate: degrees(w.rot || 0) });
    }
  }
}

// ----- formularis -----
async function applyForms(doc, fonts) {
  const names = Object.keys(S.forms);
  if (!names.length) return;
  const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = L();
  const form = doc.getForm();
  let needUnicode = false;
  for (const name of names) {
    const val = S.forms[name];
    let f; try { f = form.getField(name); } catch { continue; }
    try {
      if (f instanceof PDFTextField) {
        const s = Array.isArray(val) ? val.join('\n') : String(val ?? '');
        try { f.setText(s || undefined); } catch { needUnicode = true; f.setText(s); }
      } else if (f instanceof PDFCheckBox) { val ? f.check() : f.uncheck(); }
      else if (f instanceof PDFRadioGroup) { if (val) f.select(String(val)); else f.clear(); }
      else if (f instanceof PDFDropdown) { if (val) f.select(String(val)); else f.clear(); }
      else if (f instanceof PDFOptionList) { const a = Array.isArray(val) ? val : val ? [val] : []; if (a.length) f.select(a); else f.clear(); }
    } catch (e) { console.warn('camp', name, e); }
  }
  try {
    const helv = await fonts.std('Helvetica', 0);
    form.updateFieldAppearances(helv);
  } catch (e) {
    try { form.updateFieldAppearances(await fonts.unicode('Helvetica', 0)); } catch (e2) { console.warn('appearances', e2); }
  }
}

// ----- rasterització (PDF xifrats que pdf-lib no pot copiar) -----
async function rasterPages(entries, progress) {
  const { PDFDocument, degrees } = L();
  const out = await PDFDocument.create();
  const list = []; let n = 0;
  for (const e of entries) {
    const info = e.blank ? { w: e.blank.w, h: e.blank.h, view: [0, 0, e.blank.w, e.blank.h], nativeRot: 0 } : await pageInfo(e.src, e.idx);
    const pg = out.addPage([info.w, info.h]);
    if (!e.blank) {
      const page = await getPdfPage(e.src, e.idx);
      const vp = page.getViewport({ scale: 2.2, rotation: 0 }); // sense rotar: la rotació s'aplica després com al camí normal
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await page.render({ canvas: cv, viewport: vp }).promise;
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      pg.drawImage(img, { x: 0, y: 0, width: info.w, height: info.h });
      if (info.nativeRot) pg.setRotation(degrees(info.nativeRot));
    }
    list.push({ pg, e, info: { view: [0, 0, info.w, info.h], nativeRot: info.nativeRot } });
    progress?.(++n / (entries.length * 2));
  }
  return { doc: out, list };
}

export async function buildPdf({ onlyPages = null, progress = null } = {}) {
  const { PDFDocument, PDFPage, degrees } = L();
  const main = S.sources.get(S.mainId);
  if (!main) throw new Error('No hi ha cap document');
  if (main.isXfa) return await main.doc.saveDocument();
  if (!onlyPages && S.pristine) return main.bytes;
  const entries = onlyPages ? S.pages.filter((p) => onlyPages.includes(p.id)) : S.pages;

  let doc = null, list = [], fonts;
  try { doc = await PDFDocument.load(main.bytes, { updateMetadata: false, throwOnInvalidObject: false }); }
  catch (err) { if (!/encrypt/i.test(String(err?.message || err))) throw err; }

  if (!doc) {
    ({ doc, list } = await rasterPages(entries, progress));
    fonts = new FontPool(doc);
  } else {
    fonts = new FontPool(doc);
    await applyForms(doc, fonts);
    const orig = doc.getPages();
    const srcDocs = new Map();
    const getSrc = async (id) => {
      if (!srcDocs.has(id)) srcDocs.set(id, PDFDocument.load(S.sources.get(id).bytes, { updateMetadata: false, throwOnInvalidObject: false }));
      return srcDocs.get(id);
    };
    const used = new Set(); let n = 0;
    for (const e of entries) {
      let pg;
      if (e.blank) { pg = PDFPage.create(doc); pg.setSize(e.blank.w, e.blank.h); }
      else if (e.src === S.mainId) {
        if (!used.has(e.idx)) { pg = orig[e.idx]; used.add(e.idx); } else { [pg] = await doc.copyPages(doc, [e.idx]); }
      } else {
        const od = await getSrc(e.src);
        [pg] = await doc.copyPages(od, [e.idx]);
      }
      list.push({ pg, e });
      progress?.(++n / (entries.length * 2));
    }
    const identity = list.length === orig.length && list.every((x, i) => x.pg === orig[i]);
    if (!identity) {
      for (let i = orig.length - 1; i >= 0; i--) doc.removePage(i);
      for (const { pg } of list) doc.addPage(pg);
    }
  }

  const imgCache = new Map();
  let n = 0;
  for (const x of list) {
    const { pg, e } = x;
    const info = x.info || (e.blank ? { view: [0, 0, e.blank.w, e.blank.h], nativeRot: 0 } : await pageInfo(e.src, e.idx));
    if (e.rot) pg.setRotation(degrees((pg.getRotation().angle + e.rot) % 360));
    for (const o of e.objs) if (o.type === 'rect' && o.rm && !x.info) {
      try { const m = await import('./textedit.js'); await m.stripTextInBox(doc, pg, o.rm, info.view); } catch (err) { console.warn('stripText', err); }
    }
    if (e.objs.length || e.ocr) {
      if (!x.info) wrapContent(doc, pg);
      await drawObjects(doc, pg, e, info.view, fonts, imgCache);
    }
    progress?.(0.5 + ++n / (list.length * 2));
  }
  return await doc.save({ useObjectStreams: false });
}

// Embolcalla el contingut existent amb q ... Q perquè les nostres operacions parteixin d'un estat net
function wrapContent(doc, pg) {
  const ctx = doc.context;
  const a = ctx.register(ctx.stream('q\n')), b = ctx.register(ctx.stream('\nQ\n'));
  try { pg.node.wrapContentStreams(a, b); } catch (e) { console.warn('wrap', e); }
}

