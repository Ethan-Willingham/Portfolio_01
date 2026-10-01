(function () {
  'use strict';
  const { TUNING: T, position, clamp } = HuntingPhysics;
  const palette = {
    shadow: '#303931', dirt: '#8b7659',
    wood: '#796044', rail: '#493c2c', woodLight: '#aa8b5c',
    cream: '#e8e2d6', gold: '#d4c4a0', warn: '#d99090', ink: '#1e2420'
  };
  async function loadArt() {
    const names = ['deer', 'hunter', 'clearing', 'boar', 'marsh', 'dog'];
    const pairs = await Promise.all(names.map(name => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve([name, img]);
      img.onerror = () => reject(new Error('Could not load ' + name + ' artwork.'));
      img.src = 'assets/hunting/' + name + (['deer', 'hunter', 'clearing'].includes(name) ? '-v2.png' : '-v3.png') + '?v=3';
    })));
    const sprites = Object.fromEntries(pairs);
    const masks = {};
    for (const name of ['deer', 'boar']) {
      const canvas = document.createElement('canvas');
      canvas.width = sprites[name].width; canvas.height = sprites[name].height;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(sprites[name], 0, 0);
      const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
      const alpha = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
      const species = HuntingCampaign.SPECIES[name];
      masks[name] = { width: canvas.width, height: canvas.height, alpha, vitalsX: species.vitalsX, vitalsY: species.vitalsY, radius: species.radius };
    }
    return { sprites, mask: masks.deer, masks };
  }
  const project = (point, camera) => ({
    x: T.width / 2 + (point.x - camera.x) * T.pixelsPerUnit * camera.zoom,
    y: T.height / 2 - (point.y - camera.y) * T.pixelsPerUnit * camera.zoom
  });
  const unproject = (point, camera) => ({
    x: camera.x + (point.x - T.width / 2) / (T.pixelsPerUnit * camera.zoom),
    y: camera.y + (T.height / 2 - point.y) / (T.pixelsPerUnit * camera.zoom)
  });
  class View {
    constructor(canvas, sprites) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.sprites = sprites;
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.effects = [];
      this.scene = document.createElement('canvas');
      this.scene.width = T.width; this.scene.height = T.height;
      this.background = document.createElement('canvas');
      this.background.width = T.width; this.background.height = T.height;
      this.makeBackground();
    }
    makeBackground(name = 'clearing') {
      this.backdropName = name;
      const g = this.background.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(this.sprites[name], 0, 0, T.width, T.height);
      const normal = { x: 0, y: 0, zoom: 1 };
      // A raised cedar deck, with planks, posts, fasteners, and a front lip.
      const deck = project({ x: 0, y: T.standY }, normal);
      const x = Math.round(deck.x), y = Math.round(deck.y);
      g.globalAlpha = .3; g.fillStyle = palette.shadow;
      g.beginPath(); g.ellipse(x + 8, y + 16, 47, 15, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = palette.rail; g.fillRect(x - 38, y - 14, 76, 37);
      g.fillStyle = palette.wood; g.fillRect(x - 36, y - 13, 72, 29);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? '#8d714c' : palette.wood;
        g.fillRect(x - 35, y - 12 + i * 5, 70, 4);
        g.fillStyle = palette.woodLight; g.fillRect(x - 34, y - 12 + i * 5, 68, 1);
        g.fillStyle = palette.rail;
        for (let j = 0; j < 3; j++) g.fillRect(x - 29 + j * 28, y - 10 + i * 5, 1, 1);
        g.globalAlpha = .35; g.fillRect(x - 17 + (i % 3) * 11, y - 10 + i * 5, 13, 1); g.globalAlpha = 1;
      }
      g.fillStyle = '#5c4935'; g.fillRect(x - 36, y + 17, 72, 5);
      g.fillStyle = palette.woodLight; g.fillRect(x - 36, y + 16, 72, 1);
      for (const offset of [-36, 32]) {
        g.fillStyle = palette.rail; g.fillRect(x + offset, y - 27, 5, 51);
        g.fillStyle = palette.woodLight; g.fillRect(x + offset + 1, y - 27, 2, 50);
        g.fillStyle = palette.wood; g.fillRect(x + offset - 1, y - 29, 7, 3);
      }
      g.fillStyle = palette.rail; g.fillRect(x - 34, y - 22, 68, 5);
      g.fillStyle = palette.woodLight; g.fillRect(x - 34, y - 22, 68, 1);
    }
    sprite(g, image, at, flip = false) {
      g.save(); g.translate(Math.round(at.x), Math.round(at.y));
      if (flip) g.scale(-1, 1);
      g.drawImage(image, -Math.floor(image.width / 2), -image.height);
      g.restore();
    }
    scope(active, aim) {
      this.camera = active ? { x: clamp(aim.x, -5, 5), y: clamp(aim.y, -2.8125, 2.8125), zoom: 2 } : { x: 0, y: 0, zoom: 1 };
    }
    addEffect(event) {
      if (!event.point || !['shot', 'miss', 'vitals', 'wound', 'recovered'].includes(event.type)) return;
      this.effects.push({ ...event, left: event.type === 'shot' ? .12 : .65 });
      if (this.effects.length > 40) this.effects.shift();
    }
    tick(dt) { this.effects = this.effects.filter(effect => { effect.left -= dt; return effect.left > 0; }); }
    draw(world, aim, guide, showReticle = true) {
      const g = this.scene.getContext('2d'), normal = { x: 0, y: 0, zoom: 1 };
      g.imageSmoothingEnabled = false;
      if (world.backdrop !== this.backdropName) this.makeBackground(world.backdrop);
      g.drawImage(this.background, 0, 0);
      g.fillStyle = '#884c3d';
      for (const drop of world.blood) {
        const at = project(drop, normal);
        g.fillRect(Math.round(at.x), Math.round(at.y), 2, 1);
      }
      const sorted = world.deer.slice().sort((a, b) => b.y - a.y);
      for (const deer of sorted) {
        const at = project(deer, normal), image = this.sprites[world.artName];
        g.save(); g.globalAlpha = .32; g.fillStyle = palette.shadow;
        g.beginPath(); g.ellipse(Math.round(at.x) + 4, Math.round(at.y) + 1, image.width * .4, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();
        if (deer.state === 'down') {
          g.save(); g.globalAlpha = Math.min(1, (12 - deer.downTime) / 2);
          g.translate(Math.round(at.x), Math.round(at.y)); g.rotate(deer.facingRight ? -Math.PI / 2 : Math.PI / 2);
          g.drawImage(image, -image.width / 2, -image.height / 2); g.restore();
        } else {
          this.sprite(g, image, at, !deer.facingRight);
          if (deer.wounded || deer.bleed > 0) {
            g.fillStyle = palette.warn; g.fillRect(Math.round(at.x) - 1, Math.round(at.y) - image.height - 4, 3, 2);
          }
        }
      }
      const man = project(world.hunter, normal);
      g.save(); g.globalAlpha = .25; g.fillStyle = palette.shadow;
      g.beginPath(); g.ellipse(man.x, man.y + 1, 11, 4, 0, 0, Math.PI * 2); g.fill(); g.restore();
      const bob = world.hunter.moving ? Math.round(Math.sin(world.hunter.stride) * 1.2) : 0;
      this.sprite(g, this.sprites.hunter, { x: man.x, y: man.y - bob }, !world.hunter.facingRight);
      if (world.options.dog) {
        const dog = project({ x: world.hunter.x - .9, y: world.hunter.y - .3 }, normal);
        this.sprite(g, this.sprites.dog, dog, !world.hunter.facingRight);
      }
      if (world.options.freeWalk && !world.hunter.mounted) {
        const stand = project({ x: 0, y: T.muzzleY }, normal);
        g.fillStyle = palette.ink; g.fillRect(stand.x - 32, stand.y - 88, 64, 15);
        g.fillStyle = palette.gold; g.font = '9px "Commit Mono", monospace'; g.fillText('STAND [E]', stand.x - 26, stand.y - 77);
      }
      const muzzle = project({ x: world.hunter.x, y: world.hunter.y + world.hunter.height }, normal);
      const target = project(aim, normal);
      const angle = Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
      g.strokeStyle = palette.ink; g.lineWidth = 3;
      g.beginPath(); g.moveTo(muzzle.x, muzzle.y); g.lineTo(muzzle.x + Math.cos(angle) * 22, muzzle.y + Math.sin(angle) * 22); g.stroke();
      g.strokeStyle = '#a4a293'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(muzzle.x + Math.cos(angle) * 8, muzzle.y + Math.sin(angle) * 8); g.lineTo(muzzle.x + Math.cos(angle) * 22, muzzle.y + Math.sin(angle) * 22); g.stroke();
      if (guide && showReticle) {
        const shot = HuntingPhysics.launch(world.hunter, world.aim(aim), world.wind * (world.options.windScale ?? 1));
        g.save(); g.strokeStyle = palette.gold; g.globalAlpha = .65; g.lineWidth = 1.2; g.setLineDash([3, 7]); g.beginPath();
        for (let i = 0; i <= 36; i++) {
          const at = position(shot, shot.duration * i / 36);
          const p = project({ x: at.x, y: at.y + at.h }, normal);
          if (!i) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        }
        g.stroke(); g.setLineDash([]);
        const landing = project(position(shot, shot.duration), normal);
        g.strokeRect(Math.round(landing.x) - 3, Math.round(landing.y) - 3, 6, 6);
        g.restore();
        for (const deer of world.deer) {
          if (deer.state === 'down' || deer.bleed > 0) continue;
          const vx = world.art.vitalsX ?? T.vitalsX, vy = world.art.vitalsY ?? T.vitalsY, radius = world.art.radius ?? T.vitalsRadius;
          const u = deer.facingRight ? vx : 1 - vx;
          const p = project({ x: deer.x + (u - .5) * world.art.width / T.pixelsPerUnit, y: deer.y + vy * world.art.height / T.pixelsPerUnit }, normal);
          g.strokeStyle = palette.gold; g.lineWidth = 1;
          g.beginPath(); g.ellipse(p.x, p.y, radius * world.art.width, radius * world.art.height, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      for (const shot of world.bullets) {
        g.strokeStyle = palette.gold; g.lineWidth = 1.5; g.beginPath();
        shot.trail.forEach((p, i) => { const at = project({ x: p.x, y: p.y + p.h }, normal); if (!i) g.moveTo(at.x, at.y); else g.lineTo(at.x, at.y); });
        g.stroke();
        const p = position(shot, shot.age), at = project({ x: p.x, y: p.y + p.h }, normal);
        const shadow = project(p, normal);
        g.fillStyle = palette.shadow; g.fillRect(Math.round(shadow.x) - 1, Math.round(shadow.y), 3, 1);
        g.fillStyle = palette.cream; g.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 3, 3);
      }
      for (const effect of this.effects) {
        const at = project(effect.point, normal);
        g.globalAlpha = Math.min(1, effect.left * 5);
        g.fillStyle = effect.type === 'miss' ? palette.dirt : effect.type === 'shot' ? palette.gold : palette.warn;
        g.fillRect(Math.round(at.x) - 2, Math.round(at.y) - 1, 4, 2);
        g.globalAlpha = 1;
      }
      if (Number.isFinite(world.minute)) {
        const hour = (world.minute % 1440) / 60;
        g.save(); g.fillStyle = palette.ink;
        g.globalAlpha = clamp(hour < 6 ? (6 - hour) * .15 : hour > 16 ? (hour - 16) * .07 : 0, 0, .55);
        g.fillRect(0, 0, T.width, T.height); g.restore();
      }
      const out = this.g, camera = this.camera, zoom = camera.zoom;
      const cx = T.width / 2 + camera.x * T.pixelsPerUnit, cy = T.height / 2 - camera.y * T.pixelsPerUnit;
      out.imageSmoothingEnabled = false;
      out.drawImage(this.scene, cx - T.width / (2 * zoom), cy - T.height / (2 * zoom), T.width / zoom, T.height / zoom, 0, 0, T.width, T.height);
      if (showReticle) {
        const at = project(world.aim(aim), camera);
        const x = Math.round(at.x), y = Math.round(at.y);
        out.strokeStyle = world.hunter.reload > 0 ? palette.warn : palette.cream;
        out.lineWidth = 1.5;
        out.beginPath();
        out.moveTo(x - 10, y + .5); out.lineTo(x - 4, y + .5);
        out.moveTo(x + 4, y + .5); out.lineTo(x + 10, y + .5);
        out.moveTo(x + .5, y - 10); out.lineTo(x + .5, y - 4);
        out.moveTo(x + .5, y + 4); out.lineTo(x + .5, y + 10); out.stroke();
        out.fillStyle = palette.gold; out.fillRect(x, y, 1, 1);
      }
      if (zoom > 1) {
        out.strokeStyle = palette.ink; out.lineWidth = 8; out.strokeRect(0, 0, T.width, T.height);
        out.fillStyle = palette.ink; out.fillRect(10, 10, 78, 19);
        out.fillStyle = palette.cream; out.font = '11px "Commit Mono", monospace'; out.fillText('SCOPE 2x', 16, 24);
      }
    }
  }
  window.HuntingView = { loadArt, View, project, unproject };
})();
