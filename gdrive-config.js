// Google Drive API Configuration
// IMPORTANT: Replace these with your own credentials from the Google Cloud Console
const GDRIVE_CONFIG = {
    CLIENT_ID: '189007098864-c3pccnknc1805hlqk30vlmo7r3pqmkq3.apps.googleusercontent.com',
    API_KEY: 'AIzaSyDdOO7KQpOpTI8f2YTuSC9SoQvwfZyTGyY',
    DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    // Scope for full drive access or just for the files opened with the app
    // 'https://www.googleapis.com/auth/drive.file' is safer and only allows access to files opened with this app
    SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install'
};
