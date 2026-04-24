/* ============================================================
   SPONGE.JS
   Box-shadow particle sim: balls seek home, pointer pulls away.
   ============================================================ */
(function () {
  'use strict';

  var container = document.getElementById('sponge-demo');
  if (!container) return;

  var renderDot = container.querySelector('.render-dot');
  var fpsEl     = container.querySelector('.demo-fps');
  var hintEl    = container.querySelector('.demo-hint');

  var PALETTE = [
    '#A8B545', '#7A9B3A', '#C2CC68', '#556B2F',
    '#8B6E4E', '#6B4226', '#A0522D', '#D2B48C',
    '#C4B38A', '#EDE6DA', '#8F8978', '#5E6B42'
  ];

  var W, H, balls = [], COUNT = 120;
  var pointerDown = false, pointerX = 0, pointerY = 0;
  var prevTime = 0, frameCount = 0, fpsTimer = 0;
  var hintVisible = true;

  function resize() {
    var r = container.getBoundingClientRect();
    W = r.width; H = r.height;
  }

  function createBalls() {
    balls = [];
    for (var i = 0; i < COUNT; i++) {
      var hx = Math.random() * W, hy = Math.random() * H;
      var z = Math.random() * 60;
      balls.push({
        x: hx, y: hy, z: z,
        homeX: hx, homeY: hy, homeZ: z,
        vx: 0, vy: 0, vz: 0,
        size: 4 + Math.random() * 14,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var springK = 3.5;
      b.vx += (b.homeX - b.x) * springK * dt;
      b.vy += (b.homeY - b.y) * springK * dt;
      b.vz += (b.homeZ - b.z) * springK * dt;
      if (pointerDown) {
        var px = pointerX - b.x, py = pointerY - b.y;
        var dist = Math.sqrt(px * px + py * py);
        if (dist < 250 && dist > 1) {
          var f = (1 - dist / 250) * 1800;
          b.vx += (px / dist) * f * dt;
          b.vy += (py / dist) * f * dt;
          b.vz += (Math.random() - 0.5) * 120 * dt;
        }
      }
      b.vx *= 0.91; b.vy *= 0.91; b.vz *= 0.91;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.x < -20) { b.x = -20; b.vx *= -0.5; }
      if (b.x > W + 20) { b.x = W + 20; b.vx *= -0.5; }
      if (b.y < -20) { b.y = -20; b.vy *= -0.5; }
      if (b.y > H + 20) { b.y = H + 20; b.vy *= -0.5; }
    }
  }

  function render() {
    balls.sort(function (a, b) { return b.z - a.z; });
    var s = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var spread = (b.size * (1 + b.z / 40) - 1) / 2;
      s.push(b.x + 'px ' + b.y + 'px 0 ' + spread + 'px ' + b.color);
    }
    renderDot.style.boxShadow = s.join(',');
  }

  function tick(ts) {
    var dt = (ts - prevTime) / 1000;
    prevTime = ts;
    update(dt); render();
    frameCount++; fpsTimer += dt;
    if (fpsTimer >= 1) {
      if (fpsEl) fpsEl.textContent = Math.round(frameCount / fpsTimer) + ' fps';
      frameCount = 0; fpsTimer = 0;
    }
    requestAnimationFrame(tick);
  }

  function getPos(e) {
    var r = container.getBoundingClientRect();
    var src = e.touches ? e.touches[0] : e;
    pointerX = src.clientX - r.left; pointerY = src.clientY - r.top;
  }

  container.addEventListener('mousedown', function (e) {
    pointerDown = true; getPos(e);
    if (hintVisible && hintEl) { hintEl.style.opacity = '0'; hintVisible = false; }
  });
  container.addEventListener('mousemove', function (e) { if (pointerDown) getPos(e); });
  container.addEventListener('mouseup', function () { pointerDown = false; });
  container.addEventListener('mouseleave', function () { pointerDown = false; });
  container.addEventListener('touchstart', function (e) {
    e.preventDefault(); pointerDown = true; getPos(e);
    if (hintVisible && hintEl) { hintEl.style.opacity = '0'; hintVisible = false; }
  }, { passive: false });
  container.addEventListener('touchmove', function (e) { e.preventDefault(); getPos(e); }, { passive: false });
  container.addEventListener('touchend', function () { pointerDown = false; });
  container.addEventListener('touchcancel', function () { pointerDown = false; });

  window.addEventListener('resize', function () {
    resize();
    for (var i = 0; i < balls.length; i++) {
      balls[i].homeX = Math.random() * W;
      balls[i].homeY = Math.random() * H;
    }
  });

  resize(); createBalls();
  prevTime = performance.now();
  requestAnimationFrame(tick);
})();
