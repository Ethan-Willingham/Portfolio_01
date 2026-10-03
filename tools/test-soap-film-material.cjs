// Owns its exact Chrome for Testing process and HTTP server.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..'),out=process.env.SOAP_ARTIFACTS||'/tmp/soap-film-checks';fs.mkdirSync(out,{recursive:true});let browser;
const server=http.createServer((req,res)=>{if(req.url==='/fixture')return res.setHeader('Content-Type','text/html').end('<!doctype html><title>Soap film numerical fixture</title>');const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',path.extname(file)==='.js'?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 browser=await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true,args:['--enable-unsafe-webgpu']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 const report=await page.evaluate(async()=>{
  const {createMaterial}=await import('/js/soap-film-material.js'),{FilmModel}=await import('/js/soap-film-model.js');
  const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice();const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  try{
   // An analytic streamfunction supplies closed, divergence-free MAC velocities.
   function flow(n){const dx=.16/n,u=new Float32Array(n*(n+1)),v=new Float32Array(n*(n+1)),psi=(x,y)=>.00008*Math.sin(Math.PI*x/n)**2*Math.sin(Math.PI*y/n)**2;for(let y=0;y<n;y++)for(let x=1;x<n;x++)u[y*(n+1)+x]=(psi(x,y+1)-psi(x,y))/dx;for(let y=1;y<n;y++)for(let x=0;x<n;x++)v[y*n+x]=-(psi(x+1,y)-psi(x,y))/dx;return{u,v};}
   const cases=[];for(const flowN of [32,16]){const n=32,{u,v}=flow(flowN),initial=new Float32Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++)initial[y*n+x]=400+200*Math.sin(2*Math.PI*(x+.5)/n)*Math.sin(2*Math.PI*(y+.5)/n);
    const gpu=await createMaterial({device,n,flowN,initialState:initial}),cpu=new FilmModel(n);cpu.h.set(initial);
    // Independent MAC prolongation, linear only in the normal direction.
    for(let y=0;y<n;y++)for(let x=0;x<=n;x++){const q=x*flowN/n,i=Math.floor(q),j=Math.floor(y*flowN/n),f=q-i;cpu.u[y*(n+1)+x]=x===0||x===n?0:u[j*(flowN+1)+i]*(1-f)+u[j*(flowN+1)+i+1]*f;}
    for(let y=0;y<=n;y++)for(let x=0;x<n;x++){const q=y*flowN/n,j=Math.floor(q),i=Math.floor(x*flowN/n),f=q-j;cpu.v[y*n+x]=y===0||y===n?0:v[j*flowN+i]*(1-f)+v[(j+1)*flowN+i]*f;}
    let vmax=0;for(const a of [...u,...v])vmax=Math.max(vmax,Math.abs(a));const count=Math.ceil(.04/(.45*cpu.dx/(2*vmax))),dt=.04/count;
    const sum=a=>a.reduce((s,v)=>s+v,0),original=sum(initial);for(let k=0;k<100;k++){gpu.advance(.04,u,v);for(let j=0;j<count;j++){cpu.transport(cpu.h,cpu.h1,dt,false);cpu.transport(cpu.h1,cpu.h2,dt,false);for(let i=0;i<n*n;i++)cpu.h[i]=.5*(cpu.h[i]+cpu.h2[i]);}}
    await gpu.readback(4);let max=0,rms=0,min=Infinity,hi=-Infinity;for(let i=0;i<n*n;i++){const e=gpu.cached[i]-cpu.h[i];max=Math.max(max,Math.abs(e));rms+=e*e;min=Math.min(min,gpu.cached[i]);hi=Math.max(hi,gpu.cached[i]);}
    const volumeErrorRelative=(sum(gpu.cached)-original)/original;
    // A pending read of an older film cannot overwrite a subsequent Clear.
    gpu.advance(.04,u,v);const pending=gpu.readback(4.04);gpu.reset();await pending;const resetCorrect=gpu.cached.every((h,i)=>h===initial[i])&&gpu.snapshot().lastReadTime===0;await gpu.readback(0);const resetBufferCorrect=gpu.cached.every((h,i)=>h===initial[i]);
    cases.push({flowN,n,steps:100,maxErrorNm:max,rmsErrorNm:Math.sqrt(rms/(n*n)),volumeErrorRelative,minNm:min,maxNm:hi,resetCorrect,resetBufferCorrect});gpu.dispose();
   }
   const large=[];for(const n of [512,1024]){const gpu=await createMaterial({device,n,flowN:128}),{u,v}=flow(128),original=gpu.initialDiagnostics.volumeM3,start=performance.now(),steps=n===512?120:8;for(let k=0;k<steps;k++)gpu.advance(.04,u,v);await gpu.readback(steps*.04);const s=gpu.snapshot();large.push({n,steps,wallMilliseconds:performance.now()-start,cpuEncode:s.cpuEncode,thicknessRangeNm:s.diagnostics.thicknessRangeNm,volumeErrorRelative:(s.diagnostics.volumeM3-original)/original});gpu.dispose();}
   await device.queue.onSubmittedWorkDone();return{adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter},cases,large,errors};
  }finally{device.destroy();}
 });
 report.cases.forEach(c=>{assert.ok(c.maxErrorNm<.02,JSON.stringify(c));assert.ok(Math.abs(c.volumeErrorRelative)<1e-5);assert.ok(c.minNm>=199&&c.maxNm<=601);assert.ok(c.resetCorrect&&c.resetBufferCorrect);});report.large.forEach(c=>{assert.ok(Math.abs(c.volumeErrorRelative)<1e-5,JSON.stringify(c));assert.ok(c.thicknessRangeNm[0]>0&&Number.isFinite(c.thicknessRangeNm[1]));});assert.deepEqual(report.errors,[]);assert.deepEqual(errors,[]);report.pass=true;fs.writeFileSync(path.join(out,'material-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
