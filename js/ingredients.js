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
    ["good", ["water", "aqua", "eau", "aqua/water", "aqua/water/eau", "water/aqua", "water/aqua/eau", "water/eau", "purified water", "aqua (water)"], "Water", "The base of most formulas. No known concerns.", [], [], ["COSING"]],
    ["good", ["glycerin", "glycerine"], "Humectant, pulls water into the skin", "One of the most widely used moisturizing ingredients. Reviewed as safe in cosmetics and rarely irritating.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["hyaluronic acid", "sodium hyaluronate", "hydrolyzed hyaluronic acid", "sodium acetylated hyaluronate", "hydrolyzed sodium hyaluronate", "sodium hyaluronate crosspolymer"], "Humectant, plumps and hydrates", "Holds water at the skin's surface. Well tolerated by most skin types.", [], ["dryness", "lines"], ["CIR", "COSING"]],
    ["good", ["ceramide np", "ceramide ap", "ceramide eop", "ceramide ng", "ceramide ns"], "Supports the skin barrier", "Skin-identical lipids that help keep moisture in. Useful for dry or easily irritated skin.", [], ["dryness", "redness"], ["CIR", "COSING"]],
    ["good", ["cholesterol"], "Skin-identical lipid, supports the barrier", "Works together with ceramides to rebuild the skin barrier.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["panthenol", "pro-vitamin b5", "provitamin b5"], "Soothing and hydrating", "A vitamin B5 derivative that hydrates and calms skin. Well tolerated.", [], ["dryness", "redness"], ["CIR", "COSING"]],
    ["good", ["niacinamide"], "Supports the barrier and evens tone", "Vitamin B3. Often used for uneven tone and oily skin. A few people feel tingling at high strengths.", [], ["pigmentation", "acne", "redness"], ["CIR", "COSING"]],
    ["good", ["squalane"], "Lightweight emollient", "Softens skin without a greasy feel. Usually well tolerated.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["tocopherol", "vitamin e", "tocopheryl acetate", "tocopheryl linoleate", "vitamin e acetate"], "Antioxidant", "Vitamin E. Protects the formula and the skin from oxidation. Contact allergy is rare.", [], ["lines"], ["CIR", "COSING"]],
    ["good", ["allantoin"], "Soothing", "Calms and softens skin. Well tolerated.", [], ["redness", "dryness"], ["CIR", "COSING"]],
    ["good", ["centella asiatica extract", "centella asiatica leaf extract", "madecassoside"], "Soothing", "Plant extract used in \"cica\" products to calm irritated skin. Contact allergy has been reported but is uncommon.", [], ["redness"], ["CIR", "COSING"]],
    ["good", ["aloe barbadensis leaf juice", "aloe barbadensis leaf extract", "aloe barbadensis leaf juice powder", "aloe barbadensis leaf powder"], "Soothing and hydrating", "Gel from the aloe plant that hydrates and calms skin.", [], ["redness", "dryness"], ["CIR", "COSING"]],
    ["good", ["butyrospermum parkii butter", "butyrospermum parkii (shea) butter"], "Rich emollient", "A rich butter that softens dry skin. Can feel heavy on oily skin.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["cetearyl alcohol", "cetyl alcohol", "stearyl alcohol"], "Fatty alcohol, softens skin (not drying)", "Waxy ingredients that thicken creams. Different from drying alcohols such as ethanol.", [], [], ["CIR", "COSING"]],
    ["good", ["zinc oxide"], "Mineral UV filter, gentle", "Sits on the skin and reflects UV light. A good choice for sensitive skin. Avoid sprays or powders you could inhale.", [], [], ["SCCS", "COSING"]],
    ["good", ["titanium dioxide", "ci 77891"], "Mineral UV filter or pigment", "Used as a sunscreen filter and white pigment. EU scientists advise against sprays or powders that can be inhaled, where IARC rates inhaled titanium dioxide as possibly carcinogenic.", [], [], ["SCCS", "IARC"]],
    ["good", ["xanthan gum"], "Thickener", "A natural-origin thickener that keeps a formula smooth.", [], [], ["COSING"]],
    ["good", ["disodium edta", "tetrasodium edta", "trisodium edta", "trisodium ethylenediamine disuccinate", "tetrasodium glutamate diacetate", "sodium phytate", "sodium gluconate"], "Stabilizer", "Binds metal ions to keep the formula stable.", [], [], ["CIR", "COSING"]],
    ["good", ["ascorbic acid", "vitamin c", "sodium ascorbyl phosphate"], "Antioxidant, can sting on sensitive skin", "Brightens and protects. Stronger forms can sting or irritate sensitive skin.", ["irritation"], ["pigmentation", "lines"], ["CIR", "COSING"]],
    ["good", ["dimethicone", "dimethiconol", "amodimethicone", "phenyl trimethicone", "trimethylsiloxysilicate", "dimethicone crosspolymer", "dimethicone/vinyl dimethicone crosspolymer", "cetyl peg/ppg-10/1 dimethicone", "bis-peg/ppg-14/14 dimethicone", "peg-10 dimethicone"], "Silicone that smooths skin", "Reviewed as safe in cosmetics. Some people with acne-prone skin prefer silicone-free products.", [], [], ["CIR", "COSING"]],

    // mid
    ["mid", ["retinol", "retinyl palmitate", "retinal", "retinyl acetate", "retinyl linoleate", "hydroxypinacolone retinoate", "retinyl retinoate", "vitamin a"], "Effective but can irritate; ask a doctor if pregnant", "A vitamin A form used for lines, tone and acne. Start slowly and use sunscreen by day. Avoid when pregnant or breastfeeding unless your doctor says otherwise.", ["irritation", "pregnancy", "sun"], ["lines", "acne", "pigmentation"], ["SCCS", "MFDS", "CIR"]],
    ["mid", ["salicylic acid", "sodium salicylate", "betaine salicylate"], "Exfoliant, can dry or irritate", "Unclogs pores and is common in acne products. Can dry or irritate, and EU rules limit how much is allowed. Ask a doctor about strong peels if pregnant.", ["irritation", "drying"], ["acne"], ["SCCS", "MFDS", "COSING"]],
    ["mid", ["glycolic acid", "lactic acid", "mandelic acid", "malic acid", "tartaric acid"], "Exfoliating acid, raises sun sensitivity", "Smooths and brightens by exfoliating. Can sting and make skin more sensitive to sun, so use sunscreen.", ["irritation", "sun"], ["pigmentation", "lines"], ["CIR", "COSING"]],
    ["mid", ["sodium laureth sulfate", "ammonium laureth sulfate", "ammonium lauryl sulfate", "sodium c14-16 olefin sulfonate", "sodium lauroyl sarcosinate", "sodium coco-sulfate", "tea-dodecylbenzenesulfonate"], "Cleansing agent, can dry the skin", "Foaming cleanser. Milder than SLS but can still dry or irritate sensitive skin.", ["irritation", "drying"], [], ["CIR"]],
    ["mid", ["cocamidopropyl betaine"], "Cleansing agent, can irritate sensitive skin", "A gentle foaming agent, but a known cause of contact allergy in some people, often linked to impurities.", ["allergy", "irritation"], [], ["CIR"]],
    ["mid", ["cocos nucifera oil", "cocos nucifera (coconut) oil", "coconut oil"], "Can clog pores for some skin", "Moisturizing, but rated comedogenic in older tests. The real-world effect varies, and acne-prone skin often reacts.", ["comedogenic"], ["dryness"], ["CIR"]],
    ["mid", ["isopropyl myristate"], "Can clog pores for some skin", "Gives a silky feel. Rated comedogenic in older tests, so acne-prone skin may prefer to avoid it.", ["comedogenic"], [], ["CIR"]],
    ["mid", ["menthol", "menthyl lactate", "mentha piperita oil", "peppermint oil"], "Cooling, can irritate sensitive skin", "Gives a cooling sensation. Can irritate sensitive or damaged skin.", ["irritation"], [], ["CIR", "COSING"]],
    ["mid", ["benzophenone-3", "oxybenzone"], "Chemical UV filter, known allergen for some", "Absorbs UV light. A known cause of contact and photo-allergy for some people, and restricted in some places for environmental reasons.", ["allergy"], [], ["SCCS", "EUREG", "MFDS"]],
    ["mid", ["dmdm hydantoin", "imidazolidinyl urea", "quaternium-15", "diazolidinyl urea", "sodium hydroxymethylglycinate", "bronopol", "2-bromo-2-nitropropane-1,3-diol"], "Preservative that releases small amounts of formaldehyde", "Formaldehyde is classified as a human carcinogen by IARC. These preservatives release tiny amounts, and the EU requires a label warning above a set level. They can cause contact allergy.", ["allergy", "cancer"], [], ["EUREG", "SCCS", "MFDS", "IARC"]],

    // bad
    ["bad", ["parfum", "fragrance", "aroma", "perfume", "fragrance / parfum", "parfum / fragrance", "parfum/fragrance"], "Fragrance mix, common allergen", "A blend that can contain dozens of undisclosed substances. One of the most common causes of cosmetic allergy and irritation.", ["allergy", "irritation"], [], ["EUREG", "SCCS", "MFDSF"], "fragrance"],
    ["bad", ["limonene", "linalool", "citronellol", "geraniol", "citral", "eugenol", "coumarin", "hexyl cinnamal", "benzyl salicylate", "benzyl alcohol", "alpha-isomethyl ionone", "amyl cinnamal", "cinnamal", "farnesol", "hydroxycitronellal", "benzyl benzoate", "benzyl cinnamate", "cinnamyl alcohol", "isoeugenol", "anise alcohol", "amylcinnamyl alcohol", "methyl 2-octynoate", "evernia prunastri extract", "evernia furfuracea extract"], "Fragrance allergen", "One of the fragrance substances the EU requires to be named on the label because it can cause contact allergy (above 0.001% in leave-on and 0.01% in rinse-off products). Korea also requires labeling of a similar list since 2020.", ["allergy"], [], ["EUREG", "SCCS", "MFDSF"], "fragrance"],
    ["bad", ["butylphenyl methylpropional", "lilial"], "Banned in EU cosmetics", "Linked to reproductive toxicity and banned in EU cosmetics since 2022. If you still see it, the product may be old or made for another market.", ["hormone", "restricted"], [], ["SCCS", "EUREG"]],
    ["mid", ["alcohol denat.", "alcohol denat", "sd alcohol", "sd alcohol 40-b", "denatured alcohol", "ethanol", "alcohol"], "Drying and irritating", "Ethanol evaporates fast and can dry out the skin barrier, especially high on the ingredient list. Not banned or restricted in the EU, but dry and sensitive skin tend to react.", ["irritation", "drying"], [], ["CIR", "COSING"]],
    ["mid", ["sodium lauryl sulfate"], "Strong cleanser, can dry and irritate", "A harsh foaming agent. Allowed in the EU and reviewed as safe in rinse-off products, but it is a known skin irritant.", ["irritation", "drying"], [], ["CIR"]],
    ["bad", ["methylisothiazolinone", "methylchloroisothiazolinone"], "Preservative, common contact allergen", "A well-known cause of contact allergy. The EU does not allow these preservatives in leave-on products.", ["allergy", "restricted"], [], ["SCCS", "EUREG", "MFDS"]],
    ["bad", ["triclosan"], "Antibacterial, restricted in many places", "Antibacterial agent restricted in EU cosmetics and banned from US consumer hand soaps. Concerns include hormone disruption and antibiotic resistance.", ["hormone", "restricted"], [], ["SCCS", "EUREG", "MFDS"]],

    // ---- expansion (formula basics, based on what appears most in real products) ----
    ["good", ["citric acid", "sodium citrate"], "pH adjuster", "Balances the acidity of a formula. At the low levels used for this, it is not a concern.", [], [], ["CIR", "COSING"]],
    ["good", ["sodium hydroxide", "potassium hydroxide"], "pH adjuster", "Used in tiny amounts to balance acidity and fully neutralized in the finished product.", [], [], ["CIR", "COSING"]],
    ["good", ["phenoxyethanol"], "Preservative, capped at 1% in the EU", "A widely used preservative. The EU limits it to 1% of the product, and EU scientists consider that level safe. A small number of people find it irritating.", ["restricted"], [], ["SCCS", "EUREG", "MFDS"]],
    ["good", ["sodium benzoate", "potassium sorbate", "benzoic acid", "sorbic acid", "dehydroacetic acid", "sodium dehydroacetate", "chlorphenesin", "caprylhydroxamic acid", "sodium levulinate"], "Gentle preservative", "Preservatives used at low levels and allowed in the EU within set limits. Rarely irritating.", ["restricted"], [], ["EUREG", "COSING", "CIR"]],
    ["good", ["ethylhexylglycerin"], "Preservative booster that softens skin", "Helps preservatives work and leaves skin soft. Contact allergy is uncommon.", [], [], ["COSING", "CIR"]],
    ["good", ["hydroxyacetophenone"], "Preservative booster, soothing", "Helps preserve the formula and has a mild calming effect. Well tolerated.", [], ["redness"], ["COSING"]],
    ["good", ["sodium chloride", "magnesium sulfate"], "Salt, thickener", "Thickens cleansers and adjusts texture. No concerns at these levels.", [], [], ["CIR", "COSING"]],
    ["good", ["caprylic/capric triglyceride", "coco-caprylate/caprate", "coco-caprylate", "dicaprylyl carbonate", "dicaprylyl ether", "ethylhexyl palmitate", "ethylhexyl stearate", "c12-15 alkyl benzoate", "octyldodecanol", "dibutyl adipate", "diisostearyl malate", "myristyl myristate", "cetyl palmitate", "cetyl esters", "glyceryl oleate", "triethyl citrate", "hydrogenated polyisobutene", "isohexadecane", "isononyl isononanoate", "bis-diglyceryl polyacyladipate-2", "propylene carbonate", "jojoba esters", "hydrogenated coco-glycerides", "butyloctyl salicylate", "diisopropyl sebacate", "polybutene", "isododecane", "tribehenin", "glyceryl caprylate", "hydrogenated palm glycerides citrate", "polyglyceryl-2 triisostearate", "bis-behenyl/isostearyl/phytosteryl dimer dilinoleyl dimer dilinoleate", "triethylhexanoin", "cetyl ethylhexanoate", "pentaerythrityl tetraethylhexanoate", "pentaerythrityl tetraisostearate", "pentaerythrityl distearate", "decyl oleate", "diisopropyl adipate", "tridecyl trimellitate", "diethylhexyl succinate", "triolein", "c10-18 triglycerides", "butylene glycol dicaprylate/dicaprate", "hexyl laurate", "octyldodecyl myristate", "isostearyl alcohol", "isostearic acid", "lauric acid", "oleic acid", "arachidic acid", "capric acid", "hydroxystearic acid", "hydrogenated poly(c6-14 olefin)", "hydrogenated polydecene", "polyisobutene", "c14-22 alcohols", "phytosphingosine", "phytosteryl macadamiate", "phytosteryl/behenyl/octyldodecyl lauroyl glutamate", "phytosteryl/octyldodecyl lauroyl glutamate", "phytosteryl isostearyl dimer dilinoleate", "brassica campestris sterols", "glycine soja sterols", "sodium metabisulfite"], "Emollient", "Softens skin and improves how a product spreads. Widely used and generally well tolerated.", [], [], ["CIR", "COSING"]],
    ["good", ["propylene glycol"], "Humectant and solvent", "Draws in water and helps ingredients dissolve. Can sting or, rarely, cause allergy, especially on damaged skin.", ["irritation"], ["dryness"], ["CIR", "COSING"]],
    ["good", ["butylene glycol", "pentylene glycol", "propanediol", "1,2-hexanediol", "caprylyl glycol", "dipropylene glycol", "hexylene glycol", "methylpropanediol", "glycereth-26", "isopentyldiol", "1,2-hexandiol", "octanediol", "benzyl glycol"], "Humectant and solvent", "Draws in water and helps other ingredients dissolve. Gentler than propylene glycol for most people.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["sodium pca", "betaine", "trehalose", "sodium lactate", "sorbitol", "xylitol", "polyglutamic acid", "glycine", "arginine", "serine", "proline", "glucose", "fructose", "sucrose", "mannitol", "histidine", "fructooligosaccharides", "pantolactone", "biosaccharide gum-1", "decylene glycol", "triethylene glycol", "peg-8", "aqua / water", "alanine", "phenylalanine", "threonine", "isoleucine", "valine", "leucine", "lysine", "tyrosine", "methionine", "cysteine", "glutamic acid", "aspartic acid", "pca", "erythritol", "inositol", "ectoin", "carnosine", "hydroxyethyl urea", "sodium polyglutamate", "hydroxypropyl cyclodextrin", "methyl gluceth-10", "glyceryl glucoside", "anhydroxylitol", "maltitol", "rhamnose", "sodium dna", "acetyl glucosamine", "panthenyl ethyl ether", "pantethine", "glycyl glycine", "glucosyl hesperidin", "sodium heparin"], "Humectant", "Holds water in the skin. Naturally found in skin or very similar to it, and well tolerated.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["urea"], "Humectant, softens rough skin", "Hydrates and gently softens rough, dry skin. Can sting on broken skin or at high strengths.", ["irritation"], ["dryness"], ["CIR", "COSING"]],
    ["good", ["glyceryl stearate", "glyceryl stearate se", "glyceryl stearate citrate", "stearic acid", "palmitic acid", "myristic acid", "behenyl alcohol", "cetearyl glucoside", "lecithin", "hydrogenated lecithin", "polysorbate 20", "polysorbate 60", "polysorbate 80", "ceteareth-20", "peg-100 stearate", "peg-40 hydrogenated castor oil", "steareth-2", "steareth-20", "glycol distearate", "peg-7 glyceryl cocoate", "sorbitan isostearate", "sorbitan olivate", "sorbitan oleate", "potassium cetyl phosphate", "sodium stearoyl glutamate", "hydrogenated castor oil", "sodium cetearyl sulfate", "trideceth-10", "cetearyl olivate", "steareth-21", "arachidyl alcohol", "arachidyl glucoside", "peg-6 caprylic/capric glycerides", "polyhydroxystearic acid", "myristyl alcohol", "laureth-2", "caprylyl/capryl glucoside", "disodium cocoyl glutamate", "microcrystalline wax"], "Emulsifier or thickener", "Helps oil and water mix into a smooth cream. Common and well tolerated. PEG-based ones are considered safe when manufacturers keep impurities low.", [], [], ["CIR", "COSING"]],
    ["good", ["carbomer", "acrylates/c10-30 alkyl acrylate crosspolymer", "acrylates copolymer", "sodium polyacrylate", "hydroxyethylcellulose", "cellulose gum", "microcrystalline cellulose", "guar hydroxypropyltrimonium chloride", "polyquaternium-10", "disteardimonium hectorite", "acrylamide/sodium acryloyldimethyltaurate copolymer", "hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer", "polyacrylate crosspolymer-6", "polyquaternium-7", "inulin", "sodium xylenesulfonate", "dextrin", "zea mays starch", "carrageenan", "succinoglycan", "ceratonia siliqua gum", "tapioca starch", "cyamopsis tetragonoloba gum", "gellan gum", "glucomannan", "chondrus crispus powder", "hydroxypropyl starch phosphate", "hydroxypropyl methylcellulose", "ethylcellulose", "dextrin palmitate", "aluminum/magnesium hydroxide stearate", "sodium metaphosphate", "potassium chloride", "distarch phosphate", "pvp", "polyquaternium-51", "polyquaternium-39"], "Thickener", "Gives gels and creams their body. Well tolerated.", [], [], ["CIR", "COSING"]],
    ["good", ["silica", "mica", "kaolin", "silica dimethyl silylate", "triethoxycaprylylsilane", "maltodextrin", "aluminum starch octenylsuccinate", "magnesium aluminum silicate", "aluminum hydroxide", "alumina", "charcoal powder", "magnesium chloride", "calcium chloride", "disodium phosphate", "potassium phosphate", "tromethamine", "levulinic acid", "p-anisic acid", "magnesium nitrate", "polymethylsilsesquioxane", "boron nitride", "synthetic fluorphlogopite", "hydrated silica"], "Mineral texture ingredient", "Absorbs oil and adds a soft feel. Avoid breathing in loose powders.", [], [], ["CIR", "COSING"]],
    ["good", ["ci 77491", "ci 77492", "ci 77499", "iron oxides"], "Iron oxide pigment", "Mineral pigment used in tinted products and sunscreens. Well tolerated.", [], [], ["SCCS", "COSING"]],
    ["good", ["ci 42090", "ci 19140", "ci 17200", "ci 15850", "ci 15985", "ci 16035", "ci 14700", "ci 47005", "ci 60730"], "Color additive", "A color additive on the EU approved list. Rarely causes a reaction.", [], [], ["EUREG", "COSING"]],
    ["good", ["aluminum chlorohydrate", "aluminum chloride"], "Antiperspirant, EU-capped", "Blocks sweat. EU scientists consider it safe in deodorants and antiperspirants up to a set aluminum level; avoid on broken skin.", ["restricted"], [], ["SCCS", "EUREG"]],
    ["good", ["propane", "butane", "isobutane"], "Propellant gas", "Pushes a spray out of the can and evaporates. Avoid breathing in sprays.", [], [], ["COSING"]],
    ["good", ["helianthus annuus seed oil", "simmondsia chinensis seed oil", "argania spinosa kernel oil", "prunus amygdalus dulcis oil", "ricinus communis seed oil", "olea europaea fruit oil", "persea gratissima oil", "vitis vinifera seed oil", "rosa canina fruit oil", "squalene", "oryza sativa bran oil", "camellia oleifera seed oil", "glycine soja oil", "hydrogenated rapeseed oil", "helianthus annuus hybrid oil", "mangifera indica seed butter", "glycine soja"], "Plant oil", "Softens skin and helps seal in moisture. Nut-based oils matter if you have a nut allergy.", [], ["dryness"], ["CIR", "COSING"]],
    ["good", ["cera alba", "beeswax", "copernicia cerifera cera", "cera microcristallina", "synthetic wax", "candelilla cera", "euphorbia cerifera cera"], "Wax", "Adds body and a protective feel. Allergy to beeswax is rare.", [], [], ["CIR", "COSING"]],
    ["good", ["paraffinum liquidum", "petrolatum", "paraffin", "mineral oil"], "Occlusive, seals in moisture", "Cosmetic grades are highly refined. IARC rates untreated mineral oils as carcinogenic but not the highly refined kind, and the EU requires the refining history to be known.", [], ["dryness"], ["IARC", "EUREG", "CIR"]],
    ["good", ["bht", "pentaerythrityl tetra-di-t-butyl hydroxyhydrocinnamate", "ascorbyl palmitate"], "Antioxidant for the formula", "Keeps oils from going rancid. No regulatory concerns at the levels used; a few people are sensitive.", [], [], ["CIR", "COSING"]],
    ["good", ["ethylhexyl triazone", "bis-ethylhexyloxyphenol methoxyphenyl triazine", "diethylamino hydroxybenzoyl hexyl benzoate", "butyl methoxydibenzoylmethane", "ethylhexyl salicylate", "octocrylene", "phenylbenzimidazole sulfonic acid", "methylene bis-benzotriazolyl tetramethylbutylphenol", "drometrizole trisiloxane", "terephthalylidene dicamphor sulfonic acid", "tris-biphenyl triazine", "diethylhexyl butamido triazone", "isoamyl p-methoxycinnamate"], "UV filter", "Absorbs UV light. Allowed in the EU and Korea within set limits. Newer filters like these are well tolerated by most people.", ["restricted"], [], ["SCCS", "EUREG", "MFDS"]],
    ["good", ["bisabolol", "adenosine", "caffeine", "ubiquinone", "ferulic acid", "resveratrol", "camellia sinensis leaf extract", "glycyrrhiza glabra root extract", "dipotassium glycyrrhizate", "ammonium glycyrrhizate", "avena sativa kernel flour", "avena sativa kernel extract", "sodium carboxymethyl betaglucan", "beta-glucan", "zinc pca", "zinc gluconate", "phytic acid", "rosmarinus officinalis leaf extract", "calendula officinalis flower extract", "chamomilla recutita flower extract", "biotin", "scutellaria baicalensis root extract", "nelumbo nucifera flower extract", "nelumbo nucifera leaf extract", "betula platyphylla japonica juice", "betula platyphylla japonica bark extract", "paeonia lactiflora root extract", "paeonia albiflora root extract", "paeonia suffruticosa root extract", "rehmannia glutinosa root extract", "panax ginseng flower extract", "panax notoginseng root extract", "hydrolyzed ginseng saponins"], "Skin-calming or antioxidant active", "Soothes or protects skin. Well tolerated by most people, and allergy is uncommon.", [], ["redness", "lines"], ["CIR", "COSING"]],
    ["good", ["snail secretion filtrate", "houttuynia cordata extract", "artemisia princeps leaf extract", "artemisia vulgaris extract", "panax ginseng root extract", "galactomyces ferment filtrate", "saccharomyces ferment filtrate", "bifida ferment lysate", "lactobacillus ferment", "oryza sativa germ extract", "oryza sativa bran extract", "asiaticoside", "madecassic acid", "asiatic acid", "centella asiatica leaf water"], "Popular K-beauty soothing or hydrating ingredient", "Common in Korean skincare for calming and hydrating. No regulatory concerns, and allergy is rare.", [], ["redness", "dryness"], ["COSING", "MFDS"]],
    ["good", ["ascorbyl glucoside", "magnesium ascorbyl phosphate", "ethyl ascorbic acid", "3-o-ethyl ascorbic acid", "tetrahexyldecyl ascorbate"], "Gentler vitamin C", "A stable vitamin C form that brightens and protects with less stinging than pure ascorbic acid.", [], ["pigmentation", "lines"], ["CIR", "COSING"]],
    ["good", ["alpha-arbutin", "tranexamic acid"], "Brightening active", "Used to fade dark spots. The EU sets a maximum level for alpha-arbutin in face products.", ["restricted"], ["pigmentation"], ["SCCS", "COSING"]],
    ["good", ["azelaic acid"], "Calms redness and breakouts", "Used for acne, redness and dark spots. Can sting a little when you start.", ["irritation"], ["acne", "redness", "pigmentation"], ["COSING", "CIR"]],
    ["good", ["gluconolactone", "lactobionic acid"], "Gentle exfoliating acid (PHA)", "A milder exfoliant than glycolic acid that also hydrates. Usually suits sensitive skin.", [], ["lines", "pigmentation"], ["COSING"]],
    ["good", ["palmitoyl tripeptide-1", "palmitoyl tetrapeptide-7", "acetyl hexapeptide-8", "palmitoyl pentapeptide-4", "copper tripeptide-1", "palmitoyl tripeptide-5", "myristoyl pentapeptide-17", "tripeptide-1"], "Peptide", "Short chains of amino acids used in anti-aging products. Well tolerated, though evidence for results varies.", [], ["lines"], ["COSING"]],
    ["good", ["piroctone olamine"], "Anti-dandruff agent", "Used in dandruff shampoos. The EU caps how much is allowed.", ["restricted"], [], ["SCCS", "EUREG"]],
    ["good", ["coco-glucoside", "decyl glucoside", "lauryl glucoside", "sodium cocoyl glycinate", "sodium cocoyl glutamate", "sodium cocoyl isethionate", "disodium cocoamphodiacetate", "cocamidopropyl hydroxysultaine", "sodium lauroyl glutamate", "cocamide mea", "sodium methyl cocoyl taurate", "sodium taurine cocoyl methyltaurate", "sodium methyl stearoyl taurate", "potassium cocoyl glycinate", "sodium cocoyl alaninate", "lauryl betaine", "lauryl hydroxysultaine", "quillaja saponaria bark extract"], "Mild cleansing agent", "A gentle foaming agent that cleans without stripping as much as sulfates do.", [], [], ["CIR", "COSING"]],
    ["mid", ["isopropyl palmitate", "isopropyl isostearate"], "Can clog pores for some skin", "An emollient rated comedogenic in older tests, so acne-prone skin may prefer to avoid it.", ["comedogenic"], [], ["CIR"]],
    ["mid", ["theobroma cacao seed butter", "cocoa butter"], "Rich butter, can clog pores for some", "Very softening but rated comedogenic in older tests. Acne-prone skin may react.", ["comedogenic"], ["dryness"], ["CIR", "COSING"]],
    ["mid", ["cyclopentasiloxane", "cyclohexasiloxane", "cyclotetrasiloxane"], "Silicone solvent, EU-restricted in rinse-offs", "The EU limits these to 0.1% in rinse-off products because they persist in the environment. Still allowed in leave-on products.", ["restricted"], [], ["EUREG", "SCCS"]],
    ["mid", ["lanolin", "lanolin alcohol"], "Rich emollient, known allergen for some", "Softens very dry skin but is a well-known cause of contact allergy, especially on damaged skin.", ["allergy"], ["dryness"], ["CIR", "COSING"]],
    ["mid", ["propolis extract", "propolis cera"], "Bee product, can cause allergy", "Soothing for some, but propolis is a known contact allergen, especially if you react to bee products or balsam of Peru.", ["allergy"], [], ["COSING", "CIR"]],
    ["mid", ["triethanolamine"], "pH adjuster, EU-regulated", "Used to balance acidity. The EU limits it and advises not to combine it with ingredients that can form nitrosamines. Can irritate sensitive skin.", ["restricted", "irritation"], [], ["EUREG", "SCCS"]],
    ["mid", ["methylparaben", "ethylparaben"], "Preservative, EU-limited", "A preservative the EU allows up to 0.4% each (0.8% total). Debated for hormone-like activity at high doses, though EU scientists consider these limits safe.", ["restricted"], [], ["SCCS", "EUREG", "MFDS"]],
    ["mid", ["propylparaben", "butylparaben"], "Preservative, EU limit lowered", "The EU lowered the limit to 0.14% in 2014 because of hormone-related concerns, and bars them from nappy-area products for children under 3.", ["restricted", "hormone"], [], ["SCCS", "EUREG", "MFDS"]],
    ["mid", ["iodopropynyl butylcarbamate"], "Preservative, restricted", "The EU restricts it and does not allow it in lip products, body lotions or products for children under 3. Can cause contact allergy.", ["allergy", "restricted"], [], ["SCCS", "EUREG"]],
    ["mid", ["cocamide dea"], "Foam booster, cancer concern", "IARC rates it as possibly carcinogenic (group 2B), and DEA-type ingredients can form nitrosamines. Also a skin irritant for some.", ["irritation", "cancer"], [], ["IARC", "EUREG"]],
    ["mid", ["talc"], "Mineral powder, inhalation concern", "IARC rates talc as probably carcinogenic (group 2A). The concern is mainly breathing it in and asbestos contamination in unpurified talc.", ["cancer"], [], ["IARC", "SCCS"]],
    ["mid", ["homosalate", "ethylhexyl methoxycinnamate", "octinoxate"], "UV filter under review", "EU scientists have raised hormone-related concerns about these UV filters, and limits are being tightened. Octinoxate is also restricted in some places to protect reefs.", ["hormone", "restricted"], [], ["SCCS", "EUREG"]],
    ["mid", ["kojic acid"], "Brightening active, restricted", "Used to fade dark spots. The EU allows it up to 1% in face and hand products. Can irritate or cause contact allergy.", ["restricted", "irritation", "allergy"], ["pigmentation"], ["SCCS", "EUREG"]],
    ["mid", ["hamamelis virginiana water", "hamamelis virginiana leaf water", "hamamelis virginiana extract", "hamamelis virginiana leaf extract"], "Witch hazel, astringent", "Tightens and refreshes oily skin, but often contains alcohol and can dry or irritate sensitive skin.", ["irritation", "drying"], [], ["COSING", "CIR"]],
    ["mid", ["camphor"], "Cooling, can irritate", "Gives a cooling or tingling feel. Can irritate sensitive or broken skin.", ["irritation"], [], ["COSING", "CIR"]],
    ["mid", ["terpineol", "pinene", "linalyl acetate", "hexamethylindanopyran", "tetramethyl acetyloctahydronaphthalenes", "acetyl cedrene", "geranyl acetate", "vanillin"], "Fragrance chemical", "Part of a perfume. Not on the EU allergen list, but any fragrance chemical can sensitize some people.", ["allergy"], [], ["COSING"]],
    ["mid", ["citrus aurantium dulcis peel oil", "citrus aurantium peel oil", "citrus limon peel oil", "citrus aurantifolia oil", "citrus aurantifolia peel oil", "citrus grandis peel oil", "citrus aurantium bergamia peel oil", "lavandula angustifolia oil", "melaleuca alternifolia leaf oil", "eucalyptus globulus leaf oil", "pelargonium graveolens oil", "pelargonium graveolens flower oil", "cananga odorata flower oil", "rosa damascena flower oil", "rosmarinus officinalis leaf oil", "citrus aurantium bergamia fruit oil", "anthemis nobilis flower oil", "pinus sylvestris leaf oil", "pinus palustris leaf oil", "leptospermum petersonii oil"], "Essential oil, can cause allergy", "Natural, but essential oils contain fragrance allergens such as limonene and linalool, and citrus oils can make skin sensitive to sun.", ["allergy"], [], ["EUREG", "COSING"]],
    ["mid", ["polymethyl methacrylate", "methyl methacrylate crosspolymer"], "Plastic particles, EU is phasing out", "Tiny plastic particles used for a smooth, blurring feel. The EU is restricting intentionally added microplastics because they persist in the environment.", ["restricted"], [], ["EUREG"]],
    ["mid", ["isopropyl alcohol"], "Drying alcohol", "Evaporates quickly and can dry out or irritate the skin barrier.", ["irritation", "drying"], [], ["COSING", "CIR"]],
    ["bad", ["isopropylparaben", "isobutylparaben", "phenylparaben", "benzylparaben", "pentylparaben"], "Banned in EU cosmetics", "These parabens have been banned in EU cosmetics since 2014 because there was not enough safety data.", ["restricted", "hormone"], [], ["SCCS", "EUREG"]],
    ["bad", ["hydroxyisohexyl 3-cyclohexene carboxaldehyde", "hicc", "lyral"], "Banned fragrance allergen", "A strong fragrance sensitizer that the EU banned in cosmetics in 2021.", ["allergy", "restricted"], [], ["SCCS", "EUREG"]],
    ["bad", ["hydroquinone"], "Not allowed in EU skin lighteners", "A skin-lightening agent the EU does not allow in cosmetics for the skin because of safety concerns, including skin damage with long use.", ["restricted"], [], ["SCCS", "EUREG"]],
    ["bad", ["mercury", "mercurous chloride", "ammoniated mercury", "ammonium mercuric chloride", "mercuric chloride"], "Mercury, banned in cosmetics", "Mercury compounds are banned in skin products in the EU and the US. They are toxic and can damage the kidneys and nerves.", ["restricted"], [], ["SCCS", "EUREG"]]
  ];

  var INDEX = {};
  RAW.forEach(function (r) {
    var entry = {
      level: r[0], family: r[7] || null, note: r[2], detail: r[3], risks: r[4], helps: r[5],
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
      var inNumber = c === "," && /\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || "");
      if ((c === "," || c === ";") && depth === 0 && !inNumber) { out.push(cur); cur = ""; } else { cur += c; }
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // Types of ingredient that are rated as a group instead of one by one (K-beauty formulas are full of them).
  // Checked only when the exact name is not in the list above.
  function typeEntry(level, note, detail, src) {
    return { level: level, note: note, detail: detail, risks: [], helps: [], src: src.map(function (k) { return SOURCES[k]; }) };
  }
  var PEPTIDE = typeEntry("good", "Peptide (rated by type)", "Short chains of amino acids used in anti-aging and firming products. Rated by type, not individually. Generally well tolerated.", ["COSING"]);
  var SILICONE = typeEntry("good", "Silicone (rated by type)", "Silicones smooth skin and make products glide. Rated by type, not individually. Most are considered safe in cosmetics.", ["CIR", "COSING"]);
  var ETHOXY = typeEntry("good", "Emulsifier or solubilizer (rated by type)", "Helps oil and water mix. Rated by type, not individually. Considered safe when manufacturers keep impurities such as 1,4-dioxane low.", ["CIR", "COSING"]);
  var POLYMER = typeEntry("good", "Texture polymer (rated by type)", "Thickens or stabilizes the formula. Rated by type, not individually. Generally well tolerated.", ["CIR", "COSING"]);
  var ESTER = typeEntry("good", "Emollient ester (rated by type)", "Softens skin and improves the feel of a product. Rated by type, not individually. Generally well tolerated.", ["CIR", "COSING"]);
  var PLANT = typeEntry("good", "Plant extract or ferment (rated by type)", "A botanical extract or ferment used to soothe, hydrate or protect. Rated by type, not individually: most are low-risk, but any plant can cause an allergy in some people.", ["COSING"]);
  var PLANT_OIL = typeEntry("good", "Plant oil or butter (rated by type)", "A carrier oil or butter that softens skin. Rated by type, not individually. Nut and seed oils matter if you have that allergy.", ["CIR", "COSING"]);
  var PATTERNS = [
    [/peptide-\d+/, PEPTIDE],
    [/(methicone|siloxane|silsesquioxane|dimethicone|silicone|silanol)/, SILICONE, /cyclo/],
    [/^(peg|ppg)[-\/ ]?\d|^[a-z]+eth-\d+|^polysorbate|^poloxamer|^polyglyceryl-\d+/, ETHOXY],
    [/(acrylate|acrylamide|acryloyldimethyl|copolymer|crosspolymer|^polyquaternium)/, POLYMER],
    [/(seed|kernel|nut|germ) oil$|butter$/, PLANT_OIL],
    [/(extract|ferment filtrate|ferment lysate|ferment|juice|protoplasts)$|(leaf|flower|root|fruit|bark|seed|stem|bulb|rhizome|sprout|shoot) (water|powder)$/, PLANT],
    [/(ethylhexanoate|isostearate|laurate|myristate|palmitate|stearate|oleate|dilinoleate|caprate|caprylate|adipate|sebacate|succinate|malate|trimellitate|glutamate)$/, ESTER, /^(sodium|potassium|calcium|magnesium|zinc|ammonium|aluminum)/]
  ];

  // Try the full name, then the name without parentheses, then each parenthetical, then tidied-up spellings
  // (OCR often leaves "peg - 100" or splits a word), then each part of "a / b", then the type rules.
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
    var tidy = [noParen.replace(/\s*-\s*/g, "-"), noParen.replace(/\s+-\s+/g, ""), noParen.replace(/\s*\/\s*/g, "/")];
    for (var t = 0; t < tidy.length; t++) if (INDEX[tidy[t]]) return INDEX[tidy[t]];
    if (/\//.test(noParen)) {
      var parts = noParen.split("/");
      for (var q = 0; q < parts.length; q++) { var part = parts[q].trim(); if (INDEX[part]) return INDEX[part]; }
    }
    if (/hyaluron/.test(noParen)) return INDEX["hyaluronic acid"];
    var name = tidy[0];
    for (var k = 0; k < PATTERNS.length; k++) {
      if (PATTERNS[k][0].test(name) && !(PATTERNS[k][2] && PATTERNS[k][2].test(name))) return PATTERNS[k][1];
    }
    return null;
  }

  // Score: start at 100, -18 per flag, -6 per watch. Needs at least 3 rated ingredients.
  // A fragrance and the allergens declared inside it are ONE problem, so together they cost at most 30 points
  // (18 for the first, 3 for each extra allergen). Any flagged ingredient caps the score at 75,
  // so a product with a flag can never be "Excellent".
  function analyze(text) {
    var items = split(text || "").map(function (raw) {
      var hit = lookup(raw);
      var name = raw.replace(/\*/g, "").trim();
      return hit
        ? { name: name, level: hit.level, family: hit.family || null, note: hit.note, detail: hit.detail, risks: hit.risks, helps: hit.helps, src: hit.src }
        : { name: name, level: null, family: null, note: "", detail: "", risks: [], helps: [], src: [] };
    });
    var n = { good: 0, mid: 0, bad: 0, none: 0 };
    var fragrance = 0, otherBad = 0;
    items.forEach(function (i) {
      n[i.level || "none"]++;
      if (i.level === "bad") { if (i.family === "fragrance") fragrance++; else otherBad++; }
    });
    var penalty = 18 * otherBad + 6 * n.mid + (fragrance ? Math.min(30, 18 + 3 * (fragrance - 1)) : 0);
    var rated = n.good + n.mid + n.bad;
    var cap = n.bad > 0 ? 75 : 100;
    var score = rated >= 3 ? Math.max(0, Math.min(cap, 100 - penalty)) : null;
    return { items: items, counts: n, score: score };
  }

  window.Ingredients = { analyze: analyze, split: split, RISK_LABEL: RISK_LABEL };
})();
