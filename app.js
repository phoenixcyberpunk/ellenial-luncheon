// Ellenial Luncheon — main screen.
// Reads data/menus.json (written every weekday morning by scripts/read-menus.mjs)
// and shows every place's menu for today on one screen. No cookies, no tracking.
(function () {
  'use strict';

  var TZ = 'Europe/Stockholm';
  // Walking times are counted from Lindholmen Science Park (Lindholmspiren 3–5).
  var ORIGIN = { lat: 57.7066, lon: 11.9405 };
  var WALK_M_PER_MIN = 80;   // a relaxed lunch pace
  var DETOUR = 1.3;          // streets are not straight lines

  var state = { data: null, filters: { veg: false, near: false } };

  function stockholmDate(d) {
    // YYYY-MM-DD in Stockholm time
    return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function stockholmTime(d) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  }
  function weekdayName(d) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(d);
  }
  function weekdayIndex(d) {
    var s = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(d);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(s);
  }

  function walkMinutes(p) {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return null;
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (p.lat - ORIGIN.lat) * toRad, dLon = (p.lon - ORIGIN.lon) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(ORIGIN.lat * toRad) * Math.cos(p.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var metres = 2 * R * Math.asin(Math.sqrt(a)) * DETOUR;
    return Math.max(1, Math.round(metres / WALK_M_PER_MIN));
  }

  // What we can honestly say about one place today
  function classify(p, today) {
    if (p.kind === 'fixed') return 'fixed';
    var hasItems = p.items && p.items.length > 0;
    if (hasItems && p.menuDate === today) return 'fresh';
    if (hasItems) return 'stale';
    return 'missing';
  }

  function hasVeg(p) {
    if (p.kind === 'fixed') return !!p.veg;
    return (p.items || []).some(function (i) { return i.diet === 'veg' || i.diet === 'vegan'; });
  }

  function render() {
    var list = document.getElementById('list');
    var summary = document.getElementById('summary');
    list.textContent = '';
    var now = new Date();
    var today = stockholmDate(now);
    document.getElementById('today-label').textContent = weekdayName(now) + ' · Lindholmen';

    var wd = weekdayIndex(now);
    // Testing on a weekend: ?weekday=1 shows the latest menus anyway (this visit only, nothing saved).
    var forceWeekday = /[?&]weekday=1\b/.test(location.search);
    if ((wd === 0 || wd === 6) && !forceWeekday) {
      summary.textContent = 'Lunch menus are back on Monday.';
      addEmpty(list, 'It’s the weekend, so most places don’t serve weekday lunch. See you on Monday.');
      return;
    }
    if (!state.data) return;

    var places = state.data.places.map(function (p) {
      return Object.assign({}, p, { walk: walkMinutes(p), state: classify(p, today) });
    });

    var order = { fresh: 0, stale: 1, fixed: 2, missing: 3 };
    places.sort(function (a, b) {
      // places with a menu first, then by walking time
      var s = order[a.state] - order[b.state];
      if (s) return s;
      return (a.walk == null ? 99 : a.walk) - (b.walk == null ? 99 : b.walk);
    });

    var shown = places.filter(function (p) {
      if (state.filters.veg && !hasVeg(p)) return false;
      if (state.filters.near && (p.walk == null || p.walk > 10)) return false;
      return true;
    });

    var freshCount = places.filter(function (p) { return p.state === 'fresh'; }).length;
    summary.textContent = places.length + ' places · ' + freshCount + ' with today’s menu · sorted by walking time';

    if (!shown.length) {
      addEmpty(list, 'No places match these filters. Turn one off to see more.');
      return;
    }
    shown.forEach(function (p) { list.appendChild(card(p)); });
  }

  function addEmpty(list, text) {
    var p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    list.appendChild(p);
  }

  function card(p) {
    var node = document.getElementById('card-tpl').content.firstElementChild.cloneNode(true);
    var name = node.querySelector('.name');
    name.textContent = p.name;
    if (p.url) name.href = p.url; else name.removeAttribute('href');
    node.querySelector('.walk').textContent = p.walk != null ? p.walk + ' min' : '';

    // Price row: the lunch price and what comes with it, or an honest "not on their site"
    var amount = node.querySelector('.price-amount');
    var incl = node.querySelector('.price-incl');
    if (p.price) {
      amount.textContent = p.price;
      incl.textContent = p.includes ? 'incl. ' + p.includes : '';
    } else {
      node.querySelector('.price-row').classList.add('is-unknown');
      amount.textContent = 'Price not on their site';
    }

    var ul = node.querySelector('.dishes');
    var note = node.querySelector('.note');
    var fresh = node.querySelector('.fresh');

    if (p.state === 'fixed') {
      node.classList.add('is-fixed');
      note.textContent = p.note || 'Same menu every day';
    } else if (p.state === 'missing') {
      node.classList.add('is-missing');
      note.textContent = 'No menu found today.';
      fresh.classList.add('is-missing');
      fresh.textContent = p.url ? 'Their own page may have it.' : '';
    } else {
      (p.items || []).forEach(function (it) { ul.appendChild(dishItem(it)); });
      if (p.note) note.textContent = p.note;
      if (p.state === 'fresh') {
        fresh.textContent = 'Updated ' + stockholmTime(new Date(p.readAt));
      } else {
        fresh.classList.add('is-stale');
        // "From Thursday" this week, "From last Friday" if it's from an earlier week
        var from = 'an earlier day';
        var now = new Date(), today = stockholmDate(now);
        if (p.menuDate) {
          var menuDay = new Date(p.menuDate + 'T12:00:00Z');
          var daysAgo = Math.round((new Date(today + 'T12:00:00Z') - menuDay) / 86400000);
          var todayIdx = weekdayIndex(now) || 7;
          from = (daysAgo >= todayIdx ? 'last ' : '') + weekdayName(menuDay);
        }
        fresh.textContent = 'From ' + from + ' · may have changed';
      }
    }
    return node;
  }


  // One dish, in three lines so a long menu can be scanned:
  //   FIRE · 🥦 VEG          station or category, small caps (left out when there is none)
  //   Grillat kycklinglårfilé   the dish itself
  //   rostad potatis · piri piri sås · grönkålsceasar   what comes with it, quieter
  function dishItem(it) {
    var li = document.createElement('li');
    var isVegan = it.diet === 'vegan' || /\bvegan/i.test(it.text);
    var isVeg = isVegan || it.diet === 'veg';

    var text = it.text.trim();
    var label = '';
    var m = text.match(/^([^:]{2,22}):\s+(.+)$/);
    if (m) { label = m[1].trim(); text = m[2].trim(); }
    var labelIsVeg = /^(veg|vegetar|vegan)/i.test(label);

    // Tag line: the station or category, plus a Veg/Vegan word and emoji (never the emoji alone)
    if (label || isVeg) {
      var tag = document.createElement('p');
      tag.className = 'dish-tag';
      if (label) tag.appendChild(document.createTextNode(label));
      if (isVeg) {
        if (label && !labelIsVeg) tag.appendChild(document.createTextNode(' · '));
        if (!labelIsVeg) tag.appendChild(document.createTextNode(isVegan ? 'Vegan ' : 'Veg '));
        else tag.appendChild(document.createTextNode(' '));
        tag.appendChild(emojiNode(isVegan ? '🌱' : '🥦', isVegan ? 'vegan' : 'vegetarian'));
      }
      li.appendChild(tag);
    }

    // Split the dish from its sides at the first " · ", " – ", " - " or "serveras med"
    var split = splitDish(text);
    var head = document.createElement('p');
    head.className = 'dish-name';
    var name = document.createElement('span');
    name.textContent = split.name;
    head.appendChild(name);
    if (it.price) {
      var price = document.createElement('span');
      price.className = 'dish-price';
      price.textContent = it.price;
      head.appendChild(price);
    }
    li.appendChild(head);
    if (split.sides) {
      var sides = document.createElement('p');
      sides.className = 'dish-sides';
      sides.textContent = split.sides;
      li.appendChild(sides);
    }
    return li;
  }

  function splitDish(text) {
    // "(Pad Thai) Wokade risnudlar…": drop a bracketed name that only repeats the label
    text = text.replace(/^\([^)]{2,30}\)\s+/, '');
    var name = text, rest = '';
    var seps = [' · ', ' – ', ' - ', ' — '];
    var cut = -1, len = 0;
    seps.forEach(function (sep) {
      var i = text.indexOf(sep);
      if (i > 2 && (cut < 0 || i < cut)) { cut = i; len = sep.length; }
    });
    if (cut > 0) {
      name = text.slice(0, cut);
      // The remaining dashes are a list of sides: show them with middle dots
      rest = text.slice(cut + len).replace(/\s+[–—-]\s*|\s*–\s+/g, ' · ');
    } else {
      // Otherwise cut at the earliest of ", ", " serveras med ", " med " (kept: it reads as a sentence)
      var best = null;
      [[/,\s+(serveras med\s+)?/i, false], [/\s+serveras med\s+/i, false], [/\s+(med|with)\s+/i, true]].forEach(function (r) {
        var m = text.match(r[0]);
        if (m && m.index >= 3 && m.index <= 60 && (!best || m.index < best.index)) best = { index: m.index, m: m, keep: r[1] };
      });
      if (best) {
        name = text.slice(0, best.index);
        rest = text.slice(best.index + best.m[0].length);
        if (best.keep) rest = best.m[1].toLowerCase() + ' ' + rest;
      }
    }
    name = name.replace(/[,\s]+$/, '').trim();
    rest = rest.replace(/\s+·\s+/g, ' · ').replace(/[.\s]+$/, '').trim();
    return { name: name.charAt(0).toUpperCase() + name.slice(1), sides: rest };
  }

  function emojiNode(char, label) {
    var span = document.createElement('span');
    span.className = 'emoji';
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', label);
    span.textContent = char;
    return span;
  }

  function wireFilters() {
    document.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-filter');
        state.filters[key] = !state.filters[key];
        btn.setAttribute('aria-pressed', String(state.filters[key]));
        render();
      });
    });
  }

  function load() {
    fetch('data/menus.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { state.data = data; render(); })
      .catch(function () {
        document.getElementById('summary').textContent = 'Today’s menus couldn’t be loaded. Check your connection and reload the page.';
      });
  }

  // Auto / Light / Dark, the shared Ellenial switch (ellenial-theme.js), saved on this phone only.
  function mountThemeSwitch() {
    var slot = document.getElementById('prefs');
    if (!slot) return;
    if (!window.EllenialTheme) { slot.hidden = true; return; }
    slot.appendChild(window.EllenialTheme.control({
      label: 'Theme', autoHint: 'Follows your phone', separator: ' · ',
      labels: { auto: 'Auto', light: 'Light', dark: 'Dark' }
    }));
  }

  mountThemeSwitch();
  wireFilters();
  render();
  load();
})();
