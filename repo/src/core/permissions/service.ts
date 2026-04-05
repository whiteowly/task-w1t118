import type { RoleName } from '../../shared/types/auth';
import { AppError } from '../validation/errors';
import type { Capability } from './capabilities';
import { roleCapabilities } from './capabilities';

export function hasCapability(roles: RoleName[], capability: Capability): boolean {
  return roles.some((role) => roleCapabilities[role].has(capability));
}

export function assertCapability(roles: RoleName[], capability: Capability): void {
  if (!hasCapability(roles, capability)) {
    throw new AppError({
      code: 'PERMISSION_DENIED',
      message: 'Permission denied for requested operation.'
    });
  }
}

export function capabilityForRoute(path: string): Capability | null {
  if (path.startsWith('/merchant')) return 'workspace.merchant.view';
  if (path.startsWith('/booking')) return 'workspace.booking.view';
  if (path.startsWith('/recruiting')) return 'workspace.recruiting.view';
  if (path.startsWith('/org-admin')) return 'workspace.orgAdmin.view';
  return null;
}

export function defaultRouteForRoles(roles: RoleName[]): string {
  if (hasCapability(roles, 'workspace.merchant.view')) return '/merchant';
  if (hasCapability(roles, 'workspace.booking.view')) return '/booking';
  if (hasCapability(roles, 'workspace.recruiting.view')) return '/recruiting';
  if (hasCapability(roles, 'workspace.orgAdmin.view')) return '/org-admin';
  return '/denied';
}
