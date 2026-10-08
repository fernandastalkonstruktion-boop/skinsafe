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

  // How sharp a picture is: variance of the Laplacian (edges). A hand-held, blurry frame scores low, a still one high.
  // Pure function on a grayscale array so it can be tested without a browser.
  function sharpness(g, w, h) {
    var n = 0, sum = 0, sum2 = 0, x, y, i, v;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
        sum += v; sum2 += v * v; n++;
      }
    }
    if (!n) return 0;
    var mean = sum / n;
    return sum2 / n - mean * mean;
  }

  // Score a canvas (a camera frame): shrink to ~480 px wide, grayscale, then sharpness().
  function frameScore(canvas) {
    var k = Math.min(1, 480 / canvas.width);
    var w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(canvas, 0, 0, w, h);
    var p = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), i;
    for (i = 0; i < g.length; i++) g[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    return sharpness(g, w, h);
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

  // Reads ALL the text on a photo (not an ingredient list): once normally and once inverted, for light text on dark packages.
  function readRaw(file, onProgress) {
    onProgress("Preparing the photo…", null);
    return prepare(file).then(function (canvas) {
      onProgress("Loading the reader (first time only)…", null);
      return loadLibrary().then(function () {
        var inv = document.createElement("canvas");
        inv.width = canvas.width; inv.height = canvas.height;
        var x = inv.getContext("2d", { willReadFrequently: true });
        x.drawImage(canvas, 0, 0);
        var d = x.getImageData(0, 0, inv.width, inv.height), p = d.data;
        for (var i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; }
        x.putImageData(d, 0, 0);
        var T = window.Tesseract, opts = { langPath: LANG_PATH, logger: function (m) { if (m.status === "recognizing text") onProgress("Reading the package…", m.progress); } };
        return T.recognize(canvas, "eng", opts).then(function (a) {
          return T.recognize(inv, "eng", opts).then(function (b) { return String(a.data.text || "") + "\n" + String(b.data.text || ""); });
        });
      });
    });
  }

  // Reads a photo with several products on it (a shelf): returns every word with its position. "Sparse text" mode looks for
  // words scattered all over the picture instead of one block of text. invert=true reads light letters on a dark package.
  function readWords(file, onProgress, invert) {
    onProgress("Preparing the photo…", null);
    return prepare(file).then(function (canvas) {
      if (invert) {
        var x = canvas.getContext("2d", { willReadFrequently: true });
        var d = x.getImageData(0, 0, canvas.width, canvas.height), p = d.data;
        for (var i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; }
        x.putImageData(d, 0, 0);
      }
      onProgress("Loading the reader (first time only)…", null);
      return loadLibrary().then(function () {
        return window.Tesseract.createWorker("eng", 1, {
          langPath: LANG_PATH,
          logger: function (m) { if (m.status === "recognizing text") onProgress("Reading the shelf…", m.progress); }
        });
      }).then(function (w) {
        return w.setParameters({ tessedit_pageseg_mode: "11" })
          .then(function () { return w.recognize(canvas); })
          .then(function (r) {
            var words = (r.data && r.data.words) || [];
            return w.terminate().then(function () { return words; }, function () { return words; });
          });
      });
    });
  }

  // Groups nearby words into "labels": words that touch or sit close together belong to the same package.
  function groups(words) {
    var ws = (words || []).filter(function (w) { return w.bbox && w.confidence >= 35 && /[A-Za-z]{2,}/.test(w.text || ""); });
    var parent = ws.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (var i = 0; i < ws.length; i++) {
      for (var j = i + 1; j < ws.length; j++) {
        var a = ws[i].bbox, b = ws[j].bbox;
        var h = Math.max(a.y1 - a.y0, b.y1 - b.y0);
        var gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
        var gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
        if (gx <= 1.2 * h && gy <= 1.5 * h) parent[find(i)] = find(j);
      }
    }
    var map = {};
    ws.forEach(function (w, k) {
      var r = find(k);
      (map[r] = map[r] || []).push(w);
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (g) { return g.length >= 2; })
      .map(function (g) { return { text: g.map(function (w) { return w.text; }).join(" "), words: g.length }; });
  }



  // Same preparation as prepare(), for a canvas (a live camera frame): scale to a good reading size, grayscale, stretch the contrast.
  function prepareCanvas(src) {
    var longest = Math.max(src.width, src.height);
    var scale = longest > 1600 ? 1600 / longest : longest < 1200 ? 1200 / longest : 1;
    var c = document.createElement("canvas");
    c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(src, 0, 0, c.width, c.height);
    var d = x.getImageData(0, 0, c.width, c.height), p = d.data, i, g, lo = 255, hi = 0;
    for (i = 0; i < p.length; i += 4) { g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
    var range = Math.max(1, hi - lo);
    for (i = 0; i < p.length; i += 4) { g = (p[i] - lo) * 255 / range; p[i] = p[i + 1] = p[i + 2] = g; }
    x.putImageData(d, 0, 0);
    return c;
  }

  // ---- One reader kept alive for the camera (auto-scan and the extra passes), so each reading doesn't reload the language data. ----
  var shared = null, chain = Promise.resolve(), progressCb = function () {};
  function sharedWorker() {
    if (!shared) {
      shared = loadLibrary().then(function () {
        return window.Tesseract.createWorker("eng", 1, {
          langPath: LANG_PATH,
          logger: function (m) { if (m.status === "recognizing text") progressCb(m.progress); }
        });
      });
      shared.catch(function () { shared = null; });
    }
    return shared;
  }
  // Reads one canvas with the shared reader. psm 3 = a normal block of text, 6 = one block, 11 = words scattered anywhere (stylized logos, curved labels).
  function recognize(canvas, psm, onProgress) {
    progressCb = onProgress || function () {};
    var job = chain.then(function () {
      return sharedWorker().then(function (w) {
        return w.setParameters({ tessedit_pageseg_mode: String(psm || 3) }).then(function () { return w.recognize(canvas); });
      });
    });
    chain = job.catch(function () {});
    return job.then(function (r) { return String((r.data && r.data.text) || ""); });
  }
  function stopShared() {
    var s = shared; shared = null; chain = Promise.resolve();
    if (s) s.then(function (w) { return w.terminate(); }).catch(function () {});
  }

  function rotate(canvas, cw) {
    var r = document.createElement("canvas"), g;
    r.width = canvas.height; r.height = canvas.width;
    g = r.getContext("2d", { willReadFrequently: true });
    if (cw) { g.translate(r.width, 0); g.rotate(Math.PI / 2); } else { g.translate(0, r.height); g.rotate(-Math.PI / 2); }
    g.drawImage(canvas, 0, 0);
    return r;
  }
  function invert(canvas) {
    var r = document.createElement("canvas"), g, d, p, i;
    r.width = canvas.width; r.height = canvas.height;
    g = r.getContext("2d", { willReadFrequently: true });
    g.drawImage(canvas, 0, 0);
    d = g.getImageData(0, 0, r.width, r.height); p = d.data;
    for (i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; }
    g.putImageData(d, 0, 0);
    return r;
  }
  // One half of the picture (a little more than half, so a word on the seam isn't cut). Reading a half at a time helps when a hand or a
  // reflection covers part of the label: the text blocks are simpler and the reader doesn't give up on the whole picture.
  function part(canvas, which) {
    var w = canvas.width, h = canvas.height, r = document.createElement("canvas"), g, sx = 0, sy = 0, sw = w, sh = h;
    if (which === "left") sw = Math.round(w * 0.58);
    else if (which === "right") { sx = Math.round(w * 0.42); sw = w - sx; }
    else if (which === "top") sh = Math.round(h * 0.58);
    else { sy = Math.round(h * 0.42); sh = h - sy; }
    r.width = sw; r.height = sh;
    g = r.getContext("2d", { willReadFrequently: true });
    g.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return r;
  }
  // Extra readings to try, in order, when the first one doesn't give a sure match. Each makes the picture it reads on demand.
  var PASSES = [
    { label: "Reading scattered words", psm: 11, make: function (c) { return c; } },
    { label: "Reading it sideways", psm: 3, make: function (c) { return rotate(c, true); } },
    { label: "Reading it sideways", psm: 3, make: function (c) { return rotate(c, false); } },
    { label: "Reading the left side", psm: 6, make: function (c) { return part(c, "left"); } },
    { label: "Reading the right side", psm: 6, make: function (c) { return part(c, "right"); } },
    { label: "Reading light letters", psm: 11, make: function (c) { return invert(c); } }
  ];

  window.OCR = { recognize: recognize, stopShared: stopShared, passes: PASSES, prepareCanvas: prepareCanvas, rotate: rotate, invert: invert, part: part, prepare: prepare,  read: read, readRaw: readRaw, readWords: readWords, groups: groups, clean: clean, sharpness: sharpness, frameScore: frameScore };
  if (typeof module !== "undefined" && module.exports) module.exports = { sharpness: sharpness };
})();
