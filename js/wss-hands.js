/* Toy-only wall selection and staged history. Native water owns projection. */
(function (global) {
  'use strict';
  function pickOpening(point, openings, cssScale) {
    var radius = 22 / Math.max(cssScale || 1, 1e-6), best = null, distance = radius;
    global.WSSBoundaries.normalizeCaps(openings).forEach(function (cut) {
      var x = Math.max(cut.x0, Math.min(cut.x1, point.x));
      var y = Math.max(cut.y0, Math.min(cut.y1, point.y));
      var d = Math.hypot(point.x-x, point.y-y);
      if (d <= distance) { best = cut; distance = d; }
    });
    return best;
  }
  function pickWall(point, walls, width, height, tile, cssScale, excluded) {
    var radius=22/Math.max(cssScale || 1,1e-6),best=null,distance=radius;
    var left=Math.max(1,Math.floor((point.x-radius)/tile)),right=Math.min(width-2,Math.floor((point.x+radius)/tile));
    var top=Math.max(1,Math.floor((point.y-radius)/tile)),bottom=Math.min(height-2,Math.floor((point.y+radius)/tile));
    for(var row=top;row<=bottom;row++)for(var col=left;col<=right;col++){
      var index=row*width+col;if(!walls[index] || excluded && excluded[index])continue;
      var x=col*tile,y=row*tile,d=Math.hypot(Math.max(x-point.x,0,point.x-x-tile),Math.max(y-point.y,0,point.y-y-tile));
      if(d<distance || d===distance && (!best || index<best.index)){
        best={index:index,x:x,y:y,width:tile,height:tile};distance=d;
      }
    }
    return best;
  }
  function bindHistory(builder, hooks) {
    var pending=false;
    async function history(redo) {
      if(pending || builder._pending)throw new Error('Finish the wall edit first.');
      var source=redo ? builder._future : builder._past,destination=redo ? builder._past : builder._future;
      var record=source[source.length-1];if(!record)return false;
      if(record.label!=='Hole punch')throw new Error('Only hole-punch history is available in this lab.');
      var target=redo ? record.after : record.before,change=[];
      for(var i=0;i<builder.walls.length;i++)if(builder.walls[i]!==target.walls[i])change.push(i);
      if(change.length!==1)throw new Error('Only one-cell hole history is supported.');
      pending=true;hooks.pending(true);
      try{
        if(target.walls[change[0]]){
          var cell=global.WSSBoundaries.restorationCell(builder.walls,target.walls,builder.width,builder.height,builder.tile);
          await hooks.restore(cell);
        }else await hooks.settled();
        hooks.certify();
        // History and the solid grid remain untouched until native projection finishes.
        var parts=target.parts.map(function(part){
          // Hole history cannot re-close a larger existing valve seat.
          if(part.type==='flap' || part.type==='check')return builder.parts.find(function(current){return current.id===part.id;}) || part;
          return part;
        });
        builder._restore({walls:target.walls,parts:parts},redo ? 'redo' : 'undo');source.pop();destination.push(record);
        hooks.published();return true;
      }finally{pending=false;hooks.pending(false);}
    }
    builder.undo=function(){return history(false);};builder.redo=function(){return history(true);};
    // The small lab supports hole removal and its guarded undo, not solid drawing.
    var begin=builder.begin;
    builder.begin=function(label){
      if(pending || label!=='Hole punch')throw new Error('This lab supports Hole punch and its Undo only.');
      return begin.call(builder,label);
    };
    return {pending:function(){return pending;}};
  }
  global.WSSHands = {pickOpening:pickOpening,pickWall:pickWall,bindHistory:bindHistory};
})(typeof window !== 'undefined' ? window : globalThis);
