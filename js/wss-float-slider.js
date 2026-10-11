/* Opt-in full-stiffness slime on a fixed vertical guide and slow linked seat. */
(function(root){
'use strict';
function create(options){
 var body=options.body,d=options.slider,N=options.boundary,L=options.liquid;
 if(!body||body.n<3||!d||!N||!L||!Number.isFinite(d.minY+d.maxY+d.stroke)||d.minY>d.maxY||!(d.stroke>0))throw Error('A finite vertical float guide and linked seat are required.');
 var opening=root.WSSBoundaries.normalizeCaps([d.opening])[0],fixed=(options.staticCaps||[]).slice(),qx=new Float64Array(body.n),qy=new Float64Array(body.n),cx=0,cy=0,retired=false,steps=0,updates=0,lastCaps='',velocity=0,error=null;
 for(var i=0;i<body.n;i++){cx+=body.px[i];cy+=body.py[i];}cx/=body.n;cy/=body.n;
 if(cy<d.minY||cy>d.maxY||cy-d.stroke<d.minY)throw Error('The float must start inside its travel stops.');
 var pinY=cy,area=body.restArea;
 for(i=0;i<body.n;i++){qx[i]=body.px[i]-cx;qy[i]=body.py[i]-cy;}
 function pose(){var y=0,previous=0;for(var i=0;i<body.n;i++){y+=body.py[i];previous+=body.oy[i];}return {y:y/body.n,previous:previous/body.n};}
 function openness(y){return Math.max(0,Math.min(1,(y-pinY+d.stroke)/d.stroke));}
 function project(b,h,timescale){
  if(retired||b!==body)return;var p=pose(),dt=h/timescale;
  if(!(dt>0&&Number.isFinite(p.y+p.previous+dt)))throw Error('The float guide received a non-finite pose.');
  // Constrained least-squares shape match: translation on y is its only degree
  // of freedom. The mean predicted y survives; no target water level is assigned.
  var y=d.pinned?pinY:Math.max(d.minY,Math.min(d.maxY,p.y)),v=(p.y-p.previous)/dt;
  if(d.pinned||(y===d.minY&&v<0)||(y===d.maxY&&v>0))v=0;
  velocity=v;body.bboxL=body.bboxT=Infinity;body.bboxR=body.bboxB=-Infinity;
  for(var i=0;i<body.n;i++){
   body.px[i]=cx+qx[i];body.py[i]=y+qy[i];body.ox[i]=body.px[i];body.oy[i]=body.py[i]-v*dt;
   body.bboxL=Math.min(body.bboxL,body.px[i]);body.bboxR=Math.max(body.bboxR,body.px[i]);body.bboxT=Math.min(body.bboxT,body.py[i]);body.bboxB=Math.max(body.bboxB,body.py[i]);
  }
  body.cx=cx;body.cy=y;body.shRc=1;body.shRs=0;body.shL00=body.shL11=1;body.shL01=body.shL10=0;steps++;
 }
 function sync(){
  if(retired)return;var p=pose(),open=openness(p.y),caps=fixed.slice();
  if(open<1)caps.push({axis:opening.axis,at:opening.at,start:opening.start,end:opening.start+(opening.end-opening.start)*(1-open)});
  var key=JSON.stringify(caps);if(key!==lastCaps){N.setCaps(caps);lastCaps=key;updates++;}
 }
 var controller={body:body,ready:true,
  prepare:function(){if(retired)return;body.sleeping=false;body.sleepFrames=0;},project:project,sync:sync,
  stats:function(){var p=pose(),rigid=0,finite=true;for(var i=0;i<body.n;i++){
   rigid=Math.max(rigid,Math.abs(body.px[i]-cx-qx[i]),Math.abs(body.py[i]-p.y-qy[i]));finite=finite&&Number.isFinite(body.px[i]+body.py[i]+body.ox[i]+body.oy[i]);}
   return {x:cx,y:p.y,velocity:velocity,pinned:!!d.pinned,pinY:pinY,openness:openness(p.y),rigidityError:rigid,referenceArea:area,steps:steps,geometryUpdates:updates,clock:L.simulationClock,finite:finite,error:error,model:'Full-stiffness constrained shape match; existing delayed slime buoyancy and drag; slow current-body-pose shutter; fluid/body momentum and projection work are not closed.'};},
  draw:function(c){var y=pose().y,open=openness(y),end=opening.start+(opening.end-opening.start)*(1-open);
   c.save();c.globalAlpha=.6;c.beginPath();c.moveTo(cx,d.minY-28);c.lineTo(cx,d.maxY+28);c.stroke();c.globalAlpha=1;
   c.beginPath();c.moveTo(cx,y);c.lineTo(opening.at+12,y);c.lineTo(opening.at+12,opening.start);c.lineTo(opening.at,opening.start);c.stroke();
   c.lineWidth=3;c.beginPath();if(opening.axis==='x'){c.moveTo(opening.at,opening.start);c.lineTo(opening.at,end);}else{c.moveTo(opening.start,opening.at);c.lineTo(end,opening.at);}c.stroke();
   c.fillText(d.pinned?'Float pinned':'Guided float',cx+36,y+4);c.restore();},
  destroy:function(){if(retired)return;retired=true;controller.ready=false;if(L.toyNativeExtension===N&&N.ready&&!N.error)N.setCaps(fixed);delete body.floatSlider;}
 };body.floatSlider=controller;return controller;
}
root.WSSFloatSlider={create:create};
})(typeof window!=='undefined'?window:globalThis);
