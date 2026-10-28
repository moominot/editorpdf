// Retallar pàgines i canviar-ne la mida (e.box: caixa visible en coordenades PDF de la pàgina original).
// En canviar la caixa es desplacen els objectes, l'OCR i els marcadors perquè no es moguin respecte del contingut.
import { S, commit, pageById } from './state.js';
import { el, uid } from './util.js';
import { t, addStrings } from './i18n.js';
import { modal, toast } from './ui.js';
import { entryInfo } from './pdfsource.js';
import { shiftObj, setPlacement } from './objects.js';

addStrings({
  pbTitle: ['Retalla o canvia la mida de les pàgines', 'Recortar o cambiar el tamaño de las páginas', 'Crop or resize pages'],
  pbScope: ['Aplica a', 'Aplicar a', 'Apply to'],
  pbCur: ['Pàgina actual', 'Página actual', 'Current page'],
  pbSel: ['Pàgines seleccionades ({0})', 'Páginas seleccionadas ({0})', 'Selected pages ({0})'],
  pbAll: ['Totes les pàgines', 'Todas las páginas', 'All pages'],
  pbDraw: ['Dibuixa el rectangle sobre la pàgina', 'Dibujar el rectángulo sobre la página', 'Draw the rectangle on the page'],
  pbMargins: ['Retalla marges (mm; negatiu = afegeix espai)', 'Recortar márgenes (mm; negativo = añadir espacio)', 'Trim margins (mm; negative = add space)'],
  pbSize: ['Mida del full (centrada)', 'Tamaño del papel (centrado)', 'Paper size (centred)'],
  pbReset: ['Restaura la mida original', 'Restaurar el tamaño original', 'Restore original size'],
  pbTop: ['Dalt', 'Arriba', 'Top'], pbRight: ['Dreta', 'Derecha', 'Right'], pbBottom: ['Baix', 'Abajo', 'Bottom'], pbLeft: ['Esquerra', 'Izquierda', 'Left'],
  pbOrient: ['Orientació', 'Orientación', 'Orientation'],
  pbPortrait: ['Vertical', 'Vertical', 'Portrait'], pbLandscape: ['Horitzontal', 'Horizontal', 'Landscape'], pbAuto: ['Com la pàgina', 'Como la página', 'Like the page'],
  pbHint: ['Dibuixa el rectangle que vols conservar (Esc per cancel·lar).', 'Dibuja el rectángulo que quieres conservar (Esc para cancelar).', 'Draw the rectangle to keep (Esc to cancel).'],
  pbDone: ['Mida canviada a {0} pàgina(es)', 'Tamaño cambiado en {0} página(s)', 'Resized {0} page(s)'],
  pbTooSmall: ['La mida resultant és massa petita.', 'El tamaño resultante es demasiado pequeño.', 'The resulting size is too small.'],
});

const MM = 72 / 25.4;
const SIZES = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189], Carta: [215.9, 279.4] };

// Canvia la caixa d'una pàgina (sense desar a l'historial: ho fa qui crida, un cop per a totes)
export async function setBox(e, box) {
  const cur = await entryInfo(e);
  const base = cur.base || cur.view;
  if (box && box.every((v, i) => Math.abs(v - base[i]) < 0.01)) box = null;
  const nv = box || base;
  const dx = cur.view[0] - nv[0], dy = nv[3] - cur.view[3];
  if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
    for (const o of e.objs) shiftObj(o, dx, dy);
    const words = e.ocr ? S.ocrStore.get(e.ocr.id)?.words : null;
    if (words) { // l'OCR és fora de l'historial: una còpia nova perquè desfer continuï sent coherent
      const id = uid('ocr');
      S.ocrStore.set(id, { words: words.map((w) => ({ ...w, x: w.x + dx, y: w.y + dy })) });
      e.ocr = { ...e.ocr, id };
    }
    const walk = (list) => { for (const b of list) { if (b.pid === e.id && b.y != null) b.y = Math.max(0, b.y + dy); walk(b.items); } };
    walk(S.outline.items);
  }
  if (box) e.box = box.map((v) => Math.round(v * 100) / 100); else delete e.box;
}

async function apply(ids, boxFor) {
  let n = 0;
  for (const id of ids) {
    const e = pageById(id); if (!e) continue;
    const info = await entryInfo(e);
    const box = boxFor(info, e);
    if (box === undefined) continue;
    if (box && (box[2] - box[0] < 10 || box[3] - box[1] < 10)) { toast(t('pbTooSmall'), 'err'); return; }
    await setBox(e, box); n++;
  }
  if (n) { commit('structure'); toast(t('pbDone', n), 'ok'); }
}

// Rectangle local (punts des de dalt-esquerra de la vista) -> caixa PDF
const localToBox = (view, r) => [view[0] + r.x, view[3] - (r.y + r.h), view[0] + r.x + r.w, view[3] - r.y];

export async function cropDialog(selIds) {
  const cur = S.pages[S.cur]; if (!cur) return;
  const radio = (name, value, label, checked) => el('label', { class: 'row', style: { gap: '8px' } }, el('input', { type: 'radio', name, value, checked }), el('span', { text: label }));
  const num = (v) => el('input', { type: 'number', value: v, step: 1, style: { width: '70px' } });
  const mt = num(10), mr = num(10), mb = num(10), ml = num(10);
  const size = el('select'); for (const k of Object.keys(SIZES)) size.append(el('option', { value: k, text: k }));
  size.value = 'A3';
  const orient = el('select');
  for (const [v, l] of [['auto', t('pbAuto')], ['p', t('pbPortrait')], ['l', t('pbLandscape')]]) orient.append(el('option', { value: v, text: l }));
  const scope = el('div', {},
    el('strong', { text: t('pbScope') }),
    radio('pbs', 'cur', t('pbCur'), selIds.length <= 1),
    selIds.length > 1 ? radio('pbs', 'sel', t('pbSel', selIds.length), true) : null,
    radio('pbs', 'all', t('pbAll'), false));
  const modes = el('div', { style: { marginTop: '10px' } },
    radio('pbm', 'draw', t('pbDraw'), true),
    radio('pbm', 'margins', t('pbMargins'), false),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 6px 26px' } },
      ...[[t('pbTop'), mt], [t('pbRight'), mr], [t('pbBottom'), mb], [t('pbLeft'), ml]].map(([l, i]) => el('label', {}, l + ' ', i))),
    radio('pbm', 'size', t('pbSize'), false),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 6px 26px' } }, size, el('label', {}, t('pbOrient') + ' ', orient)),
    radio('pbm', 'reset', t('pbReset'), false));
  const body = el('div', {}, scope, modes);
  for (const i of [mt, mr, mb, ml]) i.addEventListener('focus', () => { body.querySelector('[name=pbm][value=margins]').checked = true; });
  for (const i of [size, orient]) i.addEventListener('focus', () => { body.querySelector('[name=pbm][value=size]').checked = true; });
  const ok = await modal({ title: t('pbTitle'), body, buttons: [{ label: t('cancel'), value: false }, { label: t('accept'), value: true, primary: true }] });
  if (!ok) return;
  const sc = body.querySelector('[name=pbs]:checked').value, mode = body.querySelector('[name=pbm]:checked').value;
  const ids = sc === 'all' ? S.pages.map((p) => p.id) : sc === 'sel' ? selIds : [cur.id];

  if (mode === 'reset') return apply(ids, (info) => (info.base ? null : undefined));
  if (mode === 'margins') {
    const [a, b, c, d] = [mt, mr, mb, ml].map((i) => (+i.value || 0) * MM);
    // els marges s'entenen tal com es veu la pàgina (amb la rotació aplicada)
    return apply(ids, (info, e) => {
      const rot = ((info.nativeRot + e.rot) % 360 + 360) % 360;
      const [top, right, bottom, left] = { 0: [a, b, c, d], 90: [d, a, b, c], 180: [c, d, a, b], 270: [b, c, d, a] }[rot];
      const v = info.view;
      return [v[0] + left, v[1] + bottom, v[2] - right, v[3] - top];
    });
  }
  if (mode === 'size') {
    const [w0, h0] = SIZES[size.value].map((v) => v * MM);
    return apply(ids, (info, e) => {
      const rotated = ((info.nativeRot + e.rot) % 180) !== 0;
      const shownLandscape = rotated ? info.h > info.w : info.w > info.h;
      const land = orient.value === 'auto' ? shownLandscape : orient.value === 'l';
      let [w, h] = land ? [Math.max(w0, h0), Math.min(w0, h0)] : [Math.min(w0, h0), Math.max(w0, h0)];
      if (rotated) [w, h] = [h, w];
      const cx = (info.view[0] + info.view[2]) / 2, cy = (info.view[1] + info.view[3]) / 2;
      return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    });
  }
  // dibuixar: el rectangle de la pàgina on es dibuixa s'aplica a la resta en la mateixa posició
  const r = await new Promise((resolve) => {
    setPlacement({ kind: 'rect', resolve, cancel: () => resolve(null) });
    document.body.dataset.tool = 'sign';
    toast(t('pbHint'), '', 6000);
  });
  document.body.dataset.tool = S.tool;
  if (!r || r.w < 5 || r.h < 5) return;
  const src = await entryInfo(pageById(r.pid));
  const box = localToBox(src.view, r);
  if (!ids.includes(r.pid)) ids.splice(0, ids.length, r.pid);
  return apply(ids, (info) => {
    const v = info.view, dx = v[0] - src.view[0], dy = v[3] - src.view[3]; // mateixa posició respecte de dalt-esquerra
    return [Math.max(v[0], box[0] + dx), Math.max(v[1], box[1] + dy), Math.min(v[2], box[2] + dx), Math.min(v[3], box[3] + dy)];
  });
}
