// Marques de revisió i mesures com a anotacions PDF reals (amb aparença pròpia, /AP), i la geometria
// que comparteixen el visor (SVG) i el PDF. Coordenades "locals": punts des de dalt-esquerra de la vista.
// Sense dependències del navegador ni de pdf.js: es prova amb node (tests/run-tests.mjs).
const L = () => window.PDFLib;
const N = (s) => L().PDFName.of(s);

// ---------- geometria (local, y cap avall) ----------
// Núvol al voltant d'un rectangle: [inici, [[c1, c2, p], ...]] amb corbes cúbiques cap enfora
export function cloudPath(x, y, w, h, r) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const start = pts[0], curves = [];
  for (let k = 0; k < 4; k++) {
    const a = pts[k], b = pts[(k + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-6) continue;
    const n = Math.max(1, Math.round(len / (2 * r)));
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = uy, ny = -ux; // normal cap enfora (sentit horari)
    const seg = len / n, bump = seg * 0.62;
    for (let i = 0; i < n; i++) {
      const p = [a[0] + ux * seg * i, a[1] + uy * seg * i], q = [a[0] + ux * seg * (i + 1), a[1] + uy * seg * (i + 1)];
      curves.push([[p[0] + nx * bump - ux * seg * 0.1, p[1] + ny * bump - uy * seg * 0.1], [q[0] + nx * bump + ux * seg * 0.1, q[1] + ny * bump + uy * seg * 0.1], q]);
    }
  }
  return [start, curves];
}
export const cloudRadius = (w, h) => Math.max(4, Math.min(14, Math.min(w, h) / 4));
// Punta de fletxa oberta a p2: [ala1, p2, ala2]
export function arrowHead(p1, p2, size) {
  const a = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]), s = 0.45;
  return [[p2[0] - size * Math.cos(a - s), p2[1] - size * Math.sin(a - s)], p2, [p2[0] - size * Math.cos(a + s), p2[1] - size * Math.sin(a + s)]];
}
// Ticks perpendiculars als extrems d'una cota
export function ticks(p1, p2, size) {
  const a = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) + Math.PI / 2, dx = Math.cos(a) * size / 2, dy = Math.sin(a) * size / 2;
  return [[[p1[0] - dx, p1[1] - dy], [p1[0] + dx, p1[1] + dy]], [[p2[0] - dx, p2[1] - dy], [p2[0] + dx, p2[1] + dy]]];
}
export function polyLength(pts, closed = false) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 2) s += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
  return s;
}
export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
export function centroid(pts) {
  const a = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
  if (Math.abs(a) < 1e-6) return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  let cx = 0, cy = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], f = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; });
  return [cx / (6 * a), cy / (6 * a)];
}
// On va l'etiqueta d'una mesura (local) i amb quin desplaçament
export function labelAnchor(o) {
  if (o.kind === 'area') return centroid(o.pts);
  const k = o.kind === 'dist' ? 0 : Math.floor((o.pts.length - 1) / 2);
  const a = o.pts[k], b = o.pts[k + 1] || a;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - o.fs * 0.45];
}

// ---------- escriptura ----------
const hex = (s) => L().PDFHexString.fromText(String(s ?? ''));
const rgb = (c) => { const h = (c || '#000000').replace('#', ''); return [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) / 255 * 1000) / 1000); };
const f = (n) => (Math.round(n * 100) / 100).toString();

// Text per a una fon estàndard (WinAnsi): els caràcters que no hi caben es canvien per ?
function encodable(font, s) {
  let out = '';
  for (const ch of String(s)) { try { font.encodeText(ch); out += ch; } catch { out += '?'; } }
  return out;
}

// o: objecte del visor (marca o mesura); view: vista de la pàgina; font: PDFFont (Helvetica); extra: { label, rot }
export function addMarkupAnnot(doc, page, o, view, font, { label = '', rot = 0, author = '', date = new Date() } = {}) {
  const { PDFString } = L();
  const ctx = doc.context;
  const X = (x) => view[0] + x, Y = (y) => view[3] - y, P = (p) => `${f(X(p[0]))} ${f(Y(p[1]))}`;
  const [r, g, b] = rgb(o.color), w = o.width ?? 1.5;
  let ops = `q ${r} ${g} ${b} RG ${r} ${g} ${b} rg ${f(w)} w 1 J 1 j\n`;
  const ext = []; // punts locals que ha de cobrir la caixa
  const line = (pts, close = false) => { ops += `${P(pts[0])} m ` + pts.slice(1).map((p) => `${P(p)} l `).join('') + (close ? 'h ' : '') + 'S\n'; ext.push(...pts); };
  const resources = { Font: { Helv: font.ref } };
  const text = (s, [x, y], size, center = true) => {
    s = encodable(font, s); if (!s) return;
    const tw = font.widthOfTextAtSize(s, size), th = size;
    const a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const dx = center ? -tw / 2 : 0, dy = -th * 0.35; // centra horitzontalment i verticalment sobre l'àncora
    const tx = X(x) + c * dx - sn * dy, ty = Y(y) + sn * dx + c * dy;
    // caixa del text (sense fons: el dibuix de sota s'ha de continuar veient)
    const box = [[dx, dy - th * 0.25], [tw + dx, dy - th * 0.25], [tw + dx, th + dy], [dx, th + dy]]
      .map(([u, v]) => [X(x) + c * u - sn * v, Y(y) + sn * u + c * v]);
    ops += `BT /Helv ${f(size)} Tf ${f(c)} ${f(sn)} ${f(-sn)} ${f(c)} ${f(tx)} ${f(ty)} Tm ${font.encodeText(s).toString()} Tj ET\n`;
    for (const [u, v] of box) ext.push([u - view[0], view[3] - v]);
  };

  let subtype, dict = {};
  switch (o.type) {
    case 'line': {
      subtype = 'Line';
      line(o.pts);
      if (o.arrow) line(arrowHead(o.pts[0], o.pts[1], Math.max(6, w * 4)));
      dict = { L: [X(o.pts[0][0]), Y(o.pts[0][1]), X(o.pts[1][0]), Y(o.pts[1][1])], LE: [N('None'), N(o.arrow ? 'OpenArrow' : 'None')] };
      break;
    }
    case 'ellipse': {
      subtype = 'Circle';
      const k = 0.5523, cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = o.w / 2, ry = o.h / 2;
      const c = (x1, y1, x2, y2, x3, y3) => `${P([x1, y1])} ${P([x2, y2])} ${P([x3, y3])} c `;
      ops += `${P([cx + rx, cy])} m ` + c(cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry) + c(cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy)
        + c(cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry) + c(cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy) + 'h S\n';
      ext.push([o.x, o.y], [o.x + o.w, o.y + o.h]);
      break;
    }
    case 'cloud': {
      subtype = 'Polygon';
      const [s0, curves] = cloudPath(o.x, o.y, o.w, o.h, cloudRadius(o.w, o.h));
      ops += `${P(s0)} m ` + curves.map(([c1, c2, p]) => `${P(c1)} ${P(c2)} ${P(p)} c `).join('') + 'h S\n';
      const m = cloudRadius(o.w, o.h) * 0.8;
      ext.push([o.x - m, o.y - m], [o.x + o.w + m, o.y + o.h + m]);
      dict = { Vertices: [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].flatMap(([x, y]) => [X(x), Y(y)]), BE: { S: 'C', I: 1 }, IT: 'PolygonCloud' };
      break;
    }
    case 'note': {
      subtype = 'Text';
      const { x, y } = o, s = o.w;
      ops += `q 1 1 1 RG ${P([x, y])} m ${P([x + s, y])} l ${P([x + s, y + s * 0.72])} l ${P([x + s * 0.45, y + s * 0.72])} l ${P([x + s * 0.2, y + s])} l ${P([x + s * 0.25, y + s * 0.72])} l ${P([x, y + s * 0.72])} l h b Q\n`;
      ops += `q 1 1 1 RG ${f(Math.max(0.6, s / 18))} w ` + [0.22, 0.38, 0.54].map((k) => `${P([x + s * 0.18, y + s * k])} m ${P([x + s * 0.82, y + s * k])} l S`).join(' ') + ' Q\n';
      ext.push([x, y], [x + s, y + s]);
      dict = { Name: N('Comment'), Open: false };
      break;
    }
    case 'stamp': {
      subtype = 'Stamp';
      const { x, y, w: sw, h: sh } = o, bw = Math.max(1.5, sh / 14), rr = sh * 0.15;
      ops += `${f(bw)} w ${P([x + rr, y])} m ${P([x + sw - rr, y])} l ${P([x + sw, y])} ${P([x + sw, y])} ${P([x + sw, y + rr])} c ${P([x + sw, y + sh - rr])} l ${P([x + sw, y + sh])} ${P([x + sw, y + sh])} ${P([x + sw - rr, y + sh])} c `
        + `${P([x + rr, y + sh])} l ${P([x, y + sh])} ${P([x, y + sh])} ${P([x, y + sh - rr])} c ${P([x, y + rr])} l ${P([x, y])} ${P([x, y])} ${P([x + rr, y])} c h S\n`;
      const big = encodable(font, o.text || ''), size = Math.min(sh * 0.48, (sw * 0.9) / Math.max(1, font.widthOfTextAtSize(big, 1)));
      ops += `BT /Helv ${f(size)} Tf ${f(X(x + sw / 2) - font.widthOfTextAtSize(big, size) / 2)} ${f(Y(y + sh * 0.56))} Td ${font.encodeText(big).toString()} Tj ET\n`;
      const sub = encodable(font, [o.author, o.dateText].filter(Boolean).join(' · ')), ss = Math.min(sh * 0.17, (sw * 0.9) / Math.max(1, font.widthOfTextAtSize(sub, 1)));
      if (sub) ops += `BT /Helv ${f(ss)} Tf ${f(X(x + sw / 2) - font.widthOfTextAtSize(sub, ss) / 2)} ${f(Y(y + sh * 0.86))} Td ${font.encodeText(sub).toString()} Tj ET\n`;
      ext.push([x, y], [x + sw, y + sh]);
      dict = { Name: N(o.stampName || 'Draft') };
      break;
    }
    case 'measure': {
      const closed = o.kind === 'area';
      subtype = o.kind === 'dist' ? 'Line' : closed ? 'Polygon' : 'PolyLine';
      if (closed) { resources.ExtGState = { G0: { ca: 0.15 } }; ops += `q /G0 gs ${P(o.pts[0])} m ` + o.pts.slice(1).map((p) => `${P(p)} l `).join('') + 'h f Q\n'; }
      line(o.pts, closed);
      if (o.kind === 'dist') for (const tk of ticks(o.pts[0], o.pts[1], o.fs * 0.9)) line(tk);
      text(label, labelAnchor(o), o.fs);
      const fmt = (u, c) => ({ Type: 'NumberFormat', U: PDFString.of(u), C: c, D: 100 });
      dict = {
        IT: o.kind === 'dist' ? 'LineDimension' : closed ? 'PolygonDimension' : 'PolyLineDimension',
        Measure: { Type: 'Measure', Subtype: 'RL', R: PDFString.of(o.scaleLabel || ''), X: [fmt(o.unit, o.factor)], D: [fmt(o.unit, 1)], A: [fmt(o.unit + '²', 1)] },
        ...(o.kind === 'dist' ? { L: [X(o.pts[0][0]), Y(o.pts[0][1]), X(o.pts[1][0]), Y(o.pts[1][1])], LE: [N('None'), N('None')] } : { Vertices: o.pts.flatMap((p) => [X(p[0]), Y(p[1])]) }),
        ...(closed ? { IC: rgb(o.color) } : {}),
      };
      break;
    }
    default: return null;
  }
  ops += 'Q\n';
  const m = w + 2;
  const xs = ext.map((p) => X(p[0])), ys = ext.map((p) => Y(p[1]));
  const rect = [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  const ap = ctx.register(ctx.stream(ops, { Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: resources }));
  const when = L().PDFString.fromDate(date);
  const annot = ctx.obj({
    Type: 'Annot', Subtype: subtype, Rect: rect, C: rgb(o.color), F: 4, BS: { W: w }, AP: { N: ap },
    T: hex(author), Contents: hex([label, o.note].filter(Boolean).join('\n')), NM: hex(o.id), M: when, CreationDate: when, ...dict,
  });
  const ref = ctx.register(annot);
  page.node.addAnnot(ref);
  return ref;
}
