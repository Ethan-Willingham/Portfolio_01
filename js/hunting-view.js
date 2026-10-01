(function () {
  'use strict';
  const { TUNING: T, position, randomSource, clamp } = HuntingPhysics;
  const palette = {
    field: '#52603c', fieldAlt: '#4a5836', fieldLight: '#596641',
    forest: '#263226', shadow: '#3d4b31', dirt: '#5c4e36',
    wood: '#60482e', rail: '#42301e', woodLight: '#8a6c46',
    cream: '#e8e2d6', gold: '#d4c4a0', warn: '#d99090', ink: '#1e2420'
  };
  async function loadArt() {
    const names = ['deer', 'hunter', 'tree', 'bush', 'bush2', 'bush3', 'bush4', 'grass', 'grass2'];
    const pairs = await Promise.all(names.map(name => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve([name, img]);
      img.onerror = () => reject(new Error('Could not load ' + name + ' artwork.'));
      img.src = 'assets/hunting/' + name + '.png?v=1';
    })));
    const sprites = Object.fromEntries(pairs);
    const canvas = document.createElement('canvas');
    canvas.width = sprites.deer.width; canvas.height = sprites.deer.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(sprites.deer, 0, 0);
    const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    return { sprites, mask: { width: canvas.width, height: canvas.height, alpha } };
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
    makeBackground() {
      const g = this.background.getContext('2d'), random = randomSource(11);
      g.fillStyle = palette.field; g.fillRect(0, 0, T.width, T.height);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = i % 3 ? palette.fieldAlt : palette.fieldLight;
        g.globalAlpha = .3;
        g.fillRect(Math.floor(random() * T.width), Math.floor(random() * T.height), 1 + Math.floor(random() * 3), 1);
      }
      g.globalAlpha = 1;
      g.fillStyle = palette.forest; g.fillRect(0, 0, T.width, 23);
      g.fillStyle = palette.shadow; g.fillRect(0, 23, T.width, 7);
      const normal = { x: 0, y: 0, zoom: 1 };
      const trees = [], r = randomSource(5);
      for (let i = 0; i < 22; i++) trees.push({ x: -22 + i * 1.9 + r(), y: 2.15 + r() * .3, flip: r() > .5 });
      for (const tree of trees.sort((a, b) => b.y - a.y)) {
        const point = project(tree, normal);
        this.sprite(g, this.sprites.tree, point, tree.flip);
      }
      const grassRandom = randomSource(11);
      for (let i = 0; i < 50; i++) {
        const point = project({ x: (grassRandom() * 2 - 1) * T.fieldHalfWidth, y: T.standY + grassRandom() * (T.treelineY - T.standY) }, normal);
        this.sprite(g, i % 2 ? this.sprites.grass : this.sprites.grass2, point, grassRandom() > .5);
      }
      const bushes = [], b = randomSource(23);
      for (let i = 0; i < 7; i++) bushes.push({ x: (b() * 2 - 1) * 8.7, y: -2.8 + b() * 5.1, variant: 1 + Math.floor(b() * 4), flip: b() > .5 });
      for (const bush of bushes.sort((a, b) => b.y - a.y)) {
        this.sprite(g, this.sprites[bush.variant === 1 ? 'bush' : 'bush' + bush.variant], project(bush, normal), bush.flip);
      }
      // A small weathered deck, at the same stand position as the Unity prototype.
      const deck = project({ x: 0, y: T.standY }, normal);
      g.fillStyle = palette.shadow; g.fillRect(deck.x - 20, deck.y - 3, 40, 16);
      g.fillStyle = palette.wood; g.fillRect(deck.x - 16, deck.y - 6, 32, 12);
      g.fillStyle = palette.woodLight;
      for (let i = 0; i < 4; i++) g.fillRect(deck.x - 14, deck.y - 4 + i * 3, 28, 1);
      g.fillStyle = palette.rail;
      g.fillRect(deck.x - 17, deck.y - 8, 34, 3);
      g.fillRect(deck.x - 17, deck.y - 8, 2, 15);
      g.fillRect(deck.x + 15, deck.y - 8, 2, 15);
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
      g.drawImage(this.background, 0, 0);
      const sorted = world.deer.slice().sort((a, b) => b.y - a.y);
      for (const deer of sorted) {
        const at = project(deer, normal), image = this.sprites.deer;
        g.fillStyle = palette.shadow; g.fillRect(Math.round(at.x) - 8, Math.round(at.y) - 1, 16, 3);
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
      this.sprite(g, this.sprites.hunter, man);
      const muzzle = project({ x: world.hunter.x, y: world.hunter.y + T.standHeight }, normal);
      const target = project(aim, normal);
      const angle = Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
      g.strokeStyle = palette.ink; g.lineWidth = 2;
      g.beginPath(); g.moveTo(muzzle.x, muzzle.y); g.lineTo(muzzle.x + Math.cos(angle) * 10, muzzle.y + Math.sin(angle) * 10); g.stroke();
      if (guide && showReticle) {
        const shot = HuntingPhysics.launch(world.hunter, world.aim(aim), world.wind);
        g.save(); g.strokeStyle = palette.gold; g.globalAlpha = .6; g.lineWidth = .6; g.setLineDash([2, 4]); g.beginPath();
        for (let i = 0; i <= 36; i++) {
          const at = position(shot, shot.duration * i / 36);
          const p = project({ x: at.x, y: at.y + at.h }, normal);
          if (!i) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        }
        g.stroke(); g.setLineDash([]);
        const landing = project(position(shot, shot.duration), normal);
        g.strokeRect(Math.round(landing.x) - 2, Math.round(landing.y) - 2, 4, 4);
        g.restore();
        for (const deer of world.deer) {
          if (deer.state === 'down' || deer.bleed > 0) continue;
          const u = deer.facingRight ? T.vitalsX : 1 - T.vitalsX;
          const p = project({ x: deer.x + (u - .5) * world.art.width / 16, y: deer.y + T.vitalsY * world.art.height / 16 }, normal);
          g.strokeStyle = palette.gold; g.lineWidth = .6;
          g.beginPath(); g.ellipse(p.x, p.y, T.vitalsRadius * world.art.width, T.vitalsRadius * world.art.height, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      for (const shot of world.bullets) {
        g.strokeStyle = palette.gold; g.lineWidth = 1; g.beginPath();
        shot.trail.forEach((p, i) => { const at = project({ x: p.x, y: p.y + p.h }, normal); if (!i) g.moveTo(at.x, at.y); else g.lineTo(at.x, at.y); });
        g.stroke();
        const p = position(shot, shot.age), at = project({ x: p.x, y: p.y + p.h }, normal);
        const shadow = project(p, normal);
        g.fillStyle = palette.shadow; g.fillRect(Math.round(shadow.x) - 1, Math.round(shadow.y), 3, 1);
        g.fillStyle = palette.cream; g.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 2, 2);
      }
      for (const effect of this.effects) {
        const at = project(effect.point, normal);
        g.globalAlpha = Math.min(1, effect.left * 5);
        g.fillStyle = effect.type === 'miss' ? palette.dirt : effect.type === 'shot' ? palette.gold : palette.warn;
        g.fillRect(Math.round(at.x) - 2, Math.round(at.y) - 1, 4, 2);
        g.globalAlpha = 1;
      }
      const out = this.g, camera = this.camera, zoom = camera.zoom;
      const cx = T.width / 2 + camera.x * 16, cy = T.height / 2 - camera.y * 16;
      out.imageSmoothingEnabled = false;
      out.drawImage(this.scene, cx - T.width / (2 * zoom), cy - T.height / (2 * zoom), T.width / zoom, T.height / zoom, 0, 0, T.width, T.height);
      if (showReticle) {
        const at = project(world.aim(aim), camera);
        const x = Math.round(at.x), y = Math.round(at.y);
        out.strokeStyle = world.hunter.reload > 0 ? palette.warn : palette.cream;
        out.lineWidth = 1;
        out.beginPath();
        out.moveTo(x - 6, y + .5); out.lineTo(x - 2, y + .5);
        out.moveTo(x + 3, y + .5); out.lineTo(x + 7, y + .5);
        out.moveTo(x + .5, y - 6); out.lineTo(x + .5, y - 2);
        out.moveTo(x + .5, y + 3); out.lineTo(x + .5, y + 7); out.stroke();
        out.fillStyle = palette.gold; out.fillRect(x, y, 1, 1);
      }
      if (zoom > 1) {
        out.strokeStyle = palette.ink; out.lineWidth = 6; out.strokeRect(0, 0, T.width, T.height);
        out.fillStyle = palette.ink; out.fillRect(6, 6, 48, 11);
        out.fillStyle = palette.cream; out.font = '7px "Commit Mono", monospace'; out.fillText('SCOPE 2x', 10, 14);
      }
    }
  }
  window.HuntingView = { loadArt, View, project, unproject };
})();
