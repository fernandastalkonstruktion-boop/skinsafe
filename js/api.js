// Open Beauty Facts lookup (free, no key). Returns a product object, or null when the barcode is unknown.
(function () {
  var BASE = "https://world.openbeautyfacts.org/api/v2/product/";
  var FIELDS = "code,product_name,brands,ingredients_text,ingredients_text_en,image_front_small_url";

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
    return next().then(function (p) {
      if (!p) return null;
      return {
        code: p.code || code,
        brand: p.brands ? p.brands.split(",")[0].trim() : "",
        name: p.product_name || "Unnamed product",
        image: p.image_front_small_url || "",
        ingredientsText: p.ingredients_text_en || p.ingredients_text || ""
      };
    });
  }

  window.OBF = { lookup: lookup };
})();
