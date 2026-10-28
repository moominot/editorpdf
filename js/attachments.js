// Fitxers adjunts del document: llistat, descàrrega, afegir i eliminar (els canvis s'apliquen en desar).
// També es mostren (només per descarregar) els adjunts que van dins d'anotacions de pàgina.
import { S, on, commit } from './state.js';
import { el, $, uid, downloadBlob, readFileBytes } from './util.js';
import { t, addStrings } from './i18n.js';
import { modal, toast } from './ui.js';
import { pdfjs } from './pdfsource.js';
import { setEmbeddedFiles } from './embedded.js';

addStrings({
  atTitle: ['Fitxers adjunts', 'Archivos adjuntos', 'Attachments'],
  atMenu: ['Fitxers adjunts', 'Archivos adjuntos', 'Attachments'],
  atNone: ['Aquest PDF no té fitxers adjunts.', 'Este PDF no tiene archivos adjuntos.', 'This PDF has no attachments.'],
  atAdd: ['Afegeix fitxers…', 'Añadir archivos…', 'Add files…'],
  atOpen: ['Obre', 'Abrir', 'Open'],
  atDownload: ['Descarrega', 'Descargar', 'Download'],
  atDelete: ['Elimina', 'Eliminar', 'Delete'],
  atNew: ['nou', 'nuevo', 'new'],
  atOnPage: ['Anotació a la pàgina {0}', 'Anotación en la página {0}', 'Annotation on page {0}'],
  atPending: ['Els canvis als adjunts s\'apliquen en desar el document.', 'Los cambios en los adjuntos se aplican al guardar el documento.', 'Attachment changes are applied when you save the document.'],
  atXfa: ['En els formularis XFA els adjunts només es poden descarregar.', 'En los formularios XFA los adjuntos solo se pueden descargar.', 'In XFA forms attachments can only be downloaded.'],
  atSigned: ['Afegir o eliminar adjunts invalida les signatures digitals del document.', 'Añadir o eliminar adjuntos invalida las firmas digitales del documento.', 'Adding or removing attachments invalidates the document\'s digital signatures.'],
  atAdded: ['{0} fitxer(s) adjuntat(s)', '{0} archivo(s) adjuntado(s)', '{0} file(s) attached'],
  atDeleted: ['S\'ha eliminat {0}', 'Se ha eliminado {0}', 'Removed {0}'],
  atChip: ['📎 {0} adjunt(s)', '📎 {0} adjunto(s)', '📎 {0} attachment(s)'],
});

// Adjunts originals de la font principal (pdf.js, amb el contingut) i els de les anotacions de pàgina
// (pdf.js dona la llista sense contingut; el contingut es demana a part amb la clau o l'id de l'anotació)
let cache = { id: null, files: null, annots: null, content: new Map() };
const mainSrc = () => S.sources.get(S.mainId);
function cacheFor(src) { if (cache.id !== src.id) cache = { id: src.id, files: null, annots: null, content: new Map() }; return cache; }
async function origFiles() {
  const src = mainSrc(); if (!src) return new Map();
  const c = cacheFor(src);
  return (c.files ||= src.doc.getAttachments().then((m) => m || new Map(), () => new Map()));
}
async function annotFiles() {
  const src = mainSrc(); if (!src) return [];
  const c = cacheFor(src);
  return (c.annots ||= (async () => {
    const out = [];
    for (let i = 0; i < src.numPages; i++) {
      let list; try { list = await (await src.doc.getPage(i + 1)).getAnnotations(); } catch { continue; }
      for (const a of list) if (a.annotationType === pdfjs.AnnotationType.FILEATTACHMENT && a.fileId) out.push({ idx: i, name: a.file?.filename || 'adjunt', desc: a.file?.description || '', fileId: a.fileId });
    }
    return out;
  })());
}
function content(id) {
  const src = mainSrc(); if (!src) return Promise.resolve(null);
  const c = cacheFor(src);
  if (!c.content.has(id)) c.content.set(id, src.doc.getAttachmentContent(id).catch(() => null));
  return c.content.get(id);
}

// Llista inicial del document obert; es crida abans de resetHistory perquè formi part del primer pas
export async function initAttachments() {
  const m = await origFiles();
  S.attach = [...m].map(([key, a]) => ({ id: uid('at'), key, name: a.filename || key, desc: a.description || '', size: null, mime: '' }));
}

async function bytesOf(a) { return a.data ? S.attachData.get(a.data) : content(a.key); }

// En desar (export.js): fresh = document nou (rasteritzat), on cal tornar a afegir-ho tot
export async function writeAttachments(doc, fresh = false) {
  const list = S.attach || [];
  const m = await origFiles();
  const unchanged = list.length === m.size && list.every((a) => a.key != null);
  if (fresh ? !list.length : unchanged) return;
  const add = [];
  for (const a of list) if (fresh || a.key == null) add.push({ name: a.name, desc: a.desc, mime: a.mime, bytes: await bytesOf(a) });
  setEmbeddedFiles(doc, { keep: fresh ? new Set() : new Set(list.map((a) => a.key).filter((k) => k != null)), add: add.filter((a) => a.bytes) });
}

const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const isPdf = (name, bytes) => /\.pdf$/i.test(name) || (bytes?.length > 4 && String.fromCharCode(...bytes.subarray(0, 4)) === '%PDF');

let rerender = null; // panell obert: es refà si es desfà/refà amb el teclat
on('history', () => rerender?.());

export async function showAttachments() {
  const src = mainSrc(); if (!src) return toast(t('needDoc'), 'err');
  const editable = !src.isXfa;
  const list = el('div');
  const body = el('div', {}, list,
    el('p', { class: 'muted', text: !editable ? t('atXfa') : src.signed ? t('atSigned') + ' ' + t('atPending') : t('atPending') }));
  const btn = (label, fn, extra = {}) => el('button', { class: 'tb', text: label, onclick: fn, ...extra });
  const download = async (name, bytes) => { if (bytes) downloadBlob(bytes, name, 'application/octet-stream'); };
  const open = async (name, bytes) => { if (bytes) (await import('./main.js')).openDocument(bytes.slice(), name); };
  const row = (name, meta, desc, bytesFn, del) => el('div', { class: 'att-row' },
    el('div', { class: 'att-info' }, el('div', { class: 'att-name', text: name }), el('div', { class: 'muted', text: meta }), desc ? el('div', { text: desc }) : null),
    el('div', { class: 'att-btns' },
      isPdf(name) ? btn(t('atOpen'), async () => open(name, await bytesFn())) : null,
      btn(t('atDownload'), async () => download(name, await bytesFn())),
      del ? btn(t('atDelete'), del) : null));

  const render = async () => {
    const rows = [];
    for (const a of S.attach || []) {
      const size = a.size ?? (await bytesOf(a))?.length ?? 0;
      rows.push(row(a.name, fmtSize(size) + (a.data ? ' · ' + t('atNew') : ''), a.desc, () => bytesOf(a),
        editable ? () => { S.attach = S.attach.filter((x) => x.id !== a.id); commit('attach'); toast(t('atDeleted', a.name)); } : null));
    }
    for (const f of await annotFiles()) {
      const n = S.pages.findIndex((p) => p.src === src.id && p.idx === f.idx);
      if (n >= 0) rows.push(row(f.name, fmtSize((await content(f.fileId))?.length ?? 0) + ' · ' + t('atOnPage', n + 1), f.desc, () => content(f.fileId)));
    }
    list.replaceChildren(...(rows.length ? rows : [el('p', { text: t('atNone') })]));
  };
  rerender = render;

  const addFiles = () => {
    const inp = el('input', { type: 'file', multiple: true, hidden: true });
    inp.addEventListener('change', async () => {
      const files = [...inp.files]; inp.remove();
      if (!files.length) return;
      for (const f of files) {
        const bytes = await readFileBytes(f), data = uid('atd');
        S.attachData.set(data, bytes);
        S.attach = [...S.attach, { id: uid('at'), data, name: f.name, desc: '', size: bytes.length, mime: f.type || '' }];
      }
      commit('attach');
      toast(t('atAdded', files.length), 'ok');
    });
    document.body.append(inp); inp.click();
  };

  await render();
  await modal({
    title: t('atTitle'), body, wide: true,
    onOpen: ({ foot }) => { if (editable) foot.prepend(btn(t('atAdd'), addFiles, { style: { marginRight: 'auto' } })); },
    buttons: [{ label: t('close'), value: true, primary: true }],
  });
  rerender = null;
}

// Etiqueta a la barra d'estat
export async function refreshChip() {
  const chip = $('#st-att'); if (!chip) return;
  const src = mainSrc();
  if (!src) { chip.hidden = true; return; }
  const n = (S.attach || []).length + (await annotFiles()).filter((f) => S.pages.some((p) => p.src === src.id && p.idx === f.idx)).length;
  if (src !== mainSrc()) return;
  chip.hidden = !n;
  chip.textContent = t('atChip', n);
}
on('docLoaded', refreshChip);
on('history', refreshChip);
