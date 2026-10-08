// Gestió d'eines i de la imatge pendent de col·locar
import { S, addImage, emit, on } from './state.js';
import { $, $$, readFileBytes } from './util.js';
import { finishEdit, needsCapture, setPlacement, getPlacement, deselect, applyTextMarkup } from './objects.js';
import { toast } from './ui.js';
import { t } from './i18n.js';

export function updateCapture() {
  document.body.dataset.capture = needsCapture(S.tool) ? '1' : '0';
}

export function setTool(name) {
  finishEdit();
  if (name !== 'select' && !['hl', 'ul', 'st'].includes(name)) getSelection()?.removeAllRanges();
  if (getPlacement()) setPlacement(null);
  if (name === 'img') { pickImage(); return; }
  S.tool = name;
  document.body.dataset.tool = name;
  $$('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === name));
  updateCapture();
  if (name === 'hl' || name === 'ul' || name === 'st') applyTextMarkup(name); // si ja hi havia text seleccionat
  if (name !== 'select' && name !== 'text' && name !== 'edittext') deselect();
  emit('toolchange');
}
on('toolchange', updateCapture);

async function toBitmapBytes(file) {
  let bytes = await readFileBytes(file);
  let mime = file.type;
  const bmp = await createImageBitmap(file);
  const max = Math.max(bmp.width, bmp.height);
  const needConvert = !['image/png', 'image/jpeg'].includes(mime) || max > 3000;
  if (needConvert) {
    const k = Math.min(1, 3000 / max);
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const asJpeg = mime === 'image/jpeg';
    const blob = await new Promise((r) => cv.toBlob(r, asJpeg ? 'image/jpeg' : 'image/png', 0.92));
    bytes = new Uint8Array(await blob.arrayBuffer()); mime = blob.type;
    return { bytes, mime, w: cv.width, h: cv.height };
  }
  return { bytes, mime, w: bmp.width, h: bmp.height };
}

export async function addImageFile(file, after) {
  const im = await toBitmapBytes(file);
  const id = addImage(im.bytes, im.mime, im.w, im.h);
  // mida natural en punts (96 dpi -> 72)
  setPlacement({ kind: 'img', imgId: id, w: im.w * 0.75, h: im.h * 0.75, after });
  S.tool = 'select';
  document.body.dataset.tool = 'img';
  $$('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'img'));
  updateCapture();
  toast(t('hintImg'), '', 5000);
  emit('toolchange');
}

function pickImage() {
  const inp = $('#img-input');
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) { setTool('select'); return; }
    try { await addImageFile(f); } catch (e) { toast(String(e.message || e), 'err'); setTool('select'); }
  };
  inp.oncancel = () => setTool('select');
  inp.click();
}

// Torna a "selecciona" quan s'acaba la col·locació d'una imatge
on('toolchange', () => {
  if (!getPlacement() && document.body.dataset.tool === 'img') {
    document.body.dataset.tool = 'select';
    $$('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'select'));
    S.tool = 'select'; updateCapture();
  }
});
