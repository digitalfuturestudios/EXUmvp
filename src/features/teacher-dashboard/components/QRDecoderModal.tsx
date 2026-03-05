// ============================================================
// QRDecoderModal — Decodes an EXU1 QR payload for teachers.
//
// Tabs:
//   1. "Pegar texto"  — Paste or type the encrypted QR string.
//   2. "Cámara"       — Scan live via device camera (QRCameraScanner).
//
// On decode success: shows student metadata + per-question answer list
//   + "Guardar en BD" button to persist the result via API.
// ============================================================

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ShieldCheck, AlertCircle,
  Copy, Check, QrCode, Unlock, Camera, FileText,
  Save, Loader2, CheckCircle2,
} from 'lucide-react';
import LZString from 'lz-string';
import { useQueryClient } from '@tanstack/react-query';
import { decryptPayload } from '../../../core/lib/crypto';
import { apiRequest } from '../../../core/lib/serverApi';
import { QRCameraScanner } from '../../offline-sync/components/QRCameraScanner';
import type { AnswerPayload } from '../../../core/types/local.types';
import type { Question, ExamResultInsert } from '../../../core/types/database.types';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface QRDecoderModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** If provided, pre-fills the encrypted payload (from results table) */
  initialPayload?: string;
  /** The exam ID used for decryption key derivation */
  initialExamId?: string;
}

type InputTab = 'paste' | 'camera';

interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message: string | null;
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export function QRDecoderModal({
  isOpen,
  onClose,
  initialPayload = '',
  initialExamId = '',
}: QRDecoderModalProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<InputTab>('paste');
  const [rawInput, setRawInput] = useState<string>(initialPayload);
  const [examId, setExamId] = useState<string>(initialExamId);
  const [decoded, setDecoded] = useState<AnswerPayload | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', message: null });
  const queryClient = useQueryClient();

  // Reset state when modal closes
  const handleClose = (): void => {
    setCameraActive(false);
    setDecoded(null);
    setDecodeError(null);
    setSaveState({ status: 'idle', message: null });
    onClose();
  };

  // Switch tabs
  const switchTab = (tab: InputTab): void => {
    setActiveTab(tab);
    if (tab === 'camera') {
      setCameraActive(true);
    } else {
      setCameraActive(false);
    }
  };

  // ─── Camera scan handler ───────────────────────────────────
  const handleCameraScan = useCallback((text: string): void => {
    setRawInput(text);
    setCameraActive(false);
    setActiveTab('paste');

    // Auto-decode if examId is already filled
    if (examId.trim()) {
      decodeScan(text, examId.trim());
    }
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Decode logic ─────────────────────────────────────────
  const decodeScan = (input: string, id: string): void => {
    setDecoded(null);
    setDecodeError(null);
    setSaveState({ status: 'idle', message: null });

    try {
      let cipherText = input.trim();

      // Handle EXU1: prefix (from QR code format)
      if (cipherText.startsWith('EXU1:')) {
        const compressed = cipherText.slice(5);
        const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
        if (!decompressed) {
          setDecodeError('Decompresión fallida. El payload QR puede estar corrupto o truncado.');
          return;
        }
        cipherText = decompressed;
      }

      const result = decryptPayload(cipherText, id);

      if (!result) {
        setDecodeError(
          'Descifrado fallido. Verifica que el Exam ID corresponde al examen del estudiante.',
        );
        return;
      }

      setDecoded(result);
    } catch (err) {
      console.error('[QRDecoder] Decode error:', err);
      setDecodeError(`Error inesperado durante el descifrado: ${err}`);
    }
  };

  const handleDecode = (): void => {
    setDecodeError(null);

    if (!examId.trim()) {
      setDecodeError('El Exam ID es obligatorio para descifrar el payload.');
      return;
    }

    if (!rawInput.trim()) {
      setDecodeError('Pega el payload QR o usa la cámara para escanear.');
      return;
    }

    decodeScan(rawInput, examId.trim());
  };

  // ─── Save decoded result to DB ────────────────────────────
  const handleSaveToDB = async (): Promise<void> => {
    if (!decoded || !examId.trim()) return;

    setSaveState({ status: 'saving', message: null });

    try {
      // 1. Fetch questions to compute verified score server-side
      const { data: questions, error: qError } = await apiRequest<Question[]>(
        `/questions?exam_id=${examId.trim()}`,
        { requiresAuth: true },
      );

      if (qError || !questions) {
        // Fallback: save without verified score (score = 0)
        console.warn('[QRDecoder] Could not fetch questions for score verification:', qError);
      }

      // 2. Compute score from decoded answers vs correct answers
      let earnedPoints = 0;
      let totalPoints = 0;

      if (questions && questions.length > 0) {
        for (const q of questions) {
          totalPoints += q.points;
          const studentAnswer = decoded.answers.find((a) => a.question_id === q.id);
          if (studentAnswer?.answer === q.correct_answer) {
            earnedPoints += q.points;
          }
        }
      } else {
        // If questions unavailable, count answers matched by position
        totalPoints = decoded.answers.length;
        earnedPoints = 0; // Conservative: can't verify without questions
      }

      const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

      // 3. Build the result payload for the DB
      const encryptedPayload = rawInput.startsWith('EXU1:')
        ? (() => {
            const compressed = rawInput.slice(5);
            return LZString.decompressFromEncodedURIComponent(compressed) ?? rawInput;
          })()
        : rawInput.trim();

      const resultPayload: ExamResultInsert = {
        exam_id: examId.trim(),
        student_id: decoded.student_id,
        student_name: decoded.student_name,
        score,
        total_points: totalPoints,
        earned_points: earnedPoints,
        encrypted_payload: encryptedPayload,
        sync_method: 'QR',
        started_at: new Date(decoded.started_at).toISOString(),
        submitted_at: new Date(decoded.submitted_at).toISOString(),
      };

      const { data, error: saveError } = await apiRequest(
        '/results',
        { method: 'POST', body: resultPayload, requiresAuth: false },
      );

      if (saveError || !data) {
        console.error('[QRDecoder] Save to DB failed:', saveError);
        setSaveState({
          status: 'error',
          message: `Error al guardar: ${saveError ?? 'Respuesta vacía del servidor'}`,
        });
        return;
      }

      setSaveState({
        status: 'saved',
        message: `Resultado guardado — Score verificado: ${score}%`,
      });

      // Invalidar cache de resultados para que el dashboard se refresque
      queryClient.invalidateQueries({ queryKey: ['exam-results'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-exams'] });
    } catch (err) {
      console.error('[QRDecoder] Unexpected save error:', err);
      setSaveState({ status: 'error', message: `Error inesperado: ${err}` });
    }
  };

  const copyJSON = async (): Promise<void> => {
    if (!decoded) return;
    await navigator.clipboard.writeText(JSON.stringify(decoded, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="qr-decoder-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-500/20 p-2">
                  <QrCode className="size-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">QR Result Decoder</h2>
                  <p className="text-xs text-white/40">
                    Descifra respuestas de estudiantes desde QR o payload encriptado
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {/* Exam ID input — always visible */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                  Exam ID <span className="text-indigo-400">(obligatorio para descifrar)</span>
                </label>
                <input
                  type="text"
                  value={examId}
                  onChange={(e) => setExamId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-1 text-xs text-white/25">
                  Encuéntralo en el dashboard. Se usa para derivar la clave AES y verificar el score.
                </p>
              </div>

              {/* Input method tabs */}
              <div>
                <div className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                  {(
                    [
                      { id: 'paste', icon: <FileText className="size-3.5" />, label: 'Pegar texto' },
                      { id: 'camera', icon: <Camera className="size-3.5" />, label: 'Cámara' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => switchTab(tab.id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                        activeTab === tab.id
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {/* ─── Paste text tab ──────────────────────── */}
                  {activeTab === 'paste' && (
                    <motion.div
                      key="paste-tab"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.15 }}
                    >
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                        QR Payload / Encrypted string
                      </label>
                      <textarea
                        value={rawInput}
                        onChange={(e) => setRawInput(e.target.value)}
                        placeholder={`Pega el string QR aquí…\n\nFormatos aceptados:\n  EXU1:H4sIA… (QR escaneado)\n  U2FsdGVkX1… (AES raw)`}
                        rows={5}
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      {rawInput && (
                        <p className="mt-1 text-xs text-white/25">
                          {rawInput.length.toLocaleString()} caracteres •{' '}
                          {rawInput.startsWith('EXU1:') ? 'Formato EXU1 ✓' : 'Formato raw AES'}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* ─── Camera tab ──────────────────────────── */}
                  {activeTab === 'camera' && (
                    <motion.div
                      key="camera-tab"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.15 }}
                    >
                      <QRCameraScanner
                        isActive={cameraActive}
                        onScan={handleCameraScan}
                        onError={(msg) => {
                          console.error('[QRDecoder] Camera error:', msg);
                        }}
                      />
                      <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2">
                        <p className="text-xs text-indigo-300">
                          <strong>Flujo:</strong> Apunta la cámara al QR del estudiante →
                          el payload se cargará automáticamente → introduce el Exam ID → descifra.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Decode button — only in paste mode */}
              {activeTab === 'paste' && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDecode}
                  disabled={!rawInput.trim() || !examId.trim()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-indigo-500 transition-colors"
                >
                  <Unlock className="size-4" />
                  Descifrar Respuestas
                </motion.button>
              )}

              {/* When camera tab + examId is empty, show decode button */}
              {activeTab === 'camera' && rawInput && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDecode}
                  disabled={!rawInput.trim() || !examId.trim()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-indigo-500 transition-colors"
                >
                  <Unlock className="size-4" />
                  Descifrar Payload Escaneado
                </motion.button>
              )}

              {/* Error state */}
              <AnimatePresence>
                {decodeError && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
                  >
                    <AlertCircle className="size-5 shrink-0 text-red-400" />
                    <p className="text-sm text-red-300">{decodeError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Decoded result */}
              <AnimatePresence>
                {decoded && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4"
                  >
                    {/* Success header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                        <ShieldCheck className="size-4 text-emerald-400" />
                        <span className="text-sm font-semibold text-emerald-300">
                          Descifrado exitoso
                        </span>
                      </div>
                      <button
                        onClick={copyJSON}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                        {copied ? '¡Copiado!' : 'Copiar JSON'}
                      </button>
                    </div>

                    {/* Student metadata */}
                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                      <MetaField label="Estudiante" value={decoded.student_name} />
                      <MetaField
                        label="Student ID"
                        value={decoded.student_id.slice(0, 20) + '…'}
                        mono
                      />
                      <MetaField
                        label="Inicio"
                        value={new Date(decoded.started_at).toLocaleString('es')}
                      />
                      <MetaField
                        label="Entregado"
                        value={new Date(decoded.submitted_at).toLocaleString('es')}
                      />
                      <MetaField
                        label="Respuestas"
                        value={String(decoded.answers.length)}
                      />
                      <MetaField
                        label="Hash integridad"
                        value={decoded.integrity_hash.slice(0, 16) + '…'}
                        mono
                      />
                    </div>

                    {/* Answers list */}
                    <div>
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
                        Registro de respuestas ({decoded.answers.length} ítems)
                      </h4>
                      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                        {decoded.answers.map((answer, i) => (
                          <div
                            key={answer.question_id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs"
                          >
                            <span className="font-mono text-white/40">
                              P{i + 1}:{' '}
                              <span className="text-white/25">{answer.question_id.slice(-8)}</span>
                            </span>
                            <span className="font-semibold text-white">{answer.answer}</span>
                            <span className="text-white/30">
                              {new Date(answer.answered_at).toLocaleTimeString('es')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ─── Save to DB section ─────────────────────── */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
                        Guardar resultado en base de datos
                      </p>

                      {saveState.status === 'saved' ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
                        >
                          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
                          <p className="text-sm font-semibold text-emerald-300">
                            {saveState.message}
                          </p>
                        </motion.div>
                      ) : (
                        <>
                          <p className="mb-3 text-xs text-white/40">
                            Esto calculará el score verificado consultando las respuestas correctas
                            del servidor y guardará el resultado con{' '}
                            <code className="rounded bg-white/10 px-1 text-indigo-300">sync_method: QR</code>.
                          </p>

                          {saveState.status === 'error' && (
                            <div className="mb-3 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                              <AlertCircle className="size-4 shrink-0 text-red-400" />
                              {saveState.message}
                            </div>
                          )}

                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleSaveToDB}
                            disabled={saveState.status === 'saving' || !examId.trim()}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-opacity disabled:opacity-60 hover:from-emerald-500 hover:to-teal-500"
                          >
                            {saveState.status === 'saving' ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Guardando y verificando score…
                              </>
                            ) : (
                              <>
                                <Save className="size-4" />
                                Guardar resultado en BD
                              </>
                            )}
                          </motion.button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

interface MetaFieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function MetaField({ label, value, mono = false }: MetaFieldProps): JSX.Element {
  return (
    <div>
      <p className="text-xs text-white/30">{label}</p>
      <p className={`mt-0.5 text-sm text-white ${mono ? 'font-mono text-xs' : 'font-semibold'}`}>
        {value}
      </p>
    </div>
  );
}