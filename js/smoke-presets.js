/* Exhaust collection 2. The two exported recipes use the exact v1 sampler.
 * New looks combine balanced fluid sources with a portable shape renderer.
 * This file owns data and deterministic injection only. No DOM or game state. */
(function (root) {
  'use strict';
  var recipes = [
  {
    "id": "copperhead",
    "name": "Copperhead",
    "family": "Your exports",
    "description": "Dense copper folds roll outward from a narrow gold seam.",
    "colors": [
      "#e49b38",
      "#8f482d"
    ],
    "fluid": {
      "CURL": 24,
      "DENSITY_DISSIPATION": 0.4,
      "VELOCITY_DISSIPATION": 0.4,
      "wind_x": 0,
      "wind_above_y": 0
    },
    "source": {
      "radius": 2.7,
      "density": 1.35,
      "lift": 0.65,
      "sway": 0.65,
      "spread": 2,
      "frequency": 1,
      "pulse": 0,
      "pulseHz": 1,
      "sharpness": 2,
      "split": 0,
      "fan": 0,
      "colorRate": 0,
      "colorOffset": 0.55,
      "core": 0.18,
      "idleHold": 20
    },
    "palette": [
      [
        0.8941176470588236,
        0.6078431372549019,
        0.2196078431372549
      ],
      [
        0.5607843137254902,
        0.2823529411764706,
        0.17647058823529413
      ]
    ],
    "saved": {
      "scale": {
        "id": "tower",
        "values": {
          "rad": 2.6,
          "dye": 0.75,
          "lift": 1.8,
          "curl": 4
        }
      },
      "tuning": {
        "mass": 0.25,
        "motion": 0.65,
        "size": 0.65
      }
    },
    "samplerVersion": 1
  },
  {
    "id": "dragon",
    "name": "Jade dragon",
    "family": "Your exports",
    "description": "Two jade jets lash apart and fold back around a gold center.",
    "colors": [
      "#d4bc38",
      "#179b75"
    ],
    "fluid": {
      "CURL": 32,
      "DENSITY_DISSIPATION": 0.48,
      "VELOCITY_DISSIPATION": 0.08,
      "wind_x": 0,
      "wind_above_y": 0
    },
    "source": {
      "radius": 1.15,
      "density": 1.3,
      "lift": 2.1,
      "sway": 1,
      "spread": 2,
      "frequency": 1.6,
      "pulse": 0,
      "pulseHz": 1,
      "sharpness": 2,
      "split": 8,
      "fan": 20,
      "colorRate": 0,
      "colorOffset": 1,
      "core": 0.28,
      "idleHold": 20
    },
    "palette": [
      [
        0.8313725490196079,
        0.7372549019607844,
        0.2196078431372549
      ],
      [
        0.09019607843137255,
        0.6078431372549019,
        0.4588235294117647
      ]
    ],
    "saved": {
      "scale": {
        "id": "tower",
        "values": {
          "rad": 2.6,
          "dye": 0.75,
          "lift": 1.8,
          "curl": 4
        }
      },
      "tuning": {
        "mass": 0.4,
        "motion": 0.25,
        "size": 0.6
      }
    },
    "samplerVersion": 1
  }
];
  function add(id, name, description, colors, effect, source, fluid) {
    recipes.push({ id: id, name: name, family: 'New experiments', description: description,
      colors: colors, samplerVersion: 2,
      fluid: Object.assign({ CURL: 12, DENSITY_DISSIPATION: 0.65,
        VELOCITY_DISSIPATION: 0.3, wind_x: 0, wind_above_y: 0 }, fluid),
      source: Object.assign({ mode: 'paired', density: 0.09, radius: 0.75,
        lift: 1, idleHold: 18 }, source),
      effect: Object.assign({ rate: 2, life: 3.5, speed: 45, radius: 14,
        spread: 0.3, gravity: -5, trail: 0 }, effect)
    });
  }
  add('smoke-rings', 'Smoke rings', 'Hollow vapor hoops roll out one at a time, widen, then unravel.',
    ['#d4c7ac', '#759db4'], { kind: 'rings', rate: 1.15, life: 4.5, radius: 17, speed: 58 },
    { density: 0.035, mode: 'ring', lift: 1.4 }, { CURL: 5, DENSITY_DISSIPATION: 0.8 });
  add('soap-engine', 'Soap engine', 'Iridescent bubbles carry the exhaust upward, then burst into little clouds.',
    ['#84d9d0', '#d899ca', '#dece8d'], { kind: 'bubbles', rate: 3.2, life: 3.8, radius: 20, speed: 34, spread: 0.55 },
    { density: 0.025 }, { CURL: 8 });
  add('star-forge', 'Star forge', 'A fountain of hot metal sparks cools from white to copper and leaves ash behind.',
    ['#f4dba0', '#e88532', '#a24c39'], { kind: 'sparks', rate: 19, life: 2.5, radius: 2.5, speed: 165, spread: 1, gravity: 92, trail: 14 },
    { density: 0.11, lift: 0.55 }, { CURL: 23 });
  add('silk-engine', 'Silk engine', 'Three translucent vapor ribbons weave through each other and stretch into your wake.',
    ['#85c9c0', '#bb88d4', '#d9b475'], { kind: 'silk', rate: 30, life: 3.4, radius: 8, speed: 74, spread: 0, gravity: 0 },
    { density: 0.016, lift: 1.5 }, { CURL: 3 });
  add('ink-garden', 'Ink garden', 'Branching ink flowers open around the nozzle and drift away, with no repeating sideways sweep.',
    ['#ac83d5', '#5a91c1', '#d591b9'], { kind: 'garden', rate: 0.85, life: 4.8, radius: 34, speed: 19, spread: 0.15 },
    { density: 0.11, mode: 'bloom', lift: 0.3 }, { CURL: 4, DENSITY_DISSIPATION: 0.5 });
  add('lanterns', 'Paper lanterns', 'Warm, translucent ember shells inflate, tumble upward, and fold away.',
    ['#eaa759', '#d1636c'], { kind: 'lanterns', rate: 2.1, life: 4, radius: 21, speed: 36, spread: 0.4, gravity: -9 },
    { density: 0.045, lift: 0.5 }, { CURL: 9 });
  add('pixel-kiln', 'Pixel kiln', 'Chunky square clouds rise, split into smaller tiles, and crumble out of the trail.',
    ['#89bca0', '#d4b787', '#7798bd'], { kind: 'pixels', rate: 4, life: 3.5, radius: 14, speed: 45, spread: 0.5 },
    { density: 0 }, { CURL: 0 });
  add('return-to-sender', 'Return to sender', 'Loose curls escape, turn in midair, and stream back into the moving nozzle.',
    ['#87cccf', '#ab86db'], { kind: 'return', rate: 8, life: 3.8, radius: 9, speed: 52, spread: 0.8, trail: 20 },
    { density: 0.015, lift: 0.2 }, { CURL: 5, DENSITY_DISSIPATION: 1.2 });
  add('storm-cell', 'Pocket storm', 'Small storm clouds grow a web of blue light inside, then dissolve into violet haze.',
    ['#8caad4', '#695982', '#bccfe4'], { kind: 'storm', rate: 1.6, life: 4.5, radius: 34, speed: 33, spread: 0.25 },
    { density: 0.08, lift: 0.5 }, { CURL: 24 });
  add('black-pearls', 'Black pearls', 'Glossy dark droplets arc out of the rig and break into pale smoke when they land.',
    ['#889cab', '#374248', '#c5bdac'], { kind: 'pearls', rate: 3.7, life: 3.5, radius: 13, speed: 105, spread: 0.8, gravity: 74 },
    { density: 0.01, lift: 0.2 }, { CURL: 18 });

  var byId = Object.create(null);
  recipes.forEach(function (recipe) {
    recipe.palette = recipe.colors.map(function (hex) {
      return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255];
    });
    byId[recipe.id] = recipe;
  });
  function colorAt(recipe, phase, amount) {
    var palette = recipe.palette;
    var at = ((phase % palette.length) + palette.length) % palette.length;
    var a = palette[Math.floor(at)], b = palette[(Math.floor(at) + 1) % palette.length];
    var t = at % 1; t = t * t * (3 - 2 * t);
    return { r: (a[0] + (b[0] - a[0]) * t) * amount,
      g: (a[1] + (b[1] - a[1]) * t) * amount,
      b: (a[2] + (b[2] - a[2]) * t) * amount };
  }
  function legacySample(recipe, seconds, phase, tuning, scale, throttle) {
    var s = recipe.source;
    var t = seconds * s.frequency * tuning.motion;
    var beat = Math.pow(0.5 + 0.5 * Math.sin(seconds * s.pulseHz * Math.PI * 2), s.sharpness);
    var envelope = 1 - s.pulse + s.pulse * beat;
    var density = s.density * tuning.mass * scale.dye * throttle * envelope;
    var radius = s.radius * tuning.size * scale.rad;
    var sway = (Math.sin(t * 1.1 + phase) * 6.8 + Math.sin(t * 2.6 + phase * 1.4) * 2.1) * s.sway;
    var slide = Math.sin(t * 1.35 + phase) * s.spread;
    var twist = Math.sin(t * 2.4 + phase);
    var lift = 11.5 * s.lift * tuning.motion * scale.lift * (0.4 + throttle * 0.6);
    var colorPhase = seconds * s.colorRate;
    var split = s.split * tuning.size * twist;
    var fan = s.fan * tuning.motion * (s.split ? twist : Math.sin(t + phase));
    return [
      { x: slide + split, y: 2, vx: sway * 0.42 + fan, vy: lift * 0.7,
        color: colorAt(recipe, colorPhase, 0.8 * (s.split ? Math.max(0.7, s.core) : s.core) * density), radius: (s.split ? 0.019 : 0.011) * radius },
      { x: slide - split, y: 7, vx: sway - fan, vy: lift,
        color: colorAt(recipe, colorPhase + s.colorOffset, 0.8 * density), radius: 0.025 * radius }
    ];
  }
  function sample(recipe, seconds, phase, tuning, scale, throttle) {
    if (recipe.samplerVersion === 1) return legacySample(recipe, seconds, phase, tuning, scale, throttle);
    var s = recipe.source, mode = s.mode;
    if (!s.density) return [];
    var step = Math.round(seconds * 30);
    var count = mode === 'bloom' ? 8 : mode === 'ring' ? 6 : 2;
    if (mode === 'bloom' && step % 45 !== 1) return [];
    if (mode === 'ring' && step % 26 !== 1) return [];
    var packets = [], size = tuning.size * scale.rad;
    var amount = s.density * tuning.mass * scale.dye * throttle;
    // Opposite packets carry equal dye and opposite lateral momentum.
    // There is no oscillator moving the whole nozzle from side to side.
    for (var i = 0; i < count; i++) {
      var angle = i * Math.PI * 2 / count;
      var cx = Math.cos(angle), cy = Math.sin(angle);
      var ring = mode === 'ring' ? 13 : mode === 'bloom' ? 9 : 2;
      packets.push({ x: cx * ring * size, y: 5 + cy * ring * size,
        vx: cx * (mode === 'bloom' ? 17 : 2) * tuning.motion,
        vy: 11.5 * s.lift * tuning.motion * scale.lift + cy * (mode === 'bloom' ? 17 : 2) * tuning.motion,
        color: colorAt(recipe, (Math.floor(seconds * 0.7) + (i % (count / 2))) / 3, amount),
        radius: 0.012 * s.radius * size });
    }
    return packets;
  }
  root.SmokePresets = { version: 2, defaultId: 'copperhead', recipes: recipes, byId: byId, sample: sample };
})(typeof window !== 'undefined' ? window : globalThis);
