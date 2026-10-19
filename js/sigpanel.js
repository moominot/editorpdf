// Panell amb les signatures digitals existents del document obert
import { S, on } from './state.js';
import { el, $ } from './util.js';
import { t, addStrings, getLang } from './i18n.js';
import { modal } from './ui.js';
import { listSignatures } from './signatures.js';
import { validateSignature, validationAvailable } from './certvalidate.js';

addStrings({
  spTitle: ['Signatures del document', 'Firmas del documento', 'Document signatures'],
  spNone: ['Aquest PDF no conté signatures digitals.', 'Este PDF no contiene firmas digitales.', 'This PDF contains no digital signatures.'],
  spSigner: ['Signant', 'Firmante', 'Signer'],
  spIssuer: ['Emissor del certificat', 'Emisor del certificado', 'Certificate issuer'],
  spTime: ['Data de signatura', 'Fecha de firma', 'Signing time'],
  spReason: ['Motiu', 'Motivo', 'Reason'],
  spLocation: ['Lloc', 'Lugar', 'Location'],
  spValidity: ['Validesa del certificat', 'Validez del certificado', 'Certificate validity'],
  spFormat: ['Format', 'Formato', 'Format'],
  spOk: ['Integritat correcta: el document no s\'ha modificat des que es va signar.', 'Integridad correcta: el documento no se ha modificado desde que se firmó.', 'Integrity OK: the document has not been modified since signing.'],
  spOkPartial: ['Signatura intacta, però s\'han afegit canvis posteriors al document (revisions posteriors).', 'Firma intacta, pero se han añadido cambios posteriores al documento (revisiones posteriores).', 'Signature intact, but later changes were added to the document (later revisions).'],
  spBad: ['La signatura NO és vàlida: el contingut signat s\'ha alterat o la signatura és incorrecta.', 'La firma NO es válida: el contenido firmado se ha alterado o la firma es incorrecta.', 'The signature is NOT valid: the signed content was altered or the signature is wrong.'],
  spUnknown: ['No s\'ha pogut comprovar la integritat d\'aquesta signatura (format o algorisme no admès).', 'No se pudo comprobar la integridad de esta firma (formato o algoritmo no admitido).', 'Could not verify this signature\'s integrity (unsupported format or algorithm).'],
  spExpired: ['La data de signatura queda fora del període de validesa del certificat.', 'La fecha de firma queda fuera del periodo de validez del certificado.', 'The signing time is outside the certificate validity period.'],
  spTrust: ['Aquesta comprovació no valida la cadena de confiança ni la revocació del certificat. Per a una validació oficial fes servir AutoFirma o VALIDe.', 'Esta comprobación no valida la cadena de confianza ni la revocación del certificado. Para una validación oficial usa AutoFirma o VALIDe.', 'This check does not validate the trust chain or revocation. For an official validation use AutoFirma or VALIDe.'],
  spTrustOnline: ['La validació en línia comprova la cadena amb la llista de confiança oficial espanyola (TSL) i la revocació amb l\'OCSP de l\'emissor, consultat ara (no a la data de signatura). No substitueix un informe oficial de VALIDe.', 'La validación en línea comprueba la cadena con la lista de confianza oficial española (TSL) y la revocación con el OCSP del emisor, consultado ahora (no en la fecha de firma). No sustituye un informe oficial de VALIDe.', 'Online validation checks the chain against the official Spanish trusted list (TSL) and revocation via the issuer\'s OCSP, queried now (not at signing time). It does not replace an official VALIDe report.'],
  spOnline: ['Validació en línia', 'Validación en línea', 'Online validation'],
  spChecking: ['Comprovant la cadena de confiança i la revocació…', 'Comprobando la cadena de confianza y la revocación…', 'Checking trust chain and revocation…'],
  spChainOk: ['Cadena de confiança correcta: emès per {0}, autoritat de la llista de confiança oficial (TSL).', 'Cadena de confianza correcta: emitido por {0}, autoridad de la lista de confianza oficial (TSL).', 'Trust chain OK: issued by {0}, an authority on the official trusted list (TSL).'],
  spChainUntrusted: ['El certificat no l\'ha emès cap autoritat de la llista de confiança oficial (TSL).', 'El certificado no lo ha emitido ninguna autoridad de la lista de confianza oficial (TSL).', 'The certificate was not issued by any authority on the official trusted list (TSL).'],
  spChainInvalid: ['Cadena de certificats no vàlida: {0}', 'Cadena de certificados no válida: {0}', 'Invalid certificate chain: {0}'],
  spChainUnavail: ['El servidor encara no té la llista de confiança (TSL); torna-ho a provar d\'aquí a una estona.', 'El servidor aún no tiene la lista de confianza (TSL); inténtalo de nuevo en un rato.', 'The server does not have the trusted list (TSL) yet; try again later.'],
  spRevGood: ['No revocat (OCSP de {0}, consultat ara).', 'No revocado (OCSP de {0}, consultado ahora).', 'Not revoked (OCSP at {0}, queried now).'],
  spRevRevokedAfter: ['Certificat revocat el {0}{1}, després de la data de signatura: quan es va signar era vigent.', 'Certificado revocado el {0}{1}, después de la fecha de firma: cuando se firmó estaba vigente.', 'Certificate revoked on {0}{1}, after the signing time: it was valid when signed.'],
  spRevRevoked: ['CERTIFICAT REVOCAT el {0}{1}.', 'CERTIFICADO REVOCADO el {0}{1}.', 'CERTIFICATE REVOKED on {0}{1}.'],
  spRevUnknown: ['L\'emissor no reconeix aquest certificat (OCSP: desconegut).', 'El emisor no reconoce este certificado (OCSP: desconocido).', 'The issuer does not recognise this certificate (OCSP: unknown).'],
  spRevNoOcsp: ['El certificat no indica cap servei OCSP: no s\'ha pogut comprovar la revocació.', 'El certificado no indica ningún servicio OCSP: no se ha podido comprobar la revocación.', 'The certificate has no OCSP service: revocation could not be checked.'],
  spRevError: ['No s\'ha pogut comprovar la revocació: {0}', 'No se ha podido comprobar la revocación: {0}', 'Could not check revocation: {0}'],
  spOffline: ['No s\'ha pogut contactar amb el servidor de validació. Es mostra només la comprovació local.', 'No se ha podido contactar con el servidor de validación. Se muestra solo la comprobación local.', 'Could not reach the validation server. Only the local check is shown.'],
  spNoCerts: ['Aquesta signatura no inclou els certificats necessaris per validar-la en línia.', 'Esta firma no incluye los certificados necesarios para validarla en línea.', 'This signature does not include the certificates needed for online validation.'],
  spChip: ['{0} signatura(es)', '{0} firma(s)', '{0} signature(s)'],
  spWorking: ['Llegint signatures…', 'Leyendo firmas…', 'Reading signatures…'],
});

let cache = { id: null, list: null };
async function sigsOfMain() {
  const src = S.sources.get(S.mainId);
  if (!src) return [];
  if (cache.id !== src.id) cache = { id: src.id, list: await listSignatures(src.bytes) };
  return cache.list;
}
const fmt = (d) => (d ? new Date(d).toLocaleString(getLang() === 'ca' ? 'ca-ES' : getLang() === 'es' ? 'es-ES' : 'en-GB') : '—');

export async function showSignatures() {
  const body = el('div', {}, el('p', { class: 'muted', text: t('spWorking') }));
  const done = modal({ title: t('spTitle'), body, wide: true, buttons: [{ label: t('close'), value: true, primary: true }] });
  const list = await sigsOfMain();
  body.replaceChildren();
  if (!list.length) body.append(el('p', { text: t('spNone') }));
  list.forEach((s, i) => {
    const bad = s.integrity === 'bad', ok = s.integrity === 'ok';
    const partial = ok && !s.coversAll;
    const color = bad ? '#dc2626' : ok ? (partial ? '#d97706' : '#16a34a') : '#6b7280';
    const verdict = bad ? t('spBad') : ok ? (partial ? t('spOkPartial') : t('spOk')) : t('spUnknown');
    const row = (k, v) => v ? el('div', { class: 'kv' }, el('span', { class: 'muted', text: k }), el('span', { text: v })) : null;
    const online = validationAvailable() ? el('div', { class: 'sp-online' }) : null;
    body.append(el('div', { style: { border: '1px solid var(--line)', borderLeft: `5px solid ${color}`, borderRadius: '8px', padding: '10px 14px', margin: '10px 0' } },
      el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: `${i + 1}. ${s.signer || s.fieldName || '—'}` }),
      el('div', { style: { color, marginBottom: '6px' }, text: (bad ? '✘ ' : ok ? '✔ ' : '? ') + verdict }),
      s.problems.includes('certExpired') ? el('div', { style: { color: '#d97706' }, text: '⚠ ' + t('spExpired') }) : null,
      row(t('spSigner'), s.subject), row(t('spIssuer'), s.issuer), row(t('spTime'), fmt(s.time)),
      row(t('spReason'), s.reason), row(t('spLocation'), s.location),
      row(t('spValidity'), s.notBefore ? `${fmt(s.notBefore)} → ${fmt(s.notAfter)}` : null), row(t('spFormat'), s.subFilter),
      online));
    if (online) fillOnline(online, s); // no s'espera: el diàleg ja és usable i el resultat arriba quan arriba
  });
  if (list.length) body.append(el('p', { class: 'muted', text: validationAvailable() ? t('spTrustOnline') : t('spTrust') }));
  await done;
}

// Bloc "Validació en línia" d'una signatura; si el servidor falla o no respon, ho diu i no toca la resta
async function fillOnline(box, s) {
  const line = (cls, text) => el('div', { class: 'sp-line ' + cls, text });
  box.replaceChildren(el('div', { class: 'muted', style: { fontWeight: '600' }, text: t('spOnline') }), line('wait', '… ' + t('spChecking')));
  if (!s.certsB64?.length) { box.lastChild.replaceWith(line('warn', '? ' + t('spNoCerts'))); return; }
  let r;
  try { r = await validateSignature(s); } catch { box.lastChild.replaceWith(line('warn', '⚠ ' + t('spOffline'))); return; }
  const out = [];
  if (r.chain === 'ok') out.push(line('ok', '✔ ' + t('spChainOk', r.anchor || '—')));
  else if (r.chain === 'untrusted') out.push(line('bad', '✘ ' + t('spChainUntrusted')));
  else if (r.chain === 'unavailable') out.push(line('warn', '? ' + t('spChainUnavail')));
  else out.push(line('bad', '✘ ' + t('spChainInvalid', r.detail || '—')));
  if (r.chain === 'ok') {
    const why = r.reason ? ` (${r.reason})` : '';
    const at = r.revokedAt ? new Date(r.revokedAt) : null;
    const atTxt = at && !isNaN(at) ? fmt(at) : (r.revokedAt || '—');
    if (r.revocation === 'good') out.push(line('ok', '✔ ' + t('spRevGood', r.ocsp || 'OCSP')));
    else if (r.revocation === 'revoked' && at && !isNaN(at) && s.time && at > new Date(s.time)) out.push(line('warn', '⚠ ' + t('spRevRevokedAfter', atTxt, why)));
    else if (r.revocation === 'revoked') out.push(line('bad', '✘ ' + t('spRevRevoked', atTxt, why)));
    else if (r.revocation === 'unknown') out.push(line('bad', '✘ ' + t('spRevUnknown')));
    else if (r.revocation === 'no-ocsp') out.push(line('warn', '? ' + t('spRevNoOcsp')));
    else out.push(line('warn', '? ' + t('spRevError', r.detail || '—')));
  }
  box.lastChild.replaceWith(...out);
}

// Etiqueta a la barra d'estat
export async function refreshChip() {
  const chip = $('#st-sigs'); if (!chip) return;
  const src = S.sources.get(S.mainId);
  if (!src?.signed) { chip.hidden = true; return; }
  try {
    const list = await sigsOfMain();
    chip.hidden = !list.length;
    const bad = list.some((s) => s.integrity === 'bad');
    chip.textContent = (bad ? '⚠ ' : '🔏 ') + t('spChip', list.length);
    chip.style.color = bad ? '#dc2626' : '';
  } catch { chip.hidden = true; }
}
on('docLoaded', () => { cache = { id: null, list: null }; refreshChip(); });
