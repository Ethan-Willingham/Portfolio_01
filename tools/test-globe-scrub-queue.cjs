'use strict';
const assert=require('node:assert/strict'),R=require('../js/globe-replay.js');
let worker;
const Original=globalThis.Worker;
class ControlledWorker{constructor(){worker=this;this.jobs=[];}postMessage(job){this.jobs.push(job);}terminate(){this.terminated=true;}finish(){const job=this.jobs.at(-1);this.onmessage({data:{id:job.id,result:job.width}});}}
globalThis.Worker=ControlledWorker;
(async()=>{try{
 const p=R.preparer('fixture'),a=p.prepare([],1,true,0,'a'),b=p.prepare([],2,true,0,'b'),old=p.prepare([],3,true,100,'old'),latest=p.prepare([],4,true,100,'latest');
 worker.finish();assert.equal(await a,1);assert.equal(worker.jobs.at(-1).width,4,'The newest slider selection goes first');p.boost('b',100);worker.finish();assert.equal(await latest,4);assert.equal(worker.jobs.at(-1).width,2,'A cached background request can be promoted without restarting it');worker.finish();assert.equal(await b,2);worker.finish();assert.equal(await old,3);assert.equal(p.stats().worker,4);assert.equal(p.stats().queued,0);
 const active=p.prepare([],5,true,0,'active'),queued=p.prepare([],6,true,0,'queued');p.close();await assert.rejects(active,/closed/);await assert.rejects(queued,/closed/);await assert.rejects(p.prepare([],7,true),/closed/);assert(worker.terminated);worker.finish();assert.equal(p.stats().worker,4,'Late results cannot revive a closed queue');console.log('Replay queue: latest selection, promotion, shutdown and late-result checks passed.');
 }finally{if(Original===undefined)delete globalThis.Worker;else globalThis.Worker=Original;}})().catch(error=>{console.error(error);process.exitCode=1;});
