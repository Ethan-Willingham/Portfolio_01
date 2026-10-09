/* Water machine geometry only. Coordinates are world pixels; width/height are
 * wall-grid cell counts. No liquid, gas state, clocks or simulation are stored.
 * Host integration must wake materials and synchronize topology in onChange.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WaterMachinesBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 1, PREFIX = 'wmb1.', PARAM = 'build';
  var MAX_CELLS = 262144, MAX_SIDE = 1024, MAX_PARTS = 256;
  var MAX_POINTS = 512, MAX_BYTES = 18000, MAX_TOKEN = 24000;
  var TYPES = ['pipe', 'vessel', 'vent', 'check', 'flap', 'nozzle'];
  var DIRECTIONS = ['up', 'right', 'down', 'left'];
  function fail(message) { throw new Error('Build: ' + message); }
  function number(n, name, min, max) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) fail('invalid ' + name);
    return n;
  }
  function integer(n, name, min, max) {
    number(n, name, min, max);
    if (!Number.isInteger(n)) fail('invalid ' + name);
    return n;
  }
  function bool(v, name) { if (typeof v !== 'boolean') fail('invalid ' + name); return v; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function keys(value, allowed, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid ' + name);
    Object.keys(value).forEach(function (key) { if (allowed.indexOf(key) < 0) fail('unknown ' + name + ' field'); });
  }
  function dimensions(width, height, tile) {
    integer(width, 'width', 3, MAX_SIDE); integer(height, 'height', 3, MAX_SIDE);
    integer(tile, 'tile', 1, 64);
    if (width * height > MAX_CELLS) fail('grid too large');
  }
  function wallsValid(walls, width, height) {
    if (!(walls instanceof Uint8Array) || walls.length !== width * height) fail('wall grid size mismatch');
    for (var i = 0; i < walls.length; i++) if (walls[i] !== 0 && walls[i] !== 1) fail('walls must be binary');
  }
  function aligned(n, tile, half) { return Math.abs(n / tile - (half ? 0.5 : 0) - Math.round(n / tile - (half ? 0.5 : 0))) < 1e-8; }
  function rectValid(rect, width, height, tile) {
    keys(rect, ['x', 'y', 'width', 'height'], 'rectangle');
    number(rect.x, 'x', tile, (width - 2) * tile);
    number(rect.y, 'y', tile, (height - 2) * tile);
    number(rect.width, 'rectangle width', tile, width * tile);
    number(rect.height, 'rectangle height', tile, height * tile);
    if (rect.x + rect.width > (width - 1) * tile || rect.y + rect.height > (height - 1) * tile) fail('rectangle outside editable grid');
    if (![rect.x, rect.y, rect.width, rect.height].every(function (n) { return aligned(n, tile, false); })) fail('rectangle is not snapped');
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  function pointValid(point, width, height, tile) {
    keys(point, ['x', 'y'], 'point');
    number(point.x, 'point x', tile * 1.5, (width - 1.5) * tile);
    number(point.y, 'point y', tile * 1.5, (height - 1.5) * tile);
    if (!aligned(point.x, tile, true) || !aligned(point.y, tile, true)) fail('point is not snapped');
    return { x: point.x, y: point.y };
  }
  function validateParts(parts, width, height, tile) {
    if (!Array.isArray(parts) || parts.length > MAX_PARTS) fail('too many parts');
    var ids = Object.create(null);
    return parts.map(function (part) {
      keys(part, ['id', 'type', 'points', 'bore', 'rect', 'sealed', 'open', 'direction', 'mass', 'crackingPressure', 'hysteresis', 'material'], 'part');
      if (typeof part.id !== 'string' || !/^p[1-9][0-9]{0,8}$/.test(part.id) || ids[part.id]) fail('invalid or duplicate part id');
      ids[part.id] = true;
      if (TYPES.indexOf(part.type) < 0) fail('unknown part type');
      var p = { id: part.id, type: part.type };
      if (part.material !== undefined) {
        if (part.material !== 'glass' && part.material !== 'opaque') fail('invalid material');
        p.material = part.material;
      }
      if (part.type === 'pipe') {
        if (!Array.isArray(part.points) || part.points.length < 2 || part.points.length > MAX_POINTS) fail('invalid pipe points');
        p.points = part.points.map(function (point) { return pointValid(point, width, height, tile); });
        for (var i = 1; i < p.points.length; i++) {
          var a = p.points[i - 1], b = p.points[i];
          if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y)) fail('pipe must have distinct orthogonal segments');
        }
        p.bore = number(part.bore, 'bore', tile, Math.min(width, height) * tile);
        if (!aligned(p.bore, tile, false)) fail('bore is not snapped');
      } else {
        p.rect = rectValid(part.rect, width, height, tile);
        if (part.type === 'vessel') {
          if (p.rect.width < 3 * tile || p.rect.height < 3 * tile) fail('vessel too small');
          p.sealed = bool(part.sealed, 'sealed');
        } else if (part.type === 'vent') p.open = bool(part.open, 'open');
        else {
          if (DIRECTIONS.indexOf(part.direction) < 0) fail('invalid direction');
          p.direction = part.direction;
          if (part.type === 'nozzle') {
            p.bore = number(part.bore, 'bore', tile, Math.min(width, height) * tile);
            if (!aligned(p.bore, tile, false)) fail('bore is not snapped');
          } else {
            p.open = bool(part.open, 'open');
            p.mass = number(part.mass, 'mass', 0.000001, 1000000);
            p.crackingPressure = number(part.crackingPressure, 'cracking pressure', 0, 1000000000);
            p.hysteresis = number(part.hysteresis, 'hysteresis', 0, 1000000000);
          }
        }
      }
      Object.keys(part).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(p, key)) fail('field does not belong to part type'); });
      return p;
    });
  }
  function base64Encode(text) {
    var encoded;
    if (typeof btoa === 'function') encoded = btoa(text);
    else if (typeof Buffer !== 'undefined') encoded = Buffer.from(text, 'ascii').toString('base64');
    else fail('base64 encoding unavailable');
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function base64Decode(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) fail('invalid share encoding');
    var padded = text.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) padded += '=';
    var decoded;
    try {
      if (typeof atob === 'function') decoded = atob(padded);
      else if (typeof Buffer !== 'undefined') decoded = Buffer.from(padded, 'base64').toString('ascii');
      else fail('base64 decoding unavailable');
    } catch (_) { fail('invalid share encoding'); }
    if (decoded.length > MAX_BYTES || base64Encode(decoded) !== text) fail('noncanonical or oversized share');
    return decoded;
  }
  function tokenFrom(input) {
    if (typeof input !== 'string' || input.length > MAX_TOKEN + 4096) fail('share is too large');
    if (input.indexOf('wmb') === 0) return input;
    var url;
    try { url = new URL(input); } catch (_) { fail('invalid share URL'); }
    var token = url.searchParams.get(PARAM);
    if (!token) fail('share URL has no build');
    return token;
  }
  function encode(state) {
    dimensions(state.width, state.height, state.tile);
    wallsValid(state.walls, state.width, state.height);
    var parts = validateParts(state.parts || [], state.width, state.height, state.tile);
    var runs = [], bit = state.walls[0], current = bit, count = 0;
    for (var i = 0; i < state.walls.length; i++) {
      if (state.walls[i] === current) count++;
      else { runs.push(count); count = 1; current = state.walls[i]; }
    }
    runs.push(count);
    var json = JSON.stringify({ v: VERSION, width: state.width, height: state.height, tile: state.tile, bit: bit, runs: runs, parts: parts });
    if (json.length > MAX_BYTES) fail('build is too detailed for a URL');
    var token = PREFIX + base64Encode(json);
    if (token.length > MAX_TOKEN) fail('build is too detailed for a URL');
    return token;
  }
  function decode(input) {
    var token = tokenFrom(input);
    if (token.length > MAX_TOKEN) fail('share is too large');
    if (token.indexOf(PREFIX) !== 0) fail('unsupported share version');
    var state;
    try { state = JSON.parse(base64Decode(token.slice(PREFIX.length))); }
    catch (error) { if (error.message.indexOf('Build:') === 0) throw error; fail('invalid share document'); }
    keys(state, ['v', 'width', 'height', 'tile', 'bit', 'runs', 'parts'], 'share');
    if (state.v !== VERSION) fail('unsupported share version');
    dimensions(state.width, state.height, state.tile);
    integer(state.bit, 'initial wall bit', 0, 1);
    if (!Array.isArray(state.runs) || !state.runs.length || state.runs.length > MAX_CELLS) fail('invalid wall runs');
    var size = state.width * state.height, sum = 0;
    state.runs.forEach(function (run) { sum += integer(run, 'wall run', 1, size); if (sum > size) fail('wall runs overflow grid'); });
    if (sum !== size) fail('wall runs do not fill grid');
    var parts = validateParts(state.parts, state.width, state.height, state.tile);
    var walls = new Uint8Array(size), offset = 0, bit = state.bit;
    state.runs.forEach(function (run) { walls.fill(bit, offset, offset + run); offset += run; bit = 1 - bit; });
    return { width: state.width, height: state.height, tile: state.tile, walls: walls, parts: parts };
  }
  function Builder(options) {
    options = options || {};
    dimensions(options.width, options.height, options.tile);
    wallsValid(options.walls, options.width, options.height);
    this.width = options.width; this.height = options.height; this.tile = options.tile;
    this.walls = options.walls; this.parts = []; this.revision = 0;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    this.historyLimit = options.historyLimit === undefined ? 50 : integer(options.historyLimit, 'history limit', 1, 100);
    this.historyBytes = 8 * 1024 * 1024; this._past = []; this._future = []; this._pending = null; this._nextId = 1;
  }
  Builder.prototype._snapshot = function () { return { walls: this.walls.slice(), parts: clone(this.parts) }; };
  Builder.prototype._diff = function (before) {
    var indices = [];
    for (var i = 0; i < this.walls.length; i++) if (before.walls[i] !== this.walls[i]) indices.push(i);
    return { indices: indices, changed: indices.length > 0 || JSON.stringify(before.parts) !== JSON.stringify(this.parts) };
  };
  Builder.prototype._notify = function (reason, indices) {
    this.revision++;
    this.onChange({ reason: reason, indices: indices, parts: this.getParts(), revision: this.revision, walls: this.walls });
  };
  Builder.prototype._restore = function (snapshot, reason) {
    var before = this._snapshot(); this.walls.set(snapshot.walls); this.parts = clone(snapshot.parts);
    var diff = this._diff(before); if (diff.changed) this._notify(reason, diff.indices);
  };
  Builder.prototype.begin = function (label) {
    if (this._pending) fail('gesture already active');
    this._pending = { label: typeof label === 'string' ? label.slice(0, 80) : 'build', before: this._snapshot() };
    return this;
  };
  Builder.prototype.commit = function () {
    if (!this._pending) return false;
    var pending = this._pending; this._pending = null;
    var diff = this._diff(pending.before); if (!diff.changed) return false;
    var after = this._snapshot();
    this._past.push({ label: pending.label, before: pending.before, after: after }); this._future = [];
    var bytes = this._past.reduce(function (sum, item) { return sum + item.before.walls.length * 2 + JSON.stringify(item.before.parts).length + JSON.stringify(item.after.parts).length; }, 0);
    while (this._past.length > this.historyLimit || (bytes > this.historyBytes && this._past.length > 1)) {
      var old = this._past.shift(); bytes -= old.before.walls.length * 2 + JSON.stringify(old.before.parts).length + JSON.stringify(old.after.parts).length;
    }
    this._notify(pending.label, diff.indices); return true;
  };
  Builder.prototype.cancel = function () {
    if (!this._pending) return false;
    var before = this._pending.before; this._pending = null; this._restore(before, 'cancel'); return true;
  };
  Builder.prototype._edit = function (label, operation) {
    var own = !this._pending; if (own) this.begin(label);
    var result;
    try { result = operation(); } catch (error) { if (own) this.cancel(); throw error; }
    if (own) this.commit(); return result;
  };
  Builder.prototype.undo = function () {
    if (this._pending) fail('finish the gesture before undo');
    if (!this._past.length) return false;
    var record = this._past.pop(); this._future.push(record); this._restore(record.before, 'undo'); return true;
  };
  Builder.prototype.redo = function () {
    if (this._pending) fail('finish the gesture before redo');
    if (!this._future.length) return false;
    var record = this._future.pop(); this._past.push(record); this._restore(record.after, 'redo'); return true;
  };
  Builder.prototype.clearHistory = function () {
    if (this._pending) fail('finish the gesture before clearing history');
    this._past = []; this._future = [];
  };
  Builder.prototype.getParts = function () { return clone(this.parts); };
  Builder.prototype.snap = function (point) {
    number(point.x, 'point x', -1000000, 1000000); number(point.y, 'point y', -1000000, 1000000);
    var c = Math.max(1, Math.min(this.width - 2, Math.round(point.x / this.tile - 0.5)));
    var r = Math.max(1, Math.min(this.height - 2, Math.round(point.y / this.tile - 0.5)));
    return { x: (c + 0.5) * this.tile, y: (r + 0.5) * this.tile };
  };
  Builder.prototype._rect = function (rect, minimum) {
    keys(rect, ['x', 'y', 'width', 'height'], 'rectangle');
    number(rect.x, 'x', -1000000, 1000000); number(rect.y, 'y', -1000000, 1000000);
    number(rect.width, 'rectangle width', this.tile, this.width * this.tile);
    number(rect.height, 'rectangle height', this.tile, this.height * this.tile);
    var t = this.tile;
    var x = Math.max(t, Math.min((this.width - 1 - minimum) * t, Math.round(rect.x / t) * t));
    var y = Math.max(t, Math.min((this.height - 1 - minimum) * t, Math.round(rect.y / t) * t));
    return rectValid({ x: x, y: y, width: Math.max(minimum * t, Math.min((this.width - 1) * t - x, Math.round(rect.width / t) * t)), height: Math.max(minimum * t, Math.min((this.height - 1) * t - y, Math.round(rect.height / t) * t)) }, this.width, this.height, t);
  };
  Builder.prototype._set = function (c, r, solid) {
    if (c <= 0 || r <= 0 || c >= this.width - 1 || r >= this.height - 1) return;
    this.walls[r * this.width + c] = solid ? 1 : 0;
  };
  Builder.prototype._part = function (part) {
    if (this.parts.length >= MAX_PARTS) fail('too many parts');
    part.id = 'p' + this._nextId++;
    var valid = validateParts([part], this.width, this.height, this.tile)[0];
    this.parts.push(valid); return clone(valid);
  };
  Builder.prototype.strokePipe = function (points, bore) {
    if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS / 2) fail('invalid pipe stroke');
    number(bore, 'bore', this.tile, Math.min(this.width, this.height) * this.tile);
    var self = this, path = [], snapped = points.map(function (point) { return self.snap(point); });
    function append(point) { var last = path[path.length - 1]; if (!last || last.x !== point.x || last.y !== point.y) path.push(point); }
    append(snapped[0]);
    for (var n = 1; n < snapped.length; n++) { var a = path[path.length - 1], b = snapped[n]; if (a.x !== b.x && a.y !== b.y) append({ x: b.x, y: a.y }); append(b); }
    if (path.length < 2) fail('pipe needs a nonzero segment');
    var cellsAcross = Math.ceil(bore / this.tile), actualBore = cellsAcross * this.tile;
    var low = Math.floor((cellsAcross - 1) / 2), high = cellsAcross - 1 - low;
    var interior = new Set(), shell = new Set(), mouths = new Set(), w = this.width, h = this.height, t = this.tile;
    function cell(point) { return { c: Math.floor(point.x / t), r: Math.floor(point.y / t) }; }
    function inside(c, r) { if (c <= 0 || r <= 0 || c >= w - 1 || r >= h - 1) fail('pipe bore or walls outside editable grid'); interior.add(r * w + c); }
    for (var j = 1; j < path.length; j++) {
      var p = cell(path[j - 1]), q = cell(path[j]);
      var c0 = p.c === q.c ? p.c - low : Math.min(p.c, q.c), c1 = p.c === q.c ? p.c + high : Math.max(p.c, q.c);
      var r0 = p.r === q.r ? p.r - low : Math.min(p.r, q.r), r1 = p.r === q.r ? p.r + high : Math.max(p.r, q.r);
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) inside(c, r);
    }
    // A complete bore-sized square at each bend preserves passage width.
    for (var bend = 1; bend < path.length - 1; bend++) {
      var corner = cell(path[bend]);
      for (var br = corner.r - low; br <= corner.r + high; br++) for (var bc = corner.c - low; bc <= corner.c + high; bc++) inside(bc, br);
    }
    interior.forEach(function (index) {
      var c = index % w, r = Math.floor(index / w);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nc = c + dx, nr = r + dy, idx = nr * w + nc;
        if (nc <= 0 || nr <= 0 || nc >= w - 1 || nr >= h - 1) fail('pipe walls outside editable grid');
        if (!interior.has(idx)) shell.add(idx);
      }
    });
    function mouth(endpoint, neighbor) {
      var p = cell(endpoint), q = cell(neighbor), dx = Math.sign(p.c - q.c), dy = Math.sign(p.r - q.r);
      // End walls stop at the mouth plane. Leaving diagonal shell corners
      // beyond that plane can box the opening against an adjacent vessel floor.
      for (var offset = -low - 1; offset <= high + 1; offset++) {
        var c = p.c + dx + (dy ? offset : 0), r = p.r + dy + (dx ? offset : 0);
        shell.delete(r * w + c); mouths.add(r * w + c);
      }
    }
    mouth(path[0], path[1]); mouth(path[path.length - 1], path[path.length - 2]);
    // Joining a branch must not place its side wall inside an existing bore.
    // Protect only actual open cells, so a manually sealed pipe stays sealed.
    function priorBore(part,index){
      var c=index%w,r=Math.floor(index/w),across=Math.ceil(part.bore/t),lo=Math.floor((across-1)/2),hi=across-1-lo;
      for(var k=1;k<part.points.length;k++){
        var a=cell(part.points[k-1]),b=cell(part.points[k]);
        var left=a.c===b.c ? a.c-lo : Math.min(a.c,b.c),right=a.c===b.c ? a.c+hi : Math.max(a.c,b.c);
        var top=a.r===b.r ? a.r-lo : Math.min(a.r,b.r),bottom=a.r===b.r ? a.r+hi : Math.max(a.r,b.r);
        if(c>=left && c<=right && r>=top && r<=bottom)return true;
      }
      for(var k=1;k<part.points.length-1;k++){
        var p=cell(part.points[k]);if(c>=p.c-lo && c<=p.c+hi && r>=p.r-lo && r<=p.r+hi)return true;
      }
      return false;
    }
    shell.forEach(function(index){
      if(self.walls[index]!==0)return;
      if(self.parts.some(function(part){return part.type==='pipe' && priorBore(part,index);}))shell.delete(index);
    });
    var prospective = { id: 'p1', type: 'pipe', points: path, bore: actualBore };
    validateParts([prospective], w, h, t);
    if (this.parts.length >= MAX_PARTS) fail('too many parts');
    return this._edit('pipe', function () {
      shell.forEach(function (index) { self.walls[index] = 1; }); interior.forEach(function (index) { self.walls[index] = 0; });
      mouths.forEach(function (index) { self.walls[index] = 0; });
      return self._part({ type: 'pipe', points: path, bore: actualBore });
    });
  };
  Builder.prototype.vessel = function (rect, sealed) {
    bool(sealed, 'sealed'); var area = this._rect(rect, 3), self = this, t = this.tile;
    if (this.parts.length >= MAX_PARTS) fail('too many parts');
    return this._edit('vessel', function () {
      var c0 = area.x / t, r0 = area.y / t, c1 = c0 + area.width / t - 1, r1 = r0 + area.height / t - 1;
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) self._set(c, r, c === c0 || c === c1 || r === r1 || (sealed && r === r0));
      return self._part({ type: 'vessel', rect: area, sealed: sealed });
    });
  };
  Builder.prototype.vent = function (rect, open) {
    bool(open, 'open'); var area = this._rect(rect, 1), self = this, t = this.tile;
    var existing = this.parts.find(function (part) { return part.type === 'vent' && JSON.stringify(part.rect) === JSON.stringify(area); });
    if (!existing && this.parts.length >= MAX_PARTS) fail('too many parts');
    return this._edit(open ? 'vent' : 'seal', function () {
      for (var r = area.y / t; r < (area.y + area.height) / t; r++) for (var c = area.x / t; c < (area.x + area.width) / t; c++) self._set(c, r, !open);
      if (existing) { existing.open = open; return clone(existing); }
      return self._part({ type: 'vent', rect: area, open: open });
    });
  };
  Builder.prototype.addPart = function (type, options) {
    if (['check', 'flap', 'nozzle'].indexOf(type) < 0) fail('addPart supports check, flap or nozzle');
    options = options || {};
    keys(options, ['rect', 'open', 'direction', 'mass', 'crackingPressure', 'hysteresis', 'bore', 'material'], 'part options');
    var part = { id: 'p1', type: type, rect: this._rect(options.rect, 1), direction: options.direction || 'up' };
    if (options.material !== undefined) part.material = options.material;
    if (type === 'nozzle') part.bore = Math.ceil((options.bore === undefined ? this.tile : number(options.bore, 'bore', this.tile, Math.min(this.width, this.height) * this.tile)) / this.tile) * this.tile;
    else {
      part.open = options.open === undefined ? true : bool(options.open, 'open');
      part.mass = options.mass === undefined ? 1 : options.mass;
      part.crackingPressure = options.crackingPressure === undefined ? 0 : options.crackingPressure;
      part.hysteresis = options.hysteresis === undefined ? 0.1 : options.hysteresis;
    }
    validateParts([part], this.width, this.height, this.tile); delete part.id;
    var self = this;
    return this._edit(type, function () { return self._part(part); });
  };
  Builder.prototype.updatePart = function (id, patch) {
    var index = this.parts.findIndex(function (part) { return part.id === id; });
    if (index < 0) fail('unknown part id');
    keys(patch, ['open', 'sealed', 'direction', 'mass', 'crackingPressure', 'hysteresis', 'bore', 'material'], 'part patch');
    // Geometry fields are immutable here. A vessel/vent update also changes its
    // actual wall cells; valve and nozzle masks remain the host's responsibility.
    var replacement = validateParts([Object.assign({}, this.parts[index], patch)], this.width, this.height, this.tile)[0];
    var self = this;
    return this._edit('update part', function () {
      self.parts[index] = replacement;
      if (replacement.type === 'vent' || replacement.type === 'vessel') {
        var area = replacement.rect, t = self.tile;
        for (var r = area.y / t; r < (area.y + area.height) / t; r++) for (var c = area.x / t; c < (area.x + area.width) / t; c++) {
          if (replacement.type === 'vent') self._set(c, r, !replacement.open);
          else if (r === area.y / t) self._set(c, r, c === area.x / t || c === (area.x + area.width) / t - 1 || replacement.sealed);
        }
      }
      return clone(replacement);
    });
  };
  Builder.prototype.encode = function () { return encode(this); };
  Builder.prototype.share = function (baseURL) {
    var url;
    try { url = new URL(baseURL); } catch (_) { fail('share requires an absolute URL'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') fail('unsupported share URL protocol');
    url.searchParams.set(PARAM, this.encode());
    if (url.href.length > MAX_TOKEN + 4096) fail('share URL is too large');
    return url.href;
  };
  Builder.prototype.fromShare = function (input) {
    var state = decode(input), self = this;
    if (state.width !== this.width || state.height !== this.height || state.tile !== this.tile) fail('shared build grid does not match this world');
    for (var r = 0; r < this.height; r++) for (var c = 0; c < this.width; c++) {
      if ((c === 0 || r === 0 || c === this.width - 1 || r === this.height - 1) && state.walls[r * this.width + c] !== this.walls[r * this.width + c]) fail('shared build changes permanent border');
    }
    return this._edit('load build', function () {
      self.walls.set(state.walls); self.parts = clone(state.parts);
      self.parts.forEach(function (part) { self._nextId = Math.max(self._nextId, Number(part.id.slice(1)) + 1); });
      return self.getParts();
    });
  };
  return { create: function (options) { return new Builder(options); }, encode: encode, decode: decode, VERSION: VERSION, SHARE_PARAM: PARAM,
    limits: Object.freeze({ maxCells: MAX_CELLS, maxParts: MAX_PARTS, maxPoints: MAX_POINTS, maxToken: MAX_TOKEN, maxDocumentBytes: MAX_BYTES }) };
});
