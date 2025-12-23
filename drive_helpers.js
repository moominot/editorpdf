
async function loadMultipleDriveFilesByIds(ids) {
    showLoader("Obtenint informació dels fitxers...");
    try {
        const docs = [];
        for (const id of ids) {
            const res = await gapi.client.drive.files.get({
                fileId: id,
                fields: 'id, name, mimeType',
                supportsAllDrives: true
            });
            docs.push(res.result);
        }
        // Now trigger the merge logic
        appState.pendingMergeFiles = [];
        await processDriveFilesForMerge(docs);
    } catch (e) {
        console.error(e);
        showAlert("Error obtenint metadades: " + e.message);
        hideLoader();
    }
}
