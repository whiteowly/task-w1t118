import type { EncryptedPasswordArtifacts } from '../db/database';
import { decryptStringAtRest, encryptStringAtRest } from './field-crypto';

const AUTH_ARTIFACT_KEY_VERSION = 1;
const AUTH_ARTIFACT_KDF_ITERATIONS = 210_000;

export interface PasswordArtifactsPlaintext {
  passwordHash: string;
  passwordSalt: string;
}

function aadForUsername(username: string): string {
  return `localops.auth-artifacts.${username}`;
}

export async function encryptPasswordArtifacts(
  artifacts: PasswordArtifactsPlaintext,
  password: string,
  username: string
): Promise<EncryptedPasswordArtifacts> {
  return encryptStringAtRest({
    plaintext: JSON.stringify(artifacts),
    passphrase: password,
    aadContext: aadForUsername(username),
    keyVersion: AUTH_ARTIFACT_KEY_VERSION,
    kdfIterations: AUTH_ARTIFACT_KDF_ITERATIONS
  });
}

export async function decryptPasswordArtifacts(
  encryptedArtifacts: EncryptedPasswordArtifacts,
  password: string,
  username: string
): Promise<PasswordArtifactsPlaintext> {
  const decrypted = await decryptStringAtRest({
    envelope: encryptedArtifacts,
    passphrase: password,
    aadContext: aadForUsername(username)
  });

  const parsed = JSON.parse(decrypted) as PasswordArtifactsPlaintext;

  return {
    passwordHash: parsed.passwordHash,
    passwordSalt: parsed.passwordSalt
  };
}
