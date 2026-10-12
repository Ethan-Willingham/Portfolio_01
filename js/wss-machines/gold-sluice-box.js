/* Finite wash water, mixed quartz/gold feed and physical riffle pockets. */
(function(root){
'use strict';
function rect(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function make(world,options){
 options=options||{};
 if(world.w!==720||world.h!==400||world.tile!==8)throw Error('The sluice needs a 720 by 400 world.');
 var matched=options.matched===true,plain=options.riffles===false,solids=[],pockets=[],polygons=[],seedPolygons=[];
 function floor(x){return 176+(x-72)*80/536;}
 function slab(x0,x1,rise,depth){return [[x0,floor(x0)-rise],[x1,floor(x1)-rise],[x1,floor(x1)+depth],[x0,floor(x0)+depth]];}
 polygons.push(slab(72,608,0,16));seedPolygons.push(polygons[0]);
 for(var sx=240;sx<608;sx+=72)seedPolygons.push(slab(sx,sx+8,6,0));
 // An open downhill bed drains into a separate tailings tank. No downstream
 // wall raises the wash into a static pool, and no upstream sump traps feed.
 solids.push(rect(64,48,8,136));
 if(!plain)for(var x=240;x<608;x+=72){
  polygons.push(slab(x,x+8,6,0));pockets.push(rect(x+8,floor(x+8)-6,56,16));
 }
 return {name:'gold-sluice-box',title:'Gold sluice box',seed:options.seed||17,
  action:'Pour wash water',primary:{kind:'pour',target:{x:120,y:64}},
  setup:matched?'matched-density':plain?'no-riffles':'ordinary',caption:'The blue water washes pale sand down the slope. Gold grains settle at the riffles. The initial supply is finite. Hold Pour to add wash water; releasing stops the source.',
  readingLabel:'Sand and gold',viewBounds:rect(48,32,656,368),
  vessels:[{id:'tailings',label:'Water and washed sand',rect:rect(480,288,216,96),sealed:false}],
  pipes:[],solids:solids,vents:[],parts:[],slimes:[],marks:[],meters:[],
  initial:[{kind:'rect',rect:rect(72,72,128,104)},{kind:'rect',rect:rect(200,176,400,32)}],
  seedClear:function(x,y){
   return seedPolygons.every(function(points){
    var inside=true,nearest=Infinity;
    points.forEach(function(a,i){var b=points[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1];
     if((x-a[0])*dy-(y-a[1])*dx>0)inside=false;
     var t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
     nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
    });return !inside && nearest>=.71;
   });
  },
  materialAt:function(x,y){
   if(x>=200 && x<232 && y>=176 && y<192){
    var col=Math.floor((x-8.625)/1.25),row=Math.floor((y-8.625)/1.25);
    if((col+row)%3===0)return (col+row)%6===0?'gold':'sand';
   }
   return 'water';
  },
  materialSlip:{density:[1,.7733,2.65,matched?2.65:19.3],drag:[4,600,600,4,4,4],separateGold:true,grainContacts:true,bed:{line:[72,176,608,256],riffles:[240,72,8,6],count:plain?0:6,thickness:16}},
  sluice:{polygons:polygons,pockets:pockets,tailingsX:608,matched:matched,riffles:!plain},
  setups:[{id:'ordinary',label:'Sand and gold',options:{}},{id:'matched-density',label:'Equal densities',options:{matched:true}},
   {id:'no-riffles',label:'Without riffles',options:{riffles:false}}],
  settings:{},boundaries:null,
  source:{title:'USGS: gold density and gravity separation',url:'https://pubs.usgs.gov/gip/prospect1/goldgip.html'},
  boundaryNote:'The initial water and mixed grains enter an open, sloping bed. Holding Pour adds water at the upper source; release stops new input. Every parcel retains its identity and stays in the simulated world, including the tailings tank.',
  energyBudgetStatus:'Water, sand and gold carry separate APIC momentum under common gravity and shared compressive pressure. Pair drag and grain contact impulses are equal and opposite. Grain contacts use mass-weighted nonpenetration and Coulomb friction. Density ratios are water 1, quartz 2.65 and pure gold 19.3. The reduced 2D model has exploratory drag, numerical water filters and contact/pressure projection work; it is not a calibrated recovery-efficiency prediction.',
  measure:{source:rect(72,48,128,144),receiver:rect(480,288,216,96)}};
}
root.WSSMachines=root.WSSMachines||{};
root.WSSMachines['gold-sluice-box']={make:make};
})(typeof window!=='undefined'?window:globalThis);
