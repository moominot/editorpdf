
// --- MERGE & MULTI-FILE LOGIC ---

async function handleMultipleFiles(files) {
    showLoader("Processant fitxers...");
    try {
        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            try {
                const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                appState.pendingMergeFiles.push({
                    id: Date.now() + Math.random(),
                    name: file.name,
                    data: arrayBuffer,
                    pages: doc.getPageCount()
                });
            } catch (e) {
                console.error("Error loading PDF for merge:", file.name, e);
            }
        }
        updateMergeList();
        document.getElementById('mergeModal').classList.remove('hidden');
    } catch (e) {
        showAlert("Error llegint fitxers: " + e.message);
    } finally {
        hideLoader();
    }
}

async function processDriveFilesForMerge(docs) {
    showLoader("Descarregant fitxers de Drive...");
    try {
        const token = gapi.client.getToken().access_token;
        for (const doc of docs) {
            const fileId = doc.id;
            const name = doc.name;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const buffer = await res.arrayBuffer();

            const pages = (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();

            appState.pendingMergeFiles.push({
                id: Date.now() + Math.random(),
                name: name,
                data: buffer,
                pages: pages
            });
        }
        updateMergeList();
        document.getElementById('mergeModal').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        showAlert("Error descarregant de Drive: " + e.message);
    } finally {
        hideLoader();
    }
}

function updateMergeList() {
    const list = document.getElementById('mergeFileList');
    list.innerHTML = '';

    appState.pendingMergeFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = "bg-white p-3 rounded-lg border border-slate-200 flex items-center gap-3 shadow-sm hover:shadow-md transition group";

        div.innerHTML = `
            <div class="flex-shrink-0 w-8 h-8 bg-red-50 text-red-500 rounded flex items-center justify-center">
                <i data-lucide="file-text" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-medium text-sm text-slate-700 truncate" title="${file.name}">${file.name}</div>
                <div class="text-xs text-slate-400">${file.pages} pàgines</div>
            </div>
            <div class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onclick="window.app.moveMergeFile(${index}, -1)" class="p-1.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30" ${index === 0 ? 'disabled' : ''}>
                    <i data-lucide="arrow-up" class="w-4 h-4"></i>
                </button>
                <button onclick="window.app.moveMergeFile(${index}, 1)" class="p-1.5 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30" ${index === appState.pendingMergeFiles.length - 1 ? 'disabled' : ''}>
                    <i data-lucide="arrow-down" class="w-4 h-4"></i>
                </button>
                <button onclick="window.app.removeMergeFile(${index})" class="p-1.5 hover:bg-red-50 text-red-500 rounded ml-1">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

function moveMergeFile(index, direction) {
    if (index + direction < 0 || index + direction >= appState.pendingMergeFiles.length) return;

    const temp = appState.pendingMergeFiles[index];
    appState.pendingMergeFiles[index] = appState.pendingMergeFiles[index + direction];
    appState.pendingMergeFiles[index + direction] = temp;
    updateMergeList();
}

function removeMergeFile(index) {
    appState.pendingMergeFiles.splice(index, 1);
    updateMergeList();
    if (appState.pendingMergeFiles.length === 0) {
        closeMergeModal();
    }
}

function closeMergeModal() {
    document.getElementById('mergeModal').classList.add('hidden');
}

async function confirmMerge() {
    if (appState.pendingMergeFiles.length === 0) return;

    showLoader("Fusionant documents...");
    closeMergeModal();

    try {
        const mergedPdf = await PDFDocument.create();

        for (const file of appState.pendingMergeFiles) {
            const doc = await PDFDocument.load(file.data);
            const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedBytes = await mergedPdf.save();

        appState.fileName = "merged_document.pdf";
        document.getElementById('docTitle').innerText = appState.fileName;

        appState.pdfBytes = mergedBytes;
        appState.pdfDoc = await PDFDocument.load(mergedBytes);

        appState.selectedPages.clear();
        await extractExistingNotes();
        await extractTextAnnotations();

        // Clear history
        appState.history = [];

        updateUI();
        await renderSidebar();
        await renderMainView();

        // ENABLE SAVE BUTTON IMMEDIATELY
        document.getElementById('saveBtn').disabled = false;
        document.getElementById('saveBtn').classList.remove('opacity-50', 'cursor-not-allowed');

        showAlert("Documents fusionats correctament!");

    } catch (e) {
        console.error(e);
        showAlert("Error en la fusió: " + e.message);
    } finally {
        hideLoader();
    }
}
