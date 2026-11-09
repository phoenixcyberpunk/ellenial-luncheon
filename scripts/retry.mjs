// A site that doesn't answer once (a network blip, a slow server, a busy moment) gets
// two more tries, a little apart, before we give up on it for this run. Only real
// "try again" errors are retried: no connection, timeouts, 429 and 5xx. A 404 or 403
// means the page itself is wrong, so trying again would only waste time.
export const RETRY_WAITS_MS = (process.env.READ_MENUS_RETRY_WAITS ?? '5000,20000')
  .split(',').filter(Boolean).map(Number);

export function isRetryable(err) {
  const status = err?.status;
  if (status) return status === 429 || status >= 500;
  return true; // fetch failed, DNS, reset, timeout
}

export async function withRetries(task, { waits = RETRY_WAITS_MS, label = '', sleep } = {}) {
  const pause = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      if (attempt >= waits.length || !isRetryable(err)) throw err;
      console.warn(`${label}: ${err.message}; trying again in ${waits[attempt] / 1000} s`);
      await pause(waits[attempt]);
    }
  }
}
