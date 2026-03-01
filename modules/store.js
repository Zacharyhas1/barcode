// Store module -- handles data normalization, loading from localStorage/config.json, and persistence

const STORAGE_KEY = 'barcodeHistory';
const DEFAULT_TEXT = 'Hello World!';

// Normalize a single item -- handles old displayName format and current alias/isSecret
const normalizeItem = (item) => ({
    text: item.text || '',
    alias: item.alias || item.displayName || null,
    isSecret: item.isSecret !== undefined ? !!item.isSecret : !!item.displayName,
    format: item.format || 'barcode'
});

// Normalize a raw history array (from localStorage or config.json)
export function normalizeHistory(rawItems) {
    if (!Array.isArray(rawItems)) return null;
    return rawItems.map(item => {
        if (item.type === 'folder') {
            return {
                type: 'folder',
                name: item.name || 'Unnamed',
                collapsed: !!item.collapsed,
                items: Array.isArray(item.items) ? item.items.map(normalizeItem) : []
            };
        }
        return normalizeItem(item);
    }).filter(item => item.type === 'folder' || item.text);
}

function defaultHistory() {
    return [{ text: DEFAULT_TEXT, alias: null, isSecret: false, format: 'barcode' }];
}

// Load history from localStorage, falling back to config.json, then defaults
export async function loadHistory() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            return normalizeHistory(JSON.parse(saved)) || defaultHistory();
        } catch (e) {
            return defaultHistory();
        }
    }

    // No localStorage data -- load defaults from config.json
    try {
        const response = await fetch('config.json');
        if (!response.ok) throw new Error('Config not found');
        const config = await response.json();
        return normalizeHistory(config.barcodes) || defaultHistory();
    } catch (e) {
        return defaultHistory();
    }
}

// Persist a serialized history array to localStorage
export function persistHistory(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Clear localStorage history (for reset-to-defaults)
export function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
}
