import type { RoleName } from '../../shared/types/auth';

export const CAPABILITIES = [
  'workspace.merchant.view',
  'workspace.merchant.editDraft',
  'workspace.merchant.reviewPublish',
  'workspace.booking.view',
  'workspace.booking.manage',
  'workspace.recruiting.view',
  'workspace.recruiting.manage',
  'workspace.recruiting.approve',
  'workspace.orgAdmin.view',
  'workspace.orgAdmin.manage',
  'workspace.collaboration.use'
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL_CAPABILITIES = new Set<Capability>(CAPABILITIES);

export const roleCapabilities: Record<RoleName, Set<Capability>> = {
  Administrator: new Set(ALL_CAPABILITIES),
  MerchantEditor: new Set([
    'workspace.merchant.view',
    'workspace.merchant.editDraft',
    'workspace.collaboration.use'
  ]),
  ContentReviewerPublisher: new Set([
    'workspace.merchant.view',
    'workspace.merchant.reviewPublish',
    'workspace.collaboration.use'
  ]),
  BookingAgent: new Set([
    'workspace.booking.view',
    'workspace.booking.manage',
    'workspace.collaboration.use'
  ]),
  HRManager: new Set([
    'workspace.recruiting.view',
    'workspace.recruiting.manage',
    'workspace.recruiting.approve',
    'workspace.orgAdmin.view',
    'workspace.collaboration.use'
  ]),
  Recruiter: new Set([
    'workspace.recruiting.view',
    'workspace.recruiting.manage',
    'workspace.collaboration.use'
  ])
};
