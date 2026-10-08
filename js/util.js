// Utilitats generals
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
let _uid = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const clone = (o) => JSON.parse(JSON.stringify(o));

// Rotació de la pàgina: coordenades "locals" (sense rotar, origen a dalt-esquerra) <-> pantalla.
// pw, ph = mida sense rotar en píxels. rot = rotació total en sentit horari.
export function localToDisplay(rot, lx, ly, pw, ph) {
  switch (rot) { case 90: return [ph - ly, lx]; case 180: return [pw - lx, ph - ly]; case 270: return [ly, pw - lx]; default: return [lx, ly]; }
}
export function displayToLocal(rot, dx, dy, pw, ph) {
  switch (rot) { case 90: return [dy, ph - dx]; case 180: return [pw - dx, ph - dy]; case 270: return [pw - dy, dx]; default: return [dx, dy]; }
}

export function hexToRgb01(hex) {
  const h = (hex || '#000000').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

export function bytesToBase64(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function downloadBlob(bytes, name, type = 'application/pdf') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function readFileBytes(file) {
  return file.arrayBuffer().then((b) => new Uint8Array(b));
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    const ex = document.querySelector(`script[src="${src}"]`);
    if (ex) { if (ex.dataset.loaded) return res(); ex.addEventListener('load', () => res()); ex.addEventListener('error', rej); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => { s.dataset.loaded = '1'; res(); };
    s.onerror = () => rej(new Error('No s\'ha pogut carregar ' + src));
    document.head.append(s);
  });
}

export function baseName(name) { return (name || 'document').replace(/\.pdf$/i, ''); }
export function sameBytes(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Parseja un interval com "1-3,5,8-"
export function parseRange(str, max) {
  const s = (str || '').trim();
  if (!s) return Array.from({ length: max }, (_, i) => i);
  const out = [];
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)-(\d*)$/);
    if (m) {
      const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : max;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) out.push(i - 1);
    } else if (/^\d+$/.test(part)) { const n = +part; if (n >= 1 && n <= max) out.push(n - 1); }
  }
  return out;
}

