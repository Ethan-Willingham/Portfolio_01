/* Exhaust collection 3. The two exported recipes use the exact v1 sampler.
 * New looks change fluid forces and heat transport in the shared smoke solver.
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
  function add(id, name, description, colors, physics, source, fluid) {
    recipes.push({ id: id, name: name, family: 'Fluid experiments', description: description,
      colors: colors, samplerVersion: 3, physics: Object.assign({
        HEAT: 0, COOLING: 1, BUOYANCY: 0, WEIGHT: 0, VISCOSITY: 0, EDGE_SPIN: 0
      }, physics),
      fluid: Object.assign({ OPTICAL_DENSITY: 1, CURL: 14, DENSITY_DISSIPATION: 0.3,
        VELOCITY_DISSIPATION: 0.12, wind_x: 0, wind_above_y: 0 }, fluid),
      source: Object.assign({ mode: 'jet', density: 0.27, radius: 3.2, width: 5,
        lift: 1.1, fan: 0, pulse: 0, period: 2.6, duty: 0.32, colorRate: 0,
        idleHold: 24 }, source)
    });
  }
  add('cauldron', 'Cauldron', 'Hot copper climbs through violet smoke. Cooling folds its heavy crown back into the rising plume.',
    ['#e9a15a', '#9c77bf'],
    { HEAT: 2.5, COOLING: 1.4, BUOYANCY: 100, WEIGHT: 90, VISCOSITY: 3 },
    { radius: 4, density: 0.18, lift: 0.18, width: 7 }, { CURL: 21, DENSITY_DISSIPATION: 0.23 });
  add('dry-ice', 'Dry ice', 'Dense blue vapor spills down around the rig, pools on ledges, and rolls over their edges.',
    ['#accdd9', '#698fa8'],
    { WEIGHT: 165, VISCOSITY: 12 },
    { mode: 'sheet', radius: 2.7, density: 0.07, width: 13, lift: 0.1, fan: 15 },
    { CURL: 9, DENSITY_DISSIPATION: 0.25, VELOCITY_DISSIPATION: 0.25 });
  add('velvet-rope', 'Velvet rope', 'A slow, thick crimson plume stretches into smooth folds. Strong internal friction keeps the flow together.',
    ['#b51238', '#6e0927'],
    { HEAT: 1.3, COOLING: 0.22, BUOYANCY: 40, WEIGHT: 18, VISCOSITY: 28 },
    { density: 0.2, radius: 2.7, lift: 0.4, width: 2 },
    { CURL: 2, VELOCITY_DISSIPATION: 0.45, DENSITY_DISSIPATION: 0.2,
      OPTICAL_BRIGHTNESS: 0.64, OPTICAL_ABSORPTION: 3.2 });
  add('vortex-cannon', 'Vortex cannon', 'Each short pressure pulse rolls its edges backward into a drifting mushroom. The next pulse pushes through its wake.',
    ['#d4c5a5', '#849ba6'],
    { HEAT: 1.4, COOLING: 0.3, BUOYANCY: 20, VISCOSITY: 2 },
    { pulse: 1, period: 2.8, duty: 0.28, density: 0.55, radius: 2.5, width: 5, lift: 2.7, fan: 3 },
    { CURL: 5, DENSITY_DISSIPATION: 0.24, VELOCITY_DISSIPATION: 0.05 });
  add('countercurrent', 'Countercurrent', 'A pale central jet tears through slower teal edges. Opposing streams curl into a ragged, interlocking wake.',
    ['#acd7cb', '#638cbd'],
    { HEAT: 1.6, COOLING: 0.35, BUOYANCY: 50, WEIGHT: 25, VISCOSITY: 1 },
    { mode: 'shear', density: 0.16, radius: 2.2, width: 15, lift: 1.3 },
    { CURL: 26, DENSITY_DISSIPATION: 0.3 });
  add('witchfire', 'Witchfire', 'Thin green smoke accelerates as it rises, pulling into sharp tongues and shedding restless green wisps.',
    ['#b4e869', '#52bca3'],
    { HEAT: 4, COOLING: 1.15, BUOYANCY: 240, WEIGHT: 3, VISCOSITY: 0.5 },
    { density: 0.15, radius: 2.5, width: 3, lift: 0.5, colorRate: 0.12 },
    { CURL: 34, DENSITY_DISSIPATION: 0.52, VELOCITY_DISSIPATION: 0.07 });
  add('spiral-kiln', 'Spiral kiln', 'The smoke stirs along its own edges, winding gold and red layers into living coils. Reverse Edge spin to reverse the twist.',
    ['#e3ae61', '#b36176'],
    { HEAT: 2, COOLING: 0.45, BUOYANCY: 65, WEIGHT: 28, EDGE_SPIN: 230, VISCOSITY: 4 },
    { density: 0.17, radius: 3.8, width: 10, lift: 0.25 },
    { CURL: 8, DENSITY_DISSIPATION: 0.24 });
  add('falling-bloom', 'Falling bloom', 'A hot ink burst rises, cools, then opens downward into heavy blue lobes. Each bloom meets the remains of the last.',
    ['#859fcf', '#bd8fc3'],
    { HEAT: 3.8, COOLING: 2.2, BUOYANCY: 180, WEIGHT: 165, VISCOSITY: 5 },
    { pulse: 1, period: 3.6, duty: 0.3, density: 0.36, radius: 4.2, width: 7, lift: 1.3, fan: 5 },
    { CURL: 17, DENSITY_DISSIPATION: 0.2, VELOCITY_DISSIPATION: 0.18 });

  add('prismatic', 'Prismatic', 'A full spectrum flows through the plume. Fresh color rolls into older bands as the smoke curls and cools.',
    ['#e43d54', '#f39235', '#e6d84b', '#5bcc72', '#45ccd6', '#527be8', '#b261db'],
    { HEAT: 1.8, COOLING: 0.45, BUOYANCY: 70, WEIGHT: 18, VISCOSITY: 9, EDGE_SPIN: 40 },
    { density: 0.2, radius: 3.1, width: 3, lift: 0.55, colorRate: 1.15 },
    { CURL: 10, DENSITY_DISSIPATION: 0.23, VELOCITY_DISSIPATION: 0.22, OPTICAL_ABSORPTION: 2.4 });

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
    var s = recipe.source;
    var cycle = ((seconds / s.period) % 1 + 1) % 1;
    var pulse = cycle < s.duty ? Math.pow(Math.sin(Math.PI * cycle / s.duty), 2) : 0;
    var envelope = 1 - s.pulse + s.pulse * pulse;
    if (envelope < 0.002) return [];
    var size = tuning.size * scale.rad;
    var amount = s.density * tuning.mass * scale.dye * throttle * envelope;
    var lift = 11.5 * s.lift * tuning.motion * scale.lift * (0.4 + throttle * 0.6) * envelope;
    var width = s.width * size;
    var packets = [], count = s.mode === 'sheet' ? 4 : s.mode === 'shear' ? 3 : 2;
    // All lateral impulses are balanced. Motion comes from pressure, shear,
    // cooling and buoyancy in the live field, not a swaying source position.
    for (var i = 0; i < count; i++) {
      var side = count === 2 ? (i ? 1 : -1) : (i / (count - 1) * 2 - 1);
      var center = s.mode === 'shear' && i === 1;
      packets.push({ x: side * width, y: 5,
        vx: side * s.fan * tuning.motion * envelope,
        vy: s.mode === 'shear' ? lift * (center ? 1.8 : -0.35) : lift,
        color: colorAt(recipe, (s.mode === 'shear' ? (center ? 0 : 1) : i % 2) + seconds * s.colorRate, amount * (center ? 1.3 : 1)),
        radius: 0.025 * s.radius * size });
    }
    return packets;
  }
  root.SmokePresets = { version: 3, defaultId: 'copperhead', recipes: recipes, byId: byId, sample: sample };
})(typeof window !== 'undefined' ? window : globalThis);
