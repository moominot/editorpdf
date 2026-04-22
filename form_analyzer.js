// form_analyzer.js - Detect PDF form fields
class FormAnalyzer {
    static async analyzeFormFields(pdfDoc) {
        const fields = [];
        try {
            const acroForm = pdfDoc.getAcroForm();
            if (!acroForm) return { hasForm: false, fields: [] };
            
            const fieldsRef = acroForm.getFields();
            if (!fieldsRef || fieldsRef.length === 0) return { hasForm: false, fields: [] };
            
            fieldsRef.forEach((fieldRef, index) => {
                try {
                    const field = fieldRef.lookup();
                    if (field) {
                        const fieldData = this._parseField(field, index);
                        if (fieldData) fields.push(fieldData);
                    }
                } catch (e) {
                    console.warn(`Error parsing field ${index}:`, e);
                }
            });
        } catch (error) {
            console.warn('Error analyzing form:', error);
        }
        return { hasForm: fields.length > 0, fields: fields };
    }
    
    static _parseField(field, index) {
        try {
            const fieldName = field.get('T')?.toString() || `Field_${index}`;
            const fieldType = field.get('FT')?.toString() || 'Unknown';
            return {
                index: index,
                name: fieldName.replace(/\(|\)/g, ''),
                type: fieldType.replace(/\(|\)/g, ''),
                value: field.get('V')?.toString()?.replace(/\(|\)/g, '') || '',
                isReadOnly: this._isReadOnly(field),
                isRequired: this._isRequired(field)
            };
        } catch (error) {
            console.warn('Error parsing field:', error);
            return null;
        }
    }
    
    static _isReadOnly(field) {
        try {
            const flags = field.get('Ff');
            return flags && (parseInt(flags.toString()) & 1) !== 0;
        } catch (e) { return false; }
    }
    
    static _isRequired(field) {
        try {
            const flags = field.get('Ff');
            return flags && (parseInt(flags.toString()) & 2) !== 0;
        } catch (e) { return false; }
    }
}
window.FormAnalyzer = FormAnalyzer;
