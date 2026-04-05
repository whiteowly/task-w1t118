import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetWorkspaceFieldKeyForTests,
  clearWorkspaceFieldEncryptionKey,
  getWorkspaceFieldEncryptionPassphrase,
  hasWorkspaceFieldEncryptionPassphrase,
  setWorkspaceFieldEncryptionKeyFromCredentials
} from '../../../src/core/security/workspace-field-key';

describe('workspace field key derivation', () => {
  beforeEach(() => {
    __resetWorkspaceFieldKeyForTests();
  });

  it('derives an in-memory passphrase from credentials without writing localStorage key material', async () => {
    const localStorageSnapshot = Object.keys(localStorage);

    await setWorkspaceFieldEncryptionKeyFromCredentials({
      userId: 'user-1',
      username: 'admin',
      password: 'password-123'
    });

    const derived = getWorkspaceFieldEncryptionPassphrase();

    expect(derived.length).toBeGreaterThan(10);
    expect(hasWorkspaceFieldEncryptionPassphrase()).toBe(true);
    expect(Object.keys(localStorage)).toEqual(localStorageSnapshot);
  });

  it('clears key material and requires re-auth derivation again', async () => {
    await setWorkspaceFieldEncryptionKeyFromCredentials({
      userId: 'user-1',
      username: 'admin',
      password: 'password-123'
    });
    expect(hasWorkspaceFieldEncryptionPassphrase()).toBe(true);

    clearWorkspaceFieldEncryptionKey('user-1');
    expect(hasWorkspaceFieldEncryptionPassphrase()).toBe(false);
    expect(() => getWorkspaceFieldEncryptionPassphrase()).toThrowError(
      /Workspace field-encryption key is unavailable/
    );
  });
});
