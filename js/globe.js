/* ============================================================
   GLOBE.JS — WebGL Earth with day/night shader, city lights,
   moon, timezone selector, tilt buttons.
   ============================================================ */
(function () {
  'use strict';

  /* ---- Analytics helper (safe no-op if gtag is missing) ---- */
  function track(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }
  var hasInteracted = false;
  var hasPinned = false;

  var container = document.getElementById('globe-container');
  if (!container) return;
  var THREE = window.THREE;
  if (!THREE) return;
  container.classList.add('is-loading');

  var DEG = Math.PI / 180;
  var TWO_PI = Math.PI * 2;

  /* Respect the OS "reduce motion" setting: no idle auto-spin and no moon
     drift. The globe is still fully interactive (drag to spin) on demand. */
  var reducedMotion = false; /* owner: animate for everyone, even with prefers-reduced-motion set */

  /* ---- Timezone offsets from UTC ---- */
  var TZ_OFFSETS = { ET: -4, CT: -5, MT: -6, PT: -7 }; // DST offsets
  var currentTZ = 'CT';

  /* ---- Tilt options ---- */
  var TILTS = [
    { val: 22.1, label: '22.1\u00B0', desc: 'Minimum obliquity. Mildest seasons. Last occurred ~10,000 years ago.', hasMoon: true },
    { val: 23.44, label: '23.44\u00B0', desc: 'Today. Currently decreasing at 0.013\u00B0/century. The cycle takes ~41,000 years.', hasMoon: true },
    { val: 24.5, label: '24.5\u00B0', desc: 'Maximum obliquity. Most extreme seasons. Due again in ~10,000 years.', hasMoon: true },
    { val: 45, label: '45\u00B0', desc: 'Without the Moon, Earth\'s tilt could wander here. No Moon in this scenario.', hasMoon: false }
  ];
  var currentTiltIdx = 1;

  /* ---- Sliders & controls ---- */
  var hourSlider = document.getElementById('hour-slider');
  var daySlider = document.getElementById('day-slider');
  var hourLabel = document.getElementById('hour-label');
  var dayLabel = document.getElementById('day-label');
  var tiltDesc = document.getElementById('tilt-desc');
  var hoverInfo = document.getElementById('hover-info');
  var daylightBarCanvas = document.getElementById('daylight-bar');
  var daylightLabel = document.getElementById('daylight-hours-label');
  var sunriseLabel = document.getElementById('sunrise-label');
  var liveIndicator = document.getElementById('globe-live-indicator');

  /* Live indicator: shows "live" while the demo reflects the actual current
     UTC instant. As soon as the user changes any input, switch to a static
     label so we are not lying about being live. Reset restores it.        */
  var isLive = true;
  function indicatorTilt() {
    var v = TILTS[currentTiltIdx].val;
    // Show whole numbers without a decimal, otherwise one decimal place.
    var s = (v % 1 === 0) ? v.toFixed(0) : v.toFixed(1);
    return s + '\u00B0';
  }
  function refreshIndicator() {
    if (!liveIndicator) return;
    liveIndicator.innerHTML = isLive
      ? indicatorTilt() + ' \u00B7 live'
      : indicatorTilt();
  }
  function setLive(on) { isLive = on; refreshIndicator(); }
  function markEdited() { if (isLive) setLive(false); }

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MDAYS = [31,29,31,30,31,30,31,31,30,31,30,31];
  function dayToDate(d) {
    var day = d | 0, cum = 0;
    for (var m = 0; m < 12; m++) {
      if (day < cum + MDAYS[m]) return (day - cum + 1) + ' ' + MONTHS[m];
      cum += MDAYS[m];
    }
    return '31 Dec';
  }
  function dateToDayOfYear(month, day) {
    var cum = 0;
    for (var m = 0; m < month; m++) cum += MDAYS[m];
    return cum + day - 1;
  }

  function getCurrentTilt() { return TILTS[currentTiltIdx].val; }

  /* The hour slider stores LOCAL hour in the current timezone, so that
     slider 0 = midnight local and slider 24 = midnight local the next day.
     The sun model needs UTC; convert with the timezone offset. */
  function localHourToUTC(localH) {
    var off = TZ_OFFSETS[currentTZ] || -5;
    var utc = localH - off;
    while (utc < 0) utc += 24;
    while (utc >= 24) utc -= 24;
    return utc;
  }

  function formatLocalTime(localH) {
    var h = localH | 0;
    var m = Math.round((localH - h) * 60);
    if (m === 60) { m = 0; h = (h + 1) % 24; }
    var ampm = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm + ' ' + currentTZ;
  }

  function daylightHours(latDeg, dayOfYear, tilt) {
    var decl = tilt * DEG * Math.sin(TWO_PI * (dayOfYear - 81) / 365);
    var latRad = latDeg * DEG;
    var cosHA = -Math.tan(latRad) * Math.tan(decl);
    if (cosHA < -1) return { hours: 24, rise: 0, set: 24 };
    if (cosHA > 1) return { hours: 0, rise: 0, set: 0 };
    var hours = (2 * Math.acos(cosHA) / TWO_PI) * 24;
    var half = hours / 2;
    return { hours: hours, rise: 12 - half, set: 12 + half };
  }

  /* ---- Scene ---- */
  var W = container.clientWidth;
  var H = container.clientHeight;
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x08090b, 1);
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
  camera.position.set(0, 0, 3.2);

  /* ---- Stars background ---- */
  var starGeom = new THREE.BufferGeometry();
  var starPositions = [];
  for (var i = 0; i < 800; i++) {
    var theta = Math.random() * TWO_PI;
    var phi = Math.acos(2 * Math.random() - 1);
    var r = 60 + Math.random() * 40;
    starPositions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
  }
  starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: true });
  scene.add(new THREE.Points(starGeom, starMat));

  /* ---- Textures ---- */
  var loader = new THREE.TextureLoader();
  var dayTex, nightTex, moonTex;
  var loadCount = 0, totalLoads = 3;
  function onTexLoaded() { loadCount++; if (loadCount >= totalLoads) buildBodies(); }
  dayTex = loader.load('assets/images/earth.jpg', function (t) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); onTexLoaded(); });
  nightTex = loader.load('assets/images/earth_night.jpg', function (t) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); onTexLoaded(); });
  moonTex = loader.load('assets/images/moon.jpg', function (t) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); onTexLoaded(); });

  /* ---- Shaders ---- */
  var earthVert = [
    'varying vec2 vUv;',
    'varying vec3 vWorldNormal;',
    'void main() {',
    '  vUv = uv;',
    '  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var earthFrag = [
    'uniform sampler2D dayMap;',
    'uniform sampler2D nightMap;',
    'uniform vec3 sunDir;',
    'uniform float bumpStr;',
    '',
    'varying vec2 vUv;',
    'varying vec3 vWorldNormal;',
    '',
    'void main() {',
    '  vec3 dayColor = texture2D(dayMap, vUv).rgb;',
    '  vec3 nightColor = texture2D(nightMap, vUv).rgb;',
    '',
    '  float ts = 1.0 / 5000.0;',
    '  float h0 = dot(texture2D(dayMap, vUv).rgb, vec3(0.3, 0.6, 0.1));',
    '  float hR = dot(texture2D(dayMap, vUv + vec2(ts, 0.0)).rgb, vec3(0.3, 0.6, 0.1));',
    '  float hU = dot(texture2D(dayMap, vUv + vec2(0.0, ts)).rgb, vec3(0.3, 0.6, 0.1));',
    '  vec3 bn = vWorldNormal;',
    '  bn.x += (hR - h0) * bumpStr;',
    '  bn.y += (hU - h0) * bumpStr;',
    '  bn = normalize(bn);',
    '',
    '  float NdotL = dot(bn, sunDir);',
    '  float dayMix = smoothstep(-0.01, 0.02, NdotL);',
    '',
    '  float diffuse = max(0.0, NdotL);',
    '  vec3 litDay = dayColor * (0.35 + diffuse * 0.85);',
    '',
    '  vec3 litNight = nightColor * 1.6;',
    '  litNight.r *= 1.2;',
    '  litNight.b *= 0.7;',
    '  litNight += dayColor * 0.015;',
    '',
    '  gl_FragColor = vec4(mix(litNight, litDay, dayMix), 1.0);',
    '}'
  ].join('\n');

  var earth, moonMesh, atmosMesh;
  var sunDirUniform = { value: new THREE.Vector3(5, 2, 5).normalize() };

  function buildBodies() {
    /* Earth */
    var geom = new THREE.SphereGeometry(1, 128, 96);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: dayTex },
        nightMap: { value: nightTex },
        sunDir: sunDirUniform,
        bumpStr: { value: 0.3 }
      },
      vertexShader: earthVert,
      fragmentShader: earthFrag
    });
    earth = new THREE.Mesh(geom, mat);
    scene.add(earth);
    buildAtmosphere();

    /* Moon */
    var moonGeom = new THREE.SphereGeometry(0.27, 48, 32);
    var moonMat = new THREE.MeshPhongMaterial({
      map: moonTex,
      shininess: 2,
      emissive: 0x111111,
      emissiveIntensity: 0.1
    });
    moonMesh = new THREE.Mesh(moonGeom, moonMat);
    moonMesh.position.set(-6, 1.5, -4);
    scene.add(moonMesh);

    /* Moon light (so it's visible) */
    var moonLight = new THREE.DirectionalLight(0xffffff, 0.6);
    moonLight.position.set(5, 3, 5);
    moonLight.target = moonMesh;
    scene.add(moonLight);

    container.classList.remove('is-loading');
    container.classList.add('is-ready');
  }

  /* Atmosphere */
  function buildAtmosphere() {
    if (atmosMesh) return;
    var atmosGeom = new THREE.SphereGeometry(1.016, 64, 48);
    var atmosMat = new THREE.ShaderMaterial({
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
        '  float i = pow(0.6 - dot(vNormal, vec3(0,0,1)), 3.0);',
        '  gl_FragColor = vec4(0.25, 0.45, 0.8, 1.0) * i * 0.35;',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    atmosMesh = new THREE.Mesh(atmosGeom, atmosMat);
    scene.add(atmosMesh);
  }

  /* ---- Raycaster ---- */
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var hoverLat = null, hoverLon = null;
  var pinnedLat = null, pinnedLon = null;
  var dragDist = 0;

  /* ---- Camera ---- */
  var isDragging = false;
  var prevMouse = { x: 0, y: 0 };
  var spherical = { theta: -0.5, phi: Math.PI / 2 - 0.25, radius: 2.8 };
  var autoSpin = !reducedMotion;
  var targetTheta = spherical.theta;
  var targetPhi = spherical.phi;
  var targetRadius = spherical.radius;
  var MIN_R = 1.5, MAX_R = 8;
  var DEF_THETA = -0.5, DEF_PHI = Math.PI / 2 - 0.25, DEF_RADIUS = 2.8;

  function updateCamera() {
    spherical.theta += (targetTheta - spherical.theta) * 0.1;
    spherical.phi += (targetPhi - spherical.phi) * 0.1;
    spherical.radius += (targetRadius - spherical.radius) * 0.1;
    spherical.phi = Math.max(0.12, Math.min(Math.PI - 0.12, spherical.phi));
    var r = spherical.radius;
    camera.position.x = r * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.y = r * Math.cos(spherical.phi);
    camera.position.z = r * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.lookAt(0, 0, 0);
  }

  /* ---- Sun ----
     Three.js SphereGeometry maps the equirectangular earth texture so that
     longitude 0 (Greenwich) sits on the +X axis, longitude -90°W on +Z,
     +90°E on -Z, 180° on -X. At UTC hour h the subsolar longitude is
     lon_sun = -(h - 12)·15° (positive east). Substituting into the texture's
     surface formula:
       x = cos(decl) · cos(lon_sun)
       y = sin(decl)
       z = -cos(decl) · sin(lon_sun)                                        */
  function updateSun(hour, day, tilt) {
    var decl = tilt * DEG * Math.sin(TWO_PI * (day - 81) / 365);
    var lonSun = -(hour - 12) * 15 * DEG;
    sunDirUniform.value.set(
       Math.cos(decl) * Math.cos(lonSun),
       Math.sin(decl),
      -Math.cos(decl) * Math.sin(lonSun)
    ).normalize();
  }

  /* ---- Moon visibility ---- */
  var moonTargetOpacity = 1;
  var moonCurrentOpacity = 1;
  function updateMoon() {
    var hasMoon = TILTS[currentTiltIdx].hasMoon;
    moonTargetOpacity = hasMoon ? 1 : 0;
    moonCurrentOpacity += (moonTargetOpacity - moonCurrentOpacity) * 0.06;
    if (moonMesh) {
      moonMesh.visible = moonCurrentOpacity > 0.01;
      moonMesh.material.opacity = moonCurrentOpacity;
      moonMesh.material.transparent = moonCurrentOpacity < 0.99;
      // Slow orbit (frozen to a fixed pose when reduce-motion is on)
      var t = reducedMotion ? 0.6 : Date.now() * 0.00003;
      moonMesh.position.set(
        Math.cos(t) * 7,
        1.2 + Math.sin(t * 0.7) * 0.8,
        Math.sin(t) * 7
      );
      if (!reducedMotion) moonMesh.rotation.y += 0.001;
    }
  }

  /* ---- Events ---- */
  function getPos(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    var src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) / rect.width * 2 - 1,
      y: -(src.clientY - rect.top) / rect.height * 2 + 1,
      px: src.clientX - rect.left,
      py: src.clientY - rect.top
    };
  }

  function doHover(p) {
    if (!earth) return;
    mouse.x = p.x; mouse.y = p.y;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObject(earth);
    if (hits.length > 0) {
      var pt = hits[0].point;
      hoverLat = Math.asin(Math.max(-1, Math.min(1, pt.y))) / DEG;
      hoverLon = Math.atan2(-pt.z, pt.x) / DEG;
      while (hoverLon > 180) hoverLon -= 360;
      while (hoverLon < -180) hoverLon += 360;
    } else { hoverLat = null; hoverLon = null; }
  }

  function hitLatLon(p) {
    if (!earth) return null;
    mouse.x = p.x; mouse.y = p.y;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObject(earth);
    if (hits.length > 0) {
      var pt = hits[0].point;
      var lat = Math.asin(Math.max(-1, Math.min(1, pt.y))) / DEG;
      // Geographic longitude is the inverse of the sun/texture convention above
      // (point at lon sits at x=cos*cos(lon), z=-cos*sin(lon)). Using
      // atan2(x, z) here returned lon+90, so clicks read ~90 deg too far east.
      var lon = Math.atan2(-pt.z, pt.x) / DEG;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      return { lat: lat, lon: lon };
    }
    return null;
  }

  /* Pin marker */
  var pinMarker = null;
  function updatePinMarker() {
    if (pinMarker) { scene.remove(pinMarker); pinMarker = null; }
    if (pinnedLat === null) return;
    var phi = pinnedLat * DEG, theta = pinnedLon * DEG;
    var r = 1.003;
    var ringGeom = new THREE.RingGeometry(0.012, 0.018, 24);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    pinMarker = new THREE.Mesh(ringGeom, ringMat);
    // Match the sun/texture convention (see updateSun) so the marker lands on
    // the clicked point now that lon is true geographic longitude.
    pinMarker.position.set(r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(theta));
    pinMarker.lookAt(0, 0, 0);
    scene.add(pinMarker);
  }

  /* Slider edits drop us out of "live" mode. */
  if (hourSlider) hourSlider.addEventListener('input', markEdited);
  if (daySlider) daySlider.addEventListener('input', markEdited);

  var downNDC = { x: 0, y: 0 };
  renderer.domElement.addEventListener('mousedown', function (e) {
    isDragging = true; autoSpin = false; dragDist = 0;
    var p = getPos(e); prevMouse.x = p.px; prevMouse.y = p.py;
    downNDC.x = p.x; downNDC.y = p.y;
    if (!hasInteracted) { hasInteracted = true; track('globe_interacted'); }
  });
  renderer.domElement.addEventListener('mousemove', function (e) {
    var p = getPos(e);
    if (isDragging) {
      var dx = p.px - prevMouse.x, dy = p.py - prevMouse.y;
      dragDist += Math.abs(dx) + Math.abs(dy);
      // Trackball-style scaling: the closer the camera (smaller radius), the
      // bigger the globe is on screen, so a pixel of drag should correspond
      // to a smaller angular rotation. The factor 2*(r-1)*tan(fov/2)/W is
      // approximately the angular size on screen of one pixel at the front
      // of the globe, in radians.
      var fovScale = 2 * Math.max(spherical.radius - 1, 0.1) *
                     Math.tan(camera.fov * DEG / 2) / W;
      targetTheta -= dx * fovScale;
      targetPhi -= dy * fovScale;
      prevMouse.x = p.px; prevMouse.y = p.py;
    }
    doHover(p);
  });
  renderer.domElement.addEventListener('mouseup', function (e) {
    if (dragDist < 4) {
      var p = getPos(e);
      var hit = hitLatLon(p);
      if (hit) {
        pinnedLat = hit.lat; pinnedLon = hit.lon; updatePinMarker();
        markEdited();
        if (!hasPinned) { hasPinned = true; track('location_pinned'); }
      }
    }
    isDragging = false;
  });
  renderer.domElement.addEventListener('mouseleave', function () { isDragging = false; hoverLat = null; hoverLon = null; });

  var lastPinch = 0, touchDragDist = 0;
  renderer.domElement.addEventListener('touchstart', function (e) {
    e.preventDefault(); isDragging = true; autoSpin = false; touchDragDist = 0;
    var p = getPos(e); prevMouse.x = p.px; prevMouse.y = p.py;
    downNDC.x = p.x; downNDC.y = p.y;
    if (!hasInteracted) { hasInteracted = true; track('globe_interacted'); }
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinch = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinch > 0) {
        targetRadius += (lastPinch - dist) * 0.01;
        targetRadius = Math.max(MIN_R, Math.min(MAX_R, targetRadius));
      }
      lastPinch = dist; touchDragDist = 999;
      return;
    }
    var p = getPos(e);
    var dx2 = p.px - prevMouse.x, dy2 = p.py - prevMouse.y;
    touchDragDist += Math.abs(dx2) + Math.abs(dy2);
    var fovScale = 2 * Math.max(spherical.radius - 1, 0.1) *
                   Math.tan(camera.fov * DEG / 2) / W;
    targetTheta -= dx2 * fovScale;
    targetPhi -= dy2 * fovScale;
    prevMouse.x = p.px; prevMouse.y = p.py;
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', function () {
    if (touchDragDist < 8) {
      var hit = hitLatLon(downNDC);
      if (hit) {
        pinnedLat = hit.lat; pinnedLon = hit.lon; updatePinMarker();
        markEdited();
        if (!hasPinned) { hasPinned = true; track('location_pinned'); }
      }
    }
    isDragging = false; hoverLat = null; hoverLon = null; lastPinch = 0;
  });

  renderer.domElement.addEventListener('wheel', function (e) {
    e.preventDefault(); autoSpin = false;
    targetRadius += e.deltaY * 0.002;
    targetRadius = Math.max(MIN_R, Math.min(MAX_R, targetRadius));
  }, { passive: false });

  /* ---- Daylight bar ---- */
  function updateDaylightBar(hour, day, tilt) {
    var lat, lon, latSource;
    if (pinnedLat !== null) { lat = pinnedLat; lon = pinnedLon; latSource = 'pinned'; }
    else if (hoverLat !== null) { lat = hoverLat; lon = hoverLon; latSource = 'hover'; }
    else { lat = 0; lon = 0; latSource = 'default'; }
    var dl = daylightHours(lat, day, tilt);
    // Sunrise/sunset in the selected timezone's wall clock. dl.rise/dl.set are
    // in local apparent solar time (noon = subsolar); solarTime - lon/15 = UTC,
    // then + off = clock time. Omitting the longitude term is what pushed
    // sunrise past midnight for locations far from the prime meridian.
    var off = TZ_OFFSETS[currentTZ] || -5;
    var riseLocal = dl.rise - lon / 15 + off;
    var setLocal = dl.set - lon / 15 + off;
    while (riseLocal < 0) riseLocal += 24; while (riseLocal >= 24) riseLocal -= 24;
    while (setLocal < 0) setLocal += 24; while (setLocal >= 24) setLocal -= 24;
    if (daylightBarCanvas) {
      var w = daylightBarCanvas.width, h = daylightBarCanvas.height;
      var bc = daylightBarCanvas.getContext('2d');
      bc.fillStyle = '#0a0b0c'; bc.fillRect(0, 0, w, h);
      if (dl.hours >= 24) {
        bc.fillStyle = '#c49540'; bc.fillRect(0, 0, w, h);
      } else if (dl.hours > 0) {
        // Lit band drawn at its wall-clock position so it lines up with the
        // axis ticks and the sunrise/sunset text. It wraps past midnight when a
        // location sits far from its timezone's meridian.
        var band = function (a, b) {
          var xa = (a / 24) * w, xb = (b / 24) * w;
          var g = bc.createLinearGradient(xa, 0, xb, 0);
          g.addColorStop(0, '#4a3520'); g.addColorStop(0.15, '#c49540');
          g.addColorStop(0.5, '#e8c060'); g.addColorStop(0.85, '#c49540');
          g.addColorStop(1, '#4a3520');
          bc.fillStyle = g; bc.fillRect(xa, 0, xb - xa, h);
        };
        if (setLocal >= riseLocal) band(riseLocal, setLocal);
        else { band(riseLocal, 24); band(0, setLocal); }
      }
      var cx = (hour / 24) * w;
      bc.fillStyle = dl.hours <= 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)';
      bc.fillRect(cx - 1, 0, 2, h);
      bc.fillStyle = 'rgba(255,255,255,0.08)';
      for (var t = 0; t < 24; t += 6) bc.fillRect((t / 24) * w, 0, 1, h);
    }
    var ls;
    if (latSource === 'pinned') ls = '\u{1F4CD} ' + Math.abs(Math.round(lat)) + '\u00B0' + (lat >= 0 ? 'N' : 'S');
    else if (latSource === 'hover') ls = Math.abs(Math.round(lat)) + '\u00B0' + (lat >= 0 ? 'N' : 'S');
    else ls = 'Equator';
    if (daylightLabel) {
      if (dl.hours >= 24) daylightLabel.textContent = ls + ': 24h daylight (midnight sun)';
      else if (dl.hours <= 0) daylightLabel.textContent = ls + ': 0h daylight (polar night)';
      else daylightLabel.textContent = ls + ': ' + dl.hours.toFixed(1) + 'h daylight';
    }
    if (sunriseLabel) {
      if (dl.hours >= 24) sunriseLabel.textContent = 'Sun never sets';
      else if (dl.hours <= 0) sunriseLabel.textContent = 'Sun never rises';
      else {
        var rh = riseLocal | 0, rm = Math.round((riseLocal - rh) * 60);
        if (rm === 60) { rm = 0; rh = (rh + 1) % 24; }
        var sh = setLocal | 0, sm = Math.round((setLocal - sh) * 60);
        if (sm === 60) { sm = 0; sh = (sh + 1) % 24; }
        var rap = rh < 12 ? 'AM' : 'PM', sap = sh < 12 ? 'AM' : 'PM';
        var rh12 = rh % 12; if (rh12 === 0) rh12 = 12;
        var sh12 = sh % 12; if (sh12 === 0) sh12 = 12;
        sunriseLabel.textContent = 'Rise ' + rh12 + ':' + (rm < 10 ? '0' : '') + rm + ' ' + rap +
          '  Set ' + sh12 + ':' + (sm < 10 ? '0' : '') + sm + ' ' + sap;
      }
    }
  }

  /* ---- Labels ---- */
  function updateLabels(hour, day) {
    if (hourLabel) hourLabel.textContent = formatLocalTime(hour);
    if (dayLabel) dayLabel.textContent = dayToDate(day);
    if (hoverInfo) {
      if (hoverLat !== null) {
        hoverInfo.textContent = Math.abs(Math.round(hoverLat)) + '\u00B0' + (hoverLat >= 0 ? 'N' : 'S') +
          ', ' + Math.abs(Math.round(hoverLon)) + '\u00B0' + (hoverLon >= 0 ? 'E' : 'W') + '  tap to pin';
      } else if (pinnedLat !== null) {
        hoverInfo.textContent = '\u{1F4CD} ' + Math.abs(Math.round(pinnedLat)) + '\u00B0' + (pinnedLat >= 0 ? 'N' : 'S') +
          ', ' + Math.abs(Math.round(pinnedLon)) + '\u00B0' + (pinnedLon >= 0 ? 'E' : 'W');
      } else {
        hoverInfo.textContent = 'drag to spin \u2022 scroll to zoom \u2022 tap to pin';
      }
    }
  }

  /* Reflect a slider's value as a CSS --fill percentage (0%-100%) so the track
     can paint a filled "traveled" portion left of the thumb. Cached so we only
     touch the CSSOM when the value actually changes. */
  function setSliderFill(el) {
    if (!el) return;
    var min = parseFloat(el.min) || 0;
    var max = parseFloat(el.max);
    if (!(max > min)) return;
    var pct = (parseFloat(el.value) - min) / (max - min) * 100;
    if (pct < 0) pct = 0; else if (pct > 100) pct = 100;
    if (el._fillPct !== pct) {
      el._fillPct = pct;
      el.style.setProperty('--fill', pct + '%');
    }
  }

  /* ---- Animate ---- */
  function animate() {
    requestAnimationFrame(animate);
    var localHour = hourSlider ? parseFloat(hourSlider.value) : 12;
    var day = daySlider ? parseInt(daySlider.value) : 172;
    var tilt = getCurrentTilt();
    var utcHour = localHourToUTC(localHour);
    if (autoSpin && !reducedMotion) targetTheta -= 0.001;
    updateCamera();
    if (earth) updateSun(utcHour, day, tilt);
    updateMoon();
    updateDaylightBar(localHour, day, tilt);
    updateLabels(localHour, day);
    setSliderFill(hourSlider);
    setSliderFill(daySlider);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', function () {
    W = container.clientWidth; H = container.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });

  /* ---- Fullscreen toggle ---- */
  var globeWrapper = document.querySelector('.globe-wrapper');
  var fullscreenBtn = document.getElementById('globe-fullscreen');

  function enterFullscreen() {
    if (!globeWrapper) return;
    globeWrapper.classList.add('is-fullscreen');
    if (fullscreenBtn) fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');
    /* Request native fullscreen when supported (not available on iPhone Safari
       for non-video elements, but the CSS class handles layout there). */
    if (globeWrapper.requestFullscreen) {
      try { globeWrapper.requestFullscreen().catch(function () {}); }
      catch (e) {}
    } else if (globeWrapper.webkitRequestFullscreen) {
      try { globeWrapper.webkitRequestFullscreen(); }
      catch (e) {}
    }
    /* Let the layout settle before telling Three.js the new size. */
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }

  function exitFullscreen() {
    if (!globeWrapper) return;
    globeWrapper.classList.remove('is-fullscreen');
    if (fullscreenBtn) fullscreenBtn.setAttribute('aria-label', 'Enter fullscreen');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', function () {
      if (globeWrapper && globeWrapper.classList.contains('is-fullscreen')) {
        exitFullscreen();
      } else {
        enterFullscreen();
      }
    });
  }

  /* Sync when the browser exits native fullscreen (Esc key, browser chrome
     button, etc.). On iPhone these events never fire; the button manages the
     class there instead. */
  function onFullscreenChange() {
    var isNativeFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isNativeFullscreen && globeWrapper && globeWrapper.classList.contains('is-fullscreen')) {
      globeWrapper.classList.remove('is-fullscreen');
      if (fullscreenBtn) fullscreenBtn.setAttribute('aria-label', 'Enter fullscreen');
      requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
    }
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  /* Escape key for the CSS-only path (iPhone / browsers where native
     fullscreen is absent). When native fullscreen is active the browser
     already handles Esc and fires fullscreenchange above, so only act when
     there is no native fullscreen element. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' &&
        globeWrapper && globeWrapper.classList.contains('is-fullscreen') &&
        !document.fullscreenElement && !document.webkitFullscreenElement) {
      exitFullscreen();
    }
  });

  /* ---- Tilt buttons ---- */
  var tiltBtns = document.querySelectorAll('.tilt-btn');
  for (var i = 0; i < tiltBtns.length; i++) {
    (function (btn, idx) {
      btn.addEventListener('click', function () {
        currentTiltIdx = idx;
        for (var j = 0; j < tiltBtns.length; j++) tiltBtns[j].classList.remove('active');
        btn.classList.add('active');
        if (tiltDesc) tiltDesc.textContent = TILTS[idx].desc;
        // Tilt 23.4 (idx 1) is reality; other tilts are hypothetical, so we
        // are no longer showing live conditions. Keep live on for 23.4.
        if (idx !== 1) markEdited();
        refreshIndicator();
      });
    })(tiltBtns[i], i);
  }

  /* ---- Timezone buttons ----
     Switching timezone is not an edit of the simulated state, just a
     re-projection. If we are still live, snap the slider to "now" in the
     new TZ so the wall clock follows. */
  var tzBtns = document.querySelectorAll('.tz-btn');
  for (var i = 0; i < tzBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        currentTZ = btn.dataset.tz;
        for (var j = 0; j < tzBtns.length; j++) tzBtns[j].classList.remove('active');
        btn.classList.add('active');
        if (isLive) setCurrentTime();
      });
    })(tzBtns[i]);
  }

  /* ---- Reset ---- */
  var resetBtn = document.getElementById('globe-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      targetTheta = DEF_THETA; targetPhi = DEF_PHI; targetRadius = DEF_RADIUS;
      autoSpin = true;
      pinnedLat = null; pinnedLon = null;
      updatePinMarker();
      currentTiltIdx = 1;
      for (var j = 0; j < tiltBtns.length; j++) tiltBtns[j].classList.remove('active');
      if (tiltBtns[1]) tiltBtns[1].classList.add('active');
      if (tiltDesc) tiltDesc.textContent = TILTS[1].desc;
      currentTZ = 'CT';
      for (var j = 0; j < tzBtns.length; j++) {
        tzBtns[j].classList.remove('active');
        if (tzBtns[j].dataset.tz === 'CT') tzBtns[j].classList.add('active');
      }
      setCurrentTime();
      setLive(true);
    });
  }

  /* ---- Set current time ----
     Compute the local-time wall clock for the active timezone by adjusting
     the UTC instant by the timezone offset. This avoids the date/hour
     mismatch that appears when UTC has rolled into the next day but the
     user's local clock has not (or vice versa).                            */
  function setCurrentTime() {
    var now = new Date();
    var off = TZ_OFFSETS[currentTZ] || -5;
    // Shift "now" by the timezone offset so getUTC* returns local fields.
    var local = new Date(now.getTime() + off * 3600 * 1000);
    var localH = local.getUTCHours() + local.getUTCMinutes() / 60;
    var doy = dateToDayOfYear(local.getUTCMonth(), local.getUTCDate());
    if (hourSlider) hourSlider.value = localH;
    if (daySlider) daySlider.value = doy;
  }

  setCurrentTime();
  setLive(true);
  /* While in live mode, keep the slider snapped to the actual current time
     so the clock advances naturally. Once the user edits anything we stop
     overwriting their value. */
  setInterval(function () { if (isLive) setCurrentTime(); }, 30 * 1000);
  animate();
})();
