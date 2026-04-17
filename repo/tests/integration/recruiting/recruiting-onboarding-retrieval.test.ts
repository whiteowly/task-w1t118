import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  approveOffer,
  createOfferFromTemplate,
  getOnboardingDocument,
  listOfferTemplates,
  upsertOnboardingDocument
} from '../../../src/modules/recruiting/recruiting-service';

describe('recruiting onboarding document retrieval', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('returns null when no onboarding document exists', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const templates = await listOfferTemplates();
    const offer = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'No Doc Candidate',
      candidateEmail: 'nodoc@example.com'
    });

    const doc = await getOnboardingDocument(offer.id);
    expect(doc).toBeNull();
  });

  it('retrieves a previously saved onboarding document', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const templates = await listOfferTemplates();
    const offer = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'Retrieval Candidate',
      candidateEmail: 'retrieval@example.com'
    });

    await approveOffer({ offerId: offer.id });

    await upsertOnboardingDocument({
      offerId: offer.id,
      legalName: 'Retrieval Candidate',
      addressLine1: '50 Retrieval Lane',
      city: 'Portland',
      stateProvince: 'OR',
      postalCode: '97201',
      ssn: '321-54-9876',
      emergencyContactName: 'Emergency Person',
      emergencyContactPhone: '+1 (555) 999-8888'
    });

    const doc = await getOnboardingDocument(offer.id);
    expect(doc).toBeTruthy();
    expect(doc?.legalName).toBe('Retrieval Candidate');
    expect(doc?.ssnMasked).toBe('***-**-9876');
    expect(doc?.city).toBe('Portland');
  });
});
