// Optional input-only follow-up. Requires existing read-only naturalTownHook.
// Import and call gatherNaturalResidents(send,ev,{out,durationMs,anchorX}).
// No body/world writes, spawning, freezing, clock manipulation or solver settings.
import fs from 'node:fs';
import assert from 'node:assert/strict';
export async function gatherNaturalResidents(send,ev,{out,durationMs=300000,hostStart=performance.now(),anchorX=null,warmupMs=60000,warmupMax=90000,snowTarget=9000,dragMs=10500}={}){
 const start=hostStart,deadline=start+durationMs,log=[],held=new Set();let pressed=false,pointer=null;
 const read=()=>ev('__adaptiveRead(true)'),remaining=()=>deadline-performance.now();
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,Math.min(ms,remaining()))));
 const initial=await read(),ids=initial.targets.map(t=>t.id).sort((a,b)=>a-b),groundY=initial.state.y;
 assert.equal(ids.length,5,'Five original natural residents required');
 const anchor=anchorX??initial.state.x;
 assert(warmupMs>=60000&&warmupMax>=warmupMs&&warmupMax<=90000&&durationMs>=240000,'60 to 90s natural warmup and at least240s route');
 function check(s){assert.deepEqual(s.targets.map(t=>t.id).sort((a,b)=>a-b),ids);assert(!s.state.paused&&!s.state.bath&&s.state.shop==='closed');}
 function evidence(s){const active=s.state.slimes.filter(b=>!b.frozen&&!b.sleeping),near=active.filter(b=>Math.abs(b.x-anchor)<=90);return {actualHeldIDs:s.targets.filter(t=>t.grabbed).map(t=>t.id),awakeIDs:active.map(b=>b.id),nearAnchorAwakeIDs:near.map(b=>b.id),nearAnchorAllIDs:s.targets.filter(t=>Math.abs(t.x-anchor)<=90).map(t=>t.id),snowActive:s.state.snowActive,rigX:s.state.x,rigY:s.state.y};}
 function record(row){log.push({atMs:performance.now()-start,...row});if(out)fs.writeFileSync(out+'/gather-actions.json',JSON.stringify({initialIDs:ids,anchorX:anchor,log},null,2));}
 async function keys(next){const want=new Set(next);for(const k of held)if(!want.has(k))await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k});for(const k of want)if(!held.has(k))await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k});held.clear();for(const k of want)held.add(k);}
 async function mouse(type,x,y){pointer={x,y};await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:(pressed||type==='mousePressed'?1:0),clickCount:type==='mouseMoved'?0:1});if(type==='mousePressed')pressed=true;if(type==='mouseReleased')pressed=false;}
 async function moveWorld(s,x,y){const r=s.rect;await mouse('mouseMoved',Math.max(r.left+12,Math.min(r.left+r.width-12,r.left+(x-s.state.cameraX)*s.scale)),Math.max(r.top+12,Math.min(r.top+r.height-105,r.top+(y-s.state.cameraY)*s.scale)));}
 async function release(){try{await keys([]);}finally{if(pressed&&pointer)await mouse('mouseReleased',pointer.x,pointer.y);}}
 record({action:'initial',state:initial.state,evidence:evidence(initial)});
 try{
  await keys([]);
  while(performance.now()-start<warmupMs&&remaining()>150000){await pause(5000);const s=await read();check(s);record({action:'natural-warmup',state:s.state,evidence:evidence(s)});}
  while(performance.now()-start<warmupMax&&remaining()>150000){const s=await read();check(s);if(s.state.snowActive>=snowTarget)break;record({action:'natural-snow-wait',snowTarget,state:s.state,evidence:evidence(s)});await pause(5000);}
  record({action:'warmup-finished',state:(await read()).state});
  // Carry outsiders first. Each transport is real keyboard walking with a held mouse grip.
  const order=initial.targets.slice().sort((a,b)=>Math.abs(b.x-anchor)-Math.abs(a.x-anchor)).map(t=>t.id);
  for(let slot=0;slot<order.length&&remaining()>25000;slot++){
   const id=order[slot],approachEnd=Math.min(deadline-22000,performance.now()+25000);let s=await read();
   while(performance.now()<approachEnd){check(s);const t=s.targets.find(t=>t.id===id);if(t.pick&&Math.abs(t.x-s.state.x)<125)break;await keys([t.x>s.state.x?'ArrowRight':'ArrowLeft']);await pause(160);s=await read();}
   await keys([]);await pause(250);s=await read();check(s);const target=s.targets.find(t=>t.id===id);
   if(!target.pick){record({action:'unpickable',id,state:s.state});continue;}
   await mouse('mouseMoved',target.pick.x,target.pick.y);await mouse('mousePressed',target.pick.x,target.pick.y);await pause(200);s=await read();check(s);
   record({action:'grab-check',requestedID:id,state:s.state,evidence:evidence(s)});
   if(!s.targets.find(t=>t.id===id)?.grabbed||!s.state.holding){record({action:'grab-failed',id,state:s.state});await release();continue;}
   const actual=s.targets.find(t=>t.id===id),from={x:actual.x,y:actual.y};const carryStart=performance.now(),startFrame=s.frame;let maximumDisplacement=0,transportSamples=0;record({action:'carry-start',id,from,state:s.state,evidence:evidence(s)});
   const depositX=anchor+[-18,18,0,-10,10][slot],depositY=groundY+[4,4,-32,-58,-58][slot];
   const carryEnd=Math.min(deadline-15000,performance.now()+22000);let heldThroughout=true;
   while(performance.now()<carryEnd){s=await read();check(s);const body=s.targets.find(t=>t.id===id);
    maximumDisplacement=Math.max(maximumDisplacement,Math.hypot(body.x-from.x,body.y-from.y));
    if(transportSamples++%5===0)record({action:'transport',id,body:{x:body.x,y:body.y},maximumDisplacement,state:s.state,evidence:evidence(s)});
    if(!body.grabbed||!s.state.holding){heldThroughout=false;break;}
    const dx=depositX-s.state.x;if(Math.abs(dx)<45)break;
    const direction=dx>0?1:-1;await keys([direction>0?'ArrowRight':'ArrowLeft']);await moveWorld(s,s.state.x+direction*65,groundY-38);await pause(100);
   }
   await keys([]);
   // Set down using the real pointer. The target is a request to the grab solver, not a body pose.
   for(let k=0;(k<20||performance.now()-carryStart<dragMs)&&remaining()>12000&&heldThroughout;k++){s=await read();check(s);const b=s.targets.find(t=>t.id===id);if(!b.grabbed||!s.state.holding){heldThroughout=false;break;}await moveWorld(s,depositX,depositY);await pause(100);}
   s=await read();const finalBody=s.targets.find(t=>t.id===id);maximumDisplacement=Math.max(maximumDisplacement,Math.hypot(finalBody.x-from.x,finalBody.y-from.y));record({action:'carry-end',id,heldThroughout,maximumDisplacement,heldMs:performance.now()-carryStart,framesAdvanced:s.frame-startFrame,distanceToAnchor:Math.abs(finalBody.x-anchor),evidence:evidence(s),requestedDeposit:{x:depositX,y:depositY},actual:s.targets.find(t=>t.id===id),state:s.state});await release();await pause(500);
  }
  // Walk through both sides of the collected residents and pulse the actual jet.
  let direction=1,step=0;
  while(remaining()>1000){const s=await read();check(s);if(s.state.x>anchor+95)direction=-1;if(s.state.x<anchor-95)direction=1;
   const jet=step++%12===5&&s.state.y>groundY-75;await keys(jet?[direction>0?'ArrowRight':'ArrowLeft','ArrowUp']:[direction>0?'ArrowRight':'ArrowLeft']);record({action:'cluster-traverse',keys:[...held],state:s.state,evidence:evidence(s)});await pause(jet?350:650);
  }
 }finally{await release();}
 const carried=log.filter(row=>row.action==='carry-end');
 const draggedIDs=[...new Set(carried.filter(row=>row.heldThroughout&&row.heldMs>=10000&&row.framesAdvanced>2&&row.maximumDisplacement>2).map(row=>row.id))];
 const transportedIDs=[...new Set(carried.filter(row=>row.heldThroughout&&row.distanceToAnchor<=90).map(row=>row.id))];
 return {initialIDs:ids,draggedIDs,transportedIDs,anchorX:anchor,log,limitation:'Input-only attempted gathering. Success requires observed resident clustering, all-five awake exposure, sustained deep snow and measured FPS; action completion alone does not prove those conditions.'};
}
