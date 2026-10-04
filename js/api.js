// Open Beauty Facts (free, no key): look a product up by barcode, or search by name.
(function () {
  var BASE = "https://world.openbeautyfacts.org/api/v2/product/";
  var SEARCH = "https://world.openbeautyfacts.org/cgi/search.pl";
  var FIELDS = "code,product_name,product_name_en,product_name_es,lang,brands,ingredients_text,ingredients_text_en,image_front_url";

  // Name language rule: Spanish stays Spanish, every other language is shown in English.
  // Open Beauty Facts often has an English name (product_name_en); if not, translate generic words.
  // Open Beauty Facts mislabels languages (a Turkish name tagged "en"), so the tag is only trusted for Spanish.
  // Brand and line names (Elvive, Effaclar...) are never in the dictionary, so they pass through untouched.
  var STEMS = {
    // Dutch
    schuimende: "foaming", schuimend: "foaming", schuim: "foam", reinigings: "cleansing", reiniging: "cleansing", reinigende: "cleansing", reiniger: "cleanser",
    hydraterende: "hydrating", hydraterend: "hydrating", verbeterende: "repairing", herstellende: "repairing", verzorging: "care", verzorgende: "caring",
    melk: "lotion", olie: "oil", gezichts: "face", gezicht: "face", oog: "eye", ogen: "eye", handen: "hand", lichaams: "body", lichaam: "body",
    zonnebrand: "sun", zonne: "sun", zon: "sun", bescherming: "protection", beschermen: "protection", dagelijkse: "daily", dag: "day", nacht: "night", huid: "skin",
    droge: "dry", gevoelige: "sensitive", onzuiverheden: "blemish", geconcentreerde: "concentrated", haar: "hair", masker: "mask", zeep: "soap",
    wasgel: "wash gel", verzachtende: "soothing", kalmerende: "soothing", tandpasta: "toothpaste", handzeep: "hand soap", douche: "shower", antitranspirant: "antiperspirant",
    micellair: "micellar", water: "water", mannen: "men", vrouwen: "women", bodyspray: "body spray", crme: "cream",
    // French
    lait: "milk", nettoyant: "cleanser", moussant: "foaming", hydratant: "moisturizing", hydratante: "moisturizing", huile: "oil", visage: "face", mains: "hands", yeux: "eye",
    contour: "contour", "réparatrice": "repairing", apaisant: "soothing", soin: "care", quotidien: "daily", peau: "skin", peaux: "skin", "sèche": "dry", "sèches": "dry",
    protecteur: "protective", solaire: "sun", shampooing: "shampoo", shampoing: "shampoo", masque: "mask", gommage: "scrub", micellaire: "micellar",
    "démaquillant": "makeup remover", lavant: "wash", corps: "body", cheveux: "hair", baume: "balm", "sérum": "serum", "déodorant": "deodorant", deodorant: "deodorant",
    transpirant: "antiperspirant", antitranspirant: "antiperspirant", doux: "gentle", douce: "gentle", dentifrice: "toothpaste", savon: "soap", nourrissante: "nourishing",
    nourrissant: "nourishing", "fraîcheur": "freshness", "karité": "shea", "lèvres": "lips", "lèvre": "lip", vaisselle: "dish", liquide: "liquid", blancheur: "whitening",
    naturelle: "natural", "très": "very", "bébé": "baby", lavande: "lavender", "cèdre": "cedar", vert: "green", rasage: "shaving",
    // German
    reinigungs: "cleansing", feuchtigkeits: "moisturizing", feuchtigkeitsspendende: "moisturizing", pflege: "care", tages: "day", "körper": "body",
    haut: "skin", trockene: "dry", empfindliche: "sensitive", sonnen: "sun", schutz: "protection", seife: "soap", zahnpasta: "toothpaste", zahncreme: "toothpaste",
    duschgel: "shower gel", handcreme: "hand cream", "mundspülung": "mouthwash", toilettenpapier: "toilet paper", schuppen: "dandruff", kamille: "chamomile",
    milde: "mild", frische: "fresh", duft: "scent", dusche: "shower", intensiv: "intensive", sensitiv: "sensitive", haarspray: "hair spray", "spülung": "conditioner",
    lippenpflege: "lip care", lippen: "lip", deo: "deodorant", "flüssigseife": "liquid soap", "öl": "oil", kinder: "kids", bodylotion: "body lotion", haarfarbe: "hair color",
    // Scandinavian
    tannkrem: "toothpaste", "tandkräm": "toothpaste", "håndsåpe": "hand soap", "håndsæbe": "hand soap", "hårfarge": "hair color", "hårfarve": "hair color",
    barberskum: "shaving foam", "såpe": "soap", "sæbe": "soap", "tvål": "soap", "hårbalsam": "conditioner", solkrem: "sunscreen", ansiktskrem: "face cream", kroppslotion: "body lotion",
    // Turkish
    "şampuan": "shampoo", "şampuanı": "shampoo", "saç": "hair", krem: "cream", kremi: "cream", nemlendirici: "moisturizing", "yüz": "face", temizleyici: "cleanser",
    jel: "gel", jeli: "gel", losyon: "lotion", losyonu: "lotion", losyo: "lotion", "bakım": "care", "güneş": "sun", sabun: "soap", maske: "mask", "vücut": "body", "yağ": "oil", "yağı": "oil",
    "onarıcı": "repairing", kuru: "dry", hassas: "sensitive", "günlük": "daily", gece: "night", "gündüz": "day", durulama: "rinse", "koruyucu": "protective",
    "sülfatsız": "sulfate-free", dudak: "lip", "balmı": "balm", "doğal": "natural", karanfil: "clove", "özlü": "extract", "sıvı": "liquid", leke: "spot", koyu: "dark",
    "kadın": "women", erkek: "men", sprey: "spray", cilt: "skin", ciltler: "skin", besleyici: "nourishing", nane: "mint", "ağız": "mouth",
    suyu: "water", "çıkarıcı": "remover", "sütü": "milk", pamuk: "cotton", mucizevi: "miracle", "duş": "shower", taze: "fresh", macunu: "paste",
    // Italian and Portuguese
    detergente: "cleanser", idratante: "hydrating", viso: "face", mani: "hands", corpo: "body", schiuma: "foam", olio: "oil", latte: "milk", pelle: "skin",
    limpeza: "cleansing", rosto: "face", sabonete: "soap", "óleo": "oil", protetor: "protector", dentifricio: "toothpaste", acqua: "water", micellare: "micellar",
    carbone: "charcoal", vegetale: "vegetable", sapone: "soap", doccia: "shower", condicionador: "conditioner", "loção": "lotion", roxa: "purple", creme: "cream",
    // Czech and Polish
    "šampon": "shampoo", szampon: "shampoo", "zubní": "dental", pasta: "paste", "uhlím": "charcoal", "černým": "black", "mydło": "soap", "odżywka": "conditioner", "żel": "gel",
    frais: "fresh", fraiche: "fresh", verveine: "verbena", nagellack: "nail polish", "kräuter": "herbal", minze: "mint", "wattestäbchen": "cotton swabs", mouchoirs: "tissues",
    sonnenfluid: "sun fluid", "yoğun": "intense", sabonetes: "soaps", protezione: "protection", thermale: "thermal", riche: "rich",
    femme: "women", fleur: "flower", fleurs: "flowers", douceur: "gentle", menthe: "mint", riche: "rich", solide: "solid", bille: "roll-on", naturelle: "natural", naturel: "natural", blancheur: "whitening", surgras: "superfatted", citron: "lemon", dynamisant: "energizing", exaltant: "invigorating", "vitalité": "vitality", "complète": "complete", einziehende: "fast-absorbing", sofort: "instant", liquide: "liquid", "protecteur": "protective", nutrition: "nutrition", "unifiante": "evening", "éclaircissante": "brightening", "hydroalcoolique": "hydroalcoholic", transpirants: "antiperspirant", "anti-transpirant": "antiperspirant",
    // connecting words
    "für": "for", pour: "for", voor: "for", "için": "for", ve: "and", und: "and", ile: "with", mit: "with", avec: "with",
    // shared
    gel: "gel", lotion: "lotion", shampoo: "shampoo", shampo: "shampoo", conditioner: "conditioner", serum: "serum", scrub: "scrub", anti: "anti", spray: "spray"
  };
  // Multi-word phrases where word-by-word order or meaning would be wrong (plain, lowercase, no accents).
  var PHRASES = {
    "apres shampoing": "conditioner", "apres shampooing": "conditioner", "gel douche": "shower gel", "eau micellaire": "micellar water", "lait corporel": "body lotion",
    "creme mains": "hand cream", "creme visage": "face cream", "creme jour": "day cream", "creme nuit": "night cream", "creme de jour": "day cream", "creme de nuit": "night cream",
    "dis macunu": "toothpaste", "hindistan cevizi": "coconut", "taze nane": "fresh mint", "the vert": "green tea", "acqua micellare": "micellar water", "bagno schiuma": "bubble bath",
    "pasta do zebow": "toothpaste", "zubni pasta": "toothpaste", "sampon na vlasy": "hair shampoo", "liquide vaisselle": "dish liquid"
  };
  // French/Italian put the noun first ("Crème Mains" = hand cream); these move to the end of a translated run.
  var HEADS = { creme: 1, lait: 1, nettoyant: 1, huile: 1, baume: 1, gommage: 1, masque: 1, soin: 1, lavant: 1, savon: 1, olio: 1, latte: 1, sapone: 1, detergente: 1 };
  // Words that tell us a name is already Spanish: it stays as is (no articles; those overlap French and Italian).
  var SPANISH = ("crema manos ojos unas pestanas sombras aceite hidratante desodorante champu acondicionador mascarilla locion cabello piel labios labial jabon mujer hombre " +
    "brillo laca bucal bano perfilador tratamiento esmalte pintalabios protector cuerpo rostro facial toallitas dientes dental limpiador desmaquillante espuma depilar").split(" ")
    .reduce(function (o, w) { o[w] = 1; return o; }, {});
  var STEM_KEYS = Object.keys(STEMS).sort(function (a, b) { return b.length - a.length; });
  function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  // Letters like ı, ø, ł, đ do not decompose, so map them by hand before matching.
  function plain(s) { return stripAccents(s.toLowerCase()).replace(/ı/g, "i").replace(/ø/g, "o").replace(/ł/g, "l").replace(/đ/g, "d").replace(/ß/g, "ss").replace(/[^a-z]/g, ""); }
  var STEM_PLAIN = STEM_KEYS.map(function (k) { return { plain: plain(k), out: STEMS[k] }; });
  var STEM_BY_PLAIN = {}; STEM_PLAIN.forEach(function (m) { if (!STEM_BY_PLAIN[m.plain]) STEM_BY_PLAIN[m.plain] = m; });
  function translateWord(w) {
    var lw = plain(w), i = 0, out = [];
    if (!lw) return null;
    function stemAt(pos) { for (var k = 0; k < STEM_PLAIN.length; k++) if (lw.indexOf(STEM_PLAIN[k].plain, pos) === pos) return STEM_PLAIN[k]; return null; }
    while (i < lw.length) {
      var m = stemAt(i);
      if (!m) return null;
      out.push(m.out); i += m.plain.length;
      // Skip a linking letter between compound parts (Dutch/German "reinigings-gel", "gezichts-creme").
      if (i < lw.length && !stemAt(i)) {
        var link = /^(s|en|e)/.exec(lw.slice(i));
        if (link && stemAt(i + link[0].length)) i += link[0].length;
      }
    }
    return out.join(" ");
  }
  var cap = function (t) { return t.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  function translateName(name) {
    // Keep the original separators (hyphens, slashes) and punctuation; only the words change.
    var parts = name.split(/([\s\-\/]+)/), items = [];
    for (var q = 0; q < parts.length; q += 2) if (parts[q]) items.push({ w: parts[q], sep: parts[q + 1] || "" });
    var pl = items.map(function (it) { return plain(it.w); });
    // A name that already contains Spanish words is left alone.
    if (pl.some(function (t) { return SPANISH[t]; })) return name;
    var res = [], changed = false, i = 0;
    while (i < items.length) {
      var phrase = null;
      for (var n = 3; n >= 2 && !phrase; n--) {
        if (i + n <= items.length && PHRASES[pl.slice(i, i + n).join(" ")]) phrase = { out: PHRASES[pl.slice(i, i + n).join(" ")], len: n };
      }
      if (phrase) { res.push({ t: cap(phrase.out), tr: true, src: "", sep: items[i + phrase.len - 1].sep }); i += phrase.len; changed = true; continue; }
      var w = items[i].w, core = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), at = w.indexOf(core);
      var tw = core ? translateWord(core.replace(/[^\p{L}]/gu, "")) : null;
      if (tw) {
        if (tw.toLowerCase() !== core.toLowerCase()) changed = true;
        res.push({ t: w.slice(0, at) + cap(tw) + w.slice(at + core.length), tr: true, src: pl[i], sep: items[i].sep });
      } else res.push({ t: w, tr: false, src: pl[i], sep: items[i].sep });
      i++;
    }
    if (!changed) return name;
    // "Anti-Transpirant" is already "antiperspirant"; "Men Erkek" says men twice.
    res = res.filter(function (r, k) {
      var next = res[k + 1];
      if (r.tr && /^anti$/i.test(r.t) && next && /^antiperspirant/i.test(next.t)) return false;
      return !(k > 0 && r.tr && res[k - 1].t.toLowerCase().replace(/\W/g, "") === r.t.toLowerCase().replace(/\W/g, ""));
    });
    // Noun-first languages: move the head noun after the words translated together with it.
    for (var h = 0; h < res.length; h++) {
      if (!HEADS[res[h].src] || !res[h].tr) continue;
      var e = h;
      while (e + 1 < res.length && res[e + 1].tr) e++;
      if (e > h) res.splice(e, 0, res.splice(h, 1)[0]);
    }
    return res.map(function (r, k) { return r.t + (k < res.length - 1 ? (r.sep || " ") : ""); }).join("");
  }
  // Names translated once by hand (data/names.json, built by tools/names/*): checked BEFORE the dictionary.
  // Key = lowercase name with collapsed spaces. Loaded lazily; until it loads the dictionary still works.
  var NAMES = {}, namesPromise = null;
  function nameKey(s) { return s.toLowerCase().replace(/\s+/g, " ").trim(); }
  function loadNames() {
    if (!namesPromise) {
      var meta = document.querySelector('meta[name="app-version"]');
      var v = meta ? meta.getAttribute("content") : "dev";
      namesPromise = fetch("data/names.json?v=" + encodeURIComponent(v))
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (j) { NAMES = j.names || {}; })
        .catch(function () { namesPromise = null; });
    }
    return namesPromise;
  }
  function displayName(p) {
    var lang = p.lang || "", en = (p.product_name_en || "").trim(), es = (p.product_name_es || "").trim(), raw = (p.product_name || "").trim();
    if (lang === "es") return raw || es || en;
    var latin = function (t) { return t && !/[^\u0000-\u024F\u1E00-\u1EFF]/.test(t); };
    var cands = [en, raw, es].filter(Boolean);
    var base = cands.filter(latin)[0] || cands[0] || "";
    if (!base) return "";
    var hit = NAMES[nameKey(base)];
    if (hit) return hit;
    return latin(base) ? translateName(base) : "";
  }
  window.ProductName = { display: displayName, translate: translateName, setNames: function (o) { NAMES = o || {}; }, load: loadNames };

  function toProduct(p, fallbackCode) {
    return {
      code: p.code || fallbackCode || "",
      brand: p.brands ? p.brands.split(",")[0].trim() : "",
      name: displayName(p) || "Unnamed product",
      image: p.image_front_url || "",
      ingredientsText: p.ingredients_text_en || p.ingredients_text || ""
    };
  }

  function candidates(code) {
    var list = [code];
    // UPC-A (12 digits) is stored as EAN-13 with a leading zero.
    if (code.length === 12) list.push("0" + code);
    if (code.length === 13 && code[0] === "0") list.push(code.slice(1));
    return list;
  }

  function fetchOne(code) {
    return fetch(BASE + encodeURIComponent(code) + ".json?fields=" + FIELDS)
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (j) { return j && j.status === 1 && j.product ? j.product : null; });
  }

  function lookup(code) {
    var tries = candidates(code);
    var i = 0;
    function next() {
      if (i >= tries.length) return Promise.resolve(null);
      return fetchOne(tries[i++]).then(function (p) { return p || next(); });
    }
    return next().then(function (p) { return p ? loadNames().then(function () { return toProduct(p, code); }) : null; });
  }

  // Search by name. Only products that have an ingredient list can be rated, so the others are counted, not listed.
  function search(query) {
    var url = SEARCH + "?search_terms=" + encodeURIComponent(query) +
      "&search_simple=1&action=process&json=1&page_size=30&fields=" + FIELDS;
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (j) {
        return loadNames().then(function () {
          var all = j.products || [];
          var rated = all.map(function (p) { return toProduct(p); }).filter(function (p) { return p.ingredientsText; });
          return { total: Number(j.count) || all.length, products: rated, withoutIngredients: all.length - rated.length };
        });
      });
  }

  // Products the person teaches the app by photographing the ingredient list. Stored only on this phone,
  // keyed by barcode, and checked BEFORE the online database so a re-scan finds them instantly.
  var CKEY = "skinsafe.catalog";
  function loadCatalog() {
    try {
      var o = JSON.parse(localStorage.getItem(CKEY) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  var Catalog = {
    get: function (code) {
      var c = loadCatalog();
      var tries = candidates(String(code));
      for (var i = 0; i < tries.length; i++) if (c[tries[i]]) return c[tries[i]];
      return null;
    },
    all: function () { var c = loadCatalog(); return Object.keys(c).map(function (k) { return c[k]; }); },
    put: function (p) {
      if (!p.code) return;
      var c = loadCatalog();
      c[p.code] = { code: p.code, brand: p.brand || "", name: p.name, image: p.image || "", ingredientsText: p.ingredientsText, local: true, savedAt: Date.now() };
      if (p.shop) { c[p.code].shop = true; c[p.code].linked = !!p.linked; c[p.code].partial = !!p.partial; c[p.code].note = p.note || ""; c[p.code].source = p.source || ""; }
      var keys = Object.keys(c);
      if (keys.length > 300) {
        keys.sort(function (a, b) { return c[a].savedAt - c[b].savedAt; });
        keys.slice(0, keys.length - 300).forEach(function (k) { delete c[k]; });
      }
      try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) {}
    },
    search: function (query) {
      var words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
      var c = loadCatalog();
      return Object.keys(c).map(function (k) { return c[k]; })
        .filter(function (p) { var hay = (p.brand + " " + p.name).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) > -1; }); })
        .sort(function (a, b) { return b.savedAt - a.savedAt; });
    }
  };

  // Shared catalog of products we looked up ourselves (data/catalog.json, built by tools/build_catalog.py).
  // Loaded once, on first search. Matches brand, name and alternate names, ignoring punctuation and spacing (Medipeel = Medi-Peel).
  var shopPromise = null;
  function flat(s) { return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\uac00-\ud7af\s]/g, ""); }
  // Everyday Spanish / French words people type or that are printed on Mexican packages, mapped to the English words used in product names.
  var SYN = { champu: "shampoo", shampooing: "shampoo", acondicionador: "conditioner", apres: "conditioner", fondant: "conditioner", mascarilla: "mask", masque: "mask", masquintense: "mask", crema: "cream", creme: "cream", jabon: "soap", savon: "soap", aceite: "oil", huile: "oil", solar: "sunscreen", protector: "sunscreen", limpiador: "cleanser", hidratante: "moisturizing", micelar: "micellar", agua: "water", locion: "lotion", talco: "talcum", rimel: "mascara", pestanas: "lash", cabello: "hair", pelo: "hair", caida: "loss", tratamiento: "treatment", espuma: "mousse", bain: "shampoo", gel: "gel" };
  function withSyn(list) {
    var out = list.slice();
    list.forEach(function (w) { if (SYN[w] && out.indexOf(SYN[w]) < 0) out.push(SYN[w]); });
    return out;
  }
  function loadShop() {
    if (!shopPromise) {
      var meta = document.querySelector('meta[name="app-version"]');
      var v = meta ? meta.getAttribute("content") : "dev";
      shopPromise = fetch("data/catalog.json?v=" + encodeURIComponent(v))
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (j) {
          return (j.products || []).map(function (p) {
            return {
              code: p.barcode || "", brand: p.brand, name: p.name, image: p.image || "", ingredientsText: p.ingredients,
              shop: true, partial: !!p.partial, note: p.note || "", source: p.source,
              hay: flat(p.brand + " " + p.name + " " + (p.aliases || []).join(" "))
            };
          });
        })
        .catch(function () { shopPromise = null; return []; });
    }
    return shopPromise;
  }
  var Shop = {
    load: loadShop,
    byCode: function (code) {
      var tries = candidates(String(code));
      return loadShop().then(function (list) {
        for (var i = 0; i < list.length; i++) if (list[i].code && tries.indexOf(list[i].code) > -1) return list[i];
        return null;
      });
    },
    search: function (query) {
      var words = flat(query).split(/\s+/).filter(Boolean);
      return loadShop().then(function (list) {
        if (!words.length) return [];
        return list.filter(function (p) {
          var squashed = p.hay.replace(/\s+/g, "");
          return words.every(function (w) { var alt = SYN[w]; return p.hay.indexOf(w) > -1 || squashed.indexOf(w) > -1 || (alt && p.hay.indexOf(alt) > -1); });
        });
      });
    }
  };


  // Work out which product a photo shows from the words printed on it (OCR text). Scores every product by how many of
  // its brand/name words were read, giving rare words more weight. Tolerates one-letter reading mistakes.
  function words(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  }
  function close(a, b) {
    if (a === b) return true;
    if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, miss = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++miss > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return miss + (a.length - i) + (b.length - j) <= 1;
  }
  Shop.identify = function (text) {
    var tokens = [];
    withSyn(words(text)).forEach(function (w) { if (w.length >= 3 && !/^\d+$/.test(w) && tokens.indexOf(w) < 0) tokens.push(w); });
    return loadShop().then(function (list) {
      var pool = list.concat(Catalog.all().map(function (p) { return { brand: p.brand, name: p.name, code: p.code, image: p.image, ingredientsText: p.ingredientsText, local: true, shop: p.shop, partial: p.partial, note: p.note, source: p.source, linked: p.linked, hay: flat(p.brand + " " + p.name) }; }));
      var docs = pool.map(function (p) { return { p: p, w: words(p.hay) }; });
      var df = {};
      docs.forEach(function (d) { var seen = {}; d.w.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
      var N = docs.length || 1;
      function idf(w) { return Math.log(N / ((df[w] || 0) + 1)) + 1; }
      var scored = docs.map(function (d) {
        var score = 0, hits = 0, brandWords = words(d.p.brand || ""), brandHit = 0;
        d.w.forEach(function (hw) {
          for (var i = 0; i < tokens.length; i++) {
            if (close(tokens[i], hw)) { score += idf(hw); hits++; if (brandWords.indexOf(hw) > -1) brandHit++; break; }
          }
        });
        if (brandWords.length && brandHit === brandWords.length) score += 2;
        return { p: d.p, score: score, hits: hits, brand: brandWords.length && brandHit === brandWords.length };
      }).filter(function (x) { return x.score >= 4 && (x.hits >= 2 || x.brand); });
      scored.sort(function (a, b) { return b.score - a.score; });
      var top = scored.slice(0, 6);
      return { tokens: tokens, matches: top.map(function (x) { return x.p; }), evidence: top.map(function (x) { return { hits: x.hits, brand: x.brand, score: x.score }; }) };
    });
  };

  // Brand-level facts we checked ourselves (data/brands.json, built by tools/build_brands.py): cruelty-free certifications.
  var brandMap = null;
  function loadBrands() {
    var meta = document.querySelector('meta[name="app-version"]');
    var v = meta ? meta.getAttribute("content") : "dev";
    return fetch("data/brands.json?v=" + encodeURIComponent(v))
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (j) { brandMap = j && j.brands ? j.brands : {}; return brandMap; })
      .catch(function () { brandMap = {}; return brandMap; });
  }
  var Brands = {
    load: loadBrands,
    // Returns {status, source} when this brand is certified by Leaping Bunny or PETA, otherwise null.
    get: function (brand) {
      if (!brandMap || !brand) return null;
      return brandMap[flat(brand).replace(/\s+/g, "")] || null;
    }
  };

  window.OBF = { lookup: lookup, search: search };
  window.Catalog = Catalog;
  window.Shop = Shop;
  window.Brands = Brands;
})();
