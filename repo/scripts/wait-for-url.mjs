const targetUrl = process.argv[2];
const timeoutMs = Number(process.argv[3] ?? 120000);
const pollIntervalMs = Number(process.argv[4] ?? 1000);

if (!targetUrl) {
  console.error('Usage: node scripts/wait-for-url.mjs <url> [timeoutMs] [pollIntervalMs]');
  process.exit(1);
}

const startedAt = Date.now();

async function waitForUrl() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(targetUrl, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.error(`Timed out waiting for ${targetUrl} after ${timeoutMs}ms.`);
  process.exit(1);
}

await waitForUrl();
