/* NASA daily imagery and NOAA model data. No dependency on WebGL or the DOM.
   Sources, fill-mask limits and freshness decisions: docs/DAYLIGHT_GLOBE.md.
   Checks: node tools/test-globe-data.cjs. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GlobeData = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY = 86400000;
  var MINUTE = 60000;
  var GRID_WIDTH = 360;
  var GRID_HEIGHT = 181;
  var EARTH_MILES = 3958.7613;
  var DEG = Math.PI / 180;
  var PHOTO_CACHE = 'daylight-globe-photo-v1';
  var MAX_CACHE_ENTRIES = 16;
  var PHOTO_LAYERS = [
    'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
    'VIIRS_NOAA20_CorrectedReflectance_TrueColor'
  ];
  var AURORA_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
  var KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
  var CLOUD_SERVICE='https://view.eumetsat.int/geoserver/ows';
  var CLOUD_LAYERS=['mumi:wideareacoverage_rgb_natural','mumi:worldcloudmap_ir108'];
  var CLOUD_CACHE='daylight-globe-cloud-v1';

  function dateValue(value) {
    var result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(result.getTime())) throw new Error('Invalid timestamp');
    return result;
  }

  function utcTimestamp(value) {
    if(value instanceof Date)return dateValue(value);
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))throw new Error('Invalid UTC timestamp');
    var date=dateValue(value);
    if(date.toISOString().slice(0,19)!==value.slice(0,19))throw new Error('Invalid UTC timestamp');
    return date;
  }

  function utcDate(value) {
    return dateValue(value).toISOString().slice(0, 10);
  }

  function dayValue(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid imagery date');
    var date = dateValue(value + 'T00:00:00Z');
    if (utcDate(date) !== value) throw new Error('Invalid imagery date');
    return date;
  }

  function previousCompletedDay(now) {
    return utcDate(dateValue(now === undefined ? Date.now() : now).getTime() - DAY);
  }

  function abortError() {
    var error = new Error('Request aborted');
    error.name = 'AbortError';
    return error;
  }

  async function request(url, options, read) {
    options = options || {};
    var fetcher = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) throw new Error('Fetch unavailable');
    var controller = new AbortController();
    var signal = options.signal;
    if (signal && signal.aborted) throw abortError();
    var timer;
    var onAbort;
    var failure = new Promise(function (_, reject) {
      onAbort = function () { controller.abort(); reject(abortError()); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(function () {
        controller.abort();
        var error = new Error('Request timed out');
        error.name = 'TimeoutError';
        reject(error);
      }, options.timeout === undefined ? 10000 : Math.max(1, options.timeout));
    });
    try {
      return await Promise.race([
        (async function () {
          var response = await fetcher(url, { signal: controller.signal, mode: 'cors' });
          if (!response || !response.ok) throw new Error('HTTP request failed');
          return read(response);
        }()),
        failure
      ]);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  async function fetchJSON(url, options) {
    return request(url, options, async function (response) {
      var mime = (response.headers.get('content-type') || '').split(';')[0].trim();
      if (mime !== 'application/json' && !/\+json$/.test(mime) && !(options && options.allowText && mime === 'text/plain')) {
        throw new Error('Unexpected JSON content type');
      }
      return response.json();
    });
  }

  function parseCloudCatalog(xml) {
    if(typeof xml!=='string'||xml.length>2000000) throw new Error('Invalid cloud catalog');
    var periods=CLOUD_LAYERS.map(function(layer){
      var name=new RegExp('<(?:[A-Za-z0-9_]+:)?Name>\\s*'+layer+'\\s*</(?:[A-Za-z0-9_]+:)?Name>');
      var found=name.exec(xml);
      if(!found) throw new Error('Missing cloud layer');
      var tail=xml.slice(found.index),closing=/<\/(?:[A-Za-z0-9_]+:)?Layer\s*>/.exec(tail);
      if(!closing)throw new Error('Unclosed cloud layer');
      var section=tail.slice(0,closing.index);
      var dimension=/<(?:[A-Za-z0-9_]+:)?Dimension\b[^>]*name=["']time["'][^>]*>([^<]+)</.exec(section);
      if(!dimension) throw new Error('Missing cloud times');
      var interval=dimension[1].trim().split('/');
      if(interval.length!==3||interval[2]!=='PT3H') throw new Error('Unexpected cloud cadence');
      var start=utcTimestamp(interval[0]),end=utcTimestamp(interval[1]);
      if(end<start||(+end-+start)%(3*3600000)) throw new Error('Invalid cloud interval');
      return {start:start,end:end};
    });
    if((+periods[0].start-+periods[1].start)%(3*3600000))throw new Error('Cloud layer ticks do not align');
    var start=new Date(Math.max(+periods[0].start,+periods[1].start)),end=new Date(Math.min(+periods[0].end,+periods[1].end));
    if(end<start) throw new Error('Cloud layers have no common time');
    return {start:start,end:end,step:3*3600000};
  }

  async function fetchCloudCatalog(options) {
    return request(CLOUD_SERVICE+'?service=WMS&version=1.3.0&request=GetCapabilities',options,async function(response){
      return parseCloudCatalog(await response.text());
    });
  }

  function parseCloudSnapshot(value) {
    if(!value||value.version!==1||value.source!==CLOUD_SERVICE||value.step!==3*3600000||!Array.isArray(value.layers)||value.layers.length!==2||value.layers.some(function(layer,i){return layer!==CLOUD_LAYERS[i];}))throw new Error('Invalid cloud snapshot');
    var start=utcTimestamp(value.start),end=utcTimestamp(value.end),checked=utcTimestamp(value.checkedAt);
    if(end<start||(+end-+start)%(3*3600000)||end-checked>5*MINUTE)throw new Error('Invalid cloud snapshot times');
    return {start:start,end:end,step:value.step};
  }

  function cloudFrameAt(catalog, instant, now) {
    var target=utcTimestamp(instant),clock=dateValue(now===undefined?Date.now():now);
    var start=utcTimestamp(catalog.start),end=utcTimestamp(catalog.end);
    if(target<start||target-clock>5*MINUTE||end-clock>5*MINUTE) return null;
    var limit=Math.min(+target,+end);
    return new Date(+start+Math.floor((limit-start)/(3*3600000))*3*3600000);
  }

  function cloudURL(instant,width,layer) {
    if(CLOUD_LAYERS.indexOf(layer)<0||!Number.isInteger(width)||width<2||width>4096||width%2) throw new Error('Invalid cloud request');
    var params=new URLSearchParams({service:'WMS',request:'GetMap',version:'1.3.0',layers:layer,styles:'',format:'image/png',crs:'EPSG:4326',bbox:'-90,-180,90,180',width:String(width),height:String(width/2),transparent:'true',time:utcTimestamp(instant).toISOString()});
    return CLOUD_SERVICE+'?'+params;
  }

  async function fetchCloudFrame(instant,width,options) {
    options=options||{};
    var store=options.cacheStorage===undefined?(typeof caches!=='undefined'?caches:null):options.cacheStorage,cache=null;
    if(store){try{cache=await store.open(CLOUD_CACHE);}catch(_){}}
    var urls=CLOUD_LAYERS.map(function(layer){return cloudURL(instant,width,layer);});
    var images=await Promise.allSettled(urls.map(async function(url){
      if(cache){var hit=null;try{hit=await cache.match(url);}catch(_){}if(hit){try{return await imageBlob(hit,width);}catch(_){try{await cache.delete(url);}catch(_){}}}}
      if(options.cacheOnly) throw new Error('Cached clouds unavailable');
      return request(url,options,async function(response){
        var copy=cache?response.clone():null,blob=await imageBlob(response,width);
        if(cache){try{await cache.put(url,copy);var keys=await cache.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-32)).map(function(key){return cache.delete(key);}));}catch(_){}}
        return blob;
      });
    }));
    if(options.signal&&options.signal.aborted) throw abortError();
    // Infrared supplies observed nighttime structure as well as daytime data.
    if(images[1].status!=='fulfilled') throw images[1].reason;
    return {time:utcTimestamp(instant),width:width,urls:urls,natural:images[0].status==='fulfilled'?images[0].value:null,infrared:images[1].value};
  }

  async function discardCloudFrame(instant,width,options) {
    options=options||{};var store=options.cacheStorage===undefined?(typeof caches!=='undefined'?caches:null):options.cacheStorage;
    if(!store) return;
    try{var cache=await store.open(CLOUD_CACHE);await Promise.all(CLOUD_LAYERS.map(function(layer){return cache.delete(cloudURL(instant,width,layer));}));}catch(_){}
  }

  function photoURL(date, width, layer) {
    dayValue(date);
    if (!Number.isInteger(width) || width < 2 || width > 8192 || width % 2) {
      throw new Error('Invalid imagery width');
    }
    if (PHOTO_LAYERS.indexOf(layer) < 0) throw new Error('Unknown imagery layer');
    var params = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layer,
      STYLES: '', CRS: 'EPSG:4326', BBOX: '-90,-180,90,180',
      WIDTH: String(width), HEIGHT: String(width / 2), FORMAT: 'image/png',
      TIME: date, TRANSPARENT: 'TRUE'
    });
    return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?' + params;
  }

  async function imageBlob(response, width) {
    var mime = (response.headers.get('content-type') || '').split(';')[0].trim();
    if (mime !== 'image/png') throw new Error('Unexpected imagery content type');
    var blob = await response.blob();
    var header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    var signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (blob.size < 33 || header.length < 24 || signature.some(function (v, i) { return header[i] !== v; }) ||
        header[12] !== 73 || header[13] !== 72 || header[14] !== 68 || header[15] !== 82) {
      throw new Error('Invalid PNG imagery');
    }
    var view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (view.getUint32(16) !== width || view.getUint32(20) !== width / 2) {
      throw new Error('Unexpected imagery dimensions');
    }
    return blob;
  }

  async function pruneCache(cache) {
    try {
      var keys = await cache.keys();
      keys.sort(function (a, b) {
        return (new URL(b.url).searchParams.get('TIME') || '').localeCompare(
          new URL(a.url).searchParams.get('TIME') || '');
      });
      await Promise.all(keys.slice(MAX_CACHE_ENTRIES).map(function (key) { return cache.delete(key); }));
    } catch (_) { /* Storage failures leave the static map available. */ }
  }

  async function fetchPhoto(url, date, width, options) {
    var cache = null;
    var store = options.cacheStorage === undefined
      ? (typeof caches !== 'undefined' ? caches : null) : options.cacheStorage;
    // Today is still changing. Never put it into the completed-day cache.
    if (store && date <= previousCompletedDay(options.now)) {
      try {
        cache = await store.open(PHOTO_CACHE);
        var hit = await cache.match(url);
        if (hit) {
          try { return await imageBlob(hit, width); }
          catch (_) { await cache.delete(url); }
        }
      } catch (_) { cache = null; }
    }
    if (options.cacheOnly) {
      var missing = new Error('Cached imagery unavailable');
      missing.name = 'CacheMissError';
      throw missing;
    }
    return request(url, options, async function (response) {
      var copy = cache ? response.clone() : null;
      var blob = await imageBlob(response, width);
      if (cache) {
        try { await cache.put(url, copy); await pruneCache(cache); }
        catch (_) { /* Private mode and quota errors do not affect imagery. */ }
      }
      return blob;
    });
  }

  async function fetchPhotoDay(date, width, options) {
    options = options || {};
    dayValue(date);
    width = width === undefined ? 2048 : width;
    var urls = PHOTO_LAYERS.map(function (layer) { return photoURL(date, width, layer); });
    var settled = await Promise.allSettled(urls.map(function (url) {
      return fetchPhoto(url, date, width, options);
    }));
    if (options.signal && options.signal.aborted) throw abortError();
    var photos = [];
    settled.forEach(function (result, i) {
      if (result.status === 'fulfilled') photos.push({ layer: PHOTO_LAYERS[i], url: urls[i], blob: result.value });
    });
    if (!photos.length) throw settled[0].reason;
    return {
      date: date, width: width, height: width / 2, photos: photos,
      layers: photos.map(function (photo) { return photo.layer; }),
      urls: photos.map(function (photo) { return photo.url; }),
      blobs: photos.map(function (photo) { return photo.blob; }),
      url: photos[0].url, blob: photos[0].blob
    };
  }

  async function evictPhoto(result, options) {
    options = options || {};
    var store = options.cacheStorage === undefined
      ? (typeof caches !== 'undefined' ? caches : null) : options.cacheStorage;
    if (!store) return;
    try {
      var cache = await store.open(PHOTO_CACHE);
      await Promise.all(result.urls.map(function (url) { return cache.delete(url); }));
    } catch (_) { /* A rejected image must not make storage failure visible. */ }
  }

  function cachedPhotoDay(date, width, options) {
    return fetchPhotoDay(date, width, Object.assign({}, options || {}, { cacheOnly: true }));
  }

  function discardPhotoDay(date, width, options) {
    width = width === undefined ? 2048 : width;
    return evictPhoto({ urls: PHOTO_LAYERS.map(function (layer) {
      return photoURL(date, width, layer);
    }) }, options);
  }

  async function latestPhoto(options) {
    options = options || {};
    var latest = previousCompletedDay(options.now);
    var requested = options.date === undefined ? latest : options.date;
    var start = dayValue(requested > latest ? latest : requested).getTime();
    var lastError;
    for (var daysBack = 0; daysBack <= 3; daysBack++) {
      if (options.signal && options.signal.aborted) throw abortError();
      try {
        var result = await fetchPhotoDay(utcDate(start - daysBack * DAY), options.width, options);
        // The caller can decode and reject an empty image before trying the previous day.
        if (options.validate) {
          try {
            if (!(await options.validate(result))) throw new Error('Imagery has no useful coverage');
          } catch (error) {
            // A syntactically valid but empty image can precede actual availability.
            // Evict it so the next page load can discover the newly arrived passes.
            await evictPhoto(result, options);
            throw error;
          }
        }
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('No daily imagery available');
  }

  function compositeRGBA(layers) {
    if (!Array.isArray(layers) || !layers.length || !layers[0].length || layers[0].length % 4) {
      throw new Error('Invalid image pixels');
    }
    var length = layers[0].length;
    if (layers.some(function (layer) { return layer.length !== length; })) throw new Error('Image sizes differ');
    var pixels = new Uint8ClampedArray(length);
    var mask = new Uint8Array(length / 4);
    var covered = 0;
    for (var i = 0; i < length; i += 4) {
      for (var source = 0; source < layers.length; source++) {
        var data = layers[source];
        // True-color GIBS PNGs are opaque, including fill. This conservative display
        // mask treats exact black as fill. It is not a scientific quality flag.
        if (data[i + 3] && (data[i] || data[i + 1] || data[i + 2])) {
          pixels[i] = data[i]; pixels[i + 1] = data[i + 1]; pixels[i + 2] = data[i + 2];
          pixels[i + 3] = 255; mask[i / 4] = 255; covered++;
          break;
        }
      }
    }
    return { pixels: pixels, mask: mask, coverage: covered / mask.length, coveredPixels: covered };
  }

  // Fade only inside an observed footprint. RGB and missing pixels stay intact;
  // longitude padding makes the transition continuous across the map seam.
  function* featherCoverageSteps(pixels, width) {
    if (!Number.isInteger(width) || width < 2 || !pixels || !pixels.length || pixels.length % (width * 4)) throw new Error('Invalid image pixels');
    var height = pixels.length / (width * 4), feather = Math.max(1, width / 120);
    var padding = Math.ceil(feather), stride = width + padding * 2, limit = Math.ceil(feather * 3);
    var distance = new Uint16Array(stride * height), result = new Uint8ClampedArray(pixels);
    for (var y = 0; y < height; y++) { if(y%4===0)yield; for (var x = 0; x < stride; x++) {
      var longitude = (x - padding + width) % width;
      distance[y * stride + x] = pixels[(y * width + longitude) * 4 + 3] ? limit : 0;
    }}
    for (var row = 0; row < height; row++) { if(row%4===0)yield; for (var column = 0; column < stride; column++) {
      var index = row * stride + column, d = distance[index];
      if (column) d = Math.min(d, distance[index - 1] + 3);
      if (row) {
        d = Math.min(d, distance[index - stride] + 3);
        if (column) d = Math.min(d, distance[index - stride - 1] + 4);
        if (column + 1 < stride) d = Math.min(d, distance[index - stride + 1] + 4);
      }
      distance[index] = d;
    }}
    for (var rowBack = height - 1; rowBack >= 0; rowBack--) { if(rowBack%4===0)yield; for (var columnBack = stride - 1; columnBack >= 0; columnBack--) {
      var back = rowBack * stride + columnBack, value = distance[back];
      if (columnBack + 1 < stride) value = Math.min(value, distance[back + 1] + 3);
      if (rowBack + 1 < height) {
        value = Math.min(value, distance[back + stride] + 3);
        if (columnBack) value = Math.min(value, distance[back + stride - 1] + 4);
        if (columnBack + 1 < stride) value = Math.min(value, distance[back + stride + 1] + 4);
      }
      distance[back] = value;
    }}
    for (var ry = 0; ry < height; ry++) { if(ry%4===0)yield; for (var rx = 0; rx < width; rx++) {
      var alpha = (ry * width + rx) * 4 + 3;
      var t = Math.min(1, distance[ry * stride + rx + padding] / (3 * feather));
      result[alpha] = Math.round(pixels[alpha] * t * t * (3 - 2 * t));
    }}
    return result;
  }
  function featherCoverage(pixels,width){var steps=featherCoverageSteps(pixels,width),part;do{part=steps.next();}while(!part.done);return part.value;}

  function parseAurora(data) {
    if (!data || !Array.isArray(data.coordinates) || data.coordinates.length !== GRID_WIDTH * GRID_HEIGHT) {
      throw new Error('Incomplete aurora grid');
    }
    var observation = utcTimestamp(data['Observation Time']);
    var forecast = utcTimestamp(data['Forecast Time']);
    if (forecast < observation) throw new Error('Forecast precedes observation');
    var grid = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
    var seen = new Uint8Array(grid.length);
    data.coordinates.forEach(function (point) {
      if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
        throw new Error('Invalid aurora coordinate');
      }
      var lon = point[0], lat = point[1], probability = point[2];
      if (!Number.isInteger(lon) || lon < -180 || lon > 360 || !Number.isInteger(lat) ||
          lat < -90 || lat > 90 || probability < 0 || probability > 100) {
        throw new Error('Aurora coordinate out of range');
      }
      lon = ((lon % 360) + 360) % 360;
      var index = (lat + 90) * GRID_WIDTH + lon;
      if (seen[index]) throw new Error('Duplicate aurora grid point');
      seen[index] = 1; grid[index] = probability;
    });
    return { grid: grid, observation: observation, forecast: forecast, width: GRID_WIDTH, height: GRID_HEIGHT };
  }

  function auroraFreshness(data, now) {
    now = dateValue(now === undefined ? Date.now() : now).getTime();
    var observationAge = now - dateValue(data.observation).getTime();
    var forecastAge = now - dateValue(data.forecast).getTime();
    return {
      fresh: observationAge >= -5 * MINUTE && observationAge <= 180 * MINUTE &&
        forecastAge >= -120 * MINUTE && forecastAge <= 90 * MINUTE,
      observationAgeMinutes: observationAge / MINUTE,
      forecastAgeMinutes: forecastAge / MINUTE
    };
  }

  function parseAuroraArchive(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.runs)) throw new Error('Invalid aurora archive');
    var observation=utcTimestamp(value.observation), forecast=utcTimestamp(value.forecast);
    if(forecast<observation || forecast-observation>120*MINUTE) throw new Error('Invalid archive forecast time');
    var grid=new Float32Array(GRID_WIDTH*GRID_HEIGHT),end=0;
    value.runs.forEach(function(run){
      if(!Array.isArray(run)||run.length!==2||!Number.isInteger(run[0])||run[0]<end||!Array.isArray(run[1])||!run[1].length||run[0]+run[1].length>grid.length) throw new Error('Invalid archive run');
      run[1].forEach(function(probability,index){
        if(!Number.isFinite(probability)||probability<=0||probability>100) throw new Error('Invalid archive probability');
        grid[run[0]+index]=probability;
      });
      end=run[0]+run[1].length;
    });
    return {grid:grid,observation:observation,forecast:forecast,width:GRID_WIDTH,height:GRID_HEIGHT,historical:true};
  }

  function parseAuroraManifest(value) {
    if(!value||value.version!==1||!Array.isArray(value.frames)||value.frames.length>10000) throw new Error('Invalid aurora manifest');
    var seen=new Set();
    return value.frames.map(function(frame){
      if(!frame||typeof frame.file!=='string'||!/^[-A-Za-z0-9_.]+\.json\.gz$/.test(frame.file)||!(/^[a-f0-9]{64}$/.test(frame.sha256))||seen.has(frame.file)) throw new Error('Invalid archive entry');
      seen.add(frame.file);
      var observation=utcTimestamp(frame.observation),forecast=utcTimestamp(frame.forecast);
      if(forecast<observation||forecast-observation>120*MINUTE) throw new Error('Invalid archive entry time');
      return {file:frame.file,sha256:frame.sha256,observation:observation,forecast:forecast};
    }).sort(function(a,b){return a.forecast-b.forecast;});
  }

  function auroraFrameAt(frames, instant) {
    var target=utcTimestamp(instant).getTime(),best=null,distance=Infinity;
    frames.forEach(function(frame){
      if(utcTimestamp(frame.observation).getTime()>target)return;
      var delta=Math.abs(utcTimestamp(frame.forecast).getTime()-target);
      if(delta<distance){best=frame;distance=delta;}
    });
    // Replay carries a recorded grid through missed captures. Its original
    // observation and forecast clocks remain visible; live freshness is separate.
    return best;
  }

  function auroraBlendAt(frames, instant) {
    // Causal display crossfade, over ten minutes of replay time. Integrating
    // the held selections also keeps overlapping updates continuous. This
    // changes display weights only, never a recorded grid or its timestamps.
    var end=utcTimestamp(instant).getTime(),window=10*MINUTE,start=end-window,weights=new Map();
    var ordered=frames.filter(function(frame){return +frame.observation<=end;}).slice().sort(function(a,b){return a.forecast-b.forecast;});
    var knots=[start,end];
    ordered.forEach(function(frame){var t=+frame.observation;if(t>start&&t<end)knots.push(t);});
    knots=Array.from(new Set(knots)).sort(function(a,b){return a-b;});
    function fade(t){var x=Math.max(0,Math.min(1,(end-t)/window));return x*x*(3-2*x);}
    for(var k=0;k<knots.length-1;k++){
      var left=knots[k],right=knots[k+1],eligible=ordered.filter(function(frame){return +frame.observation<=left;}),cuts=[left,right];
      // Between arrivals, only adjacent eligible forecast targets can exchange
      // nearest status. Missing captures do not require invented samples.
      for(var j=1;j<eligible.length;j++){
        var middle=(+eligible[j-1].forecast+ +eligible[j].forecast)/2;
        if(middle>left&&middle<right)cuts.push(middle);
      }
      cuts=Array.from(new Set(cuts)).sort(function(a,b){return a-b;});
      for(var i=0;i<cuts.length-1;i++){
        var frame=auroraFrameAt(eligible,new Date((cuts[i]+cuts[i+1])/2));
        if(frame)weights.set(frame,(weights.get(frame)||0)+fade(cuts[i])-fade(cuts[i+1]));
      }
    }
    return Array.from(weights,function(pair){return {frame:pair[0],weight:pair[1]};}).filter(function(part){return part.weight>0;});
  }

  function auroraReplayGap(frames, instant) {
    var target=utcTimestamp(instant).getTime(),parts=auroraBlendAt(frames,instant),selected=auroraFrameAt(frames,instant);
    if(!selected)return null;
    var observations=Array.from(new Set(frames.map(function(frame){return +frame.observation;}))).sort(function(a,b){return a-b;});
    var shown=parts.map(function(part){return +part.frame.observation;}).concat(+selected.observation),first=Math.min.apply(null,shown),last=Math.max.apply(null,shown);
    // A glow crossfade can bridge a missed recording interval. Expose the
    // actual consecutive measurement clocks, including recordings that the
    // nearest-forecast selection skips when NOAA changes its forecast lead.
    for(var i=1;i<observations.length;i++)if(observations[i-1]>=first&&observations[i]<=last&&observations[i]-observations[i-1]>60*MINUTE)return {from:new Date(observations[i-1]),to:new Date(observations[i])};
    if(target- +selected.forecast<=30*MINUTE)return null;
    var previous=null,next=null;
    observations.forEach(function(observation){if(observation<=target)previous=observation;else if(next===null)next=observation;});
    if((next===null?target:next)-previous<=60*MINUTE)return null;
    return {from:new Date(previous),to:next===null?null:new Date(next)};
  }

  async function fetchAuroraArchive(frame, base, options) {
    return request(base+frame.file,options,async function(response){
      var bytes=await response.arrayBuffer();
      if(bytes.byteLength>600000) throw new Error('Oversized aurora archive');
      var digest=await crypto.subtle.digest('SHA-256',bytes);
      var hash=Array.from(new Uint8Array(digest),function(byte){return byte.toString(16).padStart(2,'0');}).join('');
      if(hash!==frame.sha256) throw new Error('Aurora archive hash mismatch');
      if(typeof DecompressionStream!=='function') throw new Error('Archive decompression unavailable');
      var expanded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if(expanded.byteLength>2500000) throw new Error('Oversized expanded aurora archive');
      var parsed=parseAuroraArchive(JSON.parse(new TextDecoder().decode(expanded)));
      if(+parsed.observation!==+frame.observation||+parsed.forecast!==+frame.forecast) throw new Error('Aurora archive timestamp mismatch');
      return parsed;
    });
  }

  function auroraAt(data, lat, lon) {
    var grid = data.grid || data;
    if (!grid || grid.length !== GRID_WIDTH * GRID_HEIGHT || !Number.isFinite(lat) ||
        lat < -90 || lat > 90 || !Number.isFinite(lon)) throw new Error('Invalid aurora sample');
    var x = ((lon % 360) + 360) % 360, y = lat + 90;
    var x0 = Math.floor(x), x1 = (x0 + 1) % 360;
    var y0 = Math.floor(y), y1 = Math.min(180, y0 + 1);
    var fx = x - x0, fy = y - y0;
    var a = grid[y0 * 360 + x0] * (1 - fx) + grid[y0 * 360 + x1] * fx;
    var b = grid[y1 * 360 + x0] * (1 - fx) + grid[y1 * 360 + x1] * fx;
    return a * (1 - fy) + b * fy;
  }

  function greatCircleMiles(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG;
    var h = Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) *
      Math.pow(Math.sin((lon2 - lon1) * DEG / 2), 2);
    return EARTH_MILES * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  }

  function auroraVisibility(data, lat, lon, solarElevation) {
    var grid = data.grid || data;
    var overhead = auroraAt(grid, lat, lon);
    var nearestMiles = Infinity;
    var nearbyProbability = 0;
    // NOAA says a bright oval can be visible about 600 miles away. A 10% model
    // threshold selects its outer oval here; it is not a personal viewing chance.
    var radius = 600, latRange = radius / EARTH_MILES / DEG;
    var minLat = Math.max(-90, Math.floor(lat - latRange));
    var maxLat = Math.min(90, Math.ceil(lat + latRange));
    for (var rowLat = minLat; rowLat <= maxLat; rowLat++) {
      for (var rowLon = 0; rowLon < 360; rowLon++) {
        var probability = grid[(rowLat + 90) * 360 + rowLon];
        if (probability < 10) continue;
        var distance = greatCircleMiles(lat, lon, rowLat, rowLon);
        if (distance <= radius) {
          nearbyProbability = Math.max(nearbyProbability, probability);
          nearestMiles = Math.min(nearestMiles, distance);
        }
      }
    }
    var darkness = !Number.isFinite(solarElevation) ? 'unknown'
      : solarElevation >= 0 ? 'daylight' : solarElevation > -6 ? 'twilight' : 'dark';
    return {
      overheadProbability: overhead, nearbyProbability: nearbyProbability,
      nearestOvalMiles: Number.isFinite(nearestMiles) ? nearestMiles : null,
      darkness: darkness,
      visibility: darkness === 'unknown' ? 'Darkness not known'
        : darkness === 'daylight' ? 'Hidden by daylight'
        : darkness === 'twilight' ? 'Twilight limits visibility'
          : overhead >= 10 ? 'Modeled overhead; clear dark skies needed'
            : nearbyProbability >= 10 ? 'Nearby oval may be visible on the horizon'
              : 'No nearby oval in this forecast'
    };
  }

  function parseKp(data) {
    if (!Array.isArray(data)) throw new Error('Invalid Kp data');
    var records = data;
    if (Array.isArray(data[0])) {
      var headings = data[0];
      var timeIndex = headings.indexOf('time_tag');
      var kpIndex = headings.indexOf('Kp');
      if (kpIndex < 0) kpIndex = headings.indexOf('kp_index');
      records = data.slice(1).map(function (row) { return { time_tag: row[timeIndex], Kp: row[kpIndex] }; });
    }
    var latest = null;
    records.forEach(function (record) {
      if (!record || record.Kp === '' || record.Kp === null || record.Kp === undefined) return;
      var kp = Number(record.Kp);
      if (!Number.isFinite(kp) || kp < 0 || kp > 9 || typeof record.time_tag !== 'string') return;
      var tag = record.time_tag;
      var time = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(tag) ? tag : tag + 'Z');
      if (!Number.isFinite(time.getTime())) return;
      if (!latest || time > latest.time) latest = { kp: kp, time: time, timeTag: tag, stationCount: record.station_count };
    });
    if (!latest) throw new Error('No valid Kp values');
    return latest;
  }

  return {
    AURORA_URL: AURORA_URL, KP_URL: KP_URL, PHOTO_CACHE: PHOTO_CACHE,
    CLOUD_SERVICE:CLOUD_SERVICE,CLOUD_LAYERS:CLOUD_LAYERS.slice(),CLOUD_CACHE:CLOUD_CACHE,
    parseCloudCatalog:parseCloudCatalog,fetchCloudCatalog:fetchCloudCatalog,parseCloudSnapshot:parseCloudSnapshot,cloudFrameAt:cloudFrameAt,cloudURL:cloudURL,fetchCloudFrame:fetchCloudFrame,discardCloudFrame:discardCloudFrame,
    PHOTO_LAYERS: PHOTO_LAYERS.slice(), GRID_WIDTH: GRID_WIDTH, GRID_HEIGHT: GRID_HEIGHT,
    request:request,imageBlob:imageBlob,fetchText:function(url,options){return request(url,options,function(r){return r.text();});},
    fetchJSON: fetchJSON, photoURL: photoURL, fetchPhotoDay: fetchPhotoDay, latestPhoto: latestPhoto,
    cachedPhotoDay: cachedPhotoDay, discardPhotoDay: discardPhotoDay, evictPhoto: evictPhoto,
    utcDate:utcDate, previousCompletedDay: previousCompletedDay, compositeRGBA: compositeRGBA, featherCoverage:featherCoverage, featherCoverageSteps:featherCoverageSteps,
    parseAurora: parseAurora, auroraFreshness: auroraFreshness, auroraAt: auroraAt,
    parseAuroraArchive:parseAuroraArchive,parseAuroraManifest:parseAuroraManifest,auroraFrameAt:auroraFrameAt,auroraBlendAt:auroraBlendAt,auroraReplayGap:auroraReplayGap,fetchAuroraArchive:fetchAuroraArchive,
    auroraVisibility: auroraVisibility, greatCircleMiles: greatCircleMiles, parseKp: parseKp
  };
}));
