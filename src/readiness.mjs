export async function waitForRuntime(baseURL, { fetcher = fetch, timeoutMs = 120000, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, signal } = {}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - now())));
      const response = await fetcher(baseURL + '/api/auth/status', { redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (response.ok) { await response.arrayBuffer(); return; }
    } catch {}
    signal?.throwIfAborted();
    await pause(1000);
  }
  throw new Error('Runtime readiness timed out before authentication/configuration. Inspect .localagent/omniroute.log.');
}
