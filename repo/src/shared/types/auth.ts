export const ROLE_NAMES = [
  'Administrator',
  'MerchantEditor',
  'ContentReviewerPublisher',
  'BookingAgent',
  'HRManager',
  'Recruiter'
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export type SessionStatus = 'logged_out' | 'authenticated' | 'locked';

export interface AuthenticatedUser {
  id: string;
  username: string;
  roles: RoleName[];
}

export interface SessionState {
  status: SessionStatus;
  user: AuthenticatedUser | null;
}
