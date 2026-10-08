// Objectes superposats (text, ressaltats, dibuix, imatges, rectangles) i les seves interaccions
import { S, pageById, findObj, commit, emit, on } from './state.js';
import { el, uid, clamp, clone } from './util.js';
import { hooks } from './viewer.js';
import { t, addStrings } from './i18n.js';

addStrings({ pasteHere: ['Enganxat', 'Pegado', 'Pasted'] });

export const FONT_CSS = {
  Helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  Times: '"Times New Roman", Times, "Liberation Serif", serif',
  Courier: '"Courier New", Courier, "Liberation Mono", monospace',
};
// Fracció de la mida de la font on cau la línia base dins d'una línia de 1.2 d'alçada
export const BASELINE = { Helvetica: 0.9465, Times: 0.9375, Courier: 0.8665 };
export const LINE_H = 1.2;

let editing = null;          // { pid, oid, node }
let viewerRef = null;
export const isEditing = () => !!editing;
export function initObjects(viewer) { viewerRef = viewer; }

// ---------------- selecció ----------------
export function selectObj(pid, oid) {
  if (S.sel && S.sel.pid === pid && S.sel.oid === oid) return;
  const old = S.sel;
  S.sel = pid ? { pid, oid } : null;
  if (old) viewerRef.refreshLayers(old.pid);
  if (S.sel) viewerRef.refreshLayers(S.sel.pid);
  emit('selection', S.sel);
}
export const deselect = () => selectObj(null, null);

export function addObject(pid, obj, select = true) {
  const p = pageById(pid); if (!p) return null;
  obj.id = obj.id || uid('o');
  p.objs.push(obj);
  commit('content');
  viewerRef.refreshLayers(pid);
  if (select) selectObj(pid, obj.id);
  return obj;
}
export function deleteObj(pid, oid) {
  const p = pageById(pid); if (!p) return;
  const i = p.objs.findIndex((o) => o.id === oid); if (i < 0) return;
  p.objs.splice(i, 1);
  if (S.sel && S.sel.oid === oid) { S.sel = null; emit('selection', null); }
  commit('content'); viewerRef.refreshLayers(pid);
}
export function deleteSelected() { if (S.sel) deleteObj(S.sel.pid, S.sel.oid); }

let clipboard = null;
export function copySelected() { const o = findObj(S.sel); if (o) clipboard = clone(o); }
export function pasteObject(dx = 12) {
  if (!clipboard) return false;
  const e = S.pages[S.cur]; if (!e) return false;
  const o = clone(clipboard); o.id = uid('o');
  shiftObj(o, dx, dx);
  clipboard = clone(o);
  addObject(e.id, o); return true;
}
export function duplicateSelected() { copySelected(); return pasteObject(); }

export function shiftObj(o, dx, dy) {
  if (o.rects) o.rects.forEach((r) => { r.x += dx; r.y += dy; });
  else if (o.paths) { o.paths.forEach((p) => p.forEach((pt) => { pt[0] += dx; pt[1] += dy; })); o.x += dx; o.y += dy; }
  else { o.x += dx; o.y += dy; }
}
export function objBounds(o) {
  if (o.rects) {
    const x0 = Math.min(...o.rects.map((r) => r.x)), y0 = Math.min(...o.rects.map((r) => r.y));
    const x1 = Math.max(...o.rects.map((r) => r.x + r.w)), y1 = Math.max(...o.rects.map((r) => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return { x: o.x, y: o.y, w: o.w ?? 0, h: o.h ?? 0 };
}
export function inkBBox(paths, width) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const m = width / 2;
  return { x: x0 - m, y: y0 - m, w: Math.max(1, x1 - x0 + width), h: Math.max(1, y1 - y0 + width) };
}

// ---------------- render de capes ----------------
export function renderLayers(pv) {
  if (editing && editing.pid === pv.pid) return;
  const e = pv.entry; if (!e) return;
  const s = pv.s;
  pv.hlLayer.replaceChildren();
  pv.objLayer.replaceChildren();
  let badge = pv.el.querySelector('.ocr-badge');
  if (e.ocr && !badge) pv.el.append(el('span', { class: 'ocr-badge', text: 'OCR' }));
  else if (!e.ocr && badge) badge.remove();
  for (const o of e.objs) {
    const selected = S.sel && S.sel.oid === o.id;
    if (o.type === 'hl' || o.type === 'ul' || o.type === 'st') {
      for (const r of o.rects) {
        const d = el('div', { class: 'hl-rect' + (selected ? ' sel' : '') });
        const px = r.x * s, py = r.y * s, pw = r.w * s, ph = r.h * s;
        Object.assign(d.style, { left: px + 'px', top: py + 'px', width: pw + 'px', height: ph + 'px' });
        const th = Math.max(1, r.h * 0.07 * s);
        if (o.type === 'hl') d.style.background = o.color;
        else if (o.type === 'ul') Object.assign(d.style, { top: py + ph - th * 1.5 + 'px', height: th + 'px', background: o.color });
        else Object.assign(d.style, { top: py + ph * 0.52 - th / 2 + 'px', height: th + 'px', background: o.color });
        if (selected) { d.style.outline = '1.5px solid var(--sel)'; d.style.mixBlendMode = 'normal'; }
        pv.hlLayer.append(d);
      }
      continue;
    }
    pv.objLayer.append(buildObjEl(pv, o, selected));
  }
}
hooks.renderLayers = renderLayers;

function buildObjEl(pv, o, selected) {
  const s = pv.s;
  const d = el('div', { class: 'obj ' + o.type + (selected ? ' sel' : ''), 'data-oid': o.id });
  const place = () => Object.assign(d.style, { left: o.x * s + 'px', top: o.y * s + 'px' });
  switch (o.type) {
    case 'text': case 'textedit': {
      place();
      Object.assign(d.style, {
        fontSize: o.size * s + 'px', color: o.color, fontFamily: FONT_CSS[o.font] || FONT_CSS.Helvetica,
        fontWeight: o.bold ? '700' : '400', fontStyle: o.italic ? 'italic' : 'normal', textAlign: o.align || 'left',
      });
      if (o.type === 'textedit') {
        d.classList.add('text');
        Object.assign(d.style, { width: o.w * s + 'px', minHeight: o.h * s + 'px', whiteSpace: 'pre', background: o.cover || '#fff', lineHeight: o.lineH ? o.lineH * s + 'px' : '' });
      } else if (o.w) { d.style.width = o.w * s + 'px'; d.style.whiteSpace = 'pre-wrap'; }
      else d.style.whiteSpace = 'pre';
      d.textContent = o.text;
      break;
    }
    case 'rect': {
      place();
      Object.assign(d.style, { width: o.w * s + 'px', height: o.h * s + 'px' });
      if (o.fill) d.style.background = o.fill;
      if (o.stroke && o.width > 0) d.style.border = `${Math.max(1, o.width * s)}px solid ${o.stroke}`;
      break;
    }
    case 'img': {
      place();
      Object.assign(d.style, { width: o.w * s + 'px', height: o.h * s + 'px', opacity: o.opacity ?? 1 });
      const im = S.images.get(o.img);
      if (im) d.append(el('img', { src: im.url, draggable: 'false' }));
      break;
    }
    case 'ink': {
      place();
      Object.assign(d.style, { width: o.w * s + 'px', height: o.h * s + 'px' });
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `${o.x} ${o.y} ${o.w} ${o.h}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      for (const hit of [false, true]) for (const path of o.paths) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', pathD(path));
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
        if (hit) { p.setAttribute('stroke', 'transparent'); p.setAttribute('stroke-width', Math.max(o.width, 12 / s)); p.style.pointerEvents = 'stroke'; p.style.cursor = 'move'; }
        else { p.setAttribute('stroke', o.color); p.setAttribute('stroke-width', o.width); p.style.pointerEvents = 'none'; }
        svg.append(p);
      }
      d.append(svg);
      break;
    }
  }
  if (selected && ['text', 'img', 'rect'].includes(o.type)) {
    const dirs = o.type === 'text' ? ['w', 'e'] : o.type === 'textedit' ? [] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (const dir of dirs) d.append(el('i', { class: 'h', 'data-d': dir }));
  }
  d.addEventListener('pointerdown', (ev) => onObjPointerDown(ev, pv, o.id));
  d.addEventListener('dblclick', () => { if (o.type === 'text' || o.type === 'textedit') startEdit(pv.pid, o.id); });
  return d;
}
function pathD(pts) {
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]} l0.01 0`;
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d;
}

// ---------------- arrossegar / redimensionar ----------------
function onObjPointerDown(ev, pv, oid) {
  if (ev.button > 0 || editing) return;
  if (S.tool !== 'select' && S.tool !== 'text') return;
  const e = pv.entry; const o = e.objs.find((x) => x.id === oid); if (!o) return;
  if (editing && editing.oid === oid) return;
  ev.stopPropagation();
  const wasSel = S.sel && S.sel.oid === oid;
  selectObj(pv.pid, oid);
  const handle = ev.target.closest?.('.h');
  const dir = handle?.dataset.d || null;
  const start = pv.clientToLocalPt(ev.clientX, ev.clientY);
  const orig = clone(o);
  let moved = false;
  const move = (m) => {
    const cur = pv.clientToLocalPt(m.clientX, m.clientY);
    let dx = cur[0] - start[0], dy = cur[1] - start[1];
    if (!moved && Math.hypot(dx, dy) * pv.s < 4) return;
    moved = true;
    const live = e.objs.find((x) => x.id === oid); if (!live) return;
    if (!dir) {
      // restaura i desplaça
      Object.assign(live, clone(orig)); shiftObj(live, dx, dy);
    } else resizeObj(live, orig, dir, dx, dy, m.shiftKey);
    renderLayers(pv);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (moved) commit('content');
    else if (wasSel && !dir && (o.type === 'text' || o.type === 'textedit')) startEdit(pv.pid, oid);
    else if (S.tool === 'text' && !dir && (o.type === 'text' || o.type === 'textedit')) startEdit(pv.pid, oid);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

function resizeObj(o, orig, dir, dx, dy, keep) {
  let { x, y, w, h } = orig;
  if (orig.type === 'text' && !orig.w) w = 100;
  if (orig.type === 'text') h = 0;
  const ar = orig.type === 'img' ? orig.w / orig.h : null;
  if (dir.includes('e')) w = orig.w + dx;
  if (dir.includes('w')) { x = orig.x + dx; w = (orig.w || w) - dx; }
  if (dir.includes('s')) h = orig.h + dy;
  if (dir.includes('n')) { y = orig.y + dy; h = orig.h - dy; }
  if (ar && (dir.length === 2 || keep)) {
    if (dir.includes('e') || dir.includes('w')) { h = w / ar; if (dir.includes('n')) y = orig.y + orig.h - h; }
    else { w = h * ar; }
  }
  const min = 6;
  if (w < min) { if (dir.includes('w')) x -= min - w; w = min; }
  if (h < min && orig.type !== 'text') { if (dir.includes('n')) y -= min - h; h = min; }
  o.x = x; o.y = y; o.w = w;
  if (orig.type !== 'text') o.h = h;
}

// ---------------- edició de text ----------------
export function startEdit(pid, oid) {
  const pv = viewerRef.views.get(pid); const p = pageById(pid);
  const o = p?.objs.find((x) => x.id === oid); if (!pv || !o) return;
  if (editing) finishEdit();
  selectObj(pid, oid);
  const node = pv.objLayer.querySelector(`[data-oid="${oid}"]`); if (!node) return;
  node.querySelectorAll('.h').forEach((h) => h.remove());
  node.contentEditable = 'plaintext-only';
  if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true';
  node.spellcheck = false;
  node.style.whiteSpace = o.type === 'textedit' || !o.w ? 'pre' : 'pre-wrap';
  node.style.touchAction = 'auto';
  editing = { pid, oid, node };
  node.addEventListener('paste', (ev) => { ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain')); });
  node.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); node.blur(); return; } if (!(ev.ctrlKey || ev.metaKey)) ev.stopPropagation(); }, true);
  node.addEventListener('blur', () => finishEdit(), { once: true });
  node.focus();
  const r = document.createRange(); r.selectNodeContents(node);
  if (!o.text) r.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  emit('editing', true);
}
export function finishEdit() {
  if (!editing) return;
  const { pid, oid, node } = editing; editing = null;
  const p = pageById(pid); const o = p?.objs.find((x) => x.id === oid);
  const pv = viewerRef.views.get(pid);
  node.contentEditable = 'false';
  if (o && pv) {
    let txt = node.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    if (o.type === 'text') {
      if (!txt.trim()) { p.objs.splice(p.objs.indexOf(o), 1); S.sel = null; emit('selection', null); commit('content'); }
      else {
        const changed = txt !== o.text;
        o.text = txt;
        if (!o.w) o.w = Math.max(24, node.offsetWidth / pv.s + 2);
        o.h = node.offsetHeight / pv.s;
        if (changed || o._new) commit('content'); delete o._new;
      }
    } else if (o.type === 'textedit') {
      if (txt !== o.text) { o.text = txt; commit('content'); }
    }
    pv.refreshLayers();
  }
  emit('editing', false);
}

// ---------------- creació amb eines ----------------
let pendingPlace = null; // { kind:'img', imgId, w, h } | { kind:'rect', resolve }

export function needsCapture(tool) { return ['text', 'ink', 'rect'].includes(tool) || !!pendingPlace; }
export function setPlacement(p) { const old = pendingPlace; pendingPlace = p; if (old && old !== p) old.cancel?.(); emit('toolchange'); }
export const getPlacement = () => pendingPlace;

export function installPageEvents(container) {
  container.addEventListener('pointerdown', onPagePointerDown);
  document.addEventListener('pointerup', onDocPointerUp);
  container.addEventListener('contextmenu', () => {});
}

function pvFromEvent(ev) { return ev.target.closest?.('.pg')?.pv || null; }

function onPagePointerDown(ev) {
  if (ev.button > 0) return;
  const pv = pvFromEvent(ev); if (!pv) return;
  if (ev.target.closest('.obj') || ev.target.closest('.fld')) return;
  const tool = S.tool;
  if (editing) { finishEdit(); }
  if (pendingPlace && ev.target === pv.capture) return startRectDrag(ev, pv, (r) => finishPlacement(pv, r));
  if (tool === 'text' && ev.target === pv.capture) {
    ev.preventDefault();
    const [u, v] = pv.clientToLocalPt(ev.clientX, ev.clientY);
    const op = S.opts.text;
    const o = { id: uid('o'), type: 'text', x: u - 2, y: v - op.size * 0.55, w: null, text: '', size: op.size, color: op.color, font: op.font, bold: op.bold, italic: op.italic, _new: true };
    pv.entry.objs.push(o);
    pv.refreshLayers();
    startEdit(pv.pid, o.id);
    return;
  }
  if (tool === 'ink' && ev.target === pv.capture) return startInk(ev, pv);
  if (tool === 'rect' && ev.target === pv.capture) return startRectDrag(ev, pv, (r) => {
    if (r.w < 3 || r.h < 3) return;
    const op = S.opts.rect;
    addObject(pv.pid, { type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, stroke: op.stroke, fill: op.fill, width: op.width });
  });
  if ((tool === 'hl' || tool === 'ul' || tool === 'st') && !ev.target.closest('.textLayer span')) {
    startRectDrag(ev, pv, (r) => {
      if (r.w < 4 || r.h < 4) return;
      addObject(pv.pid, { type: tool, rects: [r], color: S.opts[tool].color }, false);
    });
    return;
  }
  if (tool === 'select') { if (S.sel) deselect(); }
}

function startRectDrag(ev, pv, done) {
  ev.preventDefault();
  const a = pv.clientToLocalPt(ev.clientX, ev.clientY);
  const draft = el('div', { class: 'draft' });
  pv.frame.append(draft);
  const s = pv.s;
  const rectOf = (m) => {
    const b = pv.clientToLocalPt(m.clientX, m.clientY);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
  };
  const move = (m) => { const r = rectOf(m); Object.assign(draft.style, { left: r.x * s + 'px', top: r.y * s + 'px', width: r.w * s + 'px', height: r.h * s + 'px' }); };
  const up = (m) => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    draft.remove(); done(rectOf(m), pv);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

function finishPlacement(pv, r) {
  const pl = pendingPlace; pendingPlace = null; emit('toolchange');
  if (!pl) return;
  if (pl.kind === 'rect') { pl.resolve(r.w > 4 && r.h > 4 ? { pid: pv.pid, ...r } : { pid: pv.pid, x: r.x, y: r.y, w: 0, h: 0 }); return; }
  if (pl.kind === 'img') {
    let { x, y, w, h } = r;
    const ar = pl.w / pl.h;
    if (w < 6 || h < 6) {
      const info = pv.info;
      w = Math.min(info.w * 0.4, pl.w * 0.75); h = w / ar;
      x = r.x - w / 2; y = r.y - h / 2;
    } else if (w / h > ar) w = h * ar; else h = w / ar;
    x = clamp(x, 0, Math.max(0, pv.info.w - w)); y = clamp(y, 0, Math.max(0, pv.info.h - h));
    addObject(pv.pid, { type: 'img', x, y, w, h, img: pl.imgId, opacity: S.opts.img.opacity });
    if (pl.after) pl.after();
  }
}

function startInk(ev, pv) {
  ev.preventDefault();
  const op = S.opts.ink; const s = pv.s;
  const pts = [pv.clientToLocalPt(ev.clientX, ev.clientY)];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, width: pv.pw + 'px', height: pv.ph + 'px', overflow: 'visible', pointerEvents: 'none' });
  svg.setAttribute('viewBox', `0 0 ${pv.pw / s} ${pv.ph / s}`);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', op.color); path.setAttribute('stroke-width', op.width);
  path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
  svg.append(path); pv.frame.append(svg);
  path.setAttribute('d', pathD(pts));
  const move = (m) => {
    const evs = m.getCoalescedEvents ? m.getCoalescedEvents() : [m];
    for (const c of evs) {
      const p = pv.clientToLocalPt(c.clientX, c.clientY); const l = pts[pts.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) * s > 1.5) pts.push(p);
    }
    path.setAttribute('d', pathD(pts));
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    svg.remove();
    const paths = [simplify(pts)];
    const bb = inkBBox(paths, op.width);
    addObject(pv.pid, { type: 'ink', paths, color: op.color, width: op.width, ...bb }, false);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function simplify(pts) { // elimina punts quasi col·lineals
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    if (cross / len > 0.15) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------- ressaltat / subratllat per selecció de text ----------------
function onDocPointerUp(ev) {
  const tool = S.tool;
  if (tool === 'hl' || tool === 'ul' || tool === 'st') {
    setTimeout(() => applyTextMarkup(tool), 0);
    return;
  }
  if (tool === 'select' || tool === 'text') {
    // clic simple (sense selecció de text) sobre un ressaltat existent: selecciona'l
    const pv = pvFromEvent(ev);
    if (!pv || ev.target.closest('.obj') || ev.target.closest('.fld')) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed) return;
    const [u, v] = pv.clientToLocalPt(ev.clientX, ev.clientY);
    const list = pv.entry.objs;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (!o.rects) continue;
      if (o.rects.some((r) => u >= r.x - 1 && u <= r.x + r.w + 1 && v >= r.y - 1 && v <= r.y + r.h + 1)) { selectObj(pv.pid, o.id); return; }
    }
  }
}

export function applyTextMarkup(tool) {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  let node = range.commonAncestorContainer; node = node.nodeType === 1 ? node : node.parentElement;
  // pot abastar diverses pàgines: processa cada capa de text implicada
  const layers = [...document.querySelectorAll('#pages .textLayer')].filter((l) => sel.containsNode(l, true) || l.contains(node));
  let made = 0;
  for (const layer of layers) {
    const pv = layer.closest('.pg').pv;
    const rects = [];
    const lr = layer.getBoundingClientRect();
    for (const span of layer.querySelectorAll('span')) {
      if (!sel.containsNode(span, true)) continue;
      const tn = span.firstChild; if (!tn) continue;
      const r = document.createRange();
      r.selectNodeContents(span);
      // retalla als límits de la selecció
      if (span.contains(range.startContainer)) { try { r.setStart(range.startContainer, range.startOffset); } catch {} }
      if (span.contains(range.endContainer)) { try { r.setEnd(range.endContainer, range.endOffset); } catch {} }
      for (const c of r.getClientRects()) {
        if (c.width < 1 || c.height < 1) continue;
        if (c.height > lr.height * 0.3) continue;
        rects.push(pv.clientRectToLocal(c));
      }
    }
    const merged = mergeRects(rects);
    if (merged.length) {
      pv.entry.objs.push({ id: uid('o'), type: tool, rects: merged, color: S.opts[tool].color });
      made++;
      pv.refreshLayers();
    }
  }
  if (made) { sel.removeAllRanges(); commit('content'); }
}
function mergeRects(rs) {
  rs.sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const r of rs) {
    const l = out[out.length - 1];
    if (l && Math.abs(l.y - r.y) < l.h * 0.4 && Math.abs(l.h - r.h) < l.h * 0.5 && r.x <= l.x + l.w + 3) {
      const x1 = Math.max(l.x + l.w, r.x + r.w); l.x = Math.min(l.x, r.x); l.w = x1 - l.x;
      const y0 = Math.min(l.y, r.y), y1 = Math.max(l.y + l.h, r.y + r.h); l.y = y0; l.h = y1 - y0;
    } else out.push({ ...r });
  }
  return out;
}

// Canvia propietats de l'objecte seleccionat (barra d'opcions)
export function updateSelected(props, final = true) {
  const o = findObj(S.sel); if (!o) return false;
  Object.assign(o, props);
  if (o.type === 'text' || o.type === 'textedit') {
    const pv = viewerRef.views.get(S.sel.pid);
    pv?.refreshLayers();
    const node = pv?.objLayer.querySelector(`[data-oid="${o.id}"]`);
    if (node && !editing && o.type === 'text') { o.h = node.offsetHeight / pv.s; if (!o.w) { /* auto */ } }
  } else if (o.type === 'ink') {
    Object.assign(o, inkBBox(o.paths, o.width));
    viewerRef.refreshLayers(S.sel.pid);
  } else viewerRef.refreshLayers(S.sel.pid);
  if (final) commit('content');
  return true;
}
