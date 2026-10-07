// Makes SkinSafe work without internet. Registered by js/offline.js as sw.js?v=<app version>, so every published
// version gets its own cache and the old one is deleted when the new one takes over.
//  - App files, product list, ingredient data, fonts, icons: saved on the first visit (precache).
//  - Pages: network first (so updates arrive), the saved copy when offline.
//  - Scanner and photo-reader libraries (unpkg / jsDelivr): saved the first time they load.
//  - Product photos from other sites: saved as you look at them, newest 300 kept.
//  - Online searches (Open Beauty Facts) and version.json are never saved.
var V = new URL(self.location.href).searchParams.get("v") || "dev";
var APP = "skinsafe-app-" + V;
var CDN = "skinsafe-cdn";
var PHOTOS = "skinsafe-photos";
var PHOTO_MAX = 300;

var SHELL = [
  "./", "index.html",
  "styles.css?v=" + V,
  "js/ingredients.js?v=" + V, "js/alerts.js?v=" + V, "js/profile.js?v=" + V, "js/api.js?v=" + V,
  "js/routine.js?v=" + V, "js/hair.js?v=" + V, "js/body.js?v=" + V, "js/ocr.js?v=" + V, "js/app.js?v=" + V, "js/update.js?v=" + V, "js/offline.js?v=" + V,
  "data/catalog.json?v=" + V, "data/names.json?v=" + V, "data/brands.json?v=" + V,
  "fonts/fraunces-soft-600.woff2", "fonts/cormorant-italic.woff2",
  "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "icons/favicon-32.png", "icons/skinsafe-fav-10.png", "icons/skinsafe-touch-10.png"
];
var LIBS = ["https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(APP).then(function (c) {
      // the app itself must save completely, otherwise this install fails and the old version keeps working
      return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () {
      return caches.open(CDN).then(function (c) {
        return Promise.all(LIBS.map(function (u) {
          return c.match(u).then(function (hit) { return hit || fetch(u, { mode: "cors" }).then(function (r) { if (r.ok) return c.put(u, r); }); });
        })).catch(function () {});     // the scanner library is nice to have offline, but never blocks the install
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n.indexOf("skinsafe-app-") === 0 && n !== APP) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function trim(name, max) {
  return caches.open(name).then(function (c) {
    return c.keys().then(function (keys) {
      if (keys.length <= max) return;
      return Promise.all(keys.slice(0, keys.length - max).map(function (k) { return c.delete(k); }));
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (/\/version\.json$/.test(url.pathname) || /\/sw\.js$/.test(url.pathname)) return;     // always live

    if (req.mode === "navigate") {
      e.respondWith(
        fetch(req).then(function (r) {
          if (r.ok) { var copy = r.clone(); caches.open(APP).then(function (c) { c.put("./", copy); }); }
          return r;
        }).catch(function () {
          return caches.open(APP).then(function (c) { return c.match("./").then(function (hit) { return hit || c.match("index.html"); }); });
        })
      );
      return;
    }

    e.respondWith(
      caches.open(APP).then(function (c) {
        var forced = req.cache === "reload" || req.cache === "no-store";
        if (forced) return fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; });
        return c.match(req).then(function (hit) {
          return hit || fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; });
        });
      })
    );
    return;
  }

  if (/(^|\.)openbeautyfacts\.org$/.test(url.hostname)) return;     // online lookups: network only, the app handles failures

  if (url.hostname === "unpkg.com" || url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(
      caches.open(CDN).then(function (c) {
        return c.match(req).then(function (hit) {
          return hit || fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; });
        });
      })
    );
    return;
  }

  if (req.destination === "image") {
    e.respondWith(
      caches.open(PHOTOS).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (r) {
            if (r.ok || r.type === "opaque") { c.put(req, r.clone()).then(function () { trim(PHOTOS, PHOTO_MAX); }); }
            return r;
          });
        });
      })
    );
  }
});
