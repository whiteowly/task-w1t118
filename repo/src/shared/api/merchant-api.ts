import { api } from './client';

export async function listMerchantsViaApi() {
  return api.listMerchants();
}

export async function createMerchantDraftViaApi(input: {
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
}) {
  return api.createMerchantDraft(input);
}

export async function updateMerchantDraftViaApi(
  merchantId: string,
  input: {
    expectedVersionNo: number;
    name: string;
    description: string;
    tags: string[];
    amenities: string[];
    imageAssetId: string | null;
  }
) {
  return api.updateMerchantDraft(merchantId, input);
}

export async function submitMerchantForReviewViaApi(
  merchantId: string,
  reason?: string
) {
  return api.submitMerchantForReview(merchantId, { reason });
}

export async function approveMerchantViaApi(merchantId: string) {
  return api.approveMerchant(merchantId);
}

export async function rejectMerchantViaApi(merchantId: string, reason?: string) {
  return api.rejectMerchant(merchantId, { reason });
}

export async function publishMerchantViaApi(merchantId: string) {
  return api.publishMerchant(merchantId);
}
