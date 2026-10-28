// Panell de comentaris: totes les marques, mesures i ressaltats del document, agrupats per pàgina.
// També es llisten (només per consultar) les anotacions que ja portava el fitxer.
import { S, on, pageIndex } from './state.js';
import { el, $ } from './util.js';
import { t, addStrings } from './i18n.js';
import { selectObj } from './objects.js';
import { MARKUP, typeName, dateText, measureLabel, editNote } from './markup.js';

addStrings({
  cmNone: ['No hi ha comentaris ni marques.', 'No hay comentarios ni marcas.', 'No comments or markup.'],
  cmPage: ['Pàgina {0}', 'Página {0}', 'Page {0}'],
  cmFromFile: ['del fitxer', 'del archivo', 'from file'],
  cmEdit: ['Doble clic per editar el comentari', 'Doble clic para editar el comentario', 'Double-click to edit the comment'],
  cmCount: ['{0} comentari(s)', '{0} comentario(s)', '{0} comment(s)'],
});

const LISTED = new Set([...MARKUP, 'hl', 'ul', 'st']);
const FILE_TYPES = new Set(['Text', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine', 'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Stamp', 'Caret', 'Ink']);

// Anotacions del fitxer original (pdf.js), per pàgina de la font principal
let cache = { id: null, p: null };
function fileAnnots() {
  const src = S.sources.get(S.mainId); if (!src) return Promise.resolve([]);
  if (cache.id !== src.id) cache = { id: src.id, p: (async () => {
    const out = [];
    for (let i = 0; i < src.numPages; i++) {
      let list; try { list = await (await src.doc.getPage(i + 1)).getAnnotations(); } catch { continue; }
      for (const a of list) if (FILE_TYPES.has(a.subtype)) out.push({ idx: i, type: a.subtype, author: a.titleObj?.str || '', text: a.contentsObj?.str || '', date: pdfDate(a.modificationDate), color: a.color ? `rgb(${[...a.color].join(',')})` : '#888' });
    }
    return out;
  })() };
  return cache.p;
}
const pdfDate = (s) => { const m = /D:(\d{4})(\d{2})(\d{2})/.exec(s || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };

export async function render() {
  const pane = $('#pane-comments'); if (!pane || pane.hidden) return;
  const files = await fileAnnots();
  if (pane.hidden) return;
  const viewer = window.__app.viewer;
  const groups = [];
  let total = 0;
  S.pages.forEach((e, i) => {
    const rows = [];
    for (const o of e.objs) if (LISTED.has(o.type)) {
      const text = [o.type === 'measure' ? measureLabel(o) : o.type === 'stamp' ? o.text : '', o.note].filter(Boolean).join(' — ');
      const sel = S.sel?.oid === o.id;
      rows.push(el('div', {
        class: 'cm-row' + (sel ? ' sel' : ''), title: t('cmEdit'),
        onclick: () => { viewer.scrollToPoint(i, Math.max(0, (o.y ?? o.rects?.[0]?.y ?? 0) - 30)); selectObj(e.id, o.id); },
        ondblclick: () => editNote(e.id, o.id),
      },
        el('span', { class: 'cm-dot', style: { background: o.color } }),
        el('div', { class: 'cm-body' },
          el('div', { class: 'cm-head' }, el('strong', { text: typeName(o) }), el('span', { class: 'muted', text: [o.author, dateText(o.date)].filter(Boolean).join(' · ') })),
          text ? el('div', { class: 'cm-text', text }) : null)));
    }
    for (const a of files) if (e.src === S.mainId && a.idx === e.idx && !e.blank) {
      rows.push(el('div', { class: 'cm-row file', onclick: () => viewer.scrollToPage(i) },
        el('span', { class: 'cm-dot', style: { background: a.color } }),
        el('div', { class: 'cm-body' },
          el('div', { class: 'cm-head' }, el('strong', { text: a.type }), el('span', { class: 'muted', text: [a.author, a.date, t('cmFromFile')].filter(Boolean).join(' · ') })),
          a.text ? el('div', { class: 'cm-text', text: a.text }) : null)));
    }
    if (rows.length) { total += rows.length; groups.push(el('div', { class: 'cm-page', text: t('cmPage', i + 1) }), ...rows); }
  });
  pane.replaceChildren(
    el('div', { class: 'side-tools' }, el('span', { class: 'muted', text: t('cmCount', total) })),
    el('div', { class: 'side-list' }, groups.length ? groups : el('p', { class: 'side-empty', text: t('cmNone') })));
  pane.querySelector('.cm-row.sel')?.scrollIntoView({ block: 'nearest' });
}
on('history', render);
on('selection', render);
on('docLoaded', () => { cache = { id: null, p: null }; render(); });
