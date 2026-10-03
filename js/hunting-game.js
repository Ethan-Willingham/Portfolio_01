(function () {
  'use strict';
  const { TUNING: T, World } = HuntingPhysics;
  const { Campaign, REGIONS, DEER_LEVELS, animalArt, animalName, SAVE_KEY, period, activity } = HuntingCampaign;
  const $ = id => document.getElementById('hunt-' + id);
  const game = $('game'), canvas = $('canvas'), keys = new Set(), holds = new Map(), touchAim = new Set();
  let campaign, storageOK = true;
  try { campaign = new Campaign(JSON.parse(localStorage.getItem(SAVE_KEY))); }
  catch { campaign = new Campaign(); storageOK = false; }
  let art, world, view, phase = 'loading', aim = { x: 0, y: 100, h: 0 };
  let guide = false, scopeToggle = false, sound = false, audio;
  let previous = 0, accumulator = 0, raf = 0, saveTime = 0, messageUntil = 0, shotViewLeft = 0;
  let opportunityLeft = 0, seenOpportunity = 0, pace = { clock: 1, simulation: 1 }, menuResume = false;
  let active = !document.hidden, visible = true;
  const STEP = 1 / 120;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function persist() {
    try { localStorage.setItem(SAVE_KEY, campaign.export()); storageOK = true; }
    catch { storageOK = false; }
    $('save-note').textContent = storageOK ? 'Your clock and recoveries save in this browser.' : 'Saving is unavailable in this browser. Keep this tab open to keep your hunt.';
  }
  function fitCanvas() {
    const stage = $('stage'), scale = Math.min(stage.clientWidth / T.width, stage.clientHeight / T.height);
    canvas.style.width = Math.max(1, Math.floor(T.width * scale)) + 'px';
    canvas.style.height = Math.max(1, Math.floor(T.height * scale)) + 'px';
  }
  new ResizeObserver(fitCanvas).observe($('stage'));
  function waiting() { return phase === 'running' && (keys.has('f') || keys.has(' ') || holds.size > 0); }
  function draw(showReticle = true) {
    if (!view || !world) return;
    world.minute = campaign.state.minute; world.waiting = waiting();
    view.draw(world, aim, guide, showReticle);
  }
  function message(text, type = '', seconds = 5) {
    if ($('message').textContent !== text) $('message').textContent = text;
    $('message').dataset.result = type; messageUntil = performance.now() + seconds * 1000;
  }
  function updateUI() {
    $('clock').textContent = campaign.time; $('day').textContent = 'Day ' + campaign.day;
    $('period').textContent = period(campaign.state.minute); $('mode').textContent = REGIONS[campaign.state.selected].name;
    $('recovered').textContent = campaign.state.records.length;
    if (!world) return;
    const man = world.hunter, flight = world.bullets.length > 0, recovering = world.deer.some(animal => animal.bleed > 0);
    $('ammo').textContent = man.reload > 0 ? 'Loading' : man.ammo + ' / ' + T.magazine;
    $('wind').textContent = Math.abs(world.wind) < .05 ? 'Calm' : (world.wind > 0 ? 'Right ' : 'Left ') + Math.abs(world.wind).toFixed(1);
    $('speed').textContent = phase !== 'running' ? 'Stopped' : flight ? 'Flight' : waiting() ? Math.round(pace.clock) + 'x time' : '1x time';
    $('speed').dataset.slow = String(waiting() && opportunityLeft > 0 && !flight);
    $('wait').setAttribute('aria-pressed', String(waiting()));
    $('wait').disabled = phase !== 'running' || flight || scopeToggle;
    $('scope').disabled = phase !== 'running' || flight || shotViewLeft > 0;
    $('fire').disabled = phase !== 'running' || man.reload > 0 || flight || shotViewLeft > 0;
    $('fire').textContent = man.reload > 0 ? 'Loading...' : scopeToggle ? 'Shoot' : 'Aim';
    $('scope').textContent = scopeToggle ? 'Lower scope' : 'Scope'; $('scope').setAttribute('aria-pressed', String(scopeToggle));
    $('pause').disabled = !['running', 'paused'].includes(phase); $('pause').textContent = phase === 'paused' ? 'Resume' : 'Pause';
    $('menu').disabled = phase === 'loading'; $('region').disabled = flight || recovering; $('deer-level').disabled = flight || recovering;
    if (phase === 'running' && performance.now() > messageUntil) {
      const text = flight ? 'Watch the round fall and drift.' : scopeToggle ? 'Aim above the shoulder for drop. Allow for wind and movement.' : waiting() && opportunityLeft > 0 ? 'Something moved. Release to stop rushing past it.' : 'Hold Fast-forward to watch the field. Click an animal to raise your scope.';
      message(text, '', 1);
    }
  }
  function setScope(enabled) {
    scopeToggle = !!enabled;
    if (view) view.scope(scopeToggle, aim);
    if (scopeToggle) { keys.delete('f'); keys.delete(' '); holds.clear(); }
    else for (const key of ['w', 'a', 's', 'd']) keys.delete(key);
    updateUI(); draw();
  }
  function clearInput() { keys.clear(); holds.clear(); touchAim.clear(); $('wait').setAttribute('aria-pressed', 'false'); }
  function setPhase(next) {
    if (next === 'running' && !visible) next = 'paused';
    phase = next; game.dataset.phase = next; clearInput(); accumulator = 0;
    $('overlay').hidden = next !== 'paused' && next !== 'loading'; $('options').hidden = next !== 'menu';
    if (next === 'paused') {
      $('overlay-title').textContent = 'Paused'; $('overlay-text').textContent = 'The field and clock are stopped.';
      $('start').textContent = 'Keep watching'; $('start').disabled = false; $('start').focus({ preventScroll: true });
    }
    if (next === 'running') canvas.focus({ preventScroll: true });
    updateUI(); draw();
  }
  function beginField(region = campaign.state.selected) {
    if (!art) return;
    if (world && (world.bullets.length || world.deer.some(animal => animal.bleed > 0))) return;
    if (!campaign.state.regions.includes(region)) campaign.state.regions.push(region);
    campaign.select(region); const selected = REGIONS[region];
    world = new World(art.masks[selected.animal], Date.now(), {
      lookout: true, species: selected.animal, backdrop: selected.backdrop, windForce: selected.wind,
      windScale: campaign.state.equipped === 'rifle' ? .6 : 1,
      animal: (species, seed) => campaign.animal(species, seed), artFor: profile => art.masks[animalArt(profile)],
      spriteFor: animalArt, activity: () => activity(campaign.state.minute)
    });
    view.effects = []; view.trails = []; opportunityLeft = 0; shotViewLeft = 0; seenOpportunity = world.opportunity || 0;
    aim = { x: 0, y: 100, h: 0 }; setScope(false);
    message('Hold Fast-forward. Release when you spot something worth a closer look.', '', 8); persist(); draw();
  }
  function renderOptions() {
    $('region').value = campaign.state.selected;
    $('option-note').textContent = world && world.deer.some(animal => animal.bleed > 0) ? 'Return to the field to finish this recovery before changing views.' : 'Larger bucks unlock as you recover deer. Changing fields starts a fresh view at the same hour.';
    $('deer-level').innerHTML = DEER_LEVELS.map(d => '<option value="' + d.level + '"' + (d.level > campaign.maxDeerLevel ? ' disabled' : '') + '>' + d.name + (d.level > campaign.maxDeerLevel ? ' (' + d.required + ' deer)' : '') + '</option>').join('');
    $('deer-level').value = campaign.state.deerLevel;
    $('record-list').innerHTML = campaign.state.records.length ? campaign.state.records.slice(-20).reverse().map(r => '<li><span>' + esc(animalName(r)) + '</span><span>' + r.weight + ' lb</span></li>').join('') : '<li>Your first recovery will appear here.</li>';
    persist();
  }
  function openMenu() {
    if (!['running', 'paused'].includes(phase)) return;
    menuResume = phase === 'running'; setPhase('menu'); renderOptions(); $('menu-close').focus({ preventScroll: true });
  }
  function closeMenu() { if (phase === 'menu') setPhase(menuResume ? 'running' : 'paused'); }
  function pause() { if (phase === 'running') setPhase('paused'); else if (phase === 'paused') setPhase('running'); }
  function tone(type) {
    if (!sound || !audio || audio.state !== 'running') return;
    const time = audio.currentTime, gain = audio.createGain(); gain.connect(audio.destination);
    const duration = type === 'shot' ? .16 : .2;
    gain.gain.setValueAtTime(type === 'shot' ? .12 : .045, time); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    if (type === 'shot') {
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(); noise.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 900;
      noise.connect(filter); filter.connect(gain); noise.start();
    } else {
      const oscillator = audio.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(440, time);
      oscillator.connect(gain); oscillator.start(); oscillator.stop(time + duration);
    }
  }
  function events() {
    for (const event of world.drainEvents()) {
      view.addEffect(event);
      if (event.type === 'arrival') {
        opportunityLeft = Math.max(opportunityLeft, 2.4);
        message(event.text || 'Movement in the field. Release Fast-forward for a closer look.', 'arrival', 3);
      } else if (event.type === 'shot') { campaign.state.shots++; tone('shot'); persist(); }
      else if (event.type === 'recovered' && event.animal) {
        const record = campaign.recover(event.animal);
        message(animalName(record) + ', ' + record.weight + ' lb. Recovery saved.', 'recovered'); tone('recovered'); persist();
      } else if (event.type === 'escape') message('It reached the trees. Watch for the next one.', 'escape');
      else if (event.type === 'departed') { if (waiting()) message('That one passed through. Keep watching.', 'departed', 2); }
      else if (event.text) message(event.text, event.type);
    }
    if ((world.opportunity || 0) !== seenOpportunity) { seenOpportunity = world.opportunity || 0; opportunityLeft = Math.max(opportunityLeft, 2.4); }
  }
  function fire() {
    if (phase !== 'running' || world.bullets.length || world.hunter.reload > 0 || shotViewLeft > 0) return;
    if (!scopeToggle) { setScope(true); message('Scope raised. WASD moves the view. Click to shoot; Q lowers it.'); return; }
    if (world.fire(aim)) { shotViewLeft = .8; clearInput(); message('Round away. Watch its drop and wind drift.'); }
    events(); updateUI(); draw();
  }
  function reload() { if (phase === 'running') { world.reload(); events(); updateUI(); } }
  function pointAim(event) {
    if (!view || phase !== 'running' || world.bullets.length || shotViewLeft > 0 || event.pointerType === 'touch' && !touchAim.has(event.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) * T.width / rect.width, y: (event.clientY - rect.top) * T.height / rect.height };
    if (scopeToggle) {
      const dx = point.x - T.width / 2, dy = point.y - T.height / 2;
      const distance = Math.hypot(dx, dy), radius = T.height * .45;
      if (distance > radius) { point.x = T.width / 2 + dx * radius / distance; point.y = T.height / 2 + dy * radius / distance; }
    }
    aim = world.aim(HuntingView.unproject(point, view.camera)); draw();
  }
  canvas.addEventListener('pointermove', pointAim);
  canvas.addEventListener('pointerdown', event => {
    if (phase !== 'running') return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); touchAim.add(event.pointerId); pointAim(event);
    if (event.button === 2) { if (!world.bullets.length && !shotViewLeft) setScope(!scopeToggle); }
    else if (event.pointerType === 'mouse' || event.pointerType === 'pen') fire();
    else canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  function releasePointer(event) { holds.delete(event.pointerId); touchAim.delete(event.pointerId); updateUI(); }
  window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  $('wait').addEventListener('pointerdown', event => {
    if (phase !== 'running' || scopeToggle || world.bullets.length) return;
    event.preventDefault(); $('wait').setPointerCapture(event.pointerId); holds.set(event.pointerId, 'wait'); updateUI();
  });
  $('wait').addEventListener('lostpointercapture', releasePointer);
  $('wait').addEventListener('keydown', event => {
    if (phase === 'running' && !scopeToggle && !world.bullets.length && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); holds.set('keyboard', 'wait'); updateUI(); }
  });
  $('wait').addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); holds.delete('keyboard'); updateUI(); } });
  window.addEventListener('keydown', event => {
    if (phase === 'paused' && event.key === 'Tab') { event.preventDefault(); $('start').focus(); return; }
    if (phase === 'menu') {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
      if (event.key === 'Tab') {
        const targets = [...$('options').querySelectorAll('button:not(:disabled), select:not(:disabled)')], first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (!game.contains(document.activeElement) || event.target.closest('input, select, textarea, a')) return;
    const key = event.key.toLowerCase();
    if (event.target.closest('button') && [' ', 'enter'].includes(key)) return;
    if (!['f', ' ', 'q', 'r', 'p', 'escape', 'enter', 'w', 'a', 's', 'd'].includes(key)) return;
    event.preventDefault(); if (event.repeat) return;
    if (key === 'escape' && scopeToggle && phase === 'running' && !world.bullets.length && !shotViewLeft) { setScope(false); return; }
    if (key === 'p' || key === 'escape') { pause(); return; }
    if (phase !== 'running') return;
    if (key === 'f' || key === ' ') { if (!scopeToggle && !world.bullets.length) keys.add(key); }
    else if (['w', 'a', 's', 'd'].includes(key)) { if (scopeToggle && !world.bullets.length && !shotViewLeft) keys.add(key); }
    else if (key === 'q') { if (!world.bullets.length && !shotViewLeft) setScope(!scopeToggle); }
    else if (key === 'r') reload(); else if (key === 'enter') fire(); updateUI();
  });
  window.addEventListener('keyup', event => {
    keys.delete(event.key.toLowerCase());
    if ([' ', 'Enter'].includes(event.key)) holds.delete('keyboard');
    updateUI();
  });
  $('wait').addEventListener('blur', () => { holds.delete('keyboard'); updateUI(); });
  function loseFocus() { active = false; previous = 0; menuResume = false; clearInput(); if (phase === 'running') setPhase('paused'); persist(); }
  window.addEventListener('blur', loseFocus);
  window.addEventListener('focus', () => { active = true; previous = 0; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); else { active = true; previous = 0; } });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) { menuResume = false; if (phase === 'running') setPhase('paused'); }
  }, { threshold: .1 }).observe(game);
  $('start').addEventListener('click', () => { if (phase === 'paused') setPhase('running'); });
  $('pause').addEventListener('click', pause);
  $('scope').addEventListener('click', () => { if (phase === 'running' && !world.bullets.length && !shotViewLeft) setScope(!scopeToggle); });
  $('fire').addEventListener('click', fire); $('menu').addEventListener('click', openMenu); $('menu-close').addEventListener('click', closeMenu);
  $('region').addEventListener('change', () => { beginField($('region').value); renderOptions(); });
  $('deer-level').addEventListener('change', () => { if (campaign.selectDeerLevel(Number($('deer-level').value))) { beginField('birch'); renderOptions(); } });
  $('sound').addEventListener('click', async () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
      if (!audio) audio = new Audio(); await audio.resume(); sound = !sound;
      $('sound').textContent = sound ? 'Sound on' : 'Sound off'; $('sound').setAttribute('aria-pressed', String(sound));
    } catch { $('save-note').textContent = 'Sound could not start. The hunt is still playable.'; }
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
  function advance(seconds) {
    if (phase !== 'running' || !(seconds > 0)) return;
    let left = seconds;
    while (left > .000001) {
      const elapsed = Math.min(left, .05); left -= elapsed; opportunityLeft = Math.max(0, opportunityLeft - elapsed);
      const flight = world.bullets.length > 0;
      if (scopeToggle && !flight && !shotViewLeft) {
        const moveX = Number(keys.has('d')) - Number(keys.has('a'));
        const moveY = Number(keys.has('s')) - Number(keys.has('w'));
        const reticle = HuntingView.project(aim, view.camera);
        if (view.panScope(moveX, moveY, elapsed)) aim = world.aim(HuntingView.unproject(reticle, view.camera));
      }
      pace = flight ? { clock: 1, simulation: .6 } : world.lookoutPace(waiting(), scopeToggle, opportunityLeft);
      campaign.advance(elapsed, pace.clock); accumulator += elapsed * pace.simulation;
      while (accumulator >= STEP) { world.step(STEP); accumulator -= STEP; }
      events(); view.tick(elapsed);
      if (!world.bullets.length && shotViewLeft > 0) { shotViewLeft = Math.max(0, shotViewLeft - elapsed); if (!shotViewLeft) setScope(false); }
      if (world.hunter.ammo === 0 && !world.hunter.reload && !world.bullets.length) world.reload();
    }
    draw(); updateUI(); saveTime += seconds; if (saveTime > 5) { saveTime = 0; persist(); }
  }
  function frame(time) {
    const wallElapsed = active && !document.hidden && previous ? Math.max(0, (time - previous) / 1000) : 0;
    const elapsed = Math.min(wallElapsed, 1);
    // A long rendering stall cannot extend a wildlife easing window. Limit
    // simulation catch-up to keep the tab responsive after a stalled frame.
    if (phase === 'running') opportunityLeft = Math.max(0, opportunityLeft - Math.max(0, wallElapsed - elapsed));
    previous = time; advance(elapsed); raf = requestAnimationFrame(frame);
  }
  HuntingView.loadArt().then(loaded => {
    art = loaded; view = new HuntingView.View(canvas, art.sprites);
    beginField(); setPhase('running'); fitCanvas(); renderOptions(); raf = requestAnimationFrame(frame);
  }).catch(error => {
    $('overlay-title').textContent = 'The field did not load'; $('overlay-text').textContent = error.message + ' Reload to try again.';
    $('start').textContent = 'Reload'; $('start').disabled = false;
    $('start').addEventListener('click', () => location.reload(), { once: true });
  });
  // TEST_HOOKS: the browser QA server inserts inspection helpers here.
})();
