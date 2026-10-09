/* Read-only air pressure view. The room stays clear, and only sealed gas is tinted.
 * Samples and labels are cached by the host, never fed back into the solver.
 */
(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.WaterMachinesPressureView=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  function analyze(snapshot,options){
    options=options || {};
    var count=snapshot.width*snapshot.height,dx=snapshot.cellSize;
    var bits=new Uint32Array(snapshot.cells.buffer,snapshot.cells.byteOffset,snapshot.cells.length);
    var pockets=new Map(),runs=[],labels=[];
    (snapshot.pockets || []).forEach(function(p){if(Number.isFinite(p.pressure))pockets.set(p.root+1,p);});
    // Horizontal runs avoid thousands of canvas calls. Liquid and solid cells,
    // atmosphere and unrecognized topology receive no air overlay.
    for(var row=0;row<snapshot.height;row++){
      var start=-1,last=0;
      for(var col=0;col<=snapshot.width;col++){
        var i=row*snapshot.width+col,r=col<snapshot.width ? snapshot.labels[i*2] : 0;
        if(col===snapshot.width || bits[i*8+3]!==2 || !pockets.has(r))r=0;
        if(r!==last){
          if(last)runs.push({x:start*dx,y:row*dx,width:(col-start)*dx,height:dx,root:last});
          start=col;last=r;
        }
      }
    }
    // Put labels in real empty space. A maximal rectangle keeps the complete
    // label inside one pocket, including near a moving water surface.
    var areas=options.vessels && options.vessels.length ? options.vessels.map(function(v){return v.rect;})
      : [{x:0,y:0,width:snapshot.width*dx,height:snapshot.height*dx}];
    var labelWidth=options.labelWidth || 112,labelHeight=options.labelHeight || 24;
    areas.forEach(function(area){
      var heights=new Uint32Array(snapshot.width),best=null;
      for(var y=0;y<snapshot.height;y++){
        for(var x=0;x<snapshot.width;x++){
          var at=y*snapshot.width+x,r=snapshot.labels[at*2];
          var inside=x*dx>=area.x && (x+1)*dx<=area.x+area.width && y*dx>=area.y && (y+1)*dx<=area.y+area.height;
          var previous=y ? snapshot.labels[(at-snapshot.width)*2] : 0;
          heights[x]=inside && bits[at*8+3]===2 && pockets.has(r) ? (r===previous ? heights[x]+1 : 1) : 0;
        }
        var stack=[];
        for(x=0;x<=snapshot.width;x++){
          var h=x<snapshot.width ? heights[x] : 0;
          var current=x<snapshot.width ? snapshot.labels[(y*snapshot.width+x)*2] : 0;
          var begin=x;
          while(stack.length && (stack[stack.length-1].height>h || stack[stack.length-1].root!==current)){
            var entry=stack.pop();begin=entry.start;
            var width=(x-entry.start)*dx,height=entry.height*dx;
            if(width>=labelWidth && height>=labelHeight && (!best || width*height>best.area)){
              best={x:(entry.start+x)*dx*.5,y:(y+1-entry.height*.5)*dx,root:entry.root,area:width*height};
            }
            if(entry.root!==current)begin=x;
          }
          if(h && (!stack.length || stack[stack.length-1].height<h))stack.push({start:begin,height:h,root:current});
        }
      }
      if(best)labels.push(best);
    });
    // Generic builds can have many bubbles. Keep the view quiet.
    labels.sort(function(a,b){return b.area-a.area;});
    return {runs:runs,labels:labels.slice(0,3),pockets:pockets,simulationTime:snapshot.simulationTime};
  }
  function pressureText(psi,vapor){
    if(vapor)return 'Vapor';
    if(!Number.isFinite(psi))return 'Waiting';
    var rounded=Math.round(psi*100)/100;
    return (rounded>0 ? '+' : rounded<0 ? '-' : '')+Math.abs(rounded).toFixed(2)+' psi';
  }
  return {analyze:analyze,pressureText:pressureText};
});
