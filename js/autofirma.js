// Comunicació amb AutoFirma. Basat en el protocol del client JS oficial (autoscript.js, ctt-gob-es/clienteafirma):
//  - Escriptori: protocol afirma://websocket + WebSocket segur a wss://127.0.0.1:<port>
//  - Mòbil: servidor intermedi (StorageService / RetrieveService) + afirma://sign?fileid=…
import { bytesToBase64, base64ToBytes } from './util.js';

const PROTOCOL_VERSION = 4;
const ID_CHARS = '1234567890abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function newIdSession() {
  const r = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(r, (x) => ID_CHARS[x % ID_CHARS.length]).join('');
}
const b64urlOfBytes = (u8) => bytesToBase64(u8).replace(/\+/g, '-').replace(/\//g, '_');
const b64urlOfString = (s) => b64urlOfBytes(new TextEncoder().encode(s));
const fromUrlSafe = (s) => s.replace(/-/g, '+').replace(/_/g, '/');

export class AutoFirmaError extends Error {
  constructor(msg, code, kind) { super(msg); this.code = code; this.kind = kind; }
}
export const isCancel = (e) => e?.kind === 'cancel';

function paramsToString(params) {
  // AutoFirma espera "clau=valor" separats per salts de línia
  return Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${v}`).join('\n');
}

// Interpreta un missatge d'error del protocol (err-NN:= CODI - missatge)
function parseError(data) {
  if (data === 'CANCEL' || data == null) return new AutoFirmaError('Operació cancel·lada', 'CANCEL', 'cancel');
  if (data.length > 7 && data.slice(0, 4).toLowerCase() === 'err-' && data.includes(':=')) {
    const rest = data.slice(data.indexOf(':=') + 2);
    const cancelled = data.slice(0, 7).toLowerCase() === 'err-11:';
    return new AutoFirmaError(rest, data.slice(0, 6), cancelled ? 'cancel' : 'error');
  }
  if (data === 'MEMORY_ERROR') return new AutoFirmaError('AutoFirma s\'ha quedat sense memòria amb aquest document', 'MEMORY', 'error');
  if (data.startsWith('SAF_')) return new AutoFirmaError(data, data, 'error');
  if (data === 'NULL') return new AutoFirmaError('Error desconegut d\'AutoFirma', 'NULL', 'error');
  return null;
}

function launch(url) {
  // evita el diàleg "hi ha canvis sense desar" en llançar el protocol afirma://
  window.__suppressUnload = true; setTimeout(() => { window.__suppressUnload = false; }, 10000);
  document.location = url;
}

// ---------------------------------------------------------------------------------------------
// ESCRIPTORI (WebSocket local)
// ---------------------------------------------------------------------------------------------
export async function signDesktop(pdfBytes, extraParams, { algorithm = 'SHA256withRSA', format = 'PAdES', onStatus = () => {} } = {}) {
  const idSession = newIdSession();
  const ports = new Set();
  while (ports.size < 3) ports.add(49152 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] % (65535 - 49152)));
  const portList = [...ports];

  onStatus('launch');
  launch(`afirma://websocket?ports=${portList.join(',')}&v=${PROTOCOL_VERSION}&jvc=${PROTOCOL_VERSION}&idsession=${idSession}`);
  await sleep(3000);

  // Intenta connectar a qualsevol dels ports
  let ws = null;
  for (let attempt = 0; attempt < 15 && !ws; attempt++) {
    onStatus('connect', attempt);
    ws = await new Promise((resolve) => {
      let done = false; const socks = [];
      const finish = (w) => { if (done) return; done = true; socks.forEach((s) => { if (s !== w) { try { s.close(); } catch {} } }); resolve(w); };
      for (const p of portList) {
        try {
          const s = new WebSocket(`wss://127.0.0.1:${p}`);
          socks.push(s);
          s.onopen = () => finish(s);
          s.onerror = () => {};
        } catch { /* ignora */ }
      }
      setTimeout(() => finish(null), 2000);
    });
    if (!ws) await sleep(500);
  }
  if (!ws) throw new AutoFirmaError('No s\'ha pogut connectar amb AutoFirma. Comprova que està instal·lada (v1.8 o superior), que s\'ha obert i que Chrome permet l\'accés a dispositius locals per a aquest lloc.', 'NOCONN', 'noconn');

  const props = paramsToString(extraParams);
  const request = 'afirma://sign?' + [
    `op=sign`, `idsession=${idSession}`, `algorithm=${algorithm}`, `format=${format}`,
    props ? `properties=${b64urlOfString(props)}` : null,
    `sticky=false`,
    `appname=${encodeURIComponent(location.hostname || 'pdf-simple')}`,
    `dat=${b64urlOfBytes(pdfBytes)}`,
  ].filter(Boolean).join('&');

  return new Promise((resolve, reject) => {
    let stage = 0;
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new AutoFirmaError('Temps d\'espera esgotat esperant AutoFirma', 'TIMEOUT', 'error')); }, 15 * 60 * 1000);
    const fail = (e) => { clearTimeout(timer); try { ws.close(); } catch {} reject(e); };
    ws.onclose = () => { if (stage < 3) fail(new AutoFirmaError('AutoFirma s\'ha tancat abans d\'acabar la signatura', 'CLOSED', 'error')); };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      if (stage === 0) { // resposta a l'echo -> enviem l'operació real
        stage = 1; onStatus('sign'); ws.send(request); return;
      }
      if (data === '#wait') { setTimeout(() => { if (ws.readyState === 1) ws.send('getresult?idsession=' + idSession); }, 2000); return; }
      const err = parseError(data);
      if (err) return fail(err);
      // resultat: [cert|]signatura[|extra] en base64 URL-safe
      const parts = data.split('|');
      let cert = null, sig;
      if (parts.length === 1) sig = parts[0]; else { cert = parts[0]; sig = parts[1]; }
      stage = 3; clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve({ signed: base64ToBytes(fromUrlSafe(sig)), certB64: cert ? fromUrlSafe(cert) : null });
    };
    try { ws.send(`echo=-idsession=${idSession}@EOF`); } catch (e) { fail(e); }
  });
}

// ---------------------------------------------------------------------------------------------
// MÒBIL (servidor intermedi propi)
// ---------------------------------------------------------------------------------------------
export function relayUrls(base) {
  const b = base.replace(/\/+$/, '');
  return { storage: b + '/afirma-signature-storage/StorageService', retriever: b + '/afirma-signature-retriever/RetrieveService' };
}

export async function checkRelay(base) {
  const { storage, retriever } = relayUrls(base);
  const r1 = await fetch(storage + '?op=check'); const r2 = await fetch(retriever + '?op=check');
  const t1 = (await r1.text()).trim(), t2 = (await r2.text()).trim();
  if (t1 !== 'OK' || t2 !== 'OK') throw new Error('El servidor intermedi no respon correctament');
  return true;
}

async function aesEncrypt(keyBytes, iv, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, data));
}
async function aesDecrypt(keyBytes, iv, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, data));
}

const isAndroid = () => /android/i.test(navigator.userAgent);

export async function signViaRelay(pdfBytes, extraParams, base, { algorithm = 'SHA256withRSA', format = 'PAdES', onStatus = () => {}, signal } = {}) {
  const { storage, retriever } = relayUrls(base);
  const rid = newIdSession();     // identificador de la resposta
  const fileId = newIdSession();  // identificador de la configuració pujada
  const legDes = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, '0');
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cipherCfg = { algo: 'AES', key: bytesToBase64(key), iv: bytesToBase64(iv), legDes };
  const cipherParam = btoa(JSON.stringify(cipherCfg));

  const props = paramsToString(extraParams);
  const entries = [
    ['format', format], ['algorithm', algorithm],
    props ? ['properties', btoa(unescape(encodeURIComponent(props)))] : null,
    ['dat', b64urlOfBytes(pdfBytes)],
    ['ver', PROTOCOL_VERSION], ['op', 'sign'], ['id', rid], ['appname', location.hostname || 'pdf-simple'],
    ['key', legDes], ['cipher', cipherParam], ['stservlet', storage],
  ].filter(Boolean);
  const xml = '<sign>' + entries.map(([k, v]) => `<e k="${k}" v="${v}"/>`).join('') + '</sign>';
  onStatus('upload');
  const enc = await aesEncrypt(key, iv, new TextEncoder().encode(xml));
  const put = await fetch(storage, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `op=put&v=1_0&id=${fileId}&dat=${b64urlOfBytes(enc)}`, signal,
  });
  const putTxt = (await put.text()).trim();
  if (putTxt !== 'OK') throw new AutoFirmaError('El servidor intermedi ha rebutjat les dades: ' + putTxt, 'UPLOAD', 'error');

  const q = (k, v) => `${k}=${encodeURIComponent(v)}`;
  const urlParams = ['jvc=' + PROTOCOL_VERSION, q('fileid', fileId), q('rid', rid), q('rtservlet', retriever), q('stservlet', storage), q('key', legDes), q('cipher', cipherParam)].join('&');
  const url = isAndroid() && /chrome/i.test(navigator.userAgent)
    ? `intent://sign?${urlParams}#Intent;scheme=afirma;package=es.gob.afirma;end`
    : `afirma://sign?${urlParams}`;
  onStatus('launch');
  launch(url);

  // Espera el resultat (consulta periòdica; també immediata en tornar a la pestanya)
  onStatus('wait');
  const deadline = Date.now() + 10 * 60 * 1000;
  let nudge = null;
  const onVis = () => { if (document.visibilityState === 'visible' && nudge) nudge(); };
  document.addEventListener('visibilitychange', onVis);
  try {
    let it = 0;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new AutoFirmaError('Cancel·lat', 'CANCEL', 'cancel');
      await new Promise((r) => { const t = setTimeout(r, 3000); nudge = () => { clearTimeout(t); r(); }; });
      let txt;
      try {
        const res = await fetch(retriever, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `op=get&v=1_0&id=${rid}&it=${it++}`, signal });
        if (!res.ok) continue;
        txt = (await res.text()).trim();
      } catch (e) { if (e.name === 'AbortError') throw new AutoFirmaError('Cancel·lat', 'CANCEL', 'cancel'); continue; }
      if (txt.slice(0, 6).toLowerCase() === 'err-06') continue; // encara no hi ha resultat
      if (txt.slice(0, 5).toLowerCase() === '#wait') { onStatus('working'); continue; }
      const err = parseError(txt); if (err) throw err;
      const parts = txt.split('|');
      const dec = [];
      for (const p of parts) dec.push(await aesDecrypt(key, iv, base64ToBytes(fromUrlSafe(p))));
      // Els valors descifrats són els bytes en cru (certificat DER, PDF signat)
      let certDer = null, sig;
      if (dec.length === 1) sig = dec[0]; else { certDer = dec[0]; sig = dec[1]; }
      return { signed: sig, certB64: certDer ? bytesToBase64(certDer) : null };

    }
    throw new AutoFirmaError('Temps d\'espera esgotat', 'TIMEOUT', 'error');
  } finally { document.removeEventListener('visibilitychange', onVis); }
}
