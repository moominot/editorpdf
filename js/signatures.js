// Lectura i comprovació de les signatures digitals existents en un PDF (PAdES / adbe.pkcs7.detached).
// Comprova la integritat (hash del document i signatura RSA); NO valida la cadena de confiança ni la revocació.
const F = () => window.forge;

function find(bytes, str, from = 0) {
  const n = str.length;
  outer: for (let i = from; i <= bytes.length - n; i++) {
    for (let j = 0; j < n; j++) if (bytes[i + j] !== str.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}
const latin1 = (b, s, e) => { let o = ''; for (let i = s; i < e; i++) o += String.fromCharCode(b[i]); return o; };

function pdfString(s) {
  if (s.startsWith('<')) { // hexadecimal
    const hex = s.slice(1, -1).replace(/\s+/g, ''); const by = []; for (let i = 0; i < hex.length; i += 2) by.push(parseInt(hex.substr(i, 2).padEnd(2, '0'), 16));
    return decodeBytes(by);
  }
  const body = s.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, g) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[g] ?? String.fromCharCode(parseInt(g, 8))));
  return decodeBytes([...body].map((c) => c.charCodeAt(0) & 255));
}
function decodeBytes(by) {
  if (by[0] === 0xfe && by[1] === 0xff) { let o = ''; for (let i = 2; i + 1 < by.length; i += 2) o += String.fromCharCode((by[i] << 8) | by[i + 1]); return o; }
  if (by[0] === 0xef && by[1] === 0xbb && by[2] === 0xbf) return new TextDecoder().decode(Uint8Array.from(by.slice(3)));
  return String.fromCharCode(...by);
}
function pdfDate(s) {
  const m = /D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?([Zz+-])?(\d\d)?'?(\d\d)?/.exec(s || ''); if (!m) return null;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', sg, th = '00', tm = '00'] = m;
  let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (sg === '+') t -= (+th * 60 + +tm) * 60000; else if (sg === '-') t += (+th * 60 + +tm) * 60000;
  return new Date(t);
}
function dictValue(win, key) {
  const m = new RegExp('/' + key + '\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>)').exec(win);
  return m ? pdfString(m[1]) : null;
}
const nameOf = (attrs) => {
  const g = (n) => attrs.getField(n)?.value;
  return g('CN') || [g('GN'), g('SN')].filter(Boolean).join(' ') || g('O') || attrs.attributes.map((a) => a.value).join(', ');
};
const DIGESTS = { '1.3.14.3.2.26': ['SHA-1', 'sha1'], '2.16.840.1.101.3.4.2.1': ['SHA-256', 'sha256'], '2.16.840.1.101.3.4.2.2': ['SHA-384', 'sha384'], '2.16.840.1.101.3.4.2.3': ['SHA-512', 'sha512'] };

export async function listSignatures(bytes) {
  const forge = F(); const asn1 = forge.asn1; const out = [];
  let pos = 0, idx = 0;
  while ((pos = find(bytes, '/ByteRange', pos)) >= 0) {
    const here = pos; pos += 10;
    const m = /\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(latin1(bytes, here, Math.min(bytes.length, here + 120)));
    if (!m) continue;
    const br = m.slice(1).map(Number);
    if (br[0] !== 0 || br[1] <= 0 || br[2] + br[3] > bytes.length + 2 || bytes[br[1]] !== 0x3c) continue;
    const sig = { index: ++idx, byteRange: br };
    const win = latin1(bytes, Math.max(0, here - 1500), Math.min(bytes.length, br[1])) + ' ' + latin1(bytes, br[2], Math.min(bytes.length, br[2] + 1500));
    sig.reason = dictValue(win, 'Reason'); sig.location = dictValue(win, 'Location'); sig.contact = dictValue(win, 'ContactInfo');
    sig.fieldName = dictValue(win, 'Name'); sig.dictTime = pdfDate(dictValue(win, 'M'));
    sig.subFilter = (/\/SubFilter\s*\/([\w.]+)/.exec(win) || [])[1] || null;
    sig.coversAll = br[2] + br[3] >= bytes.length - 2;
    sig.integrity = 'unknown'; sig.problems = [];
    try {
      const hex = latin1(bytes, br[1] + 1, br[2] - 1).replace(/\s+/g, '');
      let der = forge.util.hexToBytes(hex.length % 2 ? hex + '0' : hex);
      const root = asn1.fromDer(der, { strict: false, parseAllBytes: false });
      const msg = forge.pkcs7.messageFromAsn1(root);
      const cap = msg.rawCapture;
      const certs = msg.certificates || [];
      const serialHex = cap.serial ? forge.util.bytesToHex(cap.serial) : null;
      let cert = certs.find((c) => serialHex && c.serialNumber.replace(/^0+/, '') === serialHex.replace(/^0+/, '')) || certs[0];
      if (cert) {
        sig.signer = nameOf(cert.subject); sig.issuer = nameOf(cert.issuer);
        sig.subject = cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
        sig.serial = cert.serialNumber; sig.notBefore = cert.validity.notBefore; sig.notAfter = cert.validity.notAfter;
        sig.chain = certs.map((c) => nameOf(c.subject));
      }
      // atributs signats
      const attrs = cap.authenticatedAttributes || [];
      let mdAttr = null, signingTime = null;
      for (const a of attrs) {
        const oid = asn1.derToOid(a.value[0].value); const v = a.value[1].value[0];
        if (oid === forge.pki.oids.messageDigest) mdAttr = v.value;
        if (oid === forge.pki.oids.signingTime) signingTime = v.type === asn1.Type.UTCTIME ? asn1.utcTimeToDate(v.value) : asn1.generalizedTimeToDate(v.value);
      }
      sig.time = signingTime || sig.dictTime || null;
      const dOid = cap.digestAlgorithm ? asn1.derToOid(cap.digestAlgorithm) : null;
      const alg = DIGESTS[dOid];
      if (!alg) sig.problems.push('digestAlg'); else if (!mdAttr) sig.problems.push('noAttrs'); else {
        const part = new Uint8Array(br[1] + br[3]); part.set(bytes.subarray(0, br[1]), 0); part.set(bytes.subarray(br[2], br[2] + br[3]), br[1]);
        const h = String.fromCharCode(...new Uint8Array(await crypto.subtle.digest(alg[0], part)));
        const hashOk = h === mdAttr;
        let sigOk = null;
        if (cert?.publicKey?.verify) {
          const set = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrs);
          const md = forge.md[alg[1]].create(); md.update(asn1.toDer(set).getBytes());
          try { sigOk = cert.publicKey.verify(md.digest().getBytes(), cap.signature, 'RSASSA-PKCS1-V1_5'); } catch { sigOk = false; }
        }
        if (!hashOk) sig.problems.push('modified');
        if (sigOk === false) sig.problems.push('badSignature');
        sig.integrity = !hashOk || sigOk === false ? 'bad' : sigOk === true ? 'ok' : 'unknown';
        if (sigOk === null) sig.problems.push('noRsa');
      }
      if (cert && sig.time && (sig.time < cert.validity.notBefore || sig.time > cert.validity.notAfter)) sig.problems.push('certExpired');
    } catch (e) { sig.problems.push('unreadable'); sig.error = String(e.message || e); }
    out.push(sig);
  }
  return out;
}
