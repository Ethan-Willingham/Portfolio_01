// Untimed reporter acceptance semantics; synthetic metadata, not game performance evidence.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'capacity-weather-report-gate-'));
const reporter=fileURLToPath(new URL('./capacity-report.mjs',import.meta.url));
let checks=0;
for(const name of ['covered','bypassed','water0','missing','stale','no-snow']){
 const dir=root+'/'+name;fs.mkdirSync(dir,{recursive:true});
 const weather={worldRainEnabled:true,worldSnowEnabled:true,precipitationKind:'snow',updateEnabled:name!=='bypassed'&&name!=='water0',supportCounts:{enabled:true,traceMatched:name!=='stale',calls:name==='bypassed'?0:7,failedCalls:0}};
 const trace={version:'gate-only',exportComplete:true,frameCount:2,durationMs:20,columns:['cpuMs','intervalMs','awakeResidents','microsteps','snowActive'],stride:5,frameChunks:[[4,10,5,3,14,4,10,5,3,14]],seconds:[],gpu:[],initialState:{},testHarness:{water:name!=='water0',headless:true,frameMode:'native'},capacity:{initial:{fixture:{options:{snow:name==='no-snow'?0:14}}},end:{weather:name==='missing'?undefined:weather}}};
 fs.writeFileSync(dir+'/trace.json',JSON.stringify(trace));
 execFileSync(process.execPath,[reporter,dir],{stdio:'pipe'});
 const report=JSON.parse(fs.readFileSync(dir+'/service-report.json'));
 assert.equal(report.weatherBookkeeping.fullCPUCapacityAssertionEligible,['covered','no-snow'].includes(name),name);checks++;
 if(!['covered','no-snow'].includes(name)){assert.throws(()=>execFileSync(process.execPath,[reporter,dir],{env:{...process.env,REQUIRE_WEATHER_BOOKKEEPING:'1'},stdio:'pipe'}));checks++;}
}
console.log(JSON.stringify({passed:true,checks,untimed:true,syntheticMetadataOnly:true,noBrowser:true,noGPU:true}));
