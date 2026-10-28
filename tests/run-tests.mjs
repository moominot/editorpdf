// Proves automàtiques sense navegador: node tests/run-tests.mjs
// (les proves de la interfície es fan al navegador; vegeu tests/e2e.js)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const require = createRequire(import.meta.url);
globalThis.forge = require('../vendor/forge/forge.min.js');
globalThis.PDFLib = require('../vendor/pdflib/pdf-lib.min.js');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { failed++; console.log('  ✘', name, '\n   ', e.stack?.split('\n').slice(0, 4).join('\n    ')); }
};

// ---------------------------------------------------------------- parseRange
const { parseRange, bytesToBase64, base64ToBytes } = await import('../js/util.js');
console.log('parseRange');
await test('buit = totes', () => assert.deepEqual(parseRange('', 3), [0, 1, 2]));
await test('rangs i valors', () => assert.deepEqual(parseRange('1-2, 5, 7-', 8), [0, 1, 4, 6, 7]));
await test('ignora fora de rang', () => assert.deepEqual(parseRange('0,9,2', 4), [1]));

// ---------------------------------------------------------------- flux de contingut
const { stripFromContent, analyzeContent } = await import('../js/contentstream.js');
console.log('contentstream');
const box = (x0, y0, x1, y1) => [{ x0, y0, x1, y1 }];
await test('elimina Tj dins del quadre i manté la resta', () => {
  const s = 'BT /F1 12 Tf 50 700 Td (Hola) Tj 0 -20 Td (Adeu) Tj ET';
  const r = stripFromContent(s, box(40, 690, 200, 715));
  assert.equal(r.count, 1);
  assert.ok(!r.text.includes('(Hola)') && r.text.includes('(Adeu) Tj'));
});
await test('respecta cm i q/Q', () => {
  const s = 'q 1 0 0 1 100 100 cm BT /F1 10 Tf 0 0 Td (A) Tj ET Q BT /F1 10 Tf 10 10 Td (B) Tj ET';
  const r = stripFromContent(s, box(95, 95, 110, 110));
  assert.ok(!r.text.includes('(A)') && r.text.includes('(B)'));
});
await test('TJ amb matriu Tm', () => {
  const s = 'BT /F1 10 Tf 1 0 0 1 72 600 Tm [(Ho) -20 (la)] TJ ET';
  const r = stripFromContent(s, box(70, 595, 120, 615));
  assert.equal(r.count, 1); assert.ok(!r.text.includes('TJ'));
});
await test('continuació sense reposicionar: es conserva l\'avanç (3 Tr)', () => {
  const s = 'BT /F1 10 Tf 50 500 Td (Un) Tj (Dos) Tj ET';
  const r = stripFromContent(s, box(40, 490, 60, 520));
  assert.ok(r.text.includes('3 Tr (Un) Tj 0 Tr') && r.text.includes('(Dos) Tj'));
});
await test('no es confon amb parèntesis dins de cadenes ni amb imatges en línia', () => {
  const s = 'BT 50 300 Td (a \\) b (c)) Tj ET q BI /W 1 /H 1 /BPC 8 /CS /G ID \u0001 EI Q BT 50 200 Td (X) Tj ET';
  const { shows } = analyzeContent(s);
  assert.equal(shows.length, 2);
});

// ---------------------------------------------------------------- servidor intermedi (bucle complet)
console.log('AutoFirma mòbil (client + servidor + app simulats)');
await test('signViaRelay: cicle de pujada, signatura simulada i recuperació', async () => {
  const store = new Map();
  const log = [];
  const parseBody = (b) => { const p = {}; for (const part of String(b || '').split('&')) { const i = part.indexOf('='); if (i > 0) p[part.slice(0, i)] = part.slice(i + 1); } return p; };
  // servidor simulat amb la mateixa semàntica que server/relay.py
  const serve = (url, init = {}) => {
    const u = new URL(url); const p = { ...Object.fromEntries(u.searchParams), ...parseBody(init.body) };
    if (p.op === 'check') return 'OK\n';
    if (p.op === 'put') { store.set(p.id, decodeURIComponent(p.dat)); return 'OK'; }
    if (p.op === 'get') { const v = store.get(p.id); if (v == null) return 'ERR-06:=El identificador para los datos es inválido\n'; store.delete(p.id); return v + '\n'; }
    return 'ERR-01:=x';
  };
  globalThis.fetch = async (url, init) => { const t = serve(url, init); return { ok: true, status: 200, text: async () => t }; };

  // "app" AutoFirma simulada: s'activa quan el client obre afirma://sign?...
  const fromUrlSafe = (s) => s.replace(/-/g, '+').replace(/_/g, '/');
  const appHandle = async (url) => {
    const { desDecrypt, desEncrypt } = await import('../js/autofirma.js');
    const q = new URL(url.replace(/^intent:/, 'afirma:').split('#Intent')[0]).searchParams;
    // L'app AutoFirma 1.9.3 d'Android rebutja el paràmetre 'cipher' (AA600006): només DES amb la clau 'key'
    assert.equal(q.get('cipher'), null);
    const raw = store.get(q.get('fileid'));
    const xml = new TextDecoder().decode(desDecrypt(q.get('key'), raw));
    store.delete(q.get('fileid'));
    const kv = {}; for (const m of xml.matchAll(/<e k="([^"]+)" v="([^"]*)"\/>/g)) kv[m[1]] = decodeURIComponent(m[2].replace(/\+/g, ' ')); // com java.net.URLDecoder
    assert.equal(kv.cipher, undefined);
    assert.equal(kv.op, 'sign'); assert.equal(kv.format, 'PAdES'); assert.equal(kv.id, q.get('rid'));
    assert.equal(atob(kv.properties).split('\n').find((l) => l.startsWith('signReason=')), 'signReason=Prova');
    const pdf = base64ToBytes(fromUrlSafe(kv.dat));
    const signed = new Uint8Array([...pdf, ...new TextEncoder().encode('%%SIGNED')]);
    const cert = new Uint8Array([1, 2, 3, 4]);
    // com CipherDataManager.cipherData de l'app: "N.base64url" per a cada part, separades per '|'
    store.set(q.get('rid'), desEncrypt(q.get('key'), cert) + '|' + desEncrypt(q.get('key'), signed));
    log.push('app done');
  };
  let launched;
  globalThis.document = { set location(u) { launched = appHandle(u); }, get visibilityState() { return 'visible'; }, addEventListener() {}, removeEventListener() {} };
  globalThis.location = { hostname: 'prova.test' };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla Chrome' }, configurable: true });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...a) => realSetTimeout(f, Math.min(ms || 0, 10), ...a); // accelera les esperes
  try {
    const af = await import('../js/autofirma.js');
    const pdf = new Uint8Array(readFileSync('tests/pdfs/multipagina.pdf'));
    const res = await af.signViaRelay(pdf, { signReason: 'Prova', signaturePage: '1' }, 'https://relay.test', {});
    await launched;
    assert.equal(res.signed.length, pdf.length + 8);
    assert.equal(new TextDecoder().decode(res.signed.slice(-8)), '%%SIGNED');
    assert.equal(res.certB64, 'AQIDBA==');
  } finally { globalThis.setTimeout = realSetTimeout; }
});

// ---------------------------------------------------------------- signatura p12
console.log('PAdES amb .p12');
await test('signatura vàlida (hash, atributs signats i RSA)', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['tests/verify-p12.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /messageDigest coincideix: true/);
  assert.match(r.stdout, /signatura RSA vàlida: true/);
});
await test('llegeix p12 modern (AES/SHA-256) i antic (3DES/SHA-1)', async () => {
  const { readP12 } = await import('../js/p12sign.js');
  assert.ok(readP12(new Uint8Array(readFileSync('tests/test.p12')), '1234').cert);
  assert.throws(() => readP12(new Uint8Array(readFileSync('tests/test.p12')), 'mala'), /Contrasenya/);
});

console.log('Llistat de signatures');
await test('llegeix i comprova una signatura pròpia; detecta alteracions', async () => {
  const { readP12, signPdfWithP12 } = await import('../js/p12sign.js');
  const { listSignatures } = await import('../js/signatures.js');
  const p12 = readP12(new Uint8Array(readFileSync('tests/test.p12')), '1234');
  const signed = await signPdfWithP12(new Uint8Array(readFileSync('tests/pdfs/multipagina.pdf')), p12, { reason: 'Motiu prova', location: 'Palma' });
  const l = await listSignatures(signed);
  assert.equal(l.length, 1); assert.equal(l[0].integrity, 'ok'); assert.equal(l[0].signer, 'TONI LLULL PROVA');
  assert.equal(l[0].reason, 'Motiu prova'); assert.equal(l[0].location, 'Palma'); assert.equal(l[0].coversAll, true);
  const bad = signed.slice(); bad[200] ^= 0xff;
  assert.equal((await listSignatures(bad))[0].integrity, 'bad');
});

// ---------------------------------------------------------------- fitxers adjunts
console.log('Fitxers adjunts');
{
  const { embeddedFiles, setEmbeddedFiles } = await import('../js/embedded.js');
  const { PDFDocument, PDFName, PDFArray } = PDFLib;
  const src = readFileSync(new URL('./pdfs/adjunts.pdf', import.meta.url));
  const roundTrip = async (doc) => PDFDocument.load(await doc.save());
  await test('llegeix els adjunts existents', async () => {
    const l = embeddedFiles(await PDFDocument.load(src));
    assert.deepEqual(l.map((a) => a.name), ['annex-multipagina.pdf', 'notes.txt']);
    assert.equal(l[1].desc, 'Notes');
    assert.equal(new TextDecoder().decode(l[1].bytes), 'Hola, adjunt de prova àèòç\n');
  });
  await test('elimina un i n\'afegeix un altre amb nom repetit i accents', async () => {
    const doc = await PDFDocument.load(src);
    setEmbeddedFiles(doc, { keep: new Set(['notes.txt']), add: [{ name: 'notes.txt', desc: 'Còpia', mime: 'text/plain', bytes: new Uint8Array([1, 2, 3]) }, { name: 'pressupost ñ.bc3', bytes: new Uint8Array([9]) }] });
    const l = embeddedFiles(await roundTrip(doc));
    assert.deepEqual(l.map((a) => a.key), ['notes.txt', 'notes.txt (2)', 'pressupost ñ.bc3']);
    assert.equal(l[1].name, 'notes.txt'); assert.equal(l[1].desc, 'Còpia'); assert.deepEqual([...l[1].bytes], [1, 2, 3]);
  });
  await test('sense adjunts desapareix /Names i /AF es manté coherent', async () => {
    const doc = await PDFDocument.load(src);
    const refs = embeddedFiles(doc).length;
    doc.catalog.set(PDFName.of('AF'), doc.context.obj(doc.catalog.lookup(PDFName.of('Names')).lookup(PDFName.of('EmbeddedFiles')).lookup(PDFName.of('Names')).asArray().filter((_, i) => i % 2)));
    assert.equal(doc.catalog.lookup(PDFName.of('AF')).size(), refs);
    setEmbeddedFiles(doc, { keep: new Set(), add: [] });
    const out = await roundTrip(doc);
    assert.equal(embeddedFiles(out).length, 0);
    assert.equal(out.catalog.lookup(PDFName.of('Names')), undefined);
    assert.ok(out.catalog.lookup(PDFName.of('AF')) instanceof PDFArray && out.catalog.lookup(PDFName.of('AF')).size() === 0);
  });
}

// ---------------------------------------------------------------- marcadors i capes
console.log('Marcadors i capes');
{
  const { writeOutline, readOutline, setLayerDefaults } = await import('../js/pdfstruct.js');
  const { PDFDocument, PDFName } = PDFLib;
  const src = readFileSync(new URL('./pdfs/capes-marcadors.pdf', import.meta.url));
  await test('reescriu marcadors niats amb accents, enllaços i /Count', async () => {
    const doc = await PDFDocument.load(src);
    const [p0, , p2] = doc.getPages().map((p) => p.ref);
    writeOutline(doc, [
      { title: 'Seccions ñ', page: p2, top: 500, open: false, items: [{ title: 'Detall', page: p0, top: 100, items: [] }, { title: 'Web', url: 'https://example.com', items: [] }] },
      { title: 'Sense pàgina', page: null, items: [] },
    ]);
    const out = await PDFDocument.load(await doc.save());
    assert.deepEqual(readOutline(out), [
      { title: 'Seccions ñ', page: 2, top: 500, url: null, items: [{ title: 'Detall', page: 0, top: 100, url: null, items: [] }, { title: 'Web', page: null, top: null, url: 'https://example.com', items: [] }] },
      { title: 'Sense pàgina', page: null, top: null, url: null, items: [] },
    ]);
    const root = out.catalog.lookup(PDFName.of('Outlines'));
    assert.equal(root.lookup(PDFName.of('Count')).asNumber(), 2); // el primer és tancat: els fills no compten
    assert.equal(root.lookup(PDFName.of('First')).lookup(PDFName.of('Count')).asNumber(), -2);
  });
  await test('sense marcadors desapareix /Outlines', async () => {
    const doc = await PDFDocument.load(src);
    writeOutline(doc, []);
    assert.equal((await PDFDocument.load(await doc.save())).catalog.lookup(PDFName.of('Outlines')), undefined);
  });
  await test('desa la visibilitat inicial de les capes', async () => {
    const doc = await PDFDocument.load(src);
    const D = () => doc.catalog.lookup(PDFName.of('OCProperties')).lookup(PDFName.of('D'));
    const ids = (k) => D().lookup(PDFName.of(k)).asArray().map((r) => `${r.objectNumber}R`);
    const [cotes, mob] = ids('ON').concat(ids('OFF')).sort((a, b) => parseInt(a) - parseInt(b));
    setLayerDefaults(doc, { [cotes]: false, [mob]: true });
    assert.ok(ids('OFF').includes(cotes) && !ids('ON').includes(cotes));
    assert.ok(ids('ON').includes(mob) && !ids('OFF').includes(mob));
  });
}

console.log(`\n${passed} correctes, ${failed} fallides`);
process.exit(failed ? 1 : 0);
