/* Read-only measurements. All samples come from particle or GPU snapshots.
 * This module never changes water, gas, walls, velocities or machine phases.
 */
(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.WaterMachinesInstruments=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  var WATER_WEIGHT=0.0361273, EARTH_G=386.0886;
  var bitViews=new WeakMap();
  function finite(value,name){if(!Number.isFinite(value))throw new Error('Instrument: invalid '+name);return value;}
  function scale(options){
    options=options || {};
    var width=finite(options.width,'width'),g=options.referenceGravity===undefined ? 250 : finite(options.referenceGravity,'gravity');
    var density=options.density===undefined ? 1 : finite(options.density,'density');
    if(width<=0 || g<=0 || density<=0)throw new Error('Instrument: scale must be positive');
    var length=30/width,time=Math.sqrt(length*g/EARTH_G);
    return {inchesPerPixel:length,secondsPerSimulationSecond:time,referenceGravity:g,
      depthInches:1,particleArea:1.5625,density:density,
      inches:function(px){return px*length;},seconds:function(s){return s*time;},
      speed:function(pxPerS){return pxPerS*length/time;},
      psi:function(p){return p/(density*g)*length*WATER_WEIGHT;},
      volume:function(area){return area*length*length;},
      flow:function(areaPerS){return areaPerS*length*length/time;},
      work:function(pTimesArea){return pTimesArea/(density*g)*length*WATER_WEIGHT*length*length/12;}};
  }
  function quantile(values,q){
    if(!values.length)return null;
    var a=values.slice().sort(function(x,y){return x-y;}),i=Math.max(0,Math.min(a.length-1,(a.length-1)*q));
    var lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);
  }
  function vessel(particles,rect,options){
    options=options || {};var tile=options.tile || 8,area=options.particleArea || 1.5625;
    var cols=Math.ceil(rect.width/tile),rows=Math.ceil(rect.height/tile);
    var bins=new Uint32Array(cols*rows),n=0,energyHeight=0;
    for(var i=0;i<particles.count;i++){
      var x=particles.x[i],y=particles.y[i];
      if(x<rect.x+tile || x>=rect.x+rect.width-tile || y<rect.y || y>=rect.y+rect.height-tile)continue;
      n++;energyHeight+=options.floor===undefined ? -y : options.floor-y;
      var col=Math.floor((x-rect.x)/tile),row=Math.floor((y-rect.y)/tile);
      bins[row*cols+col]++;
    }
    var levels=[],threshold=tile*tile/area*.25;
    for(col=1;col<cols-1;col++)for(row=0;row<rows;row++){
      if(bins[row*cols+col]<threshold)continue;
      levels.push(rect.y+(row+.5)*tile);break;
    }
    return {count:n,area:n*area,level:quantile(levels,.5),levelSpread:levels.length ? quantile(levels,.9)-quantile(levels,.1) : null,
      sampledColumns:levels.length,heightArea:energyHeight*area};
  }
  function cell(snapshot,x,y){
    if(!snapshot)return null;
    var col=Math.floor(x/snapshot.cellSize),row=Math.floor(y/snapshot.cellSize);
    if(col<0 || row<0 || col>=snapshot.width || row>=snapshot.height)return null;
    var i=row*snapshot.width+col,stride=snapshot.cellStride || 8;
    var bits=bitViews.get(snapshot);
    if(!bits){bits=new Uint32Array(snapshot.cells.buffer,snapshot.cells.byteOffset,snapshot.cells.length);bitViews.set(snapshot,bits);}
    var solid=snapshot.geometry ? snapshot.geometry[i*(snapshot.geometryStride || 8)] : 0;
    return {index:i,fraction:snapshot.cells[i*stride],kind:bits[i*stride+3],
      solidFraction:solid,accessibleArea:Math.max(0,1-solid)*snapshot.cellSize*snapshot.cellSize,
      openFaces:snapshot.geometry ? snapshot.geometry.subarray(i*(snapshot.geometryStride || 8)+4,i*(snapshot.geometryStride || 8)+8) : null,
      pressure:snapshot.pressure[i*4],vx:snapshot.cells[i*stride+1]+snapshot.pressure[i*4+1],
      vy:snapshot.cells[i*stride+2]+snapshot.pressure[i*4+2],
      residual:snapshot.pressure[i*4+3],root:snapshot.labels[i*2]};
  }
  function section(snapshot,meter){
    if(!snapshot)return null;
    var dx=meter.b.x-meter.a.x,dy=meter.b.y-meter.a.y,length=Math.hypot(dx,dy);
    var count=Math.max(1,Math.ceil(length/snapshot.cellSize)),flux=0,wetLength=0,pressure=0;
    for(var k=0;k<count;k++){
      var t=(k+.5)/count,s=cell(snapshot,meter.a.x+dx*t,meter.a.y+dy*t);
      if(!s || s.kind!==1)continue;
      var width=length/count*Math.max(0,Math.min(1,s.fraction));
      var speed=(meter.axis==='x' ? s.vx : s.vy)*(meter.positive || 1);
      flux+=speed*width;wetLength+=width;pressure+=s.pressure*width;
    }
    return {areaPerSecond:flux,speed:wetLength ? flux/wetLength : 0,wetLength:wetLength,
      pressure:wetLength ? pressure/wetLength : null,simulationTime:snapshot.simulationTime};
  }
  function createCrossings(meter,options){
    options=options || {};var area=options.particleArea || 1.5625,previous=null;
    var totalForward=0,totalBackward=0,oldX=new Float32Array(0),oldY=new Float32Array(0);
    function side(x,y){return meter.axis==='x' ? x-meter.a.x : y-meter.a.y;}
    function along(x,y){return meter.axis==='x' ? y : x;}
    var lo=Math.min(along(meter.a.x,meter.a.y),along(meter.b.x,meter.b.y));
    var hi=Math.max(along(meter.a.x,meter.a.y),along(meter.b.x,meter.b.y));
    return {reset:function(){previous=null;totalForward=totalBackward=0;},
      sample:function(p){
        if(previous && p.time<=previous.time)return previous.result;
        var forward=0,backward=0,forwardIds=[],backwardIds=[],dt=previous ? p.time-previous.time : 0;
        if(previous && p.count<previous.count){previous=null;dt=0;}
        if(oldX.length<p.count){
          var capacity=Math.max(p.count,oldX.length*2),nextX=new Float32Array(capacity),nextY=new Float32Array(capacity);
          nextX.set(oldX);nextY.set(oldY);oldX=nextX;oldY=nextY;
        }
        for(var i=0;i<p.count;i++){
          var x=p.x[i],y=p.y[i],s=side(x,y),oldSide=side(oldX[i],oldY[i]);
          if(previous && i<previous.count && dt>0 && oldSide*s<0){
            var t=oldSide/(oldSide-s),a=along(oldX[i]+(x-oldX[i])*t,oldY[i]+(y-oldY[i])*t);
            if(a>=lo && a<=hi){if((s-oldSide)*(meter.positive || 1)>0){forward++;forwardIds.push(i);}else{backward++;backwardIds.push(i);}}
          }
          oldX[i]=x;oldY[i]=y;
        }
        totalForward+=forward*area;totalBackward+=backward*area;
        var result={forwardArea:forward*area,backwardArea:backward*area,totalForwardArea:totalForward,
          totalBackwardArea:totalBackward,netArea:totalForward-totalBackward,
          areaPerSecond:dt ? (forward-backward)*area/dt : null,dt:dt,sampleTime:p.time,
          forwardIds:forwardIds,backwardIds:backwardIds,
          limitation:'Net straight-segment crossings between snapshots; back-and-forth crossings within one sample are unresolved.'};
        previous={time:p.time,count:p.count,result:result};return result;
      }};
  }
  function particleSection(particles,meter,options){
    options=options || {};var thickness=options.thickness || 5,area=options.particleArea || 1.5625;
    var plane=meter.axis==='x' ? meter.a.x : meter.a.y;
    var lo=Math.min(meter.axis==='x' ? meter.a.y : meter.a.x,meter.axis==='x' ? meter.b.y : meter.b.x),
      hi=Math.max(meter.axis==='x' ? meter.a.y : meter.a.x,meter.axis==='x' ? meter.b.y : meter.b.x);
    var count=0,sum=0;
    for(var i=0;i<particles.count;i++){
      var distance=(meter.axis==='x' ? particles.x[i] : particles.y[i])-plane,
        along=meter.axis==='x' ? particles.y[i] : particles.x[i];
      if(Math.abs(distance)>=thickness*.5 || along<lo || along>=hi)continue;
      count++;sum+=(meter.axis==='x' ? particles.vx[i] : particles.vy[i])*(meter.positive || 1);
    }
    return {count:count,speed:count ? sum/count : 0,areaPerSecond:sum*area/thickness,
      sampledWaterArea:count*area,thickness:thickness,sampleTime:particles.time};
  }
  function gasWork(pressure,volume,atmosphere){
    if(!(volume>=0 && atmosphere>0 && atmosphere+pressure>0))throw new Error('Instrument: invalid gas state');
    var absolute=atmosphere+pressure,equilibrium=absolute*volume/atmosphere;
    return Math.max(0,absolute*volume*Math.log(equilibrium/volume)-atmosphere*(equilibrium-volume)) || 0;
  }
  function waterEnergy(particles,options){
    options=options || {};
    var area=options.particleArea || 1.5625,floor=finite(options.floor,'energy datum'),
      gravity=options.gravity===undefined ? 250 : finite(options.gravity,'gravity'),
      density=options.density===undefined ? 1 : finite(options.density,'density');
    var heightArea=0,kinetic=0;
    for(var i=0;i<particles.count;i++){
      heightArea+=(floor-particles.y[i])*area;
      kinetic+=.5*density*area*(particles.vx[i]*particles.vx[i]+particles.vy[i]*particles.vy[i]);
    }
    return {potential:density*gravity*heightArea,kinetic:kinetic,heightArea:heightArea,
      total:density*gravity*heightArea+kinetic,count:particles.count,sampleTime:particles.time};
  }
  function acousticEnergy(snapshot,density,soundSpeed){
    if(!(density>0 && soundSpeed>0))throw new Error('Instrument: invalid acoustic scale');
    var total=0,bits=bitViews.get(snapshot);
    if(!bits){bits=new Uint32Array(snapshot.cells.buffer,snapshot.cells.byteOffset,snapshot.cells.length);bitViews.set(snapshot,bits);}
    for(var i=0;i<snapshot.width*snapshot.height;i++){
      if(bits[i*(snapshot.cellStride || 8)+3]!==1)continue;
      var solid=snapshot.geometry ? snapshot.geometry[i*(snapshot.geometryStride || 8)] : 0;
      var p=snapshot.pressure[i*4];
      total+=p*p/(2*density*soundSpeed*soundSpeed)*snapshot.cells[i*(snapshot.cellStride || 8)]*Math.max(0,1-solid)*snapshot.cellSize*snapshot.cellSize;
    }
    return total;
  }
  function materialEnergy(particles,options){
    options=options || {};
    var density=options.density===undefined ? 1 : finite(options.density,'material density'),
      sound=finite(options.soundSpeed,'material sound speed'),
      nativeDensity=options.nativeDensity===undefined ? 4 : finite(options.nativeDensity,'native density'),
      area=options.particleArea===undefined ? 1.5625 : finite(options.particleArea,'material reference area');
    if(!(density>0 && sound>0 && nativeDensity>0 && area>0) || !particles.density || particles.density.length<particles.count)
      throw new Error('Instrument: incomplete material-volume state');
    var stiffness=density*sound*sound,total=0,minJ=Infinity,maxJ=0;
    for(var i=0;i<particles.count;i++){
      var rho=finite(particles.density[i],'carried material density');
      if(!(rho>0))throw new Error('Instrument: nonpositive carried material density');
      var j=nativeDensity/rho,delta=j-1;
      // log1p preserves the small-strain energy near the equilibrium state.
      total+=stiffness*area*(delta-Math.log1p(delta));
      minJ=Math.min(minJ,j);maxJ=Math.max(maxJ,j);
    }
    return {energy:total,minJ:particles.count ? minJ : null,maxJ:particles.count ? maxJ : null,
      count:particles.count,sampleTime:particles.time};
  }
  function numericalStatus(snapshot){
    if(!snapshot || !snapshot.convergence)return 'Waiting for a pressure sample.';
    var c=snapshot.convergence,ledger=snapshot.ledger || {};
    if(ledger.overflowErrors || ledger.connectivityErrors || ledger.nonpositiveVolumes)
      return 'The pressure or gas calculation needs repair. These readings are diagnostic.';
    if(!c.phaseResolved || !c.cavitationResolved)
      return 'Water and void accounting is unresolved. These readings are diagnostic.';
    if(!Number.isFinite(c.waterPressureError) || !Number.isFinite(c.gasPressureError) ||
      Math.max(c.waterPressureError,c.gasPressureError)>.1)
      return 'The pressure solve is still converging. These readings are diagnostic.';
    return 'This pressure sample is within the numerical tolerance.';
  }
  function prediction(name,levels,definition,gravity){
    gravity=Math.max(0,finite(gravity,'gravity'));var m=definition.measure,head=null;
    if(name==='siphon' && levels.source!==null)head=m.outlet.y-levels.source;
    if(name==='cup' && levels.source!==null)head=definition.pipes[0].points.slice(-1)[0].y-levels.source;
    if(name==='heron' && levels.basin!==null && levels.bottom!==null && levels.source!==null)
      head=levels.bottom-levels.basin+m.nozzle.y-levels.source;
    return {head:head,speed:head===null ? null : Math.sqrt(2*gravity*Math.max(0,head)),jetRise:name==='heron' && head!==null ? Math.max(0,head) : null};
  }
  return {scale:scale,quantile:quantile,vessel:vessel,cell:cell,section:section,
    createCrossings:createCrossings,particleSection:particleSection,gasWork:gasWork,waterEnergy:waterEnergy,acousticEnergy:acousticEnergy,materialEnergy:materialEnergy,
    numericalStatus:numericalStatus,prediction:prediction};
});
