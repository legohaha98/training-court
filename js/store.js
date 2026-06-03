/* Local-storage data layer for the web build.
 * Keep this API identical to miniprogram/utils/store.js. */
(function () {
  var KEY_T = "tc.tournaments";
  var KEY_B = "tc.battlelogs";

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
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

  window.Store = {
    loadTournaments: loadTournaments, saveTournaments: saveTournaments,
    getTournament: getTournament, addTournament: addTournament,
    updateTournament: updateTournament, deleteTournament: deleteTournament,
    addRound: addRound, deleteRound: deleteRound, updateRound: updateRound,
    loadLogs: loadLogs, addLog: addLog, deleteLog: deleteLog,
    computeRecord: computeRecord, computeStats: computeStats
  };
})();
