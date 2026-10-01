// Skin profile: 4-question quiz, saved only on this device (localStorage), and the "skin match" rules.
(function () {
  var KEY = "skinsafe.profile";

  var QUESTIONS = [
    { id: "type", title: "What's your skin type?", multi: false, options: [
      ["normal", "Normal", "Barely visible pores, looks hydrated"],
      ["dry", "Dry", "Feels tight, may flake"],
      ["oily", "Oily", "Shiny, with larger pores"],
      ["combination", "Combination", "Oily T-zone, dry or normal cheeks"]
    ] },
    { id: "concerns", title: "What do you want to improve?", sub: "Pick all that apply.", multi: true, options: [
      ["acne", "Acne and breakouts", ""],
      ["redness", "Redness and sensitivity", ""],
      ["dryness", "Dryness", ""],
      ["pigmentation", "Dark spots and uneven tone", ""],
      ["lines", "Fine lines", ""]
    ] },
    { id: "reacts", title: "Does your skin react to fragrance or sting easily?", multi: false, options: [
      ["yes", "Yes", ""], ["no", "No", ""], ["unsure", "Not sure", ""]
    ] },
    { id: "pregnant", title: "Are you pregnant or breastfeeding?", sub: "Optional. Some ingredients need a doctor's OK.", multi: false, options: [
      ["yes", "Yes", ""], ["no", "No", ""], ["skip", "Prefer not to say", ""]
    ] }
  ];

  var LABEL = {
    type: { normal: "Normal skin", dry: "Dry skin", oily: "Oily skin", combination: "Combination skin" },
    concerns: { acne: "acne", redness: "redness", dryness: "dryness", pigmentation: "dark spots", lines: "fine lines" }
  };

  function load() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || "null");
      return p && p.type ? p : null;
    } catch (e) { return null; }
  }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function summary(p) {
    var parts = [LABEL.type[p.type]];
    (p.concerns || []).forEach(function (c) { parts.push(LABEL.concerns[c]); });
    return parts.join(" · ");
  }

  // Which risks matter for this person, and why.
  function avoid(p) {
    var a = {};
    var concerns = p.concerns || [];
    if (p.reacts === "yes" || concerns.indexOf("redness") > -1) {
      a.irritation = "your skin is sensitive or reacts easily";
      a.allergy = "your skin is sensitive or reacts easily";
    }
    if (p.type === "oily" || concerns.indexOf("acne") > -1) a.comedogenic = "your skin is oily or acne-prone";
    if (p.type === "dry" || concerns.indexOf("dryness") > -1) a.drying = "your skin is dry";
    if (p.pregnant === "yes") a.pregnancy = "you're pregnant or breastfeeding, so ask your doctor first";
    return a;
  }

  // Only ingredients that are not already rated "good" can count against a product.
  function match(items, p) {
    var av = avoid(p);
    var reasons = [];
    var pregnancy = false;
    items.forEach(function (i) {
      if (!i.level || i.level === "good") return;
      for (var k = 0; k < i.risks.length; k++) {
        var why = av[i.risks[k]];
        if (why) {
          reasons.push(i.name + ": " + why);
          if (i.risks[k] === "pregnancy") pregnancy = true;
          break;
        }
      }
    });

    var helps = {};
    var wanted = (p.concerns || []).slice();
    items.forEach(function (i) {
      if (i.level === "bad") return;
      i.helps.forEach(function (h) {
        if (wanted.indexOf(h) > -1) {
          helps[h] = helps[h] || [];
          if (helps[h].indexOf(i.name) < 0) helps[h].push(i.name);
        }
      });
    });
    var helpLines = Object.keys(helps).map(function (h) {
      return "Helps with " + LABEL.concerns[h] + ": " + helps[h].join(", ");
    });

    var level = pregnancy || reasons.length >= 3 ? "bad" : reasons.length > 0 ? "mid" : "good";
    var title = { good: "Good match for your skin", mid: "Possible match", bad: "Not a match for you" }[level];
    return { level: level, title: title, reasons: reasons, helps: helpLines };
  }

  window.Profile = { QUESTIONS: QUESTIONS, load: load, save: save, clear: clear, summary: summary, match: match };
})();
