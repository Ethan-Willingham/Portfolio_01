/* The ballast valve is a missing interval in a carried two-sided water skin. */
(function(root){
'use strict';
function make(w,o){
 o=o||{};var d=root.WSSMachines['water-balloons'].make(w,o),r={x:152,y:144,width:416,height:240};
 d.name='slime-submarine';d.title='Floodable slime submarine';d.draft=true;delete d.source;
 d.vessels=[{id:'basin',label:'Water',rect:r,sealed:false}];d.initial=[{kind:'rect',rect:{x:160,y:240,width:400,height:136}}];
 d.slimes=[{x:360,y:216,radius:44}];d.seedClear=function(x,y){return Math.hypot(x-360,y-216)>50;};d.membrane={seedBoth:true,slit:false,valveSlit:5};
 d.primary={kind:'ballast-valve',target:{x:432,y:180,width:120,height:28}};d.action='Flood ballast';d.submarine={dryDensity:.68,blocked:!!o.blocked};
 d.setup=o.blocked?'blocked':'valve';d.setups=[{id:'valve',label:'Floodable ballast',options:{}},{id:'blocked',label:'Blocked valve control',options:{blocked:true}}];
 d.setupNote='The blocked valve leaves the same light hull sealed. The flood valve exposes a real gap; no water is moved or deleted.';
 d.caption='Open the ballast valve to let real water enter the carried tank. Close it to trap the same water, then drag the loaded submarine.';
 d.viewBounds={x:64,y:64,width:592,height:328};d.readingLabel='Ballast closed';d.draftGravity=1;
 d.boundaryNote='The smooth elastic skin is a two-sided native-water container. Opening the ballast valve removes one interval of its collision curve. Native parcels enter through that actual opening and remain carried after it closes. Mass comes from the measured number of parcels inside the current skin, each of mass 0.002. No parcel is created, deleted or teleported by the valve. The blocked-valve comparison remains sealed.';
 d.energyBudgetStatus='The shell dry mass is 0.68 times its initial displaced-water mass. Buoyancy uses the established one-way surface approximation with total shell and carried native-water mass. Membrane contact reactions and asynchronous parcel counting approximate a floodable two-dimensional tank, with no calibrated submarine or closed energy claim.';
 return d;
}
var previous=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(c){
 if(!c.definition.submarine)return previous&&previous.create?previous.create(c):null;
 var b=c.bodies[0],m=c.membrane,d=c.definition,L=c.liquid,geom=root.WSSWaterBalloons.geometry,open=false,initialY=b.cy;
 var a=0;for(var k=0;k<b.ringN;k++){var i=b.ring[k],j=b.ring[(k+1)%b.ringN];a+=b.px[i]*b.py[j]-b.px[j]*b.py[i];}a=Math.abs(a)*.5;
 var displaced=a*.002/1.5625,dry=displaced*d.submarine.dryDensity,count=0,max=0;
 b.ballastBuoyancy=true;b.fluidDensityRatio=d.submarine.dryDensity;b.nativePointMass=dry/b.n;
 return {primary:function(){if(d.submarine.blocked){d.action='Valve blocked';return true;}open=!open;m.setSlit(open);d.action=open?'Close ballast':'Flood ballast';b.sleeping=false;b.sleepFrames=0;return true;},
 tick:function(){var s=m.stats();count=s.carriedInside||0;max=Math.max(max,count);var total=dry+count*.002;b.fluidDensityRatio=total/displaced;b.nativePointMass=total/b.n;
  var bins=new Uint16Array(90*50),arr=L.liquid.arrays,n=L.liquid.getCount(),levels=[];for(var i=0;i<n;i++){var x=arr.x[i],y=arr.y[i];if(x<104||x>616||Math.abs(x-b.cx)<70||y<100||y>376)continue;bins[Math.floor(y/8)*90+Math.floor(x/8)]++;}
  for(var col=13;col<77;col++){if(Math.abs(col*8-b.cx)<70)continue;for(var row=12;row<47;row++)if(bins[row*90+col]>=10){levels.push(row*8);break;}}
  if(levels.length>6){levels.sort(function(x,y){return x-y;});b.fluidSurfaceY=levels[Math.floor(levels.length/2)];}
  d.readingLabel=(open?'Ballast open, ':'Ballast closed, ')+count+' carried parcels';d.submarineReading={open:open,blocked:d.submarine.blocked,carried:count,maxCarried:max,dryMass:dry,totalMass:total,density:b.fluidDensityRatio,y:b.cy,dy:b.cy-initialY,waterCount:s.waterCount,nonfinite:s.nonfinite,sideViolations:s.sideViolations};
 },stats:function(){return d.submarineReading;},destroy:function(){delete b.ballastBuoyancy;delete b.fluidDensityRatio;delete b.nativePointMass;delete b.fluidSurfaceY;}};
}};
root.WSSMachines['slime-submarine']={make:make};root.WSSSlimeSubmarine={make:make};
})(typeof window!=='undefined'?window:globalThis);
