// ============================================================
// QRCameraScanner — Live QR scanning via device camera.
//
// Uses html5-qrcode (Html5Qrcode class) for programmatic control.
// Lazy-loads the library to avoid bundle bloat.
//
// Props:
//   onScan(text)  — Called once when a QR code is successfully decoded.
//   onError(msg)  — Called if the camera cannot be initialized.
//   isActive      — Controls whether the scanner is running.
//
// Design:
//   - Mounts a dedicated div that html5-qrcode attaches its video element to.
//   - Cleans up (stops scanner + releases camera) on unmount or isActive=false.
//   - Requests rear camera first (environment facing mode).
//   - Debounces repeated successful scans (1s cooldown).
//   - Applies custom overlay instead of using html5-qrcode's default UI.
// ============================================================

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, CameraOff, Loader2, ScanLine } from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface QRCameraScannerProps {
  onScan: (text: string) => void;
  onError?: (message: string) => void;
  isActive: boolean;
}

type ScannerStatus = 'idle' | 'requesting' | 'scanning' | 'error' | 'cooldown';

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export function QRCameraScanner({ onScan, onError, isActive }: QRCameraScannerProps): JSX.Element {
  const uniqueId = useId().replace(/:/g, '_');
  const divId = `qr-camera-${uniqueId}`;

  const scannerRef = useRef<any>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  // ─── Start Scanner ──────────────────────────────────────────
  const startScanner = useCallback(async (): Promise<void> => {
    if (!isActive) return;

    setStatus('requesting');
    setErrorMessage(null);

    try {
      // Dynamically import to avoid SSR/bundle issues
      const { Html5Qrcode } = await import('html5-qrcode');

      const qr = new Html5Qrcode(divId, {
        verbose: false,
      });
      scannerRef.current = qr;

      await qr.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (width: number, height: number) => {
            const minEdge = Math.min(width, height);
            const boxSize = Math.floor(minEdge * 0.65);
            return { width: boxSize, height: boxSize };
          },
          aspectRatio: 1.0,
          disableFlip: false,
          // Suppress html5-qrcode's own UI elements
          showTorchButtonIfSupported: false,
          showZoomSliderIfSupported: false,
          defaultZoomValueIfSupported: 1,
          videoConstraints: {
            facingMode: { ideal: 'environment' },
          },
        },
        (decodedText) => {
          // Debounce: ignore if in cooldown
          if (cooldownRef.current) return;

          console.info('[QRCamera] Decoded:', decodedText.slice(0, 30) + '…');
          setLastScanned(decodedText);
          setStatus('cooldown');
          onScan(decodedText);

          // 1.5s cooldown before accepting another scan
          cooldownRef.current = setTimeout(() => {
            cooldownRef.current = null;
            setStatus('scanning');
          }, 1500);
        },
        () => {
          // QR not found in current frame — this is normal, suppress noise
        },
      );

      setStatus('scanning');
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error('[QRCamera] Start error:', msg);

      // Friendly error messages
      let friendlyMsg = 'No se pudo acceder a la cámara.';
      if (msg.includes('Permission') || msg.includes('permission')) {
        friendlyMsg = 'Permiso de cámara denegado. Actívalo en la configuración del navegador.';
      } else if (msg.includes('NotFound') || msg.includes('no cameras')) {
        friendlyMsg = 'No se detectó ninguna cámara en este dispositivo.';
      } else if (msg.includes('NotReadable')) {
        friendlyMsg = 'La cámara está siendo usada por otra aplicación.';
      }

      setStatus('error');
      setErrorMessage(friendlyMsg);
      onError?.(friendlyMsg);
    }
  }, [isActive, divId, onScan, onError]);

  // ─── Stop Scanner ───────────────────────────────────────────
  const stopScanner = useCallback(async (): Promise<void> => {
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current);
      cooldownRef.current = null;
    }

    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Ignore stop errors (scanner may already be stopped)
      }
      scannerRef.current = null;
    }

    setStatus('idle');
  }, []);

  // ─── Lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isActive, startScanner, stopScanner]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Camera viewport container */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        {/* html5-qrcode attaches its <video> element here */}
        <div
          id={divId}
          className="w-full"
          style={{ minHeight: '240px' }}
        />

        {/* Scan overlay — only shown when scanning */}
        <AnimatePresence>
          {status === 'scanning' && (
            <motion.div
              key="scan-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              {/* Corner brackets */}
              <div className="relative size-44">
                {/* Top-left */}
                <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-indigo-400 rounded-tl-sm" />
                {/* Top-right */}
                <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-indigo-400 rounded-tr-sm" />
                {/* Bottom-left */}
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-sm" />
                {/* Bottom-right */}
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-indigo-400 rounded-br-sm" />

                {/* Scanning line */}
                <motion.div
                  animate={{ top: ['10%', '85%', '10%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute left-2 right-2 h-0.5 bg-indigo-400/70"
                  style={{ position: 'absolute' }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success flash */}
        <AnimatePresence>
          {status === 'cooldown' && (
            <motion.div
              key="scan-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-500/20"
            >
              <div className="flex flex-col items-center gap-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex size-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40"
                >
                  <span className="text-2xl text-white">✓</span>
                </motion.div>
                <p className="text-sm font-bold text-emerald-300">¡QR detectado!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Requesting camera */}
        {status === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/80">
            <Loader2 className="size-8 animate-spin text-indigo-400" />
            <p className="text-sm text-white/60">Iniciando cámara…</p>
          </div>
        )}

        {/* Idle state */}
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/60">
            <Camera className="size-10 text-white/20" />
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/80 p-6 text-center">
            <CameraOff className="size-10 text-red-400" />
            <p className="text-sm text-white/60">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-2">
        <ScanLine className={`size-4 ${
          status === 'scanning' ? 'text-indigo-400 animate-pulse' :
          status === 'cooldown' ? 'text-emerald-400' :
          status === 'error' ? 'text-red-400' :
          'text-white/20'
        }`} />
        <p className="text-xs text-white/50">
          {status === 'idle' && 'Cámara inactiva'}
          {status === 'requesting' && 'Solicitando acceso a cámara…'}
          {status === 'scanning' && 'Apunta al código QR del estudiante'}
          {status === 'cooldown' && lastScanned && `Leído: ${lastScanned.slice(0, 20)}…`}
          {status === 'error' && 'Error de cámara'}
        </p>
      </div>
    </div>
  );
}
