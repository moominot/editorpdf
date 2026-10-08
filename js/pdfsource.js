// Càrrega de documents PDF amb pdf.js
import * as pdfjs from '../vendor/pdfjs/build/pdf.min.mjs';
import { uid } from './util.js';
import { S } from './state.js';
import { t } from './i18n.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/build/pdf.worker.min.mjs', import.meta.url).href;
const BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
export { pdfjs };

const infoCache = new Map();

function findPattern(bytes, pat, from = 0) {
  const n = pat.length;
  outer: for (let i = from; i <= bytes.length - n; i++) {
    for (let j = 0; j < n; j++) if (bytes[i + j] !== pat.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}
export function hasSignatures(bytes) {
  const i = findPattern(bytes, '/ByteRange');
  if (i < 0) return false;
  return findPattern(bytes, '/Sig', Math.max(0, i - 4000)) >= 0 || findPattern(bytes, '/Contents', i) >= 0;
}
export function isEncrypted(bytes) { return findPattern(bytes, '/Encrypt') >= 0; }

export async function openSource(bytes, name, askPassword) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: BASE + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: BASE + 'standard_fonts/', wasmUrl: BASE + 'wasm/', iccUrl: BASE + 'iccs/',
    enableXfa: true, isEvalSupported: false,
  });
  let password = null;
  task.onPassword = async (update, reason) => {
    const again = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    const pw = await askPassword(t(again ? 'wrongPassword' : 'askPassword'));
    if (pw == null) { task.destroy(); return; }
    password = pw;
    update(pw);
  };
  const doc = await task.promise;
  const id = uid('s');
  const src = {
    id, name, bytes, doc, numPages: doc.numPages, password,
    encrypted: isEncrypted(bytes),
    signed: hasSignatures(bytes),
    isXfa: !!doc.isPureXfa,
  };
  S.sources.set(id, src);
  return src;
}

export async function pageInfo(srcId, idx) {
  const key = srcId + ':' + idx;
  if (infoCache.has(key)) return infoCache.get(key);
  const src = S.sources.get(srcId);
  const page = await src.doc.getPage(idx + 1);
  const [x0, y0, x1, y1] = page.view;
  const info = { view: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0, nativeRot: ((page.rotate % 360) + 360) % 360 };
  infoCache.set(key, info);
  return info;
}
export async function getPdfPage(srcId, idx) { return S.sources.get(srcId).doc.getPage(idx + 1); }
export function clearInfoCache() { infoCache.clear(); }
