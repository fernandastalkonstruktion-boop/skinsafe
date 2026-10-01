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

  window.OBF = { lookup: lookup, search: search };
})();
