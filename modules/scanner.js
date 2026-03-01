// Scanner module -- handles camera and file-based barcode/QR scanning
// Interface: createScanner(containerElement, { onResult }) => { open(), close() }

export function createScanner({ onResult }) {
    let html5Qrcode = null;
    let isScannerRunning = false;
    let nativeStream = null;
    let nativeScanFrame = null;
    let html5QrcodeLoaded = typeof Html5Qrcode !== 'undefined';
    const cameraAvailable = window.isSecureContext && !!navigator.mediaDevices;

    // Build overlay DOM
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
    const scanCameraBtn = scanOverlay.querySelector('#scanCameraBtn');
    const scanFileBtn = scanOverlay.querySelector('#scanFileBtn');
    const scanStatus = scanOverlay.querySelector('#scanStatus');
    const scanFileInput = scanOverlay.querySelector('#scanFileInput');
    const scanViewfinder = scanOverlay.querySelector('#scanViewfinder');

    const setScanStatus = (message, type = '') => {
        scanStatus.textContent = message;
        scanStatus.className = 'scan-status' + (type ? ' ' + type : '');
    };

    const onScanSuccess = (decodedText) => {
        close();
        onResult(decodedText);
    };

    // Lazy-load html5-qrcode from jsDelivr on first use
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
                    nativeScanFrame = setTimeout(scanLoop, 100);
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
            html5Qrcode = new Html5Qrcode(scanViewfinder.id);
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
            html5Qrcode = new Html5Qrcode(scanViewfinder.id);
        }

        try {
            const result = await html5Qrcode.scanFile(file, true);
            onScanSuccess(result);
        } catch (err) {
            setScanStatus('No barcode or QR code found in image. Try a clearer photo.', 'error');
        }
    };

    const open = async () => {
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

    const close = async () => {
        if (!scanOverlay.classList.contains('active')) return;
        scanOverlay.classList.remove('active');
        document.body.style.overflow = '';
        await stopScanner();
        html5Qrcode = null;
        scanViewfinder.innerHTML = '';
        setScanStatus('');
    };

    // Event listeners
    scanCloseBtn.addEventListener('click', close);

    scanOverlay.addEventListener('click', (e) => {
        if (e.target === scanOverlay) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scanOverlay.classList.contains('active')) {
            close();
        }
    });

    scanCameraBtn.addEventListener('click', () => startCameraScanner());
    scanFileBtn.addEventListener('click', () => scanFileInput.click());

    scanFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) scanFromFile(file);
        scanFileInput.value = '';
    });

    return { open, close };
}
