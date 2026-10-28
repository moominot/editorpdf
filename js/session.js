// Sessió de treball a IndexedDB: si es recarrega la pàgina (F5) es recupera el document amb els canvis.
// Cada pestanya té la seva sessió (l'identificador es guarda a sessionStorage, que sobreviu a la recàrrega).
// Els bytes dels PDF i de les imatges van a 'blobs' (s'escriuen una sola vegada); l'estat, a 'sessions'.
import { S, getHistory } from './state.js';
import { uid } from './util.js';

const DB = 'pdfsimple', KEY = 'pdfsimple.session', MAX_AGE = 7 * 864e5;
const SID = uid('ses'); // cada càrrega de la pàgina en té un de nou: una pestanya duplicada no comparteix sessió
let prevSid = null;
try { prevSid = sessionStorage.getItem(KEY); } catch {}
// Només en una recàrrega la sessió anterior queda substituïda per la nova; en una pestanya duplicada l'original encara la fa servir
const RELOAD = performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload';

let dbp = null;
const db = () => (dbp ||= new Promise((ok, ko) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('sessions'); r.result.createObjectStore('blobs'); };
  r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
}));
const req = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const done = (tx) => new Promise((ok, ko) => { tx.oncomplete = ok; tx.onerror = tx.onabort = () => ko(tx.error); });

const written = new Set(); // blobs ja desats
const blobIds = (r) => [...r.sources, ...r.images].map((x) => x.id).concat(r.attachData || []);
let timer = 0, writing = null, again = false;

function record() {
  const main = S.sources.get(S.mainId);
  const { handle, nearHandle, ...file } = S.file;
  return {
    updated: Date.now(), mainId: S.mainId,
    sources: [...S.sources.values()].map((s) => ({ id: s.id, name: s.name })),
    images: [...S.images].map(([id, i]) => ({ id, mime: i.mime, w: i.w, h: i.h })),
    attach: S.attach, attachData: [...S.attachData.keys()], outline: S.outline, layers: S.layers,
    pages: S.pages, forms: S.forms, ocr: [...S.ocrStore],
    xfa: main?.isXfa ? [...(main.doc.annotationStorage.serializable.map || [])] : null, // valors dels camps XFA
    file, handle, nearHandle, dirty: S.dirty, pristine: S.pristine, cur: S.cur, zoom: S.zoom, history: getHistory(),
  };
}

async function write() {
  const d = await db();
  const tx = d.transaction(['sessions', 'blobs'], 'readwrite');
  const blobs = tx.objectStore('blobs'), fresh = [];
  for (const s of S.sources.values()) if (!written.has(s.id)) { blobs.put(s.bytes, s.id); fresh.push(s.id); }
  for (const [id, i] of S.images) if (!written.has(id)) { blobs.put(i.bytes, id); fresh.push(id); }
  for (const [id, b] of S.attachData) if (!written.has(id)) { blobs.put(b, id); fresh.push(id); }
  const rec = record();
  try { tx.objectStore('sessions').put(rec, SID); }
  catch { rec.handle = rec.nearHandle = null; tx.objectStore('sessions').put(rec, SID); } // un handle que no es pot clonar no ha d'impedir desar
  if (RELOAD && prevSid && prevSid !== SID) tx.objectStore('sessions').delete(prevSid);
  await done(tx);
  fresh.forEach((id) => written.add(id));
  if (prevSid !== SID) { prevSid = SID; try { sessionStorage.setItem(KEY, SID); } catch {} }
}

async function flush() {
  clearTimeout(timer); timer = 0;
  if (!S.mainId) return;
  if (writing) { again = true; return; }
  writing = write().catch((e) => console.warn('session', e));
  await writing; writing = null;
  if (again) { again = false; flush(); }
}
// Finestra filla (document obert en una finestra nova): hereta el sessionStorage, però no la sessió
export function detach() { prevSid = null; }
export function schedule() { clearTimeout(timer); timer = setTimeout(flush, 400); }
addEventListener('pagehide', () => { if (timer) flush(); });
addEventListener('visibilitychange', () => { if (document.hidden && timer) flush(); });

// Sessió anterior d'aquesta pestanya (si n'hi ha), amb els bytes de les fonts i les imatges
export async function load() {
  if (!prevSid) return null;
  try {
    const d = await db();
    const tx = d.transaction(['sessions', 'blobs']);
    const rec = await req(tx.objectStore('sessions').get(prevSid));
    if (!rec) return null;
    const blobs = new Map();
    for (const id of blobIds(rec)) {
      const b = await req(tx.objectStore('blobs').get(id));
      if (!b) return null;
      blobs.set(id, b); written.add(id);
    }
    return { rec, blobs };
  } catch (e) { console.warn('session', e); return null; }
}

// Esborra la sessió anterior (no s'ha pogut recuperar) i, de passada, sessions velles i blobs orfes
export async function cleanup(dropPrev = false) {
  try {
    const d = await db();
    const tx = d.transaction(['sessions', 'blobs'], 'readwrite');
    const ss = tx.objectStore('sessions'), bs = tx.objectStore('blobs');
    if (dropPrev && prevSid) { ss.delete(prevSid); prevSid = null; try { sessionStorage.removeItem(KEY); } catch {} }
    const keys = await req(ss.getAllKeys()), recs = await req(ss.getAll()), used = new Set(written);
    recs.forEach((r, i) => {
      if (keys[i] === prevSid || keys[i] === SID || Date.now() - r.updated < MAX_AGE) blobIds(r).forEach((id) => used.add(id));
      else ss.delete(keys[i]);
    });
    for (const k of await req(bs.getAllKeys())) if (!used.has(k)) bs.delete(k);
    await done(tx);
  } catch (e) { console.warn('session', e); }
}
