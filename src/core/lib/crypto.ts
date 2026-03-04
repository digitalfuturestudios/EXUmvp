// ============================================================
// CRYPTO UTILITIES — AES encryption + SHA256 hashing.
// Uses crypto-js. Key derivation uses exam_id + salt.
// ============================================================

import CryptoJS from 'crypto-js';
import type { AnswerPayload } from '../types/local.types';

/** Application-wide salt — kept client-side (not a secret key, just entropy) */
const APP_SALT = 'EXU_PLATFORM_2026_OFFLINE_RESILIENT';

/**
 * Derives an AES encryption key from the exam ID.
 * Uses PBKDF2 with SHA256 for key stretching.
 */
function deriveKey(examId: string): string {
  return CryptoJS.PBKDF2(examId, APP_SALT, {
    keySize: 256 / 32,
    iterations: 1000,
    hasher: CryptoJS.algo.SHA256,
  }).toString();
}

/**
 * Encrypts an answer payload using AES-256.
 * Returns a base64-encoded string safe for storage and QR generation.
 */
export function encryptPayload(payload: AnswerPayload, examId: string): string {
  const key = deriveKey(examId);
  const json = JSON.stringify(payload);
  const encrypted = CryptoJS.AES.encrypt(json, key);
  return encrypted.toString(); // base64 CipherText
}

/**
 * Decrypts an AES-encrypted payload string.
 * Returns null if decryption fails (tampered or wrong key).
 */
export function decryptPayload(cipherText: string, examId: string): AnswerPayload | null {
  try {
    const key = deriveKey(examId);
    const bytes = CryptoJS.AES.decrypt(cipherText, key);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    if (!json) return null;
    return JSON.parse(json) as AnswerPayload;
  } catch {
    console.error('[Crypto] Decryption failed — payload may be tampered');
    return null;
  }
}

/**
 * Generates a SHA-256 integrity hash of sorted answer values.
 * Used to detect tampering after QR submission.
 */
export function generateIntegrityHash(answers: AnswerPayload['answers']): string {
  const sorted = [...answers].sort((a, b) => a.question_id.localeCompare(b.question_id));
  const canonical = JSON.stringify(sorted);
  return CryptoJS.SHA256(canonical).toString();
}

/**
 * Generates a short, deterministic exam code for display (e.g., "EXU-4F2A").
 * NOT a secret — used for teacher-student pairing UX.
 */
export function generateExamCode(examId: string): string {
  const hash = CryptoJS.SHA256(examId).toString();
  return `EXU-${hash.slice(0, 4).toUpperCase()}`;
}
