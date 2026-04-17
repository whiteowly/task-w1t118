import { describe, expect, it } from 'vitest';
import { canManageRecruitingActions, canApproveRecruitingActions } from '../../../src/modules/recruiting/recruiting-service';

describe('recruiting service helpers', () => {
  it('canManageRecruitingActions grants Recruiter', () => {
    expect(canManageRecruitingActions(['Recruiter'])).toBe(true);
  });

  it('canManageRecruitingActions grants Administrator', () => {
    expect(canManageRecruitingActions(['Administrator'])).toBe(true);
  });

  it('canManageRecruitingActions denies BookingAgent', () => {
    expect(canManageRecruitingActions(['BookingAgent'])).toBe(false);
  });

  it('canApproveRecruitingActions grants HRManager', () => {
    expect(canApproveRecruitingActions(['HRManager'])).toBe(true);
  });

  it('canApproveRecruitingActions grants Administrator', () => {
    expect(canApproveRecruitingActions(['Administrator'])).toBe(true);
  });

  it('canApproveRecruitingActions denies Recruiter', () => {
    expect(canApproveRecruitingActions(['Recruiter'])).toBe(false);
  });
});
