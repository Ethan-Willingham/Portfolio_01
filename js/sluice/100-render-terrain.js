  /* ---- Render ---- */

  // ====== RENDER: Terrain materials + tile-drawing helpers ======

  function tileHash01(r, c, salt) {
    var n = (Math.imul(r + 101, 73856093) ^ Math.imul(c + 307, 19349663) ^ salt) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 3266489909) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  // Shared procedural palettes for the cohesive terrain renderer.
  var TILE_MATERIALS = {
    dirt: {
      default:   { top: '#8b5735', mid: '#60391f', bot: '#2f1d12', warm: '#b77a4a', cool: '#2b1a11', grit: '#1b100a' },
      topsoil:   { top: '#94613c', mid: '#6c4126', bot: '#352116', warm: '#bd8151', cool: '#2a190f', grit: '#1b1009', roots: true },
      bedrock:   { top: '#715a45', mid: '#4e3b2e', bot: '#2b211a', warm: '#96704e', cool: '#211915', grit: '#17110e' },
      fossil:    { top: '#775134', mid: '#553723', bot: '#2c1f17', warm: '#a06c3f', cool: '#24160f', grit: '#160d08', fossil: true },
      deepcrust: { top: '#5d4436', mid: '#3f2d25', bot: '#1f1713', warm: '#7c5740', cool: '#17110f', grit: '#120c0a' },
      crystal:   { top: '#4d3b4f', mid: '#30263a', bot: '#171322', warm: '#6b5574', cool: '#120f1b', grit: '#100c16' },
      // Frozen tundra earth: a cold, neutral taupe with pale-rime highlights
      // and a blue-black shadow, so it reads as frost-locked ground next to
      // the ice stone. Rendered through the same seamless world-coord wash as
      // topsoil (no per-tile overlay), so it tiles identically.
      permafrost:{ top: '#8b968d', mid: '#5f6058', bot: '#2e2f2a', warm: '#cbe4ee', cool: '#20282a', grit: '#15191a' }
    },
    stone: {
      default:   { top: '#8b8b84', mid: '#646660', bot: '#363936', hi: '#c7c8bd', lo: '#202321', speck: '#d7d6c8' },
      topsoil:   { top: '#8a8070', mid: '#625a50', bot: '#342d27', hi: '#c4bca8', lo: '#211c18', speck: '#d0c6b0' },
      bedrock:   { top: '#898982', mid: '#62645f', bot: '#343836', hi: '#c2c3bb', lo: '#1f2321', speck: '#d4d4c8' },
      fossil:    { top: '#796c5c', mid: '#584f45', bot: '#302a25', hi: '#b9aa92', lo: '#211b17', speck: '#c8b99f' },
      deepcrust: { top: '#66655f', mid: '#484a46', bot: '#252824', hi: '#a8a79a', lo: '#171a17', speck: '#b8b7aa' },
      crystal:   { top: '#666579', mid: '#404258', bot: '#202134', hi: '#aeb1d0', lo: '#141522', speck: '#c7caff' },
      // Glacier ice: pale blue-white mass. The seamless stone renderer's
      // faceted chips + unified rounded silhouette + edge bevel read as ice
      // crystal facets and glacier edges, so the "locked in ice" look comes
      // from the palette + existing machinery, not a per-tile ice block.
      permafrost:{ top: '#c6deee', mid: '#a6c9de', bot: '#6f97b3', hi: '#e9f5fc', lo: '#5f89a7', speck: '#f2fbff' }
    },
    // Mineral palettes use the bible's 4-axis vocabulary
    // (base / highlight / shadow / accent), not dirt/stone's 6-stop tone ramp.
    coal: {
      default: { base: '#1a1c22', highlight: '#3d3a48', shadow: '#070608', accent: '#b8c4d0' }
    },
    copper: {
      default: { base: '#9d5128', highlight: '#e29754', shadow: '#3b1a10', accent: '#72a778' }
    },
    bauxite: {
      default: { base: '#a04724', highlight: '#df7b3d', shadow: '#35150d', accent: '#e5bd7e' }
    },
    iron: {
      default: { base: '#55595c', highlight: '#b6b7b0', shadow: '#202326', accent: '#a8502b' }
    },
    pyrite: {
      default: { base: '#b89638', highlight: '#e6c659', shadow: '#544017', accent: '#fff2c0' }
    }
  };

  function materialPalette(kind, layerName) {
    var material = TILE_MATERIALS[kind];
    return material[layerName] || material.default;
  }

  function materialLayer(rowLayer) {
    return rowLayer ? rowLayer.name : 'topsoil';
  }

  function isSameMaterialTile(r, c, kind) {
    var t = getTileObj(r, c);
    return !!(t && t.type === kind);
  }

  function terrainKindAt(r, c) {
    var t = getTileObj(r, c);
    return t && (t.type === 'dirt' || t.type === 'stone') ? t.type : null;
  }

  // v23.35 — neighbour descriptors reused across chunk-build calls.
  // materialNeighbors / openBlockNeighbors each ran once per terrain tile
  // during a chunk rebuild and allocated a fresh ~24-field object every
  // time. A warmup or teleport frame rebuilds up to 80 chunks (~5k tiles),
  // so that was thousands of short-lived objects in one frame — a GC hitch
  // right as the world first paints. Each function now fills and returns a
  // shared module-level scratch. Safe because every call site consumes the
  // result transiently within its own function: no caller stores it, no two
  // live results of the SAME function ever coexist, and neither function is
  // re-entered by its consumers (oreUnderlayKind only reads the fields,
  // oreDepositPath ignores its n param). Pixel-identical: same fields, same
  // values, same draw output.
  var _matNeighbors = {
    selfKind: null, up: false, down: false, left: false, right: false,
    upKind: null, downKind: null, leftKind: null, rightKind: null,
    terrainUp: false, terrainDown: false, terrainLeft: false, terrainRight: false,
    openUp: false, openDown: false, openLeft: false, openRight: false,
    openUpLeft: false, openUpRight: false, openDownLeft: false, openDownRight: false
  };
  var _openBlockNeighbors = {
    selfKind: null, up: false, down: false, left: false, right: false,
    upKind: null, downKind: null, leftKind: null, rightKind: null,
    terrainUp: false, terrainDown: false, terrainLeft: false, terrainRight: false,
    openUp: false, openDown: false, openLeft: false, openRight: false,
    openUpLeft: false, openUpRight: false, openDownLeft: false, openDownRight: false
  };
  function _openBlockKindOf(t) {
    return t && t !== 'wall' ? t.type : null;
  }

  function materialNeighbors(r, c, kind) {
    var upKind = terrainKindAt(r - 1, c);
    var downKind = terrainKindAt(r + 1, c);
    var leftKind = terrainKindAt(r, c - 1);
    var rightKind = terrainKindAt(r, c + 1);
    var n = _matNeighbors;
    n.selfKind = kind;
    n.up = isSameMaterialTile(r - 1, c, kind);
    n.down = isSameMaterialTile(r + 1, c, kind);
    n.left = isSameMaterialTile(r, c - 1, kind);
    n.right = isSameMaterialTile(r, c + 1, kind);
    n.upKind = upKind;
    n.downKind = downKind;
    n.leftKind = leftKind;
    n.rightKind = rightKind;
    n.terrainUp = !!upKind;
    n.terrainDown = !!downKind;
    n.terrainLeft = !!leftKind;
    n.terrainRight = !!rightKind;
    n.openUp = tileAt(r - 1, c) === null;
    n.openDown = tileAt(r + 1, c) === null;
    n.openLeft = tileAt(r, c - 1) === null;
    n.openRight = tileAt(r, c + 1) === null;
    n.openUpLeft = tileAt(r - 1, c - 1) === null;
    n.openUpRight = tileAt(r - 1, c + 1) === null;
    n.openDownLeft = tileAt(r + 1, c - 1) === null;
    n.openDownRight = tileAt(r + 1, c + 1) === null;
    return n;
  }

  function openBlockNeighbors(r, c, selfKind) {
    var up = tileAt(r - 1, c);
    var down = tileAt(r + 1, c);
    var left = tileAt(r, c - 1);
    var right = tileAt(r, c + 1);
    var n = _openBlockNeighbors;
    n.selfKind = selfKind;
    n.up = false;
    n.down = false;
    n.left = false;
    n.right = false;
    n.upKind = _openBlockKindOf(up);
    n.downKind = _openBlockKindOf(down);
    n.leftKind = _openBlockKindOf(left);
    n.rightKind = _openBlockKindOf(right);
    n.terrainUp = !!(up && up !== 'wall');
    n.terrainDown = !!(down && down !== 'wall');
    n.terrainLeft = !!(left && left !== 'wall');
    n.terrainRight = !!(right && right !== 'wall');
    n.openUp = up === null;
    n.openDown = down === null;
    n.openLeft = left === null;
    n.openRight = right === null;
    n.openUpLeft = tileAt(r - 1, c - 1) === null;
    n.openUpRight = tileAt(r - 1, c + 1) === null;
    n.openDownLeft = tileAt(r + 1, c - 1) === null;
    n.openDownRight = tileAt(r + 1, c + 1) === null;
    return n;
  }

  function materialBleed(n, side, amount) {
    if (!n) return 0;
    if (n[side]) return amount;
    var cap = side.charAt(0).toUpperCase() + side.slice(1);
    if (n.selfKind === 'stone' && n[side + 'Kind'] === 'dirt') return 0;
    return n['terrain' + cap] ? amount * 0.45 : 0;
  }

  function clipMaterialTile(tx, ty, n, bleed) {
    var b = bleed == null ? 0.9 : bleed;
    var l = materialBleed(n, 'left', b);
    var rr = materialBleed(n, 'right', b);
    var u = materialBleed(n, 'up', b);
    var d = materialBleed(n, 'down', b);
    ctx.beginPath();
    ctx.rect(tx - l, ty - u, TILE + l + rr, TILE + u + d);
    ctx.clip();
  }

  function exposedMaterialShape(kind, tx, ty, n) {
    var b = 0.9;
    var sideInset = kind === 'dirt' ? 3.7 : (kind === 'stone' ? 3.2 : 4.8);
    var diffInset = kind === 'ore' ? 4.6 : 1.25;
    function diff(side) {
      if (kind === 'stone' && n[side + 'Kind'] === 'dirt') return true;
      return kind === 'ore' && n[side + 'Kind'] && n[side + 'Kind'] !== n.selfKind;
    }
    function soft(side) {
      var cap = side.charAt(0).toUpperCase() + side.slice(1);
      if (n['open' + cap]) return true;
      return diff(side);
    }
    function sidePos(side, openValue, diffValue, normalValue) {
      if (openValue) return sideInset;
      if (diff(side)) return diffInset;
      return normalValue;
    }
    var softLeft = soft('left');
    var softRight = soft('right');
    var softUp = soft('up');
    var softDown = soft('down');
    var diffLeft = diff('left');
    var diffRight = diff('right');
    var diffUp = diff('up');
    var diffDown = diff('down');
    var left = tx + sidePos('left', n.openLeft, diffLeft, -materialBleed(n, 'left', b));
    var right = tx + TILE - sidePos('right', n.openRight, diffRight, -materialBleed(n, 'right', b));
    var top = ty + sidePos('up', n.openUp, diffUp, -materialBleed(n, 'up', b));
    var bottom = ty + TILE - sidePos('down', n.openDown, diffDown, -materialBleed(n, 'down', b));

    function radius(openA, openB, diffA, diffB, diag, sideA, sideB) {
      if (openA && openB) return 13.5;
      if (diag && sideA && sideB) return 13;
      if (openA || openB) return 7;
      if (kind === 'ore' && diffA && diffB) return 10;
      if (kind === 'ore' && (diffA || diffB)) return 6.5;
      if (diffA && diffB) return 5.5;
      if (diffA || diffB) return 3.5;
      return 0;
    }

    var tl = radius(n.openUp, n.openLeft, diffUp, diffLeft, n.openUpLeft, n.terrainUp, n.terrainLeft);
    var tr = radius(n.openUp, n.openRight, diffUp, diffRight, n.openUpRight, n.terrainUp, n.terrainRight);
    var br = radius(n.openDown, n.openRight, diffDown, diffRight, n.openDownRight, n.terrainDown, n.terrainRight);
    var bl = radius(n.openDown, n.openLeft, diffDown, diffLeft, n.openDownLeft, n.terrainDown, n.terrainLeft);

    ctx.beginPath();
    ctx.moveTo(left + tl, top);
    ctx.lineTo(right - tr, top);
    if (tr) ctx.quadraticCurveTo(right, top, right, top + tr);
    else ctx.lineTo(right, top);
    ctx.lineTo(right, bottom - br);
    if (br) ctx.quadraticCurveTo(right, bottom, right - br, bottom);
    else ctx.lineTo(right, bottom);
    ctx.lineTo(left + bl, bottom);
    if (bl) ctx.quadraticCurveTo(left, bottom, left, bottom - bl);
    else ctx.lineTo(left, bottom);
    ctx.lineTo(left, top + tl);
    if (tl) ctx.quadraticCurveTo(left, top, left + tl, top);
    else ctx.lineTo(left, top);
    ctx.closePath();
  }

  function clipExposedMaterial(kind, tx, ty, n) {
    exposedMaterialShape(kind, tx, ty, n);
    ctx.clip();
  }

  // Reusable "all stone" neighbor descriptor used when painting the stone
  // region inside a marching-squares contour. With every side reading as
  // stone, the per-tile clip becomes a plain tile rect (no edge insets) so
  // adjacent tiles tile together seamlessly inside the contour clip.
  var STONE_INTERIOR_NEIGHBORS = {
    selfKind: 'stone',
    up: true, down: true, left: true, right: true,
    upKind: 'stone', downKind: 'stone', leftKind: 'stone', rightKind: 'stone',
    terrainUp: true, terrainDown: true, terrainLeft: true, terrainRight: true,
    openUp: false, openDown: false, openLeft: false, openRight: false,
    openUpLeft: false, openUpRight: false, openDownLeft: false, openDownRight: false
  };

  // Build a Path2D representing the stone region within the given tile range,
  // using marching squares on tile centers. Each "cell" sits between four
  // adjacent tile centers and contributes a polygon for the stone-covered
  // portion of that cell. Cells with all corners stone produce a full square;
  // cells with no stone produce nothing; partial cells produce triangles,
  // trapezoids, or pentagons cut along the stone-air boundary.
  //
  // The result: stone boundaries follow 45° diagonals through cells instead
  // of axis-aligned tile edges. This is then smoothed with one Chaikin pass
  // for soft, organic curves.

  function isStoneMassTile(r, c) {
    var t = getTileObj(r, c);
    if (!t) return false;
    if (t.type === 'stone') return true;
    if (!ORES[t.type] ||
        t.type === 'dirt' ||
        t.type === 'foundation' ||
        t.type === 'barrier' ||
        t.type === 'bedrock') {
      return false;
    }
    return oreUnderlayKind(openBlockNeighbors(r, c, t.type)) === 'stone';
  }

  function isClearedStoneTile(r, c) {
    return tileAt(r, c) === null && clearedTerrainKindAt(r, c) === 'stone';
  }

  function isStoneRenderMassTile(r, c) {
    return isStoneMassTile(r, c);
  }

  // One continuous outline around the union of stone tiles. This keeps
  // connected veins looking like a single mass while still rounding exposed
  // outside corners. Unlike the old marching-square shape, it does not bulge
  // halfway into neighboring dirt or mined-out cells.
  function buildUnifiedStonePatchPath(rowStart, rowEnd, colStart, colEnd) {
    var outgoing = {};
    var edges = [];

    function pointKey(x, y) {
      return x + ',' + y;
    }
    function edgeKey(a, b) {
      return pointKey(a.x, a.y) + '>' + pointKey(b.x, b.y);
    }
    function addEdge(x1, y1, x2, y2) {
      var a = { x: x1, y: y1 };
      var b = { x: x2, y: y2 };
      var e = { a: a, b: b, key: edgeKey(a, b) };
      edges.push(e);
      var k = pointKey(x1, y1);
      if (!outgoing[k]) outgoing[k] = [];
      outgoing[k].push(e);
    }

    // A stone counts as connected only if it lies inside our read window.
    // Treating window-exterior tiles as "not stone" closes loops at the
    // window edge instead of letting them dangle past the contour range,
    // which previously left whole regions out of the path. The artificial
    // edge sits a tile outside the chunk's clip, so it's never visible.
    function stoneInWindow(rr, cc) {
      if (rr < rowStart || rr > rowEnd || cc < colStart || cc > colEnd) return false;
      return isStoneRenderMassTile(rr, cc);
    }

    for (var r = rowStart; r <= rowEnd; r++) {
      for (var c = colStart; c <= colEnd; c++) {
        if (!isStoneRenderMassTile(r, c)) continue;
        var tx = c * TILE;
        var ty = r * TILE;
        if (!stoneInWindow(r - 1, c)) addEdge(tx, ty, tx + TILE, ty);
        if (!stoneInWindow(r, c + 1)) addEdge(tx + TILE, ty, tx + TILE, ty + TILE);
        if (!stoneInWindow(r + 1, c)) addEdge(tx + TILE, ty + TILE, tx, ty + TILE);
        if (!stoneInWindow(r, c - 1)) addEdge(tx, ty + TILE, tx, ty);
      }
    }
    if (!edges.length) return null;

    function dirIndex(a, b) {
      if (b.x > a.x) return 0;
      if (b.y > a.y) return 1;
      if (b.x < a.x) return 2;
      return 3;
    }
    function turnRank(prevDir, nextDir) {
      var d = (nextDir - prevDir + 4) % 4;
      if (d === 1) return 0;
      if (d === 0) return 1;
      if (d === 3) return 2;
      return 3;
    }
    function simplifyLoop(points) {
      var out = [];
      for (var i = 0; i < points.length; i++) {
        var prev = points[(i - 1 + points.length) % points.length];
        var cur = points[i];
        var next = points[(i + 1) % points.length];
        var straight = (prev.x === cur.x && cur.x === next.x) ||
                       (prev.y === cur.y && cur.y === next.y);
        if (!straight) out.push(cur);
      }
      return out;
    }
    function stoneBoundaryCurveTo(path, x1, y1, x2, y2) {
      var dx = x2 - x1;
      var dy = y2 - y1;
      var len = Math.hypot(dx, dy);
      if (len < 3) {
        path.lineTo(x2, y2);
        return;
      }
      var nx = dy / len;
      var ny = -dx / len;
      var steps = Math.max(1, Math.ceil(len / 20));
      var sx = x1;
      var sy = y1;
      for (var s = 1; s <= steps; s++) {
        var t = s / steps;
        var ex = x1 + dx * t;
        var ey = y1 + dy * t;
        var mx = (sx + ex) * 0.5;
        var my = (sy + ey) * 0.5;
        var wobbleR = Math.round(my / 16);
        var wobbleC = Math.round(mx / 16);
        var wobble = (tileHash01(wobbleR, wobbleC, 0x5EED) - 0.5) * 6.0;
        path.quadraticCurveTo(mx + nx * wobble, my + ny * wobble, ex, ey);
        sx = ex;
        sy = ey;
      }
    }
    function addRoundedLoop(path, points) {
      points = simplifyLoop(points);
      var count = points.length;
      if (count < 3) return;
      var corners = [];
      for (var i = 0; i < count; i++) {
        var prev = points[(i - 1 + count) % count];
        var cur = points[i];
        var next = points[(i + 1) % count];
        var inLen = Math.max(1, Math.hypot(cur.x - prev.x, cur.y - prev.y));
        var outLen = Math.max(1, Math.hypot(next.x - cur.x, next.y - cur.y));
        var baseR = 14.0 + tileHash01(Math.round(cur.y / TILE), Math.round(cur.x / TILE), 0x570D) * 2.0;
        var radius = Math.min(baseR, inLen * 0.46, outLen * 0.46);
        var inDx = (cur.x - prev.x) / inLen;
        var inDy = (cur.y - prev.y) / inLen;
        var outDx = (next.x - cur.x) / outLen;
        var outDy = (next.y - cur.y) / outLen;
        corners.push({
          inX: cur.x - inDx * radius,
          inY: cur.y - inDy * radius,
          outX: cur.x + outDx * radius,
          outY: cur.y + outDy * radius,
          x: cur.x,
          y: cur.y
        });
      }
      path.moveTo(corners[0].outX, corners[0].outY);
      for (var c = 1; c < count; c++) {
        var prevCorner = corners[c - 1];
        var corner = corners[c];
        stoneBoundaryCurveTo(path, prevCorner.outX, prevCorner.outY, corner.inX, corner.inY);
        path.quadraticCurveTo(corner.x, corner.y, corner.outX, corner.outY);
      }
      var first = corners[0];
      var lastCorner = corners[count - 1];
      stoneBoundaryCurveTo(path, lastCorner.outX, lastCorner.outY, first.inX, first.inY);
      path.quadraticCurveTo(first.x, first.y, first.outX, first.outY);
      path.closePath();
    }

    var used = {};
    var loops = [];
    for (var e = 0; e < edges.length; e++) {
      var startEdge = edges[e];
      if (used[startEdge.key]) continue;
      var loop = [startEdge.a];
      var edge = startEdge;
      var startKey = pointKey(startEdge.a.x, startEdge.a.y);
      var guard = 0;
      while (edge && guard++ < edges.length + 8) {
        used[edge.key] = true;
        loop.push(edge.b);
        var endKey = pointKey(edge.b.x, edge.b.y);
        if (endKey === startKey) {
          loop.pop();
          loops.push(loop);
          break;
        }
        var nextEdges = outgoing[endKey] || [];
        var prevDir = dirIndex(edge.a, edge.b);
        var best = null;
        var bestRank = 99;
        for (var n = 0; n < nextEdges.length; n++) {
          var candidate = nextEdges[n];
          if (used[candidate.key]) continue;
          var rank = turnRank(prevDir, dirIndex(candidate.a, candidate.b));
          if (rank < bestRank) {
            best = candidate;
            bestRank = rank;
          }
        }
        edge = best;
      }
    }

    var path = new Path2D();
    for (var l = 0; l < loops.length; l++) {
      addRoundedLoop(path, loops[l]);
    }
    return loops.length ? path : null;
  }

  function drawStonePatchShadow(stonePath) {
    ctx.save();
    ctx.shadowColor = 'rgba(7,5,3,0.32)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fill(stonePath);
    ctx.restore();
  }

  function drawStoneEdgeRim(rowStart, rowEnd, colStart, colEnd, stonePath) {
    var x0 = colStart * TILE;
    var y0 = rowStart * TILE;
    var x1 = (colEnd + 1) * TILE;
    var y1 = (rowEnd + 1) * TILE;

    ctx.save();
    ctx.clip(stonePath);

    // Paint the bevel from the unified silhouette itself. This avoids the
    // tile-grid joins that made rounded arches look stitched onto the stone.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var bevelGrad = ctx.createLinearGradient(x0, y0, x1, y1);
    bevelGrad.addColorStop(0, 'rgba(245,245,225,0.060)');
    bevelGrad.addColorStop(0.48, 'rgba(214,214,195,0.024)');
    bevelGrad.addColorStop(1, 'rgba(8,9,8,0.070)');
    ctx.strokeStyle = bevelGrad;
    ctx.lineWidth = 12;
    ctx.stroke(stonePath);

    var softHi = ctx.createLinearGradient(x1, y1, x0, y0);
    softHi.addColorStop(0, 'rgba(245,245,225,0)');
    softHi.addColorStop(0.64, 'rgba(245,245,225,0.016)');
    softHi.addColorStop(1, 'rgba(245,245,225,0.048)');
    ctx.strokeStyle = softHi;
    ctx.lineWidth = 6;
    ctx.stroke(stonePath);

    var softShade = ctx.createLinearGradient(x0, y0, x1, y1);
    softShade.addColorStop(0, 'rgba(8,9,8,0)');
    softShade.addColorStop(0.52, 'rgba(8,9,8,0.014)');
    softShade.addColorStop(1, 'rgba(8,9,8,0.062)');
    ctx.strokeStyle = softShade;
    ctx.lineWidth = 8;
    ctx.stroke(stonePath);

    ctx.restore();
  }

  function drawUnifiedStoneWash(rowStart, rowEnd, colStart, colEnd) {
    var x = colStart * TILE;
    var w = (colEnd - colStart + 1) * TILE;
    for (var r = rowStart; r <= rowEnd; r++) {
      var rowDepth = r - SKY_ROWS;
      var rowLayer = (rowDepth >= 0 && r < TOTAL_ROWS) ? getLayerForCam(rowDepth) : null;
      var layerName = rowLayer ? rowLayer.name : 'topsoil';
      if (layerName === 'magma' || layerName === 'mantle') {
        layerName = 'bedrock';
      }
      var pal = materialPalette('stone', layerName);
      var y = r * TILE;
      ctx.fillStyle = pal.mid;
      ctx.fillRect(x, y, w, TILE);

      var bandH = 260;
      var bandT = Math.floor(y / bandH);
      var bandBlend = (y - bandT * bandH) / bandH;
      var upper = tileHash01(bandT, 19, 0x715E);
      var lower = tileHash01(bandT + 1, 19, 0x715E);
      var warmth = upper + (lower - upper) * bandBlend;
      var warmFrac = Math.max(0, Math.min(1, (warmth - 0.05) / 0.90));
      ctx.fillStyle = pal.hi;
      ctx.globalAlpha = 0.07 * warmFrac;
      ctx.fillRect(x, y, w, TILE);
      ctx.fillStyle = pal.lo;
      ctx.globalAlpha = 0.07 * (1 - warmFrac);
      ctx.fillRect(x, y, w, TILE);
      ctx.globalAlpha = 1;
    }
  }

  function drawSoftEllipseBlob(cx, cy, rx, ry, rot, red, green, blue, alpha) {
    var scale = 1.86;
    alpha *= 0.77;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(rx * scale, ry * scale);
    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha.toFixed(3) + ')');
    grad.addColorStop(0.60, 'rgba(' + red + ',' + green + ',' + blue + ',' + (alpha * 0.50).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(' + red + ',' + green + ',' + blue + ',0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // A couple of broad lobes turn the wash from "soft oval stamp" into a
    // natural camo-like stain without reintroducing lots of busy small marks.
    for (var lobe = 0; lobe < 2; lobe++) {
      var side = lobe ? -1 : 1;
      var angle = rot + side * (0.72 + lobe * 0.18);
      var dist = lobe ? 0.58 : 0.48;
      var lx = cx + Math.cos(angle) * rx * dist;
      var ly = cy + Math.sin(angle) * ry * dist;
      var lobeScaleX = scale * (0.92 + lobe * 0.12);
      var lobeScaleY = scale * (0.78 + lobe * 0.10);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot + side * 0.42);
      ctx.scale(rx * lobeScaleX, ry * lobeScaleY);
      var lobeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      lobeGrad.addColorStop(0, 'rgba(' + red + ',' + green + ',' + blue + ',' + (alpha * 0.58).toFixed(3) + ')');
      lobeGrad.addColorStop(0.62, 'rgba(' + red + ',' + green + ',' + blue + ',' + (alpha * 0.24).toFixed(3) + ')');
      lobeGrad.addColorStop(1, 'rgba(' + red + ',' + green + ',' + blue + ',0)');
      ctx.fillStyle = lobeGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMaterialWorldWash(kind, tx, ty, r, c, layerName, n) {
    var pal = materialPalette(kind, layerName);
    var worldX = c * TILE;
    var worldY = r * TILE;
    var b = 0.9;
    var l = materialBleed(n, 'left', b);
    var rr = materialBleed(n, 'right', b);
    var u = materialBleed(n, 'up', b);
    var d = materialBleed(n, 'down', b);
    // Base painted TILE-ONLY (was bled). The bleed was creating the
    // long-standing 1-px vertical seam at every tile boundary:
    // tile N's tints would paint at full strength, then tile N+1's
    // bled base would partially OVERPAINT the boundary pixel (replacing
    // 90% of the tinted color with untinted base), then tile N+1's
    // tile-only tints wouldn't reach that pixel — leaving every tile-
    // edge column dramatically lighter than its neighbors. Painting
    // base + tints both tile-aligned makes adjacent tiles paint
    // identical colors at their bounds with no overlap.
    ctx.fillStyle = pal.mid;
    ctx.fillRect(tx, ty, TILE, TILE);

    ctx.save();
    clipMaterialTile(tx, ty, n, b);

    var bandH = kind === 'dirt' ? 190 : 260;
    var bandT = Math.floor(worldY / bandH);
    var bandBlend = (worldY - bandT * bandH) / bandH;
    var upper = tileHash01(bandT, kind === 'dirt' ? 11 : 19, 0x715E);
    var lower = tileHash01(bandT + 1, kind === 'dirt' ? 11 : 19, 0x715E);
    var warmth = upper + (lower - upper) * bandBlend;
    var warmFrac = Math.max(0, Math.min(1, (warmth - 0.05) / 0.90));
    var baseAlpha = kind === 'dirt' ? 0.13 : 0.07;
    // Tint passes use TILE-only fillRect (not bled). Previously the bleed
    // overlap zone between two adjacent tiles got painted by BOTH tiles'
    // alpha tints — the compound effect (~0.243 alpha vs intended 0.13)
    // produced a 1-px darker column at every tile boundary, visible as a
    // "gap line". Painting tints exactly tile-aligned eliminates the
    // overlap and the seam.
    ctx.fillStyle = kind === 'dirt' ? pal.warm : pal.hi;
    ctx.globalAlpha = baseAlpha * warmFrac;
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.fillStyle = kind === 'dirt' ? pal.cool : pal.lo;
    ctx.globalAlpha = baseAlpha * (1 - warmFrac);
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.globalAlpha = 1;

    var cloudSize = kind === 'dirt' ? 126 : 164;
    if (!USE_CHUNK_DETAIL_FIELD) {
      var minC = Math.floor((worldX - cloudSize) / cloudSize);
      var maxC = Math.floor((worldX + TILE + cloudSize) / cloudSize);
      var minR = Math.floor((worldY - cloudSize) / cloudSize);
      var maxR = Math.floor((worldY + TILE + cloudSize) / cloudSize);
      for (var gr = minR; gr <= maxR; gr++) {
        for (var gc = minC; gc <= maxC; gc++) {
          var h = tileHash01(gr, gc, kind === 'dirt' ? 0xD07C10 : 0x570A10);
          if (h < 0.23) continue;
          var cx = gc * cloudSize + 14 + tileHash01(gr, gc, 0xA11CE) * (cloudSize - 28);
          var cy = gr * cloudSize + 12 + tileHash01(gr, gc, 0xA11CF) * (cloudSize - 24);
          var rx = (kind === 'dirt' ? 35 : 52) + tileHash01(gr, gc, 0xA11D0) * (kind === 'dirt' ? 34 : 58);
          var ry = (kind === 'dirt' ? 18 : 30) + tileHash01(gr, gc, 0xA11D1) * (kind === 'dirt' ? 26 : 46);
          if (cx + rx < worldX || cx - rx > worldX + TILE || cy + ry < worldY || cy - ry > worldY + TILE) continue;
          var hot = h > 0.64;
          var rot = tileHash01(gr, gc, 0xA11D2) * Math.PI;
          if (hot) {
            if (kind === 'dirt') drawSoftEllipseBlob(tx + (cx - worldX), ty + (cy - worldY), rx, ry, rot, 196, 118, 62, 0.105, gr, gc, 0xC10D);
            else drawSoftEllipseBlob(tx + (cx - worldX), ty + (cy - worldY), rx, ry, rot, 235, 232, 210, 0.060, gr, gc, 0xC10D);
          } else {
            if (kind === 'dirt') drawSoftEllipseBlob(tx + (cx - worldX), ty + (cy - worldY), rx, ry, rot, 22, 12, 7, 0.125, gr, gc, 0xC10D);
            else drawSoftEllipseBlob(tx + (cx - worldX), ty + (cy - worldY), rx, ry, rot, 8, 10, 9, 0.085, gr, gc, 0xC10D);
          }
        }
      }
    }

    ctx.restore();
  }

  // Fake all-solid neighbor descriptor used when rendering atlas
  // tiles. The atlas tile is drawn with no edge bleed (the chunk
  // renderer's own clip handles the boundary), so we want the
  // detail functions to fill the full TILE rect.
  var ATLAS_NEIGHBORS = {
    selfKind: 'dirt',
    up: true, down: true, left: true, right: true,
    upKind: 'dirt', downKind: 'dirt', leftKind: 'dirt', rightKind: 'dirt',
    terrainUp: true, terrainDown: true, terrainLeft: true, terrainRight: true,
    openUp: false, openDown: false, openLeft: false, openRight: false,
    openUpLeft: false, openUpRight: false, openDownLeft: false, openDownRight: false
  };

  function tileAtlasKey(kind, layerName, variant) {
    return kind + '|' + layerName + '|' + variant;
  }

  // Build all atlas variants up front. ~256 small canvases (~3MB).
  // Runs once, lazily on first use, on the order of ~100-300ms.
  function buildTileAtlas() {
    if (tileAtlasCache) return tileAtlasCache;
    var cache = {};
    var bleed = TILE_ATLAS_BLEED;
    var size = TILE + bleed * 2;
    var savedCtx = ctx;
    for (var ki = 0; ki < 2; ki++) {
      var kind = ki === 0 ? 'dirt' : 'stone';
      var neighbors = { selfKind: kind };
      // copy ATLAS_NEIGHBORS but with correct selfKind
      for (var key in ATLAS_NEIGHBORS) {
        if (key !== 'selfKind') neighbors[key] = ATLAS_NEIGHBORS[key];
      }
      neighbors.upKind = kind; neighbors.downKind = kind;
      neighbors.leftKind = kind; neighbors.rightKind = kind;
      for (var li = 0; li < TILE_ATLAS_LAYERS.length; li++) {
        var layerName = TILE_ATLAS_LAYERS[li];
        // Some layers don't get a real palette entry for stone (e.g.
        // "magma" stone uses the bedrock palette). The detail
        // functions handle that internally — we just call them.
        for (var v = 0; v < TILE_ATLAS_VARIANTS; v++) {
          var canv = document.createElement('canvas');
          canv.width = Math.ceil(size * TILE_ATLAS_SCALE);
          canv.height = Math.ceil(size * TILE_ATLAS_SCALE);
          var g = canv.getContext('2d');
          g.setTransform(TILE_ATLAS_SCALE, 0, 0, TILE_ATLAS_SCALE, 0, 0);
          g.imageSmoothingEnabled = true;
          // Temporarily redirect ctx so the existing detail functions
          // draw into our atlas canvas. Use a synthetic (r,c) seeded
          // by the variant index so each variant looks different.
          ctx = g;
          // Use prime-spaced synthetic coords so the procedural
          // hashes produce visually distinct results per variant.
          var fakeR = 1000 + v * 37 + li * 13 + ki * 7;
          var fakeC = 1000 + v * 53 + li * 11 + ki * 5;
          var tx = bleed;
          var ty = bleed;
          // Disable the atlas flag while building so the original
          // (slow but correct) functions actually run.
          var was = USE_TILE_ATLAS;
          USE_TILE_ATLAS = false;
          if (kind === 'dirt') {
            drawDirtMassDetail(tx, ty, fakeR, fakeC, layerName, neighbors);
          } else {
            drawStoneMassDetail(tx, ty, fakeR, fakeC, layerName, neighbors);
          }
          USE_TILE_ATLAS = was;
          cache[tileAtlasKey(kind, layerName, v)] = canv;
        }
      }
    }
    ctx = savedCtx;
    tileAtlasCache = cache;
    return cache;
  }

  // Pick a variant index for a (r,c) tile. Stable across chunk rebuilds.
  function pickAtlasVariant(r, c, kind) {
    var salt = kind === 'dirt' ? 0xA71A5D : 0xA71A55;
    return Math.floor(tileHash01(r, c, salt) * TILE_ATLAS_VARIANTS) % TILE_ATLAS_VARIANTS;
  }

  // Draw a pre-rendered atlas tile into the current ctx.
  function drawAtlasTile(kind, tx, ty, r, c, layerName) {
    var atlas = tileAtlasCache || buildTileAtlas();
    var variant = pickAtlasVariant(r, c, kind);
    var key = tileAtlasKey(kind, layerName, variant);
    var canv = atlas[key];
    if (!canv) {
      // Unknown layer — fall back to live render so we never crash.
      if (kind === 'dirt') drawDirtMassDetail(tx, ty, r, c, layerName, ATLAS_NEIGHBORS);
      else drawStoneMassDetail(tx, ty, r, c, layerName, ATLAS_NEIGHBORS);
      return;
    }
    var bleed = TILE_ATLAS_BLEED;
    // The atlas was rendered at TILE_ATLAS_SCALE; drawImage scales it
    // back down to TILE size with the chunk's smoothing settings.
    ctx.drawImage(canv, tx - bleed, ty - bleed, TILE + bleed * 2, TILE + bleed * 2);
  }

  // When true, per-tile detail (clods, chips, cloud blobs) is suppressed
  // and instead drawn as a single chunk-level pass via drawChunkDetailField.
  // This guarantees each shape is painted exactly once, eliminating the
  // brightness banding caused by adjacent tiles double-painting overlapping
  // translucent shapes. See drawChunkDetailField below.
  var USE_CHUNK_DETAIL_FIELD = true;

  function drawDirtMassDetail(tx, ty, r, c, layerName, n) {
    if (USE_TILE_ATLAS) { drawAtlasTile('dirt', tx, ty, r, c, layerName); return; }
    if (USE_CHUNK_DETAIL_FIELD) return; // handled at chunk level
    // LEAN WORLD-COORD CLOD FIELD
    // Clods are placed on a fixed 8px world grid hashed by world coords.
    // Two adjacent tiles compute the SAME clods at the boundary, so
    // detail flows continuously across tile borders. No per-tile clip
    // (the chunk-level clip handles that), no seams, no roots — just
    // the high-frequency pebble field that the player notices.
    var worldX = c * TILE;
    var worldY = r * TILE;
    var lineTint = layerName === 'crystal' ? 'rgba(210,185,235,' : layerName === 'permafrost' ? 'rgba(30,40,46,' : 'rgba(32,17,9,';
    var hiTint = layerName === 'crystal' ? 'rgba(225,210,255,' : layerName === 'permafrost' ? 'rgba(214,236,245,' : 'rgba(230,145,78,';

    var clod = 8;
    var minClodC = Math.floor((worldX - clod) / clod);
    var maxClodC = Math.floor((worldX + TILE + clod) / clod);
    var minClodR = Math.floor((worldY - clod) / clod);
    var maxClodR = Math.floor((worldY + TILE + clod) / clod);
    for (var cr = minClodR; cr <= maxClodR; cr++) {
      for (var cc = minClodC; cc <= maxClodC; cc++) {
        var h = tileHash01(cr, cc, 0xD1A7);
        var cx = cc * clod + clod * 0.5 + (tileHash01(cr, cc, 0xD1A8) - 0.5) * 4.2;
        var cy = cr * clod + clod * 0.5 + (tileHash01(cr, cc, 0xD1A9) - 0.5) * 4.2;
        var rx = 2.0 + tileHash01(cr, cc, 0xD1AA) * 3.6;
        var ry = 1.45 + tileHash01(cr, cc, 0xD1AB) * 2.8;
        if (cx + rx < worldX || cx - rx > worldX + TILE || cy + ry < worldY || cy - ry > worldY + TILE) continue;
        ctx.fillStyle = h > 0.72
          ? hiTint + (0.08 + tileHash01(cr, cc, 0xD1AC) * 0.045).toFixed(3) + ')'
          : lineTint + (0.115 + tileHash01(cr, cc, 0xD1AD) * 0.070).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(tx + (cx - worldX), ty + (cy - worldY), rx, ry, tileHash01(cr, cc, 0xD1AE) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStoneMassDetail(tx, ty, r, c, layerName, n) {
    if (USE_TILE_ATLAS) { drawAtlasTile('stone', tx, ty, r, c, layerName); return; }
    if (USE_CHUNK_DETAIL_FIELD) return; // handled at chunk level
    // LEAN WORLD-COORD CHIP FIELD — same continuity principle as dirt.
    // Chips placed on a fixed 15px world grid hashed by world coords,
    // so a chip near a tile boundary is rendered identically by both
    // tiles meeting at that boundary.
    var worldX = c * TILE;
    var worldY = r * TILE;
    var coolHi = layerName === 'crystal' ? 'rgba(195,205,255,' : layerName === 'permafrost' ? 'rgba(233,245,252,' : 'rgba(245,245,225,';
    var coolLo = layerName === 'crystal' ? 'rgba(16,18,36,' : layerName === 'permafrost' ? 'rgba(64,96,124,' : 'rgba(7,9,8,';

    var chip = 15;
    var minChipC = Math.floor((worldX - chip) / chip);
    var maxChipC = Math.floor((worldX + TILE + chip) / chip);
    var minChipR = Math.floor((worldY - chip) / chip);
    var maxChipR = Math.floor((worldY + TILE + chip) / chip);
    for (var pr = minChipR; pr <= maxChipR; pr++) {
      for (var pc = minChipC; pc <= maxChipC; pc++) {
        var ph = tileHash01(pr, pc, 0x51AB);
        var cx = pc * chip + 4 + tileHash01(pr, pc, 0x51AC) * (chip - 8);
        var cy = pr * chip + 4 + tileHash01(pr, pc, 0x51AD) * (chip - 8);
        var rad = 5 + tileHash01(pr, pc, 0x51AE) * 7;
        if (cx + rad < worldX || cx - rad > worldX + TILE || cy + rad < worldY || cy - rad > worldY + TILE) continue;
        var sides = 5 + Math.floor(tileHash01(pr, pc, 0x51AF) * 3);
        var rot = tileHash01(pr, pc, 0x51B0) * Math.PI * 2;
        ctx.fillStyle = ph > 0.58
          ? coolHi + (0.045 + tileHash01(pr, pc, 0x51B1) * 0.030).toFixed(3) + ')'
          : coolLo + (0.055 + tileHash01(pr, pc, 0x51B2) * 0.045).toFixed(3) + ')';
        ctx.beginPath();
        for (var side = 0; side < sides; side++) {
          var a = rot + side / sides * Math.PI * 2;
          var rr = rad * (0.62 + tileHash01(pr * 9 + side, pc, 0x51B3) * 0.42);
          var px = tx + (cx - worldX) + Math.cos(a) * rr;
          var py = ty + (cy - worldY) + Math.sin(a) * rr * 0.74;
          if (side === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }


  function drawTerrainBlend(kind, tx, ty, layerName, n) {
    function blendColor(otherKind) {
      var pal = materialPalette(otherKind, layerName);
      return pal.mid || pal.top;
    }
    function alphaColor(hex, a) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g2 = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g2 + ',' + b + ',' + a + ')';
    }
    function blendDepth(otherKind) {
      return kind === 'stone' && otherKind === 'dirt' ? 18 : 11;
    }
    function blendAlpha(otherKind) {
      if (kind === 'stone' && otherKind === 'dirt') return 0.24;
      if (kind === 'dirt' && otherKind === 'stone') return 0.11;
      return 0.15;
    }
    function shouldBlend(otherKind) {
      if (!otherKind || otherKind === kind) return false;
      return !(kind === 'stone' && otherKind === 'dirt');
    }
    var step = 8;

    if (shouldBlend(n.upKind)) {
      var upDepth = blendDepth(n.upKind);
      ctx.fillStyle = alphaColor(blendColor(n.upKind), blendAlpha(n.upKind));
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + TILE, ty);
      for (var ux = TILE; ux >= 0; ux -= step) {
        ctx.lineTo(tx + ux, ty + upDepth + edgeWave(kind, 10, ty, tx + ux) * 0.65);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (shouldBlend(n.downKind)) {
      var downDepth = blendDepth(n.downKind);
      ctx.fillStyle = alphaColor(blendColor(n.downKind), blendAlpha(n.downKind));
      ctx.beginPath();
      ctx.moveTo(tx, ty + TILE);
      ctx.lineTo(tx + TILE, ty + TILE);
      for (var dx = TILE; dx >= 0; dx -= step) {
        ctx.lineTo(tx + dx, ty + TILE - downDepth - edgeWave(kind, 11, ty + TILE, tx + dx) * 0.65);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (shouldBlend(n.leftKind)) {
      var leftDepth = blendDepth(n.leftKind);
      ctx.fillStyle = alphaColor(blendColor(n.leftKind), blendAlpha(n.leftKind) * 0.92);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty + TILE);
      for (var ly = TILE; ly >= 0; ly -= step) {
        ctx.lineTo(tx + leftDepth + edgeWave(kind, 12, tx, ty + ly) * 0.65, ty + ly);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (shouldBlend(n.rightKind)) {
      var rightDepth = blendDepth(n.rightKind);
      ctx.fillStyle = alphaColor(blendColor(n.rightKind), blendAlpha(n.rightKind) * 0.92);
      ctx.beginPath();
      ctx.moveTo(tx + TILE, ty);
      ctx.lineTo(tx + TILE, ty + TILE);
      for (var ry = TILE; ry >= 0; ry -= step) {
        ctx.lineTo(tx + TILE - rightDepth - edgeWave(kind, 13, tx + TILE, ty + ry) * 0.65, ty + ry);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function edgeWave(kind, side, lineCoord, travelCoord) {
    var salt = kind === 'dirt' ? 0xE6E10 : 0x570E10;
    var phaseA = tileHash01(Math.floor(lineCoord / TILE), side, salt) * Math.PI * 2;
    var phaseB = tileHash01(Math.floor(lineCoord / 17), side + 13, salt ^ 0xA53) * Math.PI * 2;
    var phaseC = tileHash01(Math.floor(lineCoord / 71), side + 31, salt ^ 0x7A1) * Math.PI * 2;
    var slow = Math.sin(travelCoord * 0.013 + phaseC) * 1.6;
    var low = Math.sin(travelCoord * 0.045 + phaseA) * 1.4;
    var fine = Math.sin(travelCoord * 0.145 + phaseB) * 0.45;
    return 3.4 + slow + low + fine;
  }

  function curveThrough(points, connect) {
    if (!points.length) return;
    if (connect) ctx.lineTo(points[0].x, points[0].y);
    else ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length - 1; i++) {
      var midX = (points[i].x + points[i + 1].x) * 0.5;
      var midY = (points[i].y + points[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    if (points.length > 1) {
      var last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
  }

  function drawEdgeSurface(kind, tx, ty, r, c, layerName) {
    var pal = materialPalette(kind, layerName);
    var worldX = c * TILE;
    var worldY = r * TILE;
    ctx.fillStyle = pal.mid;
    ctx.fillRect(tx - 10, ty - 10, TILE + 20, TILE + 20);

    var washColor = kind === 'dirt' ? pal.warm : pal.hi;
    ctx.globalAlpha = kind === 'dirt' ? 0.10 : 0.075;
    ctx.fillStyle = washColor;
    ctx.fillRect(tx - 10, ty - 10, TILE + 20, TILE + 20);
    ctx.globalAlpha = 1;

    if (kind === 'dirt') {
      var clod = 8;
      var minClodC = Math.floor((worldX - 12) / clod);
      var maxClodC = Math.floor((worldX + TILE + 12) / clod);
      var minClodR = Math.floor((worldY - 12) / clod);
      var maxClodR = Math.floor((worldY + TILE + 12) / clod);
      for (var cr = minClodR; cr <= maxClodR; cr++) {
        for (var cc = minClodC; cc <= maxClodC; cc++) {
          var h = tileHash01(cr, cc, 0xD1A7);
          var cx = cc * clod + clod * 0.5 + (tileHash01(cr, cc, 0xD1A8) - 0.5) * 4.2;
          var cy = cr * clod + clod * 0.5 + (tileHash01(cr, cc, 0xD1A9) - 0.5) * 4.2;
          var rx = 2.0 + tileHash01(cr, cc, 0xD1AA) * 3.6;
          var ry = 1.45 + tileHash01(cr, cc, 0xD1AB) * 2.8;
          if (cx + rx < worldX - 10 || cx - rx > worldX + TILE + 10 || cy + ry < worldY - 10 || cy - ry > worldY + TILE + 10) continue;
          ctx.fillStyle = h > 0.72
            ? 'rgba(230,145,78,0.070)'
            : 'rgba(32,17,9,0.105)';
          ctx.beginPath();
          ctx.ellipse(tx + (cx - worldX), ty + (cy - worldY), rx, ry, tileHash01(cr, cc, 0xD1AE) * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      var chip = 15;
      var minChipC = Math.floor((worldX - 12) / chip);
      var maxChipC = Math.floor((worldX + TILE + 12) / chip);
      var minChipR = Math.floor((worldY - 12) / chip);
      var maxChipR = Math.floor((worldY + TILE + 12) / chip);
      for (var pr = minChipR; pr <= maxChipR; pr++) {
        for (var pc = minChipC; pc <= maxChipC; pc++) {
          var ph = tileHash01(pr, pc, 0x51AB);
          var scx = pc * chip + 4 + tileHash01(pr, pc, 0x51AC) * (chip - 8);
          var scy = pr * chip + 4 + tileHash01(pr, pc, 0x51AD) * (chip - 8);
          var rad = 5 + tileHash01(pr, pc, 0x51AE) * 7;
          if (scx + rad < worldX - 10 || scx - rad > worldX + TILE + 10 || scy + rad < worldY - 10 || scy - rad > worldY + TILE + 10) continue;
          ctx.fillStyle = ph > 0.58 ? 'rgba(245,245,225,0.042)' : 'rgba(8,9,8,0.050)';
          ctx.beginPath();
          ctx.ellipse(tx + (scx - worldX), ty + (scy - worldY), rad, rad * 0.65, tileHash01(pr, pc, 0x51B0) * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function textureCurrentPath(kind, tx, ty, r, c, layerName) {
    ctx.save();
    ctx.clip();
    drawEdgeSurface(kind, tx, ty, r, c, layerName);
    ctx.restore();
  }

  function drawRoundedVoidCorner(kind, tx, ty, r, c, layerName, cx, cy, sx, sy, radius) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + sx * radius, cy);
    ctx.quadraticCurveTo(
      cx + sx * radius * 0.92,
      cy + sy * radius * 0.92,
      cx,
      cy + sy * radius
    );
    ctx.closePath();
    textureCurrentPath(kind, tx, ty, r, c, layerName);
  }

  function drawOpenCornerRounds(kind, tx, ty, r, c, layerName, n) {
    var radius = 12.5;
    if (n.openUp && terrainKindAt(r - 1, c - 1)) {
      drawRoundedVoidCorner(kind, tx, ty, r, c, layerName, tx, ty, 1, -1, radius);
    }
    if (n.openUp && terrainKindAt(r - 1, c + 1)) {
      drawRoundedVoidCorner(kind, tx, ty, r, c, layerName, tx + TILE, ty, -1, -1, radius);
    }
    if (n.openDown && terrainKindAt(r + 1, c - 1)) {
      drawRoundedVoidCorner(kind, tx, ty, r, c, layerName, tx, ty + TILE, 1, 1, radius);
    }
    if (n.openDown && terrainKindAt(r + 1, c + 1)) {
      drawRoundedVoidCorner(kind, tx, ty, r, c, layerName, tx + TILE, ty + TILE, -1, 1, radius);
    }
  }

  function voidColorForLayer(rowLayer) {
    return rowLayer ? biomeBgColor(rowLayer.name) : BG.bgTopsoil;
  }

  function drawVoidCornerCarve(tx, ty, sx, sy, radius) {
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + sx * radius, ty);
    ctx.quadraticCurveTo(tx + sx * radius * 0.86, ty + sy * radius * 0.86, tx, ty + sy * radius);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrainVoidCarve(kind, tx, ty, r, c, rowLayer, n) {
    var depth = kind === 'dirt' ? 5.2 : 4.6;
    var corner = kind === 'dirt' ? 13.5 : 12.5;
    var step = 8;
    ctx.save();
    ctx.fillStyle = voidColorForLayer(rowLayer);

    if (n.openLeft) {
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty + TILE);
      for (var ly = TILE + step; ly >= -step; ly -= step) {
        var wy = ty + ly;
        ctx.lineTo(tx + depth + edgeWave(kind, 22, tx, wy) * 0.5, wy);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (n.openRight) {
      ctx.beginPath();
      ctx.moveTo(tx + TILE, ty);
      ctx.lineTo(tx + TILE, ty + TILE);
      for (var ry = TILE + step; ry >= -step; ry -= step) {
        var rwy = ty + ry;
        ctx.lineTo(tx + TILE - depth - edgeWave(kind, 23, tx + TILE, rwy) * 0.5, rwy);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (n.openUp && r > SKY_ROWS) {
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + TILE, ty);
      for (var ux = TILE + step; ux >= -step; ux -= step) {
        var wx = tx + ux;
        ctx.lineTo(wx, ty + depth + edgeWave(kind, 20, ty, wx) * 0.5);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (n.openDown) {
      ctx.beginPath();
      ctx.moveTo(tx, ty + TILE);
      ctx.lineTo(tx + TILE, ty + TILE);
      for (var dx = TILE + step; dx >= -step; dx -= step) {
        var dwx = tx + dx;
        ctx.lineTo(dwx, ty + TILE - depth - edgeWave(kind, 21, ty + TILE, dwx) * 0.5);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (n.openUp && n.openLeft && r > SKY_ROWS) drawVoidCornerCarve(tx, ty, 1, 1, corner);
    if (n.openUp && n.openRight && r > SKY_ROWS) drawVoidCornerCarve(tx + TILE, ty, -1, 1, corner);
    if (n.openDown && n.openLeft) drawVoidCornerCarve(tx, ty + TILE, 1, -1, corner);
    if (n.openDown && n.openRight) drawVoidCornerCarve(tx + TILE, ty + TILE, -1, -1, corner);

    ctx.restore();
  }

  function roundedRectPath(x, y, w, h, radius) {
    var r = Math.min(radius, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function organicVoidPath(x, y, w, h, r, seedR, seedC) {
    var wobble = 1.7;
    var tl = r + (tileHash01(seedR, seedC, 0x701) - 0.5) * wobble;
    var tr = r + (tileHash01(seedR, seedC, 0x702) - 0.5) * wobble;
    var br = r + (tileHash01(seedR, seedC, 0x703) - 0.5) * wobble;
    var bl = r + (tileHash01(seedR, seedC, 0x704) - 0.5) * wobble;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y + (tileHash01(seedR, seedC, 0x705) - 0.5) * 1.2);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w + (tileHash01(seedR, seedC, 0x706) - 0.5) * 1.1, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h + (tileHash01(seedR, seedC, 0x707) - 0.5) * 1.2);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x + (tileHash01(seedR, seedC, 0x708) - 0.5) * 1.1, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }

  function organicBlobPath(cx, cy, rx, ry, seedR, seedC, salt, pointCount, wobbleAmp) {
    var pts = [];
    var count = pointCount || 11;
    var amp = (wobbleAmp == null) ? 0.28 : wobbleAmp;
    var base = 1 - amp * 0.5;
    for (var i = 0; i < count; i++) {
      var a = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      var wobble = base + tileHash01(seedR + i * 17, seedC - i * 11, salt + i * 37) * amp;
      pts.push({
        x: cx + Math.cos(a) * rx * wobble,
        y: cy + Math.sin(a) * ry * wobble
      });
    }
    ctx.beginPath();
    var last = pts[count - 1];
    var first = pts[0];
    ctx.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
    for (var p = 0; p < count; p++) {
      var cur = pts[p];
      var next = pts[(p + 1) % count];
      ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) * 0.5, (cur.y + next.y) * 0.5);
    }
    ctx.closePath();
  }

  function organicBlobPathRotated(cx, cy, rx, ry, angle, seedR, seedC, salt, pointCount) {
    var pts = [];
    var count = pointCount || 11;
    var ca = Math.cos(angle);
    var sa = Math.sin(angle);
    for (var i = 0; i < count; i++) {
      var a = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      var wobble = 0.84 + tileHash01(seedR + i * 19, seedC - i * 13, salt + i * 41) * 0.32;
      var px = Math.cos(a) * rx * wobble;
      var py = Math.sin(a) * ry * wobble;
      pts.push({
        x: cx + px * ca - py * sa,
        y: cy + px * sa + py * ca
      });
    }
    ctx.beginPath();
    var last = pts[count - 1];
    var first = pts[0];
    ctx.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
    for (var p = 0; p < count; p++) {
      var cur = pts[p];
      var next = pts[(p + 1) % count];
      ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) * 0.5, (cur.y + next.y) * 0.5);
    }
    ctx.closePath();
  }

  function isRenderableSolid(t) {
    return !!(t && t !== 'wall');
  }

  function dominantVoidBackingKind(r, c) {
    var dirt = 0;
    var stone = 0;
    for (var rr = -1; rr <= 1; rr++) {
      for (var cc = -1; cc <= 1; cc++) {
        if (rr === 0 && cc === 0) continue;
        var kind = terrainKindAt(r + rr, c + cc);
        if (kind === 'dirt') dirt++;
        if (kind === 'stone') stone++;
      }
    }
    if (!dirt && !stone) return null;
    return stone && !dirt ? 'stone' : 'dirt';
  }

  function drawVoidBackingMaterial(kind, tx, ty, r, c, rowLayer, clipPath) {
    var layerName = materialLayer(rowLayer);
    if (layerName === 'magma' || layerName === 'mantle') {
      layerName = kind === 'stone' ? 'bedrock' : 'deepcrust';
    }
    var n = materialNeighbors(r, c, kind);
    ctx.save();
    ctx.beginPath();
    if (clipPath) clipPath(tx, ty);
    else ctx.rect(tx, ty, TILE, TILE);
    ctx.clip();

    if (kind === 'dirt') {
      drawMaterialWorldWash(kind, tx, ty, r, c, layerName, n);
      drawVoidDirtClouds(r, c);
      var savedDirtField = USE_CHUNK_DETAIL_FIELD;
      USE_CHUNK_DETAIL_FIELD = false;
      drawDirtMassDetail(tx, ty, r, c, layerName, n);
      USE_CHUNK_DETAIL_FIELD = savedDirtField;
      ctx.restore();
      return;
    }

    // Voids are skipped by the chunk-level detail field (their tiles
    // are empty so they don't get clods/clouds painted across them).
    // Temporarily bypass the chunk-field flag so the detail functions
    // render their per-tile content directly into the void backing,
    // matching the wash. Safe from double-paint because no chunk-level
    // pass touches this clipped void area.
    var savedField = USE_CHUNK_DETAIL_FIELD;
    USE_CHUNK_DETAIL_FIELD = false;
    drawMaterialWorldWash(kind, tx, ty, r, c, layerName, n);
    drawStoneMassDetail(tx, ty, r, c, layerName, n);
    USE_CHUNK_DETAIL_FIELD = savedField;
    drawTerrainBlend(kind, tx, ty, layerName, n);
    ctx.restore();
  }

  function drawVoidTerrainBacking(r, c, rowLayer) {
    var kind = dominantVoidBackingKind(r, c);
    if (!kind) return;
    var tx = c * TILE;
    var ty = r * TILE;
    var clearedKind = clearedTerrainKindAt(r, c);
    if (clearedKind === 'stone' && isStoneRenderMassTile(r, c)) return;

    var stoneUp = terrainKindAt(r - 1, c) === 'stone';
    var stoneDown = terrainKindAt(r + 1, c) === 'stone';
    var stoneLeft = terrainKindAt(r, c - 1) === 'stone';
    var stoneRight = terrainKindAt(r, c + 1) === 'stone';
    var stoneCardinals = (stoneUp ? 1 : 0) + (stoneDown ? 1 : 0) + (stoneLeft ? 1 : 0) + (stoneRight ? 1 : 0);
    var dirtCardinals =
      (terrainKindAt(r - 1, c) === 'dirt' ? 1 : 0) +
      (terrainKindAt(r + 1, c) === 'dirt' ? 1 : 0) +
      (terrainKindAt(r, c - 1) === 'dirt' ? 1 : 0) +
      (terrainKindAt(r, c + 1) === 'dirt' ? 1 : 0);

    // A mined dirt pocket beside stone should not turn into a grey stone
    // square. Cleared stone tunnels usually look better with dirt backing;
    // only fully enclosed stone pockets keep stone backing.
    var baseKind = (clearedKind !== 'dirt' && kind === 'stone' && stoneCardinals >= 3 && dirtCardinals === 0) ? 'stone' : 'dirt';
    drawVoidBackingMaterial(baseKind, tx, ty, r, c, rowLayer);
  }

  function isOpenCell(r, c) {
    return tileAt(r, c) === null;
  }

  function drawVoidDiagonalJoin(tx, ty, cornerX, cornerY, sx, sy, clearedKind, r, c, salt) {
    if (clearedKind === 'stone') {
      organicBlobPath(
        cornerX + sx * TILE * 0.25,
        cornerY + sy * TILE * 0.25,
        18.5 + tileHash01(r, c, salt) * 1.2,
        17.5 + tileHash01(r, c, salt + 1) * 1.0,
        r,
        c,
        salt + 2,
        13,
        0.11
      );
      ctx.fill();
      return;
    }
    ctx.fillRect(
      sx < 0 ? tx + TILE * 0.5 : tx - 1.5,
      sy < 0 ? ty + TILE * 0.5 : ty - 1.5,
      TILE * 0.5 + 1.5,
      TILE * 0.5 + 1.5
    );
  }


  function drawClearedStoneOrganicVoidCell(tx, ty, r, c, openUp, openDown, openLeft, openRight, openCount) {
    var margin = 5.8;
    var thick = TILE - margin * 2;
    var radius = thick * 0.55;
    function fillRoundedBand(x, y, w, h) {
      roundedRectPath(x, y, w, h, Math.min(radius, w * 0.5, h * 0.5));
      ctx.fill();
    }

    if (!openCount) {
      organicBlobPath(
        tx + TILE * 0.5 + (tileHash01(r, c, 0x781) - 0.5) * 1.8,
        ty + TILE * 0.5 + (tileHash01(r, c, 0x782) - 0.5) * 1.8,
        11.5 + tileHash01(r, c, 0x783) * 2.8,
        10.8 + tileHash01(r, c, 0x784) * 2.4,
        r,
        c,
        0x785,
        12,
        0.12
      );
      ctx.fill();
      return;
    }

    if (openLeft || openRight) {
      var x0 = openLeft ? tx - 4 : tx + TILE * 0.5 - radius;
      var x1 = openRight ? tx + TILE + 4 : tx + TILE * 0.5 + radius;
      fillRoundedBand(x0, ty + margin, x1 - x0, thick);
    }
    if (openUp || openDown) {
      var y0 = openUp ? ty - 4 : ty + TILE * 0.5 - radius;
      var y1 = openDown ? ty + TILE + 4 : ty + TILE * 0.5 + radius;
      fillRoundedBand(tx + margin, y0, thick, y1 - y0);
    }

    var boost = openCount >= 3 ? 3.2 : (openCount === 2 ? 1.8 : 0);
    organicBlobPath(
      tx + TILE * 0.5 + (tileHash01(r, c, 0x786) - 0.5) * 0.5,
      ty + TILE * 0.5 + (tileHash01(r, c, 0x787) - 0.5) * 0.5,
      13.2 + boost + tileHash01(r, c, 0x788) * 1.0,
      12.4 + boost + tileHash01(r, c, 0x789) * 0.9,
      r,
      c,
      0x78A,
      13,
      0.10
    );
    ctx.fill();
  }

  function drawSmoothVoidCell(r, c, rowLayer) {
    var up = tileAt(r - 1, c);
    var down = tileAt(r + 1, c);
    var left = tileAt(r, c - 1);
    var right = tileAt(r, c + 1);
    var ul = tileAt(r - 1, c - 1);
    var ur = tileAt(r - 1, c + 1);
    var dl = tileAt(r + 1, c - 1);
    var dr = tileAt(r + 1, c + 1);
    var nearSolid =
      isRenderableSolid(up) || isRenderableSolid(down) ||
      isRenderableSolid(left) || isRenderableSolid(right) ||
      isRenderableSolid(ul) || isRenderableSolid(ur) ||
      isRenderableSolid(dl) || isRenderableSolid(dr);
    if (!nearSolid) return;

    var tx = c * TILE;
    var ty = r * TILE;
    var openUp = up === null;
    var openDown = down === null;
    var openLeft = left === null;
    var openRight = right === null;
    var openCount = (openUp ? 1 : 0) + (openDown ? 1 : 0) + (openLeft ? 1 : 0) + (openRight ? 1 : 0);
    var clearedKind = clearedTerrainKindAt(r, c);

    drawVoidTerrainBacking(r, c, rowLayer);

    ctx.fillStyle = voidColorForLayer(rowLayer);
    applyVoidCarveShapes(r, c);
  }

  // Paint the void-carve sub-shapes for cell (r, c) using the current ctx
  // fill style and composite mode. Used by drawSmoothVoidCell to carve the
  // visible cave silhouette into dirt backing, AND by the smoke obstacle
  // builder (with destination-out) to subtract the same silhouette from a
  // full-tile obstacle rect — guaranteeing physics matches visuals.
  function applyVoidCarveShapes(r, c) {
    var tx = c * TILE;
    var ty = r * TILE;
    var openUp = tileAt(r - 1, c) === null;
    var openDown = tileAt(r + 1, c) === null;
    var openLeft = tileAt(r, c - 1) === null;
    var openRight = tileAt(r, c + 1) === null;
    var openCount = (openUp ? 1 : 0) + (openDown ? 1 : 0) + (openLeft ? 1 : 0) + (openRight ? 1 : 0);
    var clearedKind = clearedTerrainKindAt(r, c);

    if (!openCount) {
      var jx = (tileHash01(r, c, 0x721) - 0.5) * 3.2;
      var jy = (tileHash01(r, c, 0x722) - 0.5) * 3.2;
      var rx = 8.2 + tileHash01(r, c, 0x723) * 3.2;
      var ry = 7.4 + tileHash01(r, c, 0x724) * 3.0;
      organicBlobPath(tx + TILE * 0.5 + jx, ty + TILE * 0.5 + jy, rx, ry, r, c, 0x725, 10);
      ctx.fill();
      return;
    }

    var margin = clearedKind === 'stone' ? 5.2 : 4.4;
    var bandX = tx + margin;
    var bandY = ty + margin;
    var bandW = TILE - margin * 2;
    var bandH = TILE - margin * 2;
    if (openLeft || openRight) {
      var hxStart = openLeft ? tx - 1.5 : tx + TILE * 0.5 - 1;
      var hxEnd = openRight ? tx + TILE + 1.5 : tx + TILE * 0.5 + 1;
      ctx.beginPath();
      ctx.moveTo(hxStart, bandY + voidBandWave(40, ty + margin, hxStart));
      for (var bxh = hxStart + 4; bxh < hxEnd; bxh += 4) {
        ctx.lineTo(bxh, bandY + voidBandWave(40, ty + margin, bxh));
      }
      ctx.lineTo(hxEnd, bandY + voidBandWave(40, ty + margin, hxEnd));
      ctx.lineTo(hxEnd, bandY + bandH - voidBandWave(41, ty + TILE - margin, hxEnd));
      for (var bxh2 = hxEnd - 4; bxh2 > hxStart; bxh2 -= 4) {
        ctx.lineTo(bxh2, bandY + bandH - voidBandWave(41, ty + TILE - margin, bxh2));
      }
      ctx.lineTo(hxStart, bandY + bandH - voidBandWave(41, ty + TILE - margin, hxStart));
      ctx.closePath();
      ctx.fill();
    }
    if (openUp || openDown) {
      var vyStart = openUp ? ty - 1.5 : ty + TILE * 0.5 - 1;
      var vyEnd = openDown ? ty + TILE + 1.5 : ty + TILE * 0.5 + 1;
      ctx.beginPath();
      ctx.moveTo(bandX + voidBandWave(42, tx + margin, vyStart), vyStart);
      for (var byv = vyStart + 4; byv < vyEnd; byv += 4) {
        ctx.lineTo(bandX + voidBandWave(42, tx + margin, byv), byv);
      }
      ctx.lineTo(bandX + voidBandWave(42, tx + margin, vyEnd), vyEnd);
      ctx.lineTo(bandX + bandW - voidBandWave(43, tx + TILE - margin, vyEnd), vyEnd);
      for (var byv2 = vyEnd - 4; byv2 > vyStart; byv2 -= 4) {
        ctx.lineTo(bandX + bandW - voidBandWave(43, tx + TILE - margin, byv2), byv2);
      }
      ctx.lineTo(bandX + bandW - voidBandWave(43, tx + TILE - margin, vyStart), vyStart);
      ctx.closePath();
      ctx.fill();
    }

    if (openLeft && openUp && isOpenCell(r - 1, c - 1)) {
      drawVoidDiagonalJoin(tx, ty, tx, ty, 1, 1, clearedKind, r, c, 0x731);
    }
    if (openRight && openUp && isOpenCell(r - 1, c + 1)) {
      drawVoidDiagonalJoin(tx, ty, tx + TILE, ty, -1, 1, clearedKind, r, c, 0x741);
    }
    if (openLeft && openDown && isOpenCell(r + 1, c - 1)) {
      drawVoidDiagonalJoin(tx, ty, tx, ty + TILE, 1, -1, clearedKind, r, c, 0x751);
    }
    if (openRight && openDown && isOpenCell(r + 1, c + 1)) {
      drawVoidDiagonalJoin(tx, ty, tx + TILE, ty + TILE, -1, -1, clearedKind, r, c, 0x761);
    }

    var straightHorizontal = openLeft && openRight && !openUp && !openDown;
    var straightVertical = openUp && openDown && !openLeft && !openRight;
    if (!straightHorizontal && !straightVertical) {
      var blobBoost = (openCount >= 3 ? 1.6 : 0) + (clearedKind === 'stone' ? 3.6 : 0);
      organicBlobPath(
        tx + TILE * 0.5 + (tileHash01(r, c, 0x726) - 0.5) * 0.3,
        ty + TILE * 0.5 + (tileHash01(r, c, 0x727) - 0.5) * 0.3,
        12.6 + blobBoost + tileHash01(r, c, 0x728) * 0.6,
        12.0 + blobBoost + tileHash01(r, c, 0x729) * 0.5,
        r, c, 0x72A, 13, 0.10
      );
      ctx.fill();
    }
  }

  // Wavy y/x offset for a void band edge. The wave is purely a function
  // of `travelCoord` (the position along the edge) so adjacent void
  // cells produce a single continuous meandering boundary instead of
  // each tile contributing its own rectangle. Two phases derived from
  // the perpendicular `lineCoord` keep horizontally adjacent corridors
  // from rhyming with each other.
  function voidBandWave(side, lineCoord, travelCoord) {
    var phaseA = tileHash01(Math.floor(lineCoord / 13), side, 0x4D1A) * Math.PI * 2;
    var phaseB = tileHash01(Math.floor(lineCoord / 53), side + 11, 0x71BC) * Math.PI * 2;
    var slow = Math.sin(travelCoord * 0.014 + phaseB) * 1.05;
    var med  = Math.sin(travelCoord * 0.062 + phaseA) * 0.55;
    var fine = Math.sin(travelCoord * 0.18 + phaseA * 1.6) * 0.18;
    return slow + med + fine;
  }

  function updateTerrainClearOverlays(dt) {
    if (!terrainClearOverlays.length) return;
    for (var i = terrainClearOverlays.length - 1; i >= 0; i--) {
      terrainClearOverlays[i].t -= dt;
      if (terrainClearOverlays[i].t <= 0) terrainClearOverlays.splice(i, 1);
    }
  }
  
  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║                                                                      ║
  // ║   CAVE / VOID RENDERING — READ THIS BEFORE TOUCHING ANYTHING BELOW   ║
  // ║                                                                      ║
  // ╠══════════════════════════════════════════════════════════════════════╣
  // ║                                                                      ║
  // ║ This block is the "what does the inside of a tunnel look like"       ║
  // ║ system. It produces the dark organic shapes you see when you mine.   ║
  // ║ Everything an LLM (or future-you) needs to know to safely modify it: ║
  // ║                                                                      ║
  // ║ ── BIG IDEA ──                                                       ║
  // ║ One Path2D per connected cave loop, traced as the boundary between   ║
  // ║ void tiles and solid tiles. The SAME Path2D is used for two things:  ║
  // ║   (a) visual fill — drawSmoothVoids → ctx.fill(path)                 ║
  // ║   (b) smoke collision — smokeFluidPaintObstacle → ctx.fill(path)     ║
  // ║       with destination-out, carving the cave out of the obstacle     ║
  // ║       silhouette so smoke flows along the visible wall to the pixel. ║
  // ║ DO NOT split visuals from collision — the whole point of this        ║
  // ║ design is that they cannot disagree.                                 ║
  // ║                                                                      ║
  // ║ ── PIPELINE ──                                                       ║
  // ║ buildVoidContourPath(startRow, endRow, startCol, endCol) → Path2D    ║
  // ║   1. Enumerate boundary edges (oriented so void is on walker's left).║
  // ║      Tiles outside the rect count as solid, so loops always close.   ║
  // ║   2. Stitch edges into closed loops at shared corners. Saddles       ║
  // ║      (2 void diagonals + 2 solid diagonals → 4 edges meet) are       ║
  // ║      paired by matching void tile so the two caves stay separate.   ║
  // ║   3. Walk each loop and collect TURNS — every direction change.      ║
  // ║      Co-linear runs of edges contribute zero turns, becoming a       ║
  // ║      single straight run (this is what kills tile-grid scallops).    ║
  // ║   4. Emit each loop as: moveTo first turn → for each turn,           ║
  // ║      wobbled polyline run + fillet curve → closePath.                ║
  // ║                                                                      ║
  // ║ ── FILLETS (corners) ──                                              ║
  // ║ A turn corner gets a quadratic Bézier with control point AT THE      ║
  // ║ TILE CORNER for both convex (right turn) and concave (left turn).   ║
  // ║ This is the magic that makes corners tangent-continuous: with        ║
  // ║ entry I units back along prev.dir and exit I units forward along     ║
  // ║ this.dir, ctrl=corner gives B'(0) along prev.dir and B'(1) along     ║
  // ║ this.dir → smooth join with the straight runs, no kink.              ║
  // ║ DO NOT change ctrl to the inset-interior — that was v6.2 and it      ║
  // ║ produced visible "boxy" corners (two 45° kinks with an arc between). ║
  // ║                                                                      ║
  // ║ Saddle corners (where two diagonal cave loops touch) skip the        ║
  // ║ fillet and use sharp lineTo(corner)+lineTo(exit) — otherwise the     ║
  // ║ two cave loops' fillets miss each other by ~I/4 px and you see a     ║
  // ║ small gap right at the diagonal.                                     ║
  // ║                                                                      ║
  // ║ ── WOBBLE (between corners) ──                                       ║
  // ║ Each axis-aligned run between two fillet anchors becomes a polyline  ║
  // ║ whose vertices are displaced perpendicular by 2D smooth-noise        ║
  // ║ sampled at WORLD coords (never tile-local). This is critical:        ║
  // ║ because the noise is f(worldX, worldY), adjacent tile-edges and      ║
  // ║ adjacent chunks all sample the same field and agree at their seams.  ║
  // ║ DO NOT introduce per-tile or per-chunk randomness into the wobble    ║
  // ║ — that was the v5.x "erase-tool overshoot" artifact, where each      ║
  // ║ tile wobbled independently and they didn't line up at boundaries.    ║
  // ║                                                                      ║
  // ║ A smoothstep fade attenuates wobble to zero over VOID_RUN_FADE       ║
  // ║ pixels                                                              ║
  // ║ at each end of the run, so the polyline meets the fillet exactly     ║
  // ║ at the anchor with matching tangent.                                 ║
  // ║                                                                      ║
  // ║ ── TUNABLES (change these to retune feel) ──                         ║
  // ║   VOID_CONVEX_INSET    outer/dead-end corner radius (px).            ║
  // ║   VOID_CONCAVE_INSET   inner bend radius (px).                       ║
  // ║   VOID_RUN_FADE        distance for wobble to fade into corners.     ║
  // ║   WOBBLE_AMP_LOW       long-wavelength meander amplitude (px).       ║
  // ║   WOBBLE_AMP_HIGH      short-wavelength texture amplitude (px).      ║
  // ║   WOBBLE_WAVELEN_LOW   long wavelength (px).                         ║
  // ║   WOBBLE_WAVELEN_HIGH  short wavelength (px).                        ║
  // ║   WOBBLE_SAMPLE_STEP   polyline vertex spacing (px). Smaller =       ║
  // ║                        smoother curves but more verts per chunk.    ║
  // ║                                                                      ║
  // ║ ── INTEGRATION POINTS ──                                             ║
  // ║   Visual:    drawSmoothVoids (~line 5670). Renders dirt/stone        ║
  // ║              backing per-void-tile, then ctx.fill(path) over it.     ║
  // ║   Collision: smokeFluidPaintObstacle (~line 10120). Same path,       ║
  // ║              destination-out fill carves cave from obstacle alpha.   ║
  // ║   Chunks:    renderTerrainChunk (~line 6500) caches each draw and    ║
  // ║              invalidates on tile change via invalidateTerrainAround. ║
  // ║                                                                      ║
  // ║ ── GOTCHAS / HISTORY ──                                              ║
  // ║   • drawSmoothVoidCell (~line 5340) is the LEGACY per-tile renderer. ║
  // ║     Still defined but only called by the now-no-op clear-overlay     ║
  // ║     path. Don't reintroduce it for cave fill — tile-local rendering  ║
  // ║     is what produced the v5.x overshoot and v6.1 scallops.           ║
  // ║   • drawTerrainClearOverlays is intentionally a no-op (v6.4). The    ║
  // ║     "freshly mined" highlight used to redraw with legacy geometry    ║
  // ║     and flashed the old shape on top of the new chunk.               ║
  // ║   • Stones inside caves work via natural opposite-winding inner      ║
  // ║     loops + nonzero fill rule. No special code needed.               ║
  // ║   • Out-of-rect tiles count as solid → loops always close inside     ║
  // ║     the chunk's padded rect. World-coord wobble keeps chunk seams    ║
  // ║     invisible because the noise field is continuous.                 ║
  // ║                                                                      ║
  // ║ When you add new world content (oil pockets, ore veins, fluid sims): ║
  // ║   • If the content is "void-like" (drillable empty space), make it   ║
  // ║     return null from tileAt() and it joins existing cave loops       ║
  // ║     automatically.                                                   ║
  // ║   • If the content is "solid-like" (drillable material), make        ║
  // ║     tileAt() return a non-null kind string. It becomes a wall to     ║
  // ║     the boundary tracer and gets a stone-style inner loop.           ║
  // ║   • For fluid sims that need cave geometry, call                     ║
  // ║     buildVoidContourPath with the rect you care about and use the    ║
  // ║     returned Path2D — same shape, same collision, free.              ║
  // ║                                                                      ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  // === Per-cave organic void polygons (v6.3) =============================
  // Same per-cave-loop topology as v6.2, plus two upgrades:
  //
  //   (1) Tangent-continuous fillets. v6.2's convex fillet placed the Bezier
  //       control point at the inset-interior, which produced a tangent
  //       discontinuity at each fillet endpoint (the wall arrived going one
  //       way, the curve departed at 90°, then arrived at 90° again, then
  //       the wall continued — i.e., two 45° kinks with an arc between).
  //       v6.3 puts the control point at the EXACT TILE CORNER for both
  //       convex and concave turns. Math: with entry I units back along
  //       prev.dir and exit I units forward along this.dir, ctrl = corner
  //       gives B'(0) along prev.dir and B'(1) along this.dir → smooth
  //       fillet that meets the straight runs without a kink.
  //
  //   (2) Organic wobble. Between two fillet anchors, the straight axis-
  //       aligned run becomes a polyline whose vertices are displaced
  //       perpendicular to the run by a deterministic 2D noise function
  //       sampled at world coordinates. Because the noise is purely f(wx,
  //       wy) — never indexed by tile or chunk — the wobble agrees across
  //       tile boundaries and chunk boundaries automatically (no scallops,
  //       no seams, no v5.24-style erase-tool overshoot at tile edges).
  //       A smoothstep fade attenuates the wobble to zero over RUN_FADE pixels
  //       at each end of the run, so the polyline meets the fillet exactly
  //       at the anchor with matching tangent.
  //
  // Saddle corners (2 void diagonals touching) get a sharp corner instead
  // of a fillet — the two cave loops meet at the tile corner with no gap
  // (Option A). Stones inside caves naturally produce a separate inner loop
  // with opposite winding, which the canvas non-zero fill rule subtracts as
  // a hole. The same Path2D feeds the visual fill AND the smoke obstacle
  // destination-out carve, so collision matches visuals to the pixel.

  var VOID_CONVEX_INSET   = 4.0;   // modest outer/dead-end radius without circular corner knuckles
  var VOID_CONCAVE_INSET  = 6.2;   // soft inner bend radius without quarter-round steps
  var VOID_RUN_FADE       = 5.0;   // wobble fade distance near fillets
  var WOBBLE_AMP_LOW      = 1.9;   // long-wavelength meander amplitude (px)
  var WOBBLE_AMP_HIGH     = 1.15;  // short-wavelength texture amplitude (px)
  var WOBBLE_WAVELEN_LOW  = 34;    // long wavelength (px)
  var WOBBLE_WAVELEN_HIGH = 10;    // short wavelength (px)
  var WOBBLE_SAMPLE_STEP  = 4;     // polyline spacing along run (px)

  function _voidSmoothstep(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  // Cheap integer hash → [0,1). Same (x, y, salt) → same value, every time.
  function _voidHash01(x, y, salt) {
    var h = ((x | 0) * 0x27d4eb2d) | 0;
    h = (h ^ (h >>> 15)) | 0;
    h = (h + ((y | 0) * 0x165667b1)) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = (h + ((salt | 0) * 0x1b873593)) | 0;
    h = (h ^ (h >>> 16)) | 0;
    return (h >>> 0) / 4294967296;
  }

  // Smooth 2D value noise in [-1, 1], C1-continuous via smoothstep blend.
  function _voidNoise2D(x, y, salt) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var n00 = _voidHash01(xi,     yi,     salt);
    var n10 = _voidHash01(xi + 1, yi,     salt);
    var n01 = _voidHash01(xi,     yi + 1, salt);
    var n11 = _voidHash01(xi + 1, yi + 1, salt);
    var nx0 = n00 + u * (n10 - n00);
    var nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 2 - 1;
  }

  // Perpendicular wobble displacement at world position (wx, wy). Two-octave
  // sum of smooth noise. Sign: positive = into the cave (left of walker),
  // negative = into the solid material.
  function _voidWobble(wx, wy) {
    return WOBBLE_AMP_LOW  * _voidNoise2D(wx / WOBBLE_WAVELEN_LOW,  wy / WOBBLE_WAVELEN_LOW,  0xA1)
         + WOBBLE_AMP_HIGH * _voidNoise2D(wx / WOBBLE_WAVELEN_HIGH, wy / WOBBLE_WAVELEN_HIGH, 0xB2);
  }

  // Emit a wobbled polyline from (x0, y0) to (x1, y1) along axis-aligned
  // direction `dir` (0=R, 1=D, 2=L, 3=U). Path is already positioned at
  // (x0, y0); we lineTo each interior sample and finally lineTo (x1, y1).
  // Wobble is attenuated by a smoothstep fade over VOID_RUN_FADE pixels at
  // each end so the polyline joins the fillet tangent-continuously.
  function emitWobbledRun(path, x0, y0, x1, y1, dir) {
    var dx, dy;
    if      (dir === 0) { dx =  1; dy =  0; }
    else if (dir === 1) { dx =  0; dy =  1; }
    else if (dir === 2) { dx = -1; dy =  0; }
    else                { dx =  0; dy = -1; }
    var px = -dy, py = dx;   // left-perpendicular (into void)
    var L = (x1 - x0) * dx + (y1 - y0) * dy;
    if (L <= 0.001) { path.lineTo(x1, y1); return; }
    var step = WOBBLE_SAMPLE_STEP;
    var fade = VOID_RUN_FADE;
    var nSteps = Math.max(1, Math.floor(L / step));
    for (var i = 1; i < nSteps; i++) {
      var d = i * step;
      var att = Math.min(_voidSmoothstep(d / fade), _voidSmoothstep((L - d) / fade));
      if (att <= 0) continue;
      var ax = x0 + dx * d;
      var ay = y0 + dy * d;
      var disp = att * _voidWobble(ax, ay);
      path.lineTo(ax + px * disp, ay + py * disp);
    }
    path.lineTo(x1, y1);
  }

  function buildVoidContourPath(startRow, endRow, startCol, endCol) {
    var path = new Path2D();
    var T = TILE;

    // Boundary detector: out-of-rect counts as solid so loops close locally.
    function isVoidIn(r, c) {
      if (r < startRow || r > endRow || c < startCol || c > endCol) return false;
      return tileAt(r, c) === null;
    }
    function isSolidIn(r, c) {
      if (r < startRow || r > endRow || c < startCol || c > endCol) return true;
      return tileAt(r, c) !== null;
    }

    // Edge dirs: 0=Right(+X), 1=Down(+Y), 2=Left(-X), 3=Up(-Y).
    // With void on the walker's left (left-perp = (-dy, dx)):
    //   R → left = +Y (DOWN);  D → left = -X (LEFT);
    //   L → left = -Y (UP);    U → left = +X (RIGHT).
    // For each void tile (r, c) at top-left corner (c, r):
    //   solid above: TOP wall, walks R from (c, r) to (c+1, r)
    //   solid right: RIGHT wall, walks D from (c+1, r) to (c+1, r+1)
    //   solid below: BOTTOM wall, walks L from (c+1, r+1) to (c, r+1)
    //   solid left:  LEFT wall, walks U from (c, r+1) to (c, r)

    var edges = [];
    var outAt = {};
    var inAt  = {};
    var saddleCorners = {};

    function ckey(cc, cr) { return cc + ',' + cr; }

    function emitSoftVoidCorner(path, turn) {
      var ex = turn.entry[0], ey = turn.entry[1];
      var xx = turn.exit[0],  xy = turn.exit[1];
      var cx = turn.corner[0], cy = turn.corner[1];
      var midX = (ex + xx) * 0.5;
      var midY = (ey + xy) * 0.5;
      var turnDelta = (turn.nextDir - turn.runDir + 4) % 4;
      var pullNoise = _voidHash01(cx / TILE, cy / TILE, 0xC0E7) - 0.5;
      var pull = (turnDelta === 1 ? 0.56 : 0.44) + pullNoise * 0.14;
      var ctrlX = midX + (cx - midX) * pull;
      var ctrlY = midY + (cy - midY) * pull;
      path.quadraticCurveTo(ctrlX, ctrlY, xx, xy);
    }

    function addEdge(dir, sc, sr, ec, er, vr, vc) {
      var idx = edges.length;
      edges.push({
        dir: dir, sc: sc, sr: sr, ec: ec, er: er,
        vr: vr, vc: vc, used: false, next: -1
      });
      var sk = ckey(sc, sr), ek = ckey(ec, er);
      (outAt[sk] = outAt[sk] || []).push(idx);
      (inAt[ek]  = inAt[ek]  || []).push(idx);
      return idx;
    }

    for (var r = startRow; r <= endRow; r++) {
      for (var c = startCol; c <= endCol; c++) {
        if (!isVoidIn(r, c)) continue;
        if (isSolidIn(r - 1, c)) addEdge(0, c,     r,     c + 1, r,     r, c);
        if (isSolidIn(r, c + 1)) addEdge(1, c + 1, r,     c + 1, r + 1, r, c);
        if (isSolidIn(r + 1, c)) addEdge(2, c + 1, r + 1, c,     r + 1, r, c);
        if (isSolidIn(r, c - 1)) addEdge(3, c,     r + 1, c,     r,     r, c);
      }
    }

    if (!edges.length) return path;

    // Pair incoming → outgoing at every corner. Non-saddle: 1 in + 1 out,
    // trivial. Saddle: 2 + 2, match by void tile so the two caves stay split.
    for (var k in outAt) {
      if (!Object.prototype.hasOwnProperty.call(outAt, k)) continue;
      var ins  = inAt[k]  || [];
      var outs = outAt[k] || [];
      if (ins.length === 1 && outs.length === 1) {
        edges[ins[0]].next = outs[0];
        continue;
      }
      if (ins.length >= 2 && outs.length >= 2) saddleCorners[k] = true;
      for (var ii = 0; ii < ins.length; ii++) {
        var ie = edges[ins[ii]];
        if (ie.next !== -1) continue;
        for (var jj = 0; jj < outs.length; jj++) {
          var oe = edges[outs[jj]];
          if (oe.vr === ie.vr && oe.vc === ie.vc) {
            var taken = false;
            for (var kk = 0; kk < ins.length; kk++) {
              if (edges[ins[kk]].next === outs[jj]) { taken = true; break; }
            }
            if (!taken) { ie.next = outs[jj]; break; }
          }
        }
      }
    }

    // Walk each loop and emit Path2D commands.
    for (var startIdx = 0; startIdx < edges.length; startIdx++) {
      if (edges[startIdx].used) continue;
      if (edges[startIdx].next === -1) { edges[startIdx].used = true; continue; }

      var loop = [];
      var cur = startIdx;
      var safety = edges.length + 4;
      while (cur !== -1 && !edges[cur].used && safety-- > 0) {
        edges[cur].used = true;
        loop.push(cur);
        cur = edges[cur].next;
        if (cur === startIdx) break;
      }
      var n = loop.length;
      if (n < 2) continue;

      // Collect every direction-change corner as a "turn" record. Co-linear
      // runs of edges contribute zero turns — those become single wobbled
      // straight runs spanning the full collapsed length.
      // Each turn records: entry (anchor on prev edge, I back along prev.dir),
      //                    exit  (anchor on this edge, I forward along this.dir),
      //                    corner, runDir (= prev.dir, the direction of the
      //                    incoming run that ends at this turn's entry),
      //                    nextDir (= this.dir, run direction leaving exit),
      //                    saddle flag.
      var turns = [];
      for (var kk2 = 0; kk2 < n; kk2++) {
        var prevE = edges[loop[(kk2 - 1 + n) % n]];
        var thisE = edges[loop[kk2]];
        if (prevE.dir === thisE.dir) continue;
        var Cx = thisE.sc * T;
        var Cy = thisE.sr * T;
        var turnDelta = (thisE.dir - prevE.dir + 4) % 4;
        var cornerNoise = _voidHash01(thisE.sc, thisE.sr, 0xC041) - 0.5;
        var I = (turnDelta === 1 ? VOID_CONVEX_INSET : VOID_CONCAVE_INSET) * (0.84 + cornerNoise * 0.28);
        var ex, ey;
        if      (prevE.dir === 0) { ex = Cx - I; ey = Cy; }
        else if (prevE.dir === 1) { ex = Cx;     ey = Cy - I; }
        else if (prevE.dir === 2) { ex = Cx + I; ey = Cy; }
        else                      { ex = Cx;     ey = Cy + I; }
        var xx, xy;
        if      (thisE.dir === 0) { xx = Cx + I; xy = Cy; }
        else if (thisE.dir === 1) { xx = Cx;     xy = Cy + I; }
        else if (thisE.dir === 2) { xx = Cx - I; xy = Cy; }
        else                      { xx = Cx;     xy = Cy - I; }
        turns.push({
          entry: [ex, ey], exit: [xx, xy], corner: [Cx, Cy],
          runDir: prevE.dir, nextDir: thisE.dir,
          saddle: !!saddleCorners[ckey(thisE.sc, thisE.sr)]
        });
      }
      if (turns.length === 0) continue;

      // Emit. Start at first turn's exit; for each turn, wobble-run from the
      // PREVIOUS turn's exit to THIS turn's entry, then fillet through THIS
      // turn's corner to its exit. Loops naturally by walking the turns array.
      // Saddle turns: replace fillet with sharp corner (lineTo corner, lineTo
      // exit) so the two cave loops meet exactly at the tile corner.
      path.moveTo(turns[0].exit[0], turns[0].exit[1]);
      var nT = turns.length;
      for (var t = 0; t < nT; t++) {
        var prevTurn = turns[t];
        var nextTurn = turns[(t + 1) % nT];
        emitWobbledRun(path,
          prevTurn.exit[0],  prevTurn.exit[1],
          nextTurn.entry[0], nextTurn.entry[1],
          prevTurn.nextDir);
        if (nextTurn.saddle) {
          path.lineTo(nextTurn.corner[0], nextTurn.corner[1]);
          path.lineTo(nextTurn.exit[0],   nextTurn.exit[1]);
        } else {
          emitSoftVoidCorner(path, nextTurn);
        }
      }
      path.closePath();
    }

    return path;
  }

  function drawSurfaceVoidMouths(startCol, endCol) {
    var r = SKY_ROWS;
    var ty = r * TILE;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (var c = startCol; c <= endCol; c++) {
      if (tileAt(r, c) !== null) continue;
      var leftSolid = isRenderableSolid(tileAt(r, c - 1));
      var rightSolid = isRenderableSolid(tileAt(r, c + 1));
      var downSolid = isRenderableSolid(tileAt(r + 1, c));
      if (!leftSolid && !rightSolid && !downSolid) continue;

      var tx = c * TILE;
      var lip = 7.5;
      var drop = 18.5;
      var waveA = edgeWave('dirt', 82, ty, tx + TILE * 0.33) * 0.45;
      var waveB = edgeWave('dirt', 83, ty, tx + TILE * 0.66) * 0.45;

      ctx.beginPath();
      ctx.moveTo(tx - 1.5, ty - 3);
      ctx.lineTo(tx + TILE + 1.5, ty - 3);
      ctx.lineTo(tx + TILE + 1.5, ty + lip);
      ctx.quadraticCurveTo(tx + TILE * 0.94, ty + drop + waveB, tx + TILE * 0.64, ty + drop - 2 + waveB);
      ctx.quadraticCurveTo(tx + TILE * 0.50, ty + drop + 1.5, tx + TILE * 0.36, ty + drop - 2 + waveA);
      ctx.quadraticCurveTo(tx + TILE * 0.06, ty + drop + waveA, tx - 1.5, ty + lip);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Organic voids are rendered into terrain chunks, so the expensive
  // carve/backing work runs only when a nearby tile changes.
  function drawSmoothVoids(startRow, endRow, startCol, endCol) {
    ctx.save();
    var r0 = Math.max(SKY_ROWS, startRow - 1);
    var r1 = Math.min(TOTAL_ROWS - 1, endRow + 1);
    var c0 = Math.max(0, startCol - 1);
    var c1 = Math.min(COLS - 1, endCol + 1);
    // The chunk's cave voids are punched out to transparent here so the
    // parallax wall (drawn behind the chunks in the underground-bg pass)
    // shows through. The cave shape MUST be the smooth marching-squares
    // contour — but empty cells render to nothing, so on their own they
    // leave the cave a grid of right-angled tile squares (the v13.11 bug:
    // erasing the contour did nothing where the cells were already
    // transparent). v13.12 fixes it with two composited steps:
    //   1. destination-over — flood a rock backing BEHIND the tiles so
    //      every empty cell becomes opaque. The cave is then no longer
    //      defined by which cells happen to be empty.
    //   2. destination-out — erase along the smooth contour, punching the
    //      cave out in exactly that rounded + wobbled shape.
    // Net: the chunk is opaque everywhere except the smooth contour. The
    // backing only survives in the few-px slivers between contour and tile
    // grid, where it reads as the organic cave lip (it is the lip colour).
    var path = buildVoidContourPath(r0, r1, c0, c1);
    var voidBackLayer = getLayerForCam(Math.floor((r0 + r1) * 0.5) - SKY_ROWS);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = materialPalette('dirt', materialLayer(voidBackLayer)).mid;
    ctx.fillRect(c0 * TILE, r0 * TILE, (c1 - c0 + 1) * TILE, (r1 - r0 + 1) * TILE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
    if (r0 <= SKY_ROWS && r1 >= SKY_ROWS) drawSurfaceVoidMouths(c0, c1);
    ctx.restore();
    return path;
  }

  function drawOrganicOpenEdges(kind, tx, ty, r, c, layerName, n) {
    var pal = materialPalette(kind, layerName);
    var lip = kind === 'dirt' ? pal.mid : pal.bot;
    var softShade = kind === 'dirt' ? 'rgba(30,15,7,0.045)' : 'rgba(8,9,8,0.045)';
    var softHi = kind === 'dirt' ? 'rgba(230,150,85,0.028)' : 'rgba(235,235,215,0.026)';
    var step = 8;

    ctx.save();
    ctx.lineJoin = 'round';

    if (n.openUp) {
      var upPoints = [];
      for (var x = -step; x <= TILE + step; x += step) {
        var ux = tx + x;
        upPoints.push({ x: ux, y: ty - edgeWave(kind, 0, ty, ux) });
      }
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.moveTo(tx - step, ty);
      curveThrough(upPoints, true);
      ctx.lineTo(tx + TILE + step, ty);
      ctx.closePath();
      ctx.fill();
      textureCurrentPath(kind, tx, ty, r, c, layerName);

      ctx.strokeStyle = softHi;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      var topShadow = [];
      for (var sx = -step; sx <= TILE + step; sx += step) {
        var sux = tx + sx;
        topShadow.push({ x: sux, y: ty - edgeWave(kind, 0, ty, sux) * 0.45 });
      }
      curveThrough(topShadow, false);
      ctx.stroke();
    }

    if (n.openDown) {
      var downPoints = [];
      for (var x2 = -step; x2 <= TILE + step; x2 += step) {
        var dx2 = tx + x2;
        downPoints.push({ x: dx2, y: ty + TILE + edgeWave(kind, 1, ty + TILE, dx2) });
      }
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.moveTo(tx - step, ty + TILE);
      curveThrough(downPoints, true);
      ctx.lineTo(tx + TILE + step, ty + TILE);
      ctx.closePath();
      ctx.fill();
      textureCurrentPath(kind, tx, ty, r, c, layerName);

      ctx.strokeStyle = softShade;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      var downShadow = [];
      for (var dx = -step; dx <= TILE + step; dx += step) {
        var dsx = tx + dx;
        downShadow.push({ x: dsx, y: ty + TILE - 1 + edgeWave(kind, 1, ty + TILE, dsx) * 0.18 });
      }
      curveThrough(downShadow, false);
      ctx.stroke();
    }

    if (n.openLeft) {
      var leftPoints = [];
      for (var y = -step; y <= TILE + step; y += step) {
        var ly0 = ty + y;
        leftPoints.push({ x: tx - edgeWave(kind, 2, tx, ly0), y: ly0 });
      }
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.moveTo(tx, ty - step);
      curveThrough(leftPoints, true);
      ctx.lineTo(tx, ty + TILE + step);
      ctx.closePath();
      ctx.fill();
      textureCurrentPath(kind, tx, ty, r, c, layerName);

      ctx.strokeStyle = softHi;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      var leftShadow = [];
      for (var ly = -step; ly <= TILE + step; ly += step) {
        var lsy = ty + ly;
        leftShadow.push({ x: tx - edgeWave(kind, 2, tx, lsy) * 0.45, y: lsy });
      }
      curveThrough(leftShadow, false);
      ctx.stroke();
    }

    if (n.openRight) {
      var rightPoints = [];
      for (var y2 = -step; y2 <= TILE + step; y2 += step) {
        var ry0 = ty + y2;
        rightPoints.push({ x: tx + TILE + edgeWave(kind, 3, tx + TILE, ry0), y: ry0 });
      }
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.moveTo(tx + TILE, ty - step);
      curveThrough(rightPoints, true);
      ctx.lineTo(tx + TILE, ty + TILE + step);
      ctx.closePath();
      ctx.fill();
      textureCurrentPath(kind, tx, ty, r, c, layerName);

      ctx.strokeStyle = softShade;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      var rightShadow = [];
      for (var ry = -step; ry <= TILE + step; ry += step) {
        var rsy = ty + ry;
        rightShadow.push({ x: tx + TILE + edgeWave(kind, 3, tx + TILE, rsy) * 0.18, y: rsy });
      }
      curveThrough(rightShadow, false);
      ctx.stroke();
    }

    drawOpenCornerRounds(kind, tx, ty, r, c, layerName, n);

    ctx.restore();
  }

  function drawMaterialContactEdges(tx, ty, n) {
    // Solid-to-solid material changes should read as a terrain transition,
    // not as boxed tiles. Open tunnel edges are handled by drawOrganicOpenEdges.
  }

  function drawMaterialTile(kind, tx, ty, r, c, rowLayer) {
    var layerName = materialLayer(rowLayer);
    if (layerName === 'magma' || layerName === 'mantle') {
      layerName = kind === 'stone' ? 'bedrock' : 'deepcrust';
    }
    var n = materialNeighbors(r, c, kind);
    drawMaterialWorldWash(kind, tx, ty, r, c, layerName, n);
    if (kind === 'dirt') drawDirtMassDetail(tx, ty, r, c, layerName, n);
    else drawStoneMassDetail(tx, ty, r, c, layerName, n);
    drawTerrainBlend(kind, tx, ty, layerName, n);
    drawMaterialContactEdges(tx, ty, n);
  }

