// Optional asynchronous GPU pass timing for the game's performance recorder.
(function () {
  'use strict';
  var active = false, rows = [], errors = [], devices = 0, capable = 0;
  var pending = 0, skipped = 0, maxPending = 4, maxPasses = 512;
  function error(e) {
    errors.push(String(e));
    if (errors.length > 16) errors.shift();
  }
  function frameId() {
    try { return window.__sluicePerformance ? window.__sluicePerformance.frameId : null; }
    catch (e) { return null; }
  }
  window.__sluiceGPUTrace = {
    setActive: function (value) { active = !!value; },
    drain: function () { var result = rows; rows = []; return result; },
    status: function () {
      return { active: active, supported: capable > 0, devices: devices,
        capableDevices: capable, pending: pending, skipped: skipped,
        rows: rows.length, errors: errors.slice(), maxPending: maxPending,
        maxPasses: maxPasses, sampleIntervalMs: 1000 };
    }
  };
  if (!window.GPUAdapter) return;
  var request = GPUAdapter.prototype.requestDevice;
  try {
  GPUAdapter.prototype.requestDevice = async function (descriptor) {
    var original = descriptor || {}, optional = this.features.has('timestamp-query');
    var features = Array.from(original.requiredFeatures || []), requested = features.indexOf('timestamp-query') >= 0;
    var device;
    if (optional && !requested) {
      try {
        device = await request.call(this, Object.assign({}, original, { requiredFeatures: features.concat(['timestamp-query']) }));
      } catch (e) {
        error('Optional timestamp device request: ' + e);
        device = await request.call(this, original);
      }
    } else device = await request.call(this, original);
    devices++;
    if (!device.features.has('timestamp-query')) return device;
    capable++;
    var originalCreate = device.createCommandEncoder, originalSubmit = device.queue.submit;
    try {
    var create = device.createCommandEncoder.bind(device);
    var submit = device.queue.submit.bind(device.queue);
    var commands = new WeakMap(), sampledAt = new Map(), live = new Set();
    function dispose(sample) {
      if (sample.disposed) return;
      sample.disposed = true;
      live.delete(sample); pending--;
      try { if (sample.read.mapState === 'mapped') sample.read.unmap(); } catch (e) { error(e); }
      [sample.query, sample.resolve, sample.read].forEach(function (resource) {
        try { resource.destroy(); } catch (e) { error(e); }
      });
    }
    device.lost.then(function () { live.forEach(dispose); });
    device.createCommandEncoder = function (descriptor) {
      var d = descriptor || {}, enc = create(d);
      if (!active) return enc;
      var now = performance.now(), label = d.label || 'unlabelled';
      if (pending >= maxPending || now - (sampledAt.has(label) ? sampledAt.get(label) : -Infinity) < 1000) return enc;
      sampledAt.set(label, now);
      if (sampledAt.size > 128) sampledAt.delete(sampledAt.keys().next().value);
      var query, resolve, read, sample;
      try {
        query = device.createQuerySet({ type: 'timestamp', count: maxPasses * 2 });
        resolve = device.createBuffer({ size: maxPasses * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        read = device.createBuffer({ size: maxPasses * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        sample = { query: query, resolve: resolve, read: read, names: [], label: label,
          at: now, frameId: frameId(), skippedPasses: 0, disposed: false };
        pending++; live.add(sample);
      } catch (e) {
        [query, resolve, read].forEach(function (resource) {
          try { if (resource) resource.destroy(); } catch (cleanupError) { error(cleanupError); }
        });
        error(e); return enc;
      }
      var originalCompute = enc.beginComputePass, originalRender = enc.beginRenderPass, originalFinish = enc.finish;
      try {
      ['beginComputePass', 'beginRenderPass'].forEach(function (method) {
        var begin = enc[method].bind(enc);
        enc[method] = function (descriptor) {
          var pass = descriptor || {};
          if (pass.timestampWrites || sample.names.length >= maxPasses || sample.disposed) { skipped++; sample.skippedPasses++; return begin(pass); }
          var index = sample.names.length * 2;
          var result;
          try {
            result = begin(Object.assign({}, pass, { timestampWrites: {
              querySet: query, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1
            } }));
          } catch (e) { error(e); dispose(sample); return begin(pass); }
          sample.names.push(pass.label || method);
          return result;
        };
      });
      var finish = enc.finish.bind(enc);
      enc.finish = function (descriptor) {
        try {
          if (!sample.disposed && sample.names.length) {
            try {
              enc.resolveQuerySet(query, 0, sample.names.length * 2, resolve, 0);
              enc.copyBufferToBuffer(resolve, 0, read, 0, sample.names.length * 16);
            } catch (e) { error(e); dispose(sample); }
          }
          var buffer = finish(descriptor);
          if (!sample.disposed && sample.names.length) commands.set(buffer, sample);
          else dispose(sample);
          return buffer;
        } catch (e) { dispose(sample); throw e; }
      };
      } catch (e) {
        error(e); dispose(sample);
        try { enc.beginComputePass = originalCompute; enc.beginRenderPass = originalRender; enc.finish = originalFinish; }
        catch (restoreError) { error(restoreError); }
      }
      return enc;
    };
    device.queue.submit = function (buffers) {
      if (!active && pending === 0) return submit(buffers);
      var list = Array.from(buffers), result;
      try { result = submit(list); }
      catch (e) {
        list.forEach(function (buffer) { var sample = commands.get(buffer); if (sample) { commands.delete(buffer); dispose(sample); } });
        throw e;
      }
      list.forEach(function (buffer) {
        var sample = commands.get(buffer);
        if (!sample) return;
        commands.delete(buffer);
        if (sample.disposed) return;
        sample.submittedAt = performance.now();
        var mapping;
        try { mapping = sample.read.mapAsync(GPUMapMode.READ); }
        catch (e) { error(e); dispose(sample); return; }
        mapping.then(function () {
          if (sample.disposed) return;
          var times = new BigUint64Array(sample.read.getMappedRange()), passes = [], total = 0;
          for (var i = 0; i < sample.names.length; i++) {
            var ms = Number(times[i * 2 + 1] - times[i * 2]) / 1e6;
            total += ms; passes.push({ name: sample.names[i], ms: ms });
          }
          rows.push({ name: sample.label, at: sample.at, submittedAt: sample.submittedAt, completedAt: performance.now(),
            frameId: sample.frameId, skippedPasses: sample.skippedPasses, partial: sample.skippedPasses > 0, ms: total, passes: passes });
          if (rows.length > 128) rows.shift();
        }).catch(error).finally(function () { dispose(sample); });
      });
      return result;
    };
    } catch (e) {
      error('GPU tracing setup: ' + e);
      try { device.createCommandEncoder = originalCreate; device.queue.submit = originalSubmit; }
      catch (restoreError) { error(restoreError); }
      if (live) live.forEach(dispose);
    }
    return device;
  };
  } catch (e) { error('GPU tracing installation: ' + e); }
})();
