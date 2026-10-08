// Cerca de text al document
import { S, emit, on } from './state.js';
import { getPdfPage } from './pdfsource.js';
import { hooks } from './viewer.js';
import { el, debounce } from './util.js';
import { t } from './i18n.js';

let inited = false, hits = [], cur = -1, query = '';
const cache = new Map();

async function pageText(e) {
  const key = e.src + ':' + e.idx;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const page = await getPdfPage(e.src, e.idx);
      return (await page.getTextContent()).items.filter((i) => i.str);
    })());
  }
  return cache.get(key);
}

async function run(q) {
  query = q; hits = []; cur = -1;
  if (q.length < 1) { render(); return; }
  const needle = q.toLowerCase();
  for (const e of S.pages) {
    if (e.blank) continue;
    const view = (await import('./pdfsource.js')).pageInfo;
    const info = await view(e.src, e.idx);
    for (const it of await pageText(e)) {
      const low = it.str.toLowerCase();
      let from = 0, i;
      while ((i = low.indexOf(needle, from)) >= 0) {
        from = i + needle.length;
        const [, , , , x, y] = it.transform;
        const wChar = it.width / Math.max(1, it.str.length);
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]);
        hits.push({ pid: e.id, x: x - info.view[0] + i * wChar, y: info.view[3] - (y + h * 0.95), w: needle.length * wChar, h: h * 1.1 });
      }
    }
  }
  if (hits.length) cur = Math.max(0, hits.findIndex((h) => S.pages.findIndex((p) => p.id === h.pid) >= S.cur));
  render(); focus();
}

function render() {
  const cnt = document.getElementById('find-count');
  cnt.textContent = !query ? '' : hits.length ? `${cur + 1} / ${hits.length}` : t('find_none');
  const viewer = window.__app.viewer;
  for (const pv of viewer.views.values()) drawPage(pv);
}
function drawPage(pv) {
  pv.findLayer.replaceChildren();
  if (!query) return;
  const s = pv.s;
  hits.forEach((h, i) => {
    if (h.pid !== pv.pid) return;
    pv.findLayer.append(el('div', { class: 'find-hit' + (i === cur ? ' cur' : ''), style: { left: h.x * s + 'px', top: h.y * s + 'px', width: h.w * s + 'px', height: h.h * s + 'px' } }));
  });
}
function focus() {
  const h = hits[cur]; if (!h) return;
  const viewer = window.__app.viewer; const pv = viewer.views.get(h.pid); if (!pv) return;
  const idx = S.pages.findIndex((p) => p.id === h.pid);
  viewer.scrollToPage(idx);
  const [cx, cy] = [0, pv.el.offsetTop + (h.y * pv.s) - viewer.scroller.clientHeight / 3];
  viewer.scroller.scrollTo({ top: cy });
}
function step(d) { if (!hits.length) return; cur = (cur + d + hits.length) % hits.length; render(); focus(); }

export function initFind() {
  if (inited) return; inited = true;
  const inp = document.getElementById('find-input');
  inp.addEventListener('input', debounce(() => run(inp.value.trim()), 250));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') document.getElementById('btn-find').click(); });
  document.getElementById('find-next').addEventListener('click', () => step(1));
  document.getElementById('find-prev').addEventListener('click', () => step(-1));
  document.getElementById('find-close').addEventListener('click', () => document.getElementById('btn-find').click());
  const prev = hooks.onPageRendered;
  hooks.onPageRendered = (pv) => { prev(pv); if (query) drawPage(pv); };
  on('docLoaded', () => { cache.clear(); hits = []; query = ''; });
}
export function clearFind() { query = ''; hits = []; cur = -1; document.getElementById('find-count').textContent = ''; render(); }
