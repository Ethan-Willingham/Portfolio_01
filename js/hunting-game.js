(function () {
  'use strict';
  const { TUNING: T, World, clamp } = HuntingPhysics;
  const $ = id => document.getElementById('hunt-' + id);
  const game = $('game'), canvas = $('canvas'), overlay = $('overlay');
  const buttons = ['fire', 'reload', 'scope', 'wait', 'pause', 'reset'].map($);
  const moveButtons = [...game.querySelectorAll('[data-move]')];
  const keys = new Set(), holds = new Map();
  let world, view, phase = 'loading', aim = { x: 0, y: 3 };
  let guide = true, scopeToggle = false, scopeHeld = false, sound = false, audio;
  let previous = 0, accumulator = 0, raf = 0, uiTime = 0, messageUntil = 0;
  const STEP = 1 / 120;

  function fitCanvas() {
    const stage = $('stage');
    const scale = Math.min(stage.clientWidth / T.width, stage.clientHeight / T.height);
    canvas.style.width = Math.max(1, Math.floor(T.width * scale)) + 'px';
    canvas.style.height = Math.max(1, Math.floor(T.height * scale)) + 'px';
  }
  new ResizeObserver(fitCanvas).observe($('stage'));
  function draw(showReticle = true) { if (view && world) view.draw(world, aim, guide, showReticle); }
  function message(text, type = '') {
    $('message').textContent = text;
    $('message').dataset.result = type;
    messageUntil = performance.now() + 5000;
  }
  function updateUI() {
    if (!world) return;
    const man = world.hunter;
    $('ammo').textContent = man.reload > 0 ? 'Loading' : man.ammo + ' / ' + T.magazine;
    $('recovered').textContent = world.recovered;
    $('shots').textContent = world.shots;
    const wind = world.wind, magnitude = Math.abs(wind);
    $('wind').textContent = magnitude < .05 ? 'Calm' : (wind > 0 ? 'Right ' : 'Left ') + magnitude.toFixed(2);
    const dx = wind * 31, tip = 35 + dx;
    $('wind-arrow').setAttribute('d', magnitude < .05 ? 'M32 7h6' : 'M35 7H' + tip + 'm' + (wind > 0 ? '-4' : '4') + ' -3L' + tip + ' 7l' + (wind > 0 ? '-4' : '4') + ' 3');
    $('fire').disabled = phase !== 'running' || man.reload > 0;
    $('reload').disabled = phase !== 'running' || man.reload > 0 || man.ammo === T.magazine;
    $('reload').firstChild.textContent = man.reload > 0 ? 'Reloading ' : 'Reload ';
    if (phase === 'running' && performance.now() > messageUntil) {
      message(scopeToggle || scopeHeld ? 'Scope raised. Aim beyond the deer along your sightline.' : guide ? 'Bring the dotted arc through a gold ring. Lead a deer that is moving.' : 'Aim beyond the deer along your sightline. Wind carries long shots farther.');
    }
  }
  function setScope() {
    if (!view) return;
    const active = scopeToggle || scopeHeld;
    view.scope(active, aim);
    $('scope').setAttribute('aria-pressed', String(active));
    $('scope-label').hidden = !active;
    draw();
  }
  function clearInput() {
    keys.clear(); holds.clear(); scopeHeld = false;
    $('wait').setAttribute('aria-pressed', 'false');
    if (view) setScope();
  }
  function setPhase(next) {
    phase = next; game.dataset.phase = next;
    clearInput(); accumulator = 0;
    buttons.forEach(button => { button.disabled = next !== 'running'; });
    moveButtons.forEach(button => { button.disabled = next !== 'running'; });
    $('pause').disabled = next === 'ready' || next === 'loading';
    $('pause').textContent = next === 'paused' ? 'Resume' : 'Pause';
    overlay.hidden = next === 'running';
    if (next === 'paused') {
      $('overlay-kicker').textContent = 'Back in the stand';
      $('overlay-title').textContent = 'Paused';
      $('overlay-text').textContent = 'The field and your rounds will wait here.';
      $('briefing-note').hidden = true;
      $('start').textContent = 'Resume';
      $('start').disabled = false;
    }
    if (next === 'running') { canvas.focus({ preventScroll: true }); }
    else if (next === 'paused') $('start').focus({ preventScroll: true });
    updateUI(); draw();
  }
  function run() { if (!world || !view) return; setPhase('running'); message('Aim beyond a deer. Line the dotted arc up with its gold ring.'); }
  function pause() { if (phase === 'running') setPhase('paused'); else if (phase === 'paused') run(); }
  function reset() {
    if (!view) return;
    world = new World(world.art);
    view.effects = []; aim = { x: 0, y: 3 }; scopeToggle = false; scopeHeld = false;
    setScope(); run();
  }
  function tone(type) {
    if (!sound || !audio || audio.state !== 'running') return;
    const time = audio.currentTime, gain = audio.createGain();
    gain.connect(audio.destination);
    const duration = type === 'shot' ? .16 : type === 'recovered' ? .3 : .07;
    gain.gain.setValueAtTime(type === 'shot' ? .12 : .045, time);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    if (type === 'shot') {
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = audio.createBufferSource(), filter = audio.createBiquadFilter();
      noise.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 900;
      noise.connect(filter); filter.connect(gain); noise.start();
    } else {
      const oscillator = audio.createOscillator(); oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(type === 'recovered' ? 440 : 160, time);
      oscillator.connect(gain); oscillator.start(); oscillator.stop(time + duration);
    }
  }
  function events() {
    for (const event of world.drainEvents()) {
      view.addEffect(event);
      if (event.type !== 'shot') message(event.text, event.type);
      if (['shot', 'reload', 'recovered'].includes(event.type)) tone(event.type);
    }
  }
  function fire() { if (phase === 'running') { world.fire(aim); events(); updateUI(); draw(); } }
  function reload() { if (phase === 'running') { world.reload(); events(); updateUI(); } }
  function toggleGuide() {
    guide = !guide;
    $('guide').setAttribute('aria-pressed', String(guide));
    $('guide').firstChild.textContent = guide ? 'Guide on ' : 'Guide off ';
    draw();
  }
  function pointAim(event) {
    if (!view || phase !== 'running') return;
    const rect = canvas.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) * T.width / rect.width, y: (event.clientY - rect.top) * T.height / rect.height };
    aim = world.aim(HuntingView.unproject(point, view.camera));
    draw();
  }
  canvas.addEventListener('pointermove', pointAim);
  canvas.addEventListener('pointerdown', event => {
    if (phase !== 'running') return;
    event.preventDefault(); canvas.focus({ preventScroll: true });
    pointAim(event);
    if (event.button === 2) { scopeHeld = true; setScope(); }
    else if (event.pointerType === 'mouse' || event.pointerType === 'pen') fire();
    else canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('pointerup', event => {
    holds.delete(event.pointerId);
    if (event.button === 2 && scopeHeld) { scopeHeld = false; setScope(); }
    $('wait').setAttribute('aria-pressed', String([...holds.values()].includes('wait')));
  });
  window.addEventListener('pointercancel', event => { holds.delete(event.pointerId); scopeHeld = false; setScope(); $('wait').setAttribute('aria-pressed', 'false'); });
  function holdButton(button, value) {
    button.addEventListener('pointerdown', event => {
      if (phase !== 'running') return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      holds.set(event.pointerId, value);
      if (value === 'wait') button.setAttribute('aria-pressed', 'true');
    });
    button.addEventListener('lostpointercapture', event => { holds.delete(event.pointerId); if (value === 'wait') button.setAttribute('aria-pressed', 'false'); });
  }
  holdButton($('wait'), 'wait');
  moveButtons.forEach(button => holdButton(button, Number(button.dataset.move)));
  // Native button keyboard activation is a short wait or shuffle, too.
  $('wait').addEventListener('keydown', event => { if (phase === 'running' && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); keys.add('f'); } });
  $('wait').addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); keys.delete('f'); } });
  moveButtons.forEach(button => {
    button.addEventListener('keydown', event => { if (phase === 'running' && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); holds.set('keyboard', Number(button.dataset.move)); } });
    button.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); holds.delete('keyboard'); } });
  });
  window.addEventListener('keydown', event => {
    if (!game.contains(document.activeElement) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!['a', 'd', 'arrowleft', 'arrowright', 'r', 'q', 'g', 'f', 'p', 'escape'].includes(key)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (key === 'p' || key === 'escape') { pause(); return; }
    if (phase !== 'running') return;
    keys.add(key);
    if (key === 'r') reload();
    else if (key === 'q') { scopeToggle = !scopeToggle; setScope(); }
    else if (key === 'g') toggleGuide();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { clearInput(); if (phase === 'running') setPhase('paused'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'running') setPhase('paused'); });
  new IntersectionObserver(entries => { if (entries[0].intersectionRatio < .1 && phase === 'running') setPhase('paused'); }, { threshold: .1 }).observe(game);

  $('start').addEventListener('click', run);
  $('pause').addEventListener('click', pause);
  $('reset').addEventListener('click', reset);
  $('fire').addEventListener('click', fire);
  $('reload').addEventListener('click', reload);
  $('guide').addEventListener('click', toggleGuide);
  $('scope').addEventListener('click', () => { if (phase === 'running') { scopeToggle = !scopeToggle; setScope(); } });
  $('sound').addEventListener('click', async () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { message('Sound is unavailable in this browser.'); return; }
      if (!audio) audio = new Audio();
      await audio.resume(); sound = !sound;
      $('sound').textContent = sound ? 'Sound on' : 'Sound off';
      $('sound').setAttribute('aria-pressed', String(sound));
    } catch { message('Sound could not start. You can keep playing.'); }
  });
  function fullscreenLabel() {
    const active = document.fullscreenElement === game || game.classList.contains('hunt-fullscreen');
    $('fullscreen').textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    $('fullscreen').setAttribute('aria-pressed', String(active)); fitCanvas();
  }
  $('fullscreen').addEventListener('click', async () => {
    if (document.fullscreenElement === game) await document.exitFullscreen();
    else if (game.classList.contains('hunt-fullscreen')) { game.classList.remove('hunt-fullscreen'); document.body.classList.remove('hunt-lock'); }
    else {
      try { if (!game.requestFullscreen) throw new Error('Use page fullscreen'); await game.requestFullscreen(); }
      catch { game.classList.add('hunt-fullscreen'); document.body.classList.add('hunt-lock'); }
    }
    fullscreenLabel();
  });
  document.addEventListener('fullscreenchange', fullscreenLabel);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && game.classList.contains('hunt-fullscreen')) { game.classList.remove('hunt-fullscreen'); document.body.classList.remove('hunt-lock'); fullscreenLabel(); }
  });

  function frame(time) {
    const elapsed = previous ? Math.min((time - previous) / 1000, .1) : 0;
    previous = time;
    if (phase === 'running') {
      const held = [...holds.values()];
      const fast = keys.has('f') || held.includes('wait');
      const move = Number(keys.has('d') || keys.has('arrowright') || held.includes(1)) - Number(keys.has('a') || keys.has('arrowleft') || held.includes(-1));
      accumulator += elapsed * (fast ? T.fastForward : 1);
      let steps = 0;
      while (accumulator >= STEP && steps++ < 96) { world.step(STEP, { move }); accumulator -= STEP; }
      events(); view.tick(elapsed); draw();
      uiTime += elapsed;
      if (uiTime > .1) { uiTime = 0; updateUI(); }
      $('wait').setAttribute('aria-pressed', String(fast));
    }
    raf = requestAnimationFrame(frame);
  }
  HuntingView.loadArt().then(art => {
    world = new World(art.mask); view = new HuntingView.View(canvas, art.sprites);
    $('start').disabled = false; $('start').textContent = 'Take the stand';
    setPhase('ready'); message('Five rounds. A clearing full of deer.'); fitCanvas(); draw();
    raf = requestAnimationFrame(frame);
  }).catch(error => {
    $('overlay-title').textContent = 'The field didn\'t load';
    $('overlay-text').textContent = error.message + ' Reload the page to try again.';
    $('briefing-note').hidden = true; $('start').textContent = 'Reload page'; $('start').disabled = false;
    $('start').addEventListener('click', () => location.reload(), { once: true });
    message('Artwork could not load.');
  });
  // TEST_HOOKS: the browser QA server inserts inspection helpers here.
})();
