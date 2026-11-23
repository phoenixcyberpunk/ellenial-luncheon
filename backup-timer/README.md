# Backup timer for the menu reader

GitHub's own timer sometimes skips the menu reader's runs (on Monday 23 Nov 2026 it started none).
This Cloudflare Worker is the backup. On weekdays at :20 and :50, 06:20–11:50 Stockholm time, it asks
GitHub whether the reader has started in the last 40 minutes. If not, it starts the reader. On a
normal morning it does nothing. It costs 0 kr (Cloudflare's free plan) and handles no user data.

- Code: `worker.js` (the decision is the `decide()` function). Tests: `node tests/backup-timer.mjs`.
- Timer: `wrangler.toml` (`20,50 4-10 * * 1-5` in UTC; the Worker itself only acts 06:15–11:55 Stockholm, so winter and summer time both work).
- No public address (`workers_dev = false`).

## Setup (once)

1. **GitHub key.** github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   Name it `Lunch backup timer`, expiry 1 year, Repository access → *Only select repositories* → `ellenial-luncheon`,
   Permissions → Repository → **Actions: Read and write** (nothing else). Copy the token.
2. **Worker.** Cloudflare dashboard → Workers & Pages → Create → Import a repository → GitHub → `phoenixcyberpunk/ellenial-luncheon`.
   Under the advanced settings, set the root directory to `backup-timer` and the build watch path to `backup-timer/*`
   (so the reader's daily menu commits don't rebuild it). Keep the deploy command `npx wrangler deploy`. Deploy.
3. **Secret.** The new Worker → Settings → Variables and Secrets → Add → type *Secret*, name `GITHUB_TOKEN`, paste the token → Deploy.
4. **Check.** Settings → Triggers should show the cron `20,50 4-10 * * 1-5`. The Worker's logs say
   "Nothing to do: …" or "Started the reader: …" at each :20 and :50 on weekday mornings.

## Upkeep

The GitHub key runs out after a year. When it does, the logs show `HTTP 401`: make a new key (step 1) and replace the secret (step 3).
