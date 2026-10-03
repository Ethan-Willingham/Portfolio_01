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
    vitalsX: .67, vitalsY: .45, vitalsRadius: .1, fastForward: 8,
    lookoutHalfWidth: 70, lookoutNear: 16, lookoutFar: 160,
    lookoutFocal: 300, lookoutVisibleMargin: .95,
    lookoutEyeHeight: 12, lookoutMuzzleSpeed: 150, lookoutMaxFlight: 1.8, lookoutAnimalWidth: 2,
    lookoutSpawnEvery: 20, lookoutVisitMin: 14, lookoutVisitMax: 24,
    lookoutDepartureSeconds: 3, lookoutFastClock: 600, lookoutFastSimulation: 12,
    lookoutSightingClock: 36, lookoutSightingSimulation: 2.2
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
    const speed = from.muzzleSpeed ?? TUNING.muzzleSpeed;
    const sightDuration = range / speed;
    const height = Number.isFinite(from.height) ? from.height : TUNING.standHeight;
    // A scope points along a sight ray. Gravity acts after launch, so distant
    // shots need a hold above the shoulder instead of a landing-point cursor.
    const directSight = Number.isFinite(aim.h);
    const vz = directSight ? (aim.h - height) / sightDuration : (.5 * TUNING.gravity * sightDuration * sightDuration - height) / sightDuration;
    const groundDuration = (vz + Math.sqrt(vz * vz + 2 * TUNING.gravity * height)) / TUNING.gravity;
    const duration = directSight ? Math.min(groundDuration, from.maxFlight ?? Infinity) : sightDuration;
    return {
      origin: { x: from.x, y: from.y },
      dx: length > .00001 ? dx / length : 0,
      dy: length > .00001 ? dy / length : 1,
      vz, speed, height, wind, duration, sightDuration, directSight, age: 0, trail: [], reason: 'wide'
    };
  }
  function position(shot, time) {
    return {
      x: shot.origin.x + shot.dx * (shot.speed ?? TUNING.muzzleSpeed) * time + .5 * shot.wind * TUNING.windStrength * time * time,
      y: shot.origin.y + shot.dy * (shot.speed ?? TUNING.muzzleSpeed) * time,
      h: shot.height + shot.vz * time - .5 * TUNING.gravity * time * time
    };
  }
  function hitPixel(art, facingRight, u, v) {
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return 'miss';
    const su = facingRight ? u : 1 - u;
    const x = clamp(Math.floor(su * art.width), 0, art.width - 1);
    // Canvas alpha rows start at the top; Unity's v starts at the hooves.
    const y = clamp(Math.floor((1 - v) * art.height), 0, art.height - 1);
    if (art.alpha[y * art.width + x] < 128) return 'transparent';
    return Math.hypot(su - (art.vitalsX ?? TUNING.vitalsX), v - (art.vitalsY ?? TUNING.vitalsY)) < (art.radius ?? TUNING.vitalsRadius) ? 'vitals' : 'wound';
  }
  function lookoutPace(waiting, scoped, opportunitySeconds = 0) {
    if (!waiting || scoped) return { clock: 1, simulation: 1 };
    if (opportunitySeconds > 0) return { clock: TUNING.lookoutSightingClock, simulation: TUNING.lookoutSightingSimulation };
    return { clock: TUNING.lookoutFastClock, simulation: TUNING.lookoutFastSimulation };
  }
  class World {
    constructor(art, seed = Date.now(), options = {}) {
      if (!art || art.alpha.length !== art.width * art.height) throw new Error('A readable deer sprite is required.');
      this.art = art;
      this.options = options;
      this.seed = seed >>> 0;
      this.species = options.species || 'deer';
      this.artName = this.species;
      this.backdrop = options.backdrop || 'clearing';
      this.blood = [];
      this.random = randomSource(seed);
      this.time = 0;
      this.wind = 0;
      this.windPhase = this.random() * Math.PI * 2;
      this.hunter = { x: options.freeWalk ? -7.6 : 0, y: options.freeWalk ? -4.4 : TUNING.muzzleY,
        height: options.freeWalk ? 1.1 : TUNING.standHeight, mounted: !options.freeWalk,
        stride: 0, moving: false, facingRight: true, ammo: TUNING.magazine, reload: 0 };
      if (options.lookout) Object.assign(this.hunter, { x: 0, y: 0, height: TUNING.lookoutEyeHeight, muzzleSpeed: TUNING.lookoutMuzzleSpeed, maxFlight: TUNING.lookoutMaxFlight, mounted: true });
      this.deer = [];
      this.critters = [];
      this.ambient = this.critters;
      this.opportunity = 0;
      this.bullets = [];
      this.events = [];
      this.shots = 0;
      this.recovered = 0;
      this.wounded = 0;
      this.escaped = 0;
      this.nextId = 1;
      this.spawnTimer = options.lookout ? TUNING.lookoutSpawnEvery : TUNING.spawnEvery;
      this.critterTimer = 9;
      // Put a first subject near the stand's sightline, with two farther out.
      if (options.lookout) { this.spawnCritter('squirrel', -24, 28); this.spawnCritter('owl', 22, 92); }
      else { this.spawn(0, .8); this.spawn(-4, 1.5); this.spawn(4.5, .4); }
    }
    range(lo, hi) { return lo + this.random() * (hi - lo); }
    report(type, text, point, animal) { this.events.push({ type, text, point, id: animal?.id, animal: animal ? { ...animal.profile, wounded: animal.wounded } : null }); }
    animalArt(deer) { return this.options.artFor ? this.options.artFor(deer.profile) : this.art; }
    animalSprite(deer) { return this.options.spriteFor ? this.options.spriteFor(deer.profile) : this.artName; }
    animalSize(deer) {
      const art = this.animalArt(deer);
      const width = this.options.lookout ? TUNING.lookoutAnimalWidth * (deer.scale ?? 1) : art.width / TUNING.pixelsPerUnit;
      return { width, height: width * art.height / art.width };
    }
    lookoutPace(waiting, scoped, opportunitySeconds = 0) { return lookoutPace(waiting, scoped, opportunitySeconds); }
    spawn(x, y, species = this.species) {
      const fromRight = this.random() > .5;
      const defaultX = !Number.isFinite(x);
      if (!Number.isFinite(x)) x = this.options.lookout ? (fromRight ? 1 : -1) * this.range(54, 66) : this.range(-8, 8);
      if (!Number.isFinite(y)) y = this.options.lookout ? this.range(24, 145) : this.range(TUNING.roamNear, TUNING.roamFar);
      // An arrival must already be in the lookout. A fixed lateral spawn
      // distance puts foreground animals outside the perspective frame.
      if (this.options.lookout && defaultX) x = clamp(x, -y * TUNING.lookoutVisibleMargin, y * TUNING.lookoutVisibleMargin);
      const deer = { id: this.nextId++, x, y, previousX: x, previousY: y,
        facingRight: this.random() > .5, state: 'grazing', pause: this.range(1.2, 3.5),
        targetX: x, targetY: y, stride: 0, bleed: 0, wounded: false, downTime: 0 };
      const seed = (this.seed ^ Math.imul(deer.id, 2654435761)) >>> 0;
      deer.profile = this.options.animal ? this.options.animal(species, seed) : { species, seed };
      deer.bloodTimer = 0;
      if (this.options.lookout) {
        Object.assign(deer, { state: 'walking', facingRight: x < 0, targetX: (x < 0 ? 1 : -1) * this.range(12, 40),
          targetY: clamp(y + this.range(-5, 5), TUNING.lookoutNear, TUNING.lookoutFar),
          visit: this.range(TUNING.lookoutVisitMin, TUNING.lookoutVisitMax), departureAge: 0, opacity: 1,
          scale: 1, walkSpeed: this.range(2.5, 3.8) });
        this.opportunity++;
        this.report('arrival', species === 'boar' ? 'Boar crossing.' : 'Deer crossing.', { x, y }, deer);
      }
      this.deer.push(deer);
      return deer;
    }
    spawnCritter(kind, x, y) {
      const owl = kind === 'owl', facingRight = this.random() > .5;
      const depth = y ?? this.range(owl ? 70 : 20, owl ? 145 : 58);
      const lateral = x ?? (facingRight ? -1 : 1) * Math.min(64, depth * TUNING.lookoutVisibleMargin);
      const critter = { id: this.nextId++, kind, species: kind, x: lateral,
        y: depth, h: owl ? this.range(5, 9) : 0,
        facingRight, stride: 0, state: owl ? 'flying' : 'scampering', age: 0,
        lifetime: this.range(12, 22), speed: owl ? this.range(5, 8) : this.range(1.8, 3.1), pause: 0 };
      this.critters.push(critter);
      if (this.time > 0) { this.opportunity++; this.events.push({ type: 'arrival', text: owl ? 'An owl glides past.' : 'Squirrel in the grass.', id: critter.id, point: { x: critter.x, y: critter.y, h: critter.h }, critter: kind, animal: null }); }
      return critter;
    }
    sight(point) {
      return { x: clamp(Number.isFinite(point.x) ? point.x : 0, -350, 350),
        y: clamp(Number.isFinite(point.y) ? point.y : 100, TUNING.lookoutNear, TUNING.lookoutFar),
        h: clamp(Number.isFinite(point.h) ? point.h : 0, -120, 80) };
    }
    aim(point) {
      if (this.options.lookout) return this.sight(point);
      if (this.options.freeWalk) {
        const x = clamp(point.x, -10, 10), y = clamp(point.y, -5.625, 5.625);
        const dx = x - this.hunter.x, dy = y - this.hunter.y, distance = Math.hypot(dx, dy);
        if (distance < TUNING.minRange) return { x: this.hunter.x + (distance ? dx / distance : 0) * TUNING.minRange, y: this.hunter.y + (distance ? dy / distance : 1) * TUNING.minRange };
        return { x, y };
      }
      return { x: clamp(point.x, -10, 10), y: clamp(point.y, this.hunter.y + TUNING.minRange, 5.625) };
    }
    toggleStand() {
      if (this.options.lookout) return false;
      if (!this.options.freeWalk) return false;
      const man = this.hunter;
      if (man.mounted) { Object.assign(man, { mounted: false, x: .95, y: -4.35, height: 1.1 }); return true; }
      if (Math.hypot(man.x, man.y - TUNING.muzzleY) > 1.4) return false;
      Object.assign(man, { mounted: true, x: 0, y: TUNING.muzzleY, height: TUNING.standHeight });
      return true;
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
      const bullet = launch(man, this.aim(aim), this.wind * (this.options.windScale ?? 1));
      this.bullets.push(bullet);
      this.report('shot', 'Round away.', position(bullet, 0));
      return true;
    }
    pickTarget(deer) {
      deer.targetX = this.options.lookout ? clamp(deer.x + this.range(-14, 14), -58, 58) : this.range(-8.2, 8.2);
      deer.targetY = this.options.lookout ? clamp(deer.y + this.range(-5, 5), TUNING.lookoutNear, TUNING.lookoutFar) : this.range(TUNING.roamNear, TUNING.roamFar);
      deer.state = 'walking';
    }
    step(dt, input = {}) {
      if (!(dt > 0 && dt <= .05)) throw new Error('Advance the world in fixed steps of at most .05 seconds.');
      this.time += dt;
      this.wind = (.65 * Math.sin(this.windPhase + this.time * .12) + .25 * Math.sin(this.windPhase * 1.7 + this.time * .31)) * (this.options.windForce ?? 1);
      const man = this.hunter;
      const mx = this.options.lookout ? 0 : input.move || 0, my = man.mounted ? 0 : input.moveY || 0, length = Math.max(1, Math.hypot(mx, my));
      man.moving = !!(mx || my);
      if (man.moving) { man.stride += dt * 9; if (mx) man.facingRight = mx > 0; }
      man.x = clamp(man.x + mx / length * TUNING.walkSpeed * dt, man.mounted ? -.7 : -8.7, man.mounted ? .7 : 8.7);
      if (!man.mounted) man.y = clamp(man.y + my / length * TUNING.walkSpeed * dt, -4.8, 2.5);
      if (man.reload > 0) {
        man.reload = Math.max(0, man.reload - dt);
        if (man.reload === 0) { man.ammo = TUNING.magazine; this.report('ready', 'Five rounds ready.'); }
      }
      for (const deer of this.deer) {
        deer.previousX = deer.x;
        deer.previousY = deer.y;
        if (deer.state === 'down') { deer.downTime += dt; continue; }
        if (this.options.lookout && !deer.wounded && deer.bleed <= 0) {
          deer.visit -= dt;
          if (deer.visit <= 0 && deer.state !== 'departing') {
            deer.state = 'departing';
            deer.targetX = (deer.x < 0 ? -1 : 1) * (TUNING.lookoutHalfWidth + 8);
            deer.targetY = deer.y + 6;
          }
          if (deer.state === 'departing') {
            deer.departureAge += dt;
            deer.opacity = Math.max(0, 1 - deer.departureAge / TUNING.lookoutDepartureSeconds);
          }
        }
        if (this.options.freeWalk && !man.mounted && man.moving && deer.state !== 'fleeing' && Math.hypot(deer.x - man.x, deer.y - man.y) < 2.1) {
          deer.state = 'fleeing';
          this.report('startle', 'Too close. Stay still or take the stand.');
        }
        if (deer.state === 'grazing') {
          deer.pause -= dt;
          if (deer.pause <= 0) this.pickTarget(deer);
        } else {
          const fleeing = deer.state === 'fleeing';
          const dx = fleeing ? (this.options.lookout ? (deer.x < 0 ? -1 : 1) * (TUNING.lookoutHalfWidth + 12) - deer.x : deer.x) : deer.targetX - deer.x;
          const dy = fleeing ? (this.options.lookout ? 8 : deer.y - TUNING.standY) : deer.targetY - deer.y;
          const distance = Math.hypot(dx, dy);
          if (!fleeing && distance < .15) {
            deer.state = 'grazing'; deer.pause = this.range(1.2, 3.5);
          } else if (distance > .00001) {
            const speed = this.options.lookout ? (fleeing ? 18 : deer.state === 'departing' ? 8 : deer.walkSpeed) : fleeing ? TUNING.deerRunSpeed : TUNING.deerWalkSpeed;
            const step = Math.min(distance, speed * dt);
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
              this.report('recovered', 'Down. Recovered.', { x: deer.x, y: deer.y }, deer);
            }
          }
        }
        if (deer.state === 'fleeing' && (deer.wounded || deer.bleed > 0)) {
          deer.bloodTimer -= dt;
          if (deer.bloodTimer <= 0) {
            this.blood.push({ x: deer.x, y: deer.y, id: deer.id });
            if (this.blood.length > 120) this.blood.shift();
            deer.bloodTimer = .09;
          }
        }
      }
      if (this.options.lookout) {
        for (const critter of this.critters) {
          critter.age += dt; critter.stride += dt * (critter.kind === 'owl' ? 8 : 14);
          if (critter.kind === 'owl') {
            critter.x += (critter.facingRight ? 1 : -1) * critter.speed * dt;
            critter.h += Math.sin(critter.stride * .25) * dt * .35;
          } else {
            critter.pause -= dt;
            if (critter.pause <= 0) {
              critter.x += (critter.facingRight ? 1 : -1) * critter.speed * dt;
              critter.h = Math.max(0, Math.sin(critter.stride)) * .16;
              if (this.random() < dt * .65) critter.pause = this.range(.5, 1.8);
            } else critter.h = 0;
          }
          critter.opacity = clamp((critter.lifetime - critter.age) / 2, 0, 1);
        }
        this.critters = this.critters.filter(critter => critter.age < critter.lifetime && Math.abs(critter.x) < TUNING.lookoutHalfWidth + 12);
        this.ambient = this.critters;
        this.critterTimer -= dt;
        if (this.critterTimer <= 0) {
          this.critterTimer += this.range(14, 24);
          if (this.critters.length < 4) this.spawnCritter(this.random() > .5 ? 'owl' : 'squirrel');
        }
      }
      this.bullets = this.bullets.filter(shot => {
        const previous = position(shot, shot.age);
        const age = Math.min(shot.age + dt, shot.duration);
        const next = position(shot, age);
        const candidates = [];
        for (const deer of this.deer) {
          if (deer.state === 'down' || deer.bleed > 0) continue;
          // Cross the moving animal's depth plane, rather than its entry hitbox.
          const before = previous.y - deer.previousY, after = next.y - deer.y;
          if (before * after > 0 || Math.abs(after - before) < .000001) continue;
          const fraction = -before / (after - before);
          candidates.push({ deer, fraction });
        }
        candidates.sort((a, b) => a.fraction - b.fraction);
        for (const { deer, fraction } of candidates) {
          const art = this.animalArt(deer), { width, height } = this.animalSize(deer);
          const time = shot.age + (age - shot.age) * fraction;
          const at = position(shot, time);
          const x = deer.previousX + (deer.x - deer.previousX) * fraction;
          const u = (at.x - x) / width + .5, v = at.h / height;
          if (u < 0 || u >= 1) continue;
          if (v >= 1) { shot.reason = 'high'; continue; }
          if (v < 0) { shot.reason = 'low'; continue; }
          const hit = hitPixel(art, deer.facingRight, u, v);
          if (hit === 'transparent' || hit === 'miss') { shot.reason = 'gap'; continue; }
          deer.state = 'fleeing';
          if (this.options.lookout) deer.opacity = 1;
          if (hit === 'vitals') {
            deer.bleed = this.range(.7, 1.8);
            this.report('vitals', this.options.lookout ? 'Clean hit.' : 'Vitals. It won\'t go far.', this.options.lookout ? at : { x: at.x, y: at.y + at.h }, deer);
          } else {
            if (!deer.wounded) this.wounded++;
            deer.wounded = true;
            this.report('wound', this.options.lookout ? 'Wounded. Take another shot.' : 'Hit outside the vitals. Follow up before it reaches the trees.', this.options.lookout ? at : { x: at.x, y: at.y + at.h }, deer);
          }
          return false;
        }
        shot.age = age;
        shot.trail.push(next);
        if (shot.trail.length > 16) shot.trail.shift();
        if (age >= shot.duration) {
          const messages = this.options.lookout ? { high: 'High. Aim lower.', low: 'Low. Hold above it for bullet drop.', gap: 'Through a gap in the silhouette.', wide: 'Miss. Hold into the wind and lead its movement.' } : { high: 'Over its back. Aim closer to the deer.', low: 'Too low. Aim farther beyond it.', gap: 'Through a gap in the silhouette.', wide: 'Miss. Check wind and lead the moving deer.' };
          this.report('miss', messages[shot.reason], this.options.lookout ? next : { x: next.x, y: next.y });
          return false;
        }
        return true;
      });
      this.deer = this.deer.filter(deer => {
        if (deer.state === 'down') return deer.downTime < 12;
        // Let clean hits finish their short recovery timer outside the frame.
        if (deer.bleed > 0) return true;
        if (this.options.lookout && deer.state === 'departing' && deer.departureAge >= TUNING.lookoutDepartureSeconds) {
          this.report('departed', deer.profile.species === 'boar' ? 'The boar slips back into cover.' : 'The deer slips back into cover.', { x: deer.x, y: deer.y }, deer);
          return false;
        }
        const outside = this.options.lookout ? deer.y > TUNING.lookoutFar + 8 || Math.abs(deer.x) > TUNING.lookoutHalfWidth + 8 : deer.y > TUNING.treelineY + 2 || Math.abs(deer.x) > TUNING.fieldHalfWidth + 3;
        if (outside) {
          if (deer.wounded) {
            this.escaped++;
            this.report('escape', this.options.lookout ? 'It gets away into the trees.' : 'The trail leads into the trees. Search now, or keep hunting.', null, deer);
          } else if (this.options.lookout) this.report('departed', 'Back into the trees.', { x: deer.x, y: deer.y }, deer);
          return false;
        }
        return true;
      });
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer += (this.options.lookout ? TUNING.lookoutSpawnEvery * this.range(.8, 1.3) : TUNING.spawnEvery) / Math.max(.15, this.options.activity ? this.options.activity() : 1);
        if (this.deer.filter(deer => deer.state !== 'down').length < TUNING.maxDeer) this.spawn();
      }
    }
    drainEvents() { const events = this.events; this.events = []; return events; }
  }
  const api = { TUNING, World, launch, position, hitPixel, randomSource, clamp, lookoutPace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HuntingPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
