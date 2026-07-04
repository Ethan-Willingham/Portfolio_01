  // ====== RENDER: Background helpers (embers, stars) ======

  // ----- Helper: drifting embers in magma/mantle background -----
  // Embers are pseudo-random points that rise slowly with a flicker. We
  // generate them on a grid keyed off world position so they're consistent
  // across frames (no popping when the camera moves) but appear scattered.
  function drawEmbers(x0, x1, y0, y1, hot) {
    var t = performance.now() / 1000;
    var step = 38;            // grid spacing — coarse enough to stay cheap
    // v23.34 — colour is constant across the grid; hoist the prefix, vary alpha.
    var emberPrefix = hot ? 'rgba(255,200,120,' : 'rgba(255,160,80,';
    var startX = Math.floor(x0 / step) * step;
    for (var ex = startX; ex < x1 + step; ex += step) {
      for (var ey = Math.floor(y0 / step) * step; ey < y1 + step; ey += step) {
        // Per-cell pseudo-random offsets/seed so each ember has its own life
        var seed = ((ex * 73856093) ^ (ey * 19349663)) >>> 0;
        var rx = (seed % 100) / 100;
        var ry = ((seed >>> 7) % 100) / 100;
        var phase = ((seed >>> 13) % 1000) / 1000 * Math.PI * 2;
        var speed = 0.4 + ((seed >>> 19) % 100) / 200;     // 0.4–0.9
        // Slow upward drift, looping over the cell height
        var lifeY = (t * 14 * speed + ry * step) % step;
        var px = ex + rx * step + Math.sin(t * 1.5 + phase) * 4;
        var py = ey + step - lifeY;
        if (py < y0 || py > y1) continue;
        // Fade in & out near the top/bottom of its loop
        var lp = lifeY / step;       // 0 (just spawned at bottom) → 1 (top)
        var alpha = Math.sin(lp * Math.PI) * 0.7;     // peaks mid-life
        if (alpha < 0.05) continue;
        var size = 0.9 + Math.sin(t * 4 + phase) * 0.3;
        ctx.fillStyle = emberPrefix + alpha.toFixed(2) + ')';
        ctx.fillRect(px, py, size, size);
        // Occasional brighter spark
        if ((seed % 11) === 0 && alpha > 0.4) {
          ctx.fillStyle = 'rgba(255,255,200,' + (alpha * 0.5).toFixed(2) + ')';
          ctx.fillRect(px, py, 0.6, 0.6);
        }
      }
    }
  }

  // ====== RENDER: Night sky (procedural pixel cosmos) ======
  //
  // Stage 2 of the background revamp. Replaces the v10.19 NASA photo and
  // smooth gradients with a fully procedural pixel-art sky drawn at
  // world-pixel resolution so it matches the foreground tile/sprite
  // frequency — the eye no longer reads two different art styles
  // ("photo behind a window" vs "hand-painted world").
  //
  // Layers, bottom-up inside the baked texture:
  //   1. Dithered vertical gradient between SKY's 5 stops (skyDeepest →
  //      skyHorizon). 4×4 ordered (Bayer) dither so transitions read as
  //      hard-edged pixel bands, not smooth gradient fills.
  //   2. Faint painted nebula band — sparse pixel scatter in
  //      SKY.nebulaCool / SKY.nebulaWarm, density falling off from the
  //      band centerline. Heavily dithered, low contrast — sits between
  //      sky and stars and unifies the cosmos with the mountain palette.
  //   3. Three baked star tiers in SKY.starDim/Mid/Bright with rare
  //      SKY.starWarm and SKY.starBlue accents. Each star is a single
  //      world-pixel-sized fillRect; bright tier gets 2× sized cores.
  //
  // On top of the baked texture each frame:
  //   4. ~50 animated twinklers using SKY.starHot for the brightest cores
  //      (the only place starHot appears anywhere in the game). Sinusoidal
  //      alpha pulse, never sync, per BACKGROUND_STYLE §7.
  //
  // Cost per frame: one drawImage + ~50 fillRects. Texture rebuilds only
  // on viewport size change.

  // v10.27 — split sky texture into two cached canvases:
  //   gradient: biome-dependent, rebuilt on altitude bucket change.
  //   stars:    biome-INdependent, rebuilt only on viewport / pixUnit change.
  // Before this split, every altitude bucket triggered a full rebuild of
  // both layers (stars + gradient + nebula), and jetpacking up through the
  // atmosphere thrashed FPS because the star pass alone is ~5k fillRects.
  var nightSkyGradientTex = null;
  var nightSkyGradientBuf = null;   // reusable ImageData buffer
  var nightSkyStarsTex = null;
  var nightSkyTwinklers = null;
  var nightSkyDitherLUT = null;     // 256×256 Uint8Array, built once

  // v25.34 (owner) — the night star field read too strong and pulled the eye
  // off the game. One master dimmer scales the whole baked star+nebula layer
  // AND the twinklers together (multiplied into their draw-time alpha, on top
  // of the twilight starWeight fade), so the cosmos sits quietly behind the
  // world instead of competing with it. `twinkle` is the pulse DEPTH of the
  // animated stars: lower = a gentler breath, less attention-grabbing motion
  // (per the "barely perceptible motion" rule). Both are live gm levers in the
  // `sky` group (sky.NIGHT_DIM / sky.TWINKLE).
  var NIGHT_SKY = {
    intensity: 0.6,    // master brightness of stars + nebula + twinklers (1 = old look)
    twinkle:   0.30    // twinkle pulse depth (was 0.45); 0 = steady, higher = flickerier
  };

  // ===== Stage 5e — WebGL per-pixel atmospheric scattering =====
  // The 5-stop ImageData path (still kept as fallback) bakes the same
  // Maxime Heckel raymarch but only at 5 view elevations along a single
  // vertical line, then dithers across rows. That gives correct vertical
  // colour but no per-pixel angular variation around the sun: the bright
  // Mie corona at sunset is uniform along each row instead of glowing
  // outward from where the disc actually sits on the screen.
  //
  // This module renders the same scattering math in a fragment shader,
  // one ray per pixel, every frame. The vertical stops are gone; each
  // pixel does its own primary-ray + light-march, sees its own true mu
  // (view·sun), and produces angular variation in 2D — same as the
  // article's WebGL demo. The output canvas is composited onto the 2D
  // ctx via drawImage, so stars/sun/moon/twinklers/Belt of Venus/
  // mountains all overlay it unchanged. Falls back to the ImageData
  // path on browsers without WebGL.
  var skyGL = null;            // WebGLRenderingContext, false if unsupported, null = uninit
  var skyGLLastDrew = false;   // true if the most recent sky paint was the WebGL pipeline (which paints the sun)
  var skyGLCanvas = null;
  // v11.78 — the atmospheric raymarch renders to a canvas this fraction of
  // the viewport, then upscales. 1 = full res; 0.5 = quarter the fragments.
  var SKY_GL_RES_SCALE = 0.5;
  var skyGLLastKey = '';        // v11.82 — atmosphere-render cache key
  var skyGLProgram = null;
  var skyGLQuadBuf = null;
  var skyGLAttribPos = -1;
  var skyGLU = {};             // uniform locations

  var SKY_GL_VS = [
    'attribute vec2 aPos;',
    'void main() { gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  // Fragment shader — direct 1:1 port of Maxime Heckel's atmospheric
  // scattering shader from his blog post (the live shadertoy widget):
  //   github.com/MaximeHeckel/blog.maximeheckel.com
  //   /core/components/MDX/Widgets/AtmosphericScattering/skyDome.ts
  //
  // Key differences vs my earlier port:
  //   - Flat-earth raymarch (no planet sphere intersection). Altitude
  //     just `observerAltitude + t * rayDir.y`. Atmosphere is a slab
  //     from y=0 to y=atmosphereHeight; ground at y=0.
  //   - Mie density has a two-term model: boundary aerosols + thin
  //     upper haze. Adds the high-altitude "haze layer" feel.
  //   - Ozone density uses a smoothstep tent across normalized
  //     altitude, not a linear tent in km.
  //   - Built-in softSunDisc(viewDir, sunDir): Gaussian core +
  //     smoothstep limb + exponential halo. NO separate bloom pass —
  //     the halo is part of the disc function. Disc light is
  //     multiplied by viewTransmittance so the sun reddens through
  //     atmospheric extinction.
  //   - Constants verbatim: rayleighBeta (0.0058, 0.0135, 0.0331),
  //     mieBeta 0.021, mieG 0.758, ozoneBetaAbs (0.00065, 0.00188,
  //     0.000085), sunIntensity 20, observerAltitude 10, atmosphere
  //     height 80, scale heights 8 + 1.2.
  //   - Wider twilight band: skyLightFactor smoothstep -0.16→+0.06,
  //     directSunFactor smoothstep -0.08→+0.03 (sin(elev) units).
  //
  // FOV mapping unchanged (FOV_H=π, FOV_V=π/2) so screen pixels still
  // map cleanly to the sky hemisphere; sunDir is still computed in JS
  // from celestialPos's screen position via the inverse mapping so
  // mu=1 lands exactly where the disc visually is.
  // v10.65 — exact port of Maxime's shader, stripped of everything I
  // added. Proper perspective camera (fovY + pitch), 3D sunDir,
  // Maxime's softSunDisc, ACES, gamma. No palette cross-fade, no
  // dither, no custom FOV mapping. Just his shader.
  //
  // Exaggerated sunset grade — "Volcanic" vibe, chosen in sunset-lab.html.
  // Four pipeline stages stack on the Maxime scattering base (ozone
  // absorption, multi-scatter glow, a horizon-gated 5-stop colour ramp, and
  // a saturation-preserving Reinhard), gated to a tight twilight window so
  // daytime stays pure blue. These are the baked lab values; uploaded as the
  // uG*/u* uniforms below. Ramp stops run sun-side → anti-sun, raw sRGB /255.
  var SKY_SUNSET_GRADE = {
    drama:    1.0,    // master strength of the grade
    sat:      1.26,   // saturation lift inside the twilight window
    ozone:    0.32,   // ozone absorption (twilight blue/violet band)
    multi:    0.24,   // multiple-scattering ambient fill
    gain:     1.8,    // grade luminance gain
    floor:    0.06,   // grade luminance floor
    contrast: 1.02,   // grade luminance contrast
    radial:   0.7,    // 0 = vertical ramp, 1 = radial-from-sun ramp
    twi:      0.32,   // twilight span in sin(elevation) space (v24.52 — widened 0.28→0.32 so the grade eases in/out rather than snapping on near the horizon)
    twiShape: 2.8,    // horizon-bias exponent (>1 keeps midday blue untouched)
    stops: [
      [1.0,      0.823529, 0.478431], // #ffd27a  warm gold (sun core)
      [1.0,      0.494118, 0.211765], // #ff7e36  orange
      [0.901961, 0.227451, 0.117647], // #e63a1e  ember red
      [0.556863, 0.117647, 0.094118], // #8e1e18  deep maroon
      [0.164706, 0.078431, 0.062745]  // #2a1410  near-black ash (anti-sun)
    ]
  };
  var SKY_GL_FS = [
    'precision highp float;',
    'uniform vec2  uResolution;',
    'uniform float uSkyBottomPx;',
    'uniform vec3  uSunDir;',
    'uniform vec2  uSunNDC;',         // sun position in NDC space (-1..+1), JS-projected
    'uniform float uSunOnScreen;',    // 1 if sun is in front of camera, 0 if behind
    'uniform float uFovY;',
    'uniform float uPitch;',
    'uniform float uAspect;',
    '',
    'const float PI = 3.14159265;',
    'const int   PRIMARY_STEPS = 24;',
    '',
    // Maxime's verbatim constants — Earth-like, units ≈ km. Originally a
    // flat "unitless slab"; v24.138 bends the PRIMARY ray over a spherical
    // planet (radius below), matching the in-file JS reference
    // (scatComputeColor, which always used scatRaySphere). The flat plane
    // was the cause of the horizon razor: every ray below 0° elevation
    // slammed into ground at observerAltitude/-rayDir.y, collapsing the lit
    // path within a few pixels of the horizon row. On a sphere, rays just
    // below 0° clear the limb smoothly and ground chords grow gradually —
    // the blaze rolls off over several degrees instead of dying on a knife
    // edge, BEHIND the clouds and mountains by construction (it is the sky
    // itself). lightMarch + sunlightVisibility stay flat-slab on purpose:
    // they carry the dialled twilight behaviour, and only the primary
    // geometry makes the razor.
    'const float planetRadius        = 6371.0;',
    'const float observerAltitude    = 10.0;',
    'const float atmosphereHeight    = 80.0;',
    'const float rayleighScaleHeight = 8.0;',
    'const float mieScaleHeight      = 1.2;',
    'const vec3  rayleighBeta        = vec3(0.0058, 0.0135, 0.0331);',
    'const float mieBeta             = 0.021;',
    'const float mieBetaExt          = 0.021;',
    'const vec3  ozoneBetaAbs        = vec3(0.00065, 0.00188, 0.000085);',
    'uniform float mieG;',
    'uniform float sunIntensity;',
    'uniform float sunDiscSize;',
    'uniform vec2  uMoonNDC;',         // moon position in NDC, JS-projected
    'uniform float uMoonVis;',         // 0 day .. 1 night
    'uniform float uMoonGlow;',        // lit fraction of the current phase
    'uniform float uMoonDiscPx;',      // moon disc radius in device px
    'uniform float uMoonGlowStr;',     // corona intensity
    'uniform float uMoonGlowSize;',    // corona falloff size, in disc-radii
    'uniform vec3  uMoonGlowColor;',   // corona colour
    '',
    // ---- Sunset colour-grade ("Volcanic" vibe) — values in SKY_SUNSET_GRADE (JS).
    // Four stages stacked on the Maxime base: ozone absorption, multi-scatter
    // glow, a horizon-gated colour ramp, and a saturation-preserving Reinhard.
    // Gated to a tight twilight window so daytime stays pure blue.
    'uniform float uDrama;',       // master strength of the grade
    'uniform float uSat;',         // saturation lift inside the twilight window
    'uniform float uOzone;',       // ozone absorption (twilight blue/violet band)
    'uniform float uMulti;',       // multiple-scattering ambient fill
    'uniform float uGain;',        // grade luminance gain
    'uniform float uFloor;',       // grade luminance floor
    'uniform float uContrast;',    // grade luminance contrast
    'uniform float uRadial;',      // 0 = vertical ramp, 1 = radial-from-sun ramp
    'uniform float uTwi;',         // twilight span in sin(elevation) space
    'uniform float uTwiShape;',    // horizon-bias exponent (>1 keeps midday blue)
    'uniform vec3  uG0;',          // 5-stop colour ramp (sun-side .. anti-sun)
    'uniform vec3  uG1;',
    'uniform vec3  uG2;',
    'uniform vec3  uG3;',
    'uniform vec3  uG4;',
    '',
    'float rayleighDensity(float h){',
    '  return exp(-max(h, 0.0) / max(rayleighScaleHeight, 1e-4));',
    '}',
    '',
    'float mieDensity(float h){',
    '  float altitude = max(h, 0.0);',
    '  float boundaryAerosols = exp(altitude / -max(mieScaleHeight, 1e-4));',
    '  float upperHaze = 0.07 * exp(altitude / -8.0);',
    '  return boundaryAerosols + upperHaze;',
    '}',
    '',
    // Ozone tent — peaks mid-atmosphere (~0.33 of the slab). Cheap stand-in
    // for the Chappuis absorption band that paints the twilight blue/violet.
    'float ozoneDensity(float h){',
    '  float au = clamp(h / atmosphereHeight, 0.0, 1.0);',
    '  return max(0.0, 1.0 - abs(au - 0.33) / 0.35);',
    '}',
    '',
    'float rayleighPhase(float mu){',
    '  return 3.0 / (16.0 * PI) * (1.0 + mu * mu);',
    '}',
    '',
    'float miePhase(float mu){',
    '  float g = mieG;',
    '  float gg = g * g;',
    '  float num = 3.0 * (1.0 - gg) * (1.0 + mu * mu);',
    '  float den = (8.0 * PI) * (2.0 + gg) * pow(max(1.0 + gg - 2.0 * g * mu, 1e-4), 1.5);',
    '  return num / den;',
    '}',
    '',
    'vec3 lightMarch(float startHeight, float muSun){',
    // Exact: LIGHT_STEPS = 4 (user picked 4)
    '  float denom = max(muSun + 0.15, 0.04);',
    '  float maxDist = (atmosphereHeight - startHeight) / denom;',
    '  float stepSize = max(maxDist, 0.0) / 4.0;',
    '  float odR = 0.0;',
    '  float odM = 0.0;',
    '  float odO = 0.0;',
    '  for (int i = 0; i < 4; i++){',
    '    float t = (float(i) + 0.5) * stepSize;',
    '    float h = startHeight + t * muSun;',
    '    if (h < 0.0 || h > atmosphereHeight) continue;',
    '    odR += rayleighDensity(h) * stepSize;',
    '    odM += mieDensity(h) * stepSize;',
    '    odO += ozoneDensity(h) * stepSize;',
    '  }',
    '  return vec3(odR, odM, odO);',
    '}',
    '',
    'vec3 ACESFilm(vec3 x){',
    '  const float a = 2.51;',
    '  const float b = 0.03;',
    '  const float c = 2.43;',
    '  const float d = 0.59;',
    '  const float e = 0.14;',
    '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
    '}',
    '',
    // Sun disc — same Gaussian core + smoothstep limb + exponential
    // halo as Maxime's softSunDisc, but the distance is measured in
    // SCREEN SPACE (against the JS-projected sun NDC) instead of as
    // an angular dot product. Result: the disc is a true circle in
    // pixel space and stops getting elongated radially outward by
    // perspective when fovY is wide. The atmospheric corona around
    // the disc still uses angular mu via the Mie phase, so the warm
    // wrap is preserved.
    'float softSunDisc(vec2 fragNDC, vec2 sunNDC, float discScale){',
    '  const float BASE_RADIUS = 0.005;',
    '  float radius = BASE_RADIUS * max(discScale, 0.1);',
    // Convert pixel distance back to radians using the vertical pix-
    // per-radian, so the falloff curve looks identical to the angular
    // version at screen centre.
    '  float pxPerRad = uResolution.y / max(uFovY, 1e-4);',
    '  vec2 dpx = (fragNDC - sunNDC) * uResolution * 0.5;',
    '  float distRad = length(dpx) / max(pxPerRad, 1e-4);',
    '  float core = exp(-pow(distRad / max(radius * 0.7, 1e-5), 2.0));',
    '  float limb = smoothstep(radius * 1.3, radius * 0.2, distRad);',
    '  float halo = exp(-distRad / max(radius * 18.0, 1e-5));',
    '  return core * limb + 0.25 * halo;',
    '}',
    '',
    // Five-stop colour ramp for the twilight grade. p: 0 = sun-side, 1 = anti-sun.
    'vec3 sampleRamp(float p){',
    '  p = clamp(p, 0.0, 1.0) * 4.0;',
    // v24.52 — smoothstep each segment (was a raw linear mix). Linear blends
    // between the five saturated stops left a slope kink at every boundary that
    // the eye reads as a hard band in the sunset sky (Mach banding); smoothstep
    // zeroes the slope at each stop so the ramp is smooth end to end.
    '  if (p < 1.0) return mix(uG0, uG1, smoothstep(0.0, 1.0, p));',
    '  if (p < 2.0) return mix(uG1, uG2, smoothstep(0.0, 1.0, p - 1.0));',
    '  if (p < 3.0) return mix(uG2, uG3, smoothstep(0.0, 1.0, p - 2.0));',
    '  return mix(uG3, uG4, smoothstep(0.0, 1.0, p - 3.0));',
    '}',
    '',
    'void main(){',
    '  vec2 fc = gl_FragCoord.xy;',
    '  float yTop = uResolution.y - fc.y;',
    '  if (yTop > uSkyBottomPx) { gl_FragColor = vec4(0.0); return; }',
    '',
    // v10.65 — true perspective unprojection + pitch. Matches a 3D
    // camera at origin looking along +z, pitched up by uPitch radians.
    // Equivalent to inverting Maxime's projectionMatrixInverse +
    // viewMatrixInverse for an identity view (no pan/yaw, just pitch).
    '  vec2 ndc = (fc / uResolution) * 2.0 - 1.0;',
    '  float t = tan(uFovY * 0.5);',
    '  vec3 viewRay = vec3(ndc.x * t * uAspect, ndc.y * t, 1.0);',
    '  float c = cos(uPitch);',
    '  float s = sin(uPitch);',
    '  vec3 rayDir = normalize(vec3(',
    '    viewRay.x,',
    '    c * viewRay.y + s * viewRay.z,',
    '    -s * viewRay.y + c * viewRay.z',
    '  ));',
    '',
    '  vec3 sunDirection = normalize(uSunDir);',
    '  float sunElevation = sunDirection.y;',
    '  float skyLightFactor   = smoothstep(-0.16, 0.06, sunElevation);',
    '  float directSunFactor  = smoothstep(-0.08, 0.03, sunElevation);',
    '  float skySunIntensity    = sunIntensity * skyLightFactor;',
    '  float directSunIntensity = sunIntensity * directSunFactor;',
    '',
    // Spherical primary-ray geometry (v24.138). Observer at radius Ro;
    // |P(t)|² = Ro² + 2·Ro·rayDir.y·t + t² (rayDir is unit length), so both
    // intersections come from one quadratic in t with half-b = Ro·rayDir.y.
    // March to the atmosphere-shell exit, or the planet hit if sooner.
    '  float Ro = planetRadius + observerAltitude;',
    '  float Ra = planetRadius + atmosphereHeight;',
    '  float bq = Ro * rayDir.y;',
    '  float rayStart = 0.0;',
    '  float rayEnd = -bq + sqrt(max(bq * bq - Ro * Ro + Ra * Ra, 0.0));',
    '  if (rayDir.y < 0.0) {',
    '    float discG = bq * bq - Ro * Ro + planetRadius * planetRadius;',
    '    if (discG > 0.0) {',
    '      float tGround = -bq - sqrt(discG);',
    '      if (tGround > 0.0) rayEnd = min(rayEnd, tGround);',
    '    }',
    '  }',
    '  float stepSize = (rayEnd - rayStart) / float(PRIMARY_STEPS);',
    '',
    '  float viewODR = 0.0;',
    '  float viewODM = 0.0;',
    '  float viewODO = 0.0;',
    '  vec3 sumR = vec3(0.0);',
    '  vec3 sumM = vec3(0.0);',
    '  float mu = dot(rayDir, sunDirection);',
    '  float phaseR = rayleighPhase(mu);',
    '  float phaseM = miePhase(mu);',
    '',
    '  for (int i = 0; i < 24; i++) {',
    '    float tt = rayStart + (float(i) + 0.5) * stepSize;',
    '    float h = sqrt(Ro * Ro + 2.0 * bq * tt + tt * tt) - planetRadius;',
    '    if (h < 0.0) break;',
    '    if (h > atmosphereHeight) break;',
    '    float groundFade = smoothstep(0.0, 2.0, h);',
    '    float dR = rayleighDensity(h) * groundFade;',
    '    float dM = mieDensity(h)      * groundFade;',
    '    float dO = ozoneDensity(h)    * groundFade;',
    '    viewODR += dR * stepSize;',
    '    viewODM += dM * stepSize;',
    '    viewODO += dO * stepSize;',
    '',
    '    vec3 sunOD = lightMarch(h, sunDirection.y);',
    '    vec3 tau = rayleighBeta * (sunOD.x + viewODR)',
    '             + mieBetaExt   * (sunOD.y + viewODM)',
    '             + ozoneBetaAbs * uOzone * (sunOD.z + viewODO);',
    '    vec3 transmittance = exp(-tau);',
    '',
    '    float altitude01 = clamp(h / max(atmosphereHeight, 1e-4), 0.0, 1.0);',
    '    float minSunElevationForLight = mix(0.0, -0.16, altitude01);',
    '    float sunlightVisibility = smoothstep(',
    '      minSunElevationForLight - 0.02,',
    '      minSunElevationForLight + 0.02,',
    '      sunElevation',
    '    );',
    '',
    '    sumR += dR * transmittance * sunlightVisibility * stepSize;',
    '    sumM += dM * transmittance * sunlightVisibility * stepSize;',
    '  }',
    '',
    '  vec3 scatteredLight = skySunIntensity * (',
    '    phaseR * rayleighBeta * sumR +',
    '    phaseM * mieBeta * sumM',
    '  );',
    // Multiple-scattering: cheap Hillaire-style isotropic ambient fill.
    '  scatteredLight += uMulti * skySunIntensity * (rayleighBeta * sumR + mieBeta * sumM) * (1.0 / (4.0 * PI)) * 9.0;',
    '  vec3 viewTransmittance = exp(-(rayleighBeta * viewODR + mieBetaExt * viewODM + ozoneBetaAbs * uOzone * viewODO));',
    '',
    '  vec3 color = scatteredLight;',
    '',
    '  float sunAboveHorizon = smoothstep(-0.04, 0.04, sunDirection.y);',
    '  vec2 fragNDC = (fc / uResolution) * 2.0 - 1.0;',
    '  float sunShape = softSunDisc(fragNDC, uSunNDC, sunDiscSize) * uSunOnScreen;',
    '  vec3 sunTint = vec3(1.0, 0.97, 0.92);',
    '  vec3 sunDiscLight = sunTint * directSunIntensity * 12.0 * sunShape * viewTransmittance * sunAboveHorizon;',
    '  color += sunDiscLight;',
    '',
    '  // Moon ambient glow — a soft cool corona scattered through the same',
    '  // atmosphere as the sun disc. Anchored to the canvas-drawn disc and',
    '  // sized in disc-radii so it stays a tight corona hugging the moon',
    '  // instead of flooding the sky; scaled by the lit fraction of phase.',
    '  vec2  moonDpx = (fragNDC - uMoonNDC) * uResolution * 0.5;',
    '  float moonFall = max(uMoonDiscPx * uMoonGlowSize, 1.0);',
    '  float moonHalo = exp(-length(moonDpx) / moonFall);',
    '  color += uMoonGlowColor * moonHalo * uMoonVis * uMoonGlow * uMoonGlowStr * viewTransmittance;',
    '',
    // ---- Baseline LDR — the exact pre-grade game look (ACES + gamma) ----
    '  vec3 baseLDR = pow(ACESFilm(color), vec3(1.0 / 2.2));',
    '',
    // ---- Twilight grade — gated tight to sunrise/sunset, midday stays blue ----
    '  float twilight = 1.0 - smoothstep(0.0, uTwi, abs(sunElevation));',
    '  twilight = pow(twilight, max(uTwiShape, 0.25));',
    '  float dramaW = clamp(uDrama, 0.0, 2.0) * twilight;',
    '  vec3 outc = baseLDR;',
    '  if (dramaW > 0.001) {',
    '    float ang = acos(clamp(mu, -1.0, 1.0)) / PI;',           // 0 at sun .. 1 opposite
    '    float vert = smoothstep(0.0, 1.0, clamp(rayDir.y * 1.20 + 0.06, 0.0, 1.0));',  // 0 horizon .. 1 up; smoothstep removes the kink where it used to flatten abruptly to the dark ash stop
    '    float p = mix(vert, ang, uRadial);',
    '    float lum = max(scatteredLight.r, max(scatteredLight.g, scatteredLight.b));',
    '    float gl = pow(lum * uGain + uFloor, uContrast);',
    '    vec3 gradeHDR = sampleRamp(p) * gl;',
    '    gradeHDR += uG0 * (sunShape * directSunIntensity * 5.0) * viewTransmittance * sunAboveHorizon;',
    '    vec3 gradeLDR = gradeHDR / (1.0 + gradeHDR);',           // hue-preserving Reinhard
    '    gradeLDR = pow(gradeLDR, vec3(1.0 / 2.2));',
    '    outc = mix(baseLDR, gradeLDR, dramaW);',
    '    float L = dot(outc, vec3(0.2126, 0.7152, 0.0722));',
    '    outc = clamp(mix(vec3(L), outc, mix(1.0, uSat, dramaW)), 0.0, 1.0);',
    // v24.52 — interleaved-gradient dither (~1.5/255), scaled by the grade
    // weight. 8-bit colour over the big smooth twilight gradient bands even
    // with perfect math; a hair of ordered noise breaks it. Sunset-only
    // (dramaW), so the clean midday + night sky stay pristine.
    '    float ign = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));',
    '    outc += (ign - 0.5) * (1.5 / 255.0) * dramaW;',
    '  }',
    '',
    '  gl_FragColor = vec4(outc, 1.0);',
    '}'
  ].join('\n');

  function compileSkyGLShader(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      // Log to console so a broken port surfaces fast; fall back to JS path.
      console.warn('skyGL shader compile failed:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function initSkyGL() {
    if (skyGL !== null) return skyGL || null;
    var c = document.createElement('canvas');
    var gl = null;
    try {
      gl = c.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }) ||
           c.getContext('experimental-webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    } catch (e) {}
    if (!gl) { skyGL = false; return null; }
    var vs = compileSkyGLShader(gl, gl.VERTEX_SHADER, SKY_GL_VS);
    var fs = compileSkyGLShader(gl, gl.FRAGMENT_SHADER, SKY_GL_FS);
    if (!vs || !fs) { skyGL = false; return null; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('skyGL program link failed:', gl.getProgramInfoLog(prog));
      skyGL = false; return null;
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    skyGLCanvas    = c;
    skyGLProgram   = prog;
    skyGLQuadBuf   = buf;
    skyGLAttribPos = 0;
    skyGLU = {
      uResolution:    gl.getUniformLocation(prog, 'uResolution'),
      uSkyBottomPx:   gl.getUniformLocation(prog, 'uSkyBottomPx'),
      uSunDir:        gl.getUniformLocation(prog, 'uSunDir'),
      uSunNDC:        gl.getUniformLocation(prog, 'uSunNDC'),
      uSunOnScreen:   gl.getUniformLocation(prog, 'uSunOnScreen'),
      uFovY:          gl.getUniformLocation(prog, 'uFovY'),
      uPitch:         gl.getUniformLocation(prog, 'uPitch'),
      uAspect:        gl.getUniformLocation(prog, 'uAspect'),
      uSunIntensity:  gl.getUniformLocation(prog, 'sunIntensity'),
      uSunDiscSize:   gl.getUniformLocation(prog, 'sunDiscSize'),
      uMieG:          gl.getUniformLocation(prog, 'mieG'),
      uMoonNDC:       gl.getUniformLocation(prog, 'uMoonNDC'),
      uMoonVis:       gl.getUniformLocation(prog, 'uMoonVis'),
      uMoonGlow:      gl.getUniformLocation(prog, 'uMoonGlow'),
      uMoonDiscPx:    gl.getUniformLocation(prog, 'uMoonDiscPx'),
      uMoonGlowStr:   gl.getUniformLocation(prog, 'uMoonGlowStr'),
      uMoonGlowSize:  gl.getUniformLocation(prog, 'uMoonGlowSize'),
      uMoonGlowColor: gl.getUniformLocation(prog, 'uMoonGlowColor'),
      uDrama:         gl.getUniformLocation(prog, 'uDrama'),
      uSat:           gl.getUniformLocation(prog, 'uSat'),
      uOzone:         gl.getUniformLocation(prog, 'uOzone'),
      uMulti:         gl.getUniformLocation(prog, 'uMulti'),
      uGain:          gl.getUniformLocation(prog, 'uGain'),
      uFloor:         gl.getUniformLocation(prog, 'uFloor'),
      uContrast:      gl.getUniformLocation(prog, 'uContrast'),
      uRadial:        gl.getUniformLocation(prog, 'uRadial'),
      uTwi:           gl.getUniformLocation(prog, 'uTwi'),
      uTwiShape:      gl.getUniformLocation(prog, 'uTwiShape'),
      uG0:            gl.getUniformLocation(prog, 'uG0'),
      uG1:            gl.getUniformLocation(prog, 'uG1'),
      uG2:            gl.getUniformLocation(prog, 'uG2'),
      uG3:            gl.getUniformLocation(prog, 'uG3'),
      uG4:            gl.getUniformLocation(prog, 'uG4')
    };
    skyGL = gl;
    return gl;
  }

  // ===== v10.58 — bloom post-process =====
  // Three additional shaders + three FBOs build a separable Gaussian
  // bloom over the scatter pass. Pipeline:
  //   1. scatter shader → FBO_SCENE (post-tonemap LDR)
  //   2. bright-extract + horizontal blur → FBO_PING
  //   3. vertical blur → FBO_PONG
  //   4. composite (scene + bloom) → canvas (with discard outside sky)
  //
  // Bright extract uses a soft-knee threshold so the brightest sky
  // pixels (the corona near the sun) bleed outward as a saturated
  // halo. Bloom strength scales with horizon proximity so sunsets get
  // a fatter glow than noon.
  var skyGLFBO_Scene = null;
  var skyGLFBO_Ping  = null;
  var skyGLFBO_Pong  = null;
  var skyGLBrightProg    = null;
  var skyGLBlurVProg     = null;
  var skyGLCompositeProg = null;
  var skyGLBrightU = {}, skyGLBlurVU = {}, skyGLCompositeU = {};

  function makeFBO(gl, w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex: tex, fb: fb, w: w, h: h };
  }

  // Bright-extract + horizontal Gaussian (9 taps, 6-pixel spacing).
  // Threshold is a soft knee so we don't get hard crescents at the
  // bright/dark boundary.
  var SKY_GL_FS_BRIGHT = [
    'precision highp float;',
    'uniform sampler2D uSrc;',
    'uniform vec2  uSize;',
    'uniform float uThreshold;',
    'uniform float uSpacing;',
    'vec3 tap(vec2 fc){',
    '  vec2 uv = fc / uSize;',
    '  vec3 c = texture2D(uSrc, uv).rgb;',
    '  float lum = max(c.r, max(c.g, c.b));',
    '  float knee = smoothstep(uThreshold, uThreshold + 0.15, lum);',
    '  return c * knee;',
    '}',
    'void main(){',
    '  vec2 fc = gl_FragCoord.xy;',
    '  float s = uSpacing;',
    '  vec3 sum = vec3(0.0);',
    '  sum += tap(fc + vec2(-4.0*s, 0.0)) * 0.016216;',
    '  sum += tap(fc + vec2(-3.0*s, 0.0)) * 0.054054;',
    '  sum += tap(fc + vec2(-2.0*s, 0.0)) * 0.121622;',
    '  sum += tap(fc + vec2(-1.0*s, 0.0)) * 0.194595;',
    '  sum += tap(fc) * 0.227027;',
    '  sum += tap(fc + vec2( 1.0*s, 0.0)) * 0.194595;',
    '  sum += tap(fc + vec2( 2.0*s, 0.0)) * 0.121622;',
    '  sum += tap(fc + vec2( 3.0*s, 0.0)) * 0.054054;',
    '  sum += tap(fc + vec2( 4.0*s, 0.0)) * 0.016216;',
    '  gl_FragColor = vec4(sum, 1.0);',
    '}'
  ].join('\n');

  // Vertical Gaussian (no extract, just blur).
  var SKY_GL_FS_BLURV = [
    'precision highp float;',
    'uniform sampler2D uSrc;',
    'uniform vec2  uSize;',
    'uniform float uSpacing;',
    'vec3 tap(vec2 fc){ return texture2D(uSrc, fc / uSize).rgb; }',
    'void main(){',
    '  vec2 fc = gl_FragCoord.xy;',
    '  float s = uSpacing;',
    '  vec3 sum = vec3(0.0);',
    '  sum += tap(fc + vec2(0.0, -4.0*s)) * 0.016216;',
    '  sum += tap(fc + vec2(0.0, -3.0*s)) * 0.054054;',
    '  sum += tap(fc + vec2(0.0, -2.0*s)) * 0.121622;',
    '  sum += tap(fc + vec2(0.0, -1.0*s)) * 0.194595;',
    '  sum += tap(fc) * 0.227027;',
    '  sum += tap(fc + vec2(0.0,  1.0*s)) * 0.194595;',
    '  sum += tap(fc + vec2(0.0,  2.0*s)) * 0.121622;',
    '  sum += tap(fc + vec2(0.0,  3.0*s)) * 0.054054;',
    '  sum += tap(fc + vec2(0.0,  4.0*s)) * 0.016216;',
    '  gl_FragColor = vec4(sum, 1.0);',
    '}'
  ].join('\n');

  // Composite scene + bloom. Discards non-sky pixels so the underground
  // render isn't clobbered when the canvas blits.
  var SKY_GL_FS_COMPOSITE = [
    'precision highp float;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uBloom;',
    'uniform vec2  uSize;',
    'uniform float uSkyBottomPx;',
    'uniform float uBloomStrength;',
    'void main(){',
    '  vec2 fc = gl_FragCoord.xy;',
    '  float yTop = uSize.y - fc.y;',
    '  if (yTop > uSkyBottomPx) { gl_FragColor = vec4(0.0); return; }',
    '  vec2 uv = fc / uSize;',
    '  vec3 scene = texture2D(uScene, uv).rgb;',
    '  vec3 bloom = texture2D(uBloom, uv).rgb;',
    '  vec3 col = scene + bloom * uBloomStrength;',
    '  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);',
    '}'
  ].join('\n');

  function buildSkyGLProgram(gl, fsSrc) {
    var vs = compileSkyGLShader(gl, gl.VERTEX_SHADER, SKY_GL_VS);
    var fs = compileSkyGLShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('skyGL bloom program link failed:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function initSkyGLBloom(gl) {
    if (skyGLBrightProg && skyGLBlurVProg && skyGLCompositeProg) return true;
    skyGLBrightProg    = buildSkyGLProgram(gl, SKY_GL_FS_BRIGHT);
    skyGLBlurVProg     = buildSkyGLProgram(gl, SKY_GL_FS_BLURV);
    skyGLCompositeProg = buildSkyGLProgram(gl, SKY_GL_FS_COMPOSITE);
    if (!skyGLBrightProg || !skyGLBlurVProg || !skyGLCompositeProg) return false;
    skyGLBrightU = {
      uSrc:       gl.getUniformLocation(skyGLBrightProg, 'uSrc'),
      uSize:      gl.getUniformLocation(skyGLBrightProg, 'uSize'),
      uThreshold: gl.getUniformLocation(skyGLBrightProg, 'uThreshold'),
      uSpacing:   gl.getUniformLocation(skyGLBrightProg, 'uSpacing')
    };
    skyGLBlurVU = {
      uSrc:     gl.getUniformLocation(skyGLBlurVProg, 'uSrc'),
      uSize:    gl.getUniformLocation(skyGLBlurVProg, 'uSize'),
      uSpacing: gl.getUniformLocation(skyGLBlurVProg, 'uSpacing')
    };
    skyGLCompositeU = {
      uScene:         gl.getUniformLocation(skyGLCompositeProg, 'uScene'),
      uBloom:         gl.getUniformLocation(skyGLCompositeProg, 'uBloom'),
      uSize:          gl.getUniformLocation(skyGLCompositeProg, 'uSize'),
      uSkyBottomPx:   gl.getUniformLocation(skyGLCompositeProg, 'uSkyBottomPx'),
      uBloomStrength: gl.getUniformLocation(skyGLCompositeProg, 'uBloomStrength')
    };
    return true;
  }


  function bindFullscreenQuad(gl) {
    gl.bindBuffer(gl.ARRAY_BUFFER, skyGLQuadBuf);
    gl.enableVertexAttribArray(skyGLAttribPos);
    gl.vertexAttribPointer(skyGLAttribPos, 2, gl.FLOAT, false, 0, 0);
  }


  function renderSkyGL(cw, ch, skyBottomPx) {
    var gl = initSkyGL();
    if (!gl) return null;
    // v11.78 — render the atmosphere at reduced internal resolution. It is
    // smooth gradients + soft sun/moon glow, so a half-res raymarch scaled
    // back up reads as identical for ~4x fewer shader fragments. The moon
    // disc and the stars are canvas-drawn separately and are unaffected.
    var skyS = SKY_GL_RES_SCALE;
    var rw = Math.max(2, Math.round(cw * skyS));
    var rh = Math.max(2, Math.round(ch * skyS));
    if (skyGLCanvas.width !== rw || skyGLCanvas.height !== rh) {
      skyGLCanvas.width = rw;
      skyGLCanvas.height = rh;
    }

    // v11.82 — skip the atmospheric raymarch when its inputs are unchanged.
    // The shader output is a pure function of time-of-day, camera altitude,
    // zoom, render size and moon phase; while the player walks the surface it
    // is identical frame to frame, so the cached skyGLCanvas is reused and the
    // full-screen scattering shader is not re-dispatched.
    // The sunset grade is now a live gm group (SKY_SUNSET_GRADE); fold a cheap
    // signature of it into the cache key so dialling the sky in the L panel
    // re-renders the cached shader immediately instead of waiting for the next
    // time-of-day bucket. Constant in normal play, so it adds no extra renders.
    var _sg = SKY_SUNSET_GRADE;
    var skyKey = Math.round(timeOfDay * 2400) + '|' + Math.round(cam.y) +
                 '|' + Math.round(skyBottomPx) + '|' + worldScale.toFixed(3) +
                 '|' + rw + 'x' + rh + '|' + Math.round(moonPhase * 1000) +
                 '|' + (_sg.drama + _sg.twi * 3 + _sg.twiShape + _sg.sat + _sg.contrast +
                        _sg.gain + _sg.radial + _sg.ozone + _sg.multi + _sg.floor).toFixed(2);
    if (skyKey === skyGLLastKey) return skyGLCanvas;
    skyGLLastKey = skyKey;

    // True perspective camera + 3D sun vector.
    var fovY = SUN.fovY_deg * Math.PI / 180;
    var basePitch = SUN.pitch_deg * Math.PI / 180;
    var aspect = cw / Math.max(1, ch);

    // Sun/sky pitch is altitude-independent — it holds the dialled-in
    // surface pitch at every depth, so the sun keeps a fixed screen
    // position exactly like the moon (celestialPos). An earlier "dynamic
    // pitch" tied this to camera altitude to glue the sky horizon to the
    // mountains, but it dragged the sun upward when descending (the
    // surface line clamps off-screen underground) and drifted it while
    // flying up. The dynamic formula resolved to basePitch at the surface
    // anyway, so this is that same surface look, frozen for all altitudes.
    var pitch = basePitch;

    var arc = computeSunElevation(timeOfDay);
    var altitudeMax = SUN.altitude_deg * Math.PI / 180;
    var azimuthMax  = SUN.azimuth_deg  * Math.PI / 180;
    var altitude = Math.sin(arc) * altitudeMax;
    var azimuth  = Math.cos(arc) * azimuthMax;
    var sunDirX = Math.cos(altitude) * Math.sin(azimuth);
    var sunDirY = Math.sin(altitude);
    var sunDirZ = Math.cos(altitude) * Math.cos(azimuth);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rw, rh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(skyGLProgram);
    gl.uniform2f(skyGLU.uResolution, rw, rh);
    gl.uniform1f(skyGLU.uSkyBottomPx, skyBottomPx * skyS);
    gl.uniform1f(skyGLU.uFovY, fovY);
    gl.uniform1f(skyGLU.uPitch, pitch);
    gl.uniform1f(skyGLU.uAspect, aspect);
    gl.uniform3f(skyGLU.uSunDir, sunDirX, sunDirY, sunDirZ);
    gl.uniform1f(skyGLU.uSunIntensity, SUN.intensity);
    gl.uniform1f(skyGLU.uSunDiscSize, SUN.discSize);
    gl.uniform1f(skyGLU.uMieG, SUN.mieG);

    // Project sunDir to NDC using the same camera math the shader uses
    // for view rays (inverse pitch + perspective). The shader compares
    // pixel position against this NDC for the disc shape, which keeps
    // the sun a true circle in screen space regardless of fovY width.
    var cP = Math.cos(pitch);
    var sP = Math.sin(pitch);
    var sunVx = sunDirX;
    var sunVy = cP * sunDirY - sP * sunDirZ;
    var sunVz = sP * sunDirY + cP * sunDirZ;
    var tanHalfFov = Math.tan(fovY * 0.5);
    var sunOnScreen = sunVz > 0.0001 ? 1.0 : 0.0;
    var sunNDCx = sunOnScreen ? (sunVx / (sunVz * tanHalfFov * aspect)) : 999;
    var sunNDCy = sunOnScreen ? (sunVy / (sunVz * tanHalfFov)) : 999;
    gl.uniform2f(skyGLU.uSunNDC, sunNDCx, sunNDCy);
    gl.uniform1f(skyGLU.uSunOnScreen, sunOnScreen);

    // Moon glow — anchored to the SAME screen position as the canvas-drawn
    // moon disc (celestialPos), converted into the shader's NDC space, so
    // the halo wraps the disc exactly. uMoonDiscPx lets the shader size the
    // halo in disc-radii, keeping it a tight corona at any resolution.
    var moonCel = celestialPos('moon', cw, skyBottomPx);
    gl.uniform2f(skyGLU.uMoonNDC,
      (moonCel.x / cw) * 2 - 1,
      1 - (moonCel.y / ch) * 2);
    gl.uniform1f(skyGLU.uMoonVis, moonCel.vis);
    gl.uniform1f(skyGLU.uMoonGlow, (1 - Math.cos(moonPhase * Math.PI * 2)) * 0.5);
    gl.uniform1f(skyGLU.uMoonDiscPx, MOON_TUNE.size * skyS);
    gl.uniform1f(skyGLU.uMoonGlowStr, MOON_TUNE.glowStrength);
    gl.uniform1f(skyGLU.uMoonGlowSize, MOON_TUNE.glowSize);
    gl.uniform3f(skyGLU.uMoonGlowColor, MOON_TUNE.glowR, MOON_TUNE.glowG, MOON_TUNE.glowB);

    // Sunset colour-grade uniforms (Volcanic vibe) — see SKY_SUNSET_GRADE.
    var sg = SKY_SUNSET_GRADE;
    gl.uniform1f(skyGLU.uDrama, sg.drama);
    gl.uniform1f(skyGLU.uSat, sg.sat);
    gl.uniform1f(skyGLU.uOzone, sg.ozone);
    gl.uniform1f(skyGLU.uMulti, sg.multi);
    gl.uniform1f(skyGLU.uGain, sg.gain);
    gl.uniform1f(skyGLU.uFloor, sg.floor);
    gl.uniform1f(skyGLU.uContrast, sg.contrast);
    gl.uniform1f(skyGLU.uRadial, sg.radial);
    gl.uniform1f(skyGLU.uTwi, sg.twi);
    gl.uniform1f(skyGLU.uTwiShape, sg.twiShape);
    gl.uniform3f(skyGLU.uG0, sg.stops[0][0], sg.stops[0][1], sg.stops[0][2]);
    gl.uniform3f(skyGLU.uG1, sg.stops[1][0], sg.stops[1][1], sg.stops[1][2]);
    gl.uniform3f(skyGLU.uG2, sg.stops[2][0], sg.stops[2][1], sg.stops[2][2]);
    gl.uniform3f(skyGLU.uG3, sg.stops[3][0], sg.stops[3][1], sg.stops[3][2]);
    gl.uniform3f(skyGLU.uG4, sg.stops[4][0], sg.stops[4][1], sg.stops[4][2]);

    bindFullscreenQuad(gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return skyGLCanvas;
  }

  // Per-frame atmosphere cache. The WebGL pass renders the sky but
  // doesn't expose the raw scatter colour for downstream consumers
  // (mountain aerial tint, sun bloom). We keep a single horizon-view
  // JS-side scatter eval here — same math, same constants — so the
  // tinting stays in lockstep with the rendered sky.
  function updateAtmosCacheGL() {
    var arc = computeSunElevation(timeOfDay);
    var dayW = scatDayWeight(arc);
    var biomeT = computeSkyBiomeT();
    var nh = nightSkyHexRGB(SKY.skyHorizon);
    var nz = nightSkyHexRGB(SKY.skyDeepest);
    var sh = nightSkyHexRGB(SKY.spaceHorizon);
    var sz = nightSkyHexRGB(SKY.spaceDeepest);
    if (dayW > 0.001) {
      var hdr = scatComputeColor(SCAT_VIEW_ELEV[4], arc);
      var rH = Math.round(scatLinearToSrgb(scatAces(hdr[0])) * 255);
      var gH = Math.round(scatLinearToSrgb(scatAces(hdr[1])) * 255);
      var bH = Math.round(scatLinearToSrgb(scatAces(hdr[2])) * 255);
      var hdrZ = scatComputeColor(SCAT_VIEW_ELEV[0], arc);
      var rZ = Math.round(scatLinearToSrgb(scatAces(hdrZ[0])) * 255);
      var gZ = Math.round(scatLinearToSrgb(scatAces(hdrZ[1])) * 255);
      var bZ = Math.round(scatLinearToSrgb(scatAces(hdrZ[2])) * 255);
      atmosHorizonRGB = {
        r: Math.round(nh.r + (rH - nh.r) * dayW + (sh.r - (nh.r + (rH - nh.r) * dayW)) * biomeT),
        g: Math.round(nh.g + (gH - nh.g) * dayW + (sh.g - (nh.g + (gH - nh.g) * dayW)) * biomeT),
        b: Math.round(nh.b + (bH - nh.b) * dayW + (sh.b - (nh.b + (bH - nh.b) * dayW)) * biomeT)
      };
      atmosZenithRGB = {
        r: Math.round(nz.r + (rZ - nz.r) * dayW + (sz.r - (nz.r + (rZ - nz.r) * dayW)) * biomeT),
        g: Math.round(nz.g + (gZ - nz.g) * dayW + (sz.g - (nz.g + (gZ - nz.g) * dayW)) * biomeT),
        b: Math.round(nz.b + (bZ - nz.b) * dayW + (sz.b - (nz.b + (bZ - nz.b) * dayW)) * biomeT)
      };
    } else {
      atmosHorizonRGB = {
        r: Math.round(nh.r + (sh.r - nh.r) * biomeT),
        g: Math.round(nh.g + (sh.g - nh.g) * biomeT),
        b: Math.round(nh.b + (sh.b - nh.b) * biomeT)
      };
      atmosZenithRGB = {
        r: Math.round(nz.r + (sz.r - nz.r) * biomeT),
        g: Math.round(nz.g + (sz.g - nz.g) * biomeT),
        b: Math.round(nz.b + (sz.b - nz.b) * biomeT)
      };
    }
    atmosDayWeight = dayW;
  }

  // mulberry32 — seeded RNG (used by texture build + twinkle layout for
  // reproducibility across reloads at the same viewport size).
  function nightSkyRand(seed) {
    var s = seed >>> 0;
    return function() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
    };
  }

  // Hex string to {r,g,b} object (cached per call site). Used to feed
  // rgba() into twinkle alpha animations without parsing every frame.
  function nightSkyHexRGB(hex) {
    var h = hex.charAt(0) === '#' ? hex.substring(1) : hex;
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  // ===== Stage 4a — sky biome altitude T =====
  // Player altitude (in world units above the surface) maps to a single
  // float biomeT ∈ [0, 1] that drives the sky-stop blend:
  //   0   = at or below surface — full surface night sky
  //   1   = above SPACE_FLOOR_ALT — full deep-space palette
  // Smooth lerp in between is the "upper atmosphere" band. The thresholds
  // are tuned so a player jetpacking around the surface stays at T≈0 and
  // only a long, deliberate ascent transitions into space.
  var SKY_BIOME_SURFACE_CEIL_ALT = 1000;   // start the transition above this altitude
  var SKY_BIOME_SPACE_FLOOR_ALT  = 3800;   // fully into space at/above this altitude
  function computeSkyBiomeT() {
    var surfaceY = SKY_ROWS * TILE;
    // cam.y centred on the player; use it directly. Higher altitude = lower y.
    var altitude = surfaceY - (cam.y + screenH * 0.5);
    if (altitude <= SKY_BIOME_SURFACE_CEIL_ALT) return 0;
    if (altitude >= SKY_BIOME_SPACE_FLOOR_ALT) return 1;
    return (altitude - SKY_BIOME_SURFACE_CEIL_ALT) /
           (SKY_BIOME_SPACE_FLOOR_ALT - SKY_BIOME_SURFACE_CEIL_ALT);
  }

  // Compute the world-pixel-equivalent unit in canvas device pixels. The
  // foreground renders at ws = dpr * worldScale device pixels per world
  // pixel; STARS use this so they match the foreground tile granularity.
  // Floor 2 so even at the smallest zoom stars never go finer than the
  // foreground.
  function nightSkyPixUnit() {
    var ws = (dpr || 1) * (worldScale || 1);
    return Math.max(2, Math.round(ws));
  }

  // Pre-bake a 256×256 dither threshold lookup table. The inner gradient
  // loop touches millions of pixels per rebuild — replacing the hash
  // computation with a single byte read here is the load-bearing
  // performance win. Built once at first use, 64 KB resident.
  function ensureNightSkyDitherLUT() {
    if (nightSkyDitherLUT) return;
    var sz = 256;
    var lut = new Uint8Array(sz * sz);
    for (var y = 0; y < sz; y++) {
      for (var x = 0; x < sz; x++) {
        var n = ((x + 1013) * 73856093) ^ ((y + 7919) * 19349663);
        n = (n ^ (n >>> 13)) >>> 0;
        n = Math.imul(n, 0x85ebca6b) >>> 0;
        n = (n ^ (n >>> 16)) >>> 0;
        lut[y * sz + x] = n & 0xFF;
      }
    }
    nightSkyDitherLUT = lut;
  }


  // ===== Stage 5b — atmospheric scattering =====
  // Ported from Maxime Heckel's "On Rendering the Sky, Sunsets, and
  // Planets" (Rayleigh + Mie + Ozone) and wwwtyro/glsl-atmosphere. The
  // GLSL volume integral collapses to a 1D vertical problem here: the
  // sky gradient varies only with view elevation, so we evaluate exactly
  // 5 view angles (zenith → horizon) and feed those RGBs into the
  // existing dithered ImageData path. ~5×24×6 ≈ 720 raymarch iterations
  // per rebuild, well under a millisecond even on a cold cache.
  //
  // Constants in km (planetary scale). All optical-depth and beta units
  // are 1/km so the products match dimensionally.
  var SCAT_R_PLANET    = 6360;
  var SCAT_R_ATMOS     = 6420;
  var SCAT_H_RAYLEIGH  = 8.0;
  var SCAT_H_MIE       = 1.2;
  var SCAT_BETA_R      = [0.0058, 0.0135, 0.0331];  // Rayleigh scatter per channel
  var SCAT_BETA_M      = 0.003;                      // Mie scatter (grey)
  var SCAT_BETA_O      = [0.00065, 0.00188, 0.00008]; // Ozone absorption per channel
  var SCAT_MIE_G       = 0.76;
  var SCAT_SUN_I       = 22.0;
  var SCAT_PRIMARY     = 24;
  var SCAT_LIGHTMARCH  = 6;

  // Ray-sphere intersection. Origin (ox,oy), dir (dx,dy), sphere radius r
  // centred at origin (we always shift the planet centre to 0,0). Returns
  // [t0, t1] or null if no hit.
  function scatRaySphere(ox, oy, dx, dy, r) {
    var b = ox * dx + oy * dy;
    var c = ox * ox + oy * oy - r * r;
    var d = b * b - c;
    if (d < 0) return null;
    var s = Math.sqrt(d);
    return [-b - s, -b + s];
  }

  // Ozone has a peaked profile around 25 km — model it as a tent so
  // sunset reds get the violet shift Maxime calls out.
  function scatDensityOzone(h) {
    var t = 1 - Math.abs(h - 25) / 15;
    return t > 0 ? t : 0;
  }

  // Returns optical depths [odR, odM, odO] along the sun ray from `point`,
  // or null if the ray plunges into the planet (point is in shadow).
  function scatLightMarch(px, py, sx, sy) {
    var hit = scatRaySphere(px, py, sx, sy, SCAT_R_ATMOS);
    if (!hit) return null;
    var tFar = hit[1];
    if (tFar <= 0) return null;
    var step = tFar / SCAT_LIGHTMARCH;
    var odR = 0, odM = 0, odO = 0;
    for (var i = 0; i < SCAT_LIGHTMARCH; i++) {
      var t = step * (i + 0.5);
      var qx = px + sx * t;
      var qy = py + sy * t;
      var h = Math.sqrt(qx * qx + qy * qy) - SCAT_R_PLANET;
      if (h < 0) return null;
      odR += Math.exp(-h / SCAT_H_RAYLEIGH) * step;
      odM += Math.exp(-h / SCAT_H_MIE) * step;
      odO += scatDensityOzone(h) * step;
    }
    return [odR, odM, odO];
  }

  // Primary raymarch from a viewer just above sea level along viewDir
  // toward the sun. Returns linear-HDR RGB (pre-tonemap).
  function scatComputeColor(viewElev, sunElev) {
    // CRITICAL: view azimuth must follow the sun. In a 2D vertical-plane
    // sky reduction, the player visually sees the sun cross the screen
    // plane; the sky gradient under the sun should always brighten
    // toward the sun and warm at the horizon when sun is low. v10.49–
    // v10.54 had view fixed to +x (east), so afternoon read as "looking
    // away from sun" → sky dimmed after 9am. azSign = sign of sun's
    // x-component flips the view to the sun's hemisphere.
    var sx = Math.cos(sunElev),  sy = Math.sin(sunElev);
    var azSign = sx >= 0 ? 1 : -1;
    var vx = Math.cos(viewElev) * azSign, vy = Math.sin(viewElev);
    // Viewer 0.5 km above sea level (puts horizon stop slightly into the
    // dense low atmosphere where Mie dominates).
    var ox = 0, oy = SCAT_R_PLANET + 0.5;
    var hit = scatRaySphere(ox, oy, vx, vy, SCAT_R_ATMOS);
    if (!hit) return [0, 0, 0];
    var tFar = hit[1];
    var ground = scatRaySphere(ox, oy, vx, vy, SCAT_R_PLANET);
    if (ground && ground[0] > 0) tFar = Math.min(tFar, ground[0]);
    if (tFar <= 0) return [0, 0, 0];

    var step = tFar / SCAT_PRIMARY;
    var mu = vx * sx + vy * sy;
    var phaseR = 0.0596831 * (1 + mu * mu);          // 3/(16π)
    var g = SCAT_MIE_G, g2 = g * g;
    var phaseM = 0.1193662 * ((1 - g2) * (1 + mu * mu)) /
                 ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5));  // 3/(8π) HG

    var sumR_r = 0, sumR_g = 0, sumR_b = 0;
    var sumM_r = 0, sumM_g = 0, sumM_b = 0;
    var odR = 0, odM = 0, odO = 0;
    for (var i = 0; i < SCAT_PRIMARY; i++) {
      var t = step * (i + 0.5);
      var px = ox + vx * t;
      var py = oy + vy * t;
      var h = Math.sqrt(px * px + py * py) - SCAT_R_PLANET;
      if (h < 0) break;
      var dR = Math.exp(-h / SCAT_H_RAYLEIGH) * step;
      var dM = Math.exp(-h / SCAT_H_MIE)      * step;
      var dO = scatDensityOzone(h) * step;
      odR += dR; odM += dM; odO += dO;
      var light = scatLightMarch(px, py, sx, sy);
      if (!light) continue;
      var totR = odR + light[0];
      var totM = odM + light[1];
      var totO = odO + light[2];
      // Mie extinction includes ~1.1× scatter for absorption.
      var tauR = SCAT_BETA_R[0] * totR + SCAT_BETA_M * 1.1 * totM + SCAT_BETA_O[0] * totO;
      var tauG = SCAT_BETA_R[1] * totR + SCAT_BETA_M * 1.1 * totM + SCAT_BETA_O[1] * totO;
      var tauB = SCAT_BETA_R[2] * totR + SCAT_BETA_M * 1.1 * totM + SCAT_BETA_O[2] * totO;
      var aR = Math.exp(-tauR), aG = Math.exp(-tauG), aB = Math.exp(-tauB);
      sumR_r += dR * aR; sumR_g += dR * aG; sumR_b += dR * aB;
      sumM_r += dM * aR; sumM_g += dM * aG; sumM_b += dM * aB;
    }
    var I = SCAT_SUN_I;
    return [
      I * (SCAT_BETA_R[0] * phaseR * sumR_r + SCAT_BETA_M * phaseM * sumM_r),
      I * (SCAT_BETA_R[1] * phaseR * sumR_g + SCAT_BETA_M * phaseM * sumM_g),
      I * (SCAT_BETA_R[2] * phaseR * sumR_b + SCAT_BETA_M * phaseM * sumM_b)
    ];
  }

  // ACES filmic tonemap (Narkowicz approximation). HDR → [0,1].
  function scatAces(x) {
    var y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    return y < 0 ? 0 : (y > 1 ? 1 : y);
  }
  function scatLinearToSrgb(c) {
    if (c <= 0) return 0;
    if (c >= 1) return 1;
    return c < 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  // 5 view-elevation angles (radians above horizon), zenith → horizon.
  // Stop 0 = top of canvas = zenith; stop 4 = bottom = horizon.
  var SCAT_VIEW_ELEV = [
    Math.PI / 2,        // 90° — zenith
    Math.PI / 3,        // 60°
    Math.PI / 6,        // 30°
    Math.PI / 18,       // 10°
    0.01                // ~horizon (epsilon to avoid grazing degeneracy)
  ];

  // Top-level: 5 scattering stops as {r,g,b} bytes for the given sun
  // elevation. Pure function — no caching here, the caller (gradient
  // build) is bucketed.
  function scatComputeStops(sunElev) {
    var out = [];
    for (var i = 0; i < 5; i++) {
      var hdr = scatComputeColor(SCAT_VIEW_ELEV[i], sunElev);
      var r = scatLinearToSrgb(scatAces(hdr[0]));
      var g = scatLinearToSrgb(scatAces(hdr[1]));
      var b = scatLinearToSrgb(scatAces(hdr[2]));
      out.push({
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
      });
    }
    return out;
  }

  // computeSunElevation returns the celestial arc angle (0..2π), NOT the
  // signed altitude above the horizon. cos(arc) is the east-west
  // component; sin(arc) is the up-down component. The scattering math
  // uses (cos, sin) as a direction vector so it sees the right thing.
  // BUT the weighting functions below need *altitude* in [-90°..+90°]
  // — they need to read the same number at "rising 30°" and "setting
  // 30°". sin(arc) gives that directly (∈[-1,1]); converting back to a
  // signed altitude is asin(sin(arc)).
  //
  // The v10.49–v10.54 bug: these functions read the arc angle in
  // degrees. From sunset (arc=180°) through midnight (arc=270°) that
  // gives day-weight ≈ 1 and star-weight ≈ 0 for the entire first half
  // of the night — which is why the stars only popped in at the t→0
  // wrap and the night sky was rendered with daytime scattering.

  // Day-weight: smoothstep across the civil-twilight altitude band
  // (-6° → +6°). Uses sin(arc) so it's correct on both halves of the
  // cycle.
  function scatDayWeight(sunElev) {
    var sinE = Math.sin(sunElev);
    // sin(±6°) = ±0.1045
    var t = (sinE + 0.1045) / 0.209;
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  // Star-weight: begin fade-in at sunset (altitude=0°) and reach full
  // strength by altitude=-25°. Long ramp so the galaxy appears
  // continuously through dusk rather than popping at midnight.
  function scatStarWeight(sunElev) {
    var sinE = Math.sin(sunElev);
    // sin(-25°) = -0.4226
    var t = -sinE / 0.4226;
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  // Gradient texture — biome-DEPENDENT, rebuilds on altitude bucket change.
  // Uses ImageData direct pixel writes (single Uint8ClampedArray) plus the
  // pre-baked dither LUT, so the inner loop is just an array lookup plus
  // four byte writes. That's ~50x faster than the v10.26 fillRect-per-cell
  // path, which was the cause of the jetpack-up FPS collapse.
  //
  // Both the offscreen canvas and the ImageData buffer are cached and
  // reused across rebuilds — no per-rebuild allocation, no GC pressure
  // even at one rebuild per second.
  function buildNightSkyGradient(w, h, biomeT, sunElev) {
    if (typeof biomeT !== 'number') biomeT = 0;
    if (typeof sunElev !== 'number') sunElev = -Math.PI / 2;  // safe night default
    ensureNightSkyDitherLUT();

    if (!nightSkyGradientTex || nightSkyGradientTex.width !== w || nightSkyGradientTex.height !== h) {
      nightSkyGradientTex = document.createElement('canvas');
      nightSkyGradientTex.width = w;
      nightSkyGradientTex.height = h;
      nightSkyGradientBuf = null;
    }
    var g = nightSkyGradientTex.getContext('2d');
    if (!nightSkyGradientBuf || nightSkyGradientBuf.width !== w || nightSkyGradientBuf.height !== h) {
      nightSkyGradientBuf = g.createImageData(w, h);
    }
    var data = nightSkyGradientBuf.data;

    // Pre-compute the 5 lerped stop RGBs once. Surface stops lerp toward
    // the deep-space palette by biomeT. When the sun is above civil
    // twilight, the scattering pass owns the surface stops; the night
    // palette fades back in below -6° elevation. The space palette wins
    // at high altitude regardless of time.
    var stopY = [0.00, 0.32, 0.58, 0.82, 1.00];
    var nightStops = [
      nightSkyHexRGB(SKY.skyDeepest),
      nightSkyHexRGB(SKY.skyDark),
      nightSkyHexRGB(SKY.skyBase),
      nightSkyHexRGB(SKY.skyLow),
      nightSkyHexRGB(SKY.skyHorizon)
    ];
    var spaceStops = [
      nightSkyHexRGB(SKY.spaceDeepest),
      nightSkyHexRGB(SKY.spaceDark),
      nightSkyHexRGB(SKY.spaceBase),
      nightSkyHexRGB(SKY.spaceLow),
      nightSkyHexRGB(SKY.spaceHorizon)
    ];
    var dayWeight = scatDayWeight(sunElev);
    var scatStops = dayWeight > 0 ? scatComputeStops(sunElev) : null;
    var stopRGB = [];
    for (var k = 0; k < 5; k++) {
      var nightR = nightStops[k].r, nightG = nightStops[k].g, nightB = nightStops[k].b;
      var surfR = nightR, surfG = nightG, surfB = nightB;
      if (scatStops) {
        surfR = nightR + (scatStops[k].r - nightR) * dayWeight;
        surfG = nightG + (scatStops[k].g - nightG) * dayWeight;
        surfB = nightB + (scatStops[k].b - nightB) * dayWeight;
      }
      var spaceR = spaceStops[k].r, spaceG = spaceStops[k].g, spaceB = spaceStops[k].b;
      stopRGB.push({
        r: Math.round(surfR + (spaceR - surfR) * biomeT),
        g: Math.round(surfG + (spaceG - surfG) * biomeT),
        b: Math.round(surfB + (spaceB - surfB) * biomeT)
      });
    }
    // Cache horizon (bottom) and zenith (top) for downstream consumers.
    atmosHorizonRGB = stopRGB[4];
    atmosZenithRGB  = stopRGB[0];
    atmosDayWeight  = dayWeight;

    var lut = nightSkyDitherLUT;
    var idx = 0;
    for (var y = 0; y < h; y++) {
      var yFrac = (h > 1) ? y / (h - 1) : 0;
      // Locate bracket of stops this row falls between
      var iA = 0, iB = 1;
      for (var s = 0; s < 4; s++) {
        if (yFrac >= stopY[s] && yFrac <= stopY[s + 1]) {
          iA = s; iB = s + 1;
          break;
        }
      }
      var span = stopY[iB] - stopY[iA];
      var tFrac = span > 0 ? (yFrac - stopY[iA]) / span : 0;
      var aR = stopRGB[iA].r, aG = stopRGB[iA].g, aB = stopRGB[iA].b;
      var bR = stopRGB[iB].r, bG = stopRGB[iB].g, bB = stopRGB[iB].b;
      // Smooth lerp + sub-byte dither. v10.52 used a binary stop-pick
      // (>threshold → B else A) which mottles visibly when adjacent
      // stops are far apart in value — most noticeable in the bright
      // daytime gradient. Lerp gives continuous tone, dither only
      // perturbs ±1.5 byte values to break flat banding.
      var rR = bR - aR, rG = bG - aG, rB = bB - aB;
      var rowBase = (y & 255) * 256;
      for (var x = 0; x < w; x++) {
        var thresh = lut[rowBase + (x & 255)];
        // d in [-1.5, +1.5]
        var d = (thresh / 255 - 0.5) * 3;
        var oR = aR + rR * tFrac + d;
        var oG = aG + rG * tFrac + d;
        var oB = aB + rB * tFrac + d;
        data[idx++] = oR < 0 ? 0 : (oR > 255 ? 255 : oR);
        data[idx++] = oG < 0 ? 0 : (oG > 255 ? 255 : oG);
        data[idx++] = oB < 0 ? 0 : (oB > 255 ? 255 : oB);
        data[idx++] = 255;
      }
    }
    g.putImageData(nightSkyGradientBuf, 0, 0);
    return nightSkyGradientTex;
  }

  // Stars + nebula texture — biome-INDEPENDENT. Rebuilds only when the
  // viewport resizes or the world-pixel unit changes (zoom toggle). Drawn
  // ON TOP of the gradient with a transparent background, so the gradient
  // shows through everywhere the stars don't paint.
  //
  // Splitting this out of the gradient build is the OTHER load-bearing
  // perf win: the ~5k fillRects of the three star tiers now happen only
  // on resize/zoom, not on every altitude bucket transition during a
  // jetpack ascent.
  function buildNightSkyStars(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    var pix = nightSkyPixUnit();
    var cols = Math.ceil(w / pix);
    var rows = Math.ceil(h / pix);

    // ---- Faint painted nebula band ----
    var bandRand = nightSkyRand(0xC0DE0817);
    var bandCx = w * 0.55;
    var bandCy = h * 0.34;
    var bandLen = w * 1.05;
    var bandHalfThk = h * 0.18;
    var bandAngle = -0.22;
    var sinA = Math.sin(bandAngle);
    var cosA = Math.cos(bandAngle);
    var bandSamples = Math.floor((bandLen * bandHalfThk * 2) / (pix * pix * 9));
    for (var i = 0; i < bandSamples; i++) {
      var u = bandRand();
      var perp = bandRand() + bandRand() - 1;
      var lx = (u - 0.5) * bandLen;
      var ly = perp * bandHalfThk;
      var px = bandCx + cosA * lx - sinA * ly;
      var py = bandCy + sinA * lx + cosA * ly;
      var cx = Math.floor(px / pix) * pix;
      var cy = Math.floor(py / pix) * pix;
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      var falloff = 1 - Math.min(1, Math.abs(perp));
      if (bandRand() > falloff * 0.6) continue;
      var coreness = 1 - Math.abs(u - 0.5) * 1.7;
      var col = (coreness > 0.25 && bandRand() < 0.55) ? SKY.nebulaWarm : SKY.nebulaCool;
      g.fillStyle = col;
      g.fillRect(cx, cy, pix, pix);
    }

    // ---- Three-tier baked star field ----
    var starRand = nightSkyRand(0x57A88E11);

    // Tier 1 — dim background fill
    var t1Count = Math.floor((cols * rows) / 28);
    for (var s1 = 0; s1 < t1Count; s1++) {
      var sx1 = (Math.floor(starRand() * cols)) * pix;
      var sy1 = (Math.floor(starRand() * rows)) * pix;
      if (starRand() > 0.30) continue;
      g.fillStyle = SKY.starDim;
      g.fillRect(sx1, sy1, pix, pix);
    }
    // Tier 2 — medium, sparser, rare blue/warm
    var t2Count = Math.floor((cols * rows) / 220);
    for (var s2 = 0; s2 < t2Count; s2++) {
      var sx2 = (Math.floor(starRand() * cols)) * pix;
      var sy2 = (Math.floor(starRand() * rows)) * pix;
      var t2Roll = starRand();
      var col2;
      if (t2Roll < 0.62)      col2 = SKY.starMid;
      else if (t2Roll < 0.84) col2 = SKY.starBlue;
      else                    col2 = SKY.starWarm;
      g.fillStyle = col2;
      g.fillRect(sx2, sy2, pix, pix);
    }
    // Tier 3 — bright, rare, larger cores
    var t3Count = Math.max(8, Math.floor((cols * rows) / 1800));
    for (var s3 = 0; s3 < t3Count; s3++) {
      var sx3 = (Math.floor(starRand() * cols)) * pix;
      var sy3 = (Math.floor(starRand() * rows)) * pix;
      var t3Roll = starRand();
      var col3;
      if (t3Roll < 0.55)      col3 = SKY.starBright;
      else if (t3Roll < 0.80) col3 = SKY.starBlue;
      else                    col3 = SKY.starWarm;
      g.fillStyle = col3;
      g.fillRect(sx3, sy3, pix * 2, pix * 2);
    }

    return c;
  }

  function ensureNightSkyTwinklers(w, h) {
    var pix = nightSkyPixUnit();
    if (nightSkyTwinklers && nightSkyTwinklers._w === w && nightSkyTwinklers._h === h && nightSkyTwinklers._pix === pix) return;
    var rand = nightSkyRand(0x9E3779B1);
    var arr = [];
    var n = 50;
    var cols = Math.max(1, Math.floor(w / pix));
    var rows = Math.max(1, Math.floor(h / pix));
    for (var i = 0; i < n; i++) {
      var roll = rand();
      // SKY.starHot is reserved for these twinkle cores only — nowhere
      // else in the entire game uses it, per BACKGROUND_STYLE §4.
      var hex;
      if (roll < 0.30)      hex = SKY.starHot;
      else if (roll < 0.58) hex = SKY.starBright;
      else if (roll < 0.80) hex = SKY.starBlue;
      else                  hex = SKY.starWarm;
      var twRGB = nightSkyHexRGB(hex);
      arr.push({
        x: (Math.floor(rand() * cols)) * pix,
        y: (Math.floor(rand() * rows)) * pix,
        baseA: 0.40 + rand() * 0.45,
        rate: 0.4 + rand() * 1.4,         // 0.4–1.8 Hz, well within the §7 budget
        phase: rand() * Math.PI * 2,
        rgb: twRGB,
        // v23.34 — channels are per-star constants; bake the rgba prefix once
        // so the per-frame twinkle loop only appends the alpha tail.
        rgbaPrefix: 'rgba(' + twRGB.r + ',' + twRGB.g + ',' + twRGB.b + ',',
        size: pix * (rand() < 0.30 ? 2 : 1)
      });
    }
    arr._w = w;
    arr._h = h;
    arr._pix = pix;
    nightSkyTwinklers = arr;
  }

  // Stage 5c — return celestial body screen coords + intensity for the
  // current sun elevation. `which` is 'sun' or 'moon'. Caller filters out
  // bodies fully below the horizon.
  function celestialPos(which, cw, skyBottomPx) {
    // v10.64 — anchor sun and moon on the *canvas* (not skyBottomPx).
    // Pre-v10.64 this used skyBottomPx as the horizon, so when the
    // player jetpacked up and skyBottomPx grew, the sun's apparent
    // elevation in the shader's FOV grew too — turning the disc into
    // a "sphere across the screen". With a fixed horizon line at
    // CAMERA_SURFACE_FRAC × canvas.height, sun position is constant
    // in canvas pixels regardless of altitude.
    var ch = canvas.height;
    var horizonY = CAMERA_SURFACE_FRAC * ch;
    var e = computeSunElevation(timeOfDay);
    var cx = Math.cos(e), sy = Math.sin(e);
    var isMoon = (which === 'moon');
    if (isMoon) { cx = -cx; sy = -sy; }
    // The moon's arc is independently tunable (MOON_TUNE) so it can be
    // dropped lower at midnight without disturbing the sun.
    var hr = cw * 0.45 * (isMoon ? MOON_TUNE.arcWidth  : 1);
    var vr = ch * 0.45 * (isMoon ? MOON_TUNE.arcHeight : 1);
    var x = cw * 0.5 + cx * hr;
    var y = horizonY - sy * vr + (isMoon ? MOON_TUNE.yOffset : 0);
    // Above-horizon factor — soft fade in the last ~5° to avoid pops.
    var above = sy * 12;
    if (above < 0) above = 0;
    if (above > 1) above = 1;
    return { x: x, y: y, vis: above, elevSin: sy };
  }

  // Cached celestial-disc textures. Sun is keyed by hue index (3 hues:
  // high / mid / horizon). Moon is built once. Both built lazily.
  // Atmospheric scatter colours cached from the most recent sky rebuild.
  // Consumed by mountain aerial-perspective tinting and the sun-bloom
  // intensity. Updated inside buildNightSkyGradient. Default to a deep
  // night value so first-frame mountain renders don't pop white.
  var atmosHorizonRGB = { r: 30, g: 34, b: 50 };
  var atmosZenithRGB  = { r: 14, g: 16, b: 26 };
  var atmosDayWeight  = 0;
  var sunDiscTex = [null, null, null];
  var sunDiscRadius = 22;
  var moonDiscTex = null;
  var moonPhaseDisc = null;        // projected NASA-textured moon, rebuilt on change
  var moonPhaseDiscPhase = -1;
  // ── Moon parameters ───────────────────────────────────────────────
  // Dialled in by hand via the v11.70 slider panel (since removed);
  // these are the final tuned values.
  var MOON_TUNE = {
    size:         29,   // disc radius, device px
    arcHeight:    0.80, // x ch*0.45 — peak elevation (lower = lower moon)
    arcWidth:     1.00, // x cw*0.45 — east/west spread of the arc
    yOffset:      4,    // extra px pushed down the screen
    discBright:   2.17, // lit-side brightness multiplier
    earthshine:   0.45, // dark-side floor brightness
    limbDark:     0.41, // edge darkening toward the limb
    blur:         0.04, // smudge — blur px as a fraction of build radius
    ss:           2,    // supersample factor (build N x, draw down)
    coolTint:     20,   // blue added to the disc
    glowStrength: 0.30, // corona intensity (kept well below the disc)
    glowSize:     1.00, // corona falloff size, in disc-radii
    glowR:        0.70, // corona colour
    glowG:        0.78,
    glowB:        0.95
  };
  // NASA-derived equirectangular lunar surface map (assets/images/moon.jpg).
  // Loaded at boot and rasterised so buildMoonPhaseDisc can project + light
  // it; the procedural disc is the fallback until it's ready.
  var moonImageReady = false;
  var moonTexData = null, moonTexW = 0, moonTexH = 0;
  (function () {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var tc = document.createElement('canvas');
          tc.width = img.width; tc.height = img.height;
          var tg = tc.getContext('2d');
          tg.drawImage(img, 0, 0);
          moonTexData = tg.getImageData(0, 0, img.width, img.height).data;
          moonTexW = img.width; moonTexH = img.height;
          moonImageReady = true;
        } catch (e) { moonImageReady = false; }
      };
      img.onerror = function () { moonImageReady = false; };
      img.src = 'assets/images/moon.jpg';
    } catch (e) { /* procedural fallback */ }
  })();

  function buildSunDisc(r, hueIdx) {
    var size = r * 2 + 1;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var g = c.getContext('2d');
    var img = g.createImageData(size, size);
    var data = img.data;
    // Three colour stops per hue index, sampled by t = d/r (limb darkening).
    // Stop layout: core (0.0–0.5), mid (0.5–0.85), limb (0.85–1.0).
    var hues = [
      // High noon — bright white-yellow core, warm yellow limb
      [[255,252,228],[255,238,170],[255,208,128]],
      // Mid morning/afternoon — warmer yellow → orange limb
      [[255,238,180],[255,204,118],[235,160,86]],
      // Horizon — orange core → deep red limb (matches scatter horizon)
      [[255,196,118],[238,144,78],[196,90,52]]
    ];
    var h = hues[hueIdx];
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var dx = px - r, dy = py - r;
        var d2 = dx * dx + dy * dy;
        var di = (py * size + px) * 4;
        if (d2 > r * r) { data[di + 3] = 0; continue; }
        var t = Math.sqrt(d2) / r;
        var R, G, B;
        if (t < 0.5) {
          var u = t / 0.5;
          R = h[0][0] + (h[1][0] - h[0][0]) * u;
          G = h[0][1] + (h[1][1] - h[0][1]) * u;
          B = h[0][2] + (h[1][2] - h[0][2]) * u;
        } else if (t < 0.85) {
          var u2 = (t - 0.5) / 0.35;
          R = h[1][0] + (h[2][0] - h[1][0]) * u2;
          G = h[1][1] + (h[2][1] - h[1][1]) * u2;
          B = h[1][2] + (h[2][2] - h[1][2]) * u2;
        } else {
          // Hard limb on the outer ring so the disc edge stays crisp.
          R = h[2][0]; G = h[2][1]; B = h[2][2];
        }
        data[di]     = R | 0;
        data[di + 1] = G | 0;
        data[di + 2] = B | 0;
        data[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function buildMoonDisc(r) {
    var size = r * 2 + 1;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var g = c.getContext('2d');
    var img = g.createImageData(size, size);
    var data = img.data;
    // Mare patches: [nx, ny, radius_norm, depth]. Roughly recreates the
    // visible-face pattern (Imbrium top-left, Serenitatis upper-mid,
    // Tranquillitatis mid-right, Crisium right, Nubium lower-mid).
    var mare = [
      [-0.22, -0.32, 0.22, 0.28],
      [ 0.18, -0.18, 0.18, 0.24],
      [ 0.38,  0.05, 0.16, 0.26],
      [ 0.48,  0.28, 0.10, 0.30],
      [-0.10,  0.32, 0.18, 0.22],
      [-0.40,  0.08, 0.12, 0.20]
    ];
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var dx = px - r, dy = py - r;
        var d2 = dx * dx + dy * dy;
        var di = (py * size + px) * 4;
        if (d2 > r * r) { data[di + 3] = 0; continue; }
        var d = Math.sqrt(d2);
        var t = d / r;
        // Pearl base — slight cool tint, gentle darkening toward limb.
        var base = 232 - t * 36;
        var R = base, G = base + 4, B = base + 14;
        // Mare attenuation.
        var nx = dx / r, ny = dy / r;
        for (var m = 0; m < mare.length; m++) {
          var mx = mare[m][0], my = mare[m][1], mrad = mare[m][2], depth = mare[m][3];
          var mdx = nx - mx, mdy = ny - my;
          var md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < mrad) {
            var fall = 1 - md / mrad;
            var mul = 1 - depth * fall;
            R *= mul; G *= mul; B *= mul;
          }
        }
        // Hard limb darkening on the very edge so the silhouette reads.
        if (t > 0.93) { R *= 0.72; G *= 0.74; B *= 0.78; }
        data[di]     = R | 0;
        data[di + 1] = G | 0;
        data[di + 2] = B | 0;
        data[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Projects the equirectangular NASA moon map onto a sphere disc and
  // lights it from the current phase's direction. The terminator (and so
  // the phase — crescent / quarter / gibbous / full) emerges from the
  // lighting itself; the dark side keeps a faint earthshine. Rendered at
  // native disc resolution and drawn unsmoothed, so it stays pixelated.
  function buildMoonPhaseDisc(r, phase) {
    // v11.69 — render the lit, NASA-textured sphere SHARP into a scratch
    // canvas (bilinear-sampled, soft anti-aliased limb), then blit it
    // through a gentle blur so it reads as a soft luminous body rather
    // than a noisy pixel decal. Caller builds at MOON_TUNE.ss x, draws down.
    var size = r * 2 + 1;
    var sharp = document.createElement('canvas');
    sharp.width = size; sharp.height = size;
    var sg = sharp.getContext('2d');
    var img = sg.createImageData(size, size);
    var data = img.data;
    // Phase -> light direction. elong 0 = sun behind moon (new),
    // PI = sun toward viewer (full); sin/cos give a 3-D light vector.
    var elong = phase * Math.PI * 2;
    var lx = Math.sin(elong);
    var lz = -Math.cos(elong);
    var TWO_PI = Math.PI * 2;
    var tw = moonTexW, th = moonTexH;
    var es = MOON_TUNE.earthshine, ld = MOON_TUNE.limbDark;
    var db = MOON_TUNE.discBright,  ct = MOON_TUNE.coolTint;
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var di = (py * size + px) * 4;
        var nx = (px - r) / r, ny = (py - r) / r;
        var d2 = nx * nx + ny * ny;
        if (d2 > 1) { data[di + 3] = 0; continue; }
        var nz = Math.sqrt(1 - d2);              // sphere normal toward viewer
        // Sample the equirect map for the visible near hemisphere.
        var lon = Math.atan2(nx, nz);            // -PI/2 .. PI/2
        var lat = Math.asin(-ny);                // screen-down -> south
        var u = 0.5 + lon / TWO_PI;              // 0.25 .. 0.75 (near side)
        var v = 0.5 - lat / Math.PI;             // 0 .. 1
        // Bilinear sample of the equirect map — no nearest-neighbour chunk.
        var fx = u * tw - 0.5, fy = v * th - 0.5;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var gx = fx - x0, gy = fy - y0;
        var x1 = x0 + 1, y1 = y0 + 1;
        if (x0 < 0) x0 = 0; else if (x0 > tw - 1) x0 = tw - 1;
        if (x1 < 0) x1 = 0; else if (x1 > tw - 1) x1 = tw - 1;
        if (y0 < 0) y0 = 0; else if (y0 > th - 1) y0 = th - 1;
        if (y1 < 0) y1 = 0; else if (y1 > th - 1) y1 = th - 1;
        var i00 = (y0 * tw + x0) * 4, i10 = (y0 * tw + x1) * 4;
        var i01 = (y1 * tw + x0) * 4, i11 = (y1 * tw + x1) * 4;
        var w00 = (1 - gx) * (1 - gy), w10 = gx * (1 - gy);
        var w01 = (1 - gx) * gy,       w11 = gx * gy;
        var sR = moonTexData[i00]     * w00 + moonTexData[i10]     * w10 + moonTexData[i01]     * w01 + moonTexData[i11]     * w11;
        var sG = moonTexData[i00 + 1] * w00 + moonTexData[i10 + 1] * w10 + moonTexData[i01 + 1] * w01 + moonTexData[i11 + 1] * w11;
        var sB = moonTexData[i00 + 2] * w00 + moonTexData[i10 + 2] * w10 + moonTexData[i01 + 2] * w01 + moonTexData[i11 + 2] * w11;
        // Lambert lighting + earthshine on the dark side + limb darkening
        // so the disc reads as a sphere — all tunable via MOON_TUNE.
        var lambert = nx * lx + nz * lz;
        var lit = lambert > 0 ? lambert : 0;
        var shade = es + (1 - es) * lit;
        var limb  = (1 - ld) + ld * nz;
        var bright = shade * limb * db;
        var R = sR * bright, G = sG * bright, B = sB * bright + ct;
        // Soft anti-aliased limb so the disc melts into the shader glow.
        var dist = Math.sqrt(d2);
        var et = (dist - 0.90) / 0.10;
        if (et < 0) et = 0; else if (et > 1) et = 1;
        var aEdge = 1 - et * et * (3 - 2 * et);
        data[di]     = R > 255 ? 255 : R | 0;
        data[di + 1] = G > 255 ? 255 : G | 0;
        data[di + 2] = B > 255 ? 255 : B | 0;
        data[di + 3] = (aEdge * 255) | 0;
      }
    }
    sg.putImageData(img, 0, 0);
    // Smudge: a light blur knocks down the equirect sampling noise so the
    // moon reads as a soft body. Where ctx.filter is unsupported the disc
    // just stays crisp (still fine — supersampled + drawn down smoothed).
    var out = document.createElement('canvas');
    out.width = size; out.height = size;
    var og = out.getContext('2d');
    var blurPx = r * MOON_TUNE.blur;
    if (blurPx > 0.2 && 'filter' in og) og.filter = 'blur(' + blurPx + 'px)';
    og.drawImage(sharp, 0, 0);
    return out;
  }

  // Anti-twilight band: paints two thin horizontal stripes across the
  // anti-sun half of the sky just above the horizon. The upper stripe
  // is the Belt of Venus (pink-mauve glow lit by the still-illuminated
  // upper atmosphere); the lower stripe is the earth's shadow wedge
  // (a touch cooler/darker). Both peak in alpha at twilight (sun
  // altitude ≈ 0°) and fall off to zero by full day or deep night.
  function drawAntiTwilightBand(cw, skyBottomPx) {
    if (skyBottomPx <= 8) return;
    var arc = computeSunElevation(timeOfDay);
    var sinE = Math.sin(arc);
    // Twilight strength: triangular peak at sinE=0, zero by |sinE|=0.20
    // (~ ±11°). Squared to soften the falloff.
    var raw = 1 - Math.abs(sinE) / 0.20;
    if (raw <= 0) return;
    var strength = raw * raw;
    var sunOnRight = Math.cos(arc) > 0;
    // Anti-sun half of canvas: opposite to sun's azimuth.
    var antiX0 = sunOnRight ? 0 : cw * 0.5;
    var antiW  = cw * 0.5;
    // Belt of Venus stripe — pink. Sits ~10–18% above the horizon.
    var beltTop    = Math.round(skyBottomPx * 0.78);
    var beltBottom = Math.round(skyBottomPx * 0.88);
    var shadowTop    = beltBottom;
    var shadowBottom = skyBottomPx;
    ctx.save();
    // Belt — soft warm pink, additive feel via multiple thin slices
    // each with a hash-jittered alpha so the band doesn't read as a
    // smooth airbrush stripe (per pixel-art bible §7).
    var beltA = 0.25 * strength;
    for (var y = beltTop; y < beltBottom; y++) {
      var fade = (y - beltTop) / Math.max(1, beltBottom - beltTop);
      // Triangular profile: brightest at the middle of the band.
      var profile = 1 - Math.abs(fade - 0.4) * 1.8;
      if (profile < 0) profile = 0;
      ctx.fillStyle = 'rgba(232,168,176,' + (beltA * profile).toFixed(3) + ')';
      ctx.fillRect(antiX0, y, antiW, 1);
    }
    // Earth's shadow — cool blue-grey wedge below the belt.
    var shA = 0.18 * strength;
    for (var y2 = shadowTop; y2 < shadowBottom; y2++) {
      var f2 = (y2 - shadowTop) / Math.max(1, shadowBottom - shadowTop);
      var prof2 = 1 - f2 * 0.7;
      ctx.fillStyle = 'rgba(48,52,78,' + (shA * prof2).toFixed(3) + ')';
      ctx.fillRect(antiX0, y2, antiW, 1);
    }
    ctx.restore();
  }

  function drawNightSkyCelestials(cw, ch, skyBottomPx) {
    var sun = celestialPos('sun', cw, skyBottomPx);
    // When the WebGL sky pipeline ran, the sun is already in the
    // composited canvas as an HDR emission point with proper bloom.
    // The JS textured disc is the fallback path only.
    if (sun.vis > 0 && !skyGLLastDrew) {
      var hueIdx;
      if (sun.elevSin > 0.35)       hueIdx = 0;
      else if (sun.elevSin > 0.10)  hueIdx = 1;
      else                          hueIdx = 2;
      if (!sunDiscTex[hueIdx]) sunDiscTex[hueIdx] = buildSunDisc(sundiscR(), hueIdx);
      var sr = sundiscR();
      // Halo removed in v10.57 — the WebGL scattering pass now produces
      // the real Mie corona around the disc, no fake fillRect rings
      // needed. Just paint the disc.
      ctx.save();
      ctx.globalAlpha = sun.vis;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sunDiscTex[hueIdx], Math.round(sun.x) - sr, Math.round(sun.y) - sr);
      ctx.restore();
    }
    var moon = celestialPos('moon', cw, skyBottomPx);
    if (moon.vis > 0) {
      var mr = MOON_TUNE.size;
      // v11.70 — NASA moon map projected onto a lit sphere; the phase
      // (set per in-game day) gives a real terminator. Built at MOON_TUNE.ss x
      // resolution, drawn back DOWN smoothed; rebuilt when the phase changes.
      var moonBuildR = Math.round(MOON_TUNE.size * MOON_TUNE.ss);
      if (moonImageReady && moonTexData &&
          (!moonPhaseDisc || moonPhaseDiscPhase !== moonPhase)) {
        moonPhaseDisc = buildMoonPhaseDisc(moonBuildR, moonPhase);
        moonPhaseDiscPhase = moonPhase;
      }
      ctx.save();
      ctx.globalAlpha = moon.vis;
      ctx.imageSmoothingEnabled = true;
      if (moonPhaseDisc) {
        ctx.drawImage(moonPhaseDisc,
          Math.round(moon.x) - mr, Math.round(moon.y) - mr, mr * 2, mr * 2);
      } else {
        if (!moonDiscTex) moonDiscTex = buildMoonDisc(MOON_TUNE.size);
        ctx.drawImage(moonDiscTex,
          Math.round(moon.x) - mr, Math.round(moon.y) - mr);
      }
      ctx.restore();
    }
  }
  function sundiscR() { return sunDiscRadius; }

  // Draws the night sky in NATIVE PIXEL SPACE. Caller must have already
  // reset the transform to identity. skyBottomPx is the y-coord (in canvas
  // device pixels) where the sky meets the ground; the texture is clipped
  // to [0..skyBottomPx] so it never paints over underground.
  function drawNightSkyToScreen(skyBottomPx) {
    var cw = canvas.width;
    var ch = canvas.height;
    if (cw <= 0 || ch <= 0) return;
    var pixUnit = nightSkyPixUnit();

    // Stars + nebula — rebuild only on viewport size or pixUnit (zoom)
    // change. Altitude does NOT trigger this rebuild.
    if (!nightSkyStarsTex || nightSkyStarsTex._w !== cw ||
        nightSkyStarsTex._h !== ch || nightSkyStarsTex._pix !== pixUnit) {
      nightSkyStarsTex = buildNightSkyStars(cw, ch);
      nightSkyStarsTex._w = cw;
      nightSkyStarsTex._h = ch;
      nightSkyStarsTex._pix = pixUnit;
    }

    // Update the JS-side atmosphere cache (single horizon + zenith
    // scatter eval) every frame. This is what downstream mountain
    // aerial-perspective tint, the Belt of Venus alpha, and the sun
    // bloom read — it must stay in lockstep with whatever the rendered
    // sky is doing whether WebGL or fallback owns the paint.
    updateAtmosCacheGL();

    var sunElev = computeSunElevation(timeOfDay);
    var biomeT = computeSkyBiomeT();

    ensureNightSkyTwinklers(cw, ch);

    var clipNeeded = (skyBottomPx < ch);
    if (clipNeeded) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cw, Math.max(0, skyBottomPx));
      ctx.clip();
    }

    // Pixel discipline per BACKGROUND_STYLE §6 — no smoothing on the
    // background pass. WebGL fragment shader runs the full atmospheric
    // raymarch per pixel; result blitted via drawImage. If WebGL is
    // unavailable (very old browser) we fall back to the 5-stop
    // ImageData path on a coarse bucket so we still get something.
    ctx.imageSmoothingEnabled = false;
    var _gpuSkyT = devMode ? performance.now() : 0;
    var glCanvas = renderSkyGL(cw, ch, skyBottomPx);
    // v12.5 — sky GPU probe. renderSkyGL early-returns on a cache hit, so this
    // reads ~0 when parked and jumps to the real raymarch cost while flying.
    if (devMode) gpuProbe('sky', _gpuSkyT, skyGL);
    if (glCanvas) {
      // v11.78 — the GL sky renders at reduced internal resolution
      // (SKY_GL_RES_SCALE); upscale it with smoothing so the half-res
      // raymarch composites as a clean, seamless gradient.
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glCanvas, 0, 0, cw, ch);
      ctx.imageSmoothingEnabled = false;
      skyGLLastDrew = true;
    } else {
      skyGLLastDrew = false;
      // Fallback: bucketed 5-stop ImageData gradient (v10.55 path).
      var biomeBucket = Math.round(biomeT * 16);
      var sunBucket = Math.round((sunElev / Math.PI) * 32);
      if (!nightSkyGradientTex || nightSkyGradientTex._w !== cw ||
          nightSkyGradientTex._h !== ch ||
          nightSkyGradientTex._bucket !== biomeBucket ||
          nightSkyGradientTex._sun !== sunBucket) {
        buildNightSkyGradient(cw, ch, biomeBucket / 16, (sunBucket / 32) * Math.PI);
        nightSkyGradientTex._w = cw;
        nightSkyGradientTex._h = ch;
        nightSkyGradientTex._bucket = biomeBucket;
        nightSkyGradientTex._sun = sunBucket;
      }
      ctx.drawImage(nightSkyGradientTex, 0, 0);
    }
    // Inform the celestial pass whether the sun disc was already painted
    // by the shader (with its own bloom corona). When yes, skip the JS
    // textured disc — it would overlay a flat sprite on top of the
    // proper Mie corona we just rendered.

    // v10.65 — Belt of Venus overlay removed. It was painting on top
    // of the shader's atmospheric output and muddling Maxime's exact
    // anti-twilight gradient. The shader's per-pixel scattering already
    // produces the correct anti-sun colours.

    // Stage 5d — fade stars + nebula through twilight. nightWeight = 1
    // at full night, 0 once the sun is well above civil twilight, with
    // a smooth handoff. The static stars texture is reused; we just
    // gate its alpha here so we don't have to rebuild on every elevation
    // change.
    var starWeight = scatStarWeight(sunElev);
    if (starWeight > 0.001) {
      ctx.save();
      // v25.34 — NIGHT_SKY.intensity is the master dimmer over the whole baked
      // star + nebula layer, on top of the twilight starWeight fade.
      ctx.globalAlpha = starWeight * NIGHT_SKY.intensity;
      ctx.drawImage(nightSkyStarsTex, 0, 0);
      ctx.restore();
    }

    // Stage 5c — sun and moon discs. Both transit the same arc; only
    // the sun's offset to the player horizon decides which one's up.
    // Sun position is parameterised by (cos, sin) of elevation: cos
    // gives the east/west offset from screen centre, sin gives the
    // height above the canvas horizon. Moon is the antipode.
    drawNightSkyCelestials(cw, ch, skyBottomPx);

    // Twinkle overlay — sinusoidal alpha pulse on the brightest stars.
    // The bible permits alpha for twinkles specifically (§7) since they're
    // pixel-art "stars breathing," not smooth fog.
    var t = performance.now() / 1000;
    var arr = nightSkyTwinklers;
    // Twinklers ride the same starWeight as the static star texture.
    if (starWeight > 0.001) {
      // v25.34 — NIGHT_SKY.twinkle sets the pulse DEPTH (steady base = 1-depth);
      // NIGHT_SKY.intensity dims the twinklers with the rest of the star field.
      var twDepth = NIGHT_SKY.twinkle;
      var twBase = 1 - twDepth;
      for (var i = 0; i < arr.length; i++) {
        var st = arr[i];
        if (st.y >= skyBottomPx) continue;
        var pulse = twBase + twDepth * Math.sin(t * st.rate + st.phase);
        var a = st.baseA * pulse * starWeight * NIGHT_SKY.intensity;
        ctx.fillStyle = st.rgbaPrefix + a.toFixed(3) + ')';
        ctx.fillRect(st.x, st.y, st.size, st.size);
      }
    }

    // Weather clouds — drawn last in the sky clip so they sit over the stars
    // and sun/moon (cloud occlusion), behind the parallax mountains (drawn
    // after this returns, in world transform). Catches the scatter cache tint.
    if (!PERF_DISABLE_WEATHER) drawWeatherClouds(cw, ch, skyBottomPx);
    ctx.imageSmoothingEnabled = true;

    if (clipNeeded) ctx.restore();
  }

