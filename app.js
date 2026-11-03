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

  var state = { data: null, filters: { veg: false, near: false }, open: {}, hearts: [], sortHearts: [] };
  var HEARTS_KEY = 'luncheon.shortlist';
  var FOLD_AFTER = 4; // dishes shown before "Show all"

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

  // ISO week number (Swedish weeks: Monday first) of a YYYY-MM-DD date
  function isoWeek(ymd) {
    var d = new Date(ymd + 'T12:00:00Z');
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }
  function addDays(ymd, n) {
    var d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // Monday of the week a date is in
  function weekStart(ymd) {
    var day = new Date(ymd + 'T12:00:00Z').getUTCDay() || 7;
    return addDays(ymd, 1 - day);
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

  // ---------- Lunch planner, step 1: hearts on this phone ----------
  // Your shortlist for today, kept in this browser only (localStorage) and forgotten at
  // midnight: it's saved together with today's date and ignored once the date has passed.
  // Nothing is sent anywhere. Storage can be missing or blocked, so every use is guarded.
  function loadHearts() {
    var today = stockholmDate(new Date());
    try {
      var saved = JSON.parse(window.localStorage.getItem(HEARTS_KEY) || 'null');
      if (saved && saved.date === today && Array.isArray(saved.ids)) return saved.ids.filter(function (id) { return typeof id === 'string'; });
    } catch (e) { /* storage unavailable: start empty */ }
    return [];
  }
  function saveHearts() {
    try {
      if (state.hearts.length) window.localStorage.setItem(HEARTS_KEY, JSON.stringify({ date: stockholmDate(new Date()), ids: state.hearts }));
      else window.localStorage.removeItem(HEARTS_KEY);
    } catch (e) { /* the shortlist still works until the page is closed */ }
  }
  function isHearted(id) { return state.hearts.indexOf(id) !== -1; }

  // Tapping a heart never moves cards: the list keeps its order while you're on the page,
  // and the bar lists your shortlisted places so you can jump to them. Shortlisted places
  // come first the next time you open the page.
  function toggleHeart(p) {
    var on = !isHearted(p.id);
    state.hearts = on ? state.hearts.concat(p.id) : state.hearts.filter(function (id) { return id !== p.id; });
    saveHearts();
    var card = document.getElementById('place-' + p.id);
    if (card) updateHeart(card, p);
    renderShortlist();
    announce(on ? p.name + ' added to your shortlist.' : p.name + ' removed from your shortlist.');
  }

  function updateHeart(node, p) {
    var heart = node.querySelector('.heart');
    var on = isHearted(p.id);
    heart.setAttribute('aria-pressed', String(on));
    heart.setAttribute('aria-label', on ? p.name + ' is on your shortlist. Remove it' : 'Add ' + p.name + ' to your shortlist');
    heart.title = on ? 'On your shortlist (tap to remove)' : 'Add to your shortlist';
    node.classList.toggle('is-hearted', on);
  }

  function announce(text) {
    var el = document.getElementById('announce');
    if (!el) return;
    el.textContent = '';
    window.setTimeout(function () { el.textContent = text; }, 50);
  }

  function renderShortlist() {
    var box = document.getElementById('shortlist');
    if (!box) return;
    var n = state.hearts.length;
    box.hidden = n === 0;
    document.body.classList.toggle('has-shortlist', n > 0);
    document.getElementById('shortlist-text').textContent = n === 1 ? 'Your shortlist · 1 place' : 'Your shortlist · ' + n + ' places';
    var names = document.getElementById('shortlist-names');
    names.textContent = '';
    var byId = {};
    ((state.data && state.data.places) || []).forEach(function (p) { byId[p.id] = p; });
    state.hearts.forEach(function (id, i) {
      var p = byId[id];
      if (!p) return;
      if (names.childNodes.length) names.appendChild(document.createTextNode(', '));
      var a = document.createElement('a');
      a.href = '#place-' + id;
      a.textContent = p.name;
      a.addEventListener('click', function (e) { e.preventDefault(); goTo(id); });
      names.appendChild(a);
    });
  }

  // Scroll to a card and move focus to its name (shared by the jump list and the shortlist bar)
  function goTo(id) {
    var target = document.getElementById('place-' + id);
    if (!target) return;
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    var name = target.querySelector('.name');
    if (name) name.focus({ preventScroll: true });
  }

  function render() {
    var list = document.getElementById('list');
    var summary = document.getElementById('summary');
    list.textContent = '';
    var jump = document.getElementById('jump');
    jump.textContent = '';
    document.getElementById('jump-box').hidden = true;
    var now = new Date();
    var today = stockholmDate(now);
    var wd = weekdayIndex(now);
    var weekend = wd === 0 || wd === 6;
    var week = isoWeek(today);
    var banner = document.getElementById('banner');
    banner.hidden = true;
    if (!state.data) return;

    var places = state.data.places.map(function (p) {
      return Object.assign({}, p, { walk: walkMinutes(p), state: classify(p, today) });
    });

    // Banner when no daily menu is from the lunch week we're in. At weekends the lunch week
    // is the one coming up, so last week's menus stay on screen with a clear notice.
    var lunchWeekStart = weekend ? addDays(weekStart(today), 7) : weekStart(today);
    var lunchWeek = isoWeek(lunchWeekStart);
    var daily = places.filter(function (p) { return p.kind !== 'fixed' && p.items && p.items.length; });
    var thisWeeks = daily.filter(function (p) { return p.menuDate && p.menuDate >= lunchWeekStart; });
    if (daily.length && !thisWeeks.length) {
      var latest = daily.map(function (p) { return p.menuDate; }).sort().pop();
      var fromWeek = latest ? isoWeek(latest) : null;
      banner.querySelector('.banner__title').textContent = 'Menus for week ' + lunchWeek + ' aren’t out yet';
      banner.querySelector('.banner__text').textContent = (fromWeek ? 'Showing the latest menus, from week ' + fromWeek + '. ' : 'Showing the latest menus we have. ') +
        'They may have changed, so check the place’s own page before you walk over. New menus are read every weekday morning.';
      banner.hidden = false;
    }

    // Forget hearts for places that are no longer on the list
    var known = places.map(function (p) { return p.id; });
    state.hearts = state.hearts.filter(function (id) { return known.indexOf(id) !== -1; });
    state.sortHearts = state.sortHearts.filter(function (id) { return known.indexOf(id) !== -1; });
    var anyHearts = state.sortHearts.length > 0;
    renderShortlist();

    var order = { fresh: 0, stale: 1, fixed: 2, missing: 3 };
    places.sort(function (a, b) {
      // your shortlist first (only when you have one), then places with a menu, then by walking time
      if (anyHearts) {
        var h = (state.sortHearts.indexOf(b.id) !== -1 ? 1 : 0) - (state.sortHearts.indexOf(a.id) !== -1 ? 1 : 0);
        if (h) return h;
      }
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
    // One quiet line under the heading: the day and week number, then what's on today
    var dayWeek = weekdayName(now) + ', week ' + week;
    var phone = window.matchMedia && window.matchMedia('(max-width: 759px)').matches;
    summary.textContent = dayWeek + ' · ' + (weekend
      ? places.length + ' places · no weekday lunch today'
      : places.length + ' places · ' + freshCount + ' with today’s menu');
    if (!phone) summary.textContent += ' · sorted by walking time' + (anyHearts ? ' · your shortlist first' : '');

    if (!shown.length) {
      addEmpty(list, 'No places match these filters. Turn one off to see more.');
      return;
    }
    shown.forEach(function (p) { list.appendChild(card(p)); });
    fillJump(jump, shown);
  }

  // Quick list of the places shown, in page order; tapping a name jumps to its card.
  // Folded behind "Jump to a place" on a phone (27 names fill the first screen), open on a computer.
  function fillJump(jump, shown) {
    var box = document.getElementById('jump-box');
    if (shown.length < 2) return;
    document.getElementById('jump-toggle').textContent = 'Jump to a place (' + shown.length + ')';
    shown.forEach(function (p, i) {
      // Each name and its following dot stay together, so a line never starts with a dot
      var item = document.createElement('span');
      item.className = 'jump__item';
      var a = document.createElement('a');
      a.className = 'jump__link';
      a.href = '#place-' + p.id;
      a.textContent = p.name;
      a.addEventListener('click', function (e) { e.preventDefault(); goTo(p.id); });
      item.appendChild(a);
      if (i < shown.length - 1) {
        var sep = document.createElement('span');
        sep.className = 'jump__sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '·';
        item.appendChild(sep);
      }
      jump.appendChild(item);
      jump.appendChild(document.createTextNode(' '));
    });
    box.hidden = false;
  }

  function addEmpty(list, text) {
    var p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    list.appendChild(p);
  }

  function card(p) {
    var node = document.getElementById('card-tpl').content.firstElementChild.cloneNode(true);
    node.id = 'place-' + p.id;
    var name = node.querySelector('.name');
    name.textContent = p.name;
    if (p.url) name.href = p.url; else name.removeAttribute('href');
    node.querySelector('.walk').textContent = p.walk != null ? p.walk + ' min' : '';

    // Heart: an outlined heart; once tapped it fills (a change of shape, not just colour)
    // on a Periwinkle background. Screen readers hear "on your shortlist".
    updateHeart(node, p);
    node.querySelector('.heart').addEventListener('click', function () { toggleHeart(p); });

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
      foldDishes(node, ul, p);
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
    addMenuPicture(node, p);
    addLinks(node, p);
    return node;
  }

  // A menu that only exists as a picture: a small preview (saved on this site, so the
  // restaurant never sees who's looking) that opens full size in a dialog.
  function addMenuPicture(node, p) {
    if (!p.image || !p.image.src) return;
    var btn = node.querySelector('.menu-pic');
    var img = btn.querySelector('.menu-pic__img');
    img.src = p.image.src;
    var when = p.image.updated ? ' · updated ' + shortDate(p.image.updated) : '';
    btn.querySelector('.menu-pic__label').textContent = 'Menu picture from their site' + when + ' · tap to enlarge';
    btn.setAttribute('aria-label', 'Show ' + p.name + "'s menu picture full size");
    btn.hidden = false;
    btn.addEventListener('click', function () { openPicture(p); });
  }

  function openPicture(p) {
    var dlg = document.getElementById('pic-view');
    if (!dlg || typeof dlg.showModal !== 'function') { window.open(p.image.src, '_blank', 'noopener'); return; }
    document.getElementById('pic-view-title').textContent = p.name + ' · menu';
    var img = document.getElementById('pic-view-img');
    img.src = p.image.src;
    img.alt = 'Picture of ' + p.name + "'s menu, from their website";
    var src = document.getElementById('pic-view-source');
    src.href = p.image.from || p.url || '#';
    dlg.showModal();
  }

  function shortDate(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' });
  }

  (function setUpPictureView() {
    var dlg = document.getElementById('pic-view');
    if (!dlg) return;
    document.getElementById('pic-view-close').addEventListener('click', function () { dlg.close(); });
    // Tap outside the picture to close
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  })();


  // One dish, in three lines so a long menu can be scanned:
  //   FIRE · 🥦 VEG          station or category, small caps (left out when there is none)
  //   Grillat kycklinglårfilé   the dish itself
  //   rostad potatis · piri piri sås · grönkålsceasar   what comes with it, quieter
  function dishItem(it) {
    var li = document.createElement('li');

    var text = it.text.trim();
    var label = '';
    var m = text.match(/^([^:]{2,22}):\s+(.+)$/);
    if (m) { label = m[1].trim(); text = m[2].trim(); }

    // Restaurants call it "VEG", "Vegetarisk", "Vegetariskt", "Vegetarian"… We always say
    // "Veg 🥦" (and "Vegan 🌱" for vegan), so the word is dropped from their label and any
    // rest of it ("Vegetarisk Poke bowl" → "Poke bowl") stays as the category.
    var VEG_LEAD = /^(vegan(sk[at]?)?|vegetari(sk[at]?|an|ska)|veggie|veg)\b[\s:·–-]*/i;
    var leadMatch = label.match(VEG_LEAD);
    var labelSaysVegan = !!(leadMatch && /^vegan/i.test(leadMatch[1]));
    if (leadMatch) label = label.slice(leadMatch[0].length).trim();

    var isVegan = it.diet === 'vegan' || labelSaysVegan || /\bvegan/i.test(it.text);
    var isVeg = isVegan || it.diet === 'veg' || !!leadMatch;
    if (isVeg) li.setAttribute('data-veg', '');

    // Tag line: the station or category, plus "Veg 🥦" or "Vegan 🌱" (never the emoji alone)
    if (label || isVeg) {
      var tag = document.createElement('p');
      tag.className = 'dish-tag';
      if (label) tag.appendChild(document.createTextNode(label));
      if (isVeg) {
        if (label) tag.appendChild(document.createTextNode(' · '));
        tag.appendChild(document.createTextNode(isVegan ? 'Vegan ' : 'Veg '));
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

  // Long menus fold after the first few dishes, with "Show all 8 dishes" underneath.
  // With the Veg filter on, vegetarian and vegan dishes always stay visible.
  function foldDishes(node, ul, p) {
    var btn = node.querySelector('.more');
    var items = Array.prototype.slice.call(ul.children);
    var hideable = items.filter(function (li, i) {
      return i >= FOLD_AFTER && !(state.filters.veg && li.hasAttribute('data-veg'));
    });
    if (hideable.length < 2) return; // folding away a single dish saves nothing
    var listId = 'dishes-' + p.id;
    ul.id = listId;
    btn.setAttribute('aria-controls', listId);
    btn.hidden = false;
    function apply() {
      var open = !!state.open[p.id];
      hideable.forEach(function (li) { li.hidden = !open; });
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Show fewer dishes' : 'Show all ' + items.length + ' dishes';
    }
    btn.addEventListener('click', function () { state.open[p.id] = !state.open[p.id]; apply(); });
    apply();
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

  // Links at the bottom of every card: the place's own lunch page and where it is on a map.
  // Both open in a new tab; the map link only carries the place's position, nothing about you.
  function addLinks(node, p) {
    var row = node.querySelector('.links');
    if (p.url) row.appendChild(linkTo(p.url, 'Lunch page', 'Open ' + p.name + '’s lunch page'));
    if (typeof p.lat === 'number' && typeof p.lon === 'number') {
      var map = 'https://www.openstreetmap.org/?mlat=' + p.lat + '&mlon=' + p.lon + '#map=18/' + p.lat + '/' + p.lon;
      row.appendChild(linkTo(map, 'Map', 'Show ' + p.name + ' on OpenStreetMap'));
    }
    if (!row.children.length) row.hidden = true;
  }
  function linkTo(href, text, label) {
    var a = document.createElement('a');
    a.className = 'links__a';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', label + ' (opens in a new tab)');
    a.textContent = text + ' ↗';
    return a;
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

  function wireShortlist() {
    state.hearts = loadHearts();
    state.sortHearts = state.hearts.slice();
    // The jump list starts open on a computer and folded on a phone
    var box = document.getElementById('jump-box');
    if (box && window.matchMedia && window.matchMedia('(min-width: 760px)').matches) box.open = true;
    var clear = document.getElementById('shortlist-clear');
    if (clear) clear.addEventListener('click', function () {
      state.hearts = [];
      saveHearts();
      document.querySelectorAll('.card').forEach(function (node) {
        var p = (state.data.places || []).filter(function (x) { return 'place-' + x.id === node.id; })[0];
        if (p) updateHeart(node, p);
      });
      renderShortlist();
      announce('Your shortlist is cleared.');
      var first = document.querySelector('.card .heart');
      if (first) first.focus({ preventScroll: true });
    });
  }

  mountThemeSwitch();
  wireFilters();
  wireShortlist();
  render();
  load();
})();
