// Google Drive API Configuration
// IMPORTANT: Replace these with your own credentials from the Google Cloud Console
const GDRIVE_CONFIG = {
    CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
    API_KEY: 'YOUR_API_KEY_HERE',
    DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    // Scope for full drive access or just for the files opened with the app
    // 'https://www.googleapis.com/auth/drive.file' is safer and only allows access to files opened with this app
    SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install'
};
