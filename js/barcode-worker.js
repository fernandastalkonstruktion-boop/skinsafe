// Reads barcodes off the page's main thread (js/barcode.js is a heavy search; on a phone it would freeze the camera picture otherwise).
// Message in: { id, w, h, g: gray pixels (Uint8Array), opts }.  Message out: { id, res: { code, kind, quality } | null }.
var v = (self.location.search.match(/v=([^&]*)/) || [])[1] || "dev";
importScripts("barcode.js?v=" + v);
self.onmessage = function (e) {
  var m = e.data, res = null;
  try { res = self.Barcode.decode(m.g, m.w, m.h, m.opts || {}); } catch (err) { res = null; }
  self.postMessage({ id: m.id, res: res });
};
