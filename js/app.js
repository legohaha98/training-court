/* Bootstrap, hash routing, and page rendering (mobile / 小程序-style web build). */
(function () {
  var el = UI.el, deckSprites = UI.deckSprites, sprite = UI.sprite;
  var S = Store;

  // ---------------------------------------------------------------- REGION / I18N
  // Two parallel event systems live side by side: 简中 (zh) and International
  // English (en). Region is a per-tournament field (data stays in one array —
  // see store.js), but there's also a single "currently active" region setting
  // that drives UI language, which category/placement vocabulary new
  // tournaments get, and the default scope for the list/stats pages.
  var REGION_KEY = "tc.region";
  function getRegion() { return localStorage.getItem(REGION_KEY) === "en" ? "en" : "zh"; }
  function setRegion(r) { localStorage.setItem(REGION_KEY, r === "en" ? "en" : "zh"); }
  // tr(zh, en) — the whole UI's i18n helper. Keeping the English text right
  // next to the Chinese text at every call site (rather than an indirected
  // key->string dictionary) is easier to review and keep in sync for an app
  // this size.
  function tr(zh, en) { return getRegion() === "en" ? en : zh; }

  function applyRegionChrome() {
    var r = getRegion();
    document.documentElement.lang = r === "en" ? "en" : "zh-CN";
    document.title = r === "en" ? "TRAINING COURT · Pokémon TCG Tracker" : "TRAINING COURT · 宝可梦 TCG 战绩";
    var sub = document.querySelector(".topbar .brand small");
    if (sub) sub.textContent = r === "en" ? "Pokémon TCG Tracker" : "宝可梦 TCG 战绩";
  }

  var CATEGORIES_ZH = ["店赛", "城市赛", "超级赛", "高级赛", "大师赛", "世界赛", "线上对战", "其他"];
  var CATEGORIES_EN = ["Local Tournament", "League Challenge", "League Cup",
    "Regional Championships", "International Championships", "World Championships"];
  var PLACEMENTS_ZH = ["", "冠军", "亚军", "四强", "八强", "十六强", "三十二强", "六十四强"];
  var PLACEMENTS_EN = ["", "Champion", "Runner-up", "Top 4", "Top 8", "Top 16", "Top 32", "Top 64"];
  function CATEGORIES() { return getRegion() === "en" ? CATEGORIES_EN : CATEGORIES_ZH; }
  function PLACEMENTS() { return getRegion() === "en" ? PLACEMENTS_EN : PLACEMENTS_ZH; }

  // Best-of rule per English-mode category. League Cup runs Bo1 Swiss then
  // Bo3 top cut once the field is small enough (Top 16/8/4, depending on
  // attendance) — the app doesn't track attendance, so that switch is a
  // manual per-round toggle in roundForm (see BEST_OF_RULES[...] === "manual").
  var BEST_OF_RULES = {
    "Local Tournament": 1,
    "League Challenge": 1,
    "League Cup": "manual",
    "Regional Championships": 3,
    "International Championships": 3,
    "World Championships": 3
  };

  // result / outcome display helpers
  function resLabel(r) {
    if (r.special === "BYE" || r.special === "NO_SHOW") return tr("胜", "W");
    if (r.special === "DOUBLE_LOSS") return tr("双败", "DL");
    if (r.result === "T") return tr("平", "T");
    return r.result === "W" ? tr("胜", "W") : r.result === "L" ? tr("负", "L") : "";
  }
  function rowClass(r) {
    if (r.result === "W" || r.special === "BYE" || r.special === "NO_SHOW") return "win";
    if (r.result === "L" || r.special === "DOUBLE_LOSS") return "loss";
    return "tie";
  }
  function specialText(s) {
    if (s === "BYE") return tr("轮空", "Bye");
    if (s === "NO_SHOW") return tr("对手弃赛", "No-show");
    if (s === "DOUBLE_LOSS") return tr("双败（超时未分胜负）", "Double loss (time)");
    return "";
  }

  // Solid collapse-toggle chevron — same triangle shape as the .select
  // dropdown arrow (same <path d>), just drawn bigger via width/height so
  // it reads at a glance instead of relying on a font glyph that renders
  // thin/inconsistently across platforms.
  function chevSvg(cls) {
    return el("span", { class: cls,
      html: "<svg width=\"14\" height=\"10\" viewBox=\"0 0 12 8\" fill=\"currentColor\"><path d=\"M6 8 0 0h12z\"/></svg>" });
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    if (getRegion() === "en") {
      var months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  var main;

  // Lighter alternative to a native <select> for the 赛制 filter: a row of
  // tappable pill buttons ("全部赛制" + one per distinct format seen in the data).
  function pillFilter(allLabel, options, active, onSelect) {
    var values = [""].concat(options);
    return el("div", { class: "pill-filter" }, values.map(function (v) {
      return el("button", {
        type: "button",
        class: "pill" + (active === v ? " active" : ""),
        onclick: function () { onSelect(v); }
      }, [v === "" ? allLabel : v]);
    }));
  }

  function emptyState(title, copy, compact) {
    return el("div", { class: "empty" + (compact ? " empty-compact" : "") }, [
      el("img", { class: "empty-ball", src: "assets/pokeball.svg", alt: "" }),
      el("div", { class: "empty-title" }, [title]),
      copy ? el("div", { class: "empty-copy" }, [copy]) : null
    ]);
  }

  // ---------------------------------------------------------------- LIST
  var listFilters = { category: "", format: "" };

  function renderList() {
    // Data stays in one array regardless of region — the list/stats pages
    // default to showing only the currently active region's tournaments so a
    // 简中 city-league record never blends into an International one and
    // vice versa. Switching region in Settings changes this lens; it never
    // deletes or hides anything permanently.
    var all = S.loadTournaments().filter(function (t) { return t.region === getRegion(); });
    var formats = all.map(function (t) { return t.format; })
      .filter(function (f, i, a) { return f && a.indexOf(f) === i; });

    main.innerHTML = "";
    main.appendChild(el("div", { class: "page-title" }, [tr("锦标赛", "Tournaments")]));
    main.appendChild(el("p", { class: "page-sub" }, [tr("记录你的 TCG 锦标赛、每轮对局与对位", "Track your TCG tournaments, rounds, and matchups")]));
    main.appendChild(el("div", { class: "list-actions" }, [
      el("button", { class: "btn btn-primary", style: "flex:1", onclick: function () { openTournamentModal(null); } }, [tr("＋  新建锦标赛", "＋  New Tournament")]),
      el("button", { class: "btn btn-ghost import-btn", onclick: openImportModal }, [tr("导入", "Import")])
    ]));

    var catSel = el("select", { class: "select", onchange: function () { listFilters.category = this.value; renderList(); } },
      [el("option", { value: "" }, [tr("全部分类", "All Categories")])].concat(CATEGORIES().map(function (c) {
        return el("option", { value: c, selected: listFilters.category === c ? "selected" : null }, [c]);
      })));
    var fmtPills = pillFilter(tr("全部赛制", "All Formats"), formats, listFilters.format, function (v) { listFilters.format = v; renderList(); });
    main.appendChild(el("div", { class: "filters" }, [catSel, fmtPills]));

    var filtered = all.filter(function (t) {
      return (!listFilters.category || t.category === listFilters.category) &&
             (!listFilters.format || t.format === listFilters.format);
    });

    if (!filtered.length) {
      main.appendChild(all.length
        ? emptyState(tr("没有符合筛选的锦标赛", "No tournaments match this filter"), tr("换一个分类或赛制看看。", "Try a different category or format."))
        : emptyState(tr("还没有锦标赛", "No tournaments yet"), tr("点击「新建锦标赛」，开始记录第一场比赛。", "Tap “New Tournament” to log your first match.")));
      return;
    }

    var list = el("div", { class: "card-list" });
    filtered.forEach(function (t) {
      var rec = S.computeRecord(t.rounds);
      list.appendChild(el("div", { class: "t-card", onclick: function () { location.hash = "#/t/" + t.id; } }, [
        el("div", { class: "icon-wrap" }, [deckSprites(t.deck)]),
        el("div", { class: "t-meta" }, [
          el("div", { class: "name" }, [t.name]),
          el("div", { class: "date" }, [fmtDate(t.date) + (t.category ? " · " + t.category : "")])
        ]),
        el("div", { class: "t-record" }, [
          el("div", { class: "rec " + recClass(rec) }, [rec.label]),
          t.placement ? el("div", { class: "place" }, [t.placement]) : null
        ])
      ]));
    });
    main.appendChild(list);
  }

  // color a W-L record by whether it's winning (green), losing (red), or even
  function recClass(rec) {
    if (rec.w > rec.l) return "rec-up";
    if (rec.w < rec.l) return "rec-down";
    return "";
  }

  // ---------------------------------------------------------------- CREATE / EDIT MODAL
  // existing === null -> create; otherwise edit that tournament in place.
  function openTournamentModal(existing) {
    var editing = !!existing;
    var draft = {
      name: editing ? existing.name : "",
      date: editing ? existing.date : "",
      category: editing ? existing.category : "",
      format: editing ? existing.format : "",
      placement: editing ? existing.placement : "",
      region: editing ? existing.region : getRegion(),
      deck: []
    };
    var deckPicks = [(existing && existing.deck[0]) || null, (existing && existing.deck[1]) || null];

    var nameI = el("input", { class: "input", placeholder: tr("锦标赛名称", "Tournament name"), value: draft.name, oninput: function () { draft.name = this.value; refreshBtn(); } });
    var dateI = el("input", { class: "input", type: "date", value: draft.date, oninput: function () { draft.date = this.value; } });
    var catI = el("select", { class: "select", onchange: function () { draft.category = this.value; } },
      [el("option", { value: "" }, [tr("选择赛事分类", "Choose a category")])].concat(CATEGORIES().map(function (c) {
        return el("option", { value: c, selected: draft.category === c ? "selected" : null }, [c]);
      })));
    var fmtI = el("input", { class: "input", placeholder: tr("赛制（如 BRS-SSP）", "Format (e.g. BRS-SSP)"), value: draft.format, oninput: function () { draft.format = this.value; } });
    var placeI = el("select", { class: "select", onchange: function () { draft.placement = this.value; } },
      [el("option", { value: "" }, [tr("名次（可选）", "Placement (optional)")])].concat(PLACEMENTS().slice(1).map(function (p) {
        return el("option", { value: p, selected: draft.placement === p ? "selected" : null }, [p]);
      })));

    var deckRow = el("div", { class: "two-col" }, [
      UI.PokemonPicker({ value: deckPicks[0], onChange: function (id) { deckPicks[0] = id; } }),
      UI.PokemonPicker({ value: deckPicks[1], onChange: function (id) { deckPicks[1] = id; } })
    ]);

    var saveBtn = el("button", { class: "btn btn-primary", disabled: draft.name.trim() ? null : "disabled", onclick: submit }, [editing ? tr("保存", "Save") : tr("创建", "Create")]);
    function refreshBtn() { if (draft.name.trim()) saveBtn.removeAttribute("disabled"); else saveBtn.setAttribute("disabled", "disabled"); }

    function submit() {
      draft.deck = deckPicks.filter(Boolean);
      if (editing) {
        S.updateTournament(existing.id, draft);
        closeOverlay();
        renderDetail(existing.id);
      } else {
        var t = S.addTournament(draft);
        closeOverlay();
        location.hash = "#/t/" + t.id;
      }
    }

    var modal = el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, [editing ? tr("编辑锦标赛", "Edit Tournament") : tr("新建锦标赛", "New Tournament")]),
      el("div", { class: "field" }, [nameI]),
      el("label", { class: "lbl" }, [tr("比赛日期", "Date")]),
      el("div", { class: "field" }, [dateI]),
      el("div", { class: "field" }, [catI]),
      el("div", { class: "field" }, [fmtI]),
      el("div", { class: "field" }, [placeI]),
      el("label", { class: "lbl" }, [tr("我的卡组", "My Deck")]),
      deckRow,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("取消", "Cancel")]),
        saveBtn
      ])
    ]);
    showOverlay(modal);
  }

  // ---------------------------------------------------------------- DETAIL
  function renderDetail(id) {
    var t = S.getTournament(id);
    main.innerHTML = "";
    if (!t) { main.appendChild(emptyState(tr("找不到该锦标赛", "Tournament not found"), tr("它可能已被删除或尚未恢复。", "It may have been deleted, or not restored yet."))); return; }
    var rec = S.computeRecord(t.rounds);

    main.appendChild(el("div", { class: "detail-bar" }, [
      el("a", { class: "back-btn", href: "#/tournaments" }, [
        el("img", { src: "assets/icon-back.svg", alt: "" }), tr("返回", "Back")
      ]),
      el("div", { class: "detail-tools" }, [
        el("button", { class: "tool", "aria-label": tr("导出", "Export"), title: tr("导出锦标赛", "Export tournament"), onclick: function () { openExportModal(t); } },
          [el("img", { src: "assets/icon-export.svg", alt: "" })]),
        el("button", { class: "tool", "aria-label": tr("编辑锦标赛", "Edit tournament"), title: tr("编辑锦标赛", "Edit tournament"), onclick: function () { openTournamentModal(t); } },
          [el("img", { src: "assets/icon-edit.svg", alt: "" })]),
        el("button", { class: "tool", "aria-label": tr("删除锦标赛", "Delete tournament"), title: tr("删除锦标赛", "Delete tournament"), onclick: function () {
          if (confirm(tr("确定删除该锦标赛？", "Delete this tournament?"))) { S.deleteTournament(id); location.hash = "#/tournaments"; }
        } }, [el("img", { src: "assets/icon-trash.svg", alt: "" })])
      ])
    ]));
    main.appendChild(el("div", { class: "detail-head" }, [
      el("div", { class: "left" }, [
        el("h1", {}, [t.name]),
        el("div", { class: "date" }, [fmtDate(t.date)])
      ]),
      el("div", { class: "right" }, [
        el("div", { class: "big-rec " + recClass(rec) }, [rec.label]),
        deckSprites(t.deck)
      ])
    ]));
    // add/edit/delete-round handlers below update the record in place
    function refreshBigRec() {
      var newRec = S.computeRecord(t.rounds);
      var n = main.querySelector(".big-rec");
      n.textContent = newRec.label;
      n.className = "big-rec " + recClass(newRec);
    }
    var chips = el("div", { class: "chips" }, [
      t.category ? el("div", { class: "chip cat" }, [t.category]) : null,
      t.placement ? el("div", { class: "chip" }, [t.placement]) : null,
      t.format ? el("div", { class: "chip" }, [t.format]) : null
    ]);
    main.appendChild(chips);

    // rounds (card rows) — each has an edit pencil that swaps the row for an inline form
    var editingRid = null;
    var rounds = el("div", { class: "rounds" });

    function renderRounds() {
      rounds.innerHTML = "";
      t.rounds.forEach(function (r) {
        if (r.id === editingRid) {
          // inline edit form for this round
          rounds.appendChild(roundForm(t, r, function (patch) {
            if (patch) S.updateRound(id, r.id, patch);
            t = S.getTournament(id);   // reload
            editingRid = null;
            renderRounds();
            refreshBigRec();
          }));
          return;
        }
        var opp = r.special
          ? el("div", { class: "opp" }, [el("span", { class: "opp-text" }, [specialText(r.special)])])
          : el("div", { class: "opp" }, (r.opponentDeck || []).map(function (pid) { return sprite(pid); }));
        var orderBadge = r.wentFirst === true  ? el("span", { class: "order-badge" }, [tr("先", "1st")])
                       : r.wentFirst === false ? el("span", { class: "order-badge" }, [tr("后", "2nd")])
                       : null;
        var roundRow = el("div", { class: "round-row " + rowClass(r) }, [
          el("div", { class: "rnum" }, [String(r.number)]),
          opp,
          orderBadge,
          el("div", { class: "res" }, [resLabel(r)]),
          el("div", { class: "edit", title: tr("编辑该轮", "Edit this round"),
            onclick: function () { editingRid = r.id; renderRounds(); } },
            [el("img", { src: "assets/icon-edit.svg", alt: tr("编辑", "Edit") })]),
          el("div", { class: "del", html: "✕", title: tr("删除该轮", "Delete this round"),
            onclick: function () {
              if (!confirm(tr("确定删除第 " + r.number + " 轮？", "Delete round " + r.number + "?"))) return;
              S.deleteRound(id, r.id); t = S.getTournament(id); renderRounds();
              refreshBigRec();
            } })
        ]);
        var extras = [];
        if (r.tags && r.tags.length) {
          extras.push(el("div", { class: "round-tags" }, r.tags.map(function (key) {
            var tag = LOSS_TAGS.filter(function (lt) { return lt.key === key; })[0];
            if (!tag) return null;
            // variance tags (bad draw / opponent luck) aren't the player's
            // mistake — show them neutral gray, not "error red"
            var isVariance = S.ROUND_SKILL_TAG_KEYS.indexOf(key) < 0;
            return el("span", { class: "tag-chip" + (isVariance ? " variance" : "") }, [tagLabel(tag)]);
          })));
        }
        if (r.note) extras.push(el("div", { class: "round-note" }, [r.note]));
        if (extras.length) {
          rounds.appendChild(el("div", { class: "round-item" }, [roundRow].concat(extras)));
        } else {
          rounds.appendChild(roundRow);
        }
      });
    }
    renderRounds();
    main.appendChild(rounds);

    var addArea = el("div", {});
    main.appendChild(addArea);
    main.appendChild(el("button", { class: "add-round-btn", onclick: function () {
      addArea.innerHTML = "";
      addArea.appendChild(roundForm(t, null, function (patch) {
        if (patch) { S.addRound(id, patch); t = S.getTournament(id); renderRounds(); refreshBigRec(); }
        addArea.innerHTML = "";
      }));
      addArea.scrollIntoView({ behavior: "smooth", block: "center" });
    } }, [tr("＋  添加一轮", "＋  Add Round")]));

    // decklist sits below rounds and is collapsed by default — rounds are
    // what you check most often, and the card-art grid is both tall and
    // slow (live API lookups), so it shouldn't push rounds off-screen or
    // start fetching anything until the user actually opens it.
    main.appendChild(renderDecklistSection(t));
  }

  // Loss-reason tags — only meaningful on a loss. First four are "skill"
  // tags attributable to this deck's piloting (computeStats tallies those
  // per-deck, see S.ROUND_SKILL_TAG_KEYS); the last two are variance, not
  // the player's fault, so they're recorded but not aggregated anywhere.
  var LOSS_TAGS = [
    { key: "resource", zh: "资源规划失误", en: "Resource misplay" },
    { key: "sequencing", zh: "出牌顺序失误", en: "Sequencing error" },
    { key: "matchup_knowledge", zh: "对位知识不足", en: "Matchup knowledge" },
    { key: "tempo", zh: "超时/节奏问题", en: "Tempo/timing issue" },
    { key: "bad_draw", zh: "卡手/奖励卡问题", en: "Bad draw/prizes" },
    { key: "opp_luck", zh: "对手高掷", en: "Opponent variance" }
  ];
  function tagLabel(tag) { return getRegion() === "en" ? tag.en : tag.zh; }

  // inline add/edit-round form
  // existing=null -> add new;  existing=round object -> edit that round
  // done(patch) called with the data object on save, or done(null) on cancel
  function roundForm(t, existing, done) {
    var isEn = getRegion() === "en";
    // English mode only: which best-of applies to this tournament's category.
    // 1 or 3 -> fixed; "manual"/unset (League Cup, or no category chosen yet)
    // -> a Swiss(Bo1)/Top Cut(Bo3) toggle, since the app doesn't track
    // attendance to auto-detect when top cut starts.
    var catRule = isEn ? BEST_OF_RULES[t.category] : null;
    var manualBestOf = isEn && catRule !== 1 && catRule !== 3;
    var fixedBestOf = (catRule === 1 || catRule === 3) ? catRule : 1;

    var draft = existing
      ? { opponentDeck: [(existing.opponentDeck||[])[0]||null, (existing.opponentDeck||[])[1]||null],
          result: existing.result || "W", wentFirst: existing.wentFirst !== undefined ? existing.wentFirst : null,
          special: existing.special || "", note: existing.note || "", tags: (existing.tags || []).slice(),
          bestOf: existing.bestOf || fixedBestOf }
      : { opponentDeck: [null, null], result: "W", wentFirst: null, special: "", note: "", tags: [],
          bestOf: fixedBestOf };

    // ---- Bo1/Bo3 toggle (League Cup / no category chosen yet, English mode only) ----
    var bestOfSeg = null;
    if (manualBestOf) {
      bestOfSeg = el("div", { class: "seg small" }, [[1, "Swiss (Bo1)"], [3, "Top Cut (Bo3)"]].map(function (o) {
        return el("div", { class: "opt", onclick: function () {
          draft.bestOf = o[0];
          if (draft.bestOf === 1 && draft.result === "T") draft.result = "W";
          sync();
        } }, [o[1]]);
      }));
    }

    // Result options depend on region + best-of: 简中 is always 胜/负 (plus a
    // separate 双败 special below); English Bo1 is Win/Loss, Bo3 is Win/Loss/Tie.
    // Rebuilt on every sync() (not just class-toggled) since the option count
    // itself can change live when the Bo1/Bo3 toggle flips.
    function resultOptions() {
      if (!isEn) return [["胜", "W"], ["负", "L"]];
      return draft.bestOf === 3 ? [["Win", "W"], ["Loss", "L"], ["Tie", "T"]] : [["Win", "W"], ["Loss", "L"]];
    }
    var resultWrap = el("div", { class: "seg" });

    var orderSeg = el("div", { class: "seg small" }, [[tr("先手", "1st"), true], [tr("后手", "2nd"), false]].map(function (o) {
      return el("div", { class: "opt", onclick: function () { draft.wentFirst = (draft.wentFirst === o[1]) ? null : o[1]; sync(); } }, [o[0]]);
    }));
    // Outcome options: 简中 gets 轮空/对手弃赛/双败 (双败 = both players still
    // tied when time ran out — counts as a loss, see store.js computeRecord).
    // English mode gets Bye/No-show only (双败 is a 简中-specific ruling).
    var outcomeOptions = isEn
      ? [["Bye", "BYE"], ["No-show", "NO_SHOW"]]
      : [["轮空", "BYE"], ["对手弃赛", "NO_SHOW"], ["双败", "DOUBLE_LOSS"]];
    var outcomeSeg = el("div", { class: "seg small" }, outcomeOptions.map(function (o) {
      return el("div", { class: "opt", onclick: function () {
        draft.special = draft.special === o[1] ? "" : o[1];
        if (draft.special) draft.tags = [];   // any special outcome isn't a plain loss
        sync();
      } }, [o[0]]);
    }));
    var tagChips = LOSS_TAGS.map(function (tag) {
      var chip = el("div", { class: "opt", onclick: function () {
        var i = draft.tags.indexOf(tag.key);
        if (i >= 0) draft.tags.splice(i, 1); else draft.tags.push(tag.key);
        sync();
      } }, [tagLabel(tag)]);
      return chip;
    });
    var tagWrap = el("div", {}, [
      el("label", { class: "lbl" }, [tr("输的原因（可多选，可选）", "Reason for the loss (optional, multi-select)")]),
      el("div", { class: "seg small tag-seg" }, tagChips)
    ]);

    var deckRow = el("div", { class: "two-col" }, [
      UI.PokemonPicker({ value: draft.opponentDeck[0], onChange: function (id) { draft.opponentDeck[0] = id; } }),
      UI.PokemonPicker({ value: draft.opponentDeck[1], onChange: function (id) { draft.opponentDeck[1] = id; } })
    ]);

    function sync() {
      resultWrap.innerHTML = "";
      resultOptions().forEach(function (o) {
        var selected = !draft.special && draft.result === o[1];
        var selClass = o[1] === "W" ? " sel-w" : o[1] === "L" ? " sel-l" : " sel";
        resultWrap.appendChild(el("div", { class: "opt" + (selected ? selClass : ""), onclick: function () {
          draft.result = o[1]; draft.special = "";
          if (o[1] !== "L") draft.tags = [];   // loss-reason tags don't make sense off a loss
          sync();
        } }, [o[0]]));
      });

      if (bestOfSeg) {
        var bo = bestOfSeg.children;
        bo[0].className = "opt" + (draft.bestOf === 1 ? " sel" : "");
        bo[1].className = "opt" + (draft.bestOf === 3 ? " sel" : "");
      }
      var oo = outcomeSeg.children;
      outcomeOptions.forEach(function (o, i) {
        oo[i].className = "opt" + (draft.special === o[1] ? " sel" : "");
      });
      var ord = orderSeg.children;
      ord[0].className = "opt" + (draft.wentFirst === true ? " sel" : "");
      ord[1].className = "opt" + (draft.wentFirst === false ? " sel" : "");
      LOSS_TAGS.forEach(function (tag, i) {
        tagChips[i].className = "opt" + (draft.tags.indexOf(tag.key) >= 0 ? " sel" : "");
      });
      tagWrap.style.display = (draft.result === "L" && !draft.special) ? "" : "none";
    }
    sync();

    var roundNum = existing ? existing.number : t.rounds.length + 1;
    return el("div", { class: "form-card" }, [
      el("h3", {}, [tr("第 " + roundNum + " 轮", "Round " + roundNum) + (existing ? tr(" · 编辑", " · Edit") : "")]),
      el("label", { class: "lbl" }, [tr("对手卡组", "Opponent's Deck")]),
      deckRow,
      bestOfSeg ? el("label", { class: "lbl" }, ["Round Type"]) : null,
      bestOfSeg,
      el("label", { class: "lbl" }, [tr("比赛结果", "Result")]),
      resultWrap,
      orderSeg,
      el("label", { class: "lbl" }, [tr("其他结果", "Other Outcome")]),
      outcomeSeg,
      tagWrap,
      el("label", { class: "lbl" }, [tr("备注（复盘用，可选）", "Notes (optional)")]),
      el("textarea", { class: "note-input", placeholder: tr("比如：对面缺能量、关键卡没抽到…", "e.g. opponent was energy-starved, missed a key draw…"),
        oninput: function () { draft.note = this.value; } }, [draft.note]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: function () { done(null); } }, [tr("取消", "Cancel")]),
        el("button", { class: "btn btn-primary", onclick: function () {
          done({ result: draft.result, wentFirst: draft.wentFirst, special: draft.special,
            opponentDeck: draft.special ? [] : draft.opponentDeck.filter(Boolean), note: draft.note.trim(),
            tags: draft.tags, bestOf: draft.bestOf });
        } }, [existing ? tr("保存", "Save") : tr("添加", "Add")])
      ])
    ]);
  }

  // ---------------------------------------------------------------- DECKLIST
  var DECK_CAT_LABELS = [
    { key: "pokemon", zh: "宝可梦", en: "Pokémon" },
    { key: "trainer", zh: "训练家", en: "Trainer" },
    { key: "energy", zh: "能量", en: "Energy" }
  ];
  function catLabel(cat) { return getRegion() === "en" ? cat.en : cat.zh; }

  // A single card tile: renders as text immediately, swaps in card art if/when
  // UI.fetchCardImage resolves (best-effort, no offline database for this).
  function deckCardTile(c) {
    var art = el("div", { class: "decklist-card-art" }, [
      el("span", { class: "decklist-card-name" }, [c.name])
    ]);
    var tile = el("div", { class: "decklist-card", role: "button", tabindex: "0",
      "aria-label": tr("查看 " + c.name, "View " + c.name) }, [
      art,
      el("div", { class: "decklist-card-badge" }, [String(c.count)]),
      el("div", { class: "decklist-card-meta" }, [c.set ? (c.set + " " + c.number) : ""])
    ]);
    var imagePromise = Promise.resolve(null);
    if (window.UI && UI.fetchCardImage) {
      imagePromise = UI.fetchCardImage(c.set, c.number, c.name).then(function (url) {
        if (!url) return;
        var img = el("img", { src: url, alt: c.name, class: "decklist-card-img" });
        img.addEventListener("load", function () {
          art.innerHTML = "";
          art.appendChild(img);
          requestAnimationFrame(function () { tile.classList.add("has-img"); });
        });
        return url;
      });
    }
    function viewCard() {
      imagePromise.then(function (url) { if (url) openCardViewer(c, url); });
    }
    tile.addEventListener("click", viewCard);
    tile.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); viewCard(); }
    });
    return tile;
  }

  function openCardViewer(c, url) {
    showOverlay(el("div", { class: "modal card-view-modal" }, [
      el("div", { class: "grip" }),
      el("button", { class: "card-view-close", "aria-label": tr("关闭", "Close"), onclick: closeOverlay }, ["×"]),
      el("img", { class: "card-view-image", src: url, alt: c.name }),
      el("div", { class: "card-view-info" }, [
        el("div", { class: "card-view-title" }, [c.name]),
        el("div", { class: "card-view-meta" }, [
          (c.set ? c.set + " " + c.number : tr("未标注系列", "No set listed")) + " · " + (c.count || 1) + tr(" 张", "x")
        ])
      ])
    ]));
  }

  // Collapsed by default: rounds are what you check most often, and the
  // card grid is both tall and slow (live per-card API lookups), so the
  // grid isn't built — and no image fetches fire — until the user expands it.
  function renderDecklistSection(t) {
    var list = t.decklist || [];
    if (!list.length) {
      return el("button", { class: "add-round-btn", onclick: function () { openDecklistModal(t); } }, [tr("＋  添加卡组", "＋  Add Decklist")]);
    }
    var totalCards = list.reduce(function (n, c) { return n + (c.count || 1); }, 0);
    var wrap = el("div", { class: "decklist-section" });
    var body = el("div", { class: "decklist-body" });

    var toggle = el("div", { class: "decklist-toggle" }, [
      el("span", {}, [tr("卡组 · 共 " + totalCards + " 张", "Decklist · " + totalCards + " cards")]),
      chevSvg("decklist-toggle-chev")
    ]);
    toggle.addEventListener("click", function () {
      var open = wrap.classList.toggle("open");
      if (open && !body.childNodes.length) {
        DECK_CAT_LABELS.forEach(function (cat) {
          var items = list.filter(function (c) { return c.category === cat.key; });
          if (!items.length) return;
          var catTotal = items.reduce(function (n, c) { return n + (c.count || 1); }, 0);
          body.appendChild(el("div", { class: "decklist-cat-label" }, [catLabel(cat) + " · " + catTotal]));
          var grid = el("div", { class: "decklist-grid" });
          items.forEach(function (c) { grid.appendChild(deckCardTile(c)); });
          body.appendChild(grid);
        });
      }
    });

    wrap.appendChild(el("div", { class: "decklist-head" }, [
      toggle,
      el("div", { class: "detail-tools" }, [
        el("button", { class: "tool", "aria-label": tr("导出卡组", "Export decklist"), title: tr("导出卡组", "Export decklist"), onclick: function () { openDecklistExportModal(t); } },
          [el("img", { src: "assets/icon-export.svg", alt: "" })]),
        el("button", { class: "tool", "aria-label": tr("编辑卡组", "Edit decklist"), title: tr("编辑卡组", "Edit decklist"), onclick: function () { openDecklistModal(t); } },
          [el("img", { src: "assets/icon-edit.svg", alt: "" })])
      ])
    ]));
    wrap.appendChild(body);
    return wrap;
  }

  function openDecklistModal(t) {
    var ta = el("textarea", {
      class: "export-code", placeholder: tr(
        "粘贴卡组文字，例如：\n\nPokémon: 22\n4 Mega Kangaskhan ex MEG 104\n...\n\nTrainer: 28\n...\n\nEnergy: 10\n...",
        "Paste decklist text, e.g.:\n\nPokémon: 22\n4 Mega Kangaskhan ex MEG 104\n...\n\nTrainer: 28\n...\n\nEnergy: 10\n..."),
      style: "width:100%;height:220px;resize:none;font-family:monospace;font-size:12px;" +
             "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
    });
    ta.value = (t.decklist && t.decklist.length) ? S.formatDecklistText(t.decklist) : "";
    var errMsg = el("p", { style: "color:var(--loss-ink);font-size:13px;margin:6px 0 0;display:none" },
      [tr("没能从中识别出任何卡片，请检查格式（每行「数量 卡名 系列缩写 编号」）。",
          "Couldn't recognize any cards — check the format (each line: “count name set number”).")]);

    var saveBtn = el("button", { class: "btn btn-primary", onclick: function () {
      var parsed = S.parseDecklistText(ta.value);
      if (!parsed) { errMsg.style.display = "block"; return; }
      S.updateTournament(t.id, { decklist: parsed.list });
      closeOverlay();
      renderDetail(t.id);
    } }, [tr("保存", "Save")]);

    showOverlay(el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, [tr("卡组", "Decklist")]),
      el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
        tr("粘贴 Limitless / Play!Pokémon 格式的卡组文字（Deck Builder 或 Limitless 都能导出这种格式）。",
           "Paste Limitless / Play!Pokémon-format decklist text (both Deck Builder and Limitless export this format).")
      ]),
      el("div", { class: "field" }, [ta]),
      errMsg,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("取消", "Cancel")]),
        saveBtn
      ])
    ]));
    setTimeout(function () { ta.focus(); }, 100);
  }

  function openDecklistExportModal(t) {
    var code = S.formatDecklistText(t.decklist || []);
    var ta = el("textarea", {
      class: "export-code", readonly: "readonly",
      style: "width:100%;height:220px;resize:none;font-family:monospace;font-size:12px;" +
             "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
    });
    ta.value = code;

    var copyBtn = el("button", { class: "btn btn-primary", onclick: function () {
      navigator.clipboard ? navigator.clipboard.writeText(code).then(function () {
        copyBtn.textContent = tr("已复制 ✓", "Copied ✓");
        setTimeout(function () { copyBtn.textContent = tr("复制文字", "Copy Text"); }, 2000);
      }) : (ta.select(), document.execCommand("copy"), copyBtn.textContent = tr("已复制 ✓", "Copied ✓"));
    } }, [tr("复制文字", "Copy Text")]);

    showOverlay(el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, [tr("导出卡组", "Export Decklist")]),
      el("div", { class: "field" }, [ta]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("关闭", "Close")]),
        copyBtn
      ])
    ]));
    setTimeout(function () { ta.select(); }, 100);
  }

  // ---------------------------------------------------------------- STATS
  var statsFormatFilter = "";

  function openDataManagementModal() {
    function action(title, copy, handler) {
      return el("button", { class: "data-manage-action", onclick: function () {
        closeOverlay();
        handler();
      } }, [
        el("span", { class: "dma-copy" }, [
          el("strong", {}, [title]),
          el("small", {}, [copy])
        ]),
        el("span", { class: "dma-arrow", "aria-hidden": "true" }, ["›"])
      ]);
    }
    var regionLabel = getRegion() === "en" ? "International English" : "简体中文";
    showOverlay(el("div", { class: "modal data-manage-modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, [tr("数据管理", "Data & Settings")]),
      el("p", { class: "data-manage-intro" }, [tr("数据只保存在当前设备，建议比赛后定期备份。", "Data only lives on this device — back it up regularly after events.")]),
      action(tr("地区与语言", "Region & Language"), regionLabel, function () { showRegionPicker(true); }),
      action(tr("备份全部数据", "Back Up All Data"), tr("生成一段可保存到备忘录的代码", "Generate a code you can save anywhere"), openBackupExportModal),
      action(tr("恢复备份", "Restore Backup"), tr("从之前保存的代码追加锦标赛", "Append tournaments from a saved code"), openBackupImportModal)
    ]));
  }

  // First-launch (dismissible=false, blocks the app until a region is chosen)
  // or a Settings-triggered switch (dismissible=true). Region is a lens over
  // per-tournament data (see renderList/renderStats) — switching it never
  // deletes anything, it just changes which tournaments/categories you see.
  function showRegionPicker(dismissible) {
    function pick(r) {
      setRegion(r);
      applyRegionChrome();
      closeOverlay();
      router();
    }
    showOverlay(el("div", { class: "modal region-picker" }, [
      dismissible ? el("div", { class: "grip" }) : null,
      el("h2", {}, ["地区与语言 / Region & Language"]),
      el("p", { class: "data-manage-intro" }, [
        "选择你参赛的赛事体系，之后可以随时在「设置」里切换。 / Choose which event system you play in — switch anytime in Settings."
      ]),
      el("button", { class: "btn btn-primary", style: "margin-bottom:10px", onclick: function () { pick("zh"); } }, ["简体中文"]),
      el("button", { class: "btn btn-ghost", onclick: function () { pick("en"); } }, ["International English"])
    ]), dismissible);
  }

  function renderStats() {
    main.innerHTML = "";
    main.appendChild(el("div", { class: "stats-title-row" }, [
      el("div", { class: "page-title" }, [tr("数据", "Stats")]),
      el("button", { class: "data-manage-trigger", onclick: openDataManagementModal }, [tr("数据管理", "Settings")])
    ]));
    main.appendChild(el("p", { class: "page-sub" }, [tr("整体胜率、卡组表现与对位统计", "Overall win rate, deck performance, and matchup stats")]));

    var region = getRegion();
    // Standard rotates, so all-time stats mixing multiple formats aren't
    // really comparable — offer a filter once there's more than one format
    // in the (region-scoped) data.
    var formats = S.loadTournaments().filter(function (t) { return t.region === region; }).map(function (t) { return t.format; })
      .filter(function (f, i, a) { return f && a.indexOf(f) === i; });
    if (formats.length > 1) {
      var fmtPills = pillFilter(tr("全部赛制", "All Formats"), formats, statsFormatFilter, function (v) { statsFormatFilter = v; renderStats(); });
      main.appendChild(el("div", { class: "filters" }, [fmtPills]));
    } else {
      statsFormatFilter = "";
    }

    var s = S.computeStats(statsFormatFilter || undefined, region);

    if (!s.games) {
      main.appendChild(statsFormatFilter
        ? emptyState(tr("这个赛制还没有对局", "No games logged for this format yet"), tr("换一个赛制，或继续记录新的比赛。", "Try a different format, or keep logging matches."))
        : emptyState(tr("还没有对局数据", "No games yet"), tr("先到「锦标赛」记录几轮对局，统计会自动生成。", "Log a few rounds under Tournaments and stats will show up here.")));
      return;
    }

    function rate(w, l) { var g = w + l; return g ? Math.round(w / g * 100) + "%" : "—"; }

    // Single overall win-rate = one total split into two — a ring reads
    // better here than a bar. The deck/matchup lists below stay bars,
    // since bars are what actually compare well across many rows at once.
    main.appendChild(el("div", { class: "winrate-hero" }, [
      el("div", { class: "winrate-ring", style: "--wr:" + s.winRate }, [
        el("div", { class: "winrate-ring-hole" }, [
          el("div", { class: "winrate-ring-pct" }, [s.winRate + "%"]),
          el("div", { class: "winrate-ring-cap" }, [tr("总胜率", "Win Rate")])
        ])
      ]),
      el("div", { class: "winrate-hero-side" }, [
        el("div", { class: "whs-row" }, [el("b", {}, [String(s.tournaments)]), tr(" 场锦标赛", " tournaments")]),
        el("div", { class: "whs-row" }, [el("b", {}, [s.wins + "-" + s.losses + (s.ties ? "-" + s.ties : "")]), tr(" 总战绩", " overall record")])
      ])
    ]));

    main.appendChild(el("div", { class: "order-card" }, [
      el("div", { class: "half" }, [
        el("div", { class: "num" }, [rate(s.firstWins, s.firstLosses)]),
        el("div", { class: "cap" }, [tr("先手胜率 · ", "1st-turn win rate · ") + s.firstWins + "-" + s.firstLosses])
      ]),
      el("div", { class: "half" }, [
        el("div", { class: "num" }, [rate(s.secondWins, s.secondLosses)]),
        el("div", { class: "cap" }, [tr("后手胜率 · ", "2nd-turn win rate · ") + s.secondWins + "-" + s.secondLosses])
      ])
    ]));

    function statRow(item, showTags) {
      var icon = item.ids.length
        ? deckSprites(item.ids)
        : el("span", { style: "color:var(--faint);font-size:13px" }, [tr("未设置卡组", "No deck set")]);
      var recText = tr(item.w + "胜 " + item.l + "负" + (item.t ? " " + item.t + "平" : "") + " · 共 " + item.games + " 局",
        item.w + "W " + item.l + "L" + (item.t ? " " + item.t + "T" : "") + " · " + item.games + " games");
      var mid = [
        el("div", { class: "sr-rec" }, [recText]),
        el("div", { class: "wr-bar" }, [el("i", { style: "width:" + item.winRate + "%" })])
      ];
      if (showTags && item.tagCounts) {
        var breakdown = S.ROUND_SKILL_TAG_KEYS
          .map(function (key) { return { key: key, n: item.tagCounts[key] || 0 }; })
          .filter(function (x) { return x.n > 0; })
          .sort(function (a, b) { return b.n - a.n; })
          .map(function (x) {
            var tag = LOSS_TAGS.filter(function (lt) { return lt.key === x.key; })[0];
            return (tag ? tagLabel(tag) : x.key) + " ×" + x.n;
          });
        if (breakdown.length) mid.push(el("div", { class: "sr-tags" }, [tr("常见失误：", "Common mistakes: ") + breakdown.join(tr("、", ", "))]));
      }
      return el("div", { class: "stat-row" }, [
        el("div", { class: "icon-wrap" }, [icon]),
        el("div", { class: "sr-mid" }, mid),
        el("div", { class: "sr-wr" }, [item.winRate + "%"])
      ]);
    }
    // Collapsible per section (open by default — this is the page's main
    // content, unlike the decklist section elsewhere which defaults closed —
    // but as the list of decks/matchups grows over a season, being able to
    // fold either one away individually keeps the page manageable.
    function section(title, list, showTags) {
      var body = el("div", { class: "stat-section-body" });
      if (!list.length) body.appendChild(emptyState(tr("暂无数据", "No data yet"), tr("记录更多完整对局后会显示。", "Log more complete rounds and this will fill in."), true));
      else list.forEach(function (it) { body.appendChild(statRow(it, showTags)); });

      var sec = el("div", { class: "stat-section open" });
      var toggle = el("div", { class: "stat-section-toggle" }, [
        el("h3", {}, [title]),
        chevSvg("stat-section-chev")
      ]);
      toggle.addEventListener("click", function () { sec.classList.toggle("open"); });
      sec.appendChild(toggle);
      sec.appendChild(body);
      return sec;
    }
    main.appendChild(section(tr("我的卡组表现", "My Deck Performance"), s.decks, true));
    main.appendChild(section(tr("对位统计（对手卡组）", "Matchups (Opponent Decks)"), s.matchups));
  }

  // ---------------------------------------------------------------- EXPORT / IMPORT
  function openExportModal(t) {
    S.exportTournament(t).then(function (code) {
      var ta = el("textarea", {
        class: "export-code", readonly: "readonly",
        style: "width:100%;height:110px;resize:none;font-family:monospace;font-size:12px;" +
               "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
      });
      ta.value = code;

      var copyBtn = el("button", { class: "btn btn-primary", onclick: function () {
        navigator.clipboard ? navigator.clipboard.writeText(code).then(function () {
          copyBtn.textContent = tr("已复制 ✓", "Copied ✓");
          setTimeout(function () { copyBtn.textContent = tr("复制代码", "Copy Code"); }, 2000);
        }) : (ta.select(), document.execCommand("copy"), copyBtn.textContent = tr("已复制 ✓", "Copied ✓"));
      } }, [tr("复制代码", "Copy Code")]);

      var byteLen = new TextEncoder().encode(code).length;
      showOverlay(el("div", { class: "modal" }, [
        el("div", { class: "grip" }),
        el("h2", {}, [tr("导出锦标赛", "Export Tournament")]),
        el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
          t.name + " · " + (t.rounds || []).length + tr(" 轮 · ", " rounds · ") + byteLen + tr(" 字节", " bytes")
        ]),
        el("div", { class: "field" }, [ta]),
        el("p", { style: "color:var(--muted);font-size:12px;margin:4px 0 12px" }, [
          tr("复制后可保存到备忘录、微信等任何地方，需要时粘贴导入还原。",
             "Copy this anywhere (Notes, chat, etc.) and paste it back in later to restore.")
        ]),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("关闭", "Close")]),
          copyBtn
        ])
      ]));
      // auto-select for easy copy
      setTimeout(function () { ta.select(); }, 100);
    });
  }

  function openImportModal() {
    var ta = el("textarea", {
      class: "export-code",
      placeholder: tr("粘贴导出的代码…", "Paste the exported code…"),
      style: "width:100%;height:110px;resize:none;font-family:monospace;font-size:12px;" +
             "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
    });
    var errMsg = el("p", { style: "color:var(--loss-ink);font-size:13px;margin:6px 0 0;display:none" },
      [tr("代码无效，请检查是否复制完整。", "Invalid code — check that you copied all of it.")]);

    var importBtn = el("button", { class: "btn btn-primary", onclick: function () {
      S.importTournament(ta.value).then(function (data) {
        if (!data) { errMsg.style.display = "block"; return; }
        var t = S.addTournament(data);
        // addRound re-assigns number + id so pass stripped round data
        (data.rounds || []).forEach(function (r) {
          S.addRound(t.id, { result: r.result, wentFirst: r.wentFirst, special: r.special,
            opponentDeck: r.opponentDeck, note: r.note, tags: r.tags, bestOf: r.bestOf });
        });
        closeOverlay();
        location.hash = "#/t/" + t.id;
      });
    } }, [tr("导入", "Import")]);

    showOverlay(el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, [tr("导入锦标赛", "Import Tournament")]),
      el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
        tr("将之前导出的代码粘贴到下方，点击导入还原锦标赛。", "Paste a previously exported code below, then tap Import to restore it.")
      ]),
      el("div", { class: "field" }, [ta]),
      errMsg,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("取消", "Cancel")]),
        importBtn
      ])
    ]));
    setTimeout(function () { ta.focus(); }, 100);
  }

  // ---------------------------------------------------------------- BACKUP / RESTORE (all tournaments)
  function openBackupExportModal() {
    S.exportAllTournaments().then(function (code) {
      var ta = el("textarea", {
        class: "export-code", readonly: "readonly",
        style: "width:100%;height:140px;resize:none;font-family:monospace;font-size:12px;" +
               "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
      });
      ta.value = code;

      var copyBtn = el("button", { class: "btn btn-primary", onclick: function () {
        navigator.clipboard ? navigator.clipboard.writeText(code).then(function () {
          copyBtn.textContent = tr("已复制 ✓", "Copied ✓");
          setTimeout(function () { copyBtn.textContent = tr("复制代码", "Copy Code"); }, 2000);
        }) : (ta.select(), document.execCommand("copy"), copyBtn.textContent = tr("已复制 ✓", "Copied ✓"));
      } }, [tr("复制代码", "Copy Code")]);

      var n = S.loadTournaments().length;
      var byteLen = new TextEncoder().encode(code).length;
      showOverlay(el("div", { class: "modal" }, [
        el("div", { class: "grip" }),
        el("h2", {}, [tr("备份全部数据", "Back Up All Data")]),
        el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
          tr("共 " + n + " 个锦标赛 · " + byteLen + " 字节", n + " tournaments · " + byteLen + " bytes")
        ]),
        el("div", { class: "field" }, [ta]),
        el("p", { style: "color:var(--muted);font-size:12px;margin:4px 0 12px" }, [
          tr("复制后存到备忘录、微信收藏等地方。数据只存在这台设备的浏览器里——换手机、删除主屏幕图标都可能清空数据，定期备份才安全。",
             "Copy this somewhere safe (Notes, chat, etc.). Data only lives in this device's browser — switching phones or deleting the Home Screen icon can wipe it, so back up regularly.")
        ]),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("关闭", "Close")]),
          copyBtn
        ])
      ]));
      setTimeout(function () { ta.select(); }, 100);
    });
  }

  function openBackupImportModal() {
    var ta = el("textarea", {
      class: "export-code",
      placeholder: tr("粘贴备份代码…", "Paste the backup code…"),
      style: "width:100%;height:140px;resize:none;font-family:monospace;font-size:12px;" +
             "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
    });
    var errMsg = el("p", { style: "color:var(--loss-ink);font-size:13px;margin:6px 0 0;display:none" },
      [tr("代码无效，请检查是否复制完整。", "Invalid code — check that you copied all of it.")]);

    var importBtn = el("button", { class: "btn btn-primary", onclick: function () {
      S.importAllTournaments(ta.value).then(function (list) {
        if (!list) { errMsg.style.display = "block"; return; }
        list.forEach(function (data) {
          var t = S.addTournament(data);
          (data.rounds || []).forEach(function (r) {
            S.addRound(t.id, { result: r.result, wentFirst: r.wentFirst, special: r.special,
              opponentDeck: r.opponentDeck, note: r.note, tags: r.tags, bestOf: r.bestOf });
          });
        });
        closeOverlay();
        location.hash = "#/tournaments";
      });
    } }, [tr("导入", "Import")]);

    showOverlay(el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, [tr("恢复备份", "Restore Backup")]),
      el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
        tr("粘贴之前「备份全部数据」生成的代码。会追加到现有锦标赛之后，不会覆盖或删除已有数据。",
           "Paste a code generated by “Back Up All Data”. This appends to your existing tournaments — nothing is overwritten or deleted.")
      ]),
      el("div", { class: "field" }, [ta]),
      errMsg,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, [tr("取消", "Cancel")]),
        importBtn
      ])
    ]));
    setTimeout(function () { ta.focus(); }, 100);
  }

  // ---------------------------------------------------------------- OVERLAY
  function showOverlay(node, dismissible) {
    var ov = el("div", { class: "overlay", onclick: function (e) { if (dismissible !== false && e.target === ov) closeOverlay(); } }, [node]);
    ov.id = "overlay";
    document.body.appendChild(ov);
  }
  function closeOverlay() { var o = document.getElementById("overlay"); if (o) o.remove(); }

  // ---------------------------------------------------------------- ROUTER
  function setActiveNav(route) {
    document.querySelectorAll(".tabbar a[data-route]").forEach(function (n) {
      n.classList.toggle("active", n.getAttribute("data-route") === route);
    });
  }
  function router() {
    var h = location.hash || "#/tournaments";
    main.scrollTop = 0;
    if (h.indexOf("#/t/") === 0) { setActiveNav("tournaments"); renderDetail(h.slice(4)); }
    else if (h === "#/stats") { setActiveNav("stats"); renderStats(); }
    else { setActiveNav("tournaments"); renderList(); }
  }

  // ── storage health banner ────────────────────────────────────────────────
  // Detect Private Mode / WebView / blocked storage and warn the user.
  function showStorageWarning() {
    var phone = document.querySelector(".phone");
    if (!phone || document.getElementById("sw-warn")) return;
    var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    var msg = isWeChat
      ? tr("你在微信内打开了此页面。微信浏览器不会保存数据，请点击右上角「⋯」→「在浏览器中打开」，用 Safari 打开后再使用。",
           "You opened this page inside WeChat, which doesn't save data. Tap “⋯” → “Open in Browser” and use Safari instead.")
      : tr("检测到数据无法保存（可能开启了无痕浏览）。请关闭私密模式，用普通 Safari 打开此页面，数据才能正常记录。",
           "Data can't be saved right now (Private Browsing may be on). Turn it off and open this page in normal Safari.");
    var banner = el("div", { class: "storage-warn", id: "sw-warn" }, [
      el("span", { class: "sw-icon" }, ["⚠️"]),
      el("div", { class: "sw-text" }, [
        el("strong", {}, [tr("数据无法保存！", "Data can't be saved!")]),
        msg
      ])
    ]);
    // insert before the content area
    var content = document.getElementById("main");
    phone.insertBefore(banner, content);
  }

  window._onStorageFail = showStorageWarning;

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", function () {
    main = document.getElementById("main");
    // iOS's native "tap the status bar to scroll to top" only works on the
    // real document scroll — .content scrolls internally now (see .phone's
    // height fix), so that gesture can't reach it. Tapping the app's own
    // topbar is the closest equivalent and is a pattern users already know
    // from other apps (Twitter/X etc.).
    var topbar = document.querySelector(".topbar");
    if (topbar) topbar.addEventListener("click", function () { main.scrollTo({ top: 0, behavior: "smooth" }); });
    // check immediately on load
    if (!S.isStorageOk()) showStorageWarning();
    applyRegionChrome();
    // Existing installs already have 简中 data and never chose a region — they
    // get silently migrated to zh rather than being interrupted by a picker.
    // A genuinely fresh install (no region key AND no tournaments) is the
    // only case that blocks on the first-launch picker.
    if (!localStorage.getItem(REGION_KEY)) {
      if (S.loadTournaments().length > 0) {
        setRegion("zh");
        applyRegionChrome();
        router();
      } else {
        showRegionPicker(false);
      }
    } else {
      router();
    }
  });
})();
