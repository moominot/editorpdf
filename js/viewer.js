// Visor de pàgines: renderitzat mandrós, zoom, capes (text, formularis, objectes)
import { S, pageById, emit } from './state.js';
import { entryInfo, entryViewport, getPdfPage, pdfjs } from './pdfsource.js';
import { el, clamp, localToDisplay, displayToLocal } from './util.js';
import { ocConfig } from './layers.js';

export const CSS_PER_PT = 96 / 72;
const MAX_PIXELS = 24e6;    // pàgina sencera (a molt de zoom queda per sota de la resolució de pantalla)
const DETAIL_PIXELS = 16e6; // zona visible a resolució de pantalla, a sobre de la pàgina sencera
export const MAX_ZOOM = 16;

const renderOpts = (e) => ({ annotationMode: e.src === S.mainId ? pdfjs.AnnotationMode.ENABLE_FORMS : pdfjs.AnnotationMode.ENABLE, optionalContentConfigPromise: ocConfig(e.src) });

// Hooks que ompl la resta de mòduls (evita imports circulars)
export const hooks = {
  renderLayers: (pv) => {},   // objectes + resaltats
  renderForms: (pv) => {},    // camps de formulari
  renderXfa: async (pv) => {},
  onPageRendered: (pv) => {},
};

export function frameTransform(rot, pw, ph) {
  // pw, ph: mida sense rotar en px
  switch (rot) {
    case 90: return `translate(${ph}px,0) rotate(90deg)`;
    case 180: return `translate(${pw}px,${ph}px) rotate(180deg)`;
    case 270: return `translate(0,${pw}px) rotate(270deg)`;
    default: return 'none';
  }
}

export class PageView {
  constructor(viewer, entry) {
    this.viewer = viewer;
    this.pid = entry.id;
    this.info = null;
    this.sig = '';
    this.rendered = false;
    this.token = 0;
    this.task = null;
    this.visible = false;

    this.canvas = el('canvas', { class: 'main' });
    this.detail = el('canvas', { class: 'detail' }); this.detail.hidden = true;
    this.dtoken = 0; this.dtask = null; this.detailRect = null; this.lowRes = false;
    this.hlLayer = el('div', { class: 'hl-layer' });
    this.textDiv = el('div', { class: 'textLayer' });
    this.formLayer = el('div', { class: 'form-layer' });
    this.objLayer = el('div', { class: 'obj-layer' });
    this.findLayer = el('div', { class: 'find-layer' });
    this.frame = el('div', { class: 'frame' }, this.formLayer, this.objLayer, this.findLayer);
    this.capture = el('div', { class: 'capture' });
    this.el = el('div', { class: 'pg', 'data-pid': entry.id }, this.canvas, this.detail, this.hlLayer, this.textDiv, this.capture, this.frame);
    this.el.pv = this;
    this.setPlaceholderSize(595, 842);
  }
  get entry() { return pageById(this.pid); }
  get s() { return S.zoom * CSS_PER_PT; }
  get rot() { const e = this.entry; return (((this.info?.nativeRot || 0) + (e?.rot || 0)) % 360 + 360) % 360; }
  // mida sense rotar (px)
  get pw() { return (this.info?.w || 595) * this.s; }
  get ph() { return (this.info?.h || 842) * this.s; }
  get dw() { return this.rot % 180 ? this.ph : this.pw; }
  get dh() { return this.rot % 180 ? this.pw : this.ph; }

  setPlaceholderSize(w, h) { this.el.style.width = w * CSS_PER_PT * S.zoom + 'px'; this.el.style.height = h * CSS_PER_PT * S.zoom + 'px'; }

  async init() {
    const e = this.entry; if (!e) return;
    this.info = await entryInfo(e);
    this.sig = this.signature();
    this.layout();
  }
  signature() { const e = this.entry; return e ? `${e.src}:${e.idx}:${e.rot}:${e.box || ''}` : ''; }

  layout() {
    if (!this.info) return;
    const { pw, ph, dw, dh, rot } = this;
    this.el.style.width = dw + 'px'; this.el.style.height = dh + 'px';
    for (const f of [this.frame, this.hlLayer]) {
      f.style.width = pw + 'px'; f.style.height = ph + 'px';
      f.style.transform = frameTransform(rot, pw, ph);
    }
    this.el.style.setProperty('--total-scale-factor', this.s);
    this.el.style.setProperty('--scale-factor', this.s);
    this.canvas.style.width = dw + 'px'; this.canvas.style.height = dh + 'px';
    this.placeDetail();
  }
  // el detall es guarda en fraccions de la pàgina: en canviar el zoom s'estira fins que es torna a pintar
  placeDetail() {
    const r = this.detailRect; if (!r) return;
    const st = this.detail.style, { dw, dh } = this;
    st.left = r.x * dw + 'px'; st.top = r.y * dh + 'px'; st.width = r.w * dw + 'px'; st.height = r.h * dh + 'px';
  }
  dropDetail() {
    this.dtoken++; this.dtask?.cancel?.(); this.dtask = null;
    this.detailRect = null; this.cover = null; this.detail.hidden = true; this.detail.width = 1; this.detail.height = 1;
  }

  // coordenades de pantalla -> punts locals de la pàgina (origen dalt-esq. sense rotar)
  clientToLocalPt(cx, cy) {
    const r = this.el.getBoundingClientRect();
    const [lx, ly] = displayToLocal(this.rot, cx - r.left, cy - r.top, this.pw, this.ph);
    return [lx / this.s, ly / this.s];
  }
  // rectangle de pantalla (client) -> rect local en punts
  clientRectToLocal(rc) {
    const a = this.clientToLocalPt(rc.left, rc.top), b = this.clientToLocalPt(rc.right, rc.bottom);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    return { x, y, w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
  }
  localToClient(u, v) {
    const r = this.el.getBoundingClientRect();
    const [dx, dy] = localToDisplay(this.rot, u * this.s, v * this.s, this.pw, this.ph);
    return [r.left + dx, r.top + dy];
  }

  async render() {
    if (!this.info) await this.init();
    const e = this.entry; if (!e) return;
    const token = ++this.token;
    this.layout();
    this.task?.cancel?.(); this.task = null;
    this.refreshLayers();
    const { dw, dh, s, rot } = this;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    let out = dpr;
    if (dw * dh * out * out > MAX_PIXELS) out = Math.sqrt(MAX_PIXELS / (dw * dh));
    this.dpr = dpr; this.lowRes = out < dpr * 0.98 && !e.blank;
    const cw = Math.max(1, Math.floor(dw * out)), ch = Math.max(1, Math.floor(dh * out));

    if (e.blank) {
      this.canvas.width = cw; this.canvas.height = ch;
      const ctx = this.canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      this.dropDetail(); this.rendered = true; hooks.onPageRendered(this); return;
    }
    const src = S.sources.get(e.src);
    if (src?.isXfa) { await hooks.renderXfa(this); this.rendered = true; return; }

    const page = await getPdfPage(e.src, e.idx);
    if (token !== this.token) return;
    const viewport = entryViewport(page, e, s, rot);
    // canvas temporal per evitar parpelleig: es pinta fora de pantalla i es copia
    const buf = document.createElement('canvas'); buf.width = cw; buf.height = ch;
    try {
      this.task = page.render({ canvas: buf, viewport, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : null, ...renderOpts(e) });
      await this.task.promise;
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return;
      console.warn('render', err); return;
    }
    if (token !== this.token) return;
    this.canvas.width = cw; this.canvas.height = ch;
    this.canvas.getContext('2d').drawImage(buf, 0, 0);
    this.rendered = true;
    this.cover = null;
    if (this.lowRes) this.renderDetail(); else this.dropDetail();

    // capa de text (selecció, resaltat, edició de text)
    this.textDiv.replaceChildren();
    try {
      const tc = await page.getTextContent();
      if (token !== this.token) return;
      const tl = new pdfjs.TextLayer({ textContentSource: tc, container: this.textDiv, viewport });
      await tl.render();
      if (token !== this.token) return;
      this.tl = tl; this.textItems = tc.items.filter((i) => typeof i.str === 'string'); this.textStyles = tc.styles;
    } catch (err) { if (token === this.token) console.warn('textLayer', err); }
    hooks.onPageRendered(this);
  }

  // Quan la pàgina sencera no arriba a la resolució de pantalla, es pinta a part la zona visible
  // (amb marge) a resolució completa. Només es repinta si la zona visible surt de la que ja hi ha.
  async renderDetail() {
    const e = this.entry;
    if (!e || e.blank || !this.lowRes || !this.visible || !this.rendered) return;
    const sc = this.viewer.scroller.getBoundingClientRect(), r = this.el.getBoundingClientRect();
    const { dw, dh, token } = this;
    const x0 = Math.max(0, sc.left - r.left), y0 = Math.max(0, sc.top - r.top);
    const x1 = Math.min(dw, sc.right - r.left), y1 = Math.min(dh, sc.bottom - r.top);
    if (x1 <= x0 || y1 <= y0) return;
    const c = this.cover;
    if (c && c.token === token && x0 >= c.x0 - 1 && y0 >= c.y0 - 1 && x1 <= c.x1 + 1 && y1 <= c.y1 + 1) return;
    // marge: fins a mitja zona visible per banda, dins el pressupost de píxels
    const vw = x1 - x0, vh = y1 - y0;
    const k = Math.sqrt(DETAIL_PIXELS / (vw * vh * this.dpr * this.dpr));
    const d = k < 1 ? this.dpr * k : this.dpr, g = clamp(k, 1, 2);
    const mx = vw * (g - 1) / 2, my = vh * (g - 1) / 2;
    const px0 = Math.floor(Math.max(0, x0 - mx) * d), py0 = Math.floor(Math.max(0, y0 - my) * d);
    const cw = Math.ceil(Math.min(dw, x1 + mx) * d) - px0, ch = Math.ceil(Math.min(dh, y1 + my) * d) - py0;
    const dtok = ++this.dtoken;
    this.dtask?.cancel?.(); this.dtask = null;
    const page = await getPdfPage(e.src, e.idx);
    if (dtok !== this.dtoken || token !== this.token) return;
    const viewport = entryViewport(page, e, this.s, this.rot);
    const buf = document.createElement('canvas'); buf.width = cw; buf.height = ch;
    try {
      this.dtask = page.render({ canvas: buf, viewport, transform: [d, 0, 0, d, -px0, -py0], ...renderOpts(e) });
      await this.dtask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.warn('detail', err);
      return;
    }
    if (dtok !== this.dtoken || token !== this.token) return;
    this.dtask = null;
    this.detail.width = cw; this.detail.height = ch;
    this.detail.getContext('2d').drawImage(buf, 0, 0);
    this.detailRect = { x: px0 / d / dw, y: py0 / d / dh, w: cw / d / dw, h: ch / d / dh };
    this.cover = { token, x0: px0 / d, y0: py0 / d, x1: (px0 + cw) / d, y1: (py0 + ch) / d };
    this.placeDetail(); this.detail.hidden = false;
  }

  release() {
    this.token++;
    this.task?.cancel?.(); this.task = null;
    this.dropDetail();
    this.canvas.width = 1; this.canvas.height = 1;
    this.textDiv.replaceChildren();
    this.formLayer.replaceChildren(); this.objLayer.replaceChildren(); this.hlLayer.replaceChildren(); this.findLayer.replaceChildren();
    this.rendered = false;
  }

  refreshLayers() {
    if (!this.info || !this.visible && !this.rendered) return;
    hooks.renderLayers(this);
    hooks.renderForms(this);
  }
  destroy() { this.release(); this.el.remove(); }
}

export class Viewer {
  constructor(scroller, container) {
    this.scroller = scroller;
    this.box = container;
    this.views = new Map();
    this.io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        const pv = en.target.pv; if (!pv) continue;
        pv.visible = en.isIntersecting;
        if (en.isIntersecting) { if (!pv.rendered) this.queueRender(pv); }
        else if (pv.rendered) this.scheduleRelease(pv);
      }
    }, { root: scroller, rootMargin: '1500px 0px' });
    this.renderQueue = [];
    this.working = 0;
    let raf = 0;
    let dt = 0;
    const details = () => { clearTimeout(dt); dt = setTimeout(() => { for (const pv of this.views.values()) if (pv.lowRes && pv.visible) pv.renderDetail(); }, 120); };
    scroller.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.updateCurrent(); }); details(); }, { passive: true });
    window.addEventListener('resize', details);
  }

  queueRender(pv) {
    if (!this.renderQueue.includes(pv)) this.renderQueue.push(pv);
    this.pump();
  }
  async pump() {
    while (this.working < 3 && this.renderQueue.length) {
      // prioritza les pàgines més a prop del centre
      const mid = this.scroller.scrollTop + this.scroller.clientHeight / 2;
      this.renderQueue.sort((a, b) => Math.abs(a.el.offsetTop + a.el.offsetHeight / 2 - mid) - Math.abs(b.el.offsetTop + b.el.offsetHeight / 2 - mid));
      const pv = this.renderQueue.shift();
      if (!pv.visible || !pv.entry) continue;
      this.working++;
      pv.render().catch((e) => console.warn(e)).finally(() => { this.working--; this.pump(); });
    }
  }
  scheduleRelease(pv) {
    clearTimeout(pv._rel);
    pv._rel = setTimeout(() => { if (!pv.visible && pv.rendered) pv.release(); }, 4000);
  }

  clear() {
    for (const pv of this.views.values()) pv.destroy();
    this.views.clear(); this.box.replaceChildren();
  }

  // Reconcilia S.pages amb el DOM
  async sync() {
    const want = new Set(S.pages.map((p) => p.id));
    for (const [pid, pv] of [...this.views]) if (!want.has(pid)) { this.io.unobserve(pv.el); pv.destroy(); this.views.delete(pid); }
    let prev = null; const inits = [];
    for (const e of S.pages) {
      let pv = this.views.get(e.id);
      if (!pv) { pv = new PageView(this, e); this.views.set(e.id, pv); inits.push(pv.init().then(() => this.io.observe(pv.el))); }
      else if (pv.signature() !== pv.sig) {
        pv.release(); pv.sig = pv.signature();
        inits.push(pv.init().then(() => { if (pv.visible) this.queueRender(pv); }));
      }
      const wantBefore = prev ? prev.nextSibling : this.box.firstChild;
      if (pv.el !== wantBefore) this.box.insertBefore(pv.el, wantBefore);
      prev = pv.el;
    }
    await Promise.all(inits);
    this.updateCurrent();
    emit('viewerSynced');
  }

  relayoutAll() {
    for (const pv of this.views.values()) {
      pv.layout();
      if (pv.rendered) { pv.rendered = false; pv.token++; pv.task?.cancel?.(); if (pv.visible) this.queueRender(pv); }
    }
  }

  refreshLayers(pid) {
    if (pid) this.views.get(pid)?.refreshLayers();
    else for (const pv of this.views.values()) if (pv.rendered || pv.visible) pv.refreshLayers();
  }

  setZoom(z, keepCenter = true) {
    z = clamp(z, 0.1, MAX_ZOOM);
    if (Math.abs(z - S.zoom) < 1e-4) return;
    const sc = this.scroller;
    const fy = (sc.scrollTop + sc.clientHeight / 2) / Math.max(1, sc.scrollHeight);
    const fx = (sc.scrollLeft + sc.clientWidth / 2) / Math.max(1, sc.scrollWidth);
    S.zoom = z;
    // el canvas es manté amb la mida CSS nova mentre es re-renderitza
    this.relayoutAll();
    if (keepCenter) {
      sc.scrollTop = fy * sc.scrollHeight - sc.clientHeight / 2;
      sc.scrollLeft = fx * sc.scrollWidth - sc.clientWidth / 2;
    }
    emit('zoom', z);
  }
  fit(mode) {
    const pv = [...this.views.values()][S.cur] || [...this.views.values()][0];
    if (!pv?.info) return;
    const rotated = pv.rot % 180;
    const wpt = rotated ? pv.info.h : pv.info.w, hpt = rotated ? pv.info.w : pv.info.h;
    const aw = this.scroller.clientWidth - (innerWidth < 820 ? 14 : 40);
    const ah = this.scroller.clientHeight - 36;
    const zw = aw / (wpt * CSS_PER_PT), zh = ah / (hpt * CSS_PER_PT);
    this.setZoom(mode === 'width' ? zw : Math.min(zw, zh), false);
    this.scrollToPage(S.cur);
  }

  scrollToPage(i, smooth = false) {
    const e = S.pages[i]; if (!e) return;
    const pv = this.views.get(e.id); if (!pv) return;
    this.scroller.scrollTo({ top: pv.el.offsetTop - 12, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Pàgina i alçada local (punts des de dalt, sense rotar), p. ex. la destinació d'un marcador
  scrollToPoint(i, y) {
    const e = S.pages[i]; if (!e) return;
    const pv = this.views.get(e.id); if (!pv) return;
    let off = 0;
    if (y && pv.info) { // punt més alt, a la pantalla, de la línia horitzontal y de la pàgina (amb qualsevol rotació)
      const top = Math.min(pv.localToClient(0, y)[1], pv.localToClient(pv.info.w, y)[1]);
      off = Math.max(0, top - pv.el.getBoundingClientRect().top);
    }
    this.scroller.scrollTo({ top: pv.el.offsetTop + off - 12 });
  }

  updateCurrent() {
    const sc = this.scroller; const mid = sc.scrollTop + sc.clientHeight * 0.4;
    let best = 0, bestD = Infinity, i = 0;
    for (const e of S.pages) {
      const pv = this.views.get(e.id);
      if (pv) {
        const top = pv.el.offsetTop, bot = top + pv.el.offsetHeight;
        const d = mid < top ? top - mid : mid > bot ? mid - bot : 0;
        if (d < bestD) { bestD = d; best = i; }
      }
      i++;
    }
    if (best !== S.cur || !this._cur) { S.cur = best; this._cur = true; emit('currentPage', best); }
  }
}
