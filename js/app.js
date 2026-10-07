(function () {
  var VIEWS = ["home", "history", "favorites", "routine", "pick", "skin", "quiz", "allergies", "results", "about", "ocr", "status", "result"];
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
  var TAB_OF = { home: "home", routine: "home", pick: "home", history: "hist", favorites: "fav", skin: "skin", quiz: "skin", allergies: "skin", about: "skin" };
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
  function marksFor(product, items) {
    var marks = [];
    var v = window.Ingredients.veganCheck(items);
    if (v.ok && !product.partial) marks.push({ id: "vegan", label: "Vegan-friendly", icon: "leaf", note: "No animal-derived ingredients spotted in the list." });
    var cf = window.Brands && window.Brands.get(product.brand);
    if (cf) marks.push({ id: "cf", label: "Cruelty-free", icon: "paw", note: "The brand is " + (cf.status === "both" ? "certified by Leaping Bunny and PETA" : cf.status === "peta" ? "listed by PETA as cruelty-free" : "certified by Leaping Bunny") + "." });
    return marks;
  }
  function markTags(product) {
    var items;
    try { items = window.Ingredients.analyze(product.ingredientsText).items; } catch (e) { return ""; }
    return marksFor(product, items).map(function (m) { return '<span class="tag ok">' + ic(m.icon) + m.label + "</span>"; }).join("");
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
      box.innerHTML = '<p class="profile-label">' + ic("hair") + 'My hair</p><p class="profile-text">' + esc(window.Hair.summary(h)) + "</p>" +
        '<div class="profile-actions"><button type="button" class="link" id="hair-edit">Edit</button><button type="button" class="link" id="hair-clear">Remove</button></div>';
      el("hair-edit").addEventListener("click", function () { startQuiz(h, "hair"); });
      el("hair-clear").addEventListener("click", function () { window.Hair.clear(); renderHairCard(); });
    } else {
      box.innerHTML = '<p class="profile-label">' + ic("hair") + 'My hair</p><p class="profile-text">5 quick questions, with tips to find out your hair type.</p>' +
        '<div class="profile-actions"><button type="button" class="secondary small-btn" id="hair-start">Start</button></div>';
      el("hair-start").addEventListener("click", function () { startQuiz(null, "hair"); });
    }
  }

  function renderProfileCard() {
    renderNameCard();
    renderHairCard();
    var p = window.Profile.load();
    var box = el("profile-card");
    if (p) {
      box.innerHTML =
        '<p class="profile-label">' + ic("droplet") + 'My skin</p>' +
        '<p class="profile-text">' + esc(window.Profile.summary(p)) + "</p>" +
        '<div class="profile-actions"><button type="button" class="link" id="profile-edit">Edit</button>' +
        '<button type="button" class="link" id="profile-clear">Remove</button></div>';
      el("profile-edit").addEventListener("click", function () { startQuiz(p); });
      el("profile-clear").addEventListener("click", function () { window.Profile.clear(); renderProfileCard(); });
    } else {
      box.innerHTML =
        '<p class="profile-label">' + ic("droplet") + 'My skin</p>' +
        '<p class="profile-text">4 quick questions for a personal match.</p>' +
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
    el("quiz-step").textContent = "Question " + (quiz.step + 1) + " of " + qs.length;
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
      if (i > -1) list.splice(i, 1); else list.push(v);
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
    if (quiz.step < qs.length - 1) { quiz.step++; renderQuiz(); return; }
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

  // ----- My products (favorites), stored only on this phone -----
  var SKEY = "skinsafe.saved";
  function loadSaved() {
    try { var s = JSON.parse(localStorage.getItem(SKEY) || "[]"); return Array.isArray(s) ? s : []; } catch (e) { return []; }
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
    else list.unshift({ id: id, code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial, savedAt: Date.now() });
    storeSaved(list);
  }
  function renderHeart(p) {
    var b = el("heart"), on = isSaved(p);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Remove from My products" : "Save to My products");
    b.classList.toggle("on", on);
  }
  var favFilter = "all";
  // Products sold for "face and body" stay with the face routine.
  function faceAndBody(p) { return /\b(face|facial)\b/i.test(p.name || ""); }
  function kindOf(p) { return window.Oral.classify(p) || window.Hair.classify(p) || (faceAndBody(p) && window.Routine.classify(p)) || window.Body.classify(p) || window.Routine.classify(p) || "other"; }
  function kindLabel(k) { return k === "other" ? "Other" : window.Routine.KINDS[k].label; }
  function cardHtml(p, i, heart) {
    var ids = window.Profile.loadAllergies(), words = window.Profile.loadWords(), hk = window.Hair.classify(p), prof = window.Oral.classify(p) ? null : hk ? window.Hair.load() : window.Profile.load();
    var an = window.Ingredients.analyze(p.ingredientsText), b = band(an.score), tags = "";
    var hit = (ids.length || words.length) && window.Profile.allergyHits(an.items, ids, words).length;
    tags += '<span class="tag big sc ' + b.cls + '">' + (an.score === null ? "Not enough data" : "Safety: " + an.score + "/100") + "</span>";
    if (prof && an.score !== null && !hit && (hk ? window.Hair.match(an.items, prof, hk) : window.Profile.match(an.items, prof)).level === "good") tags += '<span class="tag big you">' + ic("heart") + "Good for you</span>";
    tags += markTags(p);
    if (window.Alerts && window.Alerts.match(p).length) tags += '<span class="tag bad">' + ic("alert") + "Official alert</span>";
    if (hit) tags += '<span class="tag bad">' + ic("alert") + "Your allergy</span>";
    return '<div class="fav-card" role="button" tabindex="0" data-i="' + i + '">' + photoHtml(p) +
      '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
      '<span class="tags">' + tags + "</span></span>" +
      (heart ? '<button type="button" class="fav-heart" data-i="' + i + '" aria-label="Remove from favorites">' + ic("heart") + "</button>" : "") + "</div>";
  }
  // ----- History: the last 7 products opened (scanned or searched), stored only on this phone -----
  var HKEY = "skinsafe.history", HMAX = 7;
  function loadHistory() {
    try { var h = JSON.parse(localStorage.getItem(HKEY) || "[]"); return Array.isArray(h) ? h : []; } catch (e) { return []; }
  }
  function addHistory(p) {
    var id = productId(p);
    var list = loadHistory().filter(function (x) { return x.id !== id; });
    list.unshift({ id: id, code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial, seenAt: Date.now() });
    try { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, HMAX))); } catch (e) {}
  }
  function renderHistory() {
    var list = loadHistory(), box = el("history-list");
    if (!list.length) { box.innerHTML = '<p class="saved-empty">Nothing here yet. The last 7 products you scan or search will show up here, on this phone only.</p>'; return; }
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
    sel.innerHTML = '<option value="all">All</option>' + window.Routine.ORDER.concat(window.Hair.ORDER, window.Body.ORDER, window.Oral.ORDER, ["other"]).filter(function (k) { return kinds[k]; }).map(function (k) {
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

  // ----- Your routine: one list of steps for the morning and one for the night, saved only on this phone -----
  var catalogList = [], rtPeriod = "face", rtSel = 0, rtSelPeriod = "", rt = null, rtSug = [], pickCtx = null, pickList = [], anCache = {};
  function analysisOf(p) { var c = anCache[p.ingredientsText]; if (!c) { c = window.Ingredients.analyze(p.ingredientsText); anCache[p.ingredientsText] = c; } return c; }
  function routineProd(p) { return { id: productId(p), code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, shop: !!p.shop, partial: !!p.partial }; }
  function whenOf(p, kind) { return window.Routine.when(p, kind || kindOf(p), analysisOf(p).items); }
  function isHairKind(k) { return !!(window.Hair.KINDS[k]); }
  function isHairPeriod(pd) { return pd === "hw" || pd === "hs"; }
  function isBodyKind(k) { return !!(window.Body && window.Body.KINDS[k]); }
  function isBodyPeriod(pd) { return pd === "bs" || pd === "bc"; }
  // Hair and body steps have no morning or night.
  function noTimeKind(k) { return isHairKind(k) || isBodyKind(k); }
  var PERIOD_NAME = { face: "Face routine", hw: "Wash day", hs: "Styling and care", bs: "Shower", bc: "Body care" };
  function whenTag(w) {
    return w.when === "am" ? '<span class="tag am">' + ic("sun") + "Morning</span>" : w.when === "pm" ? '<span class="tag pm">' + ic("moon") + "Night</span>" : '<span class="tag any">' + ic("sun") + ic("moon") + "Day and night</span>";
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
        if (fresh.image !== s.product.image || fresh.ingredientsText !== s.product.ingredientsText || fresh.name !== s.product.name || fresh.brand !== s.product.brand || fresh.partial !== s.product.partial) { s.product = fresh; changed = true; }
      });
    });
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
      var a = analysisOf(p);
      // Hair products score lower in general, so they get a lower floor, and the best-rated ones still come first.
      if (a.score === null || a.score < (hair ? 35 : 51)) return;
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
      out.push({ p: p, score: a.score, lv: m.level === "good" ? 0 : 1, helps: m.helps.length, low: hair && a.score < 51 ? 1 : 0 });
    });
    out.sort(function (x, y) { return x.low - y.low || x.lv - y.lv || y.helps - x.helps || y.score - x.score || (y.p.image ? 1 : 0) - (x.p.image ? 1 : 0); });
    return out.slice(0, limit).map(function (x) { return x.p; });
  }
  function rtRow(p, kind, act, i) {
    return '<button type="button" class="result-item" data-act="' + act + '" data-i="' + i + '">' + photoHtml(p) +
      '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
      '<span class="tags">' + scorePill(p) + (noTimeKind(kind) ? "" : whenTag(whenOf(p, kind))) + "</span></span>" + ic("chevron-right", "chev-ic") + "</button>";
  }
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
    // The routine is a shelf: two products per shelf, a bottle outline where nothing is chosen yet, and the details of the tapped one below.
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
    var shelves = "";
    for (var r0 = 0; r0 < slots.length; r0 += 2) shelves += '<div class="shelf-row">' + slots.slice(r0, r0 + 2).join("") + '</div><div class="shelf-plank"></div>';
    var panel = "";
    if (steps.length) {
      var i = rtSel, st = steps[i], pr = st.product, sg = rtSug[i], sh = pr || sg;
      var w2 = noTimeKind(st.kind) ? { when: "any", why: K[st.kind].tip } : sh ? whenOf(sh, st.kind) : { when: window.Routine.stepWhen(st.kind), why: K[st.kind].hint };
      panel = '<div class="shelf-panel"><p class="shelf-kind">' + esc(K[st.kind].label) + (pr ? "" : sg ? " · suggested for you" : "") + "</p>" +
        (sh ? '<p class="shelf-pname">' + esc(sh.name) + '</p><p class="shelf-brand">' + esc(sh.brand) + '</p><div class="tags">' + scorePill(sh) + (noTimeKind(st.kind) ? "" : whenTag(w2)) + "</div>" : '<p class="shelf-pname">Nothing here yet</p>') +
        '<p class="rt-tip">' + esc(w2.why) + "</p>" +
        '<div class="rt-actions">' + (pr
          ? '<button type="button" class="secondary small-btn" data-act="pick" data-i="' + i + '">Change</button><button type="button" class="secondary small-btn" data-act="clear" data-i="' + i + '">Remove</button><button type="button" class="secondary small-btn" data-act="open" data-i="' + i + '">Details</button>'
          : sg ? '<button type="button" class="primary small" data-act="use" data-i="' + i + '">Use this</button><button type="button" class="secondary small-btn" data-act="pick" data-i="' + i + '">See alternatives</button><button type="button" class="secondary small-btn" data-act="opensug" data-i="' + i + '">Details</button>'
          : '<button type="button" class="secondary small-btn" data-act="pick" data-i="' + i + '">Pick my own</button>') + "</div>" +
        '<button type="button" class="link shelf-del" data-act="del" data-i="' + i + '">Delete this step</button></div>';
    }
    el("rt-steps").innerHTML = steps.length ? panel + shelves : '<p class="rt-empty">No steps yet. Add one below.</p>';
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
    pickList = favs.concat(sugs);
    el("pick-list").innerHTML = (favs.length ? '<p class="pick-head">Your favorites</p>' + pickRows(favs) : "") +
      '<p class="pick-head">Suggested for you</p>' + (sugs.length ? sugs.map(function (p, k) { return rtRow(p, s.kind, "choose", favs.length + k); }).join("") : '<p class="rt-empty">No suggestions for this step yet. Search for yours above.</p>');
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
        '<button type="button" class="secondary small-btn" id="match-quiz">' + (hk ? "Take the 5-question hair quiz" : "Take the 4-question quiz") + "</button>";
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
    box.hidden = false;
    if (hits.length) {
      box.className = "match bad allergy-box";
      box.innerHTML = '<p class="match-title">' + ic("alert") + "Has something you're allergic to</p>" +
        '<ul class="match-list">' + hits.map(function (h) {
          return "<li><strong>" + esc(h.name) + "</strong> (" + esc(h.labels.join(", ")) + ")</li>";
        }).join("") + "</ul>";
    } else {
      box.className = "match good allergy-box";
      box.innerHTML = fold(ic("check") + "Nothing from your allergy list",
        '<p class="match-text">We only check the ingredients we can read, so look at the label if your allergy is serious.</p>', false);
    }
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

  function ingredientRow(i) {
    var labels = window.Ingredients.RISK_LABEL;
    var icons = window.Ingredients.RISK_ICON;
    var chips = i.risks.map(function (r) { return '<span class="risk">' + ic(icons[r]) + esc(labels[r]) + "</span>"; }).join("");
    var allergenChips = window.Profile.allergenLabels(i).map(function (l) {
      return '<span class="risk allergen">' + ic("alert") + "Allergen if you're allergic to: " + esc(l) + "</span>";
    }).join("");
    var hints = "";
    if (i.risks.indexOf("allergy") > -1) hints += '<p class="ing-hint">' + ic("info") + "Can cause allergy: some people become allergic after repeated contact, and it usually stays. Not everyone reacts.</p>";
    if (i.risks.indexOf("irritation") > -1) hints += '<p class="ing-hint">' + ic("info") + "Irritation is not an allergy. It depends on the amount and on your skin, and it usually goes away when you stop.</p>";
    var helps = i.helps.length ? '<p class="ing-helps">Often used for: ' + esc(i.helps.join(", ")) + "</p>" : "";
    var links = i.src.map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + "</a>";
    });
    // Peer-reviewed research (universities, hospitals) from PubMed, review articles only, and Japanese journals.
    var term = i.name.replace(/\([^)]*\)/g, " ").replace(/[^\w\s,\/.-]/g, " ").replace(/\s+/g, " ").trim();
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
      '<div class="ing-body"><p class="ing-detail">' + esc(i.detail) + "</p>" +
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
    var a = window.Ingredients.analyze(product.ingredientsText);
    var b = band(a.score);

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
    score.innerHTML = ic(b.icon) + esc(b.label) + (a.score === null ? "" : ": " + a.score + "/100");
    el("sub").textContent =
      a.score === null ? "We don't know enough of these ingredients yet" :
      n.bad > 0 ? plural(n.bad, "ingredient flagged", "ingredients flagged") :
      n.mid > 0 ? plural(n.mid, "ingredient to watch", "ingredients to watch") :
      "No flagged ingredients";

    el("counts").innerHTML =
      '<span class="pill good">' + ic("check") + n.good + " good</span>" +
      '<span class="pill mid">' + ic("eye") + n.mid + " to watch</span>" +
      '<span class="pill bad">' + ic("flag") + plural(n.bad, "flag", "flags") + "</span>";

    var marks = marksFor(product, a.items), badges = el("badges");
    badges.hidden = marks.length === 0;
    badges.innerHTML = marks.length
      ? marks.map(function (m) { return '<span class="pill ok">' + ic(m.icon) + m.label + "</span>"; }).join("") +
        '<p class="badge-note">' + marks.map(function (m) { return esc(m.note); }).join(" ") + " These marks don't change the score, and they aren't a certification of this exact package.</p>"
      : "";
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
    renderAlerts(product);
    renderAllergyBox(a.items);
    renderMatch(a.items, product);

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
    else if (cameFrom === "history") { renderHistory(); show("history"); }
    else if (cameFrom === "favorites") { renderSavedList(); show("favorites"); }
    else if (cameFrom === "routine") openRoutine();
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
      showStatus(r.p.name + " is in the database but has no ingredient list yet. Take a photo of the list on the package and we'll remember it on this phone.", true);
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
    product: "Fit the front of the product in the frame, tap the button, then hold still for a second",
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
  function setMode(mode) {
    cam.mode = mode;
    el("cam").className = "cam m-" + mode;
    el("cam-hint").textContent = MODE_HINT[mode];
    el("cam-hint").hidden = false;
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
    startCamera();
    if (!guideSeen()) showGuide(0);
  }
  function hideCam() {
    cam.open = false; cam.busy = false; cam.job++;
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
  function onDecoded(text) {
    if (!cam.open || cam.busy || cam.mode !== "code") return;
    var code = String(text || "").replace(/\D/g, "");
    if (code.length < 8 || code.length > 14 || code === cam.shown) return;
    if ((code.length === 12 || code.length === 13) && !validGtin(code)) return;
    var now = Date.now();
    if (code !== cam.cand || now - cam.candAt > 1500) { cam.cand = code; cam.candAt = now; return; }
    cam.cand = "";
    camLookup(code);
  }

  function showCard(html) {
    var c = el("cam-card");
    c.innerHTML = html;
    c.hidden = false;
    el("cam-hint").hidden = true;
  }
  function camLookup(code) {
    cam.shown = code;
    showCard('<p class="cam-card-note">Looking up ' + esc(code) + "…</p>");
    resolveCode(code).then(function (r) {
      if (!cam.open || cam.shown !== code) return;
      if (r.state === "found") {
        var p = r.product, marks = scorePill(p) + markTags(p);
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
          (r.state === "missing" ? "isn't in our database yet." : "is in the database but has no ingredient list yet.") + "</p>" +
          '<button type="button" class="primary small" id="cam-card-add">' + ic("camera") + "Add it with a photo</button>");
        el("cam-card-add").addEventListener("click", function () { closeCam(); applyResolved(r, code); });
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
      if (Object.keys(adv).length) t.applyConstraints({ advanced: [adv] }).catch(function () {});
    } catch (e) {}
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

  function tryBarcodeFile(file) {
    if (!window.Html5Qrcode) return Promise.resolve("");
    var q = new window.Html5Qrcode("reader-file", { verbose: false });
    return q.scanFile(file, false).then(function (t) { try { q.clear(); } catch (e) {} return String(t || "").replace(/\D/g, ""); }).catch(function () { return ""; });
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

  function onShutter() {
    if (cam.busy || cam.mode === "code") return;
    var mode = cam.mode;
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

  function handleFile(file, mode) {
    var alts = cam.alts || []; cam.alts = [];
    if (mode === "code") {
      tryBarcodeFile(file).then(function (code) {
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
      if (r.code) { closeCam().then(function () { lookupCode(r.code); }); return; }
      cam.read = { mode: mode, tokens: r.tokens || [] };
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
  function identifyProduct(file, alts) {
    stage("Looking for a barcode");
    return tryBarcodeFile(file).then(function (code) {
      if (code.length >= 8) return { code: code };
      return window.OCR.readRaw(file, progress).then(function (text) {
        stage("Matching products");
        return window.Shop.identify(text).then(function (r) {
          if (r.exact || !alts || !alts.length) return r;
          stage("Reading again");
          return window.OCR.readRaw(alts[0], progress).then(function (text2) {
            stage("Matching products");
            return window.Shop.identify(text + "\n" + text2).then(function (r2) {
              return (r2.matches && r2.matches.length) || !(r.matches && r.matches.length) ? r2 : r;
            });
          }, function () { return r; });
        });
      });
    });
  }

  // Shelf (best effort): read all the words, group the ones that sit together into labels, and identify each label.
  function findShelf(file) {
    function pass(invert) {
      return window.OCR.readWords(file, progress, invert).then(function (words) { return window.OCR.groups(words); });
    }
    function identifyAll(gs) {
      var found = [];
      stage("Matching products");
      return gs.reduce(function (chain, g) {
        return chain.then(function () {
          return window.Shop.identify(g.text).then(function (r) {
            var m = r.matches[0], ev = r.evidence[0];
            // Keep only solid matches: the brand plus another word, or at least three words of the name.
            if (m && ev && (ev.hits >= 3 || (ev.brand && ev.hits >= 2)) && !found.some(function (f) { return f.brand === m.brand && f.name === m.name; })) found.push(m);
          });
        });
      }, Promise.resolve()).then(function () { return found; });
    }
    return pass(false).then(identifyAll).then(function (found) {
      if (found.length >= 2) return found;
      return pass(true).then(identifyAll).then(function (more) {
        more.forEach(function (m) { if (!found.some(function (f) { return f.brand === m.brand && f.name === m.name; })) found.push(m); });
        return found;
      });
    }).then(function (found) { return { matches: found, shelf: true, tokens: [] }; });
  }

  // Open a product from a list of matches; "Back" from it returns to that list.
  function openFromMatches(list, p, title, exactCtx) {
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

  function scorePill(p) {
    var a;
    try { a = window.Ingredients.analyze(p.ingredientsText); } catch (e) { return ""; }
    if (a.score === null) return "";
    return '<span class="tag sc ' + band(a.score).cls + '">Safety ' + a.score + "/100</span>";
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
    var product = { code: code, brand: p.brand, name: p.name, image: "", ingredientsText: p.ingredientsText, local: true, shop: true, linked: true, partial: p.partial, note: p.note, source: p.source };
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
    ["check", "The score, 0 to 100", "The worst ingredient decides the band. A product with an ingredient the EU bans in cosmetics, or carbon black, scores 24. A product with a flag near the top of the list (the first 14 ingredients) scores around 52, because labels list ingredients from the largest amount to the smallest. A flag further down scores around 64, and each extra flag takes off 2 more. A product with no flags starts at 100. Everyday additives such as preservatives, colorants and ethoxylated emulsifiers, and the ingredients to watch, take off a little each, depending on how much of the list they make up. Excellent is 76 to 100 (green, the only green), Good 51 to 75 (yellow), Not great 26 to 50 (orange), Bad 0 to 25 (red)."],
    ["flag", "Flag, watch and good", "A flag is something an EU or Korean rule bans, restricts or requires to be named as an allergen, or that the EU safety committee has raised a concern about. To watch means irritation, clogged pores, sun sensitivity or a limit that is respected. Good means no known concern. Ingredients marked “rated by type” are judged as a group, not one by one."],
    ["alert", "Allergy is not irritation", "Can cause allergy: some people become allergic after repeated contact, and it usually stays. Allergen if you're allergic: only matters to people who already have that allergy, like nuts or wheat. Can irritate: depends on the amount and your skin, and goes away when you stop."],
    ["info", "Product alerts", "Official recalls are facts, with the date and a link to the notice. Lawsuits only appear when a court grouped many cases from different people and published science backs the claim. They are always labeled not proven."],
    ["ban", "What we can't know", "The list order tells us the biggest ingredients, not the exact amounts. Photos can be misread. Product data comes from a community database that can be out of date. A cosmetic scientist has not reviewed our ratings yet. This is not medical advice."],
    ["package", "Find a product", "One camera does it all. Barcode reads by itself. Product takes a photo of the front (we read its barcode first, then the words on the label). Shelf tries to recognize several products in one photo, and Ingredients reads the ingredient list. You can also search by name. For a round bottle, tap Camera app to use your phone's own camera: you can zoom in (for example 5×) so the list looks flatter, and tap to focus. Reading words from a photo can miss stylized fonts and crowded shelves, so check that each match is your product. Photos are read on your phone and are not uploaded."],
    ["sun", "Your routine", "There is a face routine (one list; each product shows a sun, a moon or both, so you know if it is for the day, the night or both), a hair routine (wash day and styling) and a body routine (shower, from the intimate wash to the body wash and scrub, and body care, from lotion and deodorant to hand cream). The best routine uses mostly the same products day and night; only a few are for one time (sunscreen in the morning, retinol and exfoliating acids at night), and suggestions follow that. Suggested products are the best-rated ones in our list that fit your skin or hair quiz and have no allergy hit or official alert. The hair quiz asks about pattern, strand thickness, scalp, past treatments and goals, with a tip in each question to find out your answer; it is guidance, not a diagnosis. Hair products tend to score lower, so for hair we also suggest a few fair ones (35 or more) after the best ones. The morning or night tip comes from the product name and its ingredients: retinol and exfoliating acids at night, sunscreen and vitamin C in the morning. It is guidance, so follow the package. You can swap any suggestion for the product you really own."],
    ["leaf", "Vegan and cruelty-free marks", "These small marks appear only when they are true, and they never change the score. Vegan-friendly means we found no animal-derived ingredient in the list (honey, beeswax, collagen, lanolin, milk proteins and similar). Some common ingredients, like glycerin or stearic acid, can come from animals or plants and the list does not say which, so this is not a vegan certification. Cruelty-free means the brand is listed by Leaping Bunny or PETA, two independent nonprofits; we do not use the brand's own claim."],
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
  el("scan-btn").addEventListener("click", function () { openCam("code"); });
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
  el("cam-close").addEventListener("click", function () { goHome(); });
  el("cam-help").addEventListener("click", function () { showGuide(0); });
  el("guide-close").addEventListener("click", endGuide);
  el("guide-next").addEventListener("click", function () { if (guideStep >= GUIDE.length - 1) endGuide(); else showGuide(guideStep + 1); });
  el("cam-shutter").addEventListener("click", onShutter);
  el("cam-gallery").addEventListener("click", function () { el("cam-file").value = ""; el("cam-file").click(); });
  // "Camera app" opens the phone's own camera (zoom 1x to 5x, tap to focus, flash). Its photo is read like any other.
  el("cam-native").addEventListener("click", function () { el("cam-native-file").value = ""; el("cam-native-file").click(); });
  el("cam-native-file").addEventListener("change", function () { var f = el("cam-native-file").files && el("cam-native-file").files[0]; if (f) handleFile(f, cam.mode); });
  el("cam-file").addEventListener("change", function () { var f = el("cam-file").files && el("cam-file").files[0]; if (f) handleFile(f, cam.mode); });
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
  el("tab-hist").addEventListener("click", function () { lastProduct = null; renderHistory(); show("history"); });
  el("tab-fav").addEventListener("click", function () { lastProduct = null; renderSavedList(); show("favorites"); });
  el("fab-cam").addEventListener("click", function () { openCam("code"); });
  el("tile-shelf").addEventListener("click", function () { openCam("shelf"); });
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
  // One theme-color tag, switched by script: iPhones in app mode pick the LAST of several theme-color tags no matter the mode.
  (function () {
    var meta = el("theme-color"), mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function sync() { if (meta) meta.setAttribute("content", mq && mq.matches ? "#0b2f45" : "#6fd0d8"); }
    sync();
    if (mq && mq.addEventListener) mq.addEventListener("change", sync);
  })();
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener("touchmove", function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
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
