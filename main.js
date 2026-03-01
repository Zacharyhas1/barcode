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
    const cancelModal = document.getElementById('cancelModal');
    const confirmModal = document.getElementById('confirmModal');

    // Load history from localStorage
    const loadHistory = () => {
        const savedHistory = localStorage.getItem('barcodeHistory');
        if (savedHistory) {
            const items = JSON.parse(savedHistory);
            return items.map(item => ({
                text: item.text,
                displayName: item.displayName,
                format: item.format || 'barcode'
            }));
        }
        return [{ text: defaultText, displayName: null }];
    };

    // Save history to localStorage
    const saveHistory = () => {
        const historyItems = Array.from(historyContainer.querySelectorAll('.history-button'))
            .map(button => ({
                text: button.dataset.secret || button.dataset.originalText,
                displayName: button.dataset.secret ? button.textContent : null,
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

    // Modified delete handler
    const handleDelete = (historyItem, displayName) => {
        const itemText = displayName || historyItem.querySelector('.history-button').textContent;
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
                    title: 'Set Display Name',
                    inputMode: true,
                    confirmText: 'Save',
                    onConfirm: (displayName) => {
                        if (displayName) {
                            addToHistory(pendingText, displayName, currentFormat);
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

    // Modified addToHistory function
    const addToHistory = (text, displayName = null, format = 'barcode') => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // Only enable drag on non-touch devices
        if (!('ontouchstart' in window)) {
            historyItem.draggable = true;
            
            // Drag event handlers
            historyItem.addEventListener('dragstart', (e) => {
                console.log('dragstart');
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
        const displayText = displayName || text;
        const { html, original } = highlightTrailingWhitespace(displayText);
        button.innerHTML = html;
        button.dataset.originalText = original;  // Store the original text with spaces
        button.dataset.format = format;
        if (displayName) {
            button.dataset.secret = text;
            button.classList.add('secret-item');
        }
        if (format === 'qr') {
            button.classList.add('qr-item');
        }
        button.onclick = () => {
            const fmt = button.dataset.format || 'barcode';
            updateToggleUI(fmt);
            updateBarcode(button.dataset.secret || button.dataset.originalText, !!displayName, fmt);
        };

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '×';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            handleDelete(historyItem, displayName);
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
                addToHistory(text, '*******', currentFormat);
                updateBarcode(text, true, currentFormat);
            } else {
                addToHistory(text, null, currentFormat);
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
    savedHistory.reverse().forEach(item => addToHistory(item.text, item.displayName, item.format || 'barcode'));

    // Show the most recent barcode and restore its format
    if (savedHistory.length > 0) {
        const lastItem = savedHistory[savedHistory.length - 1];
        setFormat(lastItem.format || 'barcode');
        updateBarcode(lastItem.text, !!lastItem.displayName, lastItem.format || 'barcode');
    }
};