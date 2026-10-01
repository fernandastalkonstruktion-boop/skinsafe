(function () {
  var VIEWS = ["home", "quiz", "allergies", "results", "about", "ocr", "scanner", "status", "result"];
  var scanner = null;
  var lastProduct = null;
  var cameFrom = "home";        // where "Back" on a result should go
  var lastResults = null;
  var quiz = { step: 0, answers: {} };
  var allergyDraft = [];

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ic(name, cls) {
    return '<svg class="ic ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }
  function show(view) {
    VIEWS.forEach(function (v) { el(v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }
  function showStatus(text, offerPhoto) {
    el("status-text").textContent = text;
    el("status-photo").hidden = !offerPhoto;
    show("status");
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
      box.innerHTML = '<p class="greet-hi">Hi, ' + esc(pretty(name)) + '!</p><button type="button" class="link" id="greet-edit">Change name</button>';
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
    var labels = window.Profile.ALLERGENS.filter(function (a) { return ids.indexOf(a.id) > -1; }).map(function (a) { return a.label; });
    box.innerHTML =
      '<p class="profile-label">' + ic("alert") + 'My allergies</p>' +
      '<p class="profile-text">' + (labels.length ? esc(labels.join(", ")) : "None set yet.") + "</p>" +
      '<div class="profile-actions"><button type="button" class="' + (labels.length ? "link" : "secondary small-btn") + '" id="allergy-edit">' + (labels.length ? "Edit" : "Set up") + "</button></div>";
    el("allergy-edit").addEventListener("click", startAllergies);
  }

  // ----- allergies editor -----
  function startAllergies() {
    allergyDraft = window.Profile.loadAllergies().slice();
    renderAllergyOptions();
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
  function saveAllergies() {
    window.Profile.saveAllergies(allergyDraft);
    renderAllergyCard();
    if (lastProduct && cameFrom !== "home-only") { renderResult(lastProduct); } else { show("home"); }
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
    if (lastProduct) { renderResult(lastProduct); } else { show("home"); }
  }

  function quizBack() {
    if (quiz.step === 0) { show(lastProduct ? "result" : "home"); return; }
    quiz.step--;
    renderQuiz();
  }

  // ----- result -----
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
    var html = '<p class="match-title">' + ic(icon) + esc(m.title) + "</p>";
    if (m.reasons.length) {
      html += '<ul class="match-list">' + m.reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
    }
    if (m.helps.length) {
      html += '<ul class="match-list helps">' + m.helps.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
    }
    if (!m.reasons.length && !m.helps.length) html += '<p class="match-text">Nothing here conflicts with your answers.</p>';
    box.innerHTML = html;
  }

  function renderAllergyBox(items) {
    var box = el("allergy-box");
    var ids = window.Profile.loadAllergies();
    if (!ids.length) { box.hidden = true; return; }
    var hits = window.Profile.allergyHits(items, ids);
    box.hidden = false;
    if (hits.length) {
      box.className = "match bad allergy-box";
      box.innerHTML = '<p class="match-title">' + ic("alert") + "Has something you're allergic to</p>" +
        '<ul class="match-list">' + hits.map(function (h) {
          return "<li><strong>" + esc(h.name) + "</strong> (" + esc(h.labels.join(", ")) + ")</li>";
        }).join("") + "</ul>";
    } else {
      box.className = "match good allergy-box";
      box.innerHTML = '<p class="match-title">' + ic("check") + "Nothing from your allergy list</p>" +
        '<p class="match-text">We only check the ingredients we can read, so look at the label if your allergy is serious.</p>';
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
    return '<li><details class="ing"><summary>' +
      '<span class="dot ' + i.level + '"></span>' +
      '<span class="ing-main"><span class="ing-name">' + esc(i.name) + '</span><span class="ing-note">' + esc(i.note) + "</span></span>" +
      '<span class="chev" aria-hidden="true"></span></summary>' +
      '<div class="ing-body"><p class="ing-detail">' + esc(i.detail) + "</p>" +
      ((chips || allergenChips) ? '<div class="risks">' + chips + allergenChips + "</div>" : "") + hints + helps +
      '<p class="ing-src">Look it up in: ' + links.join(" · ") + "</p></div></details></li>";
  }

  function renderResult(product) {
    lastProduct = product;
    var a = window.Ingredients.analyze(product.ingredientsText);
    var b = band(a.score);

    el("brand").textContent = product.brand;
    el("name").textContent = product.name;
    var photo = el("photo");
    if (product.image) {
      photo.src = product.image;
      photo.hidden = false;
      photo.onerror = function () { photo.hidden = true; };
    } else {
      photo.hidden = true;
    }

    var n = a.counts;
    var score = el("score");
    score.textContent = a.score === null ? "?" : a.score;
    score.className = "score " + b.cls;
    var verdict = el("verdict");
    verdict.innerHTML = ic(b.icon) + esc(b.label);
    verdict.className = "verdict " + b.cls;
    el("sub").textContent =
      a.score === null ? "We don't know enough of these ingredients yet" :
      n.bad > 0 ? plural(n.bad, "ingredient flagged", "ingredients flagged") :
      n.mid > 0 ? plural(n.mid, "ingredient to watch", "ingredients to watch") :
      "No flagged ingredients";

    el("counts").innerHTML =
      '<span class="pill good">' + ic("check") + n.good + " good</span>" +
      '<span class="pill mid">' + ic("eye") + n.mid + " to watch</span>" +
      '<span class="pill bad">' + ic("flag") + plural(n.bad, "flag", "flags") + "</span>";

    renderAlerts(product);
    renderAllergyBox(a.items);
    renderMatch(a.items);

    var order = { bad: 0, mid: 1, good: 2 };
    var rated = a.items
      .filter(function (i) { return i.level; })
      .map(function (i, idx) { return { i: i, idx: idx }; })
      .sort(function (x, y) { return order[x.i.level] - order[y.i.level] || x.idx - y.idx; })
      .map(function (x) { return x.i; });
    el("ingredients").innerHTML = rated.map(ingredientRow).join("");

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
    if (cameFrom === "results" && lastResults) show("results"); else goHome();
  }

  // ----- barcode lookup and scanner -----
  function lookupCode(raw) {
    var code = String(raw || "").replace(/\D/g, "");
    if (code.length < 8) {
      showStatus("That doesn't look like a barcode. Barcodes have 8 to 13 digits.");
      return;
    }
    showStatus("Looking up " + code + "…");
    window.OBF.lookup(code).then(function (p) {
      if (!p) {
        showStatus("We couldn't find " + code + " yet. You can search by name or take a photo of the ingredient list.", true);
      } else if (!p.ingredientsText) {
        showStatus(p.name + " is in the database but has no ingredient list yet. You can take a photo of the list on the package.", true);
      } else {
        cameFrom = "home";
        renderResult(p);
      }
    }).catch(function () {
      showStatus("Couldn't reach the product database. Check your connection and try again.");
    });
  }

  function stopScanner() {
    if (!scanner) return Promise.resolve();
    var s = scanner;
    scanner = null;
    return s.stop().then(function () { s.clear(); }).catch(function () {});
  }

  function startScanner() {
    if (!window.Html5Qrcode) {
      showStatus("The scanner couldn't load. Type the barcode number instead.");
      return;
    }
    show("scanner");
    var F = window.Html5QrcodeSupportedFormats;
    scanner = new window.Html5Qrcode("reader", {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      useBarCodeDetectorIfSupported: true,
      verbose: false
    });
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 140 } },
      function (text) {
        stopScanner().then(function () { lookupCode(text); });
      },
      function () {}
    ).catch(function () {
      scanner = null;
      showStatus("The camera isn't available. Allow camera access, or search by name or type the barcode instead.");
    });
  }

  // ----- search by name -----
  function runSearch(raw) {
    var q = String(raw || "").trim();
    if (q.length < 2) return;
    lastResults = null;
    cameFrom = "results";
    el("results-title").textContent = "Searching…";
    el("results-sub").textContent = "";
    el("results-list").innerHTML = "";
    show("results");
    window.OBF.search(q).then(function (r) {
      lastResults = r.products;
      el("results-title").textContent = r.products.length ? "Results for “" + q + "”" : "No results for “" + q + "”";
      var hidden = r.withoutIngredients;
      el("results-sub").textContent = r.products.length
        ? (hidden > 0 ? plural(hidden, "more product", "more products") + " found without an ingredient list, so we can't rate " + (hidden === 1 ? "it" : "them") + "." : "Tap a product to see what's in it.")
        : (hidden > 0 ? "We found " + plural(hidden, "product", "products") + " but none has an ingredient list yet." : "Try fewer words, like the brand and one product word.");
      el("results-list").innerHTML = r.products.map(function (p, idx) {
        return '<button type="button" class="result-item" data-i="' + idx + '">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '<span class="result-ph">' + ic("droplet") + "</span>") +
          '<span class="result-text"><span class="result-brand">' + esc(p.brand) + '</span><span class="result-name">' + esc(p.name) + "</span></span>" +
          ic("chevron-right", "chev-ic") + "</button>";
      }).join("") + (r.products.length ? "" :
        '<div class="status-actions"><button type="button" class="primary small" id="results-photo">' + ic("camera") + "Photo of ingredients</button></div>");
      Array.prototype.forEach.call(el("results-list").querySelectorAll(".result-item"), function (b) {
        b.addEventListener("click", function () {
          cameFrom = "results";
          renderResult(lastResults[Number(b.getAttribute("data-i"))]);
        });
      });
      var rp = el("results-photo");
      if (rp) rp.addEventListener("click", startPhoto);
    }).catch(function () {
      el("results-title").textContent = "Couldn't search";
      el("results-sub").textContent = "Check your connection and try again.";
    });
  }

  // ----- photo of the ingredient list -----
  function startPhoto() {
    el("photo-input").value = "";
    el("photo-input").click();
  }

  function showOcrForm(text, hint) {
    el("ocr-progress").hidden = true;
    el("ocr-form").hidden = false;
    el("ocr-text").value = text || "";
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
    renderResult({ brand: "", name: el("ocr-name").value.trim() || "Photographed product", image: "", ingredientsText: text });
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
    ["lock", "Your data", "Nothing is uploaded. Your skin answers and allergies stay on your device, and there are no accounts."]
  ];
  function renderAbout() {
    el("about-body").innerHTML = ABOUT.map(function (a) {
      return '<div class="about-item"><p class="about-title">' + ic(a[0]) + esc(a[1]) + "</p><p>" + esc(a[2]) + "</p></div>";
    }).join("");
  }

  function goHome() {
    lastProduct = null;
    el("q").value = "";
    el("manual").hidden = true;
    stopScanner().then(function () { renderGreeting(false); renderProfileCard(); renderAllergyCard(); show("home"); });
  }

  el("scan-btn").addEventListener("click", startScanner);
  el("search-form").addEventListener("submit", function (e) { e.preventDefault(); runSearch(el("q").value); });
  el("photo-btn").addEventListener("click", startPhoto);
  el("status-photo").addEventListener("click", startPhoto);
  el("manual-btn").addEventListener("click", function () {
    var f = el("manual");
    f.hidden = !f.hidden;
    if (!f.hidden) el("code").focus();
  });
  el("photo-input").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (f) runOcr(f);
  });
  el("ocr-go").addEventListener("click", analyzePhoto);
  el("ocr-cancel").addEventListener("click", goHome);
  el("scan-cancel").addEventListener("click", goHome);
  el("status-back").addEventListener("click", goHome);
  el("back").addEventListener("click", backFromResult);
  el("results-back").addEventListener("click", goHome);
  el("logo").addEventListener("click", goHome);
  el("quiz-next").addEventListener("click", quizNext);
  el("quiz-back").addEventListener("click", quizBack);
  el("allergy-save").addEventListener("click", saveAllergies);
  el("allergy-cancel").addEventListener("click", function () { if (lastProduct) show("result"); else show("home"); });
  el("about-btn").addEventListener("click", function () { renderAbout(); show("about"); });
  el("disclaimer-about").addEventListener("click", function () { renderAbout(); show("about"); });
  el("about-back").addEventListener("click", function () { if (lastProduct) show("result"); else show("home"); });
  el("manual").addEventListener("submit", function (e) {
    e.preventDefault();
    lookupCode(el("code").value);
  });

  renderGreeting(false);
  renderProfileCard();
  renderAllergyCard();
  show("home");
})();
