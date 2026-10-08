// Operacions sobre pàgines: girar, esborrar, duplicar, afegir en blanc, importar, moure
import { S, commit, newPage } from './state.js';
import { uid, clone, parseRange } from './util.js';
export { parseRange };
import { openSource, pageInfo } from './pdfsource.js';

export const selectionOrCurrent = () => {
  const ids = S.pages.filter((p) => S.pageSel.has(p.id)).map((p) => p.id);
  return ids.length ? ids : S.pages[S.cur] ? [S.pages[S.cur].id] : [];
};

export function rotatePages(pids, delta) {
  for (const p of S.pages) if (pids.includes(p.id)) p.rot = (((p.rot + delta) % 360) + 360) % 360;
  commit('structure');
}

export function deletePages(pids) {
  if (pids.length >= S.pages.length) return false;
  S.pages = S.pages.filter((p) => !pids.includes(p.id));
  S.pageSel = new Set([...S.pageSel].filter((id) => !pids.includes(id)));
  if (S.sel && pids.includes(S.sel.pid)) S.sel = null;
  commit('structure');
  return true;
}

function cloneEntry(p) {
  const c = clone(p);
  c.id = uid('p');
  c.objs.forEach((o) => { o.id = uid('o'); });
  return c;
}
export function duplicatePages(pids) {
  const out = [];
  for (const p of S.pages) { out.push(p); if (pids.includes(p.id)) out.push(cloneEntry(p)); }
  S.pages = out; commit('structure');
}

export async function insertBlank(afterIdx) {
  const ref = S.pages[Math.max(0, Math.min(afterIdx, S.pages.length - 1))];
  let w = 595.28, h = 841.89;
  if (ref) {
    if (ref.blank) ({ w, h } = ref.blank);
    else { const info = await pageInfo(ref.src, ref.idx); const sw = (info.nativeRot + ref.rot) % 180; w = sw ? info.h : info.w; h = sw ? info.w : info.h; }
  }
  const e = newPage(null, 0, { blank: { w, h } });
  S.pages.splice(afterIdx + 1, 0, e);
  commit('structure');
  return e;
}

export async function importPages(bytes, name, afterIdx, askPassword, rangeFn) {
  const src = await openSource(bytes, name, askPassword);
  const idxs = rangeFn ? await rangeFn(src) : Array.from({ length: src.numPages }, (_, i) => i);
  if (!idxs || !idxs.length) { S.sources.delete(src.id); src.doc.destroy(); return 0; }
  const entries = idxs.map((i) => newPage(src.id, i));
  S.pages.splice(afterIdx + 1, 0, ...entries);
  commit('structure');
  return entries.length;
}

// Mou les pàgines indicades a la posició d'inserció (índex dins la llista actual)
export function movePages(pids, insertIndex) {
  const set = new Set(pids);
  const moving = S.pages.filter((p) => set.has(p.id));
  const rest = S.pages.filter((p) => !set.has(p.id));
  let idx = 0;
  for (let i = 0; i < insertIndex && i < S.pages.length; i++) if (!set.has(S.pages[i].id)) idx++;
  const before = S.pages.map((p) => p.id).join();
  rest.splice(idx, 0, ...moving);
  S.pages = rest;
  if (S.pages.map((p) => p.id).join() === before) return false;
  commit('structure');
  return true;
}
