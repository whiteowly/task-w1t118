import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  approveMerchant,
  compareMerchantVersions,
  createCombo,
  createMenu,
  createMerchantDraft,
  createStore,
  listCombos,
  listMenus,
  listMerchantVersions,
  listStores,
  publishMerchant,
  submitMerchantForReview,
  updateCombo,
  updateMenu
} from '../../../src/modules/merchant/merchant-service';

describe('merchant sub-entity CRUD and versioning', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('creates and lists stores, menus, and combos under a merchant draft', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const merchant = await createMerchantDraft({
      name: 'Sub-Entity Test Merchant',
      description: 'Testing sub-entities',
      tags: ['Premium'],
      amenities: ['WiFi']
    });

    const store = await createStore({
      merchantId: merchant.id,
      name: 'Downtown Store',
      description: 'Main location',
      tags: ['Delivery'],
      amenities: ['Parking'],
      imageAssetId: null
    });

    const stores = await listStores(merchant.id);
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe('Downtown Store');

    const menu = await createMenu({
      storeId: store.id,
      name: 'Lunch Menu',
      description: 'Served 11am-3pm'
    });

    const menus = await listMenus(store.id);
    expect(menus).toHaveLength(1);
    expect(menus[0].name).toBe('Lunch Menu');

    await updateMenu({
      menuId: menu.id,
      name: 'Updated Lunch Menu',
      description: 'Served 11am-4pm'
    });

    const menusAfterUpdate = await listMenus(store.id);
    expect(menusAfterUpdate[0].name).toBe('Updated Lunch Menu');

    const combo = await createCombo({
      menuId: menu.id,
      name: 'Classic Combo',
      description: 'Burger, fries, and drink',
      priceLabel: '$9.99'
    });

    const combos = await listCombos(menu.id);
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe('Classic Combo');
    expect(combos[0].priceLabel).toBe('$9.99');

    await updateCombo({
      comboId: combo.id,
      name: 'Deluxe Combo',
      description: 'Premium burger, fries, and drink',
      priceLabel: '$12.99'
    });

    const combosAfterUpdate = await listCombos(menu.id);
    expect(combosAfterUpdate[0].name).toBe('Deluxe Combo');
    expect(combosAfterUpdate[0].priceLabel).toBe('$12.99');
  });

  it('tracks merchant versions and supports version comparison', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const merchant = await createMerchantDraft({
      name: 'Versioned Merchant',
      description: 'Version tracking test',
      tags: ['Family Friendly'],
      amenities: ['Parking']
    });

    await submitMerchantForReview({ merchantId: merchant.id });
    await approveMerchant({ merchantId: merchant.id });
    await publishMerchant({ merchantId: merchant.id });

    const versions = await listMerchantVersions(merchant.id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].versionNo).toBeGreaterThanOrEqual(1);

    const comparison = await compareMerchantVersions(merchant.id, 1, 1);
    expect(comparison.left).toBeDefined();
    expect(comparison.right).toBeDefined();
    expect(comparison.left.snapshot.name).toBe('Versioned Merchant');
  });
});
