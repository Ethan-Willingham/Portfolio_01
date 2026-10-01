(function () {
  'use strict';
  const $ = id => document.getElementById('cart-' + id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  if (!ctx || !window.CartPhysics || !window.CartLevels || !window.CartView) return;
  const { World, clamp } = CartPhysics;
  const levels = CartLevels, game = $('game');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rootStyle = getComputedStyle(document.documentElement);
  const token = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const P = {
    dark: token('--bg-raised', '#1e2420'), green: token('--bg', '#303931'), edge: token('--rule', '#4a544b'),
    mid: token('--line-mid', '#767d71'), floor: token('--text-dim', '#b8b2a2'), seam: token('--text-faint', '#a4a293'),
    cream: token('--text', '#e8e2d6'), light: token('--text-bright', '#f5f1ea'), gold: token('--accent', '#d4c4a0'), red: token('--warn', '#d99090'),
    sage: '#9ec79a', pine: '#6f9a6c', clay: '#cf9f78', coral: '#d9978c', blue: '#8fb3c7', purple: '#b79bc4', brick: '#b8796d',
    steel: '#a6aeab', steelShade: '#687674', steelLight: '#e2e6df',
    hairDark: '#48392d', hair: '#6d5040', hairLight: '#927054'
  };
  const swatches = [P.coral, P.blue, P.gold, P.sage, P.clay, P.purple];
  const STORAGE = 'four-wheels-records-v4';
  let records = [], canSave = true;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(saved)) records = saved.slice(0, levels.length).map(r => r && Number.isFinite(r.time) && r.time > 0 && r.time < 10000 && Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 3 ? r : null);
  } catch { canSave = false; }
  let levelIndex = 0, world = new World(levels[0]), phase = 'ready', floor;
  let raf = 0, last = 0, accumulator = 0, uiTime = 0, toastLife = 0;
  let particles = [], screenShake = 0, pickerReturn = 'ready';
  let keys = new Set(), touches = new Map(), pseudoFullscreen = false;

  function timeString(seconds, tenths = false) {
    const value = tenths ? Math.floor(seconds * 10) / 10 : Math.ceil(seconds);
    const minutes = Math.floor(value / 60), rest = value - minutes * 60;
    return minutes + ':' + (tenths ? rest.toFixed(1).padStart(4, '0') : String(Math.floor(rest)).padStart(2, '0'));
  }
  function announce(text) { $('live').textContent = text; }
  function notify(text) { $('toast').textContent = text; $('toast').classList.add('is-visible'); toastLife = 2.4; announce(text); }
  function clearInput() {
    keys.clear(); touches.clear();
    game.querySelectorAll('[data-control]').forEach(b => { b.classList.remove('is-held'); b.setAttribute('aria-pressed', 'false'); });
  }
  function controls() {
    const held = name => [...touches.values()].includes(name);
    return {
      push: Number(keys.has('KeyW') || keys.has('ArrowUp') || held('push')) - Number(keys.has('KeyS') || keys.has('ArrowDown') || held('reverse')),
      turn: Number(keys.has('KeyD') || keys.has('ArrowRight') || held('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || held('left')),
      brake: Number(keys.has('Space') || held('brake'))
    };
  }

  // Sound is synthesized locally and only initialized after a user gesture.
  const sound = {
    enabled: false, context: null, roll: null,
    async prepare() {
      if (!this.enabled) return;
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) throw new Error('Audio unavailable');
          this.context = new Audio();
          const ac = this.context, buffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          const noise = ac.createBufferSource(); noise.buffer = buffer; noise.loop = true;
          const filter = ac.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 0.7;
          this.roll = ac.createGain(); this.roll.gain.value = 0;
          noise.connect(filter).connect(this.roll).connect(ac.destination); noise.start();
        }
        await this.context.resume();
      } catch { this.enabled = false; this.refresh(); notify('Sound is unavailable in this browser.'); }
    },
    refresh() { $('sound').setAttribute('aria-pressed', String(this.enabled)); $('sound').setAttribute('aria-label', this.enabled ? 'Turn sound off' : 'Turn sound on'); },
    rolling(speed) {
      if (!this.roll) return;
      this.roll.gain.setTargetAtTime(this.enabled && phase === 'running' ? Math.min(0.03, speed / 4500) : 0, this.context.currentTime, .06);
    },
    note(frequency, duration = .15, volume = .06, delay = 0, type = 'sine', end) {
      if (!this.enabled || !this.context || this.context.state !== 'running') return;
      const ac = this.context, start = ac.currentTime + delay, osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = type; osc.frequency.setValueAtTime(frequency, start);
      if (end) osc.frequency.exponentialRampToValueAtTime(end, start + duration);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .005); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      osc.connect(gain).connect(ac.destination); osc.start(start); osc.stop(start + duration + .02);
    },
    event(e) {
      if (e.type === 'gate') { this.note(660, .12, .04); this.note(880, .16, .03, .07); }
      if (e.type === 'won') [523, 659, 784, 1047].forEach((f, i) => this.note(f, .3, .045, i * .1));
      if (e.type === 'lost') { this.note(220, .4, .045, 0, 'triangle', 90); }
      if (e.type === 'bump' || e.type === 'mess') {
        this.note(e.kind === 'shelf' ? 460 : 130, .17, .055, 0, 'triangle', e.kind === 'shelf' ? 180 : 50);
        if (e.kind === 'shelf') for (let i = 0; i < 5; i++) this.note(800 + i * 207, .2, .025, i * .035);
      }
      if (e.type === 'rack-hit') { this.note(90, .22, .035, 0, 'triangle', 40); this.note(370, .15, .012, .03, 'sine', 190); }
      if (e.type === 'shelf-down') { this.note(65, .35, .07, 0, 'triangle', 25); for (let i = 0; i < 4; i++) this.note(130 + i * 51, .22, .022, i * .03, 'triangle', 60); }
      if (e.type === 'break') for (let i = 0; i < 4; i++) this.note((e.material === 'ceramic' ? 630 : 1500) + i * 317, .1 + i * .025, .012, i * .012, 'triangle', 370 + i * 130);
      if (e.type === 'squash') this.note(130, .12, .02, 0, 'sawtooth', 35);
      if (e.type === 'wheel-rattle') this.note(e.kind === 'can' ? 340 : 180, .05, .008, 0, 'triangle', 90);
      if (e.type === 'product-land' && e.material === 'metal') this.note(610, .13, .012, 0, 'sine', 410);
    }
  };

  // Rendering owns the isometric camera; input and fixed-step physics never
  // use screen coordinates. The same renderer draws play, previews and art.
  const view = CartView.create(P);
  $('stage').style.backgroundColor = view.blend(P.hairDark,P.edge,.48);
  const { makeFloor } = view;
  const sceneCanvas = document.createElement('canvas');
  sceneCanvas.width = CartView.CAMERA.width; sceneCanvas.height = CartView.CAMERA.height;
  const sceneContext = sceneCanvas.getContext('2d');
  let narrowCamera = false, followCart = true;
  function drawIllustration() { view.illustration($('illustration').getContext('2d')); }
  function draw(g = ctx, w = world, background = floor, preview = false) {
    const options = { preview, particles, shake:screenShake, reducedMotion:reducedMotion.matches };
    if (g === ctx && narrowCamera) {
      view.draw(sceneContext, w, background, options); view.present(g,sceneCanvas,w,followCart);
    } else view.draw(g, w, background, options);
  }
  function cameraLabel() {
    $('camera').hidden = !narrowCamera;
    $('camera').textContent = followCart ? 'Overview' : 'Follow cart';
    $('camera').setAttribute('aria-pressed', String(!followCart));
    $('camera').setAttribute('aria-label', followCart ? 'Show the whole course' : 'Follow the cart');
  }
  function resizeView() {
    const stage = $('stage').getBoundingClientRect();
    if (stage.width <= 0 || stage.height <= 0) return;
    narrowCamera = stage.width < 600 && stage.height > stage.width * 1.2;
    const width = narrowCamera ? 480 : CartView.CAMERA.width;
    const height = narrowCamera ? Math.round(width * stage.height / stage.width) : CartView.CAMERA.height;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    cameraLabel(); draw();
  }

  function burst(x, y, count, colors) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + Math.random(), v = 16;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 0, a, omega: Math.random() * 9 - 4, color: colors[i % colors.length], w: 2, h: 2, life: .6 });
    }
  }
  function tickEffects(dt) {
    screenShake = Math.max(0, screenShake - dt * 7);
    toastLife -= dt;
    if (toastLife <= 0) $('toast').classList.remove('is-visible');
    for (const p of particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.omega * dt;
      p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.5 * dt);
    }
    particles = particles.filter(p => p.life > 0);
  }
  function events() {
    for (const e of world.events.splice(0)) {
      sound.event(e);
      if (e.type === 'gate') { burst(e.x, e.y, 8, [P.cream, P.gold, P.sage], 'gate'); notify(world.gate < world.level.gates.length ? 'Marker ' + world.gate + ' cleared' : 'Checkout is open. Drive out.'); }
      if (e.type === 'mess') {
        screenShake = e.kind === 'shelf' ? 1.5 : .65;
        notify((e.kind === 'cone' ? 'Cone down' : e.kind === 'box' ? 'Box bumped' : e.kind === 'table' ? 'Vase knocked off' : 'Shelf spilled') + (world.practice ? '' : ' / +' + e.seconds + ' seconds'));
      }
      if (e.type === 'shelf-down') { screenShake=2; notify((e.kind==='table'?'Table down':'Shelf down') + (world.practice?'':' / stock spilled')); }
      if (e.type === 'rack-hit') screenShake=Math.max(screenShake,.4);
      if (e.type === 'bump') screenShake = .6;
      if (e.type === 'won' || e.type === 'lost') finish(e.type === 'won');
    }
  }
  function updateUI() {
    game.dataset.phase = phase;
    $('time-label').textContent = world.practice ? 'Practice' : 'Time left';
    $('time').textContent = world.practice ? timeString(world.time) : timeString(world.remaining);
    $('time').classList.toggle('is-urgent', !world.practice && world.remaining <= 15);
    $('time').closest('.cart-clock').classList.toggle('is-urgent', !world.practice && world.remaining <= 15);
    $('clock-fill').style.setProperty('--clock', world.practice ? 1 : clamp(world.remaining / world.level.limit, 0, 1));
    $('messes').textContent = world.messes;
    $('messes').closest('.cart-mishaps').classList.toggle('has-messes', world.messes > 0);
    $('penalty').textContent = '+' + world.penalty + 's';
    [...$('route-steps').children].forEach((step, i) => {
      step.classList.toggle('is-done', i < world.gate || phase === 'won');
      step.classList.toggle('is-current', i === world.gate && phase !== 'won');
    });
    $('route-steps').setAttribute('aria-label', world.gate + ' of ' + world.level.gates.length + ' markers cleared' + (world.exitOpen ? ', checkout open' : ''));
    const target = world.level.gates[world.gate];
    if (phase === 'won') $('route').textContent = 'Checkout complete';
    else if (phase === 'lost') $('route').textContent = 'Time is up. Give it another go.';
    else if (target) $('route').textContent = 'Touch circle ' + (world.gate + 1) + ' of ' + world.level.gates.length + ' with the basket marker';
    else $('route').textContent = world.exiting ? 'Keep rolling until you and the cart are outside' : 'Drive out through the checkout exit';
    $('pause').disabled = !['running', 'paused'].includes(phase);
    $('pause').setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game');
    $('pause').setAttribute('aria-pressed', String(phase === 'paused'));
    $('camera').disabled = phase !== 'running';
  }
  function bestText() {
    if (!canSave) return 'Records are unavailable in this browser';
    const r = records[levelIndex];
    return 'Target ' + timeString(world.level.par) + (r ? ' / Best ' + timeString(r.time, true) : ' / No best run yet');
  }
  function overlay(kicker, title, message, primary, secondary, practice = false) {
    $('overlay').dataset.state = phase;
    $('overlay-kicker').textContent = kicker; $('overlay-title').textContent = title; $('overlay-text').textContent = message;
    $('start').textContent = primary; $('secondary').textContent = secondary || ''; $('secondary').hidden = !secondary;
    $('practice-label').hidden = !practice; $('best').textContent = bestText(); $('overlay').hidden = false;
  }
  function reset(index = levelIndex) {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    clearInput(); levelIndex = index; world = new World(levels[index], $('practice').checked);
    phase = 'ready'; particles = []; screenShake = 0; toastLife = 0;
    $('toast').classList.remove('is-visible'); $('picker').hidden = true; $('result').hidden = true;
    floor = makeFloor(world.level);
    $('course-number').textContent = 'Course ' + String(index + 1).padStart(2, '0') + ' / 06';
    $('course-badge').textContent = String(index + 1).padStart(2, '0');
    $('route-steps').replaceChildren();
    for (let i = 0; i <= world.level.gates.length; i++) {
      const step = document.createElement('i'); step.textContent = i === world.level.gates.length ? 'EXIT' : i + 1;
      step.setAttribute('aria-hidden', 'true'); $('route-steps').append(step);
    }
    $('course-title').textContent = world.level.name;
    $('courses').setAttribute('aria-label', 'Choose a course, currently ' + world.level.name);
    overlay('Course ' + String(index + 1).padStart(2, '0') + ' / 06 · ' + world.level.name, 'All Four Wheels', index === 0 ? 'Touch each numbered checkpoint with the coral marker inside the basket. Then drive out through checkout.' : world.level.tip, 'Let\'s roll', null, true);
    updateUI(); draw(); sound.rolling(0);
  }
  function run() {
    phase = 'running'; clearInput(); $('overlay').hidden = true;
    $('canvas').focus({ preventScroll: true }); sound.prepare();
    last = performance.now(); accumulator = 0; uiTime = 0;
    updateUI(); if (!raf) raf = requestAnimationFrame(frame);
  }
  function pause() {
    if (phase !== 'running') return;
    phase = 'paused'; clearInput(); sound.rolling(0);
    $('result').hidden = true;
    overlay('Take your time', 'Cart parked for now', 'The clock is stopped. Your cart will carry on from exactly here.', 'Keep rolling', 'Start over');
    updateUI(); $('start').focus({ preventScroll: true });
  }
  function finish(won) {
    phase = won ? 'won' : 'lost'; clearInput(); sound.rolling(0);
    if (won) {
      const r = world.result, old = records[levelIndex];
      const improved = !world.practice && (!old || r.stars > old.stars || r.stars === old.stars && r.time < old.time);
      if (improved) {
        records[levelIndex] = r;
        try { localStorage.setItem(STORAGE, JSON.stringify(records)); } catch { canSave = false; }
      }
      const title = world.practice ? 'Practice complete' : r.messes === 0 ? 'Clean checkout' : r.messes <= 2 ? 'A little rearranging' : 'You made it, mostly';
      overlay(world.practice ? 'No clock. No record.' : improved && canSave ? 'A new personal best' : 'Checkout complete', title, levelIndex === levels.length - 1 ? 'The last cart is out. The store can close now.' : 'One more department to get through.', levelIndex === levels.length - 1 ? 'Choose a course' : 'Next course', 'Try again');
      const result = $('result'); result.replaceChildren();
      const marks = document.createElement('div'); marks.className = 'cart-marks'; marks.setAttribute('aria-label', r.stars + ' of 3 marks');
      for (let i = 0; i < 3; i++) { const mark = document.createElement('i'); mark.className = i < r.stars ? 'is-earned' : ''; marks.append(mark); }
      const time = document.createElement('strong'); time.textContent = timeString(world.practice ? world.time : r.time, true);
      const detail = document.createElement('span'); detail.textContent = r.messes + (r.messes === 1 ? ' mishap' : ' mishaps') + (world.practice ? '' : ' / ' + timeString(r.driving, true) + ' driving + ' + r.penalty + 's penalties');
      if (!world.practice) result.append(marks); result.append(time, detail); result.hidden = false;
    } else {
      $('result').hidden = true;
      overlay('The store is closed', 'Out of time', 'Try an earlier turn and a shorter push. You can also switch to untimed practice.', 'Try again', 'Practice this course');
    }
    updateUI(); announce(won ? 'Course complete. ' + world.messes + ' mishaps.' : 'Time is up.');
    $('start').focus({ preventScroll: true });
  }
  function frame(now) {
    raf = 0;
    if (phase !== 'running') return;
    const dt = Math.min((now - last) / 1000, .1); last = now; accumulator += dt;
    while (accumulator >= 1 / 120 && phase === 'running') { world.step(1 / 120, controls()); events(); tickEffects(1 / 120); accumulator -= 1 / 120; }
    draw(); sound.rolling(Math.hypot(world.body.vx, world.body.vy));
    uiTime += dt; if (uiTime > .1 || phase !== 'running') { uiTime = 0; updateUI(); }
    if (phase === 'running') raf = requestAnimationFrame(frame);
  }

  function closePicker() {
    $('picker').hidden = true;
    if (pickerReturn === 'running') run();
    else { phase = pickerReturn; $('courses').focus({ preventScroll: true }); updateUI(); }
  }
  function openPicker() {
    if (!$('picker').hidden) return;
    pickerReturn = phase; clearInput(); sound.rolling(0);
    if (phase === 'running') phase = 'paused';
    const grid = $('course-grid'); grid.replaceChildren();
    levels.forEach((level, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cart-course-tile' + (i === levelIndex ? ' is-current' : '');
      const c = document.createElement('canvas'); c.width = CartView.CAMERA.width; c.height = CartView.CAMERA.height; c.setAttribute('aria-hidden', 'true');
      draw(c.getContext('2d'), new World(level), makeFloor(level), true);
      const copy = document.createElement('span'); copy.className = 'cart-course-tile-copy';
      const label = document.createElement('span'); label.className = 'cart-kicker'; label.textContent = 'DEPARTMENT ' + String(i + 1).padStart(2, '0');
      const title = document.createElement('strong'); title.textContent = level.name;
      const meta = document.createElement('span'); meta.className = 'cart-course-tile-meta';
      const limit = document.createElement('span'); limit.textContent = timeString(level.limit) + ' limit';
      const best = document.createElement('span'); best.textContent = records[i] ? 'Best ' + timeString(records[i].time, true) : 'Target ' + timeString(level.par);
      meta.append(limit, best); copy.append(label, title, meta); button.append(c, copy); grid.append(button);
      if (records[i]) {
        const marks = document.createElement('span'); marks.className = 'cart-marks'; marks.setAttribute('aria-hidden', 'true');
        for (let j = 0; j < 3; j++) { const mark = document.createElement('i'); mark.className = j < records[i].stars ? 'is-earned' : ''; marks.append(mark); }
        meta.append(marks);
      }
      button.setAttribute('aria-label', level.name + ', ' + timeString(level.limit) + ' time limit' + (records[i] ? ', ' + records[i].stars + ' of 3 marks, best ' + timeString(records[i].time, true) : ''));
      button.setAttribute('aria-current', i === levelIndex ? 'true' : 'false');
      button.addEventListener('click', () => { reset(i); $('start').focus({ preventScroll: true }); });
    });
    $('picker').hidden = false; grid.children[levelIndex].focus({ preventScroll: true }); updateUI();
  }
  function fullscreenLabel() {
    $('fullscreen').setAttribute('aria-label', document.fullscreenElement === game || pseudoFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  }
  async function fullscreen() {
    if (pseudoFullscreen) { pseudoFullscreen = false; game.classList.remove('cart-pseudo-fullscreen'); document.body.classList.remove('cart-fs-open'); fullscreenLabel(); return; }
    if (document.fullscreenElement === game) { await document.exitFullscreen(); return; }
    try {
      if (!game.requestFullscreen) throw new Error('Use fallback');
      await game.requestFullscreen();
    } catch { pseudoFullscreen = true; game.classList.add('cart-pseudo-fullscreen'); document.body.classList.add('cart-fs-open'); fullscreenLabel(); }
    if (phase === 'running') $('canvas').focus({ preventScroll: true });
  }
  $('start').addEventListener('click', () => {
    if (phase === 'ready' || phase === 'paused') run();
    else if (phase === 'won') { if (levelIndex === levels.length - 1) openPicker(); else { reset(levelIndex + 1); run(); } }
    else if (phase === 'lost') { reset(); run(); }
  });
  $('secondary').addEventListener('click', () => {
    if (phase === 'lost') { $('practice').checked = true; reset(); run(); }
    else { reset(); run(); }
  });
  $('practice').addEventListener('change', () => { world.practice = $('practice').checked; updateUI(); });
  $('retry').addEventListener('click', () => { reset(); run(); });
  $('pause').addEventListener('click', () => phase === 'paused' ? run() : pause());
  $('courses').addEventListener('click', openPicker); $('picker-close').addEventListener('click', closePicker);
  $('fullscreen').addEventListener('click', fullscreen); document.addEventListener('fullscreenchange', fullscreenLabel);
  $('sound').addEventListener('click', () => { sound.enabled = !sound.enabled; sound.refresh(); if (sound.enabled) { sound.prepare().then(() => sound.note(660, .1, .025)); } else sound.rolling(0); });
  $('camera').addEventListener('click', () => {
    followCart = !followCart; cameraLabel(); draw();
    announce(followCart ? 'Camera follows the cart.' : 'The whole course is visible.');
    canvas.focus({ preventScroll:true });
  });
  game.querySelectorAll('[data-control]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('pointerdown', e => {
      if (phase !== 'running') return;
      e.preventDefault(); button.setPointerCapture(e.pointerId); touches.set(e.pointerId, button.dataset.control);
      button.classList.add('is-held'); button.setAttribute('aria-pressed', 'true');
    });
    const release = e => { touches.delete(e.pointerId); const held = [...touches.values()].includes(button.dataset.control); button.classList.toggle('is-held', held); button.setAttribute('aria-pressed', String(held)); };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', e => e.preventDefault());
  });
  const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || !game.contains(document.activeElement) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && e.target.closest('button')) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!$('picker').hidden) closePicker();
      else if (pseudoFullscreen) fullscreen();
      else if (phase === 'running') pause();
      else if (phase === 'paused') run();
      return;
    }
    if (!$('picker').hidden) return;
    if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); phase === 'running' ? pause() : phase === 'paused' && run(); }
    if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); reset(); run(); }
    if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); fullscreen(); }
    if (movement.has(e.code) && phase === 'running') { e.preventDefault(); keys.add(e.code); }
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { clearInput(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
  window.addEventListener('pagehide', () => { clearInput(); sound.rolling(0); });
  reducedMotion.addEventListener('change', () => { screenShake = 0; draw(); });
  reset(); drawIllustration();
  new ResizeObserver(resizeView).observe($('stage'));
  // Canvas text caches are rebuilt when the site's own mono font arrives.
  document.fonts.ready.then(() => { view.refreshFonts(); floor = makeFloor(world.level); draw(); });
})();
