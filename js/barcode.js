// Barcode reader for blurry, hand-held, tilted codes (EAN-13 / UPC-A / EAN-8), no libraries.
// The phone's own scanner (html5-qrcode) needs a sharp, flat picture. A product held in the hand is usually a little out of focus
// (the code is too close for the lens), so this reader does what a person does: it finds the three guard patterns of the code, works out
// where every one of its 95 (or 67) modules sits, undoes the blur, and picks the digits whose bars best explain what the camera saw.
// The last digit (check digit) has to add up; a number that doesn't is never returned.
// Pure functions on a grayscale array, so they can be tested in Node (tools/camtest/test_barcode.js) and used in the browser.
(function () {
  "use strict";

  var LCODE = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  function bitsOf(s) { var a = [], i; for (i = 0; i < s.length; i++) a.push(s.charCodeAt(i) - 48); return a; }
  var Lb = LCODE.map(bitsOf);
  var Rb = Lb.map(function (a) { return a.map(function (v) { return 1 - v; }); });
  var Gb = Rb.map(function (a) { return a.slice().reverse(); });
  // Which of the six left groups use the "G" set tells the first digit of an EAN-13.
  var PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

  // Layout of a code: where the groups start (in modules) and how many there are.
  var KINDS = {
    ean13: { N: 95, leftAt: 3, leftN: 6, centerAt: 45, rightAt: 50, rightN: 6, endAt: 92 },
    ean8: { N: 67, leftAt: 3, leftN: 4, centerAt: 31, rightAt: 36, rightN: 4, endAt: 64 }
  };

  // ---- small math helpers ----
  function erf(x) {   // Abramowitz-Stegun 7.1.26
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function Phi(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  // How much of a module's darkness reaches the centre of a module d steps away (d = -R..R). The blur is a Gaussian of s modules, optionally
  // smeared by a box ell modules wide (the camera or the hand moved while the picture was taken).
  var TAPR = 4;
  var tapCache = {};
  function tapWeights(s, ell) {
    var ck = s.toFixed(3) + "/" + (ell || 0);
    if (tapCache[ck]) return tapCache[ck];
    var w = [], d, sum = 0;
    ell = ell || 0;
    for (d = -TAPR; d <= TAPR; d++) {
      var v;
      if (!ell) v = Phi((d + 0.5) / s) - Phi((d - 0.5) / s);
      else {   // average the Gaussian result over the box
        v = 0;
        for (var q = 0; q < 9; q++) { var sh = (q / 8 - 0.5) * ell; v += Phi((d + 0.5 + sh) / s) - Phi((d - 0.5 + sh) / s); }
        v /= 9;
      }
      w.push(v); sum += v;
    }
    return (tapCache[ck] = w.map(function (v) { return v / sum; }));
  }

  // ---- 1. profile helpers ----
  function at(P, x) {   // linear interpolation, clamped at the ends
    var n = P.length;
    if (x <= 0) return P[0];
    if (x >= n - 1) return P[n - 1];
    var i = Math.floor(x), f = x - i;
    return P[i] * (1 - f) + P[i + 1] * f;
  }
  function percentile(arr, q) {
    var a = new Float32Array(arr);
    a.sort();   // typed arrays sort numerically
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
  }
  function smooth(P, sigma) {   // small Gaussian, to calm sensor noise before looking for edges
    var r = Math.max(1, Math.ceil(sigma * 2)), k = [], i, j, s = 0, out = new Float32Array(P.length);
    for (i = -r; i <= r; i++) { var v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); s += v; }
    for (i = 0; i < P.length; i++) {
      var acc = 0;
      for (j = -r; j <= r; j++) { var q = i + j; q = q < 0 ? 0 : q >= P.length ? P.length - 1 : q; acc += P[q] * k[j + r]; }
      out[i] = acc / s;
    }
    return out;
  }
  // Number of clear light/dark changes in the best stretch of a line: a barcode line has dozens, plain label and background lines few.
  function activity(P, win) {
    var lo = percentile(P, 0.05), hi = percentile(P, 0.95), range = hi - lo;
    if (range < 25) return 0;
    var th = Math.max(range * 0.18, 9), i;
    // count swings (light to dark and back) of the smoothed profile that are at least a fifth of its range
    var sm = smooth(P, 1.3), count = [0], c = 0, dir = 0, ext = sm[0], ext0 = sm[0];
    for (i = 1; i < sm.length; i++) {
      if (dir >= 0) {
        if (sm[i] > ext) ext = sm[i];
        if (ext - sm[i] > th) { dir = -1; c++; ext = sm[i]; }
        else if (dir === 0 && sm[i] - ext0 > th) { dir = 1; ext = sm[i]; }
      } else {
        if (sm[i] < ext) ext = sm[i];
        if (sm[i] - ext > th) { dir = 1; c++; ext = sm[i]; }
      }
      count.push(c);
    }
    var best = 0, n = count.length;
    for (i = 0; i < n; i++) { var j = Math.min(n - 1, i + win); if (count[j] - count[i] > best) best = count[j] - count[i]; }
    return best;
  }

  // ---- 2. find where the code sits on a line: correlate the three guard patterns (plus quiet zones) with the picture ----
  // Expected lightness (1 light, 0 dark) of the modules that every code of this kind has in the same place.
  function guardTemplate(kind) {
    var K = KINDS[kind], pos = [], val = [], i;
    for (i = -3; i < 0; i++) { pos.push(i); val.push(1); }
    [0, 1, 0].forEach(function (v, j) { pos.push(j); val.push(v); });
    [1, 0, 1, 0, 1].forEach(function (v, j) { pos.push(K.centerAt + j); val.push(v); });
    [0, 1, 0].forEach(function (v, j) { pos.push(K.endAt + j); val.push(v); });
    for (i = K.N; i < K.N + 3; i++) { pos.push(i); val.push(1); }
    var mean = 0; val.forEach(function (v) { mean += v; }); mean /= val.length;
    var sd = 0; val.forEach(function (v) { sd += (v - mean) * (v - mean); });
    return { pos: pos, val: val, mean: mean, sd: Math.sqrt(sd), n: val.length };
  }
  function guardScore(P, T, x0, m) {
    var n = T.n, s = 0, s2 = 0, sv = 0, i, y;
    for (i = 0; i < n; i++) {
      y = at(P, x0 + (T.pos[i] + 0.5) * m);
      s += y; s2 += y * y; sv += y * (T.val[i] - T.mean);
    }
    var mu = s / n, vr = s2 - n * mu * mu;
    if (vr <= 1e-6) return -1;
    return sv / (Math.sqrt(vr) * T.sd);
  }
  function findCandidates(P, kind, maxCand) {
    var K = KINDS[kind], T = guardTemplate(kind), n = P.length, out = [];
    var mMin = 1.8, mMax = (n - 8) / (K.N + 2);
    if (mMax < mMin) return out;
    var m, x0;
    for (m = mMin; m <= mMax; m *= 1.03) {
      var step = Math.max(0.75, m * 0.25);
      for (x0 = -1; x0 + K.N * m <= n + 1; x0 += step) {
        var sc = guardScore(P, T, x0, m);
        if (sc > 0.62) out.push({ x0: x0, m: m, sc: sc });
      }
    }
    out.sort(function (a, b) { return b.sc - a.sc; });
    var keep = [];
    out.forEach(function (c) {
      if (keep.length >= maxCand) return;
      for (var i = 0; i < keep.length; i++) if (Math.abs(keep[i].x0 - c.x0) < 3 * Math.max(keep[i].m, c.m) && Math.abs(keep[i].m / c.m - 1) < 0.12) return;
      keep.push(c);
    });
    // refine position and size on the guard score (finer steps)
    keep.forEach(function (c) {
      var bx = c.x0, bm = c.m, bs = c.sc, dx, dm;
      for (var pass = 0; pass < 2; pass++) {
        var sx = pass ? 0.12 * bm : 0.3 * bm, smul = pass ? 0.002 : 0.006;
        for (dm = -3; dm <= 3; dm++) for (dx = -3; dx <= 3; dx++) {
          var x = bx + dx * sx / 3, mm = bm * (1 + dm * smul), s = guardScore(P, T, x, mm);
          if (s > bs) { bs = s; c.x0 = x; c.m = mm; c.sc = s; }
        }
        bx = c.x0; bm = c.m;
      }
    });
    return keep;
  }

  // ---- 3. read the digits of one candidate ----
  var PAD = 2;   // light "quiet zone" modules read on each side of the code, so a piece of a longer code isn't mistaken for a short one
  function moduleValues(P, x0, m, N, reversed) {
    var T = N + 2 * PAD, u = new Float32Array(T), k;
    for (k = 0; k < T; k++) {
      var kk = reversed ? N - 1 - (k - PAD) : k - PAD;
      u[k] = at(P, x0 + (kk + 0.5) * m);
    }
    return u;
  }
  // Turn the sampled lightness of every module into "how dark was this module really" (0..1), then undo the blur a little.
  function deblur(u, s, ell) {
    var N = u.length, lo = percentile(u, 0.04), hi = percentile(u, 0.96), range = hi - lo, k, it, j;
    if (range < 8) return null;
    var d = new Float32Array(N);
    for (k = 0; k < N; k++) { var v = 1 - (u[k] - lo) / range; d[k] = v < 0 ? 0 : v > 1 ? 1 : v; }
    var w = tapWeights(s, ell), b = Float32Array.from(d), nb = new Float32Array(N), R = s > 1.0 ? 4 : s > 0.6 ? 3 : 2;
    for (it = 0; it < 10; it++) {
      for (k = 0; k < N; k++) {
        var wb = 0, j0 = k - R < 0 ? -k : -R, j1 = k + R >= N ? N - 1 - k : R;
        for (j = j0; j <= j1; j++) wb += w[j + TAPR] * b[k + j];
        var v2 = b[k] + (d[k] - wb);
        nb[k] = v2 < -0.15 ? -0.15 : v2 > 1.15 ? 1.15 : v2;
      }
      var t = b; b = nb; nb = t;
    }
    return b;
  }
  function groupCost(b, at0, pat) {
    var c = 0, i, e;
    for (i = 0; i < 7; i++) { e = b[at0 + i] - pat[i]; c += e * e; }
    return c;
  }
  function fixedCost(b, at0, bits) {
    var c = 0, i, e;
    for (i = 0; i < bits.length; i++) { e = b[at0 + i] - bits[i]; c += e * e; }
    return c;
  }
  var START = [1, 0, 1], CENTER = [0, 1, 0, 1, 0];
  // Cost of reading each group as each possible digit (and of the guard patterns), for modules already deblurred to ~0/1.
  function groupCosts(b, kind) {
    var K = KINDS[kind], g, i, left = [], right = [];
    var guards = fixedCost(b, PAD, START) + fixedCost(b, PAD + K.centerAt, CENTER) + fixedCost(b, PAD + K.endAt, START) +
      fixedCost(b, 0, [0, 0]) + fixedCost(b, PAD + K.N, [0, 0]);
    for (g = 0; g < K.leftN; g++) {
      var row = [];
      for (i = 0; i < 10; i++) row.push(groupCost(b, PAD + K.leftAt + 7 * g, Lb[i]));
      for (i = 0; i < 10; i++) row.push(groupCost(b, PAD + K.leftAt + 7 * g, Gb[i]));
      left.push(row);
    }
    for (g = 0; g < K.rightN; g++) {
      var r2 = [];
      for (i = 0; i < 10; i++) r2.push(groupCost(b, PAD + K.rightAt + 7 * g, Rb[i]));
      right.push(r2);
    }
    return { guards: guards, left: left, right: right };
  }
  function minOf(a, from) { var m = 1e9, k = from || 0; for (var i = 0; i < 10; i++) if (a[k + i] < m) m = a[k + i]; return m; }
  // Cheapest reading with no check-digit rule (just "how well do the bars fit some code"); also which left pattern won.
  function freeCost(gc, kind) {
    var K = KINDS[kind], right = 0, g;
    for (g = 0; g < K.rightN; g++) right += minOf(gc.right[g]);
    var leftL = gc.left.map(function (r) { return minOf(r, 0); }), leftG = gc.left.map(function (r) { return minOf(r, 10); }), best = 1e9;
    if (kind === "ean8") { best = 0; for (g = 0; g < K.leftN; g++) best += leftL[g]; }
    else PARITY.forEach(function (pt) { var c = 0; for (var gi = 0; gi < 6; gi++) c += pt.charAt(gi) === "G" ? leftG[gi] : leftL[gi]; if (c < best) best = c; });
    return gc.guards + best + right;
  }
  // The best reading whose check digit adds up, found by dynamic programming over the groups (state: running check sum mod 10).
  function readCode(b, kind) {
    var K = KINDS[kind], gc = groupCosts(b, kind), left = gc.left, right = gc.right, g, i, INF = 1e9;
    // Check-digit rule: positions counted from the left starting at 1. EAN-13: odd positions weigh 1, even 3. EAN-8: odd 3, even 1.
    function weight(pos) { return kind === "ean13" ? (pos % 2 === 1 ? 1 : 3) : (pos % 2 === 1 ? 3 : 1); }
    function wl(gi) { return weight(gi + (kind === "ean13" ? 2 : 1)); }
    function wr(gi) { return weight(gi + (kind === "ean13" ? 8 : 5)); }
    var rState = [], s;
    for (s = 0; s < 10; s++) rState.push({ cost: s === 0 ? 0 : INF, digits: [] });
    for (g = 0; g < K.rightN; g++) {
      var nxt = [];
      for (s = 0; s < 10; s++) nxt.push({ cost: INF, digits: null });
      for (s = 0; s < 10; s++) {
        if (rState[s].cost >= INF) continue;
        for (i = 0; i < 10; i++) {
          var ns = (s + i * wr(g)) % 10, c3 = rState[s].cost + right[g][i];
          if (c3 < nxt[ns].cost) nxt[ns] = { cost: c3, digits: rState[s].digits.concat([i]) };
        }
      }
      rState = nxt;
    }
    var leftOpts = kind === "ean13" ? PARITY : ["LLLL"], bestCon = INF, bestDigits = null;
    leftOpts.forEach(function (pt, pi) {
      var st = [], gi, s2;
      for (s2 = 0; s2 < 10; s2++) st.push({ cost: s2 === 0 ? 0 : INF, digits: [] });
      for (gi = 0; gi < K.leftN; gi++) {
        var nx = [], off = pt.charAt(gi) === "G" ? 10 : 0;
        for (s2 = 0; s2 < 10; s2++) nx.push({ cost: INF, digits: null });
        for (s2 = 0; s2 < 10; s2++) {
          if (st[s2].cost >= INF) continue;
          for (i = 0; i < 10; i++) {
            var ns2 = (s2 + i * wl(gi)) % 10, c4 = st[s2].cost + left[gi][off + i];
            if (c4 < nx[ns2].cost) nx[ns2] = { cost: c4, digits: st[s2].digits.concat([i]) };
          }
        }
        st = nx;
      }
      var first = kind === "ean13" ? pi : 0;   // EAN-13: the first digit comes from the pattern and weighs 1
      for (s2 = 0; s2 < 10; s2++) {
        if (st[s2].cost >= INF) continue;
        var need = (10 - ((s2 + first) % 10)) % 10;
        if (rState[need].cost >= INF) continue;
        var tot = st[s2].cost + rState[need].cost;
        if (tot < bestCon) { bestCon = tot; bestDigits = (kind === "ean13" ? [first] : []).concat(st[s2].digits, rState[need].digits); }
      }
    });
    if (!bestDigits) return null;
    return { digits: bestDigits, cost: gc.guards + bestCon, uncost: freeCost(gc, kind), N: K.N + 2 * PAD };
  }

  function checkOk(digits) {
    var n = digits.length, sum = 0, i;
    for (i = 0; i < n; i++) {
      var pos = n - i;   // position counted from the right: the check digit is 1 (weight 1), then 3, 1, 3 ...
      sum += digits[i] * (pos % 2 === 1 ? 1 : 3);
    }
    return sum % 10 === 0;
  }

  // Where a blurred code could sit on this line: stretches where the picture keeps changing (the bars), at several "how far apart may bars be" settings.
  function extentSeeds(P, N) {
    var n = P.length, sm = smooth(P, 1.0), E = new Float32Array(n), i, seeds = [];
    for (i = 2; i < n - 2; i++) E[i] = Math.abs(sm[i + 2] - sm[i - 2]);
    var E2 = new Float32Array(n);
    for (i = 3; i < n - 3; i++) { var a = 0; for (var j = -3; j <= 3; j++) a += E[i + j]; E2[i] = a / 7; }
    var thr = Math.max(percentile(E2, 0.97) * 0.3, 1.5);
    [6, 11, 18, 30, 50].forEach(function (G) {
      var runs = [], start = -1, last = -1;
      for (i = 0; i < n; i++) {
        if (E2[i] > thr) { if (start < 0) start = i; else if (i - last > G) { runs.push([start, last]); start = i; } last = i; }
      }
      if (start >= 0) runs.push([start, last]);
      runs.forEach(function (r) {
        var len = r[1] - r[0];
        if (len < N * 1.7 || len > N * 20) return;
        for (var k = 0; k < seeds.length; k++) if (Math.abs(seeds[k][0] - r[0]) < 4 && Math.abs(seeds[k][1] - r[1]) < 4) return;
        seeds.push(r);
      });
    });
    return seeds;
  }
  var SIGMAS = [0.35, 0.6, 0.85, 1.1, 1.35];
  function evalFit(P, kind, x0, m, sg, rev) {
    var u = moduleValues(P, x0, m, KINDS[kind].N, rev), b = deblur(u, sg);
    if (!b) return null;
    return freeCost(groupCosts(b, kind), kind);
  }
  // Search position, size, blur and direction around a first guess, keeping whatever explains the picture best.
  function refine(P, kind, st, wide) {
    var best = st, it, dx, dm, ds, steps = [{ x: 0.2, m: 0.006, s: 0.25 }, { x: 0.08, m: 0.0025, s: 0.12 }, { x: 0.03, m: 0.001, s: 0.06 }];
    for (it = 0; it < steps.length; it++) {
      var cur = best, S = steps[it];
      for (dx = -2; dx <= 2; dx++) for (dm = -2; dm <= 2; dm++) for (ds = -1; ds <= 1; ds++) {
        var x0 = cur.x0 + dx * S.x * cur.m, m = cur.m * (1 + dm * S.m), sg = cur.sg + ds * S.s;
        if (sg < 0.2 || sg > 1.7) continue;
        var c = evalFit(P, kind, x0, m, sg, cur.rev);
        if (c !== null && c < best.cost) best = { x0: x0, m: m, sg: sg, rev: cur.rev, cost: c };
      }
    }
    return best;
  }
  function finish(P, kind, st) {
    var K = KINDS[kind], u = moduleValues(P, st.x0, st.m, K.N, st.rev), b = deblur(u, st.sg, st.ell);
    if (!b) return null;
    var r = readCode(b, kind);
    if (!r) return null;
    r.kind = kind; r.rev = st.rev; r.sigma = st.sg; r.x0 = st.x0; r.m = st.m;
    return r;
  }
  // Try one line (and its mirror image, for a code held upside down).
  function decodeProfile(P, kinds) {
    var best = null;
    (kinds || ["ean13"]).forEach(function (kind) {
      var K = KINDS[kind], starts = [];
      // sharp-ish codes: the three guard patterns give an exact position
      findCandidates(P, kind, 3).forEach(function (c) {
        [false, true].forEach(function (rev) { SIGMAS.forEach(function (sg) {
          var cst = evalFit(P, kind, c.x0, c.m, sg, rev);
          if (cst !== null) starts.push({ x0: c.x0, m: c.m, sg: sg, rev: rev, cost: cst });
        }); });
      });
      // blurry codes: only the stretch where bars are seen, then a coarse search inside it
      extentSeeds(P, K.N).slice(0, 6).forEach(function (r) {
        [0, 2, 4, 6].forEach(function (e) {
          var m = (r[1] - r[0]) / (K.N + e);
          for (var f = -1; f <= 1.001; f += 0.4) {
            var x0 = r[0] + (e / 2 + f) * m;
            [false, true].forEach(function (rev) { [0.5, 0.9, 1.3].forEach(function (sg) {
              var cst = evalFit(P, kind, x0, m, sg, rev);
              if (cst !== null) starts.push({ x0: x0, m: m, sg: sg, rev: rev, cost: cst });
            }); });
          }
        });
      });
      starts.sort(function (a, b) { return a.cost - b.cost; });
      // keep the few best, clearly different starts
      var kept = [];
      starts.forEach(function (s) {
        if (kept.length >= 3) return;
        for (var i = 0; i < kept.length; i++) if (kept[i].rev === s.rev && Math.abs(kept[i].x0 - s.x0) < 1.5 * s.m && Math.abs(kept[i].m / s.m - 1) < 0.04) return;
        kept.push(s);
      });
      kept.forEach(function (s) {
        var r = finish(P, kind, refine(P, kind, s));
        if (r && (!best || r.cost < best.cost)) best = r;
      });
    });
    return best;
  }

  // Accept a reading when the check digit adds up AND it fits the picture: a very good fit counts on its own line; a looser fit
  // (blurry code) only when two different lines of the picture give exactly the same number.
  var ACCEPT = { ean13: { alone: 0.03, agreed: 0.08 }, ean8: { alone: 0.02, agreed: 0.055 } };
  function fits(r, which) {
    if (!r || !checkOk(r.digits) || r.cost / r.N > ACCEPT[r.kind][which]) return false;
    // The check digit must not have had to bend the reading: a code with a bar missing or a blot can sit 2 or 3 modules from a DIFFERENT
    // valid number, and two lines of the same picture would "agree" on it.
    return r.cost - r.uncost <= 1.0;
  }
  function codeOf(r) {
    var s = r.digits.join("");
    if (r.kind === "ean13" && s.charAt(0) === "0") s = s.slice(1);   // a UPC-A is an EAN-13 with a leading zero
    return s;
  }

  // ---- 4. scan a whole picture along many lines, at several angles ----
  var ANGLES = [0, 90, 8, -8, 82, 98, 16, -16, 74, 106, 24, -24, 66, 114, 35, -35];
  function profileAlong(g, w, h, cx, cy, dx, dy, nx, ny, t) {
    // line through (cx,cy) + t*(nx,ny) with direction (dx,dy), clipped to the picture, sampled every pixel
    var px = cx + t * nx, py = cy + t * ny, s0 = -1e9, s1 = 1e9;
    function clip(p, d, lo, hi) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { s0 = 1; s1 = 0; } return; }
      var a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) { var tmp = a; a = b; b = tmp; }
      if (a > s0) s0 = a;
      if (b < s1) s1 = b;
    }
    clip(px, dx, 0, w - 1); clip(py, dy, 0, h - 1);
    if (s1 - s0 < 40) return null;
    var n = Math.floor(s1 - s0), P = new Float32Array(n), i;
    for (i = 0; i < n; i++) {
      var x = px + (s0 + i) * dx, y = py + (s0 + i) * dy;
      var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      if (x0 >= w - 1) { x0 = w - 2; fx = 1; }
      if (y0 >= h - 1) { y0 = h - 2; fy = 1; }
      var o = y0 * w + x0;
      P[i] = g[o] * (1 - fx) * (1 - fy) + g[o + 1] * fx * (1 - fy) + g[o + w] * (1 - fx) * fy + g[o + w + 1] * fx * fy;
    }
    return P;
  }
  // g: Uint8/Float array of grayscale (dark = low), w x h. Returns { code, kind, digits } or null.
  // opts: { lines: lines per angle (default 18), keep: how many of the busiest lines to read (default 10), ean8: also try EAN-8 (default true), angles }
  function decode(g, w, h, opts) {
    opts = opts || {};
    var lines = opts.lines || 18, keep = opts.keep || 12, kinds = opts.ean8 === false ? ["ean13"] : ["ean13", "ean8"];
    var angles = opts.angles || ANGLES, pool = [], cx = (w - 1) / 2, cy = (h - 1) / 2, ai, li;
    for (ai = 0; ai < angles.length; ai++) {
      var th = angles[ai] * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
      var ext = Math.abs(w * ny) + Math.abs(h * nx);   // size of the picture across the lines
      for (li = 0; li < lines; li++) {
        var t = (li + 0.5) / lines * ext - ext / 2;
        var P = profileAlong(g, w, h, cx, cy, dx, dy, nx, ny, t);
        if (!P) continue;
        var act = activity(P, Math.max(120, Math.round(P.length * 0.6)));
        if (act >= 22) pool.push({ P: P, act: act, a: angles[ai], t: t, dx: dx, dy: dy, nx: nx, ny: ny });
      }
    }
    pool.sort(function (a, b) { return b.act - a.act; });
    var seen = {}, best = null, i, tried = 0;
    for (i = 0; i < pool.length && tried < keep; i++) {
      tried++;
      var r = decodeProfile(pool[i].P, kinds);
      if (!r || !fits(r, "agreed")) continue;
      var code = codeOf(r), e = seen[code] || (seen[code] = { n: 0, best: r });
      e.n++;
      if (r.cost < e.best.cost) e.best = r;
      if (fits(e.best, "alone") || e.n >= 2) { best = e.best; break; }
    }
    // Nothing sure from single lines (a blurry or noisy code): average the neighbouring parallel lines, which cancels the noise
    // and keeps the bars, and read that. Only the busiest few lines, one per place.
    if (!best && !opts.noAverage) {
      var used = [], avgTried = 0;
      for (i = 0; i < pool.length && avgTried < (opts.avgKeep || 6); i++) {
        var q = pool[i], dup = used.some(function (u) { return u.a === q.a && Math.abs(u.t - q.t) < 8; });
        if (dup) continue;
        used.push(q); avgTried++;
        var Pa = averagedProfile(g, w, h, cx, cy, q, 5, 1.4);
        if (!Pa) continue;
        var ra = decodeProfile(Pa, kinds);
        if (ra && fits(ra, "agreed") && (!best || ra.cost < best.cost)) { best = ra; if (fits(ra, "alone")) break; }
      }
    }
    if (!best) return null;
    return { code: codeOf(best), kind: best.kind, digits: best.digits, quality: best.cost / best.N, gap: best.cost - best.uncost, sigma: best.sigma };
  }
  // The mean of the 2*half+1 lines next to a line (spacing step px), all parallel to it.
  function averagedProfile(g, w, h, cx, cy, q, half, step) {
    var acc = null, n = 0, j;
    for (j = -half; j <= half; j++) {
      var P = profileAlong(g, w, h, cx, cy, q.dx, q.dy, q.nx, q.ny, q.t + j * step);
      if (!P) continue;
      if (!acc) acc = { sum: new Float32Array(P.length), len: P.length };
      var L = Math.min(acc.len, P.length), k;
      for (k = 0; k < L; k++) acc.sum[k] += P[k];
      n++;
    }
    if (!acc || n < 3) return null;
    var out = new Float32Array(acc.len), k2;
    for (k2 = 0; k2 < acc.len; k2++) out[k2] = acc.sum[k2] / n;
    return out;
  }

  // Browser helper: a canvas or video frame -> grayscale -> decode. Keeps the longest side at about 1280 px.
  function decodeCanvas(src, opts) {
    var sw = src.width || src.videoWidth, sh = src.height || src.videoHeight;
    if (!sw || !sh) return null;
    var k = Math.min(1, 1280 / Math.max(sw, sh)), w = Math.max(32, Math.round(sw * k)), h = Math.max(32, Math.round(sh * k));
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(src, 0, 0, w, h);
    var p = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), i;
    for (i = 0; i < g.length; i++) g[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    return decode(g, w, h, opts);
  }

  var api = { decode: decode, decodeCanvas: decodeCanvas, decodeProfile: decodeProfile, checkOk: checkOk, _internal: { moduleValues: moduleValues, readCode: readCode, groupCosts: groupCosts, freeCost: freeCost, extentSeeds: extentSeeds, deblur: deblur, ACCEPT: ACCEPT, fits: fits, codeOf: codeOf, PAD: PAD, findCandidates: findCandidates, KINDS: KINDS } };
  if (typeof window !== "undefined") window.Barcode = api;
  else if (typeof self !== "undefined") self.Barcode = api;   // inside the web worker
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
