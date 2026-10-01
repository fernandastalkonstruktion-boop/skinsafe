// Reads the ingredient list from a photo, entirely in the browser (Tesseract.js, free).
// The photo never leaves the device; only the reader program and its English language data are downloaded
// the first time, from a public CDN, and then cached by the browser.
(function () {
  var SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var LANG_PATH = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int";
  var loading = null;

  function loadLibrary() {
    if (window.Tesseract) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = SCRIPT;
      s.onload = resolve;
      s.onerror = function () { loading = null; reject(new Error("reader-load")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // Scale the photo to a good size for reading, make it grayscale and stretch the contrast.
  function prepare(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var longest = Math.max(img.width, img.height);
        var scale = longest > 2400 ? 2400 / longest : longest < 1400 ? 1400 / longest : 1;
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        var x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, c.width, c.height);
        var d = x.getImageData(0, 0, c.width, c.height), p = d.data, i, g, lo = 255, hi = 0;
        for (i = 0; i < p.length; i += 4) {
          g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          p[i] = g;
          if (g < lo) lo = g;
          if (g > hi) hi = g;
        }
        var range = Math.max(1, hi - lo);
        for (i = 0; i < p.length; i += 4) {
          g = (p[i] - lo) * 255 / range;
          p[i] = p[i + 1] = p[i + 2] = g;
        }
        x.putImageData(d, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad-image")); };
      img.src = url;
    });
  }

  // Turn what the reader saw into a comma-separated ingredient list the user can correct.
  function clean(text) {
    text = String(text || "")
      .replace(/-\s*\n\s*/g, "-")
      .replace(/\n+/g, " ")
      .replace(/[|¦•·]/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    var m = text.match(/(ingredients?|ingredientes|ingrédients|inci|composition|zutaten)\s*[:;]/i);
    if (m) text = text.slice(m.index + m[0].length).trim();
    text = text.replace(/\s*[.;]\s+(?=[A-Z])/g, ", ");
    return text;
  }

  function read(file, onProgress) {
    onProgress("Preparing the photo…", null);
    return prepare(file).then(function (canvas) {
      onProgress("Loading the reader (first time only)…", null);
      return loadLibrary().then(function () {
        return window.Tesseract.recognize(canvas, "eng", {
          langPath: LANG_PATH,
          logger: function (m) {
            if (m.status === "recognizing text") onProgress("Reading the label…", m.progress);
          }
        });
      });
    }).then(function (result) { return clean(result.data.text); });
  }

  window.OCR = { read: read, clean: clean };
})();
