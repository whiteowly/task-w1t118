import type { SessionStatus } from '../shared/types/auth';
import {
  capabilityForRoute,
  defaultRouteForRoles,
  hasCapability
} from '../core/permissions/service';
import type { RoleName } from '../shared/types/auth';

const PUBLIC_ROUTES = new Set(['/login', '/bootstrap-admin']);

export interface GuardContext {
  path: string;
  bootstrapRequired: boolean;
  sessionStatus: SessionStatus;
  roles: RoleName[];
}

export function resolveRouteRedirect(ctx: GuardContext): string | null {
  if (ctx.bootstrapRequired) {
    return ctx.path === '/bootstrap-admin' ? null : '/bootstrap-admin';
  }

  if (!ctx.bootstrapRequired && ctx.path === '/bootstrap-admin') {
    return '/login';
  }

  if (ctx.sessionStatus === 'logged_out') {
    if (ctx.path === '/') {
      return '/login';
    }

    if (PUBLIC_ROUTES.has(ctx.path)) {
      return null;
    }

    const capability = capabilityForRoute(ctx.path);
    return capability ? '/login' : null;
  }

  if (
    (ctx.path === '/login' || ctx.path === '/') &&
    (ctx.sessionStatus === 'authenticated' || ctx.sessionStatus === 'locked')
  ) {
    return defaultRouteForRoles(ctx.roles);
  }

  if (PUBLIC_ROUTES.has(ctx.path)) {
    return null;
  }

  const routeCapability = capabilityForRoute(ctx.path);
  if (!routeCapability) {
    return null;
  }

  return hasCapability(ctx.roles, routeCapability) ? null : '/denied';
}
