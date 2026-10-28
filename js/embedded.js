// Fitxers adjunts del document (arbre de noms /EmbeddedFiles del catàleg) amb pdf-lib.
// Sense dependències del navegador ni de pdf.js: es prova amb node (tests/run-tests.mjs).
const L = () => window.PDFLib;
const N = (s) => L().PDFName.of(s);
const text = (o) => (o?.decodeText ? o.decodeText() : o == null ? '' : String(o));

// Fulles de l'arbre de noms, en ordre: [[clau, valor (normalment la referència al Filespec)]]
function leaves(node, out = [], depth = 0) {
  const { PDFDict, PDFArray } = L();
  if (!(node instanceof PDFDict) || depth > 32) return out;
  const names = node.lookup(N('Names'));
  if (names instanceof PDFArray) for (let i = 0; i + 1 < names.size(); i += 2) out.push([text(names.lookup(i)), names.get(i + 1)]);
  const kids = node.lookup(N('Kids'));
  if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) leaves(kids.lookup(i), out, depth + 1);
  return out;
}

export function embeddedFiles(doc) {
  const { PDFDict, PDFStream } = L();
  const names = doc.catalog.lookup(N('Names'));
  const tree = names instanceof PDFDict ? names.lookup(N('EmbeddedFiles')) : null;
  return leaves(tree).map(([key, v]) => {
    const fs = doc.context.lookup(v);
    const ef = fs instanceof PDFDict ? fs.lookup(N('EF')) : null;
    const st = ef instanceof PDFDict ? ef.lookup(N('UF')) || ef.lookup(N('F')) : null;
    return {
      key,
      name: fs instanceof PDFDict ? text(fs.lookup(N('UF')) || fs.lookup(N('F'))) || key : key,
      desc: fs instanceof PDFDict ? text(fs.lookup(N('Desc'))) : '',
      bytes: st instanceof PDFStream ? L().decodePDFRawStream(st).decode() : null,
    };
  });
}

// Reescriu els adjunts: conserva (tal qual) els originals amb clau a `keep` i n'afegeix de nous.
// add: [{ name, desc, mime, bytes }]
export function setEmbeddedFiles(doc, { keep = new Set(), add = [] }) {
  const { PDFDict, PDFArray, PDFHexString, PDFString } = L();
  const ctx = doc.context, cat = doc.catalog;
  let names = cat.lookup(N('Names'));
  const tree = names instanceof PDFDict ? names.lookup(N('EmbeddedFiles')) : null;
  const old = leaves(tree);
  const kept = old.filter(([k]) => keep.has(k));
  const gone = new Set(old.filter(([k]) => !keep.has(k)).map(([, v]) => v));

  const used = new Set(kept.map(([k]) => k));
  const fresh = add.map((a) => {
    let key = a.name, n = 1;
    while (used.has(key)) key = `${a.name} (${++n})`; // les claus de l'arbre han de ser úniques
    used.add(key);
    const now = PDFString.fromDate(new Date());
    const st = ctx.flateStream(a.bytes, {
      Type: 'EmbeddedFile', ...(a.mime ? { Subtype: a.mime } : {}),
      Params: { Size: a.bytes.length, CreationDate: now, ModDate: now },
    });
    const efRef = ctx.register(st);
    const fs = ctx.obj({ Type: 'Filespec', F: PDFHexString.fromText(a.name), UF: PDFHexString.fromText(a.name), EF: { F: efRef, UF: efRef }, AFRelationship: 'Unspecified' });
    if (a.desc) fs.set(N('Desc'), PDFHexString.fromText(a.desc));
    return [key, ctx.register(fs)];
  });

  const all = [...kept.map(([k, v]) => [k, v]), ...fresh].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (all.length) {
    if (!(names instanceof PDFDict)) { names = ctx.obj({}); cat.set(N('Names'), names); }
    const arr = ctx.obj([]);
    for (const [k, v] of all) { arr.push(PDFHexString.fromText(k)); arr.push(v); }
    names.set(N('EmbeddedFiles'), ctx.register(ctx.obj({ Names: arr })));
  } else if (names instanceof PDFDict) {
    names.delete(N('EmbeddedFiles'));
    if (!names.keys().length) cat.delete(N('Names'));
  }

  // PDF/A-3 i similars: els adjunts també es referencien a /AF del catàleg
  const af = cat.lookup(N('AF'));
  if (af instanceof PDFArray) {
    for (let i = af.size() - 1; i >= 0; i--) if (gone.has(af.get(i))) af.remove(i);
    for (const [, ref] of fresh) af.push(ref);
  }
}
