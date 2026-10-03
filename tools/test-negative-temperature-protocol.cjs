// Protocol exploration with the real GPU equation. No rendered vortex forces.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser;
const server=http.createServer((req,res)=>{try{const f=path.resolve(root,'.'+req.url.split('?')[0]);if(!f.startsWith(root+'/'))return res.writeHead(403).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
  browser=await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',args:['--enable-unsafe-webgpu']});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/negative-temperature-lab.html`);await page.waitForFunction(()=>NegativeTemperature.snapshot());await page.evaluate(()=>NegativeTemperature.advance(0));
  await page.exposeFunction('progress',s=>console.log(s));
  const runs=await page.evaluate(async()=>{
    const {GPUSolver}=await import('./js/negative-temperature-gpu.js');const {CONFIG,measure,initialField,seeded}=await import('./js/negative-temperature-model.js');
    const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice();
    const variants=[
      {grid:512,side:96,dt:.005,ensemble:'padded box, same trap and paddles'},
    ];const results=[];
    for(const tuning of variants){const p={...CONFIG,...tuning,phraseDuration:2000},gpu=new GPUSolver(device,p,'180106951');
      for(let s=0;s<p.preparationSteps;s+=128){gpu.advance(Math.min(128,p.preparationSteps-s),{imaginary:true});await device.queue.onSubmittedWorkDone();}
      const vortices=[],rng=seeded('180106951');
      if(tuning.ensemble==='random'){while(vortices.length<24){const x=(rng()-.5)*34,y=(rng()-.5)*24;if(Math.hypot(x/20,y/13)>.8||vortices.some(v=>Math.hypot(v.x-x,v.y-y)<2.7))continue;vortices.push({x,y,sign:vortices.length%2?1:-1});}}
      else if(tuning.ensemble==='four groups'){for(const sign of [-1,1])for(const yy of [-6,6])for(let i=0;i<4;i++){const angle=2*Math.PI*i/4+.2;vortices.push({x:sign*11+2.3*Math.cos(angle),y:yy+2.3*Math.sin(angle),sign});}}
      const ground=await gpu.readback(),imprint=initialField(p,'180106951',vortices),base=initialField(p,'180106951');
      for(let i=0;i<ground.length;i+=2){const den=base[i]**2+base[i+1]**2;if(den<1e-8)continue;const re=(imprint[i]*base[i]+imprint[i+1]*base[i+1])/den,im=(imprint[i+1]*base[i]-imprint[i]*base[i+1])/den;const a=ground[i],b=ground[i+1];ground[i]=a*re-b*im;ground[i+1]=a*im+b*re;}gpu.upload(ground);
      const blockSteps=Math.round(25/p.dt),history=[{time:0,...measure(ground,p,0)}];for(let block=0;block<12;block++){for(let s=0;s<blockSteps;s+=128){gpu.advance(Math.min(128,blockSteps-s));await device.queue.onSubmittedWorkDone();}const d=measure(await gpu.readback(),p,gpu.time);history.push({time:gpu.time,...d});await progress(`${tuning.ensemble} t=${gpu.time.toFixed(0)} +${d.positive} -${d.negative} C2=${d.c2?.toFixed(2)} group=${d.largestCluster}`);if(d.vortices.length>100)break;}
      results.push({parameters:p,history});gpu.dispose();
    }device.destroy();return results;
  });fs.writeFileSync(path.join(root,'assets/visualizer/negative-temperature/padding-check.json'),JSON.stringify(runs,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
