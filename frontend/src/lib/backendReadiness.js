// Invoked only by an explicit user action. Never retries uploads or calls a vision API.
export const waitForBackend = async ({ origin, signal, fetchImpl = fetch, timeoutMs = 75000,
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) => {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetchImpl(`${origin}/api/ready`, { cache: 'no-store', signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(Math.min(8000, Math.max(1, deadline - now())))]) });
      if (response.ok) {
        const body = await response.json();
        if (body?.success && body.data?.status === 'ready') return true;
      }
    } catch (error) { if (signal?.aborted) throw error; }
    signal?.throwIfAborted();
    if (now() < deadline) await wait(Math.min(1500, deadline - now()));
  }
  throw new Error('The live service is still unavailable. You can retry later or explore the demo.');
};
