/* ============================================================
   GLOBE.JS — WebGL Earth globe using Three.js
   Hardware-accelerated, smooth orbit controls, zoom.
   ============================================================ */
(function () {
  'use strict';

  var container = document.getElementById('globe-container');
  if (!container) return;

  var THREE = window.THREE;
  if (!THREE) return;

  var TILT = 23.44;
  var DEG = Math.PI / 180;
  var TWO_PI = Math.PI * 2;

  /* ---- Sliders ---- */
  var hourSlider = document.getElementById('hour-slider');
  var daySlider = document.getElementById('day-slider');
  var hourLabel = document.getElementById('hour-label');
  var dayLabel = document.getElementById('day-label');
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

  function daylightHours(latDeg, dayOfYear) {
    var decl = TILT * DEG * Math.sin(TWO_PI * (dayOfYear - 81) / 365);
    var latRad = latDeg * DEG;
    var cosHA = -Math.tan(latRad) * Math.tan(decl);
    if (cosHA < -1) return { hours: 24, rise: 0, set: 24 };
    if (cosHA > 1) return { hours: 0, rise: 0, set: 0 };
    var hours = (2 * Math.acos(cosHA) / TWO_PI) * 24;
    var half = hours / 2;
    return { hours: hours, rise: 12 - half, set: 12 + half };
  }

  /* ---- Scene setup ---- */
  var W = container.clientWidth;
  var H = container.clientHeight;
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x0e1114, 1);
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 3.2);

  /* ---- Earth ---- */
  var textureLoader = new THREE.TextureLoader();
  var earthTexture = textureLoader.load('earth.jpg', function () {
    earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  });

  var earthGeom = new THREE.SphereGeometry(1, 96, 64);
  var earthMat = new THREE.MeshPhongMaterial({
    map: earthTexture,
    bumpMap: earthTexture,
    bumpScale: 0.04,
    specularMap: earthTexture,
    specular: new THREE.Color(0x222222),
    shininess: 15
  });
  var earth = new THREE.Mesh(earthGeom, earthMat);
  earth.rotation.y = -0.5;
  scene.add(earth);

  /* ---- Atmosphere glow ---- */
  var atmosGeom = new THREE.SphereGeometry(1.015, 64, 48);
  var atmosMat = new THREE.ShaderMaterial({
    vertexShader: [
      'varying vec3 vNormal;',
      'varying vec3 vPos;',
      'void main() {',
      '  vNormal = normalize(normalMatrix * normal);',
      '  vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;',
      '  gl_Position = projectionMatrix * vec4(vPos, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vNormal;',
      'varying vec3 vPos;',
      'void main() {',
      '  float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);',
      '  gl_FragColor = vec4(0.35, 0.55, 0.9, 1.0) * intensity * 0.6;',
      '}'
    ].join('\n'),
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true
  });
  var atmosphere = new THREE.Mesh(atmosGeom, atmosMat);
  scene.add(atmosphere);

  /* ---- Sun light ---- */
  var sunLight = new THREE.DirectionalLight(0xfff8f0, 1.8);
  sunLight.position.set(5, 2, 5);
  scene.add(sunLight);

  var ambientLight = new THREE.AmbientLight(0x334455, 0.35);
  scene.add(ambientLight);

  /* ---- Raycaster for hover ---- */
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var hoverLat = null, hoverLon = null;

  /* ---- Orbit controls (manual) ---- */
  var isDragging = false;
  var prevMouse = { x: 0, y: 0 };
  var spherical = { theta: -0.5, phi: Math.PI / 2 - 0.25, radius: 3.2 };
  var autoSpin = true;
  var targetTheta = spherical.theta;
  var targetPhi = spherical.phi;
  var targetRadius = spherical.radius;
  var MIN_RADIUS = 1.6;
  var MAX_RADIUS = 8;
  var DEFAULT_THETA = -0.5;
  var DEFAULT_PHI = Math.PI / 2 - 0.25;
  var DEFAULT_RADIUS = 3.2;

  function updateCamera() {
    // Smooth interpolation
    spherical.theta += (targetTheta - spherical.theta) * 0.12;
    spherical.phi += (targetPhi - spherical.phi) * 0.12;
    spherical.radius += (targetRadius - spherical.radius) * 0.12;

    // Clamp phi
    spherical.phi = Math.max(0.15, Math.min(Math.PI - 0.15, spherical.phi));

    var r = spherical.radius;
    camera.position.x = r * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.y = r * Math.cos(spherical.phi);
    camera.position.z = r * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.lookAt(0, 0, 0);
  }

  function getMousePos(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    var src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) / rect.width * 2 - 1,
      y: -(src.clientY - rect.top) / rect.height * 2 + 1,
      px: src.clientX - rect.left,
      py: src.clientY - rect.top
    };
  }

  renderer.domElement.addEventListener('mousedown', function (e) {
    isDragging = true; autoSpin = false;
    var p = getMousePos(e);
    prevMouse.x = p.px; prevMouse.y = p.py;
  });

  renderer.domElement.addEventListener('mousemove', function (e) {
    var p = getMousePos(e);

    if (isDragging) {
      var dx = p.px - prevMouse.x;
      var dy = p.py - prevMouse.y;
      targetTheta -= dx * 0.005;
      targetPhi -= dy * 0.005;
      prevMouse.x = p.px; prevMouse.y = p.py;
    }

    // Hover raycast
    mouse.x = p.x; mouse.y = p.y;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObject(earth);
    if (hits.length > 0) {
      var point = hits[0].point;
      hoverLat = Math.asin(point.y) / DEG;
      hoverLon = Math.atan2(point.x, point.z) / DEG - earth.rotation.y / DEG;
      // Normalize lon
      while (hoverLon > 180) hoverLon -= 360;
      while (hoverLon < -180) hoverLon += 360;
    } else {
      hoverLat = null; hoverLon = null;
    }
  });

  renderer.domElement.addEventListener('mouseup', function () { isDragging = false; });
  renderer.domElement.addEventListener('mouseleave', function () { isDragging = false; hoverLat = null; hoverLon = null; });

  // Touch
  renderer.domElement.addEventListener('touchstart', function (e) {
    e.preventDefault(); isDragging = true; autoSpin = false;
    var p = getMousePos(e);
    prevMouse.x = p.px; prevMouse.y = p.py;

    mouse.x = p.x; mouse.y = p.y;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObject(earth);
    if (hits.length > 0) {
      var point = hits[0].point;
      hoverLat = Math.asin(point.y) / DEG;
      hoverLon = Math.atan2(point.x, point.z) / DEG - earth.rotation.y / DEG;
      while (hoverLon > 180) hoverLon -= 360;
      while (hoverLon < -180) hoverLon += 360;
    }
  }, { passive: false });

  renderer.domElement.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var p = getMousePos(e);
    var dx = p.px - prevMouse.x;
    var dy = p.py - prevMouse.y;
    targetTheta -= dx * 0.005;
    targetPhi -= dy * 0.005;
    prevMouse.x = p.px; prevMouse.y = p.py;
  }, { passive: false });

  renderer.domElement.addEventListener('touchend', function () {
    isDragging = false; hoverLat = null; hoverLon = null;
  });

  // Zoom
  renderer.domElement.addEventListener('wheel', function (e) {
    e.preventDefault();
    autoSpin = false;
    targetRadius += e.deltaY * 0.002;
    targetRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, targetRadius));
  }, { passive: false });

  // Pinch zoom
  var lastPinchDist = 0;
  renderer.domElement.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var delta = lastPinchDist - dist;
      targetRadius += delta * 0.01;
      targetRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, targetRadius));
      lastPinchDist = dist;
    }
  }, { passive: false });

  /* ---- Sun position update ---- */
  function updateSun(hour, day) {
    var decl = TILT * DEG * Math.sin(TWO_PI * (day - 81) / 365);
    var lonRad = -(hour - 12) * 15 * DEG;
    // Sun direction in world space (accounting for earth rotation)
    var earthRot = earth.rotation.y;
    sunLight.position.set(
      Math.cos(decl) * Math.sin(lonRad + earthRot) * 10,
      Math.sin(decl) * 10,
      Math.cos(decl) * Math.cos(lonRad + earthRot) * 10
    );
  }

  /* ---- Daylight bar ---- */
  function updateDaylightBar(hour, day) {
    var lat = hoverLat !== null ? hoverLat : 0;
    var dl = daylightHours(lat, day);

    if (daylightBarCanvas) {
      var w = daylightBarCanvas.width, h = daylightBarCanvas.height;
      var bc = daylightBarCanvas.getContext('2d');
      bc.clearRect(0, 0, w, h);
      bc.fillStyle = '#0e1214';
      bc.fillRect(0, 0, w, h);
      if (dl.hours > 0 && dl.hours < 24) {
        var x1 = (dl.rise / 24) * w, x2 = (dl.set / 24) * w;
        var grad = bc.createLinearGradient(x1, 0, x2, 0);
        grad.addColorStop(0, '#4a3520'); grad.addColorStop(0.15, '#c49540');
        grad.addColorStop(0.5, '#e8c060'); grad.addColorStop(0.85, '#c49540');
        grad.addColorStop(1, '#4a3520');
        bc.fillStyle = grad; bc.fillRect(x1, 0, x2 - x1, h);
      } else if (dl.hours >= 24) {
        bc.fillStyle = '#c49540'; bc.fillRect(0, 0, w, h);
      }
      var cx = (hour / 24) * w;
      bc.fillStyle = dl.hours <= 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)';
      bc.fillRect(cx - 1, 0, 2, h);
      bc.fillStyle = 'rgba(255,255,255,0.1)';
      for (var t = 0; t < 24; t += 6) bc.fillRect((t / 24) * w, 0, 1, h);
    }

    var latStr = hoverLat !== null ? Math.abs(Math.round(lat)) + '\u00B0' + (lat >= 0 ? 'N' : 'S') : 'Equator';
    if (daylightLabel) {
      if (dl.hours >= 24) daylightLabel.textContent = latStr + ': 24h daylight (midnight sun)';
      else if (dl.hours <= 0) daylightLabel.textContent = latStr + ': 0h daylight (polar night)';
      else daylightLabel.textContent = latStr + ': ' + dl.hours.toFixed(1) + 'h daylight';
    }
    if (sunriseLabel) {
      if (dl.hours >= 24) sunriseLabel.textContent = 'Sun never sets';
      else if (dl.hours <= 0) sunriseLabel.textContent = 'Sun never rises';
      else {
        var rh = dl.rise | 0, rm = Math.round((dl.rise - rh) * 60);
        var sh = dl.set | 0, sm = Math.round((dl.set - sh) * 60);
        sunriseLabel.textContent = 'Rise ' + (rh<10?'0':'') + rh + ':' + (rm<10?'0':'') + rm +
          '  Set ' + (sh<10?'0':'') + sh + ':' + (sm<10?'0':'') + sm;
      }
    }
  }

  /* ---- Labels ---- */
  function updateLabels(hour, day) {
    if (hourLabel) {
      var h = hour | 0, m = Math.round((hour - h) * 60);
      hourLabel.textContent = (h<10?'0':'') + h + ':' + (m<10?'0':'') + m + ' UTC';
    }
    if (dayLabel) dayLabel.textContent = dayToDate(day);
    if (hoverInfo) {
      if (hoverLat !== null) {
        hoverInfo.textContent = Math.abs(Math.round(hoverLat)) + '\u00B0' + (hoverLat >= 0 ? 'N' : 'S') +
          ', ' + Math.abs(Math.round(hoverLon)) + '\u00B0' + (hoverLon >= 0 ? 'E' : 'W');
      } else {
        hoverInfo.textContent = 'drag to spin \u2022 scroll to zoom';
      }
    }
  }

  /* ---- Animate ---- */
  function animate() {
    requestAnimationFrame(animate);

    var hour = hourSlider ? parseFloat(hourSlider.value) : 12;
    var day = daySlider ? parseInt(daySlider.value) : 172;

    if (autoSpin) {
      targetTheta -= 0.001;
    }

    updateCamera();
    updateSun(hour, day);
    updateDaylightBar(hour, day);
    updateLabels(hour, day);

    renderer.render(scene, camera);
  }

  /* ---- Resize ---- */
  function onResize() {
    W = container.clientWidth; H = container.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }
  window.addEventListener('resize', onResize);

  /* ---- Reset ---- */
  var resetBtn = document.getElementById('globe-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      targetTheta = DEFAULT_THETA;
      targetPhi = DEFAULT_PHI;
      targetRadius = DEFAULT_RADIUS;
      autoSpin = true;
      if (hourSlider) hourSlider.value = 12;
      if (daySlider) daySlider.value = 172;
    });
  }

  /* ---- Start ---- */
  animate();

})();
