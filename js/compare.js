// Comparar dues versions d'un plànol: es pinten les dues pàgines a la mateixa mida i es marca
// en vermell el que només hi ha a l'actual (eliminat), en verd el que només hi ha a la revisió (afegit)
// i amb un requadre cada zona amb canvis. Es pot exportar un informe PDF amb totes les pàgines.
import { S } from './state.js';
import { el } from './util.js';
import { t, addStrings } from './i18n.js';
import { modal, toast, progressDlg } from './ui.js';
import { pdfjs, LOAD_OPTS, entryInfo, entryViewport, getPdfPage } from './pdfsource.js';

addStrings({
  cmpBtn: ['Compara amb una altra versió…', 'Comparar con otra versión…', 'Compare with another version…'],
  cmpMenu: ['Compara', 'Comparar', 'Compare'],
  cmpTitle: ['Comparació: {0} ↔ {1}', 'Comparación: {0} ↔ {1}', 'Comparison: {0} ↔ {1}'],
  cmpA: ['Actual', 'Actual', 'Current'], cmpB: ['Revisió', 'Revisión', 'Revision'],
  cmpDiff: ['Diferències', 'Diferencias', 'Differences'], cmpOverlay: ['Superposició', 'Superposición', 'Overlay'],
  cmpRemoved: ['només a l\'actual (eliminat)', 'solo en el actual (eliminado)', 'only in current (removed)'],
  cmpAdded: ['només a la revisió (afegit)', 'solo en la revisión (añadido)', 'only in revision (added)'],
  cmpZones: ['{0} zona(es) amb canvis', '{0} zona(s) con cambios', '{0} area(s) with changes'],
  cmpSame: ['Sense diferències', 'Sin diferencias', 'No differences'],
  cmpReport: ['Informe PDF', 'Informe PDF', 'PDF report'],
  cmpReportName: ['Comparació', 'Comparación', 'Comparison'],
  cmpWorking: ['Comparant pàgines…', 'Comparando páginas…', 'Comparing pages…'],
  cmpFit: ['Ajusta', 'Ajustar', 'Fit'],
});

const WIDTH = 2000, MAX_PX = 12e6, INK = 200;

async function renderA(e, w) {
  const info = await entryInfo(e), rot = ((info.nativeRot + e.rot) % 360 + 360) % 360;
  const dw = rot % 180 ? info.h : info.w, dh = rot % 180 ? info.w : info.h;
  const sc = Math.min(w / dw, Math.sqrt(MAX_PX / (dw * dh)));
  const page = await getPdfPage(e.src, e.idx);
  const cv = document.createElement('canvas'); cv.width = Math.round(dw * sc); cv.height = Math.round(dh * sc);
  await page.render({ canvas: cv, viewport: entryViewport(page, e, sc, rot), background: '#fff' }).promise;
  return { cv, pt: [dw, dh] };
}
async function renderB(doc, j, w) {
  const page = await doc.getPage(j + 1), vp1 = page.getViewport({ scale: 1 });
  const sc = Math.min(w / vp1.width, Math.sqrt(MAX_PX / (vp1.width * vp1.height)));
  const vp = page.getViewport({ scale: sc });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  await page.render({ canvas: cv, viewport: vp, background: '#fff' }).promise;
  return { cv };
}

// Màscara de tinta (1 = no blanc), dilatada r píxels per tolerar petites diferències d'antialiàsing
function mask(cv, W, H, r) {
  const data = cv.getContext('2d').getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < m.length; i++, p += 4) m[i] = (data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11) < INK ? 1 : 0;
  if (!r) return { m, data };
  const d = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) d[yy * W + xx] = 1;
  }
  return { m, d, data };
}

// Compara: retorna el canvas resultat i les zones amb canvis (requadres en píxels)
export function diff(ca, cb, mode) {
  const W = ca.width, H = Math.max(ca.height, cb.height);
  const a = document.createElement('canvas'); a.width = W; a.height = H;
  const b = document.createElement('canvas'); b.width = W; b.height = H;
  for (const [c, src] of [[a, ca], [b, cb]]) { const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0, W, src.height * W / src.width); }
  const A = mask(a, W, H, 1), B = mask(b, W, H, 1);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d'), img = ctx.createImageData(W, H), o = img.data;
  const CELL = 16, gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL), grid = new Uint16Array(gw * gh);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const inA = A.m[i], inB = B.m[i];
    const removed = inA && !B.d[i], added = inB && !A.d[i];
    if (removed || added) grid[((i / W | 0) / CELL | 0) * gw + ((i % W) / CELL | 0)]++;
    if (mode === 'overlay') {
      const la = A.data[p] * 0.3 + A.data[p + 1] * 0.59 + A.data[p + 2] * 0.11, lb = B.data[p] * 0.3 + B.data[p + 1] * 0.59 + B.data[p + 2] * 0.11;
      o[p] = lb; o[p + 1] = Math.min(la, lb); o[p + 2] = la; o[p + 3] = 255; // actual en vermell, revisió en blau
    } else if (mode === 'a' || mode === 'b') {
      const s = mode === 'a' ? A.data : B.data; o[p] = s[p]; o[p + 1] = s[p + 1]; o[p + 2] = s[p + 2]; o[p + 3] = 255;
    } else {
      if (removed) { o[p] = 220; o[p + 1] = 30; o[p + 2] = 40; }
      else if (added) { o[p] = 20; o[p + 1] = 160; o[p + 2] = 60; }
      else if (inA || inB) { o[p] = o[p + 1] = o[p + 2] = 185; }
      else { o[p] = o[p + 1] = o[p + 2] = 255; }
      o[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // zones: cel·les amb prou píxels canviats, agrupades per veïnatge
  const on = (k) => grid[k] > 4, seen = new Uint8Array(gw * gh), zones = [];
  for (let k = 0; k < gw * gh; k++) {
    if (!on(k) || seen[k]) continue;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0; const st = [k]; seen[k] = 1;
    while (st.length) {
      const c = st.pop(), cx = c % gw, cy = c / gw | 0;
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy, n = ny * gw + nx;
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !seen[n] && on(n)) { seen[n] = 1; st.push(n); }
      }
    }
    zones.push([x0 * CELL - 6, y0 * CELL - 6, (x1 + 1) * CELL + 6, (y1 + 1) * CELL + 6]);
  }
  if (mode === 'diff') {
    ctx.strokeStyle = '#d946ef'; ctx.lineWidth = Math.max(2, W / 700);
    for (const [x0, y0, x1, y1] of zones) ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  return { out, zones };
}

export async function startCompare() {
  if (!S.mainId) return toast(t('needDoc'), 'err');
  const inp = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  document.body.append(inp);
  const file = await new Promise((ok) => { inp.onchange = () => ok(inp.files[0] || null); inp.oncancel = () => ok(null); inp.click(); });
  inp.remove();
  if (!file) return;
  let docB;
  try { docB = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...LOAD_OPTS }).promise; }
  catch (e) { return toast(t('errOpen', e.message || e), 'err', 6000); }
  try { await showCompare(docB, file.name); } finally { docB.destroy(); }
}

async function showCompare(docB, nameB) {
  const pages = S.pages;
  const selA = el('select'), selB = el('select'), mode = el('select');
  pages.forEach((e, i) => selA.append(el('option', { value: i, text: `${t('cmpA')} · ${t('page')} ${i + 1}` })));
  for (let j = 0; j < docB.numPages; j++) selB.append(el('option', { value: j, text: `${t('cmpB')} · ${t('page')} ${j + 1}` }));
  selA.value = Math.min(S.cur, pages.length - 1); selB.value = Math.min(+selA.value, docB.numPages - 1);
  for (const [v, l] of [['diff', t('cmpDiff')], ['overlay', t('cmpOverlay')], ['a', t('cmpA')], ['b', t('cmpB')]]) mode.append(el('option', { value: v, text: l }));
  let zoom = 0; // 0 = ajustat a l'amplada
  const status = el('span', { class: 'muted' });
  const legend = el('span', { class: 'cmp-legend' });
  const sw = (c, txt) => [el('i', { style: { background: c } }), txt];
  const setLegend = () => legend.replaceChildren(...(mode.value === 'diff' ? [...sw('rgb(220,30,40)', t('cmpRemoved')), ...sw('rgb(20,160,60)', t('cmpAdded'))]
    : mode.value === 'overlay' ? [...sw('rgb(255,60,60)', t('cmpA')), ...sw('rgb(60,60,255)', t('cmpB'))] : []));
  const view = el('div', { class: 'cmp-view' });
  let current = null;
  const show = () => {
    if (!current) return;
    current.out.style.width = zoom ? current.out.width * zoom + 'px' : '100%';
    view.replaceChildren(current.out);
  };
  let token = 0;
  const run = async () => {
    const my = ++token;
    status.textContent = t('cmpWorking'); setLegend();
    const ra = await renderA(pages[+selA.value], WIDTH), rb = await renderB(docB, +selB.value, WIDTH);
    if (my !== token) return;
    current = diff(ra.cv, rb.cv, mode.value);
    status.textContent = current.zones.length ? t('cmpZones', current.zones.length) : t('cmpSame');
    show();
  };
  const zb = (txt, fn) => el('button', { class: 'tb', text: txt, onclick: () => { fn(); show(); } });
  const bar = el('div', { class: 'cmp-bar' }, selA, selB, mode,
    zb('−', () => { zoom = (zoom || view.clientWidth / (current?.out.width || 1)) / 1.25; }), zb('+', () => { zoom = (zoom || view.clientWidth / (current?.out.width || 1)) * 1.25; }), zb(t('cmpFit'), () => { zoom = 0; }),
    el('button', { class: 'tb', text: t('cmpReport'), onclick: () => report(docB, nameB, pages) }), status);
  selA.addEventListener('change', () => { if (+selA.value < docB.numPages) selB.value = selA.value; run(); });
  for (const s of [selB, mode]) s.addEventListener('change', run);
  const body = el('div', { class: 'cmp' }, bar, legend, view);
  await modal({
    title: t('cmpTitle', S.file.name, nameB), body, wide: true,
    onOpen: ({ box }) => { box.classList.add('cmp-modal'); run(); },
    buttons: [{ label: t('close'), value: true, primary: true }],
  });
  token++;
}

// Informe: una pàgina per parella amb la imatge de diferències i la llegenda
async function report(docB, nameB, pages) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const n = Math.min(pages.length, docB.numPages);
  const prog = progressDlg(t('cmpWorking'));
  try {
    const out = await PDFDocument.create(), font = await out.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < n; i++) {
      prog.set(i / n);
      const ra = await renderA(pages[i], 1800), rb = await renderB(docB, i, 1800);
      const { out: cv, zones } = diff(ra.cv, rb.cv, 'diff');
      const jpg = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
      const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const [w, h0] = ra.pt, h = h0 * cv.height / ra.cv.height, head = Math.max(18, w / 45);
      const pg = out.addPage([w, h + head]);
      pg.drawImage(img, { x: 0, y: 0, width: w, height: h });
      const fs = head * 0.45, safe = (s) => s.replace(/[^\x20-\x7e -ÿ]/g, '?');
      pg.drawText(safe(`${t('page')} ${i + 1}: ${S.file.name} <-> ${nameB}  |  ${zones.length ? t('cmpZones', zones.length) : t('cmpSame')}`), { x: fs, y: h + head * 0.32, size: fs, font });
      const lx = w - fs * 32;
      pg.drawRectangle({ x: lx, y: h + head * 0.3, width: fs, height: fs, color: rgb(0.86, 0.12, 0.16) });
      pg.drawText(safe(t('cmpRemoved')), { x: lx + fs * 1.4, y: h + head * 0.32, size: fs * 0.8, font });
      pg.drawRectangle({ x: lx + fs * 15, y: h + head * 0.3, width: fs, height: fs, color: rgb(0.08, 0.63, 0.24) });
      pg.drawText(safe(t('cmpAdded')), { x: lx + fs * 16.4, y: h + head * 0.32, size: fs * 0.8, font });
    }
    const bytes = await out.save();
    prog.close();
    (await import('./main.js')).openDocument(bytes, `${t('cmpReportName')} - ${S.file.name.replace(/.pdf$/i, '')}.pdf`);
  } catch (e) { prog.close(); toast(String(e.message || e), 'err', 8000); }
}
