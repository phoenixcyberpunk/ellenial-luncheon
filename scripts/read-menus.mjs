// Ellenial Luncheon — morning menu reader.
//
// Reads each place's menu from the restaurant's own website and writes
// data/menus.json, which the main screen shows. Runs on weekday mornings
// (see .github/workflows/read-menus.yml). No dependencies: Node 20+.
//
// Rules:
// - Only today's menu (Stockholm time) counts as fresh. If a site still shows
//   last week's menu, we keep it but label it with the date it was for.
// - Only a real new menu replaces the one we have. If a site can't be read, or
//   shows nothing for today, we keep the last menu we had (up to a week old),
//   so the page can say "From Thursday · may have changed" instead of nothing.
// - The file only changes when a menu actually changes, so the repo isn't
//   flooded with empty commits.
//
// Test offline against saved pages:
//   LUNCHEON_FIXTURES=path/to/dir LUNCHEON_TODAY=2026-10-29 node scripts/read-menus.mjs
// (files in the dir are named <place id>.html)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'menus.json');
const USER_AGENT = 'Mozilla/5.0 (compatible; EllenialLuncheon/0.1; +https://github.com/phoenixcyberpunk/ellenial-luncheon)';
const FIXTURES = process.env.LUNCHEON_FIXTURES || '';

// ---------- dates (always Stockholm) ----------

const DAYS_SV = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];

function stockholmToday() {
  if (process.env.LUNCHEON_TODAY) return process.env.LUNCHEON_TODAY;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function dateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  if (!fromIso) return Infinity;
  return Math.round((dateParts(toIso) - dateParts(fromIso)) / 86400000);
}

function weekday(iso) {
  return dateParts(iso).getUTCDay(); // 0 = Sunday
}

function isoWeek(iso) {
  const d = dateParts(iso);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// The date of a given weekday (1 = Monday) in a given ISO week, close to today.
function dateInWeek(todayIso, week, dow) {
  const today = dateParts(todayIso);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() || 7) - 1));
  const shiftWeeks = week - isoWeek(todayIso);
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + shiftWeeks * 7 + (dow - 1));
  return toIso(d);
}

// ---------- html to lines ----------

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', aring: 'å', Aring: 'Å', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', eacute: 'é', Eacute: 'É', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', egrave: 'è', uuml: 'ü' };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in named ? named[n] : m));
}

function htmlToLines(html) {
  let s = html
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|section|article|span|ul|ol|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s.split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter(Boolean);
}

const clean = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();

const VEG_WORDS = /^veg|vegetar|vegan/i;

// ---------- readers: one per site ----------
// Each returns { menuDate, items: [{ text, diet? }] } or throws.

const readers = {
  // Compass Group pages embed the week's menu as JSON (window.__INITIAL_MENU__).
  compass(html, today) {
    const m = html.match(/__INITIAL_MENU__\s*=\s*/);
    if (!m) throw new Error('menu data not found on page');
    const data = parseJsonAt(html, m.index + m[0].length);
    const days = (data.weekMenu && data.weekMenu.menus) || [];
    let day = days.find((d) => (d.date || '').slice(0, 10) === today);
    if (!day && data.dayMenu && (data.dayMenu.date || '').slice(0, 10) === today) day = data.dayMenu;
    if (!day) {
      // fall back to the latest earlier day that has a menu, labelled with its date
      day = days.filter((d) => d.html && (d.date || '').slice(0, 10) < today).pop();
    }
    if (!day || !day.html) return { menuDate: null, items: [] };
    const items = [];
    for (const block of day.html.split(/<\/p>|<br\s*\/?>\s*&nbsp;\s*<br\s*\/?>/i)) {
      // Swedish line is in <strong>Station:</strong> text; the English line is in <em>
      const sv = block.replace(/<em>[\s\S]*?<\/em>/gi, '');
      const lines = htmlToLines(sv);
      const joined = clean(lines.join(' '));
      if (!joined) continue;
      const sm = joined.match(/^([A-Za-zÅÄÖåäö]+):\s*(.+)$/);
      if (sm) {
        const station = sm[1];
        items.push({ text: `${station}: ${clean(sm[2])}`, diet: /^earth$/i.test(station) ? 'veg' : undefined });
      } else {
        items.push({ text: joined });
      }
    }
    return { menuDate: day.date.slice(0, 10), items };
  },

  // Kooperativet: sections "Lunch Torsdag v44", category in capitals, then the dish.
  kooperativet(html, today) {
    const lines = htmlToLines(html);
    const heading = /^lunch\s+(måndag|tisdag|onsdag|torsdag|fredag)\s+v\.?\s*(\d{1,2})/i;
    const sections = [];
    lines.forEach((l, i) => {
      const m = l.match(heading);
      if (m) sections.push({ i, dow: DAYS_SV.indexOf(m[1].toLowerCase()), week: Number(m[2]) });
    });
    if (!sections.length) throw new Error('no day sections found');
    const wanted = weekday(today);
    const sec = sections.find((s) => s.dow === wanted);
    if (!sec) return { menuDate: null, items: [] };
    const next = sections.find((s) => s.i > sec.i);
    let end = next ? next.i : lines.length;
    const stop = lines.findIndex((l, i) => i > sec.i && /^(kontakt|vi är kooperativet)$/i.test(l));
    if (stop > -1 && stop < end) end = stop;

    // Lines are: a category in capitals ("KÖTT", "VÄRLDEN (Burgaren går att få med haloumi)"),
    // sometimes with a dish name on the same line ("VEG ” Udon Ramen”"), then the dish.
    const items = [];
    let category = '';
    let title = '';
    const unquote = (s) => s.replace(/[”"“]/g, '').replace(/\s+/g, ' ').trim();
    for (const raw of lines.slice(sec.i + 1, end)) {
      const l = raw.trim();
      if (!l || /^[–-]$/.test(l)) continue;
      const withoutNote = l.replace(/\(.*?\)/g, '').trim();
      if (withoutNote && withoutNote === withoutNote.toUpperCase() && /[A-ZÅÄÖ]{3}/.test(withoutNote)) {
        category = clean(withoutNote); title = '';
        continue;
      }
      const lead = l.match(/^([A-ZÅÄÖ]{3,}(?: [A-ZÅÄÖ]{3,})?)\s+(.+)$/);
      if (lead && lead[1].length <= 14 && !/[a-zåäö]/.test(lead[1])) {
        category = lead[1];
        const rest = lead[2];
        // a short dish name followed by its description on the next line
        if (unquote(rest).split(' ').length <= 4) { title = unquote(rest); continue; }
        if (/^[”"“]/.test(rest)) {
          const q = rest.match(/^[”"“]([^”"“]+)[”"“]\s*(.*)$/);
          if (q) { pushDish(q[2] ? `${q[1].trim()} · ${q[2]}` : q[1]); continue; }
        }
        pushDish(rest);
        continue;
      }
      pushDish(title ? `${title} · ${l}` : l);
      title = '';
    }
    function pushDish(text) {
      if (/^SALLADER$/i.test(category)) return; // same salad every day
      const diet = VEG_WORDS.test(category) ? 'veg' : undefined;
      const label = category ? `${titleCase(category)}: ` : '';
      items.push({ text: clean(label + unquote(text)), diet });
    }
    return { menuDate: dateInWeek(today, sec.week, sec.dow), items };
  },

  // Bistrot: "Meny vecka 44", weekly dishes, then "Måndag" … "Fredag" with title + description pairs.
  bistrot(html, today) {
    const lines = htmlToLines(html);
    const start = lines.findIndex((l) => /^meny vecka\s*\d+/i.test(l));
    if (start < 0) throw new Error('week heading not found');
    const week = Number(lines[start].match(/\d+/)[0]);
    const dayIdx = {};
    lines.forEach((l, i) => {
      const k = DAYS_SV.indexOf(l.toLowerCase());
      if (i > start && k >= 1 && k <= 5 && !(k in dayIdx)) dayIdx[k] = i;
    });
    const wanted = weekday(today);
    const dow = dayIdx[wanted] != null ? wanted : null;
    if (dow == null) return { menuDate: null, items: [] };
    const firstDay = Math.min(...Object.values(dayIdx));
    const nextDays = Object.values(dayIdx).filter((i) => i > dayIdx[dow]);
    const stopAt = lines.findIndex((l, i) => i > dayIdx[dow] && /^(adress|x)$/i.test(l));
    const end = Math.min(...nextDays, stopAt > -1 ? stopAt : lines.length);

    const items = [];
    pairUp(lines.slice(dayIdx[dow] + 1, end)).forEach((t) => items.push({ text: t }));

    // Weekly dishes (shown above the days): "Veckans: …" and "Vegetarisk Mån-Tis: …"
    const weekly = lines.slice(start + 1, firstDay);
    for (let i = 0; i < weekly.length; i++) {
      const l = weekly[i];
      const vm = l.match(/^vegetarisk:?\s*([a-zåäö\-–]+)?\s*:?\s*(.*)$/i);
      if (/^veckans:/i.test(l)) {
        const desc = weekly[i + 1] && /–/.test(weekly[i + 1]) ? ` · ${weekly[i + 1]}` : '';
        items.push({ text: clean(l.replace(/^veckans:\s*/i, 'Veckans: ') + desc) });
      } else if (vm && appliesToday(vm[1], wanted)) {
        let dish = clean(vm[2] || '');
        let desc = '';
        if (!dish && weekly[i + 1]) { dish = weekly[i + 1]; if (weekly[i + 2] && /–/.test(weekly[i + 2])) desc = ` · ${weekly[i + 2]}`; }
        else if (weekly[i + 1] && /–/.test(weekly[i + 1])) desc = ` · ${weekly[i + 1]}`;
        items.push({ text: clean(`${dish}${desc}`), diet: 'veg' });
      }
    }
    return { menuDate: dateInWeek(today, week, dow), items };
  },

  // District One: "Vecka 44", then per day a dotted line, the day name, and pairs of
  // category ("Fisk", "Vegetarisk Poke bowl") + dish text ending with a full stop.
  districtone(html, today) {
    const lines = htmlToLines(html);
    const start = lines.findIndex((l) => /^vecka\s*\d+/i.test(l));
    if (start < 0) throw new Error('week heading not found');
    const week = Number(lines[start].match(/\d+/)[0]);
    const wanted = weekday(today);
    const dayAt = lines.findIndex((l, i) => i > start && l.toLowerCase() === DAYS_SV[wanted]);
    if (dayAt < 0) return { menuDate: null, items: [] };
    const items = [];
    let category = null;
    let dish = [];
    for (const l of lines.slice(dayAt + 1)) {
      if (/^\.{5,}$/.test(l) || DAYS_SV.includes(l.toLowerCase()) || /^(hem|lunch)$/i.test(l)) break;
      if (category === null) { category = l; continue; }
      dish.push(l.replace(/^-\s*/, ''));
      if (/[.!]$/.test(l)) {
        const text = clean(dish.join(' '));
        if (!/^sallad$/i.test(category)) { // same Caesar salad every day
          items.push({ text: `${category}: ${text}`, diet: VEG_WORDS.test(category) ? 'veg' : undefined });
        }
        category = null; dish = [];
      }
    }
    return { menuDate: dateInWeek(today, week, wanted), items };
  },

  // Cuckoo's Nest: "Vecka 44", then day names each followed by the dish, then "Veckans vegetariska".
  cuckoo(html, today) {
    const lines = htmlToLines(html);
    const start = lines.findIndex((l) => /^vecka\s*\d+/i.test(l));
    if (start < 0) throw new Error('week heading not found');
    const week = Number(lines[start].match(/\d+/)[0]);
    const englishAt = lines.findIndex((l, i) => i > start && /^week\s*\d+/i.test(l));
    const block = lines.slice(start + 1, englishAt > -1 ? englishAt : lines.length);
    const wanted = weekday(today);
    const items = [];
    for (let i = 0; i < block.length; i++) {
      const k = DAYS_SV.indexOf(block[i].toLowerCase());
      if (k === wanted && block[i + 1]) items.push({ text: clean(block[i + 1]) });
      if (/^veckans vegetariska$/i.test(block[i]) && block[i + 1]) items.push({ text: clean(block[i + 1]), diet: 'veg' });
    }
    if (!items.length) return { menuDate: null, items: [] };
    return { menuDate: dateInWeek(today, week, wanted), items };
  },
};

function appliesToday(range, dow) {
  if (!range) return true;
  const abbr = { mån: 1, tis: 2, ons: 3, tor: 4, tors: 4, fre: 5 };
  const parts = range.toLowerCase().split(/[-–]/).map((p) => abbr[p.trim()]).filter(Boolean);
  if (!parts.length) return true;
  const from = parts[0], to = parts[parts.length - 1];
  return dow >= from && dow <= to;
}

// "Fetaostbiff" + "Tzatziki – Ratatouille" → "Fetaostbiff · Tzatziki – Ratatouille"
function pairUp(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const next = lines[i + 1];
    if (next && !/–/.test(l) && /–/.test(next)) { out.push(clean(`${l} · ${next}`)); i++; }
    else out.push(clean(l));
  }
  return out;
}

function titleCase(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function parseJsonAt(s, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(s.slice(from, i + 1)); }
  }
  throw new Error('unterminated JSON');
}

// ---------- fetching ----------

async function getPage(place) {
  if (FIXTURES) return readFile(path.join(FIXTURES, `${place.id}.html`), 'utf8');
  const res = await fetch(place.url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.5' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ---------- main ----------

async function main() {
  const today = stockholmToday();
  const config = JSON.parse(await readFile(path.join(ROOT, 'places.json'), 'utf8'));
  const previous = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : { places: [] };
  const prevById = Object.fromEntries((previous.places || []).map((p) => [p.id, p]));
  const now = new Date().toISOString();
  let failures = 0;

  const places = [];
  for (const cfg of config.places) {
    const base = { id: cfg.id, name: cfg.name, url: cfg.url, lat: cfg.lat ?? null, lon: cfg.lon ?? null };
    if (cfg.kind === 'fixed') {
      places.push({ ...base, kind: 'fixed', veg: !!cfg.veg, note: cfg.note || '' });
      continue;
    }
    const prev = prevById[cfg.id];
    try {
      const html = await getPage(cfg);
      const { menuDate, items } = readers[cfg.reader](html, today);
      const cleanItems = items.filter((i) => i.text).map((i) => (i.diet ? { text: i.text, diet: i.diet } : { text: i.text }));
      // Only a real menu replaces what we have. If the site shows nothing for today
      // (not posted yet, or a redesign broke the reader), keep the last menu we had;
      // the page labels it with its own date ("From Thursday · may have changed").
      // Menus older than a week are dropped rather than shown.
      if (!cleanItems.length || !menuDate || menuDate < (prev && prev.menuDate || '') || daysBetween(menuDate, today) > 7) {
        const keep = prev && prev.items && prev.items.length && daysBetween(prev.menuDate, today) <= 7;
        places.push(keep ? { ...prev, ...base, note: cfg.note || '' } : { ...base, kind: 'daily', menuDate: null, readAt: null, items: [], note: cfg.note || '' });
        console.log(`${cfg.id}: nothing new for ${today}; ${keep ? `keeping the menu from ${prev.menuDate}` : 'no recent menu to keep'}`);
        continue;
      }
      const same = prev && prev.menuDate === menuDate && JSON.stringify(prev.items) === JSON.stringify(cleanItems);
      places.push({
        ...base,
        kind: 'daily',
        menuDate: cleanItems.length ? menuDate : null,
        readAt: same ? prev.readAt : now,
        items: cleanItems,
        note: cfg.note || '',
      });
      console.log(`${cfg.id}: ${cleanItems.length} dishes for ${menuDate || 'no date'}${same ? ' (unchanged)' : ''}`);
    } catch (err) {
      failures++;
      const keep = prev && prev.items && prev.items.length && daysBetween(prev.menuDate, today) <= 7;
      console.warn(`${cfg.id}: could not read (${err.message}); ${keep ? 'keeping the last menu we had' : 'no recent menu to keep'}`);
      places.push(keep ? { ...prev, ...base, note: cfg.note || '' } : { ...base, kind: 'daily', menuDate: null, readAt: null, items: [], note: cfg.note || '' });
    }
  }

  const output = { about: 'Written by scripts/read-menus.mjs. Menus come from each restaurant’s own website.', places };
  const text = JSON.stringify(output, null, 2) + '\n';
  const before = existsSync(OUT) ? await readFile(OUT, 'utf8') : '';
  if (text !== before) {
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, text);
    console.log('menus.json updated');
  } else {
    console.log('menus.json unchanged');
  }
  if (failures === config.places.filter((p) => p.kind !== 'fixed').length) {
    console.error('Every reader failed. Something is wrong beyond one site.');
    process.exitCode = 1;
  }
}

main();
