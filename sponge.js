/* ============================================================
   SPONGE.JS
   Box-shadow particle sim: balls seek home positions,
   touch/mouse pulls them away. Sponge effect.
   ============================================================ */
(function () {
  'use strict';

  var container = document.getElementById('sponge-demo');
  if (!container) return;

  var renderDot = container.querySelector('.render-dot');
  var fpsEl     = container.querySelector('.demo-fps');
  var hintEl    = container.querySelector('.demo-hint');

  /* ---- Palette ---- */
  var PALETTE = [
    '#A8B545', '#7A9B3A', '#C2CC68', '#556B2F',
    '#8B6E4E', '#6B4226', '#A0522D', '#D2B48C',
    '#C4B38A', '#EDE6DA', '#8F8978', '#5E6B42'
  ];

  /* ---- State ---- */
  var W, H;
  var balls = [];
  var BALL_COUNT = 120;
  var pointerDown = false;
  var pointerX = 0, pointerY = 0;
  var prevTime = 0;
  var frameCount = 0;
  var fpsTimer = 0;
  var hintVisible = true;

  /* ---- Init ---- */
  function resize() {
    var rect = container.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
  }

  function randomColor() {
    return PALETTE[Math.floor(Math.random() * PALETTE.length)];
  }

  function createBalls() {
    balls = [];
    for (var i = 0; i < BALL_COUNT; i++) {
      var homeX = Math.random() * W;
      var homeY = Math.random() * H;
      var size  = 4 + Math.random() * 14;
      var z     = Math.random() * 60;
      balls.push({
        x: homeX, y: homeY, z: z,
        homeX: homeX, homeY: homeY, homeZ: z,
        vx: 0, vy: 0, vz: 0,
        size: size,
        color: randomColor()
      });
    }
  }

  /* ---- Physics ---- */
  function update(dt) {
    dt = Math.min(dt, 0.05);

    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];

      /* Spring toward home */
      var springK = 3.5;
      var dx = b.homeX - b.x;
      var dy = b.homeY - b.y;
      var dz = b.homeZ - b.z;
      b.vx += dx * springK * dt;
      b.vy += dy * springK * dt;
      b.vz += dz * springK * dt;

      /* Pointer pull */
      if (pointerDown) {
        var px = pointerX - b.x;
        var py = pointerY - b.y;
        var dist = Math.sqrt(px * px + py * py);
        if (dist < 250 && dist > 1) {
          var pullStrength = (1 - dist / 250) * 1800;
          b.vx += (px / dist) * pullStrength * dt;
          b.vy += (py / dist) * pullStrength * dt;
          b.vz += (Math.random() - 0.5) * 120 * dt;
        }
      }

      /* Damping */
      b.vx *= 0.91;
      b.vy *= 0.91;
      b.vz *= 0.91;

      /* Integrate */
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;

      /* Soft boundary */
      if (b.x < -20) { b.x = -20; b.vx *= -0.5; }
      if (b.x > W + 20) { b.x = W + 20; b.vx *= -0.5; }
      if (b.y < -20) { b.y = -20; b.vy *= -0.5; }
      if (b.y > H + 20) { b.y = H + 20; b.vy *= -0.5; }
    }
  }

  /* ---- Render via box-shadow ---- */
  var RENDER_SIZE = 1; /* the element is 1x1px */

  function render() {
    /* Sort by z (back to front) */
    balls.sort(function (a, b) { return b.z - a.z; });

    var parts = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var zScale = 1 + b.z / 40;
      var radius = b.size * zScale;
      var spread = (radius - RENDER_SIZE) / 2;
      parts.push(
        b.x + 'px ' +
        b.y + 'px 0 ' +
        spread + 'px ' +
        b.color
      );
    }
    renderDot.style.boxShadow = parts.join(',');
  }

  /* ---- Loop ---- */
  function tick(timestamp) {
    var dt = (timestamp - prevTime) / 1000;
    prevTime = timestamp;

    update(dt);
    render();

    /* FPS counter */
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 1) {
      if (fpsEl) fpsEl.textContent = Math.round(frameCount / fpsTimer) + ' fps';
      frameCount = 0;
      fpsTimer = 0;
    }

    requestAnimationFrame(tick);
  }

  /* ---- Events ---- */
  function getPointerPos(e) {
    var rect = container.getBoundingClientRect();
    var src  = e.touches ? e.touches[0] : e;
    pointerX = src.clientX - rect.left;
    pointerY = src.clientY - rect.top;
  }

  container.addEventListener('mousedown', function (e) {
    pointerDown = true; getPointerPos(e);
    if (hintVisible && hintEl) { hintEl.style.opacity = '0'; hintVisible = false; }
  });
  container.addEventListener('mousemove', function (e) { if (pointerDown) getPointerPos(e); });
  container.addEventListener('mouseup', function () { pointerDown = false; });
  container.addEventListener('mouseleave', function () { pointerDown = false; });

  container.addEventListener('touchstart', function (e) {
    e.preventDefault(); pointerDown = true; getPointerPos(e);
    if (hintVisible && hintEl) { hintEl.style.opacity = '0'; hintVisible = false; }
  }, { passive: false });
  container.addEventListener('touchmove', function (e) {
    e.preventDefault(); getPointerPos(e);
  }, { passive: false });
  container.addEventListener('touchend', function () { pointerDown = false; });
  container.addEventListener('touchcancel', function () { pointerDown = false; });

  /* Handle window resize */
  window.addEventListener('resize', function () {
    resize();
    /* Redistribute home positions */
    for (var i = 0; i < balls.length; i++) {
      balls[i].homeX = Math.random() * W;
      balls[i].homeY = Math.random() * H;
    }
  });

  /* ---- Boot ---- */
  resize();
  createBalls();
  prevTime = performance.now();
  requestAnimationFrame(tick);

})();
