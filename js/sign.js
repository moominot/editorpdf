// Orquestració de signatures: AutoFirma (escriptori / mòbil), certificat .p12 al navegador i signatura manuscrita visual
import { S, pageById, pageIndex, emit, on } from './state.js';
import { el, readFileBytes, baseName, bytesToBase64 } from './util.js';
import { t, addStrings } from './i18n.js';
import { modal, toast, progressDlg, confirmDlg, alertDlg } from './ui.js';
import { buildPdf } from './export.js';
import { pageInfo } from './pdfsource.js';
import { setPlacement, addObject } from './objects.js';
import { setTool, addImageFile } from './tools.js';
import { cfg } from './config.js';
import * as af from './autofirma.js';
import * as p12m from './p12sign.js';
import { loadDocument, save } from './main.js';

addStrings({
  sgTitle: ['Signatura digital', 'Firma digital', 'Digital signature'],
  sgVisible: ['Signatura visible', 'Firma visible', 'Visible signature'],
  sgNoVisible: ['Sense aspecte visible', 'Sin aspecto visible', 'Not visible'],
  sgYesVisible: ['Visible en una zona de la pàgina', 'Visible en una zona de la página', 'Visible in a page area'],
  sgPick: ['Tria la zona…', 'Elige la zona…', 'Pick the area…'],
  sgPlaced: ['Pàgina {0} · {1}×{2} pt', 'Página {0} · {1}×{2} pt', 'Page {0} · {1}×{2} pt'],
  sgReason: ['Motiu (opcional)', 'Motivo (opcional)', 'Reason (optional)'],
  sgLocation: ['Lloc (opcional)', 'Lugar (opcional)', 'Location (optional)'],
  sgContact: ['Contacte (opcional)', 'Contacto (opcional)', 'Contact (optional)'],
  sgText: ['Text de la signatura visible', 'Texto de la firma visible', 'Visible signature text'],
  sgCert: ['Certificat (.p12 / .pfx)', 'Certificado (.p12 / .pfx)', 'Certificate (.p12 / .pfx)'],
  sgPass: ['Contrasenya del certificat', 'Contraseña del certificado', 'Certificate password'],
  sgDo: ['Signa', 'Firmar', 'Sign'],
  sgHelpDesktop: ['S\'obrirà l\'aplicació AutoFirma (cal tenir-la instal·lada) per triar el certificat i signar. El PDF no surt del teu ordinador.', 'Se abrirá la aplicación AutoFirma (debe estar instalada) para elegir el certificado y firmar. El PDF no sale de tu ordenador.', 'AutoFirma will open (it must be installed) so you can pick a certificate and sign. The PDF does not leave your computer.'],
  sgHelpMobile: ['El PDF es xifra i passa pel teu servidor intermedi; l\'app AutoFirma del mòbil el recull, el signa i el torna. Acabada la signatura, torna a aquesta pestanya.', 'El PDF se cifra y pasa por tu servidor intermediario; la app AutoFirma del móvil lo recoge, lo firma y lo devuelve. Al terminar, vuelve a esta pestaña.', 'The PDF is encrypted and goes through your relay server; the AutoFirma mobile app fetches it, signs it and returns it. When done, come back to this tab.'],
  sgHelpP12: ['La signatura es fa al navegador amb el teu certificat; ni el certificat ni la contrasenya surten d\'aquest dispositiu. Format PAdES bàsic (B-B), sense segell de temps.', 'La firma se hace en el navegador con tu certificado; ni el certificado ni la contraseña salen de este dispositivo. Formato PAdES básico (B-B), sin sello de tiempo.', 'Signing happens in the browser with your certificate; neither the certificate nor the password leave this device. Basic PAdES (B-B), no timestamp.'],
  sgNoRelay: ['Configura l\'adreça del servidor intermedi als Ajustos.', 'Configura la dirección del servidor intermediario en Ajustes.', 'Set the relay server address in Settings.'],
  sgNeedCert: ['Selecciona el fitxer del certificat.', 'Selecciona el archivo del certificado.', 'Select the certificate file.'],
  sgDone: ['Document signat. Desa\'l ara per conservar la signatura.', 'Documento firmado. Guárdalo ahora para conservar la firma.', 'Document signed. Save it now to keep the signature.'],
  sgSaveNow: ['Desa ara', 'Guardar ahora', 'Save now'],
  sgLater: ['Més tard', 'Más tarde', 'Later'],
  sgSt_launch: ['Obrint AutoFirma…', 'Abriendo AutoFirma…', 'Opening AutoFirma…'],
  sgSt_connect: ['Connectant amb AutoFirma…', 'Conectando con AutoFirma…', 'Connecting to AutoFirma…'],
  sgSt_sign: ['Esperant que completis la signatura a AutoFirma…', 'Esperando a que completes la firma en AutoFirma…', 'Waiting for you to finish signing in AutoFirma…'],
  sgSt_upload: ['Enviant el PDF xifrat al servidor intermedi…', 'Enviando el PDF cifrado al servidor intermediario…', 'Sending the encrypted PDF to the relay…'],
  sgSt_wait: ['Esperant la signatura des de l\'app AutoFirma del mòbil…', 'Esperando la firma desde la app AutoFirma del móvil…', 'Waiting for the signature from the AutoFirma mobile app…'],
  sgSt_working: ['AutoFirma està treballant…', 'AutoFirma está trabajando…', 'AutoFirma is working…'],
  sgCancelled: ['Signatura cancel·lada.', 'Firma cancelada.', 'Signing cancelled.'],
  sgDrawTitle: ['Signatura manuscrita', 'Firma manuscrita', 'Handwritten signature'],
  sgDrawTab: ['Dibuixa', 'Dibuja', 'Draw'],
  sgTypeTab: ['Escriu', 'Escribe', 'Type'],
  sgClear: ['Esborra', 'Borrar', 'Clear'],
  sgTypePh: ['El teu nom', 'Tu nombre', 'Your name'],
  sgDrawHelp: ['Això és una signatura visual (imatge), no una signatura digital amb validesa jurídica.', 'Esto es una firma visual (imagen), no una firma digital con validez jurídica.', 'This is a visual signature (image), not a legally valid digital signature.'],
  sgRotWarn: ['Pàgina girada: la posició de la signatura visible pot no coincidir.', 'Página girada: la posición de la firma visible puede no coincidir.', 'Rotated page: the visible signature position may not match.'],
  sgAlreadySigned: ['Aquest document ja té signatures: s\'afegirà una nova signatura (AutoFirma conserva les anteriors).', 'Este documento ya tiene firmas: se añadirá una nueva (AutoFirma conserva las anteriores).', 'This document already has signatures: a new one will be added (AutoFirma keeps the previous ones).'],
  sgImg: ['Imatge de la signatura', 'Imagen de la firma', 'Signature image'],
  sgImgUse: ['Inclou-la a la signatura visible', 'Incluirla en la firma visible', 'Include it in the visible signature'],
  sgImgFile: ['Del dispositiu…', 'Del dispositivo…', 'From device…'],
  sgImgDrive: ['De Drive…', 'De Drive…', 'From Drive…'],
  sgImgRemove: ['Treu', 'Quitar', 'Remove'],
  sgImgNone: ['Cap imatge desada', 'Ninguna imagen guardada', 'No saved image'],
  sgImgErr: ['No s\'ha pogut llegir la imatge: {0}', 'No se ha podido leer la imagen: {0}', 'Could not read the image: {0}'],
  sgTextHelp: ['$$SUBJECTCN$$ = nom del certificat · $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$ = data', '$$SUBJECTCN$$ = nombre del certificado · $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$ = fecha', '$$SUBJECTCN$$ = certificate name · $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$ = date'],
  sgP12Resign: ['Aquest PDF ja té signatures. Signar amb un certificat .p12 reescriu el fitxer i invalida les anteriors. Millor fes servir AutoFirma. Continuar igualment?', 'Este PDF ya tiene firmas. Firmar con un .p12 reescribe el archivo e invalida las anteriores. Mejor usa AutoFirma. ¿Continuar igualmente?', 'This PDF already has signatures. Signing with a .p12 rewrites the file and invalidates them. Prefer AutoFirma. Continue anyway?'],
});

const PREF = 'pdfsimple.signprefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch {} };

let presetRect = null; // des del clic en un camp de signatura del PDF
on('signField', (r) => { presetRect = r; toast(t('signHere'), '', 2500); });

// Text de la signatura visible (marcadors d'AutoFirma; amb .p12 se substitueixen aquí)
const DEFAULT_LAYER2 = 'Signat digitalment per $$SUBJECTCN$$. Data: $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$';
const OLD_DEFAULT_LAYER2 = 'Firmado digitalmente por $$SUBJECTCN$$. Fecha: $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$';

// Format de data a l'estil Java (dd, MM, yyyy, HH, mm, ss) per a $$SIGNDATE=…$$
function fmtDate(pattern, d = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return pattern.replace(/yyyy|dd|MM|HH|mm|ss/g, (k) => ({ yyyy: d.getFullYear(), dd: p2(d.getDate()), MM: p2(d.getMonth() + 1), HH: p2(d.getHours()), mm: p2(d.getMinutes()), ss: p2(d.getSeconds()) })[k]);
}
const fillLayer2 = (text, cn) => text.replace(/\$\$SUBJECTCN\$\$/g, cn).replace(/\$\$SIGNDATE=([^$]*)\$\$/g, (_, p) => fmtDate(p));

// Imatge (rúbrica) de la signatura: es desa al navegador com a PNG reduït
const IMG_KEY = 'pdfsimple.signimg';
const loadSigImg = () => { try { return localStorage.getItem(IMG_KEY) || null; } catch { return null; } };
async function storeSigImg(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 900 / bmp.width, 450 / bmp.height);
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL('image/png');
  localStorage.setItem(IMG_KEY, url);
  return url;
}
const dataUrlBytes = (url) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
// AutoFirma només accepta JPEG: es pinta sobre fons blanc (la transparència es perdria)
async function sigImgJpegB64(url) {
  const bmp = await createImageBitmap(new Blob([dataUrlBytes(url)], { type: 'image/png' }));
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0);
  const jpg = cv.toDataURL('image/jpeg', 0.92);
  return bytesToBase64(stripJpegMeta(dataUrlBytes(jpg)));
}
// Treu els segments APP1–APP15 del JPEG (Chrome hi posa un perfil ICC a l'APP2). L'AutoFirma d'Android no
// pot reprocessar la imatge, l'incrusta tal qual i falla en llegir l'ICC (AA212002, ArrayIndexOutOfBounds).
function stripJpegMeta(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) return b;
  const parts = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xFF) {
    const m = b[i + 1];
    if (m === 0xDA) break; // inici de les dades de la imatge: la resta es copia tal qual
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    if (!(m >= 0xE1 && m <= 0xEF)) parts.push(b.subarray(i, end));
    i = end;
  }
  parts.push(b.subarray(i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function pickRect() {
  return new Promise((resolve) => {
    setPlacement({ kind: 'rect', resolve, cancel: () => resolve(null) });
    document.body.dataset.tool = 'sign';
    toast(t('hintSign'), '', 6000);
  });
}

async function viewOf(pid) {
  const e = pageById(pid);
  if (!e) return null;
  return e.blank ? { view: [0, 0, e.blank.w, e.blank.h], nativeRot: 0 } : pageInfo(e.src, e.idx);
}

export async function startSigning(kind) {
  if (kind === 'draw') return signDraw();
  const prefs = loadPrefs();
  if (kind === 'mobile' && !cfg('relayUrl')) return alertDlg(t('sgNoRelay'));
  const main = S.sources.get(S.mainId);
  if (main?.isXfa) return alertDlg(t('xfaOnly'));

  // estat del diàleg (es conserva entre "tria la zona" i tornar-hi)
  const text = !prefs.text || prefs.text === OLD_DEFAULT_LAYER2 ? DEFAULT_LAYER2 : prefs.text;
  const st = { visible: !!presetRect || !!prefs.visible, rect: presetRect, reason: prefs.reason || '', location: prefs.location || '', contact: prefs.contact || '', text, useImg: prefs.useImg !== false, p12: null, pass: '' };
  st.fieldName = st.rect?.name || null;
  presetRect = null;

  for (;;) {
    const visSel = el('select');
    visSel.append(el('option', { value: '0', text: t('sgNoVisible') }), el('option', { value: '1', text: t('sgYesVisible') }));
    visSel.value = st.visible ? '1' : '0';
    const pickBtn = el('button', { class: 'tb', text: t('sgPick'), type: 'button' });
    const placed = el('span', { class: 'muted' });
    const ta = el('textarea', { rows: 3, style: { width: '100%' } }); ta.value = st.text; ta.addEventListener('input', () => { st.text = ta.value; });
    const textBox = el('div', {}, el('span', { class: 'muted', text: t('sgText') }), ta, el('div', { class: 'muted', style: { fontSize: '12px' }, text: t('sgTextHelp') }));

    // imatge de la signatura visible: del dispositiu o de Drive, desada al navegador
    const imgPrev = el('img', { alt: '', style: { maxHeight: '48px', maxWidth: '160px', background: '#fff', border: '1px solid var(--line)', borderRadius: '4px', verticalAlign: 'middle' } });
    const imgNone = el('span', { class: 'muted', text: t('sgImgNone') });
    const imgUse = el('input', { type: 'checkbox' }); imgUse.checked = st.useImg;
    imgUse.addEventListener('change', () => { st.useImg = imgUse.checked; });
    const imgFileInp = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const imgFileBtn = el('button', { class: 'tb', type: 'button', text: t('sgImgFile'), onclick: () => imgFileInp.click() });
    const imgDriveBtn = el('button', { class: 'tb', type: 'button', text: t('sgImgDrive'), hidden: !cfg('googleClientId') });
    const imgDelBtn = el('button', { class: 'tb', type: 'button', text: t('sgImgRemove') });
    const imgUseLbl = el('label', { class: 'row chk' }, imgUse, el('span', { text: t('sgImgUse') }));
    const refreshImg = () => {
      const url = loadSigImg();
      imgPrev.hidden = !url; if (url) imgPrev.src = url;
      imgNone.hidden = !!url; imgDelBtn.hidden = !url; imgUseLbl.hidden = !url;
    };
    const setImg = async (blob) => {
      try { await storeSigImg(blob); st.useImg = imgUse.checked = true; } catch (e) { toast(t('sgImgErr', e.message || e), 'err'); }
      refreshImg();
    };
    imgFileInp.addEventListener('change', () => { if (imgFileInp.files[0]) setImg(imgFileInp.files[0]); });
    imgDriveBtn.addEventListener('click', async () => {
      try { const d = await (await import('./drive.js')).pickImage(); if (d) await setImg(new Blob([d.bytes], { type: d.mimeType })); } catch (e) { toast(String(e.message || e), 'err'); }
    });
    imgDelBtn.addEventListener('click', () => { try { localStorage.removeItem(IMG_KEY); } catch {} refreshImg(); });
    refreshImg();
    const imgBox = el('div', {},
      el('label', { class: 'row' }, el('span', { text: t('sgImg') }), el('div', {}, imgPrev, imgNone, ' ', imgFileBtn, ' ', imgDriveBtn, ' ', imgDelBtn, imgFileInp)),
      imgUseLbl);

    const refreshPlaced = () => {
      const on = visSel.value === '1';
      pickBtn.hidden = placed.hidden = imgBox.hidden = textBox.hidden = !on;
      placed.textContent = st.rect ? t('sgPlaced', pageIndex(st.rect.pid) + 1, Math.round(st.rect.w), Math.round(st.rect.h)) : '';
    };
    visSel.addEventListener('change', () => { st.visible = visSel.value === '1'; refreshPlaced(); });
    refreshPlaced();
    const inp = (key, label, type = 'text') => { const i = el('input', { type, value: st[key] }); i.addEventListener('input', () => { st[key] = i.value; }); return el('label', { class: 'row' }, el('span', { text: label }), i); };

    const body = el('div', {},
      el('p', { class: 'warn', text: t('signLast') }),
      el('p', { class: 'muted', text: kind === 'autofirma' ? t('sgHelpDesktop') : kind === 'mobile' ? t('sgHelpMobile') : t('sgHelpP12') }),
      main?.signed && kind !== 'p12' ? el('p', { class: 'muted', text: t('sgAlreadySigned') }) : null,
      el('label', { class: 'row' }, el('span', { text: t('sgVisible') }), el('div', {}, visSel, ' ', pickBtn, ' ', placed)),
      imgBox, textBox,
      inp('reason', t('sgReason')), inp('location', t('sgLocation')), inp('contact', t('sgContact')),
    );
    let fileInp = null, passInp = null;
    if (kind === 'p12') {
      fileInp = el('input', { type: 'file', accept: '.p12,.pfx,application/x-pkcs12' });
      passInp = el('input', { type: 'password', value: st.pass, autocomplete: 'off' });
      passInp.addEventListener('input', () => { st.pass = passInp.value; });
      body.append(el('label', { class: 'row' }, el('span', { text: t('sgCert') }), fileInp), el('label', { class: 'row' }, el('span', { text: t('sgPass') }), passInp));
      fileInp.addEventListener('change', async () => { st.p12 = fileInp.files[0] ? await readFileBytes(fileInp.files[0]) : null; });
      if (st.p12) fileInp.title = '✔';
    }
    let picking = false;
    const r = await modal({
      title: t('sgTitle'), body, buttons: [{ label: t('cancel'), value: false }, { label: t('sgDo'), value: true, primary: true }],
      onOpen: ({ close }) => { pickBtn.addEventListener('click', () => { picking = true; close('pick'); }); },
    });
    if (r === 'pick') {
      setTool('select');
      const rc = await pickRect();
      setTool('select');
      if (rc) { if (rc.w < 4) { rc.w = 190; rc.h = 56; } st.rect = rc; st.visible = true; }
      continue;
    }
    if (!r) return;
    savePrefs({ reason: st.reason, location: st.location, contact: st.contact, text: st.text, visible: st.visible, useImg: st.useImg });
    if (kind === 'p12' && !st.p12) { toast(t('sgNeedCert'), 'err'); continue; }
    // signatura visible sense zona triada: es demana la zona abans de signar
    if (st.visible && !st.rect) {
      setTool('select');
      const rc = await pickRect();
      setTool('select');
      if (!rc) continue;
      if (rc.w < 4) { rc.w = 190; rc.h = 56; }
      st.rect = rc;
    }
    break;
  }
  void 0;
  return runSigning(kind, st);
}

async function runSigning(kind, st) {
  const prog = progressDlg(t('sgTitle'), () => abort?.());
  let abort = null;
  let cancelled = false;
  const cancelP = new Promise((_, rej) => { abort = () => { cancelled = true; rej(new af.AutoFirmaError('cancel', 'CANCEL', 'cancel')); }; });
  const onStatus = (s) => prog.set(null, t('sgSt_' + s));
  const ctl = new AbortController(); // atura el sondeig del servidor intermediari en cancel·lar o acabar
  try {
    prog.set(0, t('working'));
    const pdf = await buildPdf({ progress: (p) => prog.set(p) });
    // posició de la signatura visible en el sistema del PDF
    let vis = null, pageNo = 1;
    if (st.visible && st.rect) {
      const info = await viewOf(st.rect.pid);
      const e = pageById(st.rect.pid);
      pageNo = pageIndex(st.rect.pid) + 1;
      vis = { pageIndex: pageNo - 1, x: st.rect.x, y: st.rect.y, w: st.rect.w, h: st.rect.h, view: info.view };
      if (((info.nativeRot + (e?.rot || 0)) % 360) !== 0) toast(t('sgRotWarn'), '', 6000);
    }
    const imgUrl = vis && st.useImg ? loadSigImg() : null;
    let result;
    if (kind === 'p12') {
      prog.set(0.9, t('working'));
      const p12 = p12m.readP12(st.p12, st.pass);
      const cn = p12m.certSummary(p12.cert).cn;
      const lines = fillLayer2(st.text || '', cn).split('\n');
      const image = imgUrl ? { bytes: dataUrlBytes(imgUrl), type: 'png' } : null;
      const signed = await p12m.signPdfWithP12(pdf, p12, { visible: vis ? { ...vis, lines, image } : null, view: vis?.view, reason: st.reason, location: st.location, contact: st.contact });
      result = { signed };
    } else {
      const params = {
        signReason: st.reason, signatureProductionCity: st.location, signerContact: st.contact,
        alwaysCreateRevision: 'true',
      };
      if (vis && st.fieldName && st.rect?.name === st.fieldName) params.signatureField = st.fieldName;
      else if (vis) {
        const x0 = vis.view[0] + vis.x, y1 = vis.view[3] - vis.y;
        Object.assign(params, {
          signaturePage: String(pageNo),
          signaturePositionOnPageLowerLeftX: Math.round(x0), signaturePositionOnPageLowerLeftY: Math.round(y1 - vis.h),
          signaturePositionOnPageUpperRightX: Math.round(x0 + vis.w), signaturePositionOnPageUpperRightY: Math.round(y1),
          layer2Text: (st.text || '').replace(/\s*\n\s*/g, ' '), layer2FontSize: '9', layer2FontFamily: '1',
        });
      }
      // AutoFirma dibuixa la rúbrica ajustada a tot el requadre, amb el text a sobre
      if (vis && imgUrl) params.signatureRubricImage = await sigImgJpegB64(imgUrl);
      const call = kind === 'autofirma'
        ? af.signDesktop(pdf, params, { onStatus })
        : af.signViaRelay(pdf, params, cfg('relayUrl'), { onStatus, signal: ctl.signal });
      result = await Promise.race([call, cancelP]);
    }
    prog.close();
    const name = baseName(S.file.name || 'document') + '_signat.pdf';
    const ok = await loadDocument(result.signed, name, { force: true });
    if (!ok) return;
    S.dirty = true; emit('history');
    const r = await modal({ body: el('p', { text: t('sgDone') }), buttons: [{ label: t('sgLater'), value: false }, { label: t('sgSaveNow'), value: true, primary: true }] });
    if (r) await save(true);
  } catch (e) {
    prog.close();
    if (af.isCancel(e) || cancelled) return toast(t('sgCancelled'));
    console.error(e);
    await alertDlg(String(e.message || e), t('sgTitle'));
  } finally { ctl.abort(); }
}

// ---------------- signatura manuscrita visual ----------------
async function signDraw() {
  const cv = el('canvas', { class: 'sigpad', width: 900, height: 360 });
  const ctx = cv.getContext('2d');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#0a1f6e';
  let drawing = false, last = null, hasInk = false;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(last[0] + 0.1, last[1]); ctx.stroke(); hasInk = true; });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const typed = el('input', { type: 'text', placeholder: t('sgTypePh'), style: { width: '100%', fontSize: '22px' } });
  const typedCv = el('canvas', { class: 'sigpad', width: 900, height: 360, hidden: true });
  let mode = 'draw';
  const tabD = el('button', { class: 'tb', text: t('sgDrawTab') }), tabT = el('button', { class: 'tb', text: t('sgTypeTab') });
  const clear = el('button', { class: 'tb', text: t('sgClear') });
  const setMode = (m) => { mode = m; cv.hidden = m !== 'draw'; typedCv.hidden = m !== 'type'; typed.hidden = m !== 'type'; tabD.classList.toggle('accent', m === 'draw'); tabT.classList.toggle('accent', m === 'type'); };
  tabD.onclick = () => setMode('draw'); tabT.onclick = () => setMode('type');
  clear.onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); hasInk = false; typed.value = ''; typedCv.getContext('2d').clearRect(0, 0, 900, 360); };
  typed.addEventListener('input', () => {
    const c = typedCv.getContext('2d'); c.clearRect(0, 0, 900, 360); c.fillStyle = '#0a1f6e';
    c.font = 'italic 130px "Segoe Script","Brush Script MT","Lucida Handwriting",cursive'; c.textBaseline = 'middle';
    let size = 130; while (c.measureText(typed.value).width > 860 && size > 20) { size -= 6; c.font = `italic ${size}px "Segoe Script","Brush Script MT","Lucida Handwriting",cursive`; }
    c.fillText(typed.value, 20, 180);
  });
  const body = el('div', {}, el('p', { class: 'warn', text: t('sgDrawHelp') }), el('div', { style: { display: 'flex', gap: '6px', margin: '8px 0' } }, tabD, tabT, clear), cv, typedCv, typed);
  setMode('draw');
  const r = await modal({ title: t('sgDrawTitle'), body, wide: true, buttons: [{ label: t('cancel'), value: false }, { label: t('accept'), value: true, primary: true }] });
  if (!r) return;
  const src = mode === 'draw' ? cv : typedCv;
  if (mode === 'draw' && !hasInk) return;
  if (mode === 'type' && !typed.value.trim()) return;
  // retalla l'àrea amb tinta
  const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 <= x0) return;
  const pad = 10; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(src.width, x1 + pad); y1 = Math.min(src.height, y1 + pad);
  const out = document.createElement('canvas'); out.width = x1 - x0; out.height = y1 - y0;
  out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  const file = new File([blob], 'signatura.png', { type: 'image/png' });
  await addImageFile(file);
}
