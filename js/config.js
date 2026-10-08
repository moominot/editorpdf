// Configuració. Els valors per defecte es poden editar aquí (el Client ID de Google és públic).
// També es poden canviar des de la icona d'Ajustos de l'aplicació (es desen al navegador).
export const DEFAULTS = {
  googleClientId: '189007098864-c3pccnknc1805hlqk30vlmo7r3pqmkq3.apps.googleusercontent.com', // ID de client OAuth (tipus "Aplicació web")
  googleApiKey: 'AIzaSyDdOO7KQpOpTI8f2YTuSC9SoQvwfZyTGyY', // clau d'API (necessària per al Google Picker)
  googleAppId: '189007098864', // número del projecte de Google Cloud (prefix del Client ID)
  relayUrl: '',         // URL del servidor intermediari per a AutoFirma mòbil (p. ex. https://servidor.tailnet.ts.net)
  ocrLangs: 'cat+spa+eng',
};
const KEY = 'pdfsimple.cfg';
let over = {};
try { over = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
export const cfg = (k) => (over[k] !== undefined && over[k] !== '' ? over[k] : DEFAULTS[k]);
export function setCfg(obj) {
  over = { ...over, ...obj };
  try { localStorage.setItem(KEY, JSON.stringify(over)); } catch {}
}
export const getOverrides = () => ({ ...over });
