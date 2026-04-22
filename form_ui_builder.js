// form_ui_builder.js - Build UI for form fields
class FormUIBuilder {
    static buildFormPanel(formFields) {
        const panel = document.createElement('div');
        panel.id = 'formPanel';
        panel.className = 'form-panel';
        panel.innerHTML = '<h3>Formulari PDF</h3>';
        
        if (!formFields || formFields.length === 0) {
            panel.innerHTML += '<p>No hi ha camps de formulari detectats</p>';
            return panel;
        }
        
        formFields.forEach(field => {
            const fieldContainer = document.createElement('div');
            fieldContainer.className = 'form-field-container';
            
            const label = document.createElement('label');
            label.textContent = field.name + (field.isRequired ? '*' : '');
            label.htmlFor = `field_${field.index}`;
            
            let input;
            switch(field.type) {
                case 'Tx':
                    input = document.createElement('input');
                    input.type = 'text';
                    input.id = `field_${field.index}`;
                    input.value = field.value || '';
                    input.disabled = field.isReadOnly;
                    break;
                case 'Ch':
                    input = document.createElement('select');
                    input.id = `field_${field.index}`;
                    input.disabled = field.isReadOnly;
                    if (field.options && field.options.length > 0) {
                        field.options.forEach(opt => {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.label;
                            input.appendChild(option);
                        });
                    }
                    break;
                case 'Btn':
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.id = `field_${field.index}`;
                    input.checked = field.value === 'Yes' || field.value === 'On';
                    input.disabled = field.isReadOnly;
                    break;
                default:
                    input = document.createElement('input');
                    input.type = 'text';
                    input.id = `field_${field.index}`;
                    input.value = field.value || '';
                    input.disabled = field.isReadOnly;
            }
            
            input.setAttribute('data-field-name', field.name);
            fieldContainer.appendChild(label);
            fieldContainer.appendChild(input);
            panel.appendChild(fieldContainer);
        });
        
        return panel;
    }
    
    static getFormData() {
        const formData = {};
        const inputs = document.querySelectorAll('#formPanel input, #formPanel select');
        inputs.forEach(input => {
            const fieldName = input.getAttribute('data-field-name');
            if (fieldName) {
                if (input.type === 'checkbox') {
                    formData[fieldName] = input.checked ? 'Yes' : 'No';
                } else {
                    formData[fieldName] = input.value;
                }
            }
        });
        return formData;
    }

    static setFormData(formData) {
        const inputs = document.querySelectorAll('#formPanel input, #formPanel select');
        inputs.forEach(input => {
            const fieldName = input.getAttribute('data-field-name');
            if (fieldName && formData.hasOwnProperty(fieldName)) {
                const value = formData[fieldName];
                if (input.type === 'checkbox') {
                    input.checked = value === 'Yes' || value === 'On' || value === true;
                } else {
                    input.value = value || '';
                }
            }
        });
    }
}
window.FormUIBuilder = FormUIBuilder;
