// Signa un PDF amb p12sign.js (a Node) i verifica la signatura de manera independent. Ús: node tests/verify-p12.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
globalThis.window = globalThis; // el forge.min.js d'UMD espera `window`
const require = createRequire(import.meta.url);
const forge = require('../vendor/forge/forge.min.js');
const PDFLib = require('../vendor/pdflib/pdf-lib.min.js');
globalThis.forge = forge; globalThis.PDFLib = PDFLib;
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { readP12, signPdfWithP12 } = await import('../js/p12sign.js');

const p12 = readP12(new Uint8Array(readFileSync('tests/test.p12')), '1234');
const pdf = new Uint8Array(readFileSync('tests/pdfs/multipagina.pdf'));
const signed = await signPdfWithP12(pdf, p12, { visible: { pageIndex: 0, x: 300, y: 600, w: 220, h: 70 }, view: [0, 0, 595, 842], reason: 'Prova', location: 'Palma' });
writeFileSync('tests/out-signed.pdf', signed);

// --- verificació independent ---
const txt = Buffer.from(signed).toString('latin1');
const br = txt.match(/\/ByteRange \[ (\d+) (\d+) (\d+) (\d+) *\]/).slice(1).map(Number);
const cm = txt.match(/\/Contents <([0-9a-f]+)>/);
const sigHex = cm[1].replace(/(00)+$/, '');
const covered = Buffer.concat([Buffer.from(signed.subarray(br[0], br[0] + br[1])), Buffer.from(signed.subarray(br[2], br[2] + br[3]))]);
const digest = forge.md.sha256.create().update(covered.toString('binary')).digest().getBytes();

const der = forge.util.hexToBytes(sigHex.length % 2 ? sigHex + '0' : sigHex);
const asn1 = forge.asn1.fromDer(der, { strict: false });
const msg = forge.pkcs7.messageFromAsn1(asn1);
const si = msg.rawCapture;
// atributs signats
const attrsAsn1 = si.authenticatedAttributes;
const attrs = {};
for (const a of attrsAsn1) attrs[forge.asn1.derToOid(a.value[0].value)] = a.value[1].value[0];
const mdAttr = attrs[forge.pki.oids.messageDigest].value;
console.log('messageDigest coincideix:', mdAttr === digest);
console.log('signingCertificateV2 present:', !!attrs['1.2.840.113549.1.9.16.2.47']);
const setForSign = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrsAsn1);
const toSign = forge.asn1.toDer(setForSign).getBytes();
const cert = msg.certificates[0];
const md = forge.md.sha256.create(); md.update(toSign);
const ok = cert.publicKey.verify(md.digest().getBytes(), si.signature, 'RSASSA-PKCS1-V1_5');
console.log('signatura RSA vàlida:', ok);
console.log('certificats al CMS:', msg.certificates.length, '| ByteRange', br, '| total', signed.length, br[2] + br[3] === signed.length);
if (!ok || mdAttr !== digest) process.exit(1);
