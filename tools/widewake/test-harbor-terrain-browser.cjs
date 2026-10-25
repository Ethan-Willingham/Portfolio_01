/* Harbor foundations and port views in the actual WebGL and Canvas renderers. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),cp=require('node:child_process');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-harbor-terrain'),baseline=process.env.WIDEWAKE_HARBOR_BASELINE==='1';
fs.mkdirSync(out,{recursive:true});const original=new Map(),errors=[],reports=[];let browser;
if(baseline)for(const file of ['js/widewake-estuary-core.js','js/widewake-estuary-worker.js','js/widewake-estuary-view.js','js/widewake-waterway-art.js','js/widewake-ocean-art.js'])original.set(file,cp.execFileSync('git',['show','HEAD:'+file],{cwd:root}));
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const send=(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);};if(original.has(relative))send(null,original.get(relative));else fs.readFile(file,send);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  for(const [width,height,canvas]of baseline?[[1440,900,false]]:[[1440,900,false],[844,390,false],[844,390,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(canvas)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl2'?null:get.call(this,t,...args);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready,null,{timeout:90000});
    const ids=await p.evaluate(()=>WidewakeEstuary.ports.map(p=>p.id));
    for(const id of ids){
      const state=await p.evaluate(id=>{const a=__widewakeReach,v=a.view,g=a.game,p=WidewakeEstuary.ports.find(p=>p.id===id),site=g.field.harbors?.find(h=>h.id===id);g.port=id;g.nextEncounter=1e9;
        let focus=site?.focus;if(!focus){const angle=p.theme?p.shoreAngle+Math.PI:p.id==='reeds'?Math.PI:-Math.PI/2;let d=0;while(d<620&&g.field.sample(p.x+Math.cos(angle)*d,p.y+Math.sin(angle)*d).edge>-.3)d+=2;focus=p.theme?{x:p.x+Math.cos(angle)*(d+4),y:p.y+Math.sin(angle)*(d+4)}:p.id==='reeds'?{x:p.x-31,y:p.y}:p.id==='mill'?{x:p.x-77,y:p.y-109}:{x:p.x-25,y:p.y-112};}
        v.follow=false;v.anchor=null;v.offset={x:0,y:0};const scale=p.id==='reeds'?Math.min(7,v.width/140,v.height/68):Math.min(3.6,v.width/320,v.height/190),shift=WidewakeOcean.unproject(v.width*.15/scale,0);v.camera={x:focus.x-shift.x,y:focus.y-shift.y};v.zoom=v.targetZoom=scale/v.baseScale;a.step(0);v.render(0,1);
        return{id,parts:v.landmarks.filter(m=>m.type.startsWith('landing_'+id)).length,atlasBytes:v.atlas?.bytes||0,backend:v.stats.backend,focus};
      },id);
      await p.waitForFunction(()=>{const v=__widewakeReach.view;v.render(0,1);return v.terrain.ready;},null,{timeout:90000});
      const rendered=await p.evaluate(()=>{const v=__widewakeReach.view;v.render(0,1);return{error:v.gl?.getError()||0,cache:v.spriteCache?.size||0,tiles:v.terrain.cache.size};});assert.equal(rendered.error,0);assert.ok(rendered.tiles>1);
      if(!baseline){assert.ok(state.parts>=4,id+' uses separately culled quay, buildings and piers');assert.ok(state.atlasBytes<48*1048576,'bounded ten-port atlas '+state.atlasBytes);}
      if(width===1440||['yard','lantern','canopy','kilns'].includes(id))await p.screenshot({path:path.join(out,`${baseline?'before':'after'}-${id}-${width}-${canvas?'canvas':'webgl'}.png`)});
      reports.push({width,height,canvas,...state,...rendered});
    }
    if(!canvas&&!baseline){await p.evaluate(()=>{const v=__widewakeReach.view;window.restoreStages=[];const init=v.init.bind(v),restore=v.terrain.restore.bind(v.terrain);v.init=()=>{init();restoreStages.push(['init',v.gl.getError()]);};v.terrain.restore=()=>{restore();restoreStages.push(['terrain',v.gl.getError()]);};window.harborContext=v.gl.getExtension('WEBGL_lose_context');harborContext.loseContext();});await p.waitForFunction(()=>__widewakeReach.view.lost);await p.evaluate(()=>harborContext.restoreContext());await p.waitForFunction(()=>!__widewakeReach.view.lost);await p.waitForFunction(()=>{__widewakeReach.view.render(0,1);return __widewakeReach.view.terrain.ready;},null,{timeout:90000});const restore=await p.evaluate(()=>({error:__widewakeReach.view.gl.getError(),stages:restoreStages}));assert.equal(restore.error,0,JSON.stringify(restore));for(const stage of restore.stages)assert.equal(stage[1],0,JSON.stringify(restore));}
    await context.close();console.log('PASS '+width+' '+(canvas?'Canvas':'WebGL')+' all ten harbors'+(baseline?' baseline':''));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,baseline?'before-report.json':'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e,errors);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
