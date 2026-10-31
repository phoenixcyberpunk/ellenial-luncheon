# Ellenial Luncheon

Every lunch menu near Lindholmen, Gothenburg, for today, on one screen. Compare everything at a glance and decide where to eat.

Live at [lunch.ellenial.app](https://lunch.ellenial.app). Colours and type follow [Gillefeeling](https://github.com/phoenixcyberpunk/gillefeeling), so the Ellenial apps look like one family.

Free, no ads, no tracking, no accounts. An [Ellenial](https://ellenial.app) tool, built by one person with help from Claude.

## How it works

- **`places.json`** lists the lunch places: name, website, location and how its menu is read.
- **`scripts/read-menus.mjs`** reads each place's menu from the restaurant's own website and writes **`data/menus.json`**. It has no dependencies (Node 20+).
- **`.github/workflows/read-menus.yml`** runs the reader on weekday mornings and saves the file when a menu changes.
- **`index.html`**, **`app.js`** and **`styles.css`** are the page. It reads `data/menus.json` and shows every place's menu for today.

### Being honest about freshness

Every menu carries a label, so an old menu never looks like today's:

| Label | Meaning |
| --- | --- |
| Updated 09:02 | Today's menu, read this morning |
| From Wednesday · may have changed | The site still shows an earlier day's menu, or couldn't be read today |
| No menu found today | Nothing readable; the restaurant's own page may have it |
| Grey card | A fixed menu that's the same every day |

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

1. Add it to `places.json` with its website and coordinates from OpenStreetMap.
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

- [Fraunces](https://github.com/undercasetype/Fraunces) by Undercase Type and [Instrument Sans](https://github.com/Instrument/instrument-sans) by Instrument, both under the SIL Open Font License, via [Fontsource](https://fontsource.org).
- Locations from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## Licence

The code is AGPL-3.0, the same as [ellenial.app](https://github.com/phoenixcyberpunk/ellenial). See `LICENSE`. The menus themselves belong to each restaurant; Luncheon only shows them with a link back.
