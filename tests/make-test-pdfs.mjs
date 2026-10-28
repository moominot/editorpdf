// Genera PDF de prova (multipàgina i amb formulari AcroForm). Ús: node tests/make-test-pdfs.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { PDFDocument, StandardFonts, rgb, degrees } = createRequire(import.meta.url)('../vendor/pdflib/pdf-lib.min.js');

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 5; i++) {
  const p = doc.addPage([595, 842]);
  p.drawText(`Pàgina ${i} — document de prova`, { x: 50, y: 780, size: 22, font: bold, color: rgb(0.1, 0.2, 0.5) });
  for (let l = 0; l < 30; l++)
    p.drawText(`Línia ${l + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.`, { x: 50, y: 740 - l * 18, size: 11, font });
  p.drawRectangle({ x: 400, y: 100, width: 120, height: 60, borderColor: rgb(0.8, 0.2, 0.2), borderWidth: 2 });
}
writeFileSync('tests/pdfs/multipagina.pdf', await doc.save());

const f = await PDFDocument.create();
const ff = await f.embedFont(StandardFonts.Helvetica);
const pg = f.addPage([595, 842]);
pg.drawText('Formulari de prova', { x: 50, y: 790, size: 20, font: ff });
const form = f.getForm();
let y = 740;
const label = (t) => pg.drawText(t, { x: 50, y, size: 11, font: ff });
label('Nom:'); form.createTextField('nom').addToPage(pg, { x: 160, y: y - 4, width: 250, height: 20 }); y -= 40;
label('Cognoms:'); form.createTextField('cognoms').addToPage(pg, { x: 160, y: y - 4, width: 250, height: 20 }); y -= 40;
label('Comentaris:'); const m = form.createTextField('comentaris'); m.enableMultiline(); m.addToPage(pg, { x: 160, y: y - 60, width: 250, height: 70 }); y -= 100;
label('Accepto:'); form.createCheckBox('accepto').addToPage(pg, { x: 160, y: y - 4, width: 16, height: 16 }); y -= 40;
label('Sexe:'); const r = form.createRadioGroup('sexe');
r.addOptionToPage('Home', pg, { x: 160, y: y - 4, width: 16, height: 16 }); pg.drawText('Home', { x: 182, y, size: 11, font: ff });
r.addOptionToPage('Dona', pg, { x: 240, y: y - 4, width: 16, height: 16 }); pg.drawText('Dona', { x: 262, y, size: 11, font: ff }); y -= 40;
label('Illa:'); const d = form.createDropdown('illa'); d.addOptions(['Mallorca', 'Menorca', 'Eivissa', 'Formentera']); d.addToPage(pg, { x: 160, y: y - 4, width: 150, height: 20 });
writeFileSync('tests/pdfs/formulari.pdf', await f.save());

const r2 = await PDFDocument.create();
const rf = await r2.embedFont(StandardFonts.Helvetica);
const rp = r2.addPage([400, 300]); rp.setRotation(degrees(90));
rp.drawText('Pàgina rotada 90°', { x: 40, y: 150, size: 20, font: rf });
writeFileSync('tests/pdfs/rotada.pdf', await r2.save());

// adjunts: un PDF i un text (arbre /EmbeddedFiles)
const a = await PDFDocument.create();
const af = await a.embedFont(StandardFonts.Helvetica);
a.addPage([595, 842]).drawText('Document amb fitxers adjunts', { x: 50, y: 780, size: 18, font: af });
await a.attach(await doc.save(), 'annex-multipagina.pdf', { mimeType: 'application/pdf', description: 'Annex en PDF' });
await a.attach(new TextEncoder().encode('Hola, adjunt de prova àèòç\n'), 'notes.txt', { mimeType: 'text/plain', description: 'Notes' });
writeFileSync('tests/pdfs/adjunts.pdf', await a.save());

// plànol amb capes (OCG, com els d'AutoCAD) i marcadors niats
{
  globalThis.window = { PDFLib: createRequire(import.meta.url)('../vendor/pdflib/pdf-lib.min.js') };
  const { PDFName, PDFOperator, PDFHexString } = window.PDFLib;
  const { writeOutline } = await import('../js/pdfstruct.js');
  const p = await PDFDocument.create();
  const pf = await p.embedFont(StandardFonts.Helvetica);
  const ctx = p.context;
  const layers = ['Cotes', 'Mobiliari', 'Text'].map((n) => ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText(n) })));
  p.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: layers, D: { Order: layers, ON: [layers[0], layers[2]], OFF: [layers[1]] } }));
  const titles = ['Planta baixa', 'Alçats', 'Seccions'];
  const pages = titles.map((title) => {
    const pg = p.addPage([842, 595]);
    const oc = (name, fn) => { pg.pushOperators(PDFOperator.of('BDC', [PDFName.of('OC'), PDFName.of(name)])); fn(); pg.pushOperators(PDFOperator.of('EMC')); };
    oc('L2', () => pg.drawText(title, { x: 40, y: 540, size: 28, font: pf }));
    oc('L0', () => { pg.drawLine({ start: { x: 100, y: 120 }, end: { x: 700, y: 120 }, thickness: 1, color: rgb(0.9, 0.1, 0.1) }); pg.drawText('6,00 m', { x: 380, y: 126, size: 12, font: pf, color: rgb(0.9, 0.1, 0.1) }); });
    oc('L1', () => { pg.drawRectangle({ x: 200, y: 200, width: 160, height: 90, color: rgb(0.2, 0.5, 0.9) }); pg.drawText('Taula', { x: 255, y: 240, size: 14, font: pf, color: rgb(1, 1, 1) }); });
    pg.node.Resources().set(PDFName.of('Properties'), ctx.obj({ L0: layers[0], L1: layers[1], L2: layers[2] }));
    return pg.ref;
  });
  writeOutline(p, [
    { title: 'Planta baixa', page: pages[0], top: 595, open: true, items: [{ title: 'Detall mobiliari', page: pages[0], top: 300, items: [] }] },
    { title: 'Alçats', page: pages[1], top: 595, bold: true, items: [] },
    { title: 'Seccions', page: pages[2], top: 595, items: [] },
  ]);
  writeFileSync('tests/pdfs/capes-marcadors.pdf', await p.save());
}
console.log('ok');
