export interface CollaborationCannedResponseSeed {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

export const DEFAULT_COLLABORATION_CANNED_RESPONSES: CollaborationCannedResponseSeed[] = [
  {
    id: 'canned-next-step-confirmation',
    title: 'Confirm next step owner',
    body: 'Thanks. Please confirm the owner and ETA for the next action before we close this thread.',
    tags: ['handoff', 'ownership']
  },
  {
    id: 'canned-blocker-escalation',
    title: 'Escalate blocker',
    body: 'This appears blocked on a dependency. Escalating for priority unblocking and requesting status update by end of day.',
    tags: ['blocker', 'escalation']
  },
  {
    id: 'canned-validation-request',
    title: 'Request targeted verification',
    body: 'Please rerun targeted verification for this area and share exact command output with any failing assertion details.',
    tags: ['verification', 'quality']
  }
];

export function collaborationContextLabelForPath(path: string): string {
  if (path.startsWith('/merchant')) {
    return 'Merchant Console';
  }
  if (path.startsWith('/booking')) {
    return 'Booking Desk';
  }
  if (path.startsWith('/recruiting')) {
    return 'Recruiting Workspace';
  }
  if (path.startsWith('/org-admin')) {
    return 'Org Admin';
  }
  if (path.startsWith('/login')) {
    return 'Login';
  }
  if (path.startsWith('/bootstrap-admin')) {
    return 'Bootstrap Admin';
  }

  return 'Workspace';
}

export function normalizeCollaborationContextKey(path: string): string {
  const [pathname] = path.split('?');
  const normalized = pathname.trim();
  return normalized.length > 0 ? normalized : '/';
}
