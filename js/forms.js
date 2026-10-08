// Camps de formulari AcroForm: capa HTML interactiva i valors a S.forms
import { S, commit, emit } from './state.js';
import { getPdfPage } from './pdfsource.js';
import { hooks } from './viewer.js';
import { el } from './util.js';
import { t, addStrings } from './i18n.js';

addStrings({ signHere: ['Signa aquí', 'Firma aquí', 'Sign here'] });

const cache = new Map();
export async function getWidgets(srcId, idx) {
  const key = srcId + ':' + idx;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const page = await getPdfPage(srcId, idx);
      const an = await page.getAnnotations({ intent: 'display' });
      return an.filter((a) => a.subtype === 'Widget' && a.fieldType);
    })());
  }
  return cache.get(key);
}
export function clearFormCache() { cache.clear(); }

const isOn = (v) => v != null && v !== '' && v !== 'Off' && v !== false;

function setValue(name, value, source) {
  S.forms[name] = value;
  S.dirty = true; S.pristine = false;
  // sincronitza altres widgets del mateix camp
  document.querySelectorAll('.fld').forEach((n) => {
    if (n === source || n.dataset.name !== name) return;
    if (n.type === 'checkbox') n.checked = !!value;
    else if (n.type === 'radio') n.checked = n.value === value;
    else if (n.tagName === 'SELECT' && n.multiple) { const a = [].concat(value || []); [...n.options].forEach((o) => { o.selected = a.includes(o.value); }); }
    else n.value = value ?? '';
  });
}

export async function renderForms(pv) {
  const e = pv.entry; if (!e || e.blank || e.src !== S.mainId) { pv.formLayer.replaceChildren(); return; }
  const src = S.sources.get(e.src);
  if (!src || src.isXfa) return;
  const token = (pv._formTok = (pv._formTok || 0) + 1);
  let widgets;
  try { widgets = await getWidgets(e.src, e.idx); } catch { return; }
  if (token !== pv._formTok || !pv.info) return;
  const s = pv.s, view = pv.info.view;
  const frag = document.createDocumentFragment();
  for (const a of widgets) {
    if (a.hidden || (a.annotationFlags & 2) || (a.annotationFlags & 32)) continue;
    const [x0, y0, x1, y1] = a.rect;
    const w = (x1 - x0) * s, h = (y1 - y0) * s;
    if (w < 2 || h < 2) continue;
    const style = { left: (x0 - view[0]) * s + 'px', top: (view[3] - y1) * s + 'px', width: w + 'px', height: h + 'px' };
    const name = a.fieldName || '';
    const cur = Object.prototype.hasOwnProperty.call(S.forms, name) ? S.forms[name] : undefined;
    let node = null;
    const dap = a.defaultAppearanceData || {};
    const fs = dap.fontSize > 0 ? dap.fontSize * s : Math.max(8, Math.min(h * 0.68, 22 * s));
    if (a.fieldType === 'Tx') {
      const v = cur !== undefined ? cur : (Array.isArray(a.fieldValue) ? a.fieldValue.join('\n') : a.fieldValue ?? '');
      node = a.multiLine ? el('textarea') : el('input', { type: a.password ? 'password' : 'text' });
      node.value = v;
      if (a.maxLen) node.maxLength = a.maxLen;
      node.style.fontSize = (a.multiLine ? (dap.fontSize > 0 ? fs : 12 * s) : fs) + 'px';
      node.style.textAlign = ['left', 'center', 'right'][a.textAlignment || 0] || 'left';
      if (a.comb && a.maxLen) node.style.letterSpacing = (w / a.maxLen - fs * 0.55) + 'px';
      node.addEventListener('input', () => setValue(name, node.value, node));
      node.addEventListener('change', () => commit('content'));
    } else if (a.fieldType === 'Btn' && a.checkBox) {
      node = el('input', { type: 'checkbox' });
      node.checked = cur !== undefined ? !!cur : isOn(a.fieldValue);
      node.classList.add('chk');
      node.addEventListener('change', () => { setValue(name, node.checked, node); commit('content'); });
    } else if (a.fieldType === 'Btn' && a.radioButton) {
      node = el('input', { type: 'radio', name: 'r_' + name, value: a.buttonValue });
      node.checked = (cur !== undefined ? cur : a.fieldValue) === a.buttonValue;
      node.classList.add('chk');
      node.addEventListener('change', () => { if (node.checked) { setValue(name, a.buttonValue, node); commit('content'); } });
    } else if (a.fieldType === 'Ch') {
      node = el('select');
      const opts = a.options || [];
      const sel = cur !== undefined ? [].concat(cur) : [].concat(a.fieldValue ?? []);
      if (a.combo) node.append(el('option', { value: '', text: '' }));
      for (const o of opts) node.append(el('option', { value: o.exportValue, text: o.displayValue ?? o.exportValue }));
      if (a.multiSelect) { node.multiple = true; node.size = Math.max(2, Math.floor(h / (fs * 1.4))); }
      else if (!a.combo) node.size = Math.max(2, Math.floor(h / (fs * 1.4)));
      [...node.options].forEach((o) => { o.selected = sel.includes(o.value); });
      node.style.fontSize = fs + 'px';
      node.addEventListener('change', () => {
        const v = node.multiple ? [...node.selectedOptions].map((o) => o.value) : node.value;
        setValue(name, v, node); commit('content');
      });
    } else if (a.fieldType === 'Sig') {
      if (src.signed && a.hasAppearance) continue;
      node = el('div', { class: 'sigf', text: t('signHere'), title: name });
      node.addEventListener('click', () => emit('signField', { pid: pv.pid, x: x0 - view[0], y: view[3] - y1, w: x1 - x0, h: y1 - y0, name }));
    }
    if (!node) continue;
    node.classList.add('fld');
    node.dataset.name = name;
    if (a.readOnly) { node.disabled = true; }
    if (a.alternativeText) node.title = a.alternativeText;
    Object.assign(node.style, style);
    frag.append(node);
  }
  if (token !== pv._formTok) return;
  pv.formLayer.replaceChildren(frag);
}
hooks.renderForms = (pv) => { renderForms(pv); };
