import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRoles?: string[];
  username?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: { code: 'SESSION_LOCKED', message: 'Authentication required.' } });
    return;
  }

  const token = header.slice(7);
  const db = getDb();
  const session = db
    .prepare(
      `
    SELECT s.user_id, s.expires_at, u.username, u.roles, u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `
    )
    .get(token) as
    | { user_id: string; expires_at: string; username: string; roles: string; status: string }
    | undefined;

  if (!session) {
    res
      .status(401)
      .json({ error: { code: 'SESSION_LOCKED', message: 'Invalid or expired session.' } });
    return;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.status(401).json({ error: { code: 'SESSION_LOCKED', message: 'Session expired.' } });
    return;
  }

  if (session.status !== 'active') {
    res
      .status(403)
      .json({ error: { code: 'PERMISSION_DENIED', message: 'User account is disabled.' } });
    return;
  }

  req.userId = session.user_id;
  req.username = session.username;
  req.userRoles = JSON.parse(session.roles) as string[];
  next();
}

export function requireCapability(capability: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const roles = req.userRoles ?? [];
    if (hasCapabilityCheck(roles, capability)) {
      next();
    } else {
      res.status(403).json({
        error: { code: 'PERMISSION_DENIED', message: `Missing capability: ${capability}` }
      });
    }
  };
}

const ROLE_CAPABILITIES: Record<string, Set<string>> = {
  Administrator: new Set([
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
  ]),
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

function hasCapabilityCheck(roles: string[], capability: string): boolean {
  return roles.some((role) => ROLE_CAPABILITIES[role]?.has(capability) ?? false);
}
