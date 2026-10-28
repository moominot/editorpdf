// Traduccions: [català, castellà, anglès]
const D = {
  open: ['Obre', 'Abrir', 'Open'],
  openLocal: ['Des de l\'ordinador…', 'Desde el ordenador…', 'From this computer…'],
  openDrive: ['Des de Google Drive…', 'Desde Google Drive…', 'From Google Drive…'],
  newBlank: ['PDF en blanc', 'PDF en blanco', 'Blank PDF'],
  save: ['Desa', 'Guardar', 'Save'],
  saveAs: ['Desa com a…', 'Guardar como…', 'Save as…'],
  saveDrive: ['Desa a Google Drive', 'Guardar en Google Drive', 'Save to Google Drive'],
  saveDriveAs: ['Desa a Drive com a…', 'Guardar en Drive como…', 'Save to Drive as…'],
  download: ['Descarrega', 'Descargar', 'Download'],
  undo: ['Desfés (Ctrl+Z)', 'Deshacer (Ctrl+Z)', 'Undo (Ctrl+Z)'],
  redo: ['Refés (Ctrl+Y)', 'Rehacer (Ctrl+Y)', 'Redo (Ctrl+Y)'],
  tSelect: ['Selecciona / omple formularis (V)', 'Seleccionar / rellenar formularios (V)', 'Select / fill forms (V)'],
  tText: ['Afegeix quadre de text (T)', 'Añadir cuadro de texto (T)', 'Add text box (T)'],
  tHl: ['Ressalta text (H)', 'Resaltar texto (H)', 'Highlight text (H)'],
  tUl: ['Subratlla text (U)', 'Subrayar texto (U)', 'Underline text (U)'],
  tSt: ['Ratlla text', 'Tachar texto', 'Strike through text'],
  tInk: ['Dibuixa a mà alçada (D)', 'Dibujar a mano alzada (D)', 'Freehand draw (D)'],
  tRect: ['Rectangle / tapa (R)', 'Rectángulo / tapar (R)', 'Rectangle / cover (R)'],
  tImg: ['Afegeix imatge (I)', 'Añadir imagen (I)', 'Add image (I)'],
  tEditText: ['Edita text existent (E)', 'Editar texto existente (E)', 'Edit existing text (E)'],
  zoomIn: ['Apropa (Ctrl +)', 'Acercar (Ctrl +)', 'Zoom in (Ctrl +)'],
  zoomOut: ['Allunya (Ctrl −)', 'Alejar (Ctrl −)', 'Zoom out (Ctrl −)'],
  fitWidth: ['Ajusta a l\'amplada', 'Ajustar al ancho', 'Fit width'],
  fitPage: ['Ajusta a la pàgina', 'Ajustar a la página', 'Fit page'],
  find: ['Cerca (Ctrl+F)', 'Buscar (Ctrl+F)', 'Find (Ctrl+F)'],
  findPh: ['Cerca al document…', 'Buscar en el documento…', 'Find in document…'],
  sign: ['Signa', 'Firmar', 'Sign'],
  signAutofirma: ['AutoFirma (ordinador)', 'AutoFirma (ordenador)', 'AutoFirma (desktop)'],
  signMobile: ['AutoFirma mòbil (servidor intermediari)', 'AutoFirma móvil (servidor intermediario)', 'AutoFirma mobile (relay server)'],
  signP12: ['Certificat .p12 / .pfx (al navegador)', 'Certificado .p12 / .pfx (en el navegador)', 'Certificate .p12 / .pfx (in browser)'],
  signDraw: ['Signatura manuscrita (visual)', 'Firma manuscrita (visual)', 'Handwritten signature (visual)'],
  ocr: ['OCR: fes el PDF cercable', 'OCR: hacer el PDF buscable', 'OCR: make PDF searchable'],
  settings: ['Ajustos', 'Ajustes', 'Settings'],
  pages: ['Pàgines', 'Páginas', 'Pages'],
  rotL: ['Gira a l\'esquerra', 'Girar a la izquierda', 'Rotate left'],
  rotR: ['Gira a la dreta', 'Girar a la derecha', 'Rotate right'],
  dupPage: ['Duplica pàgina', 'Duplicar página', 'Duplicate page'],
  addBlank: ['Afegeix pàgina en blanc', 'Añadir página en blanco', 'Add blank page'],
  importPages: ['Insereix pàgines d\'un altre PDF', 'Insertar páginas de otro PDF', 'Insert pages from another PDF'],
  extractPages: ['Extreu pàgines a un nou PDF', 'Extraer páginas a un nuevo PDF', 'Extract pages to new PDF'],
  delPages: ['Elimina pàgines (Supr)', 'Eliminar páginas (Supr)', 'Delete pages (Del)'],
  emptyHint: ['Obre un PDF per començar, o arrossega\'l aquí.', 'Abre un PDF para empezar, o arrástralo aquí.', 'Open a PDF to start, or drag it here.'],
  dropHere: ['Deixa anar el PDF aquí', 'Suelta el PDF aquí', 'Drop the PDF here'],
  page: ['Pàgina', 'Página', 'Page'],
  of: ['de', 'de', 'of'],
  cancel: ['Cancel·la', 'Cancelar', 'Cancel'],
  accept: ['Accepta', 'Aceptar', 'OK'],
  close: ['Tanca', 'Cerrar', 'Close'],
  delete: ['Elimina', 'Eliminar', 'Delete'],
  color: ['Color', 'Color', 'Color'],
  size: ['Mida', 'Tamaño', 'Size'],
  font: ['Font', 'Fuente', 'Font'],
  width: ['Gruix', 'Grosor', 'Width'],
  fill: ['Farciment', 'Relleno', 'Fill'],
  stroke: ['Contorn', 'Contorno', 'Stroke'],
  noFill: ['Sense farciment', 'Sin relleno', 'No fill'],
  bold: ['Negreta', 'Negrita', 'Bold'],
  italic: ['Cursiva', 'Cursiva', 'Italic'],
  opacity: ['Opacitat', 'Opacidad', 'Opacity'],
  hintText: ['Fes clic a la pàgina per afegir text. Doble clic per editar.', 'Haz clic en la página para añadir texto. Doble clic para editar.', 'Click the page to add text. Double-click to edit.'],
  hintHl: ['Selecciona text per aplicar-hi l\'efecte (o arrossega un rectangle).', 'Selecciona texto para aplicar el efecto (o arrastra un rectángulo).', 'Select text to apply (or drag a rectangle).'],
  hintInk: ['Dibuixa sobre la pàgina.', 'Dibuja sobre la página.', 'Draw on the page.'],
  hintRect: ['Arrossega per dibuixar un rectangle. Amb farciment sòlid serveix per tapar.', 'Arrastra para dibujar un rectángulo. Con relleno sólido sirve para tapar.', 'Drag to draw a rectangle. A solid fill covers content.'],
  hintImg: ['Fes clic o arrossega per col·locar la imatge.', 'Haz clic o arrastra para colocar la imagen.', 'Click or drag to place the image.'],
  hintEditText: ['Fes clic sobre un fragment de text del PDF per canviar-lo.', 'Haz clic en un fragmento de texto del PDF para cambiarlo.', 'Click a text fragment of the PDF to change it.'],
  hintSelect: ['Selecciona objectes, omple formularis, o selecciona text.', 'Selecciona objetos, rellena formularios o selecciona texto.', 'Select objects, fill forms, or select text.'],
  hintSign: ['Fes clic o arrossega per marcar on va la signatura visible.', 'Haz clic o arrastra para marcar dónde va la firma visible.', 'Click or drag to place the visible signature.'],
  selected: ['Seleccionat', 'Seleccionado', 'Selected'],
  opened: ['Obert: {0}', 'Abierto: {0}', 'Opened: {0}'],
  saved: ['Desat: {0}', 'Guardado: {0}', 'Saved: {0}'],
  savedDrive: ['Desat a Google Drive: {0}', 'Guardado en Google Drive: {0}', 'Saved to Google Drive: {0}'],
  errOpen: ['No s\'ha pogut obrir el PDF: {0}', 'No se pudo abrir el PDF: {0}', 'Could not open the PDF: {0}'],
  errSave: ['No s\'ha pogut desar: {0}', 'No se pudo guardar: {0}', 'Could not save: {0}'],
  notPdf: ['El fitxer no és un PDF.', 'El archivo no es un PDF.', 'The file is not a PDF.'],
  askPassword: ['Aquest PDF està protegit amb contrasenya. Introdueix-la:', 'Este PDF está protegido con contraseña. Introdúcela:', 'This PDF is password protected. Enter it:'],
  wrongPassword: ['Contrasenya incorrecta. Torna-ho a provar:', 'Contraseña incorrecta. Inténtalo de nuevo:', 'Wrong password. Try again:'],
  unsaved: ['Hi ha canvis sense desar. Vols continuar?', 'Hay cambios sin guardar. ¿Continuar?', 'You have unsaved changes. Continue?'],
  needDoc: ['Obre primer un PDF.', 'Abre primero un PDF.', 'Open a PDF first.'],
  cantDeleteAll: ['No es poden eliminar totes les pàgines.', 'No se pueden eliminar todas las páginas.', 'You cannot delete all pages.'],
  confirmDelPages: ['Eliminar {0} pàgina(es)?', '¿Eliminar {0} página(s)?', 'Delete {0} page(s)?'],
  importRange: ['Quines pàgines vols inserir? (p. ex. 1-3,5). Buit = totes', '¿Qué páginas quieres insertar? (p. ej. 1-3,5). Vacío = todas', 'Which pages to insert? (e.g. 1-3,5). Empty = all'],
  insertWhere: ['Insereix després de la pàgina seleccionada', 'Insertar después de la página seleccionada', 'Insert after the selected page'],
  encryptedWarn: ['Aquest PDF està xifrat; per poder-lo editar es desarà una còpia sense xifrar.', 'Este PDF está cifrado; para poder editarlo se guardará una copia sin cifrar.', 'This PDF is encrypted; an unencrypted copy will be saved so it can be edited.'],
  signedWarn: ['Aquest document ja té signatures digitals. Si el modifiques i el deses, les signatures actuals deixaran de ser vàlides. Vols continuar?', 'Este documento ya tiene firmas digitales. Si lo modificas y lo guardas, las firmas actuales dejarán de ser válidas. ¿Continuar?', 'This document already has digital signatures. Modifying and saving it will invalidate them. Continue?'],
  signLast: ['Recorda: la signatura digital ha de ser l\'últim pas. Després de signar, no modifiquis el document.', 'Recuerda: la firma digital debe ser el último paso. Tras firmar, no modifiques el documento.', 'Remember: digital signing must be the last step. Do not modify the document afterwards.'],
  xfaMode: ['Formulari XFA: només es pot omplir i desar (no es poden editar pàgines).', 'Formulario XFA: solo se puede rellenar y guardar (no se pueden editar páginas).', 'XFA form: you can only fill and save it (pages cannot be edited).'],
  working: ['Treballant…', 'Trabajando…', 'Working…'],
  find_none: ['Cap resultat', 'Sin resultados', 'No results'],
  gdriveCfg: ['Cal configurar Google Drive als Ajustos (Client ID, API key i App ID).', 'Hay que configurar Google Drive en Ajustes (Client ID, API key y App ID).', 'Configure Google Drive in Settings (Client ID, API key and App ID).'],
  language: ['Idioma', 'Idioma', 'Language'],
  theme: ['Tema', 'Tema', 'Theme'],
  themeAuto: ['Automàtic', 'Automático', 'Auto'],
  themeLight: ['Clar', 'Claro', 'Light'],
  themeDark: ['Fosc', 'Oscuro', 'Dark'],
};

let lang = 0;
const LANGS = ['ca', 'es', 'en'];
export function initLang() {
  let v = null;
  try { v = localStorage.getItem('pdfsimple.lang'); } catch {}
  if (!v) { const n = (navigator.language || 'ca').slice(0, 2); v = LANGS.includes(n) ? n : 'en'; }
  lang = Math.max(0, LANGS.indexOf(v));
  document.documentElement.lang = LANGS[lang];
}
export function getLang() { return LANGS[lang]; }
export function setLang(code) {
  lang = Math.max(0, LANGS.indexOf(code));
  try { localStorage.setItem('pdfsimple.lang', LANGS[lang]); } catch {}
  document.documentElement.lang = LANGS[lang];
  applyI18n();
}
export function t(key, ...args) {
  const e = D[key];
  let s = e ? (e[lang] ?? e[0]) : key;
  args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
  return s;
}
export function addStrings(obj) { Object.assign(D, obj); }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((e) => { const s = t(e.dataset.i18nTitle); e.title = s; e.setAttribute('aria-label', s); });
  root.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
}
