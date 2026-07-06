/* Local-storage data layer for the web build.
 * Keep this API identical to miniprogram/utils/store.js. */
(function () {
  var KEY_T = "tc.tournaments";
  var KEY_B = "tc.battlelogs";

  // ── storage health check ──────────────────────────────────────────────────
  // Returns true if localStorage is writable (false in iOS Private Mode, some
  // WebViews, or when the user has blocked site data).
  function checkStorage() {
    try {
      localStorage.setItem("_tc_probe", "1");
      var ok = localStorage.getItem("_tc_probe") === "1";
      localStorage.removeItem("_tc_probe");
      return ok;
    } catch (e) { return false; }
  }
  var STORAGE_OK = checkStorage();

  function read(key) {
    if (!STORAGE_OK) return [];
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }
  function write(key, val) {
    if (!STORAGE_OK) return;
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) {
      // QuotaExceededError or SecurityError – mark storage as broken
      STORAGE_OK = false;
      if (window._onStorageFail) window._onStorageFail();
    }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---- Tournaments ----
  // Always newest-date-first, regardless of creation/import order — addTournament
  // just unshifts (newest-CREATED first), which drifts from date order the moment
  // tournaments are added out of chronological order or restored from a backup.
  function loadTournaments() {
    return read(KEY_T).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    }).map(function (t) {
      // Tournaments created before region mode existed have no region field —
      // they were all 简中 (zh) by definition, so default at read-time
      // rather than rewriting every stored record.
      if (!t.region) t.region = "zh";
      return t;
    });
  }
  function saveTournaments(list) { write(KEY_T, list); }
  function getTournament(id) { return loadTournaments().filter(function (t) { return t.id === id; })[0]; }

  function addTournament(data) {
    var list = loadTournaments();
    var t = {
      id: uid(),
      name: data.name || "Untitled",
      date: data.date || new Date().toISOString().slice(0, 10),
      category: data.category || "",
      format: data.format || "",
      placement: data.placement || "",
      deck: data.deck || [],
      decklist: data.decklist || [],
      region: data.region || "zh",
      rounds: []
    };
    list.unshift(t);
    saveTournaments(list);
    return t;
  }

  function updateTournament(id, patch) {
    var list = loadTournaments();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { Object.assign(list[i], patch); break; }
    }
    saveTournaments(list);
  }

  function deleteTournament(id) {
    saveTournaments(loadTournaments().filter(function (t) { return t.id !== id; }));
  }

  function addRound(tid, round) {
    var list = loadTournaments();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === tid) {
        round.id = uid();
        round.number = list[i].rounds.length + 1;
        list[i].rounds.push(round);
        break;
      }
    }
    saveTournaments(list);
  }

  function deleteRound(tid, rid) {
    var list = loadTournaments();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === tid) {
        list[i].rounds = list[i].rounds.filter(function (r) { return r.id !== rid; });
        list[i].rounds.forEach(function (r, idx) { r.number = idx + 1; });
        break;
      }
    }
    saveTournaments(list);
  }

  function updateRound(tid, rid, patch) {
    var list = loadTournaments();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === tid) {
        for (var j = 0; j < list[i].rounds.length; j++) {
          if (list[i].rounds[j].id === rid) { Object.assign(list[i].rounds[j], patch); break; }
        }
        break;
      }
    }
    saveTournaments(list);
  }

  // ---- Battle logs ----
  function loadLogs() { return read(KEY_B); }
  function saveLogs(list) { write(KEY_B, list); }
  function addLog(data) {
    var list = loadLogs();
    list.unshift({
      id: uid(),
      date: data.date || new Date().toISOString().slice(0, 10),
      deck: data.deck || [],
      opponentDeck: data.opponentDeck || [],
      result: data.result || "W",
      note: data.note || ""
    });
    saveLogs(list);
  }
  function deleteLog(id) {
    saveLogs(loadLogs().filter(function (l) { return l.id !== id; }));
  }

  // ---- Derived ----
  // A round counts as a Win if result==="W" or special is BYE/NO_SHOW.
  // DOUBLE_LOSS (both players out of time, nobody wins — 简中 rule) counts
  // as a loss, same bucket as a normal L. ID counts as neither. Ties (T,
  // international Bo3 only) get their own bucket. Returns {w, l, t, label}.
  // label stays "W-L" (no "-0" tie suffix) unless a tie has actually
  // happened, so 简中 records render byte-identical to before ties existed.
  function computeRecord(rounds) {
    var w = 0, l = 0, ties = 0;
    (rounds || []).forEach(function (r) {
      if (r.special === "ID") return;
      if (r.special === "BYE" || r.special === "NO_SHOW") { w++; return; }
      if (r.special === "DOUBLE_LOSS") { l++; return; }
      if (r.result === "W") w++;
      else if (r.result === "L") l++;
      else if (r.result === "T") ties++;
    });
    return { w: w, l: l, t: ties, label: w + "-" + l + (ties ? "-" + ties : "") };
  }

  // outcome of a single round: "W", "L", "T", or null (uncounted)
  function roundOutcome(r) {
    if (r.special === "BYE" || r.special === "NO_SHOW") return "W";
    if (r.special === "DOUBLE_LOSS") return "L";
    if (r.special === "ID") return null;
    if (r.result === "W") return "W";
    if (r.result === "L") return "L";
    if (r.result === "T") return "T";
    return null;
  }
  function deckKey(ids) { return (ids || []).slice().sort(function (a, b) { return a - b; }).join("-"); }

  // Aggregate win-rate + per-deck + matchup stats across all tournaments.
  // format: optional — when given, only tournaments with that exact format
  // are included (Standard rotates, so all-time stats mix formats that
  // aren't really comparable to each other).
  // region: optional — when given, only tournaments with that region are
  // included, so a 简中 record never blends into an International one and
  // vice versa (the two use different category/best-of systems entirely).
  function computeStats(format, region) {
    var ts = loadTournaments();
    if (format) ts = ts.filter(function (t) { return t.format === format; });
    if (region) ts = ts.filter(function (t) { return t.region === region; });
    var s = {
      tournaments: ts.length, wins: 0, losses: 0, ties: 0,
      firstWins: 0, firstLosses: 0, secondWins: 0, secondLosses: 0,
      decks: [], matchups: []
    };
    var decks = {}, matchups = {};
    function bucket(map, key, ids) {
      if (!map[key]) map[key] = { key: key, ids: ids, w: 0, l: 0, t: 0, tagCounts: {} };
      return map[key];
    }

    ts.forEach(function (t) {
      var myKey = deckKey(t.deck);
      (t.rounds || []).forEach(function (r) {
        var o = roundOutcome(r);
        if (!o) return;
        if (o === "W") s.wins++; else if (o === "L") s.losses++; else s.ties++;
        // my deck
        if (t.deck && t.deck.length) {
          var db = bucket(decks, myKey, t.deck);
          if (o === "W") db.w++; else if (o === "L") db.l++; else db.t++;
          // loss-reason tags are only ever set on a loss — tally them per
          // deck so "我的卡组表现" can show what tends to go wrong with
          // THIS deck specifically, not just overall win rate.
          if (o === "L" && r.tags && r.tags.length) {
            r.tags.forEach(function (tag) { db.tagCounts[tag] = (db.tagCounts[tag] || 0) + 1; });
          }
        }
        // matchup (needs an opponent deck)
        if (r.opponentDeck && r.opponentDeck.length) {
          var mb = bucket(matchups, deckKey(r.opponentDeck), r.opponentDeck);
          if (o === "W") mb.w++; else if (o === "L") mb.l++; else mb.t++;
        }
        // play order (ties aren't attributed to either side of this split)
        if (o !== "T") {
          if (r.wentFirst === true) { if (o === "W") s.firstWins++; else s.firstLosses++; }
          else if (r.wentFirst === false) { if (o === "W") s.secondWins++; else s.secondLosses++; }
        }
      });
    });

    // winRate is computed over decisive games only — a tie isn't a win or
    // a loss, so it's excluded from the rate but still counted in `games`.
    function finish(map) {
      return Object.keys(map).map(function (k) {
        var b = map[k]; b.games = b.w + b.l + b.t;
        var decisive = b.w + b.l;
        b.winRate = decisive ? Math.round(b.w / decisive * 100) : 0;
        return b;
      }).sort(function (a, b) { return b.games - a.games || b.winRate - a.winRate; });
    }
    s.decks = finish(decks);
    s.matchups = finish(matchups);
    s.games = s.wins + s.losses + s.ties;
    var decisiveGames = s.wins + s.losses;
    s.winRate = decisiveGames ? Math.round(s.wins / decisiveGames * 100) : 0;
    return s;
  }

  // Most-picked Pokémon across every tournament (my deck + every round's
  // opponent deck), most frequent first. Powers the picker's "常用" quick-pick
  // row so users don't have to type a name for decks they see all the time.
  function frequentPokemonIds(limit) {
    var counts = {};
    loadTournaments().forEach(function (t) {
      (t.deck || []).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      (t.rounds || []).forEach(function (r) {
        (r.opponentDeck || []).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      });
    });
    return Object.keys(counts)
      .map(function (k) { return { id: Number(k), count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 10)
      .map(function (x) { return x.id; });
  }

  /*
   * Compact export format v1 — an array tuned for minimum characters:
   * [ver, name, date, catIdx, format, placeIdx, [deckIds], [rounds]]
   * round: [opp1Id, opp2Id, result(0=W,1=L), order(0=?,1=先,2=后), special(0=none,1=BYE,2=NOSHOW)]
   * Pokémon IDs are plain integers; 0 = slot empty.
   * The array is JSON-stringified then UTF-8-safe Base64 encoded.
   * Keeping field names out of the payload saves ~60% vs raw JSON.
   */
  var EXP_CATS   = ["", "店赛", "城市赛", "超级赛", "高级赛", "大师赛", "世界赛", "线上对战", "其他"];
  var EXP_PLACES = ["", "冠军", "亚军", "四强", "八强", "十六强", "三十二强", "六十四强"];
  // Loss-reason tags a round can carry (only meaningful on a loss). Order is
  // fixed so codes can store them as small indices. The first four are
  // "skill" tags attributable to how this deck was piloted — computeStats
  // tallies those per-deck; the last two (bad draw, opponent variance)
  // aren't the player's fault, so they're just recorded, not aggregated.
  var ROUND_TAG_KEYS = ["resource", "sequencing", "matchup_knowledge", "tempo", "bad_draw", "opp_luck"];
  var ROUND_SKILL_TAG_KEYS = ["resource", "sequencing", "matchup_knowledge", "tempo"];

  function _b64enc(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p) {
      return String.fromCharCode(parseInt(p, 16));
    }));
  }
  function _b64dec(b64) {
    return decodeURIComponent(Array.prototype.map.call(atob(b64), function (c) {
      return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(""));
  }
  function _bytesToB64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function _b64ToBytes(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /*
   * Export codes are gzip-compressed before Base64 (roughly halves the
   * length for a real multi-tournament backup with decklists — plain JSON
   * is very repetitive, lots of recurring card names). Falls back to the
   * plain (uncompressed) Base64 scheme above when CompressionStream isn't
   * available, and _decode always tries gzip first then falls back to
   * plain decode on failure — so codes made on an old/new browser both
   * still import fine either way, no version marker needed.
   */
  function _encode(str) {
    if (typeof CompressionStream === "undefined") return Promise.resolve(_b64enc(str));
    var cs = new CompressionStream("gzip");
    var writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(str));
    writer.close();
    return new Response(cs.readable).arrayBuffer().then(function (buf) {
      return _bytesToB64(new Uint8Array(buf));
    });
  }
  function _decode(b64) {
    if (typeof DecompressionStream === "undefined") return Promise.resolve(_b64dec(b64));
    var bytes;
    try { bytes = _b64ToBytes(b64.trim()); } catch (e) { return Promise.resolve(_b64dec(b64)); }
    var ds = new DecompressionStream("gzip");
    var writer = ds.writable.getWriter();
    // A garbage/non-gzip paste (or a pre-compression plain code) makes the
    // writable side reject too, not just the readable side below — catch it
    // here as well, or some browsers log it as an extra unhandled rejection
    // even though we handle the failure correctly via the .catch() below.
    writer.write(bytes).catch(function () {});
    writer.close().catch(function () {});
    return new Response(ds.readable).arrayBuffer()
      .then(function (buf) { return new TextDecoder().decode(buf); })
      .catch(function () { return _b64dec(b64); });
  }

  // Decklist compact encode/decode, shared by exportTournament/exportAllTournaments.
  var DECK_CATS = ["pokemon", "trainer", "energy"];
  function _encodeDecklist(list) {
    return (list || []).map(function (c) {
      return [DECK_CATS.indexOf(c.category), c.count, c.name, c.set || "", c.number || ""];
    });
  }
  function _decodeDecklist(arr) {
    return (arr || []).map(function (c) {
      return { category: DECK_CATS[c[0]] || "pokemon", count: c[1] || 1, name: c[2] || "", set: c[3] || "", number: c[4] || "" };
    });
  }
  function _encodeTags(tags) {
    return (tags || []).map(function (tag) { return ROUND_TAG_KEYS.indexOf(tag); }).filter(function (i) { return i >= 0; });
  }
  function _decodeTags(arr) {
    return (arr || []).map(function (i) { return ROUND_TAG_KEYS[i]; }).filter(Boolean);
  }
  // Per-game Bo3 sequence (English mode only) — 0=W, 1=L, 2=T per individual
  // game. Absent/empty on Bo1 and 简中 rounds, and on any code from before
  // per-game tracking existed.
  function _encodeGames(games) {
    return (games || []).map(function (g) { return g === "L" ? 1 : g === "T" ? 2 : 0; });
  }
  function _decodeGames(arr) {
    return (arr || []).map(function (i) { return i === 1 ? "L" : i === 2 ? "T" : "W"; });
  }
  // Per-game play order, parallel to the games array — 0=unrecorded,
  // 1=went first, 2=went second (same 1/2 convention as the round-level
  // wentFirst slot).
  function _encodeGameOrders(orders) {
    return (orders || []).map(function (o) { return o === true ? 1 : o === false ? 2 : 0; });
  }
  function _decodeGameOrders(arr) {
    return (arr || []).map(function (i) { return i === 1 ? true : i === 2 ? false : null; });
  }

  function exportTournament(t) {
    var compact = [
      1,                        // format version
      t.name,                   // string
      t.date,                   // "YYYY-MM-DD"
      t.category || "",         // string — was an EXP_CATS index pre-region-mode, decode handles both
      t.format || "",           // string
      t.placement || "",        // string — was an EXP_PLACES index pre-region-mode, decode handles both
      t.deck || [],             // [id, id?]
      (t.rounds || []).map(function (r) {
        return [
          (r.opponentDeck || [])[0] || 0,
          (r.opponentDeck || [])[1] || 0,
          r.result === "W" ? 0 : r.result === "T" ? 2 : 1,
          r.wentFirst === true ? 1 : r.wentFirst === false ? 2 : 0,
          r.special === "BYE" ? 1 : r.special === "NO_SHOW" ? 2 : r.special === "DOUBLE_LOSS" ? 3 : 0,
          r.note || "",            // index 5, added after round notes existed
          _encodeTags(r.tags),      // index 6, added after loss-reason tags existed
          r.bestOf || 1,            // index 7, added after region mode existed
          _encodeGames(r.games),    // index 8, added after per-game Bo3 tracking existed
          _encodeGameOrders(r.gameOrders)  // index 9, per-game 先后手
        ];
      }),
      _encodeDecklist(t.decklist),  // index 8, added after decklists existed — absent in older codes
      t.region || "zh"              // index 9, added after region mode existed
    ];
    return _encode(JSON.stringify(compact));   // returns a Promise<string>
  }

  function importTournament(code) {
    return _decode(code.trim()).then(function (json) {
      try {
        var compact = JSON.parse(json);
        if (!Array.isArray(compact) || compact[0] !== 1) return null;
        return {
          name: compact[1] || "Imported",
          date: compact[2] || new Date().toISOString().slice(0, 10),
          category: typeof compact[3] === "number" ? (EXP_CATS[compact[3]] || "") : (compact[3] || ""),
          format: compact[4] || "",
          placement: typeof compact[5] === "number" ? (EXP_PLACES[compact[5]] || "") : (compact[5] || ""),
          deck: compact[6] || [],
          rounds: (compact[7] || []).map(function (r, i) {
            return {
              id: uid(),
              number: i + 1,
              opponentDeck: [r[0] || null, r[1] || null].filter(Boolean),
              result: r[2] === 0 ? "W" : r[2] === 2 ? "T" : "L",
              wentFirst: r[3] === 1 ? true : r[3] === 2 ? false : null,
              special: r[4] === 1 ? "BYE" : r[4] === 2 ? "NO_SHOW" : r[4] === 3 ? "DOUBLE_LOSS" : "",
              note: r[5] || "",
              tags: _decodeTags(r[6]),
              bestOf: r[7] || 1,
              games: _decodeGames(r[8]),
              gameOrders: _decodeGameOrders(r[9])
            };
          }),
          decklist: _decodeDecklist(compact[8]),
          region: compact[9] || "zh"
        };
      } catch (e) { return null; }
    }).catch(function () { return null; });   // returns a Promise<data|null>
  }

  /*
   * Decklist text format — the official Play!Pokémon / Limitless plain-text
   * decklist ("Pokémon: N" / "Trainer: N" / "Energy: N" section headers, then
   * "<count> <name> <set> <number>" per line). parseDecklistText is the
   * paste-in importer; formatDecklistText is its exact inverse for export.
   */
  var DECK_SECTIONS = [
    { key: "pokemon", label: "Pokémon" },
    { key: "trainer", label: "Trainer" },
    { key: "energy", label: "Energy" }
  ];

  function parseDecklistText(text) {
    var lines = (text || "").split(/\r?\n/);
    var list = [];
    var unparsed = [];
    var section = null;
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var header = line.match(/^(Pok[eé]mon|Trainer|Energy)\s*(?::\s*\d+|\(\s*\d+\s*\))$/i);
      if (header) { section = header[1].toLowerCase().indexOf("pok") === 0 ? "pokemon" : header[1].toLowerCase(); return; }
      if (!section) { unparsed.push(line); return; }
      var m = line.match(/^(\d+)\s+(.+?)\s+([A-Z0-9]{2,5})\s+(\S+)$/);
      if (m) { list.push({ category: section, count: parseInt(m[1], 10), name: m[2], set: m[3], number: m[4] }); return; }
      var m2 = line.match(/^(\d+)\s+(.+)$/);
      if (m2) { list.push({ category: section, count: parseInt(m2[1], 10), name: m2[2].trim(), set: "", number: "" }); return; }
      unparsed.push(line);
    });
    if (!list.length) return null;
    return { list: list, unparsed: unparsed };
  }

  function formatDecklistText(list) {
    var out = [];
    DECK_SECTIONS.forEach(function (sec) {
      var items = (list || []).filter(function (c) { return c.category === sec.key; });
      if (!items.length) return;
      var total = items.reduce(function (n, c) { return n + (c.count || 1); }, 0);
      out.push(sec.label + ": " + total);
      items.forEach(function (c) {
        out.push(c.count + " " + c.name + (c.set ? " " + c.set : "") + (c.number ? " " + c.number : ""));
      });
      out.push("");
    });
    return out.join("\n").trim();
  }

  /*
   * Full backup format — bundles every tournament into one code, for the
   * "backup all data" flow (see [[trainingcourt-tcg-tracker]] memory: iOS wipes
   * localStorage when a Home Screen web-app icon is deleted, so this is the
   * user's manual safety net against that). Tagged "ALL1" (not the number 1)
   * so it can never be mistaken for / parsed by the single-tournament
   * exportTournament/importTournament codes, which must keep their exact
   * existing wire format for backward compatibility with codes already saved
   * by users.
   */
  function exportAllTournaments() {
    var ts = loadTournaments();
    var bundle = ts.map(function (t) {
      return [
        t.name, t.date, t.category || "", t.format || "", t.placement || "", t.deck || [],
        (t.rounds || []).map(function (r) {
          return [
            (r.opponentDeck || [])[0] || 0,
            (r.opponentDeck || [])[1] || 0,
            r.result === "W" ? 0 : r.result === "T" ? 2 : 1,
            r.wentFirst === true ? 1 : r.wentFirst === false ? 2 : 0,
            r.special === "BYE" ? 1 : r.special === "NO_SHOW" ? 2 : r.special === "DOUBLE_LOSS" ? 3 : 0,
            r.note || "",            // index 5, added after round notes existed
            _encodeTags(r.tags),     // index 6, added after loss-reason tags existed
            r.bestOf || 1,           // index 7, added after region mode existed
            _encodeGames(r.games),   // index 8, added after per-game Bo3 tracking existed
            _encodeGameOrders(r.gameOrders)  // index 9, per-game 先后手
          ];
        }),
        _encodeDecklist(t.decklist),  // index 7, added after decklists existed — absent in older codes
        t.region || "zh"              // index 8, added after region mode existed
      ];
    });
    return _encode(JSON.stringify(["ALL1", bundle]));   // returns a Promise<string>
  }

  function importAllTournaments(code) {
    return _decode(code.trim()).then(function (json) {
      try {
        var outer = JSON.parse(json);
        if (!Array.isArray(outer) || outer[0] !== "ALL1") return null;
        return outer[1].map(function (c) {
          return {
            name: c[0] || "Imported",
            date: c[1] || new Date().toISOString().slice(0, 10),
            category: typeof c[2] === "number" ? (EXP_CATS[c[2]] || "") : (c[2] || ""),
            format: c[3] || "",
            placement: typeof c[4] === "number" ? (EXP_PLACES[c[4]] || "") : (c[4] || ""),
            deck: c[5] || [],
            rounds: (c[6] || []).map(function (r, i) {
              return {
                id: uid(),
                number: i + 1,
                opponentDeck: [r[0] || null, r[1] || null].filter(Boolean),
                result: r[2] === 0 ? "W" : r[2] === 2 ? "T" : "L",
                wentFirst: r[3] === 1 ? true : r[3] === 2 ? false : null,
                special: r[4] === 1 ? "BYE" : r[4] === 2 ? "NO_SHOW" : r[4] === 3 ? "DOUBLE_LOSS" : "",
                note: r[5] || "",
                tags: _decodeTags(r[6]),
                bestOf: r[7] || 1,
                games: _decodeGames(r[8]),
                gameOrders: _decodeGameOrders(r[9])
              };
            }),
            decklist: _decodeDecklist(c[7]),
            region: c[8] || "zh"
          };
        });
      } catch (e) { return null; }
    }).catch(function () { return null; });   // returns a Promise<list|null>
  }

  window.Store = {
    loadTournaments: loadTournaments, saveTournaments: saveTournaments,
    getTournament: getTournament, addTournament: addTournament,
    updateTournament: updateTournament, deleteTournament: deleteTournament,
    addRound: addRound, deleteRound: deleteRound, updateRound: updateRound,
    loadLogs: loadLogs, addLog: addLog, deleteLog: deleteLog,
    computeRecord: computeRecord, computeStats: computeStats,
    frequentPokemonIds: frequentPokemonIds,
    exportTournament: exportTournament, importTournament: importTournament,
    exportAllTournaments: exportAllTournaments, importAllTournaments: importAllTournaments,
    parseDecklistText: parseDecklistText, formatDecklistText: formatDecklistText,
    ROUND_TAG_KEYS: ROUND_TAG_KEYS, ROUND_SKILL_TAG_KEYS: ROUND_SKILL_TAG_KEYS,
    isStorageOk: function () { return STORAGE_OK; }
  };
})();
