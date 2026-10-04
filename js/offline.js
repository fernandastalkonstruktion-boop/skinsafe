// Registers the service worker (sw.js) so the app opens and works without internet, and shows on the home screen
// whether this phone really has the offline copy ("Ready to use without internet"). Skipped in the local preview
// (version "dev") so edits are never served from an old cache.
(function () {
  if (!("serviceWorker" in navigator)) return;
  var meta = document.querySelector('meta[name="app-version"]');
  var v = meta ? meta.content : "dev";
  if (v === "dev") return;

  function say(text, warn) {
    var n = document.getElementById("offline-status");
    if (!n) return;
    n.textContent = text; n.hidden = !text;
    n.className = "offline-status" + (warn ? " warn" : "");
  }
  // lets the app tell people they're offline instead of showing a vague error
  function paint() { document.documentElement.classList.toggle("is-offline", !navigator.onLine); }
  window.addEventListener("online", paint);
  window.addEventListener("offline", paint);
  paint();

  function verify() {
    caches.keys().then(function (names) {
      var mine = names.filter(function (k) { return k === "skinsafe-app-" + v; })[0];
      if (!mine) { say("Offline copy isn't saved yet. Keep the app open with internet for a moment.", true); return; }
      return caches.open(mine).then(function (c) { return c.keys(); }).then(function (keys) {
        var controlled = !!navigator.serviceWorker.controller;
        if (keys.length >= 20 && controlled) say("Ready to use without internet");
        else if (keys.length >= 20) say("Saved, but this page isn't covered. Open it from the address that ends in /skinsafe/ and add it to your Home Screen again.", true);
        else say("Offline copy is incomplete (" + keys.length + " files). Open the app again with internet.", true);
      });
    }).catch(function () { say("Offline mode isn't available on this phone.", true); });
  }

  window.addEventListener("load", function () {
    say("Getting ready for offline use…");
    navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(v)).then(function (reg) {
      var w = reg.installing;
      if (w) w.addEventListener("statechange", function () { if (w.state === "redundant") say("Offline mode couldn't install on this phone.", true); });
    }).catch(function (e) { say("Offline mode couldn't start (" + ((e && e.name) || "error") + ").", true); });
    var t = setTimeout(function () { say("Offline mode is taking long. Keep the app open with internet.", true); }, 25000);
    navigator.serviceWorker.ready.then(function () { clearTimeout(t); setTimeout(verify, 1500); });
  });
})();
