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
console.log('ok');
