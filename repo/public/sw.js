const RECOVERY_SYNC_TAG = 'localops-recovery-sync-v1';
const RECOVERY_REQUEST_TYPE = 'LOCALOPS_RUN_RECOVERY';

let latestRecoveryCompletion = null;

async function broadcastRecoveryRequest(reason) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const requestedAt = new Date().toISOString();

  await Promise.all(
    clients.map((client) =>
      client.postMessage({
        type: RECOVERY_REQUEST_TYPE,
        reason,
        requestedAt,
        syncTag: RECOVERY_SYNC_TAG
      })
    )
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await broadcastRecoveryRequest('service-worker-activate');
    })()
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag !== RECOVERY_SYNC_TAG) {
    return;
  }

  event.waitUntil(broadcastRecoveryRequest('background-sync'));
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== RECOVERY_SYNC_TAG) {
    return;
  }

  event.waitUntil(broadcastRecoveryRequest('periodic-background-sync'));
});

self.addEventListener('message', (event) => {
  const payload = event.data;

  if (payload?.type === 'LOCALOPS_REGISTER_BACKGROUND_RECOVERY') {
    event.waitUntil(
      (async () => {
        await broadcastRecoveryRequest(payload.reason ?? 'client-registration');
        event.source?.postMessage({
          type: 'LOCALOPS_BACKGROUND_RECOVERY_REGISTERED',
          syncTag: RECOVERY_SYNC_TAG,
          timestamp: new Date().toISOString()
        });
      })()
    );
    return;
  }

  if (payload?.type === 'LOCALOPS_RECOVERY_COMPLETED') {
    latestRecoveryCompletion = {
      reason: payload.reason ?? null,
      summary: payload.summary ?? null,
      completedAt: payload.completedAt ?? new Date().toISOString()
    };
    return;
  }

  if (payload?.type === 'LOCALOPS_RECOVERY_STATUS_REQUEST') {
    event.source?.postMessage({
      type: 'LOCALOPS_RECOVERY_STATUS_RESPONSE',
      syncTag: RECOVERY_SYNC_TAG,
      latestRecoveryCompletion,
      timestamp: new Date().toISOString()
    });
  }
});
