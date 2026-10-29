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
    if (wd === 0 || wd === 6) {
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
      (p.items || []).forEach(function (it) {
        var li = document.createElement('li');
        var text = document.createElement('span');
        // Vegetarian 🥦 and vegan 🌱 dishes get an emoji right after the word
        var isVegan = it.diet === 'vegan' || /\bvegan/i.test(it.text);
        var isVeg = isVegan || it.diet === 'veg';
        var emoji = isVegan ? '🌱' : '🥦';
        var emojiLabel = isVegan ? 'vegan' : 'vegetarian';
        var m = it.text.match(/^([^:]{2,22}):\s+(.+)$/);
        var labelIsVeg = m && /^(veg|vegetar|vegan)/i.test(m[1]);
        if (isVeg && !labelIsVeg) {
          var tag = document.createElement('b');
          tag.className = 'label';
          tag.textContent = isVegan ? 'Vegan ' : 'Veg ';
          text.appendChild(tag);
          text.appendChild(emojiNode(emoji, emojiLabel));
          text.appendChild(document.createTextNode(' · '));
        }
        // "Fire: Grillad kyckling…" → the station or category in bold, for scanning
        if (m) {
          var label = document.createElement('span');
          label.className = 'label';
          label.textContent = m[1] + ' ';
          text.appendChild(label);
          if (labelIsVeg) {
            text.appendChild(emojiNode(emoji, emojiLabel));
            text.appendChild(document.createTextNode(' '));
          }
          text.appendChild(document.createTextNode(m[2]));
        } else {
          text.appendChild(document.createTextNode(it.text));
        }
        li.appendChild(text);
        if (it.price) {
          var price = document.createElement('span');
          price.className = 'price';
          price.textContent = it.price;
          li.appendChild(price);
        }
        ul.appendChild(li);
      });
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

  wireFilters();
  render();
  load();
})();
