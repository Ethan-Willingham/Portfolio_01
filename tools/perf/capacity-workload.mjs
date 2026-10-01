// Controlled population fixtures inside the ordinary game closure.
// Initial conditions only. Every subsequent solve, sleep, contact and render is live.
export const capacityWorkloadHook = `
var capacityBodyWork={trace:null,frames:[],calls:0,points:0,springs:0};
var capacityOriginalInternal=jelloBodyInternalSubstep,capacityOriginalUpdate=updateJello;
jelloBodyInternalSubstep=function(b,h){
 capacityBodyWork.calls++;capacityBodyWork.points+=b.n;capacityBodyWork.springs+=b.springN||0;
 return capacityOriginalInternal(b,h);
};
updateJello=function(dt){
 capacityBodyWork.calls=capacityBodyWork.points=capacityBodyWork.springs=0;
 var result=capacityOriginalUpdate(dt);
 if(playPerfActive){
  if(capacityBodyWork.trace!==playPerfTrace){capacityBodyWork.trace=playPerfTrace;capacityBodyWork.frames=[];}
  var active=jelloRecordedMicrosteps?jelloActive.filter(function(b){return jelloBodies.indexOf(b)>=0;}):[];
  var solving=active.filter(function(b){return b._solve&&!b.sleeping;}),onscreen=0;
  for(var c=0;c<active.length;c++){var b=active[c];if(!(b.bboxR<cam.x||b.bboxL>cam.x+screenW||b.bboxB<cam.y||b.bboxT>cam.y+screenH))onscreen++;}
  capacityBodyWork.frames.push(playPerfTrace.frameCount,capacityBodyWork.calls,capacityBodyWork.points,capacityBodyWork.springs,active.length,solving.length,onscreen);
 }
 return result;
};
window.__capacityWorkload={
 work:function(){return {columns:['frameId','internalBodyCalls','internalPointSteps','internalSpringSteps','activeBodies','solvingBodies','onscreenActiveBodies'],stride:7,frames:capacityBodyWork.frames};},
 setup:function(options){
  if(introPhase!=='done'||gamePaused||bathMode)throw Error('Ordinary gameplay required');
  if(worldSnowEnabled||snow.active||snow.grains.length||snow.parked.length)throw Error('Controlled fixture must boot with snow=0');
  surfaceSlimeGrabEnd(undefined,true);
  for(var i=jelloBodies.length-1;i>=0;i--)if(jelloBodies[i].surfaceSlime)jelloBodies.splice(i,1);
  jelloCount=jelloTotalPoints();surfaceSlimesSeeded=true;surfaceSlimeGuests.length=0;
  var columns=Math.max(1,Math.ceil(Math.sqrt(options.slimes)),Math.ceil(options.slimes/5)),spacing=options.layout==='dispersed'?74:54;
  var needed=Math.max(22,Math.ceil(columns*spacing/TILE)+2),best=null;
  for(var start=DECK_CENTER_COL-60;start<DECK_CENTER_COL+60;start++){
   var legal=true;
   for(var c=start;c<start+needed;c++)if(!tileAt(SKY_ROWS,c)||tileAt(SKY_ROWS-1,c)){legal=false;break;}
   if(legal&&(!best||Math.abs(start+needed/2-DECK_CENTER_COL)<Math.abs(best+needed/2-DECK_CENTER_COL)))best=start;
  }
  if(best===null)throw Error('No wide existing dry apron for controlled population');
  var center=(best+needed/2)*TILE,floor=SKY_ROWS*TILE;
  var grainPitch=LIQUID_CELL/Math.sqrt(LIQUID_SNOW_DENSITY),grainWidth=options.layout==='dispersed'?340:180;
  var grainColumns=Math.floor(grainWidth/grainPitch),bedHeight=Math.ceil(options.snow/grainColumns)*grainPitch;
  player.x=center-160-PLAYER_W/2;player.y=floor-PLAYER_H-2;player.renderX=player.x;player.renderY=player.y;
  player.vx=player.vy=0;player.thrusting=false;player.onGround=true;
  cam.snap=true;updateCamera();
  var initial=[];
  for(var n=0;n<options.slimes;n++){
   var x=center+(n%columns-(columns-1)/2)*spacing,y=floor-bedHeight-60-Math.floor(n/columns)*spacing;
   var b=surfaceSlimeBuild(x,y,{id:10000+n,r:25,seed:0.08+(n%5)*0.19,hue:surfaceSlimeHues[n%5]});
   if(!b)throw Error('Ordinary resident constructor rejected count '+n);
   initial.push({id:b.surfaceSlime.id,x:b.cx,y:b.cy,n:b.n,ringN:b.ringN,springN:b.springN});
  }
  if(options.snow){
   snowReset(true);snow.primed=true;
   var pitch=grainPitch,width=grainWidth;
   var across=Math.floor(width/pitch),left=center-width/2;
   for(var grain=0;grain<options.snow;grain++){
    var gx=left+(grain%across+0.5)*pitch,gy=floor-pitch/2-Math.floor(grain/across)*pitch;
    if(liquidWorldSolidAt(gx,gy))throw Error('Seeded grain intersects existing terrain');
    if(addLiquidParticle(5,gx,gy,0,0,RAIN_ORIGIN)<0)throw Error('Ordinary grain constructor rejected count');
   }
   snow.active=snow.mass=snow.emitted=options.snow;
   // Fixed physical population for attribution: suppress new atmospheric flakes.
   // No solver grains are removed, merged, frozen or replaced by this fixture.
   snowSpawn=function(){return null;};
  }
  window.__capacityFixture={schema:'sluice-controlled-capacity-v3',options:options,center:center,floor:floor,
   spacing:spacing,initialRig:{x:player.x,y:player.y},initialClearance:{rigVertical:34,snowVertical:34},initialResidents:initial,terrain:'Existing generated town apron, no tile writes',
   fixedPhysicalSnow:!!options.snow,atmosphericEmissionSuppressed:!!options.snow,
   notes:['Synthetic initial populations using ordinary constructors. Not a natural resident FPS claim.',
    'Subsequent ordinary updates own all positions, velocities, sleeping, culling and contacts.']};
  return window.__capacityWorkload.state();
 },
 state:function(){
  var bodies=jelloBodies.filter(function(b){return !!b.surfaceSlime;});
  var visible=bodies.filter(function(b){return !(b.bboxR<cam.x||b.bboxL>cam.x+screenW||b.bboxB<cam.y||b.bboxT>cam.y+screenH);});
  return {fixture:window.__capacityFixture,state:playPerfState(),onscreenResidents:visible.length,
   activeContactBodies:jelloRecordedMicrosteps?jelloActive.filter(function(b){return jelloBodies.indexOf(b)>=0;}).length:0,solvingBodies:jelloRecordedMicrosteps?jelloActive.filter(function(b){return b._solve&&jelloBodies.indexOf(b)>=0;}).length:0,
   guests:surfaceSlimeGuests.length,worldScale:worldScale,screenW:screenW,screenH:screenH,
   caps:{bodies:JELLO_MAX_BODIES,points:JELLO_MAX_POINTS,snow:SNOW_ACTIVE_CAP},
   solver:{residentMaterial:typeof SOFT_MATERIAL!=='undefined'&&SOFT_MATERIAL?'softMaterial':'reference',kind:JELLO_SOLVER,h:JELLO_H,timescale:JELLO_TIMESCALE,microstepMultiplier:JELLO_XPBD_SUBSTEPS}};
 }
};
`;
