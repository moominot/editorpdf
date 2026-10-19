// Barra superior al mòbil (≤820 px): una sola fila, eines desplegables, menú lateral (⋮) i barra que s'amaga
// mentre s'usa una eina. A l'escriptori no fa res (els botons són .mobile-only i les classes no tenen efecte).
import { S, on } from './state.js';
import { $, $$ } from './util.js';
import { t, addStrings } from './i18n.js';
import { toast } from './ui.js';
import { getPlacement } from './objects.js';

addStrings({
  mTools: ['Eines', 'Herramientas', 'Tools'],
  mMore: ['Més opcions', 'Más opciones', 'More options'],
  mShowBar: ['Mostra la barra d\'eines', 'Mostrar la barra de herramientas', 'Show toolbar'],
  mFind: ['Cerca', 'Buscar', 'Find'],
  mOcr: ['OCR (fes-lo cercable)', 'OCR (hacerlo buscable)', 'OCR (make searchable)'],
});

const mq = matchMedia('(max-width: 820px)');
const isMobile = () => mq.matches;
const body = document.body;
const TIPS = { text: 'hintText', hl: 'hintHl', ul: 'hintHl', st: 'hintHl', ink: 'hintInk', rect: 'hintRect', edittext: 'hintEditText' };

function closeTools() { body.classList.remove('tools-open'); }
function closeMore() { body.classList.remove('more-open'); }
function showBars() { body.classList.remove('bars-hidden'); }
function hideBars() { if (isMobile()) { closeTools(); closeMore(); body.classList.add('bars-hidden'); } }

function openTools() {
  closeMore();
  body.classList.add('tools-open');
  const pal = $('#tools'), r = $('#btn-tools').getBoundingClientRect();
  pal.style.top = r.bottom + 4 + 'px';
  pal.style.left = Math.max(6, Math.min(innerWidth - pal.offsetWidth - 6, r.left)) + 'px';
}

// icona de l'eina activa al botó d'eines i al botó flotant
function syncIcon() {
  const cur = $(`#tools [data-tool="${body.dataset.tool || S.tool}"] use`) || $('#tools [data-tool="select"] use');
  const href = cur.getAttribute('href');
  for (const id of ['#btn-tools-ico use', '#bars-show-ico use']) $(id)?.setAttribute('href', href);
}

export function initMobileBar() {
  $('#btn-tools').addEventListener('click', (e) => { e.stopPropagation(); body.classList.contains('tools-open') ? closeTools() : openTools(); });
  $('#btn-more').addEventListener('click', () => { closeTools(); body.classList.toggle('more-open'); });
  $('#more-scrim').addEventListener('click', closeMore);
  $('#bars-show').addEventListener('click', showBars);
  // cerca, OCR i ajustos tanquen el menú lateral; el zoom el deixa obert per veure'n l'efecte
  for (const id of ['#btn-find', '#btn-ocr', '#btn-settings']) $(id).addEventListener('click', closeMore);
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#tools, #btn-tools')) closeTools(); });

  // en triar una eina al mòbil: es plega la graella, surt l'ajuda com a avís i, si és una eina de treball, s'amaga la barra
  $$('#tools [data-tool]').forEach((b) => b.addEventListener('click', () => {
    if (!isMobile()) return;
    closeTools();
    const tool = b.dataset.tool;
    if (tool === 'select') { showBars(); return; }
    if (TIPS[tool]) toast(t(TIPS[tool]), '', 3500);
    if (tool !== 'img') hideBars(); // la imatge obre el selector de fitxers; s'amaga en col·locar-la
  }));

  on('toolchange', () => {
    syncIcon();
    const tool = body.dataset.tool || S.tool;
    if (tool === 'select' && !getPlacement()) showBars();      // en acabar (o cancel·lar) l'eina, torna la barra
    else if (tool === 'img' && getPlacement()) hideBars();      // imatge a punt de col·locar
  });
  mq.addEventListener('change', () => { if (!isMobile()) { closeTools(); closeMore(); showBars(); } });
  syncIcon();
}
