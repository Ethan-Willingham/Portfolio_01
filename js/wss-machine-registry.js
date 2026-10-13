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
    "cue": "Draft. Fling the balloon at the slimes, then pop it.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "blocker": "Real throwing and popping await the first native boot.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
  },
  {
    "id": "squid-jet",
    "capability": "Water slimes",
    "title": "Squid jet",
    "cue": "Draft. Squeeze the slit skin and watch the released water.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "blocker": "A slit and balanced hand impulse are connected; useful propulsion is unproved.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
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
    "cue": "Grab the glass. Swing and release to flip it.",
    "status": "PARTLY",
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
    ]
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
    "status": "PARTLY",
    "blocker": "Oxygen moves through the airflow and is consumed locally. Detailed chemistry remains approximate.",
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
    "status": "PARTLY",
    "blocker": "Spatial oxygen and fuel heat respond to the open inlet and flue; detailed chemistry remains approximate.",
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
    "cue": "Draft. Pour into the basin and follow the smoke in the air link, draft.",
    "status": "PARTLY",
    "blocker": "Smoke traces a separate flow field, not the native compressible gas inventory.",
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
      "wss-drafts-fire-smoke"
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
      "wss-drafts-fire-smoke"
    ]
  },
  {
    "id": "sewer-gas-trap",
    "capability": "Smoke",
    "title": "Sewer gas trap",
    "cue": "Water blocks the smoke. Dry out the trap to let it through, then refill it.",
    "status": "PARTLY",
    "blocker": "Air pressure does not displace the water seal.",
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
      "wss-drafts-fire-smoke"
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
      "wss-drafts-fire-smoke"
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
    "cue": "Watch water fill the hinged trough, tip it, and let its counterweight reset it. Stop the feed for a dry control.",
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
      "wss-moving-water-loads",
      "wss-shishi-odoshi"
    ]
  },
  {
    "id": "lift-lock",
    "capability": "Floating things",
    "title": "Peterborough lift lock",
    "cue": "Open the ballast feed. Added water lowers one caisson and raises the other through an equal-area hydraulic link.",
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
      "wss-moving-water-loads",
      "wss-lift-lock"
    ]
  },
  {
    "id": "ballast-railway",
    "capability": "Floating things",
    "title": "Water-ballast cliff railway",
    "cue": "Water fills the upper car. Its weight pulls the other uphill; the lower car drains for the return trip.",
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
      "wss-ballast-railway"
    ]
  },
  {
    "id": "vacuum-coffee",
    "capability": "Steam",
    "title": "Vacuum coffee maker",
    "cue": "Draft. The declared heater makes vapor; the water responds to native gas pressure.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-steam",
      "wss-machines/kettle",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "steam-geyser",
    "capability": "Steam",
    "title": "Steam geyser",
    "cue": "Draft. The declared heater makes vapor; the water responds to native gas pressure.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-steam",
      "wss-machines/kettle",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "hero-temple-doors",
    "capability": "Steam",
    "title": "Hero's temple doors",
    "cue": "Draft. Heated water makes vapor beside two door weights; the door linkage is unfinished.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-steam",
      "wss-machines/kettle",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "water-half-adder",
    "capability": "Valves and logic",
    "title": "Water half adder",
    "cue": "Draft. Two inputs feed the output tanks; XOR and carry gates are unfinished.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "slime-heart",
    "capability": "Valves and logic",
    "title": "Slime heart",
    "cue": "Draft. Grab and squeeze the slime beside the outlet; reliable pumping is unfinished.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "hellbrunn-fountains",
    "capability": "Valves and logic",
    "title": "Hellbrunn trick fountains",
    "cue": "Draft. The marked powered jet sprays two slime guests; close the tap to stop it.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "singing-birds-owl",
    "capability": "Sound",
    "title": "Singing birds and owl",
    "cue": "Draft. Filling water drives the actual pipe voice; the owl swivel and repeating cycle are unfinished.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-steam",
      "wss-singing-pipe",
      "wss-machines/singing-pipe",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "water-organ",
    "capability": "Sound",
    "title": "Water organ",
    "cue": "Falling water expels air through three playable pipes. Turn on sound, then tap C, E or G.",
    "preview": "cup",
    "status": "WORKS",
    "draft": false,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-steam",
      "wss-singing-pipe",
      "wss-machines/singing-pipe",
      "wss-drafts-workshop",
      "wss-acoustic-machines"
    ]
  },
  {
    "id": "hydraulophone",
    "capability": "Sound",
    "title": "Hydraulophone",
    "cue": "Draft. Water displaces air into a pipe voice; finger-controlled water tones are unfinished.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-steam",
      "wss-singing-pipe",
      "wss-machines/singing-pipe",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "ringing-bubbles",
    "capability": "Sound",
    "title": "Ringing bubbles",
    "cue": "Inject actual air pockets, turn on sound, then switch bubble size to hear the lower note.",
    "preview": "cup",
    "status": "WORKS",
    "draft": false,
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
      "wss-acoustic-machines"
    ]
  },
  {
    "id": "blowhole",
    "capability": "Waves",
    "title": "Blowhole",
    "cue": "Draft. Paddle waves enter the cave; a roof spout and natural air compression remain unproved.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-wave-maker",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "sloshing-resonance",
    "capability": "Waves",
    "title": "Sloshing resonance",
    "cue": "Draft. The motor excites a finite tank; a resonance sweep is unfinished.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-wave-maker",
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "tsunami-runup",
    "capability": "Waves",
    "title": "Tsunami run-up",
    "cue": "Draft. A motor wave meets a stepped beach; watch the water climb the slope.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-wave-maker",
      "wss-drafts-workshop"
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
    "cue": "Draft. The finite upper flask can drain; it has no source of energy to lift its water back.",
    "preview": "cup",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "scripts": [
      "wss-drafts-workshop"
    ]
  },
  {
    "id": "glass-toilet",
    "capability": "Valves and logic",
    "title": "Glass toilet",
    "cue": "Draft. Flush the cistern; reliable siphoning is unfinished.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "scripts": [
      "wss-float-slider",
      "wss-machines/glass-toilet"
    ],
    "preview": "cup"
  },
  {
    "id": "sand-dam",
    "capability": "Sand",
    "title": "Sand dam",
    "cue": "Hold the tap. Watch water change the sand bank.",
    "status": "PARTLY",
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
    ]
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
    "cue": "Draft. Switch the real outlet gates between two liquids.",
    "status": "PARTLY",
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
    "id": "interlayer-slime",
    "capability": "Oil and water",
    "title": "Slime between oil and water",
    "cue": "Draft. Drop and grab a slime above the two liquids.",
    "status": "PARTLY",
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
    "cue": "Draft. Pour water over the burner beside the slick.",
    "status": "PARTLY",
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
      "wss-fire"
    ]
  },
  {
    "id": "soda-mentos",
    "capability": "Bubbles",
    "title": "Soda and Mentos",
    "cue": "Draft. Watch real fizz below the bottle mouth.",
    "status": "PARTLY",
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
      "wss-drafts-fizz"
    ]
  },
  {
    "id": "glugging-bottle",
    "capability": "Bubbles",
    "title": "Glugging bottle",
    "cue": "Draft. Open the air vent and compare the draining bottle, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "Actual gas/water counterflow through the shared mouth has not been observed.",
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
    "cue": "Watch the tall water arm compress trapped air. Open its vent and compare the levels.",
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
      "wss-pressure-scales"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "Only the supported small physical scale is represented; no 300-foot or vacuum claim.",
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
    "cue": "Draft. Close a tap and compare jets at three heights, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "Native jet comparison is untested; header depletion means head changes.",
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
    "cue": "Draft. A narrow column loads an ideal breakable wall panel, draft.",
    "status": "PARTLY",
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
      "wss-burst-disk"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-burst-disk"
    ],
    "blocker": "The wall panel is an ideal rupture cut, not elastic barrel fracture.",
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
    "cue": "Draft. Heat the lower chamber to push water toward the upper cup, draft.",
    "status": "PARTLY",
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
      "wss-steam"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-steam"
    ],
    "blocker": "Porous coffee-bed resistance and sustained steam support remain incomplete.",
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
    "cue": "Watch the tall water column settle above its bath. Open the top vent to release it.",
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
      "wss-pressure-scales"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "The supported physical scale is eleven inches and the stock pressure floor does not establish a full water barometer.",
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
    "cue": "Draft. Watch the constriction and its real side air inlet, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "Air aspiration and turbulent mixing are unverified; the throat is stepped glass geometry.",
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
    "cue": "Raise inside or outside pressure, then watch the arrows travel and turn with the air. Close the mouth to trap it.",
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
      "key": "Manual pressure inputs drive air through the real mouth; air drag drives travel and turning of persistent free arrows.",
      "action": "Raise either pressure; reverse the difference, then close and reopen the entrance.",
      "statusIfObserved": "WORKS"
    }
  },
  {
    "id": "savery-pump",
    "capability": "Steam",
    "title": "Savery's steam pump",
    "cue": "Draft. Heat and cool the chamber using its two real manual valves, draft.",
    "status": "PARTLY",
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
      "wss-steam"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-steam"
    ],
    "blocker": "Sustained vapor support, vacuum refill and an automatic check cycle are not established.",
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
    "cue": "Draft. Two heated chambers share a delivery tube; automatic alternation is missing, draft.",
    "status": "PARTLY",
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
      "wss-steam"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-steam"
    ],
    "blocker": "No steam shuttle or pressure-switch mechanism alternates the chambers.",
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
    "cue": "Draft. Falling water passes a real air inlet into a lower receiver, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "Native air entrainment, compression and separation have not been observed.",
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
    "cue": "Draft. Close the waste valve and watch the delivery branch, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "No inertial waste-valve body or automatic check-valve cycle; no pumping claim.",
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
    "cue": "Draft. Close the downstream cut; the pressure-wave model is incomplete, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "Fast physical valve dynamics and resolved liquid-acoustic propagation are not established.",
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
    "cue": "Draft. The float follows accumulating water below a finite header, draft.",
    "status": "PARTLY",
    "draft": true,
    "accepted": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "preview": "cup",
    "scripts": [
      "wss-drafts-pressure"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure"
    ],
    "blocker": "No constant-head regulator, geared hand or calibrated seconds; ordinary one-way body coupling remains approximate.",
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
    "status": "PARTLY",
    "pool": true,
    "cue": "Draft. A real upward water jet meets the slime; steady riding is unproved.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Actual upward native supply is connected; steady water-supported riding is unproved.",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 3,
      "action": "machinePrimary closes the declared upward tap",
      "key": "Observe native water rising to the body; only call WORKS if the body is held above its no-jet position by the actual jet.",
      "probes": [
        "native tap ledger",
        "body position"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ]
  },
  {
    "id": "canal-locks",
    "capability": "Floating things",
    "title": "Canal locks",
    "status": "PARTLY",
    "pool": false,
    "cue": "Draft. Open the real lock gates in turn; the boat can be grabbed.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Real gated equalization is connected; complete boat passage has not been established.",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 8,
      "actionAtSeconds": 1,
      "action": "machinePrimary opens upper gate, next press closes it, next opens lower gate",
      "key": "Real unequal water levels move through the physical gates; complete boat passage remains unproved.",
      "probes": [
        "gate open flags",
        "water positions",
        "rigid boat"
      ],
      "statusIfObserved": "PARTLY"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ]
  },
  {
    "id": "jellyfish",
    "capability": "Water slimes",
    "title": "Jellyfish",
    "status": "PARTLY",
    "pool": false,
    "cue": "Draft. Squeeze the submerged skin by hand; swimming is unproved.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Both native water birth sides and a balanced hand squeeze are connected; swimming is unproved.",
    "dependencies": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "machinePrimary gives gel nodes a balanced inward hand impulse",
      "key": "Native water remains on original sides, skin deforms and contact reaction stays finite. Swimming remains unproved.",
      "probes": [
        "balloon stats",
        "native parcel count",
        "body position"
      ],
      "statusIfObserved": "PARTLY"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
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
    "capability": "Pressure and motion",
    "title": "Water rocket",
    "status": "WORKS",
    "pool": false,
    "cue": "Fill, pressurize and launch a bottle. Compare the height of your flights.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "",
    "dependencies": [
      "wss-water-rocket-model",
      "wss-water-rocket-view",
      "wss-water-rocket"
    ],
    "behaviorPlan": {
      "seconds": 16,
      "actionAtSeconds": 3,
      "action": "Pressurize, release and observe the full flight",
      "key": "Pressure-driven momentum launches the bottle. It reaches an apex and lands; water mass is accounted for, pressure falls, pause freezes state and changing the fill changes the result.",
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-rocket-model",
      "wss-water-rocket-view",
      "wss-water-rocket"
    ]
  },
  {
    "id": "slime-submarine",
    "capability": "Water slimes",
    "title": "Slime submarine",
    "status": "WORKS",
    "pool": false,
    "cue": "Steer through three rings. Take on ballast, feel the weight, and lift the open hull to drain.",
    "draft": true,
    "world": {
      "w": 560,
      "h": 320
    },
    "blocker": "Steering is an external motor; calibrated two-way buoyancy and propeller flow remain outside this reduced model.",
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
    "status": "PARTLY",
    "pool": false,
    "cue": "Draft. Tap the rear air chamber to push smoke toward the slime in the tube.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Actual smoke projection pressure in a long duct is connected; mail delivery is unproved.",
    "dependencies": [
      "wss-smoke-cannon",
      "wss-machines/smoke-ring-cannon",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "machinePrimary supplies one declared rear air impulse",
      "key": "Actual smoke and pressure meet the gel parcel within physical duct; only call WORKS if it reaches the outlet.",
      "probes": [
        "smoke field finite",
        "slimeDX",
        "projection pressure load"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-smoke-cannon",
      "wss-machines/smoke-ring-cannon",
      "wss-drafts-creatures"
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
    "status": "PARTLY",
    "pool": false,
    "cue": "Draft. Drive the primed piston down and back; two real check valves route the water.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Primed water, a driven piston and actual pressure-operated check valves are connected; useful delivery is unproved.",
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 8,
      "actionAtSeconds": 1,
      "action": "machinePrimary lowers driven piston, then raises it after the down stroke",
      "key": "WORKS requires actual receiver water increase and directional check operation without births or removals. Self-priming is not implemented.",
      "probes": [
        "divers stroke",
        "inlet/outlet open flags",
        "native water in receiver",
        "native parcel count"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ]
  },
  {
    "id": "super-soaker",
    "capability": "Water slimes",
    "title": "Super Soaker",
    "status": "PARTLY",
    "pool": false,
    "cue": "Draft. Open the nozzle of the water tank under its declared driven piston.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Driven compression boundary and physical outlet gate are connected; useful spray is unproved.",
    "dependencies": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "machinePrimary opens the real nozzle gate after the declared piston starts compressing",
      "key": "WORKS requires native water leaving the nozzle with positive horizontal speed. No water or velocity is added by the trigger.",
      "probes": [
        "divers stroke",
        "trigger valve flag",
        "native nozzle water positions/velocity",
        "native parcel count"
      ],
      "statusIfObserved": "WORKS"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-cartesian-divers",
      "wss-machines/cartesian-divers",
      "wss-drafts-creatures"
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
    "status": "PARTLY",
    "pool": false,
    "cue": "Draft. Water can cross a real slit; active suction and drinking are not connected.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Native two-sided slit skin is connected; active suction, uptake and reliable refill are absent.",
    "dependencies": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "machinePrimary gives actual gel nodes one balanced hand squeeze",
      "key": "Real water can cross only the missing skin interval; closed portions keep birth side. No absorbed water or active drinking claim.",
      "probes": [
        "balloon stats",
        "slitCrossings",
        "native parcel count"
      ],
      "statusIfObserved": "PARTLY"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ]
  },
  {
    "id": "upside-down-tank",
    "capability": "Bubbles",
    "title": "Upside-down tank",
    "cue": "Draft. Open the bottom and watch water and air exchange places.",
    "status": "PARTLY",
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
      "wss-drafts-fluid-machines"
    ]
  },
  {
    "id": "tesla-valve",
    "capability": "Valves and logic",
    "title": "Tesla valve",
    "cue": "Switch the high tank and compare forward and reverse flow through the same passive loops.",
    "status": "WORKS",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines",
      "wss-tesla-loss",
      "wss-tesla-valve"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "wss-tesla-loss",
      "wss-tesla-valve"
    ]
  },
  {
    "id": "hydraulic-jump",
    "capability": "Waves",
    "title": "Hydraulic jump",
    "cue": "Draft. Open the gate from the high reservoir into the shallow channel.",
    "status": "PARTLY",
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
      "wss-drafts-fluid-machines"
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
    "cue": "Draft. Release the cap over the carbonated well.",
    "status": "PARTLY",
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
      "wss-drafts-fizz"
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
    "cue": "Draft. Press the guided piston above two actual check valves.",
    "status": "PARTLY",
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
      "wss-drafts-bodies"
    ]
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
    "status": "PARTLY",
    "cue": "Draft. Two finite cups share a basin; sustained oscillation and synchronization are unproved.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "intermittent-fountain",
    "title": "Intermittent fountain",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. A finite feed cup connects to a fountain tube; autonomous repeated jets are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "binary-staircase",
    "title": "Binary staircase",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. Three threshold vessels are laid out; reliable binary storage and carry are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "mariotte-bottle",
    "title": "Mariotte constant bottle",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. Compare a submerged air intake with an open jar; constant head is unproved in this layout.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "banu-musa-fountain",
    "title": "Banu Musa changing fountain",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. A real valve changes the available jet routes; autonomous switching is unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "bottle-glass-pitch",
    "title": "Bottles and glasses",
    "capability": "Sound",
    "status": "PARTLY",
    "cue": "Draft. Change the real air pipe length; the distinct vibrating-glass model is missing.",
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
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "fountain-music",
    "title": "Playable fountain show",
    "capability": "Sound",
    "status": "PARTLY",
    "cue": "Draft. Operate the real powered jet; musical routing and the keyboard are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "galileo-well",
    "title": "Galileo's suction well",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. A real well and suction tube are present; the air pump and scale comparison are missing.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "vacuum-siphon",
    "title": "Siphon in a vacuum",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. The native siphon runs at room pressure; a true external-vacuum model is missing.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "bramah-press",
    "title": "Bramah's hydraulic press",
    "capability": "Floating things",
    "status": "PARTLY",
    "cue": "Draft. Two guided pistons sit above communicating water; sealed piston-force transmission is unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "hero-vending",
    "title": "Hero's vending machine",
    "capability": "Floating things",
    "status": "PARTLY",
    "cue": "Draft. A falling coin and hinged lever sit beside a real manual valve; coin-to-valve coupling is unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "hero-drinking-animal",
    "title": "Hero's drinking animal",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. A real straw reaches the animal-shaped slime; mouth suction and storage are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "jazari-peacock",
    "title": "Al-Jazari's peacock washer",
    "capability": "Floating things",
    "status": "PARTLY",
    "cue": "Draft. A real valve serves a finite washing bowl; the peacock mechanism and automatic draining are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "moniac",
    "title": "MONIAC water economy",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. Communicating reservoirs move real water; economic feedback valves and calibrated multipliers are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "lukyanov-integrator",
    "title": "Lukyanov water integrator",
    "capability": "Valves and logic",
    "status": "PARTLY",
    "cue": "Draft. Unequal water levels communicate through physical tubes; calibrated integration resistances are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "marly-machine",
    "title": "Machine de Marly",
    "capability": "Floating things",
    "status": "WORKS",
    "cue": "A river-driven wheel powers a piston pump. Close the river or apply the brake to compare.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-marly-model",
      "wss-marly-machine"
    ],
    "preview": "cup"
  },
  {
    "id": "parts-budget-puzzles",
    "title": "Parts-budget puzzles",
    "capability": "World",
    "status": "PARTLY",
    "cue": "Draft. Use Build to repair the physical tank link; a limited parts inventory and puzzle scoring are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "pneumatica-campaign",
    "title": "Pneumatica campaign",
    "capability": "World",
    "status": "PARTLY",
    "cue": "Draft. Build the missing link to the receiver; campaign progression is unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "garden-automation",
    "title": "Automate the garden",
    "capability": "World",
    "status": "PARTLY",
    "cue": "Draft. A finite supply reaches a planter; soil uptake, sensing and automated routing are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
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
    "status": "PARTLY",
    "cue": "Draft. Put out the real fire; multiple fires and a finite rescue-water objective are unfinished.",
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
      "wss-drafts-networks"
    ],
    "preview": "cup"
  },
  {
    "id": "water-chain-reaction",
    "title": "Water chain reaction",
    "capability": "World",
    "status": "PARTLY",
    "cue": "Draft. One real pour reaches a stepped tank network; automatic trigger gates are unfinished.",
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "draft": true,
    "accepted": true,
    "scripts": [
      "wss-drafts-networks"
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
    await Promise.all(paths.map(function(path){return script('/js/'+path+'.js');}));
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
