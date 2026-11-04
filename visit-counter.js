/*
  Ellenial Lunch – daily visit counter (phone side). Plain script, no build step.
  Counts each phone once per Stockholm day for Ellen's own statistics.
  - Only the live site counts; staging, previews and local tests are left out.
  - This phone remembers "already counted today" in its own storage. Nothing else is kept.
  - The server gets an empty "+1": no id, no cookie, no page details.
  - It never blocks or breaks the page: it runs after the menus, gives up after a few
    seconds, and swallows every error.
*/
(function (root) {
  'use strict';

  var KEY = 'ellenial-lunch-counted-day';
  var LIVE_HOST = 'lunch.ellenial.app';
  var ENDPOINT = 'https://knvrvmqdxvcatsrvkrgx.supabase.co/rest/v1/rpc/lunch_count_visit';
  // Public by design: with this key the counter can only add +1 to today's number.
  var API_KEY = 'sb_publishable_5e3mg1E-r-P_to34ONwRfw_FQYUwy3z';

  function stockholmDay(date) {
    // sv-SE formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(date || new Date());
  }

  function countVisit(opts) {
    opts = opts || {};
    var storage = opts.storage, fetchFn = opts.fetchFn;
    var timeoutMs = opts.timeoutMs || 4000;
    try {
      if (opts.host !== LIVE_HOST) return Promise.resolve('skipped-host');
      var day = stockholmDay(opts.now);
      var last = null;
      try { last = storage.getItem(KEY); } catch (e) { /* private window: storage blocked */ }
      if (last === day) return Promise.resolve('already-counted');
      // Mark first, so two tabs opened at once don't both count.
      try { storage.setItem(KEY, day); } catch (e) { /* ignore */ }

      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
      return Promise.resolve()
        .then(function () {
          return fetchFn(ENDPOINT, {
            method: 'POST',
            headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
            body: '{}',
            keepalive: true,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: ctrl ? ctrl.signal : undefined
          });
        })
        .then(function () { clearTimeout(timer); return 'sent'; },
              function () { clearTimeout(timer); return 'failed-quietly'; });
    } catch (e) {
      return Promise.resolve('failed-quietly');
    }
  }

  var api = { countVisit: countVisit, stockholmDay: stockholmDay };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.EllenialVisits = api;

  // In the browser: count once the page has settled, so it never competes with the menus.
  function run() {
    var storage = null;
    try { storage = root.localStorage; } catch (e) { /* blocked */ }
    countVisit({ storage: storage, fetchFn: root.fetch && root.fetch.bind(root), host: root.location.hostname });
  }
  if (root.document && root.document.readyState === 'complete') setTimeout(run, 1500);
  else if (root.addEventListener) root.addEventListener('load', function () { setTimeout(run, 1500); });
})(this);
