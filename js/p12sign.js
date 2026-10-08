// Signatura PAdES (adbe.pkcs7.detached, SHA-256, perfil B-B) al navegador amb un certificat .p12/.pfx.
// Usa node-forge per llegir el PKCS#12 i construir el CMS, i WebCrypto per signar (RSA).
import { bytesToBase64 } from './util.js';

const F = () => window.forge;
const L = () => window.PDFLib;

const SIG_BYTES = 12000;                         // espai reservat per al CMS
const BR_PLACEHOLDER = '1000000000';

// ---------------- lectura del PKCS#12 ----------------
export function readP12(p12Bytes, password) {
  const forge = F();
  const bin = forge.util.binary.raw.encode(p12Bytes);
  let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), password); }
  catch (e) { throw new Error(/mac|password|invalid/i.test(String(e.message)) ? 'Contrasenya del certificat incorrecta' : 'No s\'ha pogut llegir el certificat: ' + e.message); }
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!keyBags.length || !certBags.length) throw new Error('El fitxer no conté clau privada i certificat');
  const key = keyBags[0].key;
  if (!key.n) throw new Error('Només es admeten certificats amb clau RSA');
  const certs = certBags.map((b) => b.cert);
  // el certificat del signant és el que té la mateixa clau pública
  const mod = key.n.toString(16);
  const signer = certs.find((c) => c.publicKey?.n && c.publicKey.n.toString(16) === mod) || certs[0];
  const chain = [signer];
  // afegeix la cadena d'emissors disponible
  let cur = signer;
  for (let i = 0; i < 6; i++) {
    const issuer = certs.find((c) => c !== cur && c.subject.hash === cur.issuer.hash && !chain.includes(c));
    if (!issuer) break;
    chain.push(issuer); cur = issuer;
  }
  return { key, cert: signer, chain };
}

export function certSummary(cert) {
  const get = (n, a) => a.getField(n)?.value || '';
  const cn = get('CN', cert.subject);
  return { cn, subject: cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', '), issuer: get('CN', cert.issuer), notAfter: cert.validity.notAfter };
}

async function importSigningKey(key) {
  const forge = F();
  const pk8 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key));
  const der = forge.asn1.toDer(pk8).getBytes();
  const buf = Uint8Array.from(der, (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', buf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// ---------------- CMS ----------------
function buildCms(digest, signerCert, chain, signFn) {
  const forge = F(); const asn1 = forge.asn1; const oids = forge.pki.oids;
  const A = (cls, type, constructed, value) => asn1.create(cls, type, constructed, value);
  const U = asn1.Class.UNIVERSAL, C = asn1.Class.CONTEXT_SPECIFIC;
  const oid = (s) => A(U, asn1.Type.OID, false, asn1.oidToDer(s).getBytes());
  const seq = (...v) => A(U, asn1.Type.SEQUENCE, true, v);
  const set = (...v) => A(U, asn1.Type.SET, true, v);
  const octet = (bytes) => A(U, asn1.Type.OCTETSTRING, false, bytes);
  const algSha256 = () => seq(oid(oids.sha256), A(U, asn1.Type.NULL, false, ''));
  const certDer = (c) => asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes();

  const sha256 = (bytes) => { const md = forge.md.sha256.create(); md.update(bytes); return md.digest().getBytes(); };
  const signerDer = certDer(signerCert);
  const issuerAsn1 = forge.pki.distinguishedNameToAsn1(signerCert.issuer);
  const serialAsn1 = A(U, asn1.Type.INTEGER, false, forge.util.hexToBytes(signerCert.serialNumber.length % 2 ? '0' + signerCert.serialNumber : signerCert.serialNumber));

  // ESS signing-certificate-v2 (obligatori en PAdES-B-B)
  const essCertId = seq(
    octet(sha256(signerDer)),
    seq(seq(A(C, 4, true, [issuerAsn1])), serialAsn1),
  );
  const signingCertV2 = seq(seq(essCertId));
  const attr = (typeOid, value) => seq(oid(typeOid), set(value));
  const now = new Date();
  const attrs = [
    attr(oids.contentType, oid(oids.data)),
    attr(oids.signingTime, A(U, asn1.Type.UTCTIME, false, asn1.dateToUtcTime(now))),
    attr(oids.messageDigest, octet(digest)),
    attr('1.2.840.113549.1.9.16.2.47', signingCertV2),
  ];
  const attrsSet = set(...attrs); // per signar es codifica com SET
  const toSign = asn1.toDer(attrsSet).getBytes();

  return { toSign, finish: (signatureBytes) => {
    const signedAttrsImplicit = A(C, 0, true, attrs);
    const signerInfo = seq(
      A(U, asn1.Type.INTEGER, false, String.fromCharCode(1)),
      seq(issuerAsn1, serialAsn1),
      algSha256(),
      signedAttrsImplicit,
      seq(oid(oids.rsaEncryption), A(U, asn1.Type.NULL, false, '')),
      octet(signatureBytes),
    );
    const certsImplicit = A(C, 0, true, chain.map((c) => asn1.fromDer(certDer(c))));
    const signedData = seq(
      A(U, asn1.Type.INTEGER, false, String.fromCharCode(1)),
      set(algSha256()),
      seq(oid(oids.data)),
      certsImplicit,
      set(signerInfo),
    );
    const contentInfo = seq(oid(oids.signedData), A(C, 0, true, [signedData]));
    return asn1.toDer(contentInfo).getBytes();
  } };
}

// ---------------- PDF ----------------
const dateStr = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

function findBytes(buf, str, from = 0) {
  const n = str.length;
  outer: for (let i = from; i <= buf.length - n; i++) {
    for (let j = 0; j < n; j++) if (buf[i + j] !== str.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

const asciiSafe = (s) => s.normalize('NFC').replace(/[^\x20-\x7e -ÿ]/g, '?');

/**
 * @param pdfBytes PDF ja generat amb totes les edicions
 * @param p12 { key, cert, chain } de readP12
 * @param opts { visible: {pageIndex, x, y, w, h}|null  (x,y = cantonada superior esquerra en punts de la pàgina sense rotar, relatiu al cropbox), reason, location, contact, view:[x0,y0,x1,y1] }
 */
export async function signPdfWithP12(pdfBytes, p12, opts = {}) {
  const { PDFDocument, PDFName, PDFNumber, PDFString, PDFHexString, PDFArray, StandardFonts } = L();
  const forge = F();
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const ctx = doc.context;
  const sum = certSummary(p12.cert);
  const now = new Date();

  // diccionari de signatura amb marcadors de posició
  const sigDict = ctx.obj({
    Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, PDFNumber.of(+BR_PLACEHOLDER), PDFNumber.of(+BR_PLACEHOLDER), PDFNumber.of(+BR_PLACEHOLDER)],
    Contents: PDFHexString.of('0'.repeat(SIG_BYTES * 2)),
    M: PDFString.of(dateStr(now)),
  });
  sigDict.set(PDFName.of('Name'), PDFString.of(asciiSafe(sum.cn)));
  if (opts.reason) sigDict.set(PDFName.of('Reason'), PDFString.of(asciiSafe(opts.reason)));
  if (opts.location) sigDict.set(PDFName.of('Location'), PDFString.of(asciiSafe(opts.location)));
  if (opts.contact) sigDict.set(PDFName.of('ContactInfo'), PDFString.of(asciiSafe(opts.contact)));
  const sigRef = ctx.register(sigDict);

  const pages = doc.getPages();
  const vis = opts.visible;
  const pgIndex = vis ? Math.min(vis.pageIndex, pages.length - 1) : 0;
  const page = pages[pgIndex];
  const view = opts.view || [0, 0, page.getWidth(), page.getHeight()];
  let rect = [0, 0, 0, 0];
  const widget = { Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of(`Signature${Date.now().toString(36)}`), F: 132, V: sigRef, P: page.ref };
  if (vis && vis.w > 1 && vis.h > 1) {
    const x0 = view[0] + vis.x, y1 = view[3] - vis.y;
    rect = [x0, y1 - vis.h, x0 + vis.w, y1];
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const lines = (vis.lines && vis.lines.length ? vis.lines : [`Firmado digitalmente por ${sum.cn}`, `Fecha: ${now.toLocaleString('es-ES')}`]).map(asciiSafe);
    let size = Math.min(10, vis.h / (lines.length + 0.6), 12);
    const maxW = Math.max(...lines.map((l) => helv.widthOfTextAtSize(l, size)));
    if (maxW > vis.w - 6) size = Math.max(4, size * (vis.w - 6) / maxW);
    let content = `q 1 g 0 0 ${vis.w} ${vis.h} re f 0.55 G 0.5 w 0.25 0.25 ${vis.w - 0.5} ${vis.h - 0.5} re S Q\nBT 0.1 0.1 0.3 rg /F1 ${size.toFixed(2)} Tf\n`;
    lines.forEach((l, i) => { content += `1 0 0 1 3 ${(vis.h - size * 1.2 * (i + 1)).toFixed(2)} Tm ${helv.encodeText(l).toString()} Tj\n`; });
    content += 'ET';
    const ap = ctx.stream(content, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, vis.w, vis.h], Resources: { Font: { F1: helv.ref } } });
    widget.AP = { N: ctx.register(ap) };
  }
  widget.Rect = rect;
  const widgetRef = ctx.register(ctx.obj(widget));
  page.node.addAnnot(widgetRef);
  const form = doc.getForm();
  form.acroForm.addField(widgetRef);
  form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));

  const out = await doc.save({ useObjectStreams: false });

  // localitza els marcadors i omple el ByteRange
  const brText = `/ByteRange [ 0 ${BR_PLACEHOLDER} ${BR_PLACEHOLDER} ${BR_PLACEHOLDER} ]`;
  const brPos = findBytes(out, brText);
  if (brPos < 0) throw new Error('No s\'ha trobat el ByteRange (format inesperat de pdf-lib)');
  const cPos = findBytes(out, '/Contents <', brPos);
  const open = cPos + '/Contents '.length;       // posició de '<'
  const close = open + 1 + SIG_BYTES * 2;         // posició de '>'
  if (out[close] !== 0x3e) throw new Error('Marcador de signatura incorrecte');
  const br = [0, open, close + 1, out.length - (close + 1)];
  let brNew = `/ByteRange [ ${br.join(' ')} ]`;
  if (brNew.length > brText.length) throw new Error('ByteRange massa llarg');
  brNew = brNew.padEnd(brText.length, ' ');
  for (let i = 0; i < brNew.length; i++) out[brPos + i] = brNew.charCodeAt(i);

  // hash dels dos fragments
  const part = new Uint8Array(br[1] + br[3]);
  part.set(out.subarray(0, br[1]), 0); part.set(out.subarray(br[2]), br[1]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', part));
  const digestBin = String.fromCharCode(...digest);

  const cms = buildCms(digestBin, p12.cert, p12.chain);
  const cryptoKey = await importSigningKey(p12.key);
  const toSignBytes = Uint8Array.from(cms.toSign, (c) => c.charCodeAt(0));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, toSignBytes));
  const cmsDer = cms.finish(String.fromCharCode(...sig));
  const hex = forge.util.bytesToHex(cmsDer);
  if (hex.length > SIG_BYTES * 2) throw new Error('La signatura no cap a l\'espai reservat (cadena de certificats massa gran)');
  const padded = hex.padEnd(SIG_BYTES * 2, '0');
  for (let i = 0; i < padded.length; i++) out[open + 1 + i] = padded.charCodeAt(i);
  return out;
}
