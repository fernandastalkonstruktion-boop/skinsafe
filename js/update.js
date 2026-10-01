// Keeps the phone on the latest version. After each publish, version.json changes; on open (and when the app comes
// back to the screen) we compare it with the version baked into this page. If it differs we refresh the cached files
// and reload. If the person is in the middle of something we show a small "Update" pill instead of reloading.
(function () {
  var meta = document.querySelector('meta[name="app-version"]');
  var current = meta ? meta.content : "dev";
  if (current === "dev") return;               // local preview
  var last = 0;

  function sameOrigin(u) { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; } }
  function files() {
    var list = [location.pathname];
    Array.prototype.forEach.call(document.querySelectorAll("script[src], link[rel=stylesheet]"), function (n) {
      var u = n.src || n.href;
      if (u && sameOrigin(u)) list.push(u);
    });
    return list;
  }
  function refresh() {
    return Promise.all(files().map(function (u) { return fetch(u, { cache: "reload" }).catch(function () {}); }));
  }
  function atHome() { var h = document.getElementById("home"); return !!h && !h.hidden; }
  function banner() {
    if (document.getElementById("update-banner")) return;
    var d = document.createElement("div");
    d.id = "update-banner";
    d.className = "update-banner";
    d.innerHTML = '<span>A new version is ready.</span><button type="button">Update</button>';
    d.querySelector("button").addEventListener("click", function () { location.reload(); });
    document.body.appendChild(d);
  }
  function check() {
    if (Date.now() - last < 20000) return;
    last = Date.now();
    fetch("version.json?x=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.v || j.v === current) return;
        var tried = ""; try { tried = sessionStorage.getItem("skinsafe.upd") || ""; } catch (e) {}
        if (tried === j.v) return;               // already tried once this session: never loop
        try { sessionStorage.setItem("skinsafe.upd", j.v); } catch (e) {}
        refresh().then(function () { if (atHome()) location.reload(); else banner(); });
      })
      .catch(function () {});
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
  window.addEventListener("pageshow", check);
  check();
})();
