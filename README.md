# Ellenial Lunch

Every lunch menu near Lindholmen, Gothenburg, for today, on one screen. Compare everything at a glance and decide where to eat.

Live at [lunch.ellenial.app](https://lunch.ellenial.app). Colours and type follow the final Ellenial brand (1 Nov 2026): one palette for every Ellenial app, with Periwinkle for selected things, Fraunces for headings and DM Sans for text. Auto / Light / Dark uses the shared switch from [ellenial maps](https://github.com/phoenixcyberpunk/ellenial-maps) (`ellenial-theme.js`, copied unchanged).

Free, no ads, no tracking, no accounts. An [Ellenial](https://ellenial.app) tool, built by one person with help from Claude.

## How it works

- **`places.json`** lists the lunch places: name, website, location and how its menu is read.
- **`scripts/read-menus.mjs`** reads each place's menu from the restaurant's own website and writes **`data/menus.json`**. It has no dependencies (Node 20+).
- **`.github/workflows/read-menus.yml`** runs the reader on weekday mornings and saves the file when a menu changes.
- **`ellenial-theme.js`** is the shared Ellenial Auto / Light / Dark switch. The choice is saved on this phone only. Add `?theme=light` or `?theme=dark` to test a theme without saving it.
- **`scripts/check-contrast.mjs`** checks every colour pair against the accessibility rules (text 4.5:1, controls 3:1). Run it before shipping a colour change.
- **Lunch planner (choosing lunch together):** tap the heart on a card to put it on your shortlist. Tapping never moves cards: a bar lists the hearted places (tap a name to jump to it), and they come first the next time you open the page. On your own, the shortlist stays in this browser (localStorage, with today's date) and nothing is sent anywhere. **Ask friends** in the bar makes a one-day link (Share, Copy, QR code). Everyone who opens it adds a first name and hearts places; each heart shows how many people picked it and the bar says who, live. Anyone can tap **We're going here** on a hearted place, and anyone can change it (the newest pick wins). There's also **Not joining today** and **Leave this lunch**, and after midnight the link says the lunch has ended.
- **How the planner keeps things private:** `planner-store.js` and `supabase/migrations/20261103140000_luncheon_planner.sql`. A lunch's secret lives only in the link after `#` (which browsers never send to a server) and is removed from the address bar once read. The phone turns it into an encryption key (never sent anywhere) and an access token (the server keeps only its SHA-256). Each phone saves one encrypted answer (first name, hearts, not joining, pick). The server, a separate `luncheon` section in the same Supabase project as Split, sees only random ids, scrambled text and times; a lunch belongs to one day and is deleted after midnight. Same design as [Ellenial Split](https://github.com/phoenixcyberpunk/ellenial-split). `vendor/supabase.js` is supabase-js 2.105.0 and `vendor/qrcode.js` is qrcode-generator 1.4.4 (both MIT), copied unchanged so nothing loads from other sites. Test with two phones: `node tests/planner-two-phones.mjs B & node tests/planner-two-phones.mjs A` (needs to reach Supabase).
- **Menu pictures:** for places that only publish their menu as a picture, `menuImage` in `places.json` points at it. The reader saves a copy in **`data/menu-images/`** (JPEG, PNG or WebP, at most 3 MB, only rewritten when it changes) and the card shows a small preview that opens full size, with the date their server says it last changed and a link to the original.
- **`index.html`**, **`app.js`** and **`styles.css`** are the page. It reads `data/menus.json` and shows every place's menu for today.

### Being honest about freshness

Every menu carries a label, so an old menu never looks like today's:

| Label | Meaning |
| --- | --- |
| Updated 09:02 | Today's menu, read this morning |
| From Wednesday · may have changed | The site still shows an earlier day's menu, or couldn't be read today |
| No menu found today | Nothing readable; the restaurant's own page may have it |
| Lavender card | A fixed menu that's the same every day (also says so in words) |

### Weekends and new weeks

At weekends, and on a Monday morning before the new menus are read, the page keeps showing the latest menus (each still labelled "From Friday · may have changed") under a banner: "Menus for week 45 aren't out yet". The week number is always shown at the top. Menus older than a week are dropped by the reader.

### Accessibility

Double-tap zoom is off (it fired by accident while scrolling); pinch-to-zoom still works. Every card ends with links to the place's lunch page and to its spot on OpenStreetMap.

Nothing rests on colour alone: freshness is always written out (and stale menus get a clock icon), selected filters get a tick, and fixed or missing menus say so in words. Text is at least 4.5:1 and anything you can tap has an edge of at least 3:1, in both themes.

### Privacy

The page sets no cookies and has no ads, tracking or accounts. Fonts and menu pictures are served from this site, so no third party sees visitors. Walking times are counted from Lindholmen Science Park, not from your location.

The page counts how many phones open it each day, for the maker's own statistics. Your phone remembers that it was already counted today; the server only receives an empty "+1" (no id, no IP kept, no cookie) and stores one number per day. Previews and test copies of the site are never counted. See `visit-counter.js` and `supabase/migrations/20261104120000_luncheon_visit_counter.sql`.

### The 🐷 mark

Dishes whose name clearly says pork (fläsk, bacon, skinka, kassler…) get a 🐷, and the "No pork" filter hides them. It is a guess from the menu's words, not a promise: dishes that are often but not always pork (köttbullar, lasagne, korv) are left unmarked, and the site never says whether food is halal. See `pork.js`; `node tests/pork.mjs` runs its checks.

- **On your own**, nothing about you leaves your phone. Your shortlist stays in your own browser and is forgotten at midnight.
- **When you plan a lunch with friends**, your first name, hearts, pick and whether you're joining are stored on our server (Supabase, in Stockholm) so the others can see them. They're encrypted on your phone first, with a key that's only in the link, so the server can't read them; it sees random ids, scrambled text and when it was saved. Anyone you give the link to can read and join the lunch. The whole lunch is deleted after midnight, and you can use any name you like.
- To keep the link working when you reopen the page, your phone remembers today's lunch, your first name and your answer's id in its own storage. Leaving the lunch forgets it.

## Places

| Place | How the menu is read |
| --- | --- |
| Uni3 World of Food | Weekly menu data embedded in the Compass Group page |
| Kooperativet | Weekly text with a section per day |
| Bistrot | Weekly text with a section per day |
| Cuckoo's Nest | Weekly text with a line per day |
| District One | Weekly text with a section per day |
| Pier 11 | Weekly English text with a section per day; today is marked "Idag". A dish is vegetarian when its allergen line names no meat or fish |
| Masala Kitchen | Four rotating weekly menus typed into `data/masala-menus.json`; the reader picks this week's from the lunch page's "Veckans Meny" tab |
| BISTRO 3, Brunchoteket | Fixed menu, entered by hand, plus their menu picture (saved each morning, shown as a preview) |
| Oishii, Miss F, Alkemisten, Dunder Döner, BENNE Pastabar, Gansu Köket, Smash-N-Go, Shiro, Karla Bakeshop, Pizza di Ciro, Bar Schiacciate, Kapten Nemos, Picadeli Lindholmen, Restaurang Äran, L's Kitchen, Ha Long Bay, Lindholmens Pizzeria, Sushi Yama, Subway, Lindholmens Kebab, Holy Greens, Esters Salutorg, Café Norra Älvstranden, TacO's | Fixed menu, entered by hand |
| Mimolett | Fixed menu, entered by hand. Its own site is gone, so the link goes to its Menydags page, which shows the same 129 kr list every day |
| Bombay Bistro | Four-week rotation, but the site doesn't say which week is current, so shown as a fixed menu for now |

Matminnen closed in June 2026. Lindholmens Kebab has no website, so its card links to foodora. Café Norra Älvstranden publishes nothing online.

If Masala Kitchen changes its menus, its images get new file names; the four menus in `data/masala-menus.json` then need typing in again.

## Adding a place

1. Add it to `places.json` with its website, coordinates from OpenStreetMap, and its lunch `price` as the place states it (`"139 kr"`, `"105–135 kr"`, `"From 100 kr"`) plus `includes` (what comes with it). Leave `price` out if their site doesn't say; the card then reads "Price not on their site".
2. If its menu changes, add a reader function to `scripts/read-menus.mjs` and name it in `reader`. If it's the same every day, use `"kind": "fixed"` and write a short `note` instead.
3. Test against a saved copy of the page:

   ```sh
   mkdir fixtures && curl -sL https://example.se/lunch -o fixtures/<place id>.html
   LUNCHEON_FIXTURES=fixtures LUNCHEON_TODAY=2026-10-29 node scripts/read-menus.mjs
   ```

## Run it locally

```sh
node scripts/read-menus.mjs   # fetch today's menus
python3 -m http.server        # then open http://localhost:8000
```

## Respecting the restaurants

The reader fetches each page a few times per weekday morning, identifies itself, and links back to the restaurant. If a restaurant would rather not be included, or wants to post its menu directly, it can open an issue and we'll sort it out.

## Credits

- [supabase-js](https://github.com/supabase/supabase-js) (MIT), for the Lunch planner.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT), for the QR code on lunch links. QR Code is a registered trademark of DENSO WAVE INCORPORATED.

- [Fraunces](https://github.com/undercasetype/Fraunces) by Undercase Type and [DM Sans](https://github.com/googlefonts/dm-fonts) by Colophon Foundry, both under the SIL Open Font License, via [Fontsource](https://fontsource.org).
- Locations from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## Licence

The code is AGPL-3.0, the same as [ellenial.app](https://github.com/phoenixcyberpunk/ellenial). See `LICENSE`. Two outside libraries are included, both under the MIT License: `vendor/supabase.js` is [supabase-js](https://github.com/supabase/supabase-js), © 2020 Supabase (full text in `vendor/supabase-js.LICENSE`), and `vendor/qrcode.js` is [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), © 2009 Kazuhiko Arase (full text in `vendor/qrcode-generator.LICENSE`). MIT code can be used inside an AGPL project as long as its notice stays with it. The menus themselves belong to each restaurant; Ellenial Lunch only shows them with a link back.

The Ellenial name and logo aren't covered by the code licence, see [TRADEMARK.md](TRADEMARK.md).
