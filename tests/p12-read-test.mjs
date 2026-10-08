// Comprova que readP12 llegeix PKCS#12 moderns (AES/SHA-256, OpenSSL 3) i antics (3DES/SHA-1)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
globalThis.window = globalThis;
const require = createRequire(import.meta.url);
globalThis.forge = require('../vendor/forge/forge.min.js');
globalThis.PDFLib = require('../vendor/pdflib/pdf-lib.min.js');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { readP12, certSummary } = await import('../js/p12sign.js');
for (const f of process.argv.slice(2)) {
  try { const p = readP12(new Uint8Array(readFileSync(f)), '1234'); console.log(f, 'OK ->', certSummary(p.cert).cn); }
  catch (e) { console.log(f, 'ERROR', e.message); process.exitCode = 1; }
}
