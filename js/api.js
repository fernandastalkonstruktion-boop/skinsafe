// Open Beauty Facts (free, no key): look a product up by barcode, or search by name.
(function () {
  var BASE = "https://world.openbeautyfacts.org/api/v2/product/";
  var SEARCH = "https://world.openbeautyfacts.org/cgi/search.pl";
  var FIELDS = "code,product_name,brands,ingredients_text,ingredients_text_en,image_front_small_url";

  function toProduct(p, fallbackCode) {
    return {
      code: p.code || fallbackCode || "",
      brand: p.brands ? p.brands.split(",")[0].trim() : "",
      name: p.product_name || "Unnamed product",
      image: p.image_front_small_url || "",
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
    return next().then(function (p) { return p ? toProduct(p, code) : null; });
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
        var all = j.products || [];
        var rated = all.map(function (p) { return toProduct(p); }).filter(function (p) { return p.ingredientsText; });
        return { total: Number(j.count) || all.length, products: rated, withoutIngredients: all.length - rated.length };
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
  function flat(s) { return String(s).toLowerCase().replace(/[^a-z0-9À-ɏ가-힯\s]/g, ""); }
  function loadShop() {
    if (!shopPromise) {
      var meta = document.querySelector('meta[name="app-version"]');
      var v = meta ? meta.getAttribute("content") : "dev";
      shopPromise = fetch("data/catalog.json?v=" + encodeURIComponent(v))
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (j) {
          return (j.products || []).map(function (p) {
            return {
              code: p.barcode || "", brand: p.brand, name: p.name, image: "", ingredientsText: p.ingredients,
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
          return words.every(function (w) { return p.hay.indexOf(w) > -1 || squashed.indexOf(w) > -1; });
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
    words(text).forEach(function (w) { if (w.length >= 3 && !/^\d+$/.test(w) && tokens.indexOf(w) < 0) tokens.push(w); });
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
      return { tokens: tokens, matches: scored.slice(0, 6).map(function (x) { return x.p; }) };
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
