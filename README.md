# PDF Simple

Editor, omplidor de formularis i signador de PDF que funciona **només al navegador**: no cal cap servidor Node.
Es pot allotjar tal qual a **GitHub Pages** (és tot HTML/CSS/JS estàtic; les llibreries van dins de `vendor/`).

## Què fa

| | |
|---|---|
| **Visor** | Zoom (botons, `Ctrl+roda`, pessic al mòbil, ajusta a amplada/pàgina), desplaçament continu, cerca (`Ctrl+F`). |
| **Pàgines** | Barra lateral amb miniatures: arrossega per **reordenar** (també diverses a la vegada), **afegir** en blanc o d'un altre PDF, **duplicar**, **girar**, **esborrar**, **extreure** a un PDF nou. |
| **Edició** | Quadres de text (fonts, mida, color, negreta/cursiva), **ressaltar / subratllar / ratllar** text (anotacions reals del PDF), dibuix a mà alçada, rectangles (també per tapar), imatges, desfés/refés (`Ctrl+Z`/`Ctrl+Y`). |
| **Editar el text existent** | Eina `E`: clic sobre un fragment de text i canvia'l. En desar, s'elimina el text original del fitxer (no només es tapa). |
| **Formularis** | AcroForm (text, caselles, opcions, llistes) i **XFA** (només omplir i desar). |
| **OCR** | Converteix un PDF escanejat en cercable i seleccionable (català, castellà, anglès), al navegador. |
| **Fitxers** | Obre i **desa sobre el mateix fitxer** de l'ordinador (Chrome/Edge); arrossega PDF a la finestra; a la resta de navegadors, descàrrega. |
| **Google Drive** | Obre PDF des de Drive i desa'ls a Drive (nou o actualitzant el mateix fitxer). |
| **Signatura** | **AutoFirma** (escriptori), **AutoFirma mòbil** (via el teu servidor intermediari), **certificat .p12/.pfx** al navegador (PAdES-B-B) i signatura manuscrita visual. |
| **Mòbil** | Interfície tàctil: barra lateral com a calaix, gest de pessic, eines amb el dit. |

Idiomes: català, castellà i anglès (Ajustos). Tema clar/fosc automàtic.

## Posar-ho en marxa

### 1. Provar-ho en local

```bash
node dev-server.mjs        # http://localhost:8080
```

(El servidor només serveix fitxers estàtics, es pot fer servir qualsevol altre: `python -m http.server`, etc.)

### 2. Publicar a GitHub Pages

1. Crea un repositori i puja-hi tot el contingut d'aquesta carpeta.
2. *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
3. L'adreça serà `https://EL-TEU-USUARI.github.io/EL-REPO/`.

No hi ha cap pas de compilació. `sw.js` fa que l'app funcioni sense connexió després de la primera visita.

### 3. Google Drive (opcional)

Google exigeix credencials teves (són públiques, no són secrets, però han d'estar lligades al teu domini):

1. [console.cloud.google.com](https://console.cloud.google.com) → crea un projecte.
2. *APIs i serveis → Biblioteca*: activa **Google Drive API** i **Google Picker API**.
3. *Pantalla de consentiment OAuth*: tipus *Extern*, afegeix l'abast `.../auth/drive.file` (no sensible: no cal verificació de Google) i el teu correu com a usuari de prova.
4. *Credencials → Crear → ID de client OAuth → Aplicació web*. A **Orígens JavaScript autoritzats** posa `https://EL-TEU-USUARI.github.io` (i `http://localhost:8080` per a proves). Copia el **Client ID**.
5. *Credencials → Crear → Clau d'API*. Restringeix-la a les APIs de Drive i Picker i als referrers HTTP del teu domini. Copia-la.
6. A *Inici* copia el **número de projecte** (és l'*App ID*).
7. A l'aplicació: icona d'**Ajustos** → omple *Client ID*, *API key* i *App ID*. (O edita `js/config.js` per deixar-los fixos per a tots els usuaris.)

L'app només pot veure els fitxers que tries amb el selector de Google o que ella mateixa crea (abast `drive.file`).

### 4. Signar amb AutoFirma a l'ordinador

* Instal·la [AutoFirma](https://firmaelectronica.gob.es/Home/Descargas.html) (provat contra el protocol de la v1.8/1.9).
* Menú **Signa → AutoFirma (ordinador)**. La web llança `afirma://` i es connecta a l'AutoFirma pel canal local `wss://127.0.0.1:<port>` (el mateix que fa el client JavaScript oficial). **El PDF no surt del teu ordinador.**
* Si Chrome pregunta si pot obrir AutoFirma o accedir a "altres aplicacions i serveis d'aquest dispositiu", accepta-ho.
* Si no connecta: reinstal·la AutoFirma (instal·la el certificat de `127.0.0.1` al magatzem de Windows), tanca-la i torna-ho a provar.
* Signatura visible: tria la zona sobre la pàgina (o fes clic sobre un camp de signatura buit del PDF). El text admet `$$SUBJECTCN$$` i `$$SIGNDATE=dd/MM/yyyy HH:mm:ss$$`.
* La signatura s'ha de fer **al final**: després de signar, no modifiquis el document. AutoFirma conserva les signatures anteriors (revisions incrementals).

### 5. Signar des del mòbil (servidor intermediari propi)

L'AutoFirma del mòbil no obre cap port local: intercanvia el document amb un *servidor intermediari* (protocol `StorageService`/`RetrieveService`). La carpeta [`server/`](server/) en conté un de mínim (Python, només biblioteca estàndard, sense base de dades, dades xifrades extrem a extrem i esborrades en 10 min).

```bash
cd server
docker compose up -d --build
# publica'l amb HTTPS vàlid amb Tailscale Funnel (al servidor Linux):
sudo tailscale funnel --bg 8090
tailscale funnel status          # mostra l'adreça https://<màquina>.<xarxa>.ts.net
```

1. A `server/docker-compose.yml` posa `ALLOWED_ORIGIN` al teu origen de GitHub Pages (p. ex. `https://usuari.github.io`) i torna a fer `docker compose up -d`.
2. A l'app: **Ajustos → Servidor intermediari** = `https://<màquina>.<xarxa>.ts.net` (sense `/` final).
3. Instal·la **AutoFirma** al mòbil (Android/iOS), importa el teu certificat o fes servir el DNIe per NFC.
4. Al mòbil obre la web → **Signa → AutoFirma mòbil**. S'obre l'app AutoFirma, signes, tornes a la pestanya i el PDF signat apareix.

`python3 server/test_relay.py` comprova el servidor. Nota: el protocol s'ha implementat a partir del codi font oficial de `clienteafirma`; la integració amb l'app real del mòbil s'ha de provar al teu dispositiu.

### 6. Signar amb un certificat .p12/.pfx (qualsevol dispositiu)

**Signa → Certificat .p12/.pfx**: tria el fitxer i escriu la contrasenya. Es genera una signatura PAdES (SHA-256, perfil B-B, sense segell de temps) al navegador; ni el certificat ni la contrasenya surten del dispositiu. Admet claus RSA. Si el PDF ja tenia signatures, aquest mètode les invalida (usa AutoFirma).

## Límits coneguts

* **Editar text existent**: no hi ha reflux de paràgrafs; cada fragment de línia es canvia per separat i la tipografia és la més semblant entre Helvetica/Times/Courier (no es reutilitza la font incrustada). Si el text original és dins d'un *Form XObject* o d'un flux amb operadors encadenats, només es tapa (queda al fitxer).
* **XFA**: només omplir i desar, depèn del suport de pdf.js (formularis dinàmics molt complexos poden no mostrar-se bé; no es poden editar pàgines).
* **Formularis AcroForm**: no s'executen els scripts JavaScript del PDF (càlculs/validacions). Els camps de pàgines importades d'un altre PDF queden com a contingut estàtic.
* **PDF xifrats**: es poden veure i editar, però en desar es converteixen en imatges de pàgina (sense text seleccionable; fes-hi OCR).
* **Signatura**: la signatura .p12 no inclou segell de temps ni LTV. La posició de signatura visible en pàgines girades pot no coincidir amb AutoFirma.
* **Navegadors**: desar *sobre el mateix fitxer* requereix Chrome/Edge (File System Access API); a Firefox/Safari es descarrega.
* L'OCR carrega ~10 MB de models la primera vegada i pot tardar uns segons per pàgina.

## Desenvolupament i proves

```bash
node tests/make-test-pdfs.mjs     # genera PDF de prova a tests/pdfs
node tests/run-tests.mjs          # proves de funcions pures, bucle del servidor intermediari i signatura p12
```

Proves d'integració al navegador (amb `node dev-server.mjs` en marxa, pestanya visible): obre `http://localhost:8080/` i a la consola `await (await import('/tests/e2e.js')).run()`.

Estructura: `index.html`, `css/`, `js/` (mòduls ES sense compilar), `vendor/` (pdf.js, pdf-lib, fontkit, tesseract.js, node-forge, DejaVu), `server/` (servidor intermediari), `tests/`.
Llicències de tercers a [THIRD-PARTY.md](THIRD-PARTY.md).
