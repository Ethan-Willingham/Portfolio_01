  /* ---- Update ---- */
  // ----- Drill SFX bridge state (engine facade: js/audio.js SluiceAudio.sfx.drill) -----
  // Persistent across frames; the per-frame logic lives in the drilling section
  // of update(). Every call is a safe no-op while assets/sfx/ is empty.
  // drillSfxStopT delays the grind release past the 0.24s bite-through glide so
  // chained digging reads as ONE continuous grind, not a spin-up per tile.
  var drillSfxActive = false;
  var drillSfxMat = null;
  var drillSfxStopT = 0;
  function drillSfx() {
    return (typeof SluiceAudio !== 'undefined' && SluiceAudio.sfx) ? SluiceAudio.sfx.drill : null;
  }
  // ----- Game-side SFX shims (the wiring session, SFX_BIBLE §10) -----
  // Every one-shot / loop call site in the game funnels through these so the
  // typeof guard + try/catch live in ONE place; all are safe no-ops while
  // js/audio.js is absent or assets/sfx/ is empty (graceful-skip ethos).
  function sfxPlay(name, opts) {
    if (typeof SluiceAudio !== 'undefined' && SluiceAudio && SluiceAudio.playSfx) {
      try { SluiceAudio.playSfx(name, opts); } catch (e) {}
    }
  }
  // Per-frame loop drive (engine watchdog fades it when calls stop — pause,
  // shop, tab-hide all self-silence). Call every frame the loop should sound.
  function sfxLoop(name, opts) {
    if (typeof SluiceAudio !== 'undefined' && SluiceAudio && SluiceAudio.sfxLoop) {
      try { SluiceAudio.sfxLoop(name, opts); } catch (e) {}
    }
  }
  // Runtime pan from a world X (SFX_BIBLE §2.12: mono assets, panned by
  // screen position). Soft ±0.8 cap so edge/off-screen events never hard-pan.
  function sfxPanAt(worldX) {
    var sc = (typeof worldScale === 'number' && worldScale > 0) ? worldScale : 2;
    var f = (((worldX - cam.x) * sc) / Math.max(1, viewW)) * 2 - 1;
    f *= 0.8;
    return f < -0.8 ? -0.8 : (f > 0.8 ? 0.8 : f);
  }
  function update(dt) {
    if (gameOver || gameWon || shopOpen) return;
    // v11.38 — ALL shop states freeze the world (was: only sub-pages).
    // Keeps the rig parked while shopping so leftover inertia doesn't
    // drift the player out by accident.
    if (UI_NEW && shopState !== 'closed') return;
    if (dt > 0.05) dt = 0.05;

    // Dock auto-sell reveal: advance the per-ore sequencer (it credits the bank
    // beat-by-beat) and ease the brass balance window up toward it, so a sale
    // reads as an odometer climb. cashPunch fades out after the finale beat.
    tickSellReveal(dt);
    if (money > displayMoney) {
      displayMoney += (money - displayMoney) * (1 - Math.exp(-dt / 0.13));
      if (money - displayMoney < 0.5) displayMoney = money;
    } else {
      displayMoney = money;
    }
    if (cashPunch > 0) cashPunch = Math.max(0, cashPunch - dt / 0.5);

    // ----- Hit-pause -----
    // When set by a high-impact event (drill tile-break, hard landings),
    // freeze game logic for a few frames while smoke + render continue.
    // The frozen frames read as a beat of weight; the brevity (33-50ms)
    // keeps it from becoming perceived input lag during chained drills.
    if (hitPauseT > 0) {
      hitPauseT -= dt;
      return;
    }

    // ----- Drill bite-through glide (position-targeted) -----
    // After a u/l/r tile-break we ease player.x/y by drillGlideDist over
    // drillGlideDur seconds along an easeOutQuad curve. We don't touch
    // vx/vy at all — gravity, friction, input, and collisions all keep
    // running normally underneath. Each frame we precompute the eased
    // target displacement and step toward it, but only if solidAt clears
    // the new position. Hitting a wall ends the glide cleanly with no
    // ricochet, no stutter.
    if (player.drillGlideT > 0) {
      // Perpendicular-axis lock — holds the rig on the drill axis for the
      // entire glide window. Without this, holding a horizontal direction
      // during a downward chain drift the rig sideways frame by frame and
      // eventually pulled it off-column.
      if (player.drillGlideLockX != null) { player.x = player.drillGlideLockX; player.vx = 0; }
      if (player.drillGlideLockY != null) { player.y = player.drillGlideLockY; player.vy = 0; }
      // Drill-axis velocity is left alone — input can build up normally,
      // capped by the TOP_SPEED / flyTune.maxFall clamps. We prevent the catapult by
      // skipping the drill-axis motion sweep below (glide owns position),
      // not by zeroing velocity. That way the rig exits the glide already
      // moving at natural cruise speed and there's no lurch.
      player.drillGlideT -= dt;
      var glideElapsed = player.drillGlideDur - Math.max(0, player.drillGlideT);
      var glideT01 = Math.min(1, Math.max(0, glideElapsed / player.drillGlideDur));
      // Smoothstep (3t² - 2t³): velocity at t=0 and t=1 is exactly zero,
      // peak speed in the middle. easeOutQuad was launching the rig at
      // t=0 when there was no second tile to brake against.
      var glideEase = glideT01 * glideT01 * (3 - 2 * glideT01);
      var targetTraveled = player.drillGlideDist * glideEase;
      var step = targetTraveled - player.drillGlideTraveled;
      if (step > 0.01) {
        var gnx = player.x, gny = player.y;
        if      (player.drillGlideDir === 'u') gny -= step;
        else if (player.drillGlideDir === 'd') gny += step;
        else if (player.drillGlideDir === 'l') gnx -= step;
        else if (player.drillGlideDir === 'r') gnx += step;
        if (!solidAt(gnx, gny, PLAYER_W, PLAYER_H)) {
          player.x = gnx;
          player.y = gny;
          player.drillGlideTraveled = targetTraveled;
        } else {
          player.drillGlideT = 0;
        }
      }
      if (player.drillGlideT <= 0) {
        player.drillGlideDir = null;
        player.drillGlideLockX = null;
        player.drillGlideLockY = null;
      }
    }
    if (player.drillCooldownT > 0) player.drillCooldownT -= dt;

    // Rover-balloon drop overrides normal physics + input. Returns true if
    // it handled this frame, false if normal physics should run.
    if (roverMode) {
      updateRover(dt);
      // Update bookkeeping that should always run regardless of mode
      var depthCur = Math.max(0, Math.floor((player.y / TILE) - SKY_ROWS + 1));
      if (depthCur > depthRecord) depthRecord = depthCur;
      var curLayerR = depthCur >= 0 ? getLayerForRegion(depthCur, playerTownIndex()) : null;
      if (curLayerR && lastLayer && curLayerR.name !== lastLayer.name) {
        layerBanner = { name: curLayerR.name, t: 1.8 };
      }
      lastLayer = curLayerR;
      if (layerBanner) {
        layerBanner.t -= dt;
        if (layerBanner.t <= 0) layerBanner = null;
      }
      // (msgTimer is now ticked in loop() so it counts down regardless of
      //  game state — no need to decrement here.)
      return;
    }

    // Input
    var moveL = keys['ArrowLeft'] || keys['a'] || keys['A'] || dpad.left;
    var moveR = keys['ArrowRight'] || keys['d'] || keys['D'] || dpad.right;
    if (devMode) { jelloDbg.input = (moveR ? 1 : 0) - (moveL ? 1 : 0); jelloDbg.onJello = false; jelloDbg.carryReal = 0; jelloDbg.effCarry = 0; jelloDbg.injected = 0; }
    player.jelloGroundT = Math.max(0, (player.jelloGroundT || 0) - dt);   // coyote: "on a cube top" debounce (refreshed when grounded; gates fling+plow through the onJello flicker)
    var moveU = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '] || keys['Space'] || keys['Spacebar'] || dpad.up;
    var moveD = keys['ArrowDown'] || keys['s'] || keys['S'] || dpad.down;

    // Edge detection — true only on the frame an input was just pressed.
    // Powers "instant tap kick" on horizontal taps and the jet input buffer.
    player.edgeMoveL = moveL && !player.lastMoveL;
    player.edgeMoveR = moveR && !player.lastMoveR;
    player.edgeMoveU = moveU && !player.lastMoveU;
    player.edgeMoveD = moveD && !player.lastMoveD;
    player.lastMoveL = moveL;
    player.lastMoveR = moveR;
    player.lastMoveU = moveU;
    player.lastMoveD = moveD;

    var inputDir = moveR && !moveL ? 1 : (moveL && !moveR ? -1 : 0);
    if (inputDir) player.dir = inputDir;

    // Pump pad: free refuel + auto-sell while standing on it
    if (playerOnPumpPad()) {
      if (!sellReveal && (cargo.length > 0 || oilGallons > 0)) sellCargo(true);
      var maxF = getMaxFuel();
      var maxH = getMaxHull();
      if (player.fuel < maxF) {
        player.fuel = Math.min(maxF, player.fuel + maxF * 0.6 * dt);
        player.refueling = true;
        // The dock tank-fill loop (runs while the haul sells too; the sell
        // ticks ride over it — project_autosell_reveal). Watchdogged.
        sfxLoop('fuel-fill', { gain: 0.8 });
      } else {
        player.refueling = false;
      }
      if (player.hull < maxH) {
        player.hull = Math.min(maxH, player.hull + maxH * 0.4 * dt);
      }
    } else {
      player.refueling = false;
    }

    // Fuel drain — only while actively exerting. Sitting still or just
    // falling (gravity does the work) shouldn't burn fuel.
    var horizontallyMoving = moveL || moveR || Math.abs(player.vx) > 5;
    // NMZ storm shear (085-combat.js helper): above the flak deck inside a
    // No Man's Zone the jetstream cuts groundspeed and multiplies fuel burn,
    // so a high crossing is slow and expensive instead of free. Returns
    // {speed:1, fuel:1} everywhere else; null until the combat fragment loads.
    var nmzShear = (typeof nmzShearFactor === 'function') ? nmzShearFactor(player.x + PLAYER_W / 2, player.y) : null;
    var doingSomething = drilling ||
                         player.thrusting ||
                         horizontallyMoving;
    if (doingSomething) {
      player.fuel -= FUEL_DRAIN * (nmzShear ? nmzShear.fuel : 1) * dt;
    }
    if (player.fuel <= 0) {
      player.fuel = 0;
      if (!playerOnPumpPad()) {
        if (reserveFuel > 0) {
          // Reserve tank auto-deploys the instant the main tank runs dry —
          // a one-shot emergency top-up, spent before any hull damage.
          reserveFuel--;
          player.fuel = Math.min(getMaxFuel(), RESERVE_FUEL_REFILL);
          showMsg('RESERVE TANK DEPLOYED, ' + reserveFuel + ' LEFT', true);
        } else {
          // No reserve left — hull starts taking damage. Periodic on-screen
          // warning so the player knows what's killing them.
          player.hull -= 20 * dt;
          fuelWarnTimer = (fuelWarnTimer || 0) - dt;
          if (fuelWarnTimer <= 0) {
            showMsg('OUT OF FUEL, HULL FAILING', true);
            fuelWarnTimer = 3;
          }
          if (player.hull <= 0) { endGame({ type: 'fuel' }); return; }
        }
      }
    }

    // Magma / mantle layer: hull drains without sufficient heat shield
    var depthNow = Math.max(0, Math.floor(player.y / TILE) - SKY_ROWS);
    var layerNow = getLayerForRegion(depthNow, playerTownIndex());
    if (layerNow.dangerous && layerNow.requiresShield) {
      // shield 0: full damage, 1: half, 2: immune
      var shieldFactor = upgrades.shieldLevel === 0 ? 1.0 : (upgrades.shieldLevel === 1 ? 0.4 : 0);
      if (shieldFactor > 0) {
        player.hull -= 8 * shieldFactor * dt;
        // The hull sizzling in the heat — the audio twin of the warning
        // message below (a full heat shield is immune AND silent).
        sfxLoop('lava-sizzle', { gain: 0.45 + 0.55 * shieldFactor });
        // Periodic warning
        magmaWarnTimer = (magmaWarnTimer || 0) - dt;
        if (magmaWarnTimer <= 0) {
          showMsg(upgrades.shieldLevel === 0 ? 'No heat shield, hull damage!' : 'Hull stressed by heat', true);
          magmaWarnTimer = 4;
        }
        if (player.hull <= 0) { endGame({ type: 'magma', heat: Math.round((600 + depthNow * 12) / 10) * 10 }); return; }
      }
    }

    // ====== UPDATE: Drilling ======
    if (drilling) {
      // Cancel mid-drill if the player releases the direction key.
      // Partial damage to the tile persists so they can resume later.
      var stillHolding = false;
      if (drilling.dirVec === 'd') stillHolding = moveD;
      else if (drilling.dirVec === 'u') stillHolding = moveU;
      else if (drilling.dirVec === 'l') stillHolding = moveL;
      else if (drilling.dirVec === 'r') stillHolding = moveR;
      if (!stillHolding) {
        drilling = null;
      } else {
        drilling.timer -= dt;
        drilling.shake = (drilling.shake || 0) + dt * 30;
        // Anticipation squash: progresses 0 -> 0.12 over the drill duration.
        // Builds tension toward the break frame so the eye is primed for
        // the bigger squash spike that lands on tile-clear. Doesn't gate
        // damage (research: anticipation runs *during* the active phase).
        var drillProg = 1 - drilling.timer / drillHitTime();
        if (drillProg > 0) {
          var antic = 0.05 + drillProg * 0.30;     // 0.05 -> 0.35 over the drill
          if (player.squash < antic) player.squash = antic;
        }
        // ----- Drill SFX: the grind follows the live dig -----
        // start() handles spin-up + the per-material body (and crossfades on a
        // material change); speed tracks the drill tier; progress drives the
        // anticipation pitch rise toward the break frame.
        var _dsfx = drillSfx();
        if (_dsfx) {
          var _dTile = (world[drilling.r] && world[drilling.r][drilling.c]) || null;
          var _dMat = _dTile ? _dTile.type : 'dirt';
          if (!drillSfxActive || drillSfxMat !== _dMat) {
            _dsfx.start(_dMat);
            _dsfx.setSpeed(Math.min(1, (DRILL_SPEED[upgrades.drillLevel] || 1) / 3.25));
            drillSfxActive = true;
            drillSfxMat = _dMat;
          }
          _dsfx.setProgress(Math.max(0, Math.min(1, drillProg)));
          drillSfxStopT = 0;
        }
        if (drilling.timer <= 0) {
          var dArr = world, dIdx = drilling.r;
          var tile = (dArr[dIdx] && dArr[dIdx][drilling.c]) || null;
          if (tile) {
            // Copy-on-write: filler dirt/stone are shared frozen flyweight
            // prototypes; clone to a mutable tile before damaging it so the
            // shared instance is never mutated (frozen would throw in strict).
            if (Object.isFrozen(tile)) {
              tile = { type: tile.type, hp: tile.hp, shiny: tile.shiny };
              dArr[dIdx][drilling.c] = tile;
            }
            tile.hp -= 1;
            if (tile.hp <= 0) {
              // Collect — but not dirt or stone (they're worthless rubble)
              var oreType = tile.type;
              var oreDef = ORES[oreType];
              if (oreType !== 'dirt' && oreType !== 'stone') {
                if (cargo.length < maxCargo) {
                  var _sh = !!(tile && tile.shiny);
                  cargo.push({ type: oreType, shiny: _sh });
                  if (typeof ledgerRecordOre === 'function') ledgerRecordOre(oreType, _sh);
                  if (typeof SluiceAudio !== 'undefined' && SluiceAudio.playSfx) SluiceAudio.playSfx('ore-pickup');
                  // ----- Change 5: floating "+$X Item" text at the tile
                  var fwx = drilling.c * TILE + TILE / 2;
                  var fwy = drilling.r * TILE + TILE / 2;
                  spawnFloater(fwx, fwy,
                    (_sh ? 'Shiny ' : '') + oreDef.label + ' +$' + cargoUnitValue({ type: oreType, shiny: _sh }),
                    _sh ? '#ffe6a0' : floaterColorFor(oreType), true);
                  // Notify (loudly!) the moment we hit max so the player
                  // knows to head back. Mining is also gated below — we
                  // refuse to start a new dig once full so no ore is wasted.
                  if (cargo.length === maxCargo) {
                    showMsg('Cargo full!', true);
                    sfxPlay('cargo-full');
                  }
                }
              }
              dArr[dIdx][drilling.c] = null;
              markTerrainCleared(drilling.r, drilling.c, tile);
              // Break payoff fires on the same frame as the mine-break FX
              // (SFX_BIBLE: sound + visual share the frame or feel detached).
              var _bsfx = drillSfx();
              if (_bsfx) _bsfx.breakHit(tile.type);

              // ----- Tile-break "punch-through" feel -----
              // Three stacked effects on the break frame so the rig's bite
              // through the tile reads with weight (research: SteamWorld
              // Dig 2 + Hollow Knight + Drill Dozer):
              //
              // 1. Hit-pause — 33ms world freeze. Single biggest "weight"
              //    perception trick in the toolbox. >50ms compounds into
              //    perceived lag during chained drilling, so keep it tight.
              // 2. Punch-through velocity pop — small kick in the drill
              //    direction so the rig visibly snaps into the cleared
              //    space instead of just standing there. Drill Dozer's
              //    momentum carry-through is the model.
              // 3. Squash spike — bigger than anticipation, sells the
              //    impact moment.
              hitPauseT = 0.03;             // brief beat — glide carries the rest
              // Hard alignment snap on the perpendicular axis. The soft
              // column/row-snap during DRILL_TIME doesn't always converge
              // (fast entry, partial-edge starts, etc.). Snapping at the
              // break frame guarantees the glide starts from a known-good
              // position so it can't drift diagonally into adjacent geometry.
              if (drilling.dirVec === 'd' || drilling.dirVec === 'u') {
                var alignX = drilling.c * TILE + (TILE - PLAYER_W) / 2;
                if (!solidAt(alignX, player.y, PLAYER_W, PLAYER_H)) {
                  player.x = alignX;
                  player.vx = 0;
                }
                player.drillGlideLockX = player.x;
                player.drillGlideLockY = null;
              } else {
                var alignY = drilling.r * TILE + (TILE - PLAYER_H);
                if (!solidAt(player.x, alignY, PLAYER_W, PLAYER_H)) {
                  player.y = alignY;
                  player.vy = 0;
                }
                player.drillGlideLockY = player.y;
                player.drillGlideLockX = null;
              }
              // Bite-through glide (position-targeted) — applies to all four
              // directions. Position-targeted, so it can't compound with
              // gravity the way the old velocity-pop did.
              player.drillGlideT = 0.24;
              player.drillGlideDur = 0.24;
              player.drillGlideDir = drilling.dirVec;
              player.drillGlideDist = TILE;
              player.drillGlideTraveled = 0;
              // Cooldown matches the glide duration so a new drill can't
              // start until the current glide completes — prevents the two
              // state machines from overlapping mid-chain.
              player.drillCooldownT = player.drillGlideDur;
              if (drilling.dirVec === 'l') player.dir = -1;
              else if (drilling.dirVec === 'r') player.dir = 1;
              // Release squash — tactile cue for the moment of break.
              player.squash = Math.max(player.squash, 0.25);
            } else {
              drilling.timer = drillHitTime();
              player.fuel -= DRILL_FUEL * dt;
              return;
            }
          }
          drilling = null;
        } else {
          player.fuel -= DRILL_FUEL * dt;
          return;
        }
      }
    }

    // Drill SFX: release the grind only after no dig has been active for
    // longer than the bite-through glide (0.24s), so chained tiles hum as
    // one continuous grind instead of re-spinning up per tile.
    if (drillSfxActive && !drilling) {
      drillSfxStopT += dt;
      if (drillSfxStopT > 0.35) {
        var _ssfx = drillSfx();
        if (_ssfx) _ssfx.stop();
        drillSfxActive = false;
        drillSfxMat = null;
        drillSfxStopT = 0;
      }
    }

    // ====== UPDATE: Movement + physics ======
    // World-class platformer feel:
    //   - Snappy acceleration with a small "instant kick" on tap-press so
    //     light taps feel responsive instead of sluggish ramp-ups
    //   - Active turnaround: pressing the opposite direction brakes through
    //     zero before pulling the other way, giving the rig a tiny weighty
    //     tread-shift without becoming sluggish
    //   - Coyote time: brief grace window after walking off a ledge during
    //     which jet input still feels grounded (prevents "but I pressed it!")
    //   - Jet buffer: jet press just before contact gets remembered for a
    //     few frames so you don't have to time the press perfectly
    //   - Smooth thrust spool: jet snaps hot fast without becoming a harsh
    //     single-frame impulse; release vents almost immediately instead of
    //     dragging smoke/force after the key is up.
    //   - Smooth diminishing toward terminal: thrust force lerps off as you
    //     approach terminal upward velocity instead of two flat step gates
    //   - Hover assist: slight extra anti-grav near zero vy with thrust on,
    //     so hovering feels stable instead of drifting up/down stochastically
    //   - Gravity relief while thrusting: lighter pull while jet is held,
    //     making sustained climbs feel like a true rocket, not a wet noodle
    var TOP_SPEED = 200;
    var ACC_GROUND = 2000;
    var TURN_BRAKE_GROUND = 1650;  // extra braking while reversing on ground
    var FRIC_GROUND = 1150;
    var FRIC_GROUND_SKID = 220;     // low friction while landing with rocket overspeed
    var INSTANT_KICK = 28;          // px/s nudge on direction tap
    // ---- Variable jet (Stage 1) ----
    // Reference feel: Spelunky 2 burst on tap, Cave Story sustained climb on
    // hold, Jetpack Joyride clean cutoff on release. Three pieces:
    //   1. Tap impulse — pressing jet always produces an immediate, frame-rate-
    //      independent velocity kick. Taps deliver one-tile micro-lifts.
    //   2. Spool snap-on-press — the held-thrust spool jumps to TAP_FLOOR on
    //      the press edge, so a held tap has full force from frame 1 instead
    //      of ramping. The ramp is preserved past TAP_FLOOR for hold polish.
    //   3. Hard release — spool collapses in ~7ms on key release. The
    //      thrust force vanishes; the velocity you built coasts.
    var THRUST_SPOOL_RISE = 48;         // 1/sec — full in ~20ms after the tap floor
    var THRUST_SPOOL_FALL = 145;        // 1/sec — gone in ~7ms (clean cutoff)
    var THRUST_SPOOL_TAP_FLOOR = 0.68;  // spool snaps to this on press edge
    var TAP_IMPULSE_DELTA = 150;        // px/s velocity kick on tap
    var TAP_IMPULSE_FLOOR = -160;       // tap clamps vy no lower than this
    var TAP_FUEL_COST = 0.05;           // small per-tap fuel cost
    var FLIGHT_TILT_MAX = 0.56;         // visual bank cap (~32 deg): a lean, not physics
    var FLIGHT_TILT_SPRING = 230;       // angular spring toward desired bank
    var FLIGHT_TILT_DAMP = 18.0;        // angular damping for inertial bank
    var HOVER_ASSIST = 220;         // anti-grav force when near zero vy
    var HOVER_BAND = 80;            // |vy| within which hover is full strength
    var COYOTE_T = 0.10;            // seconds of grace after leaving ground
    var JET_BUFFER_T = 0.10;        // seconds jet press is buffered forward (reserved for future drill-cancel use; does not affect held jet)
    // ---- Stage 2: hover-settle + apex easing ----
    // Hover-settle (Terraria UFO): when jet is released near zero vy, damp
    // toward zero so the rig parks instead of drifting. Only applies when no
    // jet input is held — held jet uses HOVER_ASSIST above for the same job.
    // Apex easing (Hollow Knight): gravity is briefly reduced near vy=0 so
    // the top of an ascent hangs a beat longer. Short and strong, not long
    // and weak — band stays well below |climbTerm|/3.
    var HOVER_SETTLE_BAND = 60;     // |vy| under which settle damping applies
    var HOVER_SETTLE_DAMP = 5.5;    // 1/sec damping rate (vy *= exp(-k*dt))
    var APEX_EASING_BAND = 80;      // |vy| under which gravity is reduced
    var APEX_EASING_FACTOR = 0.5;   // gravity multiplier at vy=0 inside band
    // v25.49: the catch multiplier (flyTune.catch) smoothsteps in across this
    // band of falling speed so force is continuous through the apex; without
    // it the vy=0 crossing would step by climbForce*(catch-1)*spool.
    var CATCH_BAND = 60;            // px/s of fall over which the catch fades in
    // Gravity, terminal fall, thrust and horizontal authority all live in
    // flyTune (020, the 'fly' gm group): ONE constant set, sky + underground.

    var undergroundNow = playerIsUnderground();
    // v25.49: ONE flight model everywhere. The mode gates (rotation / VTOL /
    // legacy), the 3-block flightDeepUnder handoff band, and the separate
    // underground air-control envelope are gone; the same integrator and the
    // same flyTune numbers run everywhere. undergroundNow survives for biome
    // flavor (the audio wind bed) only. It gates no physics.

    // Coyote and jet-buffer bookkeeping
    // FX event counters (consumers diff the N fields; never reset).
    if (!player.fx) player.fx = { igniteN: 0, boomN: 0, vaporN: 0, landN: 0, landVy: 0, landTilt: 0 };
    if (player.onGround) {
      if (!player._groundWas && (player.airTime || 0) > 0.22) {
        // Touchdown event: grade by impact speed + how far from upright the
        // hull hit. Read by audio (greaser chirp / hard thud), the plume dust
        // burst, and the suspension squash in drawPlayer.
        var _lt = (player.bodyTiltRender || 0) % (Math.PI * 2);
        if (_lt > Math.PI) _lt -= Math.PI * 2; else if (_lt < -Math.PI) _lt += Math.PI * 2;
        player.fx.landN++;
        player.fx.landVy = player.peakFallVy || 0;
        player.fx.landTilt = Math.abs(_lt);
      }
      player.coyoteT = COYOTE_T;
      player.airTime = 0;
      player.peakFallVy = 0;
      resetFlightBank();
    } else {
      player.coyoteT = Math.max(0, player.coyoteT - dt);
      player.airTime += dt;
      if (player.vy > player.peakFallVy) player.peakFallVy = player.vy;
    }
    player._groundWas = player.onGround;
    if (player.edgeMoveU) player.jetBufferT = JET_BUFFER_T;
    else player.jetBufferT = Math.max(0, player.jetBufferT - dt);

    // Horizontal drive: the ground keeps the platformer tread (instant kick,
    // turnaround brake, skid); the air is DIRECT authority with the same
    // accel, cap, friction and reversal bite above ground and underground.
    // Jello grip: slightly slippery when standing on a gel blob. 1.0 on solid ground.
    var _jelloGrip = (player.onGround && player.onJello) ? JELLO_GROUND_GRIP : 1.0;
    var acc = (player.onGround ? ACC_GROUND : flyTune.acc) * _jelloGrip;

    // Gentle post-drill centering assist. It nudges the rig into a freshly
    // opened downward shaft without injecting a big velocity spike.
    if (player.slideTargetX != null) {
      var dxTarget = player.slideTargetX - player.x;
      player.slideAssistT = Math.max(0, (player.slideAssistT || 0) - dt);
      if ((moveL && dxTarget > 0) || (moveR && dxTarget < 0) || Math.abs(dxTarget) < 0.35 || player.slideAssistT <= 0) {
        player.slideTargetX = null;
        player.slideAssistT = 0;
        if (Math.abs(dxTarget) < 0.35) player.x += dxTarget;
      } else {
        var easeStep = Math.max(-220 * dt, Math.min(220 * dt, dxTarget * Math.min(1, dt * 20)));
        if (!solidAt(player.x + easeStep, player.y, PLAYER_W, PLAYER_H)) {
          player.x += easeStep;
        } else {
          player.slideTargetX = null;
          player.slideAssistT = 0;
        }
        player.vx *= Math.pow(0.2, dt);
      }
    } else if (moveL !== moveR) {
      // Both-held cancels out (treated as "no input") — cleaner than the
      // older "left wins" behavior and matches what most platformers do.
      var dirIn = moveR ? 1 : -1;
      var reversing = (dirIn > 0 && player.vx < -8) || (dirIn < 0 && player.vx > 8);
      if (reversing && player.onGround) {
        var brake = TURN_BRAKE_GROUND * dt;
        if (player.vx > 0) {
          player.vx = Math.max(0, player.vx - brake);
        } else {
          player.vx = Math.min(0, player.vx + brake);
        }
      }
      // Active turnaround: the ground gets a slight tread-shift because the
      // brake above eats the old velocity; the air multiplies authority while
      // opposing your own vx (flyTune.revBoost) so a dodge-flip is immediate.
      var accNow = reversing
        ? (player.onGround ? acc * 0.72 : acc * flyTune.revBoost)
        : acc;
      var inputSpeedLimit = player.onGround ? TOP_SPEED : flyTune.speed;
      var pushingPastLimit = (dirIn > 0 && player.vx >= inputSpeedLimit) ||
                             (dirIn < 0 && player.vx <= -inputSpeedLimit);
      if (!pushingPastLimit && accNow !== 0) {
        // Input alone never pushes PAST the cap, but never confiscates
        // over-cap speed that was already earned (dive exits, jello flings).
        var _prevVx = player.vx;
        player.vx += dirIn * accNow * dt;
        if (player.vx > inputSpeedLimit && _prevVx <= inputSpeedLimit) player.vx = inputSpeedLimit;
        else if (player.vx < -inputSpeedLimit && _prevVx >= -inputSpeedLimit) player.vx = -inputSpeedLimit;
      }
      // Instant tap kick: only on edge press, only when starting from low/wrong-sign vx,
      // and only on the ground (in the air it would feel like a teleport-step).
      var edgeTap = (dirIn > 0 && player.edgeMoveR) || (dirIn < 0 && player.edgeMoveL);
      // air-pulse: the horizontal thruster puff, one per fresh airborne tap
      // (pool of 6 + jitter keeps rapid tapping from machine-gunning). Was
      // underground-only; the one model puffs everywhere airborne.
      if (edgeTap && !player.onGround) {
        sfxPlay('air-pulse', { pan: 0.25 * dirIn });
      }
      if (edgeTap && player.onGround) {
        var sameSign = (dirIn > 0 && player.vx > 0) || (dirIn < 0 && player.vx < 0);
        if (!sameSign || Math.abs(player.vx) < TOP_SPEED * 0.3) {
          player.vx += dirIn * INSTANT_KICK;
        }
      }
    } else {
      // No directional input: friction toward zero (the air uses flyTune.fric,
      // the same gentle bleed above ground and underground).
      var fric = player.onGround
        ? (Math.abs(player.vx) > TOP_SPEED ? FRIC_GROUND_SKID : FRIC_GROUND) * _jelloGrip
        : flyTune.fric;
      if (fric > 0) {
        if (player.vx > 0) { player.vx -= fric * dt; if (player.vx < 0) player.vx = 0; }
        else if (player.vx < 0) { player.vx += fric * dt; if (player.vx > 0) player.vx = 0; }
      }
    }
    // Horizontal caps. Ground drive tops out at TOP_SPEED by refusing further
    // same-direction acceleration above; landing overspeed skids down under
    // ground friction. Airborne overspeed bleeds exponentially instead of
    // hitting a wall, so earned momentum stays meaningful for a beat or two.
    if (player.onGround && Math.abs(player.vx) > TOP_SPEED) {
      var skidSign = player.vx > 0 ? 1 : -1;
      var skidBleed = Math.min(Math.abs(player.vx) - TOP_SPEED, FRIC_GROUND_SKID * 0.55 * dt);
      player.vx -= skidSign * skidBleed;
    }
    if (!player.onGround) {
      var _vxa = Math.abs(player.vx);
      if (_vxa > flyTune.speed) {
        var _vxEx = (_vxa - flyTune.speed) * Math.exp(-flyTune.overBleed * dt);
        player.vx = (player.vx > 0 ? 1 : -1) * (flyTune.speed + _vxEx);
      }
    }
    // Storm-shear headwind: tighter sideways cap above the flak deck in a zone.
    if (nmzShear && nmzShear.speed < 1) {
      var _shearCap = flyTune.speed * nmzShear.speed;
      if (player.vx > _shearCap) player.vx = _shearCap;
      if (player.vx < -_shearCap) player.vx = -_shearCap;
    }

    // ===== The ONE flight model (v25.49 rebuild) =====
    // Upright rig, axis-aligned thrust; sky and underground are byte-identical
    // (no modes, no handoff band). Vertical = the proven jet stack (tap kick,
    // spool, headroom envelope toward flyTune.climbTerm, hover assist, gravity
    // relief, apex easing, hover settle) plus the NEW catch asymmetry: thrust
    // is multiplied by flyTune.catch while FALLING, so a long fall arrests in
    // about 0.9 s at booster tier 1 (net ~830 px/s^2) while the launch stays
    // gentle (net ~350 px/s^2 toward a ~166 px/s sustained climb). The
    // horizontal half (direct authority, the old VTOL shape) lives in the
    // input block above; this block owns the vertical, the bank, and the
    // shared tails. Tunables: flyTune (020, 'fly' gm group / FLY FEEL strip).

    // 1. Tap impulse: frame-rate-independent velocity kick on the press edge.
    //    Won't fire if already climbing faster than the impulse target, so a
    //    follow-up tap during a powered ascent doesn't slow you down.
    if (player.edgeMoveU && player.fuel > 0) {
      var tapTargetVy = player.vy - TAP_IMPULSE_DELTA;
      if (tapTargetVy < TAP_IMPULSE_FLOOR) tapTargetVy = TAP_IMPULSE_FLOOR;
      if (tapTargetVy < player.vy) {
        player.vy = tapTargetVy;
        // Pre-spool so a held tap has full sustained force from frame 1.
        if (player.thrustSpool < THRUST_SPOOL_TAP_FLOOR) {
          player.thrustSpool = THRUST_SPOOL_TAP_FLOOR;
        }
        player.fuel -= TAP_FUEL_COST;
        if (player.fuel < 0) player.fuel = 0;
      }
    }

    // 2. Held thrust, clean release: only the live moveU keeps the spool
    //    alive, so a quick tap-release is *immediately* a release (no drift).
    var jetHeld = moveU && player.fuel > 0;
    if (jetHeld && !player._thrustWas) player.fx.igniteN++;
    player._thrustWas = jetHeld;
    if (jetHeld) {
      player.thrustSpool = Math.min(1, player.thrustSpool + dt * THRUST_SPOOL_RISE);
    } else {
      player.thrustSpool = Math.max(0, player.thrustSpool - dt * THRUST_SPOOL_FALL);
    }

    // 3. Climb force through the headroom envelope, catch-boosted against a
    //    fall. Runs while grounded too: that IS the takeoff path (vy goes
    //    negative, the collision sweep lifts the rig off the tiles).
    var _flyCatchK = 1;
    var _flyForce = 0;
    if (player.thrustSpool > 0.001) {
      var headroom = (player.vy - flyTune.climbTerm) / Math.max(1, Math.abs(flyTune.climbTerm));
      if (headroom < 0) headroom = 0;
      else if (headroom > 1) headroom = 1;
      if (player.vy > 0 && flyTune.catch > 1) {
        var _ck = Math.min(1, player.vy / CATCH_BAND);
        _ck = _ck * _ck * (3 - 2 * _ck);    // smoothstep
        _flyCatchK = 1 + (flyTune.catch - 1) * _ck;
      }
      var force = flyTune.climbForce * getBoosterThrustMult() * player.thrustSpool * headroom * _flyCatchK;
      // Hover assist: extra anti-grav near zero vy. Falls off past HOVER_BAND
      // so it never fights the terminal climb. Smoothstep keeps the
      // hover-to-climb transition gentle and predictable.
      var vyAbs = Math.abs(player.vy);
      if (vyAbs < HOVER_BAND) {
        var hoverK = 1 - (vyAbs / HOVER_BAND);
        hoverK = hoverK * hoverK * (3 - 2 * hoverK);    // smoothstep
        force += HOVER_ASSIST * hoverK * player.thrustSpool;
      }
      _flyForce = force;
      player.vy -= force * dt;
      // No hard clamp on vy here: the headroom curve already zeros sustained
      // thrust past climbTerm. Taps and momentum may overshoot briefly and
      // gravity restores them, which feels natural.
      // The ONE flight fuel drain, proportional to spool (taps cost less).
      player.fuel -= DRILL_FUEL * 0.5 * player.thrustSpool * (nmzShear ? nmzShear.fuel : 1) * dt;
      if (player.fuel < 0) player.fuel = 0;
    }
    player.thrusting = player.thrustSpool > 0.15;

    // 4. Gravity with relief while lit + apex hang near vy=0 + hover-settle
    //    on release. gravScale is read again downstream (water medium, jello
    //    ride), so it is assigned unconditionally on every frame.
    var gravScale = 1 - flyTune.gravRelief * player.thrustSpool;
    if (!player.onGround) {
      var vyAbsForApex = Math.abs(player.vy);
      if (vyAbsForApex < APEX_EASING_BAND) {
        var apexK = 1 - (vyAbsForApex / APEX_EASING_BAND);
        apexK = apexK * apexK * (3 - 2 * apexK);    // smoothstep
        gravScale *= 1 - (1 - APEX_EASING_FACTOR) * apexK;
      }
    }
    player.vy += flyTune.gravity * gravScale * dt;
    if (!moveU && !player.onGround && player.thrustSpool < 0.05) {
      if (Math.abs(player.vy) < HOVER_SETTLE_BAND) {
        player.vy *= Math.exp(-HOVER_SETTLE_DAMP * dt);
      }
    }

    // 5. Visual bank: a lean, not physics (the model never rotates). Input
    //    lean plus a touch of speed lean, on the spring shared with
    //    drawPlayer and the plume via flightTilt -> bodyTiltRender/thrustVec.
    var _flyDir = (moveR ? 1 : 0) - (moveL ? 1 : 0);
    if (player.onGround || playerInMiningPose()) {
      resetFlightBank();
    } else {
      var targetTilt = _flyDir * flyTune.tilt +
        Math.max(-1, Math.min(1, player.vx / Math.max(1, flyTune.speed))) * 0.10;
      if (targetTilt > FLIGHT_TILT_MAX) targetTilt = FLIGHT_TILT_MAX;
      if (targetTilt < -FLIGHT_TILT_MAX) targetTilt = -FLIGHT_TILT_MAX;
      player.flightTiltVel += (targetTilt - player.flightTilt) * FLIGHT_TILT_SPRING * dt;
      player.flightTiltVel *= Math.exp(-FLIGHT_TILT_DAMP * dt);
      player.flightTilt += player.flightTiltVel * dt;
      if (player.flightTilt > FLIGHT_TILT_MAX) { player.flightTilt = FLIGHT_TILT_MAX; player.flightTiltVel = 0; }
      if (player.flightTilt < -FLIGHT_TILT_MAX) { player.flightTilt = -FLIGHT_TILT_MAX; player.flightTiltVel = 0; }
    }
    player.thrustVecX = Math.sin(player.flightTilt || 0);
    player.thrustVecY = -Math.cos(player.flightTilt || 0);

    // Bomb-blast shiver decay (writer: 065-bombs). This envelope used to
    // decay inside the rotation integrator; it must decay in every regime.
    player.tremor = (player.tremor || 0) * Math.exp(-dt / 0.14);
    if (player.tremor < 0.01) player.tremor = 0;

    // Terminal fall: one cap, every regime (a live lever like the rest).
    if (player.vy > flyTune.maxFall) player.vy = flyTune.maxFall;

    // v23.82 — eased visual body tilt: the SINGLE source for both drawPlayer and
    // the exhaust/smoke (via playerLocalToWorld), so they rotate in lockstep.
    // Eases toward the flight bank (or upright in the mining pose) so entering
    // a shaft / landing never snaps the rig. Shortest-angle ease; ~0.15s settle.
    var _btTarget = playerInMiningPose() ? 0 : (player.flightTilt || 0);
    var _btD = _btTarget - (player.bodyTiltRender || 0);
    while (_btD > Math.PI) _btD -= Math.PI * 2;
    while (_btD < -Math.PI) _btD += Math.PI * 2;
    player.bodyTiltRender = (player.bodyTiltRender || 0) + _btD * (1 - Math.exp(-12 * dt));
    if (Math.abs(_btD) < 0.002) player.bodyTiltRender = _btTarget;

    // ----- v24.148 WATER MEDIUM (deep lakes) -----
    // One shared step after every flight branch (upright, rotation, VTOL):
    // measured submersion (playerWaterFrac, 040) drives velocity drag, a
    // partial-buoyancy relief on this frame's gravity pull, and a terminal
    // sink speed, so plunging into a 5-8 deep lake decelerates like water,
    // the rig settles to the lakebed gently (under the 340 px/s damage
    // floor), and jetpack thrust still climbs out (thrust >> drag at low
    // speed). Pure function of the rig's own state + water presence.
    var wFrac = (typeof playerWaterFrac === 'function') ? playerWaterFrac() : 0;
    player.waterFrac = wFrac;
    if (wFrac > 0.05) {
      var wDragK = Math.exp(-WATER_RIG_DRAG * wFrac * dt);
      player.vx *= wDragK;
      player.vy *= wDragK;
      player.vy -= flyTune.gravity * gravScale * dt * WATER_RIG_BUOY * wFrac;
      if (wFrac > 0.5 && player.vy > WATER_RIG_SINK_VMAX) {
        player.vy += (WATER_RIG_SINK_VMAX - player.vy) * (1 - Math.exp(-6 * dt));
      }
    }

    // Dev probe (window.__trees / __course pattern): read-only flight state,
    // refreshed every update — for headless harness checks + owner bug
    // reports ("what does __flight say"). Never read by game code.
    if (!window.__flight) window.__flight = {};
    var _fdbg = window.__flight;
    _fdbg.x = player.x; _fdbg.y = player.y;
    _fdbg.catchK = _flyCatchK; _fdbg.force = _flyForce;
    _fdbg.vx = player.vx; _fdbg.vy = player.vy; _fdbg.spool = player.thrustSpool || 0;
    _fdbg.tilt = player.bodyTiltRender || 0; _fdbg.fuel = player.fuel;
    _fdbg.onGround = !!player.onGround;

    // ----- Flight SFX + haptics bridge (engine facade: js/audio.js) -----
    // Per-frame state for the synthesized flight audio (wind bed keyed to
    // airspeed, engine-under-load, stall horn, ignition bark, boom) plus the
    // rumble shim. Both are safe no-ops until their implementations exist.
    if (typeof SluiceAudio !== 'undefined' && SluiceAudio && SluiceAudio.flight) {
      try {
        SluiceAudio.flight({
          air: !player.onGround && !undergroundNow,
          rot: false,
          speed: Math.sqrt(player.vx * player.vx + player.vy * player.vy),
          cap: flyTune.speed,
          boomV: flyTune.speed * 2,
          spool: player.thrustSpool || 0,
          climb: -player.vy,
          buffet: 0,
          stall: false,
          over: 0,
          ge: 0,
          fx: player.fx,
          dt: dt
        });
      } catch (e) {}
    }
    if (typeof hapticsUpdate === 'function') hapticsUpdate(dt);

    // ----- Ground support check -----
    // No sideways hole magnet: if the rig drives over an opening, gravity
    // owns the result. As soon as no foot sample has actual tile support
    // underneath, the rig becomes airborne and starts dropping into the gap.
    if (player.onGround && !drilling && player.drillGlideT <= 0 &&
        !player.onJello && !playerHasFootSupport(player.x, player.y)) {
      // Walked off a ledge: drop the ground flag + nudge into a fall. Skipped
      // when standing on jello (onJello) — jello has no solid tiles under the
      // foot, so playerHasFootSupport is always false there; without this guard
      // the +85 nudge fires every frame and clobbers any upward jetpack
      // velocity, pinning the rig to the gel ("stuck, can't fly off").
      player.onGround = false;
      player.vy = Math.max(player.vy, 85);
    }

    // Move X
    // During a horizontal glide, position on the X axis is owned by the
    // glide curve — skip the velocity-driven sweep so the two motions
    // don't compound (which was the v5.6 catapult bug). vx still
    // accumulates from input and respects the normal horizontal safety
    // limits, so the moment the glide ends the rig is already moving.
    var glideOwnsX = player.drillGlideT > 0 &&
                     (player.drillGlideDir === 'l' || player.drillGlideDir === 'r');
    if (glideOwnsX) {
      // skip — glide handles player.x
    } else {
    var nx = player.x + player.vx * dt;
    if (nx < 0) { nx = 0; player.vx = 0; }
    if (nx + PLAYER_W > COLS * TILE) { nx = COLS * TILE - PLAYER_W; player.vx = 0; }
    if (!solidAt(nx, player.y, PLAYER_W, PLAYER_H)) {
      player.x = nx;
    } else {
      // ----- Stage 3: Side-wall corner slip -----
      // Airborne sibling of the ceiling-slip below. When horizontal motion
      // is blocked by a tile, try a tiny vertical nudge (max 3px) to slip
      // past the corner — Celeste/Mario imperceptible range. Direction
      // biased by current vy. Smoothness comes from the renderX/Y lerp
      // (applied later in the update) — the snap happens for collision
      // purposes but the sprite eases over a few frames so the eye sees
      // a continuous motion. Edge-only squash adds a tactile thump per
      // contact chain (not every frame, so contact spans don't sit
      // permanently squashed).
      var SIDE_NUDGE_MAX = 3;
      var slippedX = false;
      if (!player.onGround) {
        var primary = player.vy < 0 ? -1 : 1;    // up if rising, else down
        for (var nudgeY = 1; nudgeY <= SIDE_NUDGE_MAX; nudgeY++) {
          var dy1 = primary * nudgeY;
          if (!solidAt(nx, player.y + dy1, PLAYER_W, PLAYER_H) &&
              !solidAt(player.x, player.y + dy1, PLAYER_W, PLAYER_H)) {
            player.y += dy1;
            player.x = nx;
            slippedX = true;
            break;
          }
          var dy2 = -primary * nudgeY;
          if (!solidAt(nx, player.y + dy2, PLAYER_W, PLAYER_H) &&
              !solidAt(player.x, player.y + dy2, PLAYER_W, PLAYER_H)) {
            player.y += dy2;
            player.x = nx;
            slippedX = true;
            break;
          }
        }
      }
      if (slippedX) {
        if (!player.wasSideSlipping) {
          player.squash = Math.max(player.squash, 0.10);
        }
        player.wasSideSlipping = true;
      } else {
        // Flat-wall hit: high-speed slams get a squash cue for tactile
        // feedback, but vx just stops cleanly — bounce-back caused
        // stuttering against walls. Gated on drill state so the glide
        // (which doesn't touch vx anymore, but defensive) and active
        // drilling don't fire false slams.
        var impactVx = Math.abs(player.vx);
        if (player.drillGlideT <= 0 && !drilling && impactVx > 180) {
          var slamK = Math.min(1, (impactVx - 180) / 320);
          player.squash = Math.max(player.squash, 0.18 + slamK * 0.55);
        }
        player.vx = 0;
        player.wasSideSlipping = false;
      }
    }
    } // end of !glideOwnsX

    if (player.onGround && !drilling && player.drillGlideT <= 0 &&
        !player.onJello && !playerHasFootSupport(player.x, player.y)) {
      // Walked off a ledge: drop the ground flag + nudge into a fall. Skipped
      // when standing on jello (onJello) — jello has no solid tiles under the
      // foot, so playerHasFootSupport is always false there; without this guard
      // the +85 nudge fires every frame and clobbers any upward jetpack
      // velocity, pinning the rig to the gel ("stuck, can't fly off").
      player.onGround = false;
      player.vy = Math.max(player.vy, 85);
    }

    // Move Y
    var glideOwnsY = player.drillGlideT > 0 &&
                     (player.drillGlideDir === 'u' || player.drillGlideDir === 'd');
    if (glideOwnsY) {
      // skip — glide handles player.y
    } else {
    var ny = player.y + player.vy * dt;
    var wasInAir = !player.onGround;
    var _wasJello = player.onJello;   // captured for jello "suspension" smoothing
    player.onGround = false;
    player.onCeiling = false;
    player.onJello = false;   // cleared each Y-move; set below if jello supports us
    // (No upward clamp — players can fly as high as they want. The world
    //  above the surface is open sky.)
    var capRestY = chimneyCapCatch(player.x, player.y, ny);
    if (capRestY !== null) {
      // Perch on the surface fireplace chimney cap (one-way landing ledge).
      player.squash = Math.max(player.squash, Math.min(0.55, player.vy / 700));
      player.y = capRestY;
      player.vy = 0;
      player.onGround = true;
      player.jelloImpactVy = 0;   // solid perch voids any banked trampoline rebound
      // player.onJello stays false — solid ledge landing
      resetFlightBank();
    } else if (!solidAt(player.x, ny, PLAYER_W, PLAYER_H)) {
      // --- Jello ground probe (additive, strictly guarded) ---
      // Only when falling, not drilling, not won/over. Uses jelloPeekCell
      // (read-only, zero allocation) — never mutates the jello grid.
      var _jProbe = (!drilling && !gameWon && !gameOver && !player.thrusting)
                    ? jelloGroundProbe() : null;
      // STICKY grounding (hysteresis) to fix the onJello flicker. The cube SURFACE deforms
      // under the rig, so the old hard per-frame test (feet within [surface, surface+BAND])
      // toggled onJello true/false EVERY frame. The false frames ran the side-contact path
      // (jelloResolvePlayer eject + the plow), which shoved the cube in the travel direction and
      // fought the on-top rest, so the rig and cube slid together forever (and the on-top fixes,
      // carry-off + plow-gate, only ran on half the frames so they never took). Now: ENTRY is
      // still strict (feet must actually reach the surface, down to one BAND deep), but once
      // grounded we HOLD it across a much wider band so surface jitter cannot drop us into the
      // side path. We un-ground only when the probe finds no cube under the centre (drove off the
      // edge), or the rig floats well ABOVE the surface (jetted up), or sinks far BELOW it.
      var _feet = ny + PLAYER_H;
      var _jOnTop;
      if (_jProbe === null) {
        _jOnTop = false;
      } else if (_wasJello) {
        // (v24.154 tried capping this hold band at RIDE_SINK+22 as engulf
        // insurance and it BACKFIRED: a cube landing on the seated rig dips the
        // feet past any tight cap, the rig un-seats mid-impact, loses the
        // gravity-cancel, and gets sandwiched INTO the gel below — the harness
        // measured a 6s swallow that the wide band never produced. The SEAT is
        // the anti-engulf: while seated the gel supports the rig like a floor.)
        _jOnTop = _feet >= _jProbe.surfaceY - JELLO_TOP_BAND && _feet <= _jProbe.surfaceY + JELLO_TOP_BAND * 3;
      } else {
        _jOnTop = _feet >= _jProbe.surfaceY && _feet <= _jProbe.surfaceY + JELLO_TOP_BAND;
      }
      if (_jOnTop) {
        // Contact gate: only "rest on top" once the feet actually REACH the gel surface
        // (feet >= surfaceY), down to JELLO_TOP_BAND deep. The catch + trampoline must engage
        // AT the surface, not in mid-air above it. This gate used to trigger JELLO_SINK (20px)
        // ABOVE the surface, so a hard landing slammed/bounced ~20px up off nothing and then
        // dropped to the slime. Now the rig free-falls until the feet touch, so the bounce/sink
        // happen on real contact. A side / underside hit (feet far below the top) is NOT grounded
        // here; it falls through to the soft force contact (jelloResolvePlayer), and this also
        // stops the probe from mis-snapping a side hit up onto the top.
        // DAMPED-SPRING landing — a NATURAL fall + soft catch, NOT a teleport. The
        // rig keeps falling under gravity; the slime resists with a ONE-SIDED
        // upward spring proportional to how far the feet are below the surrounding
        // surface, plus damping that absorbs the fall. So it sinks in and EASES to
        // a stop at its rest depth (~gravity / JELLO_LAND_SPRING) instead of being
        // snapped down into the pocket. jelloDeformBowl carves the bowl to wherever
        // the feet settle. (Suspension low-pass keeps the surrounding ref steady.)
        var _rawSurf = _jProbe.surfaceY;
        if (!_wasJello || player.jelloSurfLP === undefined) player.jelloSurfLP = _rawSurf;
        else player.jelloSurfLP += (_rawSurf - player.jelloSurfLP) * JELLO_RIDE_SMOOTH;
        var _surr = player.jelloSurfLP;
        var _impactVy = player.vy;
        // Velocity of the gel the rig is riding, in real px/s. b.vy is reported in slow-mo
        // sim units, so scale by JELLO_TIMESCALE to match player.vy. A resting (sleeping) slime
        // reports ~0, so this stays a no-op for a normal landing on a settled blob.
        var _surfVy = _jProbe.vy * JELLO_TIMESCALE;
        var _depth = (player.y + PLAYER_H) - _surr;       // >0 = feet below the surrounding surface
        // RIDE SINK (v24.125): the resting equilibrium sits JELLO_RIDE_SINK px INTO the gel
        // (owner: "major depression" — the rig should visibly bed into the jello, not perch
        // on it). Gravity cancels and the one-sided spring engages relative to that sunken
        // waterline (_dEff = depth past the sink line), so a fresh mount settles DOWN into
        // the gel over a few frames and jelloDeformBowl wraps the bowl around the hull. At
        // JELLO_RIDE_SINK = 0 this is exactly the v23.2 rest-on-top model: the gel supports
        // the weight like a floor at the surface itself, and the spring only resists the
        // transient landing dip, easing the rig back up with no embedded rest.
        var _dEff = _depth - JELLO_RIDE_SINK;
        if (_dEff >= 0) player.vy -= flyTune.gravity * gravScale * dt;   // gel holds the weight at the sink line
        if (_dEff > 0) player.vy -= _dEff * JELLO_LAND_SPRING * dt;     // resist dipping below the sink line
        var _ld = JELLO_LAND_DAMP * dt; if (_ld > 0.9) _ld = 0.9;
        // Damp the fall RELATIVE TO THE GEL, not in the world frame. The old `vy *= (1-ld)`
        // bled the rig's absolute velocity every frame, so when the slime was itself falling the
        // rig could not accelerate with it and the pair sank in slow motion. Damping (vy - surfVy)
        // lets gravity act on the rig and the slime equally: when both free-fall together the
        // relative velocity is ~0, so there is nothing to damp and the rig falls at full g.
        player.vy = _surfVy + (player.vy - _surfVy) * (1 - _ld);
        // TRAMPOLINE v2 (v24.94): STORE a hard landing's impact speed, ride the full
        // damped-spring dip (the squishy catch stays intact), then return the energy
        // at the EXIT of the dip - when the feet have recovered to the surface and
        // the spring already has the rig moving up - never on the first contact
        // frame (the v22.18 failure: a first-frame reversal read as a rigid hit,
        // which is why JELLO_LAND_BOUNCE shipped at 0). Decays naturally per bounce
        // (each landing stores the new, smaller impact). JELLO_TRAMPOLINE = 0
        // reproduces today's pure cushion exactly.
        if (!_wasJello && _impactVy > JELLO_BOUNCE_MIN && JELLO_TRAMPOLINE > 0) {
          player.jelloImpactVy = _impactVy;
        }
        if (player.jelloImpactVy > 0 && _dEff <= 1 && player.vy < 0) {   // dip exit = back at the sink line
          var _reb = -player.jelloImpactVy * JELLO_TRAMPOLINE;
          if (_reb < player.vy) player.vy = _reb;
          player.squash = Math.max(player.squash, Math.min(0.6, player.jelloImpactVy / 900));
          player.jelloImpactVy = 0;
        }
        player.y += player.vy * dt;                        // natural decelerating motion
        if (!_wasJello && _impactVy > 120) {               // first hard contact: fall damage + splash
          var _jFallDmg = fallDamageForImpact(_impactVy) * 0.2;
          if (_jFallDmg > 0) {
            player.squash = Math.min(1, _jFallDmg / 80);   // landing squash (visual feel) stays
            if (FALL_IMPACT_FX) {                            // hull damage + flash + fall-death gated off for testing
              player.hull -= _jFallDmg;
              sfxPlay('land-damage', { gain: 0.45 });        // softened — the gel ate most of it
              damageFlashT = Math.max(damageFlashT, Math.min(1, 0.18 + _jFallDmg / 90));
              if (player.hull <= 0) { endGame({ type: 'fall', speed: _impactVy, damage: _jFallDmg }); return; }
            }
          }
          jelloLandImpact(player.x + PLAYER_W * 0.5, player.y + PLAYER_H, _impactVy);
          var _jSplN = 3 + Math.min(9, (_impactVy / 110) | 0);
          spawnJelloSplat(player.x + PLAYER_W * 0.5, _surr, _jSplN, _impactVy * 0.5, 0.85, null);
        }
        // CARRY: ride the blob HORIZONTALLY too (Celeste/TowerFall solid-vs-actor model). Move
        // with the supporting gel's horizontal velocity, low-passed (JELLO_RIDE_SMOOTH) so a
        // wobbling surface never jitters the rig, and never INTO a wall (push beats carry). The
        // inherited speed is handed back to player.vx on dismount (see the free-fall branch) so
        // stepping off a moving slime keeps its momentum.
        // Two guards keep the ride from becoming a self-feeding speed exploit: (1) a DEADZONE so
        // only a genuinely sliding blob carries you — slow settling jiggle (which is mostly the
        // rig's own plow/track-shear reflected back through the blob COM) is ignored; (2) a
        // HEADROOM CAP so the ride only fills the gap up to TOP_SPEED and never beats it. The
        // carry moves player.x directly (it is not vx), so without (2) it bypassed the TOP_SPEED
        // skid cap entirely and drove the rig past top speed across a disturbed pile.
        var _carryReal = _jProbe.vx * JELLO_TIMESCALE;               // blob world vx, real px/s
        var _carryVx = (_carryReal > JELLO_CARRY_MIN || _carryReal < -JELLO_CARRY_MIN ? _carryReal : 0) * JELLO_CARRY;
        if (!_wasJello || player.jelloCarryVx === undefined) player.jelloCarryVx = _carryVx;
        else player.jelloCarryVx += (_carryVx - player.jelloCarryVx) * JELLO_RIDE_SMOOTH;
        var _room = TOP_SPEED - Math.abs(player.vx); if (_room < 0) _room = 0;   // gap under the rig's top speed
        var _eff = player.jelloCarryVx;
        if (_eff > _room) _eff = _room; else if (_eff < -_room) _eff = -_room;
        if (devMode) { jelloDbg.onJello = true; jelloDbg.carryReal = _carryReal; jelloDbg.effCarry = _eff; }
        var _cdx = _eff * dt;
        if ((_cdx > 0.001 || _cdx < -0.001) && !solidAt(player.x + _cdx, player.y, PLAYER_W, PLAYER_H)) player.x += _cdx;
        player.onGround = true;
        player.onJello  = true;
        player.jelloGroundT = JELLO_GROUND_COYOTE;   // refresh the on-top debounce so a 1-frame onJello flicker can't trigger fling/plow
        player.coyoteT = Math.max(player.coyoteT, COYOTE_T * 0.8);
        resetFlightBank();
      } else {
        // Normal free-fall (jello absent or not close enough).
        // Dismount: hand the ride's horizontal momentum to the rig so leaving a MOVING slime flings
        // you off with it (jump-off-a-moving-platform feel) — but ONLY on a POWERED departure (an
        // arrow held as you steer off). A PASSIVE teeter off a cube edge with NO input must not gain
        // velocity: injecting carry with no arrow press gave the rig real vx, which then drove the
        // plow/track-shear into the cube, which sustained the carry -> the rig self-propelled (and
        // the cube with it) across a pile, oscillating cube-to-cube. The cap keeps a powered
        // dismount from boosting past TOP_SPEED (any pre-existing skid that was faster is kept).
        // Always clear the carry so a later press can't inherit a stale value.
        if (_wasJello && player.jelloCarryVx) {
          if (devMode) jelloDbg.injected = (moveL !== moveR) ? player.jelloCarryVx : 0;
          if (moveL !== moveR) {
            var _dCap = Math.abs(player.vx); if (_dCap < TOP_SPEED) _dCap = TOP_SPEED;
            player.vx += player.jelloCarryVx;
            if (player.vx > _dCap) player.vx = _dCap; else if (player.vx < -_dCap) player.vx = -_dCap;
          }
          player.jelloCarryVx = 0;
        }
        player.jelloImpactVy = 0;   // a roll-off can't bank a trampoline rebound
        player.y = ny;
        // player.onJello stays false
      }
    } else {
      // ----- Change 8: Ceiling-corner slip -----
      // When jetpacking up and blocked by a ceiling, try a small horizontal
      // nudge to slip into adjacent open space (e.g., the player is brushing
      // the corner of a tile but a free column sits next to them).
      var slipped = false;
      if (player.vy < 0) {
        for (var nudge = 1; nudge <= 8; nudge++) {
          // Try right
          if (!solidAt(player.x + nudge, ny, PLAYER_W, PLAYER_H) &&
              !solidAt(player.x + nudge, player.y, PLAYER_W, PLAYER_H)) {
            player.x += nudge;
            player.y = ny;
            slipped = true;
            break;
          }
          // Try left
          if (!solidAt(player.x - nudge, ny, PLAYER_W, PLAYER_H) &&
              !solidAt(player.x - nudge, player.y, PLAYER_W, PLAYER_H)) {
            player.x -= nudge;
            player.y = ny;
            slipped = true;
            break;
          }
        }
      }
      if (!slipped) {
        // Hard-landing impact FX (fall damage, squash, red damage-flash, and the hit-pause that
        // briefly FREEZES the loop) are gated on FALL_IMPACT_FX, defaulted OFF for clean physics
        // testing. The rig still lands + stops below; this block only adds the thump/freeze/damage.
        if (player.vy > 0 && FALL_IMPACT_FX) {
          var impactVy = player.vy;
          var fallDmg = fallDamageForImpact(impactVy);
          // v12.1 — water breaks the fall. A body of water around the rig
          // at impact cushions it; a full dunk zeroes the hull damage. The
          // squash / damage-flash / hit-pause below all scale from fallDmg,
          // so they soften automatically with the cushioned value.
          if (fallDmg > 0) fallDmg *= (1 - playerWaterCushion());
          if (fallDmg > 0) {
            player.hull -= fallDmg;
            player.squash = Math.min(1, fallDmg / 80);
            // The crash-landing crunch scales with the damage (SFX_BIBLE §10
            // land-damage; the sub lives in the asset, hero hits only).
            sfxPlay('land-damage', { gain: 0.6 + 0.4 * Math.min(1, fallDmg / 60) });
            damageFlashT = Math.max(damageFlashT, Math.min(1, 0.18 + fallDmg / 90));
            // Stage 5 — hit-pause on damage-causing landings. Scales with
            // damage magnitude, capped at 70ms so chained big falls never
            // become perceived input lag.
            hitPauseT = Math.max(hitPauseT, Math.min(0.07, 0.04 + fallDmg / 600));
          } else if (impactVy > 180) {
            // Sub-damage landing — still give a tactile cue via squash.
            var landK = (impactVy - 180) / 320;
            if (landK > 1) landK = 1;
            player.squash = Math.max(player.squash, 0.18 + landK * 0.55);
            sfxPlay('land-hard', { gain: 0.5 + 0.5 * landK });
            // Sub-damage hit-pause: 22-35ms, only past a clear thump
            // threshold so soft drops stay snappy.
            if (impactVy > 260) {
              hitPauseT = Math.max(hitPauseT, 0.022 + landK * 0.013);
            }
          } else if (impactVy > 80 && player.airTime > 0.25) {
            // Soft step-down landing after a real airborne stretch — barely
            // perceptible squash so the rig "settles" instead of clipping flat.
            player.squash = Math.max(player.squash, 0.10);
          }
          if (player.hull <= 0) {
            endGame({ type: 'fall', speed: impactVy, damage: fallDmg });
            return;
          }
        }
        if (player.vy > 0) {
          player.onGround = true;
          player.jelloImpactVy = 0;   // solid landing voids any banked trampoline rebound
          resetFlightBank();
        } else if (player.vy < 0) player.onCeiling = true;
        player.vy = 0;
      }
    }
    } // end of !glideOwnsY

    // Decay squash
    if (player.squash > 0) {
      player.squash -= dt * 4;
      if (player.squash < 0) player.squash = 0;
    }

    // ----- Render-position smoothing -----
    // Sprite trails the logical position with a quick exponential lerp.
    // Corner-correction snaps (3-8px) become visually smooth — the rig
    // catches up over ~5 frames instead of teleporting. Big deltas
    // (respawn, rover dismount, etc.) snap directly so the sprite doesn't
    // streak across the world. The lag at normal motion (~3px/frame) is
    // sub-pixel and imperceptible.
    var RENDER_LERP_RATE = 22;       // higher = catches up faster
    var RENDER_SNAP_THRESHOLD = 48;  // px — beyond this, snap (teleport)
    var rdx = player.x - player.renderX;
    var rdy = player.y - player.renderY;
    if (Math.abs(rdx) > RENDER_SNAP_THRESHOLD || Math.abs(rdy) > RENDER_SNAP_THRESHOLD) {
      player.renderX = player.x;
      player.renderY = player.y;
    } else {
      var k = 1 - Math.exp(-RENDER_LERP_RATE * dt);
      player.renderX += rdx * k;
      player.renderY += rdy * k;
    }

    // ====== UPDATE: Drill trigger ======
    // Each direction probes the tile in front of the rig and routes through
    // getTileObj(). Down/left/right are the usual dig directions; the
    // vertical drill (up) lets the player chase veins overhead too.
    // Terraria-style platform drop-through: press Down while perched on
    // the chimney cap to fall off it. The cap catch + foot support are
    // suppressed briefly so the rig clears the ledge.
    if (chimneyCapDropT > 0) chimneyCapDropT -= dt;
    if (moveD && player.onGround && playerRestingOnChimneyCap(player.x, player.y)) {
      chimneyCapDropT = 0.3;
    }
    if (moveD && player.onGround && !drilling && player.drillCooldownT <= 0) {
      var pr = Math.floor((player.y + PLAYER_H + 2) / TILE);
      var pc = Math.floor((player.x + PLAYER_W / 2) / TILE);
      var t_d = getTileObj(pr, pc);
      if (t_d) {
        var blockReason = drillBlockReason(t_d, pr);
        if (blockReason) {
          if (t_d.type === 'greatseam' && typeof seamExtract === 'function') { seamExtract(pr, pc); }
          else if (drillBlockMsgCool <= 0) { showMsg(blockReason, blockReason === 'CARGO FULL'); drillBlockMsgCool = 1.5; var _bnc1 = drillSfx(); if (_bnc1) _bnc1.bounce(); }
        } else {
          drilling = { r: pr, c: pc, timer: drillHitTime(), dirVec: 'd' };
          resetFlightBank();
          if (!hasDrilledOnce) { hasDrilledOnce = true; track('first_drill'); }
          // Ease the player into the target column over the drill animation
          // so the AABB is fully within one column when the block breaks.
          // Uses the same slideTargetX system but with a much faster ease
          // (220 px/s cap, 20x lerp factor) so it finishes well before
          // DRILL_TIME elapses — smooth but guaranteed.
          var snapX = pc * TILE + (TILE - PLAYER_W) / 2;
          if (Math.abs(snapX - player.x) <= TILE * 0.75 &&
              !solidAt(snapX, player.y, PLAYER_W, PLAYER_H)) {
            player.slideTargetX = snapX;
            player.slideAssistT = DRILL_TIME * 2;
          }
        }
      }
    }
    if (moveL && player.onGround && !drilling && player.drillCooldownT <= 0) {
      var pr2 = Math.floor((player.y + PLAYER_H / 2) / TILE);
      var pc2 = Math.floor((player.x - 2) / TILE);
      var t_l = getTileObj(pr2, pc2);
      if (t_l) {
        var blockReason2 = drillBlockReason(t_l, pr2);
        if (blockReason2) {
          if (t_l.type === 'greatseam' && typeof seamExtract === 'function') { seamExtract(pr2, pc2); }
          else if (drillBlockMsgCool <= 0) { showMsg(blockReason2, blockReason2 === 'CARGO FULL'); drillBlockMsgCool = 1.5; var _bnc2 = drillSfx(); if (_bnc2) _bnc2.bounce(); }
        } else {
          drilling = { r: pr2, c: pc2, timer: drillHitTime(), dirVec: 'l' };
          resetFlightBank();
          player.dir = -1;
          // Row-snap so the AABB sits cleanly inside the row of the
          // target tile. Renders smoothly via the renderX/Y lerp; up to
          // ~13px snap is invisible by the time the rig's drawn.
          var snapY_l = pr2 * TILE + (TILE - PLAYER_H);
          if (Math.abs(snapY_l - player.y) <= TILE * 0.4 &&
              !solidAt(player.x, snapY_l, PLAYER_W, PLAYER_H)) {
            player.y = snapY_l;
            player.vy = 0;
          }
          if (!hasDrilledOnce) { hasDrilledOnce = true; track('first_drill'); }
        }
      }
    }
    if (moveR && player.onGround && !drilling && player.drillCooldownT <= 0) {
      var pr3 = Math.floor((player.y + PLAYER_H / 2) / TILE);
      var pc3 = Math.floor((player.x + PLAYER_W + 2) / TILE);
      var t_r = getTileObj(pr3, pc3);
      if (t_r) {
        var blockReason3 = drillBlockReason(t_r, pr3);
        if (blockReason3) {
          if (t_r.type === 'greatseam' && typeof seamExtract === 'function') { seamExtract(pr3, pc3); }
          else if (drillBlockMsgCool <= 0) { showMsg(blockReason3, blockReason3 === 'CARGO FULL'); drillBlockMsgCool = 1.5; var _bnc3 = drillSfx(); if (_bnc3) _bnc3.bounce(); }
        } else {
          drilling = { r: pr3, c: pc3, timer: drillHitTime(), dirVec: 'r' };
          resetFlightBank();
          player.dir = 1;
          var snapY_r = pr3 * TILE + (TILE - PLAYER_H);
          if (Math.abs(snapY_r - player.y) <= TILE * 0.4 &&
              !solidAt(player.x, snapY_r, PLAYER_W, PLAYER_H)) {
            player.y = snapY_r;
            player.vy = 0;
          }
          if (!hasDrilledOnce) { hasDrilledOnce = true; track('first_drill'); }
        }
      }
    }
    // ----- Change 6: Vertical drill (drill upward) -----
    // Requires the upgrade. Triggers when player holds Up while their head
    // is touching a solid tile above (ceiling contact).
    if (moveU && upgrades.vertLevel >= 1 && player.onCeiling && !drilling && player.drillCooldownT <= 0) {
      var pr4 = Math.floor((player.y - 2) / TILE);
      var pc4 = Math.floor((player.x + PLAYER_W / 2) / TILE);
      var t_u = getTileObj(pr4, pc4);
      if (t_u) {
        var blockReason4 = drillBlockReason(t_u, pr4);
        if (blockReason4) {
          if (t_u.type === 'greatseam' && typeof seamExtract === 'function') { seamExtract(pr4, pc4); }
          else if (drillBlockMsgCool <= 0) { showMsg(blockReason4, blockReason4 === 'CARGO FULL'); drillBlockMsgCool = 1.5; var _bnc4 = drillSfx(); if (_bnc4) _bnc4.bounce(); }
        } else {
          drilling = { r: pr4, c: pc4, timer: drillHitTime(), dirVec: 'u' };
          resetFlightBank();
          // Column-snap mirroring the downward-drill behavior so the rig
          // sits cleanly under the target tile when drilling up.
          var snapX_u = pc4 * TILE + (TILE - PLAYER_W) / 2;
          if (Math.abs(snapX_u - player.x) <= TILE * 0.75 &&
              !solidAt(snapX_u, player.y, PLAYER_W, PLAYER_H)) {
            player.slideTargetX = snapX_u;
            player.slideAssistT = DRILL_TIME * 2;
          }
          if (!hasDrilledOnce) { hasDrilledOnce = true; track('first_drill'); }
        }
      }
    }
    if (drillBlockMsgCool > 0) drillBlockMsgCool -= dt;

    // Direction
    if (!inputDir) {
      if (player.vx > 10) player.dir = 1;
      if (player.vx < -10) player.dir = -1;
    }

    // ====== UPDATE: Depth + layer tracking ======
    var currentDepth = Math.max(0, Math.floor((player.y / TILE) - SKY_ROWS + 1));
    if (currentDepth > depthRecord) depthRecord = currentDepth;

    // Layer crossing banner.
    var curLayer = currentDepth >= 0 ? getLayerForRegion(currentDepth, playerTownIndex()) : null;
    if (curLayer && lastLayer && curLayer.name !== lastLayer.name) {
      layerBanner = { name: curLayer.name, t: 1.8 };
      track('depth_milestone', { layer: curLayer.name, depth: depthRecord });
      // depth-record (Affect, subtle): only when this crossing IS the deepest
      // the profile has ever been — re-crossing known layers stays silent.
      if (currentDepth >= depthRecord) sfxPlay('depth-record');
    }
    lastLayer = curLayer;
    if (layerBanner) {
      layerBanner.t -= dt;
      if (layerBanner.t <= 0) layerBanner = null;
    }

    // (msgTimer is now ticked in loop() so it keeps counting down even
    //  while the shop is open or the game is over.)
  }

  function endGame(info) {
    // Dev mode = invincible: ignore the death and refill instead.
    if (devMode) {
      if (player) {
        if (typeof getMaxHull === 'function') player.hull = getMaxHull();
        if (typeof getMaxFuel === 'function') player.fuel = getMaxFuel();
      }
      return;
    }
    gameOver = true;
    deathInfo = info || null;
    showMsg('Hull destroyed! Depth: ' + depthRecord + 'm');
    var duration = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - gameStartedAt) / 1000);
    var cause = (info && info.type) || 'hull';
    track('death', { cause: cause, depth: depthRecord, money: money });
    track('run_completed', { outcome: 'death', depth: depthRecord, money: money, duration: duration });
  }

  // Human-readable cause of death for the death screen. deathInfo.type is
  // set by endGame(); a fall reports impact speed, overheating reports temp.
  function deathReasonText() {
    var info = deathInfo;
    var type = info && info.type;
    if (type === 'fuel') return 'OUT OF FUEL';
    if (type === 'fall') {
      // info.speed is px/sec; 32 px = 1 m, then m/s -> mph.
      var mph = Math.round((info.speed || 0) / 32 * 2.237);
      return 'FELL ' + mph + ' MPH';
    }
    if (type === 'magma' || type === 'burned') {
      return 'OVERHEATED ' + (info.heat || 0) + '°F';
    }
    if (type === 'bomb') return 'CAUGHT IN BLAST';
    if (type === 'water' || type === 'drowned') return 'DROWNED';
    return 'HULL DESTROYED';
  }

  /* ---- Camera ---- */
  function updateCamera() {
    // Camera follows the LOGICAL position (player.x/y), not renderX/Y.
    // Camera has its own lerp (camFollow); stacking it on top of the
    // renderX/Y lerp produced sub-pixel cam.x movement every frame even
    // when the rig was settled, which churned the WebGL smoke world-lock
    // (SmokeFluid.scroll is called every frame the camera moves) — that
    // hit FPS and changed how the smoke read.
    var targetX = player.x + PLAYER_W / 2 - screenW / 2;
    // v10.46 — depth-aware vertical framing. When the player is at or
    // above the surface, the camera sits LOWER (so the player appears
    // high on the screen, showing more sky/atmosphere above). As they
    // dig down past the surface, the framing lerps back to centered.
    // Coming back up reverses the lerp naturally because the framing
    // is a pure function of player altitude.
    //
    //   surface (and above): player at 72% of screen height
    //   deep underground:    player centered (50%)
    //   lerp window: ~32 tiles (~1024 world units) below surface
    var surfaceY = SKY_ROWS * TILE;
    var depthBelowSurface = (player.y + PLAYER_H / 2) - surfaceY;
    var SURFACE_FRAC = CAMERA_SURFACE_FRAC;  // v10.64 — hoisted to module scope so celestialPos / sky shader stay in sync.
    var DEEP_FRAC    = CAMERA_DEEP_FRAC;
    var TRANSITION_DEPTH = 32 * TILE;
    var camFrac;
    if (depthBelowSurface <= 0) {
      camFrac = SURFACE_FRAC;
    } else if (depthBelowSurface >= TRANSITION_DEPTH) {
      camFrac = DEEP_FRAC;
    } else {
      // ease-in-out cubic for a soft transition through the surface
      var t = depthBelowSurface / TRANSITION_DEPTH;
      var eased = t * t * (3 - 2 * t);
      camFrac = SURFACE_FRAC + (DEEP_FRAC - SURFACE_FRAC) * eased;
    }
    var targetY = player.y + PLAYER_H / 2 - camFrac * screenH;
    // During a zoom tween, screenW/screenH change every frame, which shifts
    // the player-centered target. With the normal cam lerp the camera lags
    // the moving target, so the view drifts vertically while the scale is
    // still changing — reads as a Y-then-Z motion instead of a clean pure
    // zoom. Snap the camera straight to the target while zoom is in flight
    // so the player stays pinned to the same screen position throughout.
    var zooming = (worldScale !== targetWorldScale);
    // cam.snap (set in init) forces a one-frame jump to spawn so the camera
    // doesn't lerp in from the world origin at boot (which would freeze the
    // spawn lake off-screen on the way in).
    var camFollow = (zooming || cam.snap) ? 1 : (1 - Math.pow(0.88, Math.min(0.05, lastFrameDt) * 60));
    cam.snap = false;
    cam.x += (targetX - cam.x) * camFollow;
    cam.y += (targetY - cam.y) * camFollow;
    // Clamp horizontally to world bounds; vertical is unclamped above the
    // surface so the camera can follow the player up into the sky.
    if (cam.x < 0) cam.x = 0;
    if (cam.x > COLS * TILE - screenW) cam.x = COLS * TILE - screenW;
  }

