// Wait for JsBarcode to be available
window.onload = () => {
    const input = document.getElementById('barcodeInput');
    const saveButton = document.getElementById('saveButton');
    const newFolderButton = document.getElementById('newFolderButton');
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
            <div id="modalList" class="modal-list"></div>
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
    const modalList = document.getElementById('modalList');
    const cancelModal = document.getElementById('cancelModal');
    const confirmModal = document.getElementById('confirmModal');

    // Load history from localStorage (supports folders)
    const loadHistory = () => {
        const savedHistory = localStorage.getItem('barcodeHistory');
        if (savedHistory) {
            return JSON.parse(savedHistory);
        }
        return [{ text: defaultText, displayName: null }];
    };

    // Save history to localStorage - walks DOM tree for folder structure
    const saveHistory = () => {
        const serializeButton = (button) => ({
            text: button.dataset.secret || button.dataset.originalText,
            displayName: button.dataset.secret ? button.textContent : null
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
        localStorage.setItem('barcodeHistory', JSON.stringify(result));
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

    // Show modal function - extended with list selection mode
    const showModal = ({ title, inputMode, listItems, confirmText, onConfirm }) => {
        modalTitle.textContent = title;
        displayNameInput.style.display = inputMode ? 'block' : 'none';
        modalList.style.display = listItems ? 'flex' : 'none';
        modalList.innerHTML = '';
        confirmModal.textContent = confirmText || 'Save';

        modal.style.display = 'flex';
        if (inputMode) {
            displayNameInput.value = '';
            displayNameInput.focus();
        }

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            confirmModal.removeEventListener('click', handleConfirm);
            cancelModal.removeEventListener('click', handleCancel);
            if (inputMode) {
                displayNameInput.removeEventListener('keypress', handleEnter);
            }
        };

        const handleConfirm = () => {
            onConfirm(displayNameInput.value.trim());
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
            confirmModal.style.display = '';
            confirmModal.addEventListener('click', handleConfirm);
            cancelModal.addEventListener('click', handleCancel);
            if (inputMode) {
                displayNameInput.addEventListener('keypress', handleEnter);
            }
        }
    };

    // Delete handler for history items
    const handleDelete = (historyItem, displayName) => {
        const itemText = displayName || historyItem.querySelector('.history-button').textContent;
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
                    title: 'Set Display Name',
                    inputMode: true,
                    confirmText: 'Save',
                    onConfirm: (displayName) => {
                        if (displayName) {
                            addToHistory(pendingText, displayName);
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

    // New folder button
    newFolderButton.addEventListener('click', () => {
        showModal({
            title: 'New Folder',
            inputMode: true,
            confirmText: 'Create',
            onConfirm: (name) => {
                if (name) {
                    addFolder(name, [], false);
                    saveHistory();
                }
            }
        });
    });

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

        // If dragging a folder, only reorder at top level
        if (touchDragItem.classList.contains('folder')) {
            const topLevel = [...historyContainer.children].filter(el =>
                el.classList.contains('history-item') || el.classList.contains('folder'));
            const currentIndex = topLevel.indexOf(touchDragItem);
            for (let i = 0; i < topLevel.length; i++) {
                if (topLevel[i] === touchDragItem) continue;
                const rect = topLevel[i].getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (touchY < midY && i < currentIndex) {
                    historyContainer.insertBefore(touchDragItem, topLevel[i]);
                    return;
                } else if (touchY > midY && i > currentIndex) {
                    historyContainer.insertBefore(touchDragItem, topLevel[i].nextSibling);
                    return;
                }
            }
            return;
        }

        // Dragging a history-item: check folder headers for drop-into or drag-out
        document.querySelectorAll('.folder-drop-target').forEach(f => f.classList.remove('folder-drop-target'));
        const folders = [...historyContainer.querySelectorAll('.folder')];
        for (const folder of folders) {
            const header = folder.querySelector('.folder-header');
            const headerRect = header.getBoundingClientRect();
            if (touchY >= headerRect.top && touchY <= headerRect.bottom) {
                const folderItemsEl = folder.querySelector('.folder-items');
                if (touchDragItem.parentNode === folderItemsEl) {
                    // Dragging over OWN folder header - move out to top level
                    const oldFolder = touchDragItem.closest('.folder');
                    historyContainer.insertBefore(touchDragItem, folder);
                    if (oldFolder) updateFolderCount(oldFolder);
                    return;
                }
                folder.classList.add('folder-drop-target');
                const oldFolder = touchDragItem.closest('.folder');
                folderItemsEl.insertBefore(touchDragItem, folderItemsEl.firstChild);
                if (folder.classList.contains('collapsed')) folder.classList.remove('collapsed');
                updateFolderCount(folder);
                if (oldFolder) updateFolderCount(oldFolder);
                return;
            }
        }

        // Check all visible history items for reordering (same or cross-container)
        const allItems = [...document.querySelectorAll('.history-item:not(.dragging)')];
        for (const item of allItems) {
            const rect = item.getBoundingClientRect();
            if (touchY < rect.top || touchY > rect.bottom) continue;
            const midY = rect.top + rect.height / 2;
            const targetContainer = item.parentNode;
            const dragContainer = touchDragItem.parentNode;

            if (dragContainer !== targetContainer) {
                const oldFolder = touchDragItem.closest('.folder');
                if (touchY < midY) {
                    targetContainer.insertBefore(touchDragItem, item);
                } else {
                    targetContainer.insertBefore(touchDragItem, item.nextSibling);
                }
                if (oldFolder) updateFolderCount(oldFolder);
                const newFolder = touchDragItem.closest('.folder');
                if (newFolder) updateFolderCount(newFolder);
            } else {
                const siblings = [...targetContainer.children].filter(el =>
                    el.classList.contains('history-item') || el.classList.contains('folder'));
                const currentIndex = siblings.indexOf(touchDragItem);
                const targetIndex = siblings.indexOf(item);
                if (touchY < midY && targetIndex < currentIndex) {
                    targetContainer.insertBefore(touchDragItem, item);
                } else if (touchY > midY && targetIndex > currentIndex) {
                    targetContainer.insertBefore(touchDragItem, item.nextSibling);
                }
            }
            return;
        }

        // Check if touch is within any folder's full bounds (for empty folders)
        for (const folder of folders) {
            const folderRect = folder.getBoundingClientRect();
            if (touchY >= folderRect.top && touchY <= folderRect.bottom) {
                const folderItemsEl = folder.querySelector('.folder-items');
                if (touchDragItem.parentNode === folderItemsEl) return;
                folder.classList.add('folder-drop-target');
                const oldFolder = touchDragItem.closest('.folder');
                folderItemsEl.insertBefore(touchDragItem, folderItemsEl.firstChild);
                if (folder.classList.contains('collapsed')) folder.classList.remove('collapsed');
                updateFolderCount(folder);
                if (oldFolder) updateFolderCount(oldFolder);
                return;
            }
        }

        // Fallback: dragging to empty space at top level - move out of folder
        if (touchDragItem.closest('.folder')) {
            const oldFolder = touchDragItem.closest('.folder');
            const topLevel = [...historyContainer.children].filter(el =>
                el.classList.contains('history-item') || el.classList.contains('folder'));
            let inserted = false;
            for (const child of topLevel) {
                const rect = child.getBoundingClientRect();
                if (touchY < rect.top + rect.height / 2) {
                    historyContainer.insertBefore(touchDragItem, child);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) historyContainer.appendChild(touchDragItem);
            if (oldFolder) updateFolderCount(oldFolder);
        }
    };

    const handleTouchEnd = () => {
        if (!touchDragItem) return;
        touchDragItem.classList.remove('dragging');
        touchDragItem = null;
        document.querySelectorAll('.folder-drop-target').forEach(f => f.classList.remove('folder-drop-target'));
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

    // Modified addToHistory function - supports target container for folders
    const addToHistory = (text, displayName = null, targetContainer = null) => {
        const container = targetContainer || historyContainer;
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
                document.querySelectorAll('.folder-drop-target').forEach(f => f.classList.remove('folder-drop-target'));
                saveHistory();
            });

            historyItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                const draggingItem = document.querySelector('.history-item.dragging');
                if (!draggingItem || draggingItem === historyItem) return;
                const dragParent = draggingItem.parentNode;
                const targetParent = historyItem.parentNode;

                if (dragParent !== targetParent) {
                    // Cross-container move
                    const oldFolder = draggingItem.closest('.folder');
                    const rect = historyItem.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        targetParent.insertBefore(draggingItem, historyItem);
                    } else {
                        targetParent.insertBefore(draggingItem, historyItem.nextSibling);
                    }
                    if (oldFolder) updateFolderCount(oldFolder);
                    const newFolder = historyItem.closest('.folder');
                    if (newFolder) updateFolderCount(newFolder);
                } else {
                    // Same container reorder
                    const allItems = [...targetParent.children].filter(el =>
                        el.classList.contains('history-item') || el.classList.contains('folder'));
                    const currentPos = allItems.indexOf(historyItem);
                    const draggingPos = allItems.indexOf(draggingItem);
                    if (currentPos < draggingPos) {
                        targetParent.insertBefore(draggingItem, historyItem);
                    } else {
                        targetParent.insertBefore(draggingItem, historyItem.nextSibling);
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
        if (displayName) {
            button.dataset.secret = text;
            button.classList.add('secret-item');
        }
        button.onclick = () => updateBarcode(button.dataset.secret || button.dataset.originalText, !!displayName);

        const moveButton = document.createElement('button');
        moveButton.className = 'move-button';
        moveButton.textContent = '\u{2B9E}';
        moveButton.onclick = (e) => {
            e.stopPropagation();
            showMoveModal(historyItem);
        };

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '\u00D7';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            handleDelete(historyItem, displayName);
        };

        historyItem.appendChild(button);
        historyItem.appendChild(moveButton);
        historyItem.appendChild(deleteButton);
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

        // Make folder draggable at top level
        if (!('ontouchstart' in window)) {
            folder.draggable = true;

            folder.addEventListener('dragstart', (e) => {
                folder.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            folder.addEventListener('dragend', () => {
                folder.classList.remove('dragging');
                document.querySelectorAll('.folder-drop-target').forEach(f => f.classList.remove('folder-drop-target'));
                saveHistory();
            });

            // Folder-level dragover: catch drops anywhere on the folder (e.g. empty folder body)
            folder.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = document.querySelector('.history-item.dragging');
                if (!dragging) return;
                if (dragging.parentNode === folderItemsEl) return;
                folder.classList.add('folder-drop-target');
                const oldFolder = dragging.closest('.folder');
                folderItemsEl.insertBefore(dragging, folderItemsEl.firstChild);
                if (folder.classList.contains('collapsed')) folder.classList.remove('collapsed');
                updateFolderCount(folder);
                if (oldFolder) updateFolderCount(oldFolder);
            });

            // Header dragover: accept items into folder, drag out, or reorder folders
            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Don't let folder-level dragover also fire
                const dragging = document.querySelector('.dragging');
                if (!dragging || dragging === folder) return;

                if (dragging.classList.contains('history-item')) {
                    if (dragging.parentNode === folderItemsEl) {
                        // Dragging over OWN folder header - move out to top level
                        folder.classList.remove('folder-drop-target');
                        historyContainer.insertBefore(dragging, folder);
                        updateFolderCount(folder);
                    } else {
                        // Dragging into this folder
                        folder.classList.add('folder-drop-target');
                        const oldFolder = dragging.closest('.folder');
                        folderItemsEl.insertBefore(dragging, folderItemsEl.firstChild);
                        if (folder.classList.contains('collapsed')) folder.classList.remove('collapsed');
                        updateFolderCount(folder);
                        if (oldFolder) updateFolderCount(oldFolder);
                    }
                } else if (dragging.classList.contains('folder') && dragging.parentNode === historyContainer) {
                    // Another folder dragged over this header - reorder at top level
                    const allTopLevel = [...historyContainer.children].filter(el =>
                        el.classList.contains('history-item') || el.classList.contains('folder'));
                    const currentPos = allTopLevel.indexOf(folder);
                    const draggingPos = allTopLevel.indexOf(dragging);
                    if (currentPos < draggingPos) {
                        historyContainer.insertBefore(dragging, folder);
                    } else {
                        historyContainer.insertBefore(dragging, folder.nextSibling);
                    }
                }
            });
        } else {
            // Touch drag for folder reordering via header
            header.addEventListener('touchstart', (e) => {
                const touchTimer = setTimeout(() => {
                    handleTouchStart(e, folder);
                }, 200);
                header.addEventListener('touchend', () => {
                    clearTimeout(touchTimer);
                }, { once: true });
            });
        }

        historyContainer.insertBefore(folder, historyContainer.firstChild);

        // Add items to the folder (reverse since addToHistory prepends)
        [...items].reverse().forEach(item => {
            addToHistory(item.text, item.displayName, folderItemsEl);
        });

        return folder;
    };

    // Save current text to history
    const saveCurrentText = () => {
        const text = input.value;
        if (text !== '') {
            if (text === 'hunter2') {
                // Easter egg: Save as secret with asterisks
                addToHistory(text, '*******');
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
    savedHistory.reverse().forEach(item => {
        if (item.type === 'folder') {
            addFolder(item.name, item.items || [], item.collapsed || false);
        } else {
            addToHistory(item.text, item.displayName);
        }
    });

    // Show the most recent barcode
    if (savedHistory.length > 0) {
        const lastItem = savedHistory[savedHistory.length - 1];
        if (lastItem.type === 'folder') {
            if (lastItem.items && lastItem.items.length > 0) {
                const last = lastItem.items[lastItem.items.length - 1];
                updateBarcode(last.text, !!last.displayName);
            }
        } else {
            updateBarcode(lastItem.text, !!lastItem.displayName);
        }
    }
};