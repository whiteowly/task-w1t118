import { describe, expect, it } from 'vitest';

import { validateMerchantImageFile } from '../../../src/modules/merchant/merchant-validation';

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe('merchant image validation', () => {
  it('accepts png files at or under 5MB', () => {
    const file = makeFile('merchant.png', 'image/png', 5 * 1024 * 1024);
    const validated = validateMerchantImageFile(file);
    expect(validated.mimeType).toBe('image/png');
    expect(validated.sizeBytes).toBe(5 * 1024 * 1024);
  });

  it('rejects unsupported mime types', () => {
    const file = makeFile('merchant.gif', 'image/gif', 1024);
    expect(() => validateMerchantImageFile(file)).toThrow('Only JPEG and PNG images are allowed.');
  });

  it('rejects files larger than 5MB', () => {
    const file = makeFile('merchant.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1);
    expect(() => validateMerchantImageFile(file)).toThrow('Image size must be 5 MB or less.');
  });
});
