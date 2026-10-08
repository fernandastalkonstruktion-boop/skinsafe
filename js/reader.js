// Works out WHICH product a camera picture shows, from the words on its package. Used by the camera screen (Product and Shelf modes)
// and by the Node tests in tools/camtest, so what is tested is what runs on the phone.
//
// Why the pictures are cleaned first: a phone camera frame of a hand-held package has uneven light, shiny or see-through plastic,
// coloured bottles and neighbouring products. The reader (Tesseract) gives almost nothing on such a frame as it is. Each pass here
// looks at the frame a different way (local contrast, the most contrasting colour direction, the middle only, turned sideways, light
// letters on dark) and the words of all the passes are pooled. Words from the middle of the frame are kept apart as well, so that the
// products standing next to the one in the hand don't outvote it.
//
// engine.recognize(gray, psm) -> Promise<{ text, words:[{text, confidence, bbox:{x0,y0,x1,y1}}] }>   (Tesseract, bound by the caller)
// shop.identify(text) -> Promise<{ tokens, exact, matches, evidence }>                                   (Shop in api.js)
(function () {
  "use strict";
  var IO = (typeof window !== "undefined" && window.ImgOps) ? window.ImgOps : require("./imgops.js");
  var SIZE = 1600;

  function ln(g) { return IO.localNorm(IO.fit(g, SIZE), 18, 0.9); }
  function midCrop(g) { return IO.crop(g, g.w * 0.18, 0, g.w * 0.64, g.h); }

  // A frame = the same picture in the two grays the passes use.
  function frameFromRGBA(rgba, w, h) { return { lum: IO.fromRGBA(rgba, w, h), pca: IO.pcaGray(rgba, w, h), w: w, h: h }; }
  function frameFromCanvas(c) {
    var x = c.getContext("2d", { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height);
    return frameFromRGBA(d.data, c.width, c.height);
  }

  // Passes in the order that gives the most per second of reading. place: where the words go (full = whole frame, mid = middle only,
  // turned/side = pooled but their positions say nothing about the frame).
  var PASSES = [
    { id: "ln3", label: "Reading the package", psm: 3, src: "lum", place: "full", prep: ln },
    { id: "ln11p", label: "Reading scattered words", psm: 11, src: "pca", place: "full", prep: ln },
    { id: "mid3", label: "Reading the middle", psm: 3, src: "lum", place: "mid", prep: function (g) { return ln(midCrop(g)); } },
    { id: "cw", label: "Reading it sideways", psm: 3, src: "lum", place: "turned", prep: function (g) { return IO.rot90(ln(g), true); } },
    { id: "inv11p", label: "Reading light letters", psm: 11, src: "pca", place: "full", prep: function (g) { return IO.invert(ln(g)); } },
    { id: "ccw", label: "Reading it sideways", psm: 3, src: "lum", place: "turned", prep: function (g) { return IO.rot90(ln(g), false); } },
    { id: "mid11p", label: "Reading the middle", psm: 11, src: "pca", place: "mid", prep: function (g) { return ln(midCrop(g)); } },
    { id: "left3", label: "Reading the left side", psm: 3, src: "lum", place: "side", prep: function (g) { return ln(IO.crop(g, 0, 0, g.w * 0.58, g.h)); } },
    { id: "right3", label: "Reading the right side", psm: 3, src: "lum", place: "side", prep: function (g) { return ln(IO.crop(g, g.w * 0.42, 0, g.w * 0.58, g.h)); } }
  ];

  // The middle of the frame (as fractions): a word counts as "in the middle" when its centre is inside this box.
  var MID = { x0: 0.2, x1: 0.8, y0: 0.06, y1: 0.94 };
  function midText(words, w, h) {
    var out = [];
    (words || []).forEach(function (wd) {
      if (!wd.bbox || !(wd.confidence >= 20) || !/[A-Za-z0-9]/.test(wd.text || "")) return;
      var cx = (wd.bbox.x0 + wd.bbox.x1) / 2 / w, cy = (wd.bbox.y0 + wd.bbox.y1) / 2 / h;
      if (cx >= MID.x0 && cx <= MID.x1 && cy >= MID.y0 && cy <= MID.y1) out.push(wd.text);
    });
    return out.join(" ");
  }

  function newState(maxPasses) { return { all: [], mid: [], max: maxPasses || 0 }; }
  function runPass(p, frame, engine) {
    var img = p.prep(frame[p.src]);
    return engine.recognize(img, p.psm).then(function (r) { return { text: r.text || "", words: r.words || [], w: img.w, h: img.h }; });
  }
  function add(st, p, res) {
    st.all.push(res.text);
    if (p.place === "mid") st.mid.push(res.text);
    else if (p.place === "full") st.mid.push(midText(res.words, res.w, res.h));
    if (st.max) { while (st.all.length > st.max) st.all.shift(); while (st.mid.length > st.max) st.mid.shift(); }
  }

  function topRank(r) { return r && r.evidence && r.evidence[0] ? r.evidence[0].rank || 0 : 0; }
  function key(p) { return (p.brand || "") + "|" + (p.name || ""); }
  // Combine the two readings: the middle of the frame wins unless the whole frame is clearly better.
  function merge(ra, rc) {
    var first = topRank(rc) * 1.15 >= topRank(ra) ? rc : ra, second = first === rc ? ra : rc, seen = {}, matches = [], evidence = [];
    [first, second].forEach(function (r) {
      (r.matches || []).forEach(function (m, i) {
        if (seen[key(m)] || matches.length >= 6) return;
        seen[key(m)] = 1; matches.push(m); evidence.push(r.evidence[i]);
      });
    });
    return { tokens: (first.tokens || []).concat((second.tokens || []).filter(function (t) { return (first.tokens || []).indexOf(t) < 0; })), exact: first.exact, matches: matches, evidence: evidence };
  }
  function judge(st, shop) {
    var tAll = st.all.join("\n"), tMid = st.mid.join("\n");
    return shop.identify(tAll).then(function (ra) {
      if (!/[A-Za-z]{3}/.test(tMid)) return ra;
      return shop.identify(tMid).then(function (rc) { return merge(ra, rc); });
    });
  }

  // A match sure enough to stop reading: the exact one, or a clear leader (brand read, most of its name read, well ahead of the second).
  function isSure(r) {
    if (!r) return false;
    if (r.exact) return true;
    var e0 = r.evidence && r.evidence[0], e1 = r.evidence && r.evidence[1];
    return !!(e0 && e0.brand && e0.cov >= 0.75 && e0.hits >= 3 && (!e1 || e0.score >= 1.4 * e1.score));
  }
  function better(r2, r) { return (r2.matches && r2.matches.length) || !(r && r.matches && r.matches.length) ? r2 : r; }

  // Read one frame with every pass in turn until a sure match. opts: { onStage(label), stop(), passes, state }
  function readProduct(frame, engine, shop, opts) {
    opts = opts || {};
    var st = opts.state || newState(), plan = opts.passes || PASSES, i = 0, best = null;
    function next() {
      if (i >= plan.length || (opts.stop && opts.stop())) return Promise.resolve(best);
      var p = plan[i++];
      if (opts.onStage) opts.onStage(p.label);
      return runPass(p, frame, engine).then(function (res) {
        add(st, p, res);
        return judge(st, shop);
      }).then(function (r) {
        best = better(r, best);
        if (isSure(best)) return best;
        return next();
      });
    }
    return next();
  }

  // ---- Shelf: many products in one picture ----
  // Words close together belong to the same package.
  function groups(words) {
    var ws = (words || []).filter(function (w) { return w.bbox && w.confidence >= 30 && /[A-Za-z]{2,}/.test(w.text || ""); });
    var parent = ws.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (var i = 0; i < ws.length; i++) {
      for (var j = i + 1; j < ws.length; j++) {
        var a = ws[i].bbox, b = ws[j].bbox, h = Math.max(a.y1 - a.y0, b.y1 - b.y0);
        var gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
        if (gx <= 1.5 * h && gy <= 1.8 * h) parent[find(i)] = find(j);
      }
    }
    var map = {};
    ws.forEach(function (w, k) { var r = find(k); (map[r] = map[r] || []).push(w); });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (g) { return g.length >= 2; })
      .map(function (g) { return { text: g.map(function (w) { return w.text; }).join(" "), words: g.length }; });
  }
  // Tiles with overlap, so small print gets enough pixels and a package cut by one tile edge is whole in the next.
  function tiles(g) {
    var cols = g.w >= g.h * 1.25 ? 3 : 2, rows = g.h >= g.w * 1.25 ? 3 : 2, out = [], tw = g.w / cols * 1.3, th = g.h / rows * 1.3, c, r;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var x = Math.min(g.w - tw, Math.max(0, (c + 0.5) / cols * g.w - tw / 2)), y = Math.min(g.h - th, Math.max(0, (r + 0.5) / rows * g.h - th / 2));
      out.push({ x: x, y: y, w: tw, h: th });
    }
    return out;
  }
  function shelfWords(gray, engine, invert, onStage) {
    var all = [];
    return tiles(gray).reduce(function (chain, t) {
      return chain.then(function () {
        if (onStage) onStage("Reading the shelf");
        var img = IO.localNorm(IO.fit(IO.crop(gray, t.x, t.y, t.w, t.h), 1300), 18, 0.9);
        if (invert) img = IO.invert(img);
        return engine.recognize(img, 11).then(function (r) {
          var sx = t.w / img.w, sy = t.h / img.h;
          (r.words || []).forEach(function (wd) {
            if (!wd.bbox) return;
            all.push({ text: wd.text, confidence: wd.confidence, bbox: { x0: t.x + wd.bbox.x0 * sx, y0: t.y + wd.bbox.y0 * sy, x1: t.x + wd.bbox.x1 * sx, y1: t.y + wd.bbox.y1 * sy } });
          });
        });
      });
    }, Promise.resolve()).then(function () { return all; });
  }
  function dedupeWords(words) {   // overlapping tiles read the same word twice
    var out = [];
    words.forEach(function (w) {
      var dup = out.some(function (o) {
        return o.text.toLowerCase() === w.text.toLowerCase() && Math.abs((o.bbox.x0 + o.bbox.x1) - (w.bbox.x0 + w.bbox.x1)) < (w.bbox.y1 - w.bbox.y0) * 2 && Math.abs((o.bbox.y0 + o.bbox.y1) - (w.bbox.y0 + w.bbox.y1)) < (w.bbox.y1 - w.bbox.y0) * 2;
      });
      if (!dup) out.push(w);
    });
    return out;
  }
  function readShelf(frame, engine, shop, opts) {
    opts = opts || {};
    var found = [];
    function identifyAll(words) {
      var gs = groups(dedupeWords(words));
      return gs.reduce(function (chain, g) {
        return chain.then(function () {
          return shop.identify(g.text).then(function (r) {
            var m = r.matches[0], ev = r.evidence[0];
            // Keep only solid matches: the brand plus another word, or at least three words of the name.
            if (m && ev && (ev.hits >= 3 || (ev.brand && ev.hits >= 2)) && !found.some(function (f) { return f.brand === m.brand && f.name === m.name; })) found.push(m);
          });
        });
      }, Promise.resolve());
    }
    return shelfWords(frame.lum, engine, false, opts.onStage).then(identifyAll).then(function () {
      if (found.length >= 3) return;
      if (opts.onStage) opts.onStage("Reading light letters");
      return shelfWords(frame.pca, engine, true, opts.onStage).then(identifyAll);
    }).then(function () { return { matches: found, shelf: true, tokens: [] }; });
  }

  var api = { PASSES: PASSES, frameFromRGBA: frameFromRGBA, frameFromCanvas: frameFromCanvas, newState: newState, runPass: runPass, add: add, judge: judge,
    isSure: isSure, better: better, readProduct: readProduct, readShelf: readShelf, groups: groups, tiles: tiles, midText: midText, merge: merge };
  if (typeof window !== "undefined") window.Reader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
