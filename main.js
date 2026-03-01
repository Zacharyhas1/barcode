import { createScanner } from './modules/scanner.js';
import { loadHistory, persistHistory, clearHistory } from './modules/store.js';
import { createDragSystem } from './modules/drag.js';

// Wait for JsBarcode to be available
window.onload = () => {
    const input = document.getElementById('barcodeInput');
    const saveButton = document.getElementById('saveButton');
    const newFolderButton = document.getElementById('newFolderButton');
    const scanButton = document.getElementById('scanButton');
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
            <div id="modalList" class="modal-list"></div>
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

    // Scanner module
    const scanner = createScanner({
        onResult: (decodedText) => {
            input.value = decodedText;
            updateBarcode(decodedText, false);
        }
    });
    scanButton.addEventListener('click', () => scanner.open());

    // Modal elements
    const modalTitle = document.getElementById('modalTitle');
    const displayNameInput = document.getElementById('displayNameInput');
    const modalList = document.getElementById('modalList');
    const editFields = document.getElementById('editFields');
    const editTextInput = document.getElementById('editTextInput');
    const editAliasInput = document.getElementById('editAliasInput');
    const editSecretToggle = document.getElementById('editSecretToggle');
    const cancelModal = document.getElementById('cancelModal');
    const confirmModal = document.getElementById('confirmModal');

    // Save history to localStorage - walks DOM tree for folder structure
    const saveHistory = () => {
        const serializeButton = (button) => ({
            text: button.dataset.originalText,
            alias: button.dataset.alias || null,
            isSecret: button.dataset.isSecret === 'true',
            format: button.dataset.format || 'barcode'
        });

        const result = [];
        [...historyContainer.children].forEach(child => {
            if (child.classList.contains('history-item')) {
                result.push(serializeButton(child.querySelector('.history-button')));
            } else if (child.classList.contains('folder')) {
                const folderItems = [];
                const folderItemsEl = child.querySelector('.folder-items');
                [...folderItemsEl.children].forEach(item => {
                    if (item.classList.contains('history-item')) {
                        folderItems.push(serializeButton(item.querySelector('.history-button')));
                    }
                });
                result.push({
                    type: 'folder',
                    name: child.dataset.folderName,
                    collapsed: child.classList.contains('collapsed'),
                    items: folderItems
                });
            }
        });
        persistHistory(result);
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

    // Renderer registry -- each format knows how to render itself
    const renderers = {
        barcode: {
            cssClass: null,
            render(img, text, isSecret, isFullscreen) {
                const options = { ...barcodeOptions, displayValue: !isSecret };
                if (isFullscreen) {
                    JsBarcode("#barcode", text, { ...options, width: 2, height: 200, fontSize: 30, margin: 10 });
                } else {
                    JsBarcode("#barcode", text, options);
                }
            }
        },
        qr: {
            cssClass: 'qr-mode',
            render(img, text, isSecret, isFullscreen) {
                img.removeAttribute('width');
                img.removeAttribute('height');
                const qr = qrcode(0, 'M');
                qr.addData(text);
                qr.make();
                const cellSize = isFullscreen ? 8 : 4;
                const margin = isFullscreen ? 4 : 2;
                img.src = qr.createDataURL(cellSize, margin);
            }
        },
        image: {
            cssClass: 'image-mode',
            render(img, text) {
                img.removeAttribute('width');
                img.removeAttribute('height');
                img.src = text;
            }
        }
    };

    const allFormatClasses = Object.values(renderers).map(r => r.cssClass).filter(Boolean);

    // Function to update barcode or QR code
    const updateBarcode = (text, isSecret = false, format = 'barcode') => {
        if (text === '') return;
        try {
            currentBarcodeText = text;
            isCurrentBarcodeSecret = isSecret;
            currentBarcodeFormat = format;

            const barcodeImg = document.getElementById('barcode');
            const isFullscreen = barcodeContainer.classList.contains('fullscreen');
            const renderer = renderers[format] || renderers.barcode;

            allFormatClasses.forEach(cls => barcodeContainer.classList.remove(cls));
            if (renderer.cssClass) barcodeContainer.classList.add(renderer.cssClass);

            renderer.render(barcodeImg, text, isSecret, isFullscreen);
        } catch (error) {
            console.error('Failed to generate code:', error);
        }
    };

    // Unified modal function -- handles input, list, edit, and confirm modes
    const showModal = ({ title, inputMode, listItems, editMode, confirmText, onConfirm }) => {
        // Reset all sections
        modalTitle.textContent = title;
        displayNameInput.style.display = inputMode ? 'block' : 'none';
        modalList.style.display = listItems ? 'flex' : 'none';
        modalList.innerHTML = '';
        editFields.style.display = editMode ? 'flex' : 'none';
        confirmModal.textContent = confirmText || 'Save';
        confirmModal.className = '';

        // Pre-populate edit fields if provided
        if (editMode) {
            editTextInput.value = editMode.text || '';
            editAliasInput.value = editMode.alias || '';
            editSecretToggle.checked = !!editMode.isSecret;
        }

        modal.style.display = 'flex';
        if (inputMode) {
            displayNameInput.value = '';
            displayNameInput.focus();
        } else if (editMode) {
            editTextInput.focus();
        }

        // Single cleanup path for all modes
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            editFields.style.display = 'none';
            confirmModal.removeEventListener('click', handleConfirm);
            cancelModal.removeEventListener('click', handleCancel);
            displayNameInput.removeEventListener('keypress', handleEnter);
            editTextInput.removeEventListener('keypress', handleEnter);
            editAliasInput.removeEventListener('keypress', handleEnter);
        };

        const getResult = () => {
            if (editMode) {
                return {
                    text: editTextInput.value.trim(),
                    alias: editAliasInput.value.trim(),
                    isSecret: editSecretToggle.checked
                };
            }
            return displayNameInput.value.trim();
        };

        const handleConfirm = () => {
            const result = getResult();
            if (editMode && !result.text) { cleanup(); modal.style.display = 'none'; return; }
            onConfirm(result);
            modal.style.display = 'none';
            cleanup();
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanup();
        };

        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };

        if (listItems) {
            listItems.forEach(item => {
                const option = document.createElement('button');
                option.className = 'modal-list-option';
                option.textContent = item.label;
                option.addEventListener('click', () => {
                    modal.style.display = 'none';
                    cleanup();
                    onConfirm(item.value);
                });
                modalList.appendChild(option);
            });
            confirmModal.style.display = 'none';
            cancelModal.addEventListener('click', handleCancel);
        } else {
            confirmModal.style.display = 'block';
            confirmModal.addEventListener('click', handleConfirm);
            cancelModal.addEventListener('click', handleCancel);
            if (inputMode) displayNameInput.addEventListener('keypress', handleEnter);
            if (editMode) {
                editTextInput.addEventListener('keypress', handleEnter);
                editAliasInput.addEventListener('keypress', handleEnter);
            }
        }
    };

    // Edit modal for double-tap -- uses showModal with editMode
    const openEditModal = (button) => {
        showModal({
            title: 'Edit Barcode',
            editMode: {
                text: button.dataset.originalText,
                alias: button.dataset.alias || '',
                isSecret: button.dataset.isSecret === 'true'
            },
            confirmText: 'Save',
            onConfirm: (result) => {
                button.dataset.originalText = result.text;
                button.dataset.alias = result.alias || '';
                button.dataset.isSecret = result.isSecret ? 'true' : 'false';
                renderButtonContent(button);
                updateBarcode(result.text, result.isSecret, button.dataset.format || 'barcode');
                saveHistory();
            }
        });
    };

    // Delete handler for history items
    const handleDelete = (historyItem, alias) => {
        const button = historyItem.querySelector('.history-button');
        const itemText = alias || button.dataset.alias || button.dataset.originalText;
        showModal({
            title: `Delete "${itemText}"?`,
            inputMode: false,
            confirmText: 'Delete',
            onConfirm: () => {
                const parentFolder = historyItem.closest('.folder');
                historyItem.remove();
                if (parentFolder) updateFolderCount(parentFolder);
                saveHistory();
            }
        });
    };

    // Delete handler for folders
    const handleFolderDelete = (folder) => {
        const name = folder.dataset.folderName;
        const itemCount = folder.querySelectorAll('.folder-items > .history-item').length;
        if (itemCount === 0) {
            showModal({
                title: `Delete folder "${name}"?`,
                inputMode: false,
                confirmText: 'Delete',
                onConfirm: () => {
                    folder.remove();
                    saveHistory();
                }
            });
        } else {
            showModal({
                title: `Delete "${name}" (${itemCount} items)?`,
                listItems: [
                    { label: 'Keep items, delete folder', value: 'keep' },
                    { label: 'Delete folder and all items', value: 'delete' }
                ],
                onConfirm: (action) => {
                    if (action === 'keep') {
                        const items = [...folder.querySelectorAll('.folder-items > .history-item')];
                        items.forEach(item => {
                            historyContainer.insertBefore(item, folder);
                        });
                    }
                    folder.remove();
                    saveHistory();
                }
            });
        }
    };

    // Update folder item count badge
    const updateFolderCount = (folder) => {
        const count = folder.querySelectorAll('.folder-items > .history-item').length;
        const countEl = folder.querySelector('.folder-count');
        if (countEl) countEl.textContent = count;
    };

    // Ensure folder names are unique by appending (2), (3), etc.
    const getUniqueFolderName = (baseName) => {
        const existingNames = new Set(
            [...historyContainer.querySelectorAll('.folder')].map(f => f.dataset.folderName)
        );
        if (!existingNames.has(baseName)) return baseName;
        let counter = 2;
        while (existingNames.has(`${baseName} (${counter})`)) counter++;
        return `${baseName} (${counter})`;
    };

    // Show move-to-folder modal for an item
    const showMoveModal = (historyItem) => {
        const folders = [...historyContainer.querySelectorAll('.folder')];
        const currentFolder = historyItem.closest('.folder');

        const listItems = [];
        if (currentFolder) {
            listItems.push({ label: '(No Folder)', value: '__top__' });
        }
        folders.forEach(folder => {
            if (folder !== currentFolder) {
                listItems.push({
                    label: folder.dataset.folderName,
                    value: folder.dataset.folderName
                });
            }
        });

        if (listItems.length === 0) return;

        showModal({
            title: 'Move to...',
            listItems,
            onConfirm: (value) => {
                const oldFolder = historyItem.closest('.folder');
                if (value === '__top__') {
                    historyContainer.insertBefore(historyItem, historyContainer.firstChild);
                } else {
                    const targetFolder = [...historyContainer.querySelectorAll('.folder')]
                        .find(f => f.dataset.folderName === value);
                    if (targetFolder) {
                        const folderItems = targetFolder.querySelector('.folder-items');
                        folderItems.appendChild(historyItem);
                        updateFolderCount(targetFolder);
                        if (targetFolder.classList.contains('collapsed')) {
                            targetFolder.classList.remove('collapsed');
                        }
                    }
                }
                if (oldFolder) updateFolderCount(oldFolder);
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

    // New folder button
    newFolderButton.addEventListener('click', () => {
        showModal({
            title: 'New Folder',
            inputMode: true,
            confirmText: 'Create',
            onConfirm: (name) => {
                if (name) {
                    addFolder(getUniqueFolderName(name), [], false);
                    saveHistory();
                }
            }
        });
    });

    // Initialize drag system
    const { setupItemDrag, setupFolderDrag } = createDragSystem({
        historyContainer, saveHistory, updateFolderCount
    });

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

    // Create the main barcode/QR button for a history item
    const createHistoryButton = (text, alias, isSecret, format) => {
        const button = document.createElement('button');
        button.className = 'history-button';
        button.dataset.originalText = text;
        button.dataset.alias = alias || '';
        button.dataset.isSecret = isSecret ? 'true' : 'false';
        button.dataset.format = format;
        renderButtonContent(button);
        if (format === 'qr') button.classList.add('qr-item');
        else if (format === 'image') button.classList.add('image-item');

        button.onclick = () => {
            const fmt = button.dataset.format || 'barcode';
            updateToggleUI(fmt);
            updateBarcode(button.dataset.originalText, button.dataset.isSecret === 'true', fmt);
        };
        return button;
    };

    // Set up double-tap/double-click to edit
    const setupEditHandlers = (button) => {
        let lastTapTime = 0;
        button.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTapTime < 300) {
                e.preventDefault();
                openEditModal(button);
            }
            lastTapTime = now;
        });
        button.addEventListener('dblclick', (e) => {
            e.preventDefault();
            openEditModal(button);
        });
    };

    // Add a history item to the given container
    const addToHistory = (text, alias = null, isSecret = false, format = 'barcode', targetContainer = null) => {
        const container = targetContainer || historyContainer;
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        setupItemDrag(historyItem);

        const button = createHistoryButton(text, alias, isSecret, format);
        setupEditHandlers(button);

        const moveButton = document.createElement('button');
        moveButton.className = 'move-button';
        moveButton.textContent = '\u25B8';
        moveButton.onclick = (e) => { e.stopPropagation(); showMoveModal(historyItem); };

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '\u00D7';
        deleteButton.onclick = (e) => { e.stopPropagation(); handleDelete(historyItem, alias); };

        historyItem.append(button, moveButton, deleteButton);
        container.insertBefore(historyItem, container.firstChild);
        saveHistory();
    };

    // Add a folder to the history
    const addFolder = (name, items = [], collapsed = false) => {
        const folder = document.createElement('div');
        folder.className = 'folder' + (collapsed ? ' collapsed' : '');
        folder.dataset.folderName = name;

        const header = document.createElement('div');
        header.className = 'folder-header';

        const toggle = document.createElement('span');
        toggle.className = 'folder-toggle';
        toggle.textContent = '\u25BC';

        const nameEl = document.createElement('span');
        nameEl.className = 'folder-name';
        nameEl.textContent = name;

        const countEl = document.createElement('span');
        countEl.className = 'folder-count';
        countEl.textContent = items.length;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = '\u00D7';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            handleFolderDelete(folder);
        };

        header.appendChild(toggle);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(deleteBtn);

        // Toggle collapse on header click
        header.addEventListener('click', (e) => {
            if (e.target === deleteBtn) return;
            folder.classList.toggle('collapsed');
            saveHistory();
        });

        const folderItemsEl = document.createElement('div');
        folderItemsEl.className = 'folder-items';

        folder.appendChild(header);
        folder.appendChild(folderItemsEl);

        setupFolderDrag(folder, header, folderItemsEl);

        historyContainer.insertBefore(folder, historyContainer.firstChild);

        // Add items to the folder (reverse since addToHistory prepends)
        [...items].reverse().forEach(item => {
            addToHistory(item.text, item.alias, item.isSecret, item.format || 'barcode', folderItemsEl);
        });

        return folder;
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
        // Image format: neither toggle is active
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

    // Reset to defaults button
    document.getElementById('resetButton').addEventListener('click', () => {
        if (confirm('Reset all saved barcodes to defaults? This cannot be undone.')) {
            clearHistory();
            location.reload();
        }
    });

    // Initialize history from localStorage or config.json
    (async () => {
        const savedHistory = await loadHistory();
        savedHistory.reverse().forEach(item => {
            if (item.type === 'folder') {
                addFolder(item.name, item.items || [], item.collapsed || false);
            } else {
                addToHistory(item.text, item.alias, item.isSecret, item.format || 'barcode');
            }
        });

        // Show the most recent barcode and restore its format
        if (savedHistory.length > 0) {
            const lastItem = savedHistory[savedHistory.length - 1];
            if (lastItem.type === 'folder') {
                if (lastItem.items && lastItem.items.length > 0) {
                    const last = lastItem.items[lastItem.items.length - 1];
                    setFormat(last.format || 'barcode');
                    updateBarcode(last.text, last.isSecret, last.format || 'barcode');
                }
            } else {
                setFormat(lastItem.format || 'barcode');
                updateBarcode(lastItem.text, lastItem.isSecret, lastItem.format || 'barcode');
            }
        }
    })();
};
