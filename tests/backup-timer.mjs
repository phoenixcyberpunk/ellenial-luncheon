// Tests for the backup timer's decision. Run: node tests/backup-timer.mjs
import { decide, stockholm } from '../backup-timer/worker.js';

let failed = 0;
const t = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${got}, want ${want})`}`);
};
const run = (created_at, status = 'completed') => ({ created_at, status });

// Monday 23 Nov 2026 (winter, UTC+1)
const mon0920 = new Date('2026-11-23T08:20:00Z'); // 09:20 Stockholm
t('stockholm weekday Monday', stockholm(mon0920).day, 1);
t('stockholm time winter', stockholm(mon0920).time, '09:20');
t('stockholm time summer', stockholm(new Date('2026-06-15T08:20:00Z')).time, '10:20');

t('no runs today -> start', decide(mon0920, [run('2026-11-20T15:13:47Z')]).start, true);
t('no runs at all -> start', decide(mon0920, []).start, true);
t('run 13 min ago -> wait', decide(mon0920, [run('2026-11-23T08:07:00Z')]).start, false);
t('run 43 min ago -> start', decide(mon0920, [run('2026-11-23T07:37:00Z')]).start, true);
t('run queued -> wait', decide(mon0920, [run('2026-11-23T06:00:00Z', 'queued')]).start, false);
t('run in progress -> wait', decide(mon0920, [run('2026-11-23T06:00:00Z', 'in_progress')]).start, false);

t('05:20 Stockholm -> too early', decide(new Date('2026-11-23T04:20:00Z'), []).start, false);
t('06:20 Stockholm -> start', decide(new Date('2026-11-23T05:20:00Z'), []).start, true);
t('11:50 Stockholm -> start', decide(new Date('2026-11-23T10:50:00Z'), []).start, true);
t('summer 12:50 Stockholm -> too late', decide(new Date('2026-06-15T10:50:00Z'), []).start, false);
t('Saturday -> nothing', decide(new Date('2026-11-28T08:20:00Z'), []).start, false);

console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
