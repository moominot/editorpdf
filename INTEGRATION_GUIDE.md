# Guia d'Integració: Ompliment de Formularis PDF

## 1️⃣ Afegir Scripts a `editor.html`

Lloc: Dins la secció `<head>` o al final de `<body>`

```html
<!-- Stylesheets for forms -->
<link rel="stylesheet" href="styles_forms.css">

<!-- Form modules -->
<script src="form_analyzer.js"></script>
<script src="form_filler.js"></script>
<script src="form_ui_builder.js"></script>
<script src="form_storage.js"></script>
```

## 2️⃣ Modificacions a `app.js`

### A. Afegir al `appState`:

```javascript
const appState = {
    // ... existing state ...
    
    // Form handling
    formAnalysis: null,
    formPanel: null,
    isFormMode: false,
};
```

### B. Crear funció de suport per a formularis:

Afegir aquesta funció al final de `app.js`:

```javascript
/**
 * Analyzes loaded PDF for form fields and builds UI
 */
window.app.initializeFormSupport = async function() {
    if (!appState.pdfDoc) {
        console.warn('No PDF loaded');
        return;
    }
    
    try {
        // Analyze form fields
        appState.formAnalysis = await FormAnalyzer.analyzeFormFields(appState.pdfDoc);
        
        if (!appState.formAnalysis.hasForm) {
            console.log('No form fields detected in PDF');
            return;
        }
        
        console.log('Form detected with', appState.formAnalysis.fields.length, 'fields');
        
        // Build form UI
        appState.formPanel = FormUIBuilder.buildFormPanel(appState.formAnalysis.fields);
        appState.isFormMode = true;
        
        // Add to sidebar or modal
        const sidebarOrModal = document.getElementById('sidebar') || document.getElementById('rightPanel');
        if (sidebarOrModal) {
            sidebarOrModal.innerHTML = '';
            sidebarOrModal.appendChild(appState.formPanel);
        }
        
        // Add action buttons
        window.app.addFormActionButtons();
        
    } catch (error) {
        console.error('Error initializing form support:', error);
    }
};

/**
 * Add action buttons for form manipulation
 */
window.app.addFormActionButtons = function() {
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'form-buttons';
    
    // Fill Form button
    const fillBtn = document.createElement('button');
    fillBtn.className = 'btn-fill-form';
    fillBtn.textContent = '✓ Omplir Formulari';
    fillBtn.onclick = window.app.fillCurrentForm;
    buttonsContainer.appendChild(fillBtn);
    
    // Save Draft button
    const draftBtn = document.createElement('button');
    draftBtn.className = 'btn-save-draft';
    draftBtn.textContent = '💾 Guardar Esborrany';
    draftBtn.onclick = window.app.saveDraft;
    buttonsContainer.appendChild(draftBtn);
    
    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-export-form';
    exportBtn.textContent = '📥 Descarregar';
    exportBtn.onclick = window.app.exportForm;
    buttonsContainer.appendChild(exportBtn);
    
    appState.formPanel.appendChild(buttonsContainer);
};

/**
 * Fill the form with current UI values
 */
window.app.fillCurrentForm = async function() {
    try {
        const formData = FormUIBuilder.getFormData();
        const success = await FormFiller.fillForm(appState.pdfDoc, formData);
        
        if (success) {
            window.app.showAlert('Formulari omplert correctament', 'success');
            // Update preview
            window.app.renderPdf();
        } else {
            window.app.showAlert('Error en omplir el formulari', 'error');
        }
    } catch (error) {
        console.error('Error filling form:', error);
        window.app.showAlert('Error: ' + error.message, 'error');
    }
};

/**
 * Save form data as draft
 */
window.app.saveDraft = function() {
    try {
        const formData = FormUIBuilder.getFormData();
        const filename = appState.fileName || 'document.pdf';
        formStorage.saveDraft(filename, formData);
        window.app.showAlert('Esborrany guardat correctament', 'success');
    } catch (error) {
        console.error('Error saving draft:', error);
        window.app.showAlert('Error al guardar: ' + error.message, 'error');
    }
};

/**
 * Export filled PDF form
 */
window.app.exportForm = async function() {
    try {
        const formData = FormUIBuilder.getFormData();
        await FormFiller.fillForm(appState.pdfDoc, formData);
        const filename = appState.fileName.replace('.pdf', '_omplert.pdf');
        await FormFiller.exportFilledForm(appState.pdfDoc, filename);
        window.app.showAlert('PDF descarregat correctament', 'success');
    } catch (error) {
        console.error('Error exporting form:', error);
        window.app.showAlert('Error al descarregar: ' + error.message, 'error');
    }
};

/**
 * Show alert message
 */
window.app.showAlert = function(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = 'form-alert ' + type;
    alert.textContent = message;
    
    const panel = document.getElementById('sidebar') || document.getElementById('rightPanel');
    if (panel) {
        panel.insertBefore(alert, panel.firstChild);
        setTimeout(() => alert.remove(), 5000);
    }
};
```

### C. Cridar després de carregar PDF:

Afegir aquesta línia on es carreguin documents PDF:

```javascript
// After PDF is loaded and rendered
await window.app.initializeFormSupport();
```

## 3️⃣ Ubicació en el flux de l'aplicació

Generalment, després que:
- PDF s'hagi carregat correctament
- S'hagi renderitzat la primera pàgina
- Estigui disponible `appState.pdfDoc`

## 4️⃣ Exemple complet d'integració

```javascript
// Ubicar en app.js, on es carrega un PDF
async function loadPdfDocument(fileOrArrayBuffer) {
    try {
        // Load PDF
        appState.pdfBytes = fileOrArrayBuffer;
        appState.pdfDoc = await PDFDocument.load(fileOrArrayBuffer);
        
        // Render
        await window.app.renderPdf();
        
        // Initialize form support
        await window.app.initializeFormSupport();
        
    } catch (error) {
        console.error('Error loading PDF:', error);
    }
}
```

## 5️⃣ Testing

Punts importants a verificar:

1. ✅ Detecta formularis correctament
2. ✅ UI es construeix dinàmicament
3. ✅ Els camps es rellenen correctament
4. ✅ L'exportació genera PDF vàlid
5. ✅ Els esborranys es guarden a localStorage
6. ✅ Els esborranys es carreguen correctament

## 6️⃣ Troubleshooting

**Els campos no es detecten:**
- Verificar que el PDF tingui formularis AcroForm
- Obrir la consola per veure errors

**L'interfície no apareix:**
- Assegurar-se que el HTML té elements per `sidebar` o `rightPanel`
- Verificar que els scripts s'han carregat correctament

**Els valors no es guarden:**
- Comprovar que localStorage està disponible
- Comprovar permisos de navegador

## 📚 Referència API

### FormAnalyzer
- `analyzeFormFields(pdfDoc)` - Detecta camps

### FormFiller
- `fillForm(pdfDoc, formData)` - Omple campos
- `exportFilledForm(pdfDoc, filename)` - Descarrega PDF

### FormUIBuilder
- `buildFormPanel(fields)` - Crea interfície
- `getFormData()` - Obté valors actuals

### FormStorage
- `saveDraft(filename, data)` - Guarda esborrany
- `loadDraft(filename)` - Carrega esborrany
- `getDrafts()` - Llistat de tots els esborranys
