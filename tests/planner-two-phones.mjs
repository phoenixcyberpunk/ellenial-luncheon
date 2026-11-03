// Two "phones" talking through the real database: run as two processes.
//   node tests/planner-two-phones.mjs A   (in one terminal)
//   node tests/planner-two-phones.mjs B   (in another)
// Phone A starts a lunch and hearts two places; phone B opens the link, sees A's hearts live,
// answers too; A sees both. Also checks that a wrong link and a moved blob are refused.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
vm.runInThisContext(readFileSync(new URL('../vendor/supabase.js', import.meta.url), 'utf8'));
vm.runInThisContext(readFileSync(new URL('../planner-store.js', import.meta.url), 'utf8'));
const P = globalThis.LunchPlanner;
const role = process.argv[2];
const LINK = '/tmp/lunch-link', READY = '/tmp/lunch-b-ready';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(200); } return false; }
const log = (...a) => console.log(`[${role}]`, ...a);

if (role === 'A') {
  const lunch = await P.create();
  const link = P.makeLink(lunch);
  log('lunch for', lunch.day, '| link has secret after #:', /#lunch=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(link));
  writeFileSync(LINK, link);
  let changes = 0;
  P.watch(lunch, () => { changes++; });
  await until(() => existsSync(READY));
  const me = '11111111-1111-4111-8111-111111111111';
  const rev = await P.save(lunch, me, { name: 'Ellen', hearts: ['masala', 'pier11'], out: false, pick: null }, null);
  log('saved my answer, revision', rev);
  log('heard B answer live:', await until(() => changes > 0));
  const all = await P.load(lunch);
  log('answers now:', all.answers.map((a) => `${a.data.name}: ${a.data.hearts.join('+') || '-'}`).join(' | '));
  // update with the right and the wrong revision
  log('update ok, revision', await P.save(lunch, me, { name: 'Ellen', hearts: ['pier11'] }, rev));
  try { await P.save(lunch, me, { name: 'Ellen', hearts: [] }, rev); log('STALE UPDATE ACCEPTED!'); }
  catch (e) { log('stale update refused:', e.code); }
  // a wrong secret can't open it
  const fake = await P.open(lunch.id, lunch.secret.slice(0, 42) + (lunch.secret.endsWith('A') ? 'B' : 'A'));
  try { await P.load(fake); log('WRONG LINK READ IT!'); } catch (e) { log('wrong link refused:', e.code); }
  // a blob moved to another answer id doesn't decrypt
  const blob = await P._encryptAnswer(lunch, me, { name: 'Ellen' });
  log('blob moved to another id decrypts?', (await P._decryptAnswer(lunch, '22222222-2222-4222-8222-222222222222', blob)) !== null);
  log('blob sizes padded (same length for short and longer names):',
    (await P._encryptAnswer(lunch, me, { name: 'Al' })).length === (await P._encryptAnswer(lunch, me, { name: 'Alexandra', hearts: ['a', 'b'] })).length);
  process.exit(0);
} else {
  await until(() => existsSync(LINK));
  const parts = P.parseLink(readFileSync(LINK, 'utf8').split('#')[1]);
  const lunch = await P.open(parts.id, parts.secret);
  let changes = 0, subscribed = false;
  P.watch(lunch, () => { changes++; }, (ok) => { subscribed = ok; });
  await until(() => subscribed);
  writeFileSync(READY, '1');
  log('listening; heard A live:', await until(() => changes > 0));
  const seen = await P.load(lunch);
  log('B reads A:', JSON.stringify(seen.answers.map((a) => a.data)));
  await P.save(lunch, '33333333-3333-4333-8333-333333333333', { name: 'Sara', hearts: ['pier11'], out: false, pick: null }, null);
  log('saved my answer');
  await wait(1500);
  process.exit(0);
}
