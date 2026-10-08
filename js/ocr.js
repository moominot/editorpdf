// OCR amb tesseract.js (WASM): crea una capa de text invisible perquè el PDF escanejat sigui cercable i seleccionable
import { S, commit, pageIndex, emit } from './state.js';
import { getPdfPage, pageInfo } from './pdfsource.js';
import { el, loadScript, displayToLocal, uid } from './util.js';
import { t, addStrings } from './i18n.js';
import { modal, toast, progressDlg } from './ui.js';
import { cfg } from './config.js';

addStrings({
  ocrTitle: ['OCR: fes el PDF cercable', 'OCR: hacer el PDF buscable', 'OCR: make the PDF searchable'],
  ocrScope: ['Pàgines', 'Páginas', 'Pages'],
  ocrAll: ['Totes', 'Todas', 'All'],
  ocrSel: ['Les seleccionades', 'Las seleccionadas', 'Selected'],
  ocrCur: ['Només l\'actual', 'Solo la actual', 'Current only'],
  ocrLang: ['Idiomes', 'Idiomas', 'Languages'],
  ocrForce: ['Torna a fer OCR en pàgines que ja tenen text', 'Repetir OCR en páginas que ya tienen texto', 'Redo OCR on pages that already have text'],
  ocrInfo: ['Es processa al teu navegador; els models d\'idioma venen de l\'aplicació (no es descarrega res d\'internet). Pot tardar uns segons per pàgina.', 'Se procesa en tu navegador; los modelos de idioma vienen de la aplicación (no se descarga nada de internet). Puede tardar unos segundos por página.', 'Runs in your browser; language models ship with the app (nothing is downloaded). It may take a few seconds per page.'],
  ocrStart: ['Inicia l\'OCR', 'Iniciar OCR', 'Start OCR'],
  ocrPage: ['Pàgina {0} de {1}…', 'Página {0} de {1}…', 'Page {0} of {1}…'],
  ocrInit: ['Carregant el motor d\'OCR…', 'Cargando el motor de OCR…', 'Loading OCR engine…'],
  ocrDone: ['OCR completat en {0} pàgina(es). Desa el document per conservar-lo.', 'OCR completado en {0} página(s). Guarda el documento para conservarlo.', 'OCR finished on {0} page(s). Save the document to keep it.'],
  ocrSkipped: ['{0} pàgina(es) ja tenien text i s\'han omès.', '{0} página(s) ya tenían texto y se omitieron.', '{0} page(s) already had text and were skipped.'],
  ocrBadge: ['OCR', 'OCR', 'OCR'],
});

let worker = null, workerLangs = '';
const base = (p) => new URL('../vendor/tesseract/' + p, import.meta.url).href;

async function getWorker(langs, logger) {
  if (worker && workerLangs === langs) return worker;
  if (worker) { try { await worker.terminate(); } catch {} worker = null; }
  await loadScript(base('tesseract.min.js'));
  worker = await window.Tesseract.createWorker(langs.split('+'), 1, {
    workerPath: base('worker.min.js'), corePath: base('core').replace(/\/$/, ''), langPath: base('lang').replace(/\/$/, ''),
    gzip: true, workerBlobURL: true, logger, cacheMethod: 'none',
  });
  workerLangs = langs;
  return worker;
}

export function ocrWords(entry) { return entry?.ocr ? S.ocrStore?.get(entry.ocr.id)?.words || [] : []; }

async function hasText(e) {
  if (e.blank) return true;
  const page = await getPdfPage(e.src, e.idx);
  const tc = await page.getTextContent();
  return tc.items.reduce((n, i) => n + (i.str || '').trim().length, 0) > 25;
}

export async function runOcrDialog() {
  const sel = S.pages.filter((p) => S.pageSel.has(p.id));
  const scope = el('select');
  scope.append(el('option', { value: 'all', text: t('ocrAll') + ` (${S.pages.length})` }), el('option', { value: 'cur', text: t('ocrCur') }));
  if (sel.length) scope.append(el('option', { value: 'sel', text: t('ocrSel') + ` (${sel.length})` }));
  scope.value = sel.length ? 'sel' : 'all';
  const langs = el('select');
  for (const [v, n] of [['cat+spa+eng', 'Català + Castellano + English'], ['cat', 'Català'], ['spa', 'Castellano'], ['eng', 'English'], ['cat+spa', 'Català + Castellano']]) langs.append(el('option', { value: v, text: n }));
  const want = cfg('ocrLangs'); if ([...langs.options].some((o) => o.value === want)) langs.value = want;
  const force = el('input', { type: 'checkbox' });
  const body = el('div', {}, el('p', { class: 'muted', text: t('ocrInfo') }),
    el('label', { class: 'row' }, el('span', { text: t('ocrScope') }), scope),
    el('label', { class: 'row' }, el('span', { text: t('ocrLang') }), langs),
    el('label', { class: 'row chk' }, force, el('span', { text: t('ocrForce') })));
  const r = await modal({ title: t('ocrTitle'), body, buttons: [{ label: t('cancel'), value: false }, { label: t('ocrStart'), value: true, primary: true }] });
  if (!r) return;
  const pages = scope.value === 'all' ? S.pages.slice() : scope.value === 'cur' ? [S.pages[S.cur]] : sel;
  await runOcr(pages, langs.value, force.checked);
}

export async function runOcr(pages, langs, force) {
  if (!S.ocrStore) S.ocrStore = new Map();
  let cancelled = false;
  const prog = progressDlg(t('ocrTitle'), () => { cancelled = true; });
  let done = 0, skipped = 0;
  try {
    prog.set(0, t('ocrInit'));
    let curPage = 0;
    const w = await getWorker(langs, (m) => { if (m.status === 'recognizing text' && pages.length) prog.set((curPage + (m.progress || 0)) / pages.length, t('ocrPage', curPage + 1, pages.length)); });
    for (let i = 0; i < pages.length; i++) {
      if (cancelled) break;
      curPage = i;
      const e = pages[i];
      prog.set(i / pages.length, t('ocrPage', i + 1, pages.length));
      if (!force && (await hasText(e)) && !e.blank) { skipped++; continue; }
      if (e.blank) continue;
      const info = await pageInfo(e.src, e.idx);
      const rot = (info.nativeRot + e.rot) % 360;
      const page = await getPdfPage(e.src, e.idx);
      let sc = 230 / 72;
      const dw = (rot % 180 ? info.h : info.w), dh = (rot % 180 ? info.w : info.h);
      if (dw * dh * sc * sc > 30e6) sc = Math.sqrt(30e6 / (dw * dh));
      const vp = page.getViewport({ scale: sc, rotation: rot });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await page.render({ canvas: cv, viewport: vp }).promise;
      const { data } = await w.recognize(cv, {}, { blocks: true });
      const words = [];
      for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) {
        const txt = (wd.text || '').trim(); if (!txt || (wd.confidence ?? 100) < 25) continue;
        const { x0, y0, x1, y1 } = wd.bbox;
        const hpt = (y1 - y0) / sc, wpt = (x1 - x0) / sc;
        const [u, v] = displayToLocal(rot, x0 / sc, (y1 - (y1 - y0) * 0.2) / sc, info.w, info.h);
        words.push({ t: txt, x: +u.toFixed(2), y: +v.toFixed(2), w: +wpt.toFixed(2), h: +hpt.toFixed(2), rot });
      }
      cv.width = cv.height = 1;
      const id = uid('ocr');
      S.ocrStore.set(id, { words });
      e.ocr = { id, n: words.length, lang: langs };
      done++;
    }
  } catch (err) {
    console.error(err);
    toast(String(err.message || err), 'err', 8000);
  } finally { prog.close(); }
  if (done) {
    commit('content');
    toast(t('ocrDone', done) + (skipped ? ' ' + t('ocrSkipped', skipped) : ''), 'ok', 7000);
  } else if (skipped) toast(t('ocrSkipped', skipped), '', 5000);
}
