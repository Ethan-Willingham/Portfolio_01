// Focused live performance panel checks in one hidden, owned testing browser.
// Evidence stays in /tmp. No display-rate or GPU-performance certification.
// DRY_RUN=1 validates the private local test hook without launching a browser.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createLiveIssueFixture,runLiveIssueChecks} from './test-live-issues.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.env.DUMP || '/tmp/sluice-live-panel-' + Date.now());
assert(out.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) || out.startsWith('/tmp/'), 'Evidence must stay in the temporary directory');
fs.mkdirSync(out, {recursive: true});
function boundedHistoryUnit() {
  const fixture=createLiveIssueFixture(),context=fixture.context;
  context.liquidWGPU=null;
  for(let frame=1;frame<=9000;frame++) {
    const now=frame*1000/120;fixture.setNow(now);
    context.perfLiveBegin();
    if(frame===360) {
      context.perfLive.gpu.push({frameId:360,name:'test.retained.gpu',at:now,ms:2,passes:[]});
      context.perfLive.workload.push({frameId:360,at:now,atMs:now,completedAtMs:now,valid:true});
    }
    context.perfLiveFrame(now,frame===361?250:1000/120,frame===360?200:1,0);
    if(frame===361)context.perfLivePin();
  }
  const status=context.perfLiveStatus(), capture=context.perfLiveCapture();
  assert(status.pinned&&status.worst.kind==='gap'&&status.worst.previous.cpuMs===200,'Pinned preceding CPU frame survives more than 30 seconds and circular-buffer wrap');
  assert.equal(status.worst.reference.cpuMs,1,'Prior-second baseline excludes the selected preceding hitch');
  assert(status.worst.gpu?.some(row=>row.frameId===360&&row.name==='test.retained.gpu'),'Automatic worst attaches GPU samples already retained before the gap callback');
  assert.equal(status.worst.workload?.frameId,360,'Automatic worst attaches already retained workload for selected CPU frame');
  assert(capture.durationMs<=30001&&capture.durationMs>29000,'History retains a bounded 30 seconds');
  assert(capture.frameCount<=3601&&capture.frameCount>3500,'History trims by time rather than total frame count');
  assert(capture.frameChunks.flat().length===capture.frameCount*capture.stride,'All retained packed rows export');
  assert.equal(context.perfLive.data.length,context.perfLive.capacity*context.perfLiveStride,'Capture storage remains bounded');
  const before=status.frameId;
  context.diagnosticOn=false;context.perfLiveBegin();
  assert(!context.perfLiveStatus().enabled&&context.perfLiveStatus().frameId===before+1,'Disabled diagnostics keep global IDs advancing');
  context.diagnosticOn=true;context.perfLiveBegin();
  assert.equal(context.perfLiveStatus().frames,0,'Re-enabling starts a clean rolling window');
  return {checks:10,simulatedSeconds:75,pinnedHistoryEviction:true,referenceExcludesHitch:true,retainedGPUAttachment:true};
}
const unit=boundedHistoryUnit();
function autoStartUnit() {
  const source=fs.readFileSync(root+'/js/sluice/021-performance-recording.js','utf8');
  const start=source.indexOf('  function playPerfFrame(time, interval, cpu, view) {');
  const end=source.indexOf('\n  window.__sluicePerformance =',start);
  assert(start>=0&&end>start,'Actual recording frame handler is available');
  const context=vm.createContext({playPerfActive:false,playPerfAuto:true,introPhase:'warmup',perfLiveFrame:()=>{}});
  context.playPerfStart=()=>{
    if(context.introPhase!=='done')return false;
    context.playPerfActive=true;return true;
  };
  vm.runInContext(source.slice(start,end),context);
  context.playPerfFrame(1,16,1,3);context.playPerfFrame(2,16,1,3);
  assert(context.playPerfAuto&&!context.playPerfActive,'Loading callbacks retain requested auto-start');
  context.introPhase='done';context.playPerfFrame(3,16,1,0);
  assert(context.playPerfActive,'Auto-start succeeds once ordinary play becomes available');
  assert(!context.playPerfAuto,'Auto-start request clears only after success');
  return {checks:3,loadingGate:true};
}
const autoUnit=autoStartUnit();
const issueUnit=runLiveIssueChecks();
function presentationUnit() {
  const css=fs.readFileSync(root+'/sluice-menu.css','utf8');
  const local=css.slice(css.indexOf('#gm-perf-panel {'),css.indexOf('\n#gm-perf-recorder {'));
  assert(local&&!/var\(--d-/.test(local),'Performance panel palette is independent of article tokens');
  const html=fs.readFileSync(root+'/grand-motherload.html','utf8');
  const panel=html.slice(html.indexOf('<aside id="gm-perf-panel"'),html.indexOf('<pre id="gm-perf-diagnostics-live"'));
  assert(!panel.includes('id="gm-perf-pin"'),'Issue journal replaces the UI Pin control');
  assert(panel.indexOf('id="gm-perf-graph"')>panel.indexOf('id="gm-perf-detail-body"'),'Raw timing graph belongs to technical Details');
  assert(panel.indexOf('id="gm-perf-inspection-evidence"')>panel.indexOf('id="gm-perf-detail-body"'),'Recorded technical evidence belongs to Details');
  return {checks:4,localGamePalette:true,technicalDetailsOnly:true};
}
const presentation=presentationUnit();
const original = fs.readFileSync(root + '/js/sluice.js', 'utf8');
const end = original.lastIndexOf('})();');
assert(end > 0, 'Unique game closure is available');
const hook = `
  window.__livePanelTest = {
    ready: function () { return introPhase === 'done' && !gamePhysicsBlocked; },
    state: function () { return {dev:devMode, paused:gamePaused, blocked:mobileLandscapeBlocked,
      raf:!!gameRafId, frameId:window.__sluicePerformance.frameId}; },
    dev: function (on) { setDevMode(on); },
    details: function () { return perfLive.details; },
    held: function () { return {w:!!keys.w, space:!!keys[' ']}; },
    pauseEnabled: function (on) { PAUSE_DISABLED = !on; },
    rollingSaving: function () { return perfLive.saving; },
    issues: function () { return perfLiveIssueList(); },
    selected: function () { return perfLiveGetSelectedIssue(); },
    clearIssues: function () { perfLiveClearIssues(); if(typeof perfPanelPaint==='function')perfPanelPaint(); },
    journalCPU: function (name, ms) {
      // Synthetic diagnostic input for keyed DOM focus checks only. Uses the
      // actual journal implementation and does not change physics or timing.
      var snapshot=perfLiveSnapshot(), raw={};raw[name]=ms;
      var current=Object.assign({},snapshot,{cpuMs:ms,buckets:raw,phases:perfLivePhases(raw,ms)});
      var event={kind:'cpu',frameId:current.frameId,at:current.atMs,severity:ms,gapMs:null,
        current:current,previous:null,reference:perfLiveReference(current.atMs)};
      var issue=perfLiveRememberIssue(event);perfPanelPaint();return issue.id;
    },
    journalGPU: function (cpu, ms) {
      // Synthetic simultaneous CPU/GPU evidence isolates inspector attribution.
      var snapshot=perfLiveSnapshot(), raw={'update.jello':cpu};
      var current=Object.assign({},snapshot,{cpuMs:cpu,buckets:raw,phases:perfLivePhases(raw,cpu)});
      var row={name:'liquid.frame',frameId:current.frameId,at:current.atMs,ms:ms,partial:false,
        passes:[{name:'snow.contacts',ms:ms,emptyTimestamp:false}]};
      var event={kind:'gpu',frameId:current.frameId,at:current.atMs,severity:Math.max(cpu,ms),gapMs:null,
        current:current,previous:null,reference:perfLiveReference(current.atMs),gpu:[row],sourceGPU:row.name};
      var issue=perfLiveRememberIssue(event);perfPanelPaint();return issue.id;
    },
    phases: function (raw, cpu) { return perfLivePhases(raw, cpu); },
    stall: function (ms, frames) {
      var previous = update, left = frames;
      update = function (dt) {
        previous(dt);
        if (left-- > 0) { var until = performance.now() + ms; while (performance.now() < until) {} }
        if (left <= 0) update = previous;
      };
    },
    manualGPU: function () { return playPerfTrace ? playPerfTrace.gpu : []; },
    mockGPU: function () {
      this.realGPU = window.__sluiceGPUTrace;
      var rows = [], active = false;
      window.__sluiceGPUTrace = {
        setActive:function(on){active=!!on;},
        drain:function(){var result=rows;rows=[];return result;},
        status:function(){return {active:active,supported:true,pending:0,skipped:0,errors:[],sampleIntervalMs:1000};}
      };
      this.pushGPU = function () {
        var at = performance.now(), id = window.__sluicePerformance.frameId;
        rows.push({name:'test.live-panel.gpu',at:at,submittedAt:at,completedAt:at,frameId:id,
          ms:1.5,spanMs:1.5,partial:false,invalid:false,skippedPasses:0,
          passes:[{name:'test.live-panel.pass',ms:1.5,beginNs:0,endNs:1500000}]});
        return id;
      };
    },
    restoreGPU: function () { if(this.realGPU){window.__sluiceGPUTrace=this.realGPU;delete this.realGPU;} },
    manual: function () { return {active:playPerfActive,saving:playPerfSaving,frames:playPerfTrace?playPerfTrace.frameCount:0}; }
  };
`;
const bundle = original.slice(0, end) + hook + original.slice(end);
new vm.Script(bundle);
if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify({passed:true,dryRun:true,privateHookParses:true,browserLaunched:false,unit,autoUnit,issueUnit,presentation}));
  process.exit(0);
}
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2',
  '.woff':'font/woff','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.m4a':'audio/mp4'};
const server = http.createServer((req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const content = name === '/js/sluice.js' ? bundle : fs.readFileSync(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(content);
  } catch { res.writeHead(404).end(); }
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-live-panel-browser-'));
let chrome, socket, id = 0, evaluationTail = Promise.resolve();
const pending = new Map(), errors = [], checks = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let interrupted = null;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  interrupted = Error('Live panel check interrupted by ' + signal);
  for (const request of pending.values()) request.reject(interrupted);
  pending.clear();
  if (chrome?.exitCode === null) chrome.kill('SIGTERM');
});
function send(method, params = {}, timeout = 30000) {
  if (interrupted && method !== 'Browser.close') throw interrupted;
  assert(socket?.readyState === WebSocket.OPEN, 'Owned browser connection open');
  return new Promise((resolve,reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error('CDP timeout: ' + method)); }, timeout);
    pending.set(n, {resolve:result => { clearTimeout(timer); resolve(result); },reject:error => {clearTimeout(timer); reject(error);}});
    socket.send(JSON.stringify({id:n,method,params}));
  });
}
function evaluate(expression) {
  const task = evaluationTail.then(async () => {
    const result = await send('Runtime.evaluate', {expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  });
  evaluationTail = task.catch(() => {});
  return task;
}
async function until(expression, description, limit = 90000) {
  const deadline = performance.now() + limit;
  for (;;) {
    const bootError = await evaluate('window.__bootErr||null');
    assert(!bootError, 'Game boots without error: ' + bootError);
    if (await evaluate(expression)) return;
    if (performance.now() >= deadline) {
      const diagnostic = await evaluate('({body:document.body.innerText.slice(-4000),test:window.__livePanelTest?.state(),live:window.__sluicePerformance?.liveStatus?.()})');
      throw Error(description + ': ' + JSON.stringify(diagnostic));
    }
    await sleep(100);
  }
}
function check(name, value, message = name) { assert(value, message); checks.push(name); }
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot');
  fs.writeFileSync(out + '/' + name + '.png', Buffer.from(shot.data,'base64'));
}
async function click(selector) {
  const point = await evaluate(`(()=>{var node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'nearest',inline:'nearest'});var r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
}
async function f9() {
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F9',code:'F9',windowsVirtualKeyCode:120});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F9',code:'F9',windowsVirtualKeyCode:120});
}
async function downloaded(prefix) {
  const deadline=performance.now()+10000;
  while(performance.now()<deadline) {
    for(const file of fs.readdirSync(out+'/downloads').filter(file=>file.startsWith(prefix)&&file.endsWith('.json'))) {
      try {return {file,capture:JSON.parse(fs.readFileSync(out+'/downloads/'+file,'utf8'))};}catch{}
    }
    await sleep(100);
  }
  throw Error('Owned download did not finish: '+prefix);
}
function captureClocks(capture) {
  const rows=capture.frameChunks.flat(), at=capture.columns.indexOf('atMs');
  assert.equal(rows.length,capture.frameCount*capture.stride,'Downloaded capture is complete');
  assert.equal(rows[at],0,'Packed frames start at relative zero');
  assert(Math.abs(rows[rows.length-capture.stride+at]-capture.durationMs)<1,'Last packed timestamp matches duration');
  for(const row of capture.gpu.concat(capture.events,capture.workload))
    assert(Number.isFinite(row.atMs)&&row.atMs>=-1&&row.atMs<=capture.durationMs+1,'Sample/event timestamps share relative capture clock');
  if(capture.slowdown&&!capture.slowdown.outsideHistory) {
    assert(capture.slowdown.atMs>=0&&capture.slowdown.atMs<=capture.durationMs+1,'Pinned slowdown timestamp is relative');
    for(const key of ['current','previous'])if(capture.slowdown[key]){
      const row=capture.slowdown[key];assert(row.atMs>=-1&&row.atMs<=capture.durationMs+1,'Pinned CPU frame timestamp is relative');
      assert(Number.isFinite(row.pageAtMs),'Pinned CPU frame also preserves original page timestamp');
    }
  }
  for(const issue of capture.issues.concat(capture.selectedIssue?[capture.selectedIssue]:[])) {
    assert(Number.isFinite(issue.atMs),'Session issue has a relative export timestamp');
    assert(issue.atMs>=0?issue.atMs<=capture.durationMs+1:issue.outsideHistory,'Historical issue is explicitly outside the rolling window');
    const event=issue.event;
    assert(event&&Number.isFinite(event.atMs),'Issue event has a relative export timestamp');
    for(const key of ['current','previous'])if(event[key]) {
      const row=event[key];assert(Number.isFinite(row.atMs)&&Number.isFinite(row.pageAtMs),'Issue CPU frames keep relative and original clocks');
    }
  }
}
async function viewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled', {enabled:mobile,maxTouchPoints:mobile?5:1});
  await send('Emulation.setUserAgentOverride', {userAgent:mobile?
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'});
}
async function navigate(dev, mobile = false, width = 1280, height = 800, autoRecord = false) {
  // The game only force-enables dev mode from its URL. Reset the owned test
  // profile through the real toggle before a requested normal-mode boot.
  if (!dev) await evaluate('if(window.__livePanelTest)__livePanelTest.dev(false)');
  await viewport(width,height,mobile);
  const port = server.address().port;
  await send('Page.navigate', {url:'http://127.0.0.1:' + port + '/grand-motherload.html?dev=' + (dev?'1':'0') + '&nosave=1&nopause=1&snow=1&gmpreset=smoke-default'+(autoRecord?'&perfrec=1':'')});
  await until('!!window.__livePanelTest&&__livePanelTest.ready()', 'Ordinary game reaches play');
}
async function fullscreen() {
  if (!await evaluate('document.body.classList.contains("gm-fs")')) {
    await click('#gm-fullscreen-btn');
    await until('document.body.classList.contains("gm-fs")', 'Fullscreen control enters game', 10000);
  }
}
async function layout() {
  return evaluate(`(()=>{
    var panel=document.getElementById('gm-perf-panel'), r=panel.getBoundingClientRect();
    var buttons=Array.from(panel.querySelectorAll('button')).filter(x=>!x.hidden&&x.getBoundingClientRect().height>0).map(x=>{
      var b=x.getBoundingClientRect();return {id:x.id,width:b.width,height:b.height,font:parseFloat(getComputedStyle(x).fontSize)};
    });
    var text=Array.from(panel.querySelectorAll('p,li,span,dt,dd,button,pre')).filter(x=>x.textContent.trim()&&x.getBoundingClientRect().height>0).map(x=>parseFloat(getComputedStyle(x).fontSize));
    var scrollRegions=[panel].concat(Array.from(panel.querySelectorAll('*'))).filter(x=>
      ['auto','scroll'].includes(getComputedStyle(x).overflowY)&&x.scrollHeight>x.clientHeight).map(x=>
        ({id:x.id,scrollHeight:x.scrollHeight,clientHeight:x.clientHeight}));
    return {width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom,
      viewport:[innerWidth,innerHeight],minFont:Math.min.apply(Math,text),buttons:buttons,
      overflowY:getComputedStyle(panel).overflowY,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,scrollRegions:scrollRegions};
  })()`);
}

try {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  chrome = spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'), [
    '--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows','--window-size=1280,800','--enable-unsafe-webgpu',
    '--use-angle=metal','--mute-audio','--no-first-run','--user-data-dir='+profile,
    '--remote-debugging-port=0','about:blank'], {stdio:'ignore'});
  let debugPort, target;
  for (let attempt=0;attempt<100;attempt++) {
    try {
      debugPort = Number(fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0]);
      target = (await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');
      if (target) break;
    } catch {}
    assert(chrome.exitCode === null, 'Owned testing browser stays alive');
    await sleep(100);
  }
  assert(target, 'Owned headless testing page found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);pending.delete(message.id);
      message.error ? request?.reject(Error(JSON.stringify(message.error))) : request?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
  };
  socket.onclose = () => {for(const request of pending.values())request.reject(Error('Owned CDP closed'));pending.clear();};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  fs.mkdirSync(out+'/downloads',{recursive:true});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out+'/downloads',eventsEnabled:true});
  await send('Network.setBlockedURLs',{urls:['*google-analytics.com*','*googletagmanager.com*']});
  await send('Page.addScriptToEvaluateOnNewDocument', {source:'let liveTestRandom=48271;Math.random=()=>((liveTestRandom=(Math.imul(liveTestRandom,1664525)+1013904223)>>>0)/4294967296);'});
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`
    (()=>{
      const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);
      const pending=new Set();window.__livePanelRAFs={max:0,pending:()=>pending.size};
      window.requestAnimationFrame=function(callback){
        let frame;const game=callback.name==='loop';
        frame=nativeRAF(function(time){if(game)pending.delete(frame);callback(time);});
        if(game){pending.add(frame);__livePanelRAFs.max=Math.max(__livePanelRAFs.max,pending.size);}
        return frame;
      };
      window.cancelAnimationFrame=function(frame){pending.delete(frame);nativeCancel(frame);};
    })();`});

  for(const dev of [false,true]) {
    await navigate(dev,false,1280,800,true);
    await until('__livePanelTest.manual().active&&__livePanelTest.manual().frames>0','Requested automatic recording starts after load',10000);
    const automatic=await evaluate('({recording:__sluicePerformance.status(),manual:__livePanelTest.manual(),live:__sluicePerformance.liveStatus()})');
    check('perfrec auto-start survives loading with dev '+(dev?'on':'off'),automatic.recording.recording&&automatic.manual.frames>0&&!automatic.recording.state.loading);
    check('Automatic recorder preserves requested dev state '+(dev?'on':'off'),automatic.live.enabled===dev);
    await evaluate('__sluicePerformance.stop()');
  }
  await navigate(false);
  await sleep(500);
  const ordinary = await evaluate('({state:__livePanelTest.state(),live:__sluicePerformance.liveStatus(),panel:document.getElementById("gm-perf-panel").hidden})');
  check('Normal play does not enable rolling observer', !ordinary.live.enabled && ordinary.panel);
  const normalId = ordinary.state.frameId;
  await sleep(100);
  check('Frame IDs advance outside manual recording', (await evaluate('__livePanelTest.state().frameId')) > normalId);
  await evaluate('__livePanelTest.dev(true)');
  await until('__sluicePerformance.liveStatus().enabled&&!document.getElementById("gm-perf-panel").hidden','Dev mode enables live panel',10000);
  await sleep(1200);
  await fullscreen();
  const firstCapture = await evaluate('__sluicePerformance.rollingCapture()');
  check('Dev mode retains rolling frame rows',firstCapture.frameCount>0&&firstCapture.frameChunks.length>0);
  const captureId = firstCapture.columns.indexOf('frameId');
  check('Rolling trace includes global frame IDs',captureId>=0);
  const rows = firstCapture.frameChunks.flat();
  check('Packed rolling capture row count',rows.length===firstCapture.frameCount*firstCapture.stride);
  for(let i=firstCapture.stride;i<rows.length;i+=firstCapture.stride)assert(rows[i+captureId]>rows[i-firstCapture.stride+captureId],'Global capture IDs are strictly increasing');
  checks.push('Rolling frame IDs are monotonic');
  const phaseRows = await evaluate('__livePanelTest.phases({"update.main":2,"update.jello":3,"jello.substepsAll":2.7,"jello.internal":1,"jello.contact":1.7,"update.rain":5,"snow.cpu":4,"render.total":8,"render.terrain":5,"render.tiles":3},18)');
  check('CPU phase selection excludes nested parent totals',!phaseRows.some(r=>['render.total','jello.substepsAll','jello.internal','jello.contact'].includes(r.name)));
  check('Snow phase subtracts from rain parent',phaseRows.find(r=>r.name==='snow.cpu')?.ms===4&&phaseRows.find(r=>r.name==='update.rain')?.ms===1);
  check('CPU phase selection retains independent player update',phaseRows.find(r=>r.name==='update.main')?.ms===2);
  check('Selected phases do not exceed measured CPU',phaseRows.reduce((sum,r)=>sum+r.ms,0)===18);
  fs.writeFileSync(out+'/first-capture.json',JSON.stringify(firstCapture));
  const reader = JSON.parse(execFileSync(process.execPath,[root+'/tools/perf/read-play-recording.mjs',out+'/first-capture.json'],{encoding:'utf8'}));
  check('Rolling export is compatible with existing trace reader',reader.frames===firstCapture.frameCount);
  const desktop = await layout();
  check('Desktop panel stays inside viewport',desktop.left>=0&&desktop.top>=0&&desktop.right<=1281&&desktop.bottom<=801);
  check('Desktop buttons have 44 pixel targets',desktop.buttons.length>=3&&desktop.buttons.every(b=>b.width>=44&&b.height>=44));
  check('Panel text stays readable',desktop.minFont>=11);
  check('Main view uses plain diagnosis and prose',await evaluate('!!document.getElementById("gm-perf-diagnosis").textContent&&!!document.getElementById("gm-perf-summary").textContent'));
  check('Raw graph and CPU evidence stay behind Details',await evaluate('document.getElementById("gm-perf-detail-body").hidden&&document.getElementById("gm-perf-graph").getBoundingClientRect().height===0&&document.getElementById("gm-perf-cpu").getBoundingClientRect().height===0'));
  check('Panel uses local game palette tokens',await evaluate('(()=>{var s=getComputedStyle(document.getElementById("gm-perf-panel"));return !!s.getPropertyValue("--perf-text").trim()&&!!s.getPropertyValue("--perf-panel").trim()})()'));
  await until('!!__sluicePerformance.liveStatus().workload?.valid','GPU counter readback becomes valid',15000);
  const counter = await evaluate('__sluicePerformance.liveStatus().workload');
  check('GPU counters retain sample frame ID',Number.isInteger(counter.frameId)&&counter.frameId>0&&Number.isFinite(counter.atMs));
  fs.writeFileSync(out+'/gpu-counter.json',JSON.stringify(counter));
  await screenshot('desktop');
  await evaluate('document.getElementById("game-canvas").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  await until('__livePanelTest.held().w','Game receives held key',5000);
  await evaluate('document.getElementById("gm-perf-details").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  check('Releasing held input over focused panel reaches game',!(await evaluate('__livePanelTest.held().w')));
  await evaluate('__livePanelTest.pauseEnabled(true)');
  await click('#gm-pause-btn');
  await until('__livePanelTest.state().paused','Pause control stops play',5000);
  await until('document.getElementById("gm-perf-fps").textContent==="Paused"','Panel headline updates without game callbacks while paused',5000);
  checks.push('Paused headline updates after game loop stops');
  await evaluate('document.getElementById("gm-perf-details").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until('!__livePanelTest.state().paused&&__livePanelTest.state().raf','Escape from panel restores play',5000);
  await evaluate('__livePanelTest.pauseEnabled(false)');
  checks.push('Escape from focused panel reaches pause controls');

  await until('__sluicePerformance.liveStatus().seconds>2.2','Observer passes initial loading grace period',10000);
  await evaluate('__livePanelTest.clearIssues();__livePanelTest.stall(200,2)');
  await sleep(1000);
  await until('__livePanelTest.issues().length>0&&document.querySelector("#gm-perf-issues button[data-perf-issue]")','Major issue is retained and rendered',10000);
  // Keep compatibility coverage for the recording API after its UI Pin
  // control was replaced by the session issue journal.
  await evaluate('__sluicePerformance.pin()');
  const pinned = await evaluate('__sluicePerformance.liveStatus()');
  fs.writeFileSync(out+'/pinned.json',JSON.stringify(pinned));
  check('Recording API pin retains actual slow update',pinned.pinned&&pinned.worst?.severity>=200&&
    Math.max(pinned.worst.current.cpuMs,pinned.worst.previous?.cpuMs||0)>=200);
  const issue=await evaluate('__livePanelTest.issues()[0]');
  await click('#gm-perf-issues button[data-perf-issue='+JSON.stringify(issue.id)+']');
  const selected=await evaluate('__livePanelTest.selected()');
  check('Issue tag opens frozen inspector',selected?.id===issue.id&&await evaluate('document.getElementById("gm-perf-panel").getAttribute("data-perf-view")==="issue"&&!document.getElementById("gm-perf-inspection").hidden&&document.getElementById("gm-perf-live-view").hidden'));
  check('Selected issue tag exposes native pressed state',await evaluate('document.querySelector("#gm-perf-issues button[aria-pressed=true]")?.getAttribute("data-perf-issue")==='+JSON.stringify(issue.id)));
  check('Inspector technical evidence stays behind Details',await evaluate('document.getElementById("gm-perf-inspection-evidence").getBoundingClientRect().height===0'));
  await screenshot('issue-inspection');
  await evaluate('__livePanelTest.stall(260,1)');
  await until('__livePanelTest.issues().some(issue=>issue.id==='+JSON.stringify(issue.id)+'&&issue.severity>=260)','New worse issue is retained',10000);
  check('New worst event does not move selected inspection',(await evaluate('__livePanelTest.selected().event.frameId'))===selected.event.frameId);
  const focusIssue=await evaluate('__livePanelTest.journalCPU("snow.cpu",80)');
  await evaluate('document.querySelector('+JSON.stringify('#gm-perf-issues button[data-perf-issue='+JSON.stringify(focusIssue)+']')+').focus()');
  await evaluate('__livePanelTest.journalCPU("snow.cpu",500)');
  check('Issue severity reorder preserves native focus on category',await evaluate('document.activeElement?.getAttribute("data-perf-issue")==='+JSON.stringify(focusIssue)));
  await sleep(31000);
  const recovered = await evaluate('__sluicePerformance.liveStatus()');
  check('Pinned spike survives recovery beyond rolling history',recovered.pinned&&recovered.worst.frameId===pinned.worst.frameId);
  check('Session issue survives recovery beyond rolling history',(await evaluate('__livePanelTest.issues().some(issue=>issue.id==='+JSON.stringify(issue.id)+')')));
  check('Selected inspection survives recovery beyond rolling history',(await evaluate('__livePanelTest.selected().event.frameId'))===selected.event.frameId);
  check('Game recovers while spike remains pinned', (await evaluate('__sluicePerformance.liveSnapshot().cpuMs')) < 200);
  await click('#gm-perf-save');
  await until('!__livePanelTest.rollingSaving()','Rolling save finishes',10000);
  const savedRecent=await downloaded('sluice-last30-');
  captureClocks(savedRecent.capture);
  check('Save 30 seconds downloads a complete compatible trace',savedRecent.capture.metadata.rolling&&savedRecent.capture.frameCount>0&&savedRecent.capture.slowdown?.frameId===pinned.worst.frameId);
  check('Save includes historical journal and frozen inspection',savedRecent.capture.issues.some(row=>row.id===issue.id&&row.outsideHistory)&&savedRecent.capture.selectedIssue?.id===issue.id&&savedRecent.capture.selectedIssue.outsideHistory&&savedRecent.capture.selectedIssue.event.frameId===selected.event.frameId);
  const savedReader=JSON.parse(execFileSync(process.execPath,[root+'/tools/perf/read-play-recording.mjs',out+'/downloads/'+savedRecent.file],{encoding:'utf8'}));
  check('Offline reader preserves retained issues and selection',savedReader.issues.length===savedRecent.capture.issues.length&&savedReader.selectedIssue?.id===issue.id);
  check('Saved frames GPU counters events and slowdown share relative timestamps',true);
  check('Rolling capture reports export snapshot cost',Number.isFinite(savedRecent.capture.observer.exportSnapshotMs));
  await click('#gm-perf-back');
  check('Back returns to live without erasing journal',await evaluate('__livePanelTest.selected()===null&&__livePanelTest.issues().length>0&&document.getElementById("gm-perf-panel").getAttribute("data-perf-view")==="live"'));
  await click('#gm-perf-issues button[data-perf-issue='+JSON.stringify(issue.id)+']');
  const selectedBeforeToggle=await evaluate('__livePanelTest.selected()');

  await evaluate('__livePanelTest.mockGPU()');
  await f9();
  await until('__livePanelTest.manual().active','F9 starts manual recording',5000);
  await evaluate('__livePanelTest.pushGPU()');
  await sleep(1200);
  const coexist = await evaluate('({manual:__livePanelTest.manual(),manualGPU:__livePanelTest.manualGPU(),rolling:__sluicePerformance.rollingCapture()})');
  check('Manual capture coexists with rolling observer',coexist.manual.active&&coexist.manual.frames>0&&coexist.rolling.frameCount>0);
  check('GPU sample retained once in manual capture',coexist.manualGPU.filter(r=>r.name==='test.live-panel.gpu').length===1);
  check('GPU sample retained once in rolling capture',coexist.rolling.gpu.filter(r=>r.name==='test.live-panel.gpu').length===1);
  await f9();
  await until('!__livePanelTest.manual().active&&!__livePanelTest.manual().saving','F9 stops and saves manual recording',10000);
  await evaluate('__livePanelTest.restoreGPU()');
  check('Stopping manual capture keeps dev observer active',await evaluate('__sluicePerformance.liveStatus().enabled'));
  const manualSaved=await downloaded('sluice-performance-');
  const downloads=fs.readdirSync(out+'/downloads').filter(file=>file.startsWith('sluice-performance-')&&file.endsWith('.json'));
  check('F9 saves the manual capture in the owned temporary download path',downloads.length===1);
  const manualExport=manualSaved.capture;
  check('Manual export includes global frame IDs',manualExport.columns.includes('frameId')&&manualExport.frameCount>0);
  const beforeToggle = await evaluate('__livePanelTest.state().frameId');
  for(let i=0;i<3;i++) {await evaluate('__livePanelTest.dev(false)');await sleep(120);await evaluate('__livePanelTest.dev(true)');await sleep(120);}
  await until('__sluicePerformance.liveStatus().enabled','Observer returns after toggles',10000);
  check('Dev toggles do not duplicate panel nodes',await evaluate('document.querySelectorAll("#gm-perf-panel").length===1&&document.querySelectorAll("#gm-perf-graph").length===1'));
  check('Dev toggles do not duplicate gameplay callbacks',await evaluate('__livePanelRAFs.max<=1&&__livePanelRAFs.pending()<=1'));
  check('Dev toggles preserve monotonic frame IDs',(await evaluate('__livePanelTest.state().frameId'))>beforeToggle);
  check('Dev toggles preserve session issue journal',await evaluate('__livePanelTest.issues().some(issue=>issue.id==='+JSON.stringify(issue.id)+')'));
  check('Dev toggles preserve frozen inspector',(await evaluate('__livePanelTest.selected()?.event.frameId'))===selectedBeforeToggle.event.frameId);
  await click('#gm-perf-details');
  await sleep(200);
  check('Details control reveals diagnostics',await evaluate('__livePanelTest.details()'));
  check('Details reveals exact selected event evidence',await evaluate('document.getElementById("gm-perf-inspection-evidence").children.length>0&&!document.getElementById("gm-perf-inspection-evidence").hidden&&document.getElementById("gm-perf-cpu").textContent.startsWith("Recorded frame:" )'));
  await screenshot('desktop-details');
  await click('#gm-perf-details');
  check('Details control returns to compact panel',!(await evaluate('__livePanelTest.details()')));
  await click('#gm-perf-clear');
  check('Clear issues removes journal inspection and old pin',await evaluate('__livePanelTest.issues().length===0&&__livePanelTest.selected()===null&&!__sluicePerformance.liveStatus().pinned&&!__sluicePerformance.liveStatus().worst'));
  const gpuIssueId=await evaluate('__livePanelTest.journalGPU(30,70)');
  await click('#gm-perf-issues button[data-perf-issue='+JSON.stringify(gpuIssueId)+']');
  check('GPU issue inspector preserves sampled GPU cause when CPU is also costly',await evaluate('document.getElementById("gm-perf-inspection-certainty").textContent==="GPU sampled"&&/snow/i.test(document.getElementById("gm-perf-inspection-title").textContent)&&document.getElementById("gm-perf-inspection-summary").textContent.includes("70.0")'));
  await click('#gm-perf-clear');

  await navigate(true,false,844,390);
  await fullscreen();
  await until('__sluicePerformance.liveStatus().enabled','Short desktop starts observer',10000);
  await until('!!document.getElementById("gm-perf-summary").textContent','Short desktop panel paints',10000);
  await evaluate('__livePanelTest.clearIssues()');
  const shortDesktop = await layout();
  await screenshot('short-desktop');
  await navigate(true,true,844,390);
  await fullscreen();
  await until('__sluicePerformance.liveStatus().enabled','Landscape phone starts observer',10000);
  await until('!!document.getElementById("gm-perf-summary").textContent','Landscape phone panel paints',10000);
  await evaluate('__livePanelTest.clearIssues()');
  const mobile = await layout();
  check('Landscape phone panel fits viewport',mobile.left>=0&&mobile.top>=0&&mobile.right<=845&&mobile.bottom<=391);
  check('Landscape phone targets remain 44 pixels',mobile.buttons.every(b=>b.width>=44&&b.height>=44));
  check('Landscape phone text does not shrink',mobile.minFont>=11);
  const toolbarButtons=buttons=>buttons.filter(b=>['gm-perf-clear','gm-perf-save','gm-perf-details'].includes(b.id));
  const desktopToolbar=toolbarButtons(shortDesktop.buttons),phoneToolbar=toolbarButtons(mobile.buttons);
  fs.writeFileSync(out+'/layout-comparison.json',JSON.stringify({shortDesktop,mobile},null,2));
  check('Desktop and phone share viewport-based panel layout',
    Math.abs(shortDesktop.width-mobile.width)<1&&Math.abs(shortDesktop.height-mobile.height)<1&&
    shortDesktop.minFont===mobile.minFont&&desktopToolbar.length===phoneToolbar.length&&
    desktopToolbar.every((button,i)=>button.id===phoneToolbar[i].id&&
      Math.abs(button.width-phoneToolbar[i].width)<1&&Math.abs(button.height-phoneToolbar[i].height)<1));
  await screenshot('landscape');
  await click('#gm-perf-details');await sleep(200);
  const mobileDetails = await layout();
  check('Short-screen details scroll vertically',mobileDetails.scrollRegions.length>0);
  check('Details text stays readable',mobileDetails.minFont>=11);
  await screenshot('landscape-details');
  await evaluate('(()=>{var scroll=document.querySelector("#gm-perf-panel .gm-perf-scroll");scroll.scrollTop=scroll.scrollHeight;})()');
  await screenshot('landscape-details-scrolled');
  await viewport(390,844,true);
  await until('__livePanelTest.state().blocked','Portrait orientation gate applies',10000);
  const portrait = await evaluate('({test:__livePanelTest.state(),rotateHidden:document.getElementById("gm-rotate-screen").hidden,panelInert:document.getElementById("gm-perf-panel").inert})');
  check('Portrait rotate screen stays visible',!portrait.rotateHidden);
  check('Portrait freezes gameplay loop',!portrait.test.raf);
  check('Portrait makes live panel inert',portrait.panelInert);
  await screenshot('portrait');
  await viewport(844,390,true);
  await until('!__livePanelTest.state().blocked&&__livePanelTest.state().raf','Landscape restores active play',10000);

  assert.deepEqual(errors,[],'No console or unhandled browser errors');
  const result={passed:true,checks:checks.length+unit.checks+autoUnit.checks+issueUnit.checks+presentation.checks,unit,autoUnit,issueUnit,presentation,checkNames:checks,out,desktop,shortDesktop,mobile,mobileDetails,
    headless:true,ownedChromeForTesting:true,presentationCertified:false};
  fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} catch(error) {
  fs.writeFileSync(out+'/error.json',JSON.stringify({message:error.message,stack:error.stack,checks,errors},null,2));
  throw error;
} finally {
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},2000);}catch{}socket.close();}
  for(const request of pending.values())request.reject(Error('Test cleanup'));pending.clear();
  if(chrome&&chrome.exitCode===null){
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1500)]);
    if(chrome.exitCode===null)chrome.kill('SIGKILL');
  }
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
