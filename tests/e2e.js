// Proves d'integració dins del navegador. Amb el servidor de desenvolupament en marxa:
//   obre http://localhost:8080/ i a la consola:  await (await import('/tests/e2e.js')).run()
// Retorna una llista de { nom, ok, detall }.
export async function run() {
  const A = window.__app, S = A.S;
  const results = [];
  const check = async (name, fn) => {
    try { const r = await fn(); results.push({ nom: name, ok: r === true || r === undefined, detall: r === true ? '' : r }); }
    catch (e) { results.push({ nom: name, ok: false, detall: String(e.stack || e) }); }
  };
  const load = async (path) => {
    const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
    await A.loadDocument(bytes, path.split('/').pop(), { force: true });
    await new Promise((r) => setTimeout(r, 600));
  };
  const ops = await import('/js/pageops.js');
  const ex = await import('/js/export.js');
  const { pdfjs } = await import('/js/pdfsource.js');
  const { PDFDocument } = window.PDFLib;
  const textOf = async (bytes, n = 1) => {
    const d = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const tc = await (await d.getPage(n)).getTextContent();
    return tc.items.map((i) => i.str);
  };

  await check('pàgines: reordenar, girar, esborrar i exportar', async () => {
    await load('/tests/pdfs/multipagina.pdf');
    const ids = S.pages.map((p) => p.id);
    ops.rotatePages([ids[0]], 90); ops.deletePages([ids[1]]); ops.movePages([ids[4]], 0);
    const d = await PDFDocument.load(await ex.buildPdf());
    const rot = d.getPages().map((p) => p.getRotation().angle).join();
    return d.getPageCount() === 4 && S.pages.map((p) => p.idx).join() === '4,0,2,3' && rot === '0,90,0,0' || `pàgines=${d.getPageCount()} ordre=${S.pages.map((p) => p.idx)} rot=${rot}`;
  });

  await check('objectes: text, ressaltat, rectangle i traç es desen', async () => {
    await load('/tests/pdfs/multipagina.pdf');
    const pid = S.pages[0].id, o = A.objects;
    o.addObject(pid, { type: 'text', x: 60, y: 100, w: 200, h: 20, text: 'Hola àèç € ŝ', size: 16, color: '#cc0000', font: 'Times', bold: true, italic: false });
    o.addObject(pid, { type: 'hl', rects: [{ x: 50, y: 60, w: 200, h: 14 }], color: '#ffe600' });
    o.addObject(pid, { type: 'rect', x: 300, y: 200, w: 100, h: 50, stroke: '#0000ff', fill: '#ffff99', width: 2 });
    o.addObject(pid, { type: 'ink', paths: [[[100, 300], [150, 320], [200, 300]]], color: '#00aa00', width: 3, x: 98, y: 298, w: 104, h: 24 });
    const bytes = await ex.buildPdf();
    const txt = (await textOf(bytes)).join(' ');
    const d = await PDFDocument.load(bytes);
    const annots = d.getPage(0).node.Annots()?.size() || 0;
    return txt.includes('Hola àèç € ŝ') && annots === 1 || `text=${txt.slice(0, 60)} anots=${annots}`;
  });

  await check('formularis: valors es desen als camps', async () => {
    await load('/tests/pdfs/formulari.pdf');
    S.forms = { nom: 'Toni Llull', accepto: true, sexe: 'Dona', illa: 'Menorca' }; S.pristine = false;
    const f = (await PDFDocument.load(await ex.buildPdf())).getForm();
    return f.getTextField('nom').getText() === 'Toni Llull' && f.getCheckBox('accepto').isChecked() && f.getRadioGroup('sexe').getSelected() === 'Dona' && f.getDropdown('illa').getSelected()[0] === 'Menorca';
  });

  await check('edició de text existent: s\'elimina l\'original i queda el nou', async () => {
    await load('/tests/pdfs/multipagina.pdf');
    const pid = S.pages[0].id, o = A.objects;
    const orig = (await textOf(await ex.buildPdf())).find((s) => s.startsWith('Línia 3:'));
    // rectangle amb rm sobre la línia 3 (y des de dalt = 842-740+2*18 ...)
    o.addObject(pid, { type: 'rect', x: 49, y: 127.5, w: 430, h: 14, stroke: '', fill: '#ffffff', width: 0, rm: { x0: 48.5, y0: 700, x1: 480, y1: 715 } });
    o.addObject(pid, { type: 'text', x: 50, y: 127.6, w: 200, h: 13, text: 'Línia 3: NOU', size: 11, color: '#000000', font: 'Helvetica', bold: false, italic: false });
    const t2 = await textOf(await ex.buildPdf());
    return !!orig && !t2.some((s) => s.startsWith('Línia 3: Lorem')) && t2.some((s) => s.includes('Línia 3: NOU')) && t2.some((s) => s.startsWith('Línia 4:')) || JSON.stringify(t2.slice(0, 6));
  });

  await check('insertar pàgina en blanc i duplicar', async () => {
    await load('/tests/pdfs/multipagina.pdf');
    await ops.insertBlank(0); ops.duplicatePages([S.pages[0].id]);
    const d = await PDFDocument.load(await ex.buildPdf());
    return d.getPageCount() === 7 || `pàgines=${d.getPageCount()}`;
  });

  await check('desfés/refés restauren l\'estat', async () => {
    await load('/tests/pdfs/multipagina.pdf');
    const st = await import('/js/state.js');
    ops.deletePages([S.pages[0].id]);
    const n1 = S.pages.length; st.undo(); const n2 = S.pages.length; st.redo();
    return n1 === 4 && n2 === 5 && S.pages.length === 4 || `${n1},${n2},${S.pages.length}`;
  });

  await check('XFA: s\'omple i es desa amb pdf.js', async () => {
    await load('/tests/pdfs/xfa_filled_imm1344e.pdf');
    let inp = null;
    for (let k = 0; k < 40 && !inp; k++) { await new Promise((r) => setTimeout(r, 250)); inp = [...document.querySelectorAll('.xfaLayer input')].find((i) => i.type === 'text' && i.value); }
    if (!inp) return 'no s\'ha trobat cap camp';
    inp.value += 'QQ'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    const bytes = await ex.buildPdf();
    await A.loadDocument(bytes, 'xfa-desat.pdf', { force: true }); await new Promise((r) => setTimeout(r, 3500));
    return [...document.querySelectorAll('.xfaLayer input')].some((i) => i.value.endsWith('QQ')) || 'el valor no ha persistit';
  });

  const bad = results.filter((r) => !r.ok);
  console.table(results);
  console.log(bad.length ? `✘ ${bad.length} fallades` : `✔ ${results.length} proves correctes`);
  return results;
}
