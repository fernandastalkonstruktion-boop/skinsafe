(function () {
  var VIEWS = ["home", "quiz", "scanner", "status", "result"];
  var scanner = null;
  var lastProduct = null;
  var quiz = { step: 0, answers: {} };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function show(view) {
    VIEWS.forEach(function (v) { el(v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }
  function showStatus(text) {
    el("status-text").textContent = text;
    show("status");
  }

  // Score bands: 76-100 excellent, 51-75 good, 26-50 not great, 0-25 bad.
  function band(score) {
    if (score === null) return { cls: "none", label: "Not enough data" };
    if (score >= 76) return { cls: "good", label: "Excellent" };
    if (score >= 51) return { cls: "good", label: "Good" };
    if (score >= 26) return { cls: "mid", label: "Not great" };
    return { cls: "bad", label: "Bad" };
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // ----- home / profile card -----
  function renderProfileCard() {
    var p = window.Profile.load();
    var box = el("profile-card");
    if (p) {
      box.innerHTML =
        '<p class="profile-label">Your skin</p>' +
        '<p class="profile-text">' + esc(window.Profile.summary(p)) + "</p>" +
        '<div class="profile-actions"><button type="button" class="link" id="profile-edit">Edit</button>' +
        '<button type="button" class="link" id="profile-clear">Remove</button></div>';
      el("profile-edit").addEventListener("click", function () { startQuiz(p); });
      el("profile-clear").addEventListener("click", function () { window.Profile.clear(); renderProfileCard(); });
    } else {
      box.innerHTML =
        '<p class="profile-label">Personal match</p>' +
        '<p class="profile-text">Answer 4 quick questions to see if each product suits your skin.</p>' +
        '<div class="profile-actions"><button type="button" class="secondary" id="profile-start">Take the skin quiz</button></div>';
      el("profile-start").addEventListener("click", function () { startQuiz(null); });
    }
  }

  // ----- quiz -----
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
    el("quiz-next").textContent = quiz.step === qs.length - 1 ? "See my profile" : "Next";
    el("quiz-back").textContent = quiz.step === 0 ? "Cancel" : "Back";

    var current = quiz.answers[q.id];
    var selected = q.multi ? (current || []) : (current ? [current] : []);
    el("quiz-options").innerHTML = q.options.map(function (o) {
      var on = selected.indexOf(o[0]) > -1;
      return '<button type="button" class="option" data-v="' + o[0] + '" aria-pressed="' + on + '">' +
        '<span class="option-name">' + esc(o[1]) + "</span>" +
        (o[2] ? '<span class="option-sub">' + esc(o[2]) + "</span>" : "") + "</button>";
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
    if (quiz.step === 0) { show(lastProduct && !el("result").hidden ? "result" : "home"); return; }
    quiz.step--;
    renderQuiz();
  }

  // ----- result -----
  function renderMatch(items) {
    var box = el("match");
    var p = window.Profile.load();
    if (!p) {
      box.hidden = false;
      box.className = "match prompt";
      box.innerHTML = '<p class="match-title">Does this suit your skin?</p>' +
        '<p class="match-text">Take the 4-question skin quiz to get a personal match.</p>' +
        '<button type="button" class="secondary" id="match-quiz">Take the skin quiz</button>';
      el("match-quiz").addEventListener("click", function () { startQuiz(null); });
      return;
    }
    var m = window.Profile.match(items, p);
    box.hidden = false;
    box.className = "match " + m.level;
    var html = '<p class="match-title">' + esc(m.title) + "</p>";
    if (m.reasons.length) {
      html += '<ul class="match-list">' + m.reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
    }
    if (m.helps.length) {
      html += '<ul class="match-list helps">' + m.helps.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
    }
    if (!m.reasons.length && !m.helps.length) html += '<p class="match-text">Nothing in this list conflicts with your answers.</p>';
    box.innerHTML = html;
  }

  var ALERT_LABEL = { recall: "Official recall or alert", litigation: "Lawsuits, not proven" };
  function renderAlerts(product) {
    var box = el("alerts");
    var found = window.Alerts ? window.Alerts.match(product) : [];
    box.hidden = found.length === 0;
    box.innerHTML = found.map(function (a) {
      var links = a.sources.map(function (s) {
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + "</a>";
      }).join(" \u00b7 ");
      return '<div class="alert ' + a.kind + '"><p class="alert-kind">' + esc(ALERT_LABEL[a.kind]) + (a.kind === "recall" ? " \u00b7 " + esc(a.date) : "") + "</p>" +
        '<p class="alert-title">' + esc(a.title) + "</p>" +
        '<p class="alert-text">' + esc(a.text) + "</p>" +
        (a.why ? '<p class="alert-why">' + esc(a.why) + "</p>" : "") +
        '<p class="alert-src">' + links + "</p></div>";
    }).join("");
  }

  function ingredientRow(i) {
    var labels = window.Ingredients.RISK_LABEL;
    var chips = i.risks.map(function (r) { return '<span class="risk">' + esc(labels[r]) + "</span>"; }).join("");
    var helps = i.helps.length ? '<p class="ing-helps">Often used for: ' + esc(i.helps.join(", ")) + "</p>" : "";
    var links = i.src.map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + "</a>";
    });
    // Peer-reviewed research (universities, hospitals) from PubMed, review articles only.
    var term = i.name.replace(/\([^)]*\)/g, " ").replace(/[^\w\s,\/.-]/g, " ").replace(/\s+/g, " ").trim();
    if (term) {
      var url = "https://pubmed.ncbi.nlm.nih.gov/?term=" + encodeURIComponent(term + " AND skin AND review[pt]");
      links.push('<a href="' + esc(url) + '" target="_blank" rel="noopener">Research reviews (PubMed)</a>');
    }
    var src = links.join(" · ");
    return '<li><details class="ing"><summary>' +
      '<span class="dot ' + i.level + '"></span>' +
      '<span class="ing-main"><span class="ing-name">' + esc(i.name) + '</span><span class="ing-note">' + esc(i.note) + "</span></span>" +
      '<span class="chev" aria-hidden="true"></span></summary>' +
      '<div class="ing-body"><p class="ing-detail">' + esc(i.detail) + "</p>" +
      (chips ? '<div class="risks">' + chips + "</div>" : "") + helps +
      '<p class="ing-src">Look it up in: ' + src + "</p></div></details></li>";
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
    verdict.textContent = b.label;
    verdict.className = "verdict " + b.cls;
    el("sub").textContent =
      a.score === null ? "We don't know enough of these ingredients yet" :
      n.bad > 0 ? plural(n.bad, "ingredient flagged", "ingredients flagged") :
      n.mid > 0 ? plural(n.mid, "ingredient to watch", "ingredients to watch") :
      "No flagged ingredients";

    el("counts").innerHTML =
      '<span class="pill good">' + n.good + " good</span>" +
      '<span class="pill mid">' + n.mid + " to watch</span>" +
      '<span class="pill bad">' + plural(n.bad, "flag", "flags") + "</span>";

    renderAlerts(product);
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

  // ----- lookup and scanner -----
  function lookupCode(raw) {
    var code = String(raw || "").replace(/\D/g, "");
    if (code.length < 8) {
      showStatus("That doesn't look like a barcode. Barcodes have 8 to 13 digits.");
      return;
    }
    showStatus("Looking up " + code + "…");
    window.OBF.lookup(code).then(function (p) {
      if (!p) {
        showStatus("We couldn't find " + code + " in Open Beauty Facts yet. Adding a product with a photo of its ingredients is coming soon.");
      } else if (!p.ingredientsText) {
        showStatus(p.name + " is in the database but has no ingredient list yet.");
      } else {
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
      showStatus("The camera isn't available. Allow camera access, or type the barcode number instead.");
    });
  }

  function goHome() {
    lastProduct = null;
    stopScanner().then(function () { renderProfileCard(); show("home"); });
  }

  function renderChips() {
    el("chips").innerHTML = "";
    window.SAMPLE_PRODUCTS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = p.chip;
      b.addEventListener("click", function () { renderResult(p); });
      el("chips").appendChild(b);
    });
  }

  el("scan-btn").addEventListener("click", startScanner);
  el("scan-cancel").addEventListener("click", goHome);
  el("status-back").addEventListener("click", goHome);
  el("back").addEventListener("click", goHome);
  el("logo").addEventListener("click", goHome);
  el("quiz-next").addEventListener("click", quizNext);
  el("quiz-back").addEventListener("click", quizBack);
  el("manual").addEventListener("submit", function (e) {
    e.preventDefault();
    lookupCode(el("code").value);
  });

  renderChips();
  renderProfileCard();
  show("home");
})();
