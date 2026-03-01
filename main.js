// Wait for JsBarcode to be available
window.onload = () => {
    const input = document.getElementById('barcodeInput');
    const saveButton = document.getElementById('saveButton');
    const historyContainer = document.getElementById('historyContainer');
    const barcodeContainer = document.querySelector('.barcode-container');
    const defaultText = 'Hello World!';
    let longPressTimer;
    const LONG_PRESS_DURATION = 500; // 500ms for long press
    let wasLongPress = false;
    let pressStartTime;
    let pendingText = ''; // Store text waiting for display name
    let currentFormat = 'barcode'; // 'barcode' or 'qr'
    let formatOverride = false; // true when user manually toggles format

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
                        isSecret: !!item.displayName,
                        format: item.format || 'barcode'
                    };
                }
                return {
                    text: item.text,
                    alias: item.alias || null,
                    isSecret: !!item.isSecret,
                    format: item.format || 'barcode'
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
                isSecret: button.dataset.isSecret === 'true',
                format: button.dataset.format || 'barcode'
            }));
        localStorage.setItem('barcodeHistory', JSON.stringify(historyItems));
    };

    // Keep track of current barcode text, secret status, and format
    let currentBarcodeText = defaultText;
    let isCurrentBarcodeSecret = false;
    let currentBarcodeFormat = 'barcode';

    // Toggle fullscreen
    barcodeContainer.addEventListener('click', () => {
        barcodeContainer.classList.toggle('fullscreen');
        updateBarcode(currentBarcodeText, isCurrentBarcodeSecret, currentBarcodeFormat);
    });

    // Auto-detect format based on content
    const detectFormat = (text) => {
        if (/^https?:\/\/|^www\./i.test(text)) return 'qr';
        if (text.length > 40) return 'qr';
        return 'barcode';
    };

    // Function to update barcode or QR code
    const updateBarcode = (text, isSecret = false, format = 'barcode') => {
        if (text !== '') {
            try {
                currentBarcodeText = text;
                isCurrentBarcodeSecret = isSecret;
                currentBarcodeFormat = format;

                const barcodeImg = document.getElementById('barcode');
                const isFullscreen = barcodeContainer.classList.contains('fullscreen');

                if (format === 'qr') {
                    barcodeImg.removeAttribute('width');
                    barcodeImg.removeAttribute('height');
                    const qr = qrcode(0, 'M');
                    qr.addData(text);
                    qr.make();
                    const cellSize = isFullscreen ? 8 : 4;
                    const margin = isFullscreen ? 4 : 2;
                    barcodeImg.src = qr.createDataURL(cellSize, margin);
                    barcodeContainer.classList.add('qr-mode');
                } else {
                    barcodeContainer.classList.remove('qr-mode');
                    const options = {
                        ...barcodeOptions,
                        displayValue: !isSecret
                    };
                    if (isFullscreen) {
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
                }
            } catch (error) {
                console.error('Failed to generate code:', error);
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
            updateBarcode(newText, editSecretToggle.checked, button.dataset.format || 'barcode');
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
                            addToHistory(pendingText, alias, true, currentFormat);
                            updateBarcode(pendingText, true, currentFormat);
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
    const addToHistory = (text, alias = null, isSecret = false, format = 'barcode') => {
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
        button.dataset.format = format;
        renderButtonContent(button);
        if (format === 'qr') {
            button.classList.add('qr-item');
        }

        button.onclick = () => {
            const fmt = button.dataset.format || 'barcode';
            updateToggleUI(fmt);
            updateBarcode(button.dataset.originalText, button.dataset.isSecret === 'true', fmt);
        };

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
                addToHistory(text, '*******', true, currentFormat);
                updateBarcode(text, true, currentFormat);
            } else {
                addToHistory(text, null, false, currentFormat);
                updateBarcode(text, false, currentFormat);
            }
            input.value = '';
            formatOverride = false;
        }
    };

    // Update barcode when text changes (auto-detect format unless overridden)
    input.addEventListener('input', (e) => {
        const text = e.target.value;
        if (text === '') {
            formatOverride = false;
            return;
        }
        if (!formatOverride) {
            const detected = detectFormat(text);
            if (detected !== currentFormat) {
                updateToggleUI(detected);
            }
        }
        updateBarcode(text, false, currentFormat);
    });

    // Handle Enter key
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveCurrentText();
        }
    });

    // Format toggle handler
    const formatToggleBtn = document.getElementById('formatToggle');
    const formatToggleQRBtn = document.getElementById('formatToggleQR');

    const updateToggleUI = (format) => {
        currentFormat = format;
        formatToggleBtn.classList.toggle('active', format === 'barcode');
        formatToggleQRBtn.classList.toggle('active', format === 'qr');
    };

    const setFormat = (format) => {
        updateToggleUI(format);
        const text = input.value || currentBarcodeText;
        if (text) updateBarcode(text, isCurrentBarcodeSecret, currentFormat);
    };

    formatToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        formatOverride = true;
        setFormat('barcode');
    });
    formatToggleQRBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        formatOverride = true;
        setFormat('qr');
    });

    // Initialize history from localStorage
    const savedHistory = loadHistory();
    savedHistory.reverse().forEach(item => addToHistory(item.text, item.alias, item.isSecret, item.format || 'barcode'));

    // Show the most recent barcode and restore its format
    if (savedHistory.length > 0) {
        const lastItem = savedHistory[savedHistory.length - 1];
        setFormat(lastItem.format || 'barcode');
        updateBarcode(lastItem.text, lastItem.isSecret, lastItem.format || 'barcode');
    }
};