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
    "cue": "Draft. Stir the grains through the water.",
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
    "id": "hourglass",
    "capability": "Sand",
    "title": "Hourglass",
    "cue": "Draft. Watch the sand find the narrow neck.",
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
    "id": "aquarium-bubbler",
    "capability": "Bubbles",
    "title": "Aquarium bubbler",
    "cue": "Draft. Stop the air and watch the last bubbles rise.",
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
      "wss-bubbles"
    ]
  },
  {
    "id": "air-lift-pump",
    "capability": "Bubbles",
    "title": "Air-lift pump",
    "cue": "Draft. Send bubbles up the riser toward the receiving cup.",
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
      "wss-bubbles"
    ]
  },
  {
    "id": "candle-in-jar",
    "capability": "Fire",
    "title": "Candle in a jar",
    "cue": "Draft. Lift the lid and release the hot smoke, draft.",
    "status": "PARTLY",
    "blocker": "The flame does not consume oxygen or go out when the jar is sealed.",
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
      "actionAtSeconds": 2,
      "action": "machinePrimary lifts the physical lid",
      "key": "Hot smoke stays inside then escapes above the lid; oxygen extinction remains absent.",
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
    "cue": "Draft. Close the inlet and compare the plume in the flue, draft.",
    "status": "PARTLY",
    "blocker": "Native chimney draw has not been observed yet.",
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
    "cue": "Draft. Pour over the hot stones beside the bathing slime, draft.",
    "status": "PARTLY",
    "blocker": "Water warms, but steam and slime temperature are not connected.",
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
      "actionAtSeconds": 1,
      "action": "machinePrimary queues the declared 700-parcel water pour",
      "key": "Water reaches the hot patch, source loses heat and the bathing slime/water remain finite; steam absent.",
      "probes": [
        "warm-room"
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
    "cue": "Draft. Compare the water seal with a dry trap, draft.",
    "status": "PARTLY",
    "blocker": "The smoke feels water occupancy; smoke pressure does not move the water seal.",
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
    "cue": "Draft. Water wets the slime; drinking is not connected yet.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "blocker": "No water uptake or swelling operator exists; water stays native.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
  },
  {
    "id": "floating-block",
    "capability": "Floating things",
    "title": "Floating block",
    "cue": "Draft. Grab the stiff block and drop it into water.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "blocker": "Rigid square mesh and drag are connected; useful free flotation awaits the first native run.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
  },
  {
    "id": "lorenz-wheel",
    "capability": "Floating things",
    "title": "Lorenz waterwheel",
    "cue": "Draft. A declared motor turns this rotor; water drive is unfinished.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "blocker": "Declared motor and real rotor axle exist; leaky cups and water-derived torque are absent.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
  },
  {
    "id": "shishi-odoshi",
    "capability": "Floating things",
    "title": "Shishi-odoshi",
    "cue": "Draft. Water pours onto a hinged trough; repeating cycles are unfinished.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "blocker": "Actual U mesh and pin exist; reliable fill, tip and reset are unproved.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
  },
  {
    "id": "lift-lock",
    "capability": "Floating things",
    "title": "Peterborough lift lock",
    "cue": "Draft. Open the link between the tanks and watch the guided carriers.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "blocker": "Communicating tanks and guided carriers only; moving sealed caissons and common piston are absent.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
    ]
  },
  {
    "id": "ballast-railway",
    "capability": "Floating things",
    "title": "Water-ballast cliff railway",
    "cue": "Draft. Carriers slide on rails; ballast and cable coupling are unfinished.",
    "status": "PARTLY",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": true,
    "blocker": "Real rigid carriers and inclined guides exist; water ballast storage and balancing cable are absent.",
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies"
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
    "cue": "Draft. Turn on sound and drag the actual pipe to change its note; multiple voices are unfinished.",
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
    "cue": "Draft. Actual air pockets rise through water; a bubble-resonance sound model is unfinished.",
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
      "wss-bubbles",
      "wss-machines/air-hose",
      "wss-drafts-workshop"
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
    "cue": "Draft. Switch Earth and Moon gravity on falling slimes and poured water; physical box-size scaling is unfinished.",
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
    "cue": "Draft. Pour water against the loose grain barrier.",
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
    "id": "gold-sluice-box",
    "capability": "Sand",
    "title": "Gold sluice box",
    "cue": "Draft. Pour water through the riffled channel.",
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
    "cue": "Draft. Watch lightweight grain proxies move in water.",
    "status": "NOT WORKING",
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
    "id": "frozen-pipe",
    "capability": "Ice",
    "title": "Frozen pipe",
    "cue": "Draft. Remove a real manual plug from the water pipe.",
    "status": "NOT WORKING",
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
    "cue": "Draft. The taller water column squeezes trapped air, draft.",
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
    "cue": "Draft. A short sealed column stands above the bath; its vacuum is unresolved, draft.",
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
    "cue": "Draft. Smoke marks the cave; weather pressure is not connected yet, draft.",
    "status": "NOT WORKING",
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
      "wss-drafts-fire-smoke"
    ],
    "loaderDependencies": [
      "wss-boundaries",
      "wss-hands",
      "wss-native",
      "wss-sound",
      "wss-drafts-pressure",
      "wss-drafts-fire-smoke"
    ],
    "blocker": "Changing room pressure preserving trapped native gas is absent; the smoke is a separate passive field.",
    "behaviorPlan": {
      "seed": 17,
      "seconds": 6,
      "key": "Actual cave and mouth with zero-momentum smoke tracer. This is a progress screenshot, not breathing.",
      "action": "Use existing machinePrimary once after a short observation. Steam toggles the actual heater; cave and ram use real manual valves; Venturi/trompe/water-hammer/Torricelli use physical caps. Clock primary pours real water, skip for closed inventory check.",
      "statusIfObserved": "PARTLY"
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
    "status": "NOT WORKING",
    "pool": false,
    "cue": "Draft. Grab the elastic cup around the block; air actuation is not connected.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Real elastic cup and rigid payload only; pressurized channel actuation is absent.",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 4,
      "action": "Use actual Grab on the elastic cup",
      "key": "Cup and rigid payload remain finite; pneumatic grasp is absent.",
      "statusIfObserved": "NOT WORKING"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ]
  },
  {
    "id": "suction-cup",
    "capability": "Water slimes",
    "title": "Suction cup",
    "status": "NOT WORKING",
    "pool": false,
    "cue": "Draft. Press the elastic cup against the shelf; vacuum adhesion is not connected.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Cup deformation and terrain contact only; sealed cavity and vacuum adhesion are absent.",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 4,
      "action": "Use actual Grab to press cup toward shelf",
      "key": "Ordinary terrain contact remains finite; vacuum adhesion is absent.",
      "statusIfObserved": "NOT WORKING"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ]
  },
  {
    "id": "water-rocket",
    "capability": "Water slimes",
    "title": "Water rocket",
    "status": "NOT WORKING",
    "pool": false,
    "cue": "Draft. A slit releases native water; compressed-air launch is not connected.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Slit membrane releases real water; compressed gas and gas-to-water launch work are absent.",
    "dependencies": [
      "wss-water-balloons",
      "wss-machines/water-balloons",
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 6,
      "actionAtSeconds": 2,
      "action": "machinePrimary applies balanced hand squeeze to open skin",
      "key": "Real slit releases native water; no compressed gas or launch claim.",
      "statusIfObserved": "NOT WORKING"
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
    "id": "slime-submarine",
    "capability": "Water slimes",
    "title": "Slime submarine",
    "status": "NOT WORKING",
    "pool": false,
    "cue": "Draft. Drop the slime into water; a carried ballast tank is not connected.",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "blocker": "Passive gel and native water only; carried ballast water and changing payload mass are absent.",
    "dependencies": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
    ],
    "behaviorPlan": {
      "seconds": 4,
      "action": "Use actual Grab to move passive gel into the pool",
      "key": "Ordinary body-water interaction remains finite; ballast dive is absent.",
      "statusIfObserved": "NOT WORKING"
    },
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-bodies",
      "wss-drafts-creatures"
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
    "cue": "Draft. Pour into the high tank and watch the return loops.",
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
    "cue": "Draft. Pour water beside the loose substrate.",
    "status": "NOT WORKING",
    "draft": true,
    "world": {
      "w": 720,
      "h": 400
    },
    "pool": false,
    "dependencies": [
      "wss-drafts-fluid-machines",
      "liquid-material-slip-wgpu"
    ],
    "accepted": true,
    "preview": "cup",
    "scripts": [
      "wss-drafts-fluid-machines",
      "liquid-material-slip-wgpu"
    ]
  },
  {
    "id": "glacial-flood",
    "capability": "Ice",
    "title": "Glacial flood",
    "cue": "Draft. Grab the floating barrier stand-in at the lake outlet.",
    "status": "NOT WORKING",
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
    "cue": "Draft. Grab the piston and drive water toward the asymmetric loops.",
    "status": "NOT WORKING",
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
    "cue": "Draft. Grab the air-pump piston above a dry siphon.",
    "status": "NOT WORKING",
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
    var paths=['wss-boundaries','wss-hands','wss-native','wss-sound'];
    if(id==='float-slider-cistern')paths.push('wss-float-slider');
    if(id==='air-hose')paths.push('wss-bubbles');
    if(id==='douse-fire')paths.push('wss-fire');
    if(id==='kettle' || id==='singing-pipe')paths.push('wss-steam');
    if(id==='singing-pipe')paths.push('wss-singing-pipe');
    if(id==='smoke-ring-cannon' || id==='smoke-wind-tunnel')paths.push('wss-smoke-cannon');
    if(id==='smoke-wind-tunnel')paths.push('wss-smoke-wind-tunnel');
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
