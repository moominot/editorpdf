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
  const aesKey = async (k) => crypto.subtle.importKey('raw', k, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
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
  const toUrlSafe = (s) => s.replace(/\+/g, '-').replace(/\//g, '_');
  const appHandle = async (url) => {
    const q = new URL(url.replace(/^intent:/, 'afirma:').split('#Intent')[0]).searchParams;
    const cfg = JSON.parse(atob(q.get('cipher')));
    const key = base64ToBytes(cfg.key), iv = base64ToBytes(cfg.iv);
    const enc = fromUrlSafe(store.get(q.get('fileid')));
    const xml = new TextDecoder().decode(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, await aesKey(key), base64ToBytes(enc))));
    store.delete(q.get('fileid'));
    const kv = {}; for (const m of xml.matchAll(/<e k="([^"]+)" v="([^"]*)"\/>/g)) kv[m[1]] = m[2];
    assert.equal(kv.op, 'sign'); assert.equal(kv.format, 'PAdES'); assert.equal(kv.id, q.get('rid'));
    assert.equal(atob(kv.properties).split('\n').find((l) => l.startsWith('signReason=')), 'signReason=Prova');
    const pdf = base64ToBytes(fromUrlSafe(kv.dat));
    const signed = new Uint8Array([...pdf, ...new TextEncoder().encode('%%SIGNED')]);
    const cert = new Uint8Array([1, 2, 3, 4]);
    const encOne = async (d) => toUrlSafe(bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, await aesKey(key), d))));
    store.set(q.get('rid'), (await encOne(cert)) + '|' + (await encOne(signed)));
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

console.log(`\n${passed} correctes, ${failed} fallides`);
process.exit(failed ? 1 : 0);
