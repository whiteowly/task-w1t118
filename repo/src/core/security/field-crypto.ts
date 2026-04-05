import { fromBase64, generateSalt, toBase64 } from './password';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export const DEFAULT_CRYPTO_KEY_VERSION = 1;
export const DEFAULT_KDF_ITERATIONS = 210_000;

export interface EncryptedFieldEnvelope {
  keyVersion: number;
  kdfIterations: number;
  kdfSalt: string;
  iv: string;
  ciphertext: string;
}

interface DeriveKeyInput {
  passphrase: string;
  kdfSaltBase64: string;
  iterations: number;
}

interface EncryptStringInput {
  plaintext: string;
  passphrase: string;
  aadContext?: string;
  keyVersion?: number;
  kdfIterations?: number;
}

interface DecryptStringInput {
  envelope: EncryptedFieldEnvelope;
  passphrase: string;
  aadContext?: string;
}

async function deriveAesGcmKey(input: DeriveKeyInput): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(input.passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBytes = fromBase64(input.kdfSaltBase64);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: input.iterations,
      salt: saltBytes as BufferSource
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function aadBuffer(aadContext?: string): BufferSource | undefined {
  if (!aadContext) {
    return undefined;
  }

  return ENCODER.encode(aadContext) as BufferSource;
}

export async function encryptStringAtRest(
  input: EncryptStringInput
): Promise<EncryptedFieldEnvelope> {
  const kdfIterations = input.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
  const kdfSalt = generateSalt(16);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveAesGcmKey({
    passphrase: input.passphrase,
    kdfSaltBase64: kdfSalt,
    iterations: kdfIterations
  });

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as BufferSource,
      additionalData: aadBuffer(input.aadContext)
    },
    key,
    ENCODER.encode(input.plaintext)
  );

  return {
    keyVersion: input.keyVersion ?? DEFAULT_CRYPTO_KEY_VERSION,
    kdfIterations,
    kdfSalt,
    iv: toBase64(ivBytes.buffer),
    ciphertext: toBase64(encrypted)
  };
}

export async function decryptStringAtRest(input: DecryptStringInput): Promise<string> {
  const key = await deriveAesGcmKey({
    passphrase: input.passphrase,
    kdfSaltBase64: input.envelope.kdfSalt,
    iterations: input.envelope.kdfIterations
  });

  const ivBytes = fromBase64(input.envelope.iv);
  const cipherBytes = fromBase64(input.envelope.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as BufferSource,
      additionalData: aadBuffer(input.aadContext)
    },
    key,
    cipherBytes as BufferSource
  );

  return DECODER.decode(decrypted);
}
