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
        if (!savedHistory) return [{ text: defaultText, displayName: null }];
        try {
            const parsed = JSON.parse(savedHistory);
            if (!Array.isArray(parsed)) return [{ text: defaultText, displayName: null }];
            return parsed.map(item => {
                if (item.type === 'folder') {
                    return {
                        type: 'folder',
                        name: item.name || 'Unnamed',
                        collapsed: !!item.collapsed,
                        items: Array.isArray(item.items)
                            ? item.items.map(i => ({ text: i.text || '', displayName: i.displayName || null }))
                            : []
                    };
                }
                return { text: item.text || '', displayName: item.displayName || null };
            }).filter(item => item.type === 'folder' || item.text);
        } catch (e) {
            return [{ text: defaultText, displayName: null }];
        }
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
            confirmModal.style.display = 'block';
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
                    addFolder(getUniqueFolderName(name), [], false);
                    saveHistory();
                }
            }
        });
    });

    // Add touch drag support
    let touchDragItem = null;
    let touchStartY = 0;
    let dragSourceFolder = null;
    let lastMovedOutOfFolder = null; // Anti-bounce: tracks folder we just moved out of

    // Update folder highlights during drag (green on destination, red on source)
    const updateDragFolderHighlights = (draggingItem) => {
        document.querySelectorAll('.folder-drop-target').forEach(f => f.classList.remove('folder-drop-target'));
        const currentFolder = draggingItem.closest('.folder');
        if (currentFolder && currentFolder !== dragSourceFolder) {
            currentFolder.classList.add('folder-drop-target');
        }
        if (dragSourceFolder) {
            if (currentFolder === dragSourceFolder) {
                dragSourceFolder.classList.remove('folder-drag-source');
            } else {
                dragSourceFolder.classList.add('folder-drag-source');
            }
        }
    };

    // --- Shared drag helpers (used by both desktop and touch) ---

    const startDrag = (item) => {
        item.classList.add('dragging');
        dragSourceFolder = item.classList.contains('folder') ? null : item.closest('.folder');
        if (dragSourceFolder) dragSourceFolder.classList.add('folder-drag-source');
        lastMovedOutOfFolder = null;
    };

    const endDrag = (item) => {
        if (item) item.classList.remove('dragging');
        document.querySelectorAll('.folder-drop-target').forEach(f => f.classList.remove('folder-drop-target'));
        document.querySelectorAll('.folder-drag-source').forEach(f => f.classList.remove('folder-drag-source'));
        dragSourceFolder = null;
        lastMovedOutOfFolder = null;
        saveHistory();
    };

    const moveItemIntoFolder = (item, folder) => {
        const oldFolder = item.closest('.folder');
        const folderItemsEl = folder.querySelector('.folder-items');
        folderItemsEl.insertBefore(item, folderItemsEl.firstChild);
        if (folder.classList.contains('collapsed')) folder.classList.remove('collapsed');
        updateFolderCount(folder);
        if (oldFolder) updateFolderCount(oldFolder);
        lastMovedOutOfFolder = null;
        updateDragFolderHighlights(item);
    };

    const moveItemOutOfFolder = (item, folder) => {
        historyContainer.insertBefore(item, folder);
        lastMovedOutOfFolder = folder;
        updateFolderCount(folder);
        updateDragFolderHighlights(item);
    };

    const reorderItem = (draggingItem, targetItem, clientY) => {
        const targetContainer = targetItem.parentNode;
        const dragContainer = draggingItem.parentNode;

        if (dragContainer !== targetContainer) {
            const oldFolder = draggingItem.closest('.folder');
            const rect = targetItem.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (clientY < midY) {
                targetContainer.insertBefore(draggingItem, targetItem);
            } else {
                targetContainer.insertBefore(draggingItem, targetItem.nextSibling);
            }
            if (oldFolder) updateFolderCount(oldFolder);
            const newFolder = draggingItem.closest('.folder');
            if (newFolder) updateFolderCount(newFolder);
            lastMovedOutOfFolder = null;
            updateDragFolderHighlights(draggingItem);
        } else {
            const siblings = [...targetContainer.children].filter(el =>
                el.classList.contains('history-item') || el.classList.contains('folder'));
            const currentIndex = siblings.indexOf(draggingItem);
            const targetIndex = siblings.indexOf(targetItem);
            if (targetIndex < currentIndex) {
                targetContainer.insertBefore(draggingItem, targetItem);
            } else {
                targetContainer.insertBefore(draggingItem, targetItem.nextSibling);
            }
        }
    };

    const reorderTopLevel = (draggingEl, referenceEl) => {
        const topLevel = [...historyContainer.children].filter(el =>
            el.classList.contains('history-item') || el.classList.contains('folder'));
        const draggingPos = topLevel.indexOf(draggingEl);
        const referencePos = topLevel.indexOf(referenceEl);
        if (referencePos < draggingPos) {
            historyContainer.insertBefore(draggingEl, referenceEl);
        } else {
            historyContainer.insertBefore(draggingEl, referenceEl.nextSibling);
        }
    };

    const moveItemToTopLevel = (item, clientY) => {
        const oldFolder = item.closest('.folder');
        if (!oldFolder) return;
        const topLevel = [...historyContainer.children].filter(el =>
            el.classList.contains('history-item') || el.classList.contains('folder'));
        let inserted = false;
        for (const child of topLevel) {
            const rect = child.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                historyContainer.insertBefore(item, child);
                inserted = true;
                break;
            }
        }
        if (!inserted) historyContainer.appendChild(item);
        updateFolderCount(oldFolder);
        updateDragFolderHighlights(item);
    };

    // --- Touch drag handlers (decomposed from single monolith) ---

    const handleTouchStart = (e, item) => {
        touchDragItem = item;
        touchStartY = e.touches[0].clientY;
        startDrag(item);
    };

    const tryTouchFolderHeader = (touchY) => {
        const folders = [...historyContainer.querySelectorAll('.folder')];
        for (const folder of folders) {
            const header = folder.querySelector('.folder-header');
            const headerRect = header.getBoundingClientRect();
            if (touchY >= headerRect.top && touchY <= headerRect.bottom) {
                const folderItemsEl = folder.querySelector('.folder-items');
                if (touchDragItem.parentNode === folderItemsEl) {
                    moveItemOutOfFolder(touchDragItem, folder);
                } else if (lastMovedOutOfFolder !== folder) {
                    moveItemIntoFolder(touchDragItem, folder);
                }
                return true;
            }
        }
        return false;
    };

    const tryTouchItemReorder = (touchY) => {
        const allItems = [...document.querySelectorAll('.history-item:not(.dragging)')];
        for (const item of allItems) {
            const rect = item.getBoundingClientRect();
            if (touchY >= rect.top && touchY <= rect.bottom) {
                reorderItem(touchDragItem, item, touchY);
                return true;
            }
        }
        return false;
    };

    const tryTouchEmptyFolder = (touchY) => {
        const folders = [...historyContainer.querySelectorAll('.folder')];
        for (const folder of folders) {
            const folderRect = folder.getBoundingClientRect();
            if (touchY >= folderRect.top && touchY <= folderRect.bottom) {
                const folderItemsEl = folder.querySelector('.folder-items');
                if (touchDragItem.parentNode === folderItemsEl) return true;
                if (lastMovedOutOfFolder === folder) return true;
                moveItemIntoFolder(touchDragItem, folder);
                return true;
            }
        }
        return false;
    };

    const handleTouchMove = (e) => {
        if (!touchDragItem) return;
        e.preventDefault();
        const touchY = e.touches[0].clientY;

        if (touchDragItem.classList.contains('folder')) {
            // Folder dragging: only reorder at top level
            const topLevel = [...historyContainer.children].filter(el =>
                el.classList.contains('history-item') || el.classList.contains('folder'));
            for (const child of topLevel) {
                if (child === touchDragItem) continue;
                const rect = child.getBoundingClientRect();
                if (touchY >= rect.top && touchY <= rect.bottom) {
                    reorderTopLevel(touchDragItem, child);
                    return;
                }
            }
            return;
        }

        // Item dragging: try each phase in priority order
        if (tryTouchFolderHeader(touchY)) return;
        if (tryTouchItemReorder(touchY)) return;
        if (tryTouchEmptyFolder(touchY)) return;
        if (touchDragItem.closest('.folder')) moveItemToTopLevel(touchDragItem, touchY);
    };

    const handleTouchEnd = () => {
        if (!touchDragItem) return;
        const item = touchDragItem;
        touchDragItem = null;
        endDrag(item);
    };

    // Add touch event listeners to history container
    historyContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    historyContainer.addEventListener('touchend', handleTouchEnd);

    // Define touch handlers before addToHistory
    const addTouchHandlers = (historyItem) => {
        historyItem.addEventListener('touchstart', (e) => {
            const startY = e.touches[0].clientY;
            const touchTimer = setTimeout(() => {
                handleTouchStart(e, historyItem);
            }, 200);

            const onMove = (moveE) => {
                if (Math.abs(moveE.touches[0].clientY - startY) > 10) {
                    clearTimeout(touchTimer);
                    historyItem.removeEventListener('touchmove', onMove);
                }
            };
            historyItem.addEventListener('touchmove', onMove);
            historyItem.addEventListener('touchend', () => {
                clearTimeout(touchTimer);
                historyItem.removeEventListener('touchmove', onMove);
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

            historyItem.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                startDrag(historyItem);
                e.dataTransfer.effectAllowed = 'move';
            });

            historyItem.addEventListener('dragend', (e) => {
                e.stopPropagation();
                endDrag(historyItem);
            });

            historyItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const draggingItem = document.querySelector('.history-item.dragging');
                if (!draggingItem || draggingItem === historyItem) return;
                reorderItem(draggingItem, historyItem, e.clientY);
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
        moveButton.textContent = '\u25B8';
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
                startDrag(folder);
                e.dataTransfer.effectAllowed = 'move';
            });

            folder.addEventListener('dragend', () => {
                endDrag(folder);
            });

            folder.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = document.querySelector('.history-item.dragging');
                if (!dragging) return;
                if (dragging.parentNode === folderItemsEl) return;
                if (lastMovedOutOfFolder === folder) return;
                moveItemIntoFolder(dragging, folder);
            });

            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const dragging = document.querySelector('.dragging');
                if (!dragging || dragging === folder) return;

                if (dragging.classList.contains('history-item')) {
                    if (dragging.parentNode === folderItemsEl) {
                        moveItemOutOfFolder(dragging, folder);
                    } else if (lastMovedOutOfFolder !== folder) {
                        moveItemIntoFolder(dragging, folder);
                    }
                } else if (dragging.classList.contains('folder') && dragging.parentNode === historyContainer) {
                    reorderTopLevel(dragging, folder);
                }
            });
        } else {
            // Touch drag for folder reordering via header
            header.addEventListener('touchstart', (e) => {
                const startY = e.touches[0].clientY;
                const touchTimer = setTimeout(() => {
                    handleTouchStart(e, folder);
                }, 200);
                const onMove = (moveE) => {
                    if (Math.abs(moveE.touches[0].clientY - startY) > 10) {
                        clearTimeout(touchTimer);
                        header.removeEventListener('touchmove', onMove);
                    }
                };
                header.addEventListener('touchmove', onMove);
                header.addEventListener('touchend', () => {
                    clearTimeout(touchTimer);
                    header.removeEventListener('touchmove', onMove);
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
