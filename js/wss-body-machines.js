/* Moving water loads, constrained carriers and active elastic skins. */
(function (root) {
  "use strict";
  var ids = [
    "water-balloon-fight",
    "squid-jet",
    "shishi-odoshi",
    "lift-lock",
    "ballast-railway",
    "fountain-rider",
    "canal-locks",
    "jellyfish",
    "slime-mail",
    "pitcher-pump",
    "super-soaker",
    "slime-sipper",
    "spray-bottle",
  ];
  var originals = {};
  function rect(x, y, width, height) {
    return { x: x, y: y, width: width, height: height };
  }
  function base(id, w, o) {
    return originals[id](w, o || {});
  }
  function mechanism(id, w, o) {
    o = o || {};
    var d = base(id, w, o);
    d.bodyMachine = { kind: id };
    if (
      id === "shishi-odoshi" ||
      id === "lift-lock" ||
      id === "ballast-railway"
    ) {
      d.slimes = [];
      delete d.draftRig;
      d.vessels = [
        {
          id: "collector",
          label: "Recycling collector",
          rect: rect(64, 352, 592, 32),
          sealed: false,
        },
      ];
      d.pipes = [];
      d.solids = [];
      d.parts = [];
      d.vents = [];
      d.initial = [];
      d.settings = { enabled: false };
      d.boundaries = {
        pool: true,
        reserveCapacity: 22000,
        tap: {
          x: 440,
          y: 72,
          width: 8,
          height: 4,
          rate: 750,
          vx: 0,
          vy: 12,
          enabled: o.tapEnabled !== false,
        },
        drain: rect(72, 368, 576, 8),
      };
      d.measure = { source: d.vessels[0].rect, receiver: d.vessels[0].rect };
      d.primary = { kind: "tap" };
      d.action = o.tapEnabled === false ? "Start water" : "Stop water";
      d.setups = [
        { id: "water", label: "Water on", options: {} },
        {
          id: "dry",
          label: "Dry control",
          options: { tapEnabled: false, dry: true },
        },
      ];
      d.bodyMachine.kind = id;
      d.viewBounds = rect(56, 48, 608, 336);
      if (id === "shishi-odoshi") {
        d.caption =
          "Water fills the bamboo trough until its weight tips it. The emptied trough swings back under its counterweight.";
        d.bodyMachine.cups = [
          { x: 352, y: 232, left: -12, right: 104, top: -36, bottom: 0 },
        ];
      } else {
        var railway = id === "ballast-railway";
        d.bodyMachine.cups = [
          { x: 224, y: 152, left: -48, right: 48, top: -40, bottom: 0 },
          { x: 496, y: 296, left: -48, right: 48, top: -40, bottom: 0 },
        ];
        d.bodyMachine.railway = railway;
        d.bodyMachine.travel = 144;
        d.boundaries.tap.x = 224;
        d.boundaries.tap.y = 64;
        d.boundaries.tap.rate = 950;
        d.initial = [
          { kind: "rect", rect: rect(180, 116, 88, 30) },
          { kind: "rect", rect: rect(452, 260, 88, 28) },
        ];
        if (o.dry) d.initial = [];
        d.caption = railway
          ? "Fill the upper car with water. Its added ballast pulls the linked car uphill. Open the drains to unload both cars."
          : "Add water to the upper caisson. Its extra weight lowers it and raises the other through their common hydraulic link. Drain to unload.";
      }
      d.boundaryNote =
        "Actual native water is carried by the drawn moving cup walls. Current parcel positions determine water weight and its moment. Gravity drives the trough or linked carriers against finite inertia and bearing drag. The common link has one constrained coordinate; stops absorb impacts. No body travel or tipping time is prescribed. The labeled recycling supply supplies lifting work.";
      d.energyBudgetStatus =
        "The moving-container load model accounts for water weight and carrier inertia. Native water handles filling, spilling and draining. Readback delays loads, and the load closure does not resolve all impact momentum or mechanical work.";
    } else if (
      id === "squid-jet" ||
      id === "jellyfish" ||
      id === "slime-sipper"
    ) {
      d.membrane.slit = true;
      d.membrane.valveSlit = 5;
      d.bodyMachine.kind = "skin";
      d.bodyMachine.sipper = id === "slime-sipper";
      d.bodyMachine.swimmer = id === "jellyfish";
      d.primary = { kind: "runtime" };
      d.action =
        id === "slime-sipper" ? "Expand to drink" : "Start contractions";
      d.draftGravity = id === "squid-jet" ? 0 : d.draftGravity;
      if (id === "jellyfish") {
        d.slimes = [{ x: 360, y: 264, radius: 32 }];
        d.vessels = [
          {
            id: "pool",
            label: "Water",
            rect: rect(224, 184, 272, 200),
            sealed: false,
          },
        ];
        d.initial = [{ kind: "rect", rect: rect(232, 224, 256, 152) }];
        d.membrane.seedBoth = true;
      }
      if (id === "slime-sipper") {
        d.slimes = [{ x: 360, y: 300, radius: 38 }];
        d.vessels = [
          {
            id: "pool",
            label: "Water",
            rect: rect(112, 176, 496, 208),
            sealed: false,
          },
        ];
        d.initial = [{ kind: "rect", rect: rect(136, 240, 448, 136) }];
        d.membrane.seedBoth = true;
        d.membrane.valveSlit = 0;
      }
      d.measure = { source: d.vessels[0].rect, receiver: d.vessels[0].rect };
      d.caption =
        id === "slime-sipper"
          ? "Expand the elastic skin to draw water through its mouth. Squeeze it to return the same water."
          : "Start the muscle contractions. The opening lets water escape while the native contact reaction pushes the skin.";
      d.boundaryNote =
        "A declared muscle changes elastic rest area and spring lengths, supplying contraction and expansion work. Node positions and water velocities are never prescribed. A real gap in the membrane admits or discharges native water. The native contact ledger supplies the opposite reaction to the gel. Drag the body or stop the muscle at any time.";
      if (id === "jellyfish")
        d.boundaryNote +=
          " Its declared material density equals water density; the host applies approximate one-way buoyancy using the measured native-water surface.";
      d.energyBudgetStatus =
        "This elastic actuator supplies explicit external muscle work. Membrane contact returns native liquid impulse. Delayed coupling and numerical elastic/contact work are not a closed energy budget.";
    } else if (id === "water-balloon-fight") {
      d.caption =
        "Grab and throw the filled balloon at the two slimes. A hard impact bursts the skin and releases its original water.";
      d.bodyMachine.kind = "impact";
      d.boundaryNote +=
        " A moving unheld balloon bursts only when a hard native body contact overlaps a target. The rupture removes the membrane and keeps every native water parcel.";
    } else if (id === "canal-locks") {
      // Sluices equalize water below the boat; full-height gates permit its passage.
      d.vents = [rect(280, 184, 24, 184), rect(424, 248, 24, 120)];
      d.parts = [
        {
          id: "upper-gate",
          type: "valve",
          rect: rect(288, 184, 8, 184),
          open: false,
        },
        {
          id: "lower-gate",
          type: "valve",
          rect: rect(432, 248, 8, 120),
          open: false,
        },
      ];
      d.caption =
        "Open the upper gate to fill the lock and lift its boat. Close it, then open the lower gate to lower the boat. Drag the boat through an open gate.";
      d.boundaryNote =
        "Finite native water equalizes through the real full-height gates. The button closes one gate before opening the other. The boat follows the existing approximate buoyancy and drag and can be grabbed through an open passage. No level or boat path is prescribed.";
    } else if (id === "fountain-rider") {
      d.boundaries.tap.enabled = o.tapEnabled !== false;
      d.setups = [
        { id: "water", label: "Water on", options: {} },
        { id: "dry", label: "Water off", options: { tapEnabled: false } },
      ];
      d.boundaries.tap.rate = 2100;
      d.boundaries.tap.width = 32;
      d.boundaries.tap.vy = -440;
      d.slimes = [{ x: 360, y: 292, radius: 18 }];
      d.solids = [
        rect(320, 40, 8, 304),
        rect(392, 40, 8, 304),
        rect(320, 40, 80, 8),
      ];
      d.caption =
        "The upward jet lifts the light slime between its guides. Stop the water and it falls into the collector.";
      d.boundaryNote =
        "The visible nozzle admits native water upward at 440 pixels per simulation second. Lateral guide walls keep the light gel above the stream while the collector recycles runoff through the powered supply. The shared liquid-to-gel buoyancy and drag approximation supplies lift; there is no height target or additional lifting force.";
    } else if (id === "slime-mail") {
      d.slimes = [{ x: 312, y: 200, radius: 18 }];
      d.setups = [
        { id: "ordinary", label: "Strike the drumhead", options: {} },
        { id: "no-push", label: "No push", options: { noPush: true } },
      ];
      d.caption =
        "Pulse the rear chamber to send the slime through the delivery tube. Repeated pulses add real air momentum.";
    } else if (id === "pitcher-pump" || id === "super-soaker") {
      d.bodyMachine.kind = "pump";
      d.bodyMachine.accumulator = id === "super-soaker";
      if (id === "pitcher-pump") {
        d.pipes[1].points = [
          { x: 416, y: 344 },
          { x: 552, y: 344 },
          { x: 552, y: 160 },
          { x: 608, y: 160 },
        ];
        d.parts[1].rect = rect(448, 332, 16, 24);
        d.divers.piston = rect(280, 216, 160, 16);
        d.divers.stroke = 88;
        d.divers.speed = 68;
        d.initial = [
          { kind: "rect", rect: rect(88, 208, 144, 168) },
          { kind: "rect", rect: rect(288, 236, 144, 140) },
        ];
        d.caption =
          "Move the piston down to deliver water, then raise it to refill. The two check valves keep each stroke moving water toward the spout.";
        d.boundaryNote =
          "The primed chamber, supply and receiver contain finite native water. The visible piston supplies external work. Its outlet stays below the complete piston stroke; sampled pressure opens and closes both real check valves. No water is moved between vessels by the control.";
      } else {
        d.divers.stroke = 32;
        d.divers.speed = 12;
        d.divers.squeezed = o.charged !== false;
        d.setups = [
          { id: "charged", label: "Charge air", options: {} },
          {
            id: "uncharged",
            label: "No compression",
            options: { charged: false },
          },
        ];
        d.vents = [];
        d.parts[0].rect = rect(536, 264, 16, 16);
        d.caption =
          "Compress the air, then open the trigger. Stored pressure sends the finite water charge through the nozzle.";
        d.boundaryNote =
          "The driven piston compresses a finite sealed air pocket above native water. The trigger spans the actual pipe bore, with no bypass vent. Opening it releases the stored pressure through the nozzle; the air-piston control can release or repeat compression. The finite charge is conserved in the tank, jet and spill.";
      }
    } else if (id === "spray-bottle") {
      // Use a sealed driven piston chamber, preserving the existing native checks.
      var original = base("pitcher-pump", w, o),
        supply = rect(72, 176, 136, 208),
        pump = rect(320, 120, 64, 232),
        catcher = rect(520, 288, 152, 96);
      d = Object.assign(original, {
        name: id,
        title: "Spray bottle",
        bodyMachine: { kind: "pump", spray: true },
        slimes: [],
        vessels: [
          { id: "pump", label: "Trigger pump", rect: pump, sealed: true },
          { id: "supply", label: "Water supply", rect: supply, sealed: false },
          {
            id: "catcher",
            label: "Spray collector",
            rect: catcher,
            sealed: false,
          },
        ],
        pipes: [
          {
            points: [
              { x: 192, y: 320 },
              { x: 344, y: 320 },
            ],
            bore: 24,
          },
          {
            points: [
              { x: 360, y: 296 },
              { x: 432, y: 296 },
              { x: 432, y: 128 },
              { x: 560, y: 128 },
            ],
            bore: 16,
          },
        ],
        parts: [
          {
            id: "inlet",
            type: "check",
            rect: rect(240, 308, 16, 24),
            direction: "right",
            open: false,
            crackingPressure: 0,
            hysteresis: 0.05,
          },
          {
            id: "outlet",
            type: "check",
            rect: rect(400, 284, 16, 24),
            direction: "right",
            open: false,
            crackingPressure: 0,
            hysteresis: 0.05,
          },
        ],
        initial: [
          { kind: "rect", rect: rect(80, 208, 120, 168) },
          { kind: "rect", rect: rect(328, 204, 48, 140) },
        ],
        measure: { source: supply, receiver: catcher },
        viewBounds: rect(56, 64, 624, 320),
        action: "Press trigger",
        primary: { kind: "diver-squeeze" },
        caption:
          "Press the trigger to expel a dose through the nozzle. Release it to refill the chamber through the inlet check.",
      });
      d.divers = Object.assign({}, original.divers, {
        piston: rect(320, 176, 64, 16),
        stroke: 80,
        speed: 120,
        squeezed: false,
        labels: { on: "Release trigger", off: "Press trigger" },
      });
      delete d.draftRig;
      d.boundaryNote =
        "The trigger drives a sealed native piston chamber. Sampled pressure opens the outlet check on the downstroke and the inlet check while returning. Finite supply water travels through the actual pipes and nozzle into the collector. The motor supplies work; the control does not inject or teleport water.";
    }
    return d;
  }
  function snapshot(c) {
    var L = c.liquid,
      a = L.liquid.arrays;
    return {
      count: L.liquid.getCount(),
      x: a.x,
      y: a.y,
      vx: a.vx,
      vy: a.vy,
      type: a.type,
      clock: L.readbackAppliedTime,
    };
  }
  function polygon(cup, local, angle, vx, vy, omega) {
    var pts = [],
      co = Math.cos(angle),
      si = Math.sin(angle),
      l = Infinity,
      r = -Infinity,
      t = Infinity,
      z = -Infinity;
    for (var i = 0; i < local.length; i += 2) {
      var x = local[i] * co - local[i + 1] * si,
        y = local[i] * si + local[i + 1] * co;
      pts.push(cup.x + x, cup.y + y, vx - omega * y, vy + omega * x);
      l = Math.min(l, cup.x + x);
      r = Math.max(r, cup.x + x);
      t = Math.min(t, cup.y + y);
      z = Math.max(z, cup.y + y);
    }
    return {
      x: (l + r) / 2,
      y: (t + z) / 2,
      hw: (r - l) / 2 + 0.01,
      hh: (z - t) / 2 + 0.01,
      mvx: vx,
      mvy: vy,
      pts: pts,
    };
  }
  function createLoads(c) {
    var d = c.definition,
      s = d.bodyMachine,
      cups = s.cups.map(function (v) {
        return Object.assign({}, v);
      }),
      L = c.liquid;
    var angle = -0.25,
      speed = 0,
      position = 0,
      clock = L.simulationClock,
      drains = false,
      counts = cups.map(function () {
        return 0;
      }),
      loads = cups.map(function () {
        return 0;
      }),
      moments = loads.slice(),
      cycles = 0,
      tipped = false,
      torque = 0,
      inertia = 1,
      retired = false,
      peak = 0,
      travel = s.travel || 0;
    function poses() {
      if (cups.length === 1) return;
      var q = position,
        dx = s.railway ? q * 0.45 : 0;
      cups[0].x = s.cups[0].x + dx;
      cups[0].y = s.cups[0].y + q;
      cups[1].x = s.cups[1].x - dx;
      cups[1].y = s.cups[1].y - q;
    }
    function guests() {
      poses();
      var out = [],
        a = cups.length === 1 ? angle : 0,
        ts = 1;
      cups.forEach(function (p, k) {
        var vx =
            cups.length === 1 ? 0 : s.railway ? speed * 0.45 * (k ? -1 : 1) : 0,
          vy = cups.length === 1 ? 0 : speed * (k ? -1 : 1),
          omega = cups.length === 1 ? speed : 0,
          left = p.left,
          right = p.right,
          top = p.top,
          bt = p.bottom,
          gap = drains ? 20 : 0;
        [
          [left - 5, top, left, top, left, bt + 5, left - 5, bt + 5],
          [right, top, right + 5, top, right + 5, bt + 5, right, bt + 5],
          [left, bt, -gap / 2, bt, -gap / 2, bt + 5, left, bt + 5],
          [gap / 2, bt, right, bt, right, bt + 5, gap / 2, bt + 5],
        ].forEach(function (shape, wall) {
          if (cups.length === 1 && wall === 1) return;
          if (shape[2] === shape[0]) return;
          out.push(polygon(p, shape, a, vx / ts, vy / ts, omega / ts));
        });
      });
      return out;
    }
    function measure() {
      poses();
      var sample = snapshot(c),
        a = cups.length === 1 ? angle : 0,
        co = Math.cos(a),
        si = Math.sin(a);
      counts.fill(0);
      moments.fill(0);
      for (var i = 0; i < sample.count; i++) {
        if (sample.type[i] !== 0) continue;
        for (var k = 0; k < cups.length; k++) {
          var p = cups[k],
            dx = sample.x[i] - p.x,
            dy = sample.y[i] - p.y,
            x = dx * co + dy * si,
            y = -dx * si + dy * co;
          if (x > p.left && x < p.right && y > p.top && y < p.bottom) {
            counts[k]++;
            moments[k] += dx * 0.002;
          }
        }
      }
      loads = counts.map(function (n) {
        return n * 0.002;
      });
    }
    function advance(dt) {
      if (retired || !(dt > 0)) return;
      measure();
      var g = L.getSimParam("GRAVITY"),
        remaining = Math.min(0.1, dt);
      while (remaining > 0) {
        var h = Math.min(remaining, 1 / 240);
        remaining -= h;
        if (cups.length === 1) {
          inertia = 0.8 * 30 * 30 + loads[0] * 48 * 48;
          torque =
            g *
            (moments[0] - 0.8 * (20 * Math.cos(angle) + 8 * Math.sin(angle)));
          speed = (speed + (torque / inertia) * h) / (1 + 1.5 * h);
          angle += speed * h;
          if (angle < -0.25) {
            angle = -0.25;
            if (speed < 0) speed *= -0.08;
          }
          if (angle > 1.18) {
            angle = 1.18;
            if (speed > 0) speed *= -0.08;
          }
          if (angle > 0.7) tipped = true;
          if (tipped && angle < 0) {
            cycles++;
            tipped = false;
          }
          peak = Math.max(peak, angle);
        } else {
          inertia = (4 + loads[0] + loads[1]) * (s.railway ? 1.2025 : 1);
          torque = g * (loads[0] - loads[1]);
          speed = (speed + (torque / inertia) * h) / (1 + 0.6 * h);
          position += speed * h;
          if (position < 0) {
            position = 0;
            if (speed < 0) speed = 0;
          }
          if (position > travel) {
            position = travel;
            if (speed > 0) speed = 0;
          }
          peak = Math.max(peak, position);
        }
      }
      poses();
    }
    return {
      smoke: false,
      guests: guests,
      tick: function () {
        var now = L.simulationClock;
        advance(now - clock);
        clock = now;
      },
      controls: function () {
        return cups.length > 1
          ? [
              {
                id: "drain-cars",
                label: drains ? "Close ballast drains" : "Open ballast drains",
                x: 360,
                y: 328,
                width: 170,
                height: 44,
                pressed: drains,
                kind: "runtime",
                pointerMode: "button",
              },
            ]
          : [];
      },
      activate: function (id) {
        if (id !== "drain-cars") return false;
        drains = !drains;
        return true;
      },
      draw: function (ctx) {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        guests().forEach(function (g) {
          ctx.beginPath();
          for (var i = 0; i < g.pts.length; i += 4) {
            if (i) ctx.lineTo(g.pts[i], g.pts[i + 1]);
            else ctx.moveTo(g.pts[i], g.pts[i + 1]);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
        ctx.beginPath();
        if (cups.length === 1) {
          ctx.moveTo(cups[0].x, cups[0].y);
          ctx.lineTo(cups[0].x, 350);
          ctx.arc(cups[0].x, cups[0].y, 5, 0, Math.PI * 2);
          var cw = polygon(
            cups[0],
            [-28, 0, -12, 0, -12, 16, -28, 16],
            angle,
            0,
            0,
            0,
          );
          ctx.moveTo(cups[0].x, cups[0].y);
          ctx.lineTo(cw.x, cw.y);
          for (var wi = 0; wi < cw.pts.length; wi += 4) {
            if (wi) ctx.lineTo(cw.pts[wi], cw.pts[wi + 1]);
            else ctx.moveTo(cw.pts[wi], cw.pts[wi + 1]);
          }
          ctx.closePath();
        } else {
          cups.forEach(function (p, k) {
            var a = s.cups[k],
              dir = k ? -1 : 1;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(
              a.x + (s.railway ? travel * 0.45 * dir : 0),
              a.y + travel * dir,
            );
          });
          if (s.railway) {
            ctx.moveTo(cups[0].x, cups[0].y);
            ctx.lineTo(360, 64);
            ctx.lineTo(cups[1].x, cups[1].y);
          } else {
            ctx.moveTo(cups[0].x, cups[0].y);
            ctx.lineTo(cups[0].x, 344);
            ctx.lineTo(cups[1].x, 344);
            ctx.lineTo(cups[1].x, cups[1].y);
            cups.forEach(function (p) {
              ctx.rect(p.x - 6, p.y + 3, 12, 14);
            });
          }
        }
        ctx.stroke();
        ctx.restore();
      },
      stats: function () {
        return {
          kind: s.kind,
          counts: counts.slice(),
          masses: loads.slice(),
          angle: angle,
          position: position,
          speed: speed,
          torque: torque,
          inertia: inertia,
          cycles: cycles,
          peak: peak,
          drains: drains,
          finite: [angle, position, speed, torque, inertia].every(
            Number.isFinite,
          ),
        };
      },
      destroy: function () {
        retired = true;
      },
    };
  }
  function createSkin(c) {
    var d = c.definition,
      b = c.bodies[0],
      m = c.membrane,
      s = d.bodyMachine;
    var active = false,
      expanded = false,
      phase = 0,
      scale = 1,
      originalArea = b.restArea;
    var rest = Array.from(b.sRest),
      clock = c.liquid.simulationClock,
      cycles = 0,
      peak = 0,
      retired = false;
    var start = { x: b.cx, y: b.cy };
    m.setSlit(true, s.sipper ? 0 : 5);
    if (s.swimmer) {
      // Neutral material density uses the host's measured native-water surface.
      // The membrane still receives the actual two-sided contact reaction.
      b.ballastBuoyancy = true;
      b.fluidDensityRatio = 1;
      b.nativePointMass = (originalArea * 0.002) / 1.5625 / b.n;
    }
    function actuate() {
      if (s.sipper) {
        expanded = !expanded;
        d.action = expanded ? "Squeeze to empty" : "Expand to drink";
        active = true;
      } else {
        active = !active;
        d.action = active ? "Stop contractions" : "Start contractions";
      }
      b.sleeping = false;
      b.sleepFrames = 0;
      return true;
    }
    return {
      smoke: false,
      primary: actuate,
      controls: function () {
        return [
          {
            id: "muscle",
            label: d.action,
            x: 360,
            y: 88,
            width: 184,
            height: 44,
            kind: "runtime",
            pointerMode: "button",
            pressed: s.sipper ? expanded : active,
          },
        ];
      },
      activate: function (id) {
        return id === "muscle" && actuate();
      },
      tick: function () {
        if (retired) return;
        var now = c.liquid.simulationClock,
          dt = Math.max(0, now - clock);
        clock = now;
        if (active && !s.sipper) {
          var before = phase;
          phase += dt;
          cycles += Math.floor(phase / 1.5) - Math.floor(before / 1.5);
        }
        var target = s.sipper
          ? active
            ? expanded
              ? 1.35
              : 0.78
            : 1
          : active
            ? 1 -
              0.28 *
                Math.pow(Math.max(0, Math.sin((phase * Math.PI * 2) / 1.5)), 2)
            : 1;
        scale += (target - scale) * (1 - Math.exp(-8 * dt));
        b.restArea = originalArea * scale * scale;
        for (var i = 0; i < b.springN; i++) b.sRest[i] = rest[i] * scale;
        if (active) {
          b.sleeping = false;
          b.sleepFrames = 0;
        }
        peak = Math.max(peak, Math.hypot(b.cx - start.x, b.cy - start.y));
      },
      stats: function () {
        var inventory = m.stats();
        return {
          active: active,
          expanded: expanded,
          scale: scale,
          cycles: cycles,
          displacement: Math.hypot(b.cx - start.x, b.cy - start.y),
          peakDisplacement: peak,
          slitCrossings: inventory.slitCrossings,
          inside: inventory.inside,
          carriedInside: inventory.carriedInside,
          finite: [b.cx, b.cy, scale].every(Number.isFinite),
        };
      },
      destroy: function () {
        retired = true;
        b.restArea = originalArea;
        for (var i = 0; i < b.springN; i++) b.sRest[i] = rest[i];
        if (s.swimmer) {
          delete b.ballastBuoyancy;
          delete b.fluidDensityRatio;
          delete b.nativePointMass;
        }
      },
    };
  }
  function createAccumulator(c) {
    return {
      smoke: false,
      controls: function () {
        var r = c.definition.divers.piston;
        return [
          {
            id: "air-piston",
            label: c.divers.stats().squeezed
              ? "Release air piston"
              : "Compress air",
            x: r.x + r.width * 0.5,
            y: r.y - 28,
            width: 176,
            height: 44,
            kind: "runtime",
            pointerMode: "button",
          },
        ];
      },
      activate: function (id) {
        if (id !== "air-piston") return false;
        var triggerLabel = c.definition.action;
        c.divers.toggle();
        c.definition.action = triggerLabel;
        return true;
      },
      destroy: function () {},
    };
  }
  function createImpact(c) {
    var b = c.bodies[0],
      m = c.membrane,
      last = { x: b.cx, y: b.cy },
      speed = 0,
      burst = false,
      clock = c.liquid.simulationClock;
    return {
      smoke: false,
      tick: function () {
        var now = c.liquid.simulationClock,
          dt = now - clock;
        if (!(dt > 0)) return;
        clock = now;
        var v = Math.hypot(b.cx - last.x, b.cy - last.y) / dt;
        last = { x: b.cx, y: b.cy };
        if (
          !burst &&
          speed > 110 &&
          !b._grabbed &&
          b._cHits > 0 &&
          c.bodies.slice(1).some(function (q) {
            return (
              b.bboxL < q.bboxR &&
              b.bboxR > q.bboxL &&
              b.bboxT < q.bboxB &&
              b.bboxB > q.bboxT
            );
          })
        ) {
          m.pop();
          c.removeBody(b);
          c.definition.primary = { kind: "runtime" };
          c.definition.action = "Popped";
          burst = true;
        }
        speed = v;
      },
      stats: function () {
        return { impactBurst: burst, speed: speed, popped: m.stats().popped };
      },
      destroy: function () {},
    };
  }
  var previous = root.WSSDraftRuntime;
  root.WSSDraftRuntime = {
    create: function (c) {
      var s = c.definition.bodyMachine;
      if (s && s.cups) return createLoads(c);
      if (s && s.kind === "skin") return createSkin(c);
      if (s && s.kind === "impact") return createImpact(c);
      if (s && s.accumulator) return createAccumulator(c);
      return previous && previous.create ? previous.create(c) : null;
    },
  };
  function install() {
    ids.forEach(function (id) {
      var current = root.WSSMachines[id];
      if (!current || current.bodyComplete) return;
      originals[id] = current.make;
      root.WSSMachines[id] = {
        bodyComplete: true,
        make: function (w, o) {
          return mechanism(id, w, o);
        },
      };
    });
  }
  root.WSSBodyMachines = {
    make: mechanism,
    install: install,
    createLoads: createLoads,
    createSkin: createSkin,
  };
  install();
})(typeof window !== "undefined" ? window : globalThis);
