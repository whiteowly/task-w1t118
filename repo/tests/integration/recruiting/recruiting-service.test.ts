import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { createManagedUser } from '../../../src/core/auth/user-admin-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  approveOffer,
  captureOfferSignature,
  createOfferFromTemplate,
  listOfferTemplates,
  listOnboardingChecklist,
  listRecruitingOffers,
  rejectOffer,
  updateChecklistItemStatus,
  upsertOnboardingDocument
} from '../../../src/modules/recruiting/recruiting-service';

describe('recruiting service integration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it(
    'enforces approval role and supports signature/onboarding lifecycle with encrypted fields',
    { timeout: 20_000 },
    async () => {
      await bootstrapAdministrator({
        username: 'admin',
        password: 'password-123',
        confirmPassword: 'password-123'
      });
      await login({ username: 'admin', password: 'password-123' });

      await createManagedUser({
        username: 'recruiter.user',
        password: 'password-234',
        confirmPassword: 'password-234',
        roles: ['Recruiter']
      });
      await createManagedUser({
        username: 'hr.manager',
        password: 'password-345',
        confirmPassword: 'password-345',
        roles: ['HRManager']
      });

      logout();
      await login({ username: 'recruiter.user', password: 'password-234' });

      const templates = await listOfferTemplates();
      expect(templates.length).toBeGreaterThan(0);

      const created = await createOfferFromTemplate({
        templateId: templates[0].id,
        candidateName: 'Taylor Candidate',
        candidateEmail: 'taylor@example.com'
      });

      expect(created.approvalStatus).toBe('pending_hr_approval');
      expect(created.approvalRoutingRole).toBe('HRManager');

      await expect(approveOffer({ offerId: created.id })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      });

      const storedOffer = await db.recruitingOffers.get(created.id);
      expect(storedOffer).toBeTruthy();
      expect(storedOffer?.compensationEncrypted.ciphertext).toBeTruthy();
      expect(JSON.stringify(storedOffer?.compensationEncrypted)).not.toContain('9500000');

      logout();
      await login({ username: 'hr.manager', password: 'password-345' });

      const approved = await approveOffer({ offerId: created.id });
      expect(approved.approvalStatus).toBe('approved');

      logout();
      await login({ username: 'recruiter.user', password: 'password-234' });

      const signed = await captureOfferSignature({
        offerId: created.id,
        typedSignerName: 'Taylor Candidate'
      });
      expect(signed.signatureTypedName).toBe('Taylor Candidate');

      const docs = await upsertOnboardingDocument({
        offerId: created.id,
        legalName: 'Taylor Candidate',
        addressLine1: '100 Example Avenue',
        city: 'Seattle',
        stateProvince: 'WA',
        postalCode: '98101',
        ssn: '123-45-6789',
        emergencyContactName: 'Morgan Contact',
        emergencyContactPhone: '+1 (555) 222-1212'
      });

      expect(docs.ssnMasked).toBe('***-**-6789');

      const storedDoc = await db.recruitingOnboardingDocuments
        .where('offerId')
        .equals(created.id)
        .first();
      expect(storedDoc).toBeTruthy();
      expect(storedDoc?.ssnEncrypted.ciphertext).toBeTruthy();
      expect(storedDoc?.ssnMasked).toBe('***-**-6789');

      const checklist = await listOnboardingChecklist(created.id);
      for (const item of checklist) {
        await updateChecklistItemStatus({
          offerId: created.id,
          checklistItemId: item.id,
          status: 'complete'
        });
      }

      const offers = await listRecruitingOffers();
      const completed = offers.find((entry) => entry.id === created.id);

      expect(completed?.approvalStatus).toBe('approved');
      expect(completed?.onboardingStatus).toBe('complete');

      const auditEvents = await db.auditEvents.toArray();
      expect(
        auditEvents.some(
          (event) =>
            event.actionType === 'RECRUITING_OFFER_CREATED' &&
            event.entityId === created.id &&
            (event.newState as { approvalRoutingRole?: string }).approvalRoutingRole === 'HRManager'
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          (event) =>
            event.actionType === 'RECRUITING_OFFER_APPROVED' && event.entityId === created.id
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          (event) =>
            event.actionType === 'RECRUITING_OFFER_SIGNATURE_CAPTURED' &&
            event.entityId === created.id
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          (event) =>
            event.actionType === 'RECRUITING_ONBOARDING_DOCUMENT_CREATED' &&
            event.entityId === docs.id
        )
      ).toBe(true);
      expect(
        auditEvents.filter(
          (event) =>
            event.actionType === 'RECRUITING_CHECKLIST_ITEM_STATUS_UPDATED' &&
            (event.newState as { offerId?: string }).offerId === created.id
        ).length
      ).toBe(checklist.length);
    }
  );

  it('validates onboarding SSN format', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const templates = await listOfferTemplates();
    const created = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'Casey Candidate',
      candidateEmail: 'casey@example.com'
    });

    await approveOffer({ offerId: created.id });

    await expect(
      upsertOnboardingDocument({
        offerId: created.id,
        legalName: 'Casey Candidate',
        addressLine1: '200 Example Avenue',
        city: 'Austin',
        stateProvince: 'TX',
        postalCode: '78701',
        ssn: '123456789',
        emergencyContactName: 'Jordan Contact',
        emergencyContactPhone: '+1 (555) 444-9898'
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires a rejection reason when HR rejects an offer', { timeout: 20_000 }, async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await createManagedUser({
      username: 'hr.manager',
      password: 'password-345',
      confirmPassword: 'password-345',
      roles: ['HRManager']
    });

    const templates = await listOfferTemplates();
    const created = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'Riley Candidate',
      candidateEmail: 'riley@example.com'
    });

    logout();
    await login({ username: 'hr.manager', password: 'password-345' });

    await expect(rejectOffer({ offerId: created.id })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
  });
});
