/*
 * TRAINING COURT — Service Worker
 * Strategy:
 *   Shell files (HTML/CSS/JS/icons) → pre-cached on install, served cache-first.
 *   Sprites + bundled card art      → lazy cached on first fetch, then cache-first.
 * After the first full visit the app runs 100% offline (except decklist
 * card art that falls all the way through to the live pokemontcg.io
 * lookup — that always needs network, by design; see ui.js fetchCardImage).
 */
var SHELL_V   = "tc-shell-v40";
var SPRITE_V  = "tc-sprites-v1";
var CARD_V    = "tc-cards-v2";

var SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/pokemon.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/app.js",
  "./assets/pokeball.svg",
  "./assets/icon-back.svg",
  "./assets/icon-edit.svg",
  "./assets/icon-trash.svg",
  "./assets/icon-trophy.svg",
  "./assets/icon-chart.svg",
  "./apple-touch-icon.png"
];

// Install: pre-cache the app shell
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL_V)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Activate: delete old caches
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== SHELL_V && k !== SPRITE_V && k !== CARD_V; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// Fetch: cache-first for everything; sprites go into their own cache bucket
self.addEventListener("fetch", function (e) {
  var url = e.request.url;

  // Only handle GET requests on our own origin
  if (e.request.method !== "GET") return;

  var isSprite = url.indexOf("/assets/sprites/") !== -1;
  var isCardImg = url.indexOf("/assets/cards/") !== -1;
  var cacheName = isSprite ? SPRITE_V : isCardImg ? CARD_V : SHELL_V;

  e.respondWith(
    caches.open(cacheName).then(function (cache) {
      return cache.match(e.request).then(function (cached) {
        if (cached) return cached;
        return fetch(e.request).then(function (res) {
          // Only cache valid responses
          if (res && res.status === 200) cache.put(e.request, res.clone());
          return res;
        }).catch(function () {
          // Offline + not cached: return a transparent 1×1 PNG for sprites
          if (isSprite) {
            return new Response(
              new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,
                0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,8,215,99,96,0,
                2,0,0,5,0,1,226,38,5,155,0,0,0,0,73,69,78,68,174,66,96,130]).buffer,
              { headers: { "Content-Type": "image/png" } }
            );
          }
        });
      });
    })
  );
});
