// Registers the service worker (sw.js) so the app opens and works without internet. Skipped in the local preview
// (version "dev") so edits are never served from an old cache.
(function () {
  if (!("serviceWorker" in navigator)) return;
  var meta = document.querySelector('meta[name="app-version"]');
  var v = meta ? meta.content : "dev";
  if (v === "dev") return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(v)).catch(function () {});
  });
  // lets the app tell people they're offline instead of showing a vague error
  function paint() { document.documentElement.classList.toggle("is-offline", !navigator.onLine); }
  window.addEventListener("online", paint);
  window.addEventListener("offline", paint);
  paint();
})();
