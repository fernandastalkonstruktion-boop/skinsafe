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

  // ----- allergies (what the person already knows bothers them) -----
  var AKEY = "skinsafe.allergies";
  function re(r) { return function (item) { return r.test((item.inci || item.name).toLowerCase()); }; }
  var ALLERGENS = [
    { id: "fragrance", label: "Fragrance", sub: "Parfum and fragrance allergens", test: function (i) { return i.family === "fragrance"; } },
    { id: "nuts", label: "Tree nuts", sub: "Almond, argan, macadamia, shea", test: re(/(prunus amygdalus|argania spinosa|macadamia|corylus|juglans|pistacia|anacardium|bertholletia|butyrospermum|shea|apricot kernel|prunus armeniaca)/) },
    { id: "peanut", label: "Peanut", sub: "Peanut oil", test: re(/(arachis|peanut)/) },
    { id: "sesame", label: "Sesame", sub: "Sesame oil", test: re(/(sesamum|sesame)/) },
    { id: "wheat", label: "Wheat or gluten", sub: "Hydrolyzed wheat protein, barley", test: re(/(triticum|wheat|gluten|hordeum|barley|secale)/) },
    { id: "soy", label: "Soy", sub: "Soybean oil and extracts", test: re(/(glycine soja|soy)/) },
    { id: "bee", label: "Bee products", sub: "Beeswax, propolis, honey", test: re(/(cera alba|cera flava|beeswax|propolis|(^|[^a-z])mel([^a-z]|$)|honey|royal jelly|(^|[^a-z])apis)/) },
    { id: "lanolin", label: "Lanolin (wool)", sub: "Lanolin and wool alcohols", test: re(/(lanolin|adeps lanae|wool)/) },
    { id: "coconut", label: "Coconut", sub: "Coconut oil and extracts", test: re(/(cocos nucifera|coconut)/) },
    { id: "essential", label: "Essential oils", sub: "Citrus, lavender, tea tree, mint", test: re(/(citrus [a-z ]*(oil)|lavandula|melaleuca|tea tree|eucalyptus|mentha|peppermint|pelargonium|cananga|rosa damascena|leptospermum|anthemis nobilis flower oil|rosmarinus officinalis leaf oil)/) },
    { id: "preservatives", label: "Preservatives", sub: "Formaldehyde releasers, isothiazolinones, parabens", test: re(/(isothiazolinone|dmdm|quaternium-15|imidazolidinyl|diazolidinyl|bronopol|2-bromo-2-nitropropane|hydroxymethylglycinate|paraben|iodopropynyl|formaldehyde)/) },
    { id: "carmine", label: "Insect dye (carmine)", sub: "Carmine, cochineal, CI 75470", test: re(/(carmine|cochineal|ci 75470|carminic)/) },
    { id: "sulfites", label: "Sulfites", sub: "Sodium metabisulfite", test: re(/(sulfite|metabisulfite)/) },
    { id: "milk", label: "Milk or casein", sub: "Casein, whey, milk protein, lactoferrin", test: re(/(casein|(^|[^a-z])whey|milk|lactoferrin|lactalbumin|lactoglobulin|(^|[^a-z])lac([^a-z]|$)|lactis)/) },
    { id: "egg", label: "Egg", sub: "Egg white, yolk, lysozyme", test: re(/(ovum|(^|[^a-z])egg|albumen|ovalbumin|lysozyme|ovo)/) },
    { id: "fish", label: "Fish", sub: "Fish collagen, marine collagen, roe", test: re(/(fish|salmon|piscis|marine collagen|caviar|(^|[^a-z])roe([^a-z]|$))/) },
    { id: "shellfish", label: "Shellfish", sub: "Chitosan, glucosamine, crab and shrimp extracts", test: re(/(chitosan|chitin|glucosamine|crustacea|shrimp|crab|lobster|oyster|mussel|shell)/) },
    { id: "strawberry", label: "Strawberry", sub: "Strawberry fruit and seed extracts", test: re(/(fragaria|strawberry)/) },
    { id: "tomato", label: "Tomato", sub: "Tomato extracts, lycopene", test: re(/(solanum lycopersicum|lycopersicon|tomato|lycopene)/) },
    { id: "daisy", label: "Daisy-family plants", sub: "Chamomile, calendula, arnica, sunflower, echinacea", test: re(/(chamomilla|matricaria|anthemis|chamaemelum|calendula|arnica|echinacea|helianthus|bellis perennis|achillea|tanacetum|cosmos)/) }
  ];

  // Words the person adds themselves (stored only on this phone). An ingredient matches if its name contains the word.
  var WKEY = "skinsafe.words";
  function loadWords() {
    try {
      var w = JSON.parse(localStorage.getItem(WKEY) || "[]");
      return Array.isArray(w) ? w.filter(function (x) { return typeof x === "string" && x.trim(); }).slice(0, 40) : [];
    } catch (e) { return []; }
  }
  function saveWords(list) { try { localStorage.setItem(WKEY, JSON.stringify(list.slice(0, 40))); } catch (e) {} }

  function loadAllergies() {
    try {
      var a = JSON.parse(localStorage.getItem(AKEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveAllergies(ids) { try { localStorage.setItem(AKEY, JSON.stringify(ids)); } catch (e) {} }

  // Every allergy category an ingredient belongs to (used for the chips on each ingredient).
  function allergenLabels(item) {
    return ALLERGENS.filter(function (a) { return a.test(item); }).map(function (a) { return a.label; });
  }
  // Ingredients in a product that hit the categories the person picked, or their own words.
  function allergyHits(items, ids, words) {
    var hits = [];
    words = words || [];
    items.forEach(function (item) {
      var labels = ALLERGENS.filter(function (a) { return ids.indexOf(a.id) > -1 && a.test(item); }).map(function (a) { return a.label; });
      var lower = item.name.toLowerCase();
      words.forEach(function (w) { if (lower.indexOf(w.toLowerCase()) > -1) labels.push("your word: " + w); });
      if (labels.length) hits.push({ name: item.name, labels: labels });
    });
    return hits;
  }

  window.Profile = { loadWords: loadWords, saveWords: saveWords, ALLERGENS: ALLERGENS, loadAllergies: loadAllergies, saveAllergies: saveAllergies, allergenLabels: allergenLabels, allergyHits: allergyHits, QUESTIONS: QUESTIONS, load: load, save: save, clear: clear, summary: summary, match: match };
})();
