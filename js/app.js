(function () {
  var VIEWS = ["home", "skin", "quiz", "allergies", "results", "about", "ocr", "status", "result"];
  var scanner = null;
  var lastProduct = null;
  var cameFrom = "home";        // where "Back" on a result should go
  var lastResults = null;
  var quiz = { step: 0, answers: {} };
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
  var TAB_OF = { home: "home", skin: "skin", quiz: "skin", allergies: "allergies", about: "about" };
  function show(view) {
    VIEWS.forEach(function (v) { el(v).hidden = v !== view; });
    var active = TAB_OF[view] || "";
    Array.prototype.forEach.call(document.querySelectorAll("#tabbar .tab"), function (b) {
      var on = b.getAttribute("data-tab") === active;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.body.classList.toggle("on-result", view === "result");
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
    if (score >= 51) return { cls: "good", label: "Good", icon: "shield-check" };
    if (score >= 26) return { cls: "mid", label: "Not great", icon: "alert" };
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
  function renderProfileCard() {
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
  function startQuiz(existing) {
    quiz = { step: 0, answers: existing ? JSON.parse(JSON.stringify(existing)) : {} };
    renderQuiz();
    show("quiz");
  }

  function renderQuiz() {
    var qs = window.Profile.QUESTIONS;
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
    var qs = window.Profile.QUESTIONS;
    var q = qs[quiz.step];
    var a = quiz.answers[q.id];
    var answered = q.multi ? true : !!a;   // the concerns question may stay empty
    if (!answered) { el("quiz-sub").textContent = "Choose one answer to continue."; return; }
    if (quiz.step < qs.length - 1) { quiz.step++; renderQuiz(); return; }
    quiz.answers.concerns = quiz.answers.concerns || [];
    window.Profile.save(quiz.answers);
    renderProfileCard();
    if (lastProduct) { renderResult(lastProduct); } else { renderProfileCard(); show("skin"); }
  }

  function quizBack() {
    if (quiz.step === 0) { if (lastProduct) show("result"); else { renderProfileCard(); show("skin"); } return; }
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
    else list.unshift({ id: id, code: p.code || "", brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, savedAt: Date.now() });
    storeSaved(list);
  }
  function renderHeart(p) {
    var b = el("heart"), on = isSaved(p);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Remove from My products" : "Save to My products");
    b.classList.toggle("on", on);
  }
  function renderSavedList() {
    var list = loadSaved(), box = el("saved");
    if (!list.length) {
      box.hidden = false;
      box.innerHTML = '<div class="saved-head"><p class="saved-title">' + ic("heart") + 'My products</p><span class="saved-count">Nothing saved yet</span></div>' +
        '<p class="saved-empty">Open any product and tap the heart to keep it here. Your list stays on this phone and the scores update as we learn more.</p>';
      return;
    }
    var ids = window.Profile.loadAllergies(), words = window.Profile.loadWords();
    box.hidden = false;
    box.innerHTML = '<div class="saved-head"><p class="saved-title">' + ic("heart") + 'My products</p><span class="saved-count">' + list.length + " saved on this phone</span></div>" +
      list.map(function (p, i) {
        var an = window.Ingredients.analyze(p.ingredientsText), b = band(an.score), tags = "";
        tags += markTags(p);
        if (window.Alerts && window.Alerts.match(p).length) tags += '<span class="tag bad">' + ic("alert") + "Official alert</span>";
        if ((ids.length || words.length) && window.Profile.allergyHits(an.items, ids, words).length) tags += '<span class="tag bad">' + ic("alert") + "Your allergy</span>";
        return '<button type="button" class="result-item saved-item" data-i="' + i + '">' +
          '<span class="mini-score ' + b.cls + '">' + (an.score === null ? "?" : an.score) + "</span>" +
          '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span>" +
          (tags ? '<span class="tags">' + tags + "</span>" : "") + "</span>" + ic("chevron-right", "chev-ic") + "</button>";
      }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".saved-item"), function (btn) {
      btn.addEventListener("click", function () { cameFrom = "home"; renderResult(list[Number(btn.getAttribute("data-i"))]); });
    });
  }

  // ----- result -----
  // A box whose title stays visible and whose details open on tap.
  function fold(title, body, open) {
    return '<details class="fold"' + (open ? " open" : "") + '><summary class="match-title">' + title + '<span class="chev" aria-hidden="true"></span></summary>' + body + "</details>";
  }
  function renderMatch(items) {
    var box = el("match");
    var p = window.Profile.load();
    box.hidden = false;
    if (!p) {
      box.className = "match prompt";
      box.innerHTML = '<p class="match-title">' + ic("droplet") + "Does this suit your skin?</p>" +
        '<button type="button" class="secondary small-btn" id="match-quiz">Take the 4-question quiz</button>';
      el("match-quiz").addEventListener("click", function () { startQuiz(null); });
      return;
    }
    var m = window.Profile.match(items, p);
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

  // Ingredients: the most important ones first (flagged, then to watch, then good). "See all" opens the rest.
  var ING_LIMIT = 6, ingRated = [], ingExpanded = false;
  function renderIngredientList() {
    var shown = ingExpanded ? ingRated : ingRated.slice(0, ING_LIMIT);
    el("ingredients").innerHTML = shown.map(ingredientRow).join("");
    var btn = el("ing-all");
    btn.hidden = ingRated.length <= ING_LIMIT;
    btn.innerHTML = (ingExpanded ? "Show less" : "See all " + ingRated.length) + '<span class="chev-r" aria-hidden="true"></span>';
    btn.classList.toggle("open", ingExpanded);
  }

  function renderResult(product) {
    lastProduct = product;
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
    renderMatch(a.items);

    var order = { bad: 0, mid: 1, good: 2 };
    var rated = a.items
      .filter(function (i) { return i.level; })
      .map(function (i, idx) { return { i: i, idx: idx }; })
      .sort(function (x, y) { return order[x.i.level] - order[y.i.level] || x.idx - y.idx; })
      .map(function (x) { return x.i; });
    ingRated = rated;
    ingExpanded = false;
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
    else if (cameFrom === "results" && lastResults) show("results"); else goHome();
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
  function applyResolved(r, code) {
    if (r.state === "bad") { showStatus("That doesn't look like a barcode. Barcodes have 8 to 13 digits."); return; }
    if (r.state === "error") { showStatus("Couldn't reach the product database. Check your connection and try again."); return; }
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
    product: "Fit the front of the product in the frame, then tap the button",
    shelf: "Fit the shelf in the frame, then tap the button",
    ingredients: "Fill the frame with the ingredient list, then tap the button"
  };
  var cam = { open: false, mode: "code", busy: false, cand: "", candAt: 0, shown: "", job: 0, list: null };
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
        { fps: 10, videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
        onDecoded,
        function () {}
      ).then(function () {
        if (!cam.open || scanner !== s) { if (scanner === s) scanner = null; s.stop().then(function () { s.clear(); }).catch(function () {}); }
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
        showCard('<p class="cam-card-note">Couldn\'t reach the product database. Check your connection and scan again.</p>');
        cam.shown = "";
      } else {
        showCard('<p class="cam-card-note"><strong>' + esc(code) + "</strong> " +
          (r.state === "missing" ? "isn't in our database yet." : "is in the database but has no ingredient list yet.") + "</p>" +
          '<button type="button" class="primary small" id="cam-card-add">' + ic("camera") + "Add it with a photo</button>");
        el("cam-card-add").addEventListener("click", function () { closeCam(); applyResolved(r, code); });
      }
    });
  }

  // Crop the live picture to what is inside the white frame (the video is shown "cover", so map screen to video pixels).
  function grabFrame() {
    var v = document.querySelector("#cam-reader video");
    if (!v || !v.videoWidth) return Promise.reject(new Error("no-video"));
    var vr = v.getBoundingClientRect(), fr = el("cam-frame").getBoundingClientRect();
    var k = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    var offX = (vr.width - v.videoWidth * k) / 2, offY = (vr.height - v.videoHeight * k) / 2;
    var sx = Math.max(0, (fr.left - vr.left - offX) / k), sy = Math.max(0, (fr.top - vr.top - offY) / k);
    var sw = Math.min(v.videoWidth - sx, fr.width / k), sh = Math.min(v.videoHeight - sy, fr.height / k);
    var c = document.createElement("canvas");
    c.width = Math.round(sw); c.height = Math.round(sh);
    c.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { if (b) resolve(new File([b], "snap.jpg", { type: "image/jpeg" })); else reject(new Error("no-blob")); }, "image/jpeg", 0.92);
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
    grabFrame().then(function (file) { handleFile(file, cam.mode); }).catch(function () {
      camMsg("The camera isn't ready yet. Wait a second and try again.");
    });
  }

  function handleFile(file, mode) {
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
    var work = mode === "product" ? identifyProduct(file) : findShelf(file);
    work.then(function (r) {
      if (!cam.open || cam.job !== job) return;
      cam.busy = false; setBusy(false);
      if (r.code) { closeCam().then(function () { lookupCode(r.code); }); return; }
      showSheet(mode, r);
    }).catch(function () {
      if (!cam.open || cam.job !== job) return;
      cam.busy = false; setBusy(false);
      el("cam-hint").hidden = false;
      camMsg("The photo reader couldn't start. It needs an internet connection the first time. Try again, or use the barcode.");
    });
  }

  // Product: try a barcode in the photo first, then read the words printed on the package.
  function identifyProduct(file) {
    stage("Looking for a barcode");
    return tryBarcodeFile(file).then(function (code) {
      if (code.length >= 8) return { code: code };
      return window.OCR.readRaw(file, progress).then(function (text) { stage("Matching products"); return window.Shop.identify(text); });
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

  function showSheet(mode, r) {
    var list = r.matches || [];
    cam.list = list;
    var n = list.length;
    el("sheet-title").textContent = n ? (mode === "shelf" ? "Products found: " + n : "Is it one of these?") : (mode === "shelf" ? "No products recognized" : "We couldn't tell which product it is");
    el("sheet-sub").textContent = n
      ? (mode === "shelf" ? "Tap a product to see the full breakdown. Shelf reading is best effort, so a label it couldn't read may be missing." : "Tap the one on your package. If it isn't here, scan its barcode or photograph the ingredient list.")
      : (mode === "shelf" ? "Try fewer products at once, closer, in good light. Or scan one product at a time with Product or Barcode." : "Try again with the front label in good light, or use the barcode or a photo of the ingredient list." + (r.tokens && r.tokens.length ? " We read: " + r.tokens.slice(0, 8).join(" ") + "." : " We couldn't read any words."));
    el("sheet-list").innerHTML = resultRows(list);
    Array.prototype.forEach.call(el("sheet-list").querySelectorAll(".result-item"), function (b) {
      b.addEventListener("click", function () {
        var p = list[Number(b.getAttribute("data-i"))];
        lastResults = list;
        el("results-title").textContent = el("sheet-title").textContent;
        el("results-sub").textContent = "Tap a product to see what's in it.";
        el("results-list").innerHTML = resultRows(list);
        wireResultRows();
        closeCam(); pending = null; linking = null; cameFrom = "results"; renderResult(p);
      });
    });
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

  function runSearch(raw) {
    var q = String(raw || "").trim();
    if (q.length < 2) return;
    linking = null;
    lastResults = null;
    cameFrom = "results";
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
        el("results-list").innerHTML = resultRows(r.products) + (r.products.length ? "" :
          '<div class="status-actions"><button type="button" class="primary small" id="results-photo">' + ic("camera") + "Photo of ingredients</button></div>");
        wireResultRows();
        var rp = el("results-photo");
        if (rp) rp.addEventListener("click", startPhoto);
      }).catch(function () {
        if (local.length) {
          lastResults = local;
          el("results-title").textContent = "Results for “" + q + "”";
          el("results-sub").textContent = "The online search didn't work, so this shows only our list and what you saved from photos.";
          el("results-list").innerHTML = resultRows(local);
          wireResultRows();
          return;
        }
        el("results-title").textContent = "Couldn't search";
        el("results-sub").textContent = "Check your connection and try again.";
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
    ["check", "The score, 0 to 100", "Starts at 100. Each flagged ingredient takes off 18 points and each ingredient to watch takes off 6. A fragrance and its allergens count as one problem, up to 30 points. Any flag keeps a product from being Excellent. Excellent is 76 to 100, Good 51 to 75, Not great 26 to 50, Bad 0 to 25."],
    ["flag", "Flag, watch and good", "A flag is something an EU or Korean rule bans, restricts or requires to be named as an allergen. To watch means irritation, clogged pores, sun sensitivity or a limit that is respected. Good means no known concern. Ingredients marked “rated by type” are judged as a group, not one by one."],
    ["alert", "Allergy is not irritation", "Can cause allergy: some people become allergic after repeated contact, and it usually stays. Allergen if you're allergic: only matters to people who already have that allergy, like nuts or wheat. Can irritate: depends on the amount and your skin, and goes away when you stop."],
    ["info", "Product alerts", "Official recalls are facts, with the date and a link to the notice. Lawsuits only appear when a court grouped many cases from different people and published science backs the claim. They are always labeled not proven."],
    ["ban", "What we can't know", "The list order tells us the biggest ingredients, not the exact amounts. Photos can be misread. Product data comes from a community database that can be out of date. A cosmetic scientist has not reviewed our ratings yet. This is not medical advice."],
    ["package", "Find a product", "One camera does it all. Barcode reads by itself. Product takes a photo of the front (we read its barcode first, then the words on the label). Shelf tries to recognize several products in one photo, and Ingredients reads the ingredient list. You can also search by name. Reading words from a photo can miss stylized fonts and crowded shelves, so check that each match is your product. Photos are read on your phone and are not uploaded."],
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
    return stopScanner().then(function () { renderGreeting(false); renderProfileCard(); renderAllergyCard(); renderSavedList(); show("home"); });
  }

  el("note-btn").addEventListener("click", function () { var n = el("catalog-note"); n.hidden = !n.hidden; el("note-btn").setAttribute("aria-expanded", n.hidden ? "false" : "true"); });
  el("ing-all").addEventListener("click", function () { ingExpanded = !ingExpanded; renderIngredientList(); });
  el("heart").addEventListener("click", function () {
    if (!lastProduct) return;
    toggleSaved(lastProduct);
    renderHeart(lastProduct);
    renderSavedList();
  });
  el("scan-btn").addEventListener("click", function () { openCam("code"); });
  el("search-form").addEventListener("submit", function (e) { e.preventDefault(); runSearch(el("q").value); });
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
  el("cam-file").addEventListener("change", function () { var f = el("cam-file").files && el("cam-file").files[0]; if (f) handleFile(f, cam.mode); });
  el("cam-modes").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-mode]") : null;
    if (b && !cam.busy) setMode(b.getAttribute("data-mode"));
  });
  el("sheet-close").addEventListener("click", closeSheet);
  el("sheet-code").addEventListener("click", function () { setMode("code"); });
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
  el("allergy-cancel").addEventListener("click", function () { if (lastProduct) show("result"); else show("home"); });
  el("tab-home").addEventListener("click", function () { goHome(); });
  el("tab-skin").addEventListener("click", function () { lastProduct = null; renderProfileCard(); show("skin"); });
  el("tab-allergies").addEventListener("click", function () { lastProduct = null; startAllergies(); });
  el("tab-about").addEventListener("click", function () { lastProduct = null; renderAbout(); show("about"); });
  el("disclaimer-about").addEventListener("click", function () { renderAbout(); show("about"); });
  el("about-back").addEventListener("click", function () { if (lastProduct) show("result"); else show("home"); });
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
    show("home");
  });
  // One theme-color tag, switched by script: iPhones in app mode pick the LAST of several theme-color tags no matter the mode.
  (function () {
    var meta = el("theme-color"), mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function sync() { if (meta) meta.setAttribute("content", mq && mq.matches ? "#0b2f45" : "#84cdea"); }
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
  show("home");
  // Brand facts load after the first screen; redraw the saved list once they are in.
  window.Brands.load().then(function () { renderSavedList(); });
})();
