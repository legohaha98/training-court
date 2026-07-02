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
  function loadTournaments() { return read(KEY_T); }
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
  // ID counts as neither. Returns {w, l, label}.
  function computeRecord(rounds) {
    var w = 0, l = 0;
    (rounds || []).forEach(function (r) {
      if (r.special === "ID") return;
      if (r.special === "BYE" || r.special === "NO_SHOW") { w++; return; }
      if (r.result === "W") w++;
      else if (r.result === "L") l++;
    });
    return { w: w, l: l, label: w + "-" + l };
  }

  // outcome of a single round: "W", "L", or null (uncounted)
  function roundOutcome(r) {
    if (r.special === "BYE" || r.special === "NO_SHOW") return "W";
    if (r.special === "ID") return null;
    if (r.result === "W") return "W";
    if (r.result === "L") return "L";
    return null;
  }
  function deckKey(ids) { return (ids || []).slice().sort(function (a, b) { return a - b; }).join("-"); }

  // Aggregate win-rate + per-deck + matchup stats across all tournaments.
  function computeStats() {
    var ts = loadTournaments();
    var s = {
      tournaments: ts.length, wins: 0, losses: 0,
      firstWins: 0, firstLosses: 0, secondWins: 0, secondLosses: 0,
      decks: [], matchups: []
    };
    var decks = {}, matchups = {};
    function bucket(map, key, ids) {
      if (!map[key]) map[key] = { key: key, ids: ids, w: 0, l: 0 };
      return map[key];
    }

    ts.forEach(function (t) {
      var myKey = deckKey(t.deck);
      (t.rounds || []).forEach(function (r) {
        var o = roundOutcome(r);
        if (!o) return;
        if (o === "W") s.wins++; else s.losses++;
        // my deck
        if (t.deck && t.deck.length) {
          var db = bucket(decks, myKey, t.deck);
          if (o === "W") db.w++; else db.l++;
        }
        // matchup (needs an opponent deck)
        if (r.opponentDeck && r.opponentDeck.length) {
          var mb = bucket(matchups, deckKey(r.opponentDeck), r.opponentDeck);
          if (o === "W") mb.w++; else mb.l++;
        }
        // play order
        if (r.wentFirst === true) { if (o === "W") s.firstWins++; else s.firstLosses++; }
        else if (r.wentFirst === false) { if (o === "W") s.secondWins++; else s.secondLosses++; }
      });
    });

    function finish(map) {
      return Object.keys(map).map(function (k) {
        var b = map[k]; b.games = b.w + b.l;
        b.winRate = b.games ? Math.round(b.w / b.games * 100) : 0;
        return b;
      }).sort(function (a, b) { return b.games - a.games || b.winRate - a.winRate; });
    }
    s.decks = finish(decks);
    s.matchups = finish(matchups);
    s.games = s.wins + s.losses;
    s.winRate = s.games ? Math.round(s.wins / s.games * 100) : 0;
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

  function exportTournament(t) {
    var ci = EXP_CATS.indexOf(t.category || ""); if (ci < 0) ci = 0;
    var pi = EXP_PLACES.indexOf(t.placement || ""); if (pi < 0) pi = 0;
    var compact = [
      1,                        // format version
      t.name,                   // string
      t.date,                   // "YYYY-MM-DD"
      ci,                       // category index
      t.format || "",           // string
      pi,                       // placement index
      t.deck || [],             // [id, id?]
      (t.rounds || []).map(function (r) {
        return [
          (r.opponentDeck || [])[0] || 0,
          (r.opponentDeck || [])[1] || 0,
          r.result === "W" ? 0 : 1,
          r.wentFirst === true ? 1 : r.wentFirst === false ? 2 : 0,
          r.special === "BYE" ? 1 : r.special === "NO_SHOW" ? 2 : 0
        ];
      })
    ];
    return _b64enc(JSON.stringify(compact));
  }

  function importTournament(code) {
    try {
      var compact = JSON.parse(_b64dec(code.trim()));
      if (!Array.isArray(compact) || compact[0] !== 1) return null;
      return {
        name: compact[1] || "Imported",
        date: compact[2] || new Date().toISOString().slice(0, 10),
        category: EXP_CATS[compact[3]] || "",
        format: compact[4] || "",
        placement: EXP_PLACES[compact[5]] || "",
        deck: compact[6] || [],
        rounds: (compact[7] || []).map(function (r, i) {
          return {
            id: uid(),
            number: i + 1,
            opponentDeck: [r[0] || null, r[1] || null].filter(Boolean),
            result: r[2] === 0 ? "W" : "L",
            wentFirst: r[3] === 1 ? true : r[3] === 2 ? false : null,
            special: r[4] === 1 ? "BYE" : r[4] === 2 ? "NO_SHOW" : ""
          };
        })
      };
    } catch (e) { return null; }
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
      var ci = EXP_CATS.indexOf(t.category || ""); if (ci < 0) ci = 0;
      var pi = EXP_PLACES.indexOf(t.placement || ""); if (pi < 0) pi = 0;
      return [
        t.name, t.date, ci, t.format || "", pi, t.deck || [],
        (t.rounds || []).map(function (r) {
          return [
            (r.opponentDeck || [])[0] || 0,
            (r.opponentDeck || [])[1] || 0,
            r.result === "W" ? 0 : 1,
            r.wentFirst === true ? 1 : r.wentFirst === false ? 2 : 0,
            r.special === "BYE" ? 1 : r.special === "NO_SHOW" ? 2 : 0
          ];
        })
      ];
    });
    return _b64enc(JSON.stringify(["ALL1", bundle]));
  }

  function importAllTournaments(code) {
    try {
      var outer = JSON.parse(_b64dec(code.trim()));
      if (!Array.isArray(outer) || outer[0] !== "ALL1") return null;
      return outer[1].map(function (c) {
        return {
          name: c[0] || "Imported",
          date: c[1] || new Date().toISOString().slice(0, 10),
          category: EXP_CATS[c[2]] || "",
          format: c[3] || "",
          placement: EXP_PLACES[c[4]] || "",
          deck: c[5] || [],
          rounds: (c[6] || []).map(function (r, i) {
            return {
              id: uid(),
              number: i + 1,
              opponentDeck: [r[0] || null, r[1] || null].filter(Boolean),
              result: r[2] === 0 ? "W" : "L",
              wentFirst: r[3] === 1 ? true : r[3] === 2 ? false : null,
              special: r[4] === 1 ? "BYE" : r[4] === 2 ? "NO_SHOW" : ""
            };
          })
        };
      });
    } catch (e) { return null; }
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
    isStorageOk: function () { return STORAGE_OK; }
  };
})();
