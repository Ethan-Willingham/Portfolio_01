  /* ---- SmokeFluid — WebGL fluid sim (adapted from Pavel Dobryakov, MIT 2017) ---- */
  /* Inlined from smokeFluid.js. Original: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation */
  var SmokeFluid = (function () {
    'use strict';
  
    // --- module state (singleton) -----------------------------------
    var canvas = null;
    var gl = null;
    var ext = null;
    var ready = false;
  
    var config = {
      SIM_RESOLUTION: 256,
      DYE_RESOLUTION: 1024,
      DENSITY_DISSIPATION: 1.6,
      VELOCITY_DISSIPATION: 0.4,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: 25,
      CURL: 26,
      SPLAT_RADIUS: 0.22,
      SHADING: true,
    };
  
    var dye, velocity, divergence, curl, pressure;
    var copyProgram, clearProgram, splatProgram, advectionProgram,
        divergenceProgram, curlProgram, vorticityProgram, pressureProgram,
        gradientSubtractProgram, scrollProgram;
    var displayMaterial;
    var blit;
    var blitQuadVBO = null;  // v10.88 — exposed so other helpers can restore the buffer state
    var obstacleTexture = null;
    var obstacleSrcCanvas = null;
  
    // --- WebGL context / format negotiation -------------------------
    function getWebGLContext (cnv) {
      var params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false };
      var glCtx = cnv.getContext('webgl2', params);
      var isWebGL2 = !!glCtx;
      if (!isWebGL2) glCtx = cnv.getContext('webgl', params) || cnv.getContext('experimental-webgl', params);
      if (!glCtx) return null;
  
      var halfFloat;
      var supportLinearFiltering;
      if (isWebGL2) {
        glCtx.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = glCtx.getExtension('OES_texture_float_linear');
      } else {
        halfFloat = glCtx.getExtension('OES_texture_half_float');
        supportLinearFiltering = glCtx.getExtension('OES_texture_half_float_linear');
      }
      glCtx.clearColor(0.0, 0.0, 0.0, 0.0);
  
      var halfFloatTexType = isWebGL2 ? glCtx.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
      var formatRGBA, formatRG, formatR;
      if (isWebGL2) {
        formatRGBA = getSupportedFormat(glCtx, glCtx.RGBA16F, glCtx.RGBA, halfFloatTexType);
        formatRG   = getSupportedFormat(glCtx, glCtx.RG16F,   glCtx.RG,   halfFloatTexType);
        formatR    = getSupportedFormat(glCtx, glCtx.R16F,    glCtx.RED,  halfFloatTexType);
      } else {
        formatRGBA = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType);
        formatRG   = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType);
        formatR    = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType);
      }
      return { gl: glCtx, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering, isWebGL2 } };
    }
  
    function getSupportedFormat (glCtx, internalFormat, format, type) {
      if (!supportRenderTextureFormat(glCtx, internalFormat, format, type)) {
        switch (internalFormat) {
          case glCtx.R16F:  return getSupportedFormat(glCtx, glCtx.RG16F,   glCtx.RG,   type);
          case glCtx.RG16F: return getSupportedFormat(glCtx, glCtx.RGBA16F, glCtx.RGBA, type);
          default: return null;
        }
      }
      return { internalFormat, format };
    }
  
    function supportRenderTextureFormat (glCtx, internalFormat, format, type) {
      var texture = glCtx.createTexture();
      glCtx.bindTexture(glCtx.TEXTURE_2D, texture);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.NEAREST);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.NEAREST);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
      glCtx.texImage2D(glCtx.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      var fbo = glCtx.createFramebuffer();
      glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, fbo);
      glCtx.framebufferTexture2D(glCtx.FRAMEBUFFER, glCtx.COLOR_ATTACHMENT0, glCtx.TEXTURE_2D, texture, 0);
      return glCtx.checkFramebufferStatus(glCtx.FRAMEBUFFER) === glCtx.FRAMEBUFFER_COMPLETE;
    }
  
    // --- Shader / Program helpers -----------------------------------
    function compileShader (type, source, keywords) {
      source = addKeywords(source, keywords);
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.error('shader compile failed:', gl.getShaderInfoLog(shader));
      return shader;
    }
  
    function addKeywords (source, keywords) {
      if (!keywords) return source;
      var s = '';
      keywords.forEach(function (k) { s += '#define ' + k + '\n'; });
      return s + source;
    }
  
    function createProgram (vertexShader, fragmentShader) {
      var program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.error('program link failed:', gl.getProgramInfoLog(program));
      return program;
    }
  
    function getUniforms (program) {
      var uniforms = [];
      var n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) {
        var name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return uniforms;
    }
  
    function Program (vs, fs) {
      this.program = createProgram(vs, fs);
      this.uniforms = getUniforms(this.program);
    }
    Program.prototype.bind = function () { gl.useProgram(this.program); };
  
    function Material (vs, fsSource) {
      this.vertexShader = vs;
      this.fragmentShaderSource = fsSource;
      this.programs = {};
      this.activeProgram = null;
      this.uniforms = [];
    }
    Material.prototype.setKeywords = function (keywords) {
      var key = keywords.join(',');
      var p = this.programs[key];
      if (!p) {
        var fs = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
        p = createProgram(this.vertexShader, fs);
        this.programs[key] = p;
      }
      if (p === this.activeProgram) return;
      this.uniforms = getUniforms(p);
      this.activeProgram = p;
    };
    Material.prototype.bind = function () { gl.useProgram(this.activeProgram); };
  
    // --- Shader sources (verbatim from Pavel) -----------------------
    var BASE_VS = '\n' +
      'precision highp float;\n' +
      'attribute vec2 aPosition;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform vec2 texelSize;\n' +
      'void main () {\n' +
      '  vUv = aPosition * 0.5 + 0.5;\n' +
      '  vL = vUv - vec2(texelSize.x, 0.0);\n' +
      '  vR = vUv + vec2(texelSize.x, 0.0);\n' +
      '  vT = vUv + vec2(0.0, texelSize.y);\n' +
      '  vB = vUv - vec2(0.0, texelSize.y);\n' +
      '  gl_Position = vec4(aPosition, 0.0, 1.0);\n' +
      '}\n';
  
    var COPY_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'void main () { gl_FragColor = texture2D(uTexture, vUv); }\n';
  
    var CLEAR_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform float value;\n' +
      'void main () { gl_FragColor = value * texture2D(uTexture, vUv); }\n';
  
    var SPLAT_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'uniform sampler2D uTarget;\n' +
      'uniform float aspectRatio;\n' +
      'uniform vec3 color;\n' +
      'uniform vec2 point;\n' +
      'uniform float radius;\n' +
      'void main () {\n' +
      '  vec2 p = vUv - point.xy;\n' +
      '  p.x *= aspectRatio;\n' +
      '  vec3 splat = exp(-dot(p, p) / radius) * color;\n' +
      '  vec3 base = texture2D(uTarget, vUv).xyz;\n' +
      '  gl_FragColor = vec4(base + splat, 1.0);\n' +
      '}\n';
  
    var ADVECTION_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uSource;\n' +
      'uniform sampler2D uObstacle;\n' +
      'uniform vec2 texelSize;\n' +
      'uniform vec2 dyeTexelSize;\n' +
      'uniform float dt;\n' +
      'uniform float dissipation;\n' +
      'uniform float useObstacle;\n' +
      'uniform float u_wind_x;\n' +
      'uniform float u_wind_above_y;\n' +
      'vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {\n' +
      '  vec2 st = uv / tsize - 0.5;\n' +
      '  vec2 iuv = floor(st);\n' +
      '  vec2 fuv = fract(st);\n' +
      '  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);\n' +
      '  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);\n' +
      '  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);\n' +
      '  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);\n' +
      '  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);\n' +
      '}\n' +
      'void main () {\n' +
      '  if (useObstacle > 0.5 && texture2D(uObstacle, vUv).a > 0.5) {\n' +
      '    gl_FragColor = vec4(0.0);\n' +
      '    return;\n' +
      '  }\n' +
      '  float windDrift = (vUv.y >= u_wind_above_y) ? dt * u_wind_x : 0.0;\n' +
      '#ifdef MANUAL_FILTERING\n' +
      '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize - vec2(windDrift, 0.0);\n' +
      '  vec4 result = bilerp(uSource, coord, dyeTexelSize);\n' +
      '#else\n' +
      '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize - vec2(windDrift, 0.0);\n' +
      '  vec4 result = texture2D(uSource, coord);\n' +
      '#endif\n' +
      '  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {\n' +
      '    gl_FragColor = vec4(0.0);\n' +
      '    return;\n' +
      '  }\n' +
      '  float decay = 1.0 + dissipation * dt;\n' +
      '  gl_FragColor = result / decay;\n' +
      '}\n';
  
    var DIVERGENCE_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '  float L = texture2D(uVelocity, vL).x;\n' +
      '  float R = texture2D(uVelocity, vR).x;\n' +
      '  float T = texture2D(uVelocity, vT).y;\n' +
      '  float B = texture2D(uVelocity, vB).y;\n' +
      '  vec2 C = texture2D(uVelocity, vUv).xy;\n' +
      '  if (vL.x < 0.0) { L = -C.x; }\n' +
      '  if (vR.x > 1.0) { R = -C.x; }\n' +
      '  if (vT.y > 1.0) { T = -C.y; }\n' +
      '  if (vB.y < 0.0) { B = -C.y; }\n' +
      '  float div = 0.5 * (R - L + T - B);\n' +
      '  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);\n' +
      '}\n';
  
    var CURL_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '  float L = texture2D(uVelocity, vL).y;\n' +
      '  float R = texture2D(uVelocity, vR).y;\n' +
      '  float T = texture2D(uVelocity, vT).x;\n' +
      '  float B = texture2D(uVelocity, vB).x;\n' +
      '  float vorticity = R - L - T + B;\n' +
      '  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);\n' +
      '}\n';
  
    var VORTICITY_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uCurl;\n' +
      'uniform float curl;\n' +
      'uniform float dt;\n' +
      'void main () {\n' +
      '  float L = texture2D(uCurl, vL).x;\n' +
      '  float R = texture2D(uCurl, vR).x;\n' +
      '  float T = texture2D(uCurl, vT).x;\n' +
      '  float B = texture2D(uCurl, vB).x;\n' +
      '  float C = texture2D(uCurl, vUv).x;\n' +
      '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));\n' +
      '  force /= length(force) + 0.0001;\n' +
      '  force *= curl * C;\n' +
      '  force.y *= -1.0;\n' +
      '  vec2 velocity = texture2D(uVelocity, vUv).xy;\n' +
      '  velocity += force * dt;\n' +
      '  velocity = min(max(velocity, -1000.0), 1000.0);\n' +
      '  gl_FragColor = vec4(velocity, 0.0, 1.0);\n' +
      '}\n';
  
    var PRESSURE_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uPressure;\n' +
      'uniform sampler2D uDivergence;\n' +
      'void main () {\n' +
      '  float L = texture2D(uPressure, vL).x;\n' +
      '  float R = texture2D(uPressure, vR).x;\n' +
      '  float T = texture2D(uPressure, vT).x;\n' +
      '  float B = texture2D(uPressure, vB).x;\n' +
      '  float C = texture2D(uPressure, vUv).x;\n' +
      '  float divergence = texture2D(uDivergence, vUv).x;\n' +
      '  float pressure = (L + R + B + T - divergence) * 0.25;\n' +
      '  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);\n' +
      '}\n';
  
    var GRADIENT_SUBTRACT_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uPressure;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uObstacle;\n' +
      'uniform float useObstacle;\n' +
      'void main () {\n' +
      '  if (useObstacle > 0.5 && texture2D(uObstacle, vUv).a > 0.5) {\n' +
      '    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);\n' +
      '    return;\n' +
      '  }\n' +
      '  float L = texture2D(uPressure, vL).x;\n' +
      '  float R = texture2D(uPressure, vR).x;\n' +
      '  float T = texture2D(uPressure, vT).x;\n' +
      '  float B = texture2D(uPressure, vB).x;\n' +
      '  vec2 velocity = texture2D(uVelocity, vUv).xy;\n' +
      '  velocity.xy -= vec2(R - L, T - B);\n' +
      '  velocity = min(max(velocity, -1000.0), 1000.0);\n' +
      '  gl_FragColor = vec4(velocity, 0.0, 1.0);\n' +
      '}\n';
  
    // Display shader: render dye as RGBA with optional shading, then
    // multiply by an obstacle mask (transparent inside obstacles).
    var SCROLL_FS = '\n' +
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform vec2 offset;\n' +
      'void main () {\n' +
      '  vec2 uv = vUv + offset;\n' +
      '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {\n' +
      '    gl_FragColor = vec4(0.0);\n' +
      '  } else {\n' +
      '    gl_FragColor = texture2D(uTexture, uv);\n' +
      '  }\n' +
      '}\n';
  
    var DISPLAY_FS = '\n' +
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform sampler2D uObstacle;\n' +
      'uniform vec2 texelSize;\n' +
      'uniform float useObstacle;\n' +
      'void main () {\n' +
      '  vec3 c = texture2D(uTexture, vUv).rgb;\n' +
      '#ifdef SHADING\n' +
      '  vec3 lc = texture2D(uTexture, vL).rgb;\n' +
      '  vec3 rc = texture2D(uTexture, vR).rgb;\n' +
      '  vec3 tc = texture2D(uTexture, vT).rgb;\n' +
      '  vec3 bc = texture2D(uTexture, vB).rgb;\n' +
      '  float dx = length(rc) - length(lc);\n' +
      '  float dy = length(tc) - length(bc);\n' +
      '  vec3 n = normalize(vec3(dx, dy, length(texelSize)));\n' +
      '  vec3 l = vec3(0.0, 0.0, 1.0);\n' +
      '  float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);\n' +
      '  c *= diffuse;\n' +
      '#endif\n' +
      '  float a = max(c.r, max(c.g, c.b));\n' +
      '  if (useObstacle > 0.5 && texture2D(uObstacle, vUv).a > 0.5) {\n' +
      '    a = 0.0;\n' +
      '  }\n' +
      '  gl_FragColor = vec4(c, a);\n' +
      '}\n';
  
    // --- FBO helpers ------------------------------------------------
    function createFBO (w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        texture: texture,
        fbo: fbo,
        width: w,
        height: h,
        texelSizeX: 1.0 / w,
        texelSizeY: 1.0 / h,
        attach: function (id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        }
      };
    }
  
    function createDoubleFBO (w, h, internalFormat, format, type, param) {
      var fbo1 = createFBO(w, h, internalFormat, format, type, param);
      var fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () { return fbo1; },
        set read (v) { fbo1 = v; },
        get write () { return fbo2; },
        set write (v) { fbo2 = v; },
        swap: function () { var t = fbo1; fbo1 = fbo2; fbo2 = t; }
      };
    }
  
    function getResolution (resolution) {
      var aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
      var min = Math.round(resolution);
      var max = Math.round(resolution * aspectRatio);
      if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
      return { width: min, height: max };
    }
  
    function initFramebuffers () {
      var simRes = getResolution(config.SIM_RESOLUTION);
      var dyeRes = getResolution(config.DYE_RESOLUTION);
      var texType = ext.halfFloatTexType;
      var rgba = ext.formatRGBA;
      var rg   = ext.formatRG;
      var r    = ext.formatR;
      var filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);
      dye        = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      velocity   = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat,   rg.format,   texType, filtering);
      divergence = createFBO      (simRes.width, simRes.height, r.internalFormat,    r.format,    texType, gl.NEAREST);
      curl       = createFBO      (simRes.width, simRes.height, r.internalFormat,    r.format,    texType, gl.NEAREST);
      pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat,    r.format,    texType, gl.NEAREST);
    }
  
    // --- Obstacle texture (alpha mask uploaded each frame) ----------
    function ensureObstacleTexture () {
      if (obstacleTexture) return;
      obstacleTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // 1x1 transparent default — no obstacles until setObstacleAlpha runs.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    }

    // v10.87 — WebGL-native obstacle painter. Replaces the
    // canvas + texImage2D upload path that was costing 5ms/frame on
    // mobile (cross-context sync barrier). JS builds a Float32Array
    // of triangle verts in NDC and we draw them straight into the
    // obstacle texture via a framebuffer. One drawArrays, zero
    // cross-context blit, ~0ms total.
    var obstacleFB = null;
    var obstacleQuadProgram = null;
    var obstacleQuadVBO = null;
    var obstacleQuadAttrLoc = -1;
    var OBS_QUAD_VS = [
      'precision highp float;',
      'attribute vec2 aQuadPos;',
      'void main(){ gl_Position = vec4(aQuadPos, 0.0, 1.0); }'
    ].join('\n');
    var OBS_QUAD_FS = [
      'precision highp float;',
      'void main(){ gl_FragColor = vec4(1.0); }'  // alpha=1 = solid obstacle
    ].join('\n');

    function ensureObstacleFB (w, h) {
      ensureObstacleTexture();
      if (!obstacleFB || obstacleFB.w !== w || obstacleFB.h !== h) {
        gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        if (!obstacleFB) {
          obstacleFB = { fbo: gl.createFramebuffer(), w: 0, h: 0 };
        }
        obstacleFB.w = w; obstacleFB.h = h;
        gl.bindFramebuffer(gl.FRAMEBUFFER, obstacleFB.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, obstacleTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      if (!obstacleQuadProgram) {
        obstacleQuadProgram = createProgram(
          compileShader(gl.VERTEX_SHADER, OBS_QUAD_VS),
          compileShader(gl.FRAGMENT_SHADER, OBS_QUAD_FS)
        );
        obstacleQuadAttrLoc = gl.getAttribLocation(obstacleQuadProgram, 'aQuadPos');
      }
      if (!obstacleQuadVBO) obstacleQuadVBO = gl.createBuffer();
    }

    function paintObstacleQuads (verts, vertCount, w, h) {
      if (!ready) return;
      ensureObstacleFB(w, h);
      obstacleSrcCanvas = obstacleFB;  // truthy = obstacle enabled
      gl.bindFramebuffer(gl.FRAMEBUFFER, obstacleFB.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (vertCount > 0) {
        gl.disable(gl.BLEND);
        gl.useProgram(obstacleQuadProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, obstacleQuadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(obstacleQuadAttrLoc);
        gl.vertexAttribPointer(obstacleQuadAttrLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, vertCount);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // v10.88 — CRITICAL: restore the fullscreen-quad buffer + attrib
      // 0 pointer that blit() set up once at init and assumed would
      // stay bound. Without this every subsequent step()/displayPass()
      // draws from our obstacle vertex data, killing all smoke.
      if (blitQuadVBO) {
        gl.bindBuffer(gl.ARRAY_BUFFER, blitQuadVBO);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
      }
    }
  
    // Bind the obstacle to a given texture unit. `obstacle.attach`-style
    // shim to match the FBO contract used in shader uniform setters.
    function attachObstacle (id) {
      ensureObstacleTexture();
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
      return id;
    }
  
    // --- public API -------------------------------------------------
    function init (cnv, options) {
      if (ready) return true;
      canvas = cnv;
      if (options) {
        for (var k in options) if (k in config) config[k] = options[k];
      }
      var ctx = getWebGLContext(canvas);
      if (!ctx || !ctx.ext.formatRGBA) {
        console.warn('SmokeFluid: WebGL context unavailable');
        return false;
      }
      gl = ctx.gl;
      ext = ctx.ext;
  
      // Lower DYE_RESOLUTION on devices without linear filtering on
      // float textures — same heuristic Pavel used.
      if (!ext.supportLinearFiltering) {
        config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 512);
      }
  
      var baseVS = compileShader(gl.VERTEX_SHADER, BASE_VS);
      var advectionFS = compileShader(gl.FRAGMENT_SHADER, ADVECTION_FS, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']);
  
      scrollProgram           = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, SCROLL_FS));
      copyProgram             = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, COPY_FS));
      clearProgram            = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, CLEAR_FS));
      splatProgram            = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, SPLAT_FS));
      advectionProgram        = new Program(baseVS, advectionFS);
      divergenceProgram       = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, DIVERGENCE_FS));
      curlProgram             = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, CURL_FS));
      vorticityProgram        = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, VORTICITY_FS));
      pressureProgram         = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, PRESSURE_FS));
      gradientSubtractProgram = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, GRADIENT_SUBTRACT_FS));
      displayMaterial         = new Material(baseVS, DISPLAY_FS);
      var keys = [];
      if (config.SHADING) keys.push('SHADING');
      displayMaterial.setKeywords(keys);
  
      // Fullscreen quad VBO + index buffer.
      blit = (function () {
        // v10.88 — stash the fullscreen-quad VBO so paintObstacleQuads
        // (and any future helpers) can restore it after binding their
        // own buffer. Pre-v10.88 the init-once setup got silently
        // clobbered the moment paintObstacleQuads bound a different
        // ARRAY_BUFFER, killing every subsequent blit on mobile.
        blitQuadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, blitQuadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        return function (target, clear) {
          if (target == null) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          } else {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
          }
          if (clear) {
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        };
      })();
  
      initFramebuffers();
      ready = true;
      return true;
    }
  
    function isReady () { return ready; }
  
    function clear () {
      if (!ready) return;
      // Force-zero all fields by running the clear shader with value 0.
      gl.disable(gl.BLEND);
      clearProgram.bind();
      gl.uniform1f(clearProgram.uniforms.value, 0.0);
      gl.uniform1i(clearProgram.uniforms.uTexture, dye.read.attach(0));
      blit(dye.write); dye.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, dye.read.attach(0));
      blit(dye.write); dye.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, velocity.read.attach(0));
      blit(velocity.write); velocity.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, velocity.read.attach(0));
      blit(velocity.write); velocity.swap();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      blit(pressure.write); pressure.swap();
    }
  
    function step (dt) {
      if (!ready) return;
      if (dt <= 0) return;
      var useObstacle = obstacleSrcCanvas ? 1.0 : 0.0;
      var pressureDecay = config.PRESSURE;
      if (pressureDecay < 0) pressureDecay = 0;
      else if (pressureDecay > 0.99) pressureDecay = 0.99;
  
      gl.disable(gl.BLEND);
  
      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curl);
  
      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();
  
      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);
  
      clearProgram.bind();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      gl.uniform1f(clearProgram.uniforms.value, pressureDecay);
      blit(pressure.write);
      pressure.swap();
  
      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
      for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }
  
      gradientSubtractProgram.bind();
      gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
      gl.uniform1i(gradientSubtractProgram.uniforms.uObstacle, attachObstacle(2));
      gl.uniform1f(gradientSubtractProgram.uniforms.useObstacle, useObstacle);
      blit(velocity.write);
      velocity.swap();
  
      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      var velId = velocity.read.attach(0);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velId);
      gl.uniform1i(advectionProgram.uniforms.uSource, velId);
      gl.uniform1i(advectionProgram.uniforms.uObstacle, attachObstacle(2));
      gl.uniform1f(advectionProgram.uniforms.useObstacle, useObstacle);
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      // No wind on velocity pass — keeps the pressure solve clean.
      gl.uniform1f(advectionProgram.uniforms.u_wind_x, 0.0);
      gl.uniform1f(advectionProgram.uniforms.u_wind_above_y, 0.0);
      blit(velocity.write);
      velocity.swap();

      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
      gl.uniform1i(advectionProgram.uniforms.uObstacle, attachObstacle(2));
      gl.uniform1f(advectionProgram.uniforms.useObstacle, useObstacle);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      // Wind drifts dye above the surface only. u_wind_x is in UV/sec units.
      // u_wind_above_y is the UV Y threshold (uvY = 1 - syN, so above-surface
      // = large uvY values near 1.0). Passed in from the game each step() call.
      gl.uniform1f(advectionProgram.uniforms.u_wind_x, config.wind_x || 0.0);
      gl.uniform1f(advectionProgram.uniforms.u_wind_above_y, config.wind_above_y != null ? config.wind_above_y : 0.0);
      blit(dye.write);
      dye.swap();
    }
  
    // Inject density (color) and velocity at uvX,uvY ∈ [0,1].
    function splat (uvX, uvY, dx, dy, color, splatRadius) {
      if (!ready) return;
      var rad = splatRadius != null ? splatRadius : config.SPLAT_RADIUS;
      var aspect = canvas.width / canvas.height;
      var radius = correctRadius(rad / 100.0, aspect);
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, aspect);
      gl.uniform2f(splatProgram.uniforms.point, uvX, uvY);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
      gl.uniform1f(splatProgram.uniforms.radius, radius);
      blit(velocity.write);
      velocity.swap();
      gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
      blit(dye.write);
      dye.swap();
    }
  
    function correctRadius (r, aspect) {
      if (aspect > 1) r *= aspect;
      return r;
    }
  
    // Upload alpha channel of `srcCanvas` as the obstacle mask. The
    // canvas should be at the same effective resolution as the dye field
    // — use a small offscreen canvas mirroring the visible viewport. The
    // smoke shaders treat alpha > 0.5 as solid.
    function setObstacleAlpha (srcCanvas) {
      if (!ready) return;
      obstacleSrcCanvas = srcCanvas || null;
      if (!srcCanvas) return;
      ensureObstacleTexture();
      gl.bindTexture(gl.TEXTURE_2D, obstacleTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  
    function clearObstacle () {
      obstacleSrcCanvas = null;
    }
  
    // Shift the dye + velocity fields so the simulation stays anchored
    // in world space when the camera pans. Caller passes camera delta in
    // simulation-domain fractional units. The game convention has +y down,
    // while the dye/velocity textures use Y-up UVs (uvY = 1 - syN), so we
    // negate the Y component when feeding the shader.
    function scroll (dxCamFrac, dyCamFrac) {
      if (!ready) return;
      if (!dxCamFrac && !dyCamFrac) return;
      if (Math.abs(dxCamFrac) > 1.5 || Math.abs(dyCamFrac) > 1.5) return; // teleport — let it flash clear
      var ox = dxCamFrac;
      var oy = -dyCamFrac;
      gl.disable(gl.BLEND);
      scrollProgram.bind();
      gl.uniform2f(scrollProgram.uniforms.offset, ox, oy);
      gl.uniform1i(scrollProgram.uniforms.uTexture, dye.read.attach(0));
      blit(dye.write);
      dye.swap();
      gl.uniform1i(scrollProgram.uniforms.uTexture, velocity.read.attach(0));
      blit(velocity.write);
      velocity.swap();
    }
  
    // Display pass — render dye to the WebGL canvas. Split out from
    // render() so the caller can time it separately from the cross-
    // context drawImage blit. v10.81.
    function displayPass () {
      if (!ready) return;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      displayMaterial.bind();
      var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (config.SHADING && displayMaterial.uniforms.texelSize)
        gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / w, 1.0 / h);
      gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
      if (displayMaterial.uniforms.uObstacle != null) {
        gl.uniform1i(displayMaterial.uniforms.uObstacle, attachObstacle(1));
        gl.uniform1f(displayMaterial.uniforms.useObstacle, obstacleSrcCanvas ? 1.0 : 0.0);
      }
      blit(null);
      gl.disable(gl.BLEND);
    }

    function getCanvas () { return canvas; }

    // Composite the GL canvas into a 2D context. Caller passes the
    // destination rect in the 2D ctx's current transform space.
    function render (ctx2d, dx, dy, dw, dh, sx, sy, sw, sh) {
      if (!ready) return;
      displayPass();
      // Now blit the GL canvas into the 2D context.
      if (ctx2d) {
        if (sx != null && sy != null && sw != null && sh != null) {
          ctx2d.drawImage(canvas, sx, sy, sw, sh, dx, dy, dw, dh);
        } else {
          ctx2d.drawImage(canvas, dx, dy, dw, dh);
        }
      }
    }
  
    function resize (w, h) {
      if (!ready) return;
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      initFramebuffers();
    }
  
    // expose
    return {
      init: init,
      step: step,
      splat: splat,
      clear: clear,
      scroll: scroll,
      render: render,
      displayPass: displayPass,    // v10.81 — for split timing
      getCanvas: getCanvas,        // v10.81 — for direct drawImage with own timing
      resize: resize,
      setObstacleAlpha: setObstacleAlpha,
      paintObstacleQuads: paintObstacleQuads,  // v10.87 — WebGL-native obstacle paint
      clearObstacle: clearObstacle,
      isReady: isReady,
      config: config,
    };
  })();

  // ====== Smoke: WebGL fluid sim (Pavel Dobryakov port via SmokeFluid) ======
  // The original Stam-style grid sim above is kept intact as a fallback for
  // browsers without working WebGL. When SmokeFluid.init succeeds we route
  // through this block instead.
  //
  //   - GL canvas is held offscreen; output is blitted onto the game canvas
  //     in screen space (between terrain and rig draws).
  //   - The obstacle mask is a per-frame silhouette of solid tiles drawn
  //     with rounded carved corners — so smoke flows past the *visual*
  //     edges of dug-out tunnels, not the flat tile grid.
  //   - The sim is world-locked. Camera motion scrolls the dye/velocity
  //     fields so old smoke stays attached to the dug tunnel while new
  //     plume still emits from the rig's current exhaust position.

  var smokeFluidCanvas = null;
  var smokeFluidWidth = 0, smokeFluidHeight = 0;
  var smokeFluidObstacleCanvas = null, smokeFluidObstacleCtx = null;
  var smokeFluidObstacleW = 0, smokeFluidObstacleH = 0;
  var smokeFluidActive = false;
  var smokeFluidDisabled = false;        // set true if init fails — skip thereafter
  var smokeFluidShedPhase = 0;           // for vortex-shedding side jet at the mouth
  var smokeFluidPrevCamX = null;         // for world-lock: tracks last camera position
  var smokeFluidPrevCamY = null;
  var smokeFluidPrevScreenW = 0;
  var smokeFluidPrevScreenH = 0;
  // v23.32 — idle-skip state (gated by PERF_SMOKE_IDLE_SKIP). smokeAwakeT is a
  // countdown (s) refreshed to SMOKE_IDLE_HOLD by smokeMarkActive() at every
  // dye-splat site (the diesel emit below + the chimney emit in fragment 170).
  // While it is >0 the sim steps; once it lapses the field has fully dissipated
  // so the per-frame step + world-lock scroll are skipped until the next splat.
  // 5s is generous — it covers full dye dissipation at the default DENSITY_-
  // DISSIPATION so a real plume never freezes mid-air.
  var smokeAwakeT = 0;
  var SMOKE_IDLE_HOLD = 5.0;
  // v23.32 — obstacle dirty-flag state (gated by PERF_SMOKE_OBSTACLE_DIRTY).
  // The collision mask only changes when the camera/screen pans or the terrain/
  // jello/blasts could have. NaN/-1 sentinels force a repaint on the first frame.
  var smokeObstPrevCamX = NaN, smokeObstPrevCamY = NaN;
  var smokeObstPrevScrW = -1, smokeObstPrevScrH = -1;
  // v23.32 — reused dye-color scratch for the diesel emit splats. splat() reads
  // .r/.g/.b synchronously into a GL uniform (never retains the object), so a
  // shared object per splat role is safe and drops 3-4 allocs per emit frame.
  var smokeEmitCol = { r: 0, g: 0, b: 0 };
  var smokeEmitMouthCol = { r: 0, g: 0, b: 0 };
  var smokeEmitBloomCol = { r: 0, g: 0, b: 0 };
  var SMOKE_ZERO_COL = { r: 0, g: 0, b: 0 };   // velocity-only (no-dye) splats
  // Refresh the idle timer; called wherever dye is injected so a parked sim
  // wakes within one frame of the next emission.
  function smokeMarkActive() { smokeAwakeT = SMOKE_IDLE_HOLD; }
  // True when the obstacle mask must be repainted+uploaded. Advances its
  // trackers only when it returns true; the && short-circuit in updateSmoke
  // means it is not even called while asleep, so a pan made during sleep is
  // still detected (trackers stay stale) and repainted on the next wake.
  // v25.46 — smoke collides with WATER: the rendered water body rides in
  // the obstacle mask (Pass 4 in smokeFluidPaintObstacle), so the mask
  // must refresh on a cadence while water exists (water moves without any
  // of the classic dirty triggers firing). Every 8th frame ≈ 8-15 Hz:
  // one drawImage + texture upload, ~0.5 ms, amortized to ~0.06 ms/frame.
  var SMOKE_WATER_OBSTACLE = 1;      // gm smoke.WATER_OBSTACLE (0 = the old ghost-through)
  var smokeObstWaterTick = 0;
  var SMOKE_OBST_WATER_EVERY = 8;
  function smokeObstacleNeedsRepaint() {
    if (!PERF_SMOKE_OBSTACLE_DIRTY) return true;
    if (smokeObstPrevCamX !== cam.x || smokeObstPrevCamY !== cam.y ||
        smokeObstPrevScrW !== screenW || smokeObstPrevScrH !== screenH ||
        drilling || explosions.length || liveBombs.length || jelloBodies.length) {
      smokeObstPrevCamX = cam.x; smokeObstPrevCamY = cam.y;
      smokeObstPrevScrW = screenW; smokeObstPrevScrH = screenH;
      return true;
    }
    if (SMOKE_WATER_OBSTACLE && liquidCount > 0 &&
        ++smokeObstWaterTick >= SMOKE_OBST_WATER_EVERY) {
      smokeObstWaterTick = 0;
      smokeObstPrevCamX = cam.x; smokeObstPrevCamY = cam.y;
      smokeObstPrevScrW = screenW; smokeObstPrevScrH = screenH;
      return true;
    }
    return false;
  }
  var SMOKE_FLUID_OVERSCAN = 0.2;        // v12.18 — cut 0.6 -> 0.2. The smoke
  // canvas is a DOM layer the browser composites every frame; at overscan 0.6
  // (2.2x viewport) it was 2693x1683 = 4.5 MP, the M1 Air's altitude-fps cost.
  // 0.2 (~1.4x domain) shrinks it hard; smoke just persists less far off-screen.
  var smokeFluidMarginWorldX = 0;
  var smokeFluidMarginWorldY = 0;
  var smokeFluidDomainWorldW = 0;
  var smokeFluidDomainWorldH = 0;
  var smokeFluidDomainCssW = 0;
  var smokeFluidDomainCssH = 0;

  // v14.14 — Stage 6 — WebGPU smoke go-live. Once the WebGPU smoke port
  // (js/smoke-wgpu.js) has its shared device + pipelines ready, it drives
  // the smoke instead of the inlined WebGL SmokeFluid — the whole frame
  // then runs on one graphics API (WebGPU + Canvas2D, zero WebGL), which
  // removes the WebGPU<->WebGL interleave the perf hunt was chasing. Set
  // SMOKE_WGPU_GOLIVE = false to force the WebGL SmokeFluid back.
  var SMOKE_WGPU_GOLIVE = true;
  var smokeWGPUDriving = false;          // true once the WebGPU smoke is the driver
  // The active smoke backend. Defaults to the WebGL SmokeFluid; smokeWGPU
  // takes over in smokeWGPUEnsure(). Every runtime smoke call (splat,
  // step, scroll, displayPass, obstacle, clear) routes through this so
  // the two backends are interchangeable. Assigned below the SmokeFluid
  // module, so the var initialiser sees it.
  var smokeDriver = SmokeFluid;

  // ----- Surface wind ----------------------------------------------------
  // Always-on breeze that drives smokeTune.wind_x. New games roll their
  // initial tier so the surface never starts with the same wind every run.
  // Only affects smoke — no impact on player physics.
  // Visible to the player via windsocks rendered near both stations.
  var surfaceWind = {
    current: 0,
    target: 0,
    shiftT: 10,
    flutter: 0,
  };

  // Wind tier state machine.
  // Transitions:  still → calm / strong
  //               calm  → calm-same / calm-opposite / still / strong-same
  //               strong → calm-same (always)
  // After a strong→calm transition, that calm can only go to still or
  // calm-opposite (no immediate re-escalation).
  var windTier    = 'still';   // 'still' | 'calm' | 'strong'
  var windDir     = 1;         // current signed direction (+1 / -1)
  var windFromStrong = false;  // true when this calm followed a strong
  var windGustT   = 0;         // countdown to next gust check while strong

  var WIND_SPLAT_VEL    = 1.0;
  var WIND_SPLAT_RADIUS = 0.045;
  var WIND_SPLAT_NX     = 9;
  var WIND_FALLBACK     = 12;

  // Live-tunable — read every frame so slider changes apply immediately.
  // Effective wind_x per tier (user-tuned: magnitude × shader scale).
  var WIND_CALM   = 0.083;   // calm stays subtle
  var WIND_STRONG = 0.45;    // v11.74 — was 0.86; high-wind tier toned down
  var WIND_GUST   = 0.95;    // v11.74 — was 2.15; gust peaks went way too high
  var WIND_VISUAL_MAX = 0.45; // sock/banner full-deflect at ~strong level (tracks WIND_STRONG)

  function windSetTarget(tier, dir, target, shiftT, gustT, currentScale) {
    windTier = tier;
    windDir = dir || (Math.random() < 0.5 ? -1 : 1);
    surfaceWind.target = target;
    surfaceWind.shiftT = shiftT;
    windGustT = gustT || 0;
    if (currentScale !== null && currentScale !== undefined) {
      surfaceWind.current = surfaceWind.target * currentScale;
      smokeTune.wind_x = surfaceWind.current;
    }
  }

  function initSurfaceWind() {
    var dir = Math.random() < 0.5 ? -1 : 1;
    var r = Math.random();
    windFromStrong = false;
    surfaceWind.flutter = Math.random() * Math.PI * 2;
    if (r < 0.22) {
      windSetTarget('still', dir, 0, 8 + Math.random() * 35, 0, 0);
    } else if (r < 0.58) {
      windSetTarget('calm', dir, dir * WIND_CALM, 25 + Math.random() * 70, 0, 0.35 + Math.random() * 0.65);
    } else if (r < 0.86) {
      windSetTarget('strong', dir, dir * WIND_STRONG * (0.85 + Math.random() * 0.35), 22 + Math.random() * 55, 4 + Math.random() * 8, 0.45 + Math.random() * 0.45);
    } else {
      windSetTarget('strong', dir, dir * WIND_GUST * (0.75 + Math.random() * 0.35), 16 + Math.random() * 34, 3 + Math.random() * 6, 0.35 + Math.random() * 0.40);
    }
  }

  function windNextTier() {
    var r = Math.random();
    if (windTier === 'still') {
      windDir = Math.random() < 0.5 ? -1 : 1;
      windFromStrong = false;
      if (r < 0.72) {
        windSetTarget('calm', windDir, windDir * WIND_CALM, 25 + Math.random() * 75, 0, null);
      } else {
        windSetTarget('strong', windDir, windDir * WIND_STRONG, 25 + Math.random() * 55, 5 + Math.random() * 9, null);
      }

    } else if (windTier === 'calm') {
      if (windFromStrong) {
        if (r < 0.5) {
          windSetTarget('still', windDir, 0, 18 + Math.random() * 45, 0, null);
        } else {
          windDir = -windDir;
          windSetTarget('calm', windDir, windDir * WIND_CALM, 25 + Math.random() * 75, 0, null);
        }
        windFromStrong = false;
      } else {
        if (r < 0.42) {
          windSetTarget('calm', windDir, windDir * WIND_CALM, 25 + Math.random() * 75, 0, null);
        } else if (r < 0.62) {
          windDir = -windDir;
          windSetTarget('calm', windDir, windDir * WIND_CALM, 25 + Math.random() * 75, 0, null);
        } else if (r < 0.76) {
          windSetTarget('still', windDir, 0, 18 + Math.random() * 45, 0, null);
        } else {
          windSetTarget('strong', windDir, windDir * WIND_STRONG, 25 + Math.random() * 55, 5 + Math.random() * 9, null);
        }
      }

    } else {
      windFromStrong = true;
      windSetTarget('calm', windDir, windDir * WIND_CALM, 25 + Math.random() * 75, 0, null);
    }
  }

  function updateSurfaceWind(dt) {
    if (windTier === 'strong') {
      windGustT -= dt;
      if (windGustT <= 0) {
        surfaceWind.target = windDir * (Math.random() < 0.55 ? WIND_GUST * (0.85 + Math.random() * 0.30) : WIND_STRONG * (0.85 + Math.random() * 0.35));
        windGustT = 4 + Math.random() * 9;
      }
    }

    surfaceWind.shiftT -= dt;
    if (surfaceWind.shiftT <= 0) windNextTier();

    var k = 1 - Math.exp(-0.35 * dt);
    surfaceWind.current += (surfaceWind.target - surfaceWind.current) * k;
    surfaceWind.flutter += dt * (3 + Math.abs(surfaceWind.current) * 2.5);
    smokeTune.wind_x = surfaceWind.current;
  }

  // ----- Live-tunable smoke parameters (wired to the side panel) ----------
  // All numeric. Sliders in sluice.html mutate this object directly.
  var smokeTune = {
    diesel_enabled: true,
    thruster_enabled: false,
    // Diesel exhaust (the main plume)
    diesel_rate_active: 0.05,
    diesel_rate_moving: 0.085,
    diesel_rate_idle: 0,
    diesel_rad_active: 0.105,
    diesel_rad_moving: 0.165,
    diesel_rad_idle: 0.215,
    diesel_velY_active: 2.75,
    diesel_velY_idle: 0.5,
    diesel_shed_amp: 1.31,
    diesel_shed_freq: 10.8,
    diesel_dir_force: 1.57,
    diesel_vx_coupling: 0.0375,
    diesel_color_r: 0.14,
    diesel_color_g: 0.13,
    diesel_color_b: 0.11,
    diesel_color_jitter: 0,
    diesel_motion_scale: 0.34,
    diesel_rise_cap: 1.36,
    diesel_source_lift: 1.4,
    diesel_source_radius: 0.014,
    diesel_bloom_lift: 3.6,
    diesel_bloom_radius: 0.078,
    diesel_bloom_amount: 0.82,
    // Global force biases (applied at every diesel splat)
    wind_x: 0,
    wind_y: 3.35,
    // Pulse: rate *= 1 - depth + depth*sin(t*2π*pulse_rate)
    pulse_rate: 0.0,               // Hz (0 = off)
    pulse_depth: 0.0,              // 0..1 modulation
    // Buoyancy: extra wide-radius upward velocity splatted at the exhaust
    buoyancy_strength: 0.35,
    buoyancy_radius: 0.1,
    // Sim physics (live — read by SmokeFluid.step each frame)
    sim_time_scale: 0.22,
    // v11.60 — dye dissipation. 0.15 (orig) let smoke linger ~20s and
    // fill the screen; 0.6 (v11.59) was still too persistent. At 1.5 a
    // smoke puff loses half its density in ~2s, so plumes thin out and
    // fade as they spread instead of stacking up.
    sim_density_dissipation: 1.5,
    sim_velocity_dissipation: 0.03,
    sim_curl: 28.5,
    sim_pressure: 0.24,
    sim_pressure_iters: 17,
    sim_splat_radius: 0.255,
    // Behavior toggles
    world_lock: true,
    enabled: true,
  };
  window.smokeTune = smokeTune;

  // ----- Fireplace chimney smoke tune -----
  // Independent of smokeTune so the chimney can have its own look + rise
  // rate distinct from the miner's diesel exhaust. velY uses the same
  // convention as smokeFluid splat dy — positive = up in world. The
  // miner's diesel idle has velY ≈ 0.5; values noticeably above that make
  // the chimney rise faster than miner smoke.
  //
  // CRITICAL — color values are ADDED to the dye FBO every frame in the
  // splat shader (`base + splat`). Diesel uses ~0.002 per channel per
  // splat; values above ~0.020 saturate the dye to pure white within a
  // second. Keep colors in roughly the 0.0015–0.015 range. The visible
  // "color" of smoke comes from the relative balance between R, G, B at
  // the steady-state density, NOT from absolute magnitude — both
  // "white" and "warm grey" use values in the same magnitude band.
  var fireplaceTune = {
    enabled: true,
    color_r: 0.0082, color_g: 0.0078, color_b: 0.0072,
    color_jitter: 0.0006,      // per-splat random jitter (±range, RGB)
    radius: 0.021,
    velY: 1.00,                // upward velocity per splat (>0.5 = faster than miner idle)
    sway_amp: 0.18,            // horizontal sway amplitude
    sway_freq: 0.55,           // horizontal sway frequency (Hz)
    pulse_rate: 0.9,           // rate breathing frequency
    pulse_depth: 0.35,         // 0 = constant, 1 = full on/off pulses
    bloom_enabled: true,       // secondary splat above main one
    bloom_lift: 7,             // world px above main splat
    bloom_radius: 0.030,
    bloom_amount: 0.55,        // color multiplier for the bloom
    bloom_velY: 0.70,          // bloom upward velocity
    buoyancy_enabled: true,    // wide-radius zero-color velocity splat (extra rise)
    buoyancy_strength: 0.55,   // additional upward push
    buoyancy_radius: 0.060,
  };
  window.fireplaceTune = fireplaceTune;

  // 10 preset chimney looks. The first one is the default wood-smoke style;
  // the rest bias toward stronger silhouettes without the old white-out plume.
  // applyFireplacePreset(idx) copies the named values onto fireplaceTune.
  // All color_r/g/b values are in the splat-shader-safe range (0.0015-0.015).
  var FIREPLACE_PRESETS = [
    { name: 'Hearth Column', tune: { color_r: 0.0070, color_g: 0.0065, color_b: 0.0059, radius: 0.019, velY: 1.15, sway_amp: 0.16, sway_freq: 0.62, pulse_rate: 1.20, pulse_depth: 0.38, bloom_enabled: true, bloom_lift: 6, bloom_radius: 0.026, bloom_amount: 0.58, bloom_velY: 0.82, color_jitter: 0.0007, buoyancy_strength: 0.58, buoyancy_radius: 0.052 } },
    { name: 'Ash Grey',      tune: { color_r: 0.0082, color_g: 0.0078, color_b: 0.0072, radius: 0.021, velY: 1.00, sway_amp: 0.18, sway_freq: 0.55, pulse_rate: 0.90, pulse_depth: 0.35, bloom_enabled: true, bloom_lift: 7, bloom_radius: 0.030, bloom_amount: 0.55, bloom_velY: 0.70, color_jitter: 0.0006, buoyancy_strength: 0.55, buoyancy_radius: 0.060 } },
    { name: 'Cool Draft',    tune: { color_r: 0.0082, color_g: 0.0088, color_b: 0.0096, radius: 0.018, velY: 1.65, sway_amp: 0.10, sway_freq: 0.70, pulse_rate: 1.50, pulse_depth: 0.30, bloom_enabled: true, bloom_lift: 6, bloom_radius: 0.025, bloom_amount: 0.50, bloom_velY: 1.05, color_jitter: 0.0007, buoyancy_strength: 0.85, buoyancy_radius: 0.055 } },
    { name: 'Peat Curl',     tune: { color_r: 0.0068, color_g: 0.0054, color_b: 0.0043, radius: 0.023, velY: 0.70, sway_amp: 0.32, sway_freq: 0.38, pulse_rate: 0.55, pulse_depth: 0.55, bloom_enabled: true, bloom_lift: 5, bloom_radius: 0.031, bloom_amount: 0.62, bloom_velY: 0.45, color_jitter: 0.0007, buoyancy_strength: 0.30, buoyancy_radius: 0.065 } },
    { name: 'Coal Roll',     tune: { color_r: 0.0052, color_g: 0.0050, color_b: 0.0056, radius: 0.026, velY: 0.62, sway_amp: 0.22, sway_freq: 0.45, pulse_rate: 0.75, pulse_depth: 0.60, bloom_enabled: true, bloom_lift: 6, bloom_radius: 0.034, bloom_amount: 0.58, bloom_velY: 0.38, color_jitter: 0.0006, buoyancy_strength: 0.28, buoyancy_radius: 0.060 } },
    { name: 'Cinder Pulse',  tune: { color_r: 0.0094, color_g: 0.0062, color_b: 0.0039, radius: 0.020, velY: 1.20, sway_amp: 0.16, sway_freq: 0.75, pulse_rate: 1.75, pulse_depth: 0.54, bloom_enabled: true, bloom_lift: 6, bloom_radius: 0.028, bloom_amount: 0.72, bloom_velY: 0.85, color_jitter: 0.0010, buoyancy_strength: 0.55, buoyancy_radius: 0.052 } },
    { name: 'Puff Stack',    tune: { color_r: 0.0076, color_g: 0.0071, color_b: 0.0065, radius: 0.024, velY: 1.35, sway_amp: 0.07, sway_freq: 0.42, pulse_rate: 0.48, pulse_depth: 0.88, bloom_enabled: true, bloom_lift: 7, bloom_radius: 0.032, bloom_amount: 0.45, bloom_velY: 0.92, color_jitter: 0.0004, buoyancy_strength: 0.70, buoyancy_radius: 0.068 } },
    { name: 'Iron Stove',    tune: { color_r: 0.0064, color_g: 0.0061, color_b: 0.0058, radius: 0.017, velY: 1.85, sway_amp: 0.04, sway_freq: 0.85, pulse_rate: 0.65, pulse_depth: 0.22, bloom_enabled: true, bloom_lift: 5, bloom_radius: 0.022, bloom_amount: 0.46, bloom_velY: 1.30, color_jitter: 0.0004, buoyancy_strength: 0.95, buoyancy_radius: 0.045 } },
    { name: 'Fog Bank',      tune: { color_r: 0.0090, color_g: 0.0091, color_b: 0.0096, radius: 0.025, velY: 0.95, sway_amp: 0.20, sway_freq: 0.50, pulse_rate: 0.80, pulse_depth: 0.32, bloom_enabled: true, bloom_lift: 7, bloom_radius: 0.036, bloom_amount: 0.52, bloom_velY: 0.62, color_jitter: 0.0005, buoyancy_strength: 0.65, buoyancy_radius: 0.070 } },
    { name: 'Forge Plume',   tune: { color_r: 0.0102, color_g: 0.0067, color_b: 0.0048, radius: 0.025, velY: 1.75, sway_amp: 0.25, sway_freq: 0.45, pulse_rate: 0.70, pulse_depth: 0.45, bloom_enabled: true, bloom_lift: 8, bloom_radius: 0.038, bloom_amount: 0.68, bloom_velY: 1.20, color_jitter: 0.0012, buoyancy_strength: 0.90, buoyancy_radius: 0.085 } },
  ];
  var fireplaceActivePreset = 1;

  function applyFireplacePreset(idx) {
    if (idx < 0 || idx >= FIREPLACE_PRESETS.length) return;
    var p = FIREPLACE_PRESETS[idx].tune;
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k)) fireplaceTune[k] = p[k];
    }
    fireplaceActivePreset = idx;
    if (fireplacePresetPanelEl) {
      var btns = fireplacePresetPanelEl.querySelectorAll('button');
      for (var bi = 0; bi < btns.length; bi++) {
        btns[bi].classList.toggle('active', bi === idx);
      }
    }
  }
  window.applyFireplacePreset = applyFireplacePreset;

  var fireplacePresetPanelEl = null;
  function destroyFireplacePresetPanel() {
    if (fireplacePresetPanelEl && fireplacePresetPanelEl.parentNode) {
      fireplacePresetPanelEl.parentNode.removeChild(fireplacePresetPanelEl);
    }
    fireplacePresetPanelEl = null;
  }
  function syncFireplacePresetPanel() {
    destroyFireplacePresetPanel();
  }
  window.syncFireplacePresetPanel = syncFireplacePresetPanel;

  function smokeFluidPositionDOM() {
    if (!smokeFluidCanvas) return;
    // Smoke canvas covers the full sim domain (viewport + overscan).
    // Center it on the viewport so the parent's overflow:hidden clips
    // the margin. Pure CSS — no per-frame JS layout cost.
    var sCw = smokeFluidDomainCssW;
    var sCh = smokeFluidDomainCssH;
    var leftOff = -(sCw - viewW) / 2;
    var topOff  = -(sCh - viewH) / 2;
    smokeFluidCanvas.style.left   = leftOff + 'px';
    smokeFluidCanvas.style.top    = topOff + 'px';
    smokeFluidCanvas.style.width  = sCw + 'px';
    smokeFluidCanvas.style.height = sCh + 'px';
    // v11.42 — Smoke uses the simple inset clip too. Smoke canvas has
    // overscan, so the bottom inset must include the overscan margin
    // PLUS the desired bottom margin in canvas-local coords.
    var overscanY = (sCh - viewH) / 2;
    var overscanX = (sCw - viewW) / 2;
    // v11.72 — clip smoke out of the whole bottom-console strip. The smoke
    // canvas is a GPU layer composited ABOVE the 2D canvas (z-index 5), so
    // the toolbar painted on the 2D canvas can't occlude it; instead we
    // inset the clip to the console's top edge. consoleHeight() tracks the
    // 1-row vs folded 2-row layout and is re-read on every resize.
    var smokeBottomMargin = consoleHeight();
    smokeFluidCanvas.style.clipPath =
      'inset(' + overscanY + 'px ' + overscanX + 'px ' +
      (overscanY + smokeBottomMargin) + 'px ' + overscanX + 'px)';
  }

  function smokeFluidUpdateDomain() {
    // v11.73 — one overscan for mobile + desktop so smoke framing is
    // consistent across versions (was isMobile ? 0.42 : 1.6).
    var overscan = SMOKE_FLUID_OVERSCAN;
    smokeFluidMarginWorldX = screenW * overscan;
    smokeFluidMarginWorldY = screenH * overscan;
    smokeFluidDomainWorldW = screenW + smokeFluidMarginWorldX * 2;
    smokeFluidDomainWorldH = screenH + smokeFluidMarginWorldY * 2;
    smokeFluidDomainCssW = viewW * (1 + overscan * 2);
    smokeFluidDomainCssH = viewH * (1 + overscan * 2);
  }

  // v11.58 / v11.73 — Desktop smoke resolution scales with the viewport.
  // The fluid domain is ~2.2x the viewport (v11.73 overscan 0.6), so this
  // same dye budget now lands roughly 2x more detail on-screen than it did
  // at the old 1.6 overscan. Tie the dye to the viewport's short axis,
  // capped, so on-screen smoke detail stays roughly constant. Mobile keeps
  // its small fixed budget.
  function smokeFluidScaledRes() {
    // v11.87 — coarser mobile smoke. The fluid sim has an irreducible
    // per-frame cost; dropping the velocity grid (128->96) and dye field
    // (384->256) on phones cuts the sim-step + every dye/splat pass roughly
    // in half. Smoke reads chunkier on a phone screen but holds fps.
    if (isMobile) return { sim: 96, dye: 256 };
    // v12.18 — desktop smoke cut: the full desktop sim + the 2693x1683
    // canvas was the M1 Air altitude-fps cost. Smaller grid + dye field.
    var shortAxis = Math.min(viewW, viewH);
    var dye = Math.round(shortAxis * 0.62);
    if (dye < 384) dye = 384;
    if (dye > 672) dye = 672;
    return { sim: 160, dye: dye };
  }
  // v14.14 — Stage 6: getResolution() twin. The WebGL SmokeFluid derives
  // its sim/dye grid from a scalar + the canvas aspect (short axis = the
  // scalar, long axis = scalar*aspect); the WebGPU module takes explicit
  // width/height, so mirror that math here.
  function smokeWGPUResDims(res, w, h) {
    var ar = (h > 0) ? (w / h) : 1;
    if (ar < 1) ar = 1 / ar;
    var mn = Math.round(res);
    var mx = Math.round(res * ar);
    return (w > h) ? { w: mx, h: mn } : { w: mn, h: mx };
  }
  function smokeWGPUApplyRes(w, h) {
    var sres = smokeFluidScaledRes();
    var sim = smokeWGPUResDims(sres.sim, w, h);
    var dye = smokeWGPUResDims(sres.dye, w, h);
    smokeWGPU.resize(sim.w, sim.h, dye.w, dye.h);
  }
  // v14.14 — Stage 6: the WebGPU-smoke twin of smokeFluidEnsure()'s WebGL
  // setup. Adopts the WebGPU module's output canvas as the DOM-composited
  // smoke layer (z-index 5, the same slot as the WebGL smoke canvas),
  // sizes its sim/dye textures, and builds the obstacle silhouette
  // canvas. Returns true (the GPU smoke is ready to drive).
  function smokeWGPUEnsure() {
    if (!smokeFluidCanvas) {
      smokeFluidCanvas = smokeWGPU.renderCanvas;
      var pxScale = isMobile ? SMOKE_RENDER_SCALE_MOBILE : SMOKE_RENDER_SCALE_DESKTOP;
      var w = Math.max(64, Math.round(smokeFluidDomainCssW * pxScale));
      var h = Math.max(64, Math.round(smokeFluidDomainCssH * pxScale));
      smokeFluidCanvas.width = w;
      smokeFluidCanvas.height = h;
      smokeFluidWidth = w;
      smokeFluidHeight = h;
      // DOM-insert as a sibling of the main canvas — z-index 5, the smoke
      // layer the browser composites natively (same slot + CSS as the
      // WebGL smoke canvas; see smokeFluidEnsure()).
      smokeFluidCanvas.style.cssText =
        'position:absolute;pointer-events:none;z-index:5;display:block;';
      if (canvas && canvas.parentElement) {
        canvas.parentElement.appendChild(smokeFluidCanvas);
      }
      smokeFluidPositionDOM();
      smokeWGPUApplyRes(w, h);
      // Obstacle silhouette canvas — desktop 768x576 / mobile 320x240,
      // exactly as the WebGL path. smokeFluidPaintObstacle() drives it.
      smokeFluidObstacleW = isMobile ? 320 : 768;
      smokeFluidObstacleH = isMobile ? 240 : 576;
      smokeFluidObstacleCanvas = document.createElement('canvas');
      smokeFluidObstacleCanvas.width = smokeFluidObstacleW;
      smokeFluidObstacleCanvas.height = smokeFluidObstacleH;
      smokeFluidObstacleCtx = smokeFluidObstacleCanvas.getContext('2d');
      smokeDriver = smokeWGPU;
      smokeWGPUDriving = true;
      smokeFluidActive = true;
      try {
        console.log('SmokeWGPU Stage 6: WebGPU smoke LIVE — ' + w + 'x' + h +
          ' output canvas DOM-composited at z-index 5; the WebGL SmokeFluid ' +
          'is bypassed (single-API frame).');
      } catch (_) {}
    }
    // Track viewport size — resize the canvas + sim textures on change.
    var pxScale2 = isMobile ? SMOKE_RENDER_SCALE_MOBILE : SMOKE_RENDER_SCALE_DESKTOP;
    var nw = Math.max(64, Math.round(smokeFluidDomainCssW * pxScale2));
    var nh = Math.max(64, Math.round(smokeFluidDomainCssH * pxScale2));
    if (nw !== smokeFluidWidth || nh !== smokeFluidHeight) {
      smokeFluidWidth = nw; smokeFluidHeight = nh;
      smokeFluidCanvas.width = nw;
      smokeFluidCanvas.height = nh;
      smokeWGPUApplyRes(nw, nh);
    }
    return true;
  }
  function smokeFluidEnsure() {
    if (smokeFluidDisabled) return false;
    if (!SmokeFluid) return false;
    smokeFluidUpdateDomain();
    // v14.14 — Stage 6: the WebGPU smoke port drives the smoke once its
    // shared device + pipelines + output canvas are ready (single-API
    // frame). updateSmoke() only reaches here when smokeWGPU is
    // ready-or-dead, so this is stable. renderCanvas can be null if the
    // module built its pipelines but the webgpu output canvas failed —
    // in that case fall through to the WebGL SmokeFluid below.
    if (SMOKE_WGPU_GOLIVE && smokeWGPU && smokeWGPU.available &&
        smokeWGPU.pipelinesReady && !smokeWGPU.failed && smokeWGPU.renderCanvas) {
      return smokeWGPUEnsure();
    }
    if (!smokeFluidCanvas) {
      smokeFluidCanvas = document.createElement('canvas');
      var pxScale = isMobile ? SMOKE_RENDER_SCALE_MOBILE : SMOKE_RENDER_SCALE_DESKTOP;
      var w = Math.max(64, Math.round(smokeFluidDomainCssW * pxScale));
      var h = Math.max(64, Math.round(smokeFluidDomainCssH * pxScale));
      smokeFluidCanvas.width = w;
      smokeFluidCanvas.height = h;
      smokeFluidWidth = w;
      smokeFluidHeight = h;
      // v10.83 — attach smoke canvas to DOM as sibling of the main
      // canvas so the browser composites it as a GPU layer. No more
      // cross-context drawImage = no more 10ms sync barrier on mobile.
      // Parent has overflow:hidden so the overscan margin is clipped
      // naturally and the smoke only shows in the viewport.
      smokeFluidCanvas.style.cssText =
        'position:absolute;pointer-events:none;z-index:5;display:block;';
      if (canvas && canvas.parentElement) {
        canvas.parentElement.appendChild(smokeFluidCanvas);
      }
      smokeFluidPositionDOM();
      var sres = smokeFluidScaledRes();
      // v11.60 — SHADING off on desktop. The shading pass differentiates the
      // bilinear-filtered dye; the gradient kinks at every dye-texel boundary
      // read as a faint grid once the viewport (so the on-screen texel size)
      // is large. Mobile keeps it — small texels, no visible grid.
      var opts = isMobile
        ? { SIM_RESOLUTION: sres.sim, DYE_RESOLUTION: sres.dye, DENSITY_DISSIPATION: 0.2,
            VELOCITY_DISSIPATION: 0.04, CURL: 14, SPLAT_RADIUS: 0.18, SHADING: true }
        : { SIM_RESOLUTION: sres.sim, DYE_RESOLUTION: sres.dye, DENSITY_DISSIPATION: 0.15,
            VELOCITY_DISSIPATION: 0.03, CURL: 14, SPLAT_RADIUS: 0.18, SHADING: false };
      if (!SmokeFluid.init(smokeFluidCanvas, opts)) {
        smokeFluidDisabled = true;
        smokeFluidCanvas = null;
        console.warn('SmokeFluid init failed — falling back to SPH grid sim.');
        return false;
      }
      // v11.73 — obstacle mask resolution. This is the silhouette the
      // smoke physically collides with. At the old 512×384 over a 4.2×
      // domain it resolved to ~16 screen-px per cell — far too coarse
      // for the wavy dug-tile edges, so smoke crossed the visible
      // outline. Bumped to 768×576 which, with the tighter v11.73
      // domain, lands ~3× finer (~5–6 screen-px/cell) so the mask
      // tracks the carved contours. Mobile's mask is GPU-painted (no
      // texImage2D upload) so its bump to 320×240 is nearly free.
      smokeFluidObstacleW = isMobile ? 320 : 768;
      smokeFluidObstacleH = isMobile ? 240 : 576;
      smokeFluidObstacleCanvas = document.createElement('canvas');
      smokeFluidObstacleCanvas.width = smokeFluidObstacleW;
      smokeFluidObstacleCanvas.height = smokeFluidObstacleH;
      smokeFluidObstacleCtx = smokeFluidObstacleCanvas.getContext('2d');
      smokeFluidActive = true;
    }
    // Track viewport size — resize the GL canvas if it changed.
    var pxScale2 = isMobile ? SMOKE_RENDER_SCALE_MOBILE : SMOKE_RENDER_SCALE_DESKTOP;
    var nw = Math.max(64, Math.round(smokeFluidDomainCssW * pxScale2));
    var nh = Math.max(64, Math.round(smokeFluidDomainCssH * pxScale2));
    if (nw !== smokeFluidWidth || nh !== smokeFluidHeight) {
      smokeFluidWidth = nw; smokeFluidHeight = nh;
      // Re-scale dye/sim resolution to the new viewport before the
      // framebuffers are rebuilt, so fullscreen gets a finer grid.
      if (SmokeFluid.config) {
        var sres2 = smokeFluidScaledRes();
        SmokeFluid.config.SIM_RESOLUTION = sres2.sim;
        SmokeFluid.config.DYE_RESOLUTION = sres2.dye;
      }
      if (SmokeFluid.resize) SmokeFluid.resize(nw, nh);
    }
    return true;
  }

  // Map a world (px) coord to canvas UV. uvY is flipped because the GL
  // framebuffer's Y origin is at the bottom (Pavel's mouse-pointer code
  // uses the same flip).
  function smokeFluidWorldToUV(wx, wy) {
    var domainX = cam.x - smokeFluidMarginWorldX;
    var domainY = cam.y - smokeFluidMarginWorldY;
    var sxN = (wx - domainX) / smokeFluidDomainWorldW;
    var syN = (wy - domainY) / smokeFluidDomainWorldH;
    return {
      uvX: sxN,
      uvY: 1.0 - syN,
      inView: sxN > -0.05 && sxN < 1.05 && syN > -0.05 && syN < 1.05,
    };
  }


  // Paint a silhouette of solid tiles into the obstacle canvas, with
  // rounded corners on edges that face into a void. This is what gives
  // the smoke its "carved-tunnel" feel — flow follows the visual edge
  // of dug-out terrain, not the underlying square grid.
  // Unified solid-mask painter. For each visible tile we paint the SAME
  // silhouette the visual terrain produces:
  //   - Solid tile: full rect (its visual exposedMaterialShape lives within
  //     the rect, so a rect is a safe outer bound).
  //   - Void tile bordering solid: full rect THEN destination-out the same
  //     `applyVoidCarveShapes` paths that drawSmoothVoidCell uses to carve
  //     the cave interior out of the dirt backing. What's left is the dirt
  //     fringe — the exact pixels that visually read as solid.
  // Result: the smoke obstacle silhouette is locked to the visible terrain
  // silhouette, so smoke flows along whatever the renderer draws — including
  // newly mined tiles (their carve shapes update automatically).
  // v10.87 — mobile path: paint the obstacle directly in the smoke
  // WebGL context via SmokeFluid.paintObstacleQuads(). Eliminates the
  // 5ms/frame texImage2D(canvas) cross-context upload by removing the
  // upload entirely. Walks tiles, builds a Float32Array of NDC quad
  // verts, dispatches one draw call. Trade-off: we skip the void-
  // contour subtraction (Pass 2 below) since porting Path2D fills to
  // WebGL is a big lift; smoke can no longer enter cave interiors.
  // Acceptable since most active smoke is exhaust above ground.
  var smokeObstacleQuadVerts = null;  // reusable Float32Array
  function smokeFluidPaintObstacleGL() {
    var _opg0 = performance.now();
    var domainX = cam.x - smokeFluidMarginWorldX;
    var domainY = cam.y - smokeFluidMarginWorldY;
    var domainW = smokeFluidDomainWorldW;
    var domainH = smokeFluidDomainWorldH;
    var startCol = Math.max(0, Math.floor(domainX / TILE) - 1);
    var endCol = Math.min(COLS - 1, Math.floor((domainX + domainW) / TILE) + 1);
    var startRow = Math.floor(domainY / TILE) - 1;
    var endRow = Math.floor((domainY + domainH) / TILE) + 1;
    var maxTiles = Math.max(0, (endRow - startRow + 1) * (endCol - startCol + 1));
    var needLen = Math.max(maxTiles * 12, 4096);
    if (!smokeObstacleQuadVerts || smokeObstacleQuadVerts.length < needLen) {
      smokeObstacleQuadVerts = new Float32Array(needLen);
    }
    var verts = smokeObstacleQuadVerts;
    var n = 0;
    for (var r = startRow; r <= endRow; r++) {
      for (var c = startCol; c <= endCol; c++) {
        var t = tileAt(r, c);
        if (t == null || t === 'wall') continue;
        var u0 = ((c * TILE - domainX) / domainW) * 2 - 1;
        var u1 = (((c + 1) * TILE - domainX) / domainW) * 2 - 1;
        // Flip Y for GL Y-up framebuffer so the texture matches the dye
        // (which is also Y-up and uses uvY = 1 - syN).
        var v0 = 1 - 2 * (r * TILE - domainY) / domainH;
        var v1 = 1 - 2 * ((r + 1) * TILE - domainY) / domainH;
        verts[n++] = u0; verts[n++] = v0;
        verts[n++] = u1; verts[n++] = v0;
        verts[n++] = u0; verts[n++] = v1;
        verts[n++] = u1; verts[n++] = v0;
        verts[n++] = u1; verts[n++] = v1;
        verts[n++] = u0; verts[n++] = v1;
      }
    }
    // Live jello bodies as obstacle quads (coarse bbox — keeps smoke from
    // pouring through a gel cube on mobile; desktop fills the exact ring).
    for (var jb = 0; jb < jelloBodies.length; jb++) {
      var jbody = jelloBodies[jb];
      if (jbody.ringN < 3 || n + 12 > verts.length) break;
      if (jbody.bboxR < domainX || jbody.bboxL > domainX + domainW ||
          jbody.bboxB < domainY || jbody.bboxT > domainY + domainH) continue;
      var ju0 = ((jbody.bboxL - domainX) / domainW) * 2 - 1;
      var ju1 = ((jbody.bboxR - domainX) / domainW) * 2 - 1;
      var jv0 = 1 - 2 * (jbody.bboxT - domainY) / domainH;
      var jv1 = 1 - 2 * (jbody.bboxB - domainY) / domainH;
      verts[n++] = ju0; verts[n++] = jv0;
      verts[n++] = ju1; verts[n++] = jv0;
      verts[n++] = ju0; verts[n++] = jv1;
      verts[n++] = ju1; verts[n++] = jv0;
      verts[n++] = ju1; verts[n++] = jv1;
      verts[n++] = ju0; verts[n++] = jv1;
    }
    smokeDriver.paintObstacleQuads(verts, n / 2, smokeFluidObstacleW, smokeFluidObstacleH);
    perfMark('update.smokeObstacleGL', _opg0);
  }

  function smokeFluidPaintObstacle() {
    if (!smokeFluidActive) return;
    if (isMobile) {
      smokeFluidPaintObstacleGL();
      return;
    }
    var _opd0 = performance.now();
    var oc = smokeFluidObstacleCtx;
    var ow = smokeFluidObstacleW, oh = smokeFluidObstacleH;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.clearRect(0, 0, ow, oh);
    var domainX = cam.x - smokeFluidMarginWorldX;
    var domainY = cam.y - smokeFluidMarginWorldY;
    var sxScale = ow / smokeFluidDomainWorldW;
    var syScale = oh / smokeFluidDomainWorldH;
    var startCol = Math.max(0, Math.floor(domainX / TILE) - 1);
    var endCol = Math.min(COLS - 1, Math.floor((domainX + smokeFluidDomainWorldW) / TILE) + 1);
    var startRow = Math.floor(domainY / TILE) - 1;
    var endRow = Math.floor((domainY + smokeFluidDomainWorldH) / TILE) + 1;

    // Pass 1 — opaque coverage for every tile that has any visual material.
    // Use sub-pixel positions (no Math.floor) so the obstacle edge moves
    // continuously with the camera. If we snapped to integer pixels here,
    // the obstacle would jump in 1-pixel increments while the dye texture
    // scrolls at full sub-pixel precision — and the advection shader (which
    // zeros dye inside obstacles) would chew through smoke at the boundary
    // every frame the camera was moving.
    oc.fillStyle = '#000';
    var voidCarveTiles = [];
    var tileW = TILE * sxScale;
    var tileH = TILE * syScale;
    for (var r = startRow; r <= endRow; r++) {
      for (var c = startCol; c <= endCol; c++) {
        var t = tileAt(r, c);
        if (t != null && t !== 'wall') {
          oc.fillRect((c * TILE - domainX) * sxScale, (r * TILE - domainY) * syScale, tileW, tileH);
        } else if (t === null) {
          if (dominantVoidBackingKind(r, c)) {
            oc.fillRect((c * TILE - domainX) * sxScale, (r * TILE - domainY) * syScale, tileW, tileH);
            voidCarveTiles.push(r, c);
          }
        }
      }
    }

    // Pass 2 — carve out the cave interior using the SAME contour path the
    // visual renderer fills. One destination-out fill subtracts every cave
    // polygon at once, guaranteeing collision matches the visible boundary.
    if (voidCarveTiles.length) {
      oc.save();
      oc.setTransform(sxScale, 0, 0, syScale, -domainX * sxScale, -domainY * syScale);
      oc.globalCompositeOperation = 'destination-out';
      oc.fillStyle = '#000';
      var voidPath = buildVoidContourPath(startRow, endRow, startCol, endCol);
      oc.fill(voidPath);
      if (startRow <= SKY_ROWS && endRow >= SKY_ROWS) {
        var oldCtx = ctx;
        ctx = oc;
        drawSurfaceVoidMouths(startCol, endCol);
        ctx = oldCtx;
      }
      oc.globalCompositeOperation = 'source-over';
      oc.restore();
    }

    // Pass 3 — live jello bodies are solid obstacles too, so the diesel smoke
    // flows AROUND a gel cube instead of straight through it. Fill each visible
    // body's boundary ring (source-over, opaque) in world space — the ring is a
    // fixed-topology polygon that deforms with the cube, so the obstacle tracks
    // the squish exactly. Cheap (one ~32-vertex fill per on-screen cube).
    if (jelloBodies.length) {
      oc.save();
      oc.setTransform(sxScale, 0, 0, syScale, -domainX * sxScale, -domainY * syScale);
      oc.fillStyle = '#000';
      var domR = domainX + smokeFluidDomainWorldW, domB = domainY + smokeFluidDomainWorldH;
      for (var jb = 0; jb < jelloBodies.length; jb++) {
        var jbody = jelloBodies[jb];
        if (jbody.ringN < 3) continue;
        if (jbody.bboxR < domainX || jbody.bboxL > domR ||
            jbody.bboxB < domainY || jbody.bboxT > domB) continue;
        var jring = jbody.ring, jpx = jbody.px, jpy = jbody.py;
        oc.beginPath();
        oc.moveTo(jpx[jring[0]], jpy[jring[0]]);
        for (var jri = 1; jri < jbody.ringN; jri++) oc.lineTo(jpx[jring[jri]], jpy[jring[jri]]);
        oc.closePath();
        oc.fill();
      }
      oc.restore();
    }

    // Pass 4 — WATER as obstacle (v25.46, the owner's "smoke clearly exists
    // on a completely separate layer" fix): stamp the rendered water body —
    // the live water canvas, the exact metaball shape on screen — into the
    // mask, so smoke piles onto pond surfaces and curls around waterfalls
    // instead of ghosting straight over them. The water canvas covers the
    // viewport; the obstacle domain adds overscan margins, so the stamp
    // lands at the margin offset. Alpha rides as-is: the body (~0.82)
    // reads solid to the solver, the feathered rim is a soft boundary,
    // and thin spray (low alpha) lets smoke partially through. Water in
    // the overscan band is not stamped (off-screen smoke only). The
    // GL/mobile quad path skips water (coarse grid, perf-first).
    if (SMOKE_WATER_OBSTACLE && liquidCount > 0) {
      var wCv = (typeof liquidWGPU !== 'undefined' && liquidWGPU &&
                 liquidWGPU.renderActive && liquidWGPU.renderCanvas)
        ? liquidWGPU.renderCanvas
        : (typeof liquidGLCanvas !== 'undefined' && liquidGLCanvas &&
           liquidGLCanvas.style.display !== 'none' ? liquidGLCanvas : null);
      if (wCv && wCv.width > 0) {
        oc.drawImage(wCv,
          smokeFluidMarginWorldX * sxScale, smokeFluidMarginWorldY * syScale,
          screenW * sxScale, screenH * syScale);
      }
    }

    perfMark('update.smokeObstacleDraw', _opd0);
    var _opu0 = performance.now();
    smokeDriver.setObstacleAlpha(smokeFluidObstacleCanvas);
    perfMark('update.smokeObstacleUpload', _opu0);
  }

  // Splat dye + velocity at the rig's exhaust mouth. Rates are per-frame;
  // emitDt scales them so a long frame doesn't dump a huge pulse all at once.
  function smokeFluidEmit(dt) {
    if (!smokeFluidActive) return;
    if (gameOver || gameWon) return;
    if (!smokeTune.enabled) return;
    var emitDt = Math.min(dt, 0.05);
    var motionScale = Math.max(0.02, smokeTuneNum(smokeTune.diesel_motion_scale, 1));
    smokeFluidShedPhase += emitDt * (smokeTune.diesel_shed_freq + Math.abs(player.vx) * 0.04) * motionScale;

    // Live-mirror sim params into the driver's config so step() picks them up.
    var SC = smokeDriver && smokeDriver.config;
    if (SC) {
      var pressure = smokeTune.sim_pressure;
      if (pressure < 0) pressure = 0;
      else if (pressure > 0.99) pressure = 0.99;
      SC.DENSITY_DISSIPATION = smokeTune.sim_density_dissipation;
      SC.VELOCITY_DISSIPATION = smokeTune.sim_velocity_dissipation;
      SC.CURL = smokeTune.sim_curl;
      SC.PRESSURE = pressure;
      // v11.87 — fewer pressure-solve passes on mobile. The Jacobi solve is
      // the bulk of the sim-step cost; 13 vs 17 trims it ~25%. On the coarse
      // mobile grid the small loss of incompressibility isn't visible.
      SC.PRESSURE_ITERATIONS = (isMobile
        ? Math.min(13, smokeTune.sim_pressure_iters)
        : smokeTune.sim_pressure_iters) | 0;
      SC.SPLAT_RADIUS = smokeTune.sim_splat_radius;
      // Wind: push dye above the surface via shader uniform — zero extra passes.
      // u_wind_x is in UV/sec; scale wind_x (which is ~0-0.65) so visible effect.
      SC.wind_x = smokeTune.wind_x;
      // Compute the UV Y threshold above which wind applies.
      // uvY = 1 - syN; surface syN = (surfaceWorldY - domainY) / domainH.
      var domainY2 = cam.y - smokeFluidMarginWorldY;
      var domainH2 = smokeFluidDomainWorldH;
      var surfaceSyN2 = domainH2 > 0 ? (SKY_ROWS * TILE - domainY2) / domainH2 : 0;
      SC.wind_above_y = Math.max(0, Math.min(1, 1.0 - surfaceSyN2));
    }

    // Pulse modulation (rate breathes between (1-depth) and 1)
    var pulse = 1.0;
    if (smokeTune.pulse_rate > 0 && smokeTune.pulse_depth > 0) {
      var t = performance.now() * 0.001;
      pulse = 1 - smokeTune.pulse_depth + smokeTune.pulse_depth * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * smokeTune.pulse_rate));
    }

    // ----- Diesel exhaust (top-rear of the rig, mirrored by player.dir) -----
    var ex = getExhaustWorldPos();
    var euv = smokeFluidWorldToUV(ex.x, ex.y);
    var isActive = !!drilling;
    var moving = Math.abs(player.vx) > 8 || player.thrusting;
    if (smokeTune.diesel_enabled && euv.inView && (isActive || moving)) {
      smokeMarkActive();   // v23.32 — dye is about to be injected; keep the sim awake
      var rate = isActive ? smokeTune.diesel_rate_active
               : (moving   ? smokeTune.diesel_rate_moving
                           : smokeTune.diesel_rate_idle);
      rate *= pulse;
      // v11.58 — pace dye output off real time so a low-fps device emits
      // the same smoke-per-second as a fast one (emitDt is dt capped at
      // 0.05; ×60 → 1 at 60 fps, 2 at 30 fps).
      rate *= Math.min(3, Math.max(0.1, emitDt * 60));
      var rad = isActive ? smokeTune.diesel_rad_active
              : (moving   ? smokeTune.diesel_rad_moving
                          : smokeTune.diesel_rad_idle);
      var sourceLift = Math.max(0, smokeTuneNum(smokeTune.diesel_source_lift, isActive ? 6.8 : (moving ? 5.2 : 3.8)));
      var bloomLift = Math.max(0, smokeTuneNum(smokeTune.diesel_bloom_lift, isActive ? 8.5 : 5.0));
      var source = smokeFluidWorldToUV(ex.x - player.dir * 0.45, ex.y - sourceLift);
      var bloom = smokeFluidWorldToUV(ex.x - player.dir * (1.2 + Math.abs(player.vx) * 0.002), ex.y - sourceLift - bloomLift);
      var jr = (Math.random() - 0.5) * 2 * smokeTune.diesel_color_jitter;
      var jg = (Math.random() - 0.5) * 2 * smokeTune.diesel_color_jitter;
      var jb = (Math.random() - 0.5) * 2 * smokeTune.diesel_color_jitter;
      smokeEmitCol.r = Math.max(0, rate * (smokeTune.diesel_color_r + jr));
      smokeEmitCol.g = Math.max(0, rate * (smokeTune.diesel_color_g + jg));
      smokeEmitCol.b = Math.max(0, rate * (smokeTune.diesel_color_b + jb));
      var col = smokeEmitCol;
      var sideJ = Math.sin(smokeFluidShedPhase) * 0.8;
      var velX = sideJ * smokeTune.diesel_shed_amp
               - player.dir * smokeTune.diesel_dir_force * (isActive ? 1 : 0.4)
               - player.vx * smokeTune.diesel_vx_coupling
               + smokeTune.wind_x;
      var velY = (isActive ? smokeTune.diesel_velY_active : smokeTune.diesel_velY_idle)
               + smokeTune.wind_y;
      velX *= motionScale;
      velY *= motionScale;
      var riseCap = smokeTuneNum(smokeTune.diesel_rise_cap, 999);
      if (riseCap >= 0 && velY > riseCap) velY = riseCap;
      var mouthRate = Math.max(rate * 0.55, isActive ? 0.035 : 0.014);
      smokeEmitMouthCol.r = Math.max(0, mouthRate * (smokeTune.diesel_color_r + jr));
      smokeEmitMouthCol.g = Math.max(0, mouthRate * (smokeTune.diesel_color_g + jg));
      smokeEmitMouthCol.b = Math.max(0, mouthRate * (smokeTune.diesel_color_b + jb));
      var mouthCol = smokeEmitMouthCol;
      var mouthRad = Math.max(0.001, smokeTuneNum(smokeTune.diesel_source_radius, 0.014) * 0.50);
      var sourceRad = Math.max(0.002, smokeTuneNum(smokeTune.diesel_source_radius, Math.min(0.010 + rad * 0.030, 0.022)));
      var bloomRad = Math.max(0.002, smokeTuneNum(smokeTune.diesel_bloom_radius, Math.min(0.016 + rad * 0.060, 0.044)));
      var bloomAmt = Math.max(0, smokeTuneNum(smokeTune.diesel_bloom_amount, 0.72));
      smokeDriver.splat(euv.uvX, euv.uvY, velX * 0.20, Math.max(0.035, velY), mouthCol, mouthRad);
      if (source.inView) {
        smokeDriver.splat(source.uvX, source.uvY, velX, velY, col, sourceRad);
      }
      if (bloom.inView) {
        smokeEmitBloomCol.r = col.r * bloomAmt;
        smokeEmitBloomCol.g = col.g * bloomAmt;
        smokeEmitBloomCol.b = col.b * bloomAmt;
        var bloomCol = smokeEmitBloomCol;
        smokeDriver.splat(bloom.uvX, bloom.uvY, velX * 0.55, velY * 0.50, bloomCol, bloomRad);
      }
      // Buoyancy: optional wide-radius upward velocity splat (no dye, just air motion).
      if (smokeTune.buoyancy_strength > 0) {
        var buoy = smokeTune.buoyancy_strength * motionScale;
        if (riseCap >= 0 && buoy > riseCap) buoy = riseCap;
        smokeDriver.splat(
          euv.uvX, euv.uvY,
          0, buoy,
          SMOKE_ZERO_COL,
          smokeTune.buoyancy_radius
        );
      }
    }

  }

  // Blit the GL canvas onto the game's 2D ctx in screen-space (CSS px).
  // The world transform must be saved/restored around this call.
  function smokeFluidDraw() {
    if (!smokeFluidActive) return;
    // v10.83 — smoke renders directly to its own DOM-layered canvas;
    // browser composites it as a GPU layer on top of the main canvas.
    // No drawImage between contexts, no GPU sync barrier (was the
    // 10ms render.smokeSync killer on mobile). All we do per frame
    // is run the display shader. CSS positioning is constant unless
    // the viewport resizes; resize() updates it.
    var _ts0 = performance.now();
    smokeDriver.displayPass();
    perfMark('render.smoke', _ts0);
  }

  function updateSmoke(dt) {
    // v12.9 — per-subsystem gating so each part can be A/B tested alone.
    var _us1 = performance.now();
    if (!PERF_DISABLE_ROCKET) updateRocketPlume(dt);
    perfMark('update.smokeRocketPlume', _us1);
    if (PERF_DISABLE_SMOKE_FLUID) return;   // fluid sim gated separately
    // v14.14 — Stage 6: if WebGPU smoke is intended but its shared device
    // is still initialising, render no smoke this frame — do NOT spin up
    // the SPH fallback (that is reserved for when GPU smoke truly fails).
    if (SMOKE_WGPU_GOLIVE && smokeWGPU && !smokeWGPU.failed &&
        !(smokeWGPU.available && smokeWGPU.pipelinesReady)) {
      return;
    }
    // Prefer the GPU path (WebGPU smoke, else the WebGL SmokeFluid). Falls
    // through to the SPH grid below only if neither GPU path can run.
    if (smokeFluidEnsure()) {
      if (dt > 0.05) dt = 0.05;
      var smokeStepDt = dt * Math.max(0.02, smokeTuneNum(smokeTune.sim_time_scale, 1));
      var _gpuT = devMode ? performance.now() : 0;
      // World-lock: shift the dye/velocity fields by the camera delta so
      // smoke stays put in world space while the camera pans with the rig.
      // v23.32 — idle-skip. smokeRunPre reflects whether the field had live/
      // recent smoke coming into this frame. The world-lock scroll and obstacle
      // repaint are pure no-ops on a fully-dissipated field, so their GPU cost
      // is skipped while asleep; prevCam is still tracked every frame so waking
      // never feeds scroll() a huge accumulated delta. With the toggle off,
      // smokeRunPre is always true ⇒ every-frame behavior, unchanged.
      var smokeRunPre = !PERF_SMOKE_IDLE_SKIP || smokeAwakeT > 0;
      var _us2 = performance.now();
      if (smokeFluidPrevCamX === null ||
          smokeFluidPrevScreenW !== screenW || smokeFluidPrevScreenH !== screenH) {
        smokeFluidPrevCamX = cam.x;
        smokeFluidPrevCamY = cam.y;
        smokeFluidPrevScreenW = screenW;
        smokeFluidPrevScreenH = screenH;
      } else {
        var dxFrac = (cam.x - smokeFluidPrevCamX) / smokeFluidDomainWorldW;
        var dyFrac = (cam.y - smokeFluidPrevCamY) / smokeFluidDomainWorldH;
        if (smokeRunPre && smokeTune.world_lock && (dxFrac || dyFrac)) smokeDriver.scroll(dxFrac, dyFrac);
        smokeFluidPrevCamX = cam.x;
        smokeFluidPrevCamY = cam.y;
      }
      perfMark('update.smokeScroll', _us2);
      var _us3 = performance.now();
      // Repaint the collision mask only when awake AND something reshaped it.
      // && short-circuits the dirty-check while asleep, so its trackers stay
      // stale and a pan made during sleep still repaints on the next wake.
      if (smokeRunPre && smokeObstacleNeedsRepaint()) smokeFluidPaintObstacle();
      perfMark('update.smokeObstacle', _us3);
      var _us4 = performance.now();
      smokeFluidEmit(dt);
      perfMark('update.smokeEmit', _us4);
      // Count the idle timer down after emit (the diesel emit may have just
      // refreshed it this frame) and gate the expensive sim step on it.
      if (smokeAwakeT > 0) smokeAwakeT -= dt;
      var smokeRun = !PERF_SMOKE_IDLE_SKIP || smokeAwakeT > 0;
      var _us5 = performance.now();
      if (smokeRun) smokeDriver.step(smokeStepDt);
      perfMark('update.smokeStep', _us5);
      if (devMode && !smokeWGPUDriving) gpuProbe('smoke.update', _gpuT, smokeProbeGL());
      return;
    }
    fluidEnsure();
    if (gameOver) return;
    if (dt > 0.05) dt = 0.05;

    fluidUpdateGridOrigin();
    fluidBuildObstacles();
    fluidInjectSources(dt);
    fluidAddBuoyancy(dt);
    fluidApplySurfaceWind(dt);
    fluidVorticityConfinement(dt);
    fluidEnforceBoundaries();
    fluidProject();

    fluidU0.set(fluidU);
    fluidV0.set(fluidV);
    fluidAdvect(fluidU, fluidU0, fluidU0, fluidV0, dt);
    fluidAdvect(fluidV, fluidV0, fluidU0, fluidV0, dt);
    fluidEnforceBoundaries();
    fluidProject();

    fluidD0.set(fluidD);
    fluidAdvect(fluidD, fluidD0, fluidU, fluidV, dt);
    fluidS0.set(fluidS);
    fluidAdvect(fluidS, fluidS0, fluidU, fluidV, dt);
    // Reuse D0 for temperature scratch.
    fluidD0.set(fluidT);
    fluidAdvect(fluidT, fluidD0, fluidU, fluidV, dt);

    fluidDecay(dt);
  }

  function drawSmoke() {
    if (PERF_DISABLE_SMOKE_FLUID) return;   // v12.9 — fluid sim toggle
    if (smokeFluidActive) {
      if (devMode && !smokeWGPUDriving) {
        var _gpuDrawT = performance.now();
        smokeFluidDraw();
        gpuProbe('smoke.draw', _gpuDrawT, smokeProbeGL());
      } else {
        smokeFluidDraw();
      }
      return;
    }
    if (!fluidReady) return;
    var W = FLUID_W, H = FLUID_H;
    var data = fluidImage.data;
    var any = false;
    var N = W * H;
    for (var i = 0; i < N; i++) {
      var d = fluidD[i];
      var s = fluidS[i];
      var pi = i << 2;
      if (d < 0.005 && s < 0.005) {
        data[pi + 3] = 0;
        continue;
      }
      any = true;
      var t = Math.min(1, fluidT[i]);
      // Beer-Lambert opacity: thicker fluid blocks more light.
      var alpha = 1 - Math.exp(-(d * 2.4 + s * 2.5));
      // Color: warm mid-grey for diesel (visible against both sky and
      // tunnel), bright white for steam, with a hot ember tint when T is
      // high and diesel-dominant.
      var dom = d / (d + s + 0.0001);
      // Diesel base shifts from warm dark (newborn, hot) to cool light
      // (old, cooled) — same way real exhaust looks.
      var coolMix = 1 - t;                 // 0 = freshly emitted, 1 = cold
      var dr = 60 + coolMix * 70;          // 60..130
      var dg = 56 + coolMix * 70;          // 56..126
      var db = 52 + coolMix * 72;          // 52..124
      var sr = 244, sg = 246, sb = 250;
      var r = dr * dom + sr * (1 - dom);
      var g = dg * dom + sg * (1 - dom);
      var b = db * dom + sb * (1 - dom);
      // Ember boost: only newborn hot diesel gets warm tint.
      var ember = t * dom;
      r += ember * 95;
      g += ember * 38;
      b += ember * 4;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      data[pi]     = r;
      data[pi + 1] = g;
      data[pi + 2] = b;
      data[pi + 3] = alpha * 255;
    }
    if (!any) return;
    fluidCtx.putImageData(fluidImage, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      fluidCanvas,
      fluidGridX, fluidGridY,
      FLUID_W * FLUID_CELL, FLUID_H * FLUID_CELL
    );
    ctx.restore();
  }


  function smokeTuneNum(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  function clearAllSmokeVisuals() {
    smokeResetPool();
    clearRocketPlume();
    smokeFluidShedPhase = 0;
    smokeFluidPrevCamX = null;
    smokeFluidPrevCamY = null;
    smokeAwakeT = 0;                       // v23.32 — fresh run starts asleep
    smokeObstPrevCamX = NaN; smokeObstPrevCamY = NaN;
    smokeObstPrevScrW = -1; smokeObstPrevScrH = -1;
    if (smokeFluidActive && smokeDriver) {
      smokeDriver.clear();
      smokeDriver.clearObstacle();
    }
  }

  function drawExhaustPipeSmokeBridge() {
    if (PERF_DISABLE_EXHAUST_BRIDGE) return;   // v12.9 — exhaust-bridge toggle
    if (!smokeTune || !smokeTune.enabled || !smokeTune.diesel_enabled) return;
    if (gameOver || gameWon) return;
    // v11.26 + v11.34 — suppress while in shop or during death/win plate.
    if (UI_NEW && (shopState !== 'closed' || gameOver || gameWon)) return;
    var ex = getExhaustWorldPos();
    if (ex.x + 10 < cam.x || ex.x - 10 > cam.x + screenW) return;
    if (ex.y + 16 < cam.y || ex.y - 18 > cam.y + screenH) return;
    var active = !!drilling;
    var moving = Math.abs(player.vx) > 8 || player.thrusting;
    if (!active && !moving) return;
    var rate = active ? smokeTune.diesel_rate_active
             : (moving ? smokeTune.diesel_rate_moving : smokeTune.diesel_rate_idle);
    if (rate <= 0) return;
    var t = performance.now() * 0.001;
    var a = Math.max(0.10, Math.min(0.58, rate * (active ? 3.0 : 4.6)));
    var h = active ? 12 : (moving ? 9 : 6);
    var lean = -player.dir * (1.0 + Math.abs(player.vx) * 0.010) + smokeTune.wind_x * 1.5;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    var grad = ctx.createLinearGradient(ex.x, ex.y + 1.5, ex.x + lean, ex.y - h);
    grad.addColorStop(0, 'rgba(22,20,18,' + a.toFixed(3) + ')');
    grad.addColorStop(0.42, 'rgba(72,66,58,' + (a * 0.58).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(110,106,96,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(ex.x - 1.25, ex.y + 1.2);
    ctx.bezierCurveTo(ex.x - 2.6, ex.y - h * 0.28, ex.x + lean - 2.8, ex.y - h * 0.72, ex.x + lean - 1.2, ex.y - h);
    ctx.quadraticCurveTo(ex.x + lean, ex.y - h - 1.6, ex.x + lean + 1.2, ex.y - h);
    ctx.bezierCurveTo(ex.x + lean + 2.8, ex.y - h * 0.72, ex.x + 2.6, ex.y - h * 0.28, ex.x + 1.25, ex.y + 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(210,205,185,' + (a * (0.14 + 0.08 * Math.sin(t * 22))).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(ex.x, ex.y + 0.2, 1.25, 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

