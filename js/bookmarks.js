// Marcadors (índex del document): llegir, anar-hi, afegir, reanomenar, eliminar, reordenar i niuar.
// Si no es toquen i les pàgines no canvien, en desar es conserven tal com eren al fitxer.
import { S, on, commit, pageIndex } from './state.js';
import { el, $, uid } from './util.js';
import { t, addStrings } from './i18n.js';
import { pageInfo, entryInfo } from './pdfsource.js';
import { writeOutline } from './pdfstruct.js';

addStrings({
  bmNone: ['Aquest document no té marcadors. Afegeix-ne amb +.', 'Este documento no tiene marcadores. Añade alguno con +.', 'This document has no bookmarks. Add one with +.'],
  bmAdd: ['Afegeix un marcador a la vista actual', 'Añadir un marcador en la vista actual', 'Add a bookmark at the current view'],
  bmRename: ['Reanomena (F2)', 'Renombrar (F2)', 'Rename (F2)'],
  bmDelete: ['Elimina (Supr)', 'Eliminar (Supr)', 'Delete (Del)'],
  bmUp: ['Mou amunt', 'Subir', 'Move up'],
  bmDown: ['Mou avall', 'Bajar', 'Move down'],
  bmIndent: ['Fes-lo fill de l\'anterior', 'Convertir en hijo del anterior', 'Nest under previous'],
  bmOutdent: ['Treu-lo un nivell', 'Subir un nivel', 'Move out one level'],
  bmTarget: ['Fes que apunti a la vista actual', 'Apuntar a la vista actual', 'Point to the current view'],
  bmNoDest: ['La pàgina d\'aquest marcador ja no hi és', 'La página de este marcador ya no existe', 'This bookmark\'s page no longer exists'],
});

// ---------- lectura (pdf.js) ----------
export async function initOutline() {
  S.outline = { edited: false, items: [] };
  const src = S.sources.get(S.mainId);
  if (!src || src.isXfa) return;
  let raw = null; try { raw = await src.doc.getOutline(); } catch {}
  if (!raw?.length) return;
  const pidOf = new Map(S.pages.filter((p) => p.src === src.id).map((p) => [p.idx, p.id]));
  const conv = (list, depth = 0) => Promise.all((depth < 32 ? list : []).map(async (o) => {
    let pid = null, y = null;
    try {
      const dest = typeof o.dest === 'string' ? await src.doc.getDestination(o.dest) : o.dest;
      if (Array.isArray(dest) && dest[0] != null) {
        const idx = typeof dest[0] === 'object' ? await src.doc.getPageIndex(dest[0]) : dest[0];
        pid = pidOf.get(idx) ?? null;
        const kind = dest[1]?.name;
        const top = kind === 'XYZ' ? dest[3] : kind === 'FitH' || kind === 'FitBH' ? dest[2] : kind === 'FitR' ? dest[5] : null;
        if (pid && typeof top === 'number') y = Math.max(0, (await pageInfo(src.id, idx)).view[3] - top);
      }
    } catch {}
    const c = o.color && [...o.color].some((v) => v) ? [...o.color].map((v) => v / 255) : null;
    return { id: uid('bm'), title: o.title || '', pid, y, url: o.url || o.unsafeUrl || null, open: !(o.count < 0), bold: !!o.bold, italic: !!o.italic, color: c, items: await conv(o.items || [], depth + 1) };
  }));
  S.outline = { edited: false, items: await conv(raw) };
}

// ---------- escriptura en desar (export.js) ----------
// placed: [{ pg (PDFPage), e (entrada de S.pages), info? (raster) }]; keep = el fitxer ja té els marcadors bons
export async function writeBookmarks(doc, placed, { keep = false, prune = false } = {}) {
  if (keep && !S.outline.edited) return;
  const byPid = new Map(placed.map((x) => [x.e.id, x]));
  const conv = async (list) => {
    const out = [];
    for (const it of list) {
      const x = it.pid ? byPid.get(it.pid) : null;
      let top = null;
      if (x && it.y != null) {
        const view = x.info?.view || (await entryInfo(x.e)).view;
        top = view[3] - it.y;
      }
      const items = await conv(it.items || []);
      if (prune && !x && !it.url && !items.length) continue; // pàgines extretes: fora els que no hi apunten
      out.push({ ...it, page: x ? x.pg.ref : null, top, items });
    }
    return out;
  };
  writeOutline(doc, await conv(S.outline.items));
}

// ---------- edició ----------
let selId = null, editingId = null;
function locate(id, list = S.outline.items, parent = null) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { list, i, item: list[i], parent };
    const r = locate(id, list[i].items, list[i]); if (r) return r;
  }
  return null;
}
const change = () => { S.outline.edited = true; commit('outline'); };
const viewer = () => window.__app.viewer;

// Pàgina i alçada (punts des de dalt) de la part superior de la vista
function currentView() {
  const v = viewer(), e = S.pages[S.cur]; if (!e) return { pid: null, y: null };
  const pv = v.views.get(e.id); if (!pv?.info) return { pid: e.id, y: 0 };
  const top = v.scroller.getBoundingClientRect().top, r = pv.el.getBoundingClientRect();
  const [, y] = pv.clientToLocalPt(r.left + 1, Math.max(r.top, top) + 1);
  return { pid: e.id, y: Math.max(0, Math.round(y)) };
}

function addBookmark() {
  if (!S.mainId) return;
  const sel = (getSelection()?.toString() || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const item = { id: uid('bm'), title: sel || `${t('page')} ${S.cur + 1}`, ...currentView(), url: null, open: true, bold: false, italic: false, color: null, items: [] };
  const at = selId && locate(selId);
  if (at) at.list.splice(at.i + 1, 0, item); else S.outline.items.push(item);
  selId = item.id; editingId = item.id;
  change();
}
function del() {
  const at = selId && locate(selId); if (!at) return;
  at.list.splice(at.i, 1);
  selId = (at.list[at.i] || at.list[at.i - 1] || at.parent)?.id || null;
  change();
}
function move(d) {
  const at = selId && locate(selId); if (!at) return;
  const j = at.i + d; if (j < 0 || j >= at.list.length) return;
  [at.list[at.i], at.list[j]] = [at.list[j], at.list[at.i]];
  change();
}
function indent() {
  const at = selId && locate(selId); if (!at || at.i === 0) return;
  const prev = at.list[at.i - 1];
  at.list.splice(at.i, 1); prev.items.push(at.item); prev.open = true;
  change();
}
function outdent() {
  const at = selId && locate(selId); if (!at?.parent) return;
  const up = locate(at.parent.id);
  at.list.splice(at.i, 1); up.list.splice(up.i + 1, 0, at.item);
  change();
}
function retarget() {
  const at = selId && locate(selId); if (!at) return;
  Object.assign(at.item, currentView(), { url: null });
  change();
}
function rename(id, title) {
  const at = locate(id); editingId = null;
  if (!at || !title.trim() || title === at.item.title) return render();
  at.item.title = title.trim();
  change();
}

function go(item) {
  if (item.pid) {
    const i = pageIndex(item.pid); if (i < 0) return;
    viewer().scrollToPoint(i, item.y);
    if (matchMedia('(max-width: 820px)').matches) document.body.classList.remove('side-open');
  } else if (item.url && /^https?:/i.test(item.url)) window.open(item.url, '_blank', 'noopener');
}

// ---------- panell ----------
function svgUse(id) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id);
  s.append(u); return s;
}
const tool = (ico, title, fn, disabled = false) => el('button', { class: 'ib', title, onclick: fn, disabled }, svgUse(ico));

export function render() {
  const pane = $('#pane-outline'); if (!pane || pane.hidden) return;
  const at = selId && locate(selId); if (!at) selId = null;
  const editable = !!S.mainId && !S.sources.get(S.mainId)?.isXfa;
  const tools = el('div', { class: 'side-tools bm-tools' },
    tool('i-bmadd', t('bmAdd'), addBookmark, !editable),
    tool('i-edittext', t('bmRename'), () => { editingId = selId; render(); }, !at),
    tool('i-target', t('bmTarget'), retarget, !at),
    tool('i-up', t('bmUp'), () => move(-1), !at || at.i === 0),
    tool('i-down', t('bmDown'), () => move(1), !at || at.i === at.list.length - 1),
    tool('i-outdent', t('bmOutdent'), outdent, !at?.parent),
    tool('i-indent', t('bmIndent'), indent, !at || at.i === 0),
    tool('i-trash', t('bmDelete'), del, !at));
  const tree = el('div', { class: 'side-list bm-tree', tabindex: '0', role: 'tree' });
  const rows = [];
  const draw = (list, depth, box) => {
    for (const it of list) {
      const n = it.pid ? pageIndex(it.pid) : -1;
      const twisty = el('button', { class: 'bm-tw', tabindex: '-1', text: it.items.length ? (it.open ? '▾' : '▸') : '', onclick: (e) => { e.stopPropagation(); it.open = !it.open; render(); } });
      let label;
      if (it.id === editingId) {
        label = el('input', { class: 'bm-edit', value: it.title });
        label.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') label.blur();
          if (e.key === 'Escape') { editingId = null; label.dataset.cancel = '1'; render(); }
        });
        label.addEventListener('blur', () => { if (!label.dataset.cancel) rename(it.id, label.value); });
        setTimeout(() => { label.focus(); label.select(); }, 0);
      } else label = el('span', { class: 'bm-title', text: it.title || '—', style: { fontWeight: it.bold ? '700' : null, fontStyle: it.italic ? 'italic' : null } });
      const row = el('div', {
        class: 'bm-row' + (it.id === selId ? ' sel' : '') + (it.pid && n < 0 ? ' gone' : ''), role: 'treeitem', title: it.pid && n < 0 ? t('bmNoDest') : it.url || '',
        style: { paddingLeft: 2 + depth * 14 + 'px' },
        onclick: () => { if (it.id === editingId) return; selId = it.id; render(); go(it); tree.focus(); },
        ondblclick: () => { if (editable) { editingId = it.id; render(); } },
      }, twisty, label, el('span', { class: 'bm-pg', text: n >= 0 ? String(n + 1) : it.url ? '↗' : '' }));
      row._id = it.id; rows.push(row);
      box.append(row);
      if (it.items.length && it.open) draw(it.items, depth + 1, box);
    }
  };
  draw(S.outline.items, 0, tree);
  if (!S.outline.items.length) tree.append(el('p', { class: 'side-empty', text: t('bmNone') }));
  tree.addEventListener('keydown', (e) => {
    const k = rows.findIndex((r) => r._id === selId);
    const pick = (r) => { if (!r) return; selId = r._id; render(); $('#pane-outline .bm-tree')?.focus(); const a = locate(selId); if (a) go(a.item); };
    if (e.key === 'ArrowDown') pick(rows[k + 1] || rows[0]);
    else if (e.key === 'ArrowUp') pick(rows[k - 1] || rows[0]);
    else if (e.key === 'F2' && selId && editable) { editingId = selId; render(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selId && editable) del();
    else if (e.key === 'Enter' && selId) { const a = locate(selId); if (a) go(a.item); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  if (!editable) for (const b of tools.querySelectorAll('button')) b.disabled = true;
  pane.replaceChildren(tools, tree);
  const sel = tree.querySelector('.bm-row.sel'); sel?.scrollIntoView({ block: 'nearest' });
}
on('history', render);
on('docLoaded', () => { selId = editingId = null; render(); });
