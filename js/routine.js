// Your routine: which product goes in which step, and when to use it (morning, night or either).
// Everything is guessed from the product NAME and its ingredients, so it is a helper, not a rule: the package always wins.
// The routine itself is saved only on this phone (localStorage skinsafe.routine).
(function () {
  var KEY = "skinsafe.routine";

  // Step kinds. "when" is where each kind is usually used.
  var KINDS = {
    cleanser:    { label: "Cleanser",           hint: "Washes the face" },
    toner:       { label: "Toner",              hint: "Preps the skin after cleansing" },
    serum:       { label: "Serum or essence",   hint: "Targets one concern" },
    treatment:   { label: "Treatment",          hint: "Acids, retinol, spot care" },
    eye:         { label: "Eye cream",          hint: "For the eye area" },
    moisturizer: { label: "Moisturizer",        hint: "Locks in water" },
    sunscreen:   { label: "Sunscreen",          hint: "Always the last step in the morning" },
    mask:        { label: "Mask",               hint: "A few times a week" }
  };
  var ORDER = ["cleanser", "toner", "serum", "treatment", "eye", "moisturizer", "sunscreen", "mask"];
  var DEFAULT_STEPS = {
    am: ["cleanser", "toner", "moisturizer", "sunscreen"],
    pm: ["cleanser", "toner", "serum", "moisturizer"]
  };

  var NOT_FACE = /(hair|shampoo|conditioner|scalp|body|hand cream|hand |foot|lip |lips|nail|deodorant|bath|shower|soap bar|mascara|lash|brow|foundation|concealer|blush|lipstick|eyeliner|powder pact|cushion|perfume|toothpaste|razor|shav|wax)/i;
  // Brands that only make hair products in our list.
  var HAIR_BRANDS = /^(&honey|k[eé]rastase|narka|revlon|biolage|growus|texture id|herbatint|beyond the zone|mise en sc[eè]ne|k18|head & shoulders|plu|daeng gi meo ri|l'or[eé]al paris elvive|ion|paul mitchell|joico|chi|olaplex|matrix|redken|wella|unove|dr\.forhair|pantene|monday haircare|bondbar|mielle|it's a 10|silk elements|biotera|eva nyc|generic value products|clear men|moroccanoil|amika|living proof|ghd)$/i;
  function classify(p) {
    var name = p.name.toLowerCase();
    if (HAIR_BRANDS.test((p.brand || "").trim())) return null;
    if (/(curling|cuticle|no wash|styling|smoothing gel-oil|leave-in|blow dry)/.test(name)) return null;
    if (NOT_FACE.test(name) && !/(face|facial)/.test(name)) return null;
    if (/treatment/.test(name) && !/(spot|acne|blemish|face|facial|eye|peel)/.test(name)) return null;
    name = name.replace(/hyaluronic acid/g, "hyaluronic");
    if (/(\bspf\b|\bfps\b|sun ?stick|sunscreen|sun ?block|sun (cream|stick|serum|gel|milk|fluid|essence|lotion|screen)|relief sun|uv (shield|defense|protect|aqua|milk|essence|gel|filter)|\bsun\b)/.test(name)) return "sunscreen";
    if (/\beye\b|eyes\b/.test(name) && !/(makeup|remover)/.test(name)) return "eye";
    if (/(cleans|face ?wash|facial wash|micelar|agua micelar|\bwash\b|foam\b|micellar|makeup remover|make-up remover|\bremover\b|\bsoap\b|exfoliating gel|peeling gel)/.test(name) && !/(mask|serum)/.test(name)) return "cleanser";
    if (/(sleeping mask|mask|\bpack\b|clay|wash-off)/.test(name)) return "mask";
    if (/(retinol|retinal|retinoid|adapalene|\bpeel|exfoliat|\bacid\b|\baha\b|\bbha\b|\bpha\b|pimple|acne|blemish|spot (treatment|care|gel)|patch|\bpore\b.*(treatment|serum)|brightening shot)/.test(name)) return "treatment";
    if (/(toner|toning|astringent|\bmist\b|\bpad\b|\bpads\b|softener|facial water|skin lotion|prep|essence toner)/.test(name)) return "toner";
    if (/(serum|ampoule|essence|booster|concentrate|\boil\b|elixir|\bshot\b)/.test(name)) return "serum";
    if (/(\d+ ?%|niacinamide|peptide|collagen)/.test(name)) return "serum";
    if (/(cream|moistur|lotion|emulsion|balm|hydrat|barrier|gel\b|ceramide|repair|water bank|aqua bomb|barrier)/.test(name)) return "moisturizer";
    return null;
  }

  // When is it best used? Looks at the kind, the name and the first 12 ingredients (the biggest ones).
  // Returns {when: "am" | "pm" | "any", why: "..."}.
  function when(p, kind, items) {
    var name = (p.name || "").toLowerCase();
    var top = (items || []).slice(0, 12).map(function (i) { return i.name.toLowerCase(); }).join(" | ");
    if (kind === "sunscreen") return { when: "am", why: "Sunscreen is for the day. You don't need it at night." };
    if (/(retinol|retinal|retinoid|adapalene|tretinoin|retinyl)/.test(name + " " + top)) return { when: "pm", why: "Retinoids make skin more sensitive to sun, so they go at night." };
    if (/(\bpeel|exfoliat|\baha\b|\bbha\b|\bpha\b|glycolic|lactic acid|mandelic|salicylic)/.test(name + " " + top)) return { when: "pm", why: "Exfoliating acids are usually used at night, with sunscreen the next morning." };
    if (/(ascorbic|vitamin c|ascorbyl)/.test(name + " " + top) && kind === "serum") return { when: "am", why: "Vitamin C works well under sunscreen in the morning." };
    if (/sleeping/.test(name)) return { when: "pm", why: "A sleeping mask is meant to be left on overnight." };
    if (kind === "mask") return { when: "pm", why: "Masks are usually done in the evening, a few times a week." };
    return { when: "any", why: "Fine in the morning or at night." };
  }

  function load() {
    var HD = (window.Hair && window.Hair.DEFAULT_STEPS) || { hw: ["shampoo", "conditioner", "hmask"], hs: ["leavein", "heat", "hoil"] };
    function mk(list) { return list.map(function (k) { return { kind: k, product: null }; }); }
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || "null");
      if (r && r.am && r.pm) { r.hw = r.hw || mk(HD.hw); r.hs = r.hs || mk(HD.hs); return r; }
    } catch (e) {}
    return { hw: mk(HD.hw), hs: mk(HD.hs), am: DEFAULT_STEPS.am.map(function (k) { return { kind: k, product: null }; }), pm: DEFAULT_STEPS.pm.map(function (k) { return { kind: k, product: null }; }) };
  }
  function save(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {} }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // Oral hygiene (toothpaste, mouthwash): its own group, apart from skin and hair. It has no routine steps and no skin or hair quiz.
  var ORAL_KINDS = { oral: { label: "Oral hygiene", hint: "Toothpaste and mouthwash" } };
  var ORAL_BRAND = /^(colgate|crest|sensodyne|listerine|oral-b|parodontax|meridol|elmex|therabreath|marvis|curaprox|pepsodent|close-?up|arm & hammer|hello|tom's of maine)$/i;
  var ORAL_WORD = /(toothpaste|tooth paste|dentifrice|pasta dental|pasta de dientes|crema dental|gel dental|mouthwash|mouth rinse|oral rinse|enjuague bucal|enjuague|oral care|\bplax\b|gum (care|protection|detoxify|therapy)|enamel|whitening mint)/i;
  var NOT_ORAL = /(deodorant|desodorante|shampoo|body|soap|jab[oó]n|lotion|cream for|hand)/i;
  function classifyOral(p) {
    var name = (p.name || "").toLowerCase();
    if (NOT_ORAL.test(name) && !/(toothpaste|mouthwash|enjuague bucal|pasta dental)/.test(name)) return null;
    if (ORAL_BRAND.test((p.brand || "").trim()) || ORAL_WORD.test(name)) return "oral";
    return null;
  }
  Object.keys(ORAL_KINDS).forEach(function (k) { KINDS[k] = ORAL_KINDS[k]; });
  window.Oral = { KINDS: ORAL_KINDS, ORDER: ["oral"], classify: classifyOral };

  window.Routine = { KINDS: KINDS, ORDER: ORDER, DEFAULT_STEPS: DEFAULT_STEPS, classify: classify, when: when, load: load, save: save, reset: reset };
})();
