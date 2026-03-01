// Drag module -- handles all drag-and-drop reordering (desktop and touch)
// Dependencies: historyContainer element, saveHistory callback, updateFolderCount callback

export function createDragSystem({ historyContainer, saveHistory, updateFolderCount }) {
    let touchDragItem = null;
    let touchStartY = 0;
    let dragSourceFolder = null;
    let lastMovedOutOfFolder = null;

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

    // --- Touch drag handlers ---

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

    // Bind container-level touch events
    historyContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    historyContainer.addEventListener('touchend', handleTouchEnd);

    // Add touch drag handlers to an individual item
    const addTouchHandlers = (el) => {
        el.addEventListener('touchstart', (e) => {
            const startY = e.touches[0].clientY;
            const touchTimer = setTimeout(() => {
                handleTouchStart(e, el);
            }, 200);

            const onMove = (moveE) => {
                if (Math.abs(moveE.touches[0].clientY - startY) > 10) {
                    clearTimeout(touchTimer);
                    el.removeEventListener('touchmove', onMove);
                }
            };
            el.addEventListener('touchmove', onMove);
            el.addEventListener('touchend', () => {
                clearTimeout(touchTimer);
                el.removeEventListener('touchmove', onMove);
            }, { once: true });
        });
    };

    // Set up drag for a history item (desktop drag events + touch fallback)
    const setupItemDrag = (historyItem) => {
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
            addTouchHandlers(historyItem);
        }
    };

    // Set up drag for a folder (desktop + touch, including header interactions)
    const setupFolderDrag = (folder, header, folderItemsEl) => {
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
    };

    return { setupItemDrag, setupFolderDrag };
}
