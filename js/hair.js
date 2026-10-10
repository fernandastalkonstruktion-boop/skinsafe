// Hair profile: a 5-question quiz (with tips to find out your hair type), saved only on this device (localStorage),
// plus what kind of hair product something is and whether it suits that hair. It is guidance, not a diagnosis.
(function () {
  var KEY = "skinsafe.hair";

  var QUESTIONS = [
    { id: "pattern", title: "What's your hair pattern?", sub: "Tip: wash it with no product and let it air-dry. What shape does it take?", multi: false, options: [
      ["straight", "Straight", "Falls flat, no bends"],
      ["wavy", "Wavy", "Loose S-shaped bends"],
      ["curly", "Curly", "Defined spirals or ringlets"],
      ["coily", "Coily", "Tight coils or a zig-zag"]
    ] },
    { id: "thickness", title: "How thick is each strand?", sub: "Tip: hold one single hair between your fingers.", multi: false, options: [
      ["fine", "Fine", "You barely feel it"],
      ["medium", "Medium", "You can feel it"],
      ["thick", "Thick", "Feels wiry or coarse"]
    ] },
    { id: "scalp", title: "How is your scalp?", sub: "Tip: look at it two days after washing.", multi: false, options: [
      ["oily", "Oily", "Greasy by the second day"],
      ["normal", "Normal", "Clean, comfortable"],
      ["dry", "Dry or flaky", "Tight, itchy or white flakes"],
      ["sensitive", "Sensitive", "Stings or turns red with products"]
    ] },
    { id: "state", title: "What has your hair been through?", sub: "Pick all that apply.", multi: true, options: [
      ["colored", "Colored or bleached", ""],
      ["heat", "Heat tools", "Blow dryer, flat iron or curling iron"],
      ["damaged", "Dry, frizzy or damaged", ""]
    ] },
    { id: "goals", title: "What do you want from your hair?", sub: "Pick all that apply.", multi: true, options: [
      ["volume", "More volume", ""],
      ["frizz", "Less frizz", ""],
      ["moisture", "More moisture", ""],
      ["shine", "More shine", ""],
      ["loss", "Less hair fall", ""]
    ] }
  ];

  var LABEL = {
    pattern: { straight: "Straight", wavy: "Wavy", curly: "Curly", coily: "Coily" },
    thickness: { fine: "fine", medium: "medium", thick: "thick" },
    scalp: { oily: "oily scalp", normal: "normal scalp", dry: "dry scalp", sensitive: "sensitive scalp" },
    state: { colored: "colored", heat: "heat-styled", damaged: "damaged" },
    goals: { volume: "volume", frizz: "less frizz", moisture: "moisture", shine: "shine", loss: "less hair fall" }
  };

  function load() {
    try {
      var h = JSON.parse(localStorage.getItem(KEY) || "null");
      return h && h.pattern ? h : null;
    } catch (e) { return null; }
  }
  function save(h) { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function summary(h) {
    var parts = [LABEL.pattern[h.pattern] + " hair", LABEL.thickness[h.thickness], LABEL.scalp[h.scalp]];
    (h.state || []).forEach(function (s) { parts.push(LABEL.state[s]); });
    return parts.filter(Boolean).join(" · ");
  }

  // Hair steps. "tip" is shown on the routine so the step makes sense.
  var KINDS = {
    shampoo:     { label: "Shampoo",             hint: "Cleans the scalp", tip: "Massage it into the scalp, not the lengths, and rinse well." },
    conditioner: { label: "Conditioner",         hint: "Softens the lengths", tip: "Use it from mid-lengths to ends, after shampoo." },
    hmask:       { label: "Hair mask",           hint: "Deep care, once or twice a week", tip: "Once or twice a week, instead of conditioner." },
    leavein:     { label: "Leave-in",            hint: "Stays in the hair", tip: "On damp hair, after washing. You don't rinse it." },
    heat:        { label: "Heat protectant",     hint: "Before any heat tool", tip: "Spray on dry or damp hair before blow dryer, flat iron or curling iron." },
    hoil:        { label: "Hair oil or serum",   hint: "Finishing touch", tip: "A few drops on the ends, on dry or damp hair." },
    scalp:       { label: "Scalp treatment",     hint: "Targets the scalp", tip: "Apply on the scalp, as the package says." }
  };
  var ORDER = ["shampoo", "conditioner", "hmask", "leavein", "heat", "hoil", "scalp"];
  var DEFAULT_STEPS = { hw: ["shampoo", "conditioner", "hmask"], hs: ["leavein", "heat", "hoil"] };

  // Which products are hair products, and which step each one is for. Guessed from brand and name.
  var HAIR_BRAND = /^(&honey|k[eé]rastase|narka|revlon|biolage|growus|texture id|herbatint|beyond the zone|mise en sc[eè]ne|k18|head & shoulders|plu|daeng gi meo ri|l'or[eé]al paris elvive|ion|paul mitchell|joico|chi|olaplex|matrix|redken|wella|unove|dr\.forhair|pantene|monday haircare|bondbar|mielle|it's a 10|silk elements|biotera|eva nyc|generic value products|clear men|moroccanoil|amika|living proof|ghd)$/i;
  var HAIR_WORD = /(shampoo|champ[uú]|shampooing|conditioner|acondicionador|\bhair\b|scalp|cabello|\bpelo\b|capilar|leave-in|leave in|heat protect|curl|frizz|bond repair|everpure|elvive|\bmask\b.*(hair|cabello)|\bmasque\b)/i;
  var NOT_HAIR = /(\bbody\b|hand cream|\bfoot\b|\blips?\b|\bface\b|\bfacial\b|\beyes?\b|sunscreen|\bspf\b|cleanser|toner|moisturizer|serum.*(face|skin)|mascara|\blash\b|\bbrow\b|\bnail|deodorant|toothpaste)/i;

  function isHair(p) {
    var name = (p.name || "").toLowerCase();
    if (HAIR_BRAND.test((p.brand || "").trim())) return !/(body wash|body lotion|hand cream|deodorant|\bface\b|\bfacial\b|\blash\b|\bbrow\b)/.test(name);
    return HAIR_WORD.test(name) && !NOT_HAIR.test(name.replace(/hair( |-)?care/g, "hair"));
  }
  // A product can carry a fixed `kind` in catalog.json (set from tools/catalog/kind_overrides.json); when it does, it wins over the name rules below.
  function classify(p) {
    if (p.kind) return KINDS[p.kind] ? p.kind : null;
    if (!isHair(p)) return null;
    var n = (p.name || "").toLowerCase();
    if (/(dry shampoo|champ[uú] seco)/.test(n)) return null;
    if (/(heat protect|thermal|t[eé]rmic|blow ?dry|protector de calor)/.test(n)) return "heat";
    if (/(pre-shampoo|pre shampoo|mask|masque|mascarilla|\bpack\b|deep (treatment|conditioner)|hair treatment|treatment mask|perfector|bond (repair )?(treatment|perfector))/.test(n)) return "hmask";
    if (/(leave-in|leave in|sin enjuague|no[- ]rinse|curl (cream|defining|milk)|detangl|cream for hair|hair cream|hair milk|hair mist|keratin mist|\bbalm\b)/.test(n)) return "leavein";
    if (/(shampoo|champ[uú]|shampooing|cleansing|wash)/.test(n) && !/(conditioning cream)/.test(n)) return "shampoo";
    if (/(conditioner|acondicionador|co-wash|cowash|conditioning)/.test(n)) return "conditioner";
    if (/(scalp|tonic|t[oó]nico|hair ?loss|hair growth|growth|ca[ií]da|root|density|densif)/.test(n)) return "scalp";
    if (/(\boil\b|\baceite|serum|elixir|ampoule|ampolla|essence|silk infusion)/.test(n)) return "hoil";
    if (/(treatment|repair|smoothing|perfecting)/.test(n)) return "hmask";
    return null;
  }

  // ----- does a product suit this hair? -----
  function has(items, re) { var out = []; items.forEach(function (i) { if (re.test((i.inci || i.name).toLowerCase()) && out.indexOf(i.name) < 0) out.push(i.name); }); return out; }
  var SULFATE = /((sodium|ammonium|magnesium|tea|mea) (laureth|lauryl|myreth) sulfate|c14-16 olefin sulfonate|sodium (lauroyl|cocoyl) sarcosinate)/;
  var SILICONE = /(dimethicone|cyclopentasiloxane|cyclomethicone|amodimethicone|phenyl trimethicone|trimethylsiloxysilicate)/;
  var HEAVY = /(mineral oil|petrolatum|paraffin|butyrospermum|shea butter|cocos nucifera|coconut oil|cera alba|beeswax|lanolin)/;
  var DRYING = /(alcohol denat|sd alcohol|isopropyl alcohol|ethanol)/;
  var HELPS = {
    moisture: /(glycerin|panthenol|hyaluron|aloe|ceramide|squalane|argan|jojoba|shea|keratin|amino acid|honey)/,
    frizz: /(argan|jojoba|squalane|dimethicone|amodimethicone|glycerin|panthenol|keratin|marula|camellia|macadamia)/,
    shine: /(argan|camellia|marula|dimethicone|squalane|jojoba|silk|vitamin e|tocopher)/,
    volume: /(biotin|panthenol|hydrolyzed (wheat|rice|soy) protein|rice protein|caffeine)/,
    loss: /(caffeine|biotin|niacinamide|peptide|rosemary|rosmarinus|panax|capixyl|redensyl|saw palmetto|serenoa)/
  };
  var HELP_TEXT = { moisture: "moisture", frizz: "frizz", shine: "shine", volume: "volume", loss: "hair fall" };
  var SCALP_ACTIVE = /(zinc pyrithione|salicylic|ketoconazole|piroctone|climbazole|selenium)/;

  function match(items, h, kind) {
    var reasons = [], st = h.state || [], goals = h.goals || [];
    var dryOrSens = h.scalp === "dry" || h.scalp === "sensitive";
    var sulf = has(items, SULFATE), sil = has(items, SILICONE), heavy = has(items, HEAVY), alc = has(items, DRYING);
    if (kind === "shampoo" || kind === "scalp" || !kind) {
      if (sulf.length && (st.indexOf("colored") > -1 || dryOrSens || h.pattern === "curly" || h.pattern === "coily"))
        reasons.push(sulf[0] + ": strong cleanser, hard on " + (st.indexOf("colored") > -1 ? "colored hair" : dryOrSens ? "a dry or sensitive scalp" : "curly hair"));
    }
    if (sil.length && (h.thickness === "fine" || h.scalp === "oily") && kind !== "heat" && kind !== "hoil")
      reasons.push(sil[0] + ": can weigh down " + (h.thickness === "fine" ? "fine hair" : "an oily scalp"));
    if (heavy.length && h.thickness === "fine" && kind !== "hmask" && kind !== "hoil")
      reasons.push(heavy[0] + ": heavy for fine hair");
    if (alc.length && (h.pattern === "curly" || h.pattern === "coily" || st.indexOf("damaged") > -1 || dryOrSens) && kind !== "heat" && kind !== "scalp")
      reasons.push(alc[0] + ": drying alcohol");
    var helps = [];
    goals.forEach(function (g) {
      var f = HELPS[g] && has(items, HELPS[g]);
      if (f && f.length) helps.push("Helps with " + HELP_TEXT[g] + ": " + f.slice(0, 3).join(", "));
    });
    if (h.scalp === "dry" && kind === "shampoo") {
      var act = has(items, SCALP_ACTIVE);
      if (act.length) helps.push("For a flaky scalp: " + act[0]);
    }
    var level = reasons.length >= 2 ? "bad" : reasons.length === 1 ? "mid" : "good";
    var title = { good: "Good match for your hair", mid: "Possible match", bad: "Not a match for your hair" }[level];
    return { level: level, title: title, reasons: reasons, helps: helps };
  }

  // The routine screen reads step labels from Routine.KINDS, so hair steps are added there too.
  if (window.Routine) Object.keys(KINDS).forEach(function (k) { window.Routine.KINDS[k] = KINDS[k]; });

  window.Hair = { isHair: isHair, QUESTIONS: QUESTIONS, KINDS: KINDS, ORDER: ORDER, DEFAULT_STEPS: DEFAULT_STEPS, load: load, save: save, clear: clear, summary: summary, classify: classify, match: match };
})();
