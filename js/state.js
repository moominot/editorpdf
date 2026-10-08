// Estat global del document, historial (desfés/refés) i bus d'esdeveniments.
import { clone, uid } from './util.js';

export const S = {
  sources: new Map(),   // id -> { id, name, bytes, doc (pdfjs), numPages, encrypted, signed, isXfa }
  mainId: null,         // font principal (la que es desa "al lloc": formularis, signatures, etc.)
  pages: [],            // [{ id, src, idx, rot, blank:{w,h}|null, objs:[], ocr:null }]
  forms: {},            // nomCamp -> valor
  images: new Map(),    // imgId -> { bytes, mime, w, h, url }
  ocrStore: new Map(),  // id -> { words:[...] } (fora de l'historial per no engreixar-lo)
  file: { name: '', handle: null, driveId: null, driveParents: null },
  dirty: false,
  pristine: true,       // true si no hi ha cap canvi respecte als bytes originals
  zoom: 1,
  tool: 'select',
  sel: null,            // { pid, oid } objecte seleccionat
  pageSel: new Set(),   // pàgines seleccionades a les miniatures
  anchor: null,         // últim clic a miniatures (per a Maj+clic)
  cur: 0,               // índex de pàgina actual
  opts: {
    text: { size: 14, color: '#000000', font: 'Helvetica', bold: false, italic: false },
    hl: { color: '#ffe600' },
    ul: { color: '#e11d48' },
    st: { color: '#e11d48' },
    ink: { color: '#1d4ed8', width: 2 },
    rect: { stroke: '#e11d48', fill: '', width: 2 },
    img: { opacity: 1 },
  },
};

// ---------- esdeveniments ----------
const handlers = new Map();
export function on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); }
export function emit(ev, data) { (handlers.get(ev) || []).forEach((f) => f(data)); }

// ---------- helpers de pàgines ----------
export const pageById = (pid) => S.pages.find((p) => p.id === pid);
export const pageIndex = (pid) => S.pages.findIndex((p) => p.id === pid);
export function newPage(src, idx, extra = {}) { return { id: uid('p'), src, idx, rot: 0, blank: null, objs: [], ocr: null, ...extra }; }
export function findObj(sel) {
  if (!sel) return null;
  const p = pageById(sel.pid);
  return p ? p.objs.find((o) => o.id === sel.oid) || null : null;
}

// ---------- historial ----------
let hist = [], hi = -1;
const snap = () => JSON.stringify({ pages: S.pages, forms: S.forms });

export function resetHistory() { hist = [snap()]; hi = 0; emit('history'); }

// Crida després de qualsevol mutació de S.pages / S.forms
export function commit(kind = 'content') {
  const s = snap();
  if (hist[hi] === s) { emit('history'); return; }
  hist = hist.slice(0, hi + 1);
  hist.push(s);
  if (hist.length > 200) hist.shift();
  hi = hist.length - 1;
  S.dirty = true; S.pristine = false;
  emit('changed', kind);
  emit('history');
}
export const canUndo = () => hi > 0;
export const canRedo = () => hi < hist.length - 1;
function restore() {
  const o = JSON.parse(hist[hi]);
  S.pages = o.pages; S.forms = o.forms;
  S.sel = null;
  const alive = new Set(S.pages.map((p) => p.id));
  S.pageSel = new Set([...S.pageSel].filter((p) => alive.has(p)));
  S.dirty = hi !== 0 || S.dirty; S.pristine = hi === 0 && S.pristine;
  emit('restore'); emit('history'); emit('changed', 'restore');
}
export function undo() { if (canUndo()) { hi--; restore(); } }
export function redo() { if (canRedo()) { hi++; restore(); } }

export function addImage(bytes, mime, w, h) {
  const id = uid('img');
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  S.images.set(id, { bytes, mime, w, h, url });
  return id;
}

export function resetDoc(keepSources = false) {
  if (!keepSources) { for (const s of S.sources.values()) { try { s.doc?.destroy(); } catch {} } S.sources.clear(); }
  S.pages = []; S.forms = {}; S.mainId = null;
  for (const i of S.images.values()) URL.revokeObjectURL(i.url);
  S.images.clear(); S.ocrStore.clear();
  S.sel = null; S.pageSel = new Set(); S.cur = 0; S.dirty = false; S.pristine = true;
  S.file = { name: '', handle: null, driveId: null, driveParents: null };
}
export { clone };
