// Backup timer for the menu reader (Ellenial Lunch).
//
// GitHub's own timer sometimes skips the reader's half-hourly runs (Monday 23 Nov 2026
// it started none at all). This Cloudflare Worker wakes on weekday mornings at :20 and
// :50 and asks GitHub: has the reader started in the last 40 minutes? If not, it starts
// it. On a normal morning it does nothing. A run with nothing new changes nothing, so an
// extra start is harmless.
//
// Needs one secret, GITHUB_TOKEN: a fine-grained GitHub token for this repo only, with
// "Actions: Read and write" and nothing else. No user data is involved.

const REPO = 'phoenixcyberpunk/ellenial-luncheon';
const WORKFLOW = 'read-menus.yml';
const QUIET_MINUTES = 40;          // a run started this recently means all is well
const WINDOW = { from: '06:15', to: '11:55' }; // Stockholm time, weekdays

// Stockholm weekday (1 = Monday … 7 = Sunday) and "HH:MM" for a moment in time.
export function stockholm(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Stockholm', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return { day, time: `${parts.hour}:${parts.minute}` };
}

// The decision, kept apart from the network so it can be tested.
// runs: GitHub's list of the reader's latest runs (newest first).
export function decide(now, runs) {
  const { day, time } = stockholm(now);
  if (day > 5 || time < WINDOW.from || time > WINDOW.to) return { start: false, why: `outside the window (${time})` };
  const busy = runs.find((r) => r.status === 'queued' || r.status === 'in_progress' || r.status === 'waiting' || r.status === 'pending');
  if (busy) return { start: false, why: `a run is already ${busy.status}` };
  const latest = runs[0];
  if (latest) {
    const ageMin = (now - new Date(latest.created_at)) / 60000;
    if (ageMin < QUIET_MINUTES) return { start: false, why: `last run started ${Math.round(ageMin)} min ago` };
  }
  return { start: true, why: latest ? `last run started ${latest.created_at}` : 'no runs found' };
}

async function github(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ellenial-lunch-backup-timer',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

export async function check(env, now = new Date()) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is missing');
  const { workflow_runs: runs = [] } = await github(env, `/actions/workflows/${WORKFLOW}/runs?per_page=5`);
  const verdict = decide(now, runs);
  if (verdict.start) {
    await github(env, `/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  }
  console.log(`${verdict.start ? 'Started the reader' : 'Nothing to do'}: ${verdict.why}`);
  return verdict;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(check(env, new Date(event.scheduledTime)));
  },
};
