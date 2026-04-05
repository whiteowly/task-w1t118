import { describe, expect, it } from 'vitest';

import {
  onboardingDocumentSchema,
  parseRecruitingPayloadOrThrow,
  signatureCaptureSchema
} from '../../../src/modules/recruiting/recruiting-validation';

describe('recruiting validation', () => {
  it('accepts onboarding document payload with valid SSN format', () => {
    const parsed = parseRecruitingPayloadOrThrow(onboardingDocumentSchema, {
      offerId: 'offer-1',
      legalName: 'Casey Example',
      addressLine1: '123 Main Street',
      city: 'Austin',
      stateProvince: 'TX',
      postalCode: '78701',
      ssn: '123-45-6789',
      emergencyContactName: 'Jordan Example',
      emergencyContactPhone: '+1 (555) 123-4567'
    });

    expect(parsed.ssn).toBe('123-45-6789');
    expect(parsed.legalName).toBe('Casey Example');
  });

  it('rejects onboarding document payload with invalid SSN format', () => {
    expect(() =>
      parseRecruitingPayloadOrThrow(onboardingDocumentSchema, {
        offerId: 'offer-1',
        legalName: 'Casey Example',
        addressLine1: '123 Main Street',
        city: 'Austin',
        stateProvince: 'TX',
        postalCode: '78701',
        ssn: '123456789',
        emergencyContactName: 'Jordan Example',
        emergencyContactPhone: '+1 (555) 123-4567'
      })
    ).toThrow('Validation failed.');
  });

  it('requires typed signer name for signature capture', () => {
    expect(() =>
      parseRecruitingPayloadOrThrow(signatureCaptureSchema, {
        offerId: 'offer-1',
        typedSignerName: ' '
      })
    ).toThrow('Validation failed.');
  });
});
