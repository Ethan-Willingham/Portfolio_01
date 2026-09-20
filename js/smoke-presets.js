/* Portable exhaust recipes. No DOM, game state, randomness, or solver ownership.
 * sample() returns two source-local splats at a fixed 30 Hz. x/vx are lateral;
 * y/vy point out of the nozzle. The host rotates them into its smoke field.
 * Colors are dye concentrations, not display RGB. See docs/SMOKE_PRESETS.md. */
(function (root) {
  'use strict';
  var recipes = [];
  function add(id, name, family, description, colors, fluid, source) {
    recipes.push({ id: id, name: name, family: family, description: description,
      colors: colors,
      fluid: Object.assign({ CURL: 14, DENSITY_DISSIPATION: 0.24,
        VELOCITY_DISSIPATION: 0.08, wind_x: 0, wind_above_y: 0 }, fluid),
      source: Object.assign({ radius: 1, density: 1, lift: 1, sway: 1,
        spread: 2, frequency: 1, pulse: 0, pulseHz: 1, sharpness: 2,
        split: 0, fan: 0, colorRate: 0, colorOffset: 0.55, core: 0.28,
        idleHold: 20 }, source)
    });
  }
  // The original six remain available alongside the new collection.
  add('default', 'Workshop', 'Originals', 'A warm, steady exhaust with soft rolling edges.',
    ['#9e9485', '#b0a698'], {}, {});
  add('ember', 'Ember', 'Originals', 'Orange embers tumble through a restless red plume.',
    ['#ed6618', '#a82008'], { CURL: 34, DENSITY_DISSIPATION: 0.3 }, { lift: 1.4, colorRate: 0.3 });
  add('ink', 'Ink', 'Originals', 'Indigo blooms stay close to where you release them.',
    ['#24386e', '#5264b8'], { CURL: 3, DENSITY_DISSIPATION: 0.06, VELOCITY_DISSIPATION: 1.3 },
    { lift: 0.05, radius: 1.8, density: 0.12, idleHold: 45, sway: 0.3 });
  add('aurora', 'Aurora', 'Originals', 'Long green, teal, and violet ribbons drift sideways.',
    ['#24b47c', '#287bce', '#a54ccc'], { CURL: 8, DENSITY_DISSIPATION: 0.16, wind_x: 0.008 },
    { colorRate: 0.2, radius: 0.85, sway: 1.2, lift: 1.3 });
  add('fog', 'Dry ice', 'Originals', 'Pale vapor spills downward and gathers along ledges.',
    ['#8d9e8d', '#b4c4ae'], { CURL: 4, DENSITY_DISSIPATION: 0.18, VELOCITY_DISSIPATION: 0.6 },
    { lift: -0.5, radius: 2, sway: 0.3, density: 0.26 });
  add('storm', 'Thunderhead', 'Originals', 'Violet clouds pulse with pale blue centers.',
    ['#504875', '#a2bfea'], { CURL: 38, DENSITY_DISSIPATION: 0.7 },
    { radius: 1.7, density: 1.4, pulse: 0.75, pulseHz: 0.45, sharpness: 7 });

  add('locomotive', 'Locomotive', 'Foundry', 'Regular ivory chuffs expand into broad, copper-gray clouds.',
    ['#c4bdac', '#786251'], { CURL: 18, DENSITY_DISSIPATION: 0.32, VELOCITY_DISSIPATION: 0.3 },
    { radius: 2.2, density: 1.2, lift: 1.4, pulse: 0.96, pulseHz: 1.1, sharpness: 5, sway: 0.4 });
  add('copperhead', 'Copperhead', 'Foundry', 'Dense copper folds roll outward from a narrow gold seam.',
    ['#e49b38', '#8f482d'], { CURL: 24, DENSITY_DISSIPATION: 0.4, VELOCITY_DISSIPATION: 0.4 },
    { radius: 2.7, lift: 0.65, density: 1.35, sway: 0.65, core: 0.18 });
  add('afterburner', 'Afterburner', 'Foundry', 'A tight blue jet with a bright ice-colored core and a short wake.',
    ['#8bd9ef', '#2358c2'], { CURL: 5, DENSITY_DISSIPATION: 1.15, VELOCITY_DISSIPATION: 0.06 },
    { radius: 0.62, lift: 4.5, density: 1.45, sway: 0.12, spread: 0.3, core: 0.5 });
  add('coalroller', 'Coal roller', 'Foundry', 'Heavy bronze-gray exhaust lurches out in uneven, low billows.',
    ['#766856', '#494958'], { CURL: 12, DENSITY_DISSIPATION: 0.24, VELOCITY_DISSIPATION: 0.7 },
    { radius: 3.3, density: 0.6, lift: 0.32, pulse: 0.65, pulseHz: 1.7, sway: 0.5, frequency: 0.6 });

  add('opal', 'Opal', 'Prismatic', 'Slow pearl folds trade rose, mint, and lavender highlights.',
    ['#9bccb9', '#c091b1', '#858ed4'], { CURL: 10, DENSITY_DISSIPATION: 0.23, VELOCITY_DISSIPATION: 0.3 },
    { radius: 2.1, density: 0.65, lift: 0.7, colorRate: 0.16, sway: 0.7 });
  add('oil-slick', 'Oil slick', 'Prismatic', 'Teal and magenta strands braid around each other.',
    ['#11baad', '#b12bc0'], { CURL: 18, DENSITY_DISSIPATION: 0.3 },
    { radius: 0.85, split: 10, fan: 9, frequency: 2.7, lift: 1.6, colorRate: 0.08, colorOffset: 1 });
  add('prism', 'Prism', 'Prismatic', 'A continuous ribbon cycles through coral, gold, green, blue, and violet.',
    ['#dc4861', '#dca12f', '#43b85d', '#248bcf', '#9c4ed4'], { CURL: 7, DENSITY_DISSIPATION: 0.36 },
    { radius: 0.9, lift: 2.1, sway: 1.8, colorRate: 0.85, colorOffset: 0.15, frequency: 0.8 });
  add('gilded', 'Gilded', 'Prismatic', 'A fine gold stream unwinds inside a larger purple cloud.',
    ['#e8b442', '#633f95'], { CURL: 16, DENSITY_DISSIPATION: 0.32, VELOCITY_DISSIPATION: 0.18 },
    { radius: 2.4, lift: 1.05, core: 0.65, density: 0.9, sway: 0.55, colorOffset: 1 });

  add('spore', 'Spore cloud', 'Living', 'Slow sage puffs open sideways like small mushroom caps.',
    ['#b8c34c', '#4c9664'], { CURL: 9, DENSITY_DISSIPATION: 0.34, VELOCITY_DISSIPATION: 0.65 },
    { radius: 2.6, split: 8, fan: 15, lift: 0.5, pulse: 0.93, pulseHz: 0.65, sharpness: 5, sway: 0.25 });
  add('dragon', 'Jade dragon', 'Living', 'Two jade jets lash apart and fold back around a gold center.',
    ['#d4bc38', '#179b75'], { CURL: 32, DENSITY_DISSIPATION: 0.48 },
    { radius: 1.15, split: 8, fan: 20, lift: 2.1, frequency: 1.6, density: 1.3, colorOffset: 1 });
  add('jellyfish', 'Jellyfish', 'Living', 'Soft violet bells swell between fine cyan tendrils.',
    ['#56b7c8', '#a661bd'], { CURL: 6, DENSITY_DISSIPATION: 0.28, VELOCITY_DISSIPATION: 0.4 },
    { radius: 2.5, pulse: 0.9, pulseHz: 0.55, sharpness: 3, lift: 0.8, fan: 12, split: 5, sway: 0.35 });
  add('fireflies', 'Fireflies', 'Living', 'Small gold-green packets flick away from the nozzle and fade quickly.',
    ['#e8bb36', '#5cad40'], { CURL: 4, DENSITY_DISSIPATION: 1.5, VELOCITY_DISSIPATION: 0.8 },
    { radius: 0.3, pulse: 1, pulseHz: 3.3, sharpness: 7, spread: 15, fan: 25, lift: 1.6, density: 2.2, frequency: 4 });

  add('nebula', 'Nebula', 'Cosmic', 'Broad violet clouds carry slow blue and rose eddies.',
    ['#8641c4', '#287fb8', '#b64284'], { CURL: 26, DENSITY_DISSIPATION: 0.26, VELOCITY_DISSIPATION: 0.2 },
    { radius: 3.1, density: 0.85, lift: 0.65, sway: 1.1, colorRate: 0.25, colorOffset: 1.2 });
  add('solar', 'Solar flare', 'Cosmic', 'Hot orange curls peel off a narrow yellow jet.',
    ['#efb32c', '#d02d14'], { CURL: 44, DENSITY_DISSIPATION: 0.8, VELOCITY_DISSIPATION: 0.05 },
    { radius: 1.45, lift: 2.6, sway: 1.8, frequency: 2.2, core: 0.55, density: 1.1 });
  add('comet', 'Comet', 'Cosmic', 'A clean cyan streamer leaves a long, thin blue tail.',
    ['#86d8da', '#316aba'], { CURL: 3, DENSITY_DISSIPATION: 0.25, VELOCITY_DISSIPATION: 0.04 },
    { radius: 0.48, lift: 3.2, sway: 0.1, spread: 0.25, density: 0.85, core: 0.6 });
  add('eclipse', 'Eclipse', 'Cosmic', 'Amber crescents roll out inside a wide indigo shroud.',
    ['#d6852c', '#3d327e'], { CURL: 20, DENSITY_DISSIPATION: 0.36, VELOCITY_DISSIPATION: 0.28 },
    { radius: 2.8, pulse: 0.7, pulseHz: 0.4, split: 4, fan: 6, lift: 0.7, density: 1.25, colorOffset: 1 });

  add('ectoplasm', 'Ectoplasm', 'Arcane', 'Acid-green wisps writhe out of a pale mint core.',
    ['#91d998', '#36a32a'], { CURL: 42, DENSITY_DISSIPATION: 0.54, VELOCITY_DISSIPATION: 0.05 },
    { radius: 1.1, lift: 1.35, sway: 2.5, frequency: 1.9, core: 0.25 });
  add('witchfire', 'Witchfire', 'Arcane', 'Violet and green flames trade places in sharp, restless spurts.',
    ['#a636dc', '#70cf35'], { CURL: 35, DENSITY_DISSIPATION: 0.7 },
    { radius: 0.95, pulse: 0.7, pulseHz: 2.2, lift: 2, split: 5, fan: 10, colorRate: 0.7, colorOffset: 1 });
  add('void', 'Void bloom', 'Arcane', 'Deep blue-violet ink opens outward and barely rises.',
    ['#5340aa', '#2c4989'], { CURL: 22, DENSITY_DISSIPATION: 0.15, VELOCITY_DISSIPATION: 0.9 },
    { radius: 3.8, density: 0.22, lift: 0.12, split: 8, fan: 10, sway: 0.2, pulse: 0.5, pulseHz: 0.3, idleHold: 35 });
  add('phoenix', 'Phoenix', 'Arcane', 'Red and gold wings flare outward with each slow breath.',
    ['#eaac2e', '#ce344e'], { CURL: 30, DENSITY_DISSIPATION: 0.55 },
    { radius: 1.8, split: 13, fan: 30, pulse: 0.85, pulseHz: 0.72, sharpness: 3, lift: 1.7, colorOffset: 1 });

  add('candyfloss', 'Candyfloss', 'Strange', 'Loose pink and blue clouds pile into soft, slow folds.',
    ['#d079ad', '#699dcc'], { CURL: 8, DENSITY_DISSIPATION: 0.3, VELOCITY_DISSIPATION: 0.55 },
    { radius: 3, density: 0.42, lift: 0.55, sway: 0.65, colorRate: 0.26, colorOffset: 1 });
  add('bubblegum', 'Bubblegum', 'Strange', 'Round raspberry puffs march out in a bouncy, repeating rhythm.',
    ['#e070a3', '#a92770'], { CURL: 5, DENSITY_DISSIPATION: 0.55, VELOCITY_DISSIPATION: 0.3 },
    { radius: 1.9, pulse: 1, pulseHz: 1.5, sharpness: 6, lift: 1.8, sway: 0.2, density: 1.3 });
  add('inkblossom', 'Ink blossom', 'Strange', 'Magenta and blue petals slowly spread into a floating ink flower.',
    ['#b33c93', '#3952b7'], { CURL: 2, DENSITY_DISSIPATION: 0.12, VELOCITY_DISSIPATION: 1.1 },
    { radius: 2.2, density: 0.3, lift: 0, split: 12, fan: 16, frequency: 0.65, pulse: 0.8, pulseHz: 0.4, colorRate: 0.2, idleHold: 40 });
  add('cryo', 'Cryovent', 'Strange', 'Cold cyan vapor jets downward in short bursts and spreads across the floor.',
    ['#a3d3d7', '#3c86b4'], { CURL: 9, DENSITY_DISSIPATION: 0.42, VELOCITY_DISSIPATION: 0.4 },
    { radius: 1.7, lift: -1.6, density: 0.9, sway: 0.7, pulse: 0.75, pulseHz: 0.9 });

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
  function sample(recipe, seconds, phase, tuning, scale, throttle) {
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
  root.SmokePresets = { version: 1, recipes: recipes, byId: byId, sample: sample };
})(typeof window !== 'undefined' ? window : globalThis);
