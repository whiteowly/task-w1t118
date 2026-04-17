import { Router } from 'express';
import { requireAuth, requireCapability, type AuthenticatedRequest } from '../middleware/auth.js';
import * as merchantService from '../services/merchant-service.js';

const router = Router();

function actor(req: AuthenticatedRequest) {
  return { userId: req.userId!, roles: req.userRoles! };
}

router.get('/merchants', requireAuth, requireCapability('workspace.merchant.view'), (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(merchantService.listMerchants(actor(req)));
  } catch (err) { next(err); }
});

router.post('/merchants', requireAuth, requireCapability('workspace.merchant.editDraft'), (req: AuthenticatedRequest, res, next) => {
  try {
    const result = merchantService.createMerchantDraft(actor(req), req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.patch('/merchants/:merchantId', requireAuth, requireCapability('workspace.merchant.editDraft'), (req: AuthenticatedRequest, res, next) => {
  try {
    const merchantId = String(req.params.merchantId);
    const result = merchantService.updateMerchantDraft(actor(req), merchantId, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/merchants/:merchantId/submit', requireAuth, requireCapability('workspace.merchant.editDraft'), (req: AuthenticatedRequest, res, next) => {
  try {
    const merchantId = String(req.params.merchantId);
    merchantService.submitMerchantForReview(actor(req), merchantId, req.body ?? {});
    res.json({ message: 'Merchant submitted for review.' });
  } catch (err) { next(err); }
});

router.post('/merchants/:merchantId/approve', requireAuth, requireCapability('workspace.merchant.reviewPublish'), (req: AuthenticatedRequest, res, next) => {
  try {
    const merchantId = String(req.params.merchantId);
    merchantService.approveMerchant(actor(req), merchantId);
    res.json({ message: 'Merchant approved.' });
  } catch (err) { next(err); }
});

router.post('/merchants/:merchantId/reject', requireAuth, requireCapability('workspace.merchant.reviewPublish'), (req: AuthenticatedRequest, res, next) => {
  try {
    const merchantId = String(req.params.merchantId);
    merchantService.rejectMerchant(actor(req), merchantId, req.body ?? {});
    res.json({ message: 'Merchant rejected.' });
  } catch (err) { next(err); }
});

router.post('/merchants/:merchantId/publish', requireAuth, requireCapability('workspace.merchant.reviewPublish'), (req: AuthenticatedRequest, res, next) => {
  try {
    const merchantId = String(req.params.merchantId);
    merchantService.publishMerchant(actor(req), merchantId);
    res.json({ message: 'Merchant published.' });
  } catch (err) { next(err); }
});

export default router;
