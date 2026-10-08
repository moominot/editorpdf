// Aplicació principal: orquestra visor, miniatures, fitxers i accions
import { S, on, emit, commit, resetDoc, resetHistory, undo, redo, canUndo, canRedo, newPage, pageIndex, pageById, findObj } from './state.js';
import { $, $$, el, clamp, baseName, downloadBlob, readFileBytes, sleep } from './util.js';
import { initLang, t, setLang, getLang, applyI18n, addStrings } from './i18n.js';
import { toast, setStatus, modal, confirmDlg, alertDlg, promptDlg, progressDlg, initMenus } from './ui.js';
import { openSource, clearInfoCache } from './pdfsource.js';
import { Viewer, hooks } from './viewer.js';
import { Thumbs } from './thumbs.js';
import * as objects from './objects.js';
import { clearFormCache } from './forms.js';
import { initOptbar } from './optbar.js';
import { setTool, updateCapture } from './tools.js';
import * as pageops from './pageops.js';
import * as files from './files.js';
import { buildPdf } from './export.js';
import { cfg, setCfg, getOverrides } from './config.js';
import './xfa.js';

addStrings({
  insertedN: ['{0} pàgina(es) inserida(es)', '{0} página(s) insertada(s)', '{0} page(s) inserted'],
  extractName: ['Extret', 'Extraído', 'Extract'],
  pageGoto: ['Ves a la pàgina (1-{0}):', 'Ir a la página (1-{0}):', 'Go to page (1-{0}):'],
  saving: ['Desant…', 'Guardando…', 'Saving…'],
  openingDoc: ['Obrint document…', 'Abriendo documento…', 'Opening document…'],
  signedLoaded: ['Aquest PDF té signatures digitals: si el modifiques es perdrà la seva validesa.', 'Este PDF tiene firmas digitales: si lo modificas perderán su validez.', 'This PDF has digital signatures: modifying it will invalidate them.'],
  xfaOnly: ['Aquesta operació no està disponible en formularis XFA.', 'Esta operación no está disponible en formularios XFA.', 'This operation is not available for XFA forms.'],
  settingsTitle: ['Ajustos', 'Ajustes', 'Settings'],
  gClientId: ['Google Client ID', 'Google Client ID', 'Google Client ID'],
  gApiKey: ['Google API key', 'Google API key', 'Google API key'],
  gAppId: ['Google App ID (núm. de projecte)', 'Google App ID (nº de proyecto)', 'Google App ID (project number)'],
  relayUrl: ['Servidor intermediari (mòbil)', 'Servidor intermediario (móvil)', 'Relay server (mobile)'],
  ocrLangs: ['Idiomes OCR', 'Idiomas OCR', 'OCR languages'],
  gdriveHelp: ['Necessaris només per obrir/desar a Google Drive. Veure README.', 'Necesarios solo para abrir/guardar en Google Drive. Ver README.', 'Only needed to open/save from Google Drive. See README.'],
  newDocName: ['Document nou.pdf', 'Documento nuevo.pdf', 'New document.pdf'],
  importTitle: ['Insereix pàgines', 'Insertar páginas', 'Insert pages'],
  importOf: ['{0} té {1} pàgines.', '{0} tiene {1} páginas.', '{0} has {1} pages.'],
});

initLang();
const viewer = new Viewer($('#viewer'), $('#pages'));
const thumbs = new Thumbs($('#thumbs'), viewer);
objects.initObjects(viewer);
objects.installPageEvents($('#pages'));
window.__app = { S, viewer, thumbs, objects }; // útil per a depuració

// ------------------------------------------------------------------ tema / idioma
function applyTheme() {
  let th = 'auto'; try { th = localStorage.getItem('pdfsimple.theme') || 'auto'; } catch {}
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = th;
}
applyTheme();

// ------------------------------------------------------------------ obrir documents
const askPassword = (msg) => promptDlg(msg, '', 'password');

export async function loadDocument(bytes, name, extra = {}) {
  if (!extra.force && S.dirty && !(await confirmDlg(t('unsaved')))) return false;
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  // comprovació ràpida de capçalera
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF')) { toast(t('notPdf'), 'err'); return false; }
  const prog = progressDlg(t('openingDoc'));
  const prev = S.sources; S.sources = new Map();
  let src;
  try { src = await openSource(bytes, name, askPassword); }
  catch (e) {
    S.sources = prev; prog.close();
    if (e?.name !== 'PasswordException') toast(t('errOpen', e.message || e), 'err', 6000);
    return false;
  }
  for (const s of prev.values()) { try { s.doc.destroy(); } catch {} }
  resetDoc(true); clearInfoCache(); clearFormCache();
  viewer.clear(); thumbs.clear();
  S.mainId = src.id;
  S.pages = Array.from({ length: src.numPages }, (_, i) => newPage(src.id, i));
  S.file = { name, handle: extra.handle || null, driveId: extra.driveId || null, driveParents: extra.driveParents || null };
  S.zoom = 1;
  resetHistory();
  emit('selection', null);
  $('#empty').hidden = true;
  await viewer.sync();
  await thumbs.sync();
  viewer.fit('width');
  viewer.scrollToPage(0);
  updateUi();
  prog.close();
  setStatus(t('opened', name));
  if (src.signed) toast(t('signedLoaded'), '', 7000);
  if (src.isXfa) toast(t('xfaMode'), '', 6000);
  if (src.encrypted) toast(t('encryptedWarn'), '', 6000);
  emit('docLoaded', src);
  return true;
}
window.__app.loadDocument = loadDocument;

async function openLocal() {
  try {
    const f = await files.pickLocalPdf(); if (!f) return;
    await loadDocument(f.bytes, f.name, { handle: f.handle });
  } catch (e) { toast(t('errOpen', e.message || e), 'err'); }
}
async function openDrive() {
  try {
    const drive = await import('./drive.js');
    const f = await drive.pickAndDownload(); if (!f) return;
    await loadDocument(f.bytes, f.name, { driveId: f.id, driveParents: f.parents });
  } catch (e) { toast(String(e.message || e), 'err', 7000); }
}
async function newBlank() {
  const { PDFDocument } = window.PDFLib;
  const d = await PDFDocument.create(); d.addPage([595.28, 841.89]);
  await loadDocument(await d.save(), t('newDocName'));
}

// ------------------------------------------------------------------ desar
function suggestedName() { return (S.file.name || t('newDocName')).replace(/\.pdf$/i, '') + '.pdf'; }

async function ensureSignedOk() {
  const m = S.sources.get(S.mainId);
  if (m?.signed && !S.pristine) return confirmDlg(t('signedWarn'));
  return true;
}

async function generate(opts) {
  const prog = progressDlg(t('saving'));
  try { return await buildPdf({ ...opts, progress: (p) => prog.set(p) }); }
  finally { prog.close(); }
}

export async function save(as = false) {
  if (!S.mainId) return toast(t('needDoc'), 'err');
  try {
    if (!(await ensureSignedOk())) return;
    objects.finishEdit();
    let handle = S.file.handle;
    if (as || !handle) {
      if (files.hasFSA) {
        const h = await files.chooseSaveHandle(suggestedName());
        if (h === 'cancel') return;
        handle = h;
      }
    } else if (!(await files.ensureWritable(handle))) { handle = null; }
    const bytes = await generate();
    if (handle) {
      await files.writeToHandle(handle, bytes);
      S.file.handle = handle; S.file.name = handle.name; S.file.driveId = null;
    } else {
      files.downloadPdf(bytes, suggestedName());
    }
    S.dirty = false; updateUi();
    toast(t('saved', S.file.name), 'ok');
  } catch (e) { console.error(e); toast(t('errSave', e.message || e), 'err', 7000); }
}
export async function download() {
  if (!S.mainId) return toast(t('needDoc'), 'err');
  try { if (!(await ensureSignedOk())) return; objects.finishEdit(); const bytes = await generate(); files.downloadPdf(bytes, suggestedName()); S.dirty = false; updateUi(); }
  catch (e) { toast(t('errSave', e.message || e), 'err', 7000); }
}
export async function saveToDrive(as = false) {
  if (!S.mainId) return toast(t('needDoc'), 'err');
  try {
    if (!(await ensureSignedOk())) return;
    objects.finishEdit();
    const drive = await import('./drive.js');
    await drive.prepare(); // pot demanar login (requereix gest d'usuari)
    let target = null;
    if (as || !S.file.driveId) target = await drive.chooseFolder();
    if (target === 'cancel') return;
    const bytes = await generate();
    const res = await drive.upload(bytes, { id: as ? null : S.file.driveId, name: suggestedName(), parents: target ? [target] : S.file.driveParents });
    S.file.driveId = res.id; S.file.name = res.name; S.file.handle = null;
    S.dirty = false; updateUi();
    toast(t('savedDrive', res.name), 'ok');
  } catch (e) { console.error(e); toast(String(e.message || e), 'err', 7000); }
}

// ------------------------------------------------------------------ UI auxiliar
function updateUi() {
  $('#btn-undo').disabled = !canUndo();
  $('#btn-redo').disabled = !canRedo();
  const has = !!S.mainId;
  $('#empty').hidden = has;
  $('#st-file').textContent = (S.file.name || '') + (S.dirty ? ' •' : '');
  document.title = (S.file.name ? (S.dirty ? '• ' : '') + S.file.name + ' — ' : '') + 'PDF Simple';
  $('#st-page').textContent = has ? `${t('page')} ${S.cur + 1} ${t('of')} ${S.pages.length}` : '';
  $('#zoom-val').value = Math.round(S.zoom * 100) + '%';
}
on('history', updateUi);
on('zoom', updateUi);
on('currentPage', () => { updateUi(); thumbs.setCurrent(); });
on('changed', (kind) => {
  if (kind === 'structure' || kind === 'restore') { viewer.sync(); thumbs.sync(); }
  if (kind === 'content' || kind === 'restore') viewer.refreshLayers();
  updateUi();
});
on('restore', () => { emit('selection', null); });
on('pageSelection', updateUi);
window.addEventListener('beforeunload', (e) => { if (S.dirty && !window.__suppressUnload) { e.preventDefault(); e.returnValue = ''; } });

$('#st-page').addEventListener('click', async () => {
  if (!S.pages.length) return;
  const v = await promptDlg(t('pageGoto', S.pages.length), String(S.cur + 1), 'number');
  const n = parseInt(v, 10); if (n >= 1 && n <= S.pages.length) viewer.scrollToPage(n - 1);
});

// ------------------------------------------------------------------ accions de menú / botons
const actions = {
  'open-local': openLocal, 'open-drive': openDrive, 'new-blank': newBlank,
  save: () => save(false), 'save-as': () => save(true), download, 'save-drive': () => saveToDrive(false), 'save-drive-as': () => saveToDrive(true),
  'sign-autofirma': () => signWith('autofirma'), 'sign-mobile': () => signWith('mobile'), 'sign-p12': () => signWith('p12'), 'sign-draw': () => signWith('draw'),
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  actions[b.dataset.act]?.();
});
async function signWith(kind) {
  if (!S.mainId) return toast(t('needDoc'), 'err');
  try { const m = await import('./sign.js'); await m.startSigning(kind); } catch (e) { console.error(e); toast(String(e.message || e), 'err', 8000); }
}
$$('#tools [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('#btn-undo').addEventListener('click', () => { objects.finishEdit(); undo(); });
$('#btn-redo').addEventListener('click', () => { objects.finishEdit(); redo(); });
$('#btn-zin').addEventListener('click', () => viewer.setZoom(S.zoom * 1.2));
$('#btn-zout').addEventListener('click', () => viewer.setZoom(S.zoom / 1.2));
$('#btn-fitw').addEventListener('click', () => viewer.fit('width'));
$('#btn-fitp').addEventListener('click', () => viewer.fit('page'));
$('#zoom-val').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (v > 0) viewer.setZoom(v / 100); updateUi(); });
$('#zoom-val').addEventListener('focus', (e) => e.target.select());
$('#btn-settings').addEventListener('click', () => showSettings());
$('#btn-ocr').addEventListener('click', async () => { if (!S.mainId) return toast(t('needDoc'), 'err'); const m = await import('./ocr.js'); m.runOcrDialog(); });
$('#btn-find').addEventListener('click', toggleFind);
$('#btn-sidebar').addEventListener('click', () => document.body.classList.toggle('side-open'));
$('#sidebar-scrim').addEventListener('click', () => document.body.classList.remove('side-open'));

async function toggleFind() {
  const bar = $('#findbar');
  if (!bar.hidden) { bar.hidden = true; (await import('./find.js')).clearFind(); return; }
  bar.hidden = false; $('#find-input').focus(); $('#find-input').select();
  (await import('./find.js')).initFind();
}

// ------------------------------------------------------------------ operacions de pàgines (barra lateral)
$('#side-actions').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pg]'); if (!b) return;
  if (!S.mainId) return toast(t('needDoc'), 'err');
  if (S.sources.get(S.mainId)?.isXfa) return toast(t('xfaOnly'), 'err');
  objects.finishEdit();
  const ids = pageops.selectionOrCurrent();
  const lastIdx = Math.max(...ids.map((id) => pageIndex(id)));
  switch (b.dataset.pg) {
    case 'rotl': pageops.rotatePages(ids, -90); break;
    case 'rotr': pageops.rotatePages(ids, 90); break;
    case 'dup': pageops.duplicatePages(ids); break;
    case 'blank': { const p = await pageops.insertBlank(lastIdx); S.pageSel = new Set([p.id]); await thumbs.sync(); viewer.scrollToPage(pageIndex(p.id)); break; }
    case 'del':
      if (ids.length >= S.pages.length) { toast(t('cantDeleteAll'), 'err'); break; }
      if (ids.length > 1 && !(await confirmDlg(t('confirmDelPages', ids.length)))) break;
      pageops.deletePages(ids); break;
    case 'import': await importFromFile(lastIdx); break;
    case 'extract': {
      try {
        let handle = null, name = baseName(S.file.name) + ' (' + t('extractName') + ').pdf';
        if (files.hasFSA) { handle = await files.chooseSaveHandle(name); if (handle === 'cancel') break; }
        const bytes = await generate({ onlyPages: ids });
        if (handle) await files.writeToHandle(handle, bytes); else files.downloadPdf(bytes, name);
        toast(t('saved', handle?.name || name), 'ok');
      } catch (err) { toast(t('errSave', err.message || err), 'err'); }
      break;
    }
  }
});

async function importFromFile(afterIdx, preset) {
  try {
    const f = preset || (await files.pickPdfForImport()); if (!f) return;
    const n = await pageops.importPages(f.bytes, f.name, afterIdx, askPassword, async (src) => {
      if (src.numPages === 1) return [0];
      const v = await promptDlg(t('importOf', src.name, src.numPages) + '\n' + t('importRange'), '');
      if (v == null) return null;
      return pageops.parseRange(v, src.numPages);
    });
    if (n) toast(t('insertedN', n), 'ok');
  } catch (e) { toast(t('errOpen', e.message || e), 'err'); }
}

// ------------------------------------------------------------------ arrossegar i deixar anar fitxers
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('#dropzone').hidden = false; } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#dropzone').hidden = true; } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('#dropzone').hidden = true;
  const item = e.dataTransfer.items?.[0];
  const imgFile = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (imgFile && S.mainId) { const { addImageFile } = await import('./tools.js'); return addImageFile(imgFile); }
  let handle = null, file = e.dataTransfer.files[0];
  try { if (item?.getAsFileSystemHandle) { const h = await item.getAsFileSystemHandle(); if (h?.kind === 'file') handle = h; } } catch {}
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast(t('notPdf'), 'err');
  const bytes = await readFileBytes(file);
  const overSidebar = e.target.closest?.('#sidebar');
  if (S.mainId && overSidebar) {
    const ids = pageops.selectionOrCurrent();
    await importFromFile(Math.max(...ids.map((id) => pageIndex(id))), { bytes, name: file.name });
  } else await loadDocument(bytes, file.name, { handle });
});
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (p) => {
    if (!p.files?.length) return;
    const f = await files.fileFromHandleOrFile(p.files[0]);
    await loadDocument(f.bytes, f.name, { handle: f.handle });
  });
}

// ------------------------------------------------------------------ zoom amb roda / gest de pinça
$('#viewer').addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025));
  viewer.setZoom(S.zoom * f);
}, { passive: false });

(() => {
  const ptrs = new Map(); let d0 = 0, z0 = 1, raf = 0;
  const sc = $('#viewer');
  sc.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { ptrs.set(e.pointerId, e); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); z0 = S.zoom; } } });
  sc.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, e);
    if (ptrs.size === 2 && d0) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; viewer.setZoom(z0 * d / d0); });
    }
  });
  const end = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) d0 = 0; };
  sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
})();

// ------------------------------------------------------------------ teclat
const typing = (e) => { const t0 = e.target; return t0.matches?.('input,textarea,select') || t0.isContentEditable; };
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && k === 'o') { e.preventDefault(); openLocal(); return; }
  if (mod && k === 'f') { e.preventDefault(); toggleFind(); return; }
  if (typing(e)) return;
  if (mod && k === 'z') { e.preventDefault(); objects.finishEdit(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && (k === '+' || k === '=')) { e.preventDefault(); viewer.setZoom(S.zoom * 1.2); return; }
  if (mod && k === '-') { e.preventDefault(); viewer.setZoom(S.zoom / 1.2); return; }
  if (mod && k === '0') { e.preventDefault(); viewer.fit('width'); return; }
  if (mod && k === 'd') { e.preventDefault(); objects.duplicateSelected(); return; }
  if (mod && k === 'c' && S.sel && getSelection().isCollapsed) { objects.copySelected(); return; }
  if (mod && k === 'v') { if (objects.pasteObject()) e.preventDefault(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (S.sel) { e.preventDefault(); objects.deleteSelected(); } return; }
  if (e.key === 'Escape') { objects.deselect(); getSelection()?.removeAllRanges(); if (S.tool !== 'select') setTool('select'); return; }
  if (S.sel && e.key.startsWith('Arrow')) {
    const o = findObj(S.sel); if (!o) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    objects.shiftObj(o, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
    commit('content'); return;
  }
  if (mod || e.altKey) return;
  const map = { v: 'select', t: 'text', h: 'hl', u: 'ul', d: 'ink', r: 'rect', i: 'img', e: 'edittext' };
  if (map[k]) setTool(map[k]);
  if (e.key === 'PageDown') viewer.scrollToPage(Math.min(S.pages.length - 1, S.cur + 1));
  if (e.key === 'PageUp') viewer.scrollToPage(Math.max(0, S.cur - 1));
});

// Clic sobre text en mode "edita text existent"
$('#pages').addEventListener('click', async (e) => {
  if (S.tool !== 'edittext') return;
  const span = e.target.closest('.textLayer span'); if (!span) return;
  const pv = span.closest('.pg').pv;
  const m = await import('./textedit.js');
  m.editSpan(pv, span, e);
});

// ------------------------------------------------------------------ ajustos
async function showSettings() {
  const ov = getOverrides();
  const f = (k) => ov[k] ?? cfg(k) ?? '';
  const mk = (k, label, ph = '') => { const i = el('input', { type: 'text', value: f(k), placeholder: ph, 'data-k': k }); return el('label', { class: 'row' }, el('span', { text: label }), i); };
  const lang = el('select'); for (const [c, n] of [['ca', 'Català'], ['es', 'Castellano'], ['en', 'English']]) lang.append(el('option', { value: c, text: n }));
  lang.value = getLang();
  const theme = el('select'); let th = 'auto'; try { th = localStorage.getItem('pdfsimple.theme') || 'auto'; } catch {}
  for (const [c, n] of [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]]) theme.append(el('option', { value: c, text: n }));
  theme.value = th;
  const body = el('div', {},
    el('label', { class: 'row' }, el('span', { text: t('language') }), lang),
    el('label', { class: 'row' }, el('span', { text: t('theme') }), theme),
    el('h3', { text: 'Google Drive' }), el('p', { class: 'muted', text: t('gdriveHelp') }),
    mk('googleClientId', t('gClientId'), '1234…apps.googleusercontent.com'), mk('googleApiKey', t('gApiKey'), 'AIza…'), mk('googleAppId', t('gAppId'), '1234567890'),
    el('h3', { text: 'AutoFirma / OCR' }),
    mk('relayUrl', t('relayUrl'), 'https://…ts.net'), mk('ocrLangs', t('ocrLangs'), 'cat+spa+eng'));
  const r = await modal({ title: t('settingsTitle'), body, buttons: [{ label: t('cancel'), value: false }, { label: t('accept'), value: true, primary: true }] });
  if (!r) return;
  const upd = {}; body.querySelectorAll('input[data-k]').forEach((i) => { upd[i.dataset.k] = i.value.trim(); });
  setCfg(upd);
  try { localStorage.setItem('pdfsimple.theme', theme.value); } catch {}
  applyTheme();
  setLang(lang.value); updateUi(); emit('toolchange');
}

// ------------------------------------------------------------------ arrencada
if (cfg('googleClientId')) import('./drive.js').then((d) => d.preload());
initMenus();
initOptbar($('#optbar'));
applyI18n();
setTool('select');
updateUi();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Càrrega per URL de prova: ?pdf=ruta/relativa.pdf (només per a depuració)
const q = new URLSearchParams(location.search);
if (q.get('pdf') && new URL(q.get('pdf'), location.href).origin === location.origin) {
  fetch(q.get('pdf')).then((r) => r.arrayBuffer()).then((b) => loadDocument(new Uint8Array(b), q.get('pdf').split('/').pop(), { force: true }));
}
