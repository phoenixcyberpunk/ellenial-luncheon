/*
  Ellenial Lunch – Lunch planner store (step 2). Plain script, no build step.
  Talks to the `luncheon` section of Gillefeeling's Supabase project through three
  functions (lunch_create, lunch_get, lunch_put_answer). Needs vendor/supabase.js first.

  How the privacy works (same design as Ellenial Split):
  - A lunch has one random 256-bit secret, made on the phone with Web Crypto. It travels only
    in the link after '#', which browsers never send to a server.
  - From it, HKDF derives (a) an AES-GCM key that never leaves the phone and (b) an access
    token sent with every call; the server keeps only the token's SHA-256.
  - Each phone writes ONE answer: a random id + one encrypted blob holding its first name,
    hearted places, "not joining" and its pick. Blobs are bound to their lunch and answer id
    (AES-GCM additional data), so a blob copied elsewhere fails to decrypt, and padded to size
    buckets so their length gives nothing away.
  - The server sees ids, blobs and times. A lunch belongs to one day and is deleted after midnight.

  Link format: https://lunch.ellenial.app/#lunch=<lunch id>.<secret>
*/
(function (root) {
  'use strict';

  var CONFIG = {
    // Public by design: this key only lets callers use the lunch_* (and Split's split_*)
    // functions, and those only work with a lunch's link.
    url: 'https://knvrvmqdxvcatsrvkrgx.supabase.co',
    key: 'sb_publishable_5e3mg1E-r-P_to34ONwRfw_FQYUwy3z',
    shareOrigin: 'https://lunch.ellenial.app'
  };

  var FORMAT = '2.';
  var IV_BYTES = 12;
  var BUCKETS = [64, 256, 1024];
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // ---------- encoding ----------
  function toB64u(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64u(s) {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
    try {
      var bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }
  function newId() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    var b = root.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function newSecret() { return toB64u(root.crypto.getRandomValues(new Uint8Array(32))); }

  // ---------- keys ----------
  // Derives the access token and the encryption key from a lunch's secret.
  function lunchKeys(lunchId, secret) {
    var raw = fromB64u(secret);
    if (!raw || raw.length !== 32) return Promise.reject(err('bad_link'));
    var subtle = root.crypto.subtle;
    var salt = enc.encode('el1|' + lunchId);
    return subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']).then(function (base) {
      return Promise.all([
        subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: enc.encode('el1|lunch-token') }, base, 256),
        subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: enc.encode('el1|lunch-enc') }, base,
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      ]);
    }).then(function (r) {
      return { id: lunchId, secret: secret, token: toB64u(new Uint8Array(r[0])), encKey: r[1] };
    });
  }

  // ---------- encryption ----------
  function pad(bytes) {
    var size = BUCKETS.filter(function (b) { return bytes.length < b; })[0];
    if (!size) throw err('too_big');
    var out = new Uint8Array(size);
    out.set(bytes);
    out[bytes.length] = 0x80; // one 0x80, then zeros
    return out;
  }
  function unpad(bytes) {
    var i = bytes.length - 1;
    while (i >= 0 && bytes[i] === 0) i--;
    return i >= 0 && bytes[i] === 0x80 ? bytes.slice(0, i) : null;
  }
  function aad(lunchId, answerId) { return enc.encode('el1|answer|' + lunchId + '|' + answerId); }

  function encryptAnswer(lunch, answerId, data) {
    var iv = root.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    var plain = pad(enc.encode(JSON.stringify(cleanAnswer(data))));
    return root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad(lunch.id, answerId) }, lunch.encKey, plain)
      .then(function (ct) {
        ct = new Uint8Array(ct);
        var out = new Uint8Array(iv.length + ct.length);
        out.set(iv); out.set(ct, iv.length);
        return FORMAT + toB64u(out);
      });
  }
  // Resolves to the answer, or null if it can't be read (wrong key, tampered, garbage).
  function decryptAnswer(lunch, answerId, blob) {
    if (typeof blob !== 'string' || blob.indexOf(FORMAT) !== 0) return Promise.resolve(null);
    var bytes = fromB64u(blob.slice(FORMAT.length));
    if (!bytes || bytes.length <= IV_BYTES) return Promise.resolve(null);
    return root.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: aad(lunch.id, answerId) },
      lunch.encKey, bytes.slice(IV_BYTES)
    ).then(function (plain) {
      var u = unpad(new Uint8Array(plain));
      return u ? cleanAnswer(JSON.parse(dec.decode(u))) : null;
    }).catch(function () { return null; });
  }

  // What an answer may hold. Anything else is dropped, so a friend's phone can't send
  // something odd that breaks yours.
  //   { name: "Ellen", hearts: ["masala", "pier11"], out: false, pick: "pier11" | null, pickAt: 1762171200000, host: true }
  // pickAt is when this person last picked (or undid a pick); the newest pick in the lunch wins.
  function cleanAnswer(a) {
    a = a && typeof a === 'object' ? a : {};
    var hearts = Array.isArray(a.hearts) ? a.hearts.filter(function (h) {
      return typeof h === 'string' && /^[a-z0-9-]{1,40}$/.test(h);
    }).slice(0, 30) : [];
    return {
      name: typeof a.name === 'string' ? a.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
      hearts: hearts.filter(function (h, i) { return hearts.indexOf(h) === i; }),
      out: a.out === true,
      pick: typeof a.pick === 'string' && /^[a-z0-9-]{1,40}$/.test(a.pick) ? a.pick : null,
      pickAt: typeof a.pickAt === 'number' && isFinite(a.pickAt) && a.pickAt > 0 ? Math.floor(a.pickAt) : 0,
      host: a.host === true
    };
  }

  // ---------- server ----------
  var client = null;
  function db() {
    if (!client) {
      if (!root.supabase || !root.supabase.createClient) throw err('offline');
      // No accounts: sessions are never stored; only the lunch_* functions are called.
      client = root.supabase.createClient(CONFIG.url, CONFIG.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    return client;
  }
  function err(code) { var e = new Error(code); e.code = code; return e; }
  function call(fn, args) {
    return db().rpc(fn, args).then(function (r) {
      if (r.error) {
        var m = String(r.error.message || '');
        var known = ['lunch_not_found', 'lunch_ended', 'lunch_full', 'edit_conflict', 'rate_limited', 'bad_request']
          .filter(function (k) { return m.indexOf(k) !== -1; })[0];
        throw err(known || 'offline');
      }
      return r.data;
    }, function () { throw err('offline'); });
  }

  // ---------- links ----------
  function makeLink(lunch) {
    var host = root.location && root.location.hostname;
    // Real address for real use; previews (*.vercel.app, behind the team's login) and local
    // testing keep their own address so a test lunch opens on the same build.
    var origin = host && (host === 'localhost' || host === '127.0.0.1' || /\.ellenial\.app$/.test(host) || /\.vercel\.app$/.test(host))
      ? root.location.origin : CONFIG.shareOrigin;
    return origin + '/#lunch=' + lunch.id + '.' + lunch.secret;
  }
  function parseLink(hash) {
    var m = /(?:^|[#&])lunch=([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})(?:&|$)/.exec(hash || '');
    return m && UUID.test(m[1]) ? { id: m[1], secret: m[2] } : null;
  }

  // This phone's answer id for a lunch, kept so you can change your hearts later.
  function myAnswerId(lunchId) {
    var k = 'luncheon.answer.' + lunchId;
    try {
      var saved = root.localStorage.getItem(k);
      if (saved && UUID.test(saved)) return saved;
      var id = newId();
      root.localStorage.setItem(k, id);
      return id;
    } catch (e) { return newId(); }
  }

  // ---------- the API the page uses ----------
  var LunchPlanner = {
    // Starts a new lunch for today. Resolves to a lunch handle ({ id, secret, token, encKey, day }).
    create: function () {
      var id = newId(), secret = newSecret();
      return lunchKeys(id, secret).then(function (lunch) {
        return call('lunch_create', { p_lunch: id, p_token: lunch.token }).then(function (day) {
          lunch.day = day;
          return lunch;
        });
      });
    },
    // Opens a lunch from its link parts.
    open: function (id, secret) {
      if (!UUID.test(id || '')) return Promise.reject(err('bad_link'));
      return lunchKeys(id, secret);
    },
    // Reads every answer and unscrambles it on this phone. Unreadable answers are left out.
    load: function (lunch) {
      return call('lunch_get', { p_lunch: lunch.id, p_token: lunch.token }).then(function (d) {
        var rows = (d && d.answers) || [];
        return Promise.all(rows.map(function (a) {
          return decryptAnswer(lunch, a.id, a.data_enc).then(function (data) {
            return data && { id: a.id, revision: a.revision, updatedAt: a.updated_at, data: data };
          });
        })).then(function (answers) {
          return { day: d.day, answers: answers.filter(Boolean) };
        });
      });
    },
    // Saves this phone's answer. expectedRevision: null for a new answer, else the revision you
    // last read. Resolves to the new revision; rejects with code 'edit_conflict' if it changed.
    save: function (lunch, answerId, data, expectedRevision) {
      return encryptAnswer(lunch, answerId, data).then(function (blob) {
        return call('lunch_put_answer', {
          p_lunch: lunch.id, p_token: lunch.token, p_id: answerId, p_data_enc: blob,
          p_expected_revision: expectedRevision == null ? null : expectedRevision
        });
      });
    },
    // Calls onChange whenever someone saves. Returns a function that stops listening.
    // Safety net (as in Split): the live channel can take a moment to wake up after being
    // idle, so we also check every 30 s and whenever the page becomes visible again.
    watch: function (lunch, onChange, onStatus) {
      var channel = db()
        .channel('lunch:' + lunch.id, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'changed' }, function () { onChange(); })
        .subscribe(function (status) { if (onStatus) onStatus(status === 'SUBSCRIBED'); });
      var timer = setInterval(function () { onChange(); }, 30000);
      var doc = root.document;
      function onVisible() { if (doc.visibilityState === 'visible') onChange(); }
      if (doc) doc.addEventListener('visibilitychange', onVisible);
      return function () {
        clearInterval(timer);
        if (doc) doc.removeEventListener('visibilitychange', onVisible);
        db().removeChannel(channel);
      };
    },
    makeLink: makeLink,
    parseLink: parseLink,
    myAnswerId: myAnswerId,
    // exposed for tests
    _encryptAnswer: encryptAnswer,
    _decryptAnswer: decryptAnswer,
    _cleanAnswer: cleanAnswer
  };

  root.LunchPlanner = LunchPlanner;
})(typeof window !== 'undefined' ? window : globalThis);
