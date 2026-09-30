// Ordinary game boot with native callbacks in an owned Chrome for Testing process.
// Delays one real fire pipeline past the old cutoff, then checks GPU failure and saves.
// Default is a normal visible browser. HEAD=0 selects a headless GPU regression run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP||fs.mkdtempSync(path.join(os.tmpdir(),'sluice-fire-boot-'));
const profile=path.join(out,'browser-profile'),port=Number(process.env.PORT||8798),debug=port+1000;
fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer((req,res)=>{
  try {
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
    const data=fs.readFileSync(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404).end();}
});
let chrome,ws,serial=0,mode='normal',script;
process.once('exit',()=>{if(chrome&&chrome.exitCode===null)chrome.kill();});
const pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},30000);
  pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
  ws.send(JSON.stringify({id,method,params}));
});}
async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression,ms=70000){const end=Date.now()+ms;while(Date.now()<end){if(await ev(expression))return;await delay(100);}throw Error('Timed out: '+expression+' '+JSON.stringify(await ev('window.SluiceLoading?.report()')));}
const slots=`Object.fromEntries(Object.keys(localStorage).filter(k=>/^sluice.save.[ab]$/.test(k)).map(k=>[k,localStorage.getItem(k)]))`;
async function boot(name,query=''){
  mode=name;
  if(script)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:script});
  const source=`if(location.pathname==='/grand-motherload.html'){
    window.__beforeBootSlots=${slots};
    if(${JSON.stringify(name)}==='no-adapter')navigator.gpu.requestAdapter=async function(){return null;};
    var compile=GPUDevice.prototype.createComputePipelineAsync;
    GPUDevice.prototype.createComputePipelineAsync=function(descriptor){
      if(descriptor.compute.entryPoint==='solid'){
        if(${JSON.stringify(name)}==='fire-error')return Promise.reject(Error('Injected fire pipeline failure'));
        var result=compile.call(this,descriptor);
        if(${JSON.stringify(name)}==='slow')return Promise.all([result,new Promise(r=>setTimeout(r,13000))]).then(v=>v[0]);
        return result;
      }return compile.call(this,descriptor);
    };
  }`;
  script=(await call('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
  await call('Page.navigate',{url:'http://127.0.0.1:'+port+'/grand-motherload.html'+query});
  await delay(300);
  await until('!!window.SluiceLoading && !!window.__beforeBootSlots');
}
async function report(name){const r=await ev('SluiceLoading.report()');fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(r,null,2));return r;}
function check(label,ok){assert(ok,label);console.log('PASS '+label);}
try {
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  const args=[...(process.env.HEAD==='0'?['--headless=new','--enable-unsafe-webgpu','--use-angle=metal']:['--window-size=1512,850']),
    '--no-first-run','--no-default-browser-check','--mute-audio','--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'];
  chrome=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',args,{stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  let target;for(let n=0;n<100;n++){try{target=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');}catch{}if(target)break;await delay(100);}
  assert(target,'Owned test browser started');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push({mode,detail:m.params.exceptionDetails});
    else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push({mode,detail:m.params.args});};
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  console.log('Output '+out);
  await boot('slow');
  await until('window.__fire && __fire.startup.pending.length===1 && __fire.startup.pending[0]==="solid"');
  await delay(8500);
  check('old cutoff retains the real GPU pipeline and loading cover',await ev('SluiceLoading.active() && !__fire.available && !__fire.failed && SluiceLoading.report().tasks.find(t=>t.id==="fire").state==="running"'));
  await until('document.getElementById("game-intro").getAttribute("data-state")==="ready"');
  const slow=await report('slow');
  check('thirteen-second compilation finishes on GPU',slow.tasks.find(t=>t.id==='fire').state==='done'&&slow.environment.fire==='WebGPU'&&await ev('__fire.available && !__fire.failed'));
  check('all fire programs and warm-up complete before readiness',await ev('__fire.startup.done===__fire.startup.total && __fire.startup.pending.length===0 && __fire.startup.stage==="GPU fire ready"'));
  await ev('__sluiceSave.now()');
  await boot('normal');await until('document.getElementById("game-intro").getAttribute("data-state")==="ready"');
  const normal=await report('saved-return');
  check('ordinary saved return uses GPU water and fire',normal.environment.water==='WebGPU'&&normal.environment.fire==='WebGPU'&&normal.tasks.find(t=>t.id==='world').detail.startsWith('Restored saved mine'));
  await ev('__fire.dispose()');
  await until('document.getElementById("game-intro").getAttribute("data-state")==="error"');
  check('runtime fire loss stops play and save writes',await ev('__sluiceSave.now()===false && SluiceLoading.report().error.includes("Fire physics")'));
  await report('runtime-loss');
  await boot('fire-error');await until('document.getElementById("game-intro").getAttribute("data-state")==="error"');
  check('failed GPU compilation blocks automatic CPU fallback',await ev('SluiceLoading.report().error.includes("Injected fire pipeline failure") && __sluiceSave.now()===false'));
  assert.deepEqual(await ev(slots),await ev('__beforeBootSlots'),'Compilation failure must preserve save slots');
  await report('compile-failure');
  await boot('no-adapter');await until('document.getElementById("game-intro").getAttribute("data-state")==="error"');
  check('unavailable GPU water blocks ordinary play',await ev('SluiceLoading.report().tasks.find(t=>t.id==="water").state==="error" && __sluiceSave.now()===false'));
  assert.deepEqual(await ev(slots),await ev('__beforeBootSlots'),'Missing adapter must preserve save slots');
  await report('no-adapter');
  await boot('normal','?cpufire=1');await until('document.getElementById("game-intro").getAttribute("data-state")==="ready"');
  check('explicit CPU fire diagnostic remains opt-in',await ev('SluiceLoading.report().tasks.find(t=>t.id==="fire").state==="fallback"'));
  check('no unexpected browser errors',errors.length===0);
  console.log('Boot times '+JSON.stringify({delayedMs:slow.elapsedMs,savedReturnMs:normal.elapsedMs}));
}finally {
  for(const p of pending.values())p.reject(Error('Browser closing'));pending.clear();
  try{ws?.close();}catch{}
  if(chrome&&chrome.exitCode===null){chrome.kill();await Promise.race([new Promise(r=>chrome.once('exit',r)),delay(3000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  server.close();fs.rmSync(profile,{recursive:true,force:true});
}
