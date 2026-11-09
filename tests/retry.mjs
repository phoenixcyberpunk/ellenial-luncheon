// node tests/retry.mjs — checks that a site that fails once still gets read.
import { withRetries, isRetryable } from '../scripts/retry.mjs';

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const noSleep = async () => {};
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

// Fails once with a network error, then works (this morning's District One case)
{
  let calls = 0;
  const out = await withRetries(async () => { if (++calls === 1) throw new TypeError('fetch failed'); return 'menu'; },
    { waits: [5000, 20000], sleep: noSleep });
  check('Network blip: second try gets the menu', out === 'menu' && calls === 2);
}

// Fails every time: gives up after three tries and passes the error on
{
  let calls = 0;
  let err = null;
  try { await withRetries(async () => { calls++; throw new TypeError('fetch failed'); }, { waits: [5000, 20000], sleep: noSleep }); }
  catch (e) { err = e; }
  check('Site down: three tries, then gives up', calls === 3 && err?.message === 'fetch failed');
}

// Waits the set times between tries
{
  const waited = [];
  let calls = 0;
  await withRetries(async () => { if (++calls < 3) throw httpError(503); return 'ok'; },
    { waits: [5000, 20000], sleep: async (ms) => waited.push(ms) });
  check('Waits 5 s, then 20 s', waited.join(',') === '5000,20000');
}

// A wrong page is not retried
{
  let calls = 0;
  try { await withRetries(async () => { calls++; throw httpError(404); }, { waits: [5000, 20000], sleep: noSleep }); } catch {}
  check('404 is not retried', calls === 1);
}

check('429 and 5xx are retried', isRetryable(httpError(429)) && isRetryable(httpError(502)));
check('403 is not retried', !isRetryable(httpError(403)));
check('Timeouts are retried', isRetryable(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
