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
  // ----- flight2 helper: clear air below the rig (ground-effect probe) -----
  // px of open space between the rig's feet and the first solid tile straight
  // below (2-column probe under the hull), capped at maxPx. Drives the
  // ekranoplan cushion in the rotFlight aero block; <= ~14 tileAt calls.
  function flightGroundClearance(maxPx) {
    var footY = player.y + PLAYER_H;
    var r0 = Math.floor(footY / TILE);
    var rMax = Math.floor((footY + maxPx) / TILE);
    var c1 = Math.floor((player.x + PLAYER_W * 0.2) / TILE);
    var c2 = Math.floor((player.x + PLAYER_W * 0.8) / TILE);
    for (var r = r0; r <= rMax; r++) {
      if (r < 0) continue;
      if (tileAt(r, c1) !== null || (c2 !== c1 && tileAt(r, c2) !== null)) {
        var d = r * TILE - footY;
        return d > 0 ? d : 0;
      }
    }
    return maxPx;
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
      // capped by TOP_SPEED / MAX_FALL clamps. We prevent the catapult by
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
    var moveL = keys['ArrowLeft'] || keys['a'] || keys['A'] || dpad.left || flightTouch.rotL;
    var moveR = keys['ArrowRight'] || keys['d'] || keys['D'] || dpad.right || flightTouch.rotR;
    if (devMode) { jelloDbg.input = (moveR ? 1 : 0) - (moveL ? 1 : 0); jelloDbg.onJello = false; jelloDbg.carryReal = 0; jelloDbg.effCarry = 0; jelloDbg.injected = 0; }
    player.jelloGroundT = Math.max(0, (player.jelloGroundT || 0) - dt);   // coyote: "on a cube top" debounce (refreshed when grounded; gates fling+plow through the onJello flicker)
    var moveU = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '] || keys['Space'] || keys['Spacebar'] || dpad.up || flightTouch.thrust;
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
    var ROCKET_SIDE_SPEED_LIMIT = 390;  // above-ground sideways cap, ~28 MPH (px/s / 32 * 2.237). Fixed, upgrade-independent.
    var ACC_GROUND = 2000;
    var TURN_BOOST = 1.9;
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
    var THRUST_FORCE_MAX = 1400;        // peak upward force (px/s²)
    var THRUST_TERMINAL = -320;         // peak upward velocity (px/s) — above-ground legacy climb
    // v24.59 — UNDERGROUND vertical climb (dig-out) gets its own, stronger force +
    // terminal pair so the booster/rocket upgrade can actually speed it up. Above
    // ground the climb stays on THRUST_* at the fixed FLIGHT_ABOVE_MULT and is
    // never touched by upgrades. At the base booster tier (x0.70) the
    // force-vs-gravity balance settles near -173 px/s (~12 MPH); each rocket tier
    // raises it (roughly 12 / 17 / 20 / 24 / 27 MPH for tiers 1..5).
    var UG_VERT_FORCE = 1100;           // underground peak upward force (px/s^2)
    var UG_VERT_TERMINAL = -560;        // underground nominal terminal (headroom anchor)
    // Above-ground flight thrust is frozen at this fixed multiplier instead of the
    // booster's per-tier value, so buying rockets never changes above-ground feel.
    // 0.70 = today's starting feel; raise toward 1.00 for the snappier anchor feel.
    var FLIGHT_ABOVE_MULT = 0.70;
    var THRUST_TILT_INPUT_MAX = 0.54;   // desired body bank while steering in flight
    var THRUST_SIDE_AUTHORITY = 0.88;   // effective side thrust after rig mass/inertia
    var SIDE_THRUST_COOK_RISE = 2.6;    // 1/sec horizontal thrust authority build-up
    var SIDE_THRUST_COOK_FALL = 3.4;    // 1/sec side burn vent/reset
    var ROCKET_SIDE_DRAG_LINEAR = 0.45; // 1/sec aerodynamic damping (raised so coasting bleeds quicker)
    var ROCKET_SIDE_DRAG_QUAD = 0.00120;// v² drag; creates a soft sideways terminal
    var FLIGHT_TILT_MAX = 0.56;         // visual/physics bank cap (~32°)
    var FLIGHT_TILT_SPRING = 230;       // angular spring toward desired bank (raised for snappier reverse)
    var FLIGHT_TILT_DAMP = 18.0;        // angular damping for inertial bank
    var REVERSE_THRUST_BOOST = 1.85;    // side-thrust multiplier when banking opposes current vx
    var THRUST_SPOOL_RISE = 48;         // 1/sec — full in ~20ms after the tap floor
    var THRUST_SPOOL_FALL = 145;        // 1/sec — gone in ~7ms (clean cutoff)
    var THRUST_SPOOL_TAP_FLOOR = 0.68;  // spool snaps to this on press edge
    var TAP_IMPULSE_DELTA = 150;        // px/s velocity kick on tap
    var TAP_IMPULSE_FLOOR = -160;       // tap clamps vy no lower than this
    var TAP_FUEL_COST = 0.05;           // small per-tap fuel cost
    var SIDE_THRUSTER_IMPULSE = 92;      // astronaut-suit nudge for surface liftoff / tunnel exit
    var SIDE_THRUSTER_SPEED_CAP = 260;   // cap after the impulse so pulses stay minute
    var SIDE_THRUSTER_FUEL_COST = 0.025;
    var SIDE_THRUSTER_LIFTOFF_WINDOW = 0.4; // seconds after leaving ground to spend the side puff
    var SURFACE_EXIT_PUFF_GRACE = 0.50;  // starts once the whole rig clears the tunnel mouth
    var UNDERGROUND_AIR_SPEED = 185;     // direct in-air steering while below the surface
    var UNDERGROUND_AIR_ACCEL = 1100;
    var UNDERGROUND_AIR_TURN_BRAKE = 1050;
    var UNDERGROUND_AIR_FRIC = 430;
    var UNDERGROUND_AIR_OVERSPEED_BLEED = 900;
    var HOVER_ASSIST = 220;         // anti-grav force when near zero vy
    var HOVER_BAND = 80;            // |vy| within which hover is full strength
    var COYOTE_T = 0.10;            // seconds of grace after leaving ground
    var JET_BUFFER_T = 0.10;        // seconds jet press is buffered forward (reserved for future drill-cancel use; does not affect held jet)
    var GRAVITY_PLAYER = 760;       // heavier than world GRAVITY for bite
    var GRAVITY_RELIEF = 0.30;      // gravity scaled DOWN while jet active
    var MAX_FALL = 740;             // terminal fall speed
    // ---- Stage 2: hover-settle + apex easing ----
    // Hover-settle (Terraria UFO): when jet is released near zero vy, damp
    // toward zero so the rig parks instead of drifting. Only applies when no
    // jet input is held — held jet uses HOVER_ASSIST above for the same job.
    // Apex easing (Hollow Knight): gravity is briefly reduced near vy=0 so
    // the top of an ascent hangs a beat longer. Short and strong, not long
    // and weak — band stays well below |TERMINAL|/3.
    var HOVER_SETTLE_BAND = 60;     // |vy| under which settle damping applies
    var HOVER_SETTLE_DAMP = 5.5;    // 1/sec damping rate (vy *= exp(-k*dt))
    var APEX_EASING_BAND = 80;      // |vy| under which gravity is reduced
    var APEX_EASING_FACTOR = 0.5;   // gravity multiplier at vy=0 inside band

    var undergroundNow = playerIsUnderground();
    var undergroundAirControl = undergroundNow && !player.onGround && !drilling;
    // v24.1 — rotation flight persists ~3 BLOCKS below the surface before handing
    // off to the underground (axis-aligned) flight + d-pad, so a dive doesn't snap
    // the controls the instant you cross the surface. Flight-only threshold; the
    // global `undergroundNow` (collision / biome / render) is untouched.
    var flightDeepUnder = (player.y + PLAYER_H * 0.65) > (SKY_ROWS * TILE + 3 * TILE);
    // v23.70 — rotational free-flight: within ~3 blocks of the surface, airborne,
    // not drilling, mode 1. When true the legacy jet/tilt/gravity block below is
    // replaced by the rotational integrator; both converge on the shared sweep.
    var rotFlight = flightTune.mode === 1 && !flightDeepUnder && !player.onGround && !drilling;
    // v24.145 — VTOL hover flight (mode 2): same gate shape, its own integrator
    // below. Ground / underground / drilling stay on the legacy code in every mode.
    var vtolFlight = flightTune.mode === 2 && !flightDeepUnder && !player.onGround && !drilling;
    // v23.88 — coyote timer for "just left the ground", so rotation flight takes
    // off UPRIGHT from the ground (even while holding thrust) instead of seeding
    // the heading from launch velocity. Set while grounded, decays in the air.
    if (player.onGround) player.flightGroundT = 0.18;
    else player.flightGroundT = Math.max(0, (player.flightGroundT || 0) - dt);
    var surfaceClearedNow = playerHasClearedSurface();
    if (undergroundNow) {
      player.surfaceThrusterPending = false;
      player.surfaceThrusterGraceT = 0;
      player.sideThrusterT = 0;
      player.sideThrusterDir = 0;
      if (sideThrusterPuffs) sideThrusterPuffs.length = 0;
    } else if (player.wasUnderground) {
      player.surfaceThrusterPending = true;
      player.surfaceThrusterGraceT = 0;
    }
    if (player.surfaceThrusterPending && surfaceClearedNow) {
      player.surfaceThrusterPending = false;
      player.surfaceThrusterGraceT = SURFACE_EXIT_PUFF_GRACE;
    } else if (player.surfaceThrusterGraceT > 0) {
      player.surfaceThrusterGraceT -= dt;
      if (player.surfaceThrusterGraceT < 0) player.surfaceThrusterGraceT = 0;
    }
    player.wasUnderground = undergroundNow;

    // Coyote and jet-buffer bookkeeping
    // flight2 FX event counters (consumers diff the N fields; never reset).
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
      player.sideThrusterCharged = true;
      resetFlightBank();
    } else {
      player.coyoteT = Math.max(0, player.coyoteT - dt);
      player.airTime += dt;
      if (player.vy > player.peakFallVy) player.peakFallVy = player.vy;
    }
    player._groundWas = player.onGround;
    if (player.edgeMoveU) player.jetBufferT = JET_BUFFER_T;
    else player.jetBufferT = Math.max(0, player.jetBufferT - dt);

    var sideThrusterAvailable = !rotFlight && !vtolFlight && !undergroundNow && !player.onGround && player.airTime <= SIDE_THRUSTER_LIFTOFF_WINDOW && !drilling && player.fuel > 0;
    var surfaceExitThrusterAvailable = !rotFlight && !vtolFlight && player.surfaceThrusterGraceT > 0 && !drilling && player.fuel > 0;
    var sidePulseDir = 0;
    var useSideGrace = false;
    if ((sideThrusterAvailable || surfaceExitThrusterAvailable) && moveL !== moveR) {
      if (surfaceExitThrusterAvailable) {
        sidePulseDir = moveR ? 1 : -1;
        useSideGrace = true;
      } else if (sideThrusterAvailable && player.sideThrusterCharged) {
        if (player.edgeMoveL) sidePulseDir = -1;
        else if (player.edgeMoveR) sidePulseDir = 1;
      }
    }
    if (sidePulseDir !== 0) {
      var sideImpulse = SIDE_THRUSTER_IMPULSE * (useSideGrace ? 2.0 : 1);
      player.vx += sidePulseDir * sideImpulse;
      if (player.vx > SIDE_THRUSTER_SPEED_CAP) player.vx = SIDE_THRUSTER_SPEED_CAP;
      if (player.vx < -SIDE_THRUSTER_SPEED_CAP) player.vx = -SIDE_THRUSTER_SPEED_CAP;
      player.sideThrusterT = 0.16;
      player.sideThrusterDir = sidePulseDir;
      spawnSideThrusterPuff(-sidePulseDir);
      if (useSideGrace) player.surfaceThrusterGraceT = 0;
      else player.sideThrusterCharged = false;
      player.fuel -= SIDE_THRUSTER_FUEL_COST;
      if (player.fuel < 0) player.fuel = 0;
    }
    if (player.sideThrusterT > 0) {
      player.sideThrusterT -= dt;
      if (player.sideThrusterT < 0) player.sideThrusterT = 0;
    }
    var deployTarget = (sideThrusterAvailable || surfaceExitThrusterAvailable || player.sideThrusterT > 0) ? 1 : 0;
    player.sideThrusterDeploy += (deployTarget - player.sideThrusterDeploy) * Math.min(1, dt * 10);

    // In open air, left/right input changes attitude and the rocket provides
    // lateral force. Underground, it directly steers the rig for tight tunnels.
    var jetIntent = player.fuel > 0 && (moveU || player.thrustSpool > 0.08);
    // Jello grip: slightly slippery when standing on a gel blob. 1.0 on solid ground.
    var _jelloGrip = (player.onGround && player.onJello) ? JELLO_GROUND_GRIP : 1.0;
    var acc = (player.onGround ? ACC_GROUND : (undergroundAirControl ? UNDERGROUND_AIR_ACCEL : 0)) * _jelloGrip;

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
      if (reversing && (player.onGround || undergroundAirControl)) {
        var brake = (player.onGround ? TURN_BRAKE_GROUND : UNDERGROUND_AIR_TURN_BRAKE) * dt;
        if (player.vx > 0) {
          player.vx = Math.max(0, player.vx - brake);
        } else {
          player.vx = Math.min(0, player.vx + brake);
        }
      }
      // Active turnaround: ground gets a slight tread-shift because the
      // brake above eats the old velocity before full pull-away. Open air
      // still leaves translation to bank + boosters; underground air gets
      // direct acceleration for readable tunnel navigation.
      var accNow = reversing
        ? (player.onGround ? acc * 0.72 : (undergroundAirControl ? acc * 0.85 : acc * TURN_BOOST))
        : acc;
      var inputSpeedLimit = player.onGround ? TOP_SPEED : (undergroundAirControl ? UNDERGROUND_AIR_SPEED : (jetIntent ? ROCKET_SIDE_SPEED_LIMIT : TOP_SPEED));
      var pushingPastLimit = (dirIn > 0 && player.vx >= inputSpeedLimit) ||
                             (dirIn < 0 && player.vx <= -inputSpeedLimit);
      if (pushingPastLimit) accNow = 0;
      if (accNow !== 0) player.vx += dirIn * accNow * dt;
      // Instant tap kick: only on edge press, only when starting from low/wrong-sign vx,
      // and only on the ground (in the air it would feel like a teleport-step).
      var edgeTap = (dirIn > 0 && player.edgeMoveR) || (dirIn < 0 && player.edgeMoveL);
      // air-pulse: the underground horizontal thruster puff — one per fresh
      // tap (pool of 6 + jitter keeps rapid tapping from machine-gunning).
      if (edgeTap && !player.onGround && undergroundAirControl) {
        sfxPlay('air-pulse', { pan: 0.25 * dirIn });
      }
      if (edgeTap && player.onGround) {
        var sameSign = (dirIn > 0 && player.vx > 0) || (dirIn < 0 && player.vx < 0);
        if (!sameSign || Math.abs(player.vx) < TOP_SPEED * 0.3) {
          player.vx += dirIn * INSTANT_KICK;
        }
      }
    } else {
      // No directional input — friction toward zero
      var fric = player.onGround
        ? (Math.abs(player.vx) > TOP_SPEED ? FRIC_GROUND_SKID : FRIC_GROUND) * _jelloGrip
        : (undergroundAirControl ? UNDERGROUND_AIR_FRIC : 0);
      if (fric > 0) {
        if (player.vx > 0) { player.vx -= fric * dt; if (player.vx < 0) player.vx = 0; }
        else if (player.vx < 0) { player.vx += fric * dt; if (player.vx > 0) player.vx = 0; }
      }
    }
    // Horizontal safety cap. Ground drive tops out at TOP_SPEED by refusing
    // further same-direction acceleration above; rocket inertia can carry
    // much higher and then skids down under ground friction after landing.
    if (player.onGround && Math.abs(player.vx) > TOP_SPEED) {
      var skidSign = player.vx > 0 ? 1 : -1;
      var skidBleed = Math.min(Math.abs(player.vx) - TOP_SPEED, FRIC_GROUND_SKID * 0.55 * dt);
      player.vx -= skidSign * skidBleed;
    }
    if (undergroundAirControl && Math.abs(player.vx) > UNDERGROUND_AIR_SPEED) {
      var airSkidSign = player.vx > 0 ? 1 : -1;
      var airBleed = Math.min(Math.abs(player.vx) - UNDERGROUND_AIR_SPEED, UNDERGROUND_AIR_OVERSPEED_BLEED * dt);
      player.vx -= airSkidSign * airBleed;
    }
    // flight2: while the aero layer is live in rotation flight, the hard
    // sideways clamp is OFF — the dive-earned soft cap (aero drag wall in the
    // rotFlight branch) owns the envelope instead, so dive momentum survives.
    // VTOL likewise owns its envelope (cruise cap + gentle over-cap bleed in
    // its branch). The NMZ storm-shear cap below stays for all (zone balance).
    var f2rot = rotFlight && flight2.ENABLE > 0;
    if (!f2rot && !vtolFlight) {
      if (player.vx > ROCKET_SIDE_SPEED_LIMIT) player.vx = ROCKET_SIDE_SPEED_LIMIT;
      if (player.vx < -ROCKET_SIDE_SPEED_LIMIT) player.vx = -ROCKET_SIDE_SPEED_LIMIT;
    }
    // Storm-shear headwind: tighter sideways cap above the flak deck in a zone.
    if (nmzShear && nmzShear.speed < 1) {
      var _shearCap = ROCKET_SIDE_SPEED_LIMIT * nmzShear.speed;
      if (player.vx > _shearCap) player.vx = _shearCap;
      if (player.vx < -_shearCap) player.vx = -_shearCap;
    }

    // v23.70 / v24.145 — three flight integrators: VTOL hover (mode 2) first,
    // then the legacy axis-aligned jet (mode 0, plus ground/underground for all
    // modes), then rotational free-flight (mode 1). The legacy region below is
    // left at its original indentation to keep the diff minimal; it runs
    // verbatim when neither sky model is active.
    if (vtolFlight) {
      // ===== VTOL hover flight (above-ground, mode 2) — v24.145 =====
      // "Wings" handling on the same diesel rocket: upright rig (no heading),
      // moveU climbs, L/R is DIRECT horizontal authority with reversal bite,
      // release drifts on mild air friction. Fuel is the only limiter — no
      // flight meter, no run-dry glide, full fall damage. The vertical model
      // is the legacy jet's proven shape (tap kick, spool, headroom toward a
      // terminal, hover assist, gravity relief, apex easing, hover-settle) at
      // sky authority. The WHOLE envelope lerps to the underground air numbers
      // across the 3-block handoff band (skyT below), so the legacy takeover
      // at flightDeepUnder is a seamless parameter slide, not a control flip.
      // Tunables: vtolTune (020, the 'vtol' gm group / L-panel presets).
      var vt = vtolTune;
      player.rotFlightActive = false;

      // Depth blend — 1 = rig clear of the surface line, 0 = at the handoff.
      // Same foot anchor as the flightDeepUnder gate so the two agree.
      var _vtFoot = player.y + PLAYER_H * 0.65;
      var _vtSkyT = 1 - Math.max(0, Math.min(1, (_vtFoot - SKY_ROWS * TILE) / (3 * TILE)));
      var _vtUgT = 1 - _vtSkyT;

      // --- Horizontal: direct air control (the wings half) ---
      var _vtAcc  = vt.acc   * _vtSkyT + UNDERGROUND_AIR_ACCEL * _vtUgT;
      var _vtCap  = vt.speed * _vtSkyT + UNDERGROUND_AIR_SPEED  * _vtUgT;
      var _vtFric = vt.fric  * _vtSkyT + UNDERGROUND_AIR_FRIC   * _vtUgT;
      var _vtDir = (moveR ? 1 : 0) - (moveL ? 1 : 0);
      if (_vtDir !== 0) {
        // Reversal bite: opposing your own vx multiplies authority so a
        // dodge-flip is immediate (the combat half of "easy but variable").
        var _vtRev = (_vtDir * player.vx < -8) ? vt.revBoost : 1;
        var _vtPast = (_vtDir > 0 && player.vx >= _vtCap) || (_vtDir < 0 && player.vx <= -_vtCap);
        if (!_vtPast) {
          var _vtPrevVx = player.vx;
          player.vx += _vtDir * _vtAcc * _vtRev * dt;
          // Input alone never pushes PAST the cap — but never confiscates
          // over-cap speed that was already earned (rings, dive exits).
          if (player.vx > _vtCap && _vtPrevVx <= _vtCap) player.vx = _vtCap;
          else if (player.vx < -_vtCap && _vtPrevVx >= -_vtCap) player.vx = -_vtCap;
        }
      } else if (player.vx !== 0) {
        var _vtF = _vtFric * dt;
        if (player.vx > 0) { player.vx -= _vtF; if (player.vx < 0) player.vx = 0; }
        else { player.vx += _vtF; if (player.vx > 0) player.vx = 0; }
      }
      // Earned overspeed bleeds exponentially instead of hitting a wall, so
      // boost rings / momentum carries stay meaningful for a beat or two.
      var _vtVxa = Math.abs(player.vx);
      if (_vtVxa > _vtCap) {
        var _vtEx = (_vtVxa - _vtCap) * Math.exp(-vt.overBleed * dt);
        player.vx = (player.vx > 0 ? 1 : -1) * (_vtCap + _vtEx);
      }

      // --- Vertical: the proven legacy jet shape at sky authority ---
      if (player.edgeMoveU && player.fuel > 0) {
        var _vtTapVy = player.vy - TAP_IMPULSE_DELTA;
        if (_vtTapVy < TAP_IMPULSE_FLOOR) _vtTapVy = TAP_IMPULSE_FLOOR;
        if (_vtTapVy < player.vy) {
          player.vy = _vtTapVy;
          if (player.thrustSpool < THRUST_SPOOL_TAP_FLOOR) player.thrustSpool = THRUST_SPOOL_TAP_FLOOR;
          player.fuel -= TAP_FUEL_COST;
          if (player.fuel < 0) player.fuel = 0;
        }
      }
      var _vtHeld = moveU && player.fuel > 0;
      if (_vtHeld && !player._thrustWas) player.fx.igniteN++;
      player._thrustWas = _vtHeld;
      if (_vtHeld) player.thrustSpool = Math.min(1, player.thrustSpool + dt * THRUST_SPOOL_RISE);
      else player.thrustSpool = Math.max(0, player.thrustSpool - dt * THRUST_SPOOL_FALL);

      if (player.thrustSpool > 0.001) {
        var _vtTerm = vt.climbTerm * _vtSkyT + UG_VERT_TERMINAL * _vtUgT;
        var _vtFmax = vt.climbForce * _vtSkyT + UG_VERT_FORCE * _vtUgT;
        // v24.59 rule kept: upgrades never change ABOVE-ground flight; the
        // booster multiplier fades in only across the handoff band so the
        // climb meets the (boosted) underground numbers at the line.
        var _vtMult = _vtSkyT + getBoosterThrustMult() * _vtUgT;
        var _vtHead = (player.vy - _vtTerm) / Math.max(1, Math.abs(_vtTerm));
        if (_vtHead < 0) _vtHead = 0; else if (_vtHead > 1) _vtHead = 1;
        var _vtForce = _vtFmax * player.thrustSpool * _vtHead * _vtMult;
        var _vtVya = Math.abs(player.vy);
        if (_vtVya < HOVER_BAND) {
          var _vtHk = 1 - (_vtVya / HOVER_BAND);
          _vtHk = _vtHk * _vtHk * (3 - 2 * _vtHk);    // smoothstep
          _vtForce += HOVER_ASSIST * _vtHk * player.thrustSpool;
        }
        player.vy -= _vtForce * dt;
        player.fuel -= DRILL_FUEL * 0.5 * player.thrustSpool * (nmzShear ? nmzShear.fuel : 1) * dt;
        if (player.fuel < 0) player.fuel = 0;
      }
      // Legacy's side-burn glow state decays here too so the plume never
      // carries a stale cook value across a mode hop.
      player.sideThrustCook = Math.max(0, (player.sideThrustCook || 0) - SIDE_THRUST_COOK_FALL * dt);
      player.thrusting = player.thrustSpool > 0.15;

      // Gravity with relief while lit + apex hang near vy=0 + hover-settle on
      // release — shared constants with the legacy jet so the regimes rhyme.
      gravScale = 1 - vt.gravRelief * player.thrustSpool;
      var _vtVyApex = Math.abs(player.vy);
      if (_vtVyApex < APEX_EASING_BAND) {
        var _vtAk = 1 - (_vtVyApex / APEX_EASING_BAND);
        _vtAk = _vtAk * _vtAk * (3 - 2 * _vtAk);    // smoothstep
        gravScale *= 1 - (1 - APEX_EASING_FACTOR) * _vtAk;
      }
      player.vy += vt.gravity * gravScale * dt;
      if (!moveU && player.thrustSpool < 0.05 && Math.abs(player.vy) < HOVER_SETTLE_BAND) {
        player.vy *= Math.exp(-HOVER_SETTLE_DAMP * dt);
      }

      // Visual bank only — the physics is axis-aligned. Input lean + a touch
      // of speed lean on the same spring as the legacy flight, so drawPlayer
      // and the plume (thrustVec) read the motion via the shared bodyTilt.
      var _vtTiltT = _vtDir * vt.tilt +
        Math.max(-1, Math.min(1, player.vx / Math.max(1, vt.speed))) * 0.10;
      if (_vtTiltT > FLIGHT_TILT_MAX) _vtTiltT = FLIGHT_TILT_MAX;
      if (_vtTiltT < -FLIGHT_TILT_MAX) _vtTiltT = -FLIGHT_TILT_MAX;
      player.flightTiltVel += (_vtTiltT - player.flightTilt) * FLIGHT_TILT_SPRING * dt;
      player.flightTiltVel *= Math.exp(-FLIGHT_TILT_DAMP * dt);
      player.flightTilt += player.flightTiltVel * dt;
      if (player.flightTilt > FLIGHT_TILT_MAX) { player.flightTilt = FLIGHT_TILT_MAX; player.flightTiltVel = 0; }
      if (player.flightTilt < -FLIGHT_TILT_MAX) { player.flightTilt = -FLIGHT_TILT_MAX; player.flightTiltVel = 0; }
      player.thrustVecX = Math.sin(player.flightTilt || 0);
      player.thrustVecY = -Math.cos(player.flightTilt || 0);
    } else if (!rotFlight) {
    player.rotFlightActive = false;

    // ---- Jet thrust (variable: tap-burst + hold-climb + clean release) ----

    // 1. Tap impulse — frame-rate-independent velocity kick on the press edge.
    //    Won't fire if you're already climbing faster than the impulse target,
    //    so a follow-up tap during a powered ascent doesn't slow you down.
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

    // 2. Held thrust — clean release: only the live moveU keeps the spool
    //    alive. jetBufferT is preserved as state but no longer drives the
    //    spool, so a quick tap-release is *immediately* a release (no drift).
    var jetHeld = moveU && player.fuel > 0;
    if (jetHeld) {
      player.thrustSpool = Math.min(1, player.thrustSpool + dt * THRUST_SPOOL_RISE);
    } else {
      player.thrustSpool = Math.max(0, player.thrustSpool - dt * THRUST_SPOOL_FALL);
    }

    // Body-mounted vector thrust: horizontal input banks the airborne rig
    // whether or not the booster is lit. The booster only decides whether
    // that attitude produces force.
    var bankInputX = 0;
    if (moveL !== moveR) bankInputX = moveR ? 1 : -1;
    var speedBank = Math.max(-1, Math.min(1, player.vx / TOP_SPEED)) * 0.08;
    var targetTilt = 0;
    if (!playerInMiningPose() && !player.onGround && !undergroundAirControl) {
      // One steering posture: pressing left/right asks for the same bank
      // whether you're reversing or already moving that way. Velocity still
      // adds a tiny lean so fast travel reads in the sprite, but input no
      // longer has two different tilt levels.
      targetTilt = bankInputX * THRUST_TILT_INPUT_MAX + speedBank;
    }
    if (targetTilt > FLIGHT_TILT_MAX) targetTilt = FLIGHT_TILT_MAX;
    if (targetTilt < -FLIGHT_TILT_MAX) targetTilt = -FLIGHT_TILT_MAX;
    if (player.onGround || playerInMiningPose() || undergroundAirControl) {
      resetFlightBank();
    } else {
      player.flightTiltVel += (targetTilt - player.flightTilt) * FLIGHT_TILT_SPRING * dt;
      player.flightTiltVel *= Math.exp(-FLIGHT_TILT_DAMP * dt);
      player.flightTilt += player.flightTiltVel * dt;
      if (player.flightTilt > FLIGHT_TILT_MAX) { player.flightTilt = FLIGHT_TILT_MAX; player.flightTiltVel = 0; }
      if (player.flightTilt < -FLIGHT_TILT_MAX) { player.flightTilt = -FLIGHT_TILT_MAX; player.flightTiltVel = 0; }
    }
    player.thrustVecX = Math.sin(player.flightTilt || 0);
    player.thrustVecY = -Math.cos(player.flightTilt || 0);
    var lateralBurn = jetHeld && !player.onGround && Math.abs(player.thrustVecX) > 0.035;
    if (lateralBurn) {
      player.sideThrustCook = Math.min(1, (player.sideThrustCook || 0) + SIDE_THRUST_COOK_RISE * dt);
    } else {
      player.sideThrustCook = Math.max(0, (player.sideThrustCook || 0) - SIDE_THRUST_COOK_FALL * dt);
    }

    if (player.thrustSpool > 0.001) {
      // Tilt-scaled terminal: banking trims climb speed, but no longer
      // crushes vertical movement toward zero. You should be able to steer
      // while still meaningfully rising.
      // v24.59 — only the UNDERGROUND climb reads the booster/rocket upgrade, and
      // it uses the stronger UG_VERT_* pair so the upgrade actually speeds the
      // dig-out (~20 MPH at the base tier, rising per tier). Above ground the climb
      // is frozen at FLIGHT_ABOVE_MULT so upgrades never change above-ground flight.
      var ugClimb = undergroundNow;
      var climbTerminal = ugClimb ? UG_VERT_TERMINAL : THRUST_TERMINAL;
      var climbForceMax = ugClimb ? UG_VERT_FORCE : THRUST_FORCE_MAX;
      var climbMult = ugClimb ? getBoosterThrustMult() : FLIGHT_ABOVE_MULT;
      var tiltFracForTerm = Math.min(1, Math.abs(player.flightTilt || 0) / FLIGHT_TILT_MAX);
      var effTerminal = climbTerminal * (1 - tiltFracForTerm * 0.35);
      var THRUST_TERMINAL_FADE = Math.abs(climbTerminal);
      var headroom = (player.vy - effTerminal) / THRUST_TERMINAL_FADE;
      if (headroom < 0) headroom = 0;
      else if (headroom > 1) headroom = 1;
      var force = climbForceMax * player.thrustSpool * headroom * climbMult;

      // Hover assist: extra anti-grav near zero vy. Falls off as |vy| grows
      // beyond HOVER_BAND so it doesn't fight terminal climb. Smoothstep gives
      // a gentle, predictable transition between hover and full climb.
      var vyAbs = Math.abs(player.vy);
      if (vyAbs < HOVER_BAND) {
        var hoverK = 1 - (vyAbs / HOVER_BAND);
        hoverK = hoverK * hoverK * (3 - 2 * hoverK);    // smoothstep
        force += HOVER_ASSIST * hoverK * player.thrustSpool;
      }

      var sideCook = player.sideThrustCook || 0;
      var sideCookCurve = sideCook <= 0 ? 0 : (0.28 + sideCook * 0.72);
      var thrustAx = force * player.thrustVecX * THRUST_SIDE_AUTHORITY * sideCookCurve;
      var thrustAy = force * player.thrustVecY;
      // Reverse-thrust boost: when banking opposes current horizontal velocity,
      // multiply lateral acceleration so coming in hot from one side and
      // braking the other way doesn't take forever. Strongest at high |vx|.
      if (thrustAx * player.vx < 0) {
        var brakeStrength = Math.min(1, Math.abs(player.vx) / TOP_SPEED);
        thrustAx *= 1 + (REVERSE_THRUST_BOOST - 1) * brakeStrength;
      }
      player.vx += thrustAx * dt;
      player.vy += thrustAy * dt;
      // No hard clamp on vy here. The smooth headroom curve above already
      // zeros out thrust force past effTerminal, so sustained held thrust
      // can't push beyond it. Tap impulse and momentum are free to overshoot
      // briefly — gravity restores them, which feels natural.

      // Fuel drain proportional to spool — taps cost less than holds
      player.fuel -= DRILL_FUEL * 0.5 * player.thrustSpool * (nmzShear ? nmzShear.fuel : 1) * dt;
    }
    if (!player.onGround && player.thrustSpool > 0.08) {
      var dragAx = player.vx * ROCKET_SIDE_DRAG_LINEAR +
                   player.vx * Math.abs(player.vx) * ROCKET_SIDE_DRAG_QUAD;
      var prevDragVx = player.vx;
      player.vx -= dragAx * dt;
      if (prevDragVx !== 0 && prevDragVx * player.vx < 0) player.vx = 0;
    }
    if (player.vx > ROCKET_SIDE_SPEED_LIMIT) player.vx = ROCKET_SIDE_SPEED_LIMIT;
    if (player.vx < -ROCKET_SIDE_SPEED_LIMIT) player.vx = -ROCKET_SIDE_SPEED_LIMIT;
    // Storm-shear headwind: tighter sideways cap above the flak deck in a zone.
    if (nmzShear && nmzShear.speed < 1) {
      var _shearCap = ROCKET_SIDE_SPEED_LIMIT * nmzShear.speed;
      if (player.vx > _shearCap) player.vx = _shearCap;
      if (player.vx < -_shearCap) player.vx = -_shearCap;
    }
    player.thrusting = player.thrustSpool > 0.15;

    // ---- Gravity (with relief while thrust active + apex easing) ----
    var gravScale = 1 - GRAVITY_RELIEF * player.thrustSpool;
    // Apex easing: scale gravity down near vy=0 so the apex of an ascent and
    // the moment of suspended hover both hang a beat longer. Smoothstep keeps
    // the transition out of the band invisible. Strongest at vy=0, gone past
    // the band edge.
    if (!player.onGround) {
      var vyAbsForApex = Math.abs(player.vy);
      if (vyAbsForApex < APEX_EASING_BAND) {
        var apexK = 1 - (vyAbsForApex / APEX_EASING_BAND);
        apexK = apexK * apexK * (3 - 2 * apexK);    // smoothstep
        gravScale *= 1 - (1 - APEX_EASING_FACTOR) * apexK;
      }
    }
    player.vy += GRAVITY_PLAYER * gravScale * dt;

    // Hover-settle: when jet input is released and we're crawling near zero
    // vy, damp toward zero exponentially. Frame-rate independent. Only fires
    // when not actively thrusting (held jet's HOVER_ASSIST already handles
    // it) and not standing on the ground (ground friction handles vy=0).
    if (!moveU && !player.onGround && player.thrustSpool < 0.05) {
      if (Math.abs(player.vy) < HOVER_SETTLE_BAND) {
        player.vy *= Math.exp(-HOVER_SETTLE_DAMP * dt);
      }
    }

    } else {
      // ===== Rotational free-flight (above-ground) — v23.70 =====
      // Self-contained: steer the heading, thrust along it, gravity + linear
      // drag (emergent top speed), then fall through to the shared position +
      // collision sweep below. Tunables live in flightTune (the 'flight' GM
      // group / L panel). A/D (or d-pad L/R) rotate; moveU (W / up / space /
      // d-pad-up) is thrust. (v23.81: aim-at-cursor mode removed.)
      var ft = flightTune;
      if (!player.rotFlightActive) {
        // Rising edge. Taking off from the ground (coyote timer) always launches
        // UPRIGHT so a rotated landing + held gas doesn't fling you off sideways.
        // Entering flight mid-air instead seeds the nose from current motion so a
        // climb doesn't snap to a random heading.
        if (player.flightGroundT > 0) {
          player.angle = -Math.PI / 2;
        } else {
          var _spd0 = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
          player.angle = _spd0 > 60 ? Math.atan2(player.vy, player.vx) : -Math.PI / 2;
        }
        player.angVel = 0;
        player.aeroBuffetS = 0;   // fresh flight, fresh telegraph envelope
        player.tremor = 0;
        player._stallWas = false;
      }
      player.rotFlightActive = true;
      gravScale = 1;   // keep the gel-buoyancy path (reads gravScale) NaN-free

      var thrustHeld = false;
      // A/D (or d-pad L/R) rotate, moveU (W / up / space / d-pad-up) thrusts.
      // Settle-on-release (Rocket-League trick): angular damping applies ONLY
      // when not actively steering, so the turn ramps cleanly to its cap while
      // held and the nose stops fast on release. flight2 layers two authority
      // scalers on top: throttle-coupled turn (coast = whippy nose, thrust =
      // committed, the Luftrausers rhythm) and transonic stiffening (the nose
      // firms up between STIFF_V and BOOM_V so deep dives demand commitment).
      thrustHeld = moveU && player.fuel > 0;
      var _f2 = flight2.ENABLE > 0;
      var _turn = (moveR ? 1 : 0) - (moveL ? 1 : 0);
      player.turnDir = _turn;
      var _spdPrev = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      var _tAuth = 1, _omAuth = 1;
      if (_f2) {
        var _tcT = (player.thrustSpool > 0.3) ? 1 : 0;
        player.turnThrustEase = (player.turnThrustEase || 0) +
          (_tcT - (player.turnThrustEase || 0)) * (1 - Math.exp(-flight2.TURN_EASE * dt));
        _tAuth = 1 - (1 - flight2.TURN_THRUST_MULT) * player.turnThrustEase;
        _omAuth = 1 - (1 - flight2.TURN_OMEGA_MULT) * player.turnThrustEase;
        if (_spdPrev > flight2.STIFF_V) {
          var _stT = (_spdPrev - flight2.STIFF_V) / Math.max(1, flight2.BOOM_V * 1.05 - flight2.STIFF_V);
          if (_stT > 1) _stT = 1;
          _stT = _stT * _stT * (3 - 2 * _stT);
          var _stiff = 1 - (1 - flight2.STIFF_MIN) * _stT;
          _tAuth *= _stiff; _omAuth *= _stiff;
        }
      }
      player.angVel += _turn * ft.turnAccel * _tAuth * dt;
      if (_turn === 0) player.angVel *= Math.exp(-ft.angDamp * dt);
      var _omCap = ft.maxOmega * _omAuth;
      if (player.angVel > _omCap) player.angVel = _omCap;
      else if (player.angVel < -_omCap) player.angVel = -_omCap;
      player.angle += player.angVel * dt;
      // Normalize heading to [0, 2pi).
      player.angle = ((player.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      // Spool drives the plume, fuel burn, and the shared `thrusting` flag.
      // flight2 slows the attack to an audible ~90ms spool but keeps frame-1
      // punch: thrust FORCE stays full-on-hold (below), and the ignition
      // floor snap + igniteN event give the press edge its bark.
      var _sRise = _f2 ? flight2.SPOOL_RISE : THRUST_SPOOL_RISE;
      var _sFall = _f2 ? flight2.SPOOL_FALL : THRUST_SPOOL_FALL;
      if (thrustHeld && !player._thrustWas) {
        player.fx.igniteN++;
        if (_f2 && player.thrustSpool < flight2.SPOOL_FLOOR) player.thrustSpool = flight2.SPOOL_FLOOR;
      }
      player._thrustWas = thrustHeld;
      if (thrustHeld) player.thrustSpool = Math.min(1, player.thrustSpool + dt * _sRise);
      else player.thrustSpool = Math.max(0, player.thrustSpool - dt * _sFall);

      if (thrustHeld) {
        var _ca = Math.cos(player.angle), _sa = Math.sin(player.angle);
        var _bThr = ft.thrust * FLIGHT_ABOVE_MULT;  // v24.59: above-ground thrust is fixed; the booster only speeds the underground climb
        player.vx += _ca * _bThr * dt;
        player.vy += _sa * _bThr * dt;
        player.fuel -= DRILL_FUEL * 0.5 * player.thrustSpool * (nmzShear ? nmzShear.fuel : 1) * dt;
        if (player.fuel < 0) player.fuel = 0;
      }
      // Gravity (own lever, lighter than the ground pull for a flight feel).
      player.vy += ft.gravity * dt;

      // ===== flight2 AERO (v24.112) =====
      // A real flight envelope from the rig's OWN motion only (no wind, ever;
      // owner rule): angle-of-attack lift perpendicular to the velocity
      // (swoop, zoom climb, flare, engine-off glide), a drag polar whose
      // overspeed wall the rig EARNS past by diving (momentum kept through
      // the pullout, then bled over OVER_DECAY), a stall with a buffet
      // telegraph + weathervane auto-recovery, and an ekranoplan ground-
      // effect cushion within ~GE_SPAN of the deck. Below MIN_AERO_V there
      // is NO aero at all, so hover + takeoff are byte-identical to flight1.
      player.aeroBuffet = 0; player.aeroStall = false; player.aeroAlpha = 0; player.aeroGE = 0;
      if (_f2) {
        var f2 = flight2;
        var _avx = player.vx, _avy = player.vy;
        var _s = Math.sqrt(_avx * _avx + _avy * _avy);
        if (_s > f2.MIN_AERO_V) {
          var _velAng = Math.atan2(_avy, _avx);
          var _al = _velAng - player.angle;
          while (_al > Math.PI) _al -= Math.PI * 2;
          while (_al < -Math.PI) _al += Math.PI * 2;
          player.aeroAlpha = _al;
          var _alAbs = _al < 0 ? -_al : _al;
          // Cl: linear up to the stall, then blended into a flat-plate lobe.
          var _clLin = f2.CLA * _al;
          if (_clLin > f2.CLMAX) _clLin = f2.CLMAX; else if (_clLin < -f2.CLMAX) _clLin = -f2.CLMAX;
          var _tt = (_alAbs - f2.STALL_A) / Math.max(0.001, f2.STALL_A * (f2.STALL_BLEND - 1));
          if (_tt < 0) _tt = 0; else if (_tt > 1) _tt = 1;
          _tt = _tt * _tt * (3 - 2 * _tt);
          var _cl = _clLin * (1 - _tt) + (1.1 * Math.sin(2 * _al)) * _tt;
          // Ground effect: induced-drag cut + lift cushion near the deck.
          var _hb = flightGroundClearance(f2.GE_SPAN * 2) / f2.GE_SPAN;
          if (_hb < 0.05) _hb = 0.05;
          var _gp = 33 * Math.pow(_hb, 1.5);
          var _G = _gp / (1 + _gp);                 // 1 = free air, -> 0 at the deck
          player.aeroGE = 1 - _G;
          var _kInd = f2.K_IND * (f2.GE_DRAG + (1 - f2.GE_DRAG) * _G);
          var _cd = f2.CD0 + _kInd * _cl * _cl + 1.2 * _tt * Math.abs(Math.sin(_al));
          // Dive-earned overspeed: descending fast raises the soft cap, and
          // the budget decays after the pullout, so dive speed is yours for
          // a few seconds instead of being confiscated by a hard clamp.
          var _ovr = player.overBudget || 0;
          if (player.vy > 0 && _s > f2.SOFT_CAP * 0.85) {
            _ovr += (player.vy / _s) * f2.OVER_GAIN * dt;
            if (_ovr > f2.DIVE_OVER - 1) _ovr = f2.DIVE_OVER - 1;
          }
          _ovr *= Math.exp(-dt / f2.OVER_DECAY);
          player.overBudget = _ovr;
          var _ovF = _s / (f2.SOFT_CAP * (1 + _ovr)) - 0.92;
          if (_ovF > 0) _cd += f2.OVER_K * _ovF * _ovF;
          var _qa = 0.5 * f2.AREA_K * _s * _s;
          var _liftA = _qa * _cl * (1 + f2.GE_LIFT * (1 - _G));
          var _dragA = _qa * _cd;
          var _dx = _avx / _s, _dy = _avy / _s;
          player.vx += (_liftA * _dy - _dragA * _dx) * dt;
          player.vy += (-_liftA * _dx - _dragA * _dy) * dt;
          // Stall telegraph + recovery, BAND-LIMITED to real wing-flight
          // (v24.116, owner: falls + drifting liftoffs were buzzing). The
          // lift/drag physics above already handle EVERY alpha; the FEEDBACK
          // fires only in the pre-stall envelope: buffet ramps over
          // [BUFFET_A0..1] x STALL_A, holds, then fades OUT by BUFFET_HI x
          // STALL_A, and needs TELEGRAPH_V of airspeed. A rig falling
          // tail-first (alpha ~180 deg) or lifting off with sideways drift
          // is not a stalling wing: no buzz, no horn, no assist there.
          var _bf0 = f2.STALL_A * f2.BUFFET_A0;
          var _bfRaw = 0;
          if (_s > f2.TELEGRAPH_V && _alAbs > _bf0) {
            var _bUp = (_alAbs - _bf0) / Math.max(0.001, f2.STALL_A - _bf0);
            if (_bUp > 1) _bUp = 1;
            var _bDn = 1 - (_alAbs - f2.STALL_A * 1.5) / Math.max(0.001, f2.STALL_A * (f2.BUFFET_HI - 1.5));
            if (_bDn > 1) _bDn = 1; else if (_bDn < 0) _bDn = 0;
            _bfRaw = _bUp < _bDn ? _bUp : _bDn;
          }
          // Eased envelope (fast attack, slower release) so the tremble
          // swells in and breathes out instead of popping per frame.
          var _bfPrev = player.aeroBuffetS || 0;
          player.aeroBuffetS = _bfPrev + (_bfRaw - _bfPrev) * (1 - Math.exp(-(_bfRaw > _bfPrev ? 14 : 7) * dt));
          player.aeroBuffet = player.aeroBuffetS < 0.005 ? 0 : player.aeroBuffetS;
          // Weathervane assist: strongest right past the break, fading to
          // ZERO by WV_HI so tail slides and upright descents are never
          // fought (the rig is a rocket; it may fall tail-first in peace).
          if (_alAbs > f2.STALL_A && _alAbs < f2.WV_HI && _s > f2.TELEGRAPH_V) {
            player.aeroStall = true;
            var _wvFade = 1 - (_alAbs - f2.STALL_A) / Math.max(0.001, f2.WV_HI - f2.STALL_A);
            player.angVel += _al * f2.WV_TORQUE * _wvFade * Math.min(1, _s / 300) * dt;
            player.angVel *= Math.exp(-1.5 * dt);   // keep the assist from winding up
          }
          // Airframe shiver kicks (v24.117, owner: the continuous tremor was
          // too much). Only discrete MOMENTS kick player.tremor (it decays in
          // ~0.3s below): the instant the stall breaks here, plus the vapor
          // threshold + the boom in the event block underneath. The render
          // keeps it barely-there (flight2.TREMOR_AMP scales, 0 = off).
          if (player.aeroStall && !player._stallWas) player.tremor = 1;
          player._stallWas = player.aeroStall;
          // Transonic ladder events (consumed by plume FX + audio + birds):
          // vapor sheath near the barrier, ONE boom per crossing (hysteresis).
          if (!player._vaporOn && _s >= f2.BOOM_V * 0.95) {
            player._vaporOn = true; player.fx.vaporN++;
            if ((player.tremor || 0) < 0.6) player.tremor = 0.6;
          }
          else if (player._vaporOn && _s < f2.BOOM_V * 0.86) player._vaporOn = false;
          if (!player._superSonic && _s >= f2.BOOM_V) {
            player._superSonic = true; player.fx.boomN++;
            player.tremor = 1;
          } else if (player._superSonic && _s < f2.BOOM_V * 0.88) {
            player._superSonic = false;
          }
        } else {
          player.overBudget = (player.overBudget || 0) * Math.exp(-dt / f2.OVER_DECAY);
          // Below aero speed the eased buffet envelope breathes out too, so
          // re-entering the envelope never pops a stale tremble.
          player.aeroBuffetS = (player.aeroBuffetS || 0) * Math.exp(-7 * dt);
          player._stallWas = false;
        }
      }
      // Shiver envelope breathes out fast; only the event kicks above raise it.
      player.tremor = (player.tremor || 0) * Math.exp(-dt / 0.14);
      if (player.tremor < 0.01) player.tremor = 0;
      // Linear drag (frame-rate independent). With aero ON most of the drag
      // story moves to the polar above, so linDamp is scaled down; without
      // aero the emergent top speed stays thrust/linDamp as before.
      var _ld = Math.exp(-ft.linDamp * (_f2 ? flight2.LINDAMP_MULT : 1) * dt);
      player.vx *= _ld;
      player.vy *= _ld;
      // Optional hard speed cap (0 = off; rely on the emergent drag cap).
      if (ft.maxSpeed > 0) {
        var _sp = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (_sp > ft.maxSpeed) { var _kc = ft.maxSpeed / _sp; player.vx *= _kc; player.vy *= _kc; }
      }
      player.thrusting = player.thrustSpool > 0.15;
      // Expose the heading as the thrust vector so the plume (and anything else
      // reading thrustVec) stays correct; legacy sets these from flightTilt.
      player.thrustVecX = Math.cos(player.angle);
      player.thrustVecY = Math.sin(player.angle);
    }

    // flight2: dives may exceed the old terminal so the boom is reachable;
    // FALL_CAP is the safety ceiling while aero is on (drag does the rest).
    var _fallCap = f2rot ? flight2.FALL_CAP : MAX_FALL;
    if (player.vy > _fallCap) player.vy = _fallCap;

    // v23.93 — mobile flight-control visibility: a dwell timer (so a brief ground
    // touch doesn't flicker the controls) + an eased cross-fade alpha (d-pad <->
    // rotate/thrust). Read by the UI overlay (140) + the touch hit-test (050).
    if (player.rotFlightActive) player.flightCtrlT = 0.45;
    else player.flightCtrlT = Math.max(0, (player.flightCtrlT || 0) - dt);
    var _fcTarget = (player.flightCtrlT > 0) ? 1 : 0;
    player.flightCtrlAlpha = (player.flightCtrlAlpha || 0) + (_fcTarget - (player.flightCtrlAlpha || 0)) * (1 - Math.exp(-10 * dt));

    // v23.82 — eased visual body tilt: the SINGLE source for both drawPlayer and
    // the exhaust/smoke (via playerLocalToWorld), so they rotate in lockstep.
    // Tracks the heading crisply while actively rotating, but eases back to
    // upright on exit so leaving rotation flight (into a shaft / onto the
    // ground) doesn't snap the rig. Shortest-angle ease; ~0.15s settle.
    var _btTarget = (player.rotFlightActive && !playerInMiningPose())
      ? (player.angle || 0) + Math.PI / 2
      : (playerInMiningPose() ? 0 : (player.flightTilt || 0));
    if (player.rotFlightActive && !playerInMiningPose()) {
      player.bodyTiltRender = _btTarget;
    } else {
      var _btD = _btTarget - (player.bodyTiltRender || 0);
      while (_btD > Math.PI) _btD -= Math.PI * 2;
      while (_btD < -Math.PI) _btD += Math.PI * 2;
      player.bodyTiltRender = (player.bodyTiltRender || 0) + _btD * (1 - Math.exp(-12 * dt));
      if (Math.abs(_btD) < 0.002) player.bodyTiltRender = _btTarget;
    }

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
      player.vy -= GRAVITY_PLAYER * gravScale * dt * WATER_RIG_BUOY * wFrac;
      if (wFrac > 0.5 && player.vy > WATER_RIG_SINK_VMAX) {
        player.vy += (WATER_RIG_SINK_VMAX - player.vy) * (1 - Math.exp(-6 * dt));
      }
    }

    // Dev probe (window.__trees / __course pattern): read-only flight state,
    // refreshed every update — for headless harness checks + owner bug
    // reports ("what does __flight say"). Never read by game code.
    if (!window.__flight) window.__flight = {};
    var _fdbg = window.__flight;
    _fdbg.mode = flightTune.mode; _fdbg.rot = !!player.rotFlightActive;
    _fdbg.vtol = !!vtolFlight; _fdbg.x = player.x; _fdbg.y = player.y;
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
          rot: !!player.rotFlightActive,
          speed: Math.sqrt(player.vx * player.vx + player.vy * player.vy),
          cap: flight2.SOFT_CAP,
          boomV: flight2.BOOM_V,
          spool: player.thrustSpool || 0,
          climb: -player.vy,
          buffet: player.rotFlightActive ? (player.aeroBuffet || 0) : 0,
          stall: !!(player.rotFlightActive && player.aeroStall),
          over: player.overBudget || 0,
          ge: player.rotFlightActive ? (player.aeroGE || 0) : 0,
          fx: player.fx,
          dt: dt
        });
      } catch (e) {}
    }
    // jet-spin: the asset rotation layer over the synthesized pack — pitch
    // and level ride |angular velocity| so hard spins audibly wind up.
    if (player.rotFlightActive && !player.onGround) {
      var _avSfx = Math.abs(player.angVel || 0);
      if (_avSfx > 0.35) {
        sfxLoop('jet-spin', {
          gain: Math.min(1, (_avSfx - 0.25) / 2.2),
          pitch: 0.8 + Math.min(0.6, _avSfx * 0.18)
        });
      }
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
        if (_dEff >= 0) player.vy -= GRAVITY_PLAYER * gravScale * dt;   // gel holds the weight at the sink line
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

