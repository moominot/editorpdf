// Barra d'opcions contextual (color, mida, font…) segons l'eina o l'objecte seleccionat
import { S, findObj, on } from './state.js';
import { el } from './util.js';
import { t } from './i18n.js';
import { updateSelected, deleteSelected, duplicateSelected } from './objects.js';

let bar;
const HL_COLORS = ['#ffe600', '#7CFC00', '#00e5ff', '#ff80ab', '#ffab40'];
const LN_COLORS = ['#e11d48', '#1d4ed8', '#16a34a', '#000000'];

function label(text, ...kids) { return el('label', {}, text, ...kids); }
function colorInput(value, onInput, onChange, allowEmpty) {
  const i = el('input', { type: 'color', value: value || '#000000' });
  i.addEventListener('input', () => onInput(i.value));
  i.addEventListener('change', () => onChange(i.value));
  return i;
}
function swatches(colors, cur, apply) {
  return colors.map((c) => el('button', { class: 'ib', style: { minWidth: '26px', width: '26px', height: '26px', padding: '0', background: c, border: c.toLowerCase() === (cur || '').toLowerCase() ? '2px solid var(--accent)' : '1px solid var(--line)', borderRadius: '50%' }, onclick: () => apply(c) }));
}

function rebuild() {
  const o = findObj(S.sel);
  const kind = o ? o.type : S.tool;
  const kids = [];
  const apply = (props, final = true) => {
    // actualitza valors per defecte i l'objecte seleccionat
    const key = kind === 'textedit' ? 'text' : kind;
    if (S.opts[key]) Object.assign(S.opts[key], props);
    if (o) updateSelected(props, final);
  };
  const rowText = (src) => {
    const f = el('select');
    for (const n of ['Helvetica', 'Times', 'Courier']) f.append(el('option', { value: n, text: n === 'Helvetica' ? 'Sans (Helvetica)' : n === 'Times' ? 'Serif (Times)' : 'Mono (Courier)' }));
    f.value = src.font || 'Helvetica';
    f.addEventListener('change', () => apply({ font: f.value }));
    const sz = el('input', { type: 'number', min: 4, max: 200, step: 1, value: Math.round(src.size) });
    sz.addEventListener('input', () => { const v = +sz.value; if (v >= 4) apply({ size: v }, false); });
    sz.addEventListener('change', () => { const v = +sz.value; if (v >= 4) apply({ size: v }); });
    const b = el('button', { class: 'ib' + (src.bold ? ' on' : ''), html: '<b>B</b>', title: t('bold'), onclick: () => { apply({ bold: !src.bold }); rebuild(); } });
    const it = el('button', { class: 'ib' + (src.italic ? ' on' : ''), html: '<i>I</i>', title: t('italic'), onclick: () => { apply({ italic: !src.italic }); rebuild(); } });
    kids.push(label(t('font'), f), label(t('size'), sz), b, it, label(t('color'), colorInput(src.color, (v) => apply({ color: v }, false), (v) => apply({ color: v }))));
  };

  switch (kind) {
    case 'text': case 'textedit': rowText(o || S.opts.text); break;
    case 'hl': case 'ul': case 'st': {
      const cur = o ? o.color : S.opts[kind].color;
      kids.push(el('span', { class: 'hint', text: t('color') }), ...swatches(kind === 'hl' ? HL_COLORS : LN_COLORS, cur, (c) => { apply({ color: c }); rebuild(); }),
        colorInput(cur, (v) => apply({ color: v }, false), (v) => apply({ color: v })));
      if (!o) kids.push(el('span', { class: 'hint', text: t('hintHl') }));
      break;
    }
    case 'ink': {
      const src = o || S.opts.ink;
      const w = el('input', { type: 'number', min: 0.5, max: 40, step: 0.5, value: src.width });
      w.addEventListener('change', () => { if (+w.value > 0) apply({ width: +w.value }); });
      kids.push(label(t('color'), colorInput(src.color, (v) => apply({ color: v }, false), (v) => apply({ color: v }))), label(t('width'), w));
      if (!o) kids.push(el('span', { class: 'hint', text: t('hintInk') }));
      break;
    }
    case 'rect': {
      const src = o || S.opts.rect;
      const w = el('input', { type: 'number', min: 0, max: 40, step: 0.5, value: src.width });
      w.addEventListener('change', () => apply({ width: +w.value }));
      const nof = el('input', { type: 'checkbox' }); nof.checked = !src.fill;
      const fillIn = colorInput(src.fill || '#ffffff', (v) => { nof.checked = false; apply({ fill: v }, false); }, (v) => { nof.checked = false; apply({ fill: v }); });
      nof.addEventListener('change', () => apply({ fill: nof.checked ? '' : fillIn.value }));
      kids.push(label(t('stroke'), colorInput(src.stroke || '#e11d48', (v) => apply({ stroke: v }, false), (v) => apply({ stroke: v }))), label(t('width'), w),
        label(t('fill'), fillIn), label(t('noFill'), nof));
      if (!o) kids.push(el('span', { class: 'hint', text: t('hintRect') }));
      break;
    }
    case 'img': {
      const src = o || S.opts.img;
      const r = el('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: src.opacity ?? 1 });
      r.addEventListener('input', () => apply({ opacity: +r.value }, false)); r.addEventListener('change', () => apply({ opacity: +r.value }));
      kids.push(label(t('opacity'), r));
      break;
    }
    case 'edittext': kids.push(el('span', { class: 'hint', text: t('hintEditText') })); break;
    default: kids.push(el('span', { class: 'hint', text: t('hintSelect') }));
  }
  if (o) {
    kids.push(el('span', { class: 'sep' }));
    kids.push(el('button', { class: 'ib', title: 'Ctrl+D', html: '<svg><use href="#i-copy"/></svg>', onclick: () => duplicateSelected() }));
    kids.push(el('button', { class: 'ib danger', title: t('delete') + ' (Supr)', html: '<svg><use href="#i-trash"/></svg>', onclick: () => deleteSelected() }));
  } else if (kind === 'text') kids.push(el('span', { class: 'hint', text: t('hintText') }));
  bar.replaceChildren(...kids);
  bar.hidden = false;
}

let t0 = 0;
export function initOptbar(node) {
  bar = node;
  const schedule = () => { cancelAnimationFrame(t0); t0 = requestAnimationFrame(() => { if (!bar.contains(document.activeElement) || document.activeElement.type === 'checkbox' || document.activeElement.tagName === 'BUTTON') rebuild(); }); };
  on('selection', schedule);
  on('toolchange', schedule);
  on('restore', schedule);
  rebuild();
}
export const refreshOptbar = () => bar && rebuild();
