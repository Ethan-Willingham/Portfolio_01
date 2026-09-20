// Optional audit-sluice EXPERIMENT. Measures recurring Canvas snapshot costs;
// injected only by the local profiling server, never shipped in the game.
var backdropProbeBegin = jelloBackdropBegin;
jelloBackdropBegin = function () {
  var start = performance.now();
  try { return backdropProbeBegin.apply(this, arguments); }
  finally { perfMark('audit.backdrop', start); }
};
var backdropProbeCopy = ctx.drawImage;
ctx.drawImage = function (source) {
  if (source !== this.canvas) return backdropProbeCopy.apply(this, arguments);
  var start = performance.now();
  try { return backdropProbeCopy.apply(this, arguments); }
  finally { perfRecord('audit.selfCopy', (perfBucketsRaw['audit.selfCopy'] || 0) + performance.now() - start); }
};
