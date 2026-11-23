// Ellenial Lunch — watchdog. Runs right after the menu reader (same workflow).
//
// Tells Ellen by email when a lunch place's site seems to have changed, by opening a
// GitHub issue as the github-actions bot (GitHub emails the repo owner about it; issues
// opened with her own key would not notify her). One issue per place, never repeated:
// a repeat adds a comment, and the issue closes itself once the place reads fine again.
//
// Two signals, for places with a daily menu:
// - "Read fails twice": the reader couldn't read the site (e.g. HTTP 404, layout not
//   found) in this run and in the run before. Retries inside a run already cover blips.
// - "No menu by 11:00": on a weekday from 11:00 Stockholm time, the place still has no
//   menu for today. Either they're late or the site changed so the reader can't see it.
//
// It compares data/menus.json from the last commit (the run before) with the file the
// reader just wrote. Usage in the workflow: node scripts/watchdog.mjs <previous.json>
// WATCHDOG_DRY=1 only prints what it would do. WATCHDOG_TEST=1 opens and closes one test
// issue, to check that the emails arrive.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TITLE_PREFIX = 'Lunch alert: ';
const LATE_FROM = '11:00';

export function stockholmNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1,
  };
}

// A reader error from today ("2026-11-23: HTTP 404"), as opposed to "no menu for today yet".
function hardError(place, date) {
  const p = place && place.problem;
  if (!p || !p.startsWith(`${date}: `)) return null;
  const msg = p.slice(date.length + 2);
  return /page read, but no menu for today/.test(msg) ? null : msg;
}

// What each daily place needs: { id, name, state: 'ok' | 'alert', reason }
export function assess(prevData, nowData, now) {
  const { date, time, weekday } = now;
  const prevById = Object.fromEntries((prevData.places || []).map((p) => [p.id, p]));
  const out = [];
  for (const place of nowData.places || []) {
    if (place.kind !== 'daily') continue;
    const err = hardError(place, date);
    const prevErr = hardError(prevById[place.id], date);
    const fresh = place.menuDate === date && !place.problem;
    if (err && prevErr) {
      out.push({ id: place.id, name: place.name, url: place.url, state: 'alert', reason: `The reader couldn't read their site twice in a row today: ${err}. Their site has probably changed.` });
    } else if (!fresh && weekday <= 5 && time >= LATE_FROM) {
      const why = err ? `the last read failed (${err})` : 'their page loads, but the reader finds no menu for today';
      out.push({ id: place.id, name: place.name, url: place.url, state: 'alert', reason: `No menu for today at ${time}: ${why}. They may be late or closed, or their site has changed.` });
    } else if (fresh) {
      out.push({ id: place.id, name: place.name, url: place.url, state: 'ok' });
    }
    // Otherwise (a first failure, or no menu yet before 11:00): wait and see.
  }
  return out;
}

async function gh(pathPart, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${pathPart}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ellenial-lunch-watchdog',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${pathPart}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

const runLink = () => (process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : 'local run');

async function main() {
  const dry = !!process.env.WATCHDOG_DRY;
  const now = stockholmNow();

  if (process.env.WATCHDOG_TEST) {
    const issue = await gh('/issues', { method: 'POST', body: JSON.stringify({
      title: `${TITLE_PREFIX}test (nothing is wrong)`,
      body: `This is a test of the Lunch watchdog, started by hand at ${now.time}. If you got this as an email, alerts reach you. It closes itself right away.\n\nRun: ${runLink()}`,
    }) });
    await gh(`/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
    console.log(`Test issue #${issue.number} opened and closed.`);
    return;
  }

  const prevFile = process.argv[2];
  const prev = prevFile ? JSON.parse(await readFile(prevFile, 'utf8').catch(() => '{"places":[]}')) : { places: [] };
  const cur = JSON.parse(await readFile(path.join(ROOT, 'data', 'menus.json'), 'utf8'));
  const verdicts = assess(prev, cur, now);

  const open = dry ? [] : await gh('/issues?state=open&per_page=100');
  const openByTitle = Object.fromEntries(open.filter((i) => !i.pull_request && i.title.startsWith(TITLE_PREFIX)).map((i) => [i.title, i]));

  for (const v of verdicts) {
    const title = `${TITLE_PREFIX}${v.name}`;
    const existing = openByTitle[title];
    if (v.state === 'alert') {
      const body = `${v.reason}\n\nTheir site: ${v.url}\nChecked ${now.date} at ${now.time} (Stockholm). Run: ${runLink()}\n\nThe card keeps showing the last menu the reader had, with its date. This issue closes itself when the place reads fine again.`;
      if (dry) { console.log(`[dry] ${existing ? 'comment on' : 'open'} "${title}": ${v.reason}`); continue; }
      if (!existing) {
        const issue = await gh('/issues', { method: 'POST', body: JSON.stringify({ title, body }) });
        console.log(`Opened #${issue.number}: ${title}`);
      } else if (!existing.body.includes(now.date) && !(await lastCommentHas(existing.number, now.date))) {
        await gh(`/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Still happening.\n\n${body}` }) });
        console.log(`Commented on #${existing.number}: ${title}`);
      } else {
        console.log(`Already reported today: ${title}`);
      }
    } else if (existing) {
      if (dry) { console.log(`[dry] close "${title}"`); continue; }
      await gh(`/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Reading works again: ${v.name} has today's menu (${now.date} ${now.time}). Closing.` }) });
      await gh(`/issues/${existing.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
      console.log(`Closed #${existing.number}: ${title}`);
    }
  }
  console.log(`Watchdog: ${verdicts.filter((v) => v.state === 'alert').length} alert(s), ${verdicts.filter((v) => v.state === 'ok').length} fine.`);
}

// Only one comment per issue per day, so a broken site gives one email a day, not one per run.
async function lastCommentHas(number, date) {
  const comments = await gh(`/issues/${number}/comments?per_page=100`);
  const last = comments[comments.length - 1];
  return !!(last && last.body.includes(date));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`Watchdog failed: ${err.message}`); process.exitCode = 1; });
}
