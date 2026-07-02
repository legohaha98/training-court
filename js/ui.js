/* Small DOM helpers + the searchable Pokémon picker (shared by modal & forms). */
(function () {
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  var byId = {};
  (window.POKEMON || []).forEach(function (p) { byId[p.id] = p; });

  // bump SPRITE_V whenever the sprite files change, to bust the browser image cache
  var SPRITE_V = "4";
  function spriteUrl(id) { return "assets/sprites/" + id + ".png?v=" + SPRITE_V; }
  function pokeName(id) { return byId[id] ? byId[id].name : ""; }

  function sprite(id, cls) {
    var img = el("img", { src: spriteUrl(id), class: "sp " + (cls || ""), alt: pokeName(id), title: pokeName(id) });
    img.addEventListener("error", function () { img.style.visibility = "hidden"; });
    return img;
  }

  function deckSprites(ids, cls) {
    var wrap = el("div", { class: "deck-sprites " + (cls || "") });
    (ids || []).forEach(function (id) { wrap.appendChild(sprite(id)); });
    return wrap;
  }

  /* Card-art lookup for decklist cards, via the public pokemontcg.io API
   * (set.ptcgoCode + number — the same set-code scheme used in the pasted
   * Play!Pokémon decklist text, e.g. "MEG 104"). In-memory only for this
   * session; no bundled offline database like the Pokémon sprites have, so
   * this is best-effort — a lookup miss/offline just leaves the plain-text
   * card row in place (see deckCardTile in app.js). */
  var _cardImgCache = {};
  function fetchCardImage(set, number) {
    if (!set || !number) return Promise.resolve(null);
    var key = set + "|" + number;
    if (Object.prototype.hasOwnProperty.call(_cardImgCache, key)) return Promise.resolve(_cardImgCache[key]);
    var url = "https://api.pokemontcg.io/v2/cards?q=" + encodeURIComponent("set.ptcgoCode:" + set + " number:" + number);
    return fetch(url).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var card = data && data.data && data.data[0];
        var img = card && card.images && (card.images.small || card.images.large) || null;
        _cardImgCache[key] = img;
        return img;
      })
      .catch(function () { _cardImgCache[key] = null; return null; });
  }

  /* PokemonPicker — opens a full-screen bottom sheet on mobile so the user
   * always has the full viewport height to scroll, regardless of where the
   * picker box sits on the page.
   * opts = { value, onChange(idOrNull) } ; returns a DOM element. */
  function PokemonPicker(opts) {
    var value = opts.value || null;
    var root = el("div", { class: "picker" });
    var sheet = null;          // the full-screen overlay, appended to body
    var syncViewport = null;   // set in openSheet, cleared/removed in closeSheet

    function renderBox() {
      root.innerHTML = "";
      var box = el("div", { class: "picker-box" + (value ? " has" : "") });
      if (value) {
        box.appendChild(sprite(value));
        box.appendChild(el("span", { class: "nm" }, [pokeName(value)]));
        box.appendChild(el("span", {
          class: "clear-x", html: "&times;",
          onclick: function (e) {
            e.stopPropagation();
            value = null; opts.onChange(null); renderBox();
          }
        }));
      } else {
        box.appendChild(el("span", { class: "nm" }, ["选择宝可梦…"]));
        box.appendChild(el("span", { html: "&#9662;", style: "opacity:.45" }));
      }
      box.addEventListener("click", openSheet);
      root.appendChild(box);
    }

    function openSheet() {
      if (sheet) return;

      // dim backdrop
      sheet = el("div", { class: "picker-overlay" });

      // bottom sheet panel
      var panel = el("div", { class: "picker-sheet" });

      // header row: title + close button
      var header = el("div", { class: "picker-sheet-head" }, [
        el("div", { class: "picker-sheet-grip" }),
        el("div", { class: "picker-sheet-title" }, ["选择宝可梦"]),
        el("button", { class: "picker-sheet-close", html: "&times;", onclick: closeSheet })
      ]);

      // sticky search bar
      var searchWrap = el("div", { class: "picker-search-wrap" });
      var searchEl = el("input", { class: "picker-search-input", placeholder: "搜索…",
        oninput: function () { renderList(this.value); } });
      searchWrap.appendChild(searchEl);

      // "常用" quick-pick row — the Pokémon this user picks most often across
      // every tournament, so common decks don't need to be typed out every time.
      var freqIds = (window.Store && Store.frequentPokemonIds) ? Store.frequentPokemonIds(12) : [];
      var freqWrap = null;
      if (freqIds.length) {
        var freqRow = el("div", { class: "picker-freq-row" }, freqIds.map(function (id) {
          var chip = el("div", { class: "picker-freq-chip" }, [sprite(id), el("span", { class: "nm" }, [pokeName(id)])]);
          chip.addEventListener("click", function () {
            value = id; opts.onChange(id);
            closeSheet(); renderBox();
          });
          return chip;
        }));
        freqWrap = el("div", { class: "picker-freq-wrap" }, [
          el("div", { class: "picker-freq-label" }, ["常用"]),
          freqRow
        ]);
      }

      // scrollable list
      var listEl = el("div", { class: "picker-sheet-list" });

      function renderList(q) {
        q = (q || "").toLowerCase();
        if (freqWrap) freqWrap.style.display = q ? "none" : "";
        listEl.innerHTML = "";
        (window.POKEMON || []).filter(function (p) {
          return p.name.toLowerCase().indexOf(q) !== -1 || (p.nameZh && p.nameZh.indexOf(q) !== -1);
        }).forEach(function (p) {
          var row = el("div", { class: "picker-sheet-opt" + (p.id === value ? " active" : "") }, [
            sprite(p.id),
            el("span", {}, [p.name])
          ]);
          row.addEventListener("click", function () {
            value = p.id; opts.onChange(p.id);
            closeSheet(); renderBox();
          });
          listEl.appendChild(row);
        });
      }

      panel.appendChild(header);
      panel.appendChild(searchWrap);
      if (freqWrap) panel.appendChild(freqWrap);
      panel.appendChild(listEl);
      sheet.appendChild(panel);
      document.body.appendChild(sheet);

      renderList("");

      // close when tapping the dim backdrop (outside the panel)
      sheet.addEventListener("click", function (e) {
        if (e.target === sheet) closeSheet();
      });

      // animate in
      requestAnimationFrame(function () { panel.classList.add("open"); });

      // focus search after animation starts
      setTimeout(function () { searchEl.focus(); }, 80);

      // Keep the sheet's real height/position pinned to the visual viewport —
      // on iOS Safari a fixed-position sheet otherwise keeps its full-screen
      // layout-viewport size when the keyboard opens, so results (especially
      // a single exact-match result) end up hidden behind the keyboard.
      syncViewport = function () {
        var vv = window.visualViewport;
        if (!vv) return;
        sheet.style.height = vv.height + "px";
        sheet.style.top = vv.offsetTop + "px";
      };
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", syncViewport);
        window.visualViewport.addEventListener("scroll", syncViewport);
        syncViewport();
      }
    }

    function closeSheet() {
      if (!sheet) return;
      var panel = sheet.querySelector(".picker-sheet");
      panel.classList.remove("open");
      if (window.visualViewport && syncViewport) {
        window.visualViewport.removeEventListener("resize", syncViewport);
        window.visualViewport.removeEventListener("scroll", syncViewport);
        syncViewport = null;
      }
      panel.addEventListener("transitionend", function () {
        if (sheet) { document.body.removeChild(sheet); sheet = null; }
      }, { once: true });
    }

    renderBox();
    return root;
  }

  window.UI = {
    el: el, sprite: sprite, deckSprites: deckSprites,
    spriteUrl: spriteUrl, pokeName: pokeName, PokemonPicker: PokemonPicker,
    fetchCardImage: fetchCardImage
  };
})();
