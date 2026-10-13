/* Per-demo scheduling. Inactive demos retain their callbacks and simulation state. */
(function () {
  'use strict';
  function create(element, options) {
    options = options || {};
    var focused = document.hasFocus(), shown = true, disposed = false;
    var frames = new Map(), timers = new Map(), listeners = [], subscribers = [], animations = [];
    var nextId = 1, inactiveTime = 0, pausedAt = null, enabled = false;
    function inView() {
      var r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    }
    var visible = inView();
    function now() { return (pausedAt === null ? performance.now() : pausedAt) - inactiveTime; }
    function armFrame(entry) {
      if (!enabled || entry.native !== null) return;
      entry.native = window.requestAnimationFrame(function (time) {
        entry.native = null;
        if (!enabled || !frames.has(entry.id)) return;
        frames.delete(entry.id);
        entry.callback(options.clock === false ? time : now());
      });
    }
    function armTimer(entry) {
      if (!enabled || entry.native !== null) return;
      entry.native = window.setTimeout(function () {
        entry.native = null;
        if (!enabled || !timers.has(entry.id)) return;
        if (entry.repeat) entry.due = now() + entry.delay;
        else timers.delete(entry.id);
        try { entry.callback(); }
        finally { if (entry.repeat && timers.has(entry.id)) armTimer(entry); }
      }, Math.max(0, entry.due - now()));
    }
    function sync() {
      var active = !disposed && shown && focused && !document.hidden && visible;
      if (active === enabled) return;
      enabled = active;
      if (active) {
        if (pausedAt !== null) inactiveTime += performance.now() - pausedAt;
        pausedAt = null;
        animations.forEach(function (animation) { if (animation.playState === 'paused') animation.play(); });
        animations = [];
      } else {
        pausedAt = performance.now();
        animations = element.getAnimations ? element.getAnimations({ subtree: true }).filter(function (animation) { return animation.playState === 'running'; }) : [];
        animations.forEach(function (animation) { animation.pause(); });
        frames.forEach(function (entry) { if (entry.native !== null) window.cancelAnimationFrame(entry.native); entry.native = null; });
        timers.forEach(function (entry) { if (entry.native !== null) window.clearTimeout(entry.native); entry.native = null; });
      }
      subscribers.slice().forEach(function (callback) { callback(active); });
      if (active) { frames.forEach(armFrame); timers.forEach(armTimer); }
    }
    function listen(target, event, callback) {
      target.addEventListener(event, callback);
      listeners.push(function () { target.removeEventListener(event, callback); });
    }
    function refresh() { visible = inView(); sync(); }
    function timer(callback, delay, repeat) {
      delay = Math.max(1, Number(delay) || 0);
      var entry = { id: nextId++, callback: callback, delay: delay, repeat: repeat, native: null, due: now() + delay };
      timers.set(entry.id, entry); armTimer(entry); return entry.id;
    }
    function clearTimer(id) {
      var entry = timers.get(id);
      if (entry && entry.native !== null) window.clearTimeout(entry.native);
      timers.delete(id);
    }
    listen(window, 'blur', function () { focused = false; sync(); });
    listen(window, 'focus', function () { focused = true; refresh(); });
    listen(document, 'visibilitychange', function () { focused = document.hasFocus(); refresh(); });
    listen(window, 'pagehide', function () { shown = false; sync(); });
    listen(window, 'pageshow', function () { shown = true; focused = document.hasFocus(); refresh(); });
    listen(window, 'resize', refresh);
    // Scroll also covers browsers without IntersectionObserver and fullscreen transitions.
    listen(window, 'scroll', refresh);
    var observer = window.IntersectionObserver ? new IntersectionObserver(refresh) : null;
    if (observer) observer.observe(element);
    enabled = true;
    sync();
    return {
      active: function () { return enabled; },
      now: now,
      onChange: function (callback) { subscribers.push(callback); callback(enabled); },
      requestFrame: function (callback) {
        var entry = { id: nextId++, callback: callback, native: null };
        frames.set(entry.id, entry); armFrame(entry); return entry.id;
      },
      cancelFrame: function (id) {
        var entry = frames.get(id);
        if (entry && entry.native !== null) window.cancelAnimationFrame(entry.native);
        frames.delete(id);
      },
      setInterval: function (callback, delay) {
        return timer(callback, delay, true);
      },
      clearInterval: clearTimer,
      setTimeout: function (callback, delay) { return timer(callback, delay, false); },
      clearTimeout: clearTimer,
      destroy: function () {
        disposed = true; sync(); frames.clear(); timers.clear();
        listeners.forEach(function (remove) { remove(); });
        if (observer) observer.disconnect(); subscribers.length = 0;
      }
    };
  }
  window.DemoActivity = { create: create };
})();
