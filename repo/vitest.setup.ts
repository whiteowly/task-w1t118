import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

// jsdom does not expose the Web Crypto API — polyfill it for tests.
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Testing-library matchers can be added here in later slices.
