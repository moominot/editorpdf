// form_analyzer.js - Detect PDF form fields
class FormAnalyzer {
    static async analyzeFormFields(pdfDoc) {
        const fields = [];
        try {
            console.log('🔍 Starting form analysis...');
            console.log('📊 PDFDocument type:', typeof pdfDoc);
            console.log('📊 Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(pdfDoc)));
            
            // Try different API methods depending on pdf-lib version
            let acroForm = null;
            
            // Method 1: getAcroForm() - newer versions
            if (typeof pdfDoc.getAcroForm === 'function') {
                console.log('✅ Using getAcroForm() method');
                acroForm = pdfDoc.getAcroForm();
            } 
            // Method 2: getForm() - alternative
            else if (typeof pdfDoc.getForm === 'function') {
                console.log('✅ Using getForm() method');
                acroForm = pdfDoc.getForm();
            }
            // Method 3: Direct property access
            else if (pdfDoc.acroForm) {
                console.log('✅ Using direct acroForm property');
                acroForm = pdfDoc.acroForm;
            }
            // Method 4: Check catalog
            else if (pdfDoc.catalog && pdfDoc.catalog.acroForm) {
                console.log('✅ Using catalog.acroForm property');
                acroForm = pdfDoc.catalog.acroForm;
            }
            
            console.log('📋 AcroForm object:', acroForm);
            
            if (!acroForm) {
                console.warn('⚠️ No AcroForm found in PDF');
                return { hasForm: false, fields: [] };
            }
            
            // Get fields - try multiple methods
            let fieldsRef = null;
            
            if (typeof acroForm.getFields === 'function') {
                console.log('✅ Using getFields() method');
                fieldsRef = acroForm.getFields();
            } else if (Array.isArray(acroForm.fields)) {
                console.log('✅ Using fields array property');
                fieldsRef = acroForm.fields;
            } else if (acroForm.Fields) {
                console.log('✅ Using Fields property');
                fieldsRef = acroForm.Fields;
            }
            
            console.log('📦 Fields array:', fieldsRef);
            console.log('📊 Number of fields:', fieldsRef ? fieldsRef.length : 0);
            
            if (!fieldsRef || fieldsRef.length === 0) {
                console.warn('⚠️ No fields found in AcroForm');
                return { hasForm: false, fields: [] };
            }
            
            fieldsRef.forEach((fieldRef, index) => {
                try {
                    // Handle different field reference types
                    let field = fieldRef;
                    
                    if (typeof fieldRef.lookup === 'function') {
                        field = fieldRef.lookup();
                    }
                    
                    console.log(`Field ${index}:`, field);
                    
                    if (field) {
                        const fieldData = this._parseField(field, index);
                        if (fieldData) {
                            fields.push(fieldData);
                            console.log(`✅ Parsed field ${index}:`, fieldData);
                        }
                    }
                } catch (e) {
                    console.warn(`❌ Error parsing field ${index}:`, e);
                }
            });
            
            console.log(`✨ Form analysis complete. Found ${fields.length} fields`);
        } catch (error) {
            console.error('❌ Error analyzing form:', error);
            console.error('Stack trace:', error.stack);
        }
        return { hasForm: fields.length > 0, fields: fields };
    }
    
    static _parseField(field, index) {
        try {
            // Try to extract field properties using different methods
            let fieldName = null;
            let fieldType = null;
            let fieldValue = null;
            
            // Method 1: Using get() function
            if (typeof field.get === 'function') {
                fieldName = field.get('T')?.toString() || `Field_${index}`;
                fieldType = field.get('FT')?.toString() || 'Unknown';
                fieldValue = field.get('V')?.toString() || '';
            }
            // Method 2: Direct property access
            else {
                fieldName = field.T?.toString() || field.fieldName || `Field_${index}`;
                fieldType = field.FT?.toString() || field.fieldType || 'Unknown';
                fieldValue = field.V?.toString() || field.value || '';
            }
            
            return {
                index: index,
                name: this._cleanString(fieldName),
                type: this._cleanString(fieldType),
                value: this._cleanString(fieldValue),
                isReadOnly: this._isReadOnly(field),
                isRequired: this._isRequired(field)
            };
        } catch (error) {
            console.warn('Error parsing field:', error);
            return null;
        }
    }
    
    static _cleanString(str) {
        if (!str) return '';
        return str.replace(/\(|\)/g, '').trim();
    }
    
    static _isReadOnly(field) {
        try {
            let flags = null;
            
            if (typeof field.get === 'function') {
                flags = field.get('Ff');
            } else {
                flags = field.Ff || field.flags;
            }
            
            if (!flags) return false;
            const flagValue = parseInt(flags.toString());
            return (flagValue & 1) !== 0;
        } catch (e) { 
            return false; 
        }
    }
    
    static _isRequired(field) {
        try {
            let flags = null;
            
            if (typeof field.get === 'function') {
                flags = field.get('Ff');
            } else {
                flags = field.Ff || field.flags;
            }
            
            if (!flags) return false;
            const flagValue = parseInt(flags.toString());
            return (flagValue & 2) !== 0;
        } catch (e) { 
            return false; 
        }
    }
}
window.FormAnalyzer = FormAnalyzer;
