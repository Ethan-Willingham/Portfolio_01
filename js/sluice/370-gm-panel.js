    // ====== GM TUNING PANEL ======
    // Phase 3 of the tuning system. An in-game, dev-mode-only DOM overlay that
    // renders every GM_LEVERS entry as a live slider, so the owner can tune the
    // game by hand instead of typing gm.set() in the console. Pure DOM (a fixed
    // <div>, never canvas-drawn) so it sits above the game's z-4/z-5 canvases.
    //
    // Toggle: 'L' in dev mode (see the dev-mode key block — it calls
    // gmTuningPanelToggle()). The panel DOM is built lazily on first toggle.
    //
    // Live binding: each row drives window.gm.set(path, value); the facade
    // clamps + applies side-effects, and we sync the paired input to the
    // clamped result. window.gmPanelSync() re-reads every lever back into its
    // controls — called on open, and exposed so a later preset phase can
    // refresh the panel after gm.apply().
    //
    // The whole build is wrapped in try/catch and no-ops if the facade failed
    // (no window.gm / window.GM_LEVERS), so it can never break the game.
    var gmPanelEl = null;        // the container <div>, once built
    var gmPanelRows = [];        // [{ path, range, number, checkbox, valEl }]
    var gmPanelVisible = false;

    // Re-read every lever's live value back into its slider/number/checkbox.
    // Safe to call any time; no-ops cleanly if the panel was never built.
    function gmPanelSync() {
      try {
        if (!gmPanelEl || !window.gm || !window.GM_LEVERS) return;
        for (var i = 0; i < gmPanelRows.length; i++) {
          var row = gmPanelRows[i];
          var entry = window.GM_LEVERS[row.path];
          if (!entry) continue;
          var v = entry.get();
          if (row.checkbox) {
            row.checkbox.checked = !!v;
          } else {
            if (row.range) row.range.value = v;
            if (row.number) row.number.value = v;
          }
          if (row.valEl) row.valEl.textContent = gmPanelFmt(v);
        }
        gmPanelMarkPresets();
        if (gmPanelFlyRefresh) gmPanelFlyRefresh();
      } catch (e) {
        try { console.warn('gmPanelSync failed:', e); } catch (_) {}
      }
    }
    window.gmPanelSync = gmPanelSync;

    // Format a lever value for the compact live-value readout.
    function gmPanelFmt(v) {
      if (typeof v === 'boolean') return v ? 'on' : 'off';
      if (typeof v !== 'number' || !isFinite(v)) return String(v);
      if (v === Math.round(v)) return String(v);
      // Trim long floats but keep small steps readable.
      return (Math.round(v * 1000) / 1000).toString();
    }

    // Apply the panel's search-box filter: hide any lever row whose path does
    // not contain the (lower-cased) query substring. A group section whose
    // rows are all hidden by the filter is hidden entirely.
    function gmPanelApplyFilter(query) {
      try {
        if (!gmPanelEl) return;
        query = (query || '').toLowerCase();
        var sections = gmPanelEl.querySelectorAll('[data-gm-section]');
        for (var s = 0; s < sections.length; s++) {
          var sec = sections[s];
          var rows = sec.querySelectorAll('[data-gm-path]');
          var anyVisible = false;
          for (var r = 0; r < rows.length; r++) {
            var rowEl = rows[r];
            var path = rowEl.getAttribute('data-gm-path') || '';
            var match = (query === '' || path.toLowerCase().indexOf(query) !== -1);
            rowEl.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
          }
          // While filtering, force-show the body of any section with matches
          // so results aren't hidden inside a collapsed group.
          var body = sec.querySelector('[data-gm-body]');
          if (body) {
            if (query !== '') {
              body.style.display = anyVisible ? '' : 'none';
            } else {
              // No query — restore each section's own collapsed state.
              body.style.display = (sec.getAttribute('data-gm-collapsed') === '1') ? 'none' : '';
            }
          }
          sec.style.display = (query !== '' && !anyVisible) ? 'none' : '';
        }
      } catch (e) {
        try { console.warn('gmPanelApplyFilter failed:', e); } catch (_) {}
      }
    }

    // Build one lever row (label + control + live value). Returns the row
    // element, and pushes a binding record onto gmPanelRows.
    function gmPanelBuildRow(path, entry) {
      var row = document.createElement('div');
      row.setAttribute('data-gm-path', path);
      row.style.cssText =
        'display:flex;align-items:center;gap:6px;padding:3px 8px 3px 14px;' +
        'border-bottom:1px solid #1c1c1c;';

      var label = document.createElement('div');
      label.textContent = entry.label;
      label.title = path;
      label.style.cssText =
        'flex:0 0 130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
        'color:#cfcfcf;';
      row.appendChild(label);

      var rec = { path: path, range: null, number: null, checkbox: null, valEl: null };
      var cur = entry.get();
      var isBool = (entry.min === 0 && entry.max === 1 && entry.step === 1) ||
                   (typeof cur === 'boolean');

      if (isBool) {
        // Boolean lever → a checkbox.
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!cur;
        cb.style.cssText = 'flex:0 0 auto;margin:0;cursor:pointer;';
        cb.addEventListener('change', function () {
          try {
            window.gm.set(path, cb.checked);
            var nv = window.GM_LEVERS[path].get();
            cb.checked = !!nv;
            if (rec.valEl) rec.valEl.textContent = gmPanelFmt(nv);
            gmPanelMarkPresets();
          } catch (e) { try { console.warn('gm panel set failed:', e); } catch (_) {} }
        });
        rec.checkbox = cb;
        row.appendChild(cb);
        // Spacer so boolean rows line up with slider rows.
        var spacer = document.createElement('div');
        spacer.style.cssText = 'flex:1 1 auto;';
        row.appendChild(spacer);
      } else {
        // Numeric lever → a range slider + a number input, both bound to the
        // same value. step falls back to (max-min)/200 when the entry has none.
        var step = (typeof entry.step === 'number' && entry.step > 0)
          ? entry.step
          : ((entry.max - entry.min) / 200) || 0.001;

        var range = document.createElement('input');
        range.type = 'range';
        range.min = entry.min;
        range.max = entry.max;
        range.step = step;
        range.value = cur;
        range.style.cssText = 'flex:1 1 auto;min-width:60px;margin:0;cursor:pointer;';

        var num = document.createElement('input');
        num.type = 'number';
        num.min = entry.min;
        num.max = entry.max;
        num.step = step;
        num.value = cur;
        num.style.cssText =
          'flex:0 0 64px;width:64px;background:#101010;color:#e8e8e8;' +
          'border:1px solid #3a3a3a;font:inherit;padding:1px 3px;';

        // Shared apply: push to gm.set, then read the clamped result back into
        // BOTH inputs so they stay in lock-step (and reflect any clamping).
        var applyVal = function (raw) {
          try {
            window.gm.set(path, Number(raw));
            var nv = window.GM_LEVERS[path].get();
            range.value = nv;
            num.value = nv;
            if (rec.valEl) rec.valEl.textContent = gmPanelFmt(nv);
            gmPanelMarkPresets();
          } catch (e) { try { console.warn('gm panel set failed:', e); } catch (_) {} }
        };
        range.addEventListener('input', function () { applyVal(range.value); });
        num.addEventListener('input', function () { applyVal(num.value); });

        rec.range = range;
        rec.number = num;
        row.appendChild(range);
        row.appendChild(num);
      }

      var valEl = document.createElement('div');
      valEl.textContent = gmPanelFmt(cur);
      valEl.style.cssText =
        'flex:0 0 46px;text-align:right;color:#7fd77f;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis;';
      rec.valEl = valEl;
      row.appendChild(valEl);

      gmPanelRows.push(rec);
      return row;
    }

    // ----- Presets section (Phase 4) -----
    // Holds the preset section element so a save can rebuild just that block
    // without re-rendering the whole panel.
    var gmPanelPresetsEl = null;
    // Refreshes the FLY FEEL strip's active highlight; assigned at build.
    var gmPanelFlyRefresh = null;

    // ----- Active-preset highlighting -----
    // gm.activePreset is the last preset applied (panel button or console). A
    // preset button is shown 'active' (blue) while the live state still
    // matches that preset exactly, and 'modified' (amber + ' *') once the
    // owner has tweaked any lever away from it.
    var gmPanelPresetBtns = [];   // [{ name, btn, isCustom }]

    // cssText for a preset button in a given state.
    function gmPresetBtnStyle(isCustom, state) {
      var bg, color, border, weight;
      if (state === 'active') {
        bg = '#2f5d8f'; color = '#ffffff'; border = '#7fb0e0'; weight = 'bold';
      } else if (state === 'modified') {
        bg = '#6e5526'; color = '#ffe6b0'; border = '#c79a4a'; weight = 'bold';
      } else if (isCustom) {
        bg = '#2a2438'; color = '#d8cdf0'; border = '#4a3e63'; weight = 'normal';
      } else {
        bg = '#23262e'; color = '#cfd6e0'; border = '#3a3f48'; weight = 'normal';
      }
      return 'background:' + bg + ';color:' + color + ';' +
        'border:1px solid ' + border + ';font:inherit;font-weight:' + weight + ';' +
        'padding:2px 6px;cursor:pointer;white-space:nowrap;';
    }

    // True if the live lever state has drifted from preset `name`'s values.
    function gmPanelPresetModified(name) {
      try {
        var p = window.GM_PRESETS && window.GM_PRESETS[name];
        if (!p || !p.values || !window.gm || !window.GM_LEVERS) return false;
        for (var path in p.values) {
          if (!Object.prototype.hasOwnProperty.call(p.values, path)) continue;
          if (!window.GM_LEVERS[path]) continue;
          if (window.gm.get(path) !== p.values[path]) return true;
        }
        return false;
      } catch (e) { return false; }
    }

    // Re-style every preset button so the applied preset stands out — blue
    // while the state still matches it, amber + ' *' once a lever has been
    // tweaked since. Cheap; safe to call on every lever change.
    function gmPanelMarkPresets() {
      try {
        var active = (window.gm && window.gm.activePreset) || null;
        var modified = active ? gmPanelPresetModified(active) : false;
        for (var i = 0; i < gmPanelPresetBtns.length; i++) {
          var rec = gmPanelPresetBtns[i];
          var state = 'normal';
          if (rec.name === active) state = modified ? 'modified' : 'active';
          rec.btn.style.cssText = gmPresetBtnStyle(rec.isCustom, state);
          rec.btn.textContent = (state === 'modified') ? (rec.name + ' *') : rec.name;
        }
      } catch (e) {
        try { console.warn('gmPanelMarkPresets failed:', e); } catch (_) {}
      }
    }

    // (Re)build the PRESETS section's inner content into `container`. Presets
    // are grouped by `cat`; each is a clickable button (tooltip = desc) that
    // calls gm.preset(name) — which already re-syncs the panel. A small
    // "save current as preset" row prompts for a name → gm.save(name), then
    // rebuilds this section so the new custom preset appears. Wrapped in
    // try/catch so a preset-render failure can never break the panel.
    function gmPanelRenderPresets(container) {
      try {
        if (!container) return;
        container.innerHTML = '';
        gmPanelPresetBtns = [];
        var PRESETS = window.GM_PRESETS;
        if (!window.gm || !window.gm.preset || !PRESETS) {
          var na = document.createElement('div');
          na.textContent = 'presets unavailable';
          na.style.cssText = 'padding:4px 8px 4px 14px;color:#888;';
          container.appendChild(na);
          return;
        }

        // Stable category order; unknown cats fall in alphabetically after.
        var CAT_ORDER = ['device', 'smoke', 'rocket', 'water', 'custom'];
        var byCat = {};
        Object.keys(PRESETS).forEach(function (name) {
          var c = (PRESETS[name] && PRESETS[name].cat) || 'misc';
          if (!byCat[c]) byCat[c] = [];
          byCat[c].push(name);
        });
        var cats = Object.keys(byCat).sort(function (a, b) {
          var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
          if (ia === -1) ia = 999;
          if (ib === -1) ib = 999;
          if (ia !== ib) return ia - ib;
          return a < b ? -1 : (a > b ? 1 : 0);
        });

        cats.forEach(function (cat) {
          var names = byCat[cat].slice().sort();

          var catLabel = document.createElement('div');
          catLabel.textContent = cat + ' (' + names.length + ')';
          catLabel.style.cssText =
            'padding:4px 8px 3px 14px;color:#9a9a9a;font-weight:bold;' +
            'letter-spacing:0.5px;text-transform:uppercase;font-size:9px;';
          container.appendChild(catLabel);

          var wrap = document.createElement('div');
          wrap.style.cssText =
            'display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px 14px;';

          names.forEach(function (name) {
            var p = PRESETS[name];
            var btn = document.createElement('button');
            btn.textContent = name;
            btn.title = (p && p.desc) ? p.desc : name;
            // Custom presets get a distinct tint. Styling (incl. the active-
            // preset highlight) is applied by gmPanelMarkPresets() below.
            var isCustom = (p && p.cat === 'custom');
            gmPanelPresetBtns.push({ name: name, btn: btn, isCustom: isCustom });
            btn.addEventListener('click', function () {
              try { window.gm.preset(name); }
              catch (e) { try { console.warn('gm panel preset failed:', e); } catch (_) {} }
            });
            // Right-click a custom preset to delete it.
            if (isCustom) {
              btn.addEventListener('contextmenu', function (ev) {
                ev.preventDefault();
                try {
                  if (window.confirm('Delete custom preset "' + name + '"?')) {
                    window.gm.delPreset(name);
                    gmPanelRenderPresets(container);
                  }
                } catch (e) { try { console.warn('gm panel delPreset failed:', e); } catch (_) {} }
              });
            }
            wrap.appendChild(btn);
          });
          container.appendChild(wrap);
        });

        // ----- Save-current-as-preset row -----
        var saveRow = document.createElement('div');
        saveRow.style.cssText = 'padding:4px 8px 6px 14px;';
        var saveBtn = document.createElement('button');
        saveBtn.textContent = '+ save current as preset';
        saveBtn.title = 'Capture the changed levers (gm.diff) as a named custom preset';
        saveBtn.style.cssText =
          'width:100%;background:#243a24;color:#cfe9cf;border:1px solid #3c5c3c;' +
          'font:inherit;padding:3px 6px;cursor:pointer;';
        saveBtn.addEventListener('click', function () {
          try {
            var name = window.prompt('Save current tuning as preset — name:');
            if (name == null) return;
            name = String(name).trim();
            if (!name) return;
            window.gm.save(name);
            gmPanelRenderPresets(container);
          } catch (e) { try { console.warn('gm panel save failed:', e); } catch (_) {} }
        });
        saveRow.appendChild(saveBtn);
        container.appendChild(saveRow);
        gmPanelMarkPresets();
      } catch (e) {
        try { console.warn('gmPanelRenderPresets failed:', e); } catch (_) {}
      }
    }

    // Build the whole panel DOM once. Returns false (and builds nothing) if the
    // tuning facade is unavailable.
    function gmPanelBuild() {
      if (gmPanelEl) return true;
      if (!window.gm || !window.GM_LEVERS) return false;

      var LEVERS = window.GM_LEVERS;
      gmPanelRows = [];

      // Container — fixed to the LEFT edge, dark utilitarian, scrollable.
      // v14.19 — left, not right: the dev perf panel is canvas-drawn in the
      // top-right corner, so the tuning panel lives on the opposite edge to
      // avoid covering it.
      var panel = document.createElement('div');
      panel.id = 'gmTuningPanel';
      panel.style.cssText =
        'position:fixed;top:0;left:0;width:320px;max-height:90vh;' +
        'overflow-y:auto;overflow-x:hidden;z-index:99999;' +
        'background:#0c0c0c;color:#dddddd;' +
        'font:11px/1.45 "Commit Mono",ui-monospace,monospace;' +
        'border-right:1px solid #333;border-bottom:1px solid #333;' +
        'box-shadow:3px 3px 14px rgba(0,0,0,0.6);' +
        'pointer-events:auto;display:none;-webkit-user-select:none;user-select:none;';
      // mousedown on the panel must never reach the game (no drill-through).
      panel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      // Keys: only swallow while the user is typing in a text field (the
      // search box / number inputs). Otherwise let movement keys reach the
      // game — so you can still move right after clicking a preset, without
      // having to click back onto the canvas.
      var swallowKeys = function (e) {
        var t = e.target;
        if (t && t.tagName === 'INPUT' &&
            (t.type === 'text' || t.type === 'number' || t.type === 'search')) {
          e.stopPropagation();
        }
      };
      panel.addEventListener('keydown', swallowKeys);
      panel.addEventListener('keyup', swallowKeys);
      // After any button click, drop focus back off the button so Space and
      // the movement keys go to the game (a focused button re-fires on Space).
      panel.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.tagName === 'BUTTON') { try { t.blur(); } catch (_) {} }
      });

      // ----- Header: title, close button, search box -----
      var header = document.createElement('div');
      header.style.cssText =
        'position:sticky;top:0;z-index:2;background:#161616;' +
        'border-bottom:1px solid #333;padding:6px 8px;';

      var titleRow = document.createElement('div');
      titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
      var title = document.createElement('div');
      title.textContent = 'GM TUNING';
      title.style.cssText = 'flex:1 1 auto;font-weight:bold;letter-spacing:1px;color:#fff;';
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.title = 'Close (L)';
      closeBtn.style.cssText =
        'flex:0 0 auto;background:#2a2a2a;color:#fff;border:1px solid #444;' +
        'width:20px;height:20px;line-height:16px;cursor:pointer;font:inherit;padding:0;';
      closeBtn.addEventListener('click', function () { gmTuningPanelSetVisible(false); });
      titleRow.appendChild(title);
      titleRow.appendChild(closeBtn);
      header.appendChild(titleRow);

      var search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'filter levers…';
      search.style.cssText =
        'box-sizing:border-box;width:100%;margin-top:6px;background:#101010;' +
        'color:#e8e8e8;border:1px solid #3a3a3a;font:inherit;padding:3px 5px;';
      search.addEventListener('input', function () { gmPanelApplyFilter(search.value); });
      header.appendChild(search);
      panel.appendChild(header);

      // ----- One collapsible section per group -----
      // Group order: keep a stable, sensible order; any unexpected group falls
      // in alphabetically after the known ones.
      var GROUP_ORDER = ['fly', 'smoke', 'fireplace', 'rocket', 'sky', 'res', 'camera'];
      // v24.115 (owner): EVERY section starts folded, including PRESETS, so
      // the panel opens to the pinned FLY FEEL strip at the very top.
      // Expand a group only when you want to fine-tune its levers.

      // Within-group lever order. Most levers fall in alphabetically (priority 500), but
      // the jello group has ~95 entries, so the feel-critical tunes are pinned to the TOP
      // in descending importance, and the parked / structural / debug levers are demoted to
      // the BOTTOM. Keyed by full path; unlisted = 500 (alphabetical middle).
      var LEVER_PRIORITY = {
        // --- v25.49 fly group: the flight-feel dials, most-used first ---
        'fly.catch': 1,                        // fall-arrest authority (the inertia-fight lever)
        'fly.climbForce': 2,                   // launch/climb strength
        'fly.climbTerm': 3,                    // sustained climb ceiling
        'fly.speed': 4,                        // horizontal cruise cap
        'fly.acc': 5,                          // horizontal steering authority
        // --- v25.42 popcorn-fix trio: the owner's live water-feel dials ---
        'water.PRESSURE_MAX_DV': 1,            // THE pop killer (px/s per substep; 0 = old popcorn)
        'water.QUIET_VISC': 2,                 // v26.52 low-energy relative filter, never bulk damping
        'water.QUIET_SPEED': 2.1,              // absolute-speed disengagement gate
        'water.QUIET_SHEAR': 2.2,              // local-difference disengagement gate
        'water.QUIET_SUPPORT': 2.3,            // massy cardinal-neighbour requirement
        'water.AIR_DRAG': 3,                   // airborne droplet deceleration (1 = off)
        'water.COHESION': 4,                   // DANGER: explosive above 0; supervised A/B only
        // --- v25.44 honey dials: how watery flow feels (1.0/1.0/0 = raw) ---
        'water.DAMP_LIVE': 5,                  // lively velocity keep/substep (1 = frictionless slosh)
        'water.MOTION_LIVE': 6,                // lively APIC transfer scale (1 = full)
        'water.VISC_LIVE': 7,                  // lively grid viscosity (0 = raw)
        'water.FLOOR_FRICTION': 8,             // per-substep drag on floor-adjacent cells
        'water.WALL_FRICTION': 9,              // per-substep drag on wall-adjacent cells
        'water.LIP_FRICTION': 10,              // v25.45 ledge spill (= FLOOR_FRICTION for old damming)
        // --- core feel (v22 unified-contact model): dial these to shape the slime ---
        'jello.JELLO_SOLVER_ID': 1,            // pbd / xpbd / fem
        'jello.JELLO_E': 2,                    // overall softness (lower = squishier)
        'jello.JELLO_XSPH': 3,                 // viscosity: ooze + pile-settle (0 = springy, 0.5+ = goo)
        'jello.JELLO_INT_DAMP': 3.5,           // wobble decay (internal modes only; the proper damping knob)
        'jello.JELLO_XPBD_SHAPE': 4,           // square-shape memory (coherence; 0 = floppy)
        'jello.JELLO_PLASTICITY': 5,           // permanent set / dent-holding (memory foam; 0 = elastic)
        'jello.JELLO_XPBD_VOL_COMPLIANCE': 6,  // squish / spring-back (higher = more give)
        'jello.JELLO_CONTACT_DAMP': 7,         // contact inelasticity (1 = settles hard, no bounce)
        'jello.JELLO_CONTACT_FRICTION': 8,     // contact friction (holds a pile from slumping)
        'jello.JELLO_DAMPING': 9,              // air drag only (wobble decay = JELLO_INT_DAMP)
        'jello.JELLO_SLEEP_VSQ': 10,           // sleep threshold (higher = settles sooner)
        'jello.JELLO_XPBD_SUBSTEPS': 11,       // solve convergence (higher = calmer, costlier)
        'jello.JELLO_INFLATE': 12,             // puffiness (area target)
        'jello.JELLO_GRAVITY': 13,             // weight / fall
        // --- miner ride feel (v22.14) ---
        'jello.FALL_IMPACT_FX': 13.1,          // hard-landing FX master switch (OFF for testing)
        'jello.JELLO_CARRY': 13.3,             // ride a moving blob (Celeste carry)
        'jello.JELLO_TRAMPOLINE': 13.5,        // trampoline restitution (returned at dip exit)
        'jello.JELLO_BOUNCE_MIN': 13.7,        // min impact speed to bounce
        // --- interaction / behaviour ---
        'jello.JELLO_YIELD': 14,               // plastic yield strain
        'jello.JELLO_HARDEN': 15,              // plastic hardening
        'jello.JELLO_FLING': 16,
        'jello.JELLO_FLING_MIN': 17,
        'jello.JELLO_CONTACT_SELF': 18,        // self-collision (anti-fold-through)
        'jello.JELLO_SELF_MIN_REST': 19,
        'jello.JELLO_GAP_BLOCK': 20,           // terrain-crack backstop
        'jello.JELLO_MAX_STRETCH': 21,
        'jello.JELLO_BOUNCE': 22,
        'jello.JELLO_TIMESCALE': 23,
        'jello.JELLO_VMAX': 24,                // hard speed-cap backstop
        // --- advanced material ---
        'jello.JELLO_CONTACT': 30, 'jello.JELLO_CONTACT_R_FRAC': 31,
        'jello.JELLO_XPBD_COMPLIANCE': 32, 'jello.JELLO_XPBD_SHEAR_COMPLIANCE': 33,
        'jello.JELLO_NU': 34, 'jello.JELLO_FEM_DEV_COMPLIANCE': 35, 'jello.JELLO_FEM_VOL_COMPLIANCE': 36,
        // --- demoted to the bottom: debug, limits ---
        'jello.JELLO_DEBUG_PARTICLES': 910,
        'jello.JELLO_NPT': 920, 'jello.JELLO_H': 921, 'jello.JELLO_MAX_SUBSTEPS': 922,
        'jello.JELLO_MAX_POINTS': 923, 'jello.JELLO_MAX_BODIES': 924, 'jello.JELLO_MAX_CELLS': 925
      };

      var byGroup = {};
      Object.keys(LEVERS).forEach(function (path) {
        var g = LEVERS[path].group || 'misc';
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(path);
      });
      var groups = Object.keys(byGroup).slice().sort(function (a, b) {
        var ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        if (ia !== ib) return ia - ib;
        return a < b ? -1 : (a > b ? 1 : 0);
      });

      groups.forEach(function (g) {
        var paths = byGroup[g].slice().sort(function (a, b) {
          var pa = LEVER_PRIORITY[a]; if (pa === undefined) pa = 500;
          var pb = LEVER_PRIORITY[b]; if (pb === undefined) pb = 500;
          if (pa !== pb) return pa - pb;
          return a < b ? -1 : (a > b ? 1 : 0);
        });
        var collapsed = true;

        var section = document.createElement('div');
        section.setAttribute('data-gm-section', g);
        section.setAttribute('data-gm-collapsed', collapsed ? '1' : '0');

        // Group header — click toggles the body; carries a per-group reset.
        var ghead = document.createElement('div');
        ghead.style.cssText =
          'display:flex;align-items:center;gap:6px;padding:5px 8px;' +
          'background:#1f1f1f;border-bottom:1px solid #333;border-top:1px solid #000;' +
          'cursor:pointer;';
        var arrow = document.createElement('span');
        arrow.textContent = collapsed ? '▶' : '▼';
        arrow.style.cssText = 'flex:0 0 auto;color:#888;font-size:9px;';
        var gname = document.createElement('span');
        gname.textContent = g + ' (' + paths.length + ')';
        gname.style.cssText = 'flex:1 1 auto;font-weight:bold;color:#e0e0e0;letter-spacing:0.5px;';
        var gReset = document.createElement('button');
        gReset.textContent = 'reset';
        gReset.title = 'Reset group "' + g + '" to defaults';
        gReset.style.cssText =
          'flex:0 0 auto;background:#2a2a2a;color:#ddd;border:1px solid #444;' +
          'font:inherit;padding:1px 6px;cursor:pointer;';
        ghead.appendChild(arrow);
        ghead.appendChild(gname);
        ghead.appendChild(gReset);
        section.appendChild(ghead);

        // Body — holds the lever rows.
        var body = document.createElement('div');
        body.setAttribute('data-gm-body', '1');
        body.style.cssText = collapsed ? 'display:none;' : '';
        paths.forEach(function (path) {
          try {
            body.appendChild(gmPanelBuildRow(path, LEVERS[path]));
          } catch (e) { try { console.warn('gm panel row failed for ' + path + ':', e); } catch (_) {} }
        });
        section.appendChild(body);

        ghead.addEventListener('click', function (e) {
          // The reset button lives inside the header — don't toggle on it.
          if (e.target === gReset) return;
          var nowCollapsed = section.getAttribute('data-gm-collapsed') !== '1';
          section.setAttribute('data-gm-collapsed', nowCollapsed ? '1' : '0');
          body.style.display = nowCollapsed ? 'none' : '';
          arrow.textContent = nowCollapsed ? '▶' : '▼';
        });
        gReset.addEventListener('click', function () {
          try {
            window.gm.reset(g);
            gmPanelSync();
          } catch (e) { try { console.warn('gm panel group reset failed:', e); } catch (_) {} }
        });

        panel.appendChild(section);
      });

      // ----- Footer: Copy diff + Reset all -----
      var footer = document.createElement('div');
      footer.style.cssText =
        'position:sticky;bottom:0;background:#161616;border-top:1px solid #333;' +
        'padding:6px 8px;display:flex;gap:6px;';

      var copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy diff';
      copyBtn.title = 'Copy gm.diff() (changed levers) to the clipboard as JSON';
      copyBtn.style.cssText =
        'flex:1 1 auto;background:#243a24;color:#cfe9cf;border:1px solid #3c5c3c;' +
        'font:inherit;padding:3px 6px;cursor:pointer;';
      copyBtn.addEventListener('click', function () {
        var json = '{}';
        try { json = JSON.stringify(window.gm.diff(), null, 2); } catch (_) {}
        gmPanelCopyText(json, copyBtn);
      });

      var resetAllBtn = document.createElement('button');
      resetAllBtn.textContent = 'Reset all';
      resetAllBtn.title = 'Reset every lever to its default';
      resetAllBtn.style.cssText =
        'flex:1 1 auto;background:#3a2424;color:#e9cfcf;border:1px solid #5c3c3c;' +
        'font:inherit;padding:3px 6px;cursor:pointer;';
      resetAllBtn.addEventListener('click', function () {
        try {
          window.gm.reset();
          gmPanelSync();
        } catch (e) { try { console.warn('gm panel reset-all failed:', e); } catch (_) {} }
      });

      footer.appendChild(copyBtn);
      footer.appendChild(resetAllBtn);
      panel.appendChild(footer);

      // ----- PRESETS section (Phase 4) -----
      // A collapsible section, styled like the group sections, holding the
      // preset library. Inserted right after the header, below the FLIGHT
      // FEEL strip. v24.115: starts collapsed like every other section.
      try {
        var presetCollapsed = true;
        var presetSection = document.createElement('div');
        presetSection.setAttribute('data-gm-preset-section', '1');

        var phead = document.createElement('div');
        phead.style.cssText =
          'display:flex;align-items:center;gap:6px;padding:5px 8px;' +
          'background:#1f1f1f;border-bottom:1px solid #333;border-top:1px solid #000;' +
          'cursor:pointer;';
        var parrow = document.createElement('span');
        parrow.textContent = presetCollapsed ? '▶' : '▼';
        parrow.style.cssText = 'flex:0 0 auto;color:#888;font-size:9px;';
        var pname = document.createElement('span');
        pname.textContent = 'PRESETS';
        pname.style.cssText = 'flex:1 1 auto;font-weight:bold;color:#e0e0e0;letter-spacing:0.5px;';
        phead.appendChild(parrow);
        phead.appendChild(pname);
        presetSection.appendChild(phead);

        var pbody = document.createElement('div');
        pbody.style.cssText = presetCollapsed ? 'display:none;' : '';
        gmPanelRenderPresets(pbody);
        gmPanelPresetsEl = pbody;
        presetSection.appendChild(pbody);

        phead.addEventListener('click', function () {
          presetCollapsed = !presetCollapsed;
          pbody.style.display = presetCollapsed ? 'none' : '';
          parrow.textContent = presetCollapsed ? '▶' : '▼';
        });

        panel.insertBefore(presetSection, header.nextSibling);
      } catch (e) {
        try { console.warn('gm panel presets section failed:', e); } catch (_) {}
      }


      // ----- FLY FEEL strip (v25.49) -----
      // One-click feel presets for the ONE flight model, pinned at the VERY
      // top of the panel (above PRESETS; every section below starts
      // collapsed). Each button writes the full FLY_PRESETS bundle through
      // gm.set (clamps and side-effects apply) and re-syncs the panel; the
      // bundle that exactly matches the live levers shows active.
      try {
        if (typeof FLY_PRESETS !== 'undefined' && window.gm) {
          var flSec = document.createElement('div');
          var flHead = document.createElement('div');
          flHead.textContent = 'FLY FEEL';
          flHead.style.cssText =
            'padding:5px 8px 2px;background:#14181f;color:#9fc1e8;font-weight:bold;' +
            'letter-spacing:1px;border-bottom:1px solid #000;border-top:1px solid #000;';
          flSec.appendChild(flHead);
          var flRow = document.createElement('div');
          flRow.style.cssText =
            'display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px 8px;background:#14181f;' +
            'border-bottom:1px solid #333;';
          var flBtns = [];
          var flMatches = function (name) {
            var p = FLY_PRESETS[name];
            if (!p) return false;
            for (var k in p) {
              if (!p.hasOwnProperty(k)) continue;
              var cur = 0;
              try { cur = window.gm.get('fly.' + k); } catch (e) {}
              if (Math.abs((cur || 0) - p[k]) > 0.0001) return false;
            }
            return true;
          };
          gmPanelFlyRefresh = function () {
            for (var i = 0; i < flBtns.length; i++) {
              var b = flBtns[i];
              b.el.style.cssText = gmPresetBtnStyle(false, flMatches(b.name) ? 'active' : 'normal');
            }
          };
          Object.keys(FLY_PRESETS).forEach(function (name) {
            var btn = document.createElement('button');
            btn.textContent = name;
            btn.title = 'Apply the "' + name + '" flight feel (full fly bundle)';
            flBtns.push({ name: name, el: btn });
            btn.addEventListener('click', function () {
              try {
                var p = FLY_PRESETS[name];
                for (var k in p) { if (p.hasOwnProperty(k)) window.gm.set('fly.' + k, p[k]); }
                gmPanelSync();
              } catch (e) { try { console.warn('fly feel preset failed:', e); } catch (_) {} }
            });
            flRow.appendChild(btn);
          });
          flSec.appendChild(flRow);
          panel.insertBefore(flSec, header.nextSibling);
          gmPanelFlyRefresh();
        }
      } catch (e) {
        try { console.warn('fly feel strip failed:', e); } catch (_) {}
      }

      document.body.appendChild(panel);
      gmPanelEl = panel;
      return true;
    }

    // Copy text to the clipboard. Prefers the async Clipboard API; falls back
    // to a hidden <textarea> + execCommand('copy') for older/insecure contexts.
    // Briefly flashes the source button's label to confirm.
    function gmPanelCopyText(text, btn) {
      var flash = function (msg) {
        if (!btn) return;
        var orig = btn.textContent;
        btn.textContent = msg;
        setTimeout(function () { btn.textContent = orig; }, 1100);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { flash('Copied!'); },
            function () { gmPanelCopyFallback(text, flash); }
          );
          return;
        }
      } catch (_) {}
      gmPanelCopyFallback(text, flash);
    }
    function gmPanelCopyFallback(text, flash) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        if (flash) flash(ok ? 'Copied!' : 'Copy failed');
      } catch (e) {
        if (flash) flash('Copy failed');
        try { console.warn('gm panel copy fallback failed:', e); } catch (_) {}
      }
    }

    // v14.22 — on-screen TUNE button. A phone has no keyboard, so the 'L'
    // hotkey can't open the tuning panel on mobile. This is a fixed DOM
    // button on the LEFT edge (clear of the canvas-drawn perf panel top-
    // right and the tuning panel itself top-left, ≤90vh tall) that calls
    // gmTuningPanelToggle() on tap. Created lazily, shown ONLY while dev
    // mode is on AND the panel is closed — it must never appear for a
    // normal player. gmTuningButtonSync() drives its visibility and is
    // called from the panel show/hide path and from setDevMode().
    var gmTuneBtnEl = null;
    function gmTuningButtonSync() {
      try {
        if (typeof document === 'undefined' || !document.body) return;
        var wantVisible = !!devMode && !gmPanelVisible;
        if (!gmTuneBtnEl) {
          if (!wantVisible) return;     // don't build it for normal players
          gmTuneBtnEl = document.createElement('button');
          gmTuneBtnEl.id = 'gmTuneBtn';
          gmTuneBtnEl.type = 'button';
          gmTuneBtnEl.textContent = '⚙ TUNE';
          gmTuneBtnEl.style.cssText =
            'position:fixed;left:0;top:42%;width:64px;height:26px;' +
            'z-index:100000;background:#0c0c0c;color:#dddddd;' +
            'border:1px solid #444;border-left:none;' +
            'font:11px/1 "Commit Mono",ui-monospace,monospace;' +
            'letter-spacing:0.5px;padding:0;cursor:pointer;' +
            'box-shadow:2px 2px 8px rgba(0,0,0,0.6);' +
            'pointer-events:auto;-webkit-user-select:none;user-select:none;';
          gmTuneBtnEl.addEventListener('click', function (ev) {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
            if (typeof gmTuningPanelToggle === 'function') gmTuningPanelToggle();
          });
          document.body.appendChild(gmTuneBtnEl);
        }
        gmTuneBtnEl.style.display = wantVisible ? '' : 'none';
      } catch (e) {
        try { console.warn('gm tune button sync failed:', e); } catch (_) {}
      }
    }
    window.gmTuningButtonSync = gmTuningButtonSync;

    // Show/hide the panel. Builds it lazily on first show; re-syncs every
    // control from live values each time it opens.
    function gmTuningPanelSetVisible(show) {
      try {
        if (show) {
          if (!gmPanelBuild()) return; // facade missing — no-op
          gmPanelEl.style.display = '';
          gmPanelVisible = true;
          gmPanelSync();
        } else {
          gmPanelVisible = false;
          if (gmPanelEl) gmPanelEl.style.display = 'none';
        }
        // Keep the on-screen TUNE button in sync: hidden while the panel is
        // open (the panel has its own × close), shown again when it closes.
        gmTuningButtonSync();
      } catch (e) {
        try { console.warn('gm tuning panel toggle failed:', e); } catch (_) {}
      }
    }
    // Toggle entry point — the 'L' dev-mode key handler calls this.
    function gmTuningPanelToggle() {
      gmTuningPanelSetVisible(!gmPanelVisible);
    }
    window.gmTuningPanelToggle = gmTuningPanelToggle;
