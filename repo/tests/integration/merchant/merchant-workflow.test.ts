import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { createManagedUser } from '../../../src/core/auth/user-admin-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  approveMerchant,
  createMerchantDraft,
  createStore,
  listMerchants,
  publishMerchant,
  rejectMerchant,
  submitMerchantForReview,
  updateStore,
  updateMerchantDraft
} from '../../../src/modules/merchant/merchant-service';

describe('merchant workflow integration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it(
    'enforces reviewer-owned approval/publish transitions',
    {
      timeout: 15_000
    },
    async () => {
      await bootstrapAdministrator({
        username: 'admin',
        password: 'password-123',
        confirmPassword: 'password-123'
      });
      await login({ username: 'admin', password: 'password-123' });

      await createManagedUser({
        username: 'merchant.editor',
        password: 'password-234',
        confirmPassword: 'password-234',
        roles: ['MerchantEditor']
      });
      await createManagedUser({
        username: 'content.reviewer',
        password: 'password-345',
        confirmPassword: 'password-345',
        roles: ['ContentReviewerPublisher']
      });

      logout();
      await login({ username: 'merchant.editor', password: 'password-234' });

      const created = await createMerchantDraft({
        name: 'Merchant Workflow Test',
        description: 'Initial draft',
        tags: ['Premium'],
        amenities: ['WiFi']
      });

      await submitMerchantForReview({ merchantId: created.id, reason: 'Ready for reviewer pass' });

      await expect(publishMerchant({ merchantId: created.id })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      });

      logout();
      await login({ username: 'content.reviewer', password: 'password-345' });

      await approveMerchant({ merchantId: created.id });
      await publishMerchant({ merchantId: created.id });

      const merchants = await listMerchants();
      const target = merchants.find((merchant) => merchant.id === created.id);

      expect(target?.workflowState).toBe('published');
      expect(target?.publishedVersionNo).toBe(1);

      const auditEvents = await db.auditEvents.toArray();
      expect(
        auditEvents.some(
          (event) => event.actionType === 'MERCHANT_CREATED' && event.entityId === created.id
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          (event) =>
            event.actionType === 'MERCHANT_SUBMITTED_FOR_REVIEW' && event.entityId === created.id
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          (event) => event.actionType === 'MERCHANT_APPROVED' && event.entityId === created.id
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          (event) => event.actionType === 'MERCHANT_PUBLISHED' && event.entityId === created.id
        )
      ).toBe(true);
    }
  );

  it('prevents direct published overwrite and creates a new draft version', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createMerchantDraft({
      name: 'Published Merchant',
      description: 'Version 1',
      tags: ['Family Friendly'],
      amenities: ['Parking']
    });

    await submitMerchantForReview({ merchantId: created.id });
    await approveMerchant({ merchantId: created.id });
    await publishMerchant({ merchantId: created.id });

    const published = (await listMerchants()).find((merchant) => merchant.id === created.id);
    expect(published?.workflowState).toBe('published');
    const priorPublishedVersion = published?.publishedVersionNo;

    await updateMerchantDraft({
      merchantId: created.id,
      expectedVersionNo: published!.latestVersionNo,
      name: 'Published Merchant Updated Draft',
      description: 'Version 2 draft',
      tags: ['Family Friendly', 'Premium'],
      amenities: ['Parking', 'WiFi'],
      imageAssetId: null
    });

    const updated = (await listMerchants()).find((merchant) => merchant.id === created.id);

    expect(updated?.workflowState).toBe('draft');
    expect(updated?.publishedVersionNo).toBe(priorPublishedVersion);
    expect(updated?.latestVersionNo).toBe((published?.latestVersionNo ?? 0) + 1);
  });

  it('returns conflict on stale merchant draft update attempts', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createMerchantDraft({
      name: 'Conflict Merchant',
      description: 'v1',
      tags: ['Delivery'],
      amenities: ['Card Payment']
    });

    await updateMerchantDraft({
      merchantId: created.id,
      expectedVersionNo: 1,
      name: 'Conflict Merchant v2',
      description: 'v2',
      tags: ['Delivery'],
      amenities: ['Card Payment'],
      imageAssetId: null
    });

    await expect(
      updateMerchantDraft({
        merchantId: created.id,
        expectedVersionNo: 1,
        name: 'Conflict Merchant stale write',
        description: 'stale',
        tags: ['Delivery'],
        amenities: ['Card Payment'],
        imageAssetId: null
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('supports reviewer rejection transition and reason capture', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createMerchantDraft({
      name: 'Rejected Merchant',
      description: 'needs work',
      tags: ['Delivery'],
      amenities: ['Parking']
    });

    await submitMerchantForReview({ merchantId: created.id });
    await rejectMerchant({ merchantId: created.id, reason: 'Missing details' });

    const merchant = (await listMerchants()).find((entry) => entry.id === created.id);
    expect(merchant?.workflowState).toBe('rejected');
    expect(merchant?.rejectionReason).toContain('Missing details');
  });

  it('moves published merchant content back to a new draft version on store mutation', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createMerchantDraft({
      name: 'Merchant Content Versioning',
      description: 'v1',
      tags: ['Premium'],
      amenities: ['Parking']
    });

    await submitMerchantForReview({ merchantId: created.id });
    await approveMerchant({ merchantId: created.id });
    await publishMerchant({ merchantId: created.id });

    const published = (await listMerchants()).find((entry) => entry.id === created.id);
    expect(published?.workflowState).toBe('published');

    await createStore({
      merchantId: created.id,
      name: 'Main Branch',
      description: 'Store in v2 draft',
      tags: ['Premium'],
      amenities: ['Parking'],
      imageAssetId: null
    });

    const afterStoreMutation = (await listMerchants()).find((entry) => entry.id === created.id);
    expect(afterStoreMutation?.workflowState).toBe('draft');
    expect(afterStoreMutation?.publishedVersionNo).toBe(published?.publishedVersionNo);
    expect(afterStoreMutation?.latestVersionNo).toBe((published?.latestVersionNo ?? 0) + 1);
  });

  it('blocks nested content mutation while merchant is in review', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createMerchantDraft({
      name: 'Review Lock Merchant',
      description: 'review lock test',
      tags: ['Delivery'],
      amenities: ['WiFi']
    });

    const store = await createStore({
      merchantId: created.id,
      name: 'Store A',
      description: '',
      tags: ['Delivery'],
      amenities: ['WiFi'],
      imageAssetId: null
    });

    await submitMerchantForReview({ merchantId: created.id });

    await expect(
      updateStore({
        storeId: store.id,
        name: 'Store A Updated',
        description: '',
        tags: ['Delivery'],
        amenities: ['WiFi'],
        imageAssetId: null
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
