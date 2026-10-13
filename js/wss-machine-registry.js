/* Small scene catalog. Unaccepted machines are available only with ?lab=1. */
(function () {
  'use strict';
  var entries = [
  {
    "id": "material-oil-jar",
    "capability": "Oil and water",
    "title": "Oil and water",
    "cue": "Stir once. Watch the pale oil rise.",
    "preview": "cup",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "float-slider-cistern",
    "capability": "Valves and logic",
    "title": "Float-controlled inlet",
    "cue": "Pull the float down to reopen the water inlet.",
    "preview": "cup",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true
  },
  {
    "id": "singing-pipe",
    "capability": "Sound",
    "title": "Hero's sliding pipe (precursor)",
    "cue": "Turn on sound. Drag the pipe to bend the note.",
    "preview": "sliding-pipe",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "air-hose",
    "capability": "Bubbles",
    "title": "Air hose",
    "cue": "Stop the air. Watch the last bubbles rise.",
    "preview": "straw",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "cartesian-divers",
    "capability": "Water slimes",
    "title": "Three Cartesian divers",
    "cue": "Squeeze the jar. Watch the gas shrink.",
    "preview": "divers",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "kettle",
    "capability": "Steam",
    "title": "Whistling kettle",
    "cue": "Heat water. Cool its vapor back to water.",
    "preview": "kettle",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "water-balloons",
    "capability": "Water slimes",
    "title": "Water balloons",
    "cue": "Drag, fling, then pop the skin.",
    "preview": "water-balloon",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "thermoscope",
    "capability": "Fire",
    "title": "Galileo's thermoscope",
    "cue": "Warm the bulb. Watch the water fall.",
    "preview": "thermoscope",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "douse-fire",
    "capability": "Fire",
    "title": "Put out the fire",
    "cue": "Pour water onto the glowing plume.",
    "preview": "fire",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "self-flushing-cup",
    "title": "Self-flushing cup",
    "cue": "Open or close the tap.",
    "preview": "cup",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true
  },
  {
    "id": "tantalus",
    "title": "Tantalus",
    "cue": "Watch the fixed mouth line.",
    "preview": "tantalus",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true
  },
  {
    "id": "roman-inverted-siphon",
    "title": "Roman inverted siphon",
    "cue": "Close or open the intake.",
    "preview": "inverted-siphon",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "thumb-straw",
    "title": "The straw and the thumb",
    "cue": "Hold the top, then release.",
    "preview": "straw",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "smoke-ring-cannon",
    "capability": "Smoke",
    "title": "The smoke-ring cannon",
    "cue": "Tap the back. Catch the swirl with a slime.",
    "preview": "smoke-cannon",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "smoke-wind-tunnel",
    "capability": "Smoke",
    "title": "The slime wind tunnel",
    "cue": "Stop the fan. Watch the wake change.",
    "preview": "smoke-tunnel",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "burst-disk",
    "title": "The burst disk",
    "cue": "Compare two membrane strengths.",
    "preview": "burst-disk",
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false
  },
  {
    "id": "water-balloon-fight",
    "capability": "Water slimes",
    "title": "Water-balloon fight",
    "cue": "Throw the filled balloon at a slime. A hard impact bursts its skin and releases the same water.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-body-machines"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs water-balloon-fight",
      "key": "Throw the filled balloon at a slime. A hard impact bursts its skin and releases the same water.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "squid-jet",
    "capability": "Water slimes",
    "title": "Squid jet",
    "cue": "Start contractions. Water escaping the real mouth pushes the free elastic skin.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-body-machines"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs squid-jet",
      "key": "Start contractions. Water escaping the real mouth pushes the free elastic skin.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "material-sand-jar",
    "capability": "Sand",
    "title": "Settling and sorting jar",
    "cue": "Stir equal-size quartz and gold through water. Gold settles faster; matching their densities removes the separation.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials"
    ]
  },
  {
    "id": "hourglass",
    "capability": "Sand",
    "title": "Hourglass",
    "cue": "Grab the glass. Swing and release to flip it and time the falling grains.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-hourglass"
    ],
    "behaviorPlan": {
      "test": "node tools/test-hourglass.mjs",
      "key": "Grab the glass. Swing and release to flip it and time the falling grains.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "aquarium-bubbler",
    "capability": "Bubbles",
    "title": "Aquarium bubbler",
    "cue": "Stop the air and watch the last gas reach the surface.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-bubbles"
    ],
    "behaviorPlan": {
      "seconds": 10,
      "action": "Compare the actual compressor on and off, then stop it.",
      "key": "Real gas births and native surface exits on three seeds, with zero gas and water loss. Air-off gives no births; the actual switch stops admission and remaining gas exits.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "air-lift-pump",
    "capability": "Bubbles",
    "title": "Air-lift pump",
    "cue": "Rising gas carries water above the source and into the receiving cup.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-bubbles"
    ],
    "behaviorPlan": {
      "seconds": 10,
      "action": "Compare the actual compressor on and off, then stop it.",
      "key": "Real gas lifts more than 800 conserved native water parcels into the receiver on three seeds; air-off transfers zero. The actual switch stops admission and remaining gas exits.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "candle-in-jar",
    "capability": "Fire",
    "title": "Candle in a jar",
    "cue": "Keep the lid closed and the candle uses up its air. Lift it while the flame is still burning to let fresh air in.",
    "status": "WORKS",
    "blocker": "",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "fire",
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-fire"
    ],
    "behaviorPlan": {
      "seconds": 30,
      "actionAtSeconds": 2,
      "action": "machinePrimary lifts the physical lid",
      "key": "Opening the lid supplies fresh air; a sealed control consumes oxygen and stays out after extinction until reset.",
      "probes": [
        "jar",
        "above-lid"
      ],
      "statusIfObserved": "PARTLY"
    },
    "scripts": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-fire"
    ]
  },
  {
    "id": "chimney-draw",
    "capability": "Fire",
    "title": "Chimney draft",
    "cue": "Close the inlet and watch oxygen delivery change. Reopen it while the fuel is hot.",
    "status": "WORKS",
    "blocker": "",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "fire",
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-fire"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 3,
      "action": "machinePrimary closes the physical inlet",
      "key": "Hot smoke rises in the flue and inlet flow changes with the real wall closure.",
      "probes": [
        "inlet",
        "flue"
      ],
      "statusIfObserved": "WORKS"
    },
    "scripts": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-fire"
    ]
  },
  {
    "id": "slime-sauna",
    "capability": "Fire",
    "title": "Slime sauna",
    "cue": "Pour onto the stones to make steam. Watch the slime warm up; let the room cool between pours.",
    "status": "WORKS",
    "blocker": "Vented room mixing and guest comfort use an approximate thermal model.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "fire",
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-fire",
      "wss-sauna"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 1,
      "action": "machinePrimary queues the declared 700-parcel water pour",
      "key": "Native water evaporates on the stones, a white plume rises, and the guest warms and reacts.",
      "probes": [
        "warm-room"
      ],
      "statusIfObserved": "WORKS"
    },
    "scripts": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-fire",
      "wss-sauna"
    ]
  },
  {
    "id": "heron-air-smoke",
    "capability": "Smoke",
    "title": "The air in Heron's fountain",
    "cue": "Water draining into the receiving chamber compresses its air. The air link pushes the fountain chamber. Haze tracks that transferred gas.",
    "status": "WORKS",
    "blocker": "",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "smoke-cannon",
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-pressure-labs"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 1,
      "action": "machinePrimary pours 240 real native water parcels into the upper basin",
      "key": "Native water changes and passive smoke in the actual air-link/headspace advects; smoke is not native compressible gas.",
      "probes": [
        "air-link-0",
        "air-link-1",
        "air-link-2",
        "air-link-3"
      ],
      "statusIfObserved": "PARTLY"
    },
    "scripts": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "sewer-gas-trap",
    "capability": "Smoke",
    "title": "Sewer gas trap",
    "cue": "The water-filled bend resists gas pressure. Dry it to pass smoke, or raise pressure enough to displace the seal.",
    "status": "WORKS",
    "blocker": "",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "smoke-cannon",
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-pressure-labs"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 3,
      "action": "machinePrimary rebuilds a fresh dry control; it is not a running drain",
      "key": "Compare outlet dye on wet vs dry U trap with the same declared fan.",
      "probes": [
        "sewer",
        "room-outlet"
      ],
      "statusIfObserved": "PARTLY"
    },
    "scripts": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-fire-smoke",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "thirsty-slime",
    "capability": "Water slimes",
    "title": "Thirsty slime",
    "cue": "Let it drink. Drag either gold handle inward to make water erupt.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "blocker": "Toy contact absorption and elastic swelling; no calibrated hydrogel model.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-thirsty-slime",
      "wss-slime-press"
    ]
  },
  {
    "id": "floating-block",
    "capability": "Floating things",
    "title": "Floating block",
    "cue": "Push or drop the light block into water. Compare the dense block, which sinks.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "blocker": "",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-floating-block"
    ]
  },
  {
    "id": "lorenz-wheel",
    "capability": "Floating things",
    "title": "Leaky-cup waterwheel",
    "cue": "Water loads the hanging cups and turns the unpowered wheel. Stop the water and let the load drain away.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "blocker": "",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-lorenz-wheel"
    ]
  },
  {
    "id": "shishi-odoshi",
    "capability": "Floating things",
    "title": "Shishi-odoshi",
    "cue": "Water fills the bamboo trough until it tips, empties and swings back.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-body-machines"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs shishi-odoshi",
      "key": "Water fills the bamboo trough until it tips, empties and swings back.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "lift-lock",
    "capability": "Floating things",
    "title": "Peterborough lift lock",
    "cue": "Water added to one caisson lowers it and lifts the other through their common hydraulic link.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-body-machines"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs lift-lock",
      "key": "Water added to one caisson lowers it and lifts the other through their common hydraulic link.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "ballast-railway",
    "capability": "Floating things",
    "title": "Water-ballast cliff railway",
    "cue": "Fill the upper car. Its water ballast pulls the linked car uphill; open the drains to unload.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-body-machines"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs ballast-railway",
      "key": "Fill the upper car. Its water ballast pulls the linked car uphill; open the drains to unload.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "vacuum-coffee",
    "capability": "Steam",
    "title": "Vacuum coffee maker",
    "cue": "Heat lifts the finite water into the bowl. Cooling and condensation pull it back.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "steam-geyser",
    "capability": "Steam",
    "title": "Steam geyser",
    "cue": "Heat, blowdown and cold recharge make repeated pressure-driven eruptions.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "hero-temple-doors",
    "capability": "Steam",
    "title": "Hero's temple doors",
    "cue": "Heated gas moves a water counterweight that opens the doors. Cooling closes them.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "water-half-adder",
    "capability": "Valves and logic",
    "title": "Water half adder",
    "cue": "One open input feeds SUM. Two raise a float that switches the flow to CARRY.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "slime-heart",
    "capability": "Valves and logic",
    "title": "Slime heart",
    "cue": "Hold to squeeze an elastic chamber. Two check valves turn the stroke into pumped water.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "hellbrunn-fountains",
    "capability": "Valves and logic",
    "title": "Hellbrunn trick fountains",
    "cue": "A real powered jet sprays the guests. Seating a guest can trigger its pump.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "singing-birds-owl",
    "capability": "Sound",
    "title": "Singing birds and owl",
    "cue": "A float cycles the air chest, three whistles sound, and the weighted owl turns.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "water-organ",
    "capability": "Sound",
    "title": "Water organ",
    "cue": "Play several pressure-driven pipe voices from a water-loaded air chest.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "hydraulophone",
    "capability": "Sound",
    "title": "Hydraulophone",
    "cue": "Open four finger passages to play a reduced air-pipe analogue of a hydraulophone.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-workshop-models",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "ringing-bubbles",
    "capability": "Sound",
    "title": "Ringing bubbles",
    "cue": "Hear damped tones whose frequency follows the radius of actual native bubbles.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-bubbles",
      "wss-machines/air-hose",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "blowhole",
    "capability": "Waves",
    "title": "Blowhole",
    "cue": "Native paddle waves force water through a sea cave and out its roof spout.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-wave-maker",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "sloshing-resonance",
    "capability": "Waves",
    "title": "Sloshing resonance",
    "cue": "Change or sweep the paddle period and compare measured surface motion.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-wave-maker",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "tsunami-runup",
    "capability": "Waves",
    "title": "Tsunami run-up",
    "cue": "Launch one paddle cycle and measure how far its native wave climbs the beach.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-wave-maker",
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "world-knobs",
    "capability": "World",
    "title": "Box-size and gravity knobs",
    "cue": "Try the same siphon at 30 inches, 30 feet and 300 feet. Compare Earth and Moon gravity.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-drafts-workshop",
      "wss-world-knobs"
    ],
    "blocker": ""
  },
  {
    "id": "perpetual-motion",
    "capability": "World",
    "title": "Perpetual-motion hall of shame",
    "cue": "A finite raised supply drains and loses energy. The return tube cannot lift it back.",
    "preview": "cup",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-drafts-workshop",
      "wss-workshop-runtime"
    ]
  },
  {
    "id": "glass-toilet",
    "capability": "Valves and logic",
    "title": "Glass toilet",
    "cue": "Flush a finite cistern through a priming trap, siphon, buoyant flapper and automatic refill.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-workshop-models",
      "wss-machines/glass-toilet",
      "wss-workshop-runtime"
    ],
    "preview": "cup"
  },
  {
    "id": "sand-dam",
    "capability": "Sand",
    "title": "Sand dam",
    "cue": "Hold the tap. Native water washes sand downstream while the dry bank stays put.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 560,
      "h": 280
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-sand-dam"
    ],
    "behaviorPlan": {
      "test": "node tools/test-sand-dam.mjs",
      "key": "Hold the tap. Native water washes sand downstream while the dry bank stays put.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "gold-sluice-box",
    "capability": "Sand",
    "title": "Gold sluice box",
    "cue": "Wash classified paydirt through a 51-inch hand sluice.",
    "accepted": true,
    "world": {
      "w": 1440,
      "h": 584
    },
    "pool": false,
    "preview": "cup"
  },
  {
    "id": "hero-jug",
    "capability": "Oil and water",
    "title": "Hero's wine-or-water jug",
    "cue": "Uncover one air vent to serve that chamber through the shared spout. Cover both to stop the sustained pour.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "interlayer-slime",
    "capability": "Oil and water",
    "title": "Slime between oil and water",
    "cue": "The slime is denser than oil and lighter than water. Drag it away from the interface and release; change its density to compare.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "melting-ice",
    "capability": "Ice",
    "title": "Floating ice that melts",
    "cue": "Drag the floating ice through the heated bath. The same frozen native parcels melt into water.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-drafts-bodies",
      "wss-thermal-machines"
    ]
  },
  {
    "id": "frozen-pipe",
    "capability": "Ice",
    "title": "Frozen pipe",
    "cue": "Cooling expands ice against a breakable pipe wall. Try the stronger-wall control.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-drafts-bodies",
      "wss-thermal-machines"
    ]
  },
  {
    "id": "oil-slick-fire",
    "capability": "Oil and water",
    "title": "Burning oil slick",
    "cue": "The finite oil slick supplies the flame. Oxygen consumption spends that oil. Added water removes heat from the burning layer.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-fire",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "soda-mentos",
    "capability": "Bubbles",
    "title": "Soda and Mentos",
    "cue": "Open the cap over carbonated water. The rough tablet releases dissolved gas faster; pressure and expanding foam drive the outlet.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-materials",
      "wss-drafts-fizz",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "glugging-bottle",
    "capability": "Bubbles",
    "title": "Glugging bottle",
    "cue": "Open the mouth. Falling water lowers bottle pressure; air can enter through the same mouth. Compare with the top vent open.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Native water exits the neck; compare sealed headspace with real side vent open.",
      "action": "Use machinePrimary once after a short native observation; Pascal primary is a real water pour, skip it for the closed inventory first trial.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "boyle-j-tube",
    "capability": "Valves and logic",
    "title": "Boyle's J-tube",
    "cue": "The tall column compresses the trapped air. Vent it to remove the pressure that holds the levels apart.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Native trapped gas amount stays fixed while water levels and actual pressure change; opening the side vent relieves the load.",
      "action": "Use machinePrimary once after a short native observation; Pascal primary is a real water pour, skip it for the closed inventory first trial.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "water-tower",
    "capability": "Valves and logic",
    "title": "Water tower",
    "cue": "Close any tap. The lower outlets have more pressure head and a faster jet while the header still holds water.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Three real valve parts at different elevations; native jets respond to closing a tap.",
      "action": "Use machinePrimary once after a short native observation; Pascal primary is a real water pour, skip it for the closed inventory first trial.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "pascal-barrel",
    "capability": "Valves and logic",
    "title": "Pascal's barrel",
    "cue": "The narrow column loads the barrel. The panel opens when pressure exceeds its strength. Add water to raise the head.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-burst-disk",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-burst-disk",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Actual differential pressure opens the irreversible panel at the barrel wall.",
      "action": "Use machinePrimary once after a short native observation; Pascal primary is a real water pour, skip it for the closed inventory first trial.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "moka-pot",
    "capability": "Steam",
    "title": "Moka pot",
    "cue": "Heat creates vapor pressure in the lower chamber. That pressure pushes water through the resistant coffee bed into the upper cup.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-steam",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-steam",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Native heated phase pressure pushes actual liquid along the floor-intake uptake tube.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "torricelli-tube",
    "capability": "Valves and logic",
    "title": "Torricelli's tube",
    "cue": "The water column drains until atmospheric pressure supports it against the vapor-filled space above. Admit air to release it.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Finite water remains in a closed upper tube with an immersed open lower mouth; real side vent control.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "venturi-aspirator",
    "capability": "Valves and logic",
    "title": "Venturi and water aspirator",
    "cue": "Water accelerates through the throat. Its lower pressure draws room air through the side inlet.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Gravity-fed native water accelerates through a real narrowing and can interact with actual air in a side branch.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "breathing-cave",
    "capability": "Smoke",
    "title": "Breathing cave",
    "cue": "Raise inside or outside pressure, then watch the pivoted vanes turn with the air. Close the mouth to trap it.",
    "status": "WORKS",
    "draft": false,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-breathing-cave",
      "wss-machines/breathing-cave"
    ],
    "blocker": "Reduced isothermal gas and potential-flow model; acoustic waves, turbulence and complete energy closure are unresolved.",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 48,
      "key": "Manual pressure inputs drive air through the real mouth; drag torque and angular inertia turn pinned vane instruments.",
      "action": "Raise either pressure; reverse the difference, then close and reopen the entrance.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "savery-pump",
    "capability": "Steam",
    "title": "Savery's steam pump",
    "cue": "Heat to deliver water. Cool to condense vapor and refill through the inlet check. Both strokes use the finite supply.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-steam",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-steam",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Finite phase pressure can displace actual water through the rising delivery tube; manual inlet and delivery gates remain real.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "pulsometer",
    "capability": "Steam",
    "title": "Pulsometer",
    "cue": "One chamber heats while the other cools and refills. Low water switches the steam distributor to the other chamber.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-steam",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-steam",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "One real wide heater shares declared power across actual wet donors in both separate chambers.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "trompe",
    "capability": "Bubbles",
    "title": "Trompe",
    "cue": "Falling water entrains room air and carries it into the receiver. The trapped air compresses as the receiver fills.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Gravity-fed water must admit and carry actual positive gas through a side branch into a real lower headspace.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "hydraulic-ram",
    "capability": "Valves and logic",
    "title": "Hydraulic ram",
    "cue": "Drive-water momentum closes the waste valve. The pressure surge opens the delivery check toward the higher receiver.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Real drive/waste and initially dry upward delivery pipes, manual valves and native air chamber. Receiver starts above source free surface.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "water-hammer",
    "capability": "Valves and logic",
    "title": "Water hammer",
    "cue": "Close the outlet after water starts moving. Watch the pressure pulse travel back along the pipe. Compare the air chamber.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Visitor closes an actual stationary boundary in moving native water; optional real gas chamber is the comparison.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "ctesibius-clock",
    "capability": "Valves and logic",
    "title": "Ctesibius' float clock",
    "cue": "A float regulator holds the small header near one level. Its steady outlet raises the clock float; turn off regulation to compare.",
    "status": "WORKS",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-pressure-labs"
    ],
    "blocker": "",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "An actual elastic slime rises with retained native water and a static position ruler, with no timer moving it.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
    }
  },
  {
    "id": "fountain-rider",
    "capability": "Water slimes",
    "title": "Fountain rider",
    "status": "WORKS",
    "pool": true,
    "cue": "The real upward jet supports the slime between guides. Stop the water and it falls.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs fountain-rider",
      "key": "The real upward jet supports the slime between guides. Stop the water and it falls.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "canal-locks",
    "capability": "Floating things",
    "title": "Canal locks",
    "status": "WORKS",
    "pool": false,
    "cue": "Fill and drain the lock through its gates. The boat rises and falls with native water.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs canal-locks",
      "key": "Fill and drain the lock through its gates. The boat rises and falls with native water.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "jellyfish",
    "capability": "Water slimes",
    "title": "Jellyfish",
    "status": "WORKS",
    "pool": false,
    "cue": "Start its contractions. Water crosses the real mouth and the contact reaction moves the skin.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs jellyfish",
      "key": "Start its contractions. Water crosses the real mouth and the contact reaction moves the skin.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "soft-robot-gripper",
    "capability": "Water slimes",
    "title": "Soft robot gripper",
    "status": "WORKS",
    "pool": false,
    "cue": "Remove the support to test the grip. Withdraw the pistons to let go.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-air-contact",
      "wss-water-balloons"
    ],
    "behaviorPlan": {
      "seconds": 10,
      "action": "Let the fingers load, remove the support, then withdraw the actual pistons.",
      "key": "Sealed pressure carries the unsupported block above y265; piston withdrawal opens the grip and drops it below y340. Open vents fail to carry it. Gas amount is accounted and native body contact stays finite on three seeds.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-air-contact",
      "wss-water-balloons"
    ]
  },
  {
    "id": "suction-cup",
    "capability": "Water slimes",
    "title": "Suction cup",
    "status": "WORKS",
    "pool": false,
    "cue": "Open the vent to release the hanging seal.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-air-contact",
      "wss-water-balloons"
    ],
    "behaviorPlan": {
      "seconds": 7,
      "action": "Hold the sealed head, then click its real air vent.",
      "key": "Actual seal stays above y315 while sealed and falls below y340 after venting; an open vent cannot hold it. Finite gas inventories and native bodies stay finite on three seeds.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-air-contact",
      "wss-water-balloons"
    ]
  },
  {
    "id": "water-rocket",
    "capability": "Water slimes",
    "title": "Water rocket",
    "status": "WORKS",
    "pool": false,
    "cue": "A native piston compresses trapped air. Release the nozzle to launch the carried water tank.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-water-rocket"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "Release the charged native-pressure water tank",
      "key": "Initial free launch rises in three seeds; the uncompressed control falls. Native water is conserved.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-water-rocket"
    ]
  },
  {
    "id": "slime-submarine",
    "capability": "Water slimes",
    "title": "Slime submarine",
    "status": "WORKS",
    "pool": false,
    "cue": "Open the valve to flood its carried tank, then close it and drag the loaded skin.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Emptying ballast and calibrated two-way buoyancy remain outside this reduced floodable-tank model.",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-creatures",
      "wss-slime-submarine"
    ],
    "behaviorPlan": {
      "seconds": 4,
      "action": "Open ballast, close it, then Grab the loaded water skin",
      "key": "Carried native ballast adds measured mass and dives; blocked valve stays dry.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-creatures",
      "wss-slime-submarine"
    ]
  },
  {
    "id": "slime-mail",
    "capability": "Water slimes",
    "title": "Slime mail",
    "status": "WORKS",
    "pool": false,
    "cue": "Strike the drumhead repeatedly to send the free slime through the delivery tube.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-smoke-cannon",
      "wss-machines/smoke-ring-cannon",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs slime-mail",
      "key": "Strike the drumhead repeatedly to send the free slime through the delivery tube.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-smoke-cannon",
      "wss-machines/smoke-ring-cannon",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "swim-bladder-fish",
    "capability": "Water slimes",
    "title": "Swim-bladder fish",
    "status": "WORKS",
    "pool": false,
    "cue": "Fill the bladder to rise, then vent it to sink. The ballast stays in the fish.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 60,
      "action": "Fill and vent the connected gas supply; compare the blocked tube.",
      "key": "Actual rendered volume and reversible depth change with fixed ballast and conserved native water.",
      "probes": [
        "gasBodyReading bodies volume, amount, admitted and expired",
        "fixed ballast and gas inventory residual",
        "native water count and body depth"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-water-balloons",
      "wss-gas-body-labs"
    ]
  },
  {
    "id": "bell-jar-lungs",
    "capability": "Water slimes",
    "title": "Bell-jar lungs",
    "status": "WORKS",
    "pool": false,
    "cue": "Lower the diaphragm to breathe in. Raise it to breathe out. Open the jar vent for comparison.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 16,
      "action": "Move the real diaphragm down and back; compare the open jar vent and blocked lung tubes.",
      "key": "The sealed chamber pressure falls and the elastic lungs expand, then return. The open vent removes the pressure change.",
      "probes": [
        "gasBodyReading chamber pressure and volume",
        "current lung skin volume and airway inventory",
        "chamber and airway inventory residuals"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-water-balloons",
      "wss-gas-body-labs"
    ]
  },
  {
    "id": "vacuum-slime",
    "capability": "Water slimes",
    "title": "Vacuum slime",
    "status": "WORKS",
    "pool": false,
    "cue": "Pull the diaphragm down and watch the sealed gas slime swell. Open the vent to remove the effect.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 16,
      "action": "Lower and raise the real diaphragm; compare the open jar vent.",
      "key": "Actual elastic skin expands and returns while its gas amount stays fixed. The open vent removes the expansion.",
      "probes": [
        "gasBodyReading chamber pressure and volume",
        "current skin volume and fixed gas amount",
        "chamber gas inventory residual"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-water-balloons",
      "wss-gas-body-labs"
    ]
  },
  {
    "id": "pitcher-pump",
    "capability": "Water slimes",
    "title": "Pitcher pump",
    "status": "WORKS",
    "pool": false,
    "cue": "Lower the piston to deliver water, then raise it to refill through the two check valves.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs pitcher-pump",
      "key": "Lower the piston to deliver water, then raise it to refill through the two check valves.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "super-soaker",
    "capability": "Water slimes",
    "title": "Super Soaker",
    "status": "WORKS",
    "pool": false,
    "cue": "Compress the air, then open the trigger to release the finite water charge.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs super-soaker",
      "key": "Compress the air, then open the trigger to release the finite water charge.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "champagne-cork",
    "capability": "Water slimes",
    "title": "Champagne cork",
    "status": "WORKS",
    "pool": false,
    "cue": "A visible piston stores pressure in real bottle air. Release the latch to launch the cork.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "A real air-pulse pressure traction meets the cork; stored compressible bottle gas and fermentation are absent.",
    "dependencies": [
      "wss-smoke-cannon",
      "wss-machines/smoke-ring-cannon",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "machinePrimary gives one declared rear chamber air pulse",
      "key": "Observe actual projection pressure traction and finite cork. Stored bottle gas is absent, so keep NOT WORKING regardless of pulse displacement.",
      "probes": [
        "smoke field finite",
        "slimeDX",
        "peakEdgeLoad"
      ],
      "statusIfObserved": "NOT WORKING"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-champagne-cork"
    ]
  },
  {
    "id": "pressure-cuff",
    "capability": "Water slimes",
    "title": "Pressure cuff",
    "status": "WORKS",
    "pool": false,
    "cue": "Inflate the elastic bladders to restrict real water flow; vent them to reopen the channel.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-pressure-cuff"
    ],
    "behaviorPlan": {
      "seconds": 4,
      "action": "Inflate the actual bladders around the native flowing channel",
      "key": "Native through-flow falls against the disconnected-pump control; native water is conserved.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-pressure-cuff"
    ]
  },
  {
    "id": "snorkel-limit",
    "capability": "Water slimes",
    "title": "Snorkel limit",
    "status": "WORKS",
    "pool": false,
    "cue": "The shallow lung breathes. The same effort cannot fill the deeper one.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-drafts-creatures",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-water-balloons",
      "wss-snorkel-limit"
    ],
    "behaviorPlan": {
      "seconds": 6.5,
      "action": "Observe both open lung ports and compare physically blocked airways.",
      "key": "Both actual ports connect to room air. Shallow gas inventory and actual area expand, deeper pressure prevents a useful intake, blocked ports admit no air, and native water count is conserved on three seeds.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-creatures",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-water-balloons",
      "wss-snorkel-limit"
    ]
  },
  {
    "id": "slime-sipper",
    "capability": "Water slimes",
    "title": "Slime sipper",
    "status": "WORKS",
    "pool": false,
    "cue": "Expand to drink through the side mouth. Squeeze to return water, then refill.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "dependencies": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs slime-sipper",
      "key": "Expand to drink through the side mouth. Squeeze to return water, then refill.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures",
      "wss-body-machines"
    ]
  },
  {
    "id": "upside-down-tank",
    "capability": "Bubbles",
    "title": "Upside-down tank",
    "cue": "Open the bottom. Water leaves while room air enters the same wide mouth. The headspace pressure responds to both.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "tesla-valve",
    "capability": "Valves and logic",
    "title": "Tesla valve",
    "cue": "The same pressure head meets different resistance in each direction. Reverse the starting head to compare equal finite charges.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "hydraulic-jump",
    "capability": "Waves",
    "title": "Hydraulic jump",
    "cue": "Open the gate. Fast shallow water meets the deeper downstream pool. Remove the weir to change the jump.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "self-watering-planter",
    "capability": "Water slimes",
    "title": "Self-watering planter",
    "cue": "Watch actual reservoir water climb a wetting wick and bind at the roots. Try the nonwetting control.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines",
      "wss-capillary-planter"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-capillary-planter"
    ]
  },
  {
    "id": "glacial-flood",
    "capability": "Ice",
    "title": "Glacial flood",
    "cue": "An ice-density gel barrier floats up as the lake rises, releasing a flood. Freezing and melting are not modeled.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines",
      "wss-drafts-bodies"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-glacial-flood"
    ]
  },
  {
    "id": "cold-geyser",
    "capability": "Bubbles",
    "title": "Cold geyser",
    "cue": "Release the carbonated well. Exsolving gas supplies pressure to lift water up its throat. The finite gas charge eventually runs down.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines",
      "wss-drafts-fizz"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-drafts-fizz",
      "wss-pressure-labs"
    ]
  },
  {
    "id": "tesla-pump",
    "capability": "Valves and logic",
    "title": "Tesla pump",
    "cue": "Run the visible motor. Compare directional resistance with the symmetric control.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-tesla-loss",
      "wss-tesla-pump"
    ],
    "blocker": "Uses a declared empirical resistance model for unresolved mixing; not a calibrated pump or geometry-only prediction.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-tesla-loss",
      "wss-tesla-pump"
    ]
  },
  {
    "id": "spray-bottle",
    "capability": "Valves and logic",
    "title": "Spray bottle",
    "cue": "Press the trigger piston to send a dose through the nozzle. Release it to refill.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines",
      "wss-drafts-bodies"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-drafts-bodies",
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures",
      "wss-body-machines"
    ],
    "behaviorPlan": {
      "test": "node tools/test-body-machines.mjs spray-bottle",
      "key": "Press the trigger piston to send a dose through the nozzle. Release it to refill.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "suction-siphon",
    "capability": "Valves and logic",
    "title": "Suction-primed siphon",
    "cue": "Pull the sealed syringe, then open the water outlet. A crest leak prevents priming.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 480
    },
    "pool": false,
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-suction-siphon"
    ],
    "blocker": "One-stroke reduced 2D syringe primer, without a calibrated real pump efficiency.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-suction-siphon"
    ]
  },
  {
    "id": "cup-synchronization",
    "title": "Coupled self-flushing cups",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Two return-fed cups prime and empty repeatedly. The connecting tube brings their cycles together.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "intermittent-fountain",
    "title": "Intermittent fountain",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "The trigger cup fills until its siphon primes, sends a jet, empties, and refills.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "binary-staircase",
    "title": "Binary staircase",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Add water pulses. Three tipping buckets store the binary count and carry after every second pulse.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "mariotte-bottle",
    "title": "Mariotte constant bottle",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Compare sealed constant-head outflow with a vented bottle, or move the air-tube intake.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "banu-musa-fountain",
    "title": "Banu Musa changing fountain",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "A float-controlled route switches the finite water supply between two fountain outlets.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "bottle-glass-pitch",
    "title": "Bottles and glasses",
    "capability": "Sound",
    "status": "WORKS",
    "cue": "Fill and tap each vessel. The bottle air note rises as it fills; the weighted glass note falls.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-steam",
      "wss-singing-pipe",
      "wss-machines/singing-pipe",
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "fountain-music",
    "title": "Playable fountain show",
    "capability": "Sound",
    "status": "WORKS",
    "cue": "Play four recirculating water jets. Each note sounds only while its jet flows.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "galileo-well",
    "title": "Galileo's suction well",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Run the suction pump at 30 feet, then compare it with a 100 foot lift beyond atmospheric support.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "vacuum-siphon",
    "title": "Siphon in a vacuum",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Prime the room-air siphon, then evacuate the chamber and watch vapor break the crest.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "bramah-press",
    "title": "Bramah's hydraulic press",
    "capability": "Floating things",
    "status": "WORKS",
    "cue": "Push the small piston to raise the large one. Add a load to compare required pressure.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "hero-vending",
    "title": "Hero's vending machine",
    "capability": "Floating things",
    "status": "WORKS",
    "cue": "Drop a coin onto the lever to open the measured-drink valve. Return it to stop delivery.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "hero-drinking-animal",
    "title": "Hero's drinking animal",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Apply mouth suction to lift bowl water into the animal reservoir, then release it.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "jazari-peacock",
    "title": "Al-Jazari's peacock washer",
    "capability": "Floating things",
    "status": "WORKS",
    "cue": "The wash bowl fills until its float changes the valves, drains through a powered return, and refills.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "moniac",
    "title": "MONIAC water economy",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Five circulating reservoirs represent an economy. Change spending, tax, and saving valve rates.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "lukyanov-integrator",
    "title": "Lukyanov water integrator",
    "capability": "Valves and logic",
    "status": "WORKS",
    "cue": "Add a heat pulse as analog water, then compare diffusion through two link resistances.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "marly-machine",
    "title": "Machine de Marly",
    "capability": "Floating things",
    "status": "WORKS",
    "cue": "Falling river water turns the wheel and lifts a smaller flow to the upper reservoir.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "parts-budget-puzzles",
    "title": "Parts-budget puzzles",
    "capability": "World",
    "status": "WORKS",
    "cue": "Connect the receiver within a two-part budget. The goal registers when water reaches it.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "pneumatica-campaign",
    "title": "Pneumatica campaign",
    "capability": "World",
    "status": "WORKS",
    "cue": "Build each link after the preceding receiver fills, then deliver water to the final goal.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "garden-automation",
    "title": "Automate the garden",
    "capability": "World",
    "status": "WORKS",
    "cue": "Moisture sensing opens each planter valve while finite soil uptake consumes the supply.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "escape-the-jar",
    "title": "Escape the jar",
    "capability": "World",
    "status": "WORKS",
    "cue": "Grab the slime and lift its whole skin out of the jar. A closed lid blocks the escape.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-escape-jar"
    ],
    "preview": "cup",
    "blocker": ""
  },
  {
    "id": "fire-brigade",
    "title": "Fire brigade",
    "capability": "World",
    "status": "WORKS",
    "cue": "Aim a finite water tank at three separate fires and quench every one.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-fire",
      "wss-machines/douse-fire",
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  },
  {
    "id": "water-chain-reaction",
    "title": "Water chain reaction",
    "capability": "World",
    "status": "WORKS",
    "cue": "Start one pour. Successive water levels trip two gates and fill the final goal.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks",
      "wss-network-machines"
    ],
    "preview": "cup"
  }
];
  var lab = new URLSearchParams(location.search).get('lab') === '1';
  var loaded = {};
  function lookup(id) {
    return entries.find(function(e){return e.id===id && (e.accepted || lab);}) || null;
  }
  function script(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function(resolve,reject){
      var element=document.createElement('script');
      element.src=url+'?v='+encodeURIComponent(window.__toy.version);
      element.onload=resolve;
      element.onerror=function(){reject(new Error('Could not load this machine.'));};
      document.head.appendChild(element);
    });
    return loaded[url];
  }
  async function load(id) {
    var entry=lookup(id);
    if(!entry)throw new Error('This machine is not available.');
    // These scripts install functions. Their dependencies are read when a
    // machine is created, after every script has loaded, not during evaluation.
    var paths=['wss-boundaries','wss-hands','wss-native','wss-sound','wss-fire','wss-oxygen'];
    if(id==='float-slider-cistern')paths.push('wss-float-slider');
    if(id==='air-hose')paths.push('wss-bubbles');
    if(id==='douse-fire')paths.push('wss-fire');
    if(id==='kettle' || id==='singing-pipe')paths.push('wss-steam');
    if(id==='singing-pipe')paths.push('wss-singing-pipe');
    if(id==='smoke-ring-cannon' || id==='smoke-wind-tunnel')paths.push('wss-smoke-cannon');
    if(id==='smoke-wind-tunnel')paths.push('wss-smoke-wind-tunnel');
    if(id==='breathing-cave')paths.push('wss-breathing-cave');
    if(id==='water-balloons')paths.push('wss-water-balloons');
    if(id==='cartesian-divers')paths.push('wss-cartesian-divers');
    if(id==='burst-disk')paths.push('wss-burst-disk');
    if(id==='tantalus')paths.push('wss-machines/self-flushing-cup');
    if(entry.draft && entry.scripts)paths=paths.concat(entry.scripts);
    else paths.push('wss-machines/'+(/^material-(oil|sand)-jar$/.test(id) ? 'material-slip-jar' : id));
    // Scene companions wrap the preceding runtime at evaluation time. Load
    // in declared order so a slow response cannot replace a newer wrapper.
    for(var i=0;i<paths.length;i++)await script('/js/'+paths[i]+'.js');
    if(window.WSSBodyMachines)window.WSSBodyMachines.install();
    if(window.WSSPressureLabs)window.WSSPressureLabs.install();
    var module=window.WSSMachines && window.WSSMachines[id];
    if(!module || typeof module.make!=='function')throw new Error('This machine did not start.');
    return module;
  }
  window.WSSMachineRegistry={lookup:lookup,load:load,list:function(){return entries.filter(function(e){return e.accepted || lab;});},lab:lab};
  // Static apparatus sketches identify scenes, not snapshots of the solver.
  function preview(kind) {
    var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 72 52');
    svg.setAttribute('class','toy-scene-preview');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    function path(d,style) {
      var shape=document.createElementNS(ns,'path');
      shape.setAttribute('d',d);shape.setAttribute('class',style);svg.appendChild(shape);
    }
    path('M3 43v6h66v-6','toy-preview-glass');
    path('M4 45h64v3H4Z','toy-preview-water');
    if(kind==='sliding-pipe'){
      path('M6 5v17h16V5M36 25h20v23H36ZM18 19h10v23h12M51 25V13','toy-preview-glass');
      path('M7 10h14v10H7ZM38 40h16v6H38Z','toy-preview-water');
      path('M48 11h7v7h-7ZM48 18v9M55 18v9','toy-preview-mouth');
    }else if(kind==='divers'){
      path('M13 8v38h46V8M12 13h48M36 13V4','toy-preview-glass');
      path('M15 25h42v19H15Z','toy-preview-water');
      path('M23 27a4 4 0 1 0 0-8 4 4 0 0 0 0 8M36 27a5 5 0 1 0 0-10 5 5 0 0 0 0 10M49 27a6 6 0 1 0 0-12 6 6 0 0 0 0 12','toy-preview-slime');
    }else if(kind==='thermoscope'){
      path('M27 6h21v13H27ZM33 19v24M42 19v24M15 29v19h44V29','toy-preview-glass');
      path('M16 36h17v-4h9v4h16v11H16Z','toy-preview-water');
      path('M32 14h11','toy-preview-mouth');
    }else if(kind==='water-balloon'){
      path('M36 6c-15 0-23 15-18 27 5 15 30 15 36 0C59 21 51 6 36 6Z','toy-preview-glass');
      path('M17 26h39c-1 25-38 25-39 0Z','toy-preview-water');
    }else if(kind==='fire'){
      path('M25 43h23v-4H25Z','toy-preview-glass');
      path('M28 37c-5-8 10-14 5-25 14 10 20 23 8 25Z','toy-preview-slime');
      path('M12 7h10v4H12M17 13v15','toy-preview-stream');
    }else if(kind==='smoke-cannon'){
      path('M7 16h22v6M7 36h22v-6M7 16v20','toy-preview-glass');
      path('M34 23c-5-8 8-10 8-3s-8 6-5 1M34 31c-5 8 8 10 8 3s-8-6-5-1','toy-preview-stream');
      path('M52 19c-9 0-9 15 0 15s11-15 0-15Z','toy-preview-slime');
    }else if(kind==='smoke-tunnel'){
      path('M8 13h57M8 39h57M8 16v20M30 13v8','toy-preview-glass');
      path('M11 23h10M11 30h10M40 24c10-9 17 8 25-2M40 31c10 9 17-8 25 2','toy-preview-stream');
      path('M31 21c-9 0-9 15 0 15s11-15 0-15Z','toy-preview-slime');
    }else if(kind==='inverted-siphon'){
      path('M5 8v20h16V8M53 21v21h15V21M15 25h12v19h19V33h13','toy-preview-glass');
      path('M6 12h14v15H6ZM54 33h13v8H54Z','toy-preview-water');
      path('M16 25h11v19h19V33h14','toy-preview-stream');
    }else if(kind==='burst-disk'){
      path('M10 8v27h18V8M27 23h27v8H27','toy-preview-glass');
      path('M11 14h15v20H11Z M27 24h16v6H27Z','toy-preview-water');
      path('M44 23v8','toy-preview-mouth');
      path('M55 32v7','toy-preview-stream');
    }else if(kind==='straw'){
      path('M31 9v24M42 9v24','toy-preview-glass');
      path('M33 15h7v17h-7Z','toy-preview-water');
      path('M36 35v5','toy-preview-stream');
      path('M28 9c0-4 3-6 7-5l8 2c3 1 4 3 3 5','toy-preview-hand');
    }else{
      path('M9 11v25h38V20M42 32V13h14v29M46 32V17h6v25M18 4h7v6','toy-preview-glass');
      path('M10 25h31v8h5v2H10Z','toy-preview-water');
      path('M25 13v7','toy-preview-stream');
      if(kind==='tantalus'){
        path('M11 22c-2-8 9-11 14-5 3 6-4 12-11 10-3 0-5-2-3-5Z','toy-preview-slime');
        path('M27 18h9','toy-preview-mouth');
      }
    }
    return svg;
  }
  var list=document.getElementById('toy-scene-list');
  if(list && (lab || entries.some(function(e){return e.accepted;}))){
    // Move the existing controls intact so their state and handlers survive.
    var originals=Array.from(list.querySelectorAll('[data-scene]'));
    Array.from(list.querySelectorAll('p')).forEach(function(p){p.remove();});
    function heading(label) {
      var p=document.createElement('p');p.textContent=label;list.appendChild(p);
    }
    function machine(e) {
      var button=document.createElement('button');
      button.className='toy-chip toy-machine-choice';button.dataset.scene=e.id;
      button.setAttribute('aria-pressed','false');
      button.appendChild(preview(e.preview));
      var copy=document.createElement('span');copy.className='toy-scene-copy';
      var name=document.createElement('span');name.className='toy-scene-name';name.textContent=e.title+(e.draft?' ['+({'WORKS':'Working','PARTLY':'Partly working','NOT WORKING':'Not working yet'}[e.status]||'Not working yet')+']':'');
      var cue=document.createElement('span');cue.className='toy-scene-cue';cue.textContent=e.cue;
      copy.appendChild(name);copy.appendChild(cue);button.appendChild(copy);list.appendChild(button);
    }
    ['Fire','Smoke','Sand','Water slimes','Floating things','Steam','Oil and water','Ice','Bubbles','Valves and logic','Sound','Waves','World'].forEach(function(group){var choices=entries.filter(function(e){return e.accepted && e.capability===group;});if(choices.length){heading(group);choices.forEach(machine);}});
    heading('Earlier water machines');entries.filter(function(e){return e.accepted && !e.capability;}).forEach(machine);
    var workshop=window.WSSMachineRegistry.list().filter(function(e){return !e.accepted;});
    if(workshop.length){heading('Workshop');workshop.forEach(machine);}
    heading('Original scenes');originals.forEach(function(button){list.appendChild(button);});
  }
})();
