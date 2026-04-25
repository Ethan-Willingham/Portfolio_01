/* ============================================================
   GLOBE.JS — WebGL Earth with custom day/night shader,
   city lights, tilt slider with Milankovitch stops.
   Fixed: shadow stays on surface, not on camera.
   ============================================================ */
(function () {
  'use strict';

  var container = document.getElementById('globe-container');
  if (!container) return;

  var THREE = window.THREE;
  if (!THREE) return;

  var DEG = Math.PI / 180;
  var TWO_PI = Math.PI * 2;

  /* ---- Sliders ---- */
  var hourSlider = document.getElementById('hour-slider');
  var daySlider = document.getElementById('day-slider');
  var tiltSlider = document.getElementById('tilt-slider');
  var hourLabel = document.getElementById('hour-label');
  var dayLabel = document.getElementById('day-label');
  var tiltLabel = document.getElementById('tilt-label');
  var tiltDesc = document.getElementById('tilt-desc');
  var hoverInfo = document.getElementById('hover-info');
  var daylightBarCanvas = document.getElementById('daylight-bar');
  var daylightLabel = document.getElementById('daylight-hours-label');
  var sunriseLabel = document.getElementById('sunrise-label');

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

  /* ---- Tilt stops (Milankovitch obliquity cycle) ---- */
  var TILT_STOPS = [
    { val: 0, tilt: 22.1, label: '22.1\u00B0', desc: 'Minimum obliquity. Mildest seasons. Less ice melt at the poles. Last occurred ~10,000 years ago.' },
    { val: 1, tilt: 23.44, label: '23.44\u00B0', desc: 'Today. Currently decreasing at 0.013\u00B0 per century. The cycle takes ~41,000 years.' },
    { val: 2, tilt: 24.5, label: '24.5\u00B0', desc: 'Maximum obliquity. Most extreme seasons. Stronger Arctic melting. Due again in ~10,000 years.' },
    { val: 3, tilt: 45, label: '45\u00B0', desc: 'Hypothetical extreme. Without the Moon, Earth could reach this. Tropical latitudes would freeze in winter.' }
  ];

  function getCurrentTilt() {
    if (!tiltSlider) return 23.44;
    var v = parseInt(tiltSlider.value);
    return TILT_STOPS[v] ? TILT_STOPS[v].tilt : 23.44;
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
  renderer.setClearColor(0x0a0c0e, 1);
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 3.2);

  /* ---- Textures ---- */
  var loader = new THREE.TextureLoader();
  var dayTex, nightTex;
  var loadCount = 0;

  function onTexLoaded() { loadCount++; if (loadCount >= 2) buildEarth(); }

  dayTex = loader.load('earth.jpg', function (t) {
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    onTexLoaded();
  });
  nightTex = loader.load('earth_night.jpg', function (t) {
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    onTexLoaded();
  });

  /* ---- Custom shader ----
     KEY FIX: normals computed in WORLD space, not view space.
     Sun direction also in world space. Shadow stays fixed on
     the globe surface regardless of camera position.
  */
  var earthVert = [
    'varying vec2 vUv;',
    'varying vec3 vWorldNormal;',
    '',
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
    '  // Subtle bump from day texture luminance',
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
    '',
    '  // Very tight day/night transition',
    '  float dayMix = smoothstep(-0.01, 0.02, NdotL);',
    '',
    '  // Day: bright diffuse, generous ambient so terminator area stays vivid',
    '  float diffuse = max(0.0, NdotL);',
    '  vec3 litDay = dayColor * (0.35 + diffuse * 0.85);',
    '',
    '  // Night: city lights only, very dark base',
    '  float nightLum = dot(nightColor, vec3(0.3, 0.6, 0.1));',
    '  vec3 litNight = nightColor * 1.6;',
    '  // Warm up the lights',
    '  litNight.r *= 1.2;',
    '  litNight.b *= 0.7;',
    '  // Tiny ambient so coastlines barely visible',
    '  litNight += dayColor * 0.015;',
    '',
    '  vec3 finalColor = mix(litNight, litDay, dayMix);',
    '',
    '  gl_FragColor = vec4(finalColor, 1.0);',
    '}'
  ].join('\n');

  var earth;
  var sunDirUniform = { value: new THREE.Vector3(5, 2, 5).normalize() };

  function buildEarth() {
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
  }

  /* ---- Atmosphere ---- */
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
  scene.add(new THREE.Mesh(atmosGeom, atmosMat));

  /* ---- Raycaster ---- */
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var hoverLat = null, hoverLon = null;
  var pinnedLat = null, pinnedLon = null;
  var dragDist = 0;

  /* ---- Camera orbit ---- */
  var isDragging = false;
  var prevMouse = { x: 0, y: 0 };
  var spherical = { theta: -0.5, phi: Math.PI / 2 - 0.25, radius: 3.2 };
  var autoSpin = true;
  var targetTheta = spherical.theta;
  var targetPhi = spherical.phi;
  var targetRadius = spherical.radius;
  var MIN_R = 1.5, MAX_R = 8;
  var DEF_THETA = -0.5, DEF_PHI = Math.PI / 2 - 0.25, DEF_RADIUS = 3.2;

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

  /* ---- Sun in WORLD space (no camera dependency) ---- */
  function updateSun(hour, day, tilt) {
    var decl = tilt * DEG * Math.sin(TWO_PI * (day - 81) / 365);
    var lonRad = -(hour - 12) * 15 * DEG;
    sunDirUniform.value.set(
      Math.cos(decl) * Math.sin(lonRad),
      Math.sin(decl),
      Math.cos(decl) * Math.cos(lonRad)
    ).normalize();
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
      hoverLon = Math.atan2(pt.x, pt.z) / DEG;
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
      var lon = Math.atan2(pt.x, pt.z) / DEG;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      return { lat: lat, lon: lon };
    }
    return null;
  }

  /* Pin marker (small ring on the globe) */
  var pinMarker = null;
  function updatePinMarker() {
    if (pinMarker) { scene.remove(pinMarker); pinMarker = null; }
    if (pinnedLat === null) return;
    var phi = pinnedLat * DEG;
    var theta = pinnedLon * DEG;
    var r = 1.003;
    var x = r * Math.cos(phi) * Math.sin(theta);
    var y = r * Math.sin(phi);
    var z = r * Math.cos(phi) * Math.cos(theta);
    var ringGeom = new THREE.RingGeometry(0.012, 0.018, 24);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    pinMarker = new THREE.Mesh(ringGeom, ringMat);
    pinMarker.position.set(x, y, z);
    pinMarker.lookAt(0, 0, 0);
    scene.add(pinMarker);
  }

  var downPos = { x: 0, y: 0 };
  var downNDC = { x: 0, y: 0 };

  renderer.domElement.addEventListener('mousedown', function (e) {
    isDragging = true; autoSpin = false; dragDist = 0;
    var p = getPos(e); prevMouse.x = p.px; prevMouse.y = p.py;
    downPos.x = p.px; downPos.y = p.py;
    downNDC.x = p.x; downNDC.y = p.y;
  });
  renderer.domElement.addEventListener('mousemove', function (e) {
    var p = getPos(e);
    if (isDragging) {
      var dx = p.px - prevMouse.x, dy = p.py - prevMouse.y;
      dragDist += Math.abs(dx) + Math.abs(dy);
      targetTheta -= dx * 0.005;
      targetPhi -= dy * 0.005;
      prevMouse.x = p.px; prevMouse.y = p.py;
    }
    doHover(p);
  });
  renderer.domElement.addEventListener('mouseup', function (e) {
    if (dragDist < 4) {
      var p = getPos(e);
      var hit = hitLatLon(p);
      if (hit) {
        pinnedLat = hit.lat; pinnedLon = hit.lon;
        updatePinMarker();
      }
    }
    isDragging = false;
  });
  renderer.domElement.addEventListener('mouseleave', function () { isDragging = false; hoverLat = null; hoverLon = null; });

  var lastPinch = 0;
  var touchDragDist = 0;
  renderer.domElement.addEventListener('touchstart', function (e) {
    e.preventDefault(); isDragging = true; autoSpin = false; touchDragDist = 0;
    var p = getPos(e); prevMouse.x = p.px; prevMouse.y = p.py;
    downPos.x = p.px; downPos.y = p.py;
    downNDC.x = p.x; downNDC.y = p.y;
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinch = Math.sqrt(dx*dx + dy*dy);
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (lastPinch > 0) {
        targetRadius += (lastPinch - dist) * 0.01;
        targetRadius = Math.max(MIN_R, Math.min(MAX_R, targetRadius));
      }
      lastPinch = dist;
      touchDragDist = 999; // not a tap
      return;
    }
    var p = getPos(e);
    var dx2 = p.px - prevMouse.x, dy2 = p.py - prevMouse.y;
    touchDragDist += Math.abs(dx2) + Math.abs(dy2);
    targetTheta -= dx2 * 0.005;
    targetPhi -= dy2 * 0.005;
    prevMouse.x = p.px; prevMouse.y = p.py;
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', function (e) {
    if (touchDragDist < 8) {
      var hit = hitLatLon(downNDC);
      if (hit) {
        pinnedLat = hit.lat; pinnedLon = hit.lon;
        updatePinMarker();
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
    var lat, latSource;
    if (pinnedLat !== null) { lat = pinnedLat; latSource = 'pinned'; }
    else if (hoverLat !== null) { lat = hoverLat; latSource = 'hover'; }
    else { lat = 0; latSource = 'default'; }
    var dl = daylightHours(lat, day, tilt);
    if (daylightBarCanvas) {
      var w = daylightBarCanvas.width, h = daylightBarCanvas.height;
      var bc = daylightBarCanvas.getContext('2d');
      bc.fillStyle = '#0a0b0c'; bc.fillRect(0, 0, w, h);
      if (dl.hours > 0 && dl.hours < 24) {
        var x1 = (dl.rise/24)*w, x2 = (dl.set/24)*w;
        var g = bc.createLinearGradient(x1,0,x2,0);
        g.addColorStop(0,'#4a3520'); g.addColorStop(0.15,'#c49540');
        g.addColorStop(0.5,'#e8c060'); g.addColorStop(0.85,'#c49540');
        g.addColorStop(1,'#4a3520');
        bc.fillStyle = g; bc.fillRect(x1,0,x2-x1,h);
      } else if (dl.hours >= 24) {
        bc.fillStyle = '#c49540'; bc.fillRect(0,0,w,h);
      }
      var cx = (hour/24)*w;
      bc.fillStyle = dl.hours <= 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)';
      bc.fillRect(cx-1,0,2,h);
      bc.fillStyle = 'rgba(255,255,255,0.08)';
      for (var t = 0; t < 24; t += 6) bc.fillRect((t/24)*w,0,1,h);
    }
    var ls;
    if (latSource === 'pinned') {
      ls = '\u{1F4CD} ' + Math.abs(Math.round(lat)) + '\u00B0' + (lat >= 0 ? 'N' : 'S');
    } else if (latSource === 'hover') {
      ls = Math.abs(Math.round(lat)) + '\u00B0' + (lat >= 0 ? 'N' : 'S');
    } else {
      ls = 'Equator';
    }
    if (daylightLabel) {
      if (dl.hours >= 24) daylightLabel.textContent = ls + ': 24h daylight (midnight sun)';
      else if (dl.hours <= 0) daylightLabel.textContent = ls + ': 0h daylight (polar night)';
      else daylightLabel.textContent = ls + ': ' + dl.hours.toFixed(1) + 'h daylight';
    }
    if (sunriseLabel) {
      if (dl.hours >= 24) sunriseLabel.textContent = 'Sun never sets';
      else if (dl.hours <= 0) sunriseLabel.textContent = 'Sun never rises';
      else {
        var rh=dl.rise|0,rm=Math.round((dl.rise-rh)*60);
        var sh=dl.set|0,sm=Math.round((dl.set-sh)*60);
        sunriseLabel.textContent='Rise '+(rh<10?'0':'')+rh+':'+(rm<10?'0':'')+rm+
          '  Set '+(sh<10?'0':'')+sh+':'+(sm<10?'0':'')+sm;
      }
    }
  }

  /* ---- Labels ---- */
  function updateLabels(hour, day) {
    if (hourLabel) {
      var h = hour|0, m = Math.round((hour-h)*60);
      hourLabel.textContent = (h<10?'0':'')+h+':'+(m<10?'0':'')+m+' UTC';
    }
    if (dayLabel) dayLabel.textContent = dayToDate(day);
    if (hoverInfo) {
      if (hoverLat !== null) {
        hoverInfo.textContent = Math.abs(Math.round(hoverLat))+'\u00B0'+(hoverLat>=0?'N':'S')+
          ', '+Math.abs(Math.round(hoverLon))+'\u00B0'+(hoverLon>=0?'E':'W') + '  tap to pin';
      } else if (pinnedLat !== null) {
        hoverInfo.textContent = '\u{1F4CD} ' + Math.abs(Math.round(pinnedLat))+'\u00B0'+(pinnedLat>=0?'N':'S')+
          ', '+Math.abs(Math.round(pinnedLon))+'\u00B0'+(pinnedLon>=0?'E':'W');
      } else {
        hoverInfo.textContent = 'drag to spin \u2022 scroll to zoom \u2022 tap to pin';
      }
    }
  }

  function updateTiltLabel() {
    if (!tiltSlider) return;
    var v = parseInt(tiltSlider.value);
    var stop = TILT_STOPS[v] || TILT_STOPS[1];
    if (tiltLabel) tiltLabel.textContent = stop.label;
    if (tiltDesc) tiltDesc.textContent = stop.desc;
  }

  /* ---- Animate ---- */
  function animate() {
    requestAnimationFrame(animate);
    var hour = hourSlider ? parseFloat(hourSlider.value) : 12;
    var day = daySlider ? parseInt(daySlider.value) : 172;
    var tilt = getCurrentTilt();
    if (autoSpin) targetTheta -= 0.001;
    updateCamera();
    if (earth) updateSun(hour, day, tilt);
    updateDaylightBar(hour, day, tilt);
    updateLabels(hour, day);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', function () {
    W = container.clientWidth; H = container.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });

  /* ---- Reset ---- */
  var resetBtn = document.getElementById('globe-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      targetTheta = DEF_THETA; targetPhi = DEF_PHI; targetRadius = DEF_RADIUS;
      autoSpin = true;
      pinnedLat = null; pinnedLon = null;
      updatePinMarker();
      if (hourSlider) hourSlider.value = 12;
      if (daySlider) daySlider.value = 172;
      if (tiltSlider) { tiltSlider.value = 1; updateTiltLabel(); }
    });
  }

  if (tiltSlider) tiltSlider.addEventListener('input', updateTiltLabel);

  animate();
})();
