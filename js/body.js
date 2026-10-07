// Body care: what kind of body product something is (intimate wash, body wash, lotion, deodorant...) and the steps of the body routine.
// Everything is guessed from the product NAME, so it is a helper, not a rule: the package always wins.
// Body steps have no morning or night: "Shower" is what you wash with, "Body care" is what you put on afterwards.
(function () {
  var KINDS = {
    intimate: { label: "Intimate wash",        hint: "Cleans the outside of the intimate area", tip: "Use it only on the outside (the vulva), never inside, and rinse well. A gentle, fragrance-free one is usually kindest. Guidance, not medical advice: see a doctor if you have itching or irritation." },
    bodywash: { label: "Body wash or soap",    hint: "Washes the body",                         tip: "Lather it on damp skin, rinse well, and avoid the intimate area if it is scented." },
    bscrub:   { label: "Body scrub",           hint: "Exfoliates, once or twice a week",        tip: "Once or twice a week on damp skin, not on broken or irritated skin." },
    blotion:  { label: "Body lotion or cream", hint: "Moisturizes the body",                     tip: "Right after the shower, while the skin is still a little damp." },
    boil:     { label: "Body oil",             hint: "Seals in moisture",                        tip: "A few drops on damp skin after the shower, or over your lotion." },
    bsun:     { label: "Body sunscreen",       hint: "For the body in the daytime",              tip: "A generous amount on all uncovered skin, and again every two hours outdoors." },
    deo:      { label: "Deodorant",            hint: "Underarms",                                tip: "On clean, dry underarms." },
    hand:     { label: "Hand cream",           hint: "Hands",                                    tip: "Whenever your hands feel dry, and after washing them." },
    foot:     { label: "Foot care",            hint: "Feet",                                     tip: "On clean, dry feet, especially heels." },
    lip:      { label: "Lip care",             hint: "Lips",                                     tip: "Whenever your lips feel dry, and before bed." },
    btreat:   { label: "Body treatment spray", hint: "Acne or irritated skin on the body",  tip: "Spray on clean, dry skin on the area you are treating, as the package says. Not a perfume." },
    bmist:    { label: "Body mist",            hint: "A light scent or refresh",                 tip: "Spray on the body or the air, away from the eyes." }
  };
  var ORDER = ["intimate", "bodywash", "bscrub", "blotion", "boil", "bsun", "deo", "hand", "foot", "lip", "btreat", "bmist"];
  // bs = Shower, bc = Body care
  var DEFAULT_STEPS = { bs: ["intimate", "bodywash", "bscrub"], bc: ["blotion", "deo", "hand"] };

  var INTIMATE = /(feminine|intimate|intima\b|[ií]ntim[ao]|femenin|vagin|yoni|vulva|\bgyn-|\blady (cleanser|wash)|panty spray)/;
  // Brands that only make intimate care (their names do not always say it: "Daily Wash", "Cream Wash")
  var INTIMATE_BRAND = /^(femfresh|vagisil|summer's eve|lactacyd|saforelle|carefree|the honey pot company|cora)$/i;
  var BODY_WORD = /(\bbody\b|corporal|\bhand\b|\bhands\b|manos|\bfoot\b|\bfeet\b|\bpies\b|deodorant|desodorante|antiperspirant|antitranspirante|\bbath\b|shower|\bsoap\b|jab[oó]n|cleansing bar|acne bar|lip (balm|care|treatment|mask|sleeping|butter)|lipsoftie|balmy tint|sugar scrub|crush scrub|body mist)/;
  var FACE_ONLY = /(\bface\b|\bfacial\b|\bfaces\b|\beye\b|\beyes\b|\bscalp\b|\bhair\b|shampoo|conditioner|champ[uú]|mascara|foundation|cushion|primer|concealer|\bmask fit\b)/;

  // Brands that only make body care (names like "Calming Wash" or "Stay Glow Body Serum Mist" do not always say body)
  var BODY_BRAND = /^login forest$/i;

  var NOT_WASH = /(wipe|cloth|spray|\bmist\b|lubricant|moisturizer|\bserum\b|odor block gel|vulva gel|panty)/;
  // Soap for the hands only, and hand sanitizer, are not body wash or hand cream.
  var HAND_ONLY = /(\bhand (wash|soap)\b|liquid hand|sanitizer)/;

  function classify(p) {
    var n = (p.name || "").toLowerCase().replace(/&/g, " and ").replace(/\s+/g, " ");
    // The intimate step is for washes: wipes, sprays, lubricants, moisturizers and leave-on gels are not washes.
    if (INTIMATE.test(n) || INTIMATE_BRAND.test(p.brand || "")) return NOT_WASH.test(n) ? null : "intimate";
    if (/(lip (balm|care|treatment|mask|sleeping|butter)|lipsoftie|lip sleeping|balmy tint)/.test(n)) return "lip";
    var bodyBrand = BODY_BRAND.test(p.brand || "");
    if (!BODY_WORD.test(n) && !bodyBrand) return null;
    if (FACE_ONLY.test(n) && !/\bbody\b/.test(n)) return null;
    if (HAND_ONLY.test(n) && !/\bbody\b/.test(n)) return null;
    if (/(deodorant|desodorante|antiperspirant|antitranspirante)/.test(n)) return "deo";
    if (/(sun ?screen|\bspf\b|\bsun\b)/.test(n)) return "bsun";
    if (/hand (and|&)? ?body/.test(n) && /(lotion|cream|crema|butter)/.test(n)) return "blotion";
    if (/(\bhand\b|\bhands\b|manos)/.test(n) && !/(wash|soap|jab[oó]n)/.test(n)) return "hand";
    if (/(\bfoot\b|\bfeet\b|\bpies\b)/.test(n)) return "foot";
    if (/body spray/.test(n) && /(acne|acniben|acniover|healing|ointment)/.test(n)) return "btreat";
    if (bodyBrand && /\bmist\b/.test(n) && !/\bhair\b/.test(n)) return "bmist";
    if (/(body mist|body spray|body fragrance|hair and body mist|hair and body fragrance|perfume mist)/.test(n)) return "bmist";
    if (/(scrub|polish|exfoliat)/.test(n) && !/(soap|jab[oó]n|\bbar\b|\bwash\b)/.test(n)) return "bscrub";
    if (/(body oil|aceite corporal|dry (body )?oil)/.test(n) && !/(cleansing|wash|shampoo)/.test(n)) return "boil";
    if (/(body wash|shower|\bbath\b|bubble bath|body cleanser|body soap|\bsoap\b|jab[oó]n|\bwash\b|cleansing bar|acne bar|cleansing)/.test(n)) return "bodywash";
    if (/(lotion|cream|crema|butter|mantequilla|milk|moistur|balm|\bgel\b|emulsion|hidratante)/.test(n) || (bodyBrand && /(ampoule|essence|serum)/.test(n))) return "blotion";
    return null;
  }

  // The routine screen reads step labels from Routine.KINDS, so body steps are added there too.
  if (window.Routine) Object.keys(KINDS).forEach(function (k) { window.Routine.KINDS[k] = KINDS[k]; });

  window.Body = { KINDS: KINDS, ORDER: ORDER, DEFAULT_STEPS: DEFAULT_STEPS, classify: classify };
})();
