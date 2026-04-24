/* ============================================================
   PARTICLES.JS
   Three particle demos, each with live sliders.
   All rendering via CSS box-shadow on a 1px div.
   ============================================================ */
(function () {
  'use strict';

  var PALETTE = [
    '#E8A87C','#D27D5F','#C38D9E','#41B3A3',
    '#E27D60','#85CDCA','#E8E8E8','#659DBD',
    '#DAAD86','#BC986A','#8EE3C5','#F6D55C',
    '#ED553B','#3CAEA3','#F7DB4F','#2A9D8F',
    '#E9C46A','#F4A261','#264653','#A8DADC'
  ];

  function randColor() { return PALETTE[Math.floor(Math.random() * PALETTE.length)]; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---- Generic demo runner ---- */
  function initDemo(container) {
    var mode = container.dataset.mode; // 'bounce', 'collide', 'sponge'
    var canvas = container.querySelector('.p-canvas');
    var dot = container.querySelector('.render-dot');
    var fpsEl = container.querySelector('.p-fps');
    var hintEl = container.querySelector('.p-hint');
    if (!dot || !canvas) return;

    var W, H, balls = [];
    var pointerDown = false, ptrX = 0, ptrY = 0;
    var prevTime = 0, fc = 0, ft = 0, hintVis = true;

    /* Slider refs */
    var sliders = {};
    var defaults = {};
    var inputs = container.querySelectorAll('input[type="range"]');
    for (var i = 0; i < inputs.length; i++) {
      var s = inputs[i];
      sliders[s.dataset.param] = s;
      defaults[s.dataset.param] = s.defaultValue;
      // Live value display
      (function(sl) {
        var valEl = container.querySelector('[data-value="' + sl.dataset.param + '"]');
        if (valEl) {
          valEl.textContent = sl.value;
          sl.addEventListener('input', function() { valEl.textContent = sl.value; });
        }
      })(s);
    }

    /* Reset button */
    var resetBtn = container.querySelector('.p-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        for (var key in defaults) {
          if (sliders[key]) {
            sliders[key].value = defaults[key];
            var valEl = container.querySelector('[data-value="' + key + '"]');
            if (valEl) valEl.textContent = defaults[key];
          }
        }
        resize();
        balls = makeBalls(Math.round(param('count', 80)));
      });
    }

    function param(name, fallback) {
      if (sliders[name]) return parseFloat(sliders[name].value);
      return fallback;
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
    }

    function makeBalls(count) {
      var arr = [];
      for (var i = 0; i < count; i++) {
        var hx = Math.random() * W, hy = Math.random() * H;
        var sz = (mode === 'collide') ? param('size', 10) : 4 + Math.random() * 14;
        arr.push({
          x: hx, y: hy, z: (mode === 'collide') ? 30 : Math.random() * 60,
          homeX: hx, homeY: hy,
          vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, vz: 0,
          size: sz,
          color: randColor()
        });
      }
      return arr;
    }

    /* Ensure ball count matches slider */
    function syncCount() {
      var want = Math.round(param('count', 80));
      while (balls.length < want) {
        var b = makeBalls(1)[0];
        balls.push(b);
      }
      while (balls.length > want) balls.pop();
    }

    /* ---- Physics per mode ---- */
    function updateBounce(dt) {
      var gravity = param('gravity', 400);
      var damp = param('damping', 95) / 100;
      var pull = param('pull', 800);

      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        b.vy += gravity * dt;
        if (pointerDown) {
          var dx = ptrX - b.x, dy = ptrY - b.y;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 1 && dist < 300) {
            var f = (1 - dist / 300) * pull;
            b.vx += (dx / dist) * f * dt;
            b.vy += (dy / dist) * f * dt;
          }
        }
        b.vx *= damp; b.vy *= damp;
        b.x += b.vx * dt; b.y += b.vy * dt;
        // Bounce off walls
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * 0.7; }
        if (b.x > W) { b.x = W; b.vx = -Math.abs(b.vx) * 0.7; }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) * 0.7; }
        if (b.y > H) { b.y = H; b.vy = -Math.abs(b.vy) * 0.7; }
      }
    }

    function updateCollide(dt) {
      var gravity = param('gravity', 300);
      var bounce = param('bounce', 80) / 100;
      var sz = param('size', 10);
      var pull = param('pull', 600);

      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        b.size = sz;
        b.vy += gravity * dt;
        if (pointerDown) {
          var dx = ptrX - b.x, dy = ptrY - b.y;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 1 && dist < 250) {
            var f = (1 - dist / 250) * pull;
            b.vx += (dx / dist) * f * dt;
            b.vy += (dy / dist) * f * dt;
          }
        }
        b.vx *= 0.995; b.vy *= 0.995;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.size) { b.x = b.size; b.vx = Math.abs(b.vx) * bounce; }
        if (b.x > W - b.size) { b.x = W - b.size; b.vx = -Math.abs(b.vx) * bounce; }
        if (b.y < b.size) { b.y = b.size; b.vy = Math.abs(b.vy) * bounce; }
        if (b.y > H - b.size) { b.y = H - b.size; b.vy = -Math.abs(b.vy) * bounce; }
      }
      // n^2 collision
      for (var i = 0; i < balls.length; i++) {
        for (var j = i + 1; j < balls.length; j++) {
          var a = balls[i], bb = balls[j];
          var dx = bb.x - a.x, dy = bb.y - a.y;
          var dist = Math.sqrt(dx*dx + dy*dy);
          var minD = a.size + bb.size;
          if (dist < minD && dist > 0.1) {
            var nx = dx / dist, ny = dy / dist;
            var overlap = minD - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            bb.x += nx * overlap * 0.5;
            bb.y += ny * overlap * 0.5;
            var dvx = a.vx - bb.vx, dvy = a.vy - bb.vy;
            var dvn = dvx * nx + dvy * ny;
            if (dvn > 0) {
              a.vx -= dvn * nx * bounce;
              a.vy -= dvn * ny * bounce;
              bb.vx += dvn * nx * bounce;
              bb.vy += dvn * ny * bounce;
            }
          }
        }
      }
    }

    function updateSponge(dt) {
      var springK = param('spring', 3.5);
      var pullF = param('pull', 1800);
      var pullR = param('radius', 250);
      var damp = param('damping', 91) / 100;

      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        b.vx += (b.homeX - b.x) * springK * dt;
        b.vy += (b.homeY - b.y) * springK * dt;
        if (pointerDown) {
          var dx = ptrX - b.x, dy = ptrY - b.y;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < pullR && dist > 1) {
            var f = (1 - dist / pullR) * pullF;
            b.vx += (dx / dist) * f * dt;
            b.vy += (dy / dist) * f * dt;
          }
        }
        b.vx *= damp; b.vy *= damp;
        b.x += b.vx * dt; b.y += b.vy * dt;
      }
    }

    var updaters = { bounce: updateBounce, collide: updateCollide, sponge: updateSponge };

    function render() {
      syncCount();
      balls.sort(function (a, b) { return b.z - a.z; });
      var s = [];
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        var zScale = (mode === 'collide') ? 1 : 1 + b.z / 40;
        var spread = (b.size * zScale - 1) / 2;
        s.push(b.x + 'px ' + b.y + 'px 0 ' + spread + 'px ' + b.color);
      }
      dot.style.boxShadow = s.join(',');
    }

    function tick(ts) {
      var dt = Math.min((ts - prevTime) / 1000, 0.05);
      prevTime = ts;
      (updaters[mode] || updateBounce)(dt);
      render();
      fc++; ft += dt;
      if (ft >= 1) {
        if (fpsEl) fpsEl.textContent = Math.round(fc / ft) + ' fps';
        fc = 0; ft = 0;
      }
      requestAnimationFrame(tick);
    }

    /* Events */
    function gp(e) {
      var r = canvas.getBoundingClientRect();
      var src = e.touches ? e.touches[0] : e;
      ptrX = src.clientX - r.left; ptrY = src.clientY - r.top;
    }
    canvas.addEventListener('mousedown', function(e) {
      pointerDown = true; gp(e);
      if (hintVis && hintEl) { hintEl.style.opacity = '0'; hintVis = false; }
    });
    canvas.addEventListener('mousemove', function(e) { if (pointerDown) gp(e); });
    canvas.addEventListener('mouseup', function() { pointerDown = false; });
    canvas.addEventListener('mouseleave', function() { pointerDown = false; });
    canvas.addEventListener('touchstart', function(e) {
      e.preventDefault(); pointerDown = true; gp(e);
      if (hintVis && hintEl) { hintEl.style.opacity = '0'; hintVis = false; }
    }, { passive: false });
    canvas.addEventListener('touchmove', function(e) { e.preventDefault(); gp(e); }, { passive: false });
    canvas.addEventListener('touchend', function() { pointerDown = false; });
    canvas.addEventListener('touchcancel', function() { pointerDown = false; });

    window.addEventListener('resize', function() {
      resize();
      for (var i = 0; i < balls.length; i++) {
        balls[i].homeX = Math.random() * W;
        balls[i].homeY = Math.random() * H;
      }
    });

    /* Boot */
    resize();
    balls = makeBalls(Math.round(param('count', 80)));
    prevTime = performance.now();
    requestAnimationFrame(tick);
  }

  /* Init all demos on page */
  var demos = document.querySelectorAll('[data-mode]');
  for (var i = 0; i < demos.length; i++) initDemo(demos[i]);

})();
