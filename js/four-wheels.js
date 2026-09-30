(function () {
  'use strict';
  const $ = id => document.getElementById('cart-' + id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  if (!ctx || !window.CartPhysics || !window.CartLevels) return;
  const { World, BODY, point, corners, WHEELS, CASTER, casterPose, casterCorners, clamp } = CartPhysics;
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
  const STORAGE = 'four-wheels-records-v2';
  let records = [], canSave = true;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(saved)) records = saved.slice(0, levels.length).map(r => r && Number.isFinite(r.time) && r.time > 0 && r.time < 10000 && Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 3 ? r : null);
  } catch { canSave = false; }
  let levelIndex = 0, world = new World(levels[0]), phase = 'ready', floor;
  let raf = 0, last = 0, accumulator = 0, uiTime = 0, toastLife = 0;
  let particles = [], debris = [], screenShake = 0, pickerReturn = 'ready';
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
    }
  };

  function rect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  // Rasterized polygons and ellipses keep the art on one coarse pixel grid,
  // including rotated basket rails, wheels, arms, and flying dishes.
  function poly(g, points, color) {
    const low = Math.floor(Math.min(...points.map(p => p.y))), high = Math.ceil(Math.max(...points.map(p => p.y)));
    g.fillStyle = color;
    for (let y = low; y < high; y++) {
      const intersections = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a.y <= y + .5 && b.y > y + .5) || (b.y <= y + .5 && a.y > y + .5)) intersections.push(a.x + (y + .5 - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length - 1; i += 2) g.fillRect(Math.round(intersections[i]), y, Math.max(1, Math.round(intersections[i + 1]) - Math.round(intersections[i])), 1);
    }
  }
  function oval(g, x, y, rx, ry, color) {
    g.fillStyle = color;
    for (let yy = -Math.ceil(ry); yy <= ry; yy++) {
      const width = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy / (ry * ry))));
      if (width > 0) g.fillRect(Math.round(x) - width, Math.round(y) + yy, width * 2, 1);
    }
  }
  function localRect(g, body, x, y, w, h, color) { poly(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => point(body, ...p)), color); }
  function line(g, x, y, xx, yy, color, thickness = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(xx - x, yy - y)));
    for (let i = 0; i <= n; i++) rect(g, x + (xx - x) * i / n, y + (yy - y) * i / n, thickness, thickness, color);
  }
  function text(g, value, x, y, color = P.edge, size = 7, align = 'left') {
    g.fillStyle = color; g.font = 'bold ' + size + 'px "Commit Mono"'; g.textAlign = align; g.fillText(value, Math.round(x), Math.round(y));
  }
  function arrow(g, x, y, angle, length, color) {
    const body = { x, y, a: angle };
    localRect(g, body, -length / 2, -1, length - 3, 3, color);
    poly(g, [[length / 2, 0], [length / 2 - 7, -5], [length / 2 - 7, 5]].map(p => point(body, ...p)), color);
  }
  function hash(x, y) { return ((x * 73856093 ^ y * 19349663) >>> 0) / 4294967296; }
  function makeFloor(level) {
    const off = document.createElement('canvas'); off.width = 480; off.height = 300;
    const g = off.getContext('2d');
    rect(g, 0, 0, 480, 300, P.green); rect(g, 8, 8, 464, 284, P.floor);
    for (let y = 8; y < 291; y += 24) for (let x = 8; x < 471; x += 24) {
      const v = hash(x, y);
      g.globalAlpha = .11 + v * .11; rect(g, x, y, Math.min(23, 471 - x), Math.min(23, 291 - y), (x + y) % 48 < 24 ? P.cream : P.gold);
      g.globalAlpha = .28; rect(g, x + 23, y, 1, Math.min(24, 292 - y), P.mid); rect(g, x, y + 23, Math.min(24, 472 - x), 1, P.mid);
      if (v > .6) { g.globalAlpha = .12; rect(g, x + 9, y + 14, 4, 1, P.edge); }
    }
    g.globalAlpha = 1;
    rect(g, 8, 8, 464, 3, P.mid); rect(g, 8, 8, 3, 284, P.mid);
    rect(g, 8, 289, 464, 3, P.dark); rect(g, 469, 8, 3, 284, P.dark);
    for (let x = 24; x < 459; x += 43) { rect(g, x, 3, 24, 2, P.gold); rect(g, x, 295, 24, 2, P.edge); }
    if (level.puddle) {
      const p = level.puddle;
      g.globalAlpha = .31; oval(g, p.x, p.y + 2, p.rx + 2, p.ry + 2, P.edge);
      g.globalAlpha = .6; oval(g, p.x, p.y, p.rx, p.ry, P.blue);
      g.globalAlpha = .32;
      for (let i = 0; i < 9; i++) {
        const x = p.x + (hash(i, 1) - .5) * p.rx * 1.4, y = p.y + (hash(i, 3) - .5) * p.ry * 1.2;
        rect(g, x, y, 6 + i % 4, 1, P.light); rect(g, x + 4, y + 2, 5, 1, P.light);
      }
      g.globalAlpha = 1;
    }
    for (const s of level.signs) { g.globalAlpha = .6; text(g, s.text, s.x, s.y, P.edge, 6, 'center'); }
    g.globalAlpha = .45; arrow(g, level.start.x, level.start.y, level.start.a, 34, P.cream); g.globalAlpha = 1;
    return off;
  }

  function drawStock(g, x, y, kind, i) {
    const color = swatches[i % swatches.length];
    if (kind === 'plants') {
      rect(g, x + 1, y + 4, 6, 5, P.clay); rect(g, x, y + 4, 8, 2, P.gold);
      rect(g, x + 3, y, 2, 6, P.pine); rect(g, x, y + 1, 4, 3, P.sage); rect(g, x + 4, y - 1, 4, 4, P.pine);
    } else if (kind === 'dishes') {
      oval(g, x + 4, y + 6, 5, 3, P.mid); oval(g, x + 4, y + 4, 5, 3, P.cream); oval(g, x + 4, y + 3, 3, 2, color); rect(g, x + 1, y + 7, 6, 1, P.light);
    } else if (kind === 'boxes') {
      rect(g, x - 1, y + 1, 11, 9, P.edge); rect(g, x, y, 10, 8, P.clay); rect(g, x + 4, y, 2, 8, P.gold); rect(g, x + 1, y + 1, 3, 1, P.cream);
    } else if (kind === 'towels') {
      rect(g, x - 1, y + 5, 11, 5, P.mid); rect(g, x, y + 1, 10, 7, color); rect(g, x, y + 2, 10, 1, P.cream); rect(g, x, y + 6, 10, 1, P.cream);
    } else {
      rect(g, x + 1, y + 2, 6, 7, color); rect(g, x + 2, y, 4, 2, P.gold); rect(g, x + 2, y + 4, 4, 2, P.cream); rect(g, x + 1, y + 9, 6, 1, P.mid);
    }
  }
  function drawShelf(g, s, t) {
    const shift = reducedMotion.matches ? 0 : Math.round(Math.sin(t * 54) * s.wobble * 1.5);
    const x = s.x + shift, y = s.y;
    g.globalAlpha = .25; rect(g, x + 4, y + 5, s.w, s.h, P.dark); g.globalAlpha = 1;
    rect(g, x, y, s.w, s.h, P.dark); rect(g, x + 2, y + 2, s.w - 4, s.h - 4, P.edge);
    rect(g, x + 2, y + s.h - 4, s.w - 4, 6, P.green);
    for (let yy = y + 7, row = 0; yy < y + s.h - 10; yy += 18, row++) {
      rect(g, x + 3, yy + 10, s.w - 6, 2, P.mid); rect(g, x + 3, yy + 12, s.w - 6, 1, P.gold);
      for (let xx = x + 8, col = 0; xx < x + s.w - 9; xx += 15, col++) {
        if (s.spilled && (row + col * 2) % 3 === 0) continue;
        drawStock(g, xx, yy, s.stock, row * 5 + col + s.id);
        rect(g, xx + 1, yy + 13, 5, 2, P.cream);
      }
    }
    rect(g, x, y, s.w, 3, P.gold); rect(g, x, y, 2, s.h, P.mid);
    // Labels are painted beside shelves, so stock stays big enough to read.
    if (s.w > s.h) text(g, s.label, x + s.w / 2, y + s.h + 12, P.edge, 6, 'center');
    else { g.save(); g.translate(x + s.w / 2, y + s.h / 2); g.rotate(-Math.PI / 2); rect(g, -Math.min(38, s.h / 2 - 5), -5, Math.min(76, s.h - 10), 10, P.green); text(g, s.label, 0, 2, P.cream, 5, 'center'); g.restore(); }
  }

  function drawObject(g, o) {
    const b = { x: Math.round(o.x), y: Math.round(o.y), a: Math.round(o.a / (Math.PI / 8)) * Math.PI / 8 };
    if (o.kind === 'box') {
      oval(g, b.x + 2, b.y + 3, 10, 8, P.mid);
      localRect(g, b, -8, -7, 16, 14, P.edge); localRect(g, b, -7, -8, 14, 13, P.clay);
      localRect(g, b, -1, -8, 3, 13, P.gold); localRect(g, b, -5, -6, 4, 3, P.cream);
      if (o.down) localRect(g, b, -5, 1, 4, 1, P.brick);
    } else {
      if (o.down) {
        oval(g, b.x + 1, b.y + 3, 8, 4, P.mid);
        localRect(g, b, -6, -4, 3, 9, P.edge);
        poly(g, [[-3, -4], [-3, 5], [7, 1]].map(p => point(b, ...p)), P.clay);
        localRect(g, b, -1, -2, 2, 5, P.cream);
      } else {
        oval(g, b.x + 2, b.y + 3, 7, 4, P.mid); rect(g, b.x - 6, b.y - 1, 12, 7, P.edge);
        poly(g, [{ x: b.x - 5, y: b.y + 2 }, { x: b.x, y: b.y - 10 }, { x: b.x + 5, y: b.y + 2 }], P.clay);
        rect(g, b.x - 2, b.y - 5, 4, 3, P.light); rect(g, b.x - 3, b.y + 2, 6, 1, P.coral);
      }
    }
  }
  function drawCaster(g, b, wheel, i) {
    const pose = casterPose(b, wheel, i), fork = { ...pose.pivot, a: wheel.a };
    // Narrow steel arms flare from the bearing to the trailing axle. Leave
    // daylight between the arms and tire instead of a heavy rectangular fork.
    for (const side of [-1, 1]) {
      poly(g, [[-CASTER.trail, side * 3], [-1, side * 2], [1, side], [0, 0], [-1, side], [-CASTER.trail, side * 2]].map(p => point(fork, ...p)), P.dark);
      const from = point(fork, -CASTER.trail, side * 2), to = point(fork, -1, side);
      line(g, from.x, from.y, to.x, to.y, P.steel);
    }
    const l = CASTER.halfLength, h = CASTER.halfWidth;
    poly(g, [[-l, -h + 1], [-l + 1, -h], [l - 1, -h], [l, -h + 1], [l, h - 1], [l - 1, h], [-l + 1, h], [-l, h - 1]].map(p => point(pose, ...p)), P.dark);
    localRect(g, pose, -l + 1, -h + 1, l * 2 - 2, h * 2 - 2, P.edge);
    // Each tire's signed travel drives its own tread, with no motion at rest.
    const roll = ((wheel.roll / (Math.PI * 2 * l)) % 1 + 1) % 1;
    const tread = Math.floor(roll * 6) - 3;
    localRect(g, pose, tread, -h + 1, 1, h * 2 - 2, P.mid);
    localRect(g, pose, 0, -h - 1, 1, h * 2 + 2, P.steel);
    localRect(g, pose, 0, -h - 1, 1, 1, P.steelLight);
    localRect(g, pose, 0, h, 1, 1, P.steelLight);
  }
  function drawShopperHead(g, b) {
    // Everything is in the shopper's local frame, including the crown and nose.
    // A stepped, round silhouette and a small hair whorl read from overhead.
    localRect(g, b, -17, -6, 3, 2, P.clay);
    localRect(g, b, -17, 4, 3, 2, P.clay);
    poly(g, [[-20, -3], [-18, -5], [-14, -5], [-11, -3], [-10, -1], [-10, 2], [-12, 4], [-15, 5], [-18, 4], [-20, 2]].map(p => point(b, ...p)), P.clay);
    localRect(g, b, -10, -1, 2, 2, P.gold);
    poly(g, [[-20, -3], [-18, -5], [-15, -5], [-12, -4], [-12, -2], [-13, -1], [-12, 1], [-13, 3], [-15, 4], [-18, 4], [-20, 2]].map(p => point(b, ...p)), P.hairDark);
    poly(g, [[-19, -3], [-17, -4], [-15, -4], [-13, -3], [-14, -1], [-13, 1], [-15, 3], [-18, 2], [-19, 0]].map(p => point(b, ...p)), P.hair);
    localRect(g, b, -18, -3, 3, 1, P.hairLight);
    localRect(g, b, -19, -2, 1, 2, P.hairLight);
    localRect(g, b, -16, -1, 2, 1, P.hairDark);
    localRect(g, b, -16, 0, 1, 2, P.hairDark);
    localRect(g, b, -15, 1, 2, 1, P.hairLight);
  }
  function drawCart(g, body, wheels, gait, ghost = false) {
    const b = { x: Math.round(body.x), y: Math.round(body.y), a: body.a };
    const step = gait || { phase: 0, stride: 0, forward: 1, sideways: 0 };
    g.save();
    if (!ghost) {
      g.globalAlpha *= .16;
      const p = point(b, 12, 3); oval(g, p.x, p.y, 22, 14, P.dark);
      const shopper = point(b, -16, 3); oval(g, shopper.x, shopper.y, 9, 7, P.dark);
      g.globalAlpha /= .16;
    }
    WHEELS.forEach((p, i) => drawCaster(g, b, wheels ? wheels[i] : { a: b.a, roll: 0 }, i));
    // Empty galvanized wire basket. The close mesh stays translucent so an
    // inward-swung caster is still visible beneath the basket and its rails.
    const alpha = g.globalAlpha;
    g.globalAlpha = alpha * .04;
    localRect(g, b, -2, -11, 33, 22, P.steel);
    g.globalAlpha = alpha * .55;
    for (let x = 1; x < 29; x += 3) localRect(g, b, x, -9, 1, 18, P.steelLight);
    g.globalAlpha = alpha * .38;
    for (let y = -7; y < 9; y += 3) localRect(g, b, 0, y, 29, 1, P.steelShade);
    g.globalAlpha = alpha * .72;
    localRect(g, b, -2, -11, 33, 2, P.steel);
    localRect(g, b, -2, 9, 33, 2, P.steelShade);
    localRect(g, b, -2, -9, 2, 18, P.steelShade);
    localRect(g, b, 29, -9, 2, 18, P.steel);
    g.globalAlpha = alpha * .85;
    localRect(g, b, -2, -11, 33, 1, P.steelLight);
    localRect(g, b, -2, 9, 33, 1, P.steelLight);
    localRect(g, b, -2, -9, 1, 18, P.steel);
    localRect(g, b, 29, -9, 1, 18, P.steelLight);
    g.globalAlpha = alpha;
    WHEELS.forEach(p => {
      const pin = point(b, ...p);
      rect(g, pin.x - 1, pin.y - 1, 3, 3, P.dark);
      rect(g, pin.x, pin.y, 1, 1, P.gold);
      rect(g, pin.x - 1, pin.y - 1, 1, 1, P.steelLight);
    });
    // The raised handle also crosses the rear casters in this overhead view.
    // Keep it slender and translucent so both rear tires remain readable.
    g.globalAlpha = alpha * .7; localRect(g, b, -6, -13, 2, 26, P.steelShade);
    g.globalAlpha = alpha * .7; localRect(g, b, -6, -11, 1, 22, P.steelLight);
    g.globalAlpha = alpha;
    localRect(g, b, -21, -5, 4, 10, P.edge);
    for (const side of [-1, 1]) {
      const offset = Math.sin(step.phase + (side === 1 ? Math.PI : 0)) * step.stride;
      const lift = Math.max(0, Math.cos(step.phase + (side === 1 ? Math.PI : 0))) * Math.min(1, step.stride / 2.8);
      const x = -22 + offset * step.forward, y = side * 5 + offset * step.sideways * .65;
      const hip = point(b, -19, side * 3), knee = point(b, -21 + offset * step.forward * .35, side * 4);
      const ankle = point(b, x, y - lift);
      line(g, hip.x, hip.y, knee.x, knee.y, P.edge, 2);
      line(g, knee.x, knee.y, ankle.x, ankle.y, P.dark, 2);
      localRect(g, b, x - 2, y - 1.5 - lift, 4, 3, P.dark);
      localRect(g, b, x, y - 1 - lift, 2, 1, P.mid);
      localRect(g, b, x - 2, y + 1 - lift, 3, 1, P.cream);
    }
    localRect(g, b, -18, -6, 8, 12, P.brick); localRect(g, b, -18, -6, 7, 3, P.coral);
    localRect(g, b, -15, -9, 5, 3, P.clay); localRect(g, b, -15, 6, 5, 3, P.clay);
    localRect(g, b, -11, -10, 6, 3, P.clay); localRect(g, b, -11, 7, 6, 3, P.clay);
    drawShopperHead(g, b);
    g.restore();
  }

  function drawIllustration() {
    const c = $('illustration'), g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    // Use the same chunky cart and offset caster forks as the playable sprite.
    for (let x = 8; x < 176; x += 12) rect(g, x, 106, 6, 1, P.gold);
    arrow(g, 146, 106, 0, 21, P.clay);
    g.save(); g.scale(2.3, 2.3);
    const b = { x: 31, y: 30, a: -.32, vx: 0, vy: 0 };
    drawCart(g, b, [0, -.6, .35, -.15].map(a => ({ a, roll: 0 })));
    g.restore();
  }

  function drawRoute(g, w) {
    const e = w.exit, unlocked = w.exitOpen, half = e.width / 2;
    g.save();
    g.globalAlpha = unlocked ? .24 : .12;
    localRect(g, e, -78, -half, 78, e.width, P.pine);
    g.globalAlpha = 1;
    // This opening cuts through the painted room border as well as the wall
    // collider. The cart can physically pass through and leave the canvas.
    localRect(g, e, -3, -half, 12, e.width, P.floor);
    for (let x = -75; x < -5; x += 10) {
      localRect(g, e, x, -half, 6, 1, P.green); localRect(g, e, x, half - 1, 6, 1, P.green);
    }
    const label = point(e, -61, 0);
    text(g, 'CHECKOUT', label.x, label.y - 2, P.green, 6, 'center');
    text(g, unlocked ? 'EXIT' : 'LOCKED', label.x, label.y + 6, P.edge, 5, 'center');
    const lead = point(e, -27, 0); arrow(g, lead.x, lead.y, e.a, 30, unlocked ? P.green : P.mid);
    for (let y = -half; y < half; y += 8) localRect(g, e, -11, y, 3, 4, P.cream);
    if (!unlocked) {
      localRect(g, e, -1, -half, 9, e.width, P.dark);
      for (let y = -half + 2; y < half - 1; y += 5) localRect(g, e, 0, y, 6, 2, P.mid);
    }
    for (const y of [-half - 3, half]) {
      localRect(g, e, -4, y, 12, 3, P.dark);
      localRect(g, e, -2, y, 4, 3, unlocked ? P.sage : P.gold);
    }
    g.restore();
    w.level.gates.forEach((p, i) => {
      const current = i === w.gate, done = i < w.gate;
      g.globalAlpha = done ? .35 : current ? 1 : .55;
      const color = current ? P.green : P.edge;
      if (current) { g.globalAlpha = .55; oval(g, p.x, p.y, 19, 19, P.cream); g.globalAlpha = 1; }
      for (const [xx, yy, sx, sy] of [[-14, -14, 1, 1], [14, -14, -1, 1], [-14, 14, 1, -1], [14, 14, -1, -1]]) {
        rect(g, p.x + xx - (sx < 0 ? 6 : 0), p.y + yy, 7, 2, color);
        rect(g, p.x + xx, p.y + yy - (sy < 0 ? 6 : 0), 2, 7, color);
      }
      if (done) { line(g, p.x - 4, p.y, p.x - 1, p.y + 3, P.pine, 2); line(g, p.x - 1, p.y + 3, p.x + 5, p.y - 4, P.pine, 2); }
      else text(g, String(i + 1), p.x + 1, p.y + 4, color, 11, 'center');
      g.globalAlpha = 1;
    });
  }

  function drawBoundary(g, w) {
    if (!w.boundaryContacts.length) return;
    g.save();
    const life = Math.max(...w.boundaryContacts.map(c => c.life));
    g.globalAlpha = clamp(life / .18, 0, 1);
    const person = point(w.body, BODY.personX, 0);
    const circle = Array.from({ length: 32 }, (_, i) => ({ x: person.x + Math.cos(i * Math.PI / 16) * BODY.personRadius, y: person.y + Math.sin(i * Math.PI / 16) * BODY.personRadius }));
    const shapes = [{ part: 'cart', points: corners(w.body) }, { part: 'shopper', points: circle },
      ...w.wheels.map((q, i) => ({ part: 'wheel:' + i, points: casterCorners(w.body, q, i) }))];
    for (const shape of shapes) {
      if (w.boundaryContacts.some(c => c.part === shape.part)) {
        const alpha = g.globalAlpha; g.globalAlpha *= .3; poly(g, shape.points, P.red); g.globalAlpha = alpha;
      }
      shape.points.forEach((p, i) => {
        const q = shape.points[(i + 1) % shape.points.length];
        line(g, p.x - 1, p.y - 1, q.x - 1, q.y - 1, P.dark, 3);
        line(g, p.x, p.y, q.x, q.y, P.red);
      });
    }
    for (const c of w.boundaryContacts) {
      g.globalAlpha = clamp(c.life / .18, 0, 1);
      const x = clamp(c.x, 2, 477), y = clamp(c.y, 2, 297);
      line(g, x - c.ny * 12 - 1, y + c.nx * 12 - 1, x + c.ny * 12 - 1, y - c.nx * 12 - 1, P.dark, 4);
      line(g, x - c.ny * 12, y + c.nx * 12, x + c.ny * 12, y - c.nx * 12, P.red, 2);
      rect(g, x - 2, y - 2, 5, 5, P.red); rect(g, x - 1, y - 1, 3, 3, P.light);
    }
    g.restore();
  }

  function draw(g = ctx, w = world, background = floor, preview = false) {
    g.clearRect(0, 0, 480, 300); g.save();
    if (!preview && screenShake > 0 && !reducedMotion.matches) g.translate(Math.round(Math.sin(w.time * 99) * screenShake), Math.round(Math.cos(w.time * 78) * screenShake));
    g.drawImage(background, 0, 0); drawRoute(g, w);
    for (const t of w.tracks) { g.globalAlpha = t.life / 3 * .14; localRect(g, { x: t.x, y: t.y, a: t.a }, -2, -1, 4, 1, P.edge); }
    g.globalAlpha = 1;
    if (!preview) {
      for (const d of debris) { rect(g, d.x + 1, d.y + 1, d.w, d.h, P.mid); localRect(g, d, -d.w / 2, -d.h / 2, d.w, d.h, d.color); }
      const b = w.body, speed = Math.hypot(b.vx, b.vy);
      if (speed > 8) {
        const vx = b.vx / speed, vy = b.vy / speed, length = Math.min(57, speed * .45);
        g.globalAlpha = .58;
        for (let i = 9; i < length; i += 5) rect(g, b.x + vx * i, b.y + vy * i, 2, 2, P.green);
        const x = b.x + vx * length, y = b.y + vy * length;
        line(g, x, y, x - vx * 5 - vy * 3, y - vy * 5 + vx * 3, P.green);
        line(g, x, y, x - vx * 5 + vy * 3, y - vy * 5 - vx * 3, P.green); g.globalAlpha = 1;
      }
    }
    // Painter's order gives furniture and people a little depth without hiding
    // the driving footprint. Everything still sits on a 2D floor.
    const entities = [...w.shelves.map(s => ({ y: s.y + s.h / 2, render: () => drawShelf(g, s, w.time) })), ...w.objects.map(o => ({ y: o.y, render: () => drawObject(g, o) })), { y: w.body.y, render: () => drawCart(g, w.body, w.wheels, w.gait) }];
    entities.sort((a, b) => a.y - b.y).forEach(e => e.render());
    if (!preview) for (const p of particles) {
      g.globalAlpha = .2; rect(g, p.x + 1, p.y + 2, p.w, p.h, P.dark); g.globalAlpha = clamp(p.life, 0, 1);
      localRect(g, { x: p.x, y: p.y - p.z, a: p.a }, -p.w / 2, -p.h / 2, p.w, p.h, p.color); g.globalAlpha = 1;
    }
    if (!preview) drawBoundary(g, w);
    g.restore();
  }

  function burst(x, y, count, colors, kind = 'spill') {
    if (kind === 'gate' && reducedMotion.matches) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + Math.random(), v = kind === 'gate' ? 16 : 20 + Math.random() * 45;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: kind === 'gate' ? 0 : 7, vz: kind === 'gate' ? 0 : 40 + Math.random() * 55, a, omega: Math.random() * 9 - 4, color: colors[i % colors.length], w: 2 + i % 3, h: 2 + i % 2, life: kind === 'gate' ? .6 : 6, kind });
    }
  }
  function tickEffects(dt) {
    screenShake = Math.max(0, screenShake - dt * 7);
    toastLife -= dt;
    if (toastLife <= 0) $('toast').classList.remove('is-visible');
    for (const p of particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.omega * dt;
      p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.5 * dt);
      if (p.kind === 'spill') {
        p.z += p.vz * dt; p.vz -= 200 * dt;
        if (p.z < 0) {
          p.z = 0;
          if (Math.abs(p.vz) > 15) { p.vz = -p.vz * .3; }
          else { debris.push({ x: p.x, y: p.y, a: p.a, w: p.w, h: p.h, color: p.color }); p.life = 0; }
        }
      }
    }
    particles = particles.filter(p => p.life > 0);
    if (debris.length > 150) debris = debris.slice(-150);
  }
  function events() {
    for (const e of world.events.splice(0)) {
      sound.event(e);
      if (e.type === 'gate') { burst(e.x, e.y, 8, [P.cream, P.gold, P.sage], 'gate'); notify(world.gate < world.level.gates.length ? 'Marker ' + world.gate + ' cleared' : 'Checkout is open. Drive out.'); }
      if (e.type === 'mess') {
        screenShake = e.kind === 'shelf' ? 1.5 : .65;
        notify((e.kind === 'cone' ? 'Cone down' : e.kind === 'box' ? 'Box bumped' : 'Shelf spilled') + (world.practice ? '' : ' / +' + e.seconds + ' seconds'));
      }
      if (e.type === 'spill') burst(e.x, e.y, 17, e.shelf.stock === 'plants' ? [P.sage, P.pine, P.clay] : [P.cream, P.blue, P.coral]);
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
    else if (target) $('route').textContent = 'Follow floor marker ' + (world.gate + 1) + ' of ' + world.level.gates.length;
    else $('route').textContent = world.exiting ? 'Keep rolling until you and the cart are outside' : 'Drive out through the checkout exit';
    $('pause').disabled = !['running', 'paused'].includes(phase);
    $('pause').setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game');
    $('pause').setAttribute('aria-pressed', String(phase === 'paused'));
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
    phase = 'ready'; particles = []; debris = []; screenShake = 0; toastLife = 0;
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
    overlay('Course ' + String(index + 1).padStart(2, '0') + ' / 06 · ' + world.level.name, 'All Four Wheels', index === 0 ? 'Follow the numbered floor markers to open checkout. Then drive out of the store.' : world.level.tip, 'Let\'s roll', null, true);
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
      const c = document.createElement('canvas'); c.width = 480; c.height = 300; c.setAttribute('aria-hidden', 'true');
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
  // Canvas text caches are rebuilt when the site's own mono font arrives.
  document.fonts.ready.then(() => { floor = makeFloor(world.level); draw(); });
})();
