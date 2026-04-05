const ENCODER = new TextEncoder();

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function generateSalt(length = 16): string {
  const array = crypto.getRandomValues(new Uint8Array(length));
  return toBase64(array.buffer);
}

export async function hashPassword(password: string, saltBase64: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = fromBase64(saltBase64);

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 210_000,
      salt: saltBytes as BufferSource
    },
    keyMaterial,
    256
  );

  return toBase64(bits);
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  saltBase64: string
): Promise<boolean> {
  const actualHash = await hashPassword(password, saltBase64);
  return actualHash === expectedHash;
}
