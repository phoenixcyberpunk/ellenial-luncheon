// Ellenial Lunch – "looks like pork" from a dish's name.
// Only clear pork words get the 🐷. Dishes that are often but not always pork (köttbullar,
// lasagne, korv, blandfärs…) are left unmarked on purpose: people who avoid pork know
// those dishes themselves (Ellen's decision, 4 Nov 2026). It is a guess from the words on
// the menu, never a promise, and never a halal claim.
(function (root) {
  'use strict';

  // Swedish words often sit inside longer words (sidfläsk, baconlindad, grisfilé), so most
  // patterns match anywhere in a word. Each pattern is one kind of pork.
  var PORK = [
    /fläsk/,                         // fläskfilé, sidfläsk, rimmat fläsk, fläskkarré, fläsklägg
    /gris(?!sini)/,                  // grisfilé, griskind, helgrillad gris (not grissini)
    /bacon/,                         // bacon, baconlindad
    /skink/,                         // skinka, skinkstek, parmaskinka, julskinka
    /kassler/,
    /revbensspjäll|spare ?ribs/,
    /isterband/,
    /flintastek/,
    /porchetta|prosciutto|pancetta|guanciale|mortadella|lardo\b|speck\b/,
    /salami|chorizo|salsiccia|n'?duja/,
    /carbonara/,
    /pulled pork|\bpork\b|\bham\b|\bjamón|\bjamon\b|serrano/,
    /carnitas|al pastor|tonkatsu|tonkotsu|chashu|char siu|lechón|chicharr/
  ];

  // A cut that's usually pork in Sweden but also comes from other animals:
  // only marked when no other animal is named right in front of it.
  var USUALLY_PORK = [/karré/, /kotlett/, /revben(?!sspjäll)/];
  var OTHER_ANIMAL = /(lamm|kalv|nöt|hjort|vilt|ren|älg|kalkon|kyckling)\s*$/;

  // Not pork even though a pork word appears: plant-based copies, other animals' bacon/ham,
  // and "without bacon".
  var NOT_PORK = /(vego|vegan(sk[at]?)?|vegetarisk[at]?|veggie|växtbaserad|soja|oumph|kalkon|kyckling|nöt|lax|anka)[\s-]*(bacon|skink|salami|chorizo|pulled pork)|utan (fläsk|bacon|skinka)/;

  function norm(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ');
  }

  function usuallyPorkHit(s) {
    for (var i = 0; i < USUALLY_PORK.length; i++) {
      var re = new RegExp(USUALLY_PORK[i].source, 'g');
      var m;
      while ((m = re.exec(s))) {
        if (!OTHER_ANIMAL.test(s.slice(0, m.index))) return true;
      }
    }
    return false;
  }

  // isVeg: the dish is already labelled vegetarian or vegan, so it is never marked.
  function looksLikePork(text, isVeg) {
    if (isVeg) return false;
    var s = norm(text);
    if (!s) return false;
    var cleaned = s.replace(new RegExp(NOT_PORK.source, 'g'), ' ');
    for (var i = 0; i < PORK.length; i++) if (PORK[i].test(cleaned)) return true;
    return usuallyPorkHit(cleaned);
  }

  var api = { looksLikePork: looksLikePork };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EllenialPork = api;
})(this);
