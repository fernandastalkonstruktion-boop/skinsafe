(function () {
  var VIEWS = ["home", "history", "shop", "routine", "cats", "sug", "pick", "skin", "quiz", "allergies", "results", "about", "ocr", "status", "result"];
  var scanner = null;
  var lastProduct = null;
  var cameFrom = "home";        // where "Back" on a result should go
  var lastResults = null;
  var quiz = { kind: "skin", step: 0, answers: {}, from: "" };
  var allergyDraft = [];
  var wordsDraft = [];
  var importNote = "";
  var pending = null;           // barcode (and any known name) waiting for a photo of its ingredient list
  var linking = null;           // barcode waiting to be linked to a product from our list

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ic(name, cls) {
    return '<svg class="ic ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }
  var TAB_OF = { home: "home", routine: "home", cats: "home", sug: "home", pick: "home", history: "hist", shop: "shop", skin: "skin", quiz: "skin", allergies: "skin", about: "skin" };
  var aboutFrom = "skin";
  // The selection pill slides to the tab with a small spring and a soft glow while it moves (like the reference app).
  var indTab = null, indTimer = 0;
  function moveIndicator(id, instant) {
    var ind = el("tab-ind"), bar = el("tabbar");
    if (!ind || !bar) return;
    var btn = id ? bar.querySelector('.tab[data-tab="' + id + '"]') : null;
    if (!btn) { ind.classList.remove("ready"); indTab = null; return; }
    var first = !ind.classList.contains("ready") || instant;
    if (first) ind.classList.add("still");
    ind.style.width = btn.offsetWidth + "px";
    ind.style.transform = "translateX(" + btn.offsetLeft + "px)";
    if (first) { void ind.offsetWidth; ind.classList.remove("still"); }
    ind.classList.add("ready");
    if (!first && indTab !== id) {
      ind.classList.add("glow");
      clearTimeout(indTimer);
      indTimer = setTimeout(function () { ind.classList.remove("glow"); }, 300);
    }
    indTab = id;
  }
  window.addEventListener("resize", function () { if (indTab) moveIndicator(indTab, true); });
  function show(view) {
    VIEWS.forEach(function (v) { el(v).hidden = v !== view; });
    var active = TAB_OF[view] || "";
    Array.prototype.forEach.call(document.querySelectorAll("#tabbar .tab"), function (b) {
      var on = b.getAttribute("data-tab") === active;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    moveIndicator(active);
    document.body.classList.toggle("on-result", view === "result");
    document.body.classList.toggle("on-home", view === "home");
    document.body.classList.toggle("on-profile", view === "skin");
    window.scrollTo(0, 0);
  }
  function showStatus(text, offerPhoto) {
    el("status-text").textContent = text;
    el("status-photo").hidden = !offerPhoto;
    var canLink = !!(offerPhoto && pending && pending.code);
    el("status-find").hidden = !canLink;
    el("status-find-hint").hidden = !canLink;
    el("status-find-q").value = "";
    show("status");
  }
  // Small "yes" marks shown on products. They never change the score. Only shown when true.
  // Skin care of the face or the body (not hair, mouth care, first aid or makeup of unknown kind)
  function skinKind(p) { var k = kindOf(p); return !!k && k !== "other" && !isHairKind(k) && k !== "oral" && k !== "aid"; }
  function marksFor(product, items) {
    var marks = [];
    var v = window.Ingredients.veganCheck(items);
    var cf = window.Brands && window.Brands.get(product.brand);
    if (cf && (cf.status === "both" || cf.status === "leaping_bunny")) marks.push({ id: "lb", label: "Leaping Bunny", note: "the brand is certified" });
    if (cf && (cf.status === "both" || cf.status === "peta")) marks.push({ id: "peta", label: "PETA", note: "the brand is listed" });
    if (v.ok && !product.partial) marks.push({ id: "vegan", label: "Vegan-friendly", note: "no animal-derived ingredients in the list" });
    // Pore-friendly: a complete list with none of the pore-clogging watch-list ingredients (skin products only). Not a test of the product.
    if (window.Pores && skinKind(product) && window.Pores.friendly(items, product.partial)) marks.push({ id: "pore", label: "Pore-friendly", note: "none of our pore-clogging watch-list ingredients found" });
    return marks;
  }
  // Small round logos (our own simple drawings, not the official artwork), one per mark the product has.
  var LOGO = {
    vegan: ["#2f8f4e", '<path d="M9.5 22.5C9.5 14 14 9.5 22.5 9.5c0 8.5-4.5 13-13 13z" fill="#fff"/><path d="M9.5 22.5 17 15" stroke="#2f8f4e" stroke-width="1.4" fill="none" stroke-linecap="round"/>'],
    lb: ["#1d3557", '<ellipse cx="12.6" cy="10.5" rx="2" ry="5.6" transform="rotate(-10 12.6 10.5)" fill="#fff"/><ellipse cx="19.4" cy="10.5" rx="2" ry="5.6" transform="rotate(10 19.4 10.5)" fill="#fff"/><ellipse cx="16" cy="20.5" rx="5.6" ry="5" fill="#fff"/>'],
    pore: ["#2a9d8f", '<path d="M16 8c3 4 5 6.4 5 9.2a5 5 0 0 1-10 0C11 14.4 13 12 16 8z" fill="#fff"/>'],
    // Cruelty-free: a rabbit face (Phosphor Icons "rabbit", MIT license), the most widely understood sign; both Leaping Bunny and PETA use it
    cf: ["#d6457a", '<g transform="translate(5 5) scale(0.0859)"><path fill="#fff" d="M199.28,149.8A71.58,71.58,0,0,0,193,129c19-37.94,30.45-88.28,17.34-110A22,22,0,0,0,190.94,8c-14.12,0-26,11.89-36.44,36.36-6.22,14.62-10.85,31.32-14,44.74a71.8,71.8,0,0,0-25,0c-3.13-13.42-7.76-30.12-14-44.74C91.1,19.89,79.18,8,65.06,8A22,22,0,0,0,45.64,19.08C32.53,40.76,44,91.1,63,129a71.58,71.58,0,0,0-6.26,20.76A52,52,0,1,0,128,225.52l-21.12-19.37a8,8,0,1,1,10.24-12.3L128,202.9l10.88-9.05a8,8,0,0,1,10.24,12.3L128,225.52a52,52,0,1,0,71.28-75.72Zm-126-36.53A218.45,218.45,0,0,1,58.4,67.08c-3.49-18.13-3.15-33,.93-39.72A6,6,0,0,1,65.06,24c6.61,0,14.52,9.7,21.72,26.62,5.93,13.94,10.35,30.12,13.33,43a71.72,71.72,0,0,0-26.88,19.64ZM100,176a12,12,0,1,1,12-12A12,12,0,0,1,100,176Zm56,0a12,12,0,1,1,12-12A12,12,0,0,1,156,176Zm20.55-69.17a71.89,71.89,0,0,0-20.66-13.2c3-12.89,7.4-29.07,13.33-43C176.42,33.7,184.33,24,190.94,24a6,6,0,0,1,5.73,3.36c4.08,6.74,4.42,21.59.93,39.72a218.45,218.45,0,0,1-14.83,46.19A72.6,72.6,0,0,0,176.55,106.83Z"/></g>'],
    peta: ["#1b1b1b", '<text x="16" y="19.4" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="9.5" fill="#fff">PETA</text>']
  };
  // One round logo per KIND of mark: Leaping Bunny and PETA both show the same rabbit, so only one is drawn
  function logosHtml(marks) {
    var seen = {}, out = "", cf = marks.filter(function (m) { return m.id === "lb" || m.id === "peta"; });
    marks.forEach(function (m) {
      var key = m.id === "lb" || m.id === "peta" ? "cf" : m.id;
      if (seen[key]) return;
      seen[key] = 1;
      out += logoHtml(key === "cf" ? { id: "cf", label: "Cruelty-free (" + cf.map(function (c) { return c.label; }).join(" and ") + ")" } : m);
    });
    return out;
  }
  // The text row under the logos: cruelty-free sources joined in one phrase
  function marksNote(marks) {
    var parts = [], lb = marks.some(function (m) { return m.id === "lb"; }), pe = marks.some(function (m) { return m.id === "peta"; });
    if (lb || pe) parts.push("<strong>Cruelty-free</strong>: " + (lb ? "certified by Leaping Bunny" : "") + (lb && pe ? " and " : "") + (pe ? "listed by PETA" : ""));
    marks.forEach(function (m) { if (m.id !== "lb" && m.id !== "peta") parts.push("<strong>" + esc(m.label) + "</strong>: " + esc(m.note)); });
    return parts.join(" \u00b7 ");
  }
  function logoHtml(m) {
    var l = LOGO[m.id];
    return '<svg class="mlogo" viewBox="0 0 32 32" role="img" aria-label="' + esc(m.label) + '"><title>' + esc(m.label) + '</title><circle cx="16" cy="16" r="15" fill="' + l[0] + '" stroke="#fff" stroke-width="1.5"/>' + l[1] + "</svg>";
  }
  function markTags(product) {
    var items;
    try { items = window.Ingredients.analyze(product.ingredientsText).items; } catch (e) { return ""; }
    var marks = marksFor(product, items);
    return marks.length ? '<span class="mlogos">' + logosHtml(marks) + "</span>" : "";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // Score bands: 76-100 excellent, 51-75 good, 26-50 not great, 0-25 bad.
  function band(score) {
    if (score === null) return { cls: "none", label: "Not enough data", icon: "info" };
    if (score >= 76) return { cls: "good", label: "Excellent", icon: "shield-check" };
    if (score >= 51) return { cls: "yel", label: "Good", icon: "shield-check" };
    if (score >= 26) return { cls: "org", label: "Not great", icon: "alert" };
    return { cls: "bad", label: "Bad", icon: "alert" };
  }

  // Score preferences (Profile): products lose points for the checks the person keeps on. The safety score from ingredients is the base.
  // Since 12 Oct 2026 the purity check and "matches my skin and hair" start on; cruelty-free, vegan and the health conditions start off.
  var PREF_PEN = { cf: 10, vegan: 5, nomatch: 8, maybe: 4 };
  // Fragrance on delicate skin (12 Oct 2026; docs/investigacion-12oct/investigacion_fragancia_piel_delicada.md): [leave-on, rinse-off] x [light, with several allergens]. Everything "Matches my skin" subtracts is capped at 11,
  // so a band-64 product never ends below a band-52 one because of this switch.
  var PACK_PEN = 4;
  // pack = "format|material|confidence", read from the product photo by a vision model (tools/catalog/pack_overrides.json). Plastic counts only when the confidence is medium or high.
  var PACK_FORMAT = { tube: "tube", jar: "jar", pump_bottle: "pump bottle", dropper_bottle: "dropper bottle", bottle: "bottle", spray: "spray", stick: "stick", compact: "compact", sachet_or_sheet: "sachet or sheet" };
  function packOf(p) {
    if (!p || !p.pack) return null;
    var x = String(p.pack).split("|"), mat = x[1], conf = x[2];
    return { format: PACK_FORMAT[x[0]] || "", material: mat, conf: conf, plastic: mat === "plastic" && conf !== "low" };
  }
  var FRAG_PTS = { sensitive: [[4, 6], [1, 2]], high: [[6, 9], [2, 4]] }, FIT_CAP = 11;
  function prefsActive() { var pr = window.Profile.loadPrefs(); return pr.on && (pr.vegan || pr.cf || pr.fit || pr.pure || pr.pk || pr.endo || pr.horm); }
  function fitPrefActive() { var pr = window.Profile.loadPrefs(); return pr.on && pr.fit; }
  // Rinse-off products (shampoo, wash, toothpaste) count half for the health check: less time on the skin.
  function isRinseOff(p) {
    var hk = window.Hair.classify(p), bk = window.Body && window.Body.classify(p);
    return !!(window.Oral.classify(p) || hk === "prewash" || hk === "shampoo" || hk === "clarify" || hk === "conditioner" || hk === "hmask" || bk === "intimate" || bk === "bodywash" || bk === "bscrub" || window.Routine.classify(p) === "cleanser");
  }
  // A face skincare product (not hair, body, mouth, first aid or makeup of unknown kind)
  function faceSkinKind(p) {
    var k = kindOf(p);
    return !!k && k !== "other" && !isHairKind(k) && !isBodyKind(k) && k !== "oral" && k !== "aid" && window.Routine.ORDER.indexOf(k) >= 0;
  }
  var pureCache = {};
  function pureOf(p, a) {
    var key = (p.name || "") + "|" + (p.form || "") + "|" + (p.shop ? 1 : 0) + "|" + (p.ingredientsText || "").length + "|" + (a.items.length ? a.items[0].name : ""), c = pureCache[key];
    if (!c) { c = pureCache[key] = { pure: window.Ingredients.purity(p, a.items), health: window.Ingredients.health(p, a.items, isRinseOff(p)) }; }
    return c;
  }
  function scoreInfo(p, a) {
    var base = a.score, pen = [], total = 0;
    if (base !== null && prefsActive()) {
      var pr = window.Profile.loadPrefs(), marks = marksFor(p, a.items), has = function (id) { return marks.some(function (m) { return m.id === id; }); };
      if (pr.cf && !has("lb") && !has("peta")) { pen.push({ pts: PREF_PEN.cf, why: "the brand isn't listed as cruelty-free by Leaping Bunny or PETA" }); total += PREF_PEN.cf; }
      if (pr.vegan && !has("vegan")) { pen.push({ pts: PREF_PEN.vegan, why: "no vegan-friendly mark" }); total += PREF_PEN.vegan; }
      // Same quiz match that shows "Good for you": not a match costs 8, a possible match 4 (oral care and products without a quiz are left alone)
      var hk = window.Hair.classify(p), prof = window.Oral.classify(p) ? null : hk ? window.Hair.load() : window.Profile.load();
      if (pr.fit && prof) {
        var area = hk ? "hair" : "skin", m, fp = 0, fragWhy = "", pp = 0, poreWhy = "";
        if (hk) m = window.Hair.match(a.items, prof, hk);
        else {
          // Skin: parfum and its declared allergens are ONE family. The quiz ladder (8 / 4) runs on the rest; a delicate skin pays for the fragrance once, by the table below
          var fr = window.Ingredients.fragrance(a.items, { lip: window.Body && window.Body.classify(p) === "lip" }), sens = window.Profile.sensitivityOf(prof);
          // Face products: the pore-clogging ingredients are charged ONCE by their own table (js/pores.js), so they leave the quiz ladder (no double counting)
          var face = faceSkinKind(p), restM = face ? fr.rest.filter(function (i) { return (i.risks || []).indexOf("comedogenic") < 0; }) : fr.rest;
          m = window.Profile.match(restM, prof);
          var plevel = window.Profile.poreLevel(prof);
          if (face && plevel && window.Pores) {
            var pr2 = window.Pores.points(a.items, { level: plevel, face: true, rinse: isRinseOff(p) });
            pp = pr2.pts;
            poreWhy = "an ingredient that clogged pores in lab tests (" + pr2.names.join(", ") + "), and your skin " + (plevel === "acne" ? "gets acne or clogged pores" : "is oily");
          }
          if (fr.any && sens) {
            var rinse = isRinseOff(p), heavy = fr.nal >= 2;
            fp = FRAG_PTS[sens][rinse ? 1 : 0][heavy ? 1 : 0];
            fragWhy = (heavy ? "several fragrance allergens" : "fragrance") + ", and your skin is " + (sens === "high" ? "very reactive" : "sensitive") + (rinse ? " (rinse-off, counts less)" : "");
          }
        }
        var ladder = m.level === "bad" ? PREF_PEN.nomatch : m.level === "mid" ? PREF_PEN.maybe : 0, room = FIT_CAP;
        var lp = Math.min(ladder, room); room -= lp;
        var fpp = Math.min(fp, room); room -= fpp;
        var ppp = Math.min(pp, room);
        if (ppp > 0) pen.push({ pts: ppp, why: poreWhy }), total += ppp;
        if (lp > 0) pen.push({ pts: lp, why: (m.level === "bad" ? "not a match for your " : "only a possible match for your ") + area }), total += lp;
        if (fpp > 0) pen.push({ pts: fpp, why: fragWhy }), total += fpp;
      }
      // Plastic packaging: only when the photo clearly shows plastic (see packOf); an unknown packaging never subtracts
      if (pr.pk) { var pk = packOf(p); if (pk && pk.plastic) { pen.push({ pts: PACK_PEN, why: "plastic packaging (read from the photo)" }); total += PACK_PEN; } }
      if (pr.pure || pr.endo || pr.horm) {
        var x = pureOf(p, a);
        if (pr.pure) x.pure.forEach(function (h) { pen.push({ pts: h.pts, why: h.why }); total += h.pts; });
        // endometriosis and hormone sensitivity use the same ingredients, so they are not added together: the bigger one counts
        var e = pr.endo ? x.health.endo : 0, h2 = pr.horm ? x.health.horm : 0, hp = Math.max(e, h2);
        if (hp > 0) {
          var names = (e >= h2 ? x.health.endoNames : x.health.hormNames).join(" and ");
          pen.push({ pts: hp, why: (pr.endo && e >= h2 ? "ingredients linked to hormone disruption (" + names + "); the evidence for endometriosis is limited" : "hormone-active ingredients (" + names + ")") });
          total += hp;
        }
      }
    }
    return { score: base === null ? null : Math.max(0, base - total), base: base, pen: pen, total: total, label: prefsActive() ? "For you" : "Safety" };
  }

  // ----- private setup link: #setup=<base64 json> loads allergies into THIS phone only. The part after # is never sent to a server. -----
  function importSetup() {
    var m = location.hash.match(/^#setup=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try {
      var json = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")))));
      var known = window.Profile.ALLERGENS.map(function (x) { return x.id; });
      var ids = (json.a || []).filter(function (id) { return known.indexOf(id) > -1; });
      var words = (json.w || []).filter(function (w) { return typeof w === "string" && w.trim(); }).map(function (w) { return w.trim().toLowerCase(); });
      window.Profile.saveAllergies(ids);
      window.Profile.saveWords(words);
      if (json.n && typeof json.n === "string" && !getName()) setName(json.n.trim().slice(0, 24));
      importNote = "Your allergies were loaded on this phone.";
    } catch (e) { importNote = ""; }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }

  // ----- greeting: each person uses their own phone, so the name is asked once and kept on this device -----
  function getName() { try { return (localStorage.getItem("skinsafe.name") || "").trim(); } catch (e) { return ""; } }
  function setName(v) { try { localStorage.setItem("skinsafe.name", v); localStorage.removeItem("skinsafe.nameSkipped"); } catch (e) {} }
  function nameSkipped() { try { return localStorage.getItem("skinsafe.nameSkipped") === "1"; } catch (e) { return false; } }
  function skipName() { try { localStorage.setItem("skinsafe.nameSkipped", "1"); } catch (e) {} }
  function pretty(n) { return n ? n.charAt(0).toUpperCase() + n.slice(1) : n; }

  function renderGreeting(editing) {
    var box = el("greet");
    var name = getName();
    if (name && !editing) {
      box.innerHTML = '<p class="greet-hi">Hi, ' + esc(pretty(name)) + '!</p>' +
        (importNote ? '<p class="greet-sub">' + esc(importNote) + "</p>" : "") +
        '<button type="button" class="link" id="greet-edit">Change name</button>';
      el("greet-edit").addEventListener("click", function () { renderGreeting(true); });
      return;
    }
    if (!name && nameSkipped() && !editing) {
      box.innerHTML = '<button type="button" class="link" id="greet-edit">Add your name</button>';
      el("greet-edit").addEventListener("click", function () { renderGreeting(true); });
      return;
    }
    box.innerHTML = '<p class="greet-hi">Hi!</p><p class="greet-sub">What should we call you?</p>' +
      '<form class="name-form" id="name-form"><input id="name-input" type="text" maxlength="24" autocomplete="given-name" aria-label="Your name" placeholder="Your name" value="' + esc(name) + '">' +
      '<button type="submit" class="primary small">' + ic("check") + 'Save</button></form>' +
      '<button type="button" class="link" id="name-skip">' + (name ? "Cancel" : "Skip") + "</button>";
    el("name-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = el("name-input").value.trim();
      if (v) setName(v); else if (!name) skipName();
      renderGreeting(false);
    });
    el("name-skip").addEventListener("click", function () {
      if (!name) skipName();
      renderGreeting(false);
    });
  }

  // ----- home cards: skin and allergies -----
  function renderHairCard() {
    var box = el("hair-card");
    if (!box) return;
    var h = window.Hair.load();
    if (h) {
      box.innerHTML = '<p class="profile-label">' + ic("hair") + 'My hair</p><p class="profile-text">' + esc(window.Hair.typeLabel(h)) + "</p>" +
        '<div class="profile-actions"><button type="button" class="link" id="hair-edit">Edit</button><button type="button" class="link" id="hair-clear">Remove</button></div>';
      el("hair-edit").addEventListener("click", function () { startQuiz(h, "hair"); });
      el("hair-clear").addEventListener("click", function () { window.Hair.clear(); renderHairCard(); });
    } else {
      box.innerHTML = '<p class="profile-label">' + ic("hair") + 'My hair</p><p class="profile-text">5 quick questions</p>' +
        '<div class="profile-actions"><button type="button" class="secondary small-btn" id="hair-start">Start</button></div>';
      el("hair-start").addEventListener("click", function () { startQuiz(null, "hair"); });
    }
  }

  function renderPrefCard() {
    var box = el("pref-card");
    if (!box) return;
    var pr = window.Profile.loadPrefs();
    // One line per switch: name, the most it can subtract, switch. The long explanations live in "How we rate".
    function sw(id, on, name, amt) {
      return '<div class="pref-row"><span class="pref-text"><span class="pref-name">' + name + (amt ? ' <span class="pref-amt">' + amt + "</span>" : "") + "</span></span>" +
        '<button type="button" class="switch' + (on ? " on" : "") + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(name) + '" id="' + id + '"><i></i></button></div>';
    }
    box.innerHTML = '<p class="profile-label">' + ic("leaf") + 'My score preferences</p>' +
      sw("pref-on", pr.on, "Subtract points from the score", "") +
      (pr.on ? sw("pref-pure", pr.pure, "Contaminant risks", "up to \u221210") +
        sw("pref-pk", pr.pk, "Plastic packaging", "\u22124") +
        sw("pref-fit", pr.fit, "Matches my skin and hair", "\u2212" + PREF_PEN.nomatch + " or \u2212" + PREF_PEN.maybe) +
        sw("pref-cf", pr.cf, "Cruelty-free", "\u2212" + PREF_PEN.cf) +
        sw("pref-vegan", pr.vegan, "Vegan-friendly", "\u2212" + PREF_PEN.vegan) +
        sw("pref-endo", pr.endo, "Endometriosis", "up to \u22128") +
        sw("pref-horm", pr.horm, "Hormone sensitivity", "up to \u22126") +
        (pr.fit && !window.Profile.load() && !window.Hair.load() ? '<p class="pref-hint">Take the skin or hair quiz to check the match.</p>' : "") : "");
    function flip(key) {
      return function () { var p = window.Profile.loadPrefs(); p[key] = !p[key]; window.Profile.savePrefs(p); renderPrefCard(); renderSavedList(); renderRoutineCard(); };
    }
    el("pref-on").addEventListener("click", flip("on"));
    if (pr.on) ["pure", "pk", "fit", "cf", "vegan", "endo", "horm"].forEach(function (k) { el("pref-" + k).addEventListener("click", flip(k)); });
  }

  function renderProfileCard() {
    renderNameCard();
    renderPrefCard();
    renderHairCard();
    var p = window.Profile.load();
    var box = el("profile-card");
    if (p) {
      box.innerHTML =
        '<p class="profile-label">' + ic("droplet") + 'My skin</p>' +
        '<p class="profile-text">' + esc(window.Profile.typeLabel(p)) + "</p>" +
        '<div class="profile-actions"><button type="button" class="link" id="profile-edit">Edit</button>' +
        '<button type="button" class="link" id="profile-clear">Remove</button></div>';
      el("profile-edit").addEventListener("click", function () { startQuiz(p); });
      el("profile-clear").addEventListener("click", function () { window.Profile.clear(); renderProfileCard(); });
    } else {
      box.innerHTML =
        '<p class="profile-label">' + ic("droplet") + 'My skin</p>' +
        '<p class="profile-text">6 quick questions</p>' +
        '<div class="profile-actions"><button type="button" class="secondary small-btn" id="profile-start">Start</button></div>';
      el("profile-start").addEventListener("click", function () { startQuiz(null); });
    }
  }

  function renderAllergyCard() {
    var ids = window.Profile.loadAllergies();
    var box = el("allergy-card");
    if (!box) return;
    var labels = window.Profile.ALLERGENS.filter(function (a) { return ids.indexOf(a.id) > -1; }).map(function (a) { return a.label; });
    labels = labels.concat(window.Profile.loadWords());
    box.innerHTML =
      '<p class="profile-label">' + ic("alert") + 'My allergies</p>' +
      '<p class="profile-text">' + (labels.length ? esc(labels.join(", ")) : "None set yet.") + "</p>" +
      '<div class="profile-actions"><button type="button" class="' + (labels.length ? "link" : "secondary small-btn") + '" id="allergy-edit">' + (labels.length ? "Edit" : "Set up") + "</button></div>";
    el("allergy-edit").addEventListener("click", startAllergies);
    renderMissingCard();
  }

  // ----- Missing products: what the camera couldn't match, kept only on this phone so it can be copied and sent to be added -----
  var MKEY = "skinsafe.missing", MMAX = 100;
  var notItCtx = null, nextNotIt = null;
  function loadMissing() {
    try { var m = JSON.parse(localStorage.getItem(MKEY) || "[]"); return Array.isArray(m) ? m : []; } catch (e) { return []; }
  }
  function logMissing(why, mode, tokens, guess) {
    var read = (tokens || []).slice(0, 14).join(" ");
    if (!read) return;
    var g = guess ? (guess.brand ? guess.brand + " | " : "") + guess.name : "";
    var list = loadMissing().filter(function (x) { return !(x.read === read && x.why === why); });
    list.unshift({ at: new Date().toISOString().slice(0, 10), why: why, mode: mode, read: read, guess: g });
    try { localStorage.setItem(MKEY, JSON.stringify(list.slice(0, MMAX))); } catch (e) {}
  }
  function missingText() {
    var list = loadMissing();
    var why = { "not-it": "opened by exact match, wrong", none: "none of the list was right", unknown: "couldn't tell" };
    return "SkinSafe missing products (" + list.length + ")\n" + list.map(function (x, i) {
      return (i + 1) + ". " + x.at + " · " + (why[x.why] || x.why) + " · camera read: " + x.read + (x.guess ? " · we guessed: " + x.guess : "");
    }).join("\n");
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, no) {
      var ta = document.createElement("textarea");
      ta.value = t; ta.style.cssText = "position:fixed;opacity:0;font-size:16px"; document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(e); }
      document.body.removeChild(ta);
    });
  }
  function renderMissingCard() {
    var box = el("missing-card");
    if (!box) return;
    var n = loadMissing().length;
    box.innerHTML = '<p class="profile-label">' + ic("search") + 'Missing products</p>' +
      '<p class="profile-text">' + (n ? plural(n, "product the camera couldn't match", "products the camera couldn't match") + "."
        : "Nothing yet. Products the camera can't find show up here.") + "</p>" +
      (n ? '<div class="profile-actions"><button type="button" class="secondary small-btn" id="missing-copy">Copy list</button>' +
        (navigator.share ? '<button type="button" class="link" id="missing-share">Share</button>' : "") +
        '<button type="button" class="link" id="missing-clear">Clear</button></div>' : "");
    if (!n) return;
    el("missing-copy").addEventListener("click", function () {
      var b = el("missing-copy");
      copyText(missingText()).then(function () { b.textContent = "Copied"; }, function () { b.textContent = "Couldn't copy"; });
    });
    if (el("missing-share")) el("missing-share").addEventListener("click", function () { navigator.share({ text: missingText() }).catch(function () {}); });
    el("missing-clear").addEventListener("click", function () { try { localStorage.removeItem(MKEY); } catch (e) {} renderMissingCard(); });
  }

  // ----- allergies editor -----
  function startAllergies() {
    allergyDraft = window.Profile.loadAllergies().slice();
    wordsDraft = window.Profile.loadWords().slice();
    el("allergy-note").hidden = true;
    renderAllergyOptions();
    renderWordChips();
    show("allergies");
  }
  function renderAllergyOptions() {
    el("allergy-options").innerHTML = window.Profile.ALLERGENS.map(function (a) {
      var on = allergyDraft.indexOf(a.id) > -1;
      return '<button type="button" class="option" data-v="' + a.id + '" aria-pressed="' + on + '">' +
        '<span class="option-check">' + (on ? ic("check") : "") + "</span>" +
        '<span class="option-text"><span class="option-name">' + esc(a.label) + '</span><span class="option-sub">' + esc(a.sub) + "</span></span></button>";
    }).join("");
    Array.prototype.forEach.call(el("allergy-options").children, function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-v");
        var i = allergyDraft.indexOf(v);
        if (i > -1) allergyDraft.splice(i, 1); else allergyDraft.push(v);
        renderAllergyOptions();
      });
    });
  }
  function renderWordChips() {
    el("word-chips").innerHTML = wordsDraft.map(function (w, i) {
      return '<span class="word-chip">' + esc(w) + '<button type="button" data-i="' + i + '" aria-label="Remove ' + esc(w) + '">' + ic("x") + "</button></span>";
    }).join("");
    Array.prototype.forEach.call(el("word-chips").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { wordsDraft.splice(Number(b.getAttribute("data-i")), 1); renderWordChips(); });
    });
  }
  function addWord(e) {
    e.preventDefault();
    var v = el("word-input").value.trim().toLowerCase();
    if (v.length >= 3 && wordsDraft.indexOf(v) < 0) { wordsDraft.push(v); renderWordChips(); }
    el("word-input").value = "";
  }
  function saveAllergies() {
    window.Profile.saveAllergies(allergyDraft);
    window.Profile.saveWords(wordsDraft);
    renderAllergyCard();
    if (lastProduct && cameFrom !== "home-only") { renderResult(lastProduct); }
    else { renderSavedList(); startAllergies(); el("allergy-note").hidden = false; }
  }

  // ----- skin quiz -----
  function startQuiz(existing, kind, from) {
    quiz = { kind: kind || "skin", step: 0, from: from || "", answers: existing ? JSON.parse(JSON.stringify(existing)) : {} };
    renderQuiz();
    show("quiz");
  }
  function quizQs() { return quiz.kind === "hair" ? window.Hair.QUESTIONS : window.Profile.QUESTIONS; }

  function renderQuiz() {
    var qs = quizQs();
    var q = qs[quiz.step];
    el("quiz-step").textContent = q.result ? "Your result" : "Question " + (quiz.step + 1) + " of " + qs.filter(function (x) { return !x.result; }).length;
    el("quiz-title").textContent = q.title;
    el("quiz-sub").textContent = q.sub || "";
    el("quiz-next").innerHTML = (quiz.step === qs.length - 1 ? ic("check") + "Finish" : "Next" + ic("arrow-right"));
    el("quiz-back").textContent = quiz.step === 0 ? "Cancel" : "Back";

    var current = quiz.answers[q.id];
    var selected = q.multi ? (current || []) : (current ? [current] : []);
    el("quiz-options").innerHTML = q.options.map(function (o) {
      var on = selected.indexOf(o[0]) > -1;
      return '<button type="button" class="option" data-v="' + o[0] + '" aria-pressed="' + on + '">' +
        '<span class="option-check">' + (on ? ic("check") : "") + "</span>" +
        '<span class="option-text"><span class="option-name">' + esc(o[1]) + "</span>" +
        (o[2] ? '<span class="option-sub">' + esc(o[2]) + "</span>" : "") + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(el("quiz-options").children, function (b) {
      b.addEventListener("click", function () { pick(q, b.getAttribute("data-v")); });
    });
  }

  function pick(q, v) {
    if (q.multi) {
      var list = quiz.answers[q.id] || [];
      var i = list.indexOf(v);
      if (i > -1) list.splice(i, 1); else { list.push(v); if (q.max && list.length > q.max) list.shift(); }
      quiz.answers[q.id] = list;
    } else {
      quiz.answers[q.id] = v;
    }
    renderQuiz();
  }

  function quizNext() {
    var qs = quizQs();
    var q = qs[quiz.step];
    var a = quiz.answers[q.id];
    var answered = q.multi ? true : !!a;   // the concerns question may stay empty
    if (!answered) { el("quiz-sub").textContent = "Choose one answer to continue."; return; }
    if (quiz.step < qs.length - 1) {
      quiz.step++;
      // The last skin step shows the type worked out from the first two answers.
      if (qs[quiz.step].result && quiz.kind !== "hair") {
        if (qs[quiz.step].id === "type") { var guess = window.Profile.inferType(quiz.answers); if (guess) quiz.answers.type = guess; }
        else if (qs[quiz.step].id === "reactivity") quiz.answers.reactivity = window.Profile.inferReactivity(quiz.answers);
      }
      renderQuiz(); return;
    }
    if (quiz.kind === "hair") {
      quiz.answers.state = quiz.answers.state || [];
      quiz.answers.goals = quiz.answers.goals || [];
      window.Hair.save(quiz.answers);
      renderProfileCard();
      if (quiz.from === "routine") { rtPeriod = "hw"; openRoutine(); }
      else if (lastProduct) renderResult(lastProduct); else show("skin");
      return;
    }
    quiz.answers.concerns = quiz.answers.concerns || [];
    window.Profile.save(quiz.answers);
    renderProfileCard();
    if (lastProduct) { renderResult(lastProduct); } else { renderProfileCard(); show("skin"); }
  }

  function quizBack() {
    if (quiz.step === 0) { if (quiz.from === "routine") { openRoutine(); return; } if (lastProduct) show("result"); else { renderProfileCard(); show("skin"); } return; }
    quiz.step--;
    renderQuiz();
  }

  // ----- Favorites, stored only on this phone -----
  var SKEY = "skinsafe.saved";
  function loadSaved() {
    try {
      var s = JSON.parse(localStorage.getItem(SKEY) || "[]");
      if (!Array.isArray(s)) return [];
      var clean = s.filter(function (p) { return !window.isJunkProduct(p); });
      if (clean.length !== s.length) { try { localStorage.setItem(SKEY, JSON.stringify(clean)); } catch (e) {} }
      return clean;
    } catch (e) { return []; }
  }
  function storeSaved(list) { try { localStorage.setItem(SKEY, JSON.stringify(list.slice(0, 100))); } catch (e) {} }
  function productId(p) {
    if (p.code) return "c:" + p.code;
    var t = p.name + "|" + p.ingredientsText, h = 0;
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return "t:" + h;
  }
  function isSaved(p) { var id = productId(p); return loadSaved().some(function (x) { return x.id === id; }); }
  function toggleSaved(p) {
    var id = productId(p), list = loadSaved(), at = -1;
    list.forEach(function (x, i) { if (x.id === id) at = i; });
    if (at > -1) list.splice(at, 1);
    else list.unshift({ id: id, code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial, form: p.form || "", pack: p.pack || "", kind: p.kind || "", savedAt: Date.now() });
    storeSaved(list);
  }
  function renderHeart(p) {
    var b = el("heart"), on = isSaved(p);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Remove from Favorites" : "Save to Favorites");
    b.classList.toggle("on", on);
  }
  var favFilter = "all";
  // Products sold for "face and body" stay with the face routine.
  function faceAndBody(p) { return /\b(face|facial)\b/i.test(p.name || ""); }
  function kindOf(p) { return window.Oral.classify(p) || window.Hair.classify(p) || (faceAndBody(p) && window.Routine.classify(p)) || window.Body.classify(p) || window.Routine.classify(p) || "other"; }
  function kindLabel(k) { return k === "other" ? "Other" : window.Routine.KINDS[k].label; }
  // "For you" heart: the product is a good match for the saved skin or hair quiz and doesn't trip an allergy.
  function youTag(p) {
    var ids = window.Profile.loadAllergies(), words = window.Profile.loadWords(), hk = window.Hair.classify(p), prof = window.Oral.classify(p) ? null : hk ? window.Hair.load() : window.Profile.load();
    if (!prof) return "";
    var an = window.Ingredients.analyze(p.ingredientsText);
    if (an.score === null) return "";
    if ((ids.length || words.length) && window.Profile.allergyHits(an.items, ids, words).length) return "";
    return (hk ? window.Hair.match(an.items, prof, hk) : window.Profile.match(an.items, prof)).level === "good" ? '<span class="tag big you">' + ic("heart") + "For you</span>" : "";
  }
  // One tag row for every product card: band word + number, "For you" heart, certification logos, alerts.
  function cardTags(p) {
    var ids = window.Profile.loadAllergies(), words = window.Profile.loadWords();
    var an = window.Ingredients.analyze(p.ingredientsText), si = scoreInfo(p, an), tags = "";
    var hit = (ids.length || words.length) && window.Profile.allergyHits(an.items, ids, words).length;
    tags += si.score === null ? '<span class="tag big sc none">Not enough data</span>' : scoreTag(si.score, true);
    tags += youTag(p);
    tags += markTags(p);
    if (window.Alerts && window.Alerts.match(p).length) tags += '<span class="tag bad">' + ic("alert") + "Official alert</span>";
    if (hit) tags += '<span class="tag bad">' + ic("alert") + "Your allergy</span>";
    return tags;
  }
  function cardHtml(p, i, heart) {
    return '<div class="fav-card' + (heart ? " has-heart" : "") + '" role="button" tabindex="0" data-i="' + i + '">' + photoHtml(p) +
      '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
      '<span class="tags">' + cardTags(p) + "</span></span>" +
      (heart ? '<button type="button" class="fav-heart" data-i="' + i + '" aria-label="Remove from favorites">' + ic("heart") + "</button>" : "") + "</div>";
  }
  // ----- History: the last 14 products opened (scanned or searched), stored only on this phone -----
  var HKEY = "skinsafe.history", HMAX = 14;
  function loadHistory() {
    try {
      var h = JSON.parse(localStorage.getItem(HKEY) || "[]");
      if (!Array.isArray(h)) return [];
      var clean = h.filter(function (p) { return !window.isJunkProduct(p); });
      if (clean.length !== h.length) { try { localStorage.setItem(HKEY, JSON.stringify(clean)); } catch (e) {} }
      return clean;
    } catch (e) { return []; }
  }
  function addHistory(p) {
    var id = productId(p);
    var list = loadHistory().filter(function (x) { return x.id !== id; });
    list.unshift({ id: id, code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial, form: p.form || "", pack: p.pack || "", kind: p.kind || "", seenAt: Date.now() });
    try { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, HMAX))); } catch (e) {}
  }
  function renderHistory() {
    var list = loadHistory(), box = el("history-list");
    if (!list.length) { box.innerHTML = '<p class="saved-empty">Nothing here yet. The last 14 products you scan or search will show up here, on this phone only.</p>'; return; }
    box.innerHTML = list.map(function (p, i) { return cardHtml(p, i, false); }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".fav-card"), function (card) {
      var p = list[Number(card.getAttribute("data-i"))];
      card.addEventListener("click", function () { cameFrom = "history"; renderResult(p); });
    });
  }

  function renderSavedList() {
    var all = loadSaved(), box = el("saved"), sel = el("fav-filter");
    var kinds = {};
    all.forEach(function (p) { kinds[kindOf(p)] = true; });
    if (!kinds[favFilter]) favFilter = "all";
    sel.innerHTML = '<option value="all">All</option>' + window.Routine.ORDER.concat(window.Hair.ORDER, window.Body.ORDER, window.Oral.ORDER, window.Oral.AID, ["other"]).filter(function (k) { return kinds[k]; }).map(function (k) {
      return '<option value="' + k + '">' + kindLabel(k) + "</option>";
    }).join("");
    sel.value = favFilter;
    sel.parentNode.hidden = all.length < 2;
    if (!all.length) {
      box.innerHTML = '<p class="saved-empty">Nothing here yet. Open any product and tap the heart to keep it here. Your list stays on this phone and the scores update as we learn more.</p>';
      return;
    }
    var list = favFilter === "all" ? all : all.filter(function (p) { return kindOf(p) === favFilter; });
    box.innerHTML = list.map(function (p, i) { return cardHtml(p, i, true); }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".fav-card"), function (card) {
      var p = list[Number(card.getAttribute("data-i"))];
      card.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest(".fav-heart")) { toggleSaved(p); renderSavedList(); renderRoutineCard(); return; }
        cameFrom = "favorites"; renderResult(p);
      });
    });
  }

  // History and Favorites share one tab: a switch at the top picks Recent or Favorites.
  var histTab = "recent";
  function renderHistoryTab() {
    Array.prototype.forEach.call(el("hist-seg").querySelectorAll("button"), function (b) { var on = b.getAttribute("data-h") === histTab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    el("hist-recent").hidden = histTab !== "recent";
    el("hist-favs").hidden = histTab !== "favs";
    renderHistory();
    renderSavedList();
  }
  function openHistory(which) {
    if (which) histTab = which;
    lastProduct = null;
    renderHistoryTab();
    show("history");
  }

  // ----- Shop: a wishlist kept on this phone, with where to buy each product in Mexico. -----
  // Prices are only what Sephora México and Euphoria list on their own sites (checked on the date in data/prices.json); nothing is estimated.
  // Amazon México gets a search link and no price, because its price changes by seller and we do not read it.
  var WKEY = "skinsafe.wish";
  function loadWish() {
    try {
      var s = JSON.parse(localStorage.getItem(WKEY) || "[]");
      return Array.isArray(s) ? s.filter(function (p) { return !window.isJunkProduct(p); }) : [];
    } catch (e) { return []; }
  }
  function storeWish(list) { try { localStorage.setItem(WKEY, JSON.stringify(list.slice(0, 100))); } catch (e) {} }
  function isWished(p) { var id = productId(p); return loadWish().some(function (x) { return x.id === id; }); }
  function toggleWish(p) {
    var id = productId(p), list = loadWish(), at = -1;
    list.forEach(function (x, i) { if (x.id === id) at = i; });
    if (at > -1) list.splice(at, 1);
    else list.unshift({ id: id, code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial, form: p.form || "", pack: p.pack || "", kind: p.kind || "", wishAt: Date.now() });
    storeWish(list);
  }
  function renderWishBtn(p) {
    var b = el("wish"), on = isWished(p);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Remove from wishlist" : "Add to wishlist");
    b.classList.toggle("on", on);
  }
  var pricesPromise = null;
  function loadPrices() {
    if (!pricesPromise) {
      var meta = document.querySelector('meta[name="app-version"]'), v = meta ? meta.getAttribute("content") : "dev";
      pricesPromise = fetch("data/prices.json?v=" + encodeURIComponent(v))
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .catch(function () { pricesPromise = null; return null; });
    }
    return pricesPromise;
  }
  function priceKey(p) { return String(p.brand || "").toLowerCase() + "|" + String(p.name || "").toLowerCase(); }
  function money(n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function niceDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""), mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return m ? Number(m[3]) + " " + mon[Number(m[2]) - 1] + " " + m[1] : "";
  }
  // The two stores that publish a price: row = [price, regular price if on sale (else 0), in stock (1/0), store id, size text]
  function storeEntries(p, data) {
    var e = (data && data.p && data.p[priceKey(p)]) || {};
    // Cheapest first. "Lowest" is only shown when both stores publish the size and it is the same.
    return [
      { name: "Sephora México", row: e.s, url: e.s ? "https://www.sephora.com.mx/products-" + e.s[3] + ".html" : "" },
      { name: "Euphoria", row: e.e, url: e.e ? "https://euphoria.com.mx/products/" + e.e[3] : "" }
    ].sort(function (a, b) { return (a.row ? a.row[0] : 1e9) - (b.row ? b.row[0] : 1e9); });
  }
  function lowestOf(entries) {
    var a = entries[0], b = entries[1];
    if (!a.row || !b.row || !a.row[2] || !b.row[2] || !a.row[4] || !b.row[4]) return null;
    if (String(a.row[4]).toLowerCase().replace(/\s/g, "") !== String(b.row[4]).toLowerCase().replace(/\s/g, "")) return null;
    return a.row[0] < b.row[0] ? a : b.row[0] < a.row[0] ? b : null;
  }
  function storeRowHtml(x, hasData, best) {
    var link = function (url, label) { return '<a class="store-go" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + ic("external") + "</a>"; };
    if (!x.row) return '<div class="store-row none"><span class="store-name">' + x.name + '</span><span class="store-none">' + (hasData ? "We didn’t find it here" : "Prices didn’t load") + "</span></div>";
    var r = x.row, sub = (r[2] ? "In stock" : "Out of stock") + (r[4] ? " · " + esc(r[4]) : "");
    return '<div class="store-row' + "" + (r[2] ? "" : " out") + (best === x ? " best" : "") + '">' +
      '<span class="store-name">' + '<span class="store-nm">' + x.name + (best === x ? '<span class="tag ok">Lowest</span>' : "") + '</span><span class="store-sub">' + sub + "</span></span>" +
      '<span class="store-price"><b>' + money(r[0]) + "</b>" + (r[1] ? "<s>" + money(r[1]) + "</s>" : "") + "</span>" + link(x.url, "View") + "</div>";
  }
  // Cheapest price a product has (in stock first); sorts the wishlist from the cheapest to the most expensive.
  function lowestPrice(p, data) {
    var best = null, out = null;
    storeEntries(p, data).forEach(function (x) {
      if (!x.row) return;
      if (x.row[2]) { if (!best || x.row[0] < best.price) best = { price: x.row[0], name: x.name, out: false }; }
      else if (!out || x.row[0] < out.price) out = { price: x.row[0], name: x.name, out: true };
    });
    return best || out;
  }
  var shopOpen = {};
  // Same rating tags as every other product card (band word + number, "For you", alerts), without the certification logos so the row stays short.
  function shopTags(p, an, si) {
    var ids = window.Profile.loadAllergies(), words = window.Profile.loadWords(), t = "";
    t += si.score === null ? '<span class="tag big sc none">Not enough data</span>' : scoreTag(si.score, true);
    t += youTag(p);
    if (window.Alerts && window.Alerts.match(p).length) t += '<span class="tag bad">' + ic("alert") + "Official alert</span>";
    if ((ids.length || words.length) && window.Profile.allergyHits(an.items, ids, words).length) t += '<span class="tag bad">' + ic("alert") + "Your allergy</span>";
    return t;
  }
  // One compact row per product (photo, name, lowest price); tap it to open its stores.
  function shopCardHtml(p, i, data) {
    var en = storeEntries(p, data), best = lowestOf(en), q = encodeURIComponent(((p.brand || "") + " " + (p.name || "")).trim()), id = productId(p), low = lowestPrice(p, data);
    var an = window.Ingredients.analyze(p.ingredientsText), si = scoreInfo(p, an), open = !!shopOpen[id];
    return '<div class="shop-item' + (open ? " open" : "") + '" data-id="' + esc(id) + '"><button type="button" class="shop-row" aria-expanded="' + open + '">' + photoHtml(p) +
      '<span class="shop-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="shop-name">' + esc(p.name) + "</span>" +
      '<span class="shop-tags">' + shopTags(p, an, si) + "</span></span>" +
      '<span class="shop-price">' + (low ? "<b>" + money(low.price) + "</b><span>" + (low.out ? "Out of stock · " : "") + low.name + "</span>" : "<span>No price</span>") + "</span>" + ic("chevron-right", "shop-chev") + "</button>" +
      '<div class="shop-more"><div class="store-list">' + en.map(function (x) { return storeRowHtml(x, !!data, best); }).join("") +
      '<div class="store-row amz"><span class="store-name">Also look at<span class="store-sub">We do not read these prices: tap to search</span></span>' +
      '<span class="store-more"><a class="store-go" href="https://www.amazon.com.mx/s?k=' + q + '" target="_blank" rel="noopener noreferrer">Amazon' + ic("external") + '</a>' +
      '<a class="store-go" href="https://www.walmart.com.mx/search?q=' + q + '" target="_blank" rel="noopener noreferrer">Walmart' + ic("external") + '</a></span></div></div>' +
      '<div class="shop-acts"><button type="button" class="secondary small-btn shop-open" data-i="' + i + '">Details' + ic("chevron-right") + '</button>' +
      '<button type="button" class="secondary small-btn shop-del" data-i="' + i + '" aria-label="Remove from wishlist">' + ic("trash") + "Remove</button></div></div></div>";
  }
  function renderShop() {
    var list = loadWish(), box = el("shop-list"), favs = loadSaved();
    loadPrices().then(function (data) {
      if (!list.length) {
        box.innerHTML = '<p class="saved-empty">Nothing here yet. Open a product and tap the cart to add it to your wishlist. We will show where to buy it in Mexico and what each store charges.</p>';
      } else {
        var rows = list.map(function (p, i) { var l = lowestPrice(p, data); return { p: p, i: i, k: l ? (l.out ? 1e6 : 0) + l.price : 2e6 }; });
        rows.sort(function (a, b) { return a.k - b.k || a.i - b.i; });          // cheapest first; products without a price last
        box.innerHTML = rows.map(function (r) { return shopCardHtml(r.p, r.i, data); }).join("");
        upgradePhotos(box);
      }
      var have = {}; list.forEach(function (x) { have[x.id] = 1; });
      var more = favs.filter(function (x) { return !have[x.id]; }).length, b = el("shop-addfavs");
      b.hidden = !more;
      b.textContent = "Add my " + (more === 1 ? "favorite" : more + " favorites") + " to the wishlist";
      el("shop-note").lastElementChild.textContent = (data && data.asOf ? "Prices are what Sephora México and Euphoria listed on " + niceDate(data.asOf) + ". Stores change them often and sizes can differ, so confirm in the store. " : "We could not load the prices, so only the store links work. ") +
        "We never estimate a price: where you see none, the store did not list it or we could not match the product with certainty.";
    });
  }

  // ----- Categories: browse the whole list by type (Face, Hair, Body, Mouth, First aid), best-rated first, with a search inside the category -----
  var cats = { area: "face", kind: "all", q: "", shown: 40 }, catsRows = [];
  function catsKinds() {
    var a = cats.area;
    return a === "hair" ? window.Hair.ORDER : a === "body" ? window.Body.ORDER : a === "mouth" ? window.Oral.ORDER : a === "aid" ? window.Oral.AID : window.Routine.ORDER;
  }
  function openCats() {
    window.Shop.load().then(function (list) {
      catalogList = list; catsCount = null;
      renderCats();
      show("cats");
    });
  }
  var catsCount = null;
  function renderCats(keepShown) {
    if (!catsCount) { catsCount = {}; catalogList.forEach(function (p) { var k = kindOf(p); catsCount[k] = (catsCount[k] || 0) + 1; }); }
    Array.prototype.forEach.call(el("cats-areas").querySelectorAll("button"), function (b) { var on = b.getAttribute("data-area") === cats.area; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    var kinds = catsKinds().filter(function (k) { return catsCount[k]; }), total = kinds.reduce(function (n, k) { return n + catsCount[k]; }, 0);
    el("cats-chips").innerHTML = ['<button type="button" class="cat-chip' + (cats.kind === "all" ? " on" : "") + '" data-k="all">All<small>' + total + "</small></button>"].concat(kinds.map(function (k) {
      return '<button type="button" class="cat-chip' + (cats.kind === k ? " on" : "") + '" data-k="' + k + '">' + esc(kindLabel(k)) + "<small>" + catsCount[k] + "</small></button>";
    })).join("");
    centerChip("cats-chips");
    if (!keepShown) cats.shown = 40;
    var want = cats.kind === "all" ? kinds : [cats.kind];
    var words = cats.q.toLowerCase().split(/\s+/).filter(Boolean);
    var rows = catalogList.filter(function (p) {
      if (want.indexOf(kindOf(p)) < 0) return false;
      var hay = (p.brand + " " + p.name).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    });
    rows = rows.map(function (p) { return { p: p, sc: scoreInfo(p, analysisOf(p)).score }; }).sort(function (x, y) { return (y.sc === null ? -1 : y.sc) - (x.sc === null ? -1 : x.sc); }).map(function (x) { return x.p; });
    catsRows = rows.slice(0, cats.shown);
    el("cats-count").textContent = rows.length ? plural(rows.length, "product", "products") + ", best rated first" : "Nothing found here.";
    el("cats-list").innerHTML = resultRows(catsRows);
    el("cats-more").hidden = rows.length <= cats.shown;
  }

  // ----- Suggested: the 10 best products of one category. "Best" = highest score shown everywhere (with the person's own subtractions), never a partial list,
  // no alert, no allergy hit, not a bad match for the quiz. Order: Excellent (76+) before the rest; inside each, "For you" first, then score, then fewer unrated ingredients, then a photo.
  // At most 2 per brand so the top 10 is not one brand's whole line. If a category has fewer than 10 at 90+, the rest are the best available and the page says so.
  var sug = { area: "face", kind: "", rows: [] }, SUG_N = 10, SUG_PER_BRAND = 2, SUG_HIGH = 90;
  function sugKinds(area) {
    var ks = area === "hair" ? window.Hair.ORDER : area === "body" ? window.Body.ORDER : area === "mouth" ? window.Oral.ORDER : window.Routine.ORDER;
    return ks.filter(function (k) { return sugCount[k]; });
  }
  var sugCount = null;
  function topFor(kind) {
    var hair = isHairKind(kind), ids = window.Profile.loadAllergies(), words = window.Profile.loadWords(), out = [];
    var prof = window.Oral.KINDS && window.Oral.KINDS[kind] ? null : hair ? window.Hair.load() : window.Profile.load();
    catalogList.forEach(function (p) {
      if (p.partial || kindOf(p) !== kind) return;
      var a = analysisOf(p), sc = scoreInfo(p, a).score;
      if (sc === null) return;
      if (window.Alerts && window.Alerts.match(p).length) return;
      if ((ids.length || words.length) && window.Profile.allergyHits(a.items, ids, words).length) return;
      var m = prof ? (hair ? window.Hair.match(a.items, prof, kind) : window.Profile.match(a.items, prof)) : { level: "good", helps: [] };
      if (m.level === "bad") return;
      out.push({ p: p, score: sc, ex: sc >= 76 ? 0 : 1, lv: m.level === "good" ? 0 : 1, helps: m.helps.length, unr: a.items.length ? a.counts.none / a.items.length : 1 });
    });
    out.sort(function (x, y) { return x.ex - y.ex || x.lv - y.lv || y.score - x.score || x.unr - y.unr || y.helps - x.helps || (y.p.image ? 1 : 0) - (x.p.image ? 1 : 0); });
    var perBrand = {}, picked = [];
    out.forEach(function (x) {
      var b = String(x.p.brand || "").toLowerCase();
      if (picked.length >= SUG_N || (perBrand[b] || 0) >= SUG_PER_BRAND) return;
      perBrand[b] = (perBrand[b] || 0) + 1; picked.push(x);
    });
    return { picked: picked, hasProf: !!prof };
  }
  // ----- Add a suggested product to the routine (12 Oct 2026) -----
  function periodForKind(k) {
    if (isHairKind(k)) return window.Hair.WASH.indexOf(k) >= 0 ? "hw" : "hs";
    if (isBodyKind(k)) return window.Body.DEFAULT_STEPS.bs.indexOf(k) >= 0 ? "bs" : "bc";
    return window.Routine.ORDER.indexOf(k) >= 0 ? "face" : "";
  }
  function inRoutine(p) {
    var r = window.Routine.load(), id = productId(p);
    return ["face", "hw", "hs", "bs", "bc"].some(function (pd) { return (r[pd] || []).some(function (s) { return s.product && productId(s.product) === id; }); });
  }
  // Fills the first empty step of that kind; if there is none, adds a step of that kind. Returns the period it went into ("" when the product has no routine step, like toothpaste or makeup).
  function addToRoutine(p) {
    var k = kindOf(p), pd = periodForKind(k);
    if (!pd) return "";
    var r = window.Routine.load(), steps = r[pd] || (r[pd] = []), order = isHairPeriod(pd) ? window.Hair.ORDER : isBodyPeriod(pd) ? window.Body.ORDER : window.Routine.ORDER, done = false;
    steps.forEach(function (s) { if (!done && s.kind === k && !s.product) { s.product = routineProd(p); done = true; } });
    if (!done) { steps.push({ kind: k, product: routineProd(p) }); steps.sort(function (x, y) { return order.indexOf(x.kind) - order.indexOf(y.kind); }); }
    window.Routine.save(r); rt = r; renderRoutineCard();
    return pd;
  }
  function sugActHtml(p, i) {
    if (!periodForKind(kindOf(p))) return "";
    return '<div class="sug-act">' + (inRoutine(p)
      ? '<span class="sug-in">' + ic("check") + 'In your routine</span><button type="button" class="link sug-view" data-i="' + i + '">View</button>'
      : '<button type="button" class="secondary small-btn sug-add" data-i="' + i + '">' + ic("plus") + "Add to routine</button>") + "</div>";
  }
  function renderSug() {
    if (!sugCount) { sugCount = {}; catalogList.forEach(function (p) { if (!p.partial) { var k = kindOf(p); sugCount[k] = (sugCount[k] || 0) + 1; } }); }
    Array.prototype.forEach.call(el("sug-areas").querySelectorAll("button"), function (b) { var on = b.getAttribute("data-area") === sug.area; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    var kinds = sugKinds(sug.area);
    if (kinds.indexOf(sug.kind) < 0) sug.kind = kinds[0] || "";
    el("sug-chips").innerHTML = kinds.map(function (k) { return '<button type="button" class="cat-chip' + (sug.kind === k ? " on" : "") + '" data-k="' + k + '">' + esc(kindLabel(k)) + "</button>"; }).join("");
    centerChip("sug-chips");
    var r = sug.kind ? topFor(sug.kind) : { picked: [], hasProf: false };
    sug.rows = r.picked.map(function (x) { return x.p; });
    var n = sug.rows.length, top = r.picked.filter(function (x) { return x.score >= SUG_HIGH; }).length;
    var you = r.picked.filter(function (x) { return x.lv === 0; }).length, hair = isHairKind(sug.kind);
    var line1 = !n ? "Nothing to suggest here yet." :
      top === n ? (n === SUG_N ? "Top 10, all scoring " + SUG_HIGH + " or more." : "Only " + n + " products here, all scoring " + SUG_HIGH + " or more.") :
      top === 0 ? "No product in this category reaches " + SUG_HIGH + " yet. These are the best we have." :
      "Only " + top + " in this category reach " + SUG_HIGH + " or more. The rest are the best available.";
    // Products that match the person's quiz come first. Without a quiz, nothing can be "For you", so the page says how to get that.
    var line2 = !n ? "" : !r.hasProf ? (window.Oral.KINDS[sug.kind] ? "" : " Take the " + (hair ? "hair" : "skin") + " quiz and these will be picked for you.") :
      you === n ? " All are For you." : " " + you + " of " + n + " are For you; the rest are only a possible match.";
    el("sug-note").textContent = line1 + line2;
    el("sug-list").innerHTML = sug.rows.map(function (p, i) { return '<div class="sug-item">' + cardHtml(p, i, false) + sugActHtml(p, i) + "</div>"; }).join("");
    el("sug-foot").textContent = n ? "Matches for your quiz first, then ranked by ingredient safety" + (prefsActive() ? " with your score preferences" : "") + ", at most 2 per brand. Products with a partial ingredient list, an alert, or one of your allergies are left out. It doesn't measure how well a product works." : "";
  }
  function openSug() {
    window.Shop.load().then(function (list) { catalogList = list; sugCount = null; renderSug(); show("sug"); });
  }

  // ----- Your routine: one list of steps for the morning and one for the night, saved only on this phone -----
  var catalogList = [], rtPeriod = "face", rtSel = 0, rtSelPeriod = "", rtStripPeriod = "", rt = null, rtSug = [], pickCtx = null, pickList = [], anCache = {}, scanCtx = null;
  function analysisOf(p) { var c = anCache[p.ingredientsText]; if (!c) { c = window.Ingredients.analyze(p.ingredientsText); anCache[p.ingredientsText] = c; } return c; }
  function routineProd(p) { return { id: productId(p), code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial, form: p.form || "", pack: p.pack || "", kind: p.kind || "" }; }
  function whenOf(p, kind) { return window.Routine.when(p, kind || kindOf(p), analysisOf(p).items); }
  function isHairKind(k) { return !!(window.Hair.KINDS[k]); }
  function isHairPeriod(pd) { return pd === "hw" || pd === "hs"; }
  function isBodyKind(k) { return !!(window.Body && window.Body.KINDS[k]); }
  function isBodyPeriod(pd) { return pd === "bs" || pd === "bc"; }
  // Hair and body steps have no morning or night.
  function noTimeKind(k) { return isHairKind(k) || isBodyKind(k); }
  var PERIOD_NAME = { face: "Face routine", hw: "Wash day", hs: "Styling and care", bs: "Shower", bc: "Body care" };
  function whenTag(w) {
    return w.when === "am" ? '<span class="tag when am">' + ic("sun") + "Morning</span>" : w.when === "pm" ? '<span class="tag when pm">' + ic("moon") + "Night</span>" :
      '<span class="tag when both"><span class="d">' + ic("sun") + '</span><span class="n">' + ic("moon") + "Day/night</span></span>";
  }
  // The preview shows the product the person chose for each step, or our suggestion until they choose one.
  function previewProducts(steps, period) {
    var used = steps.filter(function (s) { return s.product; }).map(function (s) { return productId(s.product); });
    return steps.map(function (s) {
      if (s.product) return s.product;
      var sug = suggest(s.kind, period, used, 1)[0];
      if (sug) used.push(productId(sug));
      return sug || null;
    });
  }
  // The routine keeps a copy of each chosen product. When our list changes (new ingredients, new photo, new name), refresh the copies
  // from the catalog: by barcode when there is one, otherwise by brand + name. Products we cannot find stay as they were.
  function sameKey(p) { return p.code ? "c:" + p.code : "n:" + String(p.brand || "").toLowerCase() + "|" + String(p.name || "").toLowerCase(); }
  function refreshRoutine(r) {
    var map = {}, changed = false;
    catalogList.forEach(function (c) { map[sameKey(c)] = c; });
    ["face", "hw", "hs", "bs", "bc"].forEach(function (pd) {
      (r[pd] || []).forEach(function (s) {
        if (!s.product || !s.product.shop) return;
        var c = map[sameKey(s.product)];
        if (!c) return;
        var fresh = routineProd(c);
        if (fresh.image !== s.product.image || fresh.ingredientsText !== s.product.ingredientsText || fresh.name !== s.product.name || fresh.brand !== s.product.brand || fresh.partial !== s.product.partial || fresh.form !== (s.product.form || "") || fresh.pack !== (s.product.pack || "") || fresh.kind !== (s.product.kind || "")) { s.product = fresh; changed = true; }
      });
    });
    return changed;
  }
  // Saved, History and the routine keep a COPY of each product. When the catalog learns more (a corrected list, the product form for the purity check), the copy goes stale
  // and the same product would show another score on another page. This brings every copy of a catalog product up to date, so one product has one score everywhere.
  function syncStored(list, key) {
    var map = {}, changed = false;
    catalogList.forEach(function (c) { map[sameKey(c)] = c; });
    var out = list.map(function (x) {
      if (!x.shop) return x;
      var c = map[sameKey(x)];
      if (!c) return x;
      if (c.ingredientsText === x.ingredientsText && c.name === x.name && c.brand === x.brand && !!c.partial === !!x.partial && (c.form || "") === (x.form || "") && (c.pack || "") === (x.pack || "") && (c.kind || "") === (x.kind || "") && (c.image || "") === (x.image || "")) return x;
      changed = true;
      var n = Object.assign({}, x, { name: c.name, brand: c.brand, image: c.image || "", ingredientsText: c.ingredientsText, partial: !!c.partial, form: c.form || "", pack: c.pack || "", kind: c.kind || "" });
      n.id = productId(n);
      return n;
    });
    var seen = {};
    out = out.filter(function (x) { if (seen[x.id]) { changed = true; return false; } seen[x.id] = 1; return true; });
    if (changed) { try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {} }
    return changed;
  }
  // Home card: three areas (Face, Hair, Body), each with the first three products of its steps (chosen, or our suggestion).
  var RC_AREAS = [["Face", "face", ["face"], "face"], ["Hair", "hair", ["hw", "hs"], "hw"], ["Body", "droplet", ["bs", "bc"], "bs"]];
  function renderRoutineCard() {
    function draw(r) {
      var cols = RC_AREAS.map(function (a) {
        var seen = {}, prods = [];
        a[2].forEach(function (pd) {
          previewProducts(r[pd], pd).forEach(function (p) {
            if (!p || seen[productId(p)]) return;
            seen[productId(p)] = true; prods.push(p);
          });
        });
        var dots = [0, 1, 2].map(function (i) { var p = prods[i]; return '<span class="rc-dot">' + (p ? photoHtml(p) : ic("droplet")) + "</span>"; }).join("");
        return '<div class="rc-col" data-period="' + a[3] + '">' + ic(a[1]) + '<b class="rc-name">' + a[0] + '</b><div class="rc-dots">' + dots + "</div></div>";
      }).join("");
      el("routine-card").innerHTML = '<p class="rc-title">Your routine</p><div class="rc-cols">' + cols + "</div>" +
        '<p class="rc-go">Tap to see and change your steps</p>';
    }
    draw(window.Routine.load());
    window.Shop.load().then(function (list) {
      if (!list.length) return;
      catalogList = list;
      var r = window.Routine.load();
      if (refreshRoutine(r)) window.Routine.save(r);
      var ch1 = syncStored(loadSaved(), SKEY), ch2 = syncStored(loadHistory(), HKEY), ch3 = syncStored(loadWish(), WKEY);
      if (ch1 || ch2 || ch3) { renderSavedList(); renderHistory(); if (!el("shop").hidden) renderShop(); }
      draw(r);
    });
  }
  // Is this product of the kind a routine step asks for (cleanser, shampoo, body lotion...)? Same rule for suggestions and for the picker search.
  function sameKind(p, kind) {
    if (window.Oral.classify(p)) return false;
    if (isHairKind(kind)) return window.Hair.classify(p) === kind;
    if (isBodyKind(kind)) return !window.Hair.classify(p) && window.Body.classify(p) === kind;
    return !window.Hair.classify(p) && !(window.Body.classify(p) && !faceAndBody(p)) && window.Routine.classify(p) === kind;
  }
  // Best-rated products of this kind that suit the person: no allergy hit, no official alert, a fair match for the quiz, and right for the time of day.
  function suggest(kind, period, exclude, limit) {
    var hair = isHairKind(kind), body = isBodyKind(kind);
    var prof = hair ? window.Hair.load() : window.Profile.load(), ids = window.Profile.loadAllergies(), words = window.Profile.loadWords(), out = [];
    catalogList.forEach(function (p) {
      if (p.partial || !sameKind(p, kind)) return;
      var a = analysisOf(p), sc = scoreInfo(p, a).score;
      // Hair products score lower in general, so they get a lower floor, and the best-rated ones still come first.
      if (sc === null || sc < (hair ? 35 : 51)) return;
      if (!hair && !body) {
        // One face list: a step used day and night only gets products that go both times; sunscreen and treatments follow their own time.
        var w = window.Routine.when(p, kind, a.items).when, need = window.Routine.stepWhen(kind);
        if (need === "any" ? w !== "any" : (w !== "any" && w !== need)) return;
      }
      if (exclude.indexOf(productId(p)) > -1) return;
      if (window.Alerts && window.Alerts.match(p).length) return;
      if ((ids.length || words.length) && window.Profile.allergyHits(a.items, ids, words).length) return;
      var m = prof ? (hair ? window.Hair.match(a.items, prof, kind) : window.Profile.match(a.items, prof)) : { level: "good", helps: [] };
      if (m.level === "bad") return;
      out.push({ p: p, score: sc, lv: m.level === "good" ? 0 : 1, helps: m.helps.length, low: hair && sc < 51 ? 1 : 0 });
    });
    // Highest score first. The score is the one shown everywhere, so it already has every subtraction the person turned on (purity, health, cruelty-free, vegan, skin and hair match).
    out.sort(function (x, y) { return y.score - x.score || x.lv - y.lv || y.helps - x.helps || (y.p.image ? 1 : 0) - (x.p.image ? 1 : 0); });
    var picked = [];
    if (limit > 1) {
      // Several suggestions come from different brands (at least 4 when the catalog has them): best of each brand first, then the rest by score
      var brands = {};
      out.forEach(function (x) { var b = String(x.p.brand || "").toLowerCase(); if (!brands[b] && picked.length < limit) { brands[b] = 1; x.used = 1; picked.push(x); } });
      out.forEach(function (x) { if (!x.used && picked.length < limit) picked.push(x); });
      picked.sort(function (x, y) { return y.score - x.score; });
    } else picked = out.slice(0, limit);
    return picked.map(function (x) { return x.p; });
  }
  // Same card as History and Favorites, with the time-of-day tag at the end of the row.
  function rtRow(p, kind, act, i) {
    return '<button type="button" class="fav-card pick-card" data-act="' + act + '" data-i="' + i + '">' + photoHtml(p) +
      '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
      '<span class="tags">' + cardTags(p) + (noTimeKind(kind) ? "" : whenTag(whenOf(p, kind))) + "</span></span></button>";
  }
  function scanBtn(i) { return '<button type="button" class="secondary small-btn" data-act="scan" data-i="' + i + '">' + ic("camera") + "Add</button>"; }
  function renderRoutine() {
    var K = window.Routine.KINDS, hairArea = isHairPeriod(rtPeriod), bodyArea = isBodyPeriod(rtPeriod);
    var prof = hairArea ? window.Hair.load() : window.Profile.load();
    el("rt-profile").innerHTML = hairArea
      ? "<b>Hair</b><span>" + esc(prof ? window.Hair.summary(prof) : "Take the hair quiz for better suggestions") + "</span>" + ic("chevron-right", "chev-ic")
      : "<b>Skin</b><span>" + esc(prof ? window.Profile.summary(prof) : "Take the skin quiz for better suggestions") + "</span>" + ic("chevron-right", "chev-ic");
    var faceArea = !hairArea && !bodyArea;
    el("rt-face").classList.toggle("on", faceArea); el("rt-hair").classList.toggle("on", hairArea); el("rt-body").classList.toggle("on", bodyArea);
    el("rt-face").setAttribute("aria-selected", String(faceArea)); el("rt-hair").setAttribute("aria-selected", String(hairArea)); el("rt-body").setAttribute("aria-selected", String(bodyArea));
    var tabs = hairArea ? [["hw", "droplet", "Wash day"], ["hs", "flame", "Styling"]] : bodyArea ? [["bs", "droplet", "Shower"], ["bc", "leaf", "Body care"]] : null;
    el("rt-sub").hidden = !tabs;   // the face routine is one list: no morning/night tabs
    if (tabs) ["rt-am", "rt-pm"].forEach(function (id, n) {
      var t = tabs[n];
      el(id).innerHTML = ic(t[1]) + t[2];
      el(id).setAttribute("data-period", t[0]);
      el(id).classList.toggle("on", rtPeriod === t[0]); el(id).setAttribute("aria-selected", String(rtPeriod === t[0]));
    });
    var kinds = hairArea ? window.Hair.ORDER : bodyArea ? window.Body.ORDER : window.Routine.ORDER;
    el("rt-add-kind").innerHTML = kinds.map(function (k) { return '<option value="' + k + '">' + K[k].label + "</option>"; }).join("");
    var steps = rt[rtPeriod];
    if (rtSelPeriod !== rtPeriod) { rtSel = 0; rtSelPeriod = rtPeriod; }
    if (rtSel > steps.length - 1) rtSel = Math.max(0, steps.length - 1);
    var used = steps.filter(function (s) { return s.product; }).map(function (s) { return productId(s.product); });
    rtSug = [];
    // The routine is a shelf: one row of products that slides sideways, a bottle outline where nothing is chosen yet, and the details of the tapped one below.
    var slots = steps.map(function (s, i) {
      var sug = null, p = s.product;
      if (!p) { sug = suggest(s.kind, rtPeriod, used, 1)[0] || null; if (sug) used.push(productId(sug)); }
      rtSug[i] = sug;
      var shown = p || sug, w = noTimeKind(s.kind) ? null : (shown ? whenOf(shown, s.kind) : { when: window.Routine.stepWhen(s.kind) });
      var img = shown ? photoHtml(shown) : bottleSvg(s.kind);
      return '<button type="button" class="shelf-slot' + (i === rtSel ? " sel" : "") + (p ? "" : " ghost") + '" data-act="sel" data-i="' + i + '"><span class="shelf-img">' + img + (w ? shelfBadge(w.when) : "") + "</span>" +
        '<span class="shelf-kind">' + esc(K[s.kind].label) + "</span>" +
        '<span class="shelf-name">' + (shown ? esc(shown.name) : "Pick one") + "</span>" +
        '<span class="shelf-brand">' + (p ? esc(p.brand) : shown ? "Suggested for you" : "Nothing suggested yet") + "</span></button>";
    });
    var shelves = '<div class="shelf-scroll"><div class="shelf-strip">' + slots.join("") + '</div></div><div class="shelf-plank"></div>';
    var panel = "";
    if (steps.length) {
      var i = rtSel, st = steps[i], pr = st.product, sg = rtSug[i], sh = pr || sg;
      var w2 = noTimeKind(st.kind) ? { when: "any", why: K[st.kind].tip } : sh ? whenOf(sh, st.kind) : { when: window.Routine.stepWhen(st.kind), why: K[st.kind].hint };
      var acts = pr
        ? '<button type="button" class="secondary small-btn" data-act="pick" data-i="' + i + '">Change</button>' + scanBtn(i) + '<button type="button" class="secondary small-btn" data-act="clear" data-i="' + i + '">Remove</button>'
        : sg ? '<button type="button" class="primary small" data-act="use" data-i="' + i + '">Use this</button><button type="button" class="secondary small-btn" data-act="pick" data-i="' + i + '">Alternatives</button>' + scanBtn(i)
        : '<button type="button" class="secondary small-btn" data-act="pick" data-i="' + i + '">Pick my own</button>' + scanBtn(i);
      var timeTag = !sh || noTimeKind(st.kind) ? "" : whenTag(w2);
      var chips = sh ? scorePill(sh) + youTag(sh) + timeTag : "";
      panel = '<div class="shelf-panel"><div class="shelf-hd"><p class="shelf-kind">' + esc(K[st.kind].label) + (pr ? "" : sg ? ' · <span class="shelf-sug">Suggested for you</span>' : "") + "</p>" +
        (sh ? '<button type="button" class="shelf-more" data-act="' + (pr ? "open" : "opensug") + '" data-i="' + i + '">Details' + ic("chevron-right") + "</button>" : "") + "</div>" +
        (sh ? '<p class="shelf-pname">' + esc(sh.name) + '</p><p class="shelf-brand">' + esc(sh.brand) + "</p>" : '<p class="shelf-pname">Nothing here yet</p>') +
        (chips ? '<div class="tags shelf-chips">' + chips + "</div>" : "") +
        '<div class="shelf-actrow">' + acts + '<span class="shelf-sp"></span><button type="button" class="secondary small-btn shelf-trash" data-act="del" data-i="' + i + '" aria-label="Delete this step">' + ic("trash") + "</button></div>" +
        (!sh || noTimeKind(st.kind) ? '<p class="rt-tip">' + esc(w2.why) + "</p>" : "") + "</div>";
    }
    var oldStrip = document.querySelector("#rt-steps .shelf-scroll"), keepX = oldStrip && rtStripPeriod === rtPeriod ? oldStrip.scrollLeft : 0;
    el("rt-steps").innerHTML = steps.length ? routineRater(routineAreaOf(rtPeriod)) + panel + shelves : '<p class="rt-empty">No steps yet. Add one below.</p>';
    // The shelf slides sideways: keep its position after a tap, and bring the tapped product fully into view.
    var strip = document.querySelector("#rt-steps .shelf-scroll");
    if (strip) {
      strip.scrollLeft = keepX; rtStripPeriod = rtPeriod;
      var cur = strip.querySelector(".shelf-slot.sel");
      if (cur) { var l = cur.offsetLeft, r = l + cur.offsetWidth; if (l < strip.scrollLeft) strip.scrollLeft = l - 4; else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 4; }
    }
  }
  // ----- Routine score for the whole area (Face, Hair or Body), shown above the product card -----
  // Average safety score of the chosen products, minus points for each product that does not match your quiz (8), triggers an allergy (12)
  // or an official alert (12), minus 5 if a retinoid and an exfoliating acid are in the same face routine. Products without a score are left out.
  var RT_AREA = { face: ["face"], hair: ["hw", "hs"], body: ["bs", "bc"] };
  function routineAreaOf(pd) { return isHairPeriod(pd) ? "hair" : isBodyPeriod(pd) ? "body" : "face"; }
  function routineRater(area) {
    var steps = [], chosen = [];
    RT_AREA[area].forEach(function (pd) { (rt[pd] || []).forEach(function (st) { steps.push(st); if (st.product) chosen.push(st); }); });
    var name = area === "hair" ? "Hair routine" : area === "body" ? "Body routine" : "Face routine";
    var head = "";
    if (!chosen.length) return '<div class="rt-rater">' + head + '<p class="rt-rater-empty">Choose products to see the score.</p></div>';
    var prof = area === "hair" ? window.Hair.load() : window.Profile.load(), ids = window.Profile.loadAllergies(), words = window.Profile.loadWords();
    var scores = [], notes = [], noMatch = 0, allergy = 0, alerts = 0, retinoid = 0, acid = 0, unrated = 0;
    chosen.forEach(function (st) {
      var p = st.product, a = analysisOf(p);
      var rsc = scoreInfo(p, a).score;
      if (rsc === null) unrated++; else scores.push(rsc);
      if (prof) { var m = area === "hair" ? window.Hair.match(a.items, prof, st.kind) : window.Profile.match(a.items, prof); if (m.level === "bad") noMatch++; }
      if ((ids.length || words.length) && window.Profile.allergyHits(a.items, ids, words).length) allergy++;
      if (window.Alerts && window.Alerts.match(p).length) alerts++;
      if (area === "face") { var why = window.Routine.when(p, st.kind, a.items).why; if (/^Retinoids/.test(why)) retinoid++; else if (/^Exfoliating acids/.test(why)) acid++; }
    });
    var clash = area === "face" && retinoid > 0 && acid > 0;
    if (!scores.length) return '<div class="rt-rater">' + head + '<p class="rt-rater-empty">Not enough data to score yet.</p></div>';
    var avg = scores.reduce(function (x, y) { return x + y; }, 0) / scores.length;
    var total = Math.max(0, Math.min(100, Math.round(avg - 8 * (fitPrefActive() ? 0 : noMatch) - 12 * allergy - 12 * alerts - (clash ? 5 : 0)))), b = band(total);
    if (allergy) notes.push(plural(allergy, "allergy hit", "allergy hits"));
    if (alerts) notes.push(plural(alerts, "official alert", "official alerts"));
    if (noMatch) notes.push(noMatch + " not for your " + (area === "hair" ? "hair" : "skin"));
    if (clash) notes.push("Retinoid + acid: use on different nights");
    if (!prof) notes.push("Take the quiz to check the fit");
    if (unrated) notes.push(unrated + " not scored");
    if (!notes.length) notes.push("All good");
    return '<div class="rt-rater">' + head + '<div class="rt-rater-row"><span class="rt-rater-score">' + total + '<small>/100</small></span><span class="tag sc ' + b.cls + '">' + esc(b.label) + '</span><span class="rt-rater-meta">' + chosen.length + "/" + steps.length + ' steps</span></div>' +
      '<p class="rt-rater-notes">' + esc(notes.join(" \u00b7 ")) + "</p></div>";
  }
  // Day, night or both, as sun and moon icons on top of each product.
  function shelfBadge(when) {
    return '<span class="shelf-badge" aria-label="' + (when === "am" ? "Morning" : when === "pm" ? "Night" : "Day and night") + '">' + (when === "pm" ? "" : ic("sun")) + (when === "am" ? "" : ic("moon")) + "</span>";
  }
  var SHAPE = { cleanser: "tube", toner: "tall", serum: "drop", treatment: "drop", eye: "jar", moisturizer: "jar", sunscreen: "tube", mask: "jar", shampoo: "tall", conditioner: "tube", hmask: "jar", leavein: "tall", heat: "tall", hoil: "drop", scalp: "drop", intimate: "tall", bodywash: "tall", bscrub: "jar", blotion: "tube", boil: "drop", bsun: "tube", deo: "tall", hand: "tube", foot: "jar", lip: "tube", btreat: "tall", bmist: "tall" };
  function bottleSvg(kind) {
    var g = { tube: '<rect x="22" y="6" width="26" height="12" rx="3"/><path d="M14 18h42l-4 76H18z"/>', tall: '<rect x="26" y="4" width="18" height="14" rx="3"/><rect x="29" y="18" width="12" height="10"/><rect x="16" y="28" width="38" height="66" rx="8"/>', drop: '<rect x="30" y="2" width="10" height="16" rx="5"/><rect x="26" y="16" width="18" height="10" rx="2"/><rect x="16" y="26" width="38" height="68" rx="9"/>', jar: '<rect x="10" y="46" width="50" height="16" rx="4"/><rect x="8" y="62" width="54" height="32" rx="8"/>' }[SHAPE[kind] || "tall"];
  return '<svg class="shelf-outline" viewBox="0 0 70 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="5 4">' + g + "</svg>";
  }
  function saveRoutine() { window.Routine.save(rt); renderRoutineCard(); }
  function openRoutine() {
    window.Shop.load().then(function (list) {
      catalogList = list; rt = window.Routine.load();
      if (refreshRoutine(rt)) window.Routine.save(rt);
      renderRoutine(); show("routine");
    });
  }
  function pickRows(list) {
    return list.map(function (p, i) { return rtRow(p, pickCtx.kind, "choose", i); }).join("");
  }
  function openPick(i) {
    var s = rt[rtPeriod][i];
    pickCtx = { i: i, period: rtPeriod, kind: s.kind };
    el("pick-title").textContent = "Choose your " + window.Routine.KINDS[s.kind].label.toLowerCase();
    el("pick-sub").textContent = PERIOD_NAME[rtPeriod] + ". Pick the one you own or one of our suggestions.";
    el("pick-q").value = "";
    var favs = loadSaved().slice().sort(function (a, b) { return (kindOf(b) === s.kind ? 1 : 0) - (kindOf(a) === s.kind ? 1 : 0); });
    var used = rt[rtPeriod].filter(function (x, k) { return k !== i && x.product; }).map(function (x) { return productId(x.product); });
    var sugs = suggest(s.kind, rtPeriod, used, 8);
    pickList = sugs.concat(favs);
    el("pick-list").innerHTML = '<p class="pick-head">Suggested for you</p>' + (sugs.length ? sugs.map(function (p, k) { return rtRow(p, s.kind, "choose", k); }).join("") : '<p class="rt-empty">No suggestions for this step yet. Search for yours above.</p>') +
      (favs.length ? '<p class="pick-head">Your favorites</p>' + favs.map(function (p, k) { return rtRow(p, s.kind, "choose", sugs.length + k); }).join("") : "");
    show("pick");
  }
  function pickSearch(q) {
    q = String(q || "").trim();
    if (q.length < 2) return;
    var kind = pickCtx.kind, label = window.Routine.KINDS[kind].label.toLowerCase();
    var mine = window.Catalog.search(q);
    el("pick-list").innerHTML = '<p class="pick-head">Searching…</p>';
    window.Shop.search(q).then(function (found) {
      // Products of this step's kind first, all of them; the rest go below in case one is filed under another kind.
      var all = mine.concat(found.filter(function (s) { return !mine.some(function (m) { return m.brand === s.brand && m.name === s.name; }); }));
      var same = all.filter(function (p) { return sameKind(p, kind); }), other = all.filter(function (p) { return !sameKind(p, kind); }).slice(0, 60);
      pickList = same.concat(other);
      function rows(list, from) { return list.map(function (p, k) { return rtRow(p, kind, "choose", from + k); }).join(""); }
      el("pick-list").innerHTML = pickList.length
        ? '<p class="pick-head">Results for “' + esc(q) + '” in ' + esc(label) + "</p>" + (same.length ? rows(same, 0) : '<p class="rt-empty">No ' + esc(label) + ' matches. These are the other products that match:</p>') +
          (other.length && same.length ? '<p class="pick-head">Other products matching “' + esc(q) + '”</p>' : "") + rows(other, same.length)
        : '<p class="rt-empty">Nothing found. Try the brand and one product word.</p>';
    });
  }
  function routineAction(e) {
    var b = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!b) return;
    var act = b.getAttribute("data-act"), i = Number(b.getAttribute("data-i")), steps = rt[rtPeriod];
    if (act === "sel") { rtSel = i; renderRoutine(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (act === "del") steps.splice(i, 1);
    else if (act === "clear") steps[i].product = null;
    else if (act === "use" && rtSug[i]) steps[i].product = routineProd(rtSug[i]);
    else if (act === "pick") { openPick(i); return; }
    else if (act === "scan") { startRoutineScan(rtPeriod, i); return; }
    else if (act === "open") { cameFrom = "routine"; renderResult(steps[i].product); return; }
    else if (act === "opensug" && rtSug[i]) { cameFrom = "routine"; renderResult(rtSug[i]); return; }
    else return;
    saveRoutine(); renderRoutine();
  }
  function renderNameCard() {
    var n = getName();
    el("name-card").innerHTML = '<p class="profile-label">' + ic("user") + 'Name</p><p class="profile-text">' + (n ? esc(pretty(n)) : "Not set") + '</p>' +
      '<div class="profile-actions"><button type="button" class="link" id="name-edit">' + (n ? "Change" : "Add your name") + "</button></div>";
    el("name-edit").addEventListener("click", function () { goHome().then(function () { renderGreeting(true); }); });
  }

  // ----- result -----
  // A box whose title stays visible and whose details open on tap.
  function fold(title, body, open) {
    return '<details class="fold"' + (open ? " open" : "") + '><summary class="match-title">' + title + '<span class="chev" aria-hidden="true"></span></summary>' + body + "</details>";
  }
  function renderMatch(items, product) {
    var box = el("match");
    if (product && window.Oral.classify(product)) { box.hidden = true; return; }
    var hk = product ? window.Hair.classify(product) : null;
    var p = hk ? window.Hair.load() : window.Profile.load();
    box.hidden = false;
    if (!p) {
      box.className = "match prompt";
      box.innerHTML = '<p class="match-title">' + ic(hk ? "hair" : "droplet") + (hk ? "Does this suit your hair?" : "Does this suit your skin?") + "</p>" +
        '<button type="button" class="secondary small-btn" id="match-quiz">' + (hk ? "Take the 5-question hair quiz" : "Take the 6-question quiz") + "</button>";
      el("match-quiz").addEventListener("click", function () { startQuiz(null, hk ? "hair" : "skin"); });
      return;
    }
    var m = hk ? window.Hair.match(items, p, hk) : window.Profile.match(items, p);
    box.className = "match " + m.level;
    var icon = m.level === "good" ? "check" : "alert";
    var html = "";
    if (m.reasons.length) {
      html += '<ul class="match-list">' + m.reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
    }
    if (m.helps.length) {
      html += '<ul class="match-list helps">' + m.helps.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
    }
    if (!m.reasons.length && !m.helps.length) html += '<p class="match-text">Nothing here conflicts with your answers.</p>';
    box.innerHTML = fold(ic(icon) + esc(m.title), html, false);
  }

  function renderAllergyBox(items) {
    var box = el("allergy-box");
    var ids = window.Profile.loadAllergies();
    var words = window.Profile.loadWords();
    if (!ids.length && !words.length) { box.hidden = true; return; }
    var hits = window.Profile.allergyHits(items, ids, words);
    if (!hits.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.className = "match bad allergy-box";
    box.innerHTML = '<p class="match-title">' + ic("alert") + "Has something you're allergic to</p>" +
      '<ul class="match-list">' + hits.map(function (h) {
        return "<li><strong>" + esc(h.name) + "</strong> (" + esc(h.labels.join(", ")) + ")</li>";
      }).join("") + "</ul>";
  }

  var ALERT_LABEL = { recall: "Official recall or alert", litigation: "Lawsuits, not proven" };
  var ALERT_ICON = { recall: "alert", litigation: "scale" };
  function renderAlerts(product) {
    var box = el("alerts");
    var found = window.Alerts ? window.Alerts.match(product) : [];
    box.hidden = found.length === 0;
    box.innerHTML = found.map(function (a) {
      var links = a.sources.map(function (s) {
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + "</a>";
      }).join(" · ");
      return '<div class="alert ' + a.kind + '"><p class="alert-kind">' + ic(ALERT_ICON[a.kind]) + esc(ALERT_LABEL[a.kind]) + (a.kind === "recall" ? " · " + esc(a.date) : "") + "</p>" +
        '<p class="alert-title">' + esc(a.title) + "</p>" +
        '<p class="alert-text">' + esc(a.text) + "</p>" +
        (a.why ? '<p class="alert-why">' + esc(a.why) + "</p>" : "") +
        '<p class="alert-src">' + links + "</p></div>";
    }).join("");
  }

  // Two separate lines per ingredient (12 Oct 2026): the legal RULE, and how firm the EVIDENCE IN PEOPLE is. They can disagree (a ban made from animal studies
  // is a firm rule with very early evidence), so they are never merged. Codes and method: docs/investigacion-12oct/.
  var EV_WORD = { A: "High", M: "Moderate", L: "Low", V: "Very early" };
  function evidenceHtml(i) {
    var out = "", ev = i.ev, ph = window.Pores && window.Pores.hit(i);
    if (ph && ph.t !== "l" && (!ev || "UNT".indexOf(ev[0]) >= 0)) ev = [ph.e, ph.c, ph.s];   // the pore-clogging list has its own checked sources
    var k = ev && ev[0];
    var rule = i.danger ? "banned in EU cosmetics" : i.level === "bad" ? "restricted, or a declared allergen, in the EU or Korea" : i.level === "mid" ? "not banned, but worth watching" : "";
    // Primary sources behind the evidence line (studies, regulator opinions), when we have checked them
    var links = ev && ev[2] && ev[2].length ? '<span class="ev-links"> ' + ev[2].map(function (x) { return '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener">' + esc(x[0]) + "</a>"; }).join(" · ") + "</span>" : "";
    if (rule) out += '<p class="ing-ev"><b>Rule:</b> ' + esc(rule) + ".</p>";
    if (EV_WORD[k]) out += '<p class="ing-ev"><b>Evidence in people:</b> <span class="evtag">' + EV_WORD[k] + "</span> " + esc(ev[1]) + "." + links + "</p>";
    else if (k === "U") out += '<p class="ing-ev"><b>Evidence in people:</b> <span class="evtag none">Not verified</span> ' + (ev[1] ? "We looked: " + esc(ev[1]) + "." : "The only source we found is the EU ingredient database (CosIng), which lists names and functions, not studies.") + links + "</p>";
    else if (k === "T") out += '<p class="ing-ev"><b>Evidence in people:</b> <span class="evtag none">Rated by type</span> No study of its own.</p>';
    else if (k === "R") out += '<p class="ing-ev"><b>Evidence in people:</b> <span class="evtag none">Not rated</span> Only a legal limit, not a health claim.</p>';
    else if (k === "E") out += '<p class="ing-ev"><b>Evidence in people:</b> <span class="evtag none">Not rated</span> An environmental rule, not a health claim.</p>';
    if (EV_WORD[k] || k === "U") out += '<p class="ing-evnote">This says how firm the evidence is, not how serious it is. Not verified does not mean safe.</p>';
    return out;
  }

  // The category chips are one scrolling row; bring the chosen one to the middle
  function centerChip(id) {
    var box = el(id), on = box && box.querySelector(".cat-chip.on");
    if (on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
  }
  // ----- Better options: when a scanned or opened product is Good or below (75 or less), three better products of the same kind (12 Oct 2026) -----
  var altList = [];
  // Same kind AND same form: a dry shampoo is not matched with a regular shampoo, a lash serum not with eye patches, a mouthwash not with a toothpaste
  function altGroup(p) {
    var k = kindOf(p), n = String(p.name || ""), t = [];
    if (/dry shampoo|champ[u\u00fa] seco/i.test(n)) t.push("dry");
    if (/\b(patch|patches|pad|pads|tape|sheet|wipes?|toallitas|parches)\b/i.test(n)) t.push("sheet");
    if (/\b(lash|lashes|brow|brows|pesta[n\u00f1]as?|cejas?)\b/i.test(n)) t.push("lash");
    if (/\b(spray|mist|bruma)\b/i.test(n)) t.push("spray");
    if (/\b(stick|barra)\b/i.test(n)) t.push("stick");
    if (k === "oral" && /rinse|mouthwash|enjuague|wash/i.test(n)) t.push("rinse");
    return k + "|" + t.join(",");
  }
  function groupCached(c) { return c.__g || (c.__g = altGroup(c)); }
  function alternatives(p, cur) {
    var k = kindOf(p), grp = altGroup(p);
    if (k === "other") return [];
    var hair = isHairKind(k), prof = hair ? window.Hair.load() : window.Profile.load(), ids = window.Profile.loadAllergies(), words = window.Profile.loadWords(), me = sameKey(p), out = [];
    var floor = Math.max(hair ? 45 : 51, cur + 8);
    var face = !hair && !isBodyKind(k) && k !== "oral" && k !== "aid", wp = face ? window.Routine.when(p, k, analysisOf(p).items).when : "";
    catalogList.forEach(function (c) {
      if (c.partial || sameKey(c) === me || groupCached(c) !== grp) return;
      var a = analysisOf(c), sc = scoreInfo(c, a).score;
      if (sc === null || sc < floor) return;
      // Face products keep their time of day: a night cream is not offered in place of a day cream
      if (face) { var wc = window.Routine.when(c, k, a.items).when; if (wc !== "any" && wc !== wp) return; }
      if (window.Alerts && window.Alerts.match(c).length) return;
      if ((ids.length || words.length) && window.Profile.allergyHits(a.items, ids, words).length) return;
      var m = prof && k !== "oral" && k !== "aid" ? (hair ? window.Hair.match(a.items, prof, k) : window.Profile.match(a.items, prof)) : { level: "good" };
      if (m.level === "bad") return;
      out.push({ p: c, score: sc, brand: String(c.brand || "").toLowerCase(), img: c.image ? 1 : 0 });
    });
    out.sort(function (x, y) { return y.score - x.score || y.img - x.img; });
    var picked = [], seen = {};
    out.forEach(function (x) { if (!seen[x.brand] && picked.length < 3) { seen[x.brand] = 1; picked.push(x); } });
    return picked.map(function (x) { return x.p; });
  }
  function renderAlternatives(product, score) {
    var box = el("alt-box");
    box.hidden = true; box.innerHTML = ""; altList = [];
    if (score === null || score > 75) return;   // Good (51 to 75), Not great and Bad get better options; Excellent does not
    window.Shop.load().then(function (list) {
      if (lastProduct !== product || !list.length) return;
      catalogList = list;
      altList = alternatives(product, score);
      if (!altList.length) return;
      box.innerHTML = '<p class="alt-title">' + ic("shield-check") + "Better options</p>" + '<div class="alt-strip">' + altList.map(function (c, i) {
        var s = scoreInfo(c, analysisOf(c)).score, b = band(s);
        return '<button type="button" class="alt-slot" data-i="' + i + '"><span class="shelf-img">' + photoHtml(c) + '<span class="tag sc ' + b.cls + '">' + s + "</span></span>" +
          '<span class="shelf-name">' + esc(c.name) + '</span><span class="shelf-brand">' + esc(c.brand) + "</span></button>";
      }).join("") + "</div>";
      box.hidden = false;
    });
  }
  // One short line on how to use each kind of product (shown under the name on the product page)
  var USE_LINE = {
    cleanser: "Massage on damp skin, then rinse.", toner: "Press into clean skin, before serum.", serum: "A few drops on clean skin, before cream.",
    treatment: "At night, on clean dry skin. Start slowly.", eye: "Dab a little around the eye with a fingertip.", moisturizer: "After serum, morning and night.",
    sunscreen: "Last step in the morning; reapply outdoors.", mask: "Leave on as the pack says, then rinse.",
    shampoo: "Massage into the scalp, not the ends, then rinse.", conditioner: "Mid-lengths to ends, leave 2 minutes, rinse.", hmask: "After shampoo, leave on as the pack says.",
    leavein: "On damp hair after washing, mid-lengths to ends.", heat: "Spray before any heat tool.", hoil: "A few drops on the ends, dry or damp hair.", scalp: "On the scalp, as the pack says.",
    intimate: "Outside only, then rinse well.", bodywash: "Lather on damp skin, rinse well.", bscrub: "Once or twice a week on damp skin.", blotion: "On damp skin right after the shower.",
    boil: "A few drops on damp skin after the shower.", bsun: "Generous amount; reapply every 2 hours outdoors.", deo: "On clean, dry underarms.", hand: "Whenever hands feel dry, and after washing.",
    foot: "On clean, dry feet, especially heels.", lip: "Whenever lips feel dry, and before bed.", btreat: "On clean, dry skin, as the pack says.", bmist: "Spray on the body, away from the eyes.",
    aid: "Use as the pack says."
  };
  function useLine(p) {
    var k = kindOf(p);
    if (/dry shampoo|champ[u\u00fa] seco/i.test(p.name || "")) return "Spray on the roots, wait a minute, brush out.";
    if (k === "oral") return /rinse|mouthwash|enjuague|wash/i.test(p.name || "") ? "Swish 30 seconds, spit, don't swallow." : "Brush two minutes, spit, don't rinse after.";
    return USE_LINE[k] || "";
  }
  // Probable amount, only for flagged or to-watch ingredients (see js/dose.js)
  function doseHtml(i) {
    var s = window.Dose && (i.declared != null || (i.level && i.level !== "good")) ? window.Dose.describe(i) : "";
    return s ? '<p class="ing-ev">' + esc(s) + "</p>" : "";
  }
  function ingredientRow(i) {
    var labels = window.Ingredients.RISK_LABEL;
    var icons = window.Ingredients.RISK_ICON;
    var chips = i.risks.map(function (r) { return '<span class="risk">' + ic(icons[r]) + esc(labels[r]) + "</span>"; }).join("");
    var allergenChips = window.Profile.allergenLabels(i).map(function (l) {
      return '<span class="risk allergen">' + ic("alert") + "Allergen if you're allergic to: " + esc(l) + "</span>";
    }).join("");
    var hints = "";
    if (i.risks.indexOf("allergy") > -1) hints += '<p class="ing-hint">' + ic("info") + "Can cause allergy: some people become allergic after repeated contact, and it usually stays. Not everyone reacts.</p>";
    var pore = window.Pores && window.Pores.hit(i);
    if (pore && pore.t !== "l") {
      if (i.risks.indexOf("comedogenic") < 0) chips += '<span class="risk">' + ic("circle-dot") + "May clog pores</span>";
      hints += '<p class="ing-hint">' + ic("info") + "May clog pores: this ingredient clogged pores in lab tests (mostly on rabbits)" + (pore.e === "L" ? " and in a small human test" : "") + ". Whole products often don't, and the amount matters. Worth watching if you get clogged pores or acne.</p>";
    }
    if (i.risks.indexOf("irritation") > -1) hints += '<p class="ing-hint">' + ic("info") + "Irritation is not an allergy. It depends on the amount and on your skin, and it usually goes away when you stop.</p>";
    var helps = i.helps.length ? '<p class="ing-helps">Often used for: ' + esc(i.helps.join(", ")) + "</p>" : "";
    var links = i.src.map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + "</a>";
    });
    // Peer-reviewed research (universities, hospitals) from PubMed, review articles only, and Japanese journals.
    var term = (i.inci || i.name).replace(/\([^)]*\)/g, " ").replace(/[^\w\s,\/.-]/g, " ").replace(/\s+/g, " ").trim();
    if (term) {
      var url = "https://pubmed.ncbi.nlm.nih.gov/?term=" + encodeURIComponent(term + " AND skin AND review[pt]");
      links.push('<a href="' + esc(url) + '" target="_blank" rel="noopener">Research reviews (PubMed)</a>');
      var jurl = "https://www.jstage.jst.go.jp/result/global/-char/en?globalSearchKey=" + encodeURIComponent(term);
      links.push('<a href="' + esc(jurl) + '" target="_blank" rel="noopener">Japanese research (J-STAGE)</a>');
    }
    var levelWord = { bad: "Flagged", mid: "To watch", good: "Good" }[i.level] || "";
    return '<li><details class="ing"><summary>' +
      '<span class="ing-main"><span class="ing-name">' + esc(i.name) + '</span>' +
      '<span class="ing-level"><i class="dot ' + i.level + '"></i><b class="lv ' + i.level + '">' + levelWord + '</b><span class="ing-note">' + esc(i.note) + "</span></span></span>" +
      '<span class="chev" aria-hidden="true"></span></summary>' +
      '<div class="ing-body"><p class="ing-detail">' + esc(i.detail) + "</p>" + doseHtml(i) + evidenceHtml(i) +
      ((chips || allergenChips) ? '<div class="risks">' + chips + allergenChips + "</div>" : "") + hints + helps +
      '<p class="ing-src">Look it up in: ' + links.join(" · ") + "</p></div></details></li>";
  }

  // Ingredients: the most important ones first (flagged, then to watch, then good). "See all" swaps them, in the same card,
  // for the whole label as one coloured list (and "Show less" brings the short list back).
  var ING_LIMIT = 6, ingRated = [], ingFull = false, ingAll = [];
  function renderIngredientList() {
    var ul = el("ingredients"), box = el("ing-fullbox"), btn = el("ing-all");
    ul.hidden = ingFull;
    box.hidden = !ingFull;
    if (ingFull) {
      el("ing-fulltext").innerHTML = ingAll.map(function (i) { return i.level ? '<span class="il ' + i.level + '">' + esc(i.name) + "</span>" : esc(i.name); }).join(", ");
    } else {
      ul.innerHTML = ingRated.slice(0, ING_LIMIT).map(ingredientRow).join("");
    }
    btn.hidden = !ingAll.length;
    btn.innerHTML = (ingFull ? "Show less" : "See all " + ingAll.length) + '<span class="chev-r" aria-hidden="true"></span>';
    btn.classList.toggle("open", ingFull);
    btn.setAttribute("aria-expanded", ingFull ? "true" : "false");
  }

  function renderResult(product) {
    lastProduct = product;
    addHistory(product);
    notItCtx = nextNotIt; nextNotIt = null;
    el("not-it").hidden = !notItCtx;
    var a = window.Ingredients.analyze(product.ingredientsText), si = scoreInfo(product, a);
    var b = band(si.score);

    el("brand").textContent = product.brand;
    el("name").textContent = product.name;
    var photo = el("photo");
    photo.hidden = true;
    el("photo-ph").hidden = false;
    if (product.image) {
      photo.referrerPolicy = "no-referrer";
      photo.onerror = function () { photo.hidden = true; el("photo-ph").hidden = false; };
      var showPhoto = function () { if (lastProduct === product) { photo.src = product.image; photo.hidden = false; el("photo-ph").hidden = true; } };
      if (product.shop) showPhoto(); else photoOk(product.image).then(function (ok) { if (ok) showPhoto(); });
    }

    var n = a.counts;
    var score = el("score");
    score.className = "score-pill " + b.cls;
    score.innerHTML = ic(b.icon) + esc(b.label) + (si.score === null ? "" : ": " + si.score + "/100");
    // No explanation of the points taken off or of the flag counts: the score pill, the icons and the preferences in Profile already say it.
    // One short line on how to use this kind of product instead.
    el("score-adj").hidden = true;
    el("sub").textContent = a.score === null ? "We don't know enough of these ingredients yet" : useLine(product);

    el("counts").innerHTML =
      '<span class="pill good">' + ic("check") + n.good + " good</span>" +
      '<span class="pill mid">' + ic("eye") + n.mid + " to watch</span>" +
      '<span class="pill bad">' + ic("flag") + plural(n.bad, "flag", "flags") + "</span>";

    var marks = marksFor(product, a.items), badges = el("badges");
    badges.hidden = marks.length === 0;
    badges.innerHTML = marks.length
      ? '<span class="mlogos big">' + logosHtml(marks) + "</span>" +
        '<p class="badge-note">' + marksNote(marks) + "</p>"
      : "";
    // The packaging explanation lives only in "How we rate" (the plastic switch in Profile still takes points off; see packOf)
    el("pack-box").hidden = true;
    renderAlternatives(product, si.score);
    var note = el("catalog-note");
    if (product.shop) {
      var host = "";
      try { host = new URL(product.source).hostname.replace(/^www\./, ""); } catch (e) {}
      note.hidden = false;
      note.innerHTML = ic("info") + "<span>" +
        (product.linked ? "You linked this barcode to this product on this phone. " : "") +
        "Ingredient list copied from an online listing" + (host ? " (" + esc(host) + ")" : "") + ". Packages sold in Mexico can differ, so check the label." +
        (product.partial ? " <strong>This list may be incomplete</strong>, so the score could change." : "") +
        (product.note ? " " + esc(product.note) : "") + "</span>";
    } else if (product.local && product.code) {
      note.hidden = false;
      note.innerHTML = ic("camera") + '<span>Saved from your photo. When you scan this barcode again it will appear here, on this phone. ' +
        '<a href="https://world.openbeautyfacts.org/cgi/product.pl?type=search_or_add&code=' + encodeURIComponent(product.code) + '" target="_blank" rel="noopener">Add it to Open Beauty Facts</a> so everyone finds it.</span>';
    } else { note.hidden = true; note.innerHTML = ""; }
    // the note about where the list came from stays folded; the (i) button next to the heart opens it
    el("note-btn").hidden = note.hidden;
    note.hidden = true;
    el("note-btn").setAttribute("aria-expanded", "false");
    renderHeart(product);
    renderWishBtn(product);
    renderAlerts(product);
    renderAllergyBox(a.items);
    renderMatch(a.items, product);

    // Amounts the product name states ("Niacinamide 10%"), set on the shared analysis items every time (a cached list can belong to a differently named product)
    var dcl = window.Dose ? window.Dose.declared(product.name, a.items) : {};
    a.items.forEach(function (it, k) { it.declared = dcl[k] != null ? dcl[k] : null; });
    var order = { bad: 0, mid: 1, good: 2 };
    var rated = a.items
      .filter(function (i) { return i.level; })
      .map(function (i, idx) { return { i: i, idx: idx }; })
      .sort(function (x, y) { return order[x.i.level] - order[y.i.level] || x.idx - y.idx; })
      .map(function (x) { return x.i; });
    ingRated = rated;
    ingFull = false;
    ingAll = a.items;
    renderIngredientList();

    var unrated = a.items.filter(function (i) { return !i.level; });
    var box = el("unrated-box");
    box.hidden = unrated.length === 0;
    box.open = rated.length === 0;
    el("unrated-title").textContent = plural(unrated.length, "ingredient", "ingredients") + " not rated yet";
    el("unrated-list").textContent = unrated.map(function (i) { return i.name; }).join(", ");

    show("result");
  }

  function backFromResult() {
    lastProduct = null;
    if (cameFrom === "cam") openCam("code");
    else if (cameFrom === "results" && lastResults) show("results");
    else if (cameFrom === "history") openHistory("recent");
    else if (cameFrom === "favorites") openHistory("favs");
    else if (cameFrom === "shop") { renderShop(); show("shop"); }
    else if (cameFrom === "routine") openRoutine();
    else if (cameFrom === "cats") show("cats");
    else if (cameFrom === "sug") show("sug");
    else goHome();
  }

  // ----- barcode lookup -----
  // Finds a barcode in this phone's own catalog, our list, then Open Beauty Facts. Resolves to {state, product?, p?}.
  function resolveCode(raw) {
    var code = String(raw || "").replace(/\D/g, "");
    if (code.length < 8) return Promise.resolve({ state: "bad" });
    var mine = window.Catalog.get(code);
    if (mine) return Promise.resolve({ state: "found", product: mine });
    return window.Shop.byCode(code).then(function (s) {
      if (s) return s;
      return window.OBF.lookup(code);
    }).then(function (p) {
      if (p && p.shop) return { state: "found", product: p };
      if (!p) return { state: "missing" };
      if (!p.ingredientsText) return { state: "noingredients", p: p };
      return { state: "found", product: p };
    }).catch(function () { return { state: "error" }; });
  }
  // When there's no internet, say so plainly: the saved list still works, only the online lookup doesn't.
  function offlineNote(what, generic) {
    if (navigator.onLine === false) return "You're offline. " + (what ? what + " " : "") + "The saved list, your products and the rating still work. Try again when you're back online.";
    return generic;
  }
  function applyResolved(r, code) {
    if (r.state === "bad") { showStatus("That doesn't look like a barcode. Barcodes have 8 to 13 digits."); return; }
    if (r.state === "error") { showStatus(offlineNote("This product isn't on the list saved in this app.", "Couldn't reach the product database. Check your connection and try again.")); return; }
    if (r.state === "found") { pending = null; cameFrom = "home"; renderResult(r.product); return; }
    if (r.state === "missing") {
      pending = { code: code, brand: "", name: "", image: "" };
      showStatus("We don't have " + code + " yet. Take a photo of the ingredient list on the package and we'll remember this product on this phone.", true);
    } else {
      pending = { code: code, brand: r.p.brand, name: r.p.name, image: r.p.image };
      var who = [r.p.brand, r.p.name].filter(Boolean).join(" ") || code;
      showStatus(who + " is in the database but has no ingredient list yet. Take a photo of the list on the package and we'll remember it on this phone.", true);
    }
  }
  function lookupCode(raw) {
    var code = String(raw || "").replace(/\D/g, "");
    if (code.length < 8) { applyResolved({ state: "bad" }, code); return; }
    if (!window.Catalog.get(code)) showStatus("Looking up " + code + "…");
    resolveCode(code).then(function (r) { applyResolved(r, code); });
  }

  function stopScanner() {
    if (!scanner) return Promise.resolve();
    var s = scanner;
    scanner = null;
    return s.stop().then(function () { s.clear(); }).catch(function () {});
  }

  // ----- one camera for everything: barcode (live), product, shelf and ingredient list (photo) -----
  var MODE_HINT = {
    code: "Point the camera at a barcode",
    product: "Fit the product in the frame. Drag the corners to resize it",
    shelf: "Fit the shelf in the frame, tap the button, then hold still for a second",
    ingredients: "Fill the frame with the list, then tap the button. Round bottle? Use Camera app and zoom in (5×)"
  };
  var cam = { open: false, mode: "code", busy: false, cand: "", candAt: 0, shown: "", job: 0, list: null, alts: [] };
  var GUIDE = [
    ["scan", "One camera, four ways", "Barcode reads by itself. Product, Shelf and Ingredients take a photo when you tap the round button."],
    ["package", "Fit it all in the frame", "Step back a little so the whole label is inside the frame. Good light helps a lot."],
    ["shield-check", "See what's inside", "You get a safety score and every ingredient, checked against EU and Korean rules."]
  ];
  var guideStep = 0;

  function validGtin(code) {
    var n = code.length, sum = 0;
    for (var i = 0; i < n - 1; i++) {
      var d = Number(code.charAt(n - 2 - i));
      sum += i % 2 === 0 ? d * 3 : d;
    }
    return (10 - (sum % 10)) % 10 === Number(code.charAt(n - 1));
  }

  function camMsg(text) {
    var m = el("cam-msg");
    m.textContent = text;
    m.hidden = !text;
    if (text) {
      clearTimeout(camMsg.t);
      camMsg.t = setTimeout(function () { m.hidden = true; }, 5000);
    }
  }
  // ----- Adjustable frame: drag the corners to fit the product, drag inside to move it. Remembered per mode (product, shelf, ingredients); barcode keeps its fixed window. -----
  var BUTTON_ZONE = 176, FKEY = "skinsafe.camframe", FDEF = { t: 0.17, b: 0.17, l: 0.09, r: 0.09 }, FVAR = { t: "--ft", b: "--fb", l: "--fl", r: "--fr" };
  function loadFrames() { try { var f = JSON.parse(localStorage.getItem(FKEY) || "{}"); return f && typeof f === "object" ? f : {}; } catch (e) { return {}; } }
  function frameOf(mode) { var f = loadFrames()[mode]; return f && ["t", "b", "l", "r"].every(function (k) { return typeof f[k] === "number"; }) ? f : { t: FDEF.t, b: FDEF.b, l: FDEF.l, r: FDEF.r }; }
  function putFrame(mode, f) {
    var camEl = el("cam");
    // a frame narrower than 260 px has no room for the hint, so it hides
    camEl.classList.toggle("tiny", camEl.clientWidth * (1 - f.l - f.r) < 260);
    Object.keys(FVAR).forEach(function (k) { var v = (f[k] * 100).toFixed(2) + "%"; camEl.style.setProperty(FVAR[k], k === "b" ? "max(" + v + ", " + BUTTON_ZONE + "px)" : v); });
  }
  function applyFrame(mode) {
    var camEl = el("cam");
    if (mode === "code") { Object.keys(FVAR).forEach(function (k) { camEl.style.removeProperty(FVAR[k]); }); return; }
    putFrame(mode, frameOf(mode));
  }
  var fdrag = null, ftap = 0;
  function clampFrame(f, W, H, move, d) {
    var minTop = 112 / H, minBot = BUTTON_ZONE / H, minSide = 6 / W, minW = 140 / W, minH = 170 / H;
    if (move) {
      var dy = Math.max(minTop - d.f.t, Math.min(d.f.b - minBot, d.dyf)), dx = Math.max(minSide - d.f.l, Math.min(d.f.r - minSide, d.dxf));
      return { t: d.f.t + dy, b: d.f.b - dy, l: d.f.l + dx, r: d.f.r - dx };
    }
    f.t = Math.max(minTop, Math.min(1 - f.b - minH, f.t)); f.b = Math.max(minBot, Math.min(1 - f.t - minH, f.b));
    f.l = Math.max(minSide, Math.min(1 - f.r - minW, f.l)); f.r = Math.max(minSide, Math.min(1 - f.l - minW, f.r));
    return f;
  }
  el("cam-frame").addEventListener("pointerdown", function (e) {
    var h = e.target.closest ? e.target.closest("[data-c]") : null;
    if (!h || cam.mode === "code" || cam.busy) return;
    var r = el("cam").getBoundingClientRect(), f = frameOf(cam.mode);
    fdrag = { c: h.getAttribute("data-c"), x: e.clientX, y: e.clientY, f: { t: f.t, b: f.b, l: f.l, r: f.r }, W: r.width, H: r.height, moved: false };
    try { h.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  el("cam-frame").addEventListener("pointermove", function (e) {
    if (!fdrag) return;
    var dxf = (e.clientX - fdrag.x) / fdrag.W, dyf = (e.clientY - fdrag.y) / fdrag.H, f = { t: fdrag.f.t, b: fdrag.f.b, l: fdrag.f.l, r: fdrag.f.r }, c = fdrag.c;
    if (Math.abs(e.clientX - fdrag.x) + Math.abs(e.clientY - fdrag.y) > 4) fdrag.moved = true;
    if (c === "move") f = clampFrame(f, fdrag.W, fdrag.H, true, { f: fdrag.f, dxf: dxf, dyf: dyf });
    else {
      if (c === "tl" || c === "tr") f.t += dyf; else f.b -= dyf;
      if (c === "tl" || c === "bl") f.l += dxf; else f.r -= dxf;
      f = clampFrame(f, fdrag.W, fdrag.H, false);
    }
    putFrame(cam.mode, f); fdrag.cur = f;
  });
  function endFrameDrag() {
    if (!fdrag) return;
    var d = fdrag; fdrag = null;
    if (d.cur) { var all = loadFrames(); all[cam.mode] = d.cur; try { localStorage.setItem(FKEY, JSON.stringify(all)); } catch (e) {} keepFocus(); return; }
    // a double tap inside the frame (no drag) puts the frame back to its first size
    if (d.c === "move" && !d.moved) {
      var now = Date.now();
      if (now - ftap < 400) { var all2 = loadFrames(); delete all2[cam.mode]; try { localStorage.setItem(FKEY, JSON.stringify(all2)); } catch (e) {} putFrame(cam.mode, FDEF); ftap = 0; keepFocus(); } else ftap = now;
    }
  }
  el("cam-frame").addEventListener("pointerup", endFrameDrag);
  el("cam-frame").addEventListener("pointercancel", endFrameDrag);

  function setMode(mode) {
    cam.mode = mode;
    el("cam").className = "cam m-" + mode;
    applyFrame(mode);
    setTimeout(keepFocus, 60);
    el("cam-hint").textContent = MODE_HINT[mode];
    el("cam-hint").hidden = false;
    bc.since = Date.now();
    Array.prototype.forEach.call(el("cam-modes").querySelectorAll("button"), function (b) {
      var on = b.getAttribute("data-mode") === mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    hideCard();
    el("cam-sheet").hidden = true;
    cam.shown = ""; cam.cand = "";
  }
  function hideCard() { el("cam-card").hidden = true; el("cam-card").innerHTML = ""; if (cam.open) el("cam-hint").hidden = false; }

  function openCam(mode) {
    cam.open = true; cam.busy = false; cam.job++;
    el("cam").hidden = false;
    document.body.classList.add("cam-open");
    el("cam-busy").hidden = true;
    el("cam-sheet").hidden = true;
    el("cam-guide").hidden = true;
    camMsg("");
    setMode(mode || "code");
    el("cam-for").hidden = !scanCtx;
    if (scanCtx) el("cam-for").textContent = "Scanning for: " + window.Routine.KINDS[scanCtx.kind].label;
    startCamera();
    autoStart();
    bcStart();
    if (!guideSeen()) showGuide(0);
  }
  function hideCam() {
    cam.open = false; cam.busy = false; cam.job++;
    scanCtx = null; el("cam-for").hidden = true;
    if (crop && crop.open) closeCrop();
    autoStop();
    bcStop(); bcStopWorker();
    el("cam").hidden = true;
    document.body.classList.remove("cam-open");
  }
  function closeCam() { hideCam(); return stopScanner(); }

  function camUnavailable(text) {
    el("cam-hint").hidden = true;
    camMsg(text);
    clearTimeout(camMsg.t);   // keep this one on screen
  }
  function startCamera() {
    if (!window.Html5Qrcode || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camUnavailable("The camera can't start here. Tap the picture button to use a photo from your gallery, or close this and type the barcode.");
      return;
    }
    stopScanner().then(function () {
      if (!cam.open) return;
      var F = window.Html5QrcodeSupportedFormats;
      var s = new window.Html5Qrcode("cam-reader", {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });
      scanner = s;
      s.start(
        { facingMode: "environment" },
        { fps: 10, videoConstraints: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1440 } } },
        onDecoded,
        function () {}
      ).then(function () {
        if (!cam.open || scanner !== s) { if (scanner === s) scanner = null; s.stop().then(function () { s.clear(); }).catch(function () {}); return; }
        keepFocus();
      }).catch(function () {
        if (scanner === s) scanner = null;
        if (cam.open) camUnavailable("The camera isn't available. Allow camera access in your browser, or tap the picture button to use a photo from your gallery.");
      });
    });
  }

  // A barcode counts when the same valid number is read twice in a row (avoids reading a wrong number once).
  function onDecoded(text, mine) {
    if (!cam.open || cam.busy || cam.mode !== "code") return;
    var code = String(text || "").replace(/\D/g, "");
    if (code.length < 8 || code.length > 14 || code === cam.shown) return;
    if ((code.length === 12 || code.length === 13) && !validGtin(code)) return;
    var now = Date.now();
    // our own reader (js/barcode.js) takes about a second per picture, so its second read may come a few seconds after the first
    if (code !== cam.cand || now - cam.candAt > (mine ? 6000 : 1500)) { cam.cand = code; cam.candAt = now; return; }
    cam.cand = "";
    camLookup(code);
  }

  function showCard(html) {
    var c = el("cam-card");
    c.innerHTML = html + '<button type="button" class="cam-card-x" aria-label="Close this card">' + ic("x") + "</button>";
    c.hidden = false;
    el("cam-hint").hidden = true;
  }
  // Scanning for a routine step: the card offers "Use in my routine" instead of opening the product.
  function startRoutineScan(period, i) {
    var st = rt && rt[period] && rt[period][i];
    if (!st) return;
    scanCtx = { period: period, i: i, kind: st.kind };
    pending = null; linking = null;
    openCam("code");
  }
  function backToRoutine(ctx) { rtPeriod = ctx.period; rtSel = ctx.i; renderRoutine(); show("routine"); }
  function useScanned(p) {
    var ctx = scanCtx;
    if (!ctx || !rt[ctx.period] || !rt[ctx.period][ctx.i]) return;
    rt[ctx.period][ctx.i].product = routineProd(p);
    saveRoutine();
    closeCam().then(function () { backToRoutine(ctx); });
  }
  function showScanCard(p, note) {
    var ctx = scanCtx, marks = scorePill(p) + markTags(p), kind = kindOf(p), warn = "";
    if (kind !== ctx.kind) warn = '<p class="cam-card-note cam-card-warn">This looks like a ' + esc(kindLabel(kind).toLowerCase()) + ", not a " + esc(window.Routine.KINDS[ctx.kind].label.toLowerCase()) + ". You can still use it.</p>";
    showCard('<p class="cam-card-note">' + esc(note) + '</p><div class="cam-card-btn static">' + photoHtml(p) +
      '<span class="cam-card-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" + (marks ? '<span class="tags">' + marks + "</span>" : "") + "</span></div>" + warn +
      '<button type="button" class="primary small" id="cam-card-use">Use in my routine</button>');
    el("cam-card-use").addEventListener("click", function () { useScanned(p); });
  }
  function camLookup(code) {
    cam.shown = code;
    showCard('<p class="cam-card-note">Looking up ' + esc(code) + "…</p>");
    resolveCode(code).then(function (r) {
      if (!cam.open || cam.shown !== code) return;
      if (r.state === "found") {
        var p = r.product, marks = scorePill(p) + markTags(p);
        addHistory(p);
        if (scanCtx) { showScanCard(p, "Found it."); return; }
        showCard('<button type="button" class="cam-card-btn" id="cam-card-open">' +
          photoHtml(p) +
          '<span class="cam-card-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
          (marks ? '<span class="tags">' + marks + "</span>" : "") + "</span>" + ic("arrow-right", "chev-ic") + "</button>");
        el("cam-card-open").addEventListener("click", function () {
          closeCam(); pending = null; linking = null; cameFrom = "cam"; renderResult(p);
        });
      } else if (r.state === "error") {
        showCard('<p class="cam-card-note">' + esc(offlineNote("This product isn't on the list saved in this app.", "Couldn't reach the product database. Check your connection and scan again.")) + "</p>");
        cam.shown = "";
      } else {
        showCard('<p class="cam-card-note"><strong>' + esc(code) + "</strong> " +
          (r.state === "missing" ? "isn't in our database yet." : "is in the database but has no ingredient list yet.") + (scanCtx ? " Try Product mode, or search for it by name." : "") + "</p>" +
          (scanCtx ? "" : '<button type="button" class="primary small" id="cam-card-add">' + ic("camera") + "Add it with a photo</button>"));
        if (!scanCtx) el("cam-card-add").addEventListener("click", function () { closeCam(); applyResolved(r, code); });
      }
    });
  }

  // Ask the phone to keep auto-focusing on whatever is in front (only works where the browser lets us; harmless if not).
  function keepFocus() {
    try {
      var v = document.querySelector("#cam-reader video");
      var t = v && v.srcObject && v.srcObject.getVideoTracks && v.srcObject.getVideoTracks()[0];
      if (!t || !t.getCapabilities) return;
      var cap = t.getCapabilities(), adv = {};
      if (cap.focusMode && cap.focusMode.indexOf("continuous") >= 0) adv.focusMode = "continuous";
      if (cap.exposureMode && cap.exposureMode.indexOf("continuous") >= 0) adv.exposureMode = "continuous";
      // Focus and expose for the middle of the white frame, wherever the person put it (where the browser supports a focus point; others keep their own auto-focus)
      var c = frameCenterInVideo();
      if (c) adv.pointsOfInterest = [c];
      if (Object.keys(adv).length) t.applyConstraints({ advanced: [adv] }).catch(function () {
        // some browsers refuse the focus point: keep at least the continuous modes
        delete adv.pointsOfInterest;
        if (Object.keys(adv).length) t.applyConstraints({ advanced: [adv] }).catch(function () {});
      });
    } catch (e) {}
  }
  // The middle of the white frame as a point of the camera picture (0 to 1 from the top left; the video is shown "cover")
  function frameCenterInVideo() {
    var v = document.querySelector("#cam-reader video");
    if (!v || !v.videoWidth) return null;
    var vr = v.getBoundingClientRect(), fr = el("cam-frame").getBoundingClientRect();
    var k = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    var offX = (vr.width - v.videoWidth * k) / 2, offY = (vr.height - v.videoHeight * k) / 2;
    var x = (fr.left + fr.width / 2 - vr.left - offX) / k / v.videoWidth, y = (fr.top + fr.height / 2 - vr.top - offY) / k / v.videoHeight;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  // Crop the live picture to what is inside the white frame (the video is shown "cover", so map screen to video pixels).
  function cropFrame() {
    var v = document.querySelector("#cam-reader video");
    if (!v || !v.videoWidth) return null;
    var vr = v.getBoundingClientRect(), fr = el("cam-frame").getBoundingClientRect();
    var k = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    var offX = (vr.width - v.videoWidth * k) / 2, offY = (vr.height - v.videoHeight * k) / 2;
    var sx = Math.max(0, (fr.left - vr.left - offX) / k), sy = Math.max(0, (fr.top - vr.top - offY) / k);
    var sw = Math.min(v.videoWidth - sx, fr.width / k), sh = Math.min(v.videoHeight - sy, fr.height / k);
    var c = document.createElement("canvas");
    c.width = Math.round(sw); c.height = Math.round(sh);
    c.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }
  function canvasFile(c) {
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { if (b) resolve(new File([b], "snap.jpg", { type: "image/jpeg" })); else reject(new Error("no-blob")); }, "image/jpeg", 0.92);
    });
  }
  function grabFrame() {
    var c = cropFrame();
    return c ? canvasFile(c) : Promise.reject(new Error("no-video"));
  }

  // Hand-held products shake: take a quick burst of frames (about a second) and keep the sharpest ones. Returns files, best first.
  var BURST = 9, BURST_GAP = 120;
  function grabBurst() {
    return new Promise(function (resolve, reject) {
      var frames = [], n = 0;
      (function next() {
        var c = cropFrame();
        if (c) frames.push({ c: c, s: window.OCR.frameScore(c) });
        if (++n >= BURST) {
          if (!frames.length) { reject(new Error("no-video")); return; }
          frames.sort(function (a, b) { return b.s - a.s; });
          // Keep the best frame plus up to two more that are not much blurrier than it.
          var keep = frames.filter(function (f, i) { return i === 0 || (i < 3 && f.s >= frames[0].s * 0.6); });
          Promise.all(keep.map(function (f) { return canvasFile(f.c); })).then(resolve, reject);
        } else setTimeout(next, BURST_GAP);
      })();
    });
  }

  // ---- Barcode reader for blurry, hand-held codes (js/barcode.js, in a web worker) next to the scanner library ----
  // The library needs a sharp, flat picture; a code held close to the lens is out of focus. This reader fits the whole code to what it sees.
  var BARCODE_FAR = "Not reading? Move the phone back about a hand's length and hold it still, facing the code. Too close and it can't focus";
  var bc = { timer: null, worker: null, busy: false, id: 0, since: 0, n: 0, waiting: {} };
  function bcWorker() {
    if (bc.worker !== null) return bc.worker || null;   // null = not started yet, false = not possible here
    try {
      var meta = document.querySelector('meta[name="app-version"]'), v = meta ? meta.getAttribute("content") : "dev";
      var w = new Worker("js/barcode-worker.js?v=" + encodeURIComponent(v));
      w.onmessage = function (e) { var f = bc.waiting[e.data.id]; if (f) { delete bc.waiting[e.data.id]; f(e.data.res); } };
      w.onerror = function () {
        Object.keys(bc.waiting).forEach(function (k) { bc.waiting[k](null); delete bc.waiting[k]; });
        try { w.terminate(); } catch (x) {}
        bc.worker = false;
      };
      bc.worker = w;
    } catch (e) { bc.worker = false; }
    return bc.worker || null;
  }
  function bcStopWorker() { if (bc.worker) { try { bc.worker.terminate(); } catch (e) {} } bc.worker = null; bc.waiting = {}; }
  // src: a canvas or the <video>; sw, sh: its size. Resolves { code, ... } or null.
  function bcDecode(src, sw, sh, opts) {
    var k = Math.min(1, 1280 / Math.max(sw, sh)), w = Math.max(32, Math.round(sw * k)), h = Math.max(32, Math.round(sh * k));
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(src, 0, 0, w, h);
    var p = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h), i;
    for (i = 0; i < g.length; i++) g[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    var wk = window.Barcode ? bcWorker() : null;
    if (!window.Barcode) return Promise.resolve(null);
    if (!wk) return new Promise(function (resolve) { setTimeout(function () { try { resolve(window.Barcode.decode(g, w, h, { keep: 6, ean8: false })); } catch (e) { resolve(null); } }, 0); });
    return new Promise(function (resolve) {
      var id = ++bc.id;
      bc.waiting[id] = resolve;
      setTimeout(function () { if (bc.waiting[id]) { delete bc.waiting[id]; resolve(null); } }, 10000);
      try { wk.postMessage({ id: id, w: w, h: h, g: g, opts: opts || {} }, [g.buffer]); } catch (e) { delete bc.waiting[id]; resolve(null); }
    });
  }
  function bcTick() {
    if (bc.busy || !cam.open || cam.mode !== "code" || cam.busy || !el("cam-sheet").hidden || !el("cam-card").hidden || (crop && crop.open) || !el("cam-guide").hidden) return;
    var v = document.querySelector("#cam-reader video");
    if (!v || !v.videoWidth || v.readyState < 2) return;
    bc.busy = true;
    bcDecode(v, v.videoWidth, v.videoHeight, { ean8: (bc.n++ % 3) === 0, keep: 10 }).then(function (res) {
      bc.busy = false;
      if (!cam.open || cam.mode !== "code") return;
      if (res && res.code) { bc.since = Date.now(); onDecoded(res.code, true); return; }
      if (el("cam-card").hidden && Date.now() - bc.since > 4000) { el("cam-hint").textContent = BARCODE_FAR; el("cam-hint").hidden = false; }
    }).catch(function () { bc.busy = false; });
  }
  function bcStart() { bcStop(); bc.since = Date.now(); bc.timer = setInterval(bcTick, 450); }
  function bcStop() { if (bc.timer) clearInterval(bc.timer); bc.timer = null; bc.busy = false; }

  // A barcode in a photo: the scanner library first, then our own reader. deep = a photo made for this (more lines tried).
  function tryBarcodeFile(file, deep) {
    var first = !window.Html5Qrcode ? Promise.resolve("") : (function () {
      var q = new window.Html5Qrcode("reader-file", { verbose: false });
      return q.scanFile(file, false).then(function (t) { try { q.clear(); } catch (e) {} return String(t || "").replace(/\D/g, ""); }).catch(function () { return ""; });
    })();
    return first.then(function (code) {
      if (code.length >= 8) return code;
      return cropLoad(file).then(function (c) {
        return bcDecode(c, c.width, c.height, deep ? { keep: 24 } : { keep: 8, ean8: false });
      }).then(function (r) { return r && r.code ? r.code : ""; }, function () { return ""; });
    });
  }

  function setBusy(on, file) {
    el("cam-busy").hidden = !on;
    if (on) {
      var old = el("cam-snap").src;
      el("cam-snap").src = URL.createObjectURL(file);
      if (old && old.indexOf("blob:") === 0) URL.revokeObjectURL(old);
      el("cam-busy-text").textContent = "Searching…";
      el("cam-card").hidden = true; el("cam-hint").hidden = true;
    }
  }
  function progress(msg) { if (cam.busy) el("cam-busy-text").textContent = msg.replace(/…$/, "") + "…"; }
  function stage(msg) { progress(msg); }

  // ---- Auto-scan (Product mode): no button needed. While the product is shown inside the frame the camera keeps reading its sharpest frames,
  // pools the words from the last few readings (a finger may hide a different part each time) and opens the product by itself once the brand and
  // every word of the name are read. A close-but-not-sure guess is offered as a card. It pauses after about 45 s so it doesn't drain the battery.
  var AUTO_MIN_SHARP = 40, AUTO_MAX_MS = 45000, AUTO_KEEP = 9;
  var auto = { timer: null, busy: false, run: 0, k: 0, state: null, started: 0, paused: false, blocked: true, guess: "" };
  function autoReset() { auto.run++; auto.state = window.Reader.newState(AUTO_KEEP); auto.k = 0; auto.started = Date.now(); auto.paused = false; auto.guess = ""; }
  function autoHint(text) { if (!el("cam-card").hidden) return; el("cam-hint").textContent = text; el("cam-hint").hidden = false; }
  function autoShowGuess(p, r) {
    var key = p.brand + "|" + p.name;
    if (auto.guess === key) return;
    auto.guess = key;
    addHistory(p);
    if (scanCtx) { showScanCard(p, "Looks like this one."); return; }
    var marks = scorePill(p) + markTags(p);
    showCard('<p class="cam-card-note">Looks like this one. Tap it, or keep the product in the frame.</p><button type="button" class="cam-card-btn" id="cam-guess-open">' + photoHtml(p) +
      '<span class="cam-card-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" + (marks ? '<span class="tags">' + marks + "</span>" : "") + "</span>" + ic("arrow-right", "chev-ic") + "</button>");
    el("cam-guess-open").addEventListener("click", function () {
      var list = (r.matches || []).slice();
      cam.read = { mode: "product", tokens: r.tokens || [] };
      openFromMatches(list.length ? list : [p], p, "Is it one of these?", null);
    });
  }
  function autoStep(run) {
    var frames = [], n = 0;
    return new Promise(function (resolve) {
      (function grab() {
        var c = cropFrame();
        if (c) frames.push({ c: c, s: window.OCR.frameScore(c) });
        if (++n < 4) setTimeout(grab, 90); else resolve();
      })();
    }).then(function () {
      if (!frames.length || run !== auto.run) return;
      frames.sort(function (a, b) { return b.s - a.s; });
      if (frames[0].s < AUTO_MIN_SHARP) { autoHint("Hold the product still, or move it a little farther back"); return; }
      // One reading pass per turn (local contrast, other colour direction, the middle, sideways...), pooled with the last few turns.
      var R = window.Reader, frame = R.frameFromCanvas(frames[0].c), ps = R.PASSES[auto.k++ % R.PASSES.length];
      return R.runPass(ps, frame, window.OCR.engine).then(function (res) {
        if (run !== auto.run || !cam.open || cam.mode !== "product" || cam.busy) return;
        R.add(auto.state, ps, res);
        return R.judge(auto.state, window.Shop).then(function (r) {
          if (run !== auto.run || !cam.open || cam.mode !== "product" || cam.busy) return;
          if (r.exact && r.matches.length && scanCtx) { autoShowGuess(r.matches[0], r); return; }
          if (r.exact && r.matches.length) {
            auto.run++;
            cam.read = { mode: "product", tokens: r.tokens || [] };
            openFromMatches(r.matches, r.matches[0], "Is it one of these?", { mode: "product", tokens: r.tokens || [] });
            return;
          }
          var m = r.matches[0], ev = r.evidence[0];
          if (m && ev && ((ev.brand && ev.hits >= 2) || ev.hits >= 3)) autoShowGuess(m, r);
          else autoHint(MODE_HINT.product);
        });
      });
    });
  }
  function autoTick() {
    var blocked = !cam.open || cam.mode !== "product" || cam.busy || (crop && crop.open) || !el("cam-sheet").hidden || !el("cam-guide").hidden || !el("cam-busy").hidden;
    if (blocked) { auto.blocked = true; return; }
    if (auto.blocked) { auto.blocked = false; autoReset(); }   // coming back to the live camera: start fresh
    if (auto.busy) return;
    if (Date.now() - auto.started > AUTO_MAX_MS) {
      if (!auto.paused) { auto.paused = true; autoHint("Auto-scan paused. Tap the button to read the product"); }
      return;
    }
    auto.busy = true;
    var run = auto.run;
    autoStep(run).catch(function () {}).then(function () { auto.busy = false; });
  }
  function autoStart() { autoStop(); autoReset(); auto.blocked = true; auto.timer = setInterval(autoTick, 500); }
  function autoStop() { if (auto.timer) clearInterval(auto.timer); auto.timer = null; auto.run++; if (window.OCR && window.OCR.stopShared) window.OCR.stopShared(); }

  function onShutter() {
    if (cam.busy || cam.mode === "code") return;
    var mode = cam.mode;
    auto.run++;
    cam.busy = true;
    camMsg("Hold still…");
    clearTimeout(camMsg.t);   // stay up for the whole burst
    grabBurst().then(function (files) {
      el("cam-msg").hidden = true;
      cam.busy = false;
      if (!cam.open || cam.mode !== mode) return;
      cam.alts = files.slice(1);
      handleFile(files[0], mode);
    }).catch(function () {
      el("cam-msg").hidden = true;
      cam.busy = false;
      camMsg("The camera isn't ready yet. Wait a second and try again.");
    });
  }

  // ---- "Edit the photo": crop screen for photos picked from the gallery or the phone's Camera app (not for the live shutter) ----
  // The frame starts fitted to the product (background-colour guess); drag the handles to change it, then Continue sends only the crop to the reader.
  var crop = { cv: null, box: null, mode: "product", s: 1, drag: null, open: false };
  var CROP_HINT = { code: "Crop to just the barcode", product: "Crop to just the front of the product", shelf: "Crop to the shelf you want to read", ingredients: "Crop to just the ingredient list" };
  function cropLoad(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("image")); };
      im.src = url;
    });
  }
  function cropWhole(c) { return { x: 0, y: 0, w: c.width, h: c.height }; }
  function cropInset(c) { var m = 0.06; return { x: c.width * m, y: c.height * m, w: c.width * (1 - 2 * m), h: c.height * (1 - 2 * m) }; }
  // Guess where the product is: everything that differs from the colour around the edges, the blob nearest the middle. Falls back to a small margin.
  function cropAuto(c) {
    try {
      var k = 96 / Math.max(c.width, c.height), gw = Math.max(8, Math.round(c.width * k)), gh = Math.max(8, Math.round(c.height * k));
      var t = document.createElement("canvas"); t.width = gw; t.height = gh;
      var g = t.getContext("2d"); g.drawImage(c, 0, 0, gw, gh);
      var d = g.getImageData(0, 0, gw, gh).data, rs = [], gs = [], bs = [], x, y, i;
      function take(px, py) { var j = (py * gw + px) * 4; rs.push(d[j]); gs.push(d[j + 1]); bs.push(d[j + 2]); }
      for (x = 0; x < gw; x++) { take(x, 0); take(x, gh - 1); }
      for (y = 1; y < gh - 1; y++) { take(0, y); take(gw - 1, y); }
      function med(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
      var br = med(rs), bg = med(gs), bb = med(bs), m = new Uint8Array(gw * gh);
      for (i = 0; i < gw * gh; i++) m[i] = Math.abs(d[i * 4] - br) + Math.abs(d[i * 4 + 1] - bg) + Math.abs(d[i * 4 + 2] - bb) > 70 ? 1 : 0;
      var m2 = new Uint8Array(gw * gh);   // close tiny gaps (label text, thin lines): one cell of dilation
      for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
        if (!m[y * gw + x]) continue;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) m2[yy * gw + xx] = 1; }
      }
      var seen = new Uint8Array(gw * gh), best = null;
      for (i = 0; i < gw * gh; i++) {
        if (!m2[i] || seen[i]) continue;
        var st = [i], n = 0, x0 = gw, y0 = gh, x1 = 0, y1 = 0, sx = 0, sy = 0; seen[i] = 1;
        while (st.length) {
          var q = st.pop(), qx = q % gw, qy = (q - qx) / gw; n++; sx += qx; sy += qy;
          if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
          var nb = [q - 1, q + 1, q - gw, q + gw];
          for (var z = 0; z < 4; z++) { var r = nb[z]; if (r < 0 || r >= gw * gh || seen[r] || !m2[r]) continue; if (z === 0 && qx === 0) continue; if (z === 1 && qx === gw - 1) continue; seen[r] = 1; st.push(r); }
        }
        if (n < gw * gh * 0.015) continue;
        var cxn = sx / n / gw - 0.5, cyn = sy / n / gh - 0.5, score = n * (1 - 1.2 * Math.min(0.8, Math.sqrt(cxn * cxn + cyn * cyn)));
        if (!best || score > best.score) best = { score: score, x0: x0, y0: y0, x1: x1, y1: y1 };
      }
      if (!best) return cropInset(c);
      var bw = (best.x1 - best.x0 + 1) / gw, bh = (best.y1 - best.y0 + 1) / gh;
      if (bw * bh > 0.9 || bw * bh < 0.08) return cropInset(c);
      var px = bw * 0.07, py = bh * 0.05, fx = Math.max(0, best.x0 / gw - px), fy = Math.max(0, best.y0 / gh - py);
      var fx2 = Math.min(1, (best.x1 + 1) / gw + px), fy2 = Math.min(1, (best.y1 + 1) / gh + py);
      return { x: fx * c.width, y: fy * c.height, w: (fx2 - fx) * c.width, h: (fy2 - fy) * c.height };
    } catch (e) { return cropInset(c); }
  }
  function cropLayout() {
    var c = crop.cv, st = el("crop-stage"), cs = getComputedStyle(st);
    var aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    crop.s = Math.min(aw / c.width, ah / c.height, 1);
    var wrap = el("crop-wrap"), cv = el("crop-cv");
    wrap.style.width = Math.round(c.width * crop.s) + "px"; wrap.style.height = Math.round(c.height * crop.s) + "px";
    cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0);
    cropPlace();
  }
  function cropPlace() {
    var b = crop.box, s = crop.s, bx = el("crop-box");
    bx.style.left = b.x * s + "px"; bx.style.top = b.y * s + "px"; bx.style.width = b.w * s + "px"; bx.style.height = b.h * s + "px";
  }
  function openCrop(file, mode) {
    crop.mode = mode;
    cropLoad(file).then(function (c) {
      crop.cv = c; crop.box = cropAuto(c); crop.open = true;
      el("crop-hint").textContent = CROP_HINT[mode] || CROP_HINT.product;
      el("crop").hidden = false;
      cropLayout();
    }).catch(function () { handleFile(file, mode); });   // unreadable format: skip the editor and read it as before
  }
  function closeCrop() { crop.open = false; crop.drag = null; el("crop").hidden = true; }
  function cropRotate() {
    var c = crop.cv, r = document.createElement("canvas"), b = crop.box;
    r.width = c.height; r.height = c.width;
    var g = r.getContext("2d"); g.translate(r.width, 0); g.rotate(Math.PI / 2); g.drawImage(c, 0, 0);
    crop.box = { x: c.height - (b.y + b.h), y: b.x, w: b.h, h: b.w };
    crop.cv = r; cropLayout();
  }
  function cropGo() {
    var c = crop.cv, b = crop.box, k = Math.min(1, 2400 / Math.max(b.w, b.h)), o = document.createElement("canvas");
    o.width = Math.max(1, Math.round(b.w * k)); o.height = Math.max(1, Math.round(b.h * k));
    o.getContext("2d").drawImage(c, b.x, b.y, b.w, b.h, 0, 0, o.width, o.height);
    var mode = crop.mode;
    o.toBlob(function (blob) {
      if (!blob) return;
      var f = new File([blob], "crop.jpg", { type: "image/jpeg" });
      closeCrop();
      if (cam.open) handleFile(f, mode);
    }, "image/jpeg", 0.92);
  }
  function cropDown(e) {
    var h = e.target.getAttribute && e.target.getAttribute("data-h");
    if (!h) return;
    e.preventDefault();
    crop.drag = { h: h, x: e.clientX, y: e.clientY, b: { x: crop.box.x, y: crop.box.y, w: crop.box.w, h: crop.box.h }, id: e.pointerId };
    try { el("crop-wrap").setPointerCapture(e.pointerId); } catch (x) {}
  }
  function cropMove(e) {
    var d = crop.drag; if (!d || e.pointerId !== d.id) return;
    var c = crop.cv, dx = (e.clientX - d.x) / crop.s, dy = (e.clientY - d.y) / crop.s, b = d.b, min = Math.max(40, Math.min(c.width, c.height) * 0.08);
    var x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    if (d.h === "move") {
      var nx = Math.min(Math.max(0, b.x + dx), c.width - b.w), ny = Math.min(Math.max(0, b.y + dy), c.height - b.h);
      crop.box = { x: nx, y: ny, w: b.w, h: b.h }; cropPlace(); return;
    }
    if (d.h.indexOf("w") >= 0) x0 = Math.min(Math.max(0, b.x + dx), x1 - min);
    if (d.h.indexOf("e") >= 0) x1 = Math.max(Math.min(c.width, b.x + b.w + dx), x0 + min);
    if (d.h.indexOf("n") >= 0) y0 = Math.min(Math.max(0, b.y + dy), y1 - min);
    if (d.h.indexOf("s") >= 0) y1 = Math.max(Math.min(c.height, b.y + b.h + dy), y0 + min);
    crop.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; cropPlace();
  }
  function cropUp(e) { if (crop.drag && e.pointerId === crop.drag.id) crop.drag = null; }
  el("crop-wrap").addEventListener("pointerdown", cropDown);
  el("crop-wrap").addEventListener("pointermove", cropMove);
  el("crop-wrap").addEventListener("pointerup", cropUp);
  el("crop-wrap").addEventListener("pointercancel", cropUp);
  el("crop-back").addEventListener("click", closeCrop);
  el("crop-rotate").addEventListener("click", cropRotate);
  el("crop-auto").addEventListener("click", function () { crop.box = cropAuto(crop.cv); cropPlace(); });
  el("crop-full").addEventListener("click", function () { crop.box = cropWhole(crop.cv); cropPlace(); });
  el("crop-go").addEventListener("click", cropGo);
  window.addEventListener("resize", function () { if (crop.open) cropLayout(); });

  function handleFile(file, mode) {
    var alts = cam.alts || []; cam.alts = [];
    if (mode === "code") {
      tryBarcodeFile(file, true).then(function (code) {
        if (code.length >= 8) camLookup(code);
        else camMsg("We couldn't find a barcode in that photo. Try a closer, sharper one.");
      });
      return;
    }
    if (mode === "ingredients") { closeCam().then(function () { runOcr(file); }); return; }
    cam.busy = true;
    var job = ++cam.job;
    setBusy(true, file);
    var work = mode === "product" ? identifyProduct(file, alts) : findShelf(file);
    work.then(function (r) {
      if (!cam.open || cam.job !== job) return;
      cam.busy = false; setBusy(false);
      if (r.code && scanCtx) { camLookup(r.code); return; }
      if (r.code) { closeCam().then(function () { lookupCode(r.code); }); return; }
      cam.read = { mode: mode, tokens: r.tokens || [] };
      if (r.exact && r.matches.length && scanCtx) { addHistory(r.matches[0]); showScanCard(r.matches[0], "Found it."); return; }
      if (r.exact && r.matches.length) { openFromMatches(r.matches, r.matches[0], "Is it one of these?", { mode: mode, tokens: r.tokens || [] }); return; }
      if (mode === "product" && !(r.matches || []).length) logMissing("unknown", mode, r.tokens, null);
      showSheet(mode, r);
    }).catch(function () {
      if (!cam.open || cam.job !== job) return;
      cam.busy = false; setBusy(false);
      el("cam-hint").hidden = false;
      camMsg("The photo reader couldn't start. It needs an internet connection the first time. Try again, or use the barcode.");
    });
  }

  // Product: try a barcode in the photo first, then read the words printed on the package.
  // If the first (sharpest) frame doesn't give a sure match, read the next-sharpest one too and match on the words of both.
  // Product: try a barcode in the photo first, then read the words printed on the package with the passes of js/reader.js
  // (local contrast, the other colour direction, the middle of the frame, sideways, light letters) until the match is sure.
  // The other sharp frames of the burst add their words too: a finger may cover a different part of the label in each one.
  function identifyProduct(file, alts) {
    stage("Looking for a barcode");
    return tryBarcodeFile(file, false).then(function (code) {
      if (code.length >= 8) return { code: code };
      var R = window.Reader, st = R.newState(), best = null;
      function frameOf(f) { return cropLoad(f).then(function (c) { return R.frameFromCanvas(c); }); }
      function run(frame, passes) {
        return R.readProduct(frame, window.OCR.engine, window.Shop, { state: st, passes: passes, onStage: stage }).then(function (r) { if (r) best = R.better(r, best); });
      }
      return frameOf(file).then(function (fr) { return run(fr); }).then(function () {
        var chain = Promise.resolve();
        (alts || []).slice(0, 2).forEach(function (alt) {
          chain = chain.then(function () {
            if (R.isSure(best)) return;
            stage("Reading again");
            return frameOf(alt).then(function (fr) { return run(fr, R.PASSES.slice(0, 3)); }).catch(function () {});
          });
        });
        return chain;
      }).then(function () { return best || { matches: [], tokens: [] }; });
    });
  }

  // Shelf (best effort): read the picture in overlapping tiles, group the words that sit together into labels, and identify each label.
  function findShelf(file) {
    var R = window.Reader;
    return cropLoad(file).then(function (c) { return R.readShelf(R.frameFromCanvas(c), window.OCR.engine, window.Shop, { onStage: stage }); });
  }

  // Open a product from a list of matches; "Back" from it returns to that list.
  function openFromMatches(list, p, title, exactCtx) {
    if (scanCtx) { useScanned(p); return; }
    lastResults = list;
    el("results-q").value = "";
    el("results-title").textContent = title;
    el("results-sub").textContent = "Tap a product to see what's in it.";
    el("results-list").innerHTML = resultRows(list);
    wireResultRows();
    closeCam(); pending = null; linking = null; cameFrom = "results"; nextNotIt = exactCtx ? { mode: exactCtx.mode, tokens: exactCtx.tokens, guess: p } : null; renderResult(p);
  }

  function showSheet(mode, r) {
    var list = r.matches || [];
    cam.list = list;
    var n = list.length;
    el("sheet-title").textContent = n ? (mode === "shelf" ? "Products found: " + n : "Is it one of these?") : (mode === "shelf" ? "No products recognized" : "We couldn't tell which product it is");
    el("sheet-sub").textContent = n
      ? (mode === "shelf" ? "Tap a product to see the full breakdown. Shelf reading is best effort, so a label it couldn't read may be missing." : "Tap the one on your package.")
      : (mode === "shelf" ? "Try fewer products at once, closer, in good light. Or scan one product at a time with Product or Barcode." : "Try again with the front label in good light, or use the barcode or a photo of the ingredient list." + (r.tokens && r.tokens.length ? " We read: " + r.tokens.slice(0, 8).join(" ") + "." : " We couldn't read any words."));
    el("sheet-list").innerHTML = resultRows(list);
    Array.prototype.forEach.call(el("sheet-list").querySelectorAll(".result-item"), function (b) {
      b.addEventListener("click", function () {
        openFromMatches(list, list[Number(b.getAttribute("data-i"))], el("sheet-title").textContent);
      });
    });
    el("sheet-none").hidden = !(n && mode === "product");
    el("cam-sheet").hidden = false;
    el("cam-sheet").scrollTop = 0;
    el("cam-hint").hidden = true;
  }
  function closeSheet() { el("cam-sheet").hidden = true; el("cam-hint").hidden = false; }

  // First-time guide (also from the (i) button).
  function guideSeen() { try { return localStorage.getItem("skinsafe.camGuide") === "1"; } catch (e) { return true; } }
  function showGuide(i) {
    guideStep = i;
    var g = GUIDE[i];
    el("guide-ic").innerHTML = ic(g[0]);
    el("guide-title").textContent = g[1];
    el("guide-text").textContent = g[2];
    el("guide-dots").innerHTML = GUIDE.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("");
    el("guide-next").textContent = i === GUIDE.length - 1 ? "Start scanning" : "Next";
    el("cam-guide").hidden = false;
  }
  function endGuide() {
    el("cam-guide").hidden = true;
    try { localStorage.setItem("skinsafe.camGuide", "1"); } catch (e) {}
  }

  // ----- search by name -----
  // ----- product photos: a photo is shown only when it looks like a clean studio shot -----
  // Photos from our own list were checked when we collected them. Photos from Open Beauty Facts come from users and are
  // often blurry, dark or full of background, so they are checked here (big enough, near-white edges) and otherwise hidden.
  var photoCache = {};
  function photoOk(url) {
    if (photoCache[url]) return photoCache[url];
    photoCache[url] = new Promise(function (resolve) {
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.referrerPolicy = "no-referrer";
      im.onerror = function () { resolve(false); };
      im.onload = function () {
        try {
          if (Math.max(im.naturalWidth, im.naturalHeight) < 400 || Math.min(im.naturalWidth, im.naturalHeight) < 150) { resolve(false); return; }
          var N = 64, c = document.createElement("canvas");
          c.width = N; c.height = N;
          var x = c.getContext("2d", { willReadFrequently: true });
          x.drawImage(im, 0, 0, N, N);
          var d = x.getImageData(0, 0, N, N).data, edge = 0, white = 0;
          for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) {
            if (xx > 1 && yy > 1 && xx < N - 2 && yy < N - 2) continue;
            var i = (yy * N + xx) * 4;
            edge++;
            if (d[i + 3] < 40 || Math.min(d[i], d[i + 1], d[i + 2]) >= 225) white++;
          }
          resolve(white / edge >= 0.8);
        } catch (e) { resolve(false); }
      };
      im.src = url;
    });
    return photoCache[url];
  }
  function photoHtml(p) {
    if (!p.image) return '<span class="result-ph">' + ic("droplet") + "</span>";
    if (p.shop) return '<img data-shop="1" src="' + esc(p.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    return '<span class="result-ph" data-photo="' + esc(p.image) + '">' + ic("droplet") + "</span>";
  }
  function upgradePhotos(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-photo]"), function (sp) {
      var url = sp.getAttribute("data-photo");
      sp.removeAttribute("data-photo");
      photoOk(url).then(function (ok) {
        if (!ok || !sp.parentNode) return;
        var im = document.createElement("img");
        im.alt = ""; im.referrerPolicy = "no-referrer"; im.src = url;
        sp.parentNode.replaceChild(im, sp);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("img[data-shop]"), function (im) {
      im.removeAttribute("data-shop");
      im.addEventListener("error", function () {
        var sp = document.createElement("span");
        sp.className = "result-ph"; sp.innerHTML = ic("droplet");
        if (im.parentNode) im.parentNode.replaceChild(sp, im);
      });
    });
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) upgradePhotos(n); }); });
  }).observe(document.body, { childList: true, subtree: true });

  function scoreTag(score, big) {
    var b = band(score);
    return '<span class="tag ' + (big ? "big " : "") + "sc " + b.cls + '">' + b.label + '<span class="num">' + score + "/100</span></span>";
  }
  function scorePill(p) {
    var a;
    try { a = window.Ingredients.analyze(p.ingredientsText); } catch (e) { return ""; }
    var si = scoreInfo(p, a);
    return si.score === null ? "" : scoreTag(si.score, false);
  }
  function resultRows(list) {
    return list.map(function (p, idx) {
      var tag = p.shop ? ic("book") + "From our list" : p.local ? ic("camera") + "From your photo" : "";
      var marks = scorePill(p) + markTags(p);
      return '<button type="button" class="result-item" data-i="' + idx + '">' +
        photoHtml(p) +
        '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
        (tag || marks ? '<span class="tags">' + (tag ? '<span class="tag mine">' + tag + "</span>" : "") + marks + "</span>" : "") + "</span>" +
        ic("chevron-right", "chev-ic") + "</button>";
    }).join("");
  }
  function wireResultRows() {
    Array.prototype.forEach.call(el("results-list").querySelectorAll(".result-item"), function (b) {
      b.addEventListener("click", function () {
        var p = lastResults[Number(b.getAttribute("data-i"))];
        if (linking) { linkBarcode(p); return; }
        cameFrom = "results";
        renderResult(p);
      });
    });
  }

  // Maybe a typo: offer the closest search that does have results.
  function offerSuggestion(q) {
    window.Shop.suggest(q).then(function (text) {
      var box = el("did-you-mean");
      if (!text || !box || el("results-q").value !== q) return;
      box.innerHTML = '<button type="button" class="secondary dym">' + ic("search") + "<span>Did you mean <b>" + esc(text) + "</b>?</span></button>";
      box.firstChild.addEventListener("click", function () { el("results-q").value = text; runSearch(text); });
    });
  }

  function runSearch(raw) {
    var q = String(raw || "").trim();
    if (q.length < 2) return;
    linking = null;
    lastResults = null;
    cameFrom = "results";
    el("results-q").value = q;
    el("results-title").textContent = "Searching…";
    el("results-sub").textContent = "";
    el("results-list").innerHTML = "";
    show("results");
    var mineFound = window.Catalog.search(q);
    window.Shop.search(q).then(function (shopFound) {
      var local = mineFound.concat(shopFound.filter(function (s) {
        return !mineFound.some(function (m) { return m.brand === s.brand && m.name === s.name; });
      }));
      return window.OBF.search(q).then(function (r) {
        var codes = {};
        local.forEach(function (p) { if (p.code) codes[p.code] = true; });
        r.products = local.concat(r.products.filter(function (p) { return !(p.code && codes[p.code]); }));
        lastResults = r.products;
        el("results-title").textContent = r.products.length ? "Results for “" + q + "”" : "No results for “" + q + "”";
        var hidden = r.withoutIngredients;
        el("results-sub").textContent = r.products.length
          ? (hidden > 0 ? plural(hidden, "more product", "more products") + " found without an ingredient list, so we can't rate " + (hidden === 1 ? "it" : "them") + "." : "Tap a product to see what's in it.")
          : (hidden > 0 ? "We found " + plural(hidden, "product", "products") + " but none has an ingredient list yet." : "Try fewer words, like the brand and one product word.");
        el("results-list").innerHTML = (local.length ? "" : '<div id="did-you-mean"></div>') + resultRows(r.products) + (r.products.length ? "" :
          '<div class="status-actions"><button type="button" class="primary small" id="results-photo">' + ic("camera") + "Photo of ingredients</button></div>");
        wireResultRows();
        var rp = el("results-photo");
        if (rp) rp.addEventListener("click", startPhoto);
        if (!local.length) offerSuggestion(q);   // nothing in our own list: maybe a typo, even if the online database found something
      }).catch(function () {
        if (local.length) {
          lastResults = local;
          el("results-title").textContent = "Results for “" + q + "”";
          el("results-sub").textContent = "The online search isn't available right now, so this shows only the list saved in the app and what you saved from photos.";
          el("results-list").innerHTML = resultRows(local);
          wireResultRows();
          return;
        }
        el("results-title").textContent = "Couldn't search";
        el("results-sub").textContent = offlineNote("", "Check your connection and try again.");
        el("results-list").innerHTML = '<div id="did-you-mean"></div>';
        offerSuggestion(q);
      });
    });
  }

  // Unknown barcode: pick the same product from our list and remember the barcode on this phone.
  function findForBarcode(raw) {
    var q = String(raw || "").trim();
    if (q.length < 2 || !pending || !pending.code) return;
    linking = { code: pending.code };
    lastResults = null;
    cameFrom = "results";
    el("results-q").value = q;
    el("results-title").textContent = "Pick your product";
    el("results-sub").textContent = "Searching…";
    el("results-list").innerHTML = "";
    show("results");
    window.Shop.search(q).then(function (list) {
      lastResults = list;
      el("results-title").textContent = list.length ? "Is it one of these?" : "Not on our list yet";
      el("results-sub").textContent = list.length
        ? "Tap the one that matches your package. This phone will remember barcode " + linking.code + " for it."
        : "Try fewer words, like the brand and one product word, or go back and take a photo of the ingredient list.";
      el("results-list").innerHTML = resultRows(list);
      wireResultRows();
    });
  }
  function linkBarcode(p) {
    var code = linking && linking.code;
    linking = null;
    if (!code) return;
    var product = { code: code, brand: p.brand, name: p.name, image: "", ingredientsText: p.ingredientsText, local: true, shop: true, linked: true, partial: p.partial, kind: p.kind || "", note: p.note, source: p.source };
    window.Catalog.put(product);
    pending = null;
    cameFrom = "home";
    renderResult(product);
  }

  // ----- photo of the ingredient list -----
  function startPhoto() { openCam("ingredients"); }

  function showOcrForm(text, hint) {
    el("ocr-progress").hidden = true;
    el("ocr-form").hidden = false;
    el("ocr-text").value = text || "";
    el("ocr-name").value = pending && pending.name ? pending.name : "";
    el("ocr-hint").textContent = hint || "Photo readers make mistakes. Fix any typo and keep a comma between ingredients.";
  }

  function runOcr(file) {
    el("ocr-progress").hidden = false;
    el("ocr-form").hidden = true;
    el("ocr-status").textContent = "Preparing the photo…";
    el("ocr-bar").style.width = "6%";
    show("ocr");
    window.OCR.read(file, function (msg, pct) {
      el("ocr-status").textContent = msg;
      if (pct !== null) el("ocr-bar").style.width = Math.max(8, Math.round(pct * 100)) + "%";
    }).then(function (text) {
      if (!text) showOcrForm("", "We couldn't read any text. Try a sharp, well-lit photo of just the ingredient list, or type it below.");
      else showOcrForm(text);
    }).catch(function () {
      showOcrForm("", "The photo reader couldn't start. It needs an internet connection the first time. You can type or paste the list below.");
    });
  }

  function analyzePhoto() {
    var text = el("ocr-text").value.trim();
    if (text.length < 3) { el("ocr-hint").textContent = "Add the ingredient list to continue."; return; }
    cameFrom = "home";
    var product = { brand: "", name: el("ocr-name").value.trim() || "Photographed product", image: "", ingredientsText: text };
    if (pending && pending.code) {
      product = { code: pending.code, brand: pending.brand || "", name: el("ocr-name").value.trim() || pending.name || ("Product " + pending.code), image: pending.image || "", ingredientsText: text, local: true };
      window.Catalog.put(product);
      pending = null;
    }
    renderResult(product);
  }

  // ----- how we rate -----
  var ABOUT = [
    ["shield-check", "Who we trust", "Regulators, public health agencies, medical societies and published research from universities and hospitals. We do not use brands, industry-funded review panels or paid certification programs."],
    ["scale", "When sources disagree", "The stricter rule wins. Order: EU, then Korea, then Japan and China, then the rest. Fragrance allergens, banned preservatives and restricted ingredients come from those rules."],
    ["check", "The score, 0 to 100", "The worst ingredient decides the band. A product with an ingredient the EU bans in cosmetics, or carbon black, scores 24. A product with a flag near the top of the list scores around 52. A flag further down scores around 64, and each extra flag takes off 2 more. A product with no flags starts at 100. Everyday additives such as preservatives, colorants and ethoxylated emulsifiers, and the ingredients to watch, take off a little each, depending on how much of the list they make up. Excellent is 76 to 100 (green, the only green), Good 51 to 75 (yellow), Not great 26 to 50 (orange), Bad 0 to 25 (red). Your preferences in Profile can take a few more points off (see Score preferences)."],
    ["scale", "How the amount counts", "A label lists ingredients from the largest amount to the smallest, but only down to 1%: below 1% they can come in any order (EU, US, Canada and Mexico). So \u201cnear the top\u201d means among the first 14 and probably above 1% of the product. A flag does not count as near the top when the law caps the ingredient at 1% or less (phenoxyethanol, parabens, BHT), when it comes after the first such ingredient, or when the US EPA model of weight fractions puts it under 1% for a list of that length (usually beyond the first 4 to 8 places). Fragrance allergens, essential oils, UV filters, oils and waxes (petrolatum, paraffin, mineral oil) and banned ingredients are never lowered this way: for allergy the amount hardly changes the risk, a UV filter is the active ingredient of a sunscreen, and oils and waxes are often several percent even late in a list. The amount only ever helps a score; it never makes one worse. These are estimates from the order of the list, not measurements."],
    ["flag", "Flag, watch and good", "A flag is something an EU or Korean rule bans, restricts or requires to be named as an allergen, or that the EU safety committee has raised a concern about. To watch means irritation, clogged pores, sun sensitivity or a limit that is respected. Good means no known concern. Ingredients marked “rated by type” are judged as a group, not one by one."],
    ["alert", "Allergy is not irritation", "Can cause allergy: some people become allergic after repeated contact, and it usually stays. Allergen if you're allergic: only matters to people who already have that allergy, like nuts or wheat. Can irritate: depends on the amount and your skin, and goes away when you stop."],
    ["info", "Product alerts", "Official recalls are facts, with the date and a link to the notice. Lawsuits only appear when a court grouped many cases from different people and published science backs the claim. They are always labeled not proven."],
    ["ban", "What we can't know", "The list order tells us which ingredients are biggest, not the exact amounts; we only estimate them (see How the amount counts). Photos can be misread. Product data comes from a community database that can be out of date. A cosmetic scientist has not reviewed our ratings yet. This is not medical advice."],
    ["package", "Find a product", "One camera does it all. Barcode reads by itself. Product takes a photo of the front (we read its barcode first, then the words on the label). Shelf tries to recognize several products in one photo, and Ingredients reads the ingredient list. You can also search by name. For a round bottle, tap Camera app to use your phone's own camera: you can zoom in (for example 5×) so the list looks flatter, and tap to focus. Reading words from a photo can miss stylized fonts and crowded shelves, so check that each match is your product. Photos are read on your phone and are not uploaded."],
    ["sun", "Your routine", "There is a face routine (one list; each product shows a sun, a moon or both, so you know if it is for the day, the night or both), a hair routine (wash day and styling) and a body routine (shower, from the intimate wash to the body wash and scrub, and body care, from lotion and deodorant to hand cream). The best routine uses mostly the same products day and night; only a few are for one time (sunscreen in the morning, retinol and exfoliating acids at night), and suggestions follow that. Suggested products are the best-rated ones in our list that fit your skin or hair quiz and have no allergy hit or official alert. The hair quiz asks about pattern, strand thickness, scalp, past treatments and goals, with a tip in each question to find out your answer; it is guidance, not a diagnosis. Hair products tend to score lower, so for hair we also suggest a few fair ones (35 or more) after the best ones. The morning or night tip comes from the product name and its ingredients: retinol and exfoliating acids at night, sunscreen and vitamin C in the morning. It is guidance, so follow the package. You can swap any suggestion for the product you really own."],
    ["leaf", "Score preferences", "In Profile, Subtract points from the score takes points off the ingredient score. APPLIED NOW AND ON AT FIRST: Contaminant risks (up to 10 points: a PFAS ingredient, an amine that can form nitrosamines, an aerosol with propane or butane, talc in a loose powder), Plastic packaging (4 points, only when the photo clearly shows plastic; glass, metal or an unclear photo subtract nothing) and Matches my skin and hair (8 or 4 points, plus fragrance on sensitive or very reactive skin; never more than 11 points together). APPLIED WHEN YOU TURN THEM ON: Cruelty-free (10), Vegan-friendly (5), Endometriosis (up to 8) and Hormone sensitivity (up to 6, for ingredients that regulators watch for hormone activity; rinse-off products count half; these two stay on your phone only). NOT APPLIED YET: mental health (the evidence in cosmetics is too early), heavy metals (a label cannot show lead or arsenic)."],
    ["package", "Packaging", "Plastic packaging takes 4 points off (switch in Profile), only when the product photo clearly shows plastic. We read the material from the photo with a computer vision model, so it can be wrong, and glass is often hard to tell from plastic: then we say nothing and take nothing off. The health evidence is very early: lab tests on 11 cosmetic containers found small amounts of substances nobody added (some were phthalates) moving into test liquids; nobody has tested real cosmetics, and the EU sets no numeric limits for cosmetic packaging. A tub that gets opened and touched is harder to keep clean than a pump, but that only matters for formulas without preservatives. That plastic is harder to reuse than glass or metal is an environmental preference, not a health effect."],
    ["droplet", "Pores and acne", "Pore-friendly means the list is complete and has none of the ingredients on our pore-clogging watch-list. It is not a test of the product and it cannot promise you will not break out; the words \u201cnon-comedogenic\u201d and \u201coil-free\u201d on a pack are not regulated. The list comes from rabbit-ear tests (Fulton 1984 and 1989, Nguyen 2007), which over-predict what happens in people (Draelos 2006), plus a few small human tests, so the evidence is very early or low. If your quiz says you get acne or visible pores, the worst pore-clogging ingredient of a face product takes 1 to 5 points off (half in a rinse-off face product or when it is far down the list), instead of the old extra match points. If your skin is only oily it is 1 or 2. Hair, body and mouth care get 0. It is always inside the 11-point cap of Matches my skin and hair."],
    ["info", "Evidence in people", "Each ingredient shows two lines: the rule (what the EU or Korea does) and the evidence in people (High, Moderate, Low or Very early). They can disagree: a ban made from animal studies is a firm rule with very early evidence. Not verified means we only found the ingredient in the EU database, not in a study. The label says how firm the evidence is, not how serious it is."],
    ["package", "Buying safely", "A label cannot tell a fake from the real product. Buy from the brand's store or an authorised seller, be wary of prices far below normal, check that the lot number is printed and matches on the box and the bottle, and compare the ingredient list with the one here. If you react, stop using it and report it to Profeco or Cofepris. Fakes and lots never change the score."],
    ["camera", "Product photos", "Where we have one, the product photo is the brand's own or a large beauty retailer's studio photo, shown straight from their website. The photos belong to those brands and shops. We never store or sell them, and a photo can disappear if the website changes it."],
    ["lock", "Your data", "Nothing is uploaded. Your skin answers and allergies stay on your device, and there are no accounts."]
  ];
  function renderAbout() {
    el("about-body").innerHTML = ABOUT.map(function (a) {
      return '<div class="about-item"><p class="about-title">' + ic(a[0]) + esc(a[1]) + "</p><p>" + esc(a[2]) + "</p></div>";
    }).join("");
  }

  function goHome() {
    lastProduct = null;
    pending = null;
    linking = null;
    el("q").value = "";
    el("manual").hidden = true;
    hideCam();
    return stopScanner().then(function () { renderGreeting(false); renderProfileCard(); renderAllergyCard(); renderSavedList(); renderRoutineCard(); show("home"); });
  }

  el("note-btn").addEventListener("click", function () { var n = el("catalog-note"); n.hidden = !n.hidden; el("note-btn").setAttribute("aria-expanded", n.hidden ? "false" : "true"); });
  el("ing-all").addEventListener("click", function () { ingFull = !ingFull; renderIngredientList(); });
  el("heart").addEventListener("click", function () {
    if (!lastProduct) return;
    toggleSaved(lastProduct);
    renderHeart(lastProduct);
    renderSavedList();
  });
  el("wish").addEventListener("click", function () {
    if (!lastProduct) return;
    toggleWish(lastProduct);
    renderWishBtn(lastProduct);
  });
  // The results page keeps its own search box so a typo can be fixed without going back. While picking a product for a barcode, it searches that same pick.
  el("results-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = el("results-q").value;
    if (linking && pending) findForBarcode(v); else runSearch(v);
    el("results-q").blur();
  });
  el("search-form").addEventListener("submit", function (e) { e.preventDefault(); runSearch(el("q").value); });
  // iPhone: opening the keyboard pushes the page up and closing it leaves the page there (the logo gets cut). On Home nothing scrolls, so put it back.
  function homeScrollReset() {
    if (!document.body.classList.contains("on-home")) return;
    window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    var app = document.querySelector(".app"); if (app) app.scrollTop = 0;
  }
  document.addEventListener("focusout", function (e) {
    if (!e.target || !/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    [0, 80, 300, 600].forEach(function (ms) { setTimeout(homeScrollReset, ms); });
  });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", function () {
    if (window.visualViewport.height >= window.innerHeight - 80) homeScrollReset();
  });
  el("q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); runSearch(el("q").value); el("q").blur(); } });
  el("status-photo").addEventListener("click", startPhoto);
  el("status-find").addEventListener("submit", function (e) { e.preventDefault(); findForBarcode(el("status-find-q").value); });
  el("manual-btn").addEventListener("click", function () {
    var f = el("manual");
    f.hidden = !f.hidden;
    if (!f.hidden) el("code").focus();
  });
  el("cam-close").addEventListener("click", function () {
    var ctx = scanCtx;
    if (ctx) { closeCam().then(function () { backToRoutine(ctx); }); return; }
    goHome();
  });
  el("cam-card").addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".cam-card-x")) hideCard(); });
  el("pick-scan").addEventListener("click", function () { if (pickCtx) startRoutineScan(pickCtx.period, pickCtx.i); });
  el("cam-help").addEventListener("click", function () { showGuide(0); });
  el("guide-close").addEventListener("click", endGuide);
  el("guide-next").addEventListener("click", function () { if (guideStep >= GUIDE.length - 1) endGuide(); else showGuide(guideStep + 1); });
  el("cam-shutter").addEventListener("click", onShutter);
  el("cam-gallery").addEventListener("click", function () { el("cam-file").value = ""; el("cam-file").click(); });
  // "Camera app" opens the phone's own camera (zoom 1x to 5x, tap to focus, flash). Its photo is read like any other.
  el("cam-native").addEventListener("click", function () { el("cam-native-file").value = ""; el("cam-native-file").click(); });
  el("cam-native-file").addEventListener("change", function () { var f = el("cam-native-file").files && el("cam-native-file").files[0]; if (f) openCrop(f, cam.mode); });
  el("cam-file").addEventListener("change", function () { var f = el("cam-file").files && el("cam-file").files[0]; if (f) openCrop(f, cam.mode); });
  el("cam-modes").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-mode]") : null;
    if (b && !cam.busy) setMode(b.getAttribute("data-mode"));
  });
  el("sheet-close").addEventListener("click", closeSheet);
  el("sheet-code").addEventListener("click", function () { setMode("code"); });
  el("sheet-none").addEventListener("click", function () {
    if (cam.read) logMissing("none", cam.read.mode, cam.read.tokens, cam.list && cam.list[0]);
    el("sheet-sub").textContent = "Noted, thanks. It's saved in Profile.";
    el("sheet-none").hidden = true;
  });
  el("not-it-btn").addEventListener("click", function () {
    if (notItCtx) logMissing("not-it", notItCtx.mode, notItCtx.tokens, notItCtx.guess);
    notItCtx = null;
    backFromResult();
  });
  el("sheet-search").addEventListener("click", function () { goHome().then(function () { el("q").focus(); }); });
  el("ocr-go").addEventListener("click", analyzePhoto);
  el("ocr-cancel").addEventListener("click", goHome);
  el("status-back").addEventListener("click", goHome);
  el("back").addEventListener("click", backFromResult);
  el("results-back").addEventListener("click", goHome);
  el("logo").addEventListener("click", goHome);
  el("quiz-next").addEventListener("click", quizNext);
  el("quiz-back").addEventListener("click", quizBack);
  el("allergy-save").addEventListener("click", saveAllergies);
  el("allergy-cancel").addEventListener("click", function () { if (lastProduct) show("result"); else { renderAllergyCard(); renderProfileCard(); show("skin"); } });
  el("tab-home").addEventListener("click", function () { goHome(); });
  el("tab-skin").addEventListener("click", function () { lastProduct = null; renderProfileCard(); renderAllergyCard(); show("skin"); });
  el("tab-hist").addEventListener("click", function () { openHistory(); });
  el("tab-shop").addEventListener("click", function () { lastProduct = null; renderShop(); show("shop"); });
  el("hist-seg").addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("button[data-h]") : null; if (b) { histTab = b.getAttribute("data-h"); renderHistoryTab(); } });
  el("shop-list").addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null, list = loadWish();
    var del = t && t.closest(".shop-del"), op = t && t.closest(".shop-open"), row = t && t.closest(".shop-row");
    if (del) { var d = list[Number(del.getAttribute("data-i"))]; if (d) { delete shopOpen[productId(d)]; toggleWish(d); renderShop(); } return; }
    if (op) { var p = list[Number(op.getAttribute("data-i"))]; if (p) { cameFrom = "shop"; renderResult(p); } return; }
    if (row) { var item = row.parentNode, id = item.getAttribute("data-id"), on = !item.classList.contains("open"); item.classList.toggle("open", on); row.setAttribute("aria-expanded", String(on)); if (on) shopOpen[id] = 1; else delete shopOpen[id]; }
  });
  el("shop-addfavs").addEventListener("click", function () {
    var have = {}; loadWish().forEach(function (x) { have[x.id] = 1; });
    var add = loadSaved().filter(function (x) { return !have[x.id]; });
    storeWish(add.map(function (x) { return Object.assign({}, x, { wishAt: Date.now() }); }).concat(loadWish()));
    renderShop();
  });
  el("fab-cam").addEventListener("click", function () { openCam("code"); });
  el("tile-cats").addEventListener("click", openCats);
  el("tile-sug").addEventListener("click", openSug);
  el("sug-back").addEventListener("click", function () { goHome(); });
  el("routine-back").addEventListener("click", function () { goHome(); });
  el("sug-areas").addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("button[data-area]") : null; if (b) { sug.area = b.getAttribute("data-area"); sug.kind = ""; renderSug(); } });
  el("sug-chips").addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("button[data-k]") : null; if (b) { sug.kind = b.getAttribute("data-k"); renderSug(); } });
  el("sug-list").addEventListener("click", function (e) {
    var ab = e.target.closest ? e.target.closest(".sug-add, .sug-view") : null;
    if (ab) {
      var sp = sug.rows[Number(ab.getAttribute("data-i"))];
      if (!sp) return;
      if (ab.classList.contains("sug-add")) { addToRoutine(sp); renderSug(); }
      else { rtPeriod = periodForKind(kindOf(sp)); openRoutine(); }
      return;
    }
    var c = e.target.closest ? e.target.closest(".fav-card") : null;
    var p = c && sug.rows[Number(c.getAttribute("data-i"))];
    if (p) { cameFrom = "sug"; renderResult(p); }
  });
  el("cats-back").addEventListener("click", function () { goHome(); });
  el("cats-areas").addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("button[data-area]") : null; if (b) { cats.area = b.getAttribute("data-area"); cats.kind = "all"; cats.q = ""; el("cats-q").value = ""; renderCats(); } });
  el("cats-chips").addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("button[data-k]") : null; if (b) { cats.kind = b.getAttribute("data-k"); renderCats(); } });
  el("cats-form").addEventListener("submit", function (e) { e.preventDefault(); el("cats-q").blur(); });
  el("cats-q").addEventListener("input", function () { cats.q = el("cats-q").value; renderCats(true); });
  el("cats-more").addEventListener("click", function () { cats.shown += 40; renderCats(true); });
  el("cats-list").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".result-item") : null;
    if (!b) return;
    var p = catsRows[Number(b.getAttribute("data-i"))];
    if (p) { cameFrom = "cats"; renderResult(p); }
  });
  el("tile-ing").addEventListener("click", startPhoto);
  el("open-about").addEventListener("click", function () { lastProduct = null; renderAbout(); show("about"); });
  el("disclaimer-about").addEventListener("click", function () { renderAbout(); show("about"); });
  el("about-back").addEventListener("click", function () { if (lastProduct) show("result"); else { renderProfileCard(); show("skin"); } });
  el("routine-card").addEventListener("click", function (e) {
    var c = e.target.closest ? e.target.closest(".rc-col") : null;
    if (c) rtPeriod = c.getAttribute("data-period");
    openRoutine();
  });
  el("fav-filter").addEventListener("change", function () { favFilter = el("fav-filter").value; renderSavedList(); });
  el("rt-profile").addEventListener("click", function () {
    if (isHairPeriod(rtPeriod)) { startQuiz(window.Hair.load(), "hair", "routine"); return; }
    renderProfileCard(); renderAllergyCard(); show("skin");
  });
  el("rt-face").addEventListener("click", function () { if (isHairPeriod(rtPeriod) || isBodyPeriod(rtPeriod)) { rtPeriod = "face"; renderRoutine(); } });
  el("rt-hair").addEventListener("click", function () { if (!isHairPeriod(rtPeriod)) { rtPeriod = "hw"; renderRoutine(); } });
  el("rt-body").addEventListener("click", function () { if (!isBodyPeriod(rtPeriod)) { rtPeriod = "bs"; renderRoutine(); } });
  el("rt-am").addEventListener("click", function () { rtPeriod = el("rt-am").getAttribute("data-period"); renderRoutine(); });
  el("rt-pm").addEventListener("click", function () { rtPeriod = el("rt-pm").getAttribute("data-period"); renderRoutine(); });
  el("rt-steps").addEventListener("click", routineAction);
  el("rt-add").addEventListener("click", function () {
    var k = el("rt-add-kind").value, order = isHairPeriod(rtPeriod) ? window.Hair.ORDER : isBodyPeriod(rtPeriod) ? window.Body.ORDER : window.Routine.ORDER;
    var added = { kind: k, product: null };
    rt[rtPeriod].push(added);
    rt[rtPeriod].sort(function (a, b) { return order.indexOf(a.kind) - order.indexOf(b.kind); });
    rtSel = rt[rtPeriod].indexOf(added);
    saveRoutine(); renderRoutine();
  });
  el("rt-reset").addEventListener("click", function () { window.Routine.reset(); rt = window.Routine.load(); renderRoutineCard(); renderRoutine(); });
  el("pick-back").addEventListener("click", function () { show("routine"); });
  el("alt-box").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-i]") : null;
    if (b && altList[Number(b.getAttribute("data-i"))]) renderResult(altList[Number(b.getAttribute("data-i"))]);
  });
  el("pick-form").addEventListener("submit", function (e) { e.preventDefault(); pickSearch(el("pick-q").value); });
  el("pick-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); pickSearch(el("pick-q").value); el("pick-q").blur(); } });
  el("pick-list").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest('[data-act="choose"]') : null;
    if (!b || !pickCtx) return;
    var p = pickList[Number(b.getAttribute("data-i"))];
    if (!p) return;
    rtPeriod = pickCtx.period;
    rt[pickCtx.period][pickCtx.i].product = routineProd(p);
    rtSel = pickCtx.i;
    saveRoutine(); renderRoutine(); show("routine");
  });
  el("manual").addEventListener("submit", function (e) {
    e.preventDefault();
    lookupCode(el("code").value);
  });

  el("word-form").addEventListener("submit", addWord);
  // The link can be opened while the app is already open (then the page does not reload, only the # part changes).
  window.addEventListener("hashchange", function () {
    importSetup();
    renderGreeting(false);
    renderProfileCard();
    renderAllergyCard();
    renderSavedList();
    renderRoutineCard();
    show("home");
  });
  // ----- Full-screen product photo: tap the photo on the product screen; pinch, double-tap or wheel to zoom, drag to move, X to close -----
  (function () {
    var box = el("photo-view"), stage = el("pv-stage"), img = el("pv-img"), tile = document.querySelector(".photo-tile");
    var s = 1, tx = 0, ty = 0, pts = {}, startD = 0, startS = 1, lastTap = 0, open = false;
    function apply(anim) { img.style.transition = anim ? "transform .22s ease" : "none"; img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")"; }
    function clamp() {
      var mx = (s - 1) * box.clientWidth / 2, my = (s - 1) * box.clientHeight / 2;
      tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
    }
    function zoomTo(ns, cx, cy) {
      ns = Math.max(1, Math.min(5, ns));
      var r = box.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2, k = ns / s;
      tx = ox - (ox - tx) * k; ty = oy - (oy - ty) * k; s = ns;
      if (s === 1) { tx = 0; ty = 0; }
      clamp();
    }
    // The stage grows from where the small photo sits and shrinks back to it.
    function fromTile() {
      var r = tile.getBoundingClientRect(), vw = box.clientWidth, vh = box.clientHeight;
      return "translate(" + (r.left + r.width / 2 - vw / 2) + "px," + (r.top + r.height / 2 - vh / 2) + "px) scale(" + Math.max(0.15, r.width / vw) + ")";
    }
    function openView() {
      var ph = el("photo");
      if (!ph || ph.hidden || !ph.src) return;
      img.src = ph.src; s = 1; tx = 0; ty = 0; pts = {}; apply(false);
      box.hidden = false; open = true;
      stage.style.transition = "none"; stage.style.transform = fromTile(); box.style.opacity = "0";
      void box.offsetWidth;
      stage.style.transition = "transform .3s cubic-bezier(.2,.8,.2,1)"; box.style.transition = "opacity .25s ease";
      stage.style.transform = "none"; box.style.opacity = "1";
    }
    function closeView() {
      if (!open) return;
      open = false; s = 1; tx = 0; ty = 0; apply(true);
      stage.style.transform = fromTile(); box.style.opacity = "0";
      setTimeout(function () { if (!open) box.hidden = true; }, 300);
    }
    function dist() { var k = Object.keys(pts); return Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y); }
    function mid() { var k = Object.keys(pts); return { x: (pts[k[0]].x + pts[k[1]].x) / 2, y: (pts[k[0]].y + pts[k[1]].y) / 2 }; }
    box.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".pv-close")) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { box.setPointerCapture(e.pointerId); } catch (x) {}
      if (Object.keys(pts).length === 2) { startD = dist(); startS = s; }
      else {
        var now = Date.now();
        if (now - lastTap < 300) { zoomTo(s > 1 ? 1 : 2.5, e.clientX, e.clientY); apply(true); lastTap = 0; } else lastTap = now;
      }
    });
    box.addEventListener("pointermove", function (e) {
      var p = pts[e.pointerId]; if (!p) return;
      var n = Object.keys(pts).length;
      if (n === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var m = mid(); zoomTo(startS * dist() / startD, m.x, m.y); apply(false);
      } else if (s > 1) {
        tx += e.clientX - p.x; ty += e.clientY - p.y; clamp(); p.x = e.clientX; p.y = e.clientY; apply(false);
      }
    });
    function up(e) { delete pts[e.pointerId]; if (s < 1.02) { s = 1; tx = 0; ty = 0; apply(true); } }
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    box.addEventListener("wheel", function (e) { e.preventDefault(); zoomTo(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); apply(false); }, { passive: false });
    el("pv-close").addEventListener("click", closeView);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeView(); });
    tile.addEventListener("click", openView);
  })();

  // One theme-color tag, switched by script: iPhones in app mode pick the LAST of several theme-color tags no matter the mode.
  (function () {
    var meta = el("theme-color"), mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function sync() { if (meta) meta.setAttribute("content", mq && mq.matches ? "#0b2f45" : "#6fd0d8"); }
    sync();
    if (mq && mq.addEventListener) mq.addEventListener("change", sync);
  })();
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener("touchmove", function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  window.SkinSafe = { scoreInfo: scoreInfo, analysisOf: analysisOf, kindOf: kindOf, faceSkinKind: faceSkinKind, isRinseOff: isRinseOff };   // small hook for checks in the browser console
  importSetup();
  renderGreeting(false);
  renderProfileCard();
  renderAllergyCard();
  renderSavedList();
  renderRoutineCard();
  show("home");
  // Brand facts load after the first screen; redraw the saved list once they are in.
  window.Brands.load().then(function () { renderSavedList(); });
})();
