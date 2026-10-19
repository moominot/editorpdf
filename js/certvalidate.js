// Validació en línia d'una signatura al servidor intermediari (/afirma-validate): cadena de confiança contra la
// TSL espanyola i revocació per OCSP. Només s'envien els certificats, mai el document. Si el servidor no respon,
// no bloqueja res: qui crida mostra la comprovació local i un avís.
import { cfg } from './config.js';

const TIMEOUT_MS = 15000;
const cache = new Map(); // certificats + data -> promesa del resultat (dura la sessió)

const toUrlSafe = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const validationAvailable = () => !!cfg('relayUrl');

export function validateSignature(sig) {
  const base = cfg('relayUrl');
  if (!base || !sig.certsB64?.length) return Promise.reject(new Error('unavailable'));
  const certs = sig.certsB64.map(toUrlSafe).join('.');
  const time = sig.time ? Math.floor(new Date(sig.time).getTime() / 1000) : '';
  const key = certs + '|' + time;
  if (!cache.has(key)) {
    const p = (async () => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(base.replace(/\/+$/, '') + '/afirma-validate', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `op=validate&v=1_0&time=${time}&certs=${certs}`, signal: ctl.signal,
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return JSON.parse(await res.text());
      } finally { clearTimeout(timer); }
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // un error (servidor caigut) no queda desat: es reintentarà
  }
  return cache.get(key);
}
