// ============================================================
// QRDeliveryPanel — Post-exam QR code display + sync status.
// Renders the encrypted QR payload for offline delivery.
// ============================================================

import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import {
  QrCode, ShieldCheck, CheckCircle2, RefreshCw, Clock, Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { OfflineDeliveryState } from '../hooks/useOfflineDelivery';

interface QRDeliveryPanelProps {
  payload: string;
  studentName: string;
  score: number;
  deliveryState: OfflineDeliveryState;
}

export function QRDeliveryPanel({
  payload,
  studentName,
  score,
  deliveryState,
}: QRDeliveryPanelProps): JSX.Element {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDownload = (): void => {
    if (!containerRef.current) return;

    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = `exu-result-${studentName.replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(svgUrl);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center"
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-indigo-300">
        <QrCode className="size-6" />
        <h2 className="text-xl font-bold text-white">{t('qr.title')}</h2>
      </div>

      <p className="max-w-sm text-sm text-white/60">{t('qr.desc')}</p>

      {/* QR Code */}
      <div ref={containerRef} className="rounded-2xl border border-white/10 bg-white p-5 shadow-2xl">
        <QRCodeSVG
          value={payload}
          size={220}
          level="H"
          includeMargin={false}
          fgColor="#1e1b4b"
          bgColor="#ffffff"
        />
      </div>

      {/* Security badge */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
        <ShieldCheck className="size-4 text-emerald-400" />
        <span className="text-xs font-medium text-emerald-300">
          {t('qr.encrypted_label')}
        </span>
      </div>

      {/* Sync status */}
      <SyncStatusIndicator state={deliveryState} />

      {/* Download button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleDownload}
        className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/20"
      >
        <Download className="size-4" />
        {t('qr.download')}
      </motion.button>

      <p className="text-xs text-white/30">{t('qr.scan_instruction')}</p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// SYNC STATUS INDICATOR
// ─────────────────────────────────────────────

function SyncStatusIndicator({ state }: { state: OfflineDeliveryState }): JSX.Element {
  const { t } = useTranslation();

  if (state.isSynced) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2"
      >
        <CheckCircle2 className="size-4 text-emerald-400" />
        <span className="text-xs font-medium text-emerald-300">{t('qr.synced')}</span>
      </motion.div>
    );
  }

  if (state.isSyncing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
        <RefreshCw className="size-4 animate-spin text-blue-400" />
        <span className="text-xs font-medium text-blue-300">{t('connectivity.syncing')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
        <Clock className="size-4 text-amber-400" />
        <span className="text-xs font-medium text-amber-300">{t('qr.pending')}</span>
      </div>
      <button
        onClick={state.retrySync}
        className="text-xs text-indigo-400 underline hover:text-indigo-300"
      >
        {t('qr.retry')}
      </button>
    </div>
  );
}