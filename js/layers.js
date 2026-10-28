// Capes del document (contingut opcional, OCG): p. ex. les capes dels plànols exportats d'AutoCAD.
// La visibilitat forma part de l'historial (es pot desfer) i en desar es guarda com a estat inicial de cada capa.
import { S, on, emit, commit } from './state.js';
import { el, $ } from './util.js';
import { t, addStrings } from './i18n.js';
import { setLayerDefaults } from './pdfstruct.js';

addStrings({
  lyNone: ['Aquest PDF no té capes.', 'Este PDF no tiene capas.', 'This PDF has no layers.'],
  lyAll: ['Mostra-les totes', 'Mostrar todas', 'Show all'],
  lyNoneBtn: ['Amaga-les totes', 'Ocultar todas', 'Hide all'],
  lyNote: ['La visibilitat de les capes es desa al PDF com a estat inicial.', 'La visibilidad de las capas se guarda en el PDF como estado inicial.', 'Layer visibility is saved in the PDF as the initial state.'],
});

// Capes de la font principal: ordre (tal com el dona pdf.js), noms i visibilitat inicial
let info = { id: null, order: null, names: new Map(), initial: new Map() };
export async function initLayers() {
  const src = S.sources.get(S.mainId);
  info = { id: src?.id ?? null, order: null, names: new Map(), initial: new Map() };
  if (!src || src.isXfa) return;
  try {
    const c = await src.doc.getOptionalContentConfig();
    info.order = c.getOrder();
    for (const [id, g] of c) { info.names.set(id, g.name || id); info.initial.set(id, g.visible); }
  } catch (e) { console.warn('layers', e); }
}
export const hasLayers = () => info.id === S.mainId && info.names.size > 0;
const visible = (id) => S.layers[id] ?? info.initial.get(id) ?? true;

// Configuració per renderitzar les pàgines de la font principal amb la visibilitat actual (null = la del fitxer)
let cfg = { id: null, key: null, p: null };
export const layersKey = () => (hasLayers() ? JSON.stringify(S.layers) : '');
export function ocConfig(srcId) {
  if (srcId !== S.mainId || !hasLayers() || !Object.keys(S.layers).length) return null;
  const src = S.sources.get(S.mainId), key = layersKey();
  if (cfg.id !== src.id || cfg.key !== key) {
    const state = { ...S.layers };
    cfg = { id: src.id, key, p: src.doc.getOptionalContentConfig().then((c) => { for (const [id, v] of Object.entries(state)) c.setVisibility(id, v, false); return c; }) };
  }
  return cfg.p;
}
// Quan canvia la visibilitat (també en desfer/refer) cal tornar a pintar les pàgines
let applied = '';
on('history', () => { const k = layersKey(); if (k !== applied) { applied = k; emit('layers'); } render(); });
on('docLoaded', () => { applied = layersKey(); render(); });

// En desar (export.js)
export function writeLayers(doc) { if (hasLayers() && Object.keys(S.layers).length) setLayerDefaults(doc, S.layers); }

function setVis(ids, v) {
  const next = { ...S.layers };
  for (const id of ids) next[id] = v;
  S.layers = next; commit('layers');
}

// ---------- panell ----------
export function render() {
  const pane = $('#pane-layers'); if (!pane || pane.hidden) return;
  if (!hasLayers()) { pane.replaceChildren(el('p', { class: 'side-empty', text: t('lyNone') })); return; }
  const rows = [];
  const add = (item, depth) => {
    if (typeof item === 'string') {
      if (!info.names.has(item)) return;
      const box = el('input', { type: 'checkbox', checked: visible(item), onchange: () => setVis([item], box.checked) });
      rows.push(el('label', { class: 'ly-row', style: { paddingLeft: 6 + depth * 14 + 'px' } }, box, el('span', { text: info.names.get(item) })));
    } else if (item && Array.isArray(item.order)) {
      if (item.name) rows.push(el('div', { class: 'ly-head', style: { paddingLeft: 6 + depth * 14 + 'px' }, text: item.name }));
      for (const x of item.order) add(x, depth + (item.name ? 1 : 0));
    } else if (Array.isArray(item)) for (const x of item) add(x, depth + 1);
  };
  for (const x of info.order || [...info.names.keys()]) add(x, 0);
  const ids = [...info.names.keys()];
  pane.replaceChildren(
    el('div', { class: 'side-tools' },
      el('button', { class: 'tb', text: t('lyAll'), onclick: () => setVis(ids, true) }),
      el('button', { class: 'tb', text: t('lyNoneBtn'), onclick: () => setVis(ids, false) })),
    el('div', { class: 'side-list' }, rows),
    el('p', { class: 'side-note', text: t('lyNote') }));
}
