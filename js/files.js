// Fitxers locals: File System Access API (Chrome/Edge) amb alternativa per descàrrega
import { downloadBlob, readFileBytes } from './util.js';

export const hasFSA = typeof window.showOpenFilePicker === 'function';
const PDF_TYPES = [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }];

export async function pickLocalPdf() {
  if (hasFSA) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PDF_TYPES, multiple: false });
      const file = await handle.getFile();
      return { bytes: await readFileBytes(file), name: file.name, handle };
    } catch (e) { if (e?.name === 'AbortError') return null; throw e; }
  }
  return new Promise((resolve) => {
    const inp = document.getElementById('file-input');
    inp.value = '';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return resolve(null);
      resolve({ bytes: await readFileBytes(f), name: f.name, handle: null });
    };
    inp.click();
  });
}

export async function pickPdfForImport() {
  // un o diversos fitxers nous, sense handle
  if (hasFSA) {
    try {
      const handles = await window.showOpenFilePicker({ types: PDF_TYPES, multiple: true });
      const out = [];
      for (const h of handles) { const file = await h.getFile(); out.push({ bytes: await readFileBytes(file), name: file.name }); }
      return out;
    } catch (e) { if (e?.name === 'AbortError') return null; throw e; }
  }
  return new Promise((resolve) => {
    const inp = document.getElementById('file-input');
    inp.value = '';
    inp.multiple = true;
    inp.onchange = async () => {
      inp.multiple = false;
      const out = [];
      for (const f of inp.files) out.push({ bytes: await readFileBytes(f), name: f.name });
      resolve(out.length ? out : null);
    };
    inp.click();
  });
}

export async function fileFromHandleOrFile(item) {
  if (item.getFile) { const f = await item.getFile(); return { bytes: await readFileBytes(f), name: f.name, handle: item }; }
  return { bytes: await readFileBytes(item), name: item.name, handle: null };
}

// Demana permís d'escriptura (requereix gest d'usuari: cal cridar-ho abans de tasques llargues)
export async function ensureWritable(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

// near: handle d'un fitxer local; el diàleg s'obre a la seva carpeta (si ja no hi és, a la carpeta per defecte)
export async function chooseSaveHandle(suggestedName, near = null) {
  if (!hasFSA) return null;
  const opts = { suggestedName, types: PDF_TYPES };
  try {
    try { return await window.showSaveFilePicker(near ? { ...opts, startIn: near } : opts); }
    catch (e) { if (!near || e?.name === 'AbortError') throw e; return await window.showSaveFilePicker(opts); }
  } catch (e) { if (e?.name === 'AbortError') return 'cancel'; throw e; }
}

export async function writeToHandle(handle, bytes) {
  const w = await handle.createWritable();
  await w.write(bytes);
  await w.close();
}

export function downloadPdf(bytes, name) { downloadBlob(bytes, name.endsWith('.pdf') ? name : name + '.pdf'); }
