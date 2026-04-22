// form_filler.js - Fill PDF form fields
class FormFiller {
    static async fillForm(pdfDoc, formData) {
        try {
            const acroForm = pdfDoc.getAcroForm();
            if (!acroForm) return false;
            
            const fieldsRef = acroForm.getFields();
            if (!fieldsRef) return false;
            
            let filledCount = 0;
            fieldsRef.forEach((fieldRef) => {
                try {
                    const field = fieldRef.lookup();
                    if (!field) return;
                    
                    const fieldName = field.get('T')?.toString()?.replace(/\(|\)/g, '');
                    if (!fieldName || !formData.hasOwnProperty(fieldName)) return;
                    
                    const value = formData[fieldName];
                    this._setFieldValue(pdfDoc, field, value);
                    filledCount++;
                } catch (e) {
                    console.warn('Error filling field:', e);
                }
            });
            
            return filledCount > 0;
        } catch (error) {
            console.error('Error filling form:', error);
            return false;
        }
    }
    
    static _setFieldValue(pdfDoc, field, value) {
        try {
            field.set('V', PDFLib.PDFString.of(String(value)));
            field.set('AS', PDFLib.PDFName.of(String(value)));
        } catch (e) {
            console.warn('Error setting field value:', e);
        }
    }
    
    static async exportFilledForm(pdfDoc, filename = 'form_filled.pdf') {
        try {
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error('Error exporting form:', error);
            return false;
        }
    }
}
window.FormFiller = FormFiller;
