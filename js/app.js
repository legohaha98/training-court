/* Bootstrap, hash routing, and page rendering (mobile / 小程序-style web build). */
(function () {
  var el = UI.el, deckSprites = UI.deckSprites, sprite = UI.sprite;
  var S = Store;

  var CATEGORIES = ["店赛", "城市赛", "超级赛", "高级赛", "大师赛", "世界赛", "线上对战", "其他"];
  var PLACEMENTS = ["", "冠军", "亚军", "四强", "八强", "十六强", "三十二强", "六十四强"];

  // result / outcome display helpers
  function resLabel(r) {
    if (r.special === "BYE" || r.special === "NO_SHOW") return "胜";
    return r.result === "W" ? "胜" : r.result === "L" ? "负" : "";
  }
  function rowClass(r) {
    if (r.result === "W" || r.special === "BYE" || r.special === "NO_SHOW") return "win";
    if (r.result === "L") return "loss";
    return "tie";
  }
  function specialText(s) { return s === "BYE" ? "轮空" : s === "NO_SHOW" ? "对手弃赛" : ""; }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  var main;

  // ---------------------------------------------------------------- LIST
  var listFilters = { category: "", format: "" };

  function renderList() {
    var all = S.loadTournaments();
    var formats = all.map(function (t) { return t.format; })
      .filter(function (f, i, a) { return f && a.indexOf(f) === i; });

    main.innerHTML = "";
    main.appendChild(el("div", { class: "page-title" }, ["锦标赛"]));
    main.appendChild(el("p", { class: "page-sub" }, ["记录你的 TCG 锦标赛、每轮对局与对位"]));
    main.appendChild(el("div", { class: "list-actions" }, [
      el("button", { class: "btn btn-primary", style: "flex:1", onclick: function () { openTournamentModal(null); } }, ["＋  新建锦标赛"]),
      el("button", { class: "tool import-btn", title: "导入锦标赛",
        onclick: openImportModal },
        [el("img", { src: "assets/icon-import.svg", alt: "" })])
    ]));

    var catSel = el("select", { class: "select", onchange: function () { listFilters.category = this.value; renderList(); } },
      [el("option", { value: "" }, ["全部分类"])].concat(CATEGORIES.map(function (c) {
        return el("option", { value: c, selected: listFilters.category === c ? "selected" : null }, [c]);
      })));
    var fmtSel = el("select", { class: "select", onchange: function () { listFilters.format = this.value; renderList(); } },
      [el("option", { value: "" }, ["全部赛制"])].concat(formats.map(function (f) {
        return el("option", { value: f, selected: listFilters.format === f ? "selected" : null }, [f]);
      })));
    main.appendChild(el("div", { class: "filters" }, [catSel, fmtSel]));

    var filtered = all.filter(function (t) {
      return (!listFilters.category || t.category === listFilters.category) &&
             (!listFilters.format || t.format === listFilters.format);
    });

    if (!filtered.length) {
      main.appendChild(el("div", { class: "empty" }, ["还没有锦标赛，点击「新建锦标赛」开始记录吧。"]));
      return;
    }

    var list = el("div", { class: "card-list" });
    filtered.forEach(function (t) {
      var rec = S.computeRecord(t.rounds);
      list.appendChild(el("div", { class: "t-card", onclick: function () { location.hash = "#/t/" + t.id; } }, [
        el("div", { class: "icon-wrap" }, [deckSprites(t.deck)]),
        el("div", { class: "t-meta" }, [
          el("div", { class: "name" }, [t.name]),
          el("div", { class: "date" }, [fmtDate(t.date)])
        ]),
        el("div", { class: "t-record" }, [
          el("div", { class: "rec" }, [rec.label]),
          t.placement ? el("div", { class: "place" }, [t.placement]) : null
        ])
      ]));
    });
    main.appendChild(list);
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
      deck: []
    };
    var deckPicks = [(existing && existing.deck[0]) || null, (existing && existing.deck[1]) || null];

    var nameI = el("input", { class: "input", placeholder: "锦标赛名称", value: draft.name, oninput: function () { draft.name = this.value; refreshBtn(); } });
    var dateI = el("input", { class: "input", type: "date", value: draft.date, oninput: function () { draft.date = this.value; } });
    var catI = el("select", { class: "select", onchange: function () { draft.category = this.value; } },
      [el("option", { value: "" }, ["选择赛事分类"])].concat(CATEGORIES.map(function (c) {
        return el("option", { value: c, selected: draft.category === c ? "selected" : null }, [c]);
      })));
    var fmtI = el("input", { class: "input", placeholder: "赛制（如 BRS-SSP）", value: draft.format, oninput: function () { draft.format = this.value; } });
    var placeI = el("select", { class: "select", onchange: function () { draft.placement = this.value; } },
      [el("option", { value: "" }, ["名次（可选）"])].concat(PLACEMENTS.slice(1).map(function (p) {
        return el("option", { value: p, selected: draft.placement === p ? "selected" : null }, [p]);
      })));

    var deckRow = el("div", { class: "two-col" }, [
      UI.PokemonPicker({ value: deckPicks[0], onChange: function (id) { deckPicks[0] = id; } }),
      UI.PokemonPicker({ value: deckPicks[1], onChange: function (id) { deckPicks[1] = id; } })
    ]);

    var saveBtn = el("button", { class: "btn btn-primary", disabled: draft.name.trim() ? null : "disabled", onclick: submit }, [editing ? "保存" : "创建"]);
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
      el("h2", {}, [editing ? "编辑锦标赛" : "新建锦标赛"]),
      el("div", { class: "field" }, [nameI]),
      el("div", { class: "field" }, [dateI]),
      el("div", { class: "field" }, [catI]),
      el("div", { class: "field" }, [fmtI]),
      el("div", { class: "field" }, [placeI]),
      el("label", { class: "lbl" }, ["我的卡组"]),
      deckRow,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, ["取消"]),
        saveBtn
      ])
    ]);
    showOverlay(modal);
  }

  // ---------------------------------------------------------------- DETAIL
  function renderDetail(id) {
    var t = S.getTournament(id);
    main.innerHTML = "";
    if (!t) { main.appendChild(el("div", { class: "empty" }, ["找不到该锦标赛。"])); return; }
    var rec = S.computeRecord(t.rounds);

    main.appendChild(el("div", { class: "detail-bar" }, [
      el("a", { class: "back-btn", href: "#/tournaments" }, [
        el("img", { src: "assets/icon-back.svg", alt: "" }), "返回"
      ]),
      el("div", { class: "detail-tools" }, [
        el("button", { class: "tool", "aria-label": "导出", title: "导出锦标赛", onclick: function () { openExportModal(t); } },
          [el("img", { src: "assets/icon-export.svg", alt: "" })]),
        el("button", { class: "tool", "aria-label": "编辑锦标赛", title: "编辑锦标赛", onclick: function () { openTournamentModal(t); } },
          [el("img", { src: "assets/icon-edit.svg", alt: "" })]),
        el("button", { class: "tool", "aria-label": "删除锦标赛", title: "删除锦标赛", onclick: function () {
          if (confirm("确定删除该锦标赛？")) { S.deleteTournament(id); location.hash = "#/tournaments"; }
        } }, [el("img", { src: "assets/icon-trash.svg", alt: "" })])
      ])
    ]));
    main.appendChild(el("div", { class: "detail-head" }, [
      el("div", { class: "left" }, [
        el("h1", {}, [t.name]),
        el("div", { class: "date" }, [fmtDate(t.date)])
      ]),
      el("div", { class: "right" }, [
        el("div", { class: "big-rec" }, [rec.label]),
        deckSprites(t.deck)
      ])
    ]));
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
            // update header record
            var newRec = S.computeRecord(t.rounds);
            main.querySelector(".big-rec").textContent = newRec.label;
          }));
          return;
        }
        var opp = r.special
          ? el("div", { class: "opp" }, [el("span", { class: "opp-text" }, [specialText(r.special)])])
          : el("div", { class: "opp" }, (r.opponentDeck || []).map(function (pid) { return sprite(pid); }));
        var orderBadge = r.wentFirst === true  ? el("span", { class: "order-badge" }, ["先"])
                       : r.wentFirst === false ? el("span", { class: "order-badge" }, ["后"])
                       : null;
        rounds.appendChild(el("div", { class: "round-row " + rowClass(r) }, [
          el("div", { class: "rnum" }, [String(r.number)]),
          opp,
          orderBadge,
          el("div", { class: "res" }, [resLabel(r)]),
          el("div", { class: "edit", title: "编辑该轮",
            onclick: function () { editingRid = r.id; renderRounds(); } },
            [el("img", { src: "assets/icon-edit.svg", alt: "编辑" })]),
          el("div", { class: "del", html: "✕", title: "删除该轮",
            onclick: function () { S.deleteRound(id, r.id); t = S.getTournament(id); renderRounds();
              var newRec = S.computeRecord(t.rounds); main.querySelector(".big-rec").textContent = newRec.label; } })
        ]));
      });
    }
    renderRounds();
    main.appendChild(rounds);

    var addArea = el("div", {});
    main.appendChild(addArea);
    main.appendChild(el("button", { class: "add-round-btn", onclick: function () {
      addArea.innerHTML = "";
      addArea.appendChild(roundForm(t, null, function (patch) {
        if (patch) { S.addRound(id, patch); t = S.getTournament(id); renderRounds();
          var newRec = S.computeRecord(t.rounds); main.querySelector(".big-rec").textContent = newRec.label; }
        addArea.innerHTML = "";
      }));
      addArea.scrollIntoView({ behavior: "smooth", block: "center" });
    } }, ["＋  添加一轮"]));
  }

  // inline add/edit-round form
  // existing=null -> add new;  existing=round object -> edit that round
  // done(patch) called with the data object on save, or done(null) on cancel
  function roundForm(t, existing, done) {
    var draft = existing
      ? { opponentDeck: [(existing.opponentDeck||[])[0]||null, (existing.opponentDeck||[])[1]||null],
          result: existing.result || "W", wentFirst: existing.wentFirst !== undefined ? existing.wentFirst : null,
          special: existing.special || "" }
      : { opponentDeck: [null, null], result: "W", wentFirst: null, special: "" };

    var resultSeg = el("div", { class: "seg" }, ["W", "L"].map(function (v) {
      return el("div", { class: "opt", "data-v": v, onclick: function () { draft.result = v; draft.special = ""; sync(); } },
        [v === "W" ? "胜" : "负"]);
    }));
    var orderSeg = el("div", { class: "seg small" }, [["先手", true], ["后手", false]].map(function (o) {
      return el("div", { class: "opt", onclick: function () { draft.wentFirst = (draft.wentFirst === o[1]) ? null : o[1]; sync(); } }, [o[0]]);
    }));
    var outcomeSeg = el("div", { class: "seg small" }, [["轮空", "BYE"], ["对手弃赛", "NO_SHOW"]].map(function (o) {
      return el("div", { class: "opt", onclick: function () {
        draft.special = draft.special === o[1] ? "" : o[1]; sync();
      } }, [o[0]]);
    }));

    var deckRow = el("div", { class: "two-col" }, [
      UI.PokemonPicker({ value: draft.opponentDeck[0], onChange: function (id) { draft.opponentDeck[0] = id; } }),
      UI.PokemonPicker({ value: draft.opponentDeck[1], onChange: function (id) { draft.opponentDeck[1] = id; } })
    ]);

    function sync() {
      var ro = resultSeg.children;
      ro[0].className = "opt" + (!draft.special && draft.result === "W" ? " sel-w" : "");
      ro[1].className = "opt" + (!draft.special && draft.result === "L" ? " sel-l" : "");
      var oo = orderSeg.children;
      oo[0].className = "opt" + (draft.wentFirst === true ? " sel" : "");
      oo[1].className = "opt" + (draft.wentFirst === false ? " sel" : "");
      var so = outcomeSeg.children;
      so[0].className = "opt" + (draft.special === "BYE" ? " sel" : "");
      so[1].className = "opt" + (draft.special === "NO_SHOW" ? " sel" : "");
    }
    sync();

    var roundNum = existing ? existing.number : t.rounds.length + 1;
    return el("div", { class: "form-card" }, [
      el("h3", {}, ["第 " + roundNum + " 轮" + (existing ? " · 编辑" : "")]),
      el("label", { class: "lbl" }, ["对手卡组"]),
      deckRow,
      el("label", { class: "lbl" }, ["比赛结果"]),
      resultSeg,
      orderSeg,
      el("label", { class: "lbl" }, ["其他结果"]),
      outcomeSeg,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: function () { done(null); } }, ["取消"]),
        el("button", { class: "btn btn-primary", onclick: function () {
          done({ result: draft.result, wentFirst: draft.wentFirst, special: draft.special,
            opponentDeck: draft.special ? [] : draft.opponentDeck.filter(Boolean) });
        } }, [existing ? "保存" : "添加"])
      ])
    ]);
  }

  // ---------------------------------------------------------------- STATS
  function renderStats() {
    var s = S.computeStats();
    main.innerHTML = "";
    main.appendChild(el("div", { class: "page-title" }, ["数据"]));
    main.appendChild(el("p", { class: "page-sub" }, ["整体胜率、卡组表现与对位统计"]));

    if (!s.games) {
      main.appendChild(el("div", { class: "empty" }, ["还没有对局数据。先到「锦标赛」记录几轮对局吧。"]));
      return;
    }

    function tile(num, cap, accent) {
      return el("div", { class: "stat-tile" }, [
        el("div", { class: "num" + (accent ? " accent" : "") }, [num]),
        el("div", { class: "cap" }, [cap])
      ]);
    }
    function rate(w, l) { var g = w + l; return g ? Math.round(w / g * 100) + "%" : "—"; }

    main.appendChild(el("div", { class: "stat-grid" }, [
      tile(String(s.tournaments), "锦标赛"),
      tile(s.winRate + "%", "总胜率", true),
      tile(s.wins + "-" + s.losses, "总战绩")
    ]));

    main.appendChild(el("div", { class: "order-card" }, [
      el("div", { class: "half" }, [
        el("div", { class: "num" }, [rate(s.firstWins, s.firstLosses)]),
        el("div", { class: "cap" }, ["先手胜率 · " + s.firstWins + "-" + s.firstLosses])
      ]),
      el("div", { class: "half" }, [
        el("div", { class: "num" }, [rate(s.secondWins, s.secondLosses)]),
        el("div", { class: "cap" }, ["后手胜率 · " + s.secondWins + "-" + s.secondLosses])
      ])
    ]));

    function statRow(item) {
      var icon = item.ids.length
        ? deckSprites(item.ids)
        : el("span", { style: "color:var(--faint);font-size:13px" }, ["未设置卡组"]);
      return el("div", { class: "stat-row" }, [
        el("div", { class: "icon-wrap" }, [icon]),
        el("div", { class: "sr-mid" }, [
          el("div", { class: "sr-rec" }, [item.w + "胜 " + item.l + "负 · 共 " + item.games + " 局"]),
          el("div", { class: "wr-bar" }, [el("i", { style: "width:" + item.winRate + "%" })])
        ]),
        el("div", { class: "sr-wr" }, [item.winRate + "%"])
      ]);
    }
    function section(title, list) {
      var sec = el("div", { class: "stat-section" }, [el("h3", {}, [title])]);
      if (!list.length) sec.appendChild(el("div", { class: "empty", style: "padding:18px" }, ["暂无数据"]));
      else list.forEach(function (it) { sec.appendChild(statRow(it)); });
      return sec;
    }
    main.appendChild(section("我的卡组表现", s.decks));
    main.appendChild(section("对位统计（对手卡组）", s.matchups));
  }

  // ---------------------------------------------------------------- EXPORT / IMPORT
  function openExportModal(t) {
    var code = S.exportTournament(t);
    var ta = el("textarea", {
      class: "export-code", readonly: "readonly",
      style: "width:100%;height:110px;resize:none;font-family:monospace;font-size:12px;" +
             "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
    });
    ta.value = code;

    var copyBtn = el("button", { class: "btn btn-primary", onclick: function () {
      navigator.clipboard ? navigator.clipboard.writeText(code).then(function () {
        copyBtn.textContent = "已复制 ✓";
        setTimeout(function () { copyBtn.textContent = "复制代码"; }, 2000);
      }) : (ta.select(), document.execCommand("copy"), copyBtn.textContent = "已复制 ✓");
    } }, ["复制代码"]);

    var byteLen = new TextEncoder().encode(code).length;
    showOverlay(el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, ["导出锦标赛"]),
      el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
        t.name + " · " + (t.rounds || []).length + " 轮 · " + byteLen + " 字节"
      ]),
      el("div", { class: "field" }, [ta]),
      el("p", { style: "color:var(--muted);font-size:12px;margin:4px 0 12px" }, [
        "复制后可保存到备忘录、微信等任何地方，需要时粘贴导入还原。"
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, ["关闭"]),
        copyBtn
      ])
    ]));
    // auto-select for easy copy
    setTimeout(function () { ta.select(); }, 100);
  }

  function openImportModal() {
    var ta = el("textarea", {
      class: "export-code",
      placeholder: "粘贴导出的代码…",
      style: "width:100%;height:110px;resize:none;font-family:monospace;font-size:12px;" +
             "border:1px solid var(--line);border-radius:10px;padding:10px;background:#f4f5f8;"
    });
    var errMsg = el("p", { style: "color:var(--loss-ink);font-size:13px;margin:6px 0 0;display:none" },
      ["代码无效，请检查是否复制完整。"]);

    var importBtn = el("button", { class: "btn btn-primary", onclick: function () {
      var data = S.importTournament(ta.value);
      if (!data) { errMsg.style.display = "block"; return; }
      var t = S.addTournament(data);
      // addRound re-assigns number + id so pass stripped round data
      (data.rounds || []).forEach(function (r) {
        S.addRound(t.id, { result: r.result, wentFirst: r.wentFirst, special: r.special,
          opponentDeck: r.opponentDeck });
      });
      closeOverlay();
      location.hash = "#/t/" + t.id;
    } }, ["导入"]);

    showOverlay(el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      el("h2", {}, ["导入锦标赛"]),
      el("p", { style: "color:var(--muted);font-size:13px;margin:0 0 10px" }, [
        "将之前导出的代码粘贴到下方，点击导入还原锦标赛。"
      ]),
      el("div", { class: "field" }, [ta]),
      errMsg,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeOverlay }, ["取消"]),
        importBtn
      ])
    ]));
    setTimeout(function () { ta.focus(); }, 100);
  }

  // ---------------------------------------------------------------- OVERLAY
  function showOverlay(node) {
    var ov = el("div", { class: "overlay", onclick: function (e) { if (e.target === ov) closeOverlay(); } }, [node]);
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
      ? "你在微信内打开了此页面。微信浏览器不会保存数据，请点击右上角「⋯」→「在浏览器中打开」，用 Safari 打开后再使用。"
      : "检测到数据无法保存（可能开启了无痕浏览）。请关闭私密模式，用普通 Safari 打开此页面，数据才能正常记录。";
    var banner = el("div", { class: "storage-warn", id: "sw-warn" }, [
      el("span", { class: "sw-icon" }, ["⚠️"]),
      el("div", { class: "sw-text" }, [
        el("strong", {}, ["数据无法保存！"]),
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
    // check immediately on load
    if (!S.isStorageOk()) showStorageWarning();
    router();
  });
})();
