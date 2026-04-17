import { describe, expect, it } from 'vitest';
import { canEditDraftActions, canReviewPublishActions, isWorkflowTransitionAllowed } from '../../../src/modules/merchant/merchant-service';

describe('merchant service helpers', () => {
  it('canEditDraftActions grants MerchantEditor', () => {
    expect(canEditDraftActions(['MerchantEditor'])).toBe(true);
  });

  it('canEditDraftActions denies BookingAgent', () => {
    expect(canEditDraftActions(['BookingAgent'])).toBe(false);
  });

  it('canReviewPublishActions grants ContentReviewerPublisher', () => {
    expect(canReviewPublishActions(['ContentReviewerPublisher'])).toBe(true);
  });

  it('canReviewPublishActions denies MerchantEditor', () => {
    expect(canReviewPublishActions(['MerchantEditor'])).toBe(false);
  });

  it('allows submit from draft state', () => {
    expect(isWorkflowTransitionAllowed('draft', 'submit')).toBe(true);
  });

  it('allows submit from rejected state', () => {
    expect(isWorkflowTransitionAllowed('rejected', 'submit')).toBe(true);
  });

  it('blocks submit from in_review state', () => {
    expect(isWorkflowTransitionAllowed('in_review', 'submit')).toBe(false);
  });

  it('allows approve from in_review state', () => {
    expect(isWorkflowTransitionAllowed('in_review', 'approve')).toBe(true);
  });

  it('blocks approve from draft state', () => {
    expect(isWorkflowTransitionAllowed('draft', 'approve')).toBe(false);
  });

  it('allows publish from approved state', () => {
    expect(isWorkflowTransitionAllowed('approved', 'publish')).toBe(true);
  });

  it('blocks publish from in_review state', () => {
    expect(isWorkflowTransitionAllowed('in_review', 'publish')).toBe(false);
  });

  it('allows reject from in_review state', () => {
    expect(isWorkflowTransitionAllowed('in_review', 'reject')).toBe(true);
  });

  it('allows reject from approved state', () => {
    expect(isWorkflowTransitionAllowed('approved', 'reject')).toBe(true);
  });
});
