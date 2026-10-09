// Google Drive: Google Identity Services (OAuth), Google Picker i Drive API v3, tot des del navegador.
// Abast mínim: drive.file (només fitxers triats amb el Picker o creats per l'app).
import { cfg } from './config.js';
import { loadScript } from './util.js';
import { t, addStrings } from './i18n.js';

addStrings({
  drNoCfg: ['Cal configurar Google Drive als Ajustos (Client ID, API key i App ID). Mira el README.', 'Hay que configurar Google Drive en Ajustes (Client ID, API key y App ID). Mira el README.', 'Configure Google Drive in Settings (Client ID, API key and App ID). See the README.'],
  drAuth: ['No s\'ha pogut autoritzar l\'accés a Google Drive', 'No se pudo autorizar el acceso a Google Drive', 'Could not authorize Google Drive access'],
  drNotPdf: ['El fitxer triat no és un PDF.', 'El archivo elegido no es un PDF.', 'The chosen file is not a PDF.'],
  drPickTitle: ['Tria un PDF de Google Drive', 'Elige un PDF de Google Drive', 'Pick a PDF from Google Drive'],
  drFolderTitle: ['Tria la carpeta de destinació', 'Elige la carpeta de destino', 'Choose the destination folder'],
  drUploadErr: ['Error en pujar a Google Drive ({0})', 'Error al subir a Google Drive ({0})', 'Upload to Google Drive failed ({0})'],
  drDownloadErr: ['Error en baixar de Google Drive ({0})', 'Error al descargar de Google Drive ({0})', 'Download from Google Drive failed ({0})'],
});

const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install';
let token = null, expires = 0, tokenClient = null, pickerReady = false;

export const isConfigured = () => !!(cfg('googleClientId') && cfg('googleApiKey') && cfg('googleAppId'));

async function loadLibs() {
  await Promise.all([loadScript('https://accounts.google.com/gsi/client'), loadScript('https://apis.google.com/js/api.js')]);
  if (!pickerReady) {
    await new Promise((res) => window.gapi.load('picker', { callback: res }));
    pickerReady = true;
  }
}
export function preload() { if (isConfigured()) loadLibs().catch(() => {}); }

function requestToken(prompt, loginHint) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: cfg('googleClientId'), scope: SCOPE, callback: () => {},
      });
    }
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(t('drAuth') + ': ' + (resp.error_description || resp.error)));
      token = resp.access_token; expires = Date.now() + (resp.expires_in - 60) * 1000;
      resolve(token);
    };
    tokenClient.error_callback = (e) => reject(new Error(t('drAuth') + ': ' + (e?.type || e?.message || '')));
    tokenClient.requestAccessToken(loginHint ? { prompt, login_hint: loginHint } : { prompt });
  });
}

// Només el token (sense Picker): per obrir fitxers per identificador ("Obre amb…" de Drive)
export async function prepareToken(loginHint) {
  if (!cfg('googleClientId')) throw new Error(t('drNoCfg'));
  await loadScript('https://accounts.google.com/gsi/client');
  if (!token || Date.now() > expires) await requestToken(token ? '' : 'select_account', loginHint);
  return token;
}

export async function downloadById(id) {
  const mr = await api(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,parents,mimeType&supportsAllDrives=true`);
  if (!mr.ok) throw new Error(t('drDownloadErr', mr.status));
  const meta = await mr.json();
  const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`);
  if (!res.ok) throw new Error(t('drDownloadErr', res.status));
  return { id: meta.id, name: meta.name, parents: meta.parents || null, mimeType: meta.mimeType, bytes: new Uint8Array(await res.arrayBuffer()) };
}

// Cal cridar-la des d'un gest d'usuari (clic) la primera vegada, perquè pot obrir una finestra
export async function prepare() {
  if (!isConfigured()) throw new Error(t('drNoCfg'));
  await loadLibs();
  if (!token || Date.now() > expires) await requestToken(token ? '' : 'select_account');
  return token;
}

async function api(url, opts = {}, retry = true) {
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
  if (res.status === 401 && retry) { token = null; await requestToken(''); return api(url, opts, false); }
  return res;
}

function showPicker(builderFn) {
  return new Promise((resolve) => {
    const g = window.google.picker;
    const picker = builderFn(new g.PickerBuilder())
      .setOAuthToken(token).setDeveloperKey(cfg('googleApiKey')).setAppId(cfg('googleAppId'))
      .setOrigin(window.location.protocol + '//' + window.location.host)
      .setCallback((d) => {
        if (d.action === g.Action.PICKED) resolve(d.docs[0]);
        else if (d.action === g.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}

export async function pickAndDownload() {
  await prepare();
  const g = window.google.picker;
  const doc = await showPicker((b) => {
    const view = new g.DocsView(g.ViewId.DOCS).setMimeTypes('application/pdf').setIncludeFolders(true).setMode(g.DocsViewMode.LIST);
    const shared = new g.DocsView(g.ViewId.DOCS).setMimeTypes('application/pdf').setOwnedByMe(false).setMode(g.DocsViewMode.LIST);
    return b.setTitle(t('drPickTitle')).addView(view).addView(shared).enableFeature(g.Feature.SUPPORT_DRIVES);
  });
  if (!doc) return null;
  if (doc.mimeType && doc.mimeType !== 'application/pdf') throw new Error(t('drNotPdf'));
  const meta = await (await api(`https://www.googleapis.com/drive/v3/files/${doc.id}?fields=id,name,parents,mimeType&supportsAllDrives=true`)).json();
  const res = await api(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media&supportsAllDrives=true`);
  if (!res.ok) throw new Error(t('drDownloadErr', res.status));
  return { id: doc.id, name: meta.name || doc.name, parents: meta.parents || null, bytes: new Uint8Array(await res.arrayBuffer()) };
}

// Retorna l'id de carpeta, null (arrel de "El meu Drive") o 'cancel'
export async function chooseFolder() {
  await prepare();
  const g = window.google.picker;
  const doc = await showPicker((b) => {
    const view = new g.DocsView(g.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
    return b.setTitle(t('drFolderTitle')).addView(view).enableFeature(g.Feature.SUPPORT_DRIVES);
  });
  return doc ? doc.id : 'cancel';
}

export async function upload(bytes, { id = null, name = 'document.pdf', parents = null } = {}) {
  await prepare();
  const meta = { name, mimeType: 'application/pdf' };
  if (!id && parents?.length) meta.parents = parents;
  const fields = 'id,name,parents';
  if (id && bytes.length <= 4 * 1024 * 1024) {
    const res = await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true&fields=${fields}`, { method: 'PATCH', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
    if (!res.ok) throw new Error(t('drUploadErr', res.status + ' ' + (await res.text()).slice(0, 200)));
    return res.json();
  }
  if (!id && bytes.length <= 4 * 1024 * 1024) {
    const boundary = 'pdfsimple' + Math.random().toString(36).slice(2);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
    const body = new Blob([head, bytes, `\r\n--${boundary}--`]);
    const res = await api(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${fields}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    if (!res.ok) throw new Error(t('drUploadErr', res.status + ' ' + (await res.text()).slice(0, 200)));
    return res.json();
  }
  // Pujada represa (fitxers grans)
  const start = await api(`https://www.googleapis.com/upload/drive/v3/files${id ? '/' + id : ''}?uploadType=resumable&supportsAllDrives=true&fields=${fields}`, {
    method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/pdf', 'X-Upload-Content-Length': String(bytes.length) },
    body: JSON.stringify(id ? {} : meta),
  });
  if (!start.ok) throw new Error(t('drUploadErr', start.status));
  const loc = start.headers.get('Location');
  const res = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  if (!res.ok) throw new Error(t('drUploadErr', res.status));
  return res.json();
}
