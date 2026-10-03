(function () {
  'use strict';
  const $ = id => document.getElementById('cart-' + id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  if (!ctx || !window.CartPhysics || !window.CartCourse || !window.CartView) return;
  const { World, clamp } = CartPhysics;
  const Course = CartCourse, levels = Course.chapters, game = $('game');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rootStyle = getComputedStyle(document.documentElement);
  const token = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const P = {
    dark: token('--bg-raised', '#1e2420'), green: token('--bg', '#303931'), edge: token('--rule', '#4a544b'),
    mid: token('--line-mid', '#767d71'), floor: token('--text-dim', '#b8b2a2'), seam: token('--text-faint', '#a4a293'),
    cream: token('--text', '#e8e2d6'), light: token('--text-bright', '#f5f1ea'), gold: token('--accent', '#d4c4a0'), red: token('--warn', '#d99090'),
    raceRed: '#ce5649', sage: '#9ec79a', pine: '#6f9a6c', clay: '#cf9f78', coral: '#d9978c', blue: '#8fb3c7', purple: '#b79bc4', brick: '#b8796d',
    steel: '#a6aeab', steelShade: '#687674', steelLight: '#e2e6df',
    hairDark: '#48392d', hair: '#6d5040', hairLight: '#927054'
  };
  const STORAGE = 'four-wheels-course-v1';
  let canSave = true, savedRun = null, parkedRun = null;
  const best = { peak: 0, completed: false, time: null, falls: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if ([1,2,Course.VERSION].includes(saved?.version)) {
      if (Number.isFinite(saved.best?.peak) && saved.best.peak >= 0 && saved.best.peak <= 20000) best.peak = saved.best.peak;
      if ([2,Course.VERSION].includes(saved.version)&&saved.best?.completed === true && Number.isFinite(saved.best.time) && saved.best.time > 0 && Number.isInteger(saved.best.falls) && saved.best.falls >= 0) Object.assign(best, { completed: true, time: saved.best.time, falls: saved.best.falls });
      savedRun = saved.run;
    }
  } catch { canSave = false; }
  let levelIndex = 0, world = new World(Course.build()), phase = 'ready', floor;
  let resumed = !!savedRun && Course.restore(world, savedRun), saveTime = 0, confirmReturn = 'ready';
  best.peak = Math.min(best.peak, world.level.totalDistance);
  if (resumed) best.peak = Math.max(best.peak, world.peak);
  savedRun = null;
  const feet = value => Math.floor(value / Course.UNITS_PER_FOOT).toLocaleString('en-US') + ' ft';
  function save() {
    if (!world.practice) best.peak = Math.max(best.peak, world.peak);
    const run = world.practice ? parkedRun : world.status === 'won' ? null : Course.snapshot(world);
    try { localStorage.setItem(STORAGE, JSON.stringify({ version: Course.VERSION, best, run })); canSave=true; }
    catch { canSave = false; }
    saveTime = 0;
  }
  let raf = 0, last = 0, accumulator = 0, uiTime = 0, toastLife = 0;
  let particles = [], screenShake = 0, pickerReturn = 'ready';
  let keys = new Set(), touches = new Map(), pseudoFullscreen = false;
  const stick = $('stick');
  const touchMode = window.matchMedia('(any-pointer: coarse)');

  function timeString(seconds, tenths = false) {
    const value = tenths ? Math.floor(seconds * 10) / 10 : Math.ceil(seconds);
    const minutes = Math.floor(value / 60), rest = value - minutes * 60;
    return minutes + ':' + (tenths ? rest.toFixed(1).padStart(4, '0') : String(Math.floor(rest)).padStart(2, '0'));
  }
  function announce(text) { $('live').textContent = text; }
  function notify(text) { $('toast').textContent = text; $('toast').classList.add('is-visible'); toastLife = 2.4; announce(text); }
  function clearInput() {
    keys.clear();
    for (const id of [...touches.keys()]) releaseContact(id);
    paintTouch();
  }
  function touchValue(control) {
    let value = 0;
    for (const input of touches.values()) value += input[control] || 0;
    return clamp(value, -1, 1);
  }
  function paintTouch() {
    const input = [...touches.values()].find(q => q.element === stick), turn = input?.turn || 0, push = input?.push || 0;
    stick.classList.toggle('is-held', !!input);
    stick.style.setProperty('--stick-base-x', (input?.baseX || 0) + 'px');
    stick.style.setProperty('--stick-base-y', (input?.baseY || 0) + 'px');
    stick.style.setProperty('--thumb-x', (input?.x || 0) + 'px');
    stick.style.setProperty('--thumb-y', (input?.y || 0) + 'px');
    const braking = touchValue('brake') > 0;
    $('touch-brake').classList.toggle('is-held', braking);
    $('touch-brake').setAttribute('aria-pressed', String(braking));
    const actions = [braking ? 'Braking' : push > .01 ? 'Push' : push < -.01 ? 'Pull' : '', turn < -.01 ? 'Left' : turn > .01 ? 'Right' : ''].filter(Boolean);
    $('stick-status').textContent = actions.join(' / ') || 'Release to coast';
  }
  function controls() {
    const braking = touchValue('brake');
    return {
      push: braking ? 0 : clamp(Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touchValue('push'), -1, 1),
      turn: clamp(Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchValue('turn'), -1, 1),
      brake: Number(keys.has('Space') || braking)
    };
  }

  const SOUND_STORAGE = 'four-wheels-sound-v1';
  let soundEnabled = true;
  try { soundEnabled = localStorage.getItem(SOUND_STORAGE) !== 'off'; } catch {}
  const sound = window.CartAudio?.create({ enabled: soundEnabled, onUnavailable: () => {
    refreshSound(); notify('Sound is unavailable in this browser.');
  } }) || { enabled: false, prepare: async () => false, stop() {}, update() {}, event() {}, setEnabled() {} };
  $('sound').disabled = !window.CartAudio;
  function refreshSound() {
    $('sound').setAttribute('aria-pressed', String(sound.enabled));
    $('sound').setAttribute('aria-label', sound.enabled ? 'Turn sound off' : 'Turn sound on');
    $('sound-text').textContent = sound.enabled ? 'Sound on' : 'Sound off';
  }
  function playSound(e) {
    const dx = (e.x ?? world.body.x) - world.body.x, dy = (e.y ?? world.body.y) - world.body.y;
    sound.event(e, clamp((dx - dy) / 180, -.65, .65), Math.hypot(dx, dy));
  }

  // Rendering owns the isometric camera; input and fixed-step physics never
  // use screen coordinates. The same renderer draws play, previews and art.
  const view = CartView.create(P);
  $('stage').style.backgroundColor = view.blend(P.hairDark,P.edge,.48);
  const { makeFloor } = view;
  let narrowCamera = false, followCart = true, touchFocusY = .54;
  function draw(g = ctx, w = world, background = floor, preview = false) {
    view.draw(g,w,background,{preview,particles,shake:screenShake,reducedMotion:reducedMotion.matches,follow:preview?true:followCart,focusY:preview ? .54 : touchFocusY});
  }
  function cameraLabel() {
    $('camera').hidden = false;
    $('camera').setAttribute('aria-pressed', String(!followCart));
    $('camera').setAttribute('aria-label', followCart ? 'Show the whole route' : 'Follow the cart');
    $('camera').title = followCart ? 'Course map (M)' : 'Follow cart (M)';
  }
  function resizeView() {
    const stage = $('stage').getBoundingClientRect();
    if (stage.width <= 0 || stage.height <= 0) return;
    narrowCamera = stage.width < 600 && stage.height > stage.width * 1.2;
    const brake = $('touch-brake').getBoundingClientRect();
    touchFocusY = narrowCamera && touchMode.matches && brake.height ? clamp((brake.top-stage.top-56)/stage.height, .24, .54) : .54;
    const width = narrowCamera ? 480 : 960;
    const height = Math.round(width*stage.height/stage.width);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    cameraLabel(); draw();
  }

  function burst(x, y, count, colors) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + Math.random(), v = 16;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 0, a, omega: Math.random() * 9 - 4, color: colors[i % colors.length], w: 2, h: 2, life: .6 });
    }
  }
  function tickEffects(dt) {
    screenShake = Math.max(0, screenShake - dt * 7);
    toastLife -= dt;
    if (toastLife <= 0) $('toast').classList.remove('is-visible');
    for (const p of particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.omega * dt;
      p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.5 * dt);
      if(p.vz!==undefined){p.z=Math.max(0,p.z+p.vz*dt);p.vz-=80*dt;}
    }
    particles = particles.filter(p => p.life > 0);
    if(!reducedMotion.matches&&!world.fall&&particles.length<80&&Math.floor(world.time*12)!==Math.floor((world.time-dt)*12)&&Math.hypot(world.body.vx,world.body.vy)>22){
      world.wheels.forEach((q,i)=>{const p=CartPhysics.casterPose(world.body,q,i),ground=Course.sample(world.level,p);if(q.load<.02||ground?.kind!=='dirt'&&ground?.kind!=='grass')return;particles.push({x:p.x,y:p.y,z:ground.height+1,a:0,omega:0,vx:-world.body.vx*.12,vy:-world.body.vy*.12,color:ground.kind==='grass'?P.sage:P.gold,w:2,h:2,life:.25});});
    }
  }
  function events() {
    for (const e of world.events.splice(0)) {
      if (e.type !== 'won') playSound(e);
      if (e.type === 'gate' && world.level.gates[world.gate-1]?.visible) burst(e.x, e.y, 8, [P.cream, P.gold, P.sage]);
      if (e.type === 'mess') {
        screenShake = e.kind === 'shelf' ? 1.5 : .65;
        notify(e.kind === 'cone' ? 'Cone down' : e.kind === 'box' ? 'Box bumped' : e.kind === 'table' ? 'Vase knocked off' : 'Stock on the floor');
      }
      if (e.type === 'shelf-down') { screenShake=2; notify(e.kind==='table'?'Table down':'Shelf down'); }
      if (e.type === 'rack-hit') screenShake=Math.max(screenShake,.4);
      if (e.type === 'bump') screenShake = .6;
      if (e.type === 'room') notify('Section '+String(e.index+1).padStart(2,'0')+' / '+levels[e.index].name);
      if (e.type === 'fall') { notify((e.kind==='lake'?'Into the water':'Over the edge')+' / back '+feet(e.lost||0)); save(); }
      if (e.type === 'respawn') { notify('Caught at '+levels[world.roomIndex].name+'. Keep rolling.'); save(); }
      if(e.type==='save-edge')notify('Back on the track');
      if(e.type==='break'&&e.kind==='vase'&&world.roomIndex===7&&!world.circuit.powered)notify('Water on the floor. Roll wet wheels between the brass contacts.');
      if(e.type==='circuit'){notify('Water connected. Shutter opening.');save();}
      if(e.type==='land'&&e.impact>22)screenShake=Math.max(screenShake,Math.min(1.2,e.impact/90));
      if(e.type==='fall-impact'){screenShake=1.2;if(e.kind==='lake')burst(e.x,e.y,18,[P.blue,P.light]);}
      if(e.type==='shopper-launch')screenShake=Math.max(screenShake,.65);
      if (e.type === 'won') { finish(); playSound(e); }
    }
  }
  function updateUI() {
    game.dataset.phase = phase;
    $('hud').inert=phase!=='running';
    $('overlay').inert=!$('picker').hidden;
    canvas.tabIndex=phase==='running'&&$('picker').hidden?0:-1;
    $('touch').inert=phase!=='running';
    if (!world.practice) best.peak = Math.max(best.peak, world.peak);
    $('time-label').textContent = world.practice ? 'Practice' : 'Distance';
    $('time').textContent = feet(world.distance);
    $('clock-fill').style.setProperty('--clock', clamp(world.distance / world.level.totalDistance, 0, 1));
    $('penalty').textContent = 'BEST '+feet(best.peak);
    const section = world.level.sections[world.roomIndex];
    $('course-badge').textContent=String(world.roomIndex+1).padStart(2,'0');
    $('course-title').textContent=section.name;
    game.style.setProperty('--room-color',P[section.theme]||P.clay);
    $('tip').hidden=phase!=='paused';
    $('tip').textContent=world.roomIndex===7&&!world.circuit.powered&&world.shelves[6].spilled?'Roll wet wheels between the two brass contacts to open the shutter.':section.tip;
    $('retry').hidden=world.practice||!((phase==='ready'&&resumed)||phase==='paused');
    const frontSwivel=world.wheelMode==='front-swivel';
    $('wheel-mode').setAttribute('aria-pressed',String(frontSwivel));
    $('wheel-mode').textContent='Fixed rear wheels: '+(frontSwivel?'on':'off');
    $('wheel-mode').setAttribute('aria-label',frontSwivel?'Use four swivel wheels':'Test cart with front swivel wheels and fixed rear wheels');
    $('wheel-mode').disabled=!['ready','paused'].includes(phase);
    $('pause').disabled = !['running','paused'].includes(phase)||!$('picker').hidden;
    $('retry').disabled=!$('picker').hidden||phase==='confirm';$('courses').disabled=phase==='confirm';
    $('pause').setAttribute('aria-label',phase==='paused'?'Resume game':'Pause and open menu');
    $('pause').setAttribute('aria-pressed',String(phase==='paused'));
    $('camera').disabled = phase!=='running';
  }
  function bestText() {
    if (!canSave) return 'Saving unavailable. You can still play.';
    return best.peak>0?'Best '+feet(best.peak):'';
  }
  function overlay(kicker,title,message,primary,secondary) {
    $('overlay').dataset.state=phase;
    $('overlay-kicker').textContent=kicker; $('overlay-kicker').hidden=!kicker;
    $('overlay-title').textContent=title; $('overlay-text').textContent=message;
    $('start').textContent=primary; $('secondary').textContent=secondary||''; $('secondary').hidden=!secondary;
    $('best').textContent=bestText(); $('best').hidden=!$('best').textContent||phase==='confirm'||phase==='won'||(phase==='paused'&&canSave); $('overlay').hidden=false;
    $('options').open=false; $('overlay').scrollTop=0;
  }
  function prepare(w,continuing=false) {
    if(raf)cancelAnimationFrame(raf);raf=0;
    clearInput();world=w;levelIndex=w.level.startRoom;resumed=continuing;
    phase='ready';particles=[];screenShake=0;toastLife=0;
    $('toast').classList.remove('is-visible');$('picker').hidden=true;$('result').hidden=true;
    floor=makeFloor(world.level);
    overlay(world.practice?'Practice':null,'All Four Wheels',continuing?'Your run is saved. Keep going.':'Get the cart to the end. Take your time.',continuing?'Continue':'Play',world.practice?'Return to run':null);
    updateUI();draw();sound.stop();
    $('start').focus({preventScroll:true});
  }
  function reset(index=0,practice=false) { prepare(new World(Course.build(index),practice,world.wheelMode)); if(!practice)save(); }
  function returnToRun() {
    const w=new World(Course.build());
    const loaded=parkedRun&&Course.restore(w,parkedRun);parkedRun=null;
    prepare(w,!!loaded);save();
  }
  function startPractice(index) {
    if(!world.practice) { save(); parkedRun=world.status==='won'?null:Course.snapshot(world); }
    reset(index,true);run();
  }
  function run() {
    phase='running';clearInput();$('overlay').hidden=true;
    canvas.focus({preventScroll:true});sound.prepare().then(ready => { if (ready && phase === 'running' && !document.hidden) sound.update(world, controls()); });last=performance.now();accumulator=0;uiTime=0;
    updateUI();if(!raf)raf=requestAnimationFrame(frame);
  }
  function pause() {
    if(phase!=='running')return;
    phase='paused';clearInput();sound.stop();save();$('result').hidden=true;
    const section=world.level.sections[world.roomIndex];
    overlay(world.practice?'Practice':null,'Paused',section.name,'Resume',world.practice?'Return to run':null);
    updateUI();$('start').focus({preventScroll:true});
  }
  function retry() {
    if(world.practice){returnToRun();return;}
    if(phase==='confirm')return;
    confirmReturn=phase;phase='confirm';clearInput();sound.stop();save();$('result').hidden=true;
    overlay(null,'Restart?','Go back to the start with a clean course. Your best distance stays.','Restart','Cancel');
    updateUI();$('secondary').focus({preventScroll:true});
  }
  function cancelRetry() { const was=confirmReturn;phase=was;prepare(world,true);if(was==='running')run();else if(was==='paused'){run();pause();}else if(was==='won')finish(); }
  function finish() {
    phase='won';clearInput();sound.stop();
    if(!world.practice){best.peak=world.level.totalDistance;if(!best.completed||world.time<best.time){best.time=world.time;best.falls=world.falls;}best.completed=true;save();}
    overlay(world.practice?'Practice complete':null,'Made it!','You got the cart to the end.','Play again',world.practice?'Return to run':null);
    const result=$('result');result.replaceChildren();
    const distance=document.createElement('strong');distance.textContent=feet(world.level.totalDistance);
    const detail=document.createElement('span');detail.textContent=timeString(world.time)+' / '+world.falls+(world.falls===1?' fall':' falls');
    result.append(distance,detail);result.hidden=false;
    updateUI();announce('Course complete. All four wheels made it.');$('start').focus({preventScroll:true});
  }
  function frame(now) {
    raf=0;if(phase!=='running')return;
    const dt=Math.min((now-last)/1000,.1);last=now;accumulator+=dt;
    while(accumulator>=1/120&&phase==='running'){world.step(1/120,controls());events();tickEffects(1/120);accumulator-=1/120;}
    draw();if(phase==='running')sound.update(world, controls(), dt);
    uiTime+=dt;saveTime+=dt;if(uiTime>.1||phase!=='running'){uiTime=0;updateUI();}if(saveTime>2)save();
    if(phase==='running')raf=requestAnimationFrame(frame);
  }
  function closePicker() {
    $('picker').hidden=true;
    if(pickerReturn==='running')run();else{phase=pickerReturn;updateUI();$('courses').focus({preventScroll:true});}
  }
  function openPicker() {
    if(!$('picker').hidden||phase==='confirm')return;
    pickerReturn=phase;clearInput();sound.stop();save();if(phase==='running')phase='paused';
    const grid=$('course-grid');grid.replaceChildren();
    world.level.sections.forEach((section,i)=>{
      const unlocked=i===0||best.peak>=section.startDistance-1;
      const button=document.createElement('button');button.type='button';button.disabled=!unlocked;
      button.className='cart-course-tile'+(i===world.roomIndex?' is-current':'');
      const number=document.createElement('span');number.className='cart-course-number';number.textContent=String(i+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
      const copy=document.createElement('span');copy.className='cart-course-tile-copy';
      const title=document.createElement('strong');title.textContent=section.name;
      const meta=document.createElement('span');meta.className='cart-course-tile-meta';meta.textContent=unlocked?feet(section.startDistance):'Locked';
      copy.append(title,meta);button.append(number,copy);grid.append(button);
      button.setAttribute('aria-label',section.name+', '+(unlocked?'practice at ':'locked until ')+feet(section.startDistance));
      button.addEventListener('click',()=>startPractice(i));
    });
    $('picker').hidden=false;grid.children[Math.min(world.roomIndex,[...grid.children].filter(q=>!q.disabled).length-1)].focus({preventScroll:true});updateUI();
  }
  function fullscreenLabel() {
    const active=document.fullscreenElement === game || pseudoFullscreen;
    $('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    $('fullscreen').setAttribute('aria-pressed',String(active));
    $('fullscreen-text').textContent=active?'Exit fullscreen':'Fullscreen';
  }
  async function fullscreen() {
    if (pseudoFullscreen) { pseudoFullscreen = false; game.classList.remove('cart-pseudo-fullscreen'); document.body.classList.remove('cart-fs-open'); fullscreenLabel(); return; }
    if (document.fullscreenElement === game) { await document.exitFullscreen(); return; }
    try {
      if (!game.requestFullscreen) throw new Error('Use fallback');
      await game.requestFullscreen();
    } catch { pseudoFullscreen = true; game.classList.add('cart-pseudo-fullscreen'); document.body.classList.add('cart-fs-open'); fullscreenLabel(); }
    if (phase === 'running') $('canvas').focus({ preventScroll: true });
  }
  $('start').addEventListener('click',()=>{
    if(phase==='confirm'){parkedRun=null;reset();run();}
    else if(phase==='ready'||phase==='paused')run();
    else if(phase==='won'){reset(world.practice?levelIndex:0,world.practice);run();}
  });
  $('secondary').addEventListener('click',()=>phase==='confirm'?cancelRetry():world.practice?returnToRun():retry());
  $('retry').addEventListener('click',retry);
  $('wheel-mode').addEventListener('click',()=>{
    if(!['ready','paused'].includes(phase))return;
    clearInput();world.setWheelMode(world.wheelMode==='front-swivel'?'all-swivel':'front-swivel');
    save();updateUI();draw();
    announce(world.wheelMode==='front-swivel'?'Front wheels swivel. Rear wheels are fixed.':'All four wheels swivel.');
  });
  $('pause').addEventListener('click', () => phase === 'paused' ? run() : pause());
  $('courses').addEventListener('click', openPicker); $('picker-close').addEventListener('click', closePicker);
  $('fullscreen').addEventListener('click', fullscreen); document.addEventListener('fullscreenchange', fullscreenLabel);
  $('sound').addEventListener('click', () => {
    sound.setEnabled(!sound.enabled); refreshSound();
    try { localStorage.setItem(SOUND_STORAGE, sound.enabled ? 'on' : 'off'); } catch {}
    if (sound.enabled) sound.prepare().then(ready => { if (ready && !document.hidden) sound.event({ type: 'toggle' }); });
  });
  function toggleCamera() {
    if(phase!=='running')return;
    followCart = !followCart; cameraLabel(); draw();
    announce(followCart ? 'Camera follows the cart.' : 'The whole route is visible.');
    canvas.focus({ preventScroll:true });
  }
  $('camera').addEventListener('click',toggleCamera);
  // Touch Events own fingers. Pointer Events only own mouse/pen gestures, so a
  // compatibility pointer stream cannot duplicate or strand a physical touch.
  function releaseContact(id) {
    const input = touches.get(id);
    if (!input) return;
    touches.delete(id);
    if (input.pointerId !== undefined && input.element.hasPointerCapture?.(input.pointerId)) {
      try { input.element.releasePointerCapture(input.pointerId); } catch {}
    }
    paintTouch();
  }
  function reconcileFingers(e) {
    if (!e.touches) return;
    const active = new Set(Array.from(e.touches, t => 'touch-' + t.identifier));
    for (const [id, input] of touches) if (input.source === 'touch' && !active.has(id)) releaseContact(id);
  }
  function beginContact(element, id, point, source, begin, move, pointerId) {
    if (phase !== 'running' || [...touches.values()].some(q => q.element === element)) return false;
    const input = { element, source, pointerId, turn: 0, push: 0, brake: 0, x: 0, y: 0, baseX: 0, baseY: 0, move };
    touches.set(id, input);
    if (pointerId !== undefined) {
      try { element.setPointerCapture(pointerId); } catch { touches.delete(id); return false; }
    }
    begin(input, point); paintTouch(); return true;
  }
  function bindContact(element, begin, move) {
    element.addEventListener('touchstart', e => {
      for (const finger of e.changedTouches) {
        if (beginContact(element, 'touch-' + finger.identifier, finger, 'touch', begin, move)) e.preventDefault();
      }
    }, { passive: false });
    element.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      if (beginContact(element, 'pointer-' + e.pointerId, e, 'pointer', begin, move, e.pointerId)) e.preventDefault();
    });
    element.addEventListener('contextmenu', e => e.preventDefault());
  }
  const touchEvents = { capture: true, passive: false };
  window.addEventListener('touchstart', reconcileFingers, touchEvents);
  window.addEventListener('touchmove', e => {
    reconcileFingers(e);
    let handled = false;
    for (const finger of e.changedTouches) {
      const input = touches.get('touch-' + finger.identifier);
      if (input) { input.move?.(input, finger); handled = true; }
    }
    if (handled) { e.preventDefault(); paintTouch(); }
  }, touchEvents);
  for (const type of ['touchend', 'touchcancel']) window.addEventListener(type, e => {
    for (const finger of e.changedTouches) releaseContact('touch-' + finger.identifier);
    reconcileFingers(e);
  }, touchEvents);
  window.addEventListener('pointermove', e => {
    const id = 'pointer-' + e.pointerId, input = touches.get(id);
    if (!input) return;
    if (!e.buttons) { releaseContact(id); return; }
    input.move?.(input, e); e.preventDefault(); paintTouch();
  }, { capture: true, passive: false });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, e => releaseContact('pointer-' + e.pointerId), true);

  function moveStick(input, point) {
    const dx = point.clientX - input.originX, dy = point.clientY - input.originY;
    const length = Math.hypot(dx, dy), limit = length > input.travel ? input.travel / length : 1;
    input.x = dx * limit; input.y = dy * limit;
    const axis = value => Math.sign(value) * Math.max(0, (Math.abs(value) / input.travel - .12) / .88);
    input.turn = axis(input.x); input.push = axis(-input.y);
  }
  bindContact(stick, (input, point) => {
    const r = stick.getBoundingClientRect();
    // Freeze the gesture origin and travel. A new touch is neutral anywhere in
    // the large zone; layout changes cannot turn a held thumb into full force.
    Object.assign(input, { originX: point.clientX, originY: point.clientY, travel: r.width * .28,
      baseX: point.clientX - r.left - r.width / 2, baseY: point.clientY - r.top - r.height / 2 });
  }, moveStick);
  stick.addEventListener('keydown', e => {
    const direction = { ArrowLeft: ['turn', -1], ArrowRight: ['turn', 1], ArrowUp: ['push', 1], ArrowDown: ['push', -1] }[e.code];
    if (!direction || phase !== 'running') return;
    e.preventDefault(); e.stopPropagation();
    if ([...touches.values()].some(q => q.element === stick && !q.keyboard)) return;
    const input = touches.get('keyboard-stick') || { element: stick, keyboard: true, turn: 0, push: 0, brake: 0, baseX: 0, baseY: 0, x: 0, y: 0, held: new Set() };
    input.held.add(e.code); input[direction[0]] = clamp(input[direction[0]] + direction[1] * .1, -1, 1);
    input.x = input.turn * stick.clientWidth * .28; input.y = -input.push * stick.clientWidth * .28;
    touches.set('keyboard-stick', input); paintTouch();
  });
  stick.addEventListener('blur', () => releaseContact('keyboard-stick'));
  const brake = $('touch-brake');
  bindContact(brake, input => { input.brake = 1; });
  brake.addEventListener('keydown', e => {
    if (!['Space', 'Enter'].includes(e.code) || phase !== 'running') return;
    e.preventDefault(); e.stopPropagation();
    if (![...touches.values()].some(q => q.element === brake && !q.keyboard)) touches.set('keyboard-brake', { element: brake, keyboard: true, brake: 1 });
    paintTouch();
  });
  brake.addEventListener('blur', () => releaseContact('keyboard-brake'));
  window.addEventListener('keyup', e => {
    if (['Space', 'Enter'].includes(e.code)) releaseContact('keyboard-brake');
    const input = touches.get('keyboard-stick');
    if (!input || !input.held.delete(e.code)) return;
    if (!input.held.size) { releaseContact('keyboard-stick'); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') input.turn = input.held.has('ArrowLeft') ? -.1 : input.held.has('ArrowRight') ? .1 : 0;
    else input.push = input.held.has('ArrowUp') ? .1 : input.held.has('ArrowDown') ? -.1 : 0;
    input.x = input.turn * stick.clientWidth * .28; input.y = -input.push * stick.clientWidth * .28; paintTouch();
  }, true);
  const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || !game.contains(document.activeElement) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && e.target.closest('button')) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!$('picker').hidden) closePicker();
      else if (pseudoFullscreen) fullscreen();
      else if (phase === 'running') pause();
      else if (phase === 'paused') run();
      else if (phase === 'confirm') cancelRetry();
      return;
    }
    if (!$('picker').hidden) {
      if(e.code==='Tab'){
        const items=[...$('picker').querySelectorAll('button:not(:disabled)')],first=items[0],end=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();end.focus();}
        else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first.focus();}
      }
      return;
    }
    // Keep keyboard navigation inside the active dialog, including open options.
    if(e.code==='Tab'&&!$('overlay').hidden){
      const items=[...$('overlay').querySelectorAll('button, a[href], summary')].filter(q=>!q.disabled&&q.getClientRects().length);
      const first=items[0],end=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();end.focus();}
      else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first.focus();}
      return;
    }
    if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); phase === 'running' ? pause() : phase === 'paused' && run(); }
    if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); retry(); }
    if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); fullscreen(); }
    if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); toggleCamera(); }
    if (movement.has(e.code) && phase === 'running') { e.preventDefault(); keys.add(e.code); }
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { clearInput(); pause(); sound.stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); sound.stop(); } });
  window.addEventListener('pagehide', () => { pause(); save(); clearInput(); sound.stop(); });
  window.addEventListener('resize', () => { if (touches.size) clearInput(); });
  window.addEventListener('orientationchange', clearInput);
  window.addEventListener('pageshow', clearInput);
  window.visualViewport?.addEventListener('resize', clearInput);
  touchMode.addEventListener('change', clearInput);
  reducedMotion.addEventListener('change', () => { screenShake = 0; draw(); });
  refreshSound(); prepare(world,resumed);
  const viewResize = new ResizeObserver(resizeView);
  viewResize.observe($('stage')); viewResize.observe($('touch'));
  // Canvas text caches are rebuilt when the site's own mono font arrives.
  document.fonts.ready.then(() => { view.refreshFonts(); floor = makeFloor(world.level); draw(); });
})();
