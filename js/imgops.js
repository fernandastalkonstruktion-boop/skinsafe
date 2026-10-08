// Picture clean-up for reading labels with a phone camera. Pure functions on a grayscale picture { w, h, d } (d = Uint8ClampedArray),
// so they run in the browser and in Node tests (tools/camtest). Nothing here touches the page.
(function () {
  "use strict";

  function make(w, h) { return { w: w, h: h, d: new Uint8ClampedArray(w * h) }; }
  function fromRGBA(p, w, h) {
    var g = make(w, h), i;
    for (i = 0; i < w * h; i++) g.d[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    return g;
  }
  // Gray picture from the colour direction that varies the most (first principal component of the pixel colours). For ink that differs from its
  // background more in hue than in brightness (green letters on a yellow oil, red on pink) this keeps the contrast plain luminance throws away.
  function pcaGray(p, w, h) {
    var n = w * h, step = Math.max(1, Math.floor(n / 20000)), i, c, r, g2, b, cnt = 0, mr = 0, mg = 0, mb = 0;
    for (i = 0; i < n; i += step) { mr += p[i * 4]; mg += p[i * 4 + 1]; mb += p[i * 4 + 2]; cnt++; }
    mr /= cnt; mg /= cnt; mb /= cnt;
    var a11 = 0, a12 = 0, a13 = 0, a22 = 0, a23 = 0, a33 = 0;
    for (i = 0; i < n; i += step) {
      r = p[i * 4] - mr; g2 = p[i * 4 + 1] - mg; b = p[i * 4 + 2] - mb;
      a11 += r * r; a12 += r * g2; a13 += r * b; a22 += g2 * g2; a23 += g2 * b; a33 += b * b;
    }
    var v = [0.299, 0.587, 0.114], it, nx, ny, nz, nn;
    for (it = 0; it < 30; it++) {
      nx = a11 * v[0] + a12 * v[1] + a13 * v[2]; ny = a12 * v[0] + a22 * v[1] + a23 * v[2]; nz = a13 * v[0] + a23 * v[1] + a33 * v[2];
      nn = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; v = [nx / nn, ny / nn, nz / nn];
    }
    if (v[0] * 0.299 + v[1] * 0.587 + v[2] * 0.114 < 0) v = [-v[0], -v[1], -v[2]];
    var o = make(w, h), f = new Float32Array(n), lo = 1e9, hi = -1e9;
    for (i = 0; i < n; i++) { f[i] = v[0] * p[i * 4] + v[1] * p[i * 4 + 1] + v[2] * p[i * 4 + 2]; if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
    var rg = Math.max(1, hi - lo);
    for (i = 0; i < n; i++) o.d[i] = (f[i] - lo) * 255 / rg;
    return o;
  }
  function copy(g) { var o = make(g.w, g.h); o.d.set(g.d); return o; }

  // Resize: averages the source pixels that fall in each new pixel when shrinking, bilinear when growing.
  function resize(g, nw, nh) {
    nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
    var o = make(nw, nh), x, y, sx = g.w / nw, sy = g.h / nh;
    if (sx > 1 || sy > 1) {
      for (y = 0; y < nh; y++) {
        var y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.min(g.h, Math.ceil((y + 1) * sy)));
        for (x = 0; x < nw; x++) {
          var x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.min(g.w, Math.ceil((x + 1) * sx))), a = 0, n = 0, yy, xx;
          for (yy = y0; yy < y1; yy++) for (xx = x0; xx < x1; xx++) { a += g.d[yy * g.w + xx]; n++; }
          o.d[y * nw + x] = a / n;
        }
      }
    } else {
      for (y = 0; y < nh; y++) {
        var fy = Math.min(g.h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), iy = Math.floor(fy), ty = fy - iy, iy2 = Math.min(g.h - 1, iy + 1);
        for (x = 0; x < nw; x++) {
          var fx = Math.min(g.w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), ix = Math.floor(fx), tx = fx - ix, ix2 = Math.min(g.w - 1, ix + 1);
          o.d[y * nw + x] = (g.d[iy * g.w + ix] * (1 - tx) + g.d[iy * g.w + ix2] * tx) * (1 - ty) + (g.d[iy2 * g.w + ix] * (1 - tx) + g.d[iy2 * g.w + ix2] * tx) * ty;
        }
      }
    }
    return o;
  }
  // Scale so the longest side is `target` px (only if that changes it by more than 8%).
  function fit(g, target) {
    var k = target / Math.max(g.w, g.h);
    return k > 0.92 && k < 1.08 ? g : resize(g, g.w * k, g.h * k);
  }
  function crop(g, x, y, w, h) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    w = Math.min(g.w - x, Math.round(w)); h = Math.min(g.h - y, Math.round(h));
    var o = make(w, h), r;
    for (r = 0; r < h; r++) o.d.set(g.d.subarray((y + r) * g.w + x, (y + r) * g.w + x + w), r * w);
    return o;
  }
  function rot90(g, cw) {
    var o = make(g.h, g.w), x, y;
    for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) {
      if (cw) o.d[x * g.h + (g.h - 1 - y)] = g.d[y * g.w + x];
      else o.d[(g.w - 1 - x) * g.h + y] = g.d[y * g.w + x];
    }
    return o;
  }
  function invert(g) { var o = make(g.w, g.h), i; for (i = 0; i < g.d.length; i++) o.d[i] = 255 - g.d[i]; return o; }
  // Stretch the contrast so the 1st..99th percentile fills 0..255.
  function stretch(g) {
    var hist = new Uint32Array(256), i, n = g.d.length, lo = 0, hi = 255, acc = 0;
    for (i = 0; i < n; i++) hist[g.d[i]]++;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.01) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.01) { hi = i; break; } }
    var o = make(g.w, g.h), rg = Math.max(1, hi - lo);
    for (i = 0; i < n; i++) o.d[i] = (g.d[i] - lo) * 255 / rg;
    return o;
  }

  // Integral images (sum and sum of squares) for fast window means.
  function integral(g) {
    var w = g.w, h = g.h, S = new Float64Array((w + 1) * (h + 1)), Q = new Float64Array((w + 1) * (h + 1)), x, y;
    for (y = 0; y < h; y++) {
      var rs = 0, rq = 0;
      for (x = 0; x < w; x++) {
        var v = g.d[y * w + x];
        rs += v; rq += v * v;
        S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + rs;
        Q[(y + 1) * (w + 1) + x + 1] = Q[y * (w + 1) + x + 1] + rq;
      }
    }
    return { S: S, Q: Q, w: w, h: h };
  }
  function winStats(I, x, y, r) {
    var w = I.w, h = I.h, x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1), W = w + 1;
    var n = (x1 - x0) * (y1 - y0);
    var s = I.S[y1 * W + x1] - I.S[y0 * W + x1] - I.S[y1 * W + x0] + I.S[y0 * W + x0];
    var q = I.Q[y1 * W + x1] - I.Q[y0 * W + x1] - I.Q[y1 * W + x0] + I.Q[y0 * W + x0];
    var m = s / n, v = Math.max(0, q / n - m * m);
    return { m: m, sd: Math.sqrt(v) };
  }
  // Local contrast normalisation: every pixel is compared with its own neighbourhood (radius r), so dark ink on a see-through tube,
  // a shadow across a label or light letters on a coloured bottle all come out as clear dark-on-light. floor keeps flat areas flat.
  function localNorm(g, r, gain, floor) {
    var I = integral(g), o = make(g.w, g.h), x, y, st, v;
    gain = gain || 0.9; floor = floor === undefined ? 10 : floor;
    for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) {
      st = winStats(I, x, y, r);
      v = 200 + (g.d[y * g.w + x] - st.m) / (st.sd + floor) * 64 * gain;
      o.d[y * g.w + x] = v;
    }
    return o;
  }
  // Sauvola threshold: black text on white from an uneven picture.
  function binarize(g, r, k) {
    var I = integral(g), o = make(g.w, g.h), x, y, st, th;
    k = k === undefined ? 0.25 : k;
    for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) {
      st = winStats(I, x, y, r);
      th = st.m * (1 + k * (st.sd / 128 - 1));
      o.d[y * g.w + x] = g.d[y * g.w + x] > th ? 255 : 0;
    }
    return o;
  }
  // Mild sharpening (unsharp mask) for text that is slightly soft.
  function unsharp(g, r, amount) {
    var I = integral(g), o = make(g.w, g.h), x, y, st;
    for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) {
      st = winStats(I, x, y, r);
      o.d[y * g.w + x] = g.d[y * g.w + x] + (g.d[y * g.w + x] - st.m) * amount;
    }
    return o;
  }
  // How sharp (variance of the Laplacian) a picture is.
  function sharpness(g) {
    var w = g.w, h = g.h, n = 0, sum = 0, sum2 = 0, x, y, i, v;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      v = 4 * g.d[i] - g.d[i - 1] - g.d[i + 1] - g.d[i - w] - g.d[i + w];
      sum += v; sum2 += v * v; n++;
    }
    if (!n) return 0;
    var mean = sum / n;
    return sum2 / n - mean * mean;
  }

  // Browser helpers
  function fromCanvas(c) {
    var x = c.getContext("2d", { willReadFrequently: true });
    return fromRGBA(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  }
  function toCanvas(g) {
    var c = document.createElement("canvas"), x, id, i;
    c.width = g.w; c.height = g.h;
    x = c.getContext("2d", { willReadFrequently: true });
    id = x.createImageData(g.w, g.h);
    for (i = 0; i < g.w * g.h; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g.d[i]; id.data[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    return c;
  }

  var api = { make: make, fromRGBA: fromRGBA, pcaGray: pcaGray, copy: copy, resize: resize, fit: fit, crop: crop, rot90: rot90, invert: invert, stretch: stretch,
    localNorm: localNorm, binarize: binarize, unsharp: unsharp, sharpness: sharpness, fromCanvas: fromCanvas, toCanvas: toCanvas };
  if (typeof window !== "undefined") window.ImgOps = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
