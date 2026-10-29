// Marques de revisió (núvols, fletxes, línies, el·lipses, notes, segells) i mesures amb escala (distància,
// perímetre, àrea). Són objectes del visor que en desar es converteixen en anotacions PDF reals (annots.js).
import { S, on, commit, pageById } from './state.js';
import { el, uid } from './util.js';
import { t, addStrings, getLang } from './i18n.js';
import { modal, toast } from './ui.js';
import { cfg } from './config.js';
import { objHooks, addObject } from './objects.js';
import { optHooks, refreshOptbar } from './optbar.js';
import { cloudPath, cloudRadius, arrowHead, ticks, polyLength, polyArea, labelAnchor, addMarkupAnnot } from './annots.js';

addStrings({
  tMarkup: ['Marques de revisió (núvol, fletxa, nota, segell…)', 'Marcas de revisión (nube, flecha, nota, sello…)', 'Review markup (cloud, arrow, note, stamp…)'],
  tMeasure: ['Mesura (distància, perímetre, àrea)', 'Medir (distancia, perímetro, área)', 'Measure (distance, perimeter, area)'],
  mkCloud: ['Núvol', 'Nube', 'Cloud'], mkArrow: ['Fletxa', 'Flecha', 'Arrow'], mkLine: ['Línia', 'Línea', 'Line'],
  mkEllipse: ['El·lipse', 'Elipse', 'Ellipse'], mkNote: ['Nota', 'Nota', 'Note'], mkStamp: ['Segell', 'Sello', 'Stamp'],
  mkHlT: ['Ressaltat', 'Resaltado', 'Highlight'], mkUlT: ['Subratllat', 'Subrayado', 'Underline'], mkStT: ['Ratllat', 'Tachado', 'Strikeout'],
  msDist: ['Distància', 'Distancia', 'Distance'], msPerim: ['Perímetre', 'Perímetro', 'Perimeter'], msArea: ['Àrea', 'Área', 'Area'], msCalib: ['Calibra', 'Calibrar', 'Calibrate'],
  mkComment: ['Comentari', 'Comentario', 'Comment'],
  mkStampText: ['Text', 'Texto', 'Text'],
  mkNoteAsk: ['Text de la nota:', 'Texto de la nota:', 'Note text:'],
  hintMarkup: ['Arrossega per dibuixar; la nota i el segell es col·loquen amb un clic.', 'Arrastra para dibujar; la nota y el sello se colocan con un clic.', 'Drag to draw; notes and stamps are placed with a click.'],
  hintMeasure: ['Distància: arrossega o fes dos clics. Perímetre i àrea: clic a cada vèrtex i doble clic o Retorn per acabar (Esc cancel·la, ⌫ desfà un punt, Maj fixa angles).', 'Distancia: arrastra o haz dos clics. Perímetro y área: clic en cada vértice y doble clic o Intro para acabar (Esc cancela, ⌫ deshace un punto, Mayús fija ángulos).', 'Distance: drag or click twice. Perimeter and area: click each vertex, double-click or Enter to finish (Esc cancels, ⌫ undoes a point, Shift snaps angles).'],
  hintCalib: ['Dibuixa una línia sobre una cota coneguda.', 'Dibuja una línea sobre una cota conocida.', 'Draw a line over a known dimension.'],
  msScale: ['Escala', 'Escala', 'Scale'],
  msScaleBtn: ['Escala…', 'Escala…', 'Scale…'],
  msScaleTitle: ['Escala de mesura', 'Escala de medida', 'Measurement scale'],
  msRatio: ['Escala del plànol 1 :', 'Escala del plano 1 :', 'Drawing scale 1 :'],
  msUnit: ['Unitat', 'Unidad', 'Unit'],
  msApplyAll: ['Aplica-la a totes les pàgines', 'Aplicarla a todas las páginas', 'Apply to all pages'],
  msCalibAsk: ['Longitud real de la línia dibuixada:', 'Longitud real de la línea dibujada:', 'Real length of the drawn line:'],
  msCalibrated: ['calibrada', 'calibrada', 'calibrated'],
  msNoScale: ['Aquesta pàgina no té escala: es mesura a mida real del paper (1:1). Defineix-la amb «Escala…».', 'Esta página no tiene escala: se mide a tamaño real del papel (1:1). Defínela con «Escala…».', 'This page has no scale: measuring at paper size (1:1). Set it with “Scale…”.'],
  msScaleSet: ['Escala {0} aplicada', 'Escala {0} aplicada', 'Scale {0} applied'],
});

export const MARKUP = new Set(['line', 'ellipse', 'cloud', 'note', 'stamp', 'measure']);
export const STAMPS = [['REVISAT', 'ForComment'], ['APROVAT', 'Approved'], ['NO APROVAT', 'NotApproved'], ['ESBORRANY', 'Draft'], ['CONFORME', 'Approved']];
S.opts.markup = { shape: 'cloud', color: '#e11d48', width: 1.5, stamp: 'REVISAT' };
S.opts.measure = { kind: 'dist', color: '#1d4ed8', width: 1, fs: 0 }; // fs 0: segons la mida de la pàgina

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); return n; };
const author = () => cfg('author') || '';
const now = () => new Date().toISOString();
const locale = () => ({ ca: 'ca-ES', es: 'es-ES' }[getLang()] || 'en-GB');
export const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString(locale()) : '');
// Mida de lletra i de nota proporcional a la pàgina (en un A1 un 9 pt no es llegiria)
const baseSize = (pv) => Math.max(9, Math.min(pv.info.w, pv.info.h) / 55);
const pageRot = (pv) => pv.rot;

// ---------- escala i valors ----------
const MM_PER_PT = 25.4 / 72, UNIT_MM = { mm: 1, cm: 10, m: 1000 };
export const defaultScale = () => ({ factor: MM_PER_PT, unit: 'mm', label: '1:1' });
export const scaleOf = (e) => e?.scale || defaultScale();
const num = (v) => v.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function measureValue(o) {
  if (o.kind === 'area') return polyArea(o.pts) * o.factor * o.factor;
  return polyLength(o.pts) * o.factor;
}
export const measureLabel = (o) => `${num(measureValue(o))} ${o.unit}${o.kind === 'area' ? '²' : ''}`;

// Caixa d'un objecte amb punts (inclou l'etiqueta i les puntes)
function refit(o) {
  if (!o.pts) return;
  let m = Math.max((o.width || 1.5) * 4, 6);
  if (o.type === 'measure') m = Math.max(m, (o.fs || 9) * 1.2);
  const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]);
  let x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m, x1 = Math.max(...xs) + m, y1 = Math.max(...ys) + m;
  if (o.type === 'measure') { // l'etiqueta pot sortir de la caixa dels punts
    const [ax, ay] = labelAnchor(o), half = measureLabel(o).length * o.fs * 0.3;
    x0 = Math.min(x0, ax - half); x1 = Math.max(x1, ax + half); y0 = Math.min(y0, ay - half); y1 = Math.max(y1, ay + half);
  }
  Object.assign(o, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}
objHooks.refit = refit;

// ---------- dibuix al visor ----------
function svgFor(o) {
  const svg = svgEl('svg', { viewBox: `${o.x} ${o.y} ${o.w} ${o.h}`, preserveAspectRatio: 'none' });
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible' });
  return svg;
}
const ptsAttr = (pts) => pts.map((p) => p.join(',')).join(' ');
// Afegeix la forma visible i una còpia transparent més gruixuda per poder-la clicar
function shape(svg, tag, attrs, o, fillHit = false) {
  svg.append(svgEl(tag, { ...attrs, fill: attrs.fill || 'none', stroke: o.color, 'stroke-width': o.width ?? 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'pointer-events:none' }));
  const hit = svgEl(tag, { ...attrs, fill: fillHit ? 'transparent' : 'none', stroke: 'transparent', 'stroke-width': Math.max(o.width ?? 1.5, 10), style: `pointer-events:${fillHit ? 'all' : 'stroke'};cursor:move` });
  svg.append(hit);
}
function labelSvg(svg, text, [x, y], size, rot) {
  const g = svgEl('g', { transform: rot ? `rotate(${-rot} ${x} ${y})` : null, style: 'pointer-events:none' });
  const tx = svgEl('text', { x, y, 'font-size': size, 'font-family': 'Helvetica, Arial, sans-serif', 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: 'currentColor', stroke: 'none' });
  tx.textContent = text;
  g.append(tx); svg.append(g);
}

function build(pv, o, d, selected) {
  const s = pv.s;
  if (o.pts) refit(o);
  Object.assign(d.style, { left: o.x * s + 'px', top: o.y * s + 'px', width: o.w * s + 'px', height: o.h * s + 'px', color: o.color });
  d.classList.add('mk');
  const svg = svgFor(o);
  switch (o.type) {
    case 'line':
      shape(svg, 'line', { x1: o.pts[0][0], y1: o.pts[0][1], x2: o.pts[1][0], y2: o.pts[1][1] }, o);
      if (o.arrow) shape(svg, 'polyline', { points: ptsAttr(arrowHead(o.pts[0], o.pts[1], Math.max(6, (o.width ?? 1.5) * 4))) }, o);
      break;
    case 'ellipse':
      shape(svg, 'ellipse', { cx: o.x + o.w / 2, cy: o.y + o.h / 2, rx: o.w / 2, ry: o.h / 2 }, o, true);
      break;
    case 'cloud': {
      const [s0, curves] = cloudPath(o.x, o.y, o.w, o.h, cloudRadius(o.w, o.h));
      shape(svg, 'path', { d: `M${s0.join(' ')} ` + curves.map(([a, b, c]) => `C${a.join(' ')} ${b.join(' ')} ${c.join(' ')}`).join(' ') + ' Z' }, o, true);
      svg.style.overflow = 'visible';
      break;
    }
    case 'note': {
      const { x, y, w: z } = o;
      svg.append(svgEl('path', { d: `M${x} ${y}h${z}v${z * 0.72}h${-z * 0.55}l${-z * 0.25} ${z * 0.28}l${z * 0.05} ${-z * 0.28}h${-z * 0.25}z`, fill: o.color, stroke: '#fff', 'stroke-width': z / 18, style: 'cursor:move' }));
      for (const k of [0.22, 0.38, 0.54]) svg.append(svgEl('line', { x1: x + z * 0.18, y1: y + z * k, x2: x + z * 0.82, y2: y + z * k, stroke: '#fff', 'stroke-width': z / 18, style: 'pointer-events:none' }));
      d.title = [o.author, dateText(o.date)].filter(Boolean).join(' · ') + (o.note ? '\n' + o.note : '');
      break;
    }
    case 'stamp': {
      const { x, y, w, h } = o;
      svg.append(svgEl('rect', { x, y, width: w, height: h, rx: h * 0.15, fill: 'rgba(255,255,255,.01)', stroke: o.color, 'stroke-width': Math.max(1.5, h / 14), style: 'cursor:move' }));
      const big = svgEl('text', { x: x + w / 2, y: y + h * 0.56, 'font-size': h * 0.48, 'font-family': 'Helvetica, Arial, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: o.color, stroke: 'none', textLength: w * 0.9, lengthAdjust: 'spacingAndGlyphs', style: 'pointer-events:none' });
      big.textContent = o.text; svg.append(big);
      const sub = [o.author, dateText(o.date)].filter(Boolean).join(' · ');
      if (sub) { const tx = svgEl('text', { x: x + w / 2, y: y + h * 0.86, 'font-size': h * 0.17, 'font-family': 'Helvetica, Arial, sans-serif', 'text-anchor': 'middle', fill: o.color, stroke: 'none', style: 'pointer-events:none' }); tx.textContent = sub; svg.append(tx); }
      break;
    }
    case 'measure': {
      const closed = o.kind === 'area';
      if (closed) svg.append(svgEl('polygon', { points: ptsAttr(o.pts), fill: o.color, 'fill-opacity': 0.15, stroke: 'none', style: 'pointer-events:none' }));
      shape(svg, closed ? 'polygon' : 'polyline', { points: ptsAttr(o.pts) }, o, closed);
      if (o.kind === 'dist') for (const tk of ticks(o.pts[0], o.pts[1], o.fs * 0.9)) shape(svg, 'polyline', { points: ptsAttr(tk) }, o);
      labelSvg(svg, measureLabel(o), labelAnchor(o), o.fs, pageRot(pv));
      break;
    }
  }
  d.append(svg);
  if (selected && o.pts) o.pts.forEach((p, i) => d.append(el('i', { class: 'v', 'data-i': i, style: { left: (p[0] - o.x) * s - 6 + 'px', top: (p[1] - o.y) * s - 6 + 'px' } })));
  if (o.type === 'note') d.addEventListener('dblclick', () => editNote(pv.pid, o.id));
}
for (const k of MARKUP) objHooks.build[k] = build;
for (const k of ['ellipse', 'cloud', 'stamp']) objHooks.resizable.add(k);

// ---------- creació ----------
function preview(pv) {
  const svg = svgEl('svg', { viewBox: `0 0 ${pv.pw / pv.s} ${pv.ph / pv.s}`, class: 'mk-preview' });
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, width: pv.pw + 'px', height: pv.ph + 'px', overflow: 'visible', pointerEvents: 'none' });
  pv.frame.append(svg);
  return svg;
}
function snap(a, b, on) {
  if (!on || !a) return b;
  const ang = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / (Math.PI / 12)) * (Math.PI / 12), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
}
const common = () => ({ id: uid('o'), author: author(), date: now(), note: '' });

// Arrossegar per dibuixar (línia, fletxa, el·lipse, núvol)
function dragShape(ev, pv, kind) {
  ev.preventDefault();
  const op = S.opts.markup, a = pv.clientToLocalPt(ev.clientX, ev.clientY);
  const svg = preview(pv);
  const tmp = (b) => {
    const o = kind === 'line' || kind === 'arrow'
      ? { type: 'line', arrow: kind === 'arrow', pts: [a, b] }
      : { type: kind, x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
    return { ...o, color: op.color, width: op.width };
  };
  let last = a;
  const move = (m) => {
    last = pv.clientToLocalPt(m.clientX, m.clientY);
    if (kind === 'line' || kind === 'arrow') last = snap(a, last, m.shiftKey);
    const o = tmp(last); svg.replaceChildren();
    const d = el('div'); build(pv, o, d, false);
    const inner = d.querySelector('svg'); inner.setAttribute('x', o.x); inner.setAttribute('y', o.y); inner.setAttribute('width', o.w); inner.setAttribute('height', o.h);
    inner.removeAttribute('style'); inner.style.overflow = 'visible'; svg.append(inner);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    svg.remove();
    const o = tmp(last);
    const big = o.pts ? Math.hypot(last[0] - a[0], last[1] - a[1]) > 3 : o.w > 4 && o.h > 4;
    if (!big) return;
    if (o.pts) refit(o);
    addObject(pv.pid, { ...o, ...common() }, false);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

async function askText(title, value = '') {
  const ta = el('textarea', { rows: 4, style: { width: '100%', font: 'inherit' } }); ta.value = value;
  const r = await modal({ title, body: ta, buttons: [{ label: t('cancel'), value: false }, { label: t('accept'), value: true, primary: true }], onOpen: () => setTimeout(() => ta.focus(), 30) });
  return r ? ta.value : null;
}
async function editNote(pid, oid) {
  const o = pageById(pid)?.objs.find((x) => x.id === oid); if (!o) return;
  const v = await askText(t('mkComment'), o.note); if (v == null || v === o.note) return;
  o.note = v; commit('content'); window.__app.viewer.refreshLayers(pid); refreshOptbar();
}

async function markupTool(ev, pv) {
  const op = S.opts.markup;
  if (op.shape === 'note' || op.shape === 'stamp') {
    ev.preventDefault();
    const [u, v] = pv.clientToLocalPt(ev.clientX, ev.clientY), b = baseSize(pv);
    if (op.shape === 'note') {
      const text = await askText(t('mkNoteAsk')); if (text == null) return;
      const z = b * 2.2;
      addObject(pv.pid, { type: 'note', x: u - z / 2, y: v - z / 2, w: z, h: z, color: op.color === '#e11d48' ? '#f59e0b' : op.color, ...common(), note: text }, false);
    } else {
      const h = b * 4, w = Math.max(h * 3.2, op.stamp.length * h * 0.42);
      addObject(pv.pid, { type: 'stamp', x: u - w / 2, y: v - h / 2, w, h, text: op.stamp, stampName: STAMPS.find(([k]) => k === op.stamp)?.[1] || 'Draft', color: op.color, ...common() }, false);
    }
    return;
  }
  dragShape(ev, pv, op.shape);
}

// Mesures: estat del dibuix en curs (punts, previsualització)
let draw = null;
function measureTool(ev, pv) {
  ev.preventDefault();
  const kind = S.opts.measure.kind;
  const p = snap(draw?.pts.at(-1), pv.clientToLocalPt(ev.clientX, ev.clientY), ev.shiftKey);
  if (draw && draw.pv !== pv) cancelDraw();
  if (!draw) {
    if (!pv.entry.scale && kind !== 'calib') toast(t('msNoScale'), '', 5000);
    draw = { pv, kind, pts: [p], svg: preview(pv), t: 0, hover: p, downAt: Date.now(), down: p };
    window.addEventListener('pointermove', onDrawMove);
    window.addEventListener('keydown', onDrawKey, true);
    if (kind === 'dist' || kind === 'calib') window.addEventListener('pointerup', onDistUp, { once: true });
    renderDraw();
    return;
  }
  const dbl = Date.now() - draw.t < 350 && Math.hypot(p[0] - draw.pts.at(-1)[0], p[1] - draw.pts.at(-1)[1]) * pv.s < 8;
  draw.t = Date.now();
  if (dbl) return finishDraw();
  draw.pts.push(p);
  if ((draw.kind === 'dist' || draw.kind === 'calib') && draw.pts.length >= 2) return finishDraw();
  renderDraw();
}
// Distància arrossegant: si en deixar anar el punter s'ha mogut prou, acaba
function onDistUp(m) {
  if (!draw) return;
  const p = snap(draw.pts[0], draw.pv.clientToLocalPt(m.clientX, m.clientY), m.shiftKey);
  if (Math.hypot(p[0] - draw.pts[0][0], p[1] - draw.pts[0][1]) * draw.pv.s > 8) { draw.pts.push(p); finishDraw(); }
}
function onDrawMove(m) {
  if (!draw) return;
  draw.hover = snap(draw.pts.at(-1), draw.pv.clientToLocalPt(m.clientX, m.clientY), m.shiftKey);
  renderDraw();
}
function onDrawKey(e) {
  if (!draw) return;
  if (e.key === 'Escape') cancelDraw();
  else if (e.key === 'Enter') finishDraw();
  else if (e.key === 'Backspace') { if (draw.pts.length > 1) draw.pts.pop(); else cancelDraw(); renderDraw(); }
  else return;
  e.preventDefault(); e.stopPropagation();
}
function draftObj() {
  const e = draw.pv.entry, sc = scaleOf(e), kind = draw.kind === 'calib' ? 'dist' : draw.kind;
  return { type: 'measure', kind, pts: [...draw.pts, draw.hover].filter(Boolean), factor: sc.factor, unit: sc.unit, scaleLabel: sc.label, color: S.opts.measure.color, width: S.opts.measure.width, fs: S.opts.measure.fs || baseSize(draw.pv) };
}
function renderDraw() {
  if (!draw) return;
  const o = draftObj(); draw.svg.replaceChildren();
  if (o.pts.length < 2) return;
  if (o.kind === 'area' && o.pts.length < 3) o.kind = 'perim';
  refit(o);
  const d = el('div'); build(draw.pv, o, d, false);
  const inner = d.querySelector('svg'); inner.removeAttribute('style'); inner.style.overflow = 'visible'; inner.style.color = o.color;
  inner.setAttribute('x', o.x); inner.setAttribute('y', o.y); inner.setAttribute('width', o.w); inner.setAttribute('height', o.h);
  draw.svg.append(inner);
}
function cleanupDraw() {
  window.removeEventListener('pointermove', onDrawMove);
  window.removeEventListener('keydown', onDrawKey, true);
  window.removeEventListener('pointerup', onDistUp);
  draw?.svg.remove(); draw = null;
}
function cancelDraw() { cleanupDraw(); }
async function finishDraw() {
  if (!draw) return;
  const { pv, kind } = draw; const pts = draw.pts.slice();
  const o = { ...draftObj(), pts };
  cleanupDraw();
  const need = kind === 'area' ? 3 : 2;
  if (pts.length < need) return;
  if (kind === 'calib') return calibrate(pv, polyLength(pts));
  refit(o);
  addObject(pv.pid, { ...o, ...common() }, false);
}
on('toolchange', () => { if (draw && S.tool !== 'measure') cancelDraw(); });

objHooks.tools.markup = markupTool;
objHooks.tools.measure = measureTool;

// ---------- escala ----------
function setScale(ids, sc) {
  for (const id of ids) {
    const e = pageById(id); if (!e) continue;
    e.scale = sc;
    for (const o of e.objs) if (o.type === 'measure') { Object.assign(o, { factor: sc.factor, unit: sc.unit, scaleLabel: sc.label }); refit(o); }
  }
  commit('content'); window.__app.viewer.refreshLayers(); refreshOptbar();
  toast(t('msScaleSet', sc.label), 'ok');
}
const ratioScale = (n, unit) => ({ factor: MM_PER_PT * n / UNIT_MM[unit], unit, label: `1:${n}` });
function unitSelect(v) { const s = el('select'); for (const u of ['m', 'cm', 'mm']) s.append(el('option', { value: u, text: u })); s.value = v; return s; }

async function scaleDialog() {
  const e = S.pages[S.cur]; if (!e) return;
  const cur = scaleOf(e);
  const n = el('input', { type: 'number', min: 1, step: 1, value: /^1:(\d+(\.\d+)?)$/.exec(cur.label)?.[1] || 100, style: { width: '90px' } });
  const unit = unitSelect(cur.unit === 'mm' && cur.label === '1:1' ? 'm' : cur.unit);
  const all = el('input', { type: 'checkbox', checked: S.pages.length > 1 });
  const body = el('div', {},
    el('label', { class: 'row' }, el('span', { text: t('msRatio') }), n),
    el('label', { class: 'row' }, el('span', { text: t('msUnit') }), unit),
    el('label', { class: 'row', style: { gap: '8px' } }, all, el('span', { text: t('msApplyAll') })),
    el('p', { class: 'muted', text: t('hintCalib') }));
  const r = await modal({ title: t('msScaleTitle'), body, buttons: [{ label: t('msCalib'), value: 'calib' }, { label: t('cancel'), value: false }, { label: t('accept'), value: true, primary: true }] });
  if (r === 'calib') { S.opts.measure.kind = 'calib'; refreshOptbar(); toast(t('hintCalib'), '', 5000); return; }
  if (!r || !(+n.value > 0)) return;
  setScale(all.checked ? S.pages.map((p) => p.id) : [e.id], ratioScale(+n.value, unit.value));
}
async function calibrate(pv, lenPt) {
  const v = el('input', { type: 'number', min: 0, step: 'any', style: { width: '110px' } });
  const unit = unitSelect(scaleOf(pv.entry).unit === 'mm' ? 'm' : scaleOf(pv.entry).unit);
  const all = el('input', { type: 'checkbox', checked: S.pages.length > 1 });
  const body = el('div', {}, el('p', { text: t('msCalibAsk') }), el('div', { style: { display: 'flex', gap: '8px' } }, v, unit),
    el('label', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, all, el('span', { text: t('msApplyAll') })));
  const r = await modal({ title: t('msCalib'), body, buttons: [{ label: t('cancel'), value: false }, { label: t('accept'), value: true, primary: true }], onOpen: () => setTimeout(() => v.focus(), 30) });
  S.opts.measure.kind = 'dist'; refreshOptbar();
  const real = parseFloat(String(v.value).replace(',', '.'));
  if (!r || !(real > 0) || !(lenPt > 0)) return;
  const factor = real / lenPt, ratio = factor * UNIT_MM[unit.value] / MM_PER_PT;
  setScale(all.checked ? S.pages.map((p) => p.id) : [pv.pid], { factor, unit: unit.value, label: `≈1:${Math.round(ratio)} (${t('msCalibrated')})` });
}

// ---------- barra d'opcions ----------
const SHAPES = [['cloud', 'mkCloud', 'i-cloud'], ['arrow', 'mkArrow', 'i-arrow'], ['line', 'mkLine', 'i-line'], ['ellipse', 'mkEllipse', 'i-ellipse'], ['note', 'mkNote', 'i-note'], ['stamp', 'mkStamp', 'i-stamp']];
const KINDS = [['dist', 'msDist', 'i-ruler'], ['perim', 'msPerim', 'i-perim'], ['area', 'msArea', 'i-area'], ['calib', 'msCalib', 'i-target']];
const MK_COLORS = ['#e11d48', '#f59e0b', '#16a34a', '#1d4ed8', '#000000'];
const iconBtn = (ico, title, on, fn) => el('button', { class: 'ib' + (on ? ' on' : ''), title, html: `<svg><use href="#${ico}"/></svg>`, onclick: fn });

function commentInput(o) {
  const i = el('input', { type: 'text', value: o.note || '', placeholder: t('mkComment'), style: { width: '200px' } });
  i.addEventListener('change', () => { o.note = i.value; commit('content'); });
  i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
  return el('label', {}, t('mkComment'), i);
}
function widthInput(src, apply) {
  const w = el('input', { type: 'number', min: 0.5, max: 20, step: 0.5, value: src.width ?? 1.5 });
  w.addEventListener('change', () => { if (+w.value > 0) apply({ width: +w.value }); });
  return el('label', {}, t('width'), w);
}
function fsInput(v, apply) {
  const i = el('input', { type: 'number', min: 1, max: 200, step: 1, value: Math.round(v * 10) / 10 });
  i.addEventListener('input', () => { if (+i.value >= 1) apply({ fs: +i.value }, false); });
  i.addEventListener('change', () => { if (+i.value >= 1) apply({ fs: +i.value }); });
  return el('label', {}, t('size'), i);
}
function stampSelect(cur, fn) {
  const s = el('select'); for (const [k] of STAMPS) s.append(el('option', { value: k, text: k }));
  if (!STAMPS.some(([k]) => k === cur)) s.append(el('option', { value: cur, text: cur }));
  s.value = cur; s.addEventListener('change', () => fn(s.value));
  return el('label', {}, t('mkStampText'), s);
}

optHooks.markup = ({ kids, apply, rebuild, swatches, colorInput }) => {
  const op = S.opts.markup;
  kids.push(...SHAPES.map(([k, n, ico]) => iconBtn(ico, t(n), op.shape === k, () => { op.shape = k; rebuild(); })), el('span', { class: 'sep' }));
  kids.push(...swatches(MK_COLORS, op.color, (c) => { apply({ color: c }); rebuild(); }), colorInput(op.color, (v) => apply({ color: v }, false), (v) => apply({ color: v })));
  if (op.shape === 'stamp') kids.push(stampSelect(op.stamp, (v) => { op.stamp = v; }));
  else if (op.shape !== 'note') kids.push(widthInput(op, apply));
  kids.push(el('span', { class: 'hint tip', text: t('hintMarkup') }));
};
const measureOpts = ({ kids, apply, rebuild, colorInput }) => {
  const op = S.opts.measure, sc = scaleOf(S.pages[S.cur]);
  kids.push(...KINDS.map(([k, n, ico]) => iconBtn(ico, t(n), op.kind === k, () => { cancelDraw(); op.kind = k; rebuild(); if (k === 'calib') toast(t('hintCalib'), '', 5000); })), el('span', { class: 'sep' }));
  kids.push(el('button', { class: 'tb', text: `${t('msScale')} ${sc.label} (${sc.unit})`, title: t('msScaleBtn'), onclick: scaleDialog }));
  kids.push(colorInput(op.color, (v) => apply({ color: v }, false), (v) => apply({ color: v })));
  const pv = window.__app.viewer.views.get(S.pages[S.cur]?.id);
  if (op.kind !== 'calib') kids.push(fsInput(op.fs || (pv?.info ? baseSize(pv) : 12), apply));
  kids.push(el('span', { class: 'hint tip', text: t(op.kind === 'calib' ? 'hintCalib' : 'hintMeasure') }));
};
// Objecte seleccionat
const objectOpts = ({ o, kids, apply, rebuild, swatches, colorInput }) => {
  if (o.type === 'measure') kids.push(el('strong', { text: measureLabel(o), style: { color: o.color } }));
  kids.push(...swatches(MK_COLORS, o.color, (c) => { apply({ color: c }); rebuild(); }), colorInput(o.color, (v) => apply({ color: v }, false), (v) => apply({ color: v })));
  if (o.type === 'stamp') kids.push(stampSelect(o.text, (v) => apply({ text: v, stampName: STAMPS.find(([k]) => k === v)?.[1] || 'Draft' })));
  else if (o.type !== 'note') kids.push(widthInput(o, apply));
  if (o.type === 'measure') kids.push(fsInput(o.fs, apply));
  if (o.type === 'line') kids.push(iconBtn('i-arrow', t('mkArrow'), o.arrow, () => { apply({ arrow: !o.arrow }); rebuild(); }));
  kids.push(commentInput(o));
};
// «measure» és alhora el nom de l'eina i el tipus d'objecte: amb un objecte seleccionat, les opcions de l'objecte
for (const k of MARKUP) optHooks[k] = (a) => (a.o ? objectOpts(a) : k === 'measure' ? measureOpts(a) : null);

// ---------- exportació ----------
export async function exportMarkup(doc, pg, o, view, fonts) {
  const font = await fonts.std('Helvetica', 0);
  const rot = pg.getRotation().angle % 360;
  addMarkupAnnot(doc, pg, { ...o, dateText: dateText(o.date) }, view, font, { label: o.type === 'measure' ? measureLabel(o) : '', rot, author: o.author || author(), date: o.date ? new Date(o.date) : new Date() });
}

export const typeName = (o) => t({ line: o.arrow ? 'mkArrow' : 'mkLine', ellipse: 'mkEllipse', cloud: 'mkCloud', note: 'mkNote', stamp: 'mkStamp', hl: 'mkHlT', ul: 'mkUlT', st: 'mkStT', measure: { dist: 'msDist', perim: 'msPerim', area: 'msArea' }[o.kind] }[o.type] || o.type);
export { editNote };
