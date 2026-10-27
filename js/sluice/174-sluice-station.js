  // Level-one wash station. Native controls share the pause menu materials.
  // The game loop owns its clock; this view never schedules a frame or timer.
  var sluiceStationOpen = false;
  var sluiceStationSelected = null;
  var sluiceStationDOM = null;
  var sluiceStationSignature = '';
  var sluiceStationLast = null;

  function sluiceStationNear() {
    return player && Math.abs(player.x - stationCenterCol() * TILE) < TILE * 26 &&
      player.y > (SKY_ROWS - 14) * TILE && player.y < (SKY_ROWS + 3) * TILE;
  }
  function sluiceStationCanOpen() {
    return introPhase === 'done' && !gamePaused && !mobileLandscapeBlocked &&
      !gameOver && !gameWon && !shopOpen && shopState === 'closed' &&
      !bathMode && !ledgerOpen && !cargoManifestOpen && !itemWheel.open &&
      !seamCreditsOn && !seamExtractTiles && sluiceStationNear();
  }
  function isPointOnSluice(x, y) {
    var hx = sluiceAnchorX(), ground = DECK_ROW * TILE;
    return x >= hx - 60 && x <= hx + 294 && y >= ground - 200 && y <= ground + 8;
  }
  function sluiceStationText(id, text) {
    var el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }
  function setupSluiceStation() {
    if (sluiceStationDOM) return;
    var area = canvas.parentNode;
    var entry = document.createElement('button');
    entry.id = 'gm-sluice-btn'; entry.type = 'button'; entry.hidden = true;
    entry.textContent = 'Sluice [P]';
    entry.addEventListener('click', function (e) { e.stopPropagation(); sluiceStationToggle(); });
    area.appendChild(entry);
    var panel = document.createElement('section');
    panel.id = 'gm-sluice-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'gm-sluice-title');
    panel.innerHTML = '<div class="sluice-card">' +
      '<header class="sluice-heading"><div><span class="sluice-kicker">SURFACE WORKS / LEVEL 1</span>' +
      '<h2 id="gm-sluice-title">The sluice</h2></div><button id="gm-sluice-close" type="button">Return to mine</button></header>' +
      '<p class="sluice-store-line" id="gm-sluice-storage"></p>' +
      '<div class="sluice-body"><nav class="sluice-materials" aria-label="Wash material" id="gm-sluice-materials"></nav>' +
      '<div class="sluice-workbench"><div class="sluice-machine-stage"><canvas id="gm-sluice-machine" role="img" aria-label="Inclined sluice with a feed hopper, riffles, tailings and concentrate pan"></canvas></div>' +
      '<div class="sluice-operation"><div><strong id="gm-sluice-status" aria-live="polite"></strong><p id="gm-sluice-instruction"></p></div>' +
      '<button id="gm-sluice-action" class="sluice-primary" type="button"></button></div>' +
      '<progress id="gm-sluice-progress" max="1" value="0" aria-label="Wash progress"></progress>' +
      '<section id="gm-sluice-results" class="sluice-results" hidden aria-labelledby="gm-sluice-results-title"><h3 id="gm-sluice-results-title">In the pan</h3><div id="gm-sluice-result-list"></div></section>' +
      '<section class="sluice-pool"><h3 id="gm-sluice-material-title"></h3><p id="gm-sluice-material-copy"></p>' +
      '<div id="gm-sluice-loot"></div><p class="sluice-fine">Chances are per scoop. Each scoop has one result; the rest washes out as tailings. Ordinary finds are paid out when you collect. Rare specimens stay in your collection.</p></section>' +
      '<details class="sluice-collection"><summary id="gm-sluice-collection-title">Specimen collection</summary><div id="gm-sluice-collection"></div></details>' +
      '</div></div><footer class="sluice-footer">A full bulk bin never stops digging. Dock to unload. Stored material and the pan stay safe here.</footer></div>';
    area.appendChild(panel);
    panel.querySelector('.sluice-heading > div').appendChild(document.getElementById('gm-sluice-storage'));
    // Actions stay first and remain reachable when a short viewport scrolls.
    var stage = panel.querySelector('.sluice-machine-stage');
    stage.parentNode.insertBefore(panel.querySelector('.sluice-operation'), stage);
    stage.parentNode.insertBefore(document.getElementById('gm-sluice-progress'), stage);
    sluiceStationDOM = { panel: panel, entry: entry, machine: document.getElementById('gm-sluice-machine') };
    document.getElementById('gm-sluice-close').addEventListener('click', sluiceStationToggle);
    document.getElementById('gm-sluice-action').addEventListener('click', function () {
      if (gamePaused || mobileLandscapeBlocked || !sluiceStationOpen) return;
      if (paydirt.pending) {
        if (paydirt.pending.status === 'ready') sluiceStationLast = paydirtClaim();
      } else {
        sluiceStationLast = null;
        paydirtStart(sluiceStationSelected);
      }
      sluiceStationSignature = ''; sluiceStationRefresh();
    });
    panel.addEventListener('keydown', function (e) {
      if (gamePaused || mobileLandscapeBlocked) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault(); e.stopPropagation(); if (!e.repeat) sluiceStationToggle(); return;
      }
      e.stopPropagation();
      if (e.key !== 'Tab') return;
      var controls = Array.prototype.filter.call(panel.querySelectorAll('button, summary'), function (el) {
        return !el.disabled && el.getClientRects().length;
      });
      var at = controls.indexOf(document.activeElement);
      if ((e.shiftKey && at <= 0) || (!e.shiftKey && (at < 0 || at === controls.length - 1))) {
        e.preventDefault(); controls[e.shiftKey ? controls.length - 1 : 0].focus();
      }
    });
    ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(function (name) {
      panel.addEventListener(name, function (e) { e.stopPropagation(); }, { passive: true });
    });
    var list = document.getElementById('gm-sluice-materials');
    PAYDIRT_TYPES.forEach(function (type) {
      var button = document.createElement('button'); button.type = 'button';
      button.setAttribute('data-material', type.id);
      var title = document.createElement('strong'); title.textContent = type.label;
      var count = document.createElement('span'); count.className = 'sluice-material-count';
      var depth = document.createElement('span'); depth.className = 'sluice-material-depth'; depth.textContent = type.depth;
      button.appendChild(title); button.appendChild(count); button.appendChild(depth);
      button.addEventListener('click', function () {
        if (gamePaused || mobileLandscapeBlocked) return;
        sluiceStationSelected = type.id; sluiceStationSignature = ''; sluiceStationRefresh();
      });
      list.appendChild(button);
    });
  }
  function sluiceStationToggle() {
    if (!sluiceStationOpen && !sluiceStationCanOpen()) return false;
    setupSluiceStation();
    sluiceStationOpen = !sluiceStationOpen;
    sluiceStationDOM.panel.hidden = !sluiceStationOpen;
    cargoManifestClearInput();
    siphonStop(); siphon.equipped = false;
    surfaceSlimeGrabEnd(undefined, true);
    if (sluiceStationOpen) {
      paydirtDeposit();
      sluiceStationLast = null;
      if (paydirt.pending) sluiceStationSelected = paydirt.pending.typeId;
      else if (!sluiceStationSelected || !paydirt.stored[sluiceStationSelected]) {
        var stocked = PAYDIRT_TYPES.filter(function (type) { return paydirt.stored[type.id] > 0; });
        sluiceStationSelected = (stocked[0] || PAYDIRT_TYPES[0]).id;
      }
      canvas.inert = true;
      canvas.parentNode.style.touchAction = 'auto';
      render();
      sluiceStationSignature = ''; sluiceStationRefresh(); sluiceStationPaint();
      document.getElementById('gm-sluice-close').focus({ preventScroll: true });
    } else {
      canvas.inert = false;
      canvas.parentNode.style.touchAction = gamePaused ? 'auto' : '';
      if (paydirt.pending) saveNow('sluice-close');
      canvas.focus({ preventScroll: true });
    }
    sluiceStationSyncButton();
    syncViewportKeys();
    return sluiceStationOpen;
  }
  function sluiceStationSyncButton() {
    if (!sluiceStationDOM) return;
    var show = !sluiceStationOpen && sluiceStationCanOpen();
    sluiceStationDOM.entry.hidden = !show;
    if (!show) return;
    var pending = paydirt.pending;
    var text = pending ? (pending.status === 'ready' ? 'Sluice: pan ready [P]' : 'Sluice: washing [P]') :
      'Sluice [P]' + (paydirtStored() + paydirtUsed() ? ' / ' + (paydirtStored() + paydirtUsed()).toLocaleString() : '');
    if (sluiceStationDOM.entry.textContent !== text) sluiceStationDOM.entry.textContent = text;
  }
  function sluiceStationResultRows(target, rows) {
    target.replaceChildren();
    rows.forEach(function (row) {
      var line = document.createElement('div'); line.className = 'sluice-loot-row';
      if (row.rarity === 'rare' || row.rarity === 'exceptional') line.classList.add('sluice-rare');
      var name = document.createElement('span'); name.textContent = row.label || row.name;
      var value = document.createElement('strong'); value.textContent = row.detail;
      line.appendChild(name); line.appendChild(value); target.appendChild(line);
    });
  }
  function sluiceStationRefresh() {
    if (!sluiceStationOpen) return;
    var type = paydirtType(sluiceStationSelected) || PAYDIRT_TYPES[0], pending = paydirt.pending;
    var sig = paydirt.revision + ':' + type.id + ':' + (pending ? pending.status : '') + ':' + !!sluiceStationLast;
    if (sig === sluiceStationSignature) return;
    sluiceStationSignature = sig;
    sluiceStationText('gm-sluice-storage', paydirtStored().toLocaleString() + ' scoops stored / Bulk bin ' + paydirtUsed() + '/' + paydirtCapacity() + ' / $' + money.toLocaleString());
    var buttons = document.querySelectorAll('#gm-sluice-materials button');
    for (var i = 0; i < buttons.length; i++) {
      var id = buttons[i].getAttribute('data-material'), amount = paydirt.stored[id] || 0;
      buttons[i].setAttribute('aria-pressed', id === type.id ? 'true' : 'false');
      buttons[i].querySelector('.sluice-material-count').textContent = amount ? amount.toLocaleString() + ' scoops stored' : paydirt.discovered[id] ? 'None stored' : 'Not yet found';
    }
    sluiceStationText('gm-sluice-material-title', type.label + ' / ' + type.depth);
    sluiceStationText('gm-sluice-material-copy', type.description);
    sluiceStationResultRows(document.getElementById('gm-sluice-loot'), type.loot.map(function (loot) {
      return {label:loot.label, rarity:loot.rarity, detail:(loot.weight / 100) + '% / ' + loot.rarity};
    }));
    var action = document.getElementById('gm-sluice-action');
    action.disabled = !!pending && pending.status !== 'ready' || !pending && !(paydirt.stored[type.id] > 0);
    action.textContent = pending ? pending.status === 'ready' ? 'Collect $' + pending.value.toLocaleString() : 'Washing...' :
      'Wash ' + (paydirt.stored[type.id] || 0).toLocaleString() + ' scoops';
    var activeType = pending ? paydirtType(pending.typeId) : type;
    var special = pending && pending.status === 'ready' && pending.results.filter(function (row) { return row.rarity === 'rare' || row.rarity === 'exceptional'; })[0];
    document.getElementById('gm-sluice-status').classList.toggle('sluice-rare', !!special);
    sluiceStationText('gm-sluice-status', pending ? pending.status === 'ready' ? special ? special.label + ' found!' : 'Your pan is ready' : 'Washing ' + activeType.label.toLowerCase() :
      sluiceStationLast ? 'Collected $' + sluiceStationLast.value.toLocaleString() : 'Ready to wash');
    sluiceStationText('gm-sluice-instruction', pending ? pending.status === 'ready' ? 'Collect the payout and keep any rare specimens.' :
      pending.count.toLocaleString() + ' scoops. You can return to mining while the sluice runs.' :
      paydirt.stored[type.id] ? 'Wash this whole stack. Water recirculates; there is no running cost.' : 'Mine dirt or stone in this layer, then dock to unload.');
    var result = pending && pending.status === 'ready' ? pending : sluiceStationLast;
    document.getElementById('gm-sluice-results').hidden = !result;
    if (result) {
      sluiceStationText('gm-sluice-results-title', (sluiceStationLast ? 'Last pan' : 'In the pan') + ' / ' + result.count + ' scoops of ' + paydirtType(result.typeId).label.toLowerCase());
      sluiceStationResultRows(document.getElementById('gm-sluice-result-list'), result.results.map(function (row) {
        return {label:row.label,rarity:row.rarity,detail:'x' + row.count + ' / $' + (row.count * row.value).toLocaleString()};
      }));
      if (!result.results.length) document.getElementById('gm-sluice-result-list').textContent = 'Only tailings in this pan. The next scoop has the same chances.';
    }
    var collection = [];
    Object.keys(paydirt.finds).forEach(function (id) {
      var loot = paydirtLoot(id), find = paydirt.finds[id];
      if (loot && find.count) collection.push({label:loot.label,rarity:loot.rarity,detail:'x' + find.count + ' / ' + loot.rarity});
    });
    sluiceStationText('gm-sluice-collection-title', 'Specimen collection / ' + collection.length + ' found');
    sluiceStationResultRows(document.getElementById('gm-sluice-collection'), collection);
    if (!collection.length) document.getElementById('gm-sluice-collection').textContent = 'Rare and exceptional finds are kept here after collecting a pan.';
  }
  function sluiceStationPaint() {
    if (!sluiceStationOpen || !sluiceStationDOM) return;
    var surface = sluiceStationDOM.machine, bounds = surface.getBoundingClientRect();
    var scale = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(bounds.width * scale)), h = Math.max(1, Math.round(bounds.height * scale));
    if (surface.width !== w || surface.height !== h) { surface.width = w; surface.height = h; }
    var draw = surface.getContext('2d'); draw.setTransform(scale, 0, 0, scale, 0, 0);
    draw.clearRect(0, 0, bounds.width, bounds.height);
    var pending = paydirt.pending, type = paydirtType(pending ? pending.typeId : sluiceStationSelected);
    paydirtDrawMachine(draw, {x:0,y:0,w:bounds.width,h:bounds.height}, {
      phase:pending ? pending.status : 'idle', progress:pending ? pending.progress : 0,
      elapsed:pending ? pending.elapsed : 0, color:type ? type.color : BLD.woodBase,
      quantity:pending ? pending.count : type ? paydirt.stored[type.id] || 0 : 0,
      discoveries:pending && pending.status === 'ready' ? pending.results.filter(function (row) { return row.ore === 'gold' || row.rarity === 'rare' || row.rarity === 'exceptional'; }).length : 0,
      reducedMotion:window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    });
    document.getElementById('gm-sluice-progress').value = pending ? pending.progress : 0;
  }
  function sluiceStationFrame() {
    sluiceStationRefresh(); sluiceStationPaint();
  }
