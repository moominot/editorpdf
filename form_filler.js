// form_filler.js - Fill PDF form fields with robust PDF library support
class FormFiller {
    static async fillForm(pdfDoc, formData) {
        try {
            console.log('📝 Filling form with data:', formData);
            
            // Try to get the form from the PDF
            let acroForm = null;
            let fieldsRef = null;

            // Method 1: getAcroForm()
            if (typeof pdfDoc.getAcroForm === 'function') {
                acroForm = pdfDoc.getAcroForm();
            } 
            // Method 2: getForm()
            else if (typeof pdfDoc.getForm === 'function') {
                try {
                    const form = pdfDoc.getForm();
                    return await this._fillUsingForm(form, formData);
                } catch (e) {
                    console.warn('getForm() failed:', e);
                }
            }
            // Method 3: Direct acroForm property
            else if (pdfDoc.acroForm) {
                acroForm = pdfDoc.acroForm;
            }
            // Method 4: Catalog
            else if (pdfDoc.catalog?.acroForm) {
                acroForm = pdfDoc.catalog.acroForm;
            }

            if (!acroForm) {
                console.warn('⚠️ No AcroForm found, cannot fill form');
                return false;
            }

            // Get fields
            if (typeof acroForm.getFields === 'function') {
                fieldsRef = acroForm.getFields();
            } else if (Array.isArray(acroForm.fields)) {
                fieldsRef = acroForm.fields;
            } else if (acroForm.Fields) {
                fieldsRef = acroForm.Fields;
            }

            if (!fieldsRef || fieldsRef.length === 0) {
                console.warn('⚠️ No fields found in form');
                return false;
            }

            let filledCount = 0;
            fieldsRef.forEach((fieldRef) => {
                try {
                    let field = fieldRef;
                    if (typeof fieldRef.lookup === 'function') {
                        field = fieldRef.lookup();
                    }
                    
                    if (!field) return;
                    
                    // Get field name
                    let fieldName = null;
                    if (typeof field.get === 'function') {
                        fieldName = field.get('T')?.toString()?.replace(/\(|\)/g, '');
                    } else {
                        fieldName = field.T?.toString() || field.fieldName;
                    }
                    
                    if (!fieldName || !formData.hasOwnProperty(fieldName)) return;
                    
                    const value = formData[fieldName];
                    console.log(`✍️ Filling field "${fieldName}" with value "${value}"`);
                    this._setFieldValue(field, value);
                    filledCount++;
                } catch (e) {
                    console.warn('Error filling field:', e);
                }
            });
            
            console.log(`✅ Filled ${filledCount} fields`);
            return filledCount > 0;
        } catch (error) {
            console.error('❌ Error filling form:', error);
            return false;
        }
    }

    static async _fillUsingForm(form, formData) {
        console.log('📝 Using getForm() method to fill fields');
        let filledCount = 0;
        
        try {
            const fields = form.getFields ? form.getFields() : [];
            
            for (const field of fields) {
                const name = field.getName();
                if (formData.hasOwnProperty(name)) {
                    const value = formData[name];
                    console.log(`✍️ Setting "${name}" = "${value}"`);
                    
                    // Try different setter methods
                    if (field.setText) {
                        field.setText(String(value));
                    } else if (field.setValue) {
                        field.setValue(value);
                    } else if (field.select) {
                        field.select(String(value));
                    } else if (field.check && (value === true || value === 'Yes' || value === 'On')) {
                        field.check();
                    }
                    
                    filledCount++;
                }
            }
        } catch (e) {
            console.warn('Error using getForm() method:', e);
        }
        
        return filledCount > 0;
    }
    
    static _setFieldValue(field, value) {
        try {
            // Method 1: Using set() function
            if (typeof field.set === 'function') {
                // Set the field value
                try {
                    const PDFString = PDFLib?.PDFString || window.PDFLib?.PDFString;
                    const PDFName = PDFLib?.PDFName || window.PDFLib?.PDFName;
                    
                    if (PDFString && PDFName) {
                        field.set('V', PDFString.of(String(value)));
                        field.set('AS', PDFName.of(String(value)));
                    } else {
                        field.set('V', String(value));
                    }
                } catch (e) {
                    field.set('V', String(value));
                }
            } 
            // Method 2: Direct property assignment
            else {
                field.V = String(value);
                field.AS = String(value);
            }
            
            console.log('✅ Field value set successfully');
        } catch (e) {
            console.warn('Error setting field value:', e);
        }
    }
    
    static async exportFilledForm(pdfDoc, filename = 'form_filled.pdf') {
        try {
            console.log('💾 Exporting filled form as:', filename);
            
            // Ensure the PDF is saved with the current state
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            console.log('⬇️ Downloading:', filename);
            link.click();
            
            // Clean up
            setTimeout(() => URL.revokeObjectURL(url), 100);
            return true;
        } catch (error) {
            console.error('❌ Error exporting form:', error);
            return false;
        }
    }
}
window.FormFiller = FormFiller;
