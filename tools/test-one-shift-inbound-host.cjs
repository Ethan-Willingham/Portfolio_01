'use strict';
// Host lifecycle contract only. Native geometry, Unity startup and real browser
// interaction are verified separately against the exported player.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/one-shift-inbound-warehouse.js'), 'utf8');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.attributes = {}; this.dataset = {}; this.events = {};
    this.hidden = false; this.inert = false; this.disabled = false; this.open = false;
    this.className = ''; this.textContent = ''; this.rect = {width:800,height:600};
    this.classList = {toggle:(name,on) => {
      const names = new Set(this.className.split(/\s+/).filter(Boolean));
      if (on) names.add(name); else names.delete(name);
      this.className = [...names].join(' ');
    }};
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(node => node !== child);
    this.children.push(child); child.parentNode = this; return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  setAttribute(name,value) { this.attributes[name] = String(value); if (name === 'class') this.className = String(value); }
  addEventListener(name,listener) { (this.events[name] ||= []).push(listener); }
  dispatch(name,properties) { return dispatch(this.events,name,Object.assign({target:this},properties)); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  getBoundingClientRect() { return this.rect; }
  matches(selector) {
    if (selector[0] === '.') return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector[0] === '#') return this.attributes.id === selector.slice(1);
    return this.tagName.toLowerCase() === selector;
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/), output = [];
    function visit(node) {
      for (const child of node.children) {
        if (child.matches(parts.at(-1))) {
          let index = parts.length - 2, ancestor = child.parentNode;
          while (index >= 0 && ancestor) { if (ancestor.matches(parts[index])) index--; ancestor = ancestor.parentNode; }
          if (index < 0) output.push(child);
        }
        visit(child);
      }
    }
    visit(this); return output;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).textContent += token; continue; }
      const tag = /^<([\w-]+)/.exec(token)[1], node = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(match[1], match[2]);
      node.hidden = /\shidden(?:\s|>)/.test(token); node.disabled = /\sdisabled(?:\s|>)/.test(token);
      stack.at(-1).appendChild(node);
      if (!['input','br','img','hr','meta','link'].includes(tag)) stack.push(node);
    }
  }
}

function dispatch(listeners,name,properties = {}) {
  const event = Object.assign({type:name,target:{tagName:'BODY'},button:0,repeat:false,defaultPrevented:false,stopped:false,
    preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}},properties);
  for (const listener of listeners[name] || []) { listener(event); if(event.stopped)break; }
  return event;
}

function harness(options = {}) {
  const body = new Element('body'), app = body.appendChild(new Element('main'));
  app.setAttribute('id','inbound-app');
  const slot = app.appendChild(new Element('div'));
  let visible = true, subscriber, config, resolveGame, rejectGame;
  const events = {}, documentEvents = {}, logs = [], calls = [], scans = [], devices = [], notices = [], availability = [], coarseEvents = {};
  let reloads = 0, creates = 0, pauses = 0, resumes = 0, lockRequests = 0, menus = 0, help = 0, readyCalls = 0;
  let lockBehavior = 'success', physicalAtReceiving = true;
  const activity = {active:()=>visible,onChange(fn){subscriber=fn;fn(visible);}};
  const coarse = {matches:!!options.coarse,addEventListener(name,fn){coarseEvents[name]=fn;}};
  const scheduling = options.missingScheduling ? {} : {
    SetRefreshMonitorActive(value){calls.push({refresh:value});},
    pauseMainLoop(){pauses++;},resumeMainLoop(){resumes++;}
  };
  const game = {Module:scheduling,SendMessage(object,method,payload){
    const command = method === 'UICommand' ? JSON.parse(payload) : payload;
    calls.push({object,method,payload:command});
    if (method === 'UICommand' && command.action === 'inbound-report') acknowledge(undefined,{allDeliveredAtReceiving:physicalAtReceiving});
  }};
  const context = {
    console:{error(value){logs.push(value);}}, innerWidth:1000,innerHeight:600,
    document:{body,pointerLockElement:null,createElement:tag=>new Element(tag),getElementById:id=>body.querySelector('#'+id),querySelector:selector=>body.querySelector(selector),querySelectorAll:selector=>body.querySelectorAll(selector),
      addEventListener(name,fn){(documentEvents[name] ||= []).push(fn);},
      exitPointerLock(){context.document.pointerLockElement=null;dispatch(documentEvents,'pointerlockchange');}},
    window:{devicePixelRatio:1,matchMedia:()=>coarse,addEventListener(name,fn){(events[name] ||= []).push(fn);},location:{reload(){reloads++;}},DemoActivity:{create:()=>activity}}
  };
  context.window.createUnityInstance = (canvas,settings) => {
    creates++; config = settings;
    return new Promise((resolve,reject) => {resolveGame=resolve;rejectGame=reject;});
  };
  vm.runInNewContext(source,context,{filename:'one-shift-inbound-warehouse.js'});
  const api = context.window.InboundWarehouse;
  function state(id = 'basic',received = 0) { return {scenario:{id,channel:id === 'web' ? 'web' : id === 'asn' ? 'asn' : 'mobile'},received,damaged:0,receipts:[],remaining:4-received}; }
  function mount(value = state()) {
    api.mount(slot,value,{guide:{title:'Receive delivery',instruction:'Read its label'},onScan:code=>scans.push(code),onDevice:(open,computer)=>devices.push({open,computer}),
      onNotice:value=>notices.push(value),onAvailability:value=>availability.push(value),onReady(){readyCalls++;},onMenu(){menus++;},onHelp(){help++;}});
    body.querySelector('canvas').requestPointerLock = function () {
      lockRequests++;
      if (lockBehavior === 'reject') return Promise.reject(new Error('Capture rejected'));
      context.document.pointerLockElement=this;dispatch(documentEvents,'pointerlockchange');return Promise.resolve();
    };
  }
  function acknowledge(version = context.window.OneShiftShell.initialInboundState.syncVersion,extra = {}) {
    api.onSceneSynced(Object.assign({sceneReady:true,syncVersion:version,physicalUnits:4,good:0,damaged:0,lesson:context.window.OneShiftShell.initialInboundState.scenario.id,allDeliveredAtReceiving:physicalAtReceiving},extra));
  }
  function hud(value = {}) {
    config.onWarehouseHUD(Object.assign({holding:false,inbound:{scannerEquipped:true},computer:{open:false,transitioning:false}},value));
  }
  function resize(width,height) {
    context.innerWidth=width;context.innerHeight=height;
    for (const listener of events.resize || []) listener();
  }
  return {
    api,app,body,slot,calls,logs,scans,devices,notices,availability,game,mount,acknowledge,resize,state,hud,
    get stage(){return body.querySelector('.in-warehouse-stage');},
    get canvas(){return body.querySelector('canvas');},
    get loader(){return body.querySelector('script');},
    get config(){return config;},
    get creates(){return creates;},get pauses(){return pauses;},get resumes(){return resumes;},get reloads(){return reloads;},
    get lockRequests(){return lockRequests;},get locked(){return context.document.pointerLockElement===this.canvas;},
    get menus(){return menus;},get help(){return help;},get readyCalls(){return readyCalls;},
    get version(){return context.window.OneShiftShell.initialInboundState.syncVersion;},
    commands(action){return calls.filter(call=>call.method==='UICommand'&&call.payload.action===action).map(call=>call.payload.value);},
    key(name,code,extra){return dispatch(events,name,Object.assign({code},extra));},
    lockMode(value){lockBehavior=value;},
    physical(value){physicalAtReceiving=value;},
    blur(){visible=false;subscriber(false);dispatch(events,'blur');},
    visible(value){visible=value;subscriber(value);},
    load(){this.loader.onload();},resolve(){resolveGame(game);},reject(reason){rejectGame(reason);}
  };
}
const turn = () => new Promise(resolve=>setImmediate(resolve));
async function ready(options) {
  const env = harness(options); env.mount(); env.load(); env.resolve(); await turn();
  env.config.onOneShiftPreparation(1,1,1); env.acknowledge();
  env.hud();assert.equal(env.api.ready(),true); return env;
}
let checks = 0, failures = 0;
async function check(name,test) { try { await test(); checks++; console.log('PASS '+name); } catch(error) { failures++; console.error('FAIL '+name+'\n'+error.stack); } }

(async function () {
  await check('startup requires the player, prepared graphics and current scene acknowledgement',async()=>{
    const env = harness(); env.mount(); assert.equal(env.availability.at(-1),false);
    env.load(); env.acknowledge();
    assert.equal(env.api.ready(),false,'an initial native callback may arrive before the player resolves');
    env.resolve(); await turn();
    assert.equal(env.api.ready(),false,'scene acknowledgement alone does not mean graphics are ready');
    env.config.onOneShiftPreparation(1,1,1);
    assert.equal(env.api.ready(),true);assert.equal(env.readyCalls,1);assert.equal(env.lockRequests,0,'download callbacks do not capture the mouse');
  });
  await check('a changed receipt waits for its own acknowledgement and rejects stale readiness',async()=>{
    const env = await ready(); const oldVersion = env.version;
    env.api.update(env.state('basic',1));
    assert.equal(env.availability.at(-1),false);assert.equal(env.stage.dataset.ready,'false');
    env.acknowledge(oldVersion);
    assert.equal(env.api.ready(),false);
    env.acknowledge();
    assert.equal(env.availability.at(-1),true);assert.equal(env.stage.dataset.ready,'true');
  });
  await check('the first floor click captures the mouse without scanning',async()=>{
    const env = await ready();env.canvas.dispatch('mousedown',{button:0});
    assert.equal(env.lockRequests,1);assert.equal(env.locked,true);assert.deepEqual(env.commands('device-trigger'),[]);
    env.canvas.dispatch('mousedown',{button:0});assert.deepEqual(env.commands('device-trigger'),['1']);
  });
  await check('F scans once on the captured floor and stays inactive in interfaces or text fields',async()=>{
    const env = await ready();env.key('keydown','KeyF');
    assert.equal(env.commands('device-scan').length,0,'an unlocked floor must not scan');
    env.api.play();assert.equal(env.key('keydown','KeyF').defaultPrevented,true);
    assert.equal(env.commands('device-scan').length,1,'a captured floor sends one native scan command');
    env.key('keydown','KeyF',{repeat:true});
    for (const tagName of ['INPUT','TEXTAREA','SELECT']) env.key('keydown','KeyF',{target:{tagName}});
    assert.equal(env.commands('device-scan').length,1,'held keys and text entry must not scan');
    env.api.openDevice();env.key('keydown','KeyF');
    env.api.closeDevice(true);env.api.setModal(true);env.key('keydown','KeyF');
    env.api.setModal(false);env.key('keydown','KeyF');
    assert.equal(env.commands('device-scan').length,1,'closing a modal does not bypass a fresh pointer capture');
    env.api.play();env.hud({computer:{open:true,transitioning:false}});env.key('keydown','KeyF');
    assert.equal(env.commands('device-scan').length,1,'the office interface must not scan');
    env.api.closeDevice(true);env.hud();env.key('keydown','KeyF');
    assert.equal(env.commands('device-scan').length,2,'a fresh floor key press scans again after returning');
  });
  await check('a rejected mouse capture leaves a fresh click available',async()=>{
    const env = await ready();env.lockMode('reject');env.api.play();await turn();
    assert.equal(env.locked,false);assert.equal(env.stage.querySelector('.in-warehouse-gate').hidden,false);
    env.lockMode('success');env.canvas.dispatch('mousedown',{button:0});
    assert.equal(env.locked,true);assert.equal(env.lockRequests,2);assert.deepEqual(env.commands('device-trigger'),[]);
  });
  await check('modal, portrait, blur and offscreen suspension release a held scanner trigger',async()=>{
    for (const stop of [env=>env.api.setModal(true),env=>env.resize(600,1000),env=>env.blur(),env=>env.visible(false)]) {
      const env = await ready({coarse:true});env.api.play();env.canvas.dispatch('mousedown',{button:0});
      assert.equal(env.commands('device-trigger').at(-1),'1');stop(env);
      assert.equal(env.commands('device-trigger').at(-1),'0');assert.equal(env.locked,false);assert.ok(env.pauses>0);
      env.api.onScan('TAPE-48');assert.equal(env.scans.length,0);
    }
  });
  await check('returning to landscape does not dismiss the manual pause modal',async()=>{
    const env = await ready({coarse:true});env.api.play();env.api.setModal(true);
    env.resize(600,1000);assert.equal(env.app.inert,true);
    env.resize(1000,600);assert.equal(env.app.inert,false);assert.equal(env.availability.at(-1),false);
    const locks=env.lockRequests;env.api.play();assert.equal(env.lockRequests,locks);
    env.api.setModal(false);assert.equal(env.availability.at(-1),true);assert.equal(env.locked,false);
    env.api.play();assert.equal(env.locked,true);
  });
  await check('portrait blocks an open handheld and restores its transaction access after rotation',async()=>{
    const env = await ready({coarse:true});const handheld=env.app.appendChild(new Element('dialog'));
    env.api.play();env.api.openDevice();handheld.showModal();
    assert.equal(env.api.checkReceiving(),true);assert.equal(handheld.inert,false);
    env.resize(600,1000);
    const rotation=env.body.querySelector('.in-orientation-gate');
    assert.ok(rotation,'portrait must show a rotation dialog');
    assert.equal(rotation.open,true);assert.equal(handheld.open,true);assert.equal(handheld.inert,true);
    assert.equal(env.api.ready(),false);assert.equal(env.api.checkReceiving(),false);assert.equal(env.locked,false);
    const lockRequests=env.lockRequests;env.resize(1000,600);
    assert.equal(rotation.open,false);assert.equal(handheld.open,true);assert.equal(handheld.inert,false);
    assert.equal(env.api.ready(),true);assert.equal(env.api.checkReceiving(),true);
    assert.equal(env.lockRequests,lockRequests,'returning to landscape retains device inspection without recapturing');
  });
  await check('the TC22 opens on demand, releases scan input and returns through a trusted capture',async()=>{
    const env = await ready();assert.deepEqual(env.devices,[]);env.api.play();env.canvas.dispatch('mousedown',{button:0});
    env.api.openDevice();assert.deepEqual(env.devices,[{open:true,computer:false}]);
    assert.equal(env.commands('device-trigger').at(-1),'0');assert.equal(env.commands('device-focus').at(-1),'1');assert.equal(env.locked,false);
    assert.equal(env.stage.dataset.interface,'scanner');env.api.closeDevice(true);
    assert.deepEqual(env.devices.at(-1),{open:false,computer:false});assert.equal(env.commands('device-focus').at(-1),'0');
    assert.equal(env.locked,true);assert.equal(env.stage.dataset.interface,'floor');
  });
  await check('holding a carton reserves right-click for rotation instead of scanner inspection',async()=>{
    const env = await ready();env.api.play();env.hud({holding:true});env.canvas.dispatch('mousedown',{button:2});
    assert.equal(env.devices.length,0);env.hud();env.key('keydown','KeyE');env.canvas.dispatch('mousedown',{button:2});
    assert.equal(env.devices.length,0);env.key('keyup','KeyE');env.canvas.dispatch('mousedown',{button:2});assert.equal(env.devices.length,1);
  });
  await check('office camera transitions keep rendering and never request a second lock at their endpoint',async()=>{
    const env = await ready();env.api.play();const initialPauses=env.pauses;
    env.hud({computer:{open:false,transitioning:true}});assert.equal(env.pauses,initialPauses);
    env.api.openDevice();assert.equal(env.devices.length,0);
    env.hud({computer:{open:true,transitioning:false}});assert.deepEqual(env.devices.at(-1),{open:true,computer:true});assert.equal(env.locked,false);
    env.api.closeDevice(true);assert.equal(env.commands('computer-close').length,1);const locks=env.lockRequests;
    env.hud({computer:{open:false,transitioning:true}});assert.equal(env.pauses,initialPauses);
    env.hud();assert.equal(env.lockRequests,locks);assert.equal(env.stage.dataset.interface,'floor');
  });
  await check('physical receipt preflight uses a fresh native report and rejects carried or displaced delivery',async()=>{
    const env = await ready();assert.equal(env.api.checkReceiving(),true);
    env.physical(false);assert.equal(env.api.checkReceiving(),false,'fresh physical report replaces previously valid state');
    env.physical(true);env.hud({holding:true});assert.equal(env.api.checkReceiving(),false);
    env.hud();assert.equal(env.api.checkReceiving(),true);assert.equal(env.commands('inbound-report').length,4);
  });
  await check('Escape opens the menu once per key cycle, including browser-reserved keydown',async()=>{
    const env = await ready();env.api.play();env.key('keydown','Escape');env.key('keydown','Escape',{repeat:true});env.key('keyup','Escape');
    assert.equal(env.menus,1,'holding Escape must not repeatedly toggle the menu');
    env.key('keyup','Escape');assert.equal(env.menus,2,'a browser-reserved keydown still needs its keyup fallback');
  });
  await check('parking and changing lessons reuse one loader and one player',async()=>{
    const env = await ready();env.api.park();
    assert.equal(env.stage.hidden,true);assert.equal(env.api.ready(),false);
    env.mount(env.state('lot'));assert.equal(env.api.ready(),false);env.acknowledge();
    assert.equal(env.stage.hidden,false);assert.equal(env.api.ready(),true);
    env.api.park();env.mount(env.state('serial'));env.acknowledge();
    assert.equal(env.creates,1);assert.equal(env.body.querySelectorAll('script').length,1);
  });
  await check('loader failure offers a real reload and leaves actions unavailable',async()=>{
    const env = harness();env.mount();env.loader.onerror();
    assert.equal(env.availability.at(-1),false);assert.equal(env.stage.dataset.ready,'false');
    const link=env.stage.querySelector('.in-warehouse-loading a');assert.equal(link.hidden,false);
    assert.equal(link.dispatch('click').defaultPrevented,true);assert.equal(env.reloads,1);
  });
  await check('a running-player error clears readiness and stops rendering',async()=>{
    const env = await ready();const priorPauses=env.pauses;
    env.config.showBanner('Graphics context unavailable','error');
    assert.equal(env.api.ready(),false);assert.equal(env.stage.dataset.ready,'false');
    assert.equal(env.availability.at(-1),false);assert.ok(env.pauses>priorPauses);
  });
  await check('missing scheduling controls are reported without recursively calling them',async()=>{
    const env = harness({missingScheduling:true});env.mount();env.load();env.resolve();await turn();
    assert.equal(env.availability.at(-1),false);assert.equal(env.stage.dataset.ready,'false');
    assert.match(env.stage.querySelector('.in-load-detail').textContent,/activity controls could not start/);
    assert.equal(env.logs.length,0,'the capability failure must not throw a second error');
    env.visible(false);env.visible(true);
  });
  console.log(checks+' inbound host checks passed; '+failures+' failed.');
  if (failures) process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
