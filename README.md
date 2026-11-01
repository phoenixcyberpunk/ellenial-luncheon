# Ellenial Luncheon

Every lunch menu near Lindholmen, Gothenburg, for today, on one screen. Compare everything at a glance and decide where to eat.

Live at [lunch.ellenial.app](https://lunch.ellenial.app). Colours and type follow the final Ellenial brand (1 Nov 2026): one palette for every Ellenial app, with Periwinkle for selected things, Fraunces for headings and DM Sans for text. Auto / Light / Dark uses the shared switch from [ellenial maps](https://github.com/phoenixcyberpunk/ellenial-maps) (`ellenial-theme.js`, copied unchanged).

Free, no ads, no tracking, no accounts. An [Ellenial](https://ellenial.app) tool, built by one person with help from Claude.

## How it works

- **`places.json`** lists the lunch places: name, website, location and how its menu is read.
- **`scripts/read-menus.mjs`** reads each place's menu from the restaurant's own website and writes **`data/menus.json`**. It has no dependencies (Node 20+).
- **`.github/workflows/read-menus.yml`** runs the reader on weekday mornings and saves the file when a menu changes.
- **`ellenial-theme.js`** is the shared Ellenial Auto / Light / Dark switch. The choice is saved on this phone only. Add `?theme=light` or `?theme=dark` to test a theme without saving it.
- **`scripts/check-contrast.mjs`** checks every colour pair against the accessibility rules (text 4.5:1, controls 3:1). Run it before shipping a colour change.
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

The page sets no cookies and sends nothing about you anywhere. Fonts are served from this site, so no third party sees visitors. Walking times are counted from Lindholmen Science Park, not from your location.

## Places

| Place | How the menu is read |
| --- | --- |
| Uni3 World of Food | Weekly menu data embedded in the Compass Group page |
| Kooperativet | Weekly text with a section per day |
| Bistrot | Weekly text with a section per day |
| Cuckoo's Nest | Weekly text with a line per day |
| District One | Weekly text with a section per day |
| Masala Kitchen | Four rotating weekly menus typed into `data/masala-menus.json`; the reader picks this week's from the lunch page's "Veckans Meny" tab |
| Oishii, Miss F, Alkemisten, BISTRO 3 | Fixed menu, entered by hand |
| Bombay Bistro | Four-week rotation, but the site doesn't say which week is current, so shown as a fixed menu for now |

Matminnen closed in June 2026.

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

- [Fraunces](https://github.com/undercasetype/Fraunces) by Undercase Type and [DM Sans](https://github.com/googlefonts/dm-fonts) by Colophon Foundry, both under the SIL Open Font License, via [Fontsource](https://fontsource.org).
- Locations from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## Licence

The code is AGPL-3.0, the same as [ellenial.app](https://github.com/phoenixcyberpunk/ellenial). See `LICENSE`. The menus themselves belong to each restaurant; Luncheon only shows them with a link back.
