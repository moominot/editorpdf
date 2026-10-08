// Formularis XFA (només omplir i desar): renderitzat amb la capa XFA de pdf.js
import { S, emit } from './state.js';
import { pdfjs, getPdfPage } from './pdfsource.js';
import { hooks } from './viewer.js';
import { el } from './util.js';

const linkService = {
  getDestinationHash: () => '#', getAnchorUrl: () => '#', setHash() {}, executeNamedAction() {}, executeSetOCGState() {},
  goToDestination() {}, goToPage() {}, addLinkAttributes(link, url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer nofollow'; },
  isPageVisible: () => true, isPageCached: () => true, get pagesCount() { return S.pages.length; }, get page() { return 1; }, set page(v) {},
  get rotation() { return 0; }, set rotation(v) {}, eventBus: { dispatch() {}, on() {}, off() {} },
};

hooks.renderXfa = async (pv) => {
  const e = pv.entry; if (!e) return;
  const src = S.sources.get(e.src);
  const page = await getPdfPage(e.src, e.idx);
  const xfa = await page.getXfa();
  pv.textDiv.replaceChildren();
  let wrap = pv.el.querySelector('.xfa-wrap');
  if (wrap) wrap.remove();
  wrap = el('div', { class: 'xfa-wrap' });
  pv.el.append(wrap);
  if (!xfa) return;
  const viewport = page.getViewport({ scale: pv.s });
  const div = document.createElement('div');
  wrap.append(div);
  pdfjs.XfaLayer.render({ viewport: viewport.clone({ dontFlip: true }), div, xfaHtml: xfa, annotationStorage: src.doc.annotationStorage, linkService, intent: 'display' });
  div.setAttribute('class', 'xfaLayer xfaFont');
  const touch = () => { if (!S.dirty) { S.dirty = true; S.pristine = false; emit('history'); } };
  wrap.addEventListener('input', touch); wrap.addEventListener('change', touch);
};
