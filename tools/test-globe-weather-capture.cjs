'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const data=require('../js/globe-data.js'),{captureCloudCatalog}=require('./archive-globe-weather.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'globe-weather-capture-')),file=path.join(directory,'catalog.json');
const xml=data.CLOUD_LAYERS.map(layer=>'<Layer><Name>'+layer+'</Name><Dimension name="time">2021-06-06T15:00:00Z/2026-10-05T15:00:00Z/PT3H</Dimension></Layer>').join('');
let checks=0;async function check(name,work){await work();checks++;console.log('PASS '+name);}
(async()=>{try{
 const options={file,now:Date.parse('2026-10-05T16:00:00Z'),fetch:async()=>new Response(xml)};
 await check('weather capture saves only the actual advertised interval and product provenance',async()=>{assert.equal((await captureCloudCatalog(options)).changed,true);const saved=JSON.parse(fs.readFileSync(file));assert.equal(data.parseCloudSnapshot(saved).end.toISOString(),'2026-10-05T15:00:00.000Z');assert.equal(saved.checkedAt,'2026-10-05T16:00:00.000Z');});
 const before=fs.readFileSync(file);
 await check('unchanged source publication is idempotent without timestamp-only commits',async()=>{assert.equal((await captureCloudCatalog({...options,now:options.now+60000})).changed,false);assert.deepEqual(fs.readFileSync(file),before);});
 await check('provider failures preserve the last validated published interval',async()=>{await assert.rejects(captureCloudCatalog({...options,fetch:async()=>new Response('',{status:503})}));assert.deepEqual(fs.readFileSync(file),before);});
 await check('future or malformed source metadata cannot overwrite existing valid data',async()=>{await assert.rejects(captureCloudCatalog({...options,now:Date.parse('2026-10-05T14:00:00Z')}));await assert.rejects(captureCloudCatalog({...options,fetch:async()=>new Response(xml.replace('PT3H','PT1H'))}));assert.deepEqual(fs.readFileSync(file),before);});
 console.log('Globe weather capture: '+checks+' checks passed.');
}finally{fs.rmSync(directory,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
