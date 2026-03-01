// Wait for JsBarcode to be available
window.onload = () => {
    const input = document.getElementById('barcodeInput');
    const saveButton = document.getElementById('saveButton');
    const scanButton = document.getElementById('scanButton');
    const historyContainer = document.getElementById('historyContainer');
    const barcodeContainer = document.querySelector('.barcode-container');
    const defaultText = 'Hello World!';
    let longPressTimer;
    const LONG_PRESS_DURATION = 500; // 500ms for long press
    let wasLongPress = false;
    let pressStartTime;
    let pendingText = ''; // Store text waiting for display name

    // Barcode options
    const barcodeOptions = {
        format: "CODE128",
        width: 1,
        height: 80,
        displayValue: true,
        fontSize: 16,
        margin: 5
    };

    // Add modal HTML dynamically
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3 id="modalTitle">Set Display Name</h3>
            <input type="text" id="displayNameInput" placeholder="Enter display name...">
            <div id="editFields" class="edit-fields" style="display:none">
                <input type="text" id="editTextInput" placeholder="Barcode text...">
                <input type="text" id="editAliasInput" placeholder="Alias (optional)...">
                <label class="secret-toggle"><input type="checkbox" id="editSecretToggle"> Hide barcode text</label>
            </div>
            <div class="modal-buttons">
                <button id="cancelModal">Cancel</button>
                <button id="confirmModal">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Add scanning overlay
    const scanOverlay = document.createElement('div');
    scanOverlay.className = 'scan-overlay';
    scanOverlay.innerHTML = `
        <div class="scan-header">
            <h3>Scan Barcode or QR Code</h3>
            <button class="scan-close">&times;</button>
        </div>
        <div class="scan-viewfinder" id="scanViewfinder"></div>
        <div class="scan-controls">
            <button id="scanCameraBtn">📷 Camera</button>
            <button id="scanFileBtn">📁 Upload Image</button>
        </div>
        <div class="scan-status" id="scanStatus"></div>
        <input type="file" id="scanFileInput" accept="image/*">
    `;
    document.body.appendChild(scanOverlay);

    const scanCloseBtn = scanOverlay.querySelector('.scan-close');
    const scanCameraBtn = document.getElementById('scanCameraBtn');
    const scanFileBtn = document.getElementById('scanFileBtn');
    const scanStatus = document.getElementById('scanStatus');
    const scanFileInput = document.getElementById('scanFileInput');
    const scanViewfinder = document.getElementById('scanViewfinder');

    let html5Qrcode = null;
    let isScannerRunning = false;
    let nativeStream = null;
    let nativeScanFrame = null;
    const cameraAvailable = window.isSecureContext && !!navigator.mediaDevices;

    const setScanStatus = (message, type = '') => {
        scanStatus.textContent = message;
        scanStatus.className = 'scan-status' + (type ? ' ' + type : '');
    };

    const onScanSuccess = (decodedText) => {
        closeScanOverlay();
        input.value = decodedText;
        updateBarcode(decodedText, false);
    };

    // Lazy-load html5-qrcode from jsDelivr on first use
    let html5QrcodeLoaded = typeof Html5Qrcode !== 'undefined';
    const loadHtml5Qrcode = () => new Promise((resolve, reject) => {
        if (html5QrcodeLoaded) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = () => { html5QrcodeLoaded = true; resolve(); };
        script.onerror = () => reject(new Error('Failed to load scanner library'));
        document.head.appendChild(script);
    });

    const startCameraScanner = async () => {
        if (!cameraAvailable) {
            setScanStatus('Camera requires HTTPS or localhost. Upload an image instead.', 'error');
            return;
        }

        if (isScannerRunning) {
            await stopScanner();
        }

        setScanStatus('Starting camera...');

        // Use native BarcodeDetector if available (handles any orientation)
        if ('BarcodeDetector' in window) {
            try {
                nativeStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });

                const video = document.createElement('video');
                video.srcObject = nativeStream;
                video.setAttribute('playsinline', 'true');
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                scanViewfinder.appendChild(video);
                await video.play();

                const detector = new BarcodeDetector();
                isScannerRunning = true;
                scanCameraBtn.classList.add('active');
                setScanStatus('Point camera at a barcode or QR code');

                const scanLoop = async () => {
                    if (!isScannerRunning) return;
                    try {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length > 0) {
                            onScanSuccess(barcodes[0].rawValue);
                            return;
                        }
                    } catch (e) {
                        // Frame not ready, continue
                    }
                    nativeScanFrame = setTimeout(scanLoop, 100); // ~10fps
                };
                nativeScanFrame = setTimeout(scanLoop, 100);
                return;
            } catch (err) {
                console.error('Native BarcodeDetector failed, falling back:', err);
                if (nativeStream) {
                    nativeStream.getTracks().forEach(track => track.stop());
                    nativeStream = null;
                }
                scanViewfinder.innerHTML = '';
            }
        }

        // Fallback to html5-qrcode (ZXing-based, horizontal barcodes only)
        try {
            await loadHtml5Qrcode();
            html5Qrcode = new Html5Qrcode('scanViewfinder');
            await html5Qrcode.start(
                { facingMode: 'environment' },
                { fps: 10 },
                onScanSuccess,
                () => {}
            );

            isScannerRunning = true;
            scanCameraBtn.classList.add('active');
            setScanStatus('Point camera at a barcode or QR code');
        } catch (err) {
            console.error('Camera start failed:', err);
            const errStr = err.toString();
            if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
                setScanStatus('Camera permission denied. Please allow camera access and try again.', 'error');
            } else if (errStr.includes('NotFoundError') || errStr.includes('device')) {
                setScanStatus('No camera found. Try uploading an image instead.', 'error');
            } else {
                setScanStatus('Could not start camera: ' + (err.message || err), 'error');
            }
        }
    };

    const stopScanner = async () => {
        if (nativeScanFrame) {
            clearTimeout(nativeScanFrame);
            nativeScanFrame = null;
        }
        if (nativeStream) {
            nativeStream.getTracks().forEach(track => track.stop());
            nativeStream = null;
        }
        if (html5Qrcode && isScannerRunning) {
            try {
                await html5Qrcode.stop();
            } catch (e) {
                // May already be stopped
            }
        }
        isScannerRunning = false;
        scanCameraBtn.classList.remove('active');
    };

    const scanFromFile = async (file) => {
        if (isScannerRunning) {
            await stopScanner();
        }

        setScanStatus('Scanning image...', '');

        // Try native BarcodeDetector first
        if ('BarcodeDetector' in window) {
            try {
                const bitmap = await createImageBitmap(file);
                const detector = new BarcodeDetector();
                const barcodes = await detector.detect(bitmap);
                bitmap.close();
                if (barcodes.length > 0) {
                    onScanSuccess(barcodes[0].rawValue);
                    return;
                }
            } catch (e) {
                // Fall through to html5-qrcode
            }
        }

        // Fallback to html5-qrcode
        try {
            await loadHtml5Qrcode();
        } catch {
            setScanStatus('No barcode found. Scanner fallback failed to load.', 'error');
            return;
        }

        if (!html5Qrcode) {
            html5Qrcode = new Html5Qrcode('scanViewfinder');
        }

        try {
            const result = await html5Qrcode.scanFile(file, true);
            onScanSuccess(result);
        } catch (err) {
            setScanStatus('No barcode or QR code found in image. Try a clearer photo.', 'error');
        }
    };

    const openScanOverlay = async () => {
        const hasNative = 'BarcodeDetector' in window;
        if (!hasNative) {
            try {
                setScanStatus('Loading scanner...');
                await loadHtml5Qrcode();
            } catch {
                setScanStatus('Scanner library failed to load. Check your internet connection.', 'error');
                return;
            }
        }
        scanOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (cameraAvailable) {
            setScanStatus('');
            startCameraScanner();
        } else {
            setScanStatus('Camera requires HTTPS or localhost. Upload an image instead.', 'error');
        }
        // Load fallback library in background for file scanning
        if (!html5QrcodeLoaded) loadHtml5Qrcode().catch(() => {});
    };

    const closeScanOverlay = async () => {
        if (!scanOverlay.classList.contains('active')) return;
        scanOverlay.classList.remove('active');
        document.body.style.overflow = '';
        await stopScanner();
        html5Qrcode = null;
        scanViewfinder.innerHTML = '';
        setScanStatus('');
    };

    scanButton.addEventListener('click', openScanOverlay);
    scanCloseBtn.addEventListener('click', closeScanOverlay);

    scanOverlay.addEventListener('click', (e) => {
        if (e.target === scanOverlay) closeScanOverlay();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scanOverlay.classList.contains('active')) {
            closeScanOverlay();
        }
    });

    scanCameraBtn.addEventListener('click', () => startCameraScanner());

    scanFileBtn.addEventListener('click', () => scanFileInput.click());

    scanFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) scanFromFile(file);
        scanFileInput.value = '';
    });

    // Modal elements
    const modalTitle = document.getElementById('modalTitle');
    const displayNameInput = document.getElementById('displayNameInput');
    const editFields = document.getElementById('editFields');
    const editTextInput = document.getElementById('editTextInput');
    const editAliasInput = document.getElementById('editAliasInput');
    const editSecretToggle = document.getElementById('editSecretToggle');
    const cancelModal = document.getElementById('cancelModal');
    const confirmModal = document.getElementById('confirmModal');

    // Load history from localStorage
    const loadHistory = () => {
        const savedHistory = localStorage.getItem('barcodeHistory');
        if (savedHistory) {
            const items = JSON.parse(savedHistory);
            return items.map(item => {
                // Migrate old displayName format to alias/isSecret
                if (item.displayName !== undefined) {
                    return {
                        text: item.text,
                        alias: item.displayName || null,
                        isSecret: !!item.displayName
                    };
                }
                return {
                    text: item.text,
                    alias: item.alias || null,
                    isSecret: !!item.isSecret
                };
            });
        }
        return [{ text: defaultText, alias: null, isSecret: false }];
    };

    // Save history to localStorage
    const saveHistory = () => {
        const historyItems = Array.from(historyContainer.querySelectorAll('.history-button'))
            .map(button => ({
                text: button.dataset.originalText,
                alias: button.dataset.alias || null,
                isSecret: button.dataset.isSecret === 'true'
            }));
        localStorage.setItem('barcodeHistory', JSON.stringify(historyItems));
    };

    // Keep track of current barcode text and secret status
    let currentBarcodeText = defaultText;
    let isCurrentBarcodeSecret = false;

    // Toggle fullscreen
    barcodeContainer.addEventListener('click', () => {
        barcodeContainer.classList.toggle('fullscreen');
        
        if (barcodeContainer.classList.contains('fullscreen')) {
            JsBarcode("#barcode", currentBarcodeText, {
                ...barcodeOptions,
                width: 2,
                height: 200,
                fontSize: 30,
                margin: 10,
                displayValue: !isCurrentBarcodeSecret
            });
        } else {
            JsBarcode("#barcode", currentBarcodeText, {
                ...barcodeOptions,
                displayValue: !isCurrentBarcodeSecret
            });
        }
    });

    // Function to update barcode
    const updateBarcode = (text, isSecret = false) => {
        if (text !== '') {
            try {
                currentBarcodeText = text;
                isCurrentBarcodeSecret = isSecret;
                const options = {
                    ...barcodeOptions,
                    displayValue: !isSecret
                };

                if (barcodeContainer.classList.contains('fullscreen')) {
                    JsBarcode("#barcode", text, {
                        ...options,
                        width: 2,
                        height: 200,
                        fontSize: 30,
                        margin: 10
                    });
                } else {
                    JsBarcode("#barcode", text, options);
                }
            } catch (error) {
                console.error('Failed to generate barcode:', error);
            }
        }
    };

    // Show modal function
    const showModal = ({ title, inputMode, confirmText, onConfirm }) => {
        modalTitle.textContent = title;
        displayNameInput.style.display = inputMode ? 'block' : 'none';
        editFields.style.display = 'none';
        confirmModal.textContent = confirmText;
        
        modal.style.display = 'flex';
        if (inputMode) {
            displayNameInput.value = '';
            displayNameInput.focus();
        }

        // Handle Enter key in input
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };

        // Update modal handlers
        const handleConfirm = () => {
            onConfirm(displayNameInput.value.trim());
            modal.style.display = 'none';
            cleanup();
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanup();
        };

        const cleanup = () => {
            confirmModal.removeEventListener('click', handleConfirm);
            cancelModal.removeEventListener('click', handleCancel);
            if (inputMode) {
                displayNameInput.removeEventListener('keypress', handleEnter);
            }
        };

        confirmModal.addEventListener('click', handleConfirm);
        cancelModal.addEventListener('click', handleCancel);
        if (inputMode) {
            displayNameInput.addEventListener('keypress', handleEnter);
        }
    };

    // Edit modal for double-tap
    const openEditModal = (button, historyItem) => {
        modalTitle.textContent = 'Edit Barcode';
        displayNameInput.style.display = 'none';
        editFields.style.display = 'flex';
        confirmModal.textContent = 'Save';
        confirmModal.className = '';

        editTextInput.value = button.dataset.originalText;
        editAliasInput.value = button.dataset.alias || '';
        editSecretToggle.checked = button.dataset.isSecret === 'true';

        modal.style.display = 'flex';
        editTextInput.focus();

        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };

        const handleConfirm = () => {
            const newText = editTextInput.value.trim();
            if (!newText) { cleanup(); modal.style.display = 'none'; return; }
            button.dataset.originalText = newText;
            button.dataset.alias = editAliasInput.value.trim() || '';
            button.dataset.isSecret = editSecretToggle.checked ? 'true' : 'false';
            renderButtonContent(button);
            updateBarcode(newText, editSecretToggle.checked);
            saveHistory();
            modal.style.display = 'none';
            cleanup();
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanup();
        };

        const cleanup = () => {
            editFields.style.display = 'none';
            confirmModal.removeEventListener('click', handleConfirm);
            cancelModal.removeEventListener('click', handleCancel);
            editTextInput.removeEventListener('keypress', handleEnter);
            editAliasInput.removeEventListener('keypress', handleEnter);
        };

        confirmModal.addEventListener('click', handleConfirm);
        cancelModal.addEventListener('click', handleCancel);
        editTextInput.addEventListener('keypress', handleEnter);
        editAliasInput.addEventListener('keypress', handleEnter);
    };

    // Modified delete handler
    const handleDelete = (historyItem, alias) => {
        const button = historyItem.querySelector('.history-button');
        const itemText = alias || button.dataset.alias || button.dataset.originalText;
        showModal({
            title: `Delete "${itemText}"?`,
            inputMode: false,
            confirmText: 'Delete',
            onConfirm: () => {
                historyItem.remove();
                saveHistory();
            }
        });
    };

    // Modified long press handler
    const handlePressStart = () => {
        wasLongPress = false;
        pressStartTime = Date.now();
        longPressTimer = setTimeout(() => {
            wasLongPress = true;
            pendingText = input.value;
            if (pendingText) {
                showModal({
                    title: 'Save as Secret',
                    inputMode: true,
                    confirmText: 'Save',
                    onConfirm: (alias) => {
                        if (alias) {
                            addToHistory(pendingText, alias, true);
                            updateBarcode(pendingText, true);
                            input.value = '';
                        }
                    }
                });
            }
        }, LONG_PRESS_DURATION);
    };

    // Handle press end
    const handlePressEnd = () => {
        clearTimer();
        const pressDuration = Date.now() - pressStartTime;
        if (pressDuration < LONG_PRESS_DURATION && !wasLongPress) {
            saveCurrentText();
        }
    };

    // Clear timer if button is released
    const clearTimer = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    // Mouse events
    saveButton.addEventListener('mousedown', handlePressStart);
    saveButton.addEventListener('mouseup', handlePressEnd);
    saveButton.addEventListener('mouseleave', clearTimer);

    // Touch events
    saveButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePressStart();
    });
    saveButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        handlePressEnd();
    });
    saveButton.addEventListener('touchcancel', clearTimer);

    // Add touch drag support
    let touchDragItem = null;
    let touchStartY = 0;

    const handleTouchStart = (e, item) => {
        touchDragItem = item;
        touchStartY = e.touches[0].clientY;
        item.classList.add('dragging');
    };

    const handleTouchMove = (e) => {
        if (!touchDragItem) return;
        e.preventDefault();

        const touchY = e.touches[0].clientY;
        const allItems = [...historyContainer.querySelectorAll('.history-item')];
        const currentIndex = allItems.indexOf(touchDragItem);

        allItems.forEach((item, index) => {
            if (item === touchDragItem) return;

            const rect = item.getBoundingClientRect();
            const itemMiddle = rect.top + rect.height / 2;

            if (touchY < itemMiddle && index < currentIndex) {
                item.parentNode.insertBefore(touchDragItem, item);
            } else if (touchY > itemMiddle && index > currentIndex) {
                item.parentNode.insertBefore(touchDragItem, item.nextSibling);
            }
        });
    };

    const handleTouchEnd = () => {
        if (!touchDragItem) return;
        touchDragItem.classList.remove('dragging');
        touchDragItem = null;
        saveHistory();
    };

    // Add touch event listeners to history container
    historyContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    historyContainer.addEventListener('touchend', handleTouchEnd);

    // Define touch handlers before addToHistory
    const addTouchHandlers = (historyItem) => {
        historyItem.addEventListener('touchstart', (e) => {
            // Only start drag after a short delay to allow for normal taps
            const touchTimer = setTimeout(() => {
                handleTouchStart(e, historyItem);
            }, 200);

            historyItem.addEventListener('touchend', () => {
                clearTimeout(touchTimer);
            }, { once: true });
        });
    };

    // Helper function to highlight trailing whitespace
    const highlightTrailingWhitespace = (text) => {
        const trimmed = text.trimEnd();
        const trailing = text.slice(trimmed.length);
        if (!trailing) return { html: text, original: text };
        
        // Replace each space with a non-breaking space for display
        const visibleSpaces = trailing.replace(/ /g, '\u00A0');
        return {
            html: `${trimmed}<span class="trailing-space">${visibleSpaces}</span>`,
            original: text
        };
    };

    // Render button content based on alias/secret state
    const renderButtonContent = (button) => {
        const text = button.dataset.originalText;
        const alias = button.dataset.alias;
        const isSecret = button.dataset.isSecret === 'true';

        button.classList.toggle('secret-item', isSecret && !alias);

        if (alias && !isSecret) {
            const { html: subtitleHtml } = highlightTrailingWhitespace(text);
            button.innerHTML = `<span class="alias-title">${alias}</span><span class="alias-subtitle">${subtitleHtml}</span>`;
        } else if (alias && isSecret) {
            button.innerHTML = `<span class="alias-title">${alias}</span>`;
            button.classList.add('secret-item');
        } else if (isSecret) {
            button.textContent = '•••••';
            button.classList.add('secret-item');
        } else {
            const { html } = highlightTrailingWhitespace(text);
            button.innerHTML = html;
        }
    };

    // Modified addToHistory function
    const addToHistory = (text, alias = null, isSecret = false) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        // Only enable drag on non-touch devices
        if (!('ontouchstart' in window)) {
            historyItem.draggable = true;

            // Drag event handlers
            historyItem.addEventListener('dragstart', (e) => {
                historyItem.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            historyItem.addEventListener('dragend', () => {
                historyItem.classList.remove('dragging');
                saveHistory(); // Save after drag ends
            });

            historyItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                const draggingItem = document.querySelector('.dragging');
                if (draggingItem && draggingItem !== historyItem) {
                    const allItems = [...historyContainer.querySelectorAll('.history-item')];
                    const currentPos = allItems.indexOf(historyItem);
                    const draggingPos = allItems.indexOf(draggingItem);

                    if (currentPos < draggingPos) {
                        historyItem.parentNode.insertBefore(draggingItem, historyItem);
                    } else {
                        historyItem.parentNode.insertBefore(draggingItem, historyItem.nextSibling);
                    }
                }
            });
        } else {
            // Add touch handlers for touch devices
            addTouchHandlers(historyItem);
        }

        const button = document.createElement('button');
        button.className = 'history-button';
        button.dataset.originalText = text;
        button.dataset.alias = alias || '';
        button.dataset.isSecret = isSecret ? 'true' : 'false';
        renderButtonContent(button);

        button.onclick = () => updateBarcode(button.dataset.originalText, button.dataset.isSecret === 'true');

        // Double-tap to edit (mobile)
        let lastTapTime = 0;
        button.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTapTime < 300) {
                e.preventDefault();
                openEditModal(button, historyItem);
            }
            lastTapTime = now;
        });
        // Double-click to edit (desktop)
        button.addEventListener('dblclick', (e) => {
            e.preventDefault();
            openEditModal(button, historyItem);
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '×';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            handleDelete(historyItem, alias);
        };

        historyItem.appendChild(button);
        historyItem.appendChild(deleteButton);
        historyContainer.insertBefore(historyItem, historyContainer.firstChild);
        saveHistory();
    };

    // Save current text to history
    const saveCurrentText = () => {
        const text = input.value;
        if (text !== '') {
            if (text === 'hunter2') {
                // Easter egg: Save as secret with asterisks
                addToHistory(text, '*******', true);
                updateBarcode(text, true);
            } else {
                addToHistory(text);
                updateBarcode(text, false);
            }
            input.value = '';
        }
    };

    // Update barcode when text changes
    input.addEventListener('input', (e) => {
        const text = e.target.value;
        if (text !== '') {
            updateBarcode(text, false);
        }
    });

    // Handle Enter key
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveCurrentText();
        }
    });

    // Initialize history from localStorage
    const savedHistory = loadHistory();
    savedHistory.reverse().forEach(item => addToHistory(item.text, item.alias, item.isSecret));

    // Show the most recent barcode
    if (savedHistory.length > 0) {
        const lastItem = savedHistory[savedHistory.length - 1];
        updateBarcode(lastItem.text, lastItem.isSecret);
    }
}; 