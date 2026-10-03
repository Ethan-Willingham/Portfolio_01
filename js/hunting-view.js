/* The lookout, its landscape and a scope rendered directly at the current zoom. */
(function () {
  'use strict';
  const { TUNING: T, position, clamp } = HuntingPhysics;
  const W = T.width, H = T.height;
  const geometry = Object.freeze({ eyeHeight: T.lookoutEyeHeight ?? 12, focal: T.lookoutFocal ?? W * .46875, horizon: H * .4, aimDepth: 100 });
  const palette = { shadow: '#303931', cream: '#e8e2d6', gold: '#d4c4a0', warn: '#d99090', ink: '#1e2420' };
  const normal = () => ({ x: 0, y: 100, h: 0, zoom: 1, screenX: W / 2, screenY: H / 2 });
  const scaleAt = depth => geometry.focal / Math.max(.2, depth);
  const baseProject = point => {
    const scale = scaleAt(point.y);
    return { x: W / 2 + point.x * scale, y: geometry.horizon + (geometry.eyeHeight - (point.h || 0)) * scale };
  };
  const anchor = camera => Number.isFinite(camera.screenX) && Number.isFinite(camera.screenY)
    ? { x: camera.screenX, y: camera.screenY } : camera.zoom > 1 ? baseProject(camera) : { x: W / 2, y: H / 2 };
  function project(point, camera = normal()) {
    const p = baseProject(point), a = anchor(camera), zoom = camera.zoom || 1;
    return { x: W / 2 + (p.x - a.x) * zoom, y: H / 2 + (p.y - a.y) * zoom };
  }
  function unproject(point, camera = normal()) {
    const a = anchor(camera), zoom = camera.zoom || 1;
    const x = a.x + (point.x - W / 2) / zoom, y = a.y + (point.y - H / 2) / zoom;
    // Each screen pixel defines a ray. A common depth anchor preserves the
    // sightline through near and far animals without snapping to their bodies.
    return { x: (x - W / 2) * geometry.aimDepth / geometry.focal, y: geometry.aimDepth,
      h: geometry.eyeHeight - (y - geometry.horizon) * geometry.aimDepth / geometry.focal };
  }
  function mix(a, b, t) {
    const aa = parseInt(a.slice(1), 16), bb = parseInt(b.slice(1), 16);
    const channel = shift => Math.round((aa >> shift & 255) * (1 - t) + (bb >> shift & 255) * t);
    return 'rgb(' + channel(16) + ',' + channel(8) + ',' + channel(0) + ')';
  }
  function noise(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
  async function loadArt() {
    const names = ['boar', ...HuntingCampaign.DEER_LEVELS.map(d => 'deer-' + d.level)];
    const pairs = await Promise.all(names.map(name => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve([name, img]);
      img.onerror = () => reject(new Error('Could not load ' + name + ' artwork.'));
      img.src = 'assets/hunting/' + name + (name.startsWith('deer-') ? '-v4.png' : ['hunter', 'clearing'].includes(name) ? '-v2.png' : '-v3.png') + '?v=4';
    })));
    const sprites = Object.fromEntries(pairs); sprites.deer = sprites['deer-1'];
    const masks = {};
    for (const name of ['boar', ...HuntingCampaign.DEER_LEVELS.map(d => 'deer-' + d.level)]) {
      const canvas = document.createElement('canvas'); canvas.width = sprites[name].width; canvas.height = sprites[name].height;
      const g = canvas.getContext('2d', { willReadFrequently: true }); g.drawImage(sprites[name], 0, 0);
      const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data, alpha = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
      const species = name.startsWith('deer-') ? HuntingCampaign.deerLevel(Number(name.split('-')[1])) : HuntingCampaign.SPECIES[name];
      masks[name] = { width: canvas.width, height: canvas.height, alpha, vitalsX: species.vitalsX, vitalsY: species.vitalsY, radius: species.radius };
    }
    masks.deer = masks['deer-1']; return { sprites, mask: masks.deer, masks };
  }
  class View {
    constructor(canvas, sprites) {
      this.canvas = canvas; this.g = canvas.getContext('2d'); this.sprites = sprites;
      this.camera = normal(); this.effects = []; this.trails = []; this.time = 0;
      this.grass = Array.from({ length: 1700 }, (_, i) => ({ x: (noise(i + 1) - .5) * 230,
        y: 16 + noise(i + 3122) ** 1.7 * 178, h: .04 + noise(i + 224) * .23, color: i % 4, lean: noise(i + 313) - .5 }));
      this.trees = Array.from({ length: 124 }, (_, i) => ({ x: -190 + i * 3.1 + noise(i + 431) * 2,
        y: 167 + noise(i + 417) * 76, h: 5 + noise(i + 97) * 11, kind: i % 5, shade: i % 3 }));
      this.plants = Array.from({ length: 58 }, (_, i) => ({ x: (noise(i + 328) - .5) * 96,
        y: 18 + noise(i + 779) * 115, h: .4 + noise(i + 889) * .65, shade: i % 3 }));
      this.seenBullets = new WeakSet(); this.lastMinute = 360;
    }
    scope(active, aim) {
      if (!active) { this.camera = normal(); return; }
      if (this.camera.zoom > 1) return;
      const at = baseProject(aim);
      this.camera = { x: aim.x, y: aim.y, h: aim.h || 0, zoom: 6, screenX: at.x, screenY: at.y };
    }
    panScope(moveX, moveY, dt) {
      if (this.camera.zoom <= 1 || !(dt > 0) || !(moveX || moveY)) return false;
      const length = Math.max(1, Math.hypot(moveX, moveY));
      const speed = 300 / this.camera.zoom;
      const x = clamp(this.camera.screenX + moveX / length * speed * dt, 0, W);
      const y = clamp(this.camera.screenY + moveY / length * speed * dt, 0, H);
      if (x === this.camera.screenX && y === this.camera.screenY) return false;
      this.camera.screenX = x; this.camera.screenY = y;
      Object.assign(this.camera, unproject({ x: W / 2, y: H / 2 }, this.camera));
      return true;
    }
    addEffect(event) {
      if (!event.point || !['shot', 'miss', 'vitals', 'wound', 'recovered'].includes(event.type)) return;
      this.effects.push({ ...event, left: event.type === 'shot' ? .16 : .8, duration: event.type === 'shot' ? .16 : .8 });
      if (this.effects.length > 40) this.effects.shift();
    }
    tick(dt) {
      this.time += dt;
      this.effects = this.effects.filter(effect => { effect.left -= dt; return effect.left > 0; });
      this.trails = this.trails.filter(trail => { trail.left -= dt; return trail.left > 0; });
    }
    tone(minute) {
      const hour = ((minute % 1440) + 1440) % 1440 / 60;
      const daylight = clamp(Math.sin((hour - 5.3) / 14.4 * Math.PI) * 2.2, 0, 1);
      const warm = Math.max(Math.exp(-(((hour - 6.1) / 1.2) ** 2)), Math.exp(-(((hour - 18.7) / 1.35) ** 2)));
      return { hour, daylight, warm, sky: mix('#273b3c', '#8faaa6', daylight), horizon: mix('#596459', '#ddd4ad', daylight),
        field: mix('#303d32', '#88915e', daylight), front: mix('#24352d', '#697544', daylight) };
    }
    backdrop(g, tone, minute) {
      const c = this.camera, a = anchor(c), zoom = c.zoom;
      g.save(); g.translate(W / 2 - a.x * zoom, H / 2 - a.y * zoom); g.scale(zoom, zoom);
      const sky = g.createLinearGradient(0, 0, 0, H * .53);
      sky.addColorStop(0, tone.sky); sky.addColorStop(.7, mix('#52695e', '#b7c3ac', tone.daylight));
      sky.addColorStop(1, tone.warm > .15 ? mix('#d4c4a0', '#d9978c', tone.warm * .65) : tone.horizon);
      g.fillStyle = sky; g.fillRect(-W * 3, -H * 3, W * 7, H * 7);
      if (tone.daylight < .6) {
        g.globalAlpha = (1 - tone.daylight) * .65; g.fillStyle = palette.cream;
        for (let i = 0; i < 54; i++) g.fillRect(noise(i + 919) * W, noise(i + 519) * H * .35, i % 5 ? .65 : 1.2, .65);
        g.globalAlpha = 1;
      }
      // The continuous campaign clock determines the sun's actual position.
      const travel = (tone.hour - 5.3) / 14.4;
      if (travel >= 0 && travel <= 1) {
        const sx = W * (.04 + .92 * travel), sy = H * (.46 - Math.sin(travel * Math.PI) * .36);
        const halo = g.createRadialGradient(sx, sy, 5, sx, sy, 68);
        halo.addColorStop(0, 'rgba(237,224,192,.3)'); halo.addColorStop(1, 'rgba(237,224,192,0)');
        g.fillStyle = halo; g.fillRect(sx - 68, sy - 68, 136, 136);
        g.fillStyle = mix('#dfc288', '#f5f1ea', tone.daylight * .65); g.beginPath(); g.arc(sx, sy, 12, 0, Math.PI * 2); g.fill();
      } else {
        const nightTravel = ((tone.hour + 4) % 24) / 9.6, mx = W * (.1 + .8 * clamp(nightTravel, 0, 1)), my = H * .15;
        g.fillStyle = '#d4c4a0'; g.beginPath(); g.arc(mx, my, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = tone.sky; g.beginPath(); g.arc(mx + 3.5, my - 2, 7, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = .17 + tone.daylight * .06; g.fillStyle = palette.cream;
      for (let i = 0; i < 6; i++) {
        const drift = Math.sin(minute / 720 + i) * 11, x = i * 124 - 70 + drift, y = 24 + noise(i + 880) * 62;
        g.beginPath(); g.ellipse(x, y, 34 + noise(i + 786) * 35, 2 + noise(i + 669) * 2, -.015, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x + 22, y + 4, 42, 1.6, -.02, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle = mix(['#6f8480', '#728275', '#65745e'][layer], ['#394d46', '#35473b', '#31432f'][layer], 1 - tone.daylight);
        g.beginPath(); g.moveTo(-W, H);
        for (let x = -W; x <= W * 2; x += 10) {
          const y = H * (.358 + layer * .038) - (Math.sin(x / (83 - layer * 17) + layer * 2) + Math.sin(x / 41 + layer)) * (7 - layer);
          g.lineTo(x, y);
        }
        g.lineTo(W * 2, H); g.closePath(); g.fill();
      }
      g.restore();
    }
    terrain(g, tone, marsh) {
      const top = project({ x: 0, y: 220 }, this.camera).y;
      const field = g.createLinearGradient(0, top, 0, H); field.addColorStop(0, tone.field); field.addColorStop(1, tone.front);
      g.fillStyle = field; if (top < H) g.fillRect(0, Math.max(0, top), W, H - Math.max(0, top));
      for (const tree of this.trees) {
        const at = project({ ...tree, h: 0 }, this.camera), s = scaleAt(tree.y) * this.camera.zoom;
        if (at.x < -35 * s || at.x > W + 35 * s) continue;
        g.fillStyle = mix(['#526a50', '#617555', '#6f805f'][tree.shade], '#293e31', 1 - tone.daylight);
        const h = tree.h * s, w = h * .44;
        if (tree.kind < 3) {
          g.beginPath(); g.moveTo(at.x, at.y - h); g.lineTo(at.x - w * .36, at.y - h * .49);
          g.lineTo(at.x - w * .19, at.y - h * .49); g.lineTo(at.x - w * .5, at.y - h * .13);
          g.lineTo(at.x + w * .5, at.y - h * .13); g.lineTo(at.x + w * .19, at.y - h * .49);
          g.lineTo(at.x + w * .36, at.y - h * .49); g.closePath(); g.fill();
        } else { g.beginPath(); g.ellipse(at.x, at.y - h * .7, w * .58, h * .37, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = mix('#59654a', '#25382a', 1 - tone.daylight); g.fillRect(at.x - s * .15, at.y - h * .32, s * .3, h * .32);
      }
      const ribbon = (width, offset, paint) => {
        const points = []; for (let y = 15; y <= 215; y += 3) points.push({ x: offset + Math.sin(y / 37) * 6 + (210 - y) * -.055, y });
        g.fillStyle = paint; g.beginPath();
        points.forEach((p, i) => { const at = project({ x: p.x - width, y: p.y }, this.camera); if (!i) g.moveTo(at.x, at.y); else g.lineTo(at.x, at.y); });
        for (let i = points.length - 1; i >= 0; i--) { const at = project({ x: points[i].x + width, y: points[i].y }, this.camera); g.lineTo(at.x, at.y); }
        g.closePath(); g.fill();
      };
      ribbon(1.1, -10, mix('#9d9367', '#43533b', 1 - tone.daylight));
      if (marsh) { ribbon(3.4, 22, mix('#9caa91', '#465e50', 1 - tone.daylight)); ribbon(2.7, 22, mix('#7f9a88', '#3c5548', 1 - tone.daylight)); }
      for (let color = 0; color < 4; color++) {
        g.strokeStyle = mix(['#697948', '#a4a375', '#778956', '#535f37'][color], ['#273d2f', '#526148', '#334936', '#233929'][color], 1 - tone.daylight);
        g.lineWidth = Math.max(.6, this.camera.zoom * .42); g.beginPath();
        for (const plant of this.grass) {
          if (plant.color !== color) continue;
          const at = project({ ...plant, h: 0 }, this.camera); if (at.x < -5 || at.x > W + 5 || at.y < top || at.y > H + 5) continue;
          const tip = project({ x: plant.x + plant.lean * .11, y: plant.y, h: plant.h }, this.camera), span = scaleAt(plant.y) * this.camera.zoom * .21;
          g.moveTo(at.x - span, at.y); g.lineTo(at.x + span, at.y);
          if (plant.y < 105) { g.moveTo(at.x, at.y); g.lineTo(tip.x, tip.y); }
        }
        g.stroke();
      }
      for (const plant of this.plants) {
        const at = project({ ...plant, h: 0 }, this.camera), s = scaleAt(plant.y) * this.camera.zoom;
        if (at.x < -10 * s || at.x > W + 10 * s || at.y > H + 20 * s) continue;
        g.strokeStyle = mix(plant.shade ? '#6e744b' : '#9b9870', '#344431', 1 - tone.daylight); g.lineWidth = Math.max(.6, s * .06); g.beginPath();
        const breeze = Math.sin(this.time * 1.4 + plant.y) * .13;
        for (let k = -2; k <= 2; k++) {
          g.moveTo(at.x + k * s * .09, at.y);
          g.quadraticCurveTo(at.x + k * s * .2 + breeze * s, at.y - plant.h * s * .5, at.x + k * s * .27 + breeze * s, at.y - plant.h * s * (1 - Math.abs(k) * .12));
        }
        g.stroke();
      }
      for (const tree of [{ x: -15.8, y: 18, h: 21, width: .52 }, { x: -17.2, y: 21, h: 18, width: .35 }]) {
        const at = project({ ...tree, h: 0 }, this.camera), s = scaleAt(tree.y) * this.camera.zoom, h = tree.h * s, w = tree.width * s;
        if (at.x + w < -70 || at.x - w > W + 70) continue;
        g.fillStyle = mix('#c4c4a1', '#526448', 1 - tone.daylight); g.fillRect(at.x - w / 2, at.y - h, w, h);
        g.fillStyle = mix('#696e50', '#293c2d', 1 - tone.daylight);
        for (let i = 0; i < 14; i++) g.fillRect(at.x - w / 2 + (i % 3) * w * .1, at.y - i * h / 14, w * .6, s * .07);
        g.strokeStyle = g.fillStyle; g.lineWidth = w * .35; g.beginPath(); g.moveTo(at.x, at.y - h * .78); g.lineTo(at.x + h * .12, at.y - h * .95); g.stroke();
        g.fillStyle = mix('#677a4a', '#2e4530', 1 - tone.daylight);
        for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(at.x + Math.sin(i * 2.3) * h * .14, at.y - h * (.82 + noise(i) * .2), h * .105, h * .057, .2, 0, Math.PI * 2); g.fill(); }
      }
    }
    sprite(g, image, at, size, flip = false, lean = 0) {
      g.save(); g.translate(at.x, at.y); if (flip) g.scale(-1, 1); if (lean) g.rotate(lean);
      g.drawImage(image, -size.width / 2, -size.height, size.width, size.height); g.restore();
    }
    critter(g, animal, tone) {
      const at = project(animal, this.camera), s = scaleAt(animal.y) * this.camera.zoom;
      if (at.x < -30 || at.x > W + 30 || at.y < -30 || at.y > H + 30) return;
      g.save(); g.globalAlpha *= animal.opacity ?? 1; g.translate(at.x, at.y); g.scale(s * (animal.facingRight === false ? -1 : 1), s);
      const kind = animal.species || animal.kind, motion = animal.stride || animal.age || this.time;
      if (kind === 'owl') {
        const flap = Math.sin(motion * 3) * .4; g.fillStyle = mix('#6c6047', '#333c2d', 1 - tone.daylight);
        g.beginPath(); g.moveTo(-.12, -.22); g.lineTo(-1.2, -.05 - flap); g.lineTo(-.9, .2 - flap * .5);
        g.lineTo(-.22, .18); g.lineTo(0, .5); g.lineTo(.22, .18); g.lineTo(.9, .2 - flap * .5); g.lineTo(1.2, -.05 - flap); g.lineTo(.12, -.22); g.closePath(); g.fill();
        g.fillStyle = mix('#c0ab7a', '#827856', 1 - tone.daylight); g.beginPath(); g.ellipse(0, -.12, .22, .26, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = palette.ink; g.beginPath(); g.arc(-.095, -.18, .055, 0, Math.PI * 2); g.arc(.095, -.18, .055, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(-.2, -.25); g.lineTo(-.19, -.43); g.lineTo(-.07, -.3); g.moveTo(.07, -.3); g.lineTo(.19, -.43); g.lineTo(.2, -.25); g.fill();
      } else {
        const hop = Math.max(0, Math.sin(motion * 3.5)) * .1; g.translate(0, -hop); g.fillStyle = mix('#886c47', '#4f5037', 1 - tone.daylight);
        g.beginPath(); g.ellipse(-.33, -.37, .18, .31, -.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = mix('#b89964', '#736445', 1 - tone.daylight);
        g.beginPath(); g.ellipse(-.02, -.18, .26, .17, -.25, 0, Math.PI * 2); g.ellipse(.19, -.33, .12, .14, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(.14, -.43); g.lineTo(.17, -.56); g.lineTo(.23, -.44); g.fill();
        g.fillStyle = palette.ink; g.fillRect(.23, -.37, .034, .034);
        g.strokeStyle = '#a38a60'; g.lineWidth = .07; g.beginPath(); g.moveTo(.02, -.1); g.lineTo(.14, -.02); g.moveTo(-.16, -.08); g.lineTo(-.24, -.01); g.stroke();
      }
      g.restore();
    }
    drawTrail(g, points, alpha) {
      const usable = points.filter(p => p.y > 1); if (!usable.length) return;
      g.save(); g.globalAlpha = alpha; g.strokeStyle = palette.gold; g.lineWidth = this.camera.zoom > 1 ? 1.35 : 1.15; g.beginPath();
      usable.forEach((p, i) => { const at = project(p, this.camera); if (!i) g.moveTo(at.x, at.y); else g.lineTo(at.x, at.y); }); g.stroke(); g.restore();
    }
    draw(world, aim, guide, showReticle = true) {
      const g = this.g, minute = Number.isFinite(world.minute) ? world.minute : this.lastMinute; this.lastMinute = minute;
      // Native sprite artwork is sampled at its actual projected scope size.
      // There is no tiny overview image stretched into a magnified scene.
      g.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
      const tone = this.tone(minute); this.backdrop(g, tone, minute); this.terrain(g, tone, world.backdrop === 'marsh');
      for (const drop of world.blood || []) { const at = project(drop, this.camera), s = scaleAt(drop.y) * this.camera.zoom; g.fillStyle = '#884c3d'; g.fillRect(at.x, at.y, Math.max(1, s * .12), Math.max(.7, s * .04)); }
      const residents = [...(world.deer || []).map(animal => ({ animal, game: true })), ...(world.ambient || world.critters || []).map(animal => ({ animal, game: false }))].sort((a, b) => b.animal.y - a.animal.y);
      for (const resident of residents) {
        const deer = resident.animal; if (!resident.game) { this.critter(g, deer, tone); continue; }
        const image = this.sprites[world.animalSprite(deer)] || this.sprites.deer;
        const size = world.animalSize ? world.animalSize(deer) : { width: image.width / T.pixelsPerUnit, height: image.height / T.pixelsPerUnit };
        const s = scaleAt(deer.y) * this.camera.zoom, at = project(deer, this.camera), rendered = { width: size.width * s, height: size.height * s };
        if (at.x + rendered.width < 0 || at.x - rendered.width > W || at.y < 0 || at.y - rendered.height > H) continue;
        g.save(); g.globalAlpha = (deer.opacity ?? 1) * (deer.state === 'down' ? clamp((12 - deer.downTime) / 2, 0, 1) : 1);
        g.fillStyle = palette.shadow; const opacity = g.globalAlpha; g.globalAlpha *= .3;
        g.beginPath(); g.ellipse(at.x, at.y + s * .025, rendered.width * .42, s * .075, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = opacity;
        const bob = deer.state === 'walking' || deer.state === 'fleeing' ? Math.sin(deer.stride) * s * .025 : 0;
        this.sprite(g, image, { x: at.x, y: at.y + bob }, rendered, !deer.facingRight, deer.state === 'down' ? (deer.facingRight ? -1.5 : 1.5) : 0); g.restore();
        if (guide && this.camera.zoom > 1 && deer.state !== 'down' && !deer.bleed) {
          const art = world.animalArt(deer), vx = art.vitalsX ?? T.vitalsX, vy = art.vitalsY ?? T.vitalsY, u = deer.facingRight ? vx : 1 - vx;
          const p = project({ x: deer.x + (u - .5) * size.width, y: deer.y, h: vy * size.height }, this.camera);
          g.strokeStyle = palette.gold; g.lineWidth = .8; g.beginPath(); g.arc(p.x, p.y, Math.max(2, (art.radius ?? T.vitalsRadius) * rendered.width), 0, Math.PI * 2); g.stroke();
        }
      }
      if (guide && showReticle && this.camera.zoom > 1) {
        const sight = world.sight ? world.sight(aim) : world.aim(aim), shot = HuntingPhysics.launch(world.hunter, sight, world.wind * (world.options.windScale ?? 1)), points = [];
        for (let i = 1; i <= 48; i++) points.push(position(shot, shot.duration * i / 48));
        g.save(); g.setLineDash([2, 6]); this.drawTrail(g, points, .43); g.restore();
      }
      for (const trail of this.trails) {
        const p = position(trail.shot, trail.shot.age), last = trail.points.at(-1);
        if (!last || Math.abs(last.y - p.y) > .01) trail.points.push(p);
        this.drawTrail(g, trail.points, clamp(trail.left / .8, 0, .5));
      }
      for (const shot of world.bullets || []) {
        if (!this.seenBullets.has(shot)) { this.seenBullets.add(shot); this.trails.push({ shot, points: shot.trail.slice(), left: 1.2 }); }
        const remembered = this.trails.find(trail => trail.shot === shot);
        if (remembered) { remembered.left = 1.2; const last = remembered.points.at(-1), p = position(shot, shot.age); if (!last || Math.abs(last.y - p.y) > .01) remembered.points.push(p); }
        this.drawTrail(g, shot.trail, .9); const p = position(shot, shot.age); if (p.y <= 1) continue;
        const at = project(p, this.camera); g.fillStyle = 'rgba(237,224,192,.18)'; g.beginPath(); g.arc(at.x, at.y, this.camera.zoom > 1 ? 6 : 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = palette.cream; g.beginPath(); g.arc(at.x, at.y, this.camera.zoom > 1 ? 2.2 : 1.6, 0, Math.PI * 2); g.fill();
      }
      for (const effect of this.effects) {
        if (effect.type === 'shot') continue;
        const at = project(effect.point, this.camera), fade = effect.left / effect.duration;
        g.save(); g.globalAlpha = fade; g.strokeStyle = effect.type === 'miss' ? palette.gold : palette.warn; g.lineWidth = 1;
        g.beginPath(); g.ellipse(at.x, at.y, 2 + (1 - fade) * 8, 1 + (1 - fade) * 3, 0, 0, Math.PI * 2); g.stroke(); g.restore();
      }
      if (this.camera.zoom > 1) { this.scopeMask(g, world, aim, showReticle); this.flightInset(g, world); }
      else if (showReticle) { const at = project(world.sight ? world.sight(aim) : world.aim(aim), this.camera); g.strokeStyle = 'rgba(232,226,214,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(at.x, at.y, 5, 0, Math.PI * 2); g.stroke(); g.fillStyle = palette.cream; g.fillRect(at.x - .5, at.y - .5, 1, 1); }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    flightInset(g, world) {
      const live = (world.bullets || []).at(-1), recent = this.trails.at(-1);
      const shot = live || (recent && recent.left > .4 ? recent.shot : null);
      if (!shot) return;
      const displayScale = W / (this.canvas.clientWidth || W);
      const width = 150, height = 100, x = 8, y = H - height - Math.max(24, Math.ceil(30 * displayScale));
      const font = Math.min(16, Math.max(8, 9 * displayScale)), compact = font > 9;
      const type = font.toFixed(1) + 'px \"Commit Mono\", monospace';
      const ground = height - 20, left = 12, right = width - 10;
      const end = position(shot, shot.duration), extent = Math.max(45, end.y * 1.06);
      const apex = position(shot, clamp(shot.vz / T.gravity, 0, shot.duration)).h;
      const topHeight = Math.max(14, apex * 1.1), vertical = (ground - 27) / topHeight;
      const profile = p => ({ x: left + Math.max(0, p.y) / extent * (right - left), y: ground - p.h * vertical });
      g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, width, height); g.clip();
      g.fillStyle = 'rgba(30,36,32,.94)'; g.fillRect(0, 0, width, height);
      g.strokeStyle = '#4a544b'; g.lineWidth = 1; g.strokeRect(.5, .5, width - 1, height - 1);
      g.fillStyle = palette.gold; g.font = type;
      g.fillText(compact ? (live ? 'IN FLIGHT' : 'COMPLETE') : (live ? 'ROUND IN FLIGHT' : 'ROUND COMPLETE'), 8, Math.max(14, font + 4));
      g.fillStyle = '#303931'; g.fillRect(1, ground, width - 2, height - ground - 1);
      g.strokeStyle = '#767d71'; g.beginPath(); g.moveTo(8, ground); g.lineTo(width - 8, ground); g.stroke();
      // A side view of the same analytic shot makes the complete launch and
      // falling flight readable while the main lens keeps the sightline.
      const target = (world.deer || []).filter(d => d.state !== 'down').reduce((best, deer) => {
        const at = position(shot, deer.y / Math.max(1, shot.dy * (shot.speed || world.hunter.muzzleSpeed || T.muzzleSpeed)));
        const distance = Math.abs(at.x - deer.x);
        return !best || distance < best.distance ? { deer, distance } : best;
      }, null);
      if (target && target.distance < 5 && target.deer.y < extent) {
        const deer = target.deer, size = world.animalSize ? world.animalSize(deer) : { width: 2, height: 1.5 };
        const image = this.sprites[world.animalSprite(deer)], p = profile({ y: deer.y, h: 0 });
        g.save(); g.globalAlpha = .65;
        const h = Math.max(5, size.height * vertical); if (image) g.drawImage(image, p.x - h * image.width / image.height / 2, p.y - h, h * image.width / image.height, h);
        g.restore();
      }
      g.strokeStyle = palette.gold; g.lineWidth = 1.2; g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const p = profile(position(shot, shot.age * i / 48)); if (!i) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.stroke();
      const at = profile(position(shot, shot.age)); g.fillStyle = palette.cream;
      g.beginPath(); g.arc(at.x, at.y, 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b8b2a2'; g.font = type;
      g.fillText(Math.round(position(shot, shot.age).y / .9144) + ' yd', 8, height - 7);
      const drift = position(shot, shot.age).x - shot.origin.x - shot.dx * (shot.speed || T.muzzleSpeed) * shot.age;
      const driftText = Math.round(Math.abs(drift) * 39.3701) + ' in';
      g.textAlign = 'right'; g.fillText(compact ? driftText + (Math.abs(drift) > .02 ? (drift > 0 ? ' R' : ' L') : '') : 'drift ' + driftText, width - 8, height - 7); g.textAlign = 'start';
      g.restore();
    }
    scopeMask(g, world, aim, showReticle) {
      const cx = W / 2, cy = H / 2, radius = Math.min(H * .463, W * .42);
      g.fillStyle = 'rgba(14,23,18,.96)'; g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, radius, 0, Math.PI * 2, true); g.fill('evenodd');
      const lens = g.createRadialGradient(cx, cy, radius * .75, cx, cy, radius); lens.addColorStop(0, 'rgba(20,30,22,0)'); lens.addColorStop(1, 'rgba(20,30,22,.56)');
      g.fillStyle = lens; g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4a544b'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, radius + 2, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#a4a293'; g.lineWidth = .65; g.beginPath(); g.arc(cx, cy, radius - .5, 0, Math.PI * 2); g.stroke();
      if (showReticle) {
        const at = project(world.sight ? world.sight(aim) : world.aim(aim), this.camera);
        g.save(); g.beginPath(); g.arc(cx, cy, radius - 2, 0, Math.PI * 2); g.clip();
        g.strokeStyle = world.hunter.reload > 0 ? palette.warn : 'rgba(30,36,32,.86)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx - radius, at.y); g.lineTo(at.x - 5, at.y); g.moveTo(at.x + 5, at.y); g.lineTo(cx + radius, at.y);
        g.moveTo(at.x, cy - radius); g.lineTo(at.x, at.y - 5); g.moveTo(at.x, at.y + 5); g.lineTo(at.x, cy + radius); g.stroke();
        g.strokeStyle = 'rgba(232,226,214,.6)'; g.lineWidth = .55;
        for (let i = -3; i <= 3; i++) { if (!i) continue; g.beginPath(); g.moveTo(at.x + i * 14, at.y - 3); g.lineTo(at.x + i * 14, at.y + 3); g.moveTo(at.x - 3, at.y + i * 14); g.lineTo(at.x + 3, at.y + i * 14); g.stroke(); }
        g.fillStyle = palette.warn; g.beginPath(); g.arc(at.x, at.y, 1.2, 0, Math.PI * 2); g.fill(); g.restore();
      }
      g.fillStyle = palette.gold; g.font = '9px "Commit Mono", monospace'; g.textAlign = 'center'; g.fillText('6x', cx, H - 6); g.textAlign = 'start';
    }
  }
  window.HuntingView = { loadArt, View, project, unproject, geometry, scaleAt };
})();
