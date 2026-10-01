/* The Unity hunting prototype's ground-plane ballistics and per-pixel hits.
   World coordinates match Unity: x right, y into the field, z above the ground.
   No DOM dependencies. A renderer supplies the trimmed deer sprite's alpha mask. */
(function (root) {
  'use strict';
  const TUNING = Object.freeze({
    pixelsPerUnit: 32, width: 640, height: 360,
    standY: -4.2, muzzleY: -3.9, walkSpeed: 3.2,
    roamNear: .2, roamFar: 2, fieldHalfWidth: 9.2, treelineY: 4,
    muzzleSpeed: 14, gravity: 9, standHeight: 1.6, windStrength: 3.5,
    minRange: 1.5, magazine: 5, reloadSeconds: 1.1,
    deerWalkSpeed: .9, deerRunSpeed: 7.5, spawnEvery: 6, maxDeer: 3,
    vitalsX: .67, vitalsY: .45, vitalsRadius: .1, fastForward: 8
  });
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function randomSource(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = Math.imul(value ^ value >>> 15, 1 | value);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function launch(from, aim, wind = 0) {
    const dx = aim.x - from.x, dy = aim.y - from.y;
    const length = Math.hypot(dx, dy), range = Math.max(length, TUNING.minRange);
    const duration = range / TUNING.muzzleSpeed;
    return {
      origin: { x: from.x, y: from.y },
      dx: length > .00001 ? dx / length : 0,
      dy: length > .00001 ? dy / length : 1,
      vz: (.5 * TUNING.gravity * duration * duration - TUNING.standHeight) / duration,
      wind, duration, age: 0, trail: [], reason: 'wide'
    };
  }
  function position(shot, time) {
    return {
      x: shot.origin.x + shot.dx * TUNING.muzzleSpeed * time + .5 * shot.wind * TUNING.windStrength * time * time,
      y: shot.origin.y + shot.dy * TUNING.muzzleSpeed * time,
      h: TUNING.standHeight + shot.vz * time - .5 * TUNING.gravity * time * time
    };
  }
  function hitPixel(art, facingRight, u, v) {
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return 'miss';
    const su = facingRight ? u : 1 - u;
    const x = clamp(Math.floor(su * art.width), 0, art.width - 1);
    // Canvas alpha rows start at the top; Unity's v starts at the hooves.
    const y = clamp(Math.floor((1 - v) * art.height), 0, art.height - 1);
    if (art.alpha[y * art.width + x] < 128) return 'transparent';
    return Math.hypot(su - TUNING.vitalsX, v - TUNING.vitalsY) < TUNING.vitalsRadius ? 'vitals' : 'wound';
  }
  class World {
    constructor(art, seed = Date.now()) {
      if (!art || art.alpha.length !== art.width * art.height) throw new Error('A readable deer sprite is required.');
      this.art = art;
      this.random = randomSource(seed);
      this.time = 0;
      this.wind = 0;
      this.windPhase = this.random() * Math.PI * 2;
      this.hunter = { x: 0, y: TUNING.muzzleY, ammo: TUNING.magazine, reload: 0 };
      this.deer = [];
      this.bullets = [];
      this.events = [];
      this.shots = 0;
      this.recovered = 0;
      this.wounded = 0;
      this.escaped = 0;
      this.nextId = 1;
      this.spawnTimer = TUNING.spawnEvery;
      // Put a first subject near the stand's sightline, with two farther out.
      this.spawn(0, .8);
      this.spawn(-4, 1.5);
      this.spawn(4.5, .4);
    }
    range(lo, hi) { return lo + this.random() * (hi - lo); }
    report(type, text, point) { this.events.push({ type, text, point }); }
    spawn(x = this.range(-8, 8), y = this.range(TUNING.roamNear, TUNING.roamFar)) {
      const deer = { id: this.nextId++, x, y, previousX: x, previousY: y,
        facingRight: this.random() > .5, state: 'grazing', pause: this.range(1.2, 3.5),
        targetX: x, targetY: y, stride: 0, bleed: 0, wounded: false, downTime: 0 };
      this.deer.push(deer);
      return deer;
    }
    aim(point) {
      return { x: clamp(point.x, -10, 10), y: clamp(point.y, this.hunter.y + TUNING.minRange, 5.625) };
    }
    reload() {
      const man = this.hunter;
      if (man.reload > 0 || man.ammo === TUNING.magazine) return false;
      man.reload = TUNING.reloadSeconds;
      this.report('reload', 'Reloading.');
      return true;
    }
    fire(aim) {
      const man = this.hunter;
      if (man.reload > 0) return false;
      if (!man.ammo) { this.reload(); return false; }
      man.ammo--;
      this.shots++;
      const bullet = launch(man, this.aim(aim), this.wind);
      this.bullets.push(bullet);
      this.report('shot', 'Round away.', position(bullet, 0));
      return true;
    }
    pickTarget(deer) {
      deer.targetX = this.range(-8.2, 8.2);
      deer.targetY = this.range(TUNING.roamNear, TUNING.roamFar);
      deer.state = 'walking';
    }
    step(dt, input = {}) {
      if (!(dt > 0 && dt <= .05)) throw new Error('Advance the world in fixed steps of at most .05 seconds.');
      this.time += dt;
      this.wind = .65 * Math.sin(this.windPhase + this.time * .12) + .25 * Math.sin(this.windPhase * 1.7 + this.time * .31);
      const man = this.hunter;
      man.x = clamp(man.x + (input.move || 0) * TUNING.walkSpeed * dt, -.7, .7);
      if (man.reload > 0) {
        man.reload = Math.max(0, man.reload - dt);
        if (man.reload === 0) { man.ammo = TUNING.magazine; this.report('ready', 'Five rounds ready.'); }
      }
      for (const deer of this.deer) {
        deer.previousX = deer.x;
        deer.previousY = deer.y;
        if (deer.state === 'down') { deer.downTime += dt; continue; }
        if (deer.state === 'grazing') {
          deer.pause -= dt;
          if (deer.pause <= 0) this.pickTarget(deer);
        } else {
          const fleeing = deer.state === 'fleeing';
          const dx = fleeing ? deer.x : deer.targetX - deer.x;
          const dy = fleeing ? deer.y - TUNING.standY : deer.targetY - deer.y;
          const distance = Math.hypot(dx, dy);
          if (!fleeing && distance < .15) {
            deer.state = 'grazing'; deer.pause = this.range(1.2, 3.5);
          } else if (distance > .00001) {
            const step = Math.min(distance, (fleeing ? TUNING.deerRunSpeed : TUNING.deerWalkSpeed) * dt);
            deer.x += dx / distance * step;
            deer.y += dy / distance * step;
            if (Math.abs(dx) > .001) deer.facingRight = dx > 0;
            deer.stride += dt * (fleeing ? 18 : 6);
          }
          if (deer.bleed > 0) {
            deer.bleed -= dt;
            if (deer.bleed <= 0) {
              // A vital hit is recovered even if it falls beyond the visible tree line.
              deer.state = 'down'; deer.downTime = 0;
              this.recovered++;
              this.report('recovered', 'Down. Recovered.', { x: deer.x, y: deer.y });
            }
          }
        }
      }
      const width = this.art.width / TUNING.pixelsPerUnit;
      const height = this.art.height / TUNING.pixelsPerUnit;
      this.bullets = this.bullets.filter(shot => {
        const previous = position(shot, shot.age);
        const age = Math.min(shot.age + dt, shot.duration);
        const next = position(shot, age);
        const candidates = [];
        for (const deer of this.deer) {
          if (deer.state === 'down' || deer.bleed > 0) continue;
          // Cross the moving animal's depth plane, rather than its entry hitbox.
          const before = previous.y - deer.previousY, after = next.y - deer.y;
          if (before > 0 || after < 0 || after - before < .000001) continue;
          const fraction = -before / (after - before);
          candidates.push({ deer, fraction });
        }
        candidates.sort((a, b) => a.fraction - b.fraction);
        for (const { deer, fraction } of candidates) {
          const time = shot.age + (age - shot.age) * fraction;
          const at = position(shot, time);
          const x = deer.previousX + (deer.x - deer.previousX) * fraction;
          const u = (at.x - x) / width + .5, v = at.h / height;
          if (u < 0 || u >= 1) continue;
          if (v >= 1) { shot.reason = 'high'; continue; }
          if (v < 0) { shot.reason = 'low'; continue; }
          const hit = hitPixel(this.art, deer.facingRight, u, v);
          if (hit === 'transparent' || hit === 'miss') { shot.reason = 'gap'; continue; }
          deer.state = 'fleeing';
          if (hit === 'vitals') {
            deer.bleed = this.range(.7, 1.8);
            this.report('vitals', 'Vitals. It won\'t go far.', { x: at.x, y: at.y + at.h });
          } else {
            if (!deer.wounded) this.wounded++;
            deer.wounded = true;
            this.report('wound', 'Hit outside the vitals. Follow up before it reaches the trees.', { x: at.x, y: at.y + at.h });
          }
          return false;
        }
        shot.age = age;
        shot.trail.push(next);
        if (shot.trail.length > 16) shot.trail.shift();
        if (age >= shot.duration) {
          const messages = { high: 'Over its back. Aim closer to the deer.', low: 'Too low. Aim farther beyond it.', gap: 'Through a gap in the silhouette.', wide: 'Miss. Check wind and lead the moving deer.' };
          this.report('miss', messages[shot.reason], { x: next.x, y: next.y });
          return false;
        }
        return true;
      });
      this.deer = this.deer.filter(deer => {
        if (deer.state === 'down') return deer.downTime < 12;
        // Let clean hits finish their short recovery timer outside the frame.
        if (deer.bleed > 0) return true;
        if (deer.y > TUNING.treelineY + 2 || Math.abs(deer.x) > TUNING.fieldHalfWidth + 3) {
          if (deer.wounded) {
            this.escaped++;
            this.report('escape', 'Wounded deer reached the trees. No recovery.');
          }
          return false;
        }
        return true;
      });
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer += TUNING.spawnEvery;
        if (this.deer.filter(deer => deer.state !== 'down').length < TUNING.maxDeer) this.spawn();
      }
    }
    drainEvents() { const events = this.events; this.events = []; return events; }
  }
  const api = { TUNING, World, launch, position, hitPixel, randomSource, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HuntingPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
