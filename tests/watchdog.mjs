// Tests for the watchdog's decisions. Run: node tests/watchdog.mjs
import { assess, stockholmNow } from '../scripts/watchdog.mjs';

let failed = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};
const D = '2026-11-23';
const mon = (time) => ({ date: D, time, weekday: 1 });
const place = (o) => ({ id: 'x', name: 'X', url: 'https://x', kind: 'daily', menuDate: D, items: [{}], ...o });
const states = (prev, cur, now) => assess({ places: prev }, { places: cur }, now).map((v) => v.state);

t('fresh menu -> ok', states([], [place({})], mon('09:00')), ['ok']);
t('fixed places ignored', states([], [place({ kind: 'fixed' })], mon('12:00')), []);
t('first 404 -> wait', states([place({})], [place({ menuDate: '2026-11-20', problem: `${D}: HTTP 404` })], mon('08:00')), []);
t('404 twice -> alert', states([place({ problem: `${D}: HTTP 404` })], [place({ menuDate: '2026-11-20', problem: `${D}: HTTP 404` })], mon('08:00')), ['alert']);
t('404 yesterday + today -> wait', states([place({ problem: '2026-11-20: HTTP 404' })], [place({ problem: `${D}: HTTP 404` })], mon('08:00')), []);
t('no menu yet 10:37 -> wait', states([], [place({ menuDate: '2026-11-20', problem: `${D}: page read, but no menu for today` })], mon('10:37')), []);
t('no menu 11:07 -> alert', states([], [place({ menuDate: '2026-11-20', problem: `${D}: page read, but no menu for today` })], mon('11:07')), ['alert']);
t('no menu twice is not a hard error', states([place({ problem: `${D}: page read, but no menu for today` })], [place({ problem: `${D}: page read, but no menu for today` })], mon('09:07')), []);
t('weekend, no menu -> nothing', states([], [place({ menuDate: '2026-11-20' })], { date: '2026-11-28', time: '12:00', weekday: 6 }), []);
t('Bistrot case (future date kept) 11:07 -> alert', states([], [place({ menuDate: '2026-11-27', problem: `${D}: page read, but no menu for today` })], mon('11:07')), ['alert']);
t('stockholm time', stockholmNow(new Date('2026-11-23T10:07:00Z')), { date: D, time: '11:07', weekday: 1 });

console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
