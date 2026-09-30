// Adaptive input route through untouched natural residents. No pose or world writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));

export function naturalTownOptions(durationMs){
 const options={warmupMs:Number(process.env.WARMUP_MS??120000),warmupMax:Number(process.env.WARMUP_MAX_MS??180000),
  snowTarget:Number(process.env.SNOW_TARGET??18000),dragMs:Number(process.env.DRAG_MS??10500)};
 assert(Object.values(options).every(Number.isFinite),'Finite route settings');
 assert(options.warmupMs>=0&&options.warmupMax>=options.warmupMs&&options.warmupMax<=durationMs-60000,'Warmup leaves at least 60 seconds for input coverage');
 assert(options.snowTarget>=0&&options.dragMs>=10000&&options.dragMs<=30000,'Natural target and ten-second drag duration');
 return options;
}

// Injected into the game closure; its free variables are read-only game state.
function naturalTownRead(picking){
 const state=playPerfState(),r=canvas.getBoundingClientRect();
 const residents=jelloBodies.filter(b=>!!b.surfaceSlime);
 return {state,frame:playPerfTrace.frameCount,scale:worldScale,
  rect:{left:r.left,top:r.top,width:r.width,height:r.height},
  targets:residents.map(b=>{
   const x=r.left+(b.cx-cam.x)*worldScale,y=r.top+(b.cy-cam.y)*worldScale;
   let pick=null;
   if(picking){
    const points=[[b.cx,b.cy]];
    for(let k=0;k<b.n;k++)points.push([(b.px[k]+b.cx)/2,(b.py[k]+b.cy)/2]);
    for(let yy=1;yy<6;yy++)for(let xx=1;xx<6;xx++)points.push([b.bboxL+(b.bboxR-b.bboxL)*xx/6,b.bboxT+(b.bboxB-b.bboxT)*yy/6]);
    for(const [wx,wy] of points){
     const sx=r.left+(wx-cam.x)*worldScale,sy=r.top+(wy-cam.y)*worldScale;
     if(sx<r.left+20||sx>r.right-20||sy<r.top+20||sy>r.bottom-100||!jelloPointInRing(b,wx,wy))continue;
     let hit=null;
     // Production grabs the last ring containing this point. Respect that priority.
     for(let j=residents.length-1;j>=0;j--)if(jelloPointInRing(residents[j],wx,wy)){hit=residents[j];break;}
     if(hit===b){pick={x:sx,y:sy};break;}
    }
   }
   return {id:b.surfaceSlime.id,x:b.cx,y:b.cy,screenX:x,screenY:y,pick,grabbed:!!b._grabbed,
    onScreen:x>r.left+20&&x<r.right-20&&y>r.top+20&&y<r.bottom-100};
  })};
}
export const naturalTownHook='window.__adaptiveRead='+naturalTownRead.toString()+';\n';

export async function naturalTownRoute(send,ev,durationMs,hostStart,out,options){
 const started=hostStart,deadline=hostStart+durationMs,log=[],held=new Set(),dragged=new Set();let pointer=null;
 const state=(picking=false)=>ev('__adaptiveRead('+JSON.stringify(picking)+')');
 const remaining=()=>Math.max(0,deadline-performance.now());
 async function keys(next){const ns=new Set(next);for(const key of held)if(!ns.has(key))await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});for(const key of ns)if(!held.has(key))await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});held.clear();for(const key of ns)held.add(key);}
 async function pause(ms){await sleep(Math.min(ms,remaining()));}
 async function mouse(type,x,y){pointer={x,y};await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});}
 function record(row){log.push({atMs:performance.now()-started,...row});fs.writeFileSync(out+'/adaptive-actions.json',JSON.stringify({initialIDs,draggedIDs:[...dragged],log},null,2));}
 const first=await state(),initialIDs=first.targets.map(t=>t.id).sort((a,b)=>a-b),groundY=first.state.y;
 assert.equal(initialIDs.length,5,'Exactly five untouched natural starters');record({action:'initial',state:first.state});
 function check(s){assert.deepEqual(s.targets.map(t=>t.id).sort((a,b)=>a-b),initialIDs,'Natural resident identities unchanged');assert(!s.state.paused&&!s.state.bath&&s.state.shop==='closed','Route remains ordinary gameplay');}
 try{
  // Natural weather accumulates first. No snow count, placement or ambient writes.
  const {warmupMs,warmupMax,snowTarget,dragMs}=options;
  assert(warmupMax>=warmupMs&&warmupMax<=durationMs-60000,'Warmup leaves input coverage time');
  await pause(warmupMs);
  while(performance.now()-started<warmupMax&&remaining()>60000){const warm=await state();check(warm);if(warm.state.snowActive>=snowTarget)break;record({action:'natural-snow-wait',snow:warm.state.snowActive,target:snowTarget,state:warm.state});await pause(5000);}
  record({action:'warmup-finished',snowTarget,state:(await state()).state});
  const attempts=[...initialIDs];for(let routeIndex=0;routeIndex<attempts.length;routeIndex++){const id=attempts[routeIndex];if(dragged.has(id))continue;
   if(remaining()<19000)break;
   let s=await state(),target=s.targets.find(t=>t.id===id),approachEnd=Math.min(deadline-17000,performance.now()+23000);
   record({action:'approach',id,playerX:s.state.x,targetX:target.x,snow:s.state.snowActive});
   while(performance.now()<approachEnd){check(s);target=s.targets.find(t=>t.id===id);if(target.onScreen&&Math.abs(target.x-s.state.x)<150)break;
    await keys([target.x>s.state.x?'ArrowRight':'ArrowLeft']);await pause(180);s=await state();}
   await keys([]);await pause(350);
   // Short real thrust beside the resident/snow, with a read-only altitude stop.
   const jetEnd=Math.min(deadline-15000,performance.now()+1600);
   while(performance.now()<jetEnd){s=await state();check(s);if(s.state.y<groundY-95)break;await keys(['ArrowUp']);await pause(120);}
   await keys([]);record({action:'jet-release',id,state:(await state()).state});await pause(1700);
   let success=false;
   for(let attempt=0;attempt<3&&remaining()>12000&&!success;attempt++){
    s=await state(true);check(s);target=s.targets.find(t=>t.id===id);
    if(!target.onScreen){await keys([target.x>s.state.x?'ArrowRight':'ArrowLeft']);await pause(550);await keys([]);continue;}
    const visiblePick=target.pick||s.targets.find(t=>t.pick&&!dragged.has(t.id))?.pick||s.targets.find(t=>t.pick)?.pick;
    if(!visiblePick){record({action:'occluded-pick',id,attempt});await pause(350);continue;}
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:visiblePick.x,y:visiblePick.y,buttons:0});
    await mouse('mousePressed',visiblePick.x,visiblePick.y);await pause(180);
    const grabbed=await state(),actual=grabbed.targets.find(t=>t.grabbed),actualId=actual?.id;
    record({action:'grab-check',id,attempt,actualId,holding:grabbed.state.holding,grabbed:!!actual?.grabbed,frame:grabbed.frame});
    if(actual?.grabbed&&grabbed.state.holding){
     const origin={x:actual.x,y:actual.y},startFrame=grabbed.frame,gripStart=performance.now();let maximumDisplacement=0,remainedHeld=true;
     const dragSteps=Math.ceil(dragMs/100);
     for(let k=1;k<=dragSteps&&remaining()>1000;k++){
      const current=await state();check(current);const currentBody=current.targets.find(t=>t.id===actualId);
      maximumDisplacement=Math.max(maximumDisplacement,Math.hypot(currentBody.x-origin.x,currentBody.y-origin.y));
      if(!currentBody.grabbed||!current.state.holding){remainedHeld=false;break;}
      const wx=origin.x+30*Math.sin(Math.PI*k/(2*dragSteps)),wy=origin.y-45*Math.sin(Math.PI*k/(2*dragSteps));
      const x=current.rect.left+(wx-current.state.cameraX)*current.scale,y=current.rect.top+(wy-current.state.cameraY)*current.scale;
      await mouse('mouseMoved',x,y);await pause(100);
     }
     const moved=await state(),body=moved.targets.find(t=>t.id===actualId),distance=Math.hypot(body.x-origin.x,body.y-origin.y);
     maximumDisplacement=Math.max(maximumDisplacement,distance);
     success=remainedHeld&&body.grabbed&&moved.state.holding&&maximumDisplacement>2&&moved.frame>startFrame+2&&performance.now()-gripStart>=10000;
     record({action:'drag-result',requestedId:id,id:actualId,success,distance,maximumDisplacement,heldMs:performance.now()-gripStart,remainedHeld,framesAdvancedDuringGrip:moved.frame-startFrame,from:origin,to:{x:body.x,y:body.y},state:moved.state});
     if(success)dragged.add(actualId);
    }
    if(pointer)await mouse('mouseReleased',pointer.x,pointer.y);await pause(500);
   }
   if(routeIndex===initialIDs.length-1&&remaining()>30000){const missing=initialIDs.filter(i=>!dragged.has(i));attempts.push(...missing);record({action:'retry-missing-ids',ids:missing});}
  }
  await keys([]);
  // Remaining time is ordinary irregular traversal, with modest jet pulses.
  let heading='ArrowRight',step=0;
  while(remaining()>1000){const s=await state();check(s);const xs=s.targets.map(t=>t.x);
   if(s.state.x>Math.max(...xs)+100)heading='ArrowLeft';if(s.state.x<Math.min(...xs)-100)heading='ArrowRight';
   const thrust=step++%9===4&&s.state.y>groundY-90;await keys(thrust?[heading,'ArrowUp']:[heading]);record({action:'traverse',keys:[...held],state:s.state});await pause(thrust?400:950);}
  await keys([]);await pause(remaining());
 }finally{await keys([]);if(pointer)await mouse('mouseReleased',pointer.x,pointer.y);}
 return {initialIDs,draggedIDs:[...dragged],options,log};
}
