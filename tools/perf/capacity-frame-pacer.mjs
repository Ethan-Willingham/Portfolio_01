// Optional synthetic real-wall 120 Hz workload. This is not presentation proof.
// RAF gate tests require an unlimited callback source. Timer tests bypass that
// source and still run the complete game. Physics receives actual
// callback timestamps, and missed slots are discarded rather than run in bursts.
export function installFramePacer(mode) {
  if (!['paced120','timer120'].includes(mode)) throw Error('Unsupported synthetic cadence');
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const callbacks = new Map(), period = 1000 / 120;
  let serial = 0, pumping = false, deadline = null;
  const stats = window.__sluiceCapacityCadence = {
    mode, periodMs: period, callbacks: 0, ticks: 0, missedSlots: 0,
    maxLatenessMs: 0, synthetic: true, timestamps: 'Actual elapsed callback time',
    presentationCertified: false, scheduler: mode === 'timer120' ? 'Wall-clock timer' : 'Native RAF gate'
  };
  function schedule() {
    if (mode === 'timer120') setTimeout(() => pump(performance.now()), Math.max(0, (deadline ?? performance.now()) - performance.now()));
    else nativeRAF(pump);
  }
  function pump(time) {
    if (!callbacks.size) { pumping = false; deadline = null; return; }
    if (deadline === null) deadline = time;
    if (time + 0.05 < deadline) { schedule(); return; }
    const late = Math.max(0, time - deadline), missed = Math.floor(late / period);
    stats.missedSlots += missed; stats.maxLatenessMs = Math.max(stats.maxLatenessMs, late);
    stats.ticks++; deadline += (missed + 1) * period;
    const ready = Array.from(callbacks);
    for (const [id, callback] of ready) {
      // A preceding callback can cancel a later one in this same batch.
      // Requests added during callbacks wait for the following pump.
      if (callbacks.get(id) !== callback) continue;
      callbacks.delete(id);
      stats.callbacks++;
      try { callback(time); } catch (error) { setTimeout(() => { throw error; }, 0); }
    }
    if (callbacks.size) schedule(); else { pumping = false; deadline = null; }
  }
  window.requestAnimationFrame = callback => {
    const id = ++serial; callbacks.set(id, callback);
    if (!pumping) { pumping = true; schedule(); }
    return id;
  };
  window.cancelAnimationFrame = id => { callbacks.delete(id); };
}
