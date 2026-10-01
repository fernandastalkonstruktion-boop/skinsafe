// Product alerts: official recalls and, under strict rules, major litigation.
//
// RULES (Fernanda, 1 Oct 2026)
// 1. "recall": a regulator (FDA, EU Safety Gate, Korea MFDS, Health Canada) published a recall or alert for it.
//    These are facts. Link the official notice and give its date.
// 2. "litigation": ALL of these must be true, otherwise it does not go in:
//    a) a court has consolidated many cases from different people (MDL or class action), not one or two suits;
//    b) there is published science behind the claim (IARC classification, a regulator finding or peer-reviewed
//       studies), so the claim is plausible and not just a claim for money;
//    c) the case was not dismissed.
//    It is always labeled "not proven" and shows WHY it is shown. Companies' denials are reported too.
// 3. Matching is by brand AND product-name keywords (never the whole brand), and it does not know lot numbers
//    or manufacture dates, so every alert tells the user to check the official notice.
// 4. Sources: regulators, courts and neutral press. Not brands, not law-firm marketing, not advocacy groups.
(function () {
  var ALERTS = [
    {
      id: "unilever-dry-shampoo-2022",
      kind: "recall",
      date: "Oct 18, 2022",
      title: "Dry shampoo recalled for benzene",
      text: "Unilever recalled certain aerosol dry shampoos made before October 2021 because benzene, a known carcinogen, was found in the propellant. Only specific lot codes were recalled, so check the official notice.",
      targets: [{ brands: ["dove", "nexxus", "suave", "tresemm", "tigi", "bed head", "rockaholic"], names: ["dry shampoo"] }],
      sources: [{ name: "FDA recall notice", url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/unilever-issues-voluntary-us-recall-select-dry-shampoos-due-potential-presence-benzene" }]
    },
    {
      id: "jj-aerosol-sunscreen-2021",
      kind: "recall",
      date: "Jul 14, 2021",
      title: "Aerosol sunscreen recalled for benzene",
      text: "Johnson & Johnson Consumer Inc. recalled all lots of five aerosol sunscreens after low levels of benzene were found in some samples. The company said daily exposure at those levels was not expected to cause harm.",
      targets: [{ brands: ["neutrogena", "aveeno"], names: ["aerosol", "spray", "beach defense", "cool dry sport", "invisible daily", "ultra sheer", "protect + refresh"] }],
      sources: [{ name: "FDA recall notice", url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/johnson-johnson-consumer-inc-issues-voluntary-recall-specific-neutrogenar-and-aveenor-aerosol" }]
    },
    {
      id: "fda-bpo-acne-2025",
      kind: "recall",
      date: "Mar 11, 2025",
      title: "Acne product recalled for benzene",
      text: "After testing 95 acne products, the FDA reported elevated benzene in six, and they were recalled. The FDA also said more than 90% of the products tested had undetectable or extremely low levels, and that the cancer risk from using these products daily for decades is very low.",
      targets: [
        { brands: ["la roche"], names: ["effaclar duo"] },
        { brands: ["walgreens"], names: ["acne control cleanser", "tinted acne treatment"] },
        { brands: ["proactiv"], names: ["emergency blemish relief", "skin smoothing exfoliator"] },
        { brands: ["slmd"], names: ["benzoyl peroxide acne lotion"] },
        { brands: ["zapzyt"], names: ["acne treatment gel"] }
      ],
      sources: [{ name: "FDA statement", url: "https://www.fda.gov/drugs/drug-alerts-and-statements/limited-number-voluntary-recalls-initiated-after-fda-testing-acne-products-benzene-findings-show" }]
    },
    {
      id: "hair-relaxer-mdl-3060",
      kind: "litigation",
      date: "Pending",
      title: "Hair relaxers: lawsuits, not proven",
      text: "Thousands of women have sued relaxer makers, alleging the products caused uterine cancer and fibroids. A federal court has consolidated the cases (MDL 3060, more than 9,800 pending in January 2025) and has not decided the claims yet. The companies are defendants and the claims are unproven.",
      why: "Shown because the court grouped many cases from different people, and a large US government study (NIH Sister Study, 2022) linked frequent use of hair straighteners to a higher risk of uterine cancer.",
      targets: [{ brands: ["l'oréal", "l'oreal", "revlon", "soft sheen", "softsheen", "carson", "strength of nature", "dabur", "godrej", "namaste"], names: ["relaxer", "straightener", "straightening"] }],
      sources: [
        { name: "Court docket count (JPML)", url: "https://jpml.uscourts.gov/sites/jpml/files/Pending_MDL_Dockets_By_Actions_Pending-January-2-2025.pdf" },
        { name: "Research (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/?term=hair+straighteners+uterine+cancer" }
      ]
    },
    {
      id: "jj-talc-baby-powder",
      kind: "litigation",
      date: "Pending",
      title: "Talc baby powder: lawsuits, not proven",
      text: "Thousands of people have sued Johnson & Johnson, alleging its talc-based baby powder caused cancer through asbestos contamination. Some cases have gone to trial and the company denies the claims. J&J stopped selling talc-based Baby Powder worldwide in 2023.",
      why: "Shown because courts grouped thousands of cases, and IARC (WHO) rates talc as probably carcinogenic, mainly through inhalation and asbestos contamination.",
      targets: [{ brands: ["johnson"], names: ["baby powder"] }],
      sources: [
        { name: "IARC (WHO)", url: "https://monographs.iarc.who.int/list-of-classifications" },
        { name: "News report (ABC13)", url: "https://abc13.com/baby-powder-ovarian-cancer-lawsuit-jury/3757488/" }
      ]
    }
  ];

  function norm(s) { return String(s || "").toLowerCase(); }

  // Returns the alerts that apply to a product (brand and product-name keywords must both match).
  function match(product) {
    var brand = norm(product.brand) + " " + norm(product.name);
    var name = norm(product.name);
    return ALERTS.filter(function (a) {
      return a.targets.some(function (t) {
        return t.brands.some(function (b) { return brand.indexOf(b) > -1; }) &&
               t.names.some(function (n) { return name.indexOf(n) > -1; });
      });
    });
  }

  window.Alerts = { match: match, ALL: ALERTS };
})();
