/* Four handmade miniature sets. Scenery never participates in the solver. */
(function (global) {
  'use strict';
  const CR = global.ChainReaction = global.ChainReaction || {};

  CR.makeDiorama = function ({ THREE: T, scene, definitions, rearFace, backZ, benchDepth, box, disk, materials: original }) {
    const authoredSetCount = 4;
    if (definitions.length > authoredSetCount) throw new Error('Chain Reaction stage ' + (authoredSetCount + 1) + ' needs a newly authored environment before the chain can be extended.');
    const materials = [], textures = [], geometries = [], geometryCache = new Map();
    const bench = new T.Group();
    bench.name = 'chain-reaction-diorama';
    bench.userData = { nonPhysical: true, kind: 'scenery', version: 1 };
    scene.add(bench);
    const safeFront = rearFace - .06;
    const wallFront = Math.min(backZ - .02, safeFront - .96);
    const benchFront = benchDepth / 2 - .03;
    const benchRear = wallFront - .12;
    const fullDepth = benchFront - benchRear;
    const themes = [];

    function rng(seed) {
      return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    }
    function texture(painter, size = 512, repeat = false) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      painter(c.getContext('2d'), size);
      const map = new T.CanvasTexture(c); map.encoding = T.sRGBEncoding;
      map.anisotropy = 4;
      if (repeat) map.wrapS = map.wrapT = T.RepeatWrapping;
      textures.push(map); return map;
    }
    function material(name, color, roughness = .6, metalness = 0, map) {
      const linearColor = new T.Color(color).convertSRGBToLinear();
      const m = new T.MeshStandardMaterial({ color: linearColor, roughness, metalness, ...(map ? { map } : {}) });
      m.name = name; materials.push(m); return m;
    }
    function wood(name, base, lines, seed) {
      function make(end) {
        const rand = rng(seed + (end ? 17 : 0));
        const map = texture((ctx, s) => {
          ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
          ctx.strokeStyle = lines;
          if (end) {
            for (let n = 4; n < 100; n++) {
              ctx.globalAlpha = n % 5 === 0 ? .28 : .08;
              ctx.lineWidth = n % 5 === 0 ? 1.8 : .55;
              ctx.beginPath(); ctx.ellipse(-s * .45, s * .41, n * 9, n * 5.6, .16, 0, Math.PI * 2); ctx.stroke();
            }
          } else {
            for (let n = 0; n < 240; n++) {
              const x = rand() * s;
              ctx.globalAlpha = .05 + rand() * .16; ctx.lineWidth = .4 + rand() * 1.25;
              ctx.beginPath();
              for (let y = 0; y <= s; y += 8) {
                const px = x + 2.2 * Math.sin(y / 80 + n * .37) + .8 * Math.sin(y / 31 + n);
                y ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
              }
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
          for (let n = 0; n < 1400; n++) {
            ctx.fillStyle = n % 2 ? 'rgba(242,219,174,.045)' : 'rgba(35,23,17,.045)';
            ctx.fillRect(rand() * s, rand() * s, .65, 3 + rand() * 6);
          }
        }, 512, true);
        return material(name + (end ? '-end-grain' : '-long-grain'), '#f5eee1', .56, 0, map);
      }
      return [make(false), make(true)];
    }
    function geometry(key, build) {
      if (!geometryCache.has(key)) { const g = build(); geometryCache.set(key, g); geometries.push(g); }
      return geometryCache.get(key);
    }
    function mesh(parent, g, m, x, y, z, name) {
      const o = new T.Mesh(g, m); o.position.set(x, y, z); o.name = name || m.name;
      o.castShadow = o.receiveShadow = true; parent.add(o); return o;
    }
    function cylinder(parent, radius, height, x, y, z, m, name, top = radius) {
      return mesh(parent, geometry(['cylinder', radius, top, height].join(':'), () => new T.CylinderGeometry(top, radius, height, 28)), m, x, y, z, name);
    }
    function torus(parent, radius, tube, x, y, z, m, name) {
      return mesh(parent, geometry(['torus', radius, tube].join(':'), () => new T.TorusGeometry(radius, tube, 8, 36)), m, x, y, z, name);
    }
    function rod(parent, from, to, radius, m, name) {
      const a = new T.Vector3(...from), b = new T.Vector3(...to), direction = b.clone().sub(a);
      const o = cylinder(parent, radius, direction.length(), ...a.clone().add(b).multiplyScalar(.5).toArray(), m, name);
      o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); return o;
    }
    function lathe(parent, name, points, x, y, z, m) {
      const g = geometry(name, () => new T.LatheGeometry(points.map(p => new T.Vector2(...p)), 32));
      return mesh(parent, g, m, x, y, z, name);
    }
    function stock(parent, w, h, d, x, y, z, pair, name) {
      const o = box(parent, w, h, d, x, y, z, pair, true); o.name = name; return o;
    }
    function painted(parent, w, h, d, x, y, z, m, name) {
      const o = box(parent, w, h, d, x, y, z, m); o.name = name; return o;
    }
    function instances(parent, g, m, positions, name, scales) {
      const o = new T.InstancedMesh(g, m, positions.length); const matrix = new T.Matrix4();
      positions.forEach((p, i) => { matrix.makeTranslation(...p); if (scales) matrix.scale(new T.Vector3(...scales[i])); o.setMatrixAt(i, matrix); });
      o.name = name; o.castShadow = o.receiveShadow = true; parent.add(o); return o;
    }
    const brass = original.brass, steel = material('blue-black steel', '#525b60', .32, .65);
    const cream = material('warm porcelain glaze', '#dfd2b4', .19);
    const copper = material('aged copper', '#a46744', .36, .65);
    const palePaper = material('cut paper edges', '#d8c9a5', .82);
    const toyBlue = material('worn blue enamel', '#598a9c', .35);
    const toyRose = material('worn vermilion enamel', '#a75646', .4);
    const toyGold = material('ochre toy paint', '#c6a04f', .44);
    const maple = wood('honey maple', '#b28b5c', '#5b381a', 61);
    const walnut = wood('walnut', '#503323', '#241b16', 79);
    const cherry = wood('cherry', '#793b2e', '#432620', 103);
    const oak = wood('smoked oak', '#554a3b', '#332e25', 137);

    function shelf(parent, x, y, width, pair, name) {
      const d = .76, z = safeFront - d / 2 - .12;
      stock(parent, width, .12, d, x, y - .06, z, pair, name + '-shelf');
      const seats = [x - width * .34, x + width * .34];
      const verts = [];
      for (const sx of seats) {
        verts.push(sx, y - .11, wallFront + .08, sx, y - .43, wallFront + .08);
        verts.push(sx, y - .43, wallFront + .08, sx, y - .11, safeFront - .22);
      }
      // One mesh for both cast metal angle brackets, with real thickness.
      const points = [];
      for (let i = 0; i < verts.length; i += 6) points.push([verts.slice(i, i + 3), verts.slice(i + 3, i + 6)]);
      const positions = [], normals = [], index = []; let count = 0;
      for (const [a, b] of points) {
        const ag = new T.Vector3(...a), bg = new T.Vector3(...b), v = bg.clone().sub(ag);
        const cg = new T.CylinderGeometry(.027, .027, v.length(), 8);
        cg.rotateZ(Math.atan2(-v.x, v.y));
        if (Math.abs(v.z) > .001) { const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize()); cg.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(q)); }
        cg.translate(...ag.add(bg).multiplyScalar(.5).toArray());
        const p = cg.attributes.position, n = cg.attributes.normal;
        positions.push(...p.array); normals.push(...n.array); index.push(...Array.from(cg.index.array, k => k + count)); count += p.count; cg.dispose();
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); g.setIndex(index); geometries.push(g);
      mesh(parent, g, steel, 0, 0, 0, name + '-cast-brackets');
      return { y, z: safeFront - .49 };
    }
    function spool(parent, x, y, z, radius, height, thread) {
      cylinder(parent, radius * .76, height * .72, x, y + height / 2, z, thread, 'wound-thread');
      const flanges = [[x, y + .045, z], [x, y + height - .045, z]];
      const flangeGeometry = geometry('spool-flange:' + radius, () => new T.CylinderGeometry(radius, radius, .09, 28));
      instances(parent, flangeGeometry, cream, flanges, 'turned-spool-flanges');
      cylinder(parent, .055, height + .045, x, y + height / 2, z, maple[1], 'spool-core');
    }
    function theme(index, id, title, pair, wallMaterial, description) {
      const group = new T.Group(); group.position.x = index * 16; group.name = 'set-' + id;
      group.userData = { nonPhysical: true, theme: id, xStart: index * 16, xEnd: (index + 1) * 16 };
      bench.add(group);
      stock(group, 16, .44, fullDepth, 8, -.22, (benchRear + benchFront) / 2, pair, id + '-worktop');
      painted(group, 16, 9, .14, 8, 4.5, wallFront - .07, wallMaterial, id + '-back-wall');
      themes.push({ id, title, xStart: index * 16, xEnd: (index + 1) * 16, wood: pair[0].name, wall: wallMaterial.name, description, nonPhysical: true });
      return group;
    }

    const pegMap = texture((ctx, s) => {
      const rand = rng(184); ctx.fillStyle = '#aa8f68'; ctx.fillRect(0, 0, s, s);
      for (let n = 0; n < 26000; n++) { ctx.fillStyle = n % 2 ? 'rgba(59,40,21,.045)' : 'rgba(226,212,180,.065)'; ctx.fillRect(rand() * s, rand() * s, .6, .6); }
      for (let y = 16; y < s; y += 32) for (let x = 16; x < s; x += 32) {
        ctx.fillStyle = '#79694f'; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#514c3a'; ctx.beginPath(); ctx.arc(x, y + .8, 2.65, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(224,203,159,.45)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, 4.1, 3.1, 6.2); ctx.stroke();
      }
    }, 512, true);
    pegMap.repeat.set(1.4, .8);
    const pegboard = material('drilled amber fiberboard', '#f1e8d1', .85, 0, pegMap);
    const workshop = theme(0, 'workshop', 'The pegboard workshop', maple, pegboard, 'Maple, drilled fiberboard, one fitted toolcase and two dark hand tools.');
    // A cabinet with inset drawers and cast cup pulls.
    stock(workshop, 3.6, 1.95, .57, 2.25, 6.25, wallFront + .355, walnut, 'tool-cabinet-case');
    for (let row = 0; row < 2; row++) {
      const y = 5.75 + row;
      stock(workshop, 3.29, .82, .07, 2.25, y, wallFront + .675, maple, 'fitted-tool-drawer');
      const pull = torus(workshop, .12, .027, 2.25, y, wallFront + .735, steel, 'cast-drawer-pull'); pull.scale.y = .55;
    }
    const squareShape = new T.Shape(); squareShape.moveTo(0, 0); squareShape.lineTo(1.55, 0); squareShape.lineTo(0, 1.55); squareShape.closePath();
    const squareHole = new T.Path(); squareHole.moveTo(.2, .2); squareHole.lineTo(.2, 1.03); squareHole.lineTo(1.03, .2); squareHole.closePath(); squareShape.holes.push(squareHole);
    mesh(workshop, geometry('carpenters-square', () => new T.ExtrudeGeometry(squareShape, { depth: .045, bevelEnabled: false })), brass, 6.0, 6.05, wallFront + .17, 'open-carpenters-square');
    rod(workshop, [8.1, 6.2, wallFront + .15], [8.1, 7.8, wallFront + .15], .055, walnut[0], 'hammer-handle');
    painted(workshop, .62, .23, .14, 8.1, 7.77, wallFront + .15, steel, 'hammer-head');
    const pegPositions = [[6.0, 7.66, wallFront + .135], [8.1, 7.95, wallFront + .135]];
    instances(workshop, geometry('wall-pegs', () => new T.SphereGeometry(.065, 12, 8)), brass, pegPositions, 'tool-hanging-pegs');

    const weave = texture((ctx, s) => {
      ctx.fillStyle = '#d3c7a9'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#647e88'; ctx.fillRect(80, 0, 32, s); ctx.fillRect(240, 0, 15, s); ctx.fillRect(392, 0, 32, s);
      for (let i = 0; i < s; i += 4) {
        ctx.strokeStyle = i % 8 ? 'rgba(77,67,52,.10)' : 'rgba(244,232,201,.24)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
      }
      ctx.strokeStyle = '#bdac89'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      for (const y of [9, s - 9]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    }, 512, true);
    weave.repeat.set(2.5, 1);
    const woven = material('cream and blue woven ticking', '#f2e9d7', .9, 0, weave);
    const linenWall = material('sewing alcove plaster', '#aaa994', .95);
    const sewing = theme(1, 'sewing-alcove', 'The sewing alcove', walnut, linenWall, 'Walnut, pinned woven ticking, copper scissors, one thread spool and three mismatched shell buttons.');
    painted(sewing, 13.6, 2.7, .10, 8, 6.65, wallFront + .08, woven, 'stretched-striped-linen');
    instances(sewing, geometry('linen-tacks', () => { const g = new T.CylinderGeometry(.042, .042, .025, 16); g.rotateX(Math.PI / 2); return g; }), brass, [[1.34, 5.43, wallFront + .145], [14.66, 5.43, wallFront + .145], [1.34, 7.87, wallFront + .145], [14.66, 7.87, wallFront + .145]], 'four-linen-tacks');
    const blueThread = material('indigo thread', '#657f9a', .88);
    const sewingShelf = shelf(sewing, 3.0, 5.68, 1.65, walnut, 'sewing-notions');
    spool(sewing, 3.0, sewingShelf.y, sewingShelf.z, .27, 1.0, blueThread);
    const card = painted(sewing, 2.0, 2.2, .06, 12.2, 6.76, wallFront + .21, palePaper, 'button-display-card');
    const buttonMap = texture((ctx, s) => {
      ctx.fillStyle = '#e5d6b7'; ctx.fillRect(0, 0, s, s);
      const grad = ctx.createRadialGradient(s * .32, s * .27, 10, s * .5, s * .5, s * .57);
      grad.addColorStop(0, '#efddc4'); grad.addColorStop(.6, '#c5c6b5'); grad.addColorStop(1, '#a99380'); ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
      for (const [x, y] of [[.40, .40], [.60, .40], [.40, .60], [.60, .60]]) { ctx.fillStyle = '#625e51'; ctx.beginPath(); ctx.arc(s * x, s * y, s * .043, 0, 7); ctx.fill(); }
    }, 256);
    const pearl = material('iridescent button shell', '#f3ebd9', .22, .08, buttonMap);
    const buttonGeometry = geometry('shell-button', () => { const g = new T.CylinderGeometry(.18, .18, .045, 28); g.rotateX(Math.PI / 2); return g; });
    instances(sewing, buttonGeometry, pearl, [[11.72, 7.29, wallFront + .27], [12.57, 6.82, wallFront + .27], [11.88, 6.12, wallFront + .27]], 'three-mismatched-shell-buttons', [[.78, .78, 1], [1.16, 1.16, 1], [.94, .94, 1]]);
    const cardPin = disk(sewing, .043, .035, card.position.x, 7.78, wallFront + .30, brass); cardPin.name = 'button-card-pin';
    // Scissors are hanging from a peg, with two full rings and overlapping blades.
    const bladeShape = new T.Shape(); bladeShape.moveTo(-.07, .74); bladeShape.lineTo(.06, .74); bladeShape.lineTo(.022, -.59); bladeShape.lineTo(-.012, -.74); bladeShape.closePath();
    const bladeGeometry = geometry('scissor-blade-profile', () => new T.ExtrudeGeometry(bladeShape, { depth: .035, bevelEnabled: true, bevelSize: .004, bevelThickness: .003, bevelSegments: 1 }));
    for (const [x, angle] of [[8.76, -.17], [9.23, .17]]) {
      torus(sewing, .19, .039, x, 7.51, wallFront + .20, copper, 'scissor-finger-ring');
      const blade = mesh(sewing, bladeGeometry, steel, x + (angle > 0 ? -.21 : .21), 6.65, wallFront + .175, 'tapered-scissor-blade'); blade.rotation.z = angle;
    }
    disk(sewing, .07, .05, 9.0, 7.09, wallFront + .225, copper).name = 'scissor-pivot';
    disk(sewing, .045, .12, 9.0, 7.70, wallFront + .155, brass).name = 'scissor-wall-peg';

    const plumMap = texture((ctx, s) => {
      ctx.fillStyle = '#604350'; ctx.fillRect(0, 0, s, s); const rand = rng(217);
      for (let n = 0; n < 32000; n++) { ctx.strokeStyle = n % 2 ? 'rgba(223,174,180,.09)' : 'rgba(28,19,29,.12)'; const x = rand() * s, y = rand() * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + .4, y + 2.5); ctx.stroke(); }
    }, 512, true);
    const plush = material('plum velvet', '#e9d8d6', .96, 0, plumMap);
    const theatreWall = material('theatre aubergine paint', '#564a51', .82);
    const theatre = theme(2, 'toy-theatre', 'The toy theatre', cherry, theatreWall, 'Cherry, pleated plum velvet, a gilt proscenium and one miniature train.');
    function curtain(x, width, height, y, name) {
      const shape = new T.Shape(), folds = 32, zCenter = wallFront + .35;
      for (let n = 0; n <= folds; n++) {
        const u = n / folds, px = -width / 2 + u * width, pz = .105 * Math.cos(u * Math.PI * 12);
        n ? shape.lineTo(px, pz) : shape.moveTo(px, pz);
      }
      for (let n = folds; n >= 0; n--) { const u = n / folds; shape.lineTo(-width / 2 + u * width, .105 * Math.cos(u * Math.PI * 12) - .04); }
      shape.closePath();
      const g = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }); g.rotateX(Math.PI / 2); geometries.push(g);
      mesh(theatre, g, plush, x, y + height, zCenter, name);
    }
    curtain(1.62, 2.85, 3.6, 5.06, 'left-gathered-velvet');
    curtain(14.38, 2.85, 3.6, 5.06, 'right-gathered-velvet');
    rod(theatre, [.13, 8.69, wallFront + .40], [15.87, 8.69, wallFront + .40], .065, brass, 'curtain-rail');
    painted(theatre, 9.2, 2.90, .10, 8, 6.79, wallFront + .06, toyBlue, 'painted-theatre-back');
    const arch = new T.Shape(); arch.moveTo(-4.7, 0); arch.lineTo(4.7, 0); arch.lineTo(4.7, 3.2); arch.lineTo(-4.7, 3.2); arch.closePath();
    const opening = new T.Path(); opening.moveTo(-4.28, .12); opening.lineTo(-4.28, 1.93); opening.quadraticCurveTo(0, 3.68, 4.28, 1.93); opening.lineTo(4.28, .12); opening.closePath(); arch.holes.push(opening);
    mesh(theatre, geometry('toy-theatre-proscenium', () => new T.ExtrudeGeometry(arch, { depth: .14, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2 })), toyGold, 8, 5.23, wallFront + .16, 'arched-gilt-proscenium');
    const toyShelf = shelf(theatre, 6.7, 5.30, 6.2, cherry, 'miniature-stage');
    // A small train, including metal axles and four turned wheels.
    painted(theatre, 1.43, .22, .52, 6.7, toyShelf.y + .29, toyShelf.z, toyRose, 'toy-train-chassis');
    cylinder(theatre, .25, .70, 6.48, toyShelf.y + .65, toyShelf.z, toyBlue, 'toy-engine-boiler').rotation.z = Math.PI / 2;
    painted(theatre, .43, .70, .51, 7.15, toyShelf.y + .70, toyShelf.z, toyRose, 'engine-cab');
    cylinder(theatre, .08, .20, 6.28, toyShelf.y + .98, toyShelf.z, brass, 'engine-chimney');
    const wheelG = geometry('toy-train-wheels', () => { const g = new T.CylinderGeometry(.15, .15, .065, 28); g.rotateX(Math.PI / 2); return g; });
    instances(theatre, wheelG, brass, [[6.2, toyShelf.y + .17, toyShelf.z + .29], [7.18, toyShelf.y + .17, toyShelf.z + .29], [6.2, toyShelf.y + .17, toyShelf.z - .29], [7.18, toyShelf.y + .17, toyShelf.z - .29]], 'four-brass-train-wheels');

    const slate = material('slate blue cabinet backing', '#536c76', .87);
    const cabinet = theme(3, 'curiosity-cabinet', 'The curiosity cabinet', oak, slate, 'Smoked oak and slate blue, with a globe and porcelain urn at the ends of an open display case.');
    stock(cabinet, .19, 3.3, .83, 3.0, 6.48, safeFront - .555, oak, 'cabinet-left-stile');
    stock(cabinet, .19, 3.3, .83, 14.9, 6.48, safeFront - .555, oak, 'cabinet-right-stile');
    stock(cabinet, 12.1, .18, .86, 8.95, 8.12, safeFront - .555, oak, 'cabinet-cornice');
    const lower = shelf(cabinet, 8.95, 4.91, 12.1, oak, 'cabinet-lower');
    lathe(cabinet, 'porcelain-urn', [[0, 0], [.20, 0], [.23, .05], [.12, .16], [.27, .35], [.35, .60], [.28, .86], [.16, .97], [.16, 1.06], [.20, 1.09], [.20, 1.13], [.13, 1.13], [.13, 1.07]], 12.14, lower.y, lower.z, cream);
    torus(cabinet, .28, .03, 13.36, lower.y + .53, lower.z + .03, brass, 'reading-magnifier-rim');
    rod(cabinet, [13.16, lower.y + .34, lower.z + .03], [12.82, lower.y + .02, lower.z + .03], .043, oak[0], 'magnifier-handle');
    painted(cabinet, 1.06, .11, .60, 13.31, lower.y + .055, lower.z, toyRose, 'magnifier-book-support');
    const globeMap = texture((ctx, s) => {
      ctx.fillStyle = '#62899a'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#b6ae78';
      for (const [x, y, w, h] of [[90, 90, 90, 110], [142, 216, 58, 140], [280, 82, 140, 99], [330, 177, 62, 129], [418, 330, 67, 43]]) {
        ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, .3, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(231,211,160,.40)'; ctx.lineWidth = 1;
      for (let i = 0; i <= s; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke(); }
    }, 512);
    const globeSurface = material('painted miniature globe', '#e3d8ba', .4, 0, globeMap);
    mesh(cabinet, geometry('globe-ball', () => new T.SphereGeometry(.43, 32, 20)), globeSurface, 4.98, lower.y + .69, lower.z, 'hand-painted-miniature-globe');
    torus(cabinet, .48, .025, 4.98, lower.y + .69, lower.z, brass, 'globe-meridian').rotation.z = -.25;
    cylinder(cabinet, .25, .095, 4.98, lower.y + .05, lower.z, brass, 'globe-base');
    rod(cabinet, [4.98, lower.y + .08, lower.z], [4.98, lower.y + .25, lower.z], .035, brass, 'globe-stem');

    // The moving chain is framed close to the bench. Put the collections in
    // that same view rather than relegating the scenery to the upper wall.
    for (const [group, down] of [[workshop, 1.6], [sewing, 1.4], [theatre, 1.6], [cabinet, 1.6]]) {
      for (const child of group.children) {
        if (!child.name.endsWith('-worktop') && !child.name.endsWith('-back-wall') && !child.name.endsWith('-wall-cap') && !child.name.endsWith('-rear-skirting')) child.position.y -= down;
      }
    }

    if (definitions.length < 4) {
      const extras = bench.children.filter(o => o.userData.xStart >= definitions.length * 16);
      extras.forEach(o => bench.remove(o)); themes.length = definitions.length;
    }
    bench.userData.safeFront = safeFront;
    bench.userData.wallFront = wallFront;
    bench.userData.themeCount = themes.length;
    const authoredMeshes = [], batchMeshes = [];
    const api = { bench, themes, materials, textures, geometries, batchStats: null, batch, setBatchEnabled };

    function setBatchEnabled(enabled) {
      if (!api.batchStats) {
        if (enabled) batch();
        else return null;
      }
      authoredMeshes.forEach(({ mesh: o, visible }) => { o.visible = enabled ? false : visible; });
      batchMeshes.forEach(o => { o.visible = !!enabled; });
      api.batchStats.enabled = !!enabled;
      return api.batchStats;
    }
    function batch() {
      if (api.batchStats) return api.batchStats;
      const perTheme = [], buckets = new Map();
      const inverseBench = new T.Matrix4().copy(bench.matrixWorld).invert();
      for (const group of bench.children) {
        const sources = [];
        group.traverse(o => { if (o.isMesh) sources.push(o); });
        const contributingBuckets = new Set();
        let sourceTriangles = 0;
        for (const source of sources) {
          authoredMeshes.push({ mesh: source, visible: source.visible });
          source.userData.authoredScenery = true;
          if (!source.visible) continue;
          const g = source.geometry, p = g.attributes.position;
          if (!g.attributes.normal) g.computeVertexNormals();
          const n = g.attributes.normal, uv = g.attributes.uv;
          const available = g.index ? g.index.count : p.count;
          const start = Math.max(0, g.drawRange.start || 0);
          const end = Math.min(available, start + g.drawRange.count);
          const ranges = Array.isArray(source.material) ? g.groups : [{ start: 0, count: available, materialIndex: 0 }];
          const instances = source.isInstancedMesh ? source.count : 1;
          for (let instance = 0; instance < instances; instance++) {
            const transform = new T.Matrix4().multiplyMatrices(inverseBench, source.matrixWorld);
            if (source.isInstancedMesh) { const instanceTransform = new T.Matrix4(); source.getMatrixAt(instance, instanceTransform); transform.multiply(instanceTransform); }
            const normalTransform = new T.Matrix3().getNormalMatrix(transform);
            const position = new T.Vector3(), normal = new T.Vector3();
            for (const range of ranges) {
              const m = Array.isArray(source.material) ? source.material[range.materialIndex] : source.material;
              if (!m || !m.visible) continue;
              const from = Math.max(start, range.start), to = Math.min(end, range.start + range.count);
              if (to <= from) continue;
              const worktop = source.name.endsWith('-worktop');
              const bucketKey = m.uuid + (worktop ? ':worktop' : ':decor');
              contributingBuckets.add(bucketKey);
              let bucket = buckets.get(bucketKey);
              if (!bucket) { bucket = { material: m, worktop, positions: [], normals: [], uv: [], sourceSpans: [] }; buckets.set(bucketKey, bucket); }
              const span = { name: source.name, sourceUuid: source.uuid, theme: group.userData.theme, xStart: group.userData.xStart, instance: source.isInstancedMesh ? instance : -1, materialIndex: range.materialIndex, sourceStart: from, start: bucket.positions.length / 3, count: to - from, worktop };
              bucket.sourceSpans.push(span);
              for (let index = from; index < to; index++) {
                const vertex = g.index ? g.index.getX(index) : index;
                position.fromBufferAttribute(p, vertex).applyMatrix4(transform);
                normal.fromBufferAttribute(n, vertex).applyMatrix3(normalTransform).normalize();
                bucket.positions.push(position.x, position.y, position.z);
                bucket.normals.push(normal.x, normal.y, normal.z);
                bucket.uv.push(uv ? uv.getX(vertex) : 0, uv ? uv.getY(vertex) : 0);
              }
              sourceTriangles += (to - from) / 3;
            }
          }
        }
        perTheme.push({ theme: group.userData.theme, authoredDrawables: sources.length, contributingMaterialBuckets: contributingBuckets.size, sourceTriangles });
      }
      const batchRoot = new T.Group(); batchRoot.name = 'static-scenery-batches'; batchRoot.userData = { nonPhysical: true, batchedSceneryRoot: true }; bench.add(batchRoot);
      for (const bucket of buckets.values()) {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(bucket.positions, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(bucket.normals, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(bucket.uv, 2));
        g.addGroup(0, bucket.positions.length / 3, 0);
        g.computeBoundingBox(); g.computeBoundingSphere(); geometries.push(g);
        const o = mesh(batchRoot, g, bucket.material, 0, 0, 0, 'batch-' + (bucket.worktop ? 'worktop-' : 'decor-') + (bucket.material.name || 'material'));
        o.userData = { nonPhysical: true, batchedScenery: true, worktop: bucket.worktop, sourceSpans: bucket.sourceSpans };
        batchMeshes.push(o);
      }
      api.batchStats = { authoredDrawables: authoredMeshes.length, renderMeshes: batchMeshes.length, drawGroups: batchMeshes.length, scope: 'bench', worktopBucketsSeparated: true, triangles: perTheme.reduce((sum, t) => sum + t.sourceTriangles, 0), perTheme, enabled: true };
      bench.userData.batching = api.batchStats;
      setBatchEnabled(true);
      return api.batchStats;
    }
    return api;
  };
})(window);
