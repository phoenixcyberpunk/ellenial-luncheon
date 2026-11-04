// Tests the 🐷 guess. Run: node tests/pork.mjs   (add --scan to list today's hits)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { looksLikePork } = require('../pork.js');

const pork = [
  'Stekt fläsk med löksås och potatis',
  'Sidfläsk med raggmunk och lingon',
  'Fläskfilé med pepparsås',
  'Grisfilé, rostade rotfrukter',
  'Helgrillad gris med äppelchutney',
  'Baconlindad kycklingfilé',
  'Pasta carbonara',
  'Skinkstek med potatisgratäng',
  'Pizza med parmaskinka och ruccola',
  'Kassler med senapssås',
  'Revbensspjäll med coleslaw',
  'BBQ spare ribs',
  'Isterband med dillstuvad potatis',
  'Pulled pork burger',
  'Tonkotsu ramen',
  'Chorizo- och bönsoppa',
  'Pizza salami',
  'Grillad kotlett med rödvinssås',
  'Fläskkarré med äpplen',
  'Porchetta med salsa verde',
  'Pasta med salsiccia',
  'Karré med rotfruktsgratäng',
];
const notPork = [
  'Köttbullar med gräddsås och lingon',   // blandfärs: left to the reader (Ellen, 4 Nov)
  'Lasagne',
  'Falukorv med makaroner',                // korv: left to the reader
  'Pannbiff med lök',
  'Lammkotlett med rosmarin',
  'Kalvkarré med svampsås',
  'Lammkarré, potatis',
  'Grissini och oliver',
  'Kycklingbacon på sallad',
  'Kalkonskinka, ost och sallad',
  'Vegansk pulled pork på havre',
  'Oumph chorizo tacos',
  'Laxfilé med hollandaise',
  'Kycklinglårfilé med piri piri',
  'Hamburgare med pommes',
  'Graham-kex',
  'Nötrevben med BBQ-sås',
  'Caesarsallad utan bacon',
  'Speckkl', // not a word, no match on 'speck' inside it
];

let fail = 0;
for (const t of pork) if (!looksLikePork(t)) { fail++; console.log('MISSED pork:   ', t); }
for (const t of notPork) if (looksLikePork(t)) { fail++; console.log('WRONGLY pork:  ', t); }
// The app passes isVeg = true for dishes it labels Veg 🥦 / Vegan 🌱; those never get a pig.
for (const t of ['Fläskfilé', 'Vegobacon i carbonara-stil vegansk pasta']) {
  if (looksLikePork(t, true)) { fail++; console.log('A veg-labelled dish got a pig:', t); }
}
const total = pork.length + notPork.length + 2;
console.log(`${total - fail}/${total} cases right`);

if (process.argv.includes('--scan')) {
  const data = JSON.parse(fs.readFileSync(new URL('../data/menus.json', import.meta.url)));
  const hits = [], all = [];
  for (const p of data.places || []) for (const it of p.items || []) {
    all.push(it.text);
    const veg = it.diet === 'veg' || it.diet === 'vegan';
    if (looksLikePork(it.text, veg)) hits.push(`${p.name}: ${it.text}`);
  }
  console.log(`\n${hits.length} of ${all.length} dishes on today's menus get a 🐷:`);
  hits.forEach((h) => console.log('  🐷', h));
}
process.exit(fail ? 1 : 0);
