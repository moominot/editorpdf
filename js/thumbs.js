// Barra lateral amb miniatures: selecció múltiple i reordenació arrossegant
import { S, pageIndex, emit } from './state.js';
import { pageInfo, getPdfPage } from './pdfsource.js';
import { el, clamp } from './util.js';
import { movePages } from './pageops.js';

const THUMB_W = 124;

export class Thumbs {
  constructor(list, viewer) {
    this.list = list; this.viewer = viewer;
    this.items = new Map();
    this.queue = []; this.busy = 0;
    this.io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        const it = en.target._it; if (!it) continue;
        it.visible = en.isIntersecting;
        if (it.visible && it.sig !== it.renderedSig) this.enqueue(it);
      }
    }, { root: list, rootMargin: '400px 0px' });
    list.addEventListener('keydown', (e) => this.onKey(e));
    list.addEventListener('pointerdown', (e) => { if (e.target === list) { S.pageSel = new Set(); this.updateSelection(); emit('pageSelection'); } });
  }

  clear() { for (const it of this.items.values()) { this.io.unobserve(it.el); it.el.remove(); } this.items.clear(); }

  async sync() {
    const want = new Set(S.pages.map((p) => p.id));
    for (const [pid, it] of [...this.items]) if (!want.has(pid)) { this.io.unobserve(it.el); it.el.remove(); this.items.delete(pid); }
    let prev = null;
    S.pages.forEach((e, i) => {
      let it = this.items.get(e.id);
      if (!it) it = this.make(e);
      it.num.textContent = i + 1;
      it.sig = `${e.src}:${e.idx}:${e.rot}:${e.blank ? 'b' : ''}`;
      if (it.sig !== it.renderedSig && it.visible) this.enqueue(it);
      const next = prev ? prev.nextSibling : this.list.firstChild;
      if (it.el !== next) this.list.insertBefore(it.el, next);
      prev = it.el;
    });
    this.updateSelection();
  }

  make(e) {
    const canvas = el('canvas', { width: THUMB_W, height: Math.round(THUMB_W * 1.41) });
    const num = el('span', { class: 'th-num' });
    const grip = el('span', { class: 'th-grip' }); grip.innerHTML = '<svg><use href="#i-grip"/></svg>';
    const node = el('div', { class: 'th', 'data-pid': e.id }, canvas, num, grip);
    const it = { pid: e.id, el: node, canvas, num, grip, visible: false, sig: '', renderedSig: '' };
    node._it = it;
    node.addEventListener('pointerdown', (ev) => this.onDown(ev, it));
    node.addEventListener('dblclick', () => this.viewer.scrollToPage(pageIndex(e.id)));
    this.items.set(e.id, it);
    this.io.observe(node);
    return it;
  }

  enqueue(it) { if (!this.queue.includes(it)) this.queue.push(it); this.pump(); }
  async pump() {
    while (this.busy < 2 && this.queue.length) {
      const it = this.queue.shift();
      const e = S.pages.find((p) => p.id === it.pid); if (!e) continue;
      this.busy++;
      this.draw(it, e).catch((err) => console.warn('thumb', err)).finally(() => { this.busy--; this.pump(); });
    }
  }
  async draw(it, e) {
    const sig = it.sig;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const info = e.blank ? { w: e.blank.w, h: e.blank.h, nativeRot: 0 } : await pageInfo(e.src, e.idx);
    const rot = (info.nativeRot + e.rot) % 360;
    const w = rot % 180 ? info.h : info.w, h = rot % 180 ? info.w : info.h;
    const scale = THUMB_W / w;
    const cv = document.createElement('canvas');
    cv.width = Math.round(THUMB_W * dpr); cv.height = Math.round(h * scale * dpr);
    if (e.blank) { const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); }
    else {
      const page = await getPdfPage(e.src, e.idx);
      const vp = page.getViewport({ scale: scale * dpr, rotation: rot });
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({ canvas: cv, viewport: vp }).promise;
    }
    it.canvas.width = cv.width; it.canvas.height = cv.height;
    it.canvas.style.width = THUMB_W + 'px'; it.canvas.style.height = Math.round(h * scale) + 'px';
    it.canvas.getContext('2d').drawImage(cv, 0, 0);
    it.renderedSig = sig;
  }

  updateSelection() {
    const cur = S.pages[S.cur];
    for (const [pid, it] of this.items) {
      it.el.classList.toggle('sel', S.pageSel.has(pid));
      it.el.classList.toggle('cur', !!cur && cur.id === pid);
    }
  }
  setCurrent() {
    this.updateSelection();
    const cur = S.pages[S.cur]; const it = cur && this.items.get(cur.id);
    if (it) {
      const lr = this.list.getBoundingClientRect(), r = it.el.getBoundingClientRect();
      if (r.top < lr.top || r.bottom > lr.bottom) this.list.scrollTop += (r.top - lr.top) - lr.height / 2 + r.height / 2;
    }
  }

  select(pid, ev) {
    const idx = pageIndex(pid);
    if (ev.shiftKey && S.anchor != null && S.pages[S.anchor]) {
      const a = Math.min(S.anchor, idx), b = Math.max(S.anchor, idx);
      S.pageSel = new Set(S.pages.slice(a, b + 1).map((p) => p.id));
    } else if (ev.ctrlKey || ev.metaKey) {
      const s = new Set(S.pageSel); s.has(pid) ? s.delete(pid) : s.add(pid); S.pageSel = s; S.anchor = idx;
    } else { S.pageSel = new Set([pid]); S.anchor = idx; }
    this.updateSelection(); emit('pageSelection');
  }

  onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); S.pageSel = new Set(S.pages.map((p) => p.id)); this.updateSelection(); emit('pageSelection'); }
    else if (e.key === 'Delete') { e.preventDefault(); document.querySelector('[data-pg="del"]').click(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = clamp(S.cur + (e.key === 'ArrowDown' ? 1 : -1), 0, S.pages.length - 1);
      S.pageSel = new Set([S.pages[i].id]); S.anchor = i;
      this.viewer.scrollToPage(i); this.updateSelection(); emit('pageSelection');
    }
  }

  // Arrossegar per reordenar (ratolí: tot l'element; tàctil: l'agafador)
  onDown(ev, it) {
    if (ev.button > 0) return;
    const touch = ev.pointerType === 'touch';
    if (touch && !ev.target.closest('.th-grip')) {
      let moved = false; const sx = ev.clientX, sy = ev.clientY;
      const mv = (m) => { if (Math.hypot(m.clientX - sx, m.clientY - sy) > 8) moved = true; };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        if (!moved) { this.select(it.pid, {}); this.viewer.scrollToPage(pageIndex(it.pid)); document.body.classList.remove('side-open'); }
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      return;
    }
    const sx = ev.clientX, sy = ev.clientY;
    const modifier = ev.ctrlKey || ev.metaKey || ev.shiftKey;
    const keepGroup = S.pageSel.has(it.pid) && S.pageSel.size > 1 && !modifier;
    if (!keepGroup) this.select(it.pid, ev);
    if (!modifier && !touch) this.viewer.scrollToPage(pageIndex(it.pid));
    if (touch) ev.preventDefault();
    let dragging = false, ghost = null, line = null, ids = [], insertIdx = 0, raf = 0, lastY = sy;

    const calcInsert = (y) => {
      let idx = S.pages.length, top = null;
      for (let i = 0; i < S.pages.length; i++) {
        const node = this.items.get(S.pages[i].id)?.el; if (!node) continue;
        const r = node.getBoundingClientRect();
        if (y < r.top + r.height / 2) { idx = i; top = node.offsetTop - 5; break; }
      }
      if (top == null) { const last = this.items.get(S.pages[S.pages.length - 1].id)?.el; top = last ? last.offsetTop + last.offsetHeight + 1 : 0; }
      return [idx, top];
    };
    const start = () => {
      dragging = true;
      ids = S.pages.filter((p) => S.pageSel.has(p.id)).map((p) => p.id);
      if (!ids.includes(it.pid)) ids = [it.pid];
      ghost = el('div', { class: 'th-ghost' });
      const c = document.createElement('canvas'); c.width = it.canvas.width; c.height = it.canvas.height; c.getContext('2d').drawImage(it.canvas, 0, 0);
      c.style.width = Math.min(110, parseFloat(it.canvas.style.width) || 110) + 'px';
      ghost.append(c); if (ids.length > 1) ghost.append(el('span', { class: 'cnt', text: ids.length }));
      document.body.append(ghost);
      line = el('div', { class: 'drop-line' }); this.list.append(line);
      ids.forEach((id) => this.items.get(id)?.el.classList.add('dragging'));
    };
    const place = () => {
      raf = 0;
      const [idx, top] = calcInsert(lastY); insertIdx = idx; line.style.top = top + 'px';
      const lr = this.list.getBoundingClientRect();
      if (lastY < lr.top + 40) this.list.scrollTop -= 14; else if (lastY > lr.bottom - 40) this.list.scrollTop += 14;
      if (dragging) raf = requestAnimationFrame(place);
    };
    const move = (m) => {
      lastY = m.clientY;
      if (!dragging) { if (Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return; start(); place(); }
      ghost.style.left = m.clientX + 10 + 'px'; ghost.style.top = m.clientY + 10 + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf);
      if (dragging) {
        ghost.remove(); line.remove();
        ids.forEach((id) => this.items.get(id)?.el.classList.remove('dragging'));
        movePages(ids, insertIdx);
      } else if (keepGroup) { this.select(it.pid, {}); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
}
