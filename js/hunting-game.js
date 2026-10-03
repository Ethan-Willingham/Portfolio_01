(function () {
  'use strict';
  const { TUNING: T, World } = HuntingPhysics;
  const { Campaign, REGIONS, SPECIES, DEER_LEVELS, deerLevel, animalArt, animalName, ITEMS, SAVE_KEY, period, activity } = HuntingCampaign;
  const $ = id => document.getElementById('hunt-' + id);
  const game = $('game'), canvas = $('canvas'), overlay = $('overlay');
  const keys = new Set(), holds = new Map(), touchAim = new Set();
  const moveButtons = [...game.querySelectorAll('[data-move], [data-move-y]')];
  let campaign, storageOK = true;
  try { campaign = new Campaign(JSON.parse(localStorage.getItem(SAVE_KEY))); }
  catch { campaign = new Campaign(); storageOK = false; }
  let art, world, view, phase = 'loading', aim = { x: 0, y: 3 };
  let guide = true, scopeToggle = false, scopeHeld = false, sound = false, audio;
  let previous = 0, accumulator = 0, raf = 0, uiTime = 0, saveTime = 0, messageUntil = 0;
  let campTab = 'outing', campSpeed = 1, trackingOrigin = 'camp', searchTask = null;
  let active = !document.hidden, valueBucket = -1;
  const STEP = 1 / 120;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function persist() {
    try { localStorage.setItem(SAVE_KEY, campaign.export()); storageOK = true; }
    catch { storageOK = false; }
    $('save-note').textContent = storageOK ? 'Progress saves in this browser. The clock stops while the tab is hidden.' : 'Progress could not save in this browser. Keep this tab open to keep playing.';
  }
  function fitCanvas() {
    if ($('stage').hidden) return;
    const stage = $('stage'), scale = Math.min(stage.clientWidth / T.width, stage.clientHeight / T.height);
    canvas.style.width = Math.max(1, Math.floor(T.width * scale)) + 'px';
    canvas.style.height = Math.max(1, Math.floor(T.height * scale)) + 'px';
  }
  new ResizeObserver(fitCanvas).observe($('stage'));
  function draw(showReticle = true) {
    if (view && world) { world.minute = campaign.state.minute; view.draw(world, aim, guide, showReticle); }
  }
  function message(text, type = '') {
    $('message').textContent = text; $('message').dataset.result = type;
    messageUntil = performance.now() + 6000;
  }
  function campMessage(text) { $('camp-notice').textContent = text; }
  function updateClock() {
    const state = campaign.state;
    $('clock').textContent = campaign.day + ' / ' + campaign.time;
    $('credits').textContent = state.credits;
    $('period').textContent = period(state.minute) + ' / ' + (activity(state.minute) === 1 ? 'Animals active' : 'Quiet hours');
    const dark = period(state.minute) === 'Night' || period(state.minute + 10) === 'Night';
    $('embark').disabled = !art || dark;
    $('embark').textContent = dark ? 'Wait for daylight to depart' : 'Head into the field';
    $('pack-count').textContent = campaign.packed.length;
    $('track-count').textContent = campaign.pending.length;
  }
  function updateUI() {
    updateClock();
    if (!world) return;
    const man = world.hunter;
    $('ammo').textContent = man.reload > 0 ? 'Loading' : man.ammo + ' / ' + T.magazine;
    $('recovered').textContent = world.recovered; $('shots').textContent = world.shots;
    const wind = world.wind, magnitude = Math.abs(wind);
    $('wind').textContent = magnitude < .05 ? 'Calm' : (wind > 0 ? 'Right ' : 'Left ') + magnitude.toFixed(2);
    const dx = wind * 28, tip = 35 + dx;
    $('wind-arrow').setAttribute('d', magnitude < .05 ? 'M32 7h6' : 'M35 7H' + tip + 'm' + (wind > 0 ? '-4' : '4') + ' -3L' + tip + ' 7l' + (wind > 0 ? '-4' : '4') + ' 3');
    $('fire').disabled = phase !== 'running' || man.reload > 0;
    $('reload').disabled = phase !== 'running' || man.reload > 0 || man.ammo === T.magazine;
    $('reload').firstChild.textContent = man.reload > 0 ? 'Reloading ' : 'Reload ';
    const near = Math.hypot(man.x, man.y - T.muzzleY) <= 1.4;
    $('interact').disabled = phase !== 'running' || (!man.mounted && !near);
    $('interact').firstChild.textContent = man.mounted ? 'Leave stand ' : 'Climb stand ';
    $('search').disabled = phase !== 'running' || !campaign.pending.length;
    if (phase === 'running' && performance.now() > messageUntil) {
      message(man.mounted ? guide ? 'Bring the dotted arc through a gold ring. Wind and movement matter.' : 'Aim beyond the animal along your sightline.' : near ? 'The stand is within reach. Press E or Climb stand.' : 'Walk with WASD. The stand is at the bottom center. Moving close to an animal spooks it.');
    }
  }
  function recordCard(record, packed) {
    const tier = record.score >= .75 ? 'Gold' : record.score >= .4 ? 'Silver' : 'Bronze';
    return '<article class="hunt-record"><span class="hunt-record-art" data-art="' + animalArt(record) + '" aria-hidden="true"></span><div><p class="hunt-kicker">' + (record.species === 'deer' ? 'Level ' + deerLevel(record.level).level + ' / ' : '') + tier + ' / ' + esc(REGIONS[record.region].name) + '</p><h4>' + animalName(record) + '</h4><p>' + record.weight + ' lb / ' + (record.method === 'tracked' ? 'Tracked recovery' : 'Recovered in the field') + '</p><p class="hunt-record-status">' + (record.status === 'mounted' ? 'Kept as a trophy' : record.status === 'sold' ? 'Sold / record kept' : campaign.value(record) + ' credits') + '</p>' + (packed ? '<div class="hunt-record-actions"><button type="button" data-sell="' + record.id + '">Sell</button><button type="button" data-mount="' + record.id + '">Keep trophy</button></div>' : '') + '</div></article>';
  }
  function renderCollection() {
    $('bag-list').innerHTML = campaign.packed.length ? campaign.packed.map(r => recordCard(r, true)).join('') : '<p class="hunt-empty">Your pack is empty. A recovered animal will go here.</p>';
    $('sell-all').disabled = !campaign.packed.length;
    $('sell-all').textContent = campaign.packed.length ? 'Sell the pack / ' + campaign.packed.reduce((n, r) => n + campaign.value(r), 0) + ' credits' : 'Sell the pack';
    $('camp-search').disabled = !campaign.pending.length;
    $('camp-trails').textContent = campaign.pending.length ? campaign.pending.length + ' unfinished ' + (campaign.pending.length === 1 ? 'trail' : 'trails') + '. Earlier searches have better odds and bring back more value.' : 'No unfinished trails.';
    $('record-list').innerHTML = campaign.state.records.length ? campaign.state.records.slice().reverse().map(r => recordCard(r, false)).join('') : '<p class="hunt-empty">No recoveries yet. Your first outing starts at Birch Clearing.</p>';
  }
  function renderCamp() {
    const s = campaign.state, selected = REGIONS[s.selected];
    $('location').dataset.region = s.selected;
    $('location-name').textContent = selected.name;
    $('location-detail').textContent = (selected.animal === 'deer' ? 'Level ' + s.deerLevel + ': ' + deerLevel(s.deerLevel).name : SPECIES[selected.animal].name) + '. ' + selected.peak + '.';
    $('deer-progress').textContent = campaign.deerRecoveries + ' deer recovered. Choose a level for your next Birch outing. Selling or keeping trophies counts.';
    $('deer-levels').innerHTML = DEER_LEVELS.map(d => {
      const unlocked = d.level <= campaign.maxDeerLevel, remaining = d.required - campaign.deerRecoveries;
      return '<button type="button" data-deer-level="' + d.level + '" aria-pressed="' + (s.selected === 'birch' && s.deerLevel === d.level) + '"' + (unlocked ? '' : ' disabled') + '><span class="hunt-record-art" data-art="deer-' + d.level + '" aria-hidden="true"></span><span class="hunt-kicker">Level ' + d.level + '</span><strong>' + d.name + '</strong><span>' + d.description + '</span><span class="hunt-deer-gate">' + (unlocked ? s.selected === 'birch' && s.deerLevel === d.level ? 'Selected for Birch' : 'Available' : remaining + ' more deer to unlock') + '</span></button>';
    }).join('');
    $('regions').innerHTML = Object.entries(REGIONS).map(([id, r]) => '<button type="button" data-region="' + id + '" aria-pressed="' + (s.selected === id) + '"' + (s.regions.includes(id) ? '' : ' disabled') + '><span class="hunt-kicker">' + (s.regions.includes(id) ? SPECIES[r.animal].name : 'Unlock at the outfitter') + '</span><strong>' + r.name + '</strong><span>' + r.description + '</span></button>').join('');
    $('loadout').innerHTML = '<option value="starter">Field rifle</option>' + (s.owned.includes('rifle') ? '<option value="rifle">Weighted-round rifle</option>' : '');
    $('loadout').value = s.equipped;
    $('dog-along').disabled = !s.owned.includes('dog'); $('dog-along').checked = s.owned.includes('dog') && s.dogAlong;
    $('dog-note').textContent = s.owned.includes('dog') ? 'A nose for unfinished business.' : 'Available at the outfitter.';
    $('shop-items').innerHTML = Object.entries(ITEMS).map(([id, item]) => {
      const owned = s.owned.includes(id);
      return '<article class="hunt-shop-item"><p class="hunt-kicker">' + item.slot + '</p><h3>' + item.name + '</h3><p>' + item.description + '</p><button type="button" data-buy="' + id + '"' + (owned || s.credits < item.price ? ' disabled' : '') + '>' + (owned ? 'In your kit' : 'Buy / ' + item.price + ' credits') + '</button></article>';
    }).join('') + '<article class="hunt-shop-item hunt-permit"><p class="hunt-kicker">New ground</p><h3>Cypress Edge permit</h3><p>Wild boar in a second one-screen map. Recover two animals first, then pay 350 credits.</p><p class="hunt-permit-progress">' + Math.min(2, s.records.length) + ' / 2 recovered</p><button type="button" data-unlock="cypress"' + (s.regions.includes('cypress') || s.records.length < 2 || s.credits < 350 ? ' disabled' : '') + '>' + (s.regions.includes('cypress') ? 'Area unlocked' : 'Unlock / 350 credits') + '</button></article>';
    renderCollection(); updateClock();
  }
  function selectTab(tab) {
    campTab = tab;
    game.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
    game.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
  }
  function setScope() {
    if (!view) return;
    const enabled = scopeToggle || scopeHeld;
    view.scope(enabled, aim); $('scope').setAttribute('aria-pressed', String(enabled)); $('scope-label').hidden = !enabled; draw();
  }
  function clearInput() {
    keys.clear(); holds.clear(); touchAim.clear(); scopeHeld = false;
    $('wait').setAttribute('aria-pressed', 'false');
    if (view) setScope();
  }
  function setPhase(next) {
    phase = next; game.dataset.phase = next; clearInput(); accumulator = 0;
    const field = next === 'loading' || next === 'running' || next === 'paused' || next === 'tracking' && trackingOrigin !== 'camp';
    game.classList.toggle('is-camp', !field);
    $('camp').hidden = field; $('stage').hidden = !field;
    $('field-bar').hidden = !field; $('actions').hidden = !field; $('instructions').hidden = !field;
    $('tracking').hidden = next !== 'tracking'; overlay.hidden = next !== 'paused' && next !== 'loading';
    ['fire', 'reload', 'scope', 'wait', 'guide', 'interact', 'search'].forEach(id => { $(id).disabled = next !== 'running'; });
    moveButtons.forEach(button => { button.disabled = next !== 'running'; });
    $('reset').disabled = !['running', 'paused'].includes(next);
    $('pause').disabled = !['running', 'paused'].includes(next); $('pause').textContent = next === 'paused' ? 'Resume' : 'Pause';
    $('mode').textContent = field && world ? REGIONS[campaign.state.selected].name : next === 'camp' ? 'Camp' : 'Preparing camp';
    if (next === 'paused') {
      $('overlay-kicker').textContent = 'The field can wait'; $('overlay-title').textContent = 'Paused';
      $('overlay-text').textContent = 'The clock, animals and your rounds are stopped.';
      $('briefing-note').hidden = true; $('start').textContent = 'Resume'; $('start').disabled = false; $('start').focus({ preventScroll: true });
    }
    if (next === 'running') canvas.focus({ preventScroll: true });
    fitCanvas(); updateUI(); draw();
  }
  function beginOuting() {
    if (!art || phase !== 'camp') return;
    const options = campaign.begin(); if (!options) return;
    const region = REGIONS[options.region];
    world = new World(art.masks[region.animal], Date.now(), { ...options, freeWalk: true, species: region.animal, backdrop: region.backdrop,
      windForce: region.wind, animal: (species, seed) => campaign.animal(species, seed, options.deerLevel),
      artFor: profile => art.masks[animalArt(profile)], spriteFor: animalArt, activity: () => activity(campaign.state.minute) });
    campaign.advance(10 * 60);
    view.effects = []; aim = { x: 0, y: 3 }; scopeToggle = false; scopeHeld = false; setScope();
    setPhase('running'); canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
    message('Walk to the stand at the bottom center. E climbs it. Aim beyond an animal, along your sightline.'); persist();
  }
  function returnCamp() {
    if (!world || !['running', 'paused'].includes(phase)) return;
    // Finish rounds already in flight and clean-hit recovery timers before leaving.
    for (let i = 0; i < 360 && (world.bullets.length || world.deer.some(d => d.bleed > 0)); i++) world.step(STEP);
    events();
    for (const deer of world.deer) if (deer.wounded && deer.state !== 'down' && deer.bleed <= 0) campaign.addTrack(deer.profile);
    campaign.advance(10 * 60); scopeToggle = false; setScope();
    setPhase('camp'); renderCamp(); selectTab(campTab);
    campMessage('Back at camp. ' + campaign.packed.length + ' in your pack, ' + campaign.pending.length + ' unfinished trails.'); persist();
  }
  function run() { if (phase === 'paused') { setPhase('running'); message('Back in the field.'); } }
  function pause() { if (phase === 'running') setPhase('paused'); else if (phase === 'paused') run(); }
  function tone(type) {
    if (!sound || !audio || audio.state !== 'running') return;
    const time = audio.currentTime, gain = audio.createGain(); gain.connect(audio.destination);
    const duration = type === 'shot' ? .16 : type === 'recovered' ? .3 : .07;
    gain.gain.setValueAtTime(type === 'shot' ? .12 : .045, time); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    if (type === 'shot') {
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(); noise.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 900;
      noise.connect(filter); filter.connect(gain); noise.start();
    } else {
      const oscillator = audio.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(type === 'recovered' ? 440 : 160, time);
      oscillator.connect(gain); oscillator.start(); oscillator.stop(time + duration);
    }
  }
  function events() {
    for (const event of world.drainEvents()) {
      view.addEffect(event);
      if (event.type === 'shot') { campaign.state.shots++; persist(); }
      else if (event.type === 'recovered' && event.animal) {
        const previousLevel = campaign.maxDeerLevel;
        const record = campaign.recover(event.animal, 'clean', event.animal.wounded ? .9 : 1);
        const unlocked = campaign.maxDeerLevel > previousLevel ? ' Level ' + campaign.maxDeerLevel + ', ' + deerLevel(campaign.maxDeerLevel).name + ', unlocked for your next outing.' : '';
        message(animalName(record) + ', ' + record.weight + ' lb. Added to your pack.' + unlocked, 'recovered'); persist();
      } else if (event.type === 'escape' && event.animal) {
        campaign.addTrack(event.animal); message(event.text, event.type); persist();
      } else message(event.text, event.type);
      if (['shot', 'reload', 'recovered'].includes(event.type)) tone(event.type);
    }
  }
  function fire() { if (phase === 'running') { world.fire(aim); events(); updateUI(); draw(); } }
  function reload() { if (phase === 'running') { world.reload(); events(); updateUI(); } }
  function interact() {
    if (phase === 'running' && world.toggleStand()) { scopeToggle = false; setScope(); message(world.hunter.mounted ? 'In the stand. Hold F to wait for a good shot.' : 'Back on the path. Watch your distance from the animals.'); updateUI(); draw(); }
  }
  function toggleGuide() {
    guide = !guide; $('guide').setAttribute('aria-pressed', String(guide)); $('guide').firstChild.textContent = guide ? 'Guide on ' : 'Guide off '; draw();
  }
  function pointAim(event) {
    if (!view || phase !== 'running' || event.pointerType === 'touch' && !touchAim.has(event.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    aim = world.aim(HuntingView.unproject({ x: (event.clientX - rect.left) * T.width / rect.width, y: (event.clientY - rect.top) * T.height / rect.height }, view.camera)); draw();
  }
  canvas.addEventListener('pointermove', pointAim);
  canvas.addEventListener('pointerdown', event => {
    if (phase !== 'running') return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); touchAim.add(event.pointerId); pointAim(event);
    if (event.button === 2) { scopeHeld = true; setScope(); }
    else if (event.pointerType === 'mouse' || event.pointerType === 'pen') fire();
    else canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('pointerup', event => {
    holds.delete(event.pointerId); touchAim.delete(event.pointerId);
    if (event.button === 2 && scopeHeld) { scopeHeld = false; setScope(); }
    $('wait').setAttribute('aria-pressed', String([...holds.values()].includes('wait')));
  });
  window.addEventListener('pointercancel', event => { holds.delete(event.pointerId); touchAim.delete(event.pointerId); scopeHeld = false; setScope(); $('wait').setAttribute('aria-pressed', 'false'); });
  function holdButton(button, value) {
    button.addEventListener('pointerdown', event => {
      if (phase !== 'running') return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); holds.set(event.pointerId, value);
      if (value === 'wait') button.setAttribute('aria-pressed', 'true');
    });
    button.addEventListener('lostpointercapture', event => { holds.delete(event.pointerId); if (value === 'wait') button.setAttribute('aria-pressed', 'false'); });
    button.addEventListener('keydown', event => { if (phase === 'running' && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); holds.set('keyboard', value); } });
    button.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); holds.delete('keyboard'); } });
  }
  holdButton($('wait'), 'wait');
  moveButtons.forEach(button => holdButton(button, { x: Number(button.dataset.move || 0), y: Number(button.dataset.moveY || 0) }));
  window.addEventListener('keydown', event => {
    if (phase === 'tracking') {
      if (event.key === 'Escape') { event.preventDefault(); closeTracking(); }
      if (event.key === 'Tab') {
        const focusable = [...$('tracking').querySelectorAll('button:not(:disabled)')];
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (!game.contains(document.activeElement) || event.target.closest('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey || !['running', 'paused'].includes(phase)) return;
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'r', 'q', 'g', 'f', 'e', 'p', 'escape'].includes(key)) return;
    event.preventDefault(); if (event.repeat) return;
    if (key === 'p' || key === 'escape') { pause(); return; }
    if (phase !== 'running') return;
    keys.add(key);
    if (key === 'r') reload(); else if (key === 'q') { scopeToggle = !scopeToggle; setScope(); } else if (key === 'g') toggleGuide(); else if (key === 'e') interact();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { active = false; clearInput(); if (phase === 'running') setPhase('paused'); persist(); });
  window.addEventListener('focus', () => { active = true; previous = 0; });
  document.addEventListener('visibilitychange', () => { previous = 0; if (document.hidden) { clearInput(); if (phase === 'running') setPhase('paused'); persist(); } });
  new IntersectionObserver(entries => { if (entries[0].intersectionRatio < .1 && phase === 'running') setPhase('paused'); }, { threshold: .1 }).observe(game);

  function openTracking() {
    if (!campaign.pending.length || !['camp', 'running'].includes(phase)) return;
    trackingOrigin = phase; searchTask = null; setPhase('tracking');
    $('tracking-title').textContent = 'Follow a trail.'; $('tracking-text').textContent = campaign.dog ? 'Bracken is ready. A search uses 12 minutes of daylight.' : 'A search uses 20 minutes of daylight. Fresh trails give you better odds.';
    $('search-progress').hidden = true; $('track-close').disabled = false; $('track-close').textContent = 'Back';
    $('track-choice').innerHTML = campaign.pending.map(t => {
      const age = Math.max(0, campaign.state.minute - t.hitAt), freshness = age < 60 ? 'Fresh trail' : age < 240 ? 'Fading trail' : 'Old trail';
      return '<button type="button" data-search="' + t.id + '"><span class="hunt-kicker">' + freshness + ' / ' + esc(REGIONS[t.region].name) + '</span>' + animalName(t) + ', ' + t.weight + ' lb<span>Search this trail</span></button>';
    }).join('');
    $('track-choice').querySelector('button').focus({ preventScroll: true });
  }
  function searchTrail(id) {
    if (phase !== 'tracking' || searchTask) return;
    const result = campaign.search(id); if (!result) return;
    searchTask = { result, elapsed: 0, duration: 3.5 }; persist(); updateUI();
    $('tracking-title').textContent = 'Searching the trail...'; $('tracking-text').textContent = campaign.dog ? 'Bracken has his nose to the ground.' : 'Checking the path beyond the clearing.';
    $('track-choice').innerHTML = ''; $('search-progress').hidden = false; $('search-progress').value = 0; $('track-close').disabled = true;
  }
  function finishSearch() {
    const result = searchTask.result;
    $('tracking-title').textContent = result.found ? 'Recovered.' : 'The trail went cold.';
    $('tracking-text').textContent = result.text + (result.record ? ' ' + result.record.weight + ' lb, ' + campaign.value(result.record) + ' credits in your pack.' : '');
    $('search-progress').hidden = true; $('track-close').disabled = false; $('track-close').textContent = trackingOrigin === 'camp' ? 'Back to camp' : 'Keep hunting';
    if (result.found && trackingOrigin === 'running') world.recovered++;
    searchTask = { ...searchTask, done: true }; $('track-close').focus({ preventScroll: true });
  }
  function closeTracking() {
    if (phase !== 'tracking' || searchTask && !searchTask.done) return;
    const origin = trackingOrigin; searchTask = null; setPhase(origin);
    if (origin === 'camp') { renderCamp(); $('camp-search').focus({ preventScroll: true }); }
    else { message('Back in the clearing.'); if (period(campaign.state.minute) === 'Night') returnCamp(); }
  }
  $('start').addEventListener('click', run); $('pause').addEventListener('click', pause); $('reset').addEventListener('click', returnCamp);
  $('fire').addEventListener('click', fire); $('reload').addEventListener('click', reload); $('guide').addEventListener('click', toggleGuide);
  $('interact').addEventListener('click', interact); $('search').addEventListener('click', openTracking); $('camp-search').addEventListener('click', openTracking);
  $('scope').addEventListener('click', () => { if (phase === 'running') { scopeToggle = !scopeToggle; setScope(); } });
  $('embark').addEventListener('click', beginOuting);
  $('wait-until').addEventListener('click', () => {
    if (phase === 'camp' && campaign.waitUntil($('departure').value)) { campMessage('Day ' + campaign.day + ', ' + campaign.time + '. Ready when you are.'); persist(); renderCamp(); }
  });
  $('loadout').addEventListener('change', () => { campaign.equip($('loadout').value); persist(); });
  $('dog-along').addEventListener('change', () => { campaign.state.dogAlong = $('dog-along').checked; persist(); });
  $('sell-all').addEventListener('click', () => { const value = campaign.sellAll(); campMessage('Pack sold for ' + value + ' credits. Your field records are kept.'); renderCamp(); persist(); });
  $('track-close').addEventListener('click', closeTracking);
  game.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.search) { searchTrail(Number(data.search)); return; }
    if (phase !== 'camp') return;
    if (data.tab) { selectTab(data.tab); renderCollection(); }
    else if (data.speed !== undefined) { campSpeed = Number(data.speed); game.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); }
    else if (data.region) { campaign.select(data.region); renderCamp(); persist(); }
    else if (data.deerLevel && campaign.selectDeerLevel(Number(data.deerLevel))) { campMessage(deerLevel(campaign.state.deerLevel).name + ' selected for your next Birch outing.'); renderCamp(); persist(); }
    else if (data.buy && campaign.buy(data.buy)) { campMessage(ITEMS[data.buy].name + ' is ready for your next outing.'); renderCamp(); persist(); }
    else if (data.unlock && campaign.unlock(data.unlock)) { campMessage('Cypress Edge is open. Your next outing can head into the reeds.'); renderCamp(); persist(); }
    else if (data.sell) { const value = campaign.sell(Number(data.sell)); campMessage('Sold for ' + value + ' credits. The record stays in your collection.'); renderCamp(); persist(); }
    else if (data.mount && campaign.mount(Number(data.mount))) { campMessage('Kept as a trophy.'); renderCamp(); persist(); }
  });
  $('sound').addEventListener('click', async () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) { message('Sound is unavailable in this browser.'); return; }
      if (!audio) audio = new Audio(); await audio.resume(); sound = !sound;
      $('sound').textContent = sound ? 'Sound on' : 'Sound off'; $('sound').setAttribute('aria-pressed', String(sound));
    } catch { message('Sound could not start. You can keep playing.'); }
  });
  function fullscreenLabel() {
    const enabled = document.fullscreenElement === game || game.classList.contains('hunt-fullscreen');
    $('fullscreen').textContent = enabled ? 'Exit fullscreen' : 'Fullscreen'; $('fullscreen').setAttribute('aria-pressed', String(enabled)); fitCanvas();
  }
  $('fullscreen').addEventListener('click', async () => {
    if (document.fullscreenElement === game) await document.exitFullscreen();
    else if (game.classList.contains('hunt-fullscreen')) { game.classList.remove('hunt-fullscreen'); document.body.classList.remove('hunt-lock'); }
    else { try { if (!game.requestFullscreen) throw new Error('Use page fullscreen'); await game.requestFullscreen(); } catch { game.classList.add('hunt-fullscreen'); document.body.classList.add('hunt-lock'); } }
    fullscreenLabel();
  });
  document.addEventListener('fullscreenchange', fullscreenLabel);
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && game.classList.contains('hunt-fullscreen')) { game.classList.remove('hunt-fullscreen'); document.body.classList.remove('hunt-lock'); fullscreenLabel(); } });

  function frame(time) {
    const elapsed = active && !document.hidden && previous ? Math.min((time - previous) / 1000, .1) : 0; previous = time;
    if (phase === 'camp') {
      campaign.advance(elapsed, campSpeed); updateClock();
      const bucket = Math.floor(campaign.state.minute / 5);
      if (bucket !== valueBucket) { valueBucket = bucket; if (campTab === 'trophies') renderCollection(); }
    } else if (phase === 'running') {
      const held = [...holds.values()], fast = keys.has('f') || held.includes('wait');
      const move = fast ? 0 : Number(keys.has('d') || keys.has('arrowright') || held.some(v => v.x === 1)) - Number(keys.has('a') || keys.has('arrowleft') || held.some(v => v.x === -1));
      const moveY = fast ? 0 : Number(keys.has('w') || keys.has('arrowup') || held.some(v => v.y === 1)) - Number(keys.has('s') || keys.has('arrowdown') || held.some(v => v.y === -1));
      campaign.advance(elapsed, fast ? 300 : 1);
      accumulator += elapsed * (fast ? T.fastForward : 1);
      let steps = 0;
      while (accumulator >= STEP && steps++ < 96) { world.step(STEP, { move, moveY }); accumulator -= STEP; }
      events(); view.tick(elapsed); draw(); uiTime += elapsed;
      if (uiTime > .1) { uiTime = 0; updateUI(); }
      $('wait').setAttribute('aria-pressed', String(fast));
      if (period(campaign.state.minute) === 'Night') { returnCamp(); campMessage('Daylight is gone. Back at camp with your pack and unfinished trails.'); }
    } else if (phase === 'tracking' && searchTask && !searchTask.done) {
      searchTask.elapsed += elapsed; $('search-progress').value = Math.min(1, searchTask.elapsed / searchTask.duration);
      if (searchTask.elapsed >= searchTask.duration) finishSearch();
    }
    saveTime += elapsed; if (saveTime > 10) { saveTime = 0; if (phase !== 'loading') persist(); }
    raf = requestAnimationFrame(frame);
  }
  HuntingView.loadArt().then(loaded => {
    art = loaded; world = new World(art.mask); view = new HuntingView.View(canvas, art.sprites);
    setPhase('camp'); renderCamp(); selectTab('outing'); persist(); raf = requestAnimationFrame(frame);
  }).catch(error => {
    $('overlay-title').textContent = 'The field did not load'; $('overlay-text').textContent = error.message + ' Reload the page to try again.';
    $('briefing-note').hidden = true; $('start').textContent = 'Reload page'; $('start').disabled = false;
    $('start').addEventListener('click', () => location.reload(), { once: true }); message('Artwork could not load.');
  });
  // TEST_HOOKS: the browser QA server inserts inspection helpers here.
})();
