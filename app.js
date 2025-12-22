// --- CONFIGURACIÓ I ESTAT ---
const appState = {
    pdfDoc: null,
    pdfBytes: null,
    fileName: "document.pdf",
    currentPage: 0,
    zoom: 1, // Start slightly zoomed out for continuous
    isSigned: false,
    viewMode: 'continuous', // 'single', 'two-page', 'continuous'

    // Multi-selecció
    selectedPages: new Set(), // Set d'índexs
    lastClickedIndex: null,   // Per al Shift+Click

    // Edició
    selectionMode: null, // 'text' o 'signature'
    selectionRect: null,
    tempTextRect: null,
    signatureConfig: { isDefined: false, pageIndex: -1, rect: null },
    uploadedSigFile: null,

    signatureConfig: { isDefined: false, pageIndex: -1, rect: null },
    uploadedSigFile: null,

    // Undo/Redo Stacks
    history: [],
    redoStack: [],
    maxHistory: 10,

    // Dibuix (Ink)
    isDrawingMode: false,
    isDrawing: false,
    currentPath: [], // Array de punts {x, y}
    allPaths: [], // Array d'arrays de punts (per si fem múltiples traços abans de guardar)

    // Formularis
    formValues: {}, // { fieldName: value } per persistir entre canvis de pàgina/vista

    // Signatures
    detectedSignatures: [],
    autoFirmaReady: false,

    // Notes
    notes: [], // Array of { id, pageIndex, x, y, text }
    activeNoteId: null,

    // Text Annotations (Highlight, StrikeOut, Underline)
    textAnnotations: [], // Array per page: [[annot1, annot2], [annot3], ...]
    selectedAnnotation: null, // { pageIndex, annotIndex, data }

    // Altres eines
    highlights: [], // { pageIndex, rects: [], color }
    activeTool: null,

    // Google Drive Integration
    driveFileId: null,
    driveFolderId: null,
    targetFolderId: null,
    isGoogleAuth: false,
    tokenClient: null,

    // Search
    searchState: {
        query: '',
        matches: [], // Array de { pageIndex, matchIndex, rects: [{left, top, width, height}], text }
        currentMatchIndex: -1,
        isActive: false
    }
};

// Imports
const { PDFDocument, StandardFonts, rgb, PDFName, PDFDict, PDFHexString, PDFRef, PDFString, PDFArray } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- INICIALITZACIÓ ---
window.app = {};

// --- MODAL SYSTEM ---
let modalResolve = null;

window.app.closeModal = function (result) {
    const modal = document.getElementById('genericModal');
    modal.classList.add('hidden');

    const input = document.getElementById('gModalInput');
    const value = input.value;

    if (modalResolve) {
        // If input visible and result is true, return value. Else return result (bool).
        const inputVisible = !document.getElementById('gModalInputContainer').classList.contains('hidden');
        if (result && inputVisible) {
            modalResolve(value);
        } else {
            modalResolve(result);
        }
        modalResolve = null;
    }
};

window.app.showModal = async function ({ title, message, inputType = null, inputValue = '', showCancel = true }) {
    return new Promise(resolve => {
        modalResolve = resolve;

        document.getElementById('gModalTitle').textContent = title || 'Avís';
        document.getElementById('gModalMessage').textContent = message || '';

        const inputContainer = document.getElementById('gModalInputContainer');
        const input = document.getElementById('gModalInput');
        if (inputType) {
            inputContainer.classList.remove('hidden');
            input.value = inputValue;
            input.focus();
        } else {
            inputContainer.classList.add('hidden');
        }

        const cancelBtn = document.getElementById('gModalCancel');
        if (showCancel) {
            cancelBtn.classList.remove('hidden');
        } else {
            cancelBtn.classList.add('hidden');
        }

        const modal = document.getElementById('genericModal');
        modal.classList.remove('hidden');
    });
};

window.app.askConfirm = async function (msg) {
    return await window.app.showModal({ title: 'Confirmació', message: msg, showCancel: true });
};

window.app.askPrompt = async function (msg, def = '') {
    return await window.app.showModal({ title: 'Entrada', message: msg, inputType: 'text', inputValue: def, showCancel: true });
};

// Overwrite showAlert to use standard toast or modal? 
// User asked to replace ALL alerts with modals. 
// Existing showAlert is a toast. User might be OK with toasts for info.
// But for errors/criticals, maybe modal?
// I'll leave showAlert as toast (non-blocking) unless user complains, OR I can map window.alert to modal.
window.alert = function (msg) {
    window.app.showModal({ title: 'Alerta', message: msg, showCancel: false });
};

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupEventListeners();

    if ('launchQueue' in window) {
        launchQueue.setConsumer(async (params) => {
            if (params.files.length) loadPdfFile(await params.files[0].getFile());
        });
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
    if (!/Android|iPhone/i.test(navigator.userAgent)) checkAndInitAutoFirma();

    // Init Sidebars based on screen size
    if (window.innerWidth >= 768) {
        document.getElementById('sidebar').classList.remove('closed');
    } else {
        document.getElementById('sidebar').classList.add('closed');
    }

    // Google Drive Init
    initDriveApi();
});

function setupEventListeners() {
    document.getElementById('mainPdfInput').onchange = (e) => { if (e.target.files[0]) loadPdfFile(e.target.files[0]); e.target.value = ''; };
    document.getElementById('mergePdfInput').onchange = (e) => { if (e.target.files[0]) processMerge(e.target.files[0]); e.target.value = ''; };

    document.getElementById('signatureFileInput').onchange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            appState.uploadedSigFile = file;
            document.getElementById('sigFileName').innerText = file.name;
            document.getElementById('sigFileName').classList.add('text-indigo-600', 'font-medium');

            // Preview
            const reader = new FileReader();
            reader.onload = (ev) => {
                const preview = document.getElementById('sigPreview');
                if (preview) {
                    preview.src = ev.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    };

    document.getElementById('toggleSidebarBtn').onclick = () => {
        document.getElementById('sidebar').classList.toggle('closed');
        setTimeout(() => { if (appState.viewMode === 'continuous') renderMainView(); }, 300);
    };

    document.getElementById('mainScroll').addEventListener('scroll', handleScroll);

    const selCanvas = document.getElementById('selectionCanvas');
    selCanvas.addEventListener('mousedown', startSelection);
    selCanvas.addEventListener('mousemove', drawSelection);
    selCanvas.addEventListener('mouseup', endSelection);
    selCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startSelection(e.touches[0]); }, { passive: false });
    selCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); drawSelection(e.touches[0]); }, { passive: false });
    selCanvas.addEventListener('touchend', endSelection);

    // Exposar funcions públiques
    Object.assign(window.app, {
        toggleTool: toggleTool,
        openInsertModal: () => toggleTool('insert'),
        openSignatureModal: () => toggleTool('signature'),
        activateSelectionMode: activateSelectionMode,
        changeZoom: changeZoom,
        toggleViewMode: toggleViewMode,
        analyzeSignatures: () => toggleTool('verify'),
        signWithAutoFirma: signWithAutoFirma,
        downloadPdf: downloadPdf,
        changePage: changePage,
        triggerMerge: triggerMerge,
        applyTextToPdf: applyTextToPdf,
        applyImageSignatureVisualOnly: applyImageSignatureVisualOnly,
        confirmSelection: confirmSelection,
        closeSelectionMode: closeSelectionMode,
        closeSidePanel: closeSidePanel,
        rotateSelected: rotateSelected,
        moveSelected: moveSelected,
        extractSelected: extractSelected,
        deleteSelected: deleteSelected,
        clearSelection: clearSelection,
        applyWatermark: applyWatermark,
        saveDrawing: saveDrawing,
        toggleSidebarMobile: () => {
            document.getElementById('sidebar').classList.toggle('closed');
        },
        toggleRightSidebarMobile: () => {
            const rs = document.getElementById('rightSidebar');
            rs.classList.toggle('mobile-open');
        },
        toggleMobilePanelHeight: () => {
            const p = document.getElementById('sidebarPanels');
            // Toggle between minimized and maximized only
            if (p.classList.contains('panel-minimized')) {
                p.classList.remove('panel-minimized');
                p.classList.add('panel-maximized');
            } else {
                p.classList.remove('panel-maximized');
                p.classList.add('panel-minimized');
            }
        },
        // Search functions
        toggleSearch: toggleSearch,
        closeSearch: closeSearch,
        searchNext: searchNext,
        searchPrevious: searchPrevious
    });

    // Listener for text selection (highlighting)
    document.addEventListener('mouseup', handleHighlightSelection);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+F or Cmd+F to toggle search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
    });

    // Search input listener
    document.getElementById('searchInput').addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    // Close drive options when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('driveOptions');
        const driveBtn = document.getElementById('driveSaveMenu');
        if (menu && !menu.contains(e.target) && driveBtn && !driveBtn.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    // Exposar funcions de Drive
    Object.assign(window.app, {
        handleAuthClick: handleAuthClick,
        saveToDrive: saveToDrive
    });
}

// --- CORE LOGIC ---

async function loadPdfFile(file) {
    showLoader("Carregant document...");
    try {
        appState.fileName = file.name;
        document.getElementById('docTitle').innerText = file.name;

        const arrayBuffer = await file.arrayBuffer();
        appState.pdfBytes = new Uint8Array(arrayBuffer);
        appState.pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        // Reset state
        appState.selectedPages.clear();
        await extractExistingNotes();
        await extractTextAnnotations();
        await detectSignatures();

        updateUI();
        await renderSidebar();
        await renderMainView();
    } catch (e) { showAlert("Error: " + e.message); }
    finally { hideLoader(); }
}

async function renderMainView() {
    if (!appState.pdfDoc) return;
    const wrapper = document.getElementById('pagesWrapper');
    wrapper.innerHTML = '';

    const pdfjsDoc = await pdfjsLib.getDocument({ data: await appState.pdfDoc.save() }).promise;
    const numPages = pdfjsDoc.numPages;
    // document.getElementById('totalPageNum').innerText = numPages; // Handled by helper now
    updatePageNumberDisplay();
    updateNotesPanel();

    if (appState.viewMode === 'single') {
        renderSinglePage(pdfjsDoc, wrapper);
        // document.getElementById('pageNavControls').style.pointerEvents = 'auto'; // Footer removed
        // document.getElementById('pageNavControls').classList.remove('opacity-0');
        // Use justify-start to avoid top clipping when zoomed, and allow margins to center the content
        wrapper.className = "flex flex-col items-center justify-start min-h-full w-full py-8";
    } else if (appState.viewMode === 'two-page') {
        // document.getElementById('pageNavControls').style.pointerEvents = 'auto';
        // document.getElementById('pageNavControls').classList.remove('opacity-0');
        wrapper.className = "flex flex-wrap justify-center content-start gap-4 p-8";

        // Render 2 pages relative to currentPage
        // Always show pages in pairs: [currentPage, currentPage+1] ? Usually 1-2, 3-4.
        // Let's align to even numbers logic or just current + next. 
        // Acrobat style: Cover (1), then 2-3, 4-5. 
        // Simple logic: Render appState.currentPage and +1 (if exists)

        const renderIndices = [appState.currentPage];
        if (appState.currentPage + 1 < numPages) renderIndices.push(appState.currentPage + 1);

        for (let i of renderIndices) {
            const container = document.createElement('div');
            container.className = "relative bg-white shadow-lg page-container";
            wrapper.appendChild(container);

            const canvas = document.createElement('canvas');
            container.appendChild(canvas);

            pdfjsDoc.getPage(i + 1).then(page => {
                const viewport = page.getViewport({ scale: appState.zoom * 1.0 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(() => {
                    renderNotesOverlay(container, viewport, i);
                    renderTextAnnotationsOverlay(container, viewport, i);
                });
            });
        }
        // document.getElementById('currentPageNum').innerText = `${appState.currentPage + 1}-${Math.min(appState.currentPage + 2, numPages)}`;
        updatePageNumberDisplay();

    } else { // Continuous
        // document.getElementById('pageNavControls').style.pointerEvents = 'none';
        // document.getElementById('pageNavControls').classList.add('opacity-0');
        wrapper.className = "flex flex-col items-center gap-4 py-10 min-w-min mx-auto";

        // Get first page to determine base scale for mobile
        const firstPage = await pdfjsDoc.getPage(1);
        const unscaledVp = firstPage.getViewport({ scale: 1 });
        let baseScale = 1.5; // Desktop default

        if (window.innerWidth < 768) {
            const containerW = document.getElementById('mainArea').offsetWidth;
            baseScale = (containerW - 32) / unscaledVp.width; // 32px padding
        }

        for (let i = 1; i <= numPages; i++) {
            (function (idx) {
                const container = document.createElement('div');
                container.className = "relative bg-white shadow-lg page-container";
                // Don't set min-height - let it be determined by canvas size

                wrapper.appendChild(container);

                const canvas = document.createElement('canvas');
                container.appendChild(canvas);

                pdfjsDoc.getPage(idx).then(async page => {
                    const viewport = page.getViewport({ scale: appState.zoom * baseScale });
                    const displayScale = appState.zoom * baseScale;

                    // Canvas sizing - High DPI aware logic is missing here in original, keeping original style scaling
                    // Original: 
                    // canvas.width = viewport.width; canvas.height = viewport.height;
                    // canvas.style.width = `${viewport.width / 1.5}px`... suspicious.
                    // The original code was dividing by 1.5 in style, but viewport was * 1.5? 
                    // Meaning internal resolution was 1.5x visual size (good for quality).
                    // We should preserve this "high quality render" logic.
                    // Visual Size = appState.zoom * baseScale (visual)
                    // Render Size = Visual Size * outputScale (usually 1.5 or 2 for quality)

                    // Original code:
                    // viewport = page.getViewport({ scale: appState.zoom * 1.5 });
                    // canvas.style.width = `${viewport.width / 1.5}px`;
                    // So effective visual scale was `appState.zoom`.

                    // New Logic:
                    // We want visual scale to be baseScale * appState.zoom.
                    // So Render Scale = (baseScale * appState.zoom) * 1.5 (quality factor).

                    const visualScale = baseScale * appState.zoom;
                    const qualityFactor = 1.5;
                    const renderViewport = page.getViewport({ scale: visualScale * qualityFactor });

                    canvas.height = renderViewport.height;
                    canvas.width = renderViewport.width;
                    canvas.style.width = `${renderViewport.width / qualityFactor}px`;
                    canvas.style.height = `${renderViewport.height / qualityFactor}px`;

                    // Set container size to match canvas
                    container.style.width = canvas.style.width;
                    container.style.height = canvas.style.height;

                    // Text Layer
                    const textLayerDiv = document.createElement('div');
                    textLayerDiv.className = "textLayer";
                    textLayerDiv.dataset.pageIndex = idx - 1;
                    // Store the visual scale for later use in highlight calculations
                    textLayerDiv.dataset.visualScale = visualScale;
                    textLayerDiv.style.width = canvas.style.width;
                    textLayerDiv.style.height = canvas.style.height;
                    container.appendChild(textLayerDiv);

                    const textContent = await page.getTextContent();
                    const textViewport = page.getViewport({ scale: visualScale });
                    pdfjsLib.renderTextLayer({
                        textContent: textContent,
                        container: textLayerDiv,
                        viewport: textViewport,
                        textDivs: []
                    });

                    page.render({ canvasContext: canvas.getContext('2d'), viewport: renderViewport }).promise.then(() => {
                        renderNotesOverlay(container, textViewport, idx - 1);
                        renderTextAnnotationsOverlay(container, textViewport, idx - 1);
                    });
                });
            })(i);
        }
    }
}

async function renderSinglePage(pdfjsDoc, wrapper) {
    const i = appState.currentPage;

    // Container Relatiu per als layers
    const container = document.createElement('div');
    container.className = "relative shadow-2xl my-auto";
    wrapper.appendChild(container);

    const canvas = document.createElement('canvas'); // PDF Layer
    canvas.className = "bg-white block";
    container.appendChild(canvas);

    const page = await pdfjsDoc.getPage(i + 1);

    // Calcular escala per ajustar (fit)
    const containerW = document.getElementById('mainArea').offsetWidth;
    const containerH = document.getElementById('mainArea').offsetHeight;

    const unscaledVp = page.getViewport({ scale: 1 });
    const scaleX = (containerW - 80) / unscaledVp.width; // 80px padding
    const scaleY = (containerH - 80) / unscaledVp.height;

    // Fit Best (però respectant zoom)
    // Si zoom és 1 (defecte), fem "fit best" inicialment? O "fit width"? 
    // Mantenim lògica: zoom 1 = scale 1 (mida real)? No, `appState.zoom` és multiplicador.
    // Canvi: BaseScale serà 1.5, i appState.zoom multiplica això.
    // O millor:
    const fitScale = (window.innerWidth < 768)
        ? scaleX  // Mobile: Fit Width
        : Math.min(scaleX, scaleY); // Desktop: Fit Best (Page)

    const finalScale = fitScale * appState.zoom;

    const viewport = page.getViewport({ scale: finalScale });

    // HiDPI Scaling for Single View
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + "px";
    canvas.style.height = Math.floor(viewport.height) + "px";

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    // Text Layer (Selection)
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = "textLayer";
    textLayerDiv.dataset.pageIndex = i;
    // Store the visual scale for later use in highlight calculations
    textLayerDiv.dataset.visualScale = finalScale;
    textLayerDiv.style.width = canvas.style.width;
    textLayerDiv.style.height = canvas.style.height;
    container.appendChild(textLayerDiv);

    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    });

    // Annotation Layer (Forms)
    const annotLayerDiv = document.createElement('div');
    annotLayerDiv.className = "annotationLayer";
    annotLayerDiv.style.width = viewport.width + 'px';
    annotLayerDiv.style.height = viewport.height + 'px';
    container.appendChild(annotLayerDiv);

    // Render Annotations
    const annotations = await page.getAnnotations();
    // Filtrem les notes de tipus 'Text' perquè les renderitzem nosaltres i així evitem l'icona d'error
    const filteredAnnotations = annotations.filter(a => a.subtype !== 'Text');

    const annotationLayer = new pdfjsLib.AnnotationLayer({
        div: annotLayerDiv,
        accessibilityManager: null,
        page: page,
        viewport: viewport.clone({ dontFlip: true }),
    });

    // Mock Link Service
    const mockLinkService = {
        externalLinkTarget: 2,
        externalLinkRel: 'noopener noreferrer ignore',
        externalLinkEnabled: true,
        addLinkAttributes: (link, url, newWindow) => {
            link.href = url;
            link.target = newWindow ? '_blank' : '_self';
            link.rel = 'noopener noreferrer';
        },
        getDestinationHash: () => null,
        getAnchorUrl: () => '#',
        setHash: () => { },
        executeNamedAction: () => { },
        cachePageRef: () => { },
        isInitialBookmark: () => false,
        page: 0
    };

    await annotationLayer.render({
        annotations: filteredAnnotations,
        renderInteractiveForms: true,
        linkService: mockLinkService
    });

    // Render Page Content (with HiDPI transform)
    const renderContext = {
        canvasContext: canvas.getContext('2d'),
        viewport: viewport,
        transform: transform
    };
    await page.render(renderContext).promise;

    // Overlays
    renderNotesOverlay(container, viewport, i);
    renderTextAnnotationsOverlay(container, viewport, i);

    // Bind Events & Restore Values
    setTimeout(() => {
        annotLayerDiv.querySelectorAll('input, textarea, select').forEach(input => {
            const name = input.name;
            if (!name) return;

            // Restaurar valor conegut
            if (appState.formValues[name] !== undefined) {
                if (input.type === 'checkbox' || input.type === 'radio') input.checked = appState.formValues[name];
                else input.value = appState.formValues[name];
            }

            // Escoltar canvis
            input.addEventListener('change', (e) => {
                const val = (e.target.type === 'checkbox' || e.target.type === 'radio') ? e.target.checked : e.target.value;
                appState.formValues[name] = val;
                // Opcional: Actualitzar pdf-lib en temps real o només al final?
                // Millor al final (download/save) per rendiment.
            });
        });
    }, 100);

    // Ink Layer (només si estem en single view...)
    const inkCanvas = document.createElement('canvas');
    inkCanvas.id = "inkCanvas";
    inkCanvas.className = "absolute inset-0 z-10 hidden touch-none cursor-crosshair"; // Hidden per defecte
    inkCanvas.width = viewport.width;
    inkCanvas.height = viewport.height;
    // Guardar factors d'escala per mapping invers
    inkCanvas.dataset.scale = finalScale;
    inkCanvas.dataset.vpH = viewport.height;

    container.appendChild(inkCanvas);

    // Esdeveniments Dibuix
    inkCanvas.addEventListener('mousedown', startInk);
    inkCanvas.addEventListener('mousemove', drawInk);
    inkCanvas.addEventListener('mouseup', endInk);
    inkCanvas.addEventListener('mouseleave', endInk);
    inkCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startInk(e.touches[0]) }, { passive: false });
    inkCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); drawInk(e.touches[0]) }, { passive: false });
    inkCanvas.addEventListener('touchend', endInk);

    if (appState.isDrawingMode) {
        inkCanvas.classList.remove('hidden');
        // Controls visibility managed by toggleDrawingMode/Sidebar logic
    }

    updateSidebarUI();
    updatePageNumberDisplay();
}

function updatePageNumberDisplay() {
    const current = appState.currentPage + 1;
    const total = appState.pdfDoc ? appState.pdfDoc.getPageCount() : 0;

    // Old/Footer Elements (check existence)
    const elCur = document.getElementById('currentPageNum');
    if (elCur) elCur.innerText = appState.viewMode === 'two-page' ? `${current}-${Math.min(current + 1, total)}` : current;
    const elTot = document.getElementById('totalPageNum');
    if (elTot) elTot.innerText = total;

    // Header Elements
    const hCur = document.getElementById('currentPageNumHeader');
    // Adapt to Input
    const hInput = document.getElementById('currentPageInput');
    if (hInput) hInput.value = current; // Reset to single page logic mostly. Two-page complex?

    // Fallback for View Mode two-page? 
    if (appState.viewMode === 'two-page' && hInput) {
        hInput.value = current; // Start page
    } else if (hCur) {
        hCur.innerText = appState.viewMode === 'two-page' ? `${current}-${Math.min(current + 1, total)}` : current;
    }

    const hTot = document.getElementById('totalPageNumHeader');
    if (hTot) hTot.innerText = total;

    // Mobile Display
    const mDisplay = document.getElementById('mobilePageDisplay');
    if (mDisplay) mDisplay.innerText = `${current} / ${total}`;
}

async function renderSidebar(scrollToPage = true) {
    const container = document.getElementById('thumbnailsContainer');
    const scrollPos = container.scrollTop; // Save scroll position
    container.innerHTML = '';
    const pdfjsDoc = await pdfjsLib.getDocument({ data: await appState.pdfDoc.save() }).promise;
    document.getElementById('pageCount').innerText = pdfjsDoc.numPages;

    updateSidebarHeader(); // Mostrar/Ocultar eines de selecció

    for (let i = 0; i < pdfjsDoc.numPages; i++) {
        const div = document.createElement('div');
        div.className = `thumbnail-card relative mb-4 p-1 group flex flex-col items-center`;

        // Wrapper for overlay effects & checkbox
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = `relative cursor-pointer rounded transition border-2 w-full ${appState.selectedPages.has(i) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-slate-300'}`;

        // Classes dinàmiques originals (active page visual)
        if (i === appState.currentPage) thumbWrapper.classList.add('ring-1', 'ring-slate-400');

        thumbWrapper.onclick = (e) => {
            // Avoid double trigger if clicking checkbox logic bubbles up differently
            if (e.target.type !== 'checkbox') handleThumbnailClick(e, i);
        };

        // Checkbox for selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = "absolute top-2 left-2 z-10 w-5 h-5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 shadow-sm opacity-50 group-hover:opacity-100 checked:opacity-100 transition-opacity";
        checkbox.checked = appState.selectedPages.has(i);
        checkbox.onclick = (e) => {
            e.stopPropagation(); // Prevent navigation when just selecting
            togglePageSelection(i, checkbox.checked);
        };

        // Only show checkbox if NOT signed (or if signed documents allowed selection? user asked for selection visuals)
        if (!appState.isSigned) thumbWrapper.appendChild(checkbox);

        const canvas = document.createElement('canvas');
        canvas.className = "w-full h-auto bg-white pointer-events-none";
        thumbWrapper.appendChild(canvas);

        div.appendChild(thumbWrapper);

        const label = document.createElement('div');
        label.className = "text-xs text-gray-500 mt-1 pointer-events-none";
        label.innerText = `Pàg ${i + 1}`;
        div.appendChild(label);

        container.appendChild(div);

        // Render Thumb Async
        pdfjsDoc.getPage(i + 1).then(page => {
            const vp = page.getViewport({ scale: 0.3 });
            canvas.height = vp.height;
            canvas.width = vp.width;
            page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        });
    }

    if (scrollToPage) {
        const thumb = document.querySelectorAll('.thumbnail-card')[appState.currentPage];
        if (thumb) thumb.scrollIntoView({ behavior: "auto", block: "center" });
    }
    lucide.createIcons();
}

// --- LÒGICA DE SELECCIÓ ---

function togglePageSelection(pageIndex, forceState = null) {
    if (appState.isSigned) return;

    if (forceState !== null) {
        if (forceState) appState.selectedPages.add(pageIndex);
        else appState.selectedPages.delete(pageIndex);
    } else {
        if (appState.selectedPages.has(pageIndex)) appState.selectedPages.delete(pageIndex);
        else appState.selectedPages.add(pageIndex);
    }
    appState.lastClickedIndex = pageIndex;
    updateSidebarHeader();
    appState.lastClickedIndex = pageIndex;
    updateSidebarUI();
}

function handleThumbnailClick(e, index) {
    if (appState.isSigned) { // Si està firmat, només navegació simple
        appState.currentPage = index;
        if (appState.viewMode === 'continuous') {
            const containers = document.querySelectorAll('#pagesWrapper .page-container');
            if (containers[index]) {
                appState.isManualScrolling = true;
                containers[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => { appState.isManualScrolling = false; }, 800);
            }
            updatePageNumberDisplay();
        } else {
            renderMainView();
        }
        updateSidebarUI();
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        togglePageSelection(index);
    } else if (e.shiftKey && appState.lastClickedIndex !== null) {
        // Range Selection works as before
        const start = Math.min(appState.lastClickedIndex, index);
        const end = Math.max(appState.lastClickedIndex, index);
        appState.selectedPages.clear();
        for (let i = start; i <= end; i++) appState.selectedPages.add(i);
        updateSidebarUI();
    } else {
        // Standard Explorer: Select single (clear others) and Navigate.
        appState.currentPage = index;
        appState.selectedPages.clear();
        appState.selectedPages.add(index);
        appState.lastClickedIndex = index;

        if (appState.viewMode === 'continuous') {
            const containers = document.querySelectorAll('#pagesWrapper .page-container');
            if (containers[index]) {
                appState.isManualScrolling = true;
                containers[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => { appState.isManualScrolling = false; }, 800);
            }
            updatePageNumberDisplay();
        } else {
            renderMainView();
        }
        updateSidebarUI();
    }
}

function updateSidebarHeader() {
    const count = appState.selectedPages.size;
    const defaultHeader = document.getElementById('sidebarHeaderDefault');
    const selHeader = document.getElementById('sidebarHeaderSelection');

    if (count > 0 && !appState.isSigned) {
        defaultHeader.classList.add('hidden');
        selHeader.classList.remove('hidden');
        document.getElementById('selectedCount').innerText = count;
    } else {
        defaultHeader.classList.remove('hidden');
        selHeader.classList.add('hidden');
    }
}

function updateSidebarUI() {
    const cards = document.querySelectorAll('.thumbnail-card');
    cards.forEach((card, i) => {
        const wrapper = card.querySelector('div');
        if (!wrapper) return;
        const checkbox = wrapper.querySelector('input[type="checkbox"]');

        // 1. Current Page Highlight
        if (i === appState.currentPage) {
            wrapper.classList.add('ring-1', 'ring-slate-400');
        } else {
            wrapper.classList.remove('ring-1', 'ring-slate-400');
        }

        // 2. Selection Highlight
        if (appState.selectedPages.has(i)) {
            wrapper.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');
            wrapper.classList.remove('border-transparent', 'hover:border-slate-300');
            if (checkbox) checkbox.checked = true;
        } else {
            wrapper.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');
            wrapper.classList.add('border-transparent', 'hover:border-slate-300');
            if (checkbox) checkbox.checked = false;
        }
    });
    updateSidebarHeader();
}

function clearSelection() {
    appState.selectedPages.clear();
    renderSidebar();
}

// --- EDICIÓ EN BLOC (MULTI) ---

async function deleteSelected() {
    if (appState.selectedPages.size === 0) return;
    if (!confirm(`Esborrar ${appState.selectedPages.size} pàgines?`)) return;

    await pushHistory(); // Save state before delete
    showLoader("Esborrant...");

    // Convertir a array i ordenar descendentment (molt important per no alterar índexs mentre esborrem)
    const indices = Array.from(appState.selectedPages).sort((a, b) => b - a);

    indices.forEach(idx => {
        appState.pdfDoc.removePage(idx);
    });

    // Reset state
    appState.selectedPages.clear();
    appState.currentPage = 0;

    appState.currentPage = 0;

    await commitChanges(); // Update indices via Bake logic
    hideLoader();
}

async function moveSelected(direction) {
    // direction: -1 (Up), 1 (Down)
    const sel = Array.from(appState.selectedPages).sort((a, b) => a - b);
    if (sel.length === 0) return;

    // Validacions de límits
    const total = appState.pdfDoc.getPageCount();
    if (direction === -1 && sel[0] === 0) return; // Top
    if (direction === 1 && sel[sel.length - 1] === total - 1) return; // Bottom

    if (direction === -1 && sel[0] === 0) return; // Top
    if (direction === 1 && sel[sel.length - 1] === total - 1) return; // Bottom

    await pushHistory();
    showLoader("Movent...");

    // Per moure un bloc, el més segur en PDF-Lib sense corrompre referències és:
    // 1. Copiar les pàgines seleccionades
    // 2. Inserir-les a la nova posició
    // 3. Esborrar les velles.

    // Identificar el punt d'inserció.
    // Si movem AMUNT, el punt d'inserció és l'índex de la primera pàgina seleccionada - 1.
    // Si movem AVALL, el punt d'inserció és l'índex de la última pàgina + 2 (per compensar).
    // Aquest mètode complex pot ser lent.

    // MÈTODE SWAP ITERATIU (Més segur per mantenir selecció i menys conflictes)
    // Si movem amunt: Iterem de dalt a baix (0..N). Movem cada pàgina i-1.
    // Si movem avall: Iterem de baix a dalt (N..0). Movem cada pàgina i+1.

    const newSelection = new Set();

    if (direction === -1) { // UP
        // Processar en ordre ascendent (0, 1, 2...)
        for (let i of sel) {
            // Movem la pàgina 'i' a 'i-1'
            const [page] = await appState.pdfDoc.copyPages(appState.pdfDoc, [i]);
            appState.pdfDoc.insertPage(i - 1, page);
            appState.pdfDoc.removePage(i + 1); // L'original s'ha desplaçat un lloc
            newSelection.add(i - 1);
        }
    } else { // DOWN
        // Processar en ordre descendent per no alterar els indexs que falten per moure
        for (let i = sel.reverse(); i < sel.length; i++) { /*...*/ }
        // JavaScript forEach no va en reverse fàcil. Usem for of reversed.
        for (let i of sel) { // sel ja està invertit perquè hem fet reverse() adalt? No, sort retorna array.
            // Tornem a ordenar descendent
        }
        const selDesc = sel.sort((a, b) => b - a);
        for (let i of selDesc) {
            // Moure pàgina 'i' a 'i+1'.
            // Inserim a i+2 (perquè volem que quedi després de la següent)
            const [page] = await appState.pdfDoc.copyPages(appState.pdfDoc, [i]);
            appState.pdfDoc.insertPage(i + 2, page);
            appState.pdfDoc.removePage(i); // L'original és a 'i'
            newSelection.add(i + 1);
        }
    }

    appState.selectedPages = newSelection;
    await commitChanges();

    hideLoader();
}

async function rotateSelected(angle) {
    if (appState.selectedPages.size === 0) return;
    await pushHistory();
    showLoader("Rotant...");

    try {
        const indices = Array.from(appState.selectedPages);
        indices.forEach(idx => {
            const page = appState.pdfDoc.getPage(idx);
            const currentRotation = page.getRotation().angle;
            page.setRotation(degrees(currentRotation + angle));
        });

        await commitChanges();
    } catch (e) { showAlert(e.message); }
    finally { hideLoader(); }
}

async function extractSelected() {
    if (appState.selectedPages.size === 0) return;
    showLoader("Extraient...");

    try {
        const indices = Array.from(appState.selectedPages).sort((a, b) => a - b);
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(appState.pdfDoc, indices);

        copiedPages.forEach(page => newPdf.addPage(page));

        const saveName = appState.fileName.replace('.pdf', '') + '_extracted.pdf';
        const data = await newPdf.save();

        // Descarregar
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = saveName;
        a.click();

        appState.selectedPages.clear();
        renderSidebar();
        showAlert("Pàgines extretes correctament");
    } catch (e) { showAlert(e.message); }
    finally { hideLoader(); }
}

// Helpers
const { degrees } = PDFLib; // degrees helper is needed for rotation

// --- ALTRES FUNCIONS (Insert, Refresh...) ---

function triggerMerge() {
    // document.getElementById('insertModal').classList.add('hidden'); // Sidebar stays open 
    document.getElementById('mergePdfInput').click();
}

async function processMerge(file) {
    showLoader("Fusionant...");
    try {
        const mergeBytes = await file.arrayBuffer();
        const mergeDoc = await PDFDocument.load(mergeBytes);
        const copiedPages = await appState.pdfDoc.copyPages(mergeDoc, mergeDoc.getPageIndices());

        const pos = document.querySelector('input[name="insertPos"]:checked').value;
        let insertIdx = (pos === 'before' || pos === 'replace') ? appState.currentPage : appState.currentPage + 1;
        // If replace, track index to remove (original page is pushed down by inserted pages)
        // Original page was at insertIdx. It will be at insertIdx + copiedPages.length.
        const originalIndexShifted = (pos === 'replace') ? insertIdx + copiedPages.length : -1;

        for (const page of copiedPages) {
            appState.pdfDoc.insertPage(insertIdx, page);
            insertIdx++;
        }

        if (pos === 'replace') {
            appState.pdfDoc.removePage(originalIndexShifted);
        }

        await refreshAll();
    } catch (e) { showAlert(e.message); }
    finally { hideLoader(); }
}

async function refreshAll() {
    await renderSidebar();
    await renderMainView();
}

async function bakeNotes() {
    // TODO: Implement logic to bake notes into the PDF
    console.log("Baking notes...");
}

async function commitChanges() {
    // Strategy: Bake changes into a fresh PDFDocument to ensure "layers" are saved
    showLoader("Processant canvis...");
    try {
        // Save scroll position
        const mainScroll = document.getElementById('mainScroll');
        const scrollTop = mainScroll ? mainScroll.scrollTop : 0;

        // Delay Note baking until Download to keep them editable during session
        // if (appState.notes.length > 0) await bakeNotes();

        const bytes = await appState.pdfDoc.save();
        appState.pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

        // Re-extract annotations from the fresh PDF to ensure indices/refs are correct
        await extractTextAnnotations();

        await refreshAll();

        // Restore scroll position
        if (mainScroll) {
            setTimeout(() => {
                mainScroll.scrollTop = scrollTop;
            }, 100);
        }

        updateUndoRedoUI();
    } catch (e) { /* ... */ } finally { hideLoader(); }
}

async function pushHistory() {
    try {
        const bytes = await appState.pdfDoc.save();
        appState.history.push(bytes);
        if (appState.history.length > appState.maxHistory) appState.history.shift();
        appState.redoStack = []; // Clear redo on new action
        updateUndoRedoUI();
    } catch (e) { console.error("History push failed", e); }
}

async function undo() {
    if (appState.history.length === 0) return;
    showLoader("Desfent...");
    try {
        const currentBytes = await appState.pdfDoc.save();
        appState.redoStack.push(currentBytes);

        const prevBytes = appState.history.pop();
        appState.pdfDoc = await PDFDocument.load(prevBytes, { ignoreEncryption: true });

        await refreshAll();
        updateUndoRedoUI();
    } catch (e) { showAlert("Error undo: " + e.message); }
    finally { hideLoader(); }
}

async function redo() {
    if (appState.redoStack.length === 0) return;
    showLoader("Refent...");
    try {
        const currentBytes = await appState.pdfDoc.save();
        appState.history.push(currentBytes);

        const nextBytes = appState.redoStack.pop();
        appState.pdfDoc = await PDFDocument.load(nextBytes, { ignoreEncryption: true });

        await refreshAll();
        updateUndoRedoUI();
    } catch (e) { showAlert("Error redo: " + e.message); }
    finally { hideLoader(); }
}

function updateUndoRedoUI() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (!undoBtn || !redoBtn) return;

    undoBtn.disabled = appState.history.length === 0;
    redoBtn.disabled = appState.redoStack.length === 0;

    undoBtn.classList.toggle('opacity-50', appState.history.length === 0);
    redoBtn.classList.toggle('opacity-50', appState.redoStack.length === 0);
    undoBtn.classList.toggle('cursor-not-allowed', appState.history.length === 0);
    redoBtn.classList.toggle('cursor-not-allowed', appState.redoStack.length === 0);
}

// --- UTILITATS INTERFICIE ---

function changeZoom(delta) {
    const mainScroll = document.getElementById('mainScroll');

    // Save current scroll position and dimensions
    const oldZoom = appState.zoom;
    const scrollLeft = mainScroll.scrollLeft;
    const scrollTop = mainScroll.scrollTop;
    const scrollWidth = mainScroll.scrollWidth;
    const scrollHeight = mainScroll.scrollHeight;
    const clientWidth = mainScroll.clientWidth;
    const clientHeight = mainScroll.clientHeight;

    // Calculate center point of viewport
    const centerX = scrollLeft + clientWidth / 2;
    const centerY = scrollTop + clientHeight / 2;

    // Calculate relative position (0 to 1)
    const relativeX = scrollWidth > 0 ? centerX / scrollWidth : 0.5;
    const relativeY = scrollHeight > 0 ? centerY / scrollHeight : 0.5;

    // Update zoom
    appState.zoom = Math.max(0.5, Math.min(3.0, appState.zoom + delta));
    document.getElementById('zoomDisplay').innerText = Math.round(appState.zoom * 100) + "%";

    // Re-render with new zoom
    renderMainView();

    // Restore scroll position after render completes
    setTimeout(() => {
        const newScrollWidth = mainScroll.scrollWidth;
        const newScrollHeight = mainScroll.scrollHeight;

        // Calculate new center position
        const newCenterX = relativeX * newScrollWidth;
        const newCenterY = relativeY * newScrollHeight;

        // Set scroll to keep center point in same place
        mainScroll.scrollLeft = newCenterX - clientWidth / 2;
        mainScroll.scrollTop = newCenterY - clientHeight / 2;
    }, 50);
}

function toggleViewMode() {
    const modes = ['continuous', 'single', 'two-page'];
    const currentIdx = modes.indexOf(appState.viewMode);
    appState.viewMode = modes[(currentIdx + 1) % modes.length];

    // Update Icon / Text
    const btn = document.getElementById('viewModeBtn');
    if (appState.viewMode === 'continuous') {
        btn.innerHTML = '<i data-lucide="scroll-text" class="w-5 h-5"></i>';
        btn.title = "Vista Contínua";
    } else if (appState.viewMode === 'single') {
        btn.innerHTML = '<i data-lucide="file" class="w-5 h-5"></i>';
        btn.title = "Pàgina Única";
    } else {
        btn.innerHTML = '<i data-lucide="book-open" class="w-5 h-5"></i>';
        btn.title = "Dues Pàgines";
    }
    lucide.createIcons();

    // Reset zoom for comfort
    if (appState.viewMode === 'two-page') appState.zoom = 0.6;
    else if (appState.viewMode === 'single') appState.zoom = 1.0;
    else appState.zoom = 1.0;

    document.getElementById('zoomDisplay').innerText = Math.round(appState.zoom * 100) + "%";

    renderMainView();
}

function changePage(delta) {
    let step = delta;
    if (appState.viewMode === 'two-page') step = delta * 2;

    const newIdx = appState.currentPage + step;
    if (newIdx >= 0 && newIdx < appState.pdfDoc.getPageCount()) {
        appState.currentPage = newIdx;
        appState.selectedPages.clear();
        appState.selectedPages.add(newIdx);

        if (appState.viewMode === 'continuous') {
            const containers = document.querySelectorAll('#pagesWrapper .page-container');
            if (containers[newIdx]) {
                appState.isManualScrolling = true;
                containers[newIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Unlock after animation approx time
                setTimeout(() => { appState.isManualScrolling = false; }, 800);
            }
            updateSidebarUI();
            updatePageNumberDisplay();
        } else {
            renderMainView();
            updateSidebarUI();
        }
    }
}

function goToPage(val) {
    if (!appState.pdfDoc) return;
    let pageNum = parseInt(val);
    const total = appState.pdfDoc.getPageCount();

    if (isNaN(pageNum) || pageNum < 1 || pageNum > total) {
        updatePageNumberDisplay(); // Reset
        return showAlert(`Pàgina invàlida. (1-${total})`);
    }

    pageNum = Math.max(1, Math.min(total, pageNum));
    const newIdx = pageNum - 1;

    // Only proceed if changed
    if (appState.currentPage === newIdx && appState.viewMode !== 'continuous') return;

    appState.currentPage = newIdx;
    appState.selectedPages.clear();
    appState.selectedPages.add(newIdx);

    if (appState.viewMode === 'continuous') {
        const containers = document.querySelectorAll('#pagesWrapper .page-container');
        if (containers[newIdx]) {
            appState.isManualScrolling = true;
            containers[newIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => { appState.isManualScrolling = false; }, 800);
        }
        updateSidebarUI();
        updatePageNumberDisplay();
    } else {
        renderMainView();
        updateSidebarUI();
    }
}

function handleScroll() {
    if (appState.viewMode !== 'continuous') return;
    if (appState.isManualScrolling) return; // Ignore scroll events during manual navigation

    const container = document.getElementById('mainScroll');
    const scrollCenter = container.scrollTop + (container.clientHeight / 2);

    const canvases = document.querySelectorAll('#pagesWrapper .page-container'); // Use container instead of canvas for better stability
    canvases.forEach((cv, idx) => {
        if (cv.offsetTop <= scrollCenter && (cv.offsetTop + cv.offsetHeight) >= scrollCenter) {
            if (appState.currentPage !== idx) {
                appState.currentPage = idx;
                updateSidebarUI(); // Optimize? This might be heavy on scroll.
                updatePageNumberDisplay();
            }
        }
    });
}

// --- SELECCIÓ VISUAL ---

async function activateSelectionMode(mode) {
    appState.selectionMode = mode;
    document.getElementById('selectionOverlay').classList.remove('hidden');
    document.getElementById('selectionOverlay').classList.remove('hidden');
    // document.getElementById('signatureModal').classList.add('hidden'); // Handled by panel logic
    // document.getElementById('textToolsModal').classList.add('hidden');
    // closeSidePanel(); // Optional: hide panel while selecting? Or keep it open?
    // Let's keep it open so user sees context.

    const bgCanvas = document.getElementById('selectionBgCanvas');
    const ovCanvas = document.getElementById('selectionCanvas');

    const pdfjsDoc = await pdfjsLib.getDocument({ data: await appState.pdfDoc.save() }).promise;
    const page = await pdfjsDoc.getPage(appState.currentPage + 1);

    // Calculate appropriate scale for mobile
    let scale = 1.5; // Desktop default
    if (window.innerWidth < 768) {
        const unscaledVp = page.getViewport({ scale: 1 });
        scale = (window.innerWidth - 40) / unscaledVp.width; // Fit width with padding
    }

    const viewport = page.getViewport({ scale: scale });

    bgCanvas.width = viewport.width;
    bgCanvas.height = viewport.height;
    ovCanvas.width = viewport.width;
    ovCanvas.height = viewport.height;
    ovCanvas.dataset.origW = page.getViewport({ scale: 1 }).width;
    ovCanvas.dataset.origH = page.getViewport({ scale: 1 }).height;

    await page.render({ canvasContext: bgCanvas.getContext('2d'), viewport: viewport }).promise;
    ovCanvas.getContext('2d').clearRect(0, 0, ovCanvas.width, ovCanvas.height);
}

let isSelecting = false, startX, startY;

function startSelection(e) {
    const canvas = document.getElementById('selectionCanvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    startX = (clientX - rect.left) * scaleX;
    startY = (clientY - rect.top) * scaleY;
    isSelecting = true;
    appState.selectionRect = { x: startX, y: startY, w: 0, h: 0 };
}

function drawSelection(e) {
    if (!isSelecting) return;
    const canvas = document.getElementById('selectionCanvas');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    const currX = (clientX - rect.left) * scaleX;
    const currY = (clientY - rect.top) * scaleY;
    appState.selectionRect.w = currX - startX;
    appState.selectionRect.h = currY - startY;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = appState.selectionMode === 'text' ? 'blue' : 'red';
    ctx.lineWidth = 4;
    ctx.strokeRect(startX, startY, appState.selectionRect.w, appState.selectionRect.h);
    ctx.fillStyle = appState.selectionMode === 'text' ? 'rgba(0,0,255,0.2)' : 'rgba(255,0,0,0.2)';
    ctx.fillRect(startX, startY, appState.selectionRect.w, appState.selectionRect.h);
}

function endSelection() {
    isSelecting = false;
    let r = appState.selectionRect;
    if (r.w < 0) { r.x += r.w; r.w = Math.abs(r.w); }
    if (r.h < 0) { r.y += r.h; r.h = Math.abs(r.h); }
}

function confirmSelection() {
    const r = appState.selectionRect;
    if (!r || r.w < 5) return showAlert("Selecció no vàlida");
    const cv = document.getElementById('selectionCanvas');
    const scaleX = cv.dataset.origW / cv.width;
    const scaleY = cv.dataset.origH / cv.height;
    const pdfH = parseFloat(cv.dataset.origH);
    const finalRect = { x: r.x * scaleX, y: pdfH - ((r.y + r.h) * scaleY), w: r.w * scaleX, h: r.h * scaleY };

    document.getElementById('selectionOverlay').classList.add('hidden');
    if (appState.selectionMode === 'text') {
        appState.tempTextRect = finalRect;
        // Text modal removed, ensure sidebar panel is open
        if (appState.activeTool !== 'text') toggleTool('text');

        document.getElementById('pdfTextInput').value = '';
        document.getElementById('pdfTextInput').focus();
    } else {
        appState.signatureConfig = { isDefined: true, pageIndex: appState.currentPage, rect: finalRect };
        // Signature modal removed, ensure sidebar panel is open
        if (appState.activeTool !== 'signature') toggleTool('signature');

        document.getElementById('posSummary').innerHTML = `<span class="text-green-600 font-bold">Àrea Ok!</span> (Pàg ${appState.currentPage + 1})`;
        // document.getElementById('configDot').classList.remove('hidden'); // Removed visual dot?
    }
    appState.selectionRect = null;
    appState.selectionMode = null;
}

function closeSelectionMode() {
    document.getElementById('selectionOverlay').classList.add('hidden');
    // if (appState.selectionMode === 'signature') document.getElementById('signatureModal').classList.remove('hidden'); // No modal to restore
    appState.selectionMode = null;
}

// --- DRAWING (INK) ---

// --- DRAWING (INK) ---
// Note: toggleDrawingMode is now handled by toggleTool('draw')
// Logic moved to toggleTool


async function clearDrawing() {
    if (appState.allPaths.length === 0) return;
    if (!(await window.app.askConfirm("Vols esborrar tot el dibuix actual d'aquesta pàgina?"))) return;

    appState.allPaths = [];
    const ink = document.getElementById('inkCanvas');
    if (ink) {
        const ctx = ink.getContext('2d');
        ctx.clearRect(0, 0, ink.width, ink.height);
    }
}

function startInk(e) {
    if (!appState.isDrawingMode) return;
    appState.isDrawing = true;
    appState.currentPath = [];

    const canvas = document.getElementById('inkCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    appState.currentPath.push({ x, y });

    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = document.getElementById('inkColor').value;
    ctx.lineWidth = parseInt(document.getElementById('inkSize').value);
}

function drawInk(e) {
    if (!appState.isDrawing || !appState.isDrawingMode) return;
    const canvas = document.getElementById('inkCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    appState.currentPath.push({ x, y });

    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
}

function endInk() {
    if (!appState.isDrawing) return;
    appState.isDrawing = false;
    if (appState.currentPath.length > 0) {
        const color = document.getElementById('inkColor').value;
        const width = parseInt(document.getElementById('inkSize').value);
        appState.allPaths.push({
            points: [...appState.currentPath],
            color: color,
            width: width
        });
    }
}

async function saveDrawing() {
    if (appState.allPaths.length === 0) {
        closeSidePanel();
        return;
    }

    await pushHistory();
    showLoader("Desant dibuix...");
    try {
        const pageIndex = appState.currentPage;
        const page = appState.pdfDoc.getPage(pageIndex);
        const { height } = page.getSize();

        const cv = document.getElementById('inkCanvas');
        let renderScale = 1.0;
        if (cv && cv.dataset.scale) renderScale = parseFloat(cv.dataset.scale);
        if (!renderScale || renderScale <= 0) renderScale = 1.0;

        for (const pathData of appState.allPaths) {
            if (pathData.points.length < 2) continue;

            const r = parseInt(pathData.color.slice(1, 3), 16) / 255;
            const g = parseInt(pathData.color.slice(3, 5), 16) / 255;
            const b = parseInt(pathData.color.slice(5, 7), 16) / 255;

            const pdfPoints = pathData.points.map(p => ({
                x: p.x / renderScale,
                y: height - (p.y / renderScale)
            }));

            const thickness = pathData.width / renderScale;

            for (let i = 0; i < pdfPoints.length - 1; i++) {
                page.drawLine({
                    start: pdfPoints[i],
                    end: pdfPoints[i + 1],
                    thickness: thickness,
                    color: PDFLib.rgb(r, g, b),
                    opacity: 1,
                    lineCap: PDFLib.LineCapStyle.Round,
                    lineJoin: PDFLib.LineJoinStyle.Round,
                });
            }
        }

        appState.allPaths = [];
        appState.isDrawingMode = false;
        closeSidePanel();
        await commitChanges();
    } catch (e) {
        console.error(e);
        showAlert("Error: " + e.message);
    } finally {
        hideLoader();
    }
}

// --- APPLY TOOLS ---

async function applyWatermark() {
    const text = document.getElementById('wmText').value;
    if (!text) return showAlert("Introdueix un text");

    const size = parseInt(document.getElementById('wmSize').value);
    const opacity = parseFloat(document.getElementById('wmOpacity').value);
    const rotation = parseInt(document.getElementById('wmRotation').value);
    const colorHex = document.getElementById('wmColor').value;

    const r = parseInt(colorHex.substr(1, 2), 16) / 255;
    const g = parseInt(colorHex.substr(3, 2), 16) / 255;
    const b = parseInt(colorHex.substr(5, 2), 16) / 255;

    // document.getElementById('watermarkModal').classList.add('hidden'); // Removed
    showLoader("Aplicant Marca d'Aigua...");

    try {
        const font = await appState.pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const pages = appState.pdfDoc.getPages();

        pages.forEach(page => {
            const { width, height } = page.getSize();
            page.drawText(text, {
                x: width / 2 - (text.length * size / 4), // Centrat aproximat
                y: height / 2,
                size: size,
                font: font,
                color: rgb(r, g, b),
                opacity: opacity,
                rotate: degrees(rotation),
            });
        });

        await refreshAll();
        showAlert("Marca d'aigua aplicada a totes les pàgines");
    } catch (e) { showAlert(e.message); }
    finally { hideLoader(); }
}

async function applyTextToPdf() {
    const text = document.getElementById('pdfTextInput').value;
    if (!text) return;
    const size = parseInt(document.getElementById('pdfTextSize').value) || 12;
    const colorHex = document.getElementById('pdfTextColor').value;
    const fontName = document.getElementById('pdfTextFont')?.value || 'Helvetica';

    const r = parseInt(colorHex.substr(1, 2), 16) / 255;
    const g = parseInt(colorHex.substr(3, 2), 16) / 255;
    const b = parseInt(colorHex.substr(5, 2), 16) / 255;

    await pushHistory();
    showLoader("Afegint...");
    try {
        const font = await appState.pdfDoc.embedFont(StandardFonts[fontName.replace('-', '')] || StandardFonts.Helvetica);
        const page = appState.pdfDoc.getPage(appState.currentPage);
        page.drawText(text, {
            x: appState.tempTextRect.x, y: appState.tempTextRect.y + appState.tempTextRect.h - size,
            size: size, font: font, color: rgb(r, g, b), maxWidth: appState.tempTextRect.w
        });
        // document.getElementById('textToolsModal').classList.add('hidden'); 
        closeSidePanel(); // Reset tools
        await commitChanges();
    } catch (e) { showAlert(e.message); } finally { hideLoader(); }
}

async function applyImageSignatureVisualOnly() {
    if (!appState.uploadedSigFile) return showAlert("Falta imatge");
    await pushHistory();
    showLoader("Estampant...");
    // document.getElementById('signatureModal').classList.add('hidden'); // Removed
    try {
        const b = await appState.uploadedSigFile.arrayBuffer();
        let img;
        if (appState.uploadedSigFile.type.includes('png')) img = await appState.pdfDoc.embedPng(b);
        else img = await appState.pdfDoc.embedJpg(b);

        let pIdx = appState.currentPage;
        let dims = { x: 50, y: 50, w: 200, h: 100 };
        if (appState.signatureConfig.isDefined) {
            pIdx = appState.signatureConfig.pageIndex;
            dims = appState.signatureConfig.rect;
        } else {
            const p = appState.pdfDoc.getPage(pIdx);
            const s = img.scaleToFit(200, 100);
            dims.w = s.width; dims.h = s.height;
            dims.x = (p.getWidth() / 2) - (s.width / 2);
            dims.y = p.getHeight() / 2;
        }
        appState.pdfDoc.getPage(pIdx).drawImage(img, { x: dims.x, y: dims.y, width: dims.w, height: dims.h });
        closeSidePanel(); // Reset tools
        await commitChanges();
    } catch (e) { showAlert(e.message); } finally { hideLoader(); }
}

// --- SIGNATURES & AUTOFIRMA ---

async function detectSignatures() {
    appState.detectedSignatures = [];
    appState.isSigned = false;
    try {
        appState.pdfDoc.context.enumerateIndirectObjects().forEach(([ref, obj]) => {
            if (obj instanceof PDFDict && obj.lookup(PDFName.of('Type')) === PDFName.of('Sig')) {
                const contents = obj.lookup(PDFName.of('Contents'));
                // Only count as signed if Contents is not default empty
                // And consider checking "V" value if needed (using ByteRange/Contents existence).
                // Simple regex on `contents.value` handles hex string. 
                // If it's pure 0000, it's placeholder.
                if (contents && contents.value && !/^0+$/.test(contents.value) && !/^<0+>$/.test(contents.value)) {
                    // Check if it has ByteRange (implies filled signature dict structure is active)
                    // const br = obj.lookup(PDFName.of('ByteRange'));
                    // if(br) { ... }
                    appState.isSigned = true;
                    appState.detectedSignatures.push({ name: "Signatura Detectada" });
                }
            }
        });
    } catch (e) { }
}

function openSignatureModal() {
    if (appState.isSigned) return showAlert("Document protegit (Signat)");
    toggleTool('signature');
}

function showSignaturesInPanel() {
    const list = document.getElementById('signaturesListPanel');
    if (!list) return;
    list.innerHTML = '';
    if (!appState.isSigned) {
        list.innerHTML = '<div class="italic text-center text-slate-400 py-4">Cap signatura detectada</div>';
    } else {
        appState.detectedSignatures.forEach(s => {
            const d = document.createElement('div');
            d.className = "bg-green-50 p-2 border border-green-200 rounded text-sm flex items-start gap-2";
            d.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-green-600 mt-0.5 shrink-0"></i>
                           <div>
                               <div class="font-bold text-green-700">${s.name}</div>
Document protegit contra canvis</div>
                           </div>`;
            list.appendChild(d);
        });
        lucide.createIcons();
    }
    // Panel is verified by toggleTool('verify')
}

function updateSignatureStatus() {
    const alert = document.getElementById('signatureStatusAlert');
    if (!alert) return;

    if (appState.isSigned && appState.detectedSignatures.length > 0) {
        alert.classList.remove('hidden');
        alert.className = 'mb-3 p-3 rounded-lg border bg-green-50 border-green-200';
        alert.innerHTML = `
            <div class="flex items-start gap-2">
                <i data-lucide="shield-check" class="w-5 h-5 text-green-600 mt-0.5 shrink-0"></i>
                <div>
                    <div class="font-bold text-green-700 text-sm">Document Signat Digitalment</div>
                    <div class="text-xs text-green-600 mt-1">
                        ${appState.detectedSignatures.length} signatura${appState.detectedSignatures.length > 1 ? 'es' : ''} detectada${appState.detectedSignatures.length > 1 ? 'es' : ''}. 
                        Document protegit contra modificacions.
                    </div>
                    <div class="text-xs text-slate-600 mt-2 pt-2 border-t border-green-200">
                        Pots afegir signatures addicionals utilitzant les eines a continuació.
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    } else {
        alert.classList.add('hidden');
    }
}


function checkAndInitAutoFirma() {
    if (typeof window.AutoScript !== 'undefined') initAF();
    else document.getElementById('manualScriptLoader')?.classList.remove('hidden');
}
function initAF() {
    try {
        if (typeof window.AutoScript.cargarAppAfirma === 'function') window.AutoScript.cargarAppAfirma();
        else window.AutoScript.cargarApplet("appletContainer");
        setTimeout(() => { appState.autoFirmaReady = true; }, 1000);
    } catch (e) { console.error(e); }
}

async function signWithAutoFirma() {
    if (!appState.autoFirmaReady) return showAlert("AutoFirma no connectat");
    showLoader("Signant...");
    try {
        const pdfBytes = (appState.isSigned && appState.pdfBytes) ? appState.pdfBytes : await appState.pdfDoc.save();
        const b64 = uint8ToBase64(pdfBytes);
        let params = `layer2Text=Signat per $$SUBJECTCN$$ el $$SIGNDATE=dd/MM/yyyy$$\n`;
        let p = appState.currentPage + 1;
        let rect = { x: 100, y: 100, w: 200, h: 100 };
        if (appState.signatureConfig.isDefined) {
            p = appState.signatureConfig.pageIndex + 1;
            rect = appState.signatureConfig.rect;
        }
        params += `signaturePages=${p}\n`;
        params += `signaturePositionOnPageLowerLeftX=${Math.round(rect.x)}\n`;
        params += `signaturePositionOnPageLowerLeftY=${Math.round(rect.y)}\n`;
        params += `signaturePositionOnPageUpperRightX=${Math.round(rect.x + rect.w)}\n`;
        params += `signaturePositionOnPageUpperRightY=${Math.round(rect.y + rect.h)}\n`;
        if (appState.uploadedSigFile) params += "signatureRubricImage=" + await blobToBase64(appState.uploadedSigFile);

        window.AutoScript.sign(b64, "SHA512withRSA", "AUTO", params,
            (res) => loadSignedPdf(base64ToUint8(res)),
            (type, msg) => { hideLoader(); showAlert("Error: " + msg); }
        );
    } catch (e) { hideLoader(); showAlert(e.message); }
}

async function loadSignedPdf(bytes) {
    appState.pdfBytes = bytes;
    appState.pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    appState.fileName = "SIGNAT_" + appState.fileName;
    document.getElementById('docTitle').innerText = appState.fileName;
    await detectSignatures();
    updateUI();
    await refreshAll();
    showAlert("Signat correctament!");
    hideLoader();
}

// --- UTILS ---
function updateUI() {
    const hasFile = !!appState.pdfDoc;
    // document.getElementById('signBtn').disabled = ... // Removed
    document.getElementById('saveBtn').disabled = !hasFile;
    // document.getElementById('signBtn').classList ... // Removed
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.classList.toggle('opacity-50', !hasFile);
    saveBtn.classList.toggle('cursor-not-allowed', !hasFile);

    if (appState.isSigned) {
        // Lock ALL modification tools EXCEPT signature (for multi-signing)
        ['insert', 'text', 'watermark', 'draw', 'highlight', 'notes', 'layout'].forEach(t => {
            const btn = document.querySelector(`button[onclick="window.app.toggleTool('${t}')"]`);
            if (btn) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed', 'grayscale');
                btn.title = "Document Signat (Edició Bloquejada)";
            }
        });

        // Ensure signature button is enabled and highlighted
        const sigBtn = document.querySelector(`button[onclick="window.app.toggleTool('signature')"]`);
        if (sigBtn) {
            sigBtn.disabled = false;
            sigBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'grayscale');
            sigBtn.classList.add('border-green-500', 'bg-green-50');
        }
    } else {
        // Unlock all tools
        ['insert', 'text', 'signature', 'watermark', 'draw', 'highlight', 'notes', 'layout'].forEach(t => {
            const btn = document.querySelector(`button[onclick="window.app.toggleTool('${t}')"]`);
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed', 'grayscale', 'border-green-500', 'bg-green-50');
                btn.title = "";
            }
        });
    }
}

async function downloadPdf() {
    // Aplicar valors dels formularis abans de guardar
    if (Object.keys(appState.formValues).length > 0) {
        showLoader("Aplicant dades de formulari...");
        try {
            const form = appState.pdfDoc.getForm();
            for (const [key, val] of Object.entries(appState.formValues)) {
                try {
                    const field = form.getField(key);
                    if (!field) continue;

                    if (field.constructor.name === 'PDFTextField') field.setText(val);
                    else if (field.constructor.name === 'PDFCheckBox') {
                        if (val === true) field.check(); else field.uncheck();
                    }
                    else if (field.constructor.name === 'PDFDropdown') field.select(val);
                    // Add logic for radio if needed
                } catch (err) { console.warn("Camp no trobat o error:", key, err); }
            }
            // Opcional: Flatten per fer-ho permanent/no-editable? 
            // form.flatten(); 
        } catch (e) { console.error(e); }
        finally { hideLoader(); }
    }

    // Bake Notes before final save
    if (appState.notes.length > 0) {
        await bakeNotes();
    }

    const data = (appState.isSigned && appState.pdfBytes) ? appState.pdfBytes : await appState.pdfDoc.save();
    const blob = new Blob([data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = appState.fileName; a.click();
}

function showLoader(t) { document.getElementById('loaderText').innerText = t; document.getElementById('loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader').classList.add('hidden'); }
function showAlert(m) {
    const modal = document.getElementById('customAlertModal');
    document.getElementById('alertMsg').innerText = m;
    modal.classList.remove('hidden');
    if (window._alertTimeout) clearTimeout(window._alertTimeout);
    window._alertTimeout = setTimeout(() => modal.classList.add('hidden'), 2000);
}

function uint8ToBase64(u) { let r = ''; for (let i = 0; i < u.length; i += 0x8000)r += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(r) }
function base64ToUint8(b) { const s = window.atob(b), l = s.length, y = new Uint8Array(l); for (let i = 0; i < l; i++)y[i] = s.charCodeAt(i); return y }
function blobToBase64(b) { return new Promise((r, j) => { const fr = new FileReader(); fr.onloadend = () => r(fr.result.split(',')[1]); fr.onerror = j; fr.readAsDataURL(b) }) }

// --- SIDEBAR TOOLS LOGIC ---

async function toggleTool(toolName) {
    // Save state
    const sidebar = document.getElementById('rightSidebar');
    const panelContainer = document.getElementById('sidebarPanels');

    // If clicking same tool, close it
    if (appState.activeTool === toolName) {
        closeSidePanel();
        return;
    }

    // Locked Loop Check
    // Locked Loop Check
    if (appState.isSigned && toolName !== 'verify' && toolName !== 'signature') {
        return showAlert("El document està signat. L'edició està bloquejada.");
    }

    // Special logic for verify (now integrated into signature)
    if (toolName === 'signature') {
        await detectSignatures();
        updateSignatureStatus();
    }

    appState.activeTool = toolName;

    // UI Refinement: Hide all icons, show only the active one or a back button?
    // User wants to see tool name and space for options.
    document.getElementById('sidebarIcons').classList.add('hidden');

    // Update Tool Name
    const toolNamesMap = {
        'insert': 'Inserir PDF',
        'text': 'Afegir Text',
        'signature': 'Signatura',
        'watermark': 'Marca d\'Aigua',
        'draw': 'Dibuixar',
        'notes': 'Notes',
        'highlight': 'MARCADOR',
        'layout': 'Capçalera/Peu'
    };
    const nameSpan = document.getElementById('activeToolName');
    if (nameSpan) nameSpan.innerText = toolNamesMap[toolName] || 'Eina';

    // Expand Sidebar
    sidebar.classList.remove('w-16');
    sidebar.classList.add('w-72'); // Increased width to accommodate panel

    // Show Panels Container
    panelContainer.classList.remove('hidden');
    panelContainer.classList.add('flex');

    // Hide all panels first
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.add('hidden'));

    // Show selected
    const target = document.getElementById(`panel-${toolName}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('flex', 'flex-col');
        appState.activeTool = toolName; // Track active tool
    } else {
        appState.activeTool = null;
    }

    // Special Logic per tool
    if (toolName === 'draw') {
        // Activate Drawing Mode logic
        if (!appState.isDrawingMode) {
            // Re-use existing toggle logic but adapted
            if (appState.viewMode !== 'single') {
                appState.viewMode = 'single';
                renderMainView();
                // Update view icon state manually if needed, or rely on render
                const btn = document.getElementById('viewModeBtn');
                if (btn) {
                    btn.innerHTML = '<i data-lucide="file" class="w-5 h-5"></i>';
                    lucide.createIcons();
                }
            }
            appState.isDrawingMode = true;
            const ink = document.getElementById('inkCanvas');
            if (ink) ink.classList.remove('hidden');

            // Visual feedback on button
            document.getElementById('drawBtn').classList.add('bg-blue-50', 'text-blue-600');
        }
    } else {
        // Deactivate drawing if switching to other tool
        appState.isDrawingMode = false;
        const ink = document.getElementById('inkCanvas');
        if (ink) ink.classList.add('hidden');
        document.getElementById('drawBtn').classList.remove('bg-blue-50', 'text-blue-600');
    }

    if (toolName === 'text') {
        // Focus text input
        setTimeout(() => document.getElementById('pdfTextInput')?.focus(), 100);
        activateSelectionMode('text');
    }
    // Added logic for notes tool
    if (toolName === 'notes') {
        if (appState.viewMode !== 'single') {
            appState.viewMode = 'single';
            renderMainView();
            const btn = document.getElementById('viewModeBtn');
            if (btn) {
                btn.innerHTML = '<i data-lucide="file" class="w-5 h-5"></i>';
                lucide.createIcons();
            }
        }
        updateNotesPanel();
    }

    if (toolName === 'highlight') {
        showAlert("Selecciona text al document per ressaltar-lo.");
    }
}

function closeSidePanel() {
    appState.activeTool = null;
    appState.isDrawingMode = false;

    const sidebar = document.getElementById('rightSidebar');
    sidebar.classList.remove('w-72');
    sidebar.classList.add('w-16');

    // Show icons again
    document.getElementById('sidebarIcons').classList.remove('hidden');

    const panelContainer = document.getElementById('sidebarPanels');
    panelContainer.classList.add('hidden');
    panelContainer.classList.remove('flex');

    // Hide Ink
    const ink = document.getElementById('inkCanvas');
    if (ink) ink.classList.add('hidden');
    document.getElementById('drawBtn')?.classList.remove('bg-blue-50', 'text-blue-600');

    // Clear selections if any
    closeSelectionMode();

    // Notes cleanup
    appState.activeNoteId = null;
    const noteEd = document.getElementById('noteEditor');
    if (noteEd) noteEd.classList.add('hidden');
    const noteHi = document.getElementById('noteHint');
    if (noteHi) noteHi.classList.remove('hidden');
}

// --- NOTES LOGIC ---

function renderNotesOverlay(container, viewport, pageIndex) {
    // Remove old notes
    container.querySelectorAll('.note-marker').forEach(n => n.remove());

    const pageNotes = appState.notes.filter(n => n.pageIndex === pageIndex);
    pageNotes.forEach(note => {
        const marker = document.createElement('div');
        marker.className = "note-marker";
        marker.style.left = (note.x * viewport.scale) + 'px';
        marker.style.top = (note.y * viewport.scale) + 'px';

        if (note.color) {
            marker.style.backgroundColor = note.color;
            // Adjust border color to be darker version or static
            marker.style.borderColor = 'rgba(0,0,0,0.2)';
        }

        marker.innerHTML = '<i data-lucide="sticky-note"></i>';
        marker.setAttribute('data-text', note.text || '(Nota buida)');
        marker.onclick = (e) => {
            e.stopPropagation();
            editNote(note.id);
        };
        container.appendChild(marker);
    });
    lucide.createIcons();

    // Addition listener if Notes tool is active
    container.onclick = (e) => {
        if (appState.activeTool === 'notes') {
            const rect = container.getBoundingClientRect();
            const x = (e.clientX - rect.left) / viewport.scale;
            const y = (e.clientY - rect.top) / viewport.scale;
            addNote(pageIndex, x, y);
        }
    };
}

function addNote(pageIndex, x, y) {
    const id = Date.now();
    const newNote = {
        id,
        pageIndex,
        x,
        y,
        text: "",
        color: document.getElementById('noteColor')?.value || '#fffd8d',
        author: document.getElementById('noteAuthor')?.value || 'Usuari'
    };
    appState.notes.push(newNote);
    editNote(id);
    renderMainView(); // Refresh markers
}

function editNote(id) {
    const note = appState.notes.find(n => n.id === id);
    if (!note) return;

    appState.activeNoteId = id;
    if (appState.activeTool !== 'notes') toggleTool('notes');

    document.getElementById('noteEditor').classList.remove('hidden');
    document.getElementById('noteHint').classList.add('hidden');

    document.getElementById('noteText').value = note.text;
    if (note.color) document.getElementById('noteColor').value = note.color;
    if (note.author) document.getElementById('noteAuthor').value = note.author;

    document.getElementById('noteText').focus();
    updateNotesPanel();
}

function updateNotesPanel() {
    const list = document.getElementById('notesList');
    list.innerHTML = '';

    const pageNotes = appState.notes.filter(n => n.pageIndex === appState.currentPage);
    if (pageNotes.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 italic">No hi ha notes en aquesta pàgina</p>';
        return;
    }

    pageNotes.forEach(note => {
        const div = document.createElement('div');
        div.className = `p-2 rounded border cursor-pointer text-xs transition ${appState.activeNoteId === note.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`;
        div.innerText = note.text.substring(0, 30) + (note.text.length > 30 ? '...' : '') || '(Nota buida)';
        div.onclick = () => editNote(note.id);
        list.appendChild(div);
    });
}

function saveNote() {
    const note = appState.notes.find(n => n.id === appState.activeNoteId);
    if (!note) return;

    note.text = document.getElementById('noteText').value;
    note.color = document.getElementById('noteColor').value;
    note.author = document.getElementById('noteAuthor').value;

    updateNotesPanel();
    renderMainView(); // Update marker color if changed
    showAlert("Nota guardada");
}

async function deleteNote() {
    if (!appState.activeNoteId) return;
    if (!(await window.app.askConfirm("Segur que vols eliminar aquesta nota?"))) return;

    appState.notes = appState.notes.filter(n => n.id !== appState.activeNoteId);
    appState.activeNoteId = null;
    document.getElementById('noteEditor').classList.add('hidden');
    document.getElementById('noteHint').classList.remove('hidden');
    updateNotesPanel();
    renderMainView();
}

async function extractTextAnnotations() {
    if (!appState.pdfDoc) return;
    appState.textAnnotations = [];

    const pages = appState.pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const annots = [];

        // Get annotations reference
        const annotsRef = page.node.get(PDFName.of('Annots'));
        if (annotsRef) {
            const annotsArray = appState.pdfDoc.context.lookup(annotsRef);
            if (annotsArray instanceof PDFArray) {
                for (let j = 0; j < annotsArray.size(); j++) {
                    const annotRef = annotsArray.get(j); // Usually a PDFRef
                    const annot = appState.pdfDoc.context.lookup(annotRef);

                    if (annot instanceof PDFDict) {
                        const subtype = annot.get(PDFName.of('Subtype'));
                        if (subtype) {
                            const subtypeStr = subtype.toString();
                            if (subtypeStr === '/Highlight' || subtypeStr === '/StrikeOut' || subtypeStr === '/Underline') {
                                // Extract data
                                const rect = annot.get(PDFName.of('Rect'))?.asArray().map(n => n.asNumber());
                                const colorRaw = annot.get(PDFName.of('C'));
                                const color = colorRaw ? colorRaw.asArray().map(n => n.asNumber()) : [1, 1, 0];
                                const contentsRaw = annot.get(PDFName.of('Contents'));
                                const contents = contentsRaw ? ((contentsRaw instanceof PDFHexString) ? contentsRaw.decodeText() : contentsRaw.asString()) : '';
                                const authorRaw = annot.get(PDFName.of('T'));
                                const author = authorRaw ? ((authorRaw instanceof PDFHexString) ? authorRaw.decodeText() : authorRaw.asString()) : 'Usuari';
                                const quadPointsRaw = annot.get(PDFName.of('QuadPoints'));
                                const quadPoints = quadPointsRaw ? quadPointsRaw.asArray().map(n => n.asNumber()) : [];
                                const type = subtypeStr.substring(1); // Remove '/'
                                const ca = annot.get(PDFName.of('CA'))?.asNumber();
                                const opacity = ca !== undefined ? ca : 1.0;

                                annots.push({
                                    pageIndex: i,
                                    ref: annotRef, // Keep reference for update/delete
                                    type: type,
                                    rect: rect,
                                    quadPoints: quadPoints,
                                    color: color,
                                    author: author,
                                    contents: contents,
                                    opacity: opacity
                                });
                            }
                        }
                    }
                }
            }
        }
        appState.textAnnotations.push(annots);
    }
}

async function extractExistingNotes() {
    if (!appState.pdfDoc) return;
    appState.notes = [];

    const pages = appState.pdfDoc.getPages();
    pages.forEach((page, pageIndex) => {
        const annotsRef = page.node.get(PDFName.of('Annots'));
        if (annotsRef) {
            const annots = appState.pdfDoc.context.lookup(annotsRef);
            if (annots instanceof PDFArray) {
                for (let i = 0; i < annots.size(); i++) {
                    const annot = appState.pdfDoc.context.lookup(annots.get(i));
                    if (annot instanceof PDFDict && annot.lookup(PDFName.of('Subtype')) === PDFName.of('Text')) {
                        const contents = annot.lookup(PDFName.of('Contents'));
                        const rect = annot.lookup(PDFName.of('Rect'));

                        if (contents && rect instanceof PDFArray) {
                            let text = "";
                            try {
                                if (contents instanceof PDFString) text = contents.asString();
                                else if (contents instanceof PDFHexString) text = contents.asString();
                                else text = String(contents);
                            } catch (e) { text = "(Error descodificant text)"; }

                            const r = rect.asArray().map(v => v.asNumber());
                            const { height } = page.getSize();

                            // Extraure l'autor (Atribut 'T')
                            const authorRef = annot.lookup(PDFName.of('T'));
                            let author = "Usuari";
                            if (authorRef) {
                                try {
                                    if (authorRef instanceof PDFString) author = authorRef.asString();
                                    else if (authorRef instanceof PDFHexString) author = authorRef.asString();
                                } catch (e) { console.warn("Error decoding author:", e); }
                            }

                            // Extraure el color (Atribut 'C')
                            const colorRef = annot.lookup(PDFName.of('C'));
                            let hexColor = "#fffd8d";
                            if (colorRef instanceof PDFArray) {
                                const rgb = colorRef.asArray().map(v => v.asNumber());
                                if (rgb.length === 3) {
                                    const r2 = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
                                    const g2 = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
                                    const b2 = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
                                    hexColor = `#${r2}${g2}${b2}`;
                                }
                            }

                            appState.notes.push({
                                id: Date.now() + Math.random(),
                                pageIndex: pageIndex,
                                x: r[0],
                                y: height - r[3],
                                text: text,
                                author: author,
                                color: hexColor
                            });
                        }
                    }
                }
            }
        }
    });

    if (appState.notes.length > 0) {
        console.log(`Extracted ${appState.notes.length} notes from PDF.`);
    }
}

async function bakeNotes() {
    if (!appState.pdfDoc) return;

    const pages = appState.pdfDoc.getPages();

    // 1. Netejar annotacions de text existents a totes les pàgines (per evitar duplicats)
    pages.forEach(page => {
        const annotsRef = page.node.get(PDFName.of('Annots'));
        if (annotsRef) {
            const annots = appState.pdfDoc.context.lookup(annotsRef);
            if (annots instanceof PDFArray) {
                for (let i = annots.size() - 1; i >= 0; i--) {
                    const annot = appState.pdfDoc.context.lookup(annots.get(i));
                    if (annot instanceof PDFDict && annot.lookup(PDFName.of('Subtype')) === PDFName.of('Text')) {
                        annots.remove(i);
                    }
                }
            }
        }
    });

    if (appState.notes.length === 0) return;

    // 2. Afegir les notes actuals
    for (const note of appState.notes) {
        try {
            const page = appState.pdfDoc.getPage(note.pageIndex);
            console.log(`Baking note on page ${note.pageIndex + 1}: "${note.text.substring(0, 20)}..." at [${note.x}, ${note.y}]`);
            const { height } = page.getSize();

            const pdfX = note.x;
            const pdfY = height - note.y;

            // Convert hex color to RGB [0-1]
            let r = 1, g = 1, b = 0; // default yellow
            if (note.color) {
                r = parseInt(note.color.slice(1, 3), 16) / 255;
                g = parseInt(note.color.slice(3, 5), 16) / 255;
                b = parseInt(note.color.slice(5, 7), 16) / 255;
            }

            // Create a real PDF Text Annotation (Sticky Note)
            const annot = appState.pdfDoc.context.obj({
                Type: PDFName.of('Annot'),
                Subtype: PDFName.of('Text'),
                Contents: PDFString.of(note.text),
                Rect: [pdfX, pdfY - 24, pdfX + 24, pdfY],
                C: [r, g, b],
                T: PDFString.of(note.author || 'Usuari'),
                Name: PDFName.of('Comment'),
                Open: false,
            });

            const annotsRef = page.node.get(PDFName.of('Annots'));
            if (!annotsRef) {
                page.node.set(PDFName.of('Annots'), appState.pdfDoc.context.obj([annot]));
            } else {
                const annots = appState.pdfDoc.context.lookup(annotsRef);
                if (annots instanceof PDFArray) {
                    annots.push(annot);
                } else {
                    page.node.set(PDFName.of('Annots'), appState.pdfDoc.context.obj([annot]));
                }
            }
        } catch (err) {
            console.error("Error baking note:", err);
        }
    }

    // No netegem appState.notes per permetre seguir editant fins que es tanqui el document.
}

async function handleHighlightSelection() {
    console.log('[Highlight] Selection event triggered');
    console.log('[Highlight] activeTool:', appState.activeTool);

    if (appState.activeTool !== 'highlight') {
        console.log('[Highlight] Tool not active, returning');
        return;
    }

    const sel = window.getSelection();
    console.log('[Highlight] Selection:', sel, 'Collapsed:', sel.isCollapsed, 'RangeCount:', sel.rangeCount);

    if (sel.isCollapsed || sel.rangeCount === 0) {
        console.log('[Highlight] No selection, returning');
        return;
    }

    const range = sel.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;
    const textLayer = container.closest('.textLayer');

    console.log('[Highlight] Container:', container, 'TextLayer:', textLayer);

    if (!textLayer) {
        console.log('[Highlight] Not in textLayer, returning');
        return;
    }

    const pageIndex = parseInt(textLayer.dataset.pageIndex);
    console.log('[Highlight] PageIndex:', pageIndex);

    if (isNaN(pageIndex)) {
        console.log('[Highlight] Invalid pageIndex, returning');
        return;
    }

    const layerRect = textLayer.getBoundingClientRect();
    const colorHex = document.getElementById('highlightColor').value;

    // Get PDF page dimensions
    const page = appState.pdfDoc.getPage(pageIndex);
    const { width: pdfW, height: pdfH } = page.getSize();

    // Use the stored visual scale from the text layer dataset
    // This is the actual scale used when rendering the text layer
    const visualScale = parseFloat(textLayer.dataset.visualScale) || 1.0;
    console.log('[Highlight] Visual scale from dataset:', visualScale);

    // Calculate scale factors: PDF coordinates = screen coordinates / visualScale
    const scaleX = 1 / visualScale;
    const scaleY = 1 / visualScale;

    const rects = Array.from(range.getClientRects());

    await pushHistory();
    showLoader("Ressaltant...");

    try {
        const annotType = document.getElementById('highlightType').value;
        const isHighlight = annotType === 'Highlight';

        const rR = parseInt(colorHex.substr(1, 2), 16) / 255;
        const gG = parseInt(colorHex.substr(3, 2), 16) / 255;
        const bB = parseInt(colorHex.substr(5, 2), 16) / 255;

        // Use selected color for all types. Highlight uses transparency.
        const finalR = rR;
        const finalG = gG;
        const finalB = bB;
        const finalOpacity = (annotType === 'Highlight') ? 0.4 : 1.0;

        const quadPoints = [];

        rects.forEach(r => {
            // Get position relative to text layer
            const relX = (r.left - layerRect.left);
            const relY = (r.top - layerRect.top);

            // Convert screen coordinates to PDF coordinates using the visual scale
            const pdfX = relX * scaleX;
            const pdfWidth = r.width * scaleX;

            // Reduce height by 20% to better match actual text and prevent overlap
            const adjustedHeight = r.height * 0.8;
            const pdfHeight = adjustedHeight * scaleY;

            // Convert Y coordinate (PDF Y-axis is inverted, origin at bottom-left)
            const pdfY = pdfH - (relY * scaleY + adjustedHeight * scaleY);

            // Store QuadPoints for annotation (4 corners of the rectangle)
            const x1 = pdfX;
            const y1 = pdfY + pdfHeight;
            const x2 = pdfX + pdfWidth;
            const y2 = pdfY;
            quadPoints.push(x1, y1, x2, y1, x1, y2, x2, y2);

        });

        // Create editable annotation with custom settings
        if (quadPoints.length > 0) {
            const annotType = document.getElementById('highlightType').value;
            const author = document.getElementById('highlightAuthor').value || 'Usuari';
            const comment = document.getElementById('highlightComment').value || '';

            const highlightAnnot = appState.pdfDoc.context.obj({
                Type: PDFName.of('Annot'),
                Subtype: PDFName.of(annotType), // Highlight, StrikeOut, or Underline
                Rect: [
                    Math.min(...quadPoints.filter((_, i) => i % 2 === 0)),
                    Math.min(...quadPoints.filter((_, i) => i % 2 === 1)),
                    Math.max(...quadPoints.filter((_, i) => i % 2 === 0)),
                    Math.max(...quadPoints.filter((_, i) => i % 2 === 1))
                ],
                QuadPoints: quadPoints,
                C: [finalR, finalG, finalB],
                CA: finalOpacity,
                T: PDFString.of(author),
                Contents: PDFString.of(comment)
            });

            // Add to PDF page
            // Better: find page for rect. handleHighlightSelection usually works on currentPage? 
            // Add reference to page
            let annotsRef = page.node.get(PDFName.of('Annots'));
            let annots;
            if (annotsRef) {
                annots = appState.pdfDoc.context.lookup(annotsRef);
            } else {
                annots = appState.pdfDoc.context.obj([]);
                page.node.set(PDFName.of('Annots'), annots);
            }
            if (annots instanceof PDFLib.PDFArray) {
                annots.push(highlightAnnot);
            }

            await commitChanges(); // Saves PDF
            await extractTextAnnotations(); // Re-index for selection

            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();

            showAlert(isHighlight ? "Text ressaltat!" : "Anotació creada!");
            if (sel) sel.removeAllRanges();
        }
    } catch (e) {
        console.error(e);
        showAlert("Error en ressaltar.");
    } finally {
        hideLoader();
    }
}

async function applyHeaderFooter() {
    if (!appState.pdfDoc) return;
    showLoader("Aplicant capçalera i peu...");

    try {
        const pages = appState.pdfDoc.getPages();
        const headerT = document.getElementById('headerText').value;
        const footerT = document.getElementById('footerText').value;
        const doNumbers = document.getElementById('addPageNumbers').checked;
        const skipFirst = document.getElementById('skipFirstPage').checked;
        const fontSize = parseInt(document.getElementById('layoutFontSize').value) || 10;
        const colorHex = document.getElementById('layoutColor').value;

        // Convert hex to RGB
        const r = parseInt(colorHex.slice(1, 3), 16) / 255;
        const g = parseInt(colorHex.slice(3, 5), 16) / 255;
        const b = parseInt(colorHex.slice(5, 7), 16) / 255;

        for (let i = 0; i < pages.length; i++) {
            if (skipFirst && i === 0) continue;

            const page = pages[i];
            const { width, height } = page.getSize();
            const pageNum = i + 1;
            const total = pages.length;

            const processText = (t) => {
                if (!t) return "";
                return t.replace(/{n}/g, pageNum).replace(/{total}/g, total);
            };

            // Header (Center Top)
            if (headerT) {
                const text = processText(headerT);
                page.drawText(text, {
                    x: width / 2 - (text.length * fontSize / 4), // Rough centering
                    y: height - 30,
                    size: fontSize,
                    color: PDFLib.rgb(r, g, b)
                });
            }

            // Footer (Center Bottom)
            let fText = processText(footerT);
            if (doNumbers) {
                const numStr = ` - ${pageNum}/${total}`;
                fText += numStr;
            }

            if (fText) {
                page.drawText(fText, {
                    x: width / 2 - (fText.length * fontSize / 4),
                    y: 20,
                    size: fontSize,
                    color: PDFLib.rgb(r, g, b)
                });
            }
        }

        showAlert("Canvis aplicats a les pàgines");
        renderMainView();
    } catch (e) {
        showAlert("Error aplicant layout: " + e.message);
    } finally {
        hideLoader();
    }
}

// --- EXPORTAR FUNCIONS GLOBALS ---
Object.assign(window.app, {
    loadPdfFile,
    downloadPdf,
    changePage,
    goToPage,
    changeZoom,
    toggleViewMode,
    toggleTool,
    closeSidePanel,
    undo,
    redo,
    deleteSelected,
    moveSelected,
    rotateSelected,
    extractSelected,
    clearSelection,
    applyTextToPdf,
    applyImageSignatureVisualOnly,
    saveDrawing,
    togglePageSelection,
    // Notes
    saveNote,
    deleteNote,
    clearDrawing,
    applyHeaderFooter,
    // Helpers
    startInk: (e) => { /* handled by listener */ },
    endInk: (e) => { /* handled by listener */ },
    // AutoFirma
    signWithAutoFirma,
    // Annotation Editing
    cancelAnnotationSelection,
    updateAnnotation,
    deleteAnnotation
});

// --- ANNOTATION MANAGEMENT ---

function renderTextAnnotationsOverlay(container, viewport, pageIndex) {
    if (!appState.textAnnotations[pageIndex]) return;

    appState.textAnnotations[pageIndex].forEach((annot, annotIndex) => {
        const rect = annot.rect; // [xLL, yLL, xUR, yUR]
        if (!rect) return;

        // Uses viewport.convertToViewportRectangle which is standard in pdf.js
        // If not available, we might need manual calc, but let's try standard first.
        let viewRect;
        try {
            viewRect = viewport.convertToViewportRectangle(rect);
        } catch (e) {
            // Fallback if method doesn't exist
            const [xLL, yLL, xUR, yUR] = rect;
            viewRect = [
                xLL * viewport.scale,
                (viewport.rawDims.pageHeight - yUR) * viewport.scale,
                xUR * viewport.scale,
                (viewport.rawDims.pageHeight - yLL) * viewport.scale
            ];
        }

        const div = document.createElement('div');
        div.className = 'absolute cursor-pointer hover:bg-blue-500/20 transition-colors z-20 annotation-hitbox';
        div.title = `Autor: ${annot.author}\n${annot.contents ? 'Comentari: ' + annot.contents : ''}`;

        const x = Math.min(viewRect[0], viewRect[2]);
        const y = Math.min(viewRect[1], viewRect[3]);
        const w = Math.abs(viewRect[2] - viewRect[0]);
        const h = Math.abs(viewRect[3] - viewRect[1]);

        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.width = `${w}px`;
        div.style.height = `${h}px`;

        div.onclick = (e) => {
            e.stopPropagation();
            selectAnnotation(pageIndex, annotIndex);
        };

        container.appendChild(div);
    });
}

function selectAnnotation(pageIndex, annotIndex) {
    const annot = appState.textAnnotations[pageIndex][annotIndex];
    appState.selectedAnnotation = { pageIndex, annotIndex, data: annot };

    if (appState.activeTool !== 'highlight') toggleTool('highlight');

    const typeSelect = document.getElementById('highlightType');
    if (['Highlight', 'StrikeOut', 'Underline'].includes(annot.type)) {
        typeSelect.value = annot.type;
    }

    // RGB array [0-1] to Hex
    const r = Math.round((annot.color[0] || 0) * 255).toString(16).padStart(2, '0');
    const g = Math.round((annot.color[1] || 0) * 255).toString(16).padStart(2, '0');
    const b = Math.round((annot.color[2] || 0) * 255).toString(16).padStart(2, '0');
    document.getElementById('highlightColor').value = `#${r}${g}${b}`;

    document.getElementById('highlightAuthor').value = annot.author || '';
    document.getElementById('highlightComment').value = annot.contents || '';

    const panel = document.getElementById('panel-highlight');
    let editControls = document.getElementById('highlightEditControls');

    if (!editControls) {
        editControls = document.createElement('div');
        editControls.id = 'highlightEditControls';
        editControls.className = 'mt-4 pt-4 border-t border-slate-200 bg-slate-50 p-2 rounded';
        editControls.innerHTML = `
            <h4 class="font-bold text-xs text-slate-700 mb-2">Anotació Seleccionada</h4>
            <div class="flex gap-2 mb-2">
                <button onclick="window.app.updateAnnotation()" class="flex-1 bg-blue-600 text-white p-2 rounded text-xs hover:bg-blue-700 font-medium">Guardar</button>
                <button onclick="window.app.deleteAnnotation()" class="flex-1 bg-red-100 text-red-600 p-2 rounded text-xs hover:bg-red-200 font-medium">Esborrar</button>
            </div>
            <button onclick="window.app.cancelAnnotationSelection()" class="w-full text-slate-500 text-[10px] hover:text-slate-700 underline">Cancel·lar Selecció</button>
        `;
        panel.appendChild(editControls);
    }
    editControls.classList.remove('hidden');
}

function cancelAnnotationSelection() {
    appState.selectedAnnotation = null;
    document.getElementById('highlightEditControls')?.classList.add('hidden');
}

async function updateAnnotation() {
    if (!appState.selectedAnnotation) return;
    const { data } = appState.selectedAnnotation;

    const newType = document.getElementById('highlightType').value;
    const colorHex = document.getElementById('highlightColor').value;
    const newAuthor = document.getElementById('highlightAuthor').value;
    const newComment = document.getElementById('highlightComment').value;

    const r = parseInt(colorHex.substr(1, 2), 16) / 255;
    const g = parseInt(colorHex.substr(3, 2), 16) / 255;
    const b = parseInt(colorHex.substr(5, 2), 16) / 255;

    showLoader("Actualitzant...");

    try {
        const annotRef = data.ref;
        const annotDict = appState.pdfDoc.context.lookup(annotRef);

        annotDict.set(PDFName.of('Subtype'), PDFName.of(newType));
        annotDict.set(PDFName.of('C'), appState.pdfDoc.context.obj([r, g, b]));
        annotDict.set(PDFName.of('T'), PDFString.of(newAuthor));
        annotDict.set(PDFName.of('Contents'), PDFString.of(newComment));
        annotDict.set(PDFName.of('M'), PDFString.of(new Date().toISOString()));

        if (newType === 'Highlight') {
            annotDict.set(PDFName.of('CA'), 0.4);
        } else {
            annotDict.set(PDFName.of('CA'), 1.0);
        }

        await commitChanges();
        showAlert("Anotació actualitzada");
        cancelAnnotationSelection();
    } catch (e) {
        console.error(e);
        showAlert("Error actualitzant: " + e.message);
    } finally {
        hideLoader();
    }
}

async function deleteAnnotation() {
    if (!appState.selectedAnnotation) return;
    const { pageIndex, data } = appState.selectedAnnotation;

    if (!(await window.app.askConfirm("Vols esborrar aquesta anotació?"))) return;

    showLoader("Esborrant...");
    try {
        const page = appState.pdfDoc.getPage(pageIndex);
        const annotsRef = page.node.get(PDFName.of('Annots'));

        if (annotsRef) {
            const annotsArray = appState.pdfDoc.context.lookup(annotsRef);
            if (annotsArray instanceof PDFArray) {
                let foundIdx = -1;
                for (let i = 0; i < annotsArray.size(); i++) {
                    if (annotsArray.get(i) === data.ref) {
                        foundIdx = i;
                        break;
                    }
                }
                if (foundIdx !== -1) {
                    annotsArray.remove(foundIdx);
                    await commitChanges();
                    showAlert("Anotació esborrada");
                    cancelAnnotationSelection();
                } else {
                    showAlert("No s'ha trobat l'anotació.");
                }
            }
        }
    } catch (e) {
        console.error(e);
        showAlert("Error esborrant: " + e.message);
    } finally {
        hideLoader();
    }
}

// --- SEARCH FUNCTIONALITY ---

function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');

    if (searchBar.classList.contains('hidden')) {
        // Show search bar
        searchBar.classList.remove('hidden');
        searchBar.classList.add('flex');
        searchInput.focus();
        appState.searchState.isActive = true;
    } else {
        // Hide and clear search
        closeSearch();
    }
}

function closeSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');

    searchBar.classList.add('hidden');
    searchBar.classList.remove('flex');
    searchInput.value = '';

    // Clear search state and highlights
    appState.searchState.query = '';
    appState.searchState.matches = [];
    appState.searchState.currentMatchIndex = -1;
    appState.searchState.isActive = false;

    // Remove all search highlights
    clearSearchHighlights();
    updateSearchCounter();
}

async function performSearch(query) {
    if (!appState.pdfDoc || !query || query.trim().length === 0) {
        appState.searchState.matches = [];
        appState.searchState.currentMatchIndex = -1;
        clearSearchHighlights();
        updateSearchCounter();
        return;
    }

    appState.searchState.query = query.toLowerCase();
    appState.searchState.matches = [];

    try {
        const pdfjsDoc = await pdfjsLib.getDocument({ data: await appState.pdfDoc.save() }).promise;
        const numPages = pdfjsDoc.numPages;

        // Search through all pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfjsDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1 });

            // Build full text and track positions
            let fullText = '';
            const items = textContent.items;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                fullText += item.str;
            }

            // Find all matches in this page
            const lowerText = fullText.toLowerCase();
            let startIndex = 0;

            while ((startIndex = lowerText.indexOf(appState.searchState.query, startIndex)) !== -1) {
                // Find which text items contain this match
                const matchRects = [];
                let charCount = 0;

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemStart = charCount;
                    const itemEnd = charCount + item.str.length;

                    // Check if this item overlaps with the match
                    if (itemEnd > startIndex && itemStart < startIndex + appState.searchState.query.length) {
                        const transform = item.transform;
                        const x = transform[4];
                        const y = transform[5];
                        const width = item.width;
                        const height = item.height;

                        matchRects.push({
                            left: x,
                            top: viewport.height - y - height,
                            width: width,
                            height: height
                        });
                    }

                    charCount += item.str.length;
                }

                if (matchRects.length > 0) {
                    appState.searchState.matches.push({
                        pageIndex: pageNum - 1,
                        rects: matchRects,
                        text: fullText.substr(startIndex, appState.searchState.query.length)
                    });
                }

                startIndex += appState.searchState.query.length;
            }
        }

        // Update UI
        updateSearchCounter();

        // Highlight all matches and navigate to first
        if (appState.searchState.matches.length > 0) {
            appState.searchState.currentMatchIndex = 0;
            renderSearchHighlights();
            navigateToCurrentMatch();
        } else {
            clearSearchHighlights();
        }

    } catch (e) {
        console.error('Search error:', e);
    }
}

function searchNext() {
    if (appState.searchState.matches.length === 0) return;

    appState.searchState.currentMatchIndex =
        (appState.searchState.currentMatchIndex + 1) % appState.searchState.matches.length;

    updateSearchCounter();
    renderSearchHighlights();
    navigateToCurrentMatch();
}

function searchPrevious() {
    if (appState.searchState.matches.length === 0) return;

    appState.searchState.currentMatchIndex =
        (appState.searchState.currentMatchIndex - 1 + appState.searchState.matches.length) % appState.searchState.matches.length;

    updateSearchCounter();
    renderSearchHighlights();
    navigateToCurrentMatch();
}

function updateSearchCounter() {
    const counter = document.getElementById('searchCounter');
    const total = appState.searchState.matches.length;
    const current = appState.searchState.currentMatchIndex + 1;

    if (total === 0) {
        counter.textContent = '0/0';
    } else {
        counter.textContent = `${current}/${total}`;
    }
}

function navigateToCurrentMatch() {
    if (appState.searchState.currentMatchIndex < 0 ||
        appState.searchState.currentMatchIndex >= appState.searchState.matches.length) {
        return;
    }

    const match = appState.searchState.matches[appState.searchState.currentMatchIndex];
    const targetPage = match.pageIndex;

    // Navigate to page if needed
    if (appState.viewMode === 'single' || appState.viewMode === 'two-page') {
        if (appState.currentPage !== targetPage) {
            appState.currentPage = targetPage;
            renderMainView();
        }
    }

    // Scroll to the match
    setTimeout(() => {
        const pageContainers = document.querySelectorAll('.page-container');
        const targetContainer = pageContainers[targetPage];

        if (targetContainer) {
            const highlight = targetContainer.querySelector('.search-highlight.active');
            if (highlight) {
                highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                targetContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, 100);
}

function renderSearchHighlights() {
    // Remove existing highlights
    clearSearchHighlights();

    if (appState.searchState.matches.length === 0) return;

    const pageContainers = document.querySelectorAll('.page-container');

    appState.searchState.matches.forEach((match, matchIndex) => {
        const container = pageContainers[match.pageIndex];
        if (!container) return;

        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        // Get the text layer to determine the scale
        const textLayer = container.querySelector('.textLayer');
        const visualScale = textLayer ? parseFloat(textLayer.dataset.visualScale || 1) : 1;

        // Create highlight overlay if it doesn't exist
        let overlay = container.querySelector('.search-highlight-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'search-highlight-overlay';
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '15';
            container.appendChild(overlay);
        }

        // Add highlight rectangles for this match
        match.rects.forEach(rect => {
            const highlightDiv = document.createElement('div');
            highlightDiv.className = 'search-highlight';

            // Apply current match styling
            if (matchIndex === appState.searchState.currentMatchIndex) {
                highlightDiv.classList.add('active');
            }

            // Position and size the highlight
            highlightDiv.style.left = (rect.left * visualScale) + 'px';
            highlightDiv.style.top = (rect.top * visualScale) + 'px';
            highlightDiv.style.width = (rect.width * visualScale) + 'px';
            highlightDiv.style.height = (rect.height * visualScale) + 'px';

            overlay.appendChild(highlightDiv);
        });
    });
}

function clearSearchHighlights() {
    const overlays = document.querySelectorAll('.search-highlight-overlay');
    overlays.forEach(overlay => overlay.remove());
}

// --- GOOGLE DRIVE INTEGRATION ---

async function initDriveApi() {
    try {
        await new Promise(resolve => gapi.load('client:picker', resolve));
        await gapi.client.init({
            discoveryDocs: GDRIVE_CONFIG.DISCOVERY_DOCS,
        });

        appState.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GDRIVE_CONFIG.CLIENT_ID,
            scope: GDRIVE_CONFIG.SCOPES,
            callback: handleAuthResponse, // Central callback
        });

        // Check for persisted token
        const token = localStorage.getItem('gdrive_token');
        if (token) {
            const tokenData = JSON.parse(token);
            if (tokenData.expires_at > Date.now()) {
                gapi.client.setToken(tokenData);
                appState.isGoogleAuth = true;
                updateDriveUI();
            }
        }

        handleDriveState();
    } catch (e) {
        console.error("GAPI Init Error", e);
    }
}

async function handleAuthResponse(resp) {
    if (resp.error !== undefined) {
        console.error("Auth Error:", resp);
        return;
    }

    gapi.client.setToken(resp);
    appState.isGoogleAuth = true;

    // Calculate expiration and save
    resp.expires_at = Date.now() + (resp.expires_in * 1000);
    localStorage.setItem('gdrive_token', JSON.stringify(resp));

    updateDriveUI();

    if (appState.driveFileId) {
        loadPdfFromDrive(appState.driveFileId);
    }
}

function updateDriveUI() {
    const authBtn = document.getElementById('authBtn');
    const driveMenu = document.getElementById('driveSaveMenu');
    const saveBtn = document.getElementById('saveBtn');

    const openDriveBtn = document.getElementById('openDriveBtn');
    const insertDriveBtn = document.getElementById('insertDriveBtn');
    const sigDriveBtn = document.getElementById('sigDriveBtn');

    if (appState.isGoogleAuth) {
        authBtn.classList.add('hidden');
        driveMenu.classList.remove('hidden');
        saveBtn.classList.add('hidden'); // Hide local save if drive is connected?

        if (openDriveBtn) openDriveBtn.classList.remove('hidden');
        if (insertDriveBtn) insertDriveBtn.classList.remove('hidden');
        if (sigDriveBtn) sigDriveBtn.classList.remove('hidden');
    } else {
        authBtn.classList.remove('hidden');
        driveMenu.classList.add('hidden');
        saveBtn.classList.remove('hidden');

        if (openDriveBtn) openDriveBtn.classList.add('hidden');
        if (insertDriveBtn) insertDriveBtn.classList.add('hidden');
        if (sigDriveBtn) sigDriveBtn.classList.add('hidden');
    }
}

function handleAuthClick() {
    // If we have a token but it's expired or we need a fresh one, 
    // requesting with prompt: '' will try to get it silently if possible, 
    // or show account chooser without full consent screen.
    const token = gapi.client.getToken();
    if (token === null) {
        appState.tokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
        appState.tokenClient.requestAccessToken({ prompt: '' });
    }
}

function logoutDrive() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken(null);
    }
    localStorage.removeItem('gdrive_token');
    appState.isGoogleAuth = false;
    updateDriveUI();
    showAlert("Sessió de Google Drive tancada");
}

function handleDriveState() {
    const urlParams = new URLSearchParams(window.location.search);

    // Suport per a ?id=... (test manual)
    const directId = urlParams.get('id');
    if (directId) {
        appState.driveFileId = directId;
    }

    // Suport per a ?state=... (Google Drive "Open With")
    const stateStr = urlParams.get('state');
    if (stateStr) {
        try {
            const state = JSON.parse(stateStr);
            if (state.ids && state.ids.length > 0) {
                appState.driveFileId = state.ids[0];
            } else if (state.id) {
                appState.driveFileId = state.id;
            }
        } catch (e) {
            console.error("Error parsing state", e);
        }
    }

    if (appState.driveFileId) {
        if (appState.isGoogleAuth) {
            loadPdfFromDrive(appState.driveFileId);
        } else {
            // No alert immediately, just show the login button prominently
            document.getElementById('authBtn').classList.remove('hidden');
            // document.getElementById('authBtn').classList.add('ring-4', 'ring-blue-400', 'animate-pulse');
        }
    }
}

async function loadPdfFromDrive(fileId) {
    showLoader("Carregant des de Google Drive...");
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, parents',
            supportsAllDrives: true
        });

        const file = response.result;
        appState.fileName = file.name;
        appState.driveFileId = file.id;
        appState.driveFolderId = file.parents ? file.parents[0] : null;
        document.getElementById('docTitle').innerText = file.name;

        // Fetch file content using fetch for robust binary handling
        const binaryResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: {
                'Authorization': `Bearer ${gapi.client.getToken().access_token}`
            }
        });
        const arrayBuffer = await binaryResponse.arrayBuffer();

        appState.pdfBytes = new Uint8Array(arrayBuffer);
        appState.pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        // Reset state
        appState.selectedPages.clear();
        await extractExistingNotes();
        await extractTextAnnotations();
        await detectSignatures();

        updateUI();
        await renderSidebar();
        await renderMainView();

        showAlert("Fitxer carregat de Drive");
    } catch (e) {
        console.error("Load from Drive failed", e);
        let msg = (e.result?.error?.message || e.message);
        if (msg.includes("File not found") || e.status === 404) {
            msg += ". Assegura't de fer 'Obrir amb' des de Google Drive per donar permís a l'aplicació.";
        }
        showAlert("Error carregant de Drive: " + msg);
    } finally {
        hideLoader();
    }
}

async function saveToDrive(overwrite = true) {
    if (!appState.isGoogleAuth) return handleAuthClick();
    if (!appState.pdfDoc) return;

    document.getElementById('driveOptions').classList.add('hidden');
    showLoader(overwrite ? "Fitxer actualitzat a Drive..." : "Desant nou fitxer a Drive...");

    try {
        // Apply form values and bake notes
        if (Object.keys(appState.formValues).length > 0) {
            const form = appState.pdfDoc.getForm();
            for (const [key, val] of Object.entries(appState.formValues)) {
                try {
                    const field = form.getField(key);
                    if (field) {
                        if (field.constructor.name === 'PDFTextField') field.setText(val);
                        else if (field.constructor.name === 'PDFCheckBox') val ? field.check() : field.uncheck();
                        else if (field.constructor.name === 'PDFDropdown') field.select(val);
                    }
                } catch (err) { }
            }
        }
        if (appState.notes.length > 0) await bakeNotes();

        const pdfBytes = (appState.isSigned && appState.pdfBytes) ? appState.pdfBytes : await appState.pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        if (overwrite && appState.driveFileId) {
            // Update existing file
            const metadata = {
                name: appState.fileName,
                mimeType: 'application/pdf'
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${appState.driveFileId}?uploadType=multipart&supportsAllDrives=true`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${gapi.client.getToken().access_token}`
                },
                body: form
            });

            if (!resp.ok) throw new Error("Upload failed");
            showAlert("Fitxer actualitzat a Google Drive");
        } else {
            // Create new file or Copy
            const defaultName = overwrite ? appState.fileName : "Copia de " + appState.fileName;
            let name = defaultName;

            if (!overwrite) {
                const promptResult = await window.app.askPrompt("Nom de la còpia", defaultName);
                if (promptResult === null) return hideLoader(); // User cancelled
                name = promptResult || defaultName;
            }

            // If it's a copy (overwrite=false), we always show the folder picker to let user choose destination
            // If it's a new upload (no driveFileId), we also show the folder picker
            if (!overwrite || !appState.driveFileId) {
                hideLoader();
                appState.pendingSave = { overwrite, name, blob };
                // If we already have a folder (because we opened from Drive), use it as initial view
                showDrivePicker('folder', appState.driveFolderId);
                return;
            }

            const folderId = appState.targetFolderId || appState.driveFolderId;

            const metadata = {
                name: name,
                mimeType: 'application/pdf',
                parents: folderId ? [folderId] : []
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gapi.client.getToken().access_token}`
                },
                body: form
            });

            if (!resp.ok) throw new Error("Create failed");
            const newFile = await resp.json();

            // If it was a new upload or we want to switch to the copy
            if (!overwrite) {
                appState.driveFileId = newFile.id;
                appState.fileName = newFile.name;
                appState.driveFolderId = folderId;
                document.getElementById('docTitle').innerText = name;
            }

            appState.targetFolderId = null; // Reset
            showAlert("Nou fitxer creat a Google Drive");
        }
    } catch (e) {
        console.error("Save to Drive failed", e);
        showAlert("Error desant a Drive: " + e.message);
    } finally {
        hideLoader();
    }
}

// --- GOOGLE PICKER ---

function showDrivePicker(mode = 'open', parentId = null) {
    if (!appState.isGoogleAuth) {
        handleAuthClick();
        return;
    }

    const token = gapi.client.getToken().access_token;
    const appId = GDRIVE_CONFIG.CLIENT_ID.split('-')[0];

    let view;
    if (mode === 'folder') {
        view = new google.picker.DocsView(google.picker.ViewId.FOLDERS);
        view.setSelectableMimeTypes('application/vnd.google-apps.folder');
    } else if (mode === 'signature') {
        view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES);
    } else {
        view = new google.picker.DocsView(google.picker.ViewId.PDFS);
        view.setMimeTypes('application/pdf');
    }

    if (parentId) {
        view.setParent(parentId);
    }

    // Enable folder navigation for file picking modes
    if (mode !== 'folder') {
        view.setIncludeFolders(true);
    }

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setAppId(appId)
        .setOAuthToken(token)
        .addView(view)
        .setTitle(mode === 'folder' ? 'Selecciona Carpeta de Destí' : 'Selecciona Fitxer')
        .setCallback((data) => handlePickerSelection(data, mode))
        .build();
    picker.setVisible(true);
}

async function handlePickerSelection(data, mode) {
    if (data.action === google.picker.Action.PICKED) {
        const file = data.docs[0];
        const fileId = file.id;

        if (mode === 'open') {
            loadPdfFromDrive(fileId);
        } else if (mode === 'insert') {
            loadPdfForInsertFromDrive(fileId);
        } else if (mode === 'signature') {
            loadImageForSignatureFromDrive(fileId);
        } else if (mode === 'folder') {
            appState.targetFolderId = fileId;
            if (appState.pendingSave) {
                const { overwrite, name, blob } = appState.pendingSave;
                appState.pendingSave = null;
                // Re-trigger save with the now-set targetFolderId
                // We bypass showLoader because we might need to prompt again or just use current data
                executeCreationSave(name, blob, overwrite);
            }
        }
    } else if (data.action === google.picker.Action.CANCEL) {
        appState.pendingSave = null;
        appState.targetFolderId = null;
    }
}

async function executeCreationSave(name, blob, overwrite) {
    showLoader("Desant a Drive...");
    try {
        const folderId = appState.targetFolderId || appState.driveFolderId;
        const metadata = {
            name: name,
            mimeType: 'application/pdf',
            parents: folderId ? [folderId] : []
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gapi.client.getToken().access_token}`
            },
            body: form
        });

        if (!resp.ok) throw new Error("Create failed");
        const newFile = await resp.json();

        if (!overwrite) {
            appState.driveFileId = newFile.id;
            appState.fileName = newFile.name;
            appState.driveFolderId = folderId;
            document.getElementById('docTitle').innerText = name;
        }

        appState.targetFolderId = null;
        showAlert("Nou fitxer creat a Google Drive");
    } catch (e) {
        console.error(e);
        showAlert("Error desant: " + e.message);
    } finally {
        hideLoader();
    }
}

async function loadPdfForInsertFromDrive(fileId) {
    showLoader("Carregant PDF per insertar...");
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: {
                'Authorization': `Bearer ${gapi.client.getToken().access_token}`
            }
        });
        const arrayBuffer = await response.arrayBuffer();
        const fileContent = new Uint8Array(arrayBuffer);

        // Mock a File object for processMerge
        const fileName = (await gapi.client.drive.files.get({ fileId, fields: 'name', supportsAllDrives: true })).result.name;
        const fakeFile = new Blob([fileContent], { type: 'application/pdf' });
        fakeFile.name = fileName;

        processMerge(fakeFile);
    } catch (e) {
        console.error("Load for insert failed", e);
        showAlert("Error carregant PDF de Drive: " + e.message);
    } finally {
        hideLoader();
    }
}

async function loadImageForSignatureFromDrive(fileId) {
    showLoader("Carregant imatge per rúbrica...");
    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: {
                'Authorization': `Bearer ${gapi.client.getToken().access_token}`
            }
        });
        const blob = await response.blob();
        appState.uploadedSigFile = blob;

        const fileName = (await gapi.client.drive.files.get({ fileId, fields: 'name', supportsAllDrives: true })).result.name;
        appState.uploadedSigFile.name = fileName;
        document.getElementById('sigFileName').innerText = fileName;
        document.getElementById('sigFileName').classList.add('text-indigo-600', 'font-medium');

        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = document.getElementById('sigPreview');
            if (preview) {
                preview.src = ev.target.result;
                preview.classList.remove('hidden');
            }
        };
        reader.readAsDataURL(blob);
    } catch (e) {
        console.error("Load for signature failed", e);
        showAlert("Error carregant imatge de Drive: " + e.message);
    } finally {
        hideLoader();
    }
}

// Export functions
Object.assign(window.app, {
    showDrivePicker
});