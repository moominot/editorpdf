# Implementació de Ompliment de Formularis PDF

## 📋 Overview
Aquesta funcionalitat permet detectar, visualitzar i omplir formularis PDF usant la biblioteca `pdf-lib`.

## 📁 Fitxers Afegits

### 1. **form_analyzer.js**
- Detecta camps de formularis en documents PDF
- Extreu metadades dels camps (nom, tipus, valor, flags)
- Suporta: text fields, checkboxes, radio buttons, select lists

**Ús:**
```javascript
const analysis = await FormAnalyzer.analyzeFormFields(pdfDoc);
if (analysis.hasForm) {
    console.log('Camps detectats:', analysis.fields);
}
```

### 2. **form_filler.js**
- Omple els camps del formulari amb dades
- Exporta el PDF omplert com a arxiu

**Ús:**
```javascript
const formData = { 'nom_camp': 'valor', 'altre_camp': 'valor2' };
await FormFiller.fillForm(pdfDoc, formData);
await FormFiller.exportFilledForm(pdfDoc, 'form_filled.pdf');
```

### 3. **form_ui_builder.js**
- Construeix una interfície dinàmica per als camps del formulari
- Gestiona diferentes tipus de camps (text, select, checkbox)
- Respecta propietats com ReadOnly i Required

**Ús:**
```javascript
const panel = FormUIBuilder.buildFormPanel(fields);
document.getElementById('container').appendChild(panel);
const data = FormUIBuilder.getFormData();
```

### 4. **form_storage.js**
- Guarda borradors de formularis en localStorage
- Permet carregar i recuperar dades guardades prèviament

**Ús:**
```javascript
formStorage.saveDraft('nom_arxiu.pdf', formData);
const data = formStorage.loadDraft('nom_arxiu.pdf');
```

### 5. **styles_forms.css**
- Estilos CSS per a la interfície de formularis
- Responsive i modern

## 🔧 Integració amb app.js

Cal afegir els scripts al `editor.html`:

```html
<link rel="stylesheet" href="styles_forms.css">
<script src="form_analyzer.js"></script>
<script src="form_filler.js"></script>
<script src="form_ui_builder.js"></script>
<script src="form_storage.js"></script>
```

## 💾 Modificacions a app.js

Cal afegir el següent al codi d'inicialització:

```javascript
// Al cargar un PDF
async function loadPDFWithFormSupport(pdfDoc) {
    // Analitza formularis
    const formAnalysis = await FormAnalyzer.analyzeFormFields(pdfDoc);
    
    if (formAnalysis.hasForm) {
        // Construeix interfície
        const formPanel = FormUIBuilder.buildFormPanel(formAnalysis.fields);
        document.getElementById('sidebar').appendChild(formPanel);
        
        // Afegeix botó per guardar
        const btn = document.createElement('button');
        btn.textContent = 'Guardar formulari';
        btn.onclick = async () => {
            const data = FormUIBuilder.getFormData();
            await FormFiller.fillForm(pdfDoc, data);
            await FormFiller.exportFilledForm(pdfDoc);
        };
        document.getElementById('sidebar').appendChild(btn);
    }
}
```

## 🎯 Flux de Treball Recomanat

1. Usuari carrega PDF amb formulari
2. Sistema detecta camps automàticament
3. Interfície es construeix dinàmicament
4. Usuari omple els camps
5. Opcionalment guardar com a esborrany (localStorage)
6. Exportar PDF omplert

## 🧪 Proves Recomanades

- Testejar amb PDFs que tinguin formularis complexos
- Validar que es detecten tots els tipus de camps
- Provar guardar/carregar esborradors
- Testar export en navegadors diferents

## ⚙️ Configuració Avançada

### Validació de Camps
Afegir validació personalitzada a `form_ui_builder.js`:

```javascript
static validateField(field, value) {
    if (field.isRequired && !value) {
        return { valid: false, error: 'Camp obligatori' };
    }
    return { valid: true };
}
```

### Integració amb Google Drive
Modificar `drive_helpers.js` per guardar PDF omplert a Drive:

```javascript
async function saveFilledFormToDrive(pdfBytes, filename) {
    // Usar Google Drive API per guardar
}
```

## 📝 Nota
Els camps de formulari es detecten basant-se en l'estructura PDF interna (AcroForm).
No tots els PDFs contenen formularis interactius, alguns només contenen "imatges" de camps.
