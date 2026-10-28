// Estructures del document amb pdf-lib: marcadors (/Outlines) i estat inicial de les capes (/OCProperties /D).
// Sense dependències del navegador ni de pdf.js: es prova amb node (tests/run-tests.mjs).
const L = () => window.PDFLib;
const N = (s) => L().PDFName.of(s);

// items: [{ title, page (PDFRef|null), top (punts PDF|null), url, open, bold, italic, color:[r,g,b]|null, items:[...] }]
export function writeOutline(doc, items) {
  const { PDFHexString, PDFString, PDFNull, PDFNumber } = L();
  const ctx = doc.context, cat = doc.catalog;
  if (!items.length) { cat.delete(N('Outlines')); return; }
  // Escriu un nivell sota parent (diccionari ja creat); retorna el nombre de descendents visibles (/Count)
  const level = (list, parentRef, parent) => {
    const refs = list.map(() => ctx.nextRef());
    let visible = 0;
    list.forEach((it, i) => {
      const d = ctx.obj({ Title: PDFHexString.fromText(it.title || ''), Parent: parentRef });
      if (i > 0) d.set(N('Prev'), refs[i - 1]);
      if (i < list.length - 1) d.set(N('Next'), refs[i + 1]);
      if (it.page) d.set(N('Dest'), ctx.obj([it.page, N('XYZ'), PDFNull, it.top == null ? PDFNull : PDFNumber.of(Math.round(it.top * 100) / 100), PDFNull]));
      else if (it.url) d.set(N('A'), ctx.obj({ S: 'URI', URI: PDFString.of(it.url) }));
      const flags = (it.italic ? 1 : 0) | (it.bold ? 2 : 0);
      if (flags) d.set(N('F'), PDFNumber.of(flags));
      if (it.color?.length === 3 && it.color.some((c) => c)) d.set(N('C'), ctx.obj(it.color));
      if (it.items?.length) {
        const n = level(it.items, refs[i], d);
        d.set(N('Count'), PDFNumber.of(it.open ? n : -n));
        if (it.open) visible += n;
      }
      ctx.assign(refs[i], d);
      visible++;
    });
    parent.set(N('First'), refs[0]); parent.set(N('Last'), refs[refs.length - 1]);
    return visible;
  };
  const rootRef = ctx.nextRef(), root = ctx.obj({ Type: 'Outlines' });
  root.set(N('Count'), PDFNumber.of(level(items, rootRef, root)));
  ctx.assign(rootRef, root);
  cat.set(N('Outlines'), rootRef);
}

// Llegeix els marcadors (per a les proves): [{ title, page (índex), top, url, items }]
export function readOutline(doc) {
  const { PDFDict, PDFArray, PDFRef, PDFNumber } = L();
  const pages = doc.getPages().map((p) => p.ref);
  const root = doc.catalog.lookup(N('Outlines'));
  const walk = (node, depth = 0) => {
    const out = [];
    let cur = node instanceof PDFDict ? node.lookup(N('First')) : null, guard = 0;
    while (cur instanceof PDFDict && guard++ < 10000 && depth < 64) {
      const dest = cur.lookup(N('Dest')), a = cur.lookup(N('A'));
      const pg = dest instanceof PDFArray ? dest.get(0) : null, top = dest instanceof PDFArray ? dest.lookup(3) : null;
      out.push({
        title: cur.lookup(N('Title'))?.decodeText?.() ?? '',
        page: pg instanceof PDFRef ? pages.indexOf(pg) : null,
        top: top instanceof PDFNumber ? top.asNumber() : null,
        url: a instanceof PDFDict ? a.lookup(N('URI'))?.decodeText?.() ?? null : null,
        items: walk(cur, depth + 1),
      });
      cur = cur.lookup(N('Next'));
    }
    return out;
  };
  return walk(root);
}

// Visibilitat inicial de capes: state = { '12R': true, '15R': false, ... } (ids de pdf.js: número + 'R' [+ generació])
export function refOfOcId(id) {
  const m = /^(\d+)R(\d*)$/.exec(id);
  return m ? L().PDFRef.of(+m[1], m[2] ? +m[2] : 0) : null;
}
export function setLayerDefaults(doc, state) {
  const { PDFDict, PDFArray } = L();
  const ctx = doc.context;
  const ocp = doc.catalog.lookup(N('OCProperties'));
  if (!(ocp instanceof PDFDict)) return;
  let d = ocp.lookup(N('D'));
  if (!(d instanceof PDFDict)) { d = ctx.obj({}); ocp.set(N('D'), d); }
  const arr = (k) => { let a = d.lookup(N(k)); if (!(a instanceof PDFArray)) { a = ctx.obj([]); d.set(N(k), a); } return a; };
  const on = arr('ON'), off = arr('OFF');
  const drop = (a, ref) => { for (let i = a.size() - 1; i >= 0; i--) if (a.get(i) === ref) a.remove(i); };
  for (const [id, vis] of Object.entries(state)) {
    const ref = refOfOcId(id); if (!ref) continue;
    drop(on, ref); drop(off, ref);
    (vis ? on : off).push(ref);
  }
}
