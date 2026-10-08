// Panell amb les signatures digitals existents del document obert
import { S, on } from './state.js';
import { el, $ } from './util.js';
import { t, addStrings, getLang } from './i18n.js';
import { modal } from './ui.js';
import { listSignatures } from './signatures.js';

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
    const row = (k, v) => v ? el('div', { style: { display: 'grid', gridTemplateColumns: '170px 1fr', gap: '8px', margin: '3px 0' } }, el('span', { class: 'muted', text: k }), el('span', { text: v })) : null;
    body.append(el('div', { style: { border: '1px solid var(--line)', borderLeft: `5px solid ${color}`, borderRadius: '8px', padding: '10px 14px', margin: '10px 0' } },
      el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: `${i + 1}. ${s.signer || s.fieldName || '—'}` }),
      el('div', { style: { color, marginBottom: '6px' }, text: (bad ? '✘ ' : ok ? '✔ ' : '? ') + verdict }),
      s.problems.includes('certExpired') ? el('div', { style: { color: '#d97706' }, text: '⚠ ' + t('spExpired') }) : null,
      row(t('spSigner'), s.subject), row(t('spIssuer'), s.issuer), row(t('spTime'), fmt(s.time)),
      row(t('spReason'), s.reason), row(t('spLocation'), s.location),
      row(t('spValidity'), s.notBefore ? `${fmt(s.notBefore)} → ${fmt(s.notAfter)}` : null), row(t('spFormat'), s.subFilter)));
  });
  if (list.length) body.append(el('p', { class: 'muted', text: t('spTrust') }));
  await done;
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
