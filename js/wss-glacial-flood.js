/* Buoyancy opens the native outlet: no linked shutter or assigned body path. */
(function(root){
'use strict';
function r(x,y,width,height){return {x:x,y:y,width:width,height:height};}
function make(w,o){
 o=o||{};
 if(!root.WSSDraftBodies)throw Error('Floating-dam rigid-body helpers are required.');
 root.WSSDraftBodies.shapes['ice-dam']=['####','####','####','####','####','####'];
 if(w.w!==720||w.h!==400)throw Error('The floating dam requires the ordinary toy box.');
 var dense=!!o.dense, lake=r(80,64,344,288),basin=r(472,272,200,112);
 return {name:'glacial-flood',title:'Floating ice-dam flood',draft:true,seed:o.seed||17,
  setup:dense?'dense':'ice',setups:[{id:'ice',label:'Floating barrier',options:{dense:false}},{id:'dense',label:'Dense barrier control',options:{dense:true}}],
  action:'Stop inflow',primary:{kind:'tap'},readingLabel:'Floating dam',
  caption:'The rising lake lifts the barrier and opens its outlet. Compare the dense barrier, which cannot float.',
  viewBounds:r(64,32,624,360),vessels:[{id:'lake',label:'Rising lake',rect:lake,sealed:false},{id:'basin',label:'Flood basin',rect:basin,sealed:false}],
  pipes:[{points:[{x:408,y:328},{x:584,y:328}],bore:48}],solids:[],vents:[r(400,232,32,128)],parts:[],
  slimes:[{x:416,y:336,radius:24,shape:'ice-dam'}],draftRig:[{body:0,kind:'rail',a:{x:416,y:240},b:{x:416,y:336}}],
  initial:[{kind:'rect',rect:r(88,328,304,16)}],marks:[],meters:[],
  settings:{enabled:false},boundaries:{pool:true,tap:{x:216,y:88,width:16,height:4,rate:2400,vx:0,vy:20,enabled:true},drain:null,caps:[]},
  measure:{source:lake,receiver:basin},floatDam:{density:dense?2:.92},
  boundaryNote:'The barrier is an ice-density stiff gel stand-in on an ideal vertical guide. Its actual moving collision skin blocks the outlet; buoyancy, gravity and water drag determine its motion. A declared tap raises the lake. There is no timed valve or prescribed lift. Freezing and melting are absent.',
  energyBudgetStatus:'Body buoyancy uses the established one-way water-surface approximation, with relative density 0.92 (ice) or 2 (dense control). The upstream free surface is measured from occupied native mirror columns, excluding the tap stream and samples older than 300 ms. Fluid reaction and rigid-guide projection work are not closed.'};
}
var previous=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(c){
 if(!c.definition.floatDam)return previous&&previous.create?previous.create(c):null;
 var b=c.bodies[0],density=c.definition.floatDam.density,initial=b.cy,L=c.liquid,applied=-Infinity,updated=-Infinity,surface=null,columns=0,age=Infinity;
 if(!b||!Number.isFinite(density)||density<=0)throw Error('A finite positive floating-barrier density is required.');
 b.fluidDensityRatio=density;
 return {tick:function(){
  var now=performance.now();
  if(L.readbackAppliedTime!==applied){applied=L.readbackAppliedTime;updated=now;}
  age=now-updated;
  if(!Number.isFinite(applied)||age>300){delete b.fluidSurfaceY;surface=null;columns=0;return;}
  var bins=new Uint16Array(90*50),a=L.liquid.arrays,n=L.liquid.getCount(),levels=[];
  for(var i=0;i<n;i++){var x=a.x[i],y=a.y[i];if(x<104||x>=384||y<128||y>=344||x>=200&&x<248)continue;bins[Math.floor(y/8)*90+Math.floor(x/8)]++;}
  for(var col=13;col<48;col++){if(col>=25&&col<31)continue;for(var row=16;row<43;row++)if(bins[row*90+col]>=10){levels.push(row*8);break;}}
  columns=levels.length;
  if(columns>=6){levels.sort(function(a,b){return a-b;});surface=levels[Math.floor(columns/2)];b.fluidSurfaceY=surface;}else{surface=null;delete b.fluidSurfaceY;}
 },stats:function(){return {densityRatio:density,startY:initial,y:b.cy,lift:initial-b.cy,wetCells:b._wetCells||0,surfaceY:surface,surfaceColumns:columns,mirrorAgeMs:age,finite:[...b.px,...b.py,...b.ox,...b.oy].every(Number.isFinite),model:'Native moving barrier; density-scaled approximate one-way buoyancy.'};},destroy:function(){delete b.fluidDensityRatio;delete b.fluidSurfaceY;}};
}};
root.WSSMachines=root.WSSMachines||{};root.WSSMachines['glacial-flood']={make:make};
})(typeof window!=='undefined'?window:globalThis);
