// ─── AES-256-GCM Encrypted Backup via Web Crypto API ───

import { API_BASE_URL } from "./config";

const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const ITERATIONS = 100_000;

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackup(
  jsonData: string,
  password: string,
): Promise<ArrayBuffer> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const key = await deriveKey(password, salt);

  const plaintext = new TextEncoder().encode(jsonData);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  // Concatenate: salt (16) + nonce (12) + ciphertext
  const result = new Uint8Array(
    SALT_LENGTH + NONCE_LENGTH + ciphertext.byteLength,
  );
  result.set(salt, 0);
  result.set(nonce, SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), SALT_LENGTH + NONCE_LENGTH);
  return result.buffer;
}

export async function decryptBackup(
  encryptedData: ArrayBuffer,
  password: string,
): Promise<string> {
  const data = new Uint8Array(encryptedData);

  if (data.length < SALT_LENGTH + NONCE_LENGTH + 1) {
    throw new Error("Invalid backup file: too small");
  }

  const salt = data.slice(0, SALT_LENGTH);
  const nonce = data.slice(SALT_LENGTH, SALT_LENGTH + NONCE_LENGTH);
  const ciphertext = data.slice(SALT_LENGTH + NONCE_LENGTH);

  const key = await deriveKey(password, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Decryption failed: wrong password or corrupted file");
  }
}

export async function downloadEncryptedBackup(
  password: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Export failed");

  const jsonData = await res.text();
  const encrypted = await encryptBackup(jsonData, password);

  const blob = new Blob([encrypted], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `probook-backup-${new Date().toISOString().slice(0, 10)}.enc`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importEncryptedBackup(
  file: File,
  password: string,
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return decryptBackup(arrayBuffer, password);
}
