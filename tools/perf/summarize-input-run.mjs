import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const round=x=>Number(x.toFixed(3));
function stats(a){a=a.filter(Number.isFinite).sort((a,b)=>a-b);return {n:a.length,mean:round(a.reduce((s,x)=>s+x,0)/a.length),p99:round(a[Math.floor(a.length*.99)]),p999:round(a[Math.floor(a.length*.999)]),max:round(a.at(-1))};}
export function summarizeInputRun(dir,limitSeconds=Infinity){
  const raw=JSON.parse(fs.readFileSync(path.join(dir,'human.json'))),start=raw.rows[0].at;
  const rows=raw.rows.filter(r=>r.at-start<limitSeconds*1000);
  assert(rows.length>0 && raw.inputEvents.length>0,'Recorded input route');
  const buckets=[...new Set(rows.flatMap(r=>Object.keys(r.buckets)))].filter(k=>k!=='audit.skyDirty').map(name=>({name,ms:stats(rows.map(r=>r.buckets[name]||0))})).sort((a,b)=>b.ms.mean-a.ms.mean);
  const out={version:raw.boot.version,bundleSHA256:raw.bundleSHA256,canvas:raw.start.canvas,cpu:stats(rows.map(r=>r.cpu)),callback:stats(rows.map(r=>r.dt)),cpuOver8:rows.filter(r=>r.cpu>8).length,buckets,errors:raw.errors,
    motion:{x:[Math.min(...rows.map(r=>r.x)),Math.max(...rows.map(r=>r.x))].map(round),y:[Math.min(...rows.map(r=>r.y)),Math.max(...rows.map(r=>r.y))].map(round),groundFrames:rows.filter(r=>r.ground).length,landings:rows.slice(1).filter((r,i)=>r.ground&&!rows[i].ground).length,focusedFrames:rows.filter(r=>r.focus).length,visibleFrames:rows.filter(r=>r.visible).length,fuel:[rows[0].fuel,rows.at(-1).fuel],hull:rows.at(-1).hull,inputChanges:raw.inputEvents.filter(e=>e.atMs<limitSeconds*1000).length},
    worst:rows.slice().sort((a,b)=>b.cpu-a.cpu).slice(0,8).map(r=>({cpu:round(r.cpu),at:round(r.at-start),x:round(r.x),y:round(r.y),buckets:Object.fromEntries(Object.entries(r.buckets).filter(([k,v])=>v>.5).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,round(v)]))}))};
  const csv=path.join(dir,'human.present.csv');
  if(fs.existsSync(csv)){
    const lines=fs.readFileSync(csv,'utf8').trim().split(/\r?\n/),head=lines.shift().split(',');
    const entries=lines.map(l=>Object.fromEntries(l.split(',').map((v,i)=>[head[i],v]))).filter(r=>Number(r.TimeInMs)<limitSeconds*1000);
    const main=Object.values(Object.groupBy(entries,r=>r.SwapChainAddress)).sort((a,b)=>b.length-a.length)[0];
    const display=main.map(r=>Number(r.MsBetweenDisplayChange)).filter(x=>x>0);
    out.display=stats(display);out.displayFPS=round(1000/out.display.mean);
    const displayFile=path.join(dir,'display.json');
    const refreshHz=fs.existsSync(displayFile)?Number(JSON.parse(fs.readFileSync(displayFile)).refreshHz):144;
    assert(refreshHz>0&&Number.isFinite(refreshHz),'Known presentation reference rate');
    const late=display.filter(x=>x>1.35*1000/refreshHz).length;
    out.displayRefresh={referenceHz:refreshHz,late,count:display.length,percent:round(late/display.length*100),
      missedSlots:display.reduce((n,x)=>n+Math.max(0,Math.round(x*refreshHz/1000)-1),0)};
    // Mixed-monitor compositor traces can report intervals from another
    // display clock. Expose this instead of interpreting every row as a
    // physical refresh on the selected fixed-rate monitor. VRR needs a
    // separate interpretation and must not be judged by this check alone.
    const offCadence=display.filter(x=>Math.abs(x-Math.max(1,Math.round(x*refreshHz/1000))*1000/refreshHz)>1).length;
    out.displayRefresh.offCadencePercent=round(offCadence/display.length*100);
    out.displayRefresh.fixedRateCadenceMatches=offCadence/display.length<.01;
    out.displayGaps=Object.fromEntries([8,14.5,20,33,50].map(t=>{const count=display.filter(x=>x>t).length;return [t,{count,percent:round(count/display.length*100)}];}));
    out.presentModes=Object.entries(Object.groupBy(main,r=>r.PresentMode)).map(([mode,a])=>({mode,count:a.length}));
  }
  return out;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  for(const dir of process.argv.slice(2)){const r=summarizeInputRun(dir,Number(process.env.LIMIT_SECONDS||Infinity));console.log(JSON.stringify({directory:dir,...r,buckets:r.buckets.slice(0,12)}));}
}
