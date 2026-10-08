// Components d'interfície: toasts, diàlegs modals, menús
import { el, $ } from './util.js';
import { t } from './i18n.js';

export function toast(msg, type = '', ms = 3500) {
  const d = el('div', { class: 'toast ' + type, text: msg });
  $('#toasts').append(d);
  setTimeout(() => d.remove(), ms);
  return d;
}
export function setStatus(msg) { $('#st-msg').textContent = msg || ''; }

// Diàleg modal genèric. buttons: [{label, value, primary}]. Retorna promesa amb el valor.
export function modal({ title, body, buttons, wide = false, onOpen, dismissable = true }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const bodyEl = el('div', { class: 'mb' }, body);
    const foot = el('div', { class: 'mf' });
    const box = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      title ? el('h2', { text: title }) : null, bodyEl, foot);
    const back = el('div', { class: 'modal-back' }, box);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close(undefined); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const p = (buttons || []).find((b) => b.primary); if (p) { e.preventDefault(); close(p.value); }
      }
    };
    for (const b of buttons || []) foot.append(el('button', { class: 'tb' + (b.primary ? ' accent' : ''), text: b.label, onclick: () => close(b.value) }));
    back.addEventListener('pointerdown', (e) => { if (e.target === back && dismissable) close(undefined); });
    document.addEventListener('keydown', onKey, true);
    root.append(back);
    (box.querySelector('input,select,button.accent,button') || box).focus?.();
    onOpen?.({ box, close, bodyEl, foot });
  });
}

export async function confirmDlg(msg, okLabel = t('accept')) {
  const r = await modal({ body: el('p', { text: msg }), buttons: [{ label: t('cancel'), value: false }, { label: okLabel, value: true, primary: true }] });
  return !!r;
}
export async function alertDlg(msg, title) {
  await modal({ title, body: el('p', { text: msg }), buttons: [{ label: t('close'), value: true, primary: true }] });
}
export async function promptDlg(msg, def = '', type = 'text') {
  const inp = el('input', { type, value: def, style: { width: '100%' } });
  const r = await modal({ body: [el('p', { text: msg }), inp], buttons: [{ label: t('cancel'), value: null }, { label: t('accept'), value: true, primary: true }], onOpen: () => setTimeout(() => inp.focus(), 30) });
  return r ? inp.value : null;
}

// Diàleg de progrés. Retorna { set(pct, msg), close() , canceled }
export function progressDlg(title, onCancel) {
  const bar = el('i'); const msg = el('p', { text: t('working') });
  const state = { canceled: false };
  const root = $('#modal-root');
  const buttons = el('div', { class: 'mf' });
  if (onCancel) buttons.append(el('button', { class: 'tb', text: t('cancel'), onclick: () => { state.canceled = true; onCancel(); } }));
  const back = el('div', { class: 'modal-back' }, el('div', { class: 'modal' }, el('h2', { text: title }), el('div', { class: 'mb' }, msg, el('div', { class: 'bar' }, bar)), buttons));
  root.append(back);
  return {
    state,
    set(p, m) { if (p != null) bar.style.width = Math.round(p * 100) + '%'; if (m) msg.textContent = m; },
    close() { back.remove(); },
  };
}

// Menús desplegables de la barra superior
export function initMenus() {
  const closeAll = () => document.querySelectorAll('.menu-pop.open').forEach((m) => m.classList.remove('open'));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu')) closeAll(); });
  document.querySelectorAll('[data-menu]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const pop = document.getElementById(b.dataset.menu);
      const was = pop.classList.contains('open');
      closeAll();
      if (!was) {
        pop.classList.add('open');
        const r = b.getBoundingClientRect();
        const w = pop.offsetWidth;
        pop.style.top = r.bottom + 4 + 'px';
        pop.style.left = Math.max(6, Math.min(innerWidth - w - 6, pop.classList.contains('right') ? r.right - w : r.left)) + 'px';
      }
    });
  });
  document.querySelectorAll('.menu-pop button').forEach((b) => b.addEventListener('click', closeAll));
}
