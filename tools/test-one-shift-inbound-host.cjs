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
    this.tagName = tag; this.children = []; this.parentNode = null;
    this.attributes = {}; this.dataset = {}; this.events = {};
    this.hidden = false; this.inert = false; this.disabled = false;
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
  dispatch(name) {
    const event = {defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
    for (const listener of this.events[name] || []) listener(event);
    return event;
  }
  focus() { this.focused = true; }
  getBoundingClientRect() { return this.rect; }
  matches(selector) {
    if (selector[0] === '.') return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector[0] === '#') return this.attributes.id === selector.slice(1);
    return this.tagName === selector;
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

function harness(options = {}) {
  const body = new Element('body'), app = body.appendChild(new Element('main'));
  app.setAttribute('id','inbound-app');
  const task = app.appendChild(new Element('article')); task.className = 'in-task';
  const slot = app.appendChild(new Element('div'));
  let visible = true, subscriber, config, resolveGame, rejectGame;
  const events = {}, logs = [], calls = [], scans = [], coarseEvents = {};
  let reloads = 0, creates = 0, pauses = 0, resumes = 0;
  const activity = {active:()=>visible,onChange(fn){subscriber=fn;fn(visible);}};
  const coarse = {matches:!!options.coarse,addEventListener(name,fn){coarseEvents[name]=fn;}};
  const scheduling = options.missingScheduling ? {} : {
    SetRefreshMonitorActive(value){calls.push({refresh:value});},
    pauseMainLoop(){pauses++;},resumeMainLoop(){resumes++;}
  };
  const game = {Module:scheduling,SendMessage(object,method,payload){
    calls.push({object,method,payload:method === 'UICommand' ? JSON.parse(payload) : payload});
  }};
  const context = {
    console:{error(value){logs.push(value);}}, innerWidth:1000,innerHeight:600,
    document:{body,createElement:tag=>new Element(tag),getElementById:id=>body.querySelector('#'+id),querySelector:selector=>body.querySelector(selector)},
    window:{devicePixelRatio:1,matchMedia:()=>coarse,addEventListener(name,fn){(events[name] ||= []).push(fn);},location:{reload(){reloads++;}},DemoActivity:{create:()=>activity}}
  };
  context.window.createUnityInstance = (canvas,settings) => {
    creates++; config = settings;
    return new Promise((resolve,reject) => {resolveGame=resolve;rejectGame=reject;});
  };
  vm.runInNewContext(source,context,{filename:'one-shift-inbound-warehouse.js'});
  const api = context.window.InboundWarehouse;
  function state(id = 'basic',received = 0) { return {scenario:{id},received,damaged:0,receipts:[],remaining:4-received}; }
  function mount(value = state()) { api.mount(slot,value,{onScan:code=>scans.push(code)}); }
  function acknowledge(version = context.window.OneShiftShell.initialInboundState.syncVersion) {
    api.onSceneSynced({sceneReady:true,syncVersion:version,physicalUnits:4,good:0,damaged:0,lesson:'basic'});
  }
  function resize(width,height) {
    context.innerWidth=width;context.innerHeight=height;
    for (const listener of events.resize || []) listener();
  }
  return {
    api,task,app,body,slot,calls,logs,scans,game,mount,acknowledge,resize,state,
    get stage(){return body.querySelector('.in-warehouse-stage');},
    get loader(){return body.querySelector('script');},
    get config(){return config;},
    get creates(){return creates;},get pauses(){return pauses;},get resumes(){return resumes;},get reloads(){return reloads;},
    get version(){return context.window.OneShiftShell.initialInboundState.syncVersion;},
    visible(value){visible=value;subscriber(value);},
    load(){this.loader.onload();},resolve(){resolveGame(game);},reject(reason){rejectGame(reason);}
  };
}
const turn = () => new Promise(resolve=>setImmediate(resolve));
async function ready(options) {
  const env = harness(options); env.mount(); env.load(); env.resolve(); await turn();
  env.config.onOneShiftPreparation(1,1,1); env.acknowledge();
  assert.equal(env.api.ready(),true); return env;
}
let checks = 0;
async function check(name,test) { await test(); checks++; console.log('PASS '+name); }

(async function () {
  await check('startup requires the player, prepared graphics and current scene acknowledgement',async()=>{
    const env = harness(); env.mount(); assert.equal(env.task.inert,true);
    env.load(); env.acknowledge();
    assert.equal(env.api.ready(),false,'an initial native callback may arrive before the player resolves');
    env.resolve(); await turn();
    assert.equal(env.task.inert,true,'scene acknowledgement alone does not mean graphics are ready');
    env.config.onOneShiftPreparation(1,1,1);
    assert.equal(env.api.ready(),true);assert.equal(env.task.inert,false);
  });
  await check('a changed receipt waits for its own acknowledgement and rejects stale readiness',async()=>{
    const env = await ready(); const oldVersion = env.version;
    env.mount(env.state('basic',1));
    assert.equal(env.task.inert,true);assert.equal(env.stage.dataset.ready,'false');
    env.acknowledge(oldVersion);
    assert.equal(env.task.inert,true);assert.equal(env.api.ready(),false);
    env.acknowledge();
    assert.equal(env.task.inert,false);assert.equal(env.stage.dataset.ready,'true');
  });
  await check('manual pause has a reachable resume action inside its overlay',async()=>{
    const env = await ready();
    env.stage.querySelector('.in-warehouse-controls button').dispatch('click');
    assert.equal(env.task.inert,true);assert.equal(env.api.ready(),false);
    const gate=env.stage.querySelector('.in-warehouse-gate');assert.equal(gate.hidden,false);
    assert.equal(gate.querySelector('button').textContent,'Resume warehouse');
    gate.querySelector('button').dispatch('click');
    assert.equal(env.task.inert,false);assert.equal(gate.hidden,true);
    assert.ok(env.pauses>0 && env.resumes>0);
  });
  await check('offscreen rendering stops while the visible receipt form remains usable',async()=>{
    const env = await ready(); const priorPauses=env.pauses;
    env.visible(false);
    assert.ok(env.pauses>priorPauses);assert.equal(env.task.inert,false);
    env.api.onScan('TAPE-48');assert.equal(env.scans.length,0,'inactive native scene cannot scan');
    env.api.setModal(true);assert.equal(env.task.inert,true);
    env.api.setModal(false);assert.equal(env.task.inert,false);
    env.mount(env.state('basic',1));assert.equal(env.task.inert,true);
    env.acknowledge();assert.equal(env.task.inert,false,'offscreen receipt acknowledgements remain usable');
    const priorResumes=env.resumes;env.visible(true);
    assert.ok(env.resumes>priorResumes);env.api.onScan('TAPE-48');assert.deepEqual(env.scans,['TAPE-48']);
  });
  await check('portrait on a coarse pointer gates interaction and landscape preserves manual pause',async()=>{
    const env = await ready({coarse:true});
    env.resize(600,1000);
    assert.equal(env.app.inert,true);assert.equal(env.task.inert,true);
    assert.equal(env.body.querySelector('.in-orientation-gate').hidden,false);
    env.resize(1000,600);assert.equal(env.app.inert,false);assert.equal(env.api.ready(),true);
    env.stage.querySelector('.in-warehouse-controls button').dispatch('click');
    env.resize(600,1000);env.resize(1000,600);
    assert.equal(env.app.inert,false);assert.equal(env.task.inert,true);
    assert.equal(env.api.ready(),false,'rotating never undoes a deliberate pause');
    env.stage.querySelector('.in-warehouse-gate button').dispatch('click');assert.equal(env.api.ready(),true);
  });
  await check('parking and changing lessons reuse one loader and one player',async()=>{
    const env = await ready();env.api.park();
    assert.equal(env.stage.hidden,true);assert.equal(env.api.ready(),false);
    env.mount(env.state('lot'));assert.equal(env.task.inert,true);env.acknowledge();
    assert.equal(env.stage.hidden,false);assert.equal(env.api.ready(),true);
    env.api.park();env.mount(env.state('serial'));env.acknowledge();
    assert.equal(env.creates,1);assert.equal(env.body.querySelectorAll('script').length,1);
  });
  await check('loader failure offers a real reload and leaves actions unavailable',async()=>{
    const env = harness();env.mount();env.loader.onerror();
    assert.equal(env.task.inert,true);assert.equal(env.stage.dataset.ready,'false');
    const link=env.stage.querySelector('.in-warehouse-loading a');assert.equal(link.hidden,false);
    assert.equal(link.dispatch('click').defaultPrevented,true);assert.equal(env.reloads,1);
  });
  await check('a running-player error clears readiness and stops rendering',async()=>{
    const env = await ready();const priorPauses=env.pauses;
    env.config.showBanner('Graphics context unavailable','error');
    assert.equal(env.api.ready(),false);assert.equal(env.stage.dataset.ready,'false');
    assert.equal(env.task.inert,true);assert.ok(env.pauses>priorPauses);
    assert.equal(env.stage.querySelector('.in-warehouse-controls button').disabled,true);
  });
  await check('missing scheduling controls are reported without recursively calling them',async()=>{
    const env = harness({missingScheduling:true});env.mount();env.load();env.resolve();await turn();
    assert.equal(env.task.inert,true);assert.equal(env.stage.dataset.ready,'false');
    assert.match(env.stage.querySelector('.in-load-detail').textContent,/activity controls could not start/);
    assert.equal(env.logs.length,0,'the capability failure must not throw a second error');
    env.visible(false);env.visible(true);
  });
  console.log(checks+' inbound host checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
