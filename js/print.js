// Impressió: es genera el PDF final (amb anotacions) i cada pàgina es rasteritza dins #print-root,
// que és l'únic element visible en imprimir (vegeu @media print a style.css)
import { S } from './state.js';
import { el } from './util.js';
import { t, addStrings } from './i18n.js';
import { toast, progressDlg } from './ui.js';
import { pdfjs, LOAD_OPTS } from './pdfsource.js';
import { buildPdf } from './export.js';

addStrings({
  printPrep: ['Preparant la impressió…', 'Preparando la impresión…', 'Preparing to print…'],
  errPrint: ["No s'ha pogut imprimir: {0}", 'No se ha podido imprimir: {0}', 'Could not print: {0}'],
});

const DPI = 200, MAX_PX = 16e6;
let busy = false;
const urls = [];

function cleanup() {
  document.body.classList.remove('printing');
  document.getElementById('print-root')?.remove();
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
}
window.addEventListener('afterprint', cleanup);

export async function printDocument() {
  if (!S.mainId) return toast(t('needDoc'), 'err');
  if (busy) return;
  const main = S.sources.get(S.mainId);
  // Els formularis XFA purs pdf.js no els dibuixa en un canvas: s'imprimeix el visor tal com està
  if (main.isXfa) { window.print(); return; }
  busy = true; cleanup();
  const prog = progressDlg(t('printPrep'));
  let doc = null, task = null;
  try {
    if (S.pristine) doc = main.doc; // ja és obert (i desxifrat si tenia contrasenya)
    else {
      const bytes = await buildPdf({ progress: (p) => prog.set(p * 0.4) });
      task = pdfjs.getDocument({ data: bytes, ...LOAD_OPTS });
      doc = await task.promise;
    }
    // Cada mida de pàgina té el seu @page amb nom: el full imprès té la mida i l'orientació de la pàgina del PDF
    const root = el('div', { id: 'print-root' }), sizes = new Map();
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(DPI / 72, Math.sqrt(MAX_PX / (vp1.width * vp1.height)));
      const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvas: cv, viewport: vp, intent: 'print' }).promise;
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
      cv.width = cv.height = 0;
      const url = URL.createObjectURL(blob); urls.push(url);
      const img = el('img', { alt: '' });
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); // decode() no acaba si la pestanya no pinta
      const w = vp1.width.toFixed(2) + 'pt', h = vp1.height.toFixed(2) + 'pt', key = w + ' ' + h;
      if (!sizes.has(key)) sizes.set(key, 'pp' + sizes.size);
      root.append(el('div', { class: 'pp', style: { width: w, height: h, page: sizes.get(key) } }, img));
      prog.set(0.4 + 0.6 * i / doc.numPages);
    }
    root.prepend(el('style', { text: [...sizes].map(([size, name]) => `@page ${name} { size: ${size}; }`).join('\n') }));
    document.body.append(root);
    document.body.classList.add('printing');
    prog.close();
    // Es neteja a afterprint (o a la impressió següent): al mòbil print() no bloqueja i el contingut ha de quedar
    window.print();
  } catch (e) {
    console.error(e); cleanup();
    toast(t('errPrint', e.message || e), 'err', 8000);
  } finally {
    prog.close(); busy = false;
    task?.destroy();
  }
}
