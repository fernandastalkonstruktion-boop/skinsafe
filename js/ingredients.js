// Ingredient knowledge base (starter set).
// Ratings follow public regulatory and safety sources, but nobody with cosmetic-science training
// has reviewed them yet. RULE: when sources disagree, the stricter regulator wins (EU first, then
// Korea MFDS, then US/international sources). "bad" is reserved for substances an EU or Korean rule bans,
// restricts or requires to be named as an allergen. Irritation or pore-clogging alone is at most "mid". `src` points to the source DATABASES, not to the exact entry, so a reader can
// look the ingredient up there. Notes are general information, not medical advice.
//
// Each group: [level, names, note, detail, risks, helps, src]
//   level: "good" | "mid" | "bad"
//   risks: allergy, irritation, hormone, cancer, restricted, comedogenic, sun, pregnancy, drying
//   helps: acne, redness, dryness, pigmentation, lines
(function () {
  var SOURCES = {
    // rank: lower = stricter and more trusted. EU first, then Korea, then the rest.
    EUREG: { name: "EU Cosmetics Regulation", url: "https://eur-lex.europa.eu/eli/reg/2009/1223/oj", rank: 0 },
    SCCS: { name: "EU SCCS opinions", url: "https://health.ec.europa.eu/scientific-committees/scientific-committee-consumer-safety-sccs_en", rank: 0 },
    COSING: { name: "EU CosIng database", url: "https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en", rank: 0 },
    MFDS: { name: "Korea MFDS", url: "https://www.mfds.go.kr/eng/index.do", rank: 1 },
    MFDSF: { name: "Korea MFDS (fragrance allergens)", url: "https://www.mfds.go.kr/eng/brd/m_75/view.do?seq=13", rank: 1 },
    IARC: { name: "IARC (WHO)", url: "https://monographs.iarc.who.int/list-of-classifications", rank: 2 },
    CIR: { name: "CIR reviews (US)", url: "https://cir-reports.cir-safety.org/", rank: 3 }
  };

  var RISK_LABEL = {
    allergy: "Allergy risk",
    irritation: "Irritation",
    hormone: "Hormone or reproductive",
    cancer: "Cancer concern",
    restricted: "Regulated",
    comedogenic: "May clog pores",
    sun: "Sun sensitivity",
    pregnancy: "Ask a doctor if pregnant",
    drying: "Drying"
  };

  var RAW = [
    // good
    ["good", ["water", "aqua", "eau"], "Water", "The base of most formulas. No known concerns.", [], [], ["COSING"]],
    ["good", ["glycerin", "glycerine"], "Humectant, pulls water into the skin", "One of the most widely used moisturizing ingredients. Reviewed as safe in cosmetics and rarely irritating.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["hyaluronic acid", "sodium hyaluronate"], "Humectant, plumps and hydrates", "Holds water at the skin's surface. Well tolerated by most skin types.", [], ["dryness", "lines"], ["CIR", "COSING"]],
    ["good", ["ceramide np", "ceramide ap", "ceramide eop", "ceramide ng", "ceramide ns"], "Supports the skin barrier", "Skin-identical lipids that help keep moisture in. Useful for dry or easily irritated skin.", [], ["dryness", "redness"], ["CIR", "COSING"]],
    ["good", ["cholesterol"], "Skin-identical lipid, supports the barrier", "Works together with ceramides to rebuild the skin barrier.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["panthenol", "pro-vitamin b5", "provitamin b5"], "Soothing and hydrating", "A vitamin B5 derivative that hydrates and calms skin. Well tolerated.", [], ["dryness", "redness"], ["CIR", "COSING"]],
    ["good", ["niacinamide"], "Supports the barrier and evens tone", "Vitamin B3. Often used for uneven tone and oily skin. A few people feel tingling at high strengths.", [], ["pigmentation", "acne", "redness"], ["CIR", "COSING"]],
    ["good", ["squalane"], "Lightweight emollient", "Softens skin without a greasy feel. Usually well tolerated.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["tocopherol", "vitamin e"], "Antioxidant", "Vitamin E. Protects the formula and the skin from oxidation. Contact allergy is rare.", [], ["lines"], ["CIR", "COSING"]],
    ["good", ["allantoin"], "Soothing", "Calms and softens skin. Well tolerated.", [], ["redness", "dryness"], ["CIR", "COSING"]],
    ["good", ["centella asiatica extract", "centella asiatica leaf extract", "madecassoside"], "Soothing", "Plant extract used in \"cica\" products to calm irritated skin. Contact allergy has been reported but is uncommon.", [], ["redness"], ["CIR", "COSING"]],
    ["good", ["aloe barbadensis leaf juice", "aloe barbadensis leaf extract"], "Soothing and hydrating", "Gel from the aloe plant that hydrates and calms skin.", [], ["redness", "dryness"], ["CIR", "COSING"]],
    ["good", ["butyrospermum parkii butter", "butyrospermum parkii (shea) butter"], "Rich emollient", "A rich butter that softens dry skin. Can feel heavy on oily skin.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["cetearyl alcohol", "cetyl alcohol", "stearyl alcohol"], "Fatty alcohol, softens skin (not drying)", "Waxy ingredients that thicken creams. Different from drying alcohols such as ethanol.", [], [], ["CIR", "COSING"]],
    ["good", ["zinc oxide"], "Mineral UV filter, gentle", "Sits on the skin and reflects UV light. A good choice for sensitive skin. Avoid sprays or powders you could inhale.", [], [], ["SCCS", "COSING"]],
    ["good", ["titanium dioxide"], "Mineral UV filter or pigment", "Used as a sunscreen filter and white pigment. EU scientists advise against sprays or powders that can be inhaled, where IARC rates inhaled titanium dioxide as possibly carcinogenic.", [], [], ["SCCS", "IARC"]],
    ["good", ["xanthan gum"], "Thickener", "A natural-origin thickener that keeps a formula smooth.", [], [], ["COSING"]],
    ["good", ["disodium edta"], "Stabilizer", "Binds metal ions to keep the formula stable.", [], [], ["CIR", "COSING"]],
    ["good", ["ascorbic acid", "vitamin c", "sodium ascorbyl phosphate"], "Antioxidant, can sting on sensitive skin", "Brightens and protects. Stronger forms can sting or irritate sensitive skin.", ["irritation"], ["pigmentation", "lines"], ["CIR", "COSING"]],
    ["good", ["dimethicone"], "Silicone that smooths skin", "Reviewed as safe in cosmetics. Some people with acne-prone skin prefer silicone-free products.", [], [], ["CIR", "COSING"]],

    // mid
    ["mid", ["retinol", "retinyl palmitate", "retinal"], "Effective but can irritate; ask a doctor if pregnant", "A vitamin A form used for lines, tone and acne. Start slowly and use sunscreen by day. Avoid when pregnant or breastfeeding unless your doctor says otherwise.", ["irritation", "pregnancy", "sun"], ["lines", "acne", "pigmentation"], ["SCCS", "MFDS", "CIR"]],
    ["mid", ["salicylic acid"], "Exfoliant, can dry or irritate", "Unclogs pores and is common in acne products. Can dry or irritate, and EU rules limit how much is allowed. Ask a doctor about strong peels if pregnant.", ["irritation", "drying"], ["acne"], ["SCCS", "MFDS", "COSING"]],
    ["mid", ["glycolic acid", "lactic acid"], "Exfoliating acid, raises sun sensitivity", "Smooths and brightens by exfoliating. Can sting and make skin more sensitive to sun, so use sunscreen.", ["irritation", "sun"], ["pigmentation", "lines"], ["CIR", "COSING"]],
    ["mid", ["sodium laureth sulfate"], "Cleansing agent, can dry the skin", "Foaming cleanser. Milder than SLS but can still dry or irritate sensitive skin.", ["irritation", "drying"], [], ["CIR"]],
    ["mid", ["cocamidopropyl betaine"], "Cleansing agent, can irritate sensitive skin", "A gentle foaming agent, but a known cause of contact allergy in some people, often linked to impurities.", ["allergy", "irritation"], [], ["CIR"]],
    ["mid", ["cocos nucifera oil", "cocos nucifera (coconut) oil", "coconut oil"], "Can clog pores for some skin", "Moisturizing, but rated comedogenic in older tests. The real-world effect varies, and acne-prone skin often reacts.", ["comedogenic"], ["dryness"], ["CIR"]],
    ["mid", ["isopropyl myristate"], "Can clog pores for some skin", "Gives a silky feel. Rated comedogenic in older tests, so acne-prone skin may prefer to avoid it.", ["comedogenic"], [], ["CIR"]],
    ["mid", ["menthol", "menthyl lactate", "mentha piperita oil", "peppermint oil"], "Cooling, can irritate sensitive skin", "Gives a cooling sensation. Can irritate sensitive or damaged skin.", ["irritation"], [], ["CIR", "COSING"]],
    ["mid", ["benzophenone-3", "oxybenzone"], "Chemical UV filter, known allergen for some", "Absorbs UV light. A known cause of contact and photo-allergy for some people, and restricted in some places for environmental reasons.", ["allergy"], [], ["SCCS", "EUREG", "MFDS"]],
    ["mid", ["dmdm hydantoin", "imidazolidinyl urea", "quaternium-15", "diazolidinyl urea"], "Preservative that releases small amounts of formaldehyde", "Formaldehyde is classified as a human carcinogen by IARC. These preservatives release tiny amounts, and the EU requires a label warning above a set level. They can cause contact allergy.", ["allergy", "cancer"], [], ["EUREG", "SCCS", "MFDS", "IARC"]],

    // bad
    ["bad", ["parfum", "fragrance", "aroma", "perfume"], "Fragrance mix, common allergen", "A blend that can contain dozens of undisclosed substances. One of the most common causes of cosmetic allergy and irritation.", ["allergy", "irritation"], [], ["EUREG", "SCCS", "MFDSF"]],
    ["bad", ["limonene", "linalool", "citronellol", "geraniol", "citral", "eugenol", "coumarin", "hexyl cinnamal", "benzyl salicylate", "benzyl alcohol", "alpha-isomethyl ionone", "amyl cinnamal", "cinnamal", "farnesol"], "Fragrance allergen", "One of the fragrance substances the EU requires to be named on the label because it can cause contact allergy (above 0.001% in leave-on and 0.01% in rinse-off products). Korea also requires labeling of a similar list since 2020.", ["allergy"], [], ["EUREG", "SCCS", "MFDSF"]],
    ["bad", ["butylphenyl methylpropional", "lilial"], "Banned in EU cosmetics", "Linked to reproductive toxicity and banned in EU cosmetics since 2022. If you still see it, the product may be old or made for another market.", ["hormone", "restricted"], [], ["SCCS", "EUREG"]],
    ["mid", ["alcohol denat.", "alcohol denat", "sd alcohol", "alcohol"], "Drying and irritating", "Ethanol evaporates fast and can dry out the skin barrier, especially high on the ingredient list. Not banned or restricted in the EU, but dry and sensitive skin tend to react.", ["irritation", "drying"], [], ["CIR", "COSING"]],
    ["mid", ["sodium lauryl sulfate"], "Strong cleanser, can dry and irritate", "A harsh foaming agent. Allowed in the EU and reviewed as safe in rinse-off products, but it is a known skin irritant.", ["irritation", "drying"], [], ["CIR"]],
    ["bad", ["methylisothiazolinone", "methylchloroisothiazolinone"], "Preservative, common contact allergen", "A well-known cause of contact allergy. The EU does not allow these preservatives in leave-on products.", ["allergy", "restricted"], [], ["SCCS", "EUREG", "MFDS"]],
    ["bad", ["triclosan"], "Antibacterial, restricted in many places", "Antibacterial agent restricted in EU cosmetics and banned from US consumer hand soaps. Concerns include hormone disruption and antibiotic resistance.", ["hormone", "restricted"], [], ["SCCS", "EUREG", "MFDS"]]
  ];

  var INDEX = {};
  RAW.forEach(function (r) {
    var entry = {
      level: r[0], note: r[2], detail: r[3], risks: r[4], helps: r[5],
      src: r[6].map(function (k) { return SOURCES[k]; }).sort(function (a, b) { return a.rank - b.rank; })
    };
    r[1].forEach(function (name) { INDEX[name] = entry; });
  });

  function clean(s) {
    return s.toLowerCase().replace(/[*†‡]/g, "").replace(/\s+/g, " ").trim();
  }

  // Split on commas that are not inside parentheses.
  function split(text) {
    var out = [], depth = 0, cur = "";
    text = text.replace(/^\s*ingredients?\s*:?\s*/i, "").replace(/[.;]\s*$/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === "(") depth++;
      if (c === ")") depth = Math.max(0, depth - 1);
      if ((c === "," || c === ";") && depth === 0) { out.push(cur); cur = ""; } else { cur += c; }
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // Try the full name, then the name without parentheses, then each parenthetical.
  function lookup(raw) {
    var full = clean(raw);
    if (INDEX[full]) return INDEX[full];
    var noParen = clean(raw.replace(/\([^)]*\)/g, " "));
    if (INDEX[noParen]) return INDEX[noParen];
    var inside = raw.match(/\(([^)]*)\)/g) || [];
    for (var i = 0; i < inside.length; i++) {
      var p = clean(inside[i].slice(1, -1));
      if (INDEX[p]) return INDEX[p];
    }
    return null;
  }

  // Score: start at 100, -18 per flag, -6 per watch. Needs at least 3 rated ingredients.
  // Any flagged ingredient caps the score at 75, so a product with a flag can never be "Excellent".
  function analyze(text) {
    var items = split(text || "").map(function (raw) {
      var hit = lookup(raw);
      var name = raw.replace(/\*/g, "").trim();
      return hit
        ? { name: name, level: hit.level, note: hit.note, detail: hit.detail, risks: hit.risks, helps: hit.helps, src: hit.src }
        : { name: name, level: null, note: "", detail: "", risks: [], helps: [], src: [] };
    });
    var n = { good: 0, mid: 0, bad: 0, none: 0 };
    items.forEach(function (i) { n[i.level || "none"]++; });
    var rated = n.good + n.mid + n.bad;
    var cap = n.bad > 0 ? 75 : 100;
    var score = rated >= 3 ? Math.max(0, Math.min(cap, 100 - 18 * n.bad - 6 * n.mid)) : null;
    return { items: items, counts: n, score: score };
  }

  window.Ingredients = { analyze: analyze, split: split, RISK_LABEL: RISK_LABEL };
})();
