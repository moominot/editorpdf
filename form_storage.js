// form_storage.js - Store and manage form data
class FormStorage {
    constructor() {
        this.storageKey = 'pdf_form_drafts';
    }
    
    saveDraft(filename, formData) {
        try {
            const drafts = this.getDrafts();
            drafts[filename] = {
                data: formData,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(this.storageKey, JSON.stringify(drafts));
            return true;
        } catch (error) {
            console.error('Error saving draft:', error);
            return false;
        }
    }
    
    loadDraft(filename) {
        try {
            const drafts = this.getDrafts();
            return drafts[filename]?.data || null;
        } catch (error) {
            console.error('Error loading draft:', error);
            return null;
        }
    }
    
    getDrafts() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting drafts:', error);
            return {};
        }
    }
    
    deleteDraft(filename) {
        try {
            const drafts = this.getDrafts();
            delete drafts[filename];
            localStorage.setItem(this.storageKey, JSON.stringify(drafts));
            return true;
        } catch (error) {
            console.error('Error deleting draft:', error);
            return false;
        }
    }
    
    clearAllDrafts() {
        try {
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            console.error('Error clearing drafts:', error);
            return false;
        }
    }
}
window.formStorage = new FormStorage();
