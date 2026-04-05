import { AppError } from '../validation/errors';
import { toBase64 } from './password';

const ENCODER = new TextEncoder();
const DERIVATION_CONTEXT = 'localops.workspace.field-key.v2';

let sessionDerivedPassphrase: string | null = null;
let sessionKeyOwnerUserId: string | null = null;

async function deriveWorkspacePassphrase(input: {
  username: string;
  password: string;
}): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    ENCODER.encode(`${DERIVATION_CONTEXT}:${input.username}:${input.password}`)
  );

  return toBase64(digest);
}

export async function setWorkspaceFieldEncryptionKeyFromCredentials(input: {
  userId: string;
  username: string;
  password: string;
}): Promise<void> {
  sessionDerivedPassphrase = await deriveWorkspacePassphrase({
    username: input.username,
    password: input.password
  });
  sessionKeyOwnerUserId = input.userId;
}

export function getWorkspaceFieldEncryptionPassphrase(): string {
  if (!sessionDerivedPassphrase) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message:
        'Workspace field-encryption key is unavailable. Re-authenticate to continue sensitive recruiting operations.'
    });
  }

  return sessionDerivedPassphrase;
}

export function clearWorkspaceFieldEncryptionKey(userId?: string | null): void {
  if (userId && sessionKeyOwnerUserId && userId !== sessionKeyOwnerUserId) {
    return;
  }

  sessionDerivedPassphrase = null;
  sessionKeyOwnerUserId = null;
}

export function hasWorkspaceFieldEncryptionPassphrase(): boolean {
  return Boolean(sessionDerivedPassphrase);
}

export function __resetWorkspaceFieldKeyForTests(): void {
  sessionDerivedPassphrase = null;
  sessionKeyOwnerUserId = null;
}
